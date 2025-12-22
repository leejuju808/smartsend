-- Block 438 — Reply Intent AI Classifier v1
-- Classifies replies into: Interested • Not Interested • Maybe • Not Now • Unsubscribe • Wrong Person • Other
-- Stores classification in email_events and lead_engagement for routing, scoring, reporting, and stopping sequences

-- ============================================================================
-- 1️⃣ Supabase Schema Changes
-- ============================================================================

-- Add classification fields to email_events
alter table public.email_events
  add column if not exists reply_intent text,
  add column if not exists reply_confidence float;

-- Add check constraint for valid reply_intent values
do $$
begin
  if not exists (
    select 1 from pg_constraint 
    where conname = 'email_events_reply_intent_check'
  ) then
    alter table public.email_events
      add constraint email_events_reply_intent_check
      check (reply_intent is null or reply_intent in (
        'interested',
        'not_interested',
        'maybe',
        'not_now',
        'unsubscribe',
        'wrong_person',
        'other'
      ));
  end if;
end $$;

-- Add check constraint for confidence (0-1)
do $$
begin
  if not exists (
    select 1 from pg_constraint 
    where conname = 'email_events_reply_confidence_check'
  ) then
    alter table public.email_events
      add constraint email_events_reply_confidence_check
      check (reply_confidence is null or (reply_confidence >= 0 and reply_confidence <= 1));
  end if;
end $$;

-- Create index for reply_intent queries
create index if not exists idx_email_events_reply_intent
  on public.email_events(reply_intent)
  where reply_intent is not null;

create index if not exists idx_email_events_reply_intent_campaign
  on public.email_events(campaign_id, reply_intent)
  where reply_intent is not null;

-- ============================================================================
-- 2️⃣ Lead Engagement Table
-- ============================================================================

-- Create lead_engagement table if it doesn't exist
create table if not exists public.lead_engagement (
  lead_id uuid primary key references public.leads(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  
  -- Reply intent classification
  reply_intent text,
  reply_confidence float,
  replied_at timestamptz,
  
  -- Engagement metrics
  opens_30d int not null default 0,
  clicks_30d int not null default 0,
  replies_30d int not null default 0,
  bounces_30d int not null default 0,
  
  -- Timestamps
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add check constraint for reply_intent
do $$
begin
  if not exists (
    select 1 from pg_constraint 
    where conname = 'lead_engagement_reply_intent_check'
  ) then
    alter table public.lead_engagement
      add constraint lead_engagement_reply_intent_check
      check (reply_intent is null or reply_intent in (
        'interested',
        'not_interested',
        'maybe',
        'not_now',
        'unsubscribe',
        'wrong_person',
        'other'
      ));
  end if;
end $$;

-- Add check constraint for confidence
do $$
begin
  if not exists (
    select 1 from pg_constraint 
    where conname = 'lead_engagement_reply_confidence_check'
  ) then
    alter table public.lead_engagement
      add constraint lead_engagement_reply_confidence_check
      check (reply_confidence is null or (reply_confidence >= 0 and reply_confidence <= 1));
  end if;
end $$;

-- Create indexes for lead_engagement
create index if not exists idx_lead_engagement_reply_intent
  on public.lead_engagement(reply_intent)
  where reply_intent is not null;

create index if not exists idx_lead_engagement_campaign_intent
  on public.lead_engagement(campaign_id, reply_intent)
  where reply_intent is not null;

create index if not exists idx_lead_engagement_replied_at
  on public.lead_engagement(replied_at desc nulls last);

-- ============================================================================
-- 3️⃣ Campaign Leads - Add reached_goal field if needed
-- ============================================================================

alter table public.campaign_leads
  add column if not exists reached_goal boolean not null default false;

create index if not exists idx_campaign_leads_reached_goal
  on public.campaign_leads(campaign_id, reached_goal)
  where reached_goal = true;

-- ============================================================================
-- 4️⃣ Global Suppression List Support
-- ============================================================================

-- Ensure global_suppressions table exists (from Block 117)
-- This is idempotent - will not error if table already exists
create table if not exists public.global_suppressions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete set null,
  email citext,
  domain citext,
  kind text not null check (kind in ('manual','bounce','complaint','provider','role-account','trap','unsubscribe')),
  reason text,
  source text default 'reply_intent_classifier',
  unique (user_id, email, kind),
  unique (user_id, domain, kind),
  check ((email is not null) or (domain is not null))
);

create index if not exists idx_global_supp_user_email on public.global_suppressions(user_id, email);
create index if not exists idx_global_supp_user_domain on public.global_suppressions(user_id, domain);
create index if not exists idx_global_supp_workspace on public.global_suppressions(workspace_id)
  where workspace_id is not null;

-- ============================================================================
-- 5️⃣ Helper Function: Update Lead Engagement
-- ============================================================================

create or replace function public.update_lead_engagement_from_reply(
  p_lead_id uuid,
  p_campaign_id uuid,
  p_reply_intent text,
  p_reply_confidence float,
  p_replied_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
begin
  -- Get workspace_id from campaign
  select workspace_id into v_workspace_id
  from public.campaigns
  where id = p_campaign_id;

  -- Upsert lead_engagement
  insert into public.lead_engagement (
    lead_id,
    workspace_id,
    campaign_id,
    reply_intent,
    reply_confidence,
    replied_at,
    updated_at
  )
  values (
    p_lead_id,
    v_workspace_id,
    p_campaign_id,
    p_reply_intent,
    p_reply_confidence,
    p_replied_at,
    now()
  )
  on conflict (lead_id) do update
  set
    reply_intent = excluded.reply_intent,
    reply_confidence = excluded.reply_confidence,
    replied_at = excluded.replied_at,
    updated_at = now();
end;
$$;

-- ============================================================================
-- 6️⃣ Helper Function: Apply Intent-Based Automation
-- ============================================================================

create or replace function public.apply_reply_intent_automation(
  p_lead_id uuid,
  p_campaign_id uuid,
  p_reply_intent text,
  p_event_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_workspace_id uuid;
  v_email text;
  v_domain text;
begin
  -- Get lead and campaign info
  select l.user_id, l.email, c.workspace_id, split_part(l.email, '@', 2)
  into v_user_id, v_email, v_workspace_id, v_domain
  from public.leads l
  join public.campaigns c on c.id = p_campaign_id
  where l.id = p_lead_id;

  if v_user_id is null or v_email is null then
    return;
  end if;

  -- Apply automation based on intent
  case p_reply_intent
    when 'interested' then
      -- Auto-stop sending, mark as reached goal
      update public.campaign_leads
      set reached_goal = true,
          status = 'replied'
      where lead_id = p_lead_id
        and campaign_id = p_campaign_id;

      -- Stop all upcoming follow-ups
      update public.send_queue
      set is_paused = true
      where lead_id = p_lead_id
        and campaign_id = p_campaign_id
        and sent_at is null;

    when 'not_interested' then
      -- Add to suppression list
      insert into public.global_suppressions (
        user_id,
        workspace_id,
        email,
        kind,
        reason,
        source
      )
      values (
        v_user_id,
        v_workspace_id,
        lower(v_email),
        'manual',
        'Not interested reply',
        'reply_intent_classifier'
      )
      on conflict (user_id, email, kind) do nothing;

    when 'unsubscribe' then
      -- Global suppression - mandatory compliance
      insert into public.global_suppressions (
        user_id,
        workspace_id,
        email,
        kind,
        reason,
        source
      )
      values (
        v_user_id,
        v_workspace_id,
        lower(v_email),
        'unsubscribe',
        'Unsubscribe request',
        'reply_intent_classifier'
      )
      on conflict (user_id, email, kind) do nothing;

      -- Stop all campaigns immediately
      update public.campaign_leads
      set status = 'unsub'
      where lead_id = p_lead_id;

      -- Pause all send queue items
      update public.send_queue
      set is_paused = true
      where lead_id = p_lead_id
        and sent_at is null;

    when 'not_now' then
      -- Create future task (could be extended with a tasks table)
      -- For now, just mark for follow-up later
      update public.campaign_leads
      set status = 'paused'
      where lead_id = p_lead_id
        and campaign_id = p_campaign_id;

    when 'wrong_person' then
      -- Route to correction sequence (placeholder - can be extended)
      -- For now, mark as paused
      update public.campaign_leads
      set status = 'paused'
      where lead_id = p_lead_id
        and campaign_id = p_campaign_id;

    else
      -- 'maybe', 'other' - neutral, no action
      null;
  end case;
end;
$$;

-- Grant execute permissions
grant execute on function public.update_lead_engagement_from_reply(uuid, uuid, text, float, timestamptz) to service_role;
grant execute on function public.apply_reply_intent_automation(uuid, uuid, text, uuid) to service_role;

-- ============================================================================
-- 7️⃣ RLS Policies (if needed)
-- ============================================================================

-- Enable RLS on lead_engagement if not already enabled
alter table public.lead_engagement enable row level security;

-- Policy: Users can read their own lead engagement data
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'lead_engagement'
    and policyname = 'lead_engagement_select_own'
  ) then
    create policy lead_engagement_select_own on public.lead_engagement
      for select
      using (
        exists (
          select 1 from public.leads l
          join public.campaigns c on c.id = lead_engagement.campaign_id
          where l.id = lead_engagement.lead_id
          and c.user_id = auth.uid()
        )
      );
  end if;
end $$;

-- Policy: Service role can manage lead_engagement
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'lead_engagement'
    and policyname = 'lead_engagement_service_role'
  ) then
    create policy lead_engagement_service_role on public.lead_engagement
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end $$;



