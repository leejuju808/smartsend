-- Block 287: Billing Events Table
-- Stores billing-related events for warnings, UI notifications, and email reminders

create table if not exists billing_events (
  id uuid default gen_random_uuid() primary key,
  workspace_id uuid references workspaces (id) on delete cascade,
  type text not null,
  detail text,
  created_at timestamp default now()
);

-- Index for efficient queries
create index if not exists idx_billing_events_workspace on billing_events(workspace_id, created_at desc);
create index if not exists idx_billing_events_type on billing_events(type, created_at desc);

-- RLS policies
alter table billing_events enable row level security;

-- Workspace members can view their workspace's billing events
create policy "workspace_members_can_view_billing_events"
  on billing_events
  for select
  using (
    exists (
      select 1 from workspace_members
      where workspace_id = billing_events.workspace_id
      and user_id = auth.uid()
    )
  );

-- Service role can insert billing events
create policy "service_role_can_insert_billing_events"
  on billing_events
  for insert
  with check (auth.role() = 'service_role');

-- Grant permissions
grant select on billing_events to authenticated;
grant insert on billing_events to service_role;

-- Common event types:
-- near_cap_send - when sends_today >= 90% of daily_send_cap
-- near_cap_reply - when replies_today >= 90% of daily_reply_cap
-- seat_over_limit - when seats_used > seat_limit
-- blocked_send_cap - when send was blocked due to daily_send_cap
-- blocked_reply_cap - when reply was blocked due to daily_reply_cap








