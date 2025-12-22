-- Block 169: Team Sharing - Team Members Table
-- Creates team_members table for multi-user accounts

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null,                -- workspace
  user_id uuid references auth.users(id) on delete cascade,
  role text not null check (
    role in ('owner','admin','member','viewer')
  )
);

create index if not exists idx_team_members_account
  on public.team_members (account_id);

create index if not exists idx_team_members_user
  on public.team_members (user_id);

-- Enable RLS
alter table public.team_members enable row level security;

-- Users can read team members in their accounts
create policy "team_members_read"
on public.team_members
for select
using (
  exists (
    select 1
    from public.team_members tm
    where tm.account_id = team_members.account_id
    and tm.user_id = auth.uid()
  )
);

-- Only owners/admins can modify team members
create policy "team_members_modify"
on public.team_members
for all
using (
  exists (
    select 1
    from public.team_members tm
    where tm.account_id = team_members.account_id
    and tm.user_id = auth.uid()
    and tm.role in ('owner','admin')
  )
)
with check (
  exists (
    select 1
    from public.team_members tm
    where tm.account_id = team_members.account_id
    and tm.user_id = auth.uid()
    and tm.role in ('owner','admin')
  )
);












