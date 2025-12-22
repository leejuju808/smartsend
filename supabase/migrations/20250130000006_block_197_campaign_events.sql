-- Block 197.1: Campaign Events Table
-- Creates campaign_events table for tracking campaign timeline events

create table if not exists public.campaign_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  type text not null, -- 'created' | 'status_changed' | 'scheduled' | 'launched' | 'paused' | 'completed'
  from_status text,
  to_status text,
  message text,
  created_at timestamptz default now()
);

create index if not exists campaign_events_campaign_id_idx
on public.campaign_events (campaign_id);

create index if not exists campaign_events_workspace_id_idx
on public.campaign_events (workspace_id);

-- RLS
alter table public.campaign_events enable row level security;

create policy "campaign_events_select"
on public.campaign_events
for select
to authenticated
using (workspace_id = (auth.jwt()->>'workspace_id')::uuid);

create policy "campaign_events_insert"
on public.campaign_events
for insert
to authenticated
with check (workspace_id = (auth.jwt()->>'workspace_id')::uuid);

