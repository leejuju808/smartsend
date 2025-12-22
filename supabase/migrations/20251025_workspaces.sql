-- /supabase/migrations/20251025_workspaces.sql

-- 1) Roles + core tables
create type public.workspace_role as enum ('owner','admin','member','viewer');

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null,
  created_at timestamptz default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null,
  role public.workspace_role not null default 'member',
  added_at timestamptz default now(),
  primary key (workspace_id, user_id)
);

-- 2) Helper function used by RLS
create or replace function public.is_workspace_member(wid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists(
    select 1 from public.workspace_members
    where workspace_id = wid and user_id = auth.uid()
  );
$$;

-- 3) (Optional) owner/admin check
create or replace function public.is_workspace_admin(wid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists(
    select 1 from public.workspace_members
    where workspace_id = wid and user_id = auth.uid()
      and role in ('owner','admin')
  );
$$;

-- 4) Add workspace_id to key domain tables
alter table if exists public.campaigns add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table if exists public.leads add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table if exists public.email_logs add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table if exists public.send_queue add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table if exists public.suppression_list add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table if exists public.tasks add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table if exists public.email_events add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

-- 5) Quick backfill (temporary, adjust to your data model)
-- (Example: set workspace_id using campaign linkage or your single-tenant default workspace)
-- update campaigns set workspace_id = '<YOUR_DEFAULT_WID>' where workspace_id is null;
-- repeat similarly for other tables…

-- 6) Enable RLS
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.campaigns enable row level security;
alter table public.leads enable row level security;
alter table public.email_logs enable row level security;
alter table public.send_queue enable row level security;
alter table public.suppression_list enable row level security;
alter table public.tasks enable row level security;
alter table public.email_events enable row level security;

-- 7) RLS policies

-- Workspaces: members can read, only admins can update/delete
create policy "workspaces_read" on public.workspaces
  for select using ( public.is_workspace_member(id) );

create policy "workspaces_admin_write" on public.workspaces
  for all using ( public.is_workspace_admin(id) );

-- Workspace members: members can read membership; admins can manage
create policy "wm_read" on public.workspace_members
  for select using ( public.is_workspace_member(workspace_id) );

create policy "wm_admin_write" on public.workspace_members
  for all using ( public.is_workspace_admin(workspace_id) );

-- Campaigns
create policy "campaigns_select" on public.campaigns
  for select using ( public.is_workspace_member(workspace_id) );

create policy "campaigns_insert" on public.campaigns
  for insert with check ( public.is_workspace_member(workspace_id) );

create policy "campaigns_update" on public.campaigns
  for update using ( public.is_workspace_member(workspace_id) )
  with check ( public.is_workspace_member(workspace_id) );

create policy "campaigns_delete_admin" on public.campaigns
  for delete using ( public.is_workspace_admin(workspace_id) );

-- Leads
create policy "leads_select" on public.leads
  for select using ( public.is_workspace_member(workspace_id) );

create policy "leads_ins" on public.leads
  for insert with check ( public.is_workspace_member(workspace_id) );

create policy "leads_upd" on public.leads
  for update using ( public.is_workspace_member(workspace_id) )
  with check ( public.is_workspace_member(workspace_id) );

-- Email logs (read by members; insert by system/member)
create policy "email_logs_select" on public.email_logs
  for select using ( public.is_workspace_member(workspace_id) );

create policy "email_logs_insert" on public.email_logs
  for insert with check ( public.is_workspace_member(workspace_id) );

create policy "email_logs_update" on public.email_logs
  for update using ( public.is_workspace_member(workspace_id) )
  with check ( public.is_workspace_member(workspace_id) );

-- Repeat pattern for send_queue, suppression_list, tasks, email_events:
create policy "sq_member_all" on public.send_queue for all
  using ( public.is_workspace_member(workspace_id) )
  with check ( public.is_workspace_member(workspace_id) );

create policy "suppr_member_all" on public.suppression_list for all
  using ( public.is_workspace_member(workspace_id) )
  with check ( public.is_workspace_member(workspace_id) );

create policy "tasks_member_all" on public.tasks for all
  using ( public.is_workspace_member(workspace_id) )
  with check ( public.is_workspace_member(workspace_id) );

create policy "events_member_all" on public.email_events for all
  using ( public.is_workspace_member(workspace_id) )
  with check ( public.is_workspace_member(workspace_id) );