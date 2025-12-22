-- Campaign Scheduler Migration
-- Creates tables for scheduling campaigns and managing send queue

-- 01_campaigns.sql
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  scheduled_for timestamptz not null,
  timezone text default 'America/Los_Angeles',
  status text not null default 'scheduled' check (status in ('scheduled', 'sending', 'completed', 'canceled')),
  created_at timestamptz not null default now()
);

create index if not exists campaigns_workspace_idx on public.campaigns (workspace_id);
create index if not exists campaigns_scheduled_idx on public.campaigns (scheduled_for);
create index if not exists campaigns_status_idx on public.campaigns (status);

-- Enable RLS
alter table public.campaigns enable row level security;

-- RLS policies for campaigns
create policy "campaigns_select_workspace" on public.campaigns
  for select using (workspace_id = (auth.jwt() ->> 'workspace_id')::uuid);

create policy "campaigns_insert_workspace" on public.campaigns
  for insert with check (workspace_id = (auth.jwt() ->> 'workspace_id')::uuid);

create policy "campaigns_update_workspace" on public.campaigns
  for update using (workspace_id = (auth.jwt() ->> 'workspace_id')::uuid);

create policy "campaigns_delete_workspace" on public.campaigns
  for delete using (workspace_id = (auth.jwt() ->> 'workspace_id')::uuid);