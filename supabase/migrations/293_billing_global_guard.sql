-- Block 293: Global Usage Guard System
-- Unified billing enforcement view that combines all billing signals

create or replace view billing_global_guard as
select
  w.id as workspace_id,

  -- plan info
  w.plan,
  w.seat_limit,
  w.daily_send_cap,
  w.daily_reply_cap,

  -- seat usage
  (select count(*) from team_members tm where tm.workspace_id = w.id and tm.status = 'active') 
    as seats_used,

  -- daily sends
  (select count(*) from send_logs sl 
    where sl.workspace_id = w.id 
    and sl.sent_at::date = current_date) 
    as sends_today,

  -- daily replies (using inbound_messages with received_at)
  (select count(*) from inbound_messages im
    where im.workspace_id = w.id
    and im.received_at::date = current_date)
    as replies_today,

  -- credit balance
  coalesce((select credits from workspace_credits wc
    where wc.workspace_id = w.id), 0)
    as credits,

  -- computed signals
  case 
    when coalesce((select credits from workspace_credits wc where wc.workspace_id = w.id), 0) <= 0 
      then true else false end as credits_empty,

  case 
    when (select count(*) from team_members tm where tm.workspace_id = w.id and tm.status = 'active') > coalesce(w.seat_limit, 1)
      then true else false end as seats_over_cap,

  case 
    when (select count(*) from send_logs sl 
          where sl.workspace_id = w.id 
          and sl.sent_at::date = current_date) >= coalesce(w.daily_send_cap, 200)
      then true else false end as sends_over_cap,

  case 
    when (select count(*) from inbound_messages im
          where im.workspace_id = w.id
          and im.received_at::date = current_date) >= coalesce(w.daily_reply_cap, 200)
      then true else false end as replies_over_cap

from workspaces w;

-- Grant access to authenticated users
grant select on billing_global_guard to authenticated;

-- Create followup_skips table for tracking skipped follow-ups due to billing limits
create table if not exists followup_skips (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,
  campaign_id uuid references campaigns(id) on delete set null,
  thread_id uuid references inbox_threads(id) on delete set null,
  reason text not null, -- 'blocked_seat_limit', 'blocked_sends_no_credits', etc.
  created_at timestamptz default now()
);

create index if not exists idx_followup_skips_workspace on followup_skips(workspace_id, created_at desc);
create index if not exists idx_followup_skips_lead on followup_skips(lead_id);
create index if not exists idx_followup_skips_reason on followup_skips(reason);

-- Enable RLS
alter table followup_skips enable row level security;

-- Workspace members can view their workspace's followup skips
create policy "workspace_members_can_view_followup_skips"
  on followup_skips
  for select
  using (
    exists (
      select 1 from workspace_members
      where workspace_id = followup_skips.workspace_id
      and user_id = auth.uid()
    )
  );

-- Service role can insert followup skips
create policy "service_role_can_insert_followup_skips"
  on followup_skips
  for insert
  with check (auth.role() = 'service_role');

-- Grant permissions
grant select on followup_skips to authenticated;
grant insert on followup_skips to service_role;








