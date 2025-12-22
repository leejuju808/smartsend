-- Block 14300 — Auto Follow-Up System v1
-- Behavior-Based Sequences: No Reply → Follow-Up, Intent → Stop/Tag
-- This makes SmartSend feel unfair: If they don't reply → SmartSend follows up.
-- If they do reply → SmartSend stops and tags the lead.

-- ============================================================================
-- 1. EXTEND campaign_steps WITH FOLLOW-UP CONFIG
-- ============================================================================

alter table public.campaign_steps
  add column if not exists followup_enabled boolean not null default false,
  add column if not exists followup_delay_days int default 3, -- days after step send
  add column if not exists followup_condition text check (
    followup_condition in (
      'no_reply',             -- send only if no reply
      'no_hot_or_warm',      -- send if no hot/warm intent
      'always'               -- always send regardless
    )
  ) default 'no_reply',
  add column if not exists followup_subject_template text,
  add column if not exists followup_body_template text;

-- Index for efficient querying of enabled follow-ups
create index if not exists idx_campaign_steps_followup_enabled 
  on public.campaign_steps(campaign_id, followup_enabled) 
  where followup_enabled = true;

-- ============================================================================
-- 2. CREATE followup_queue TABLE
-- ============================================================================

-- Ensure email_messages has required columns for follow-up tracking
-- (These may have been added by Block 14200, but we ensure they exist)
alter table public.email_messages
  add column if not exists workspace_id uuid references public.workspaces(id) on delete set null,
  add column if not exists contact_id uuid references public.contacts(id) on delete set null,
  add column if not exists campaign_step_id uuid references public.campaign_steps(id) on delete set null,
  add column if not exists body_html text,
  add column if not exists body_text text;

create table if not exists public.followup_queue (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  campaign_step_id uuid not null references public.campaign_steps(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  email_message_id uuid not null references public.email_messages(id) on delete cascade,

  followup_step_number int not null default 1, -- optional if you chain multiple followups later
  run_after timestamptz not null,             -- when we should consider sending
  processed_at timestamptz,                   -- set once handled
  created_at timestamptz default now()
);

-- Indexes for efficient querying
create index if not exists idx_followup_queue_due 
  on public.followup_queue(run_after, processed_at) 
  where processed_at is null;

create index if not exists idx_followup_queue_campaign_step 
  on public.followup_queue(campaign_id, campaign_step_id);

create index if not exists idx_followup_queue_contact 
  on public.followup_queue(contact_id);

create index if not exists idx_followup_queue_email_message 
  on public.followup_queue(email_message_id);

-- RLS policies
alter table public.followup_queue enable row level security;

-- Allow workspace members to read their follow-up queue
create policy "workspace_members_can_read_followup_queue"
  on public.followup_queue for select
  using (
    workspace_id in (
      select id from public.workspaces 
      where id = followup_queue.workspace_id
    )
  );

-- Service role can insert/update (for cron jobs)
create policy "service_role_full_followup_queue"
  on public.followup_queue for all
  to service_role
  using (true)
  with check (true);

-- ============================================================================
-- 3. HELPER FUNCTION TO CHECK IF FOLLOW-UP SHOULD BE SENT
-- ============================================================================

create or replace function public.should_send_followup(
  p_contact_id uuid,
  p_campaign_step_id uuid,
  p_original_sent_at timestamptz
)
returns boolean
language plpgsql
stable
as $$
declare
  v_condition text;
  v_replies_count int;
  v_has_hot_or_warm boolean;
begin
  -- Get follow-up condition from step
  select followup_condition into v_condition
  from public.campaign_steps
  where id = p_campaign_step_id;

  -- Default to 'no_reply' if not set
  v_condition := coalesce(v_condition, 'no_reply');

  -- If condition is 'always', always send
  if v_condition = 'always' then
    return true;
  end if;

  -- Check for replies after the original send
  select count(*) into v_replies_count
  from public.email_messages
  where contact_id = p_contact_id
    and (direction = 'inbound' or direction = 'in')
    and created_at >= p_original_sent_at;

  -- If no replies and condition is 'no_reply' or 'no_hot_or_warm', send
  if v_replies_count = 0 then
    return v_condition in ('no_reply', 'no_hot_or_warm');
  end if;

  -- If condition is 'no_reply' and there are replies, don't send
  if v_condition = 'no_reply' then
    return false;
  end if;

  -- Check for hot/warm intent
  if v_condition = 'no_hot_or_warm' then
    select exists(
      select 1
      from public.email_messages
      where contact_id = p_contact_id
        and (direction = 'inbound' or direction = 'in')
        and created_at >= p_original_sent_at
        and intent_label in ('hot_lead', 'warm_lead')
    ) into v_has_hot_or_warm;

    return not v_has_hot_or_warm;
  end if;

  return false;
end;
$$;

-- ============================================================================
-- 4. GRANT PERMISSIONS
-- ============================================================================

grant select, insert, update on public.followup_queue to authenticated;
grant execute on function public.should_send_followup to authenticated, service_role;

