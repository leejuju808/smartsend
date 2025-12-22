-- Block 307 — Workspace Activity Timeline & Audit Log
-- Single activity feed for all workspace events

create table if not exists workspace_activity (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null references workspaces(id) on delete cascade,
  actor_id uuid references auth.users(id), -- who caused it (optional: system)
  event_type text not null,                -- e.g. "campaign_created", "reply_received"
  description text not null,               -- human-readable
  metadata jsonb,                          -- extra data (ids, counts, etc.)

  lead_id uuid references leads(id) on delete set null,
  campaign_id uuid references campaigns(id) on delete set null,
  sequence_id uuid references sequences(id) on delete set null,

  created_at timestamptz default now()
);

create index on workspace_activity (workspace_id, created_at desc);
create index on workspace_activity (campaign_id, created_at desc);
create index on workspace_activity (lead_id, created_at desc);
create index on workspace_activity (sequence_id, created_at desc);

-- Optional view with joined names
create or replace view workspace_activity_view as
select
  a.id,
  a.workspace_id,
  a.actor_id,
  a.event_type,
  a.description,
  a.metadata,
  a.lead_id,
  a.campaign_id,
  a.sequence_id,
  a.created_at,
  l.first_name as lead_first_name,
  l.last_name as lead_last_name,
  l.email as lead_email,
  l.company as lead_company,
  c.name as campaign_name
from workspace_activity a
left join leads l on l.id = a.lead_id
left join campaigns c on c.id = a.campaign_id;

-- Enable RLS
alter table workspace_activity enable row level security;

-- RLS Policies: Users can view activity for their workspace
drop policy if exists "Users can view workspace_activity" on workspace_activity;
create policy "Users can view workspace_activity" on workspace_activity
  for select using (
    exists (
      select 1 from workspace_members wm
      where wm.workspace_id = workspace_activity.workspace_id
      and wm.user_id = auth.uid()
    )
  );

-- RLS Policies: Service role can insert activity
drop policy if exists "Service can insert workspace_activity" on workspace_activity;
create policy "Service can insert workspace_activity" on workspace_activity
  for insert with check (true);

-- Grant access to authenticated users
grant select on workspace_activity to authenticated;
grant select on workspace_activity_view to authenticated;







