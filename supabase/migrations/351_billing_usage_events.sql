-- Block 351: Billing usage events table
-- Optional: Mark a "cap hit" flag for UI

create table if not exists billing_usage_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  event_type text not null check (
    event_type in ('daily_cap_reached', 'daily_cap_warning')
  ),
  payload jsonb,
  created_at timestamptz default now()
);

create index if not exists billing_usage_events_workspace_created_idx
  on billing_usage_events (workspace_id, created_at desc);

-- Enable RLS
alter table billing_usage_events enable row level security;

-- Service role can insert/read (for dispatcher)
drop policy if exists billing_usage_events_service on billing_usage_events;
create policy billing_usage_events_service on billing_usage_events
  for all to service_role
  using (true) with check (true);

-- Workspace members can read their workspace events
drop policy if exists billing_usage_events_select on billing_usage_events;
create policy billing_usage_events_select on billing_usage_events
  for select to authenticated
  using (
    exists (
      select 1 from workspace_members
      where workspace_id = billing_usage_events.workspace_id
      and user_id = auth.uid()
    )
  );





