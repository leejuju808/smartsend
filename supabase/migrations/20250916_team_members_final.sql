-- Team Members table (final schema)
create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  role text check (role in ('owner','admin','member')) default 'member',
  joined_at timestamptz default now()
);

-- Create indexes for performance
create index if not exists idx_team_members_user on public.team_members(user_id);
create index if not exists idx_team_members_team on public.team_members(team_id);
create index if not exists idx_team_members_role on public.team_members(role);

-- Enable RLS
alter table if exists public.team_members enable row level security;

-- RLS policies for team_members
create policy "team_members_can_view_own_team" on public.team_members
  for select using (
    exists (
      select 1 from public.team_members tm
      where tm.team_id = team_members.team_id 
      and tm.user_id = auth.uid()
    )
  );

create policy "team_owners_can_manage_members" on public.team_members
  for all using (
    exists (
      select 1 from public.teams t
      where t.id = team_members.team_id 
      and t.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.teams t
      where t.id = team_members.team_id 
      and t.owner_id = auth.uid()
    )
  );

-- Add unique constraint to prevent duplicate memberships
alter table if exists public.team_members 
  add constraint unique_team_user unique (team_id, user_id); 