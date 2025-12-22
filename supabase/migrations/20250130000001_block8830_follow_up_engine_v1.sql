-- =========================================================
-- Block 8830 — Follow-Up Engine v1 (Auto-Send Step 2 + Step 3 When Homeowner Doesn't Reply)
-- =========================================================

-- 1) campaign_followups table
-- Stores Step 2 and Step 3 templates per campaign
create table if not exists public.campaign_followups (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  step integer not null check (step in (2,3)),
  wait_days integer not null default 2,
  subject text,
  body text,
  created_at timestamptz not null default now(),
  unique(campaign_id, step)
);

-- Index for lookup
create index if not exists campaign_followups_campaign_idx
  on public.campaign_followups(campaign_id);

-- RLS: workspace-scoped via campaigns
alter table public.campaign_followups enable row level security;

create policy "Users can manage followups for their campaigns"
on public.campaign_followups
for all
using (
  exists (
    select 1
    from public.campaigns c
    join public.workspace_members wm on wm.workspace_id = c.workspace_id
    where c.id = campaign_id
      and wm.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.campaigns c
    join public.workspace_members wm on wm.workspace_id = c.workspace_id
    where c.id = campaign_id
      and wm.user_id = auth.uid()
  )
);

-- 2) Ensure outbound_emails has step column (1, 2, or 3)
-- step_index is 0-based (0=Step1, 1=Step2, 2=Step3)
-- step is 1-based (1=Step1, 2=Step2, 3=Step3)
alter table public.outbound_emails
  add column if not exists step integer;

-- Add index for step lookups
create index if not exists idx_outbound_emails_step
  on public.outbound_emails(campaign_id, lead_id, step);

-- Ensure owner_id exists in outbound_emails
alter table public.outbound_emails
  add column if not exists owner_id uuid references auth.users(id) on delete set null;

-- Ensure leads table has last_sent_at for tracking
alter table public.leads
  add column if not exists last_sent_at timestamptz;

-- Add index for last_sent_at lookups
create index if not exists idx_leads_last_sent_at
  on public.leads(campaign_id, last_sent_at)
  where campaign_id is not null;

-- 3) RPC Function: get_pending_followups
-- Finds leads that need Step 2 or Step 3 follow-ups
create or replace function get_pending_followups()
returns table (
  lead_id uuid,
  campaign_id uuid,
  owner_id uuid,
  email text,
  next_step int
)
language plpgsql
security definer
as $$
begin
  return query
  with last_sent as (
    select
      oe.lead_id,
      oe.campaign_id,
      max(oe.step) as last_step,
      max(oe.sent_at) as last_sent_at
    from outbound_emails oe
    where oe.status = 'sent'
      and oe.step is not null
      and oe.sent_at is not null
    group by oe.lead_id, oe.campaign_id
  ),
  latest_replies as (
    select distinct on (ie.lead_id, ie.campaign_id)
      ie.lead_id,
      ie.campaign_id,
      ie.created_at as reply_at
    from inbound_emails ie
    where ie.lead_id is not null
      and ie.campaign_id is not null
    order by ie.lead_id, ie.campaign_id, ie.created_at desc
  ),
  eligible_leads as (
    select
      l.id as lead_id,
      l.campaign_id,
      c.owner_id,
      l.email,
      ls.last_step,
      ls.last_sent_at,
      lr.reply_at
    from leads l
    join campaigns c on c.id = l.campaign_id
    join last_sent ls on ls.lead_id = l.id and ls.campaign_id = l.campaign_id
    left join latest_replies lr on lr.lead_id = l.id and lr.campaign_id = l.campaign_id
    where l.campaign_id is not null
      -- Haven't sent step 3 yet
      and ls.last_step < 3
      -- No reply OR reply was before last sent email (meaning they haven't replied to the latest email)
      and (lr.reply_at is null or lr.reply_at < ls.last_sent_at)
  )
  select
    el.lead_id,
    el.campaign_id,
    el.owner_id,
    el.email,
    case
      when el.last_step = 1 then 2
      when el.last_step = 2 then 3
      else null
    end as next_step
  from eligible_leads el
  join campaign_followups cf on cf.campaign_id = el.campaign_id
    and cf.step = case when el.last_step = 1 then 2 else 3 end
  where
    -- Check if wait_days have passed since last sent
    el.last_sent_at < now() - (cf.wait_days || ' days')::interval
    -- Ensure we haven't already sent this follow-up step
    and not exists (
      select 1
      from outbound_emails oe
      where oe.lead_id = el.lead_id
        and oe.campaign_id = el.campaign_id
        and oe.step = case when el.last_step = 1 then 2 else 3 end
    );
end;
$$;

-- 4) Helper function to check if lead has replied
-- This will be used by reply detection hooks
create or replace function lead_has_replied(p_lead_id uuid, p_campaign_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from inbound_emails
    where lead_id = p_lead_id
      and campaign_id = p_campaign_id
      and created_at > (
        select max(sent_at)
        from outbound_emails
        where lead_id = p_lead_id
          and campaign_id = p_campaign_id
          and status = 'sent'
          and sent_at is not null
      )
  );
$$;

-- 5) Trigger function to stop follow-ups when reply is detected
-- This automatically cancels pending follow-ups when a homeowner replies
create or replace function stop_followups_on_reply()
returns trigger
language plpgsql
as $$
begin
  -- When an inbound email is inserted/updated with a lead_id and campaign_id,
  -- cancel any pending follow-up emails for that lead
  if new.lead_id is not null and new.campaign_id is not null then
    -- Cancel pending follow-ups (steps 2 and 3) for this lead
    update outbound_emails
    set status = 'canceled'
    where lead_id = new.lead_id
      and campaign_id = new.campaign_id
      and step in (2, 3)
      and status = 'pending';
    
    -- Also mark lead as replied
    update leads
    set status = 'replied',
        reply_detected = true,
        updated_at = now()
    where id = new.lead_id;
  end if;
  
  return new;
end;
$$;

-- Create trigger on inbound_emails
drop trigger if exists trg_stop_followups_on_reply on inbound_emails;
create trigger trg_stop_followups_on_reply
  after insert or update on inbound_emails
  for each row
  when (new.lead_id is not null and new.campaign_id is not null)
  execute function stop_followups_on_reply();

