-- Complete Teams System Migration
-- Consolidates and enhances existing teams implementation with proper invites and RLS

-- 1) Ensure teams table exists with proper schema
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Add created_by if it doesn't exist (migration compatibility)
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'teams' and column_name = 'created_by'
  ) then
    alter table public.teams add column created_by uuid references auth.users(id) on delete set null;
  end if;
end $$;

-- 2) Ensure team_members table exists with proper schema
create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member','viewer')),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

-- Add joined_at if it doesn't exist
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'team_members' and column_name = 'joined_at'
  ) then
    alter table public.team_members add column joined_at timestamptz not null default now();
  end if;
end $$;

-- Drop old id column if it exists and replace with composite primary key
do $$
begin
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'team_members' and column_name = 'id'
  ) then
    alter table public.team_members drop constraint if exists team_members_pkey;
    alter table public.team_members drop column if exists id;
    alter table public.team_members add primary key (team_id, user_id);
  end if;
end $$;

-- 3) Create team_invites table (rename from team_invitations if needed)
create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('admin','member','viewer')),
  token text not null unique,
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  invited_by uuid not null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);

-- Migrate data from team_invitations if it exists
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'team_invitations') then
    insert into public.team_invites (
      id, team_id, email, role, token, invited_by, created_at, expires_at, status
    )
    select 
      id, team_id, email, role, token, 
      inviter_id, created_at, expires_at,
      case 
        when accepted_at is not null then 'accepted'
        when expires_at < now() then 'expired'
        else 'pending'
      end
    from public.team_invitations
    on conflict (id) do nothing;
    
    drop table if exists public.team_invitations cascade;
  end if;
end $$;

-- Create indexes
create index if not exists idx_team_members_team on public.team_members(team_id);
create index if not exists idx_team_members_user on public.team_members(user_id);
create index if not exists idx_team_invites_team on public.team_invites(team_id);
create index if not exists idx_team_invites_token on public.team_invites(token);
create index if not exists idx_team_invites_email on public.team_invites(lower(email));

-- 4) Add team_id to core objects if not already present
alter table public.campaigns add column if not exists team_id uuid references public.teams(id) on delete cascade;
alter table public.leads add column if not exists team_id uuid references public.teams(id) on delete cascade;
alter table public.inboxes add column if not exists team_id uuid references public.teams(id) on delete cascade;
alter table public.emails add column if not exists team_id uuid references public.teams(id) on delete cascade;

-- Check for send_queue table and add team_id if it exists
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'send_queue') then
    alter table public.send_queue add column if not exists team_id uuid references public.teams(id) on delete cascade;
  end if;
end $$;

-- 5) Helper views and RPC functions
create or replace view v_my_teams as
select tm.team_id
from public.team_members tm
where tm.user_id = auth.uid();

create or replace function is_member_of(p_team uuid)
returns boolean language sql security definer as $$
  select exists(select 1 from public.team_members where team_id = p_team and user_id = auth.uid())
$$;

create or replace view v_my_team_roles as
select tm.team_id, tm.role from public.team_members tm where tm.user_id = auth.uid();

-- 6) Enable RLS
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_invites enable row level security;

-- 7) Drop existing policies if they exist
drop policy if exists "read my teams" on public.teams;
drop policy if exists "insert team" on public.teams;
drop policy if exists "update my team (admin+)" on public.teams;
drop policy if exists "read my team members" on public.team_members;
drop policy if exists "manage members (admin+)" on public.team_members;
drop policy if exists "read invites (admin+)" on public.team_invites;
drop policy if exists "create invites (admin+)" on public.team_invites;
drop policy if exists "update invites (admin+)" on public.team_invites;

-- Teams: members can read their team; only owners/admins manage
create policy "read my teams" on public.teams for select using (is_member_of(id));
create policy "insert team" on public.teams for insert with check (true); -- allow anyone to create a team
create policy "update my team (admin+)" on public.teams
  for update using (exists(select 1 from public.team_members where team_id = id and user_id = auth.uid() and role in ('owner','admin')));

-- Team members
create policy "read my team members" on public.team_members for select using (is_member_of(team_id));
create policy "manage members (admin+)" on public.team_members
  for all using (exists(select 1 from public.team_members where team_id = team_members.team_id and user_id = auth.uid() and role in ('owner','admin')))
  with check (exists(select 1 from public.team_members where team_id = team_members.team_id and user_id = auth.uid() and role in ('owner','admin')));

-- Invites (visible to admins; self-accept by token handled server-side)
create policy "read invites (admin+)" on public.team_invites for select
  using (exists(select 1 from public.team_members where team_id = team_invites.team_id and user_id = auth.uid() and role in ('owner','admin')));
create policy "create invites (admin+)" on public.team_invites for insert
  with check (exists(select 1 from public.team_members where team_id = team_invites.team_id and user_id = auth.uid() and role in ('owner','admin')));
create policy "update invites (admin+)" on public.team_invites for update
  using (exists(select 1 from public.team_members where team_id = team_invites.team_id and user_id = auth.uid() and role in ('owner','admin')));

-- 8) Enable RLS on data tables if they exist
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'campaigns') then
    alter table public.campaigns enable row level security;
    drop policy if exists "campaigns in my teams" on public.campaigns;
    create policy "campaigns in my teams" on public.campaigns for all
      using (team_id is null or is_member_of(team_id)) with check (team_id is null or is_member_of(team_id));
  end if;
  
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'leads') then
    alter table public.leads enable row level security;
    drop policy if exists "leads in my teams" on public.leads;
    create policy "leads in my teams" on public.leads for all
      using (team_id is null or is_member_of(team_id)) with check (team_id is null or is_member_of(team_id));
  end if;
  
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'inboxes') then
    alter table public.inboxes enable row level security;
    drop policy if exists "inboxes in my teams" on public.inboxes;
    create policy "inboxes in my teams" on public.inboxes for all
      using (team_id is null or is_member_of(team_id)) with check (team_id is null or is_member_of(team_id));
  end if;
  
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'emails') then
    alter table public.emails enable row level security;
    drop policy if exists "emails in my teams" on public.emails;
    create policy "emails in my teams" on public.emails for all
      using (team_id is null or is_member_of(team_id)) with check (team_id is null or is_member_of(team_id));
  end if;
  
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'send_queue') then
    alter table public.send_queue enable row level security;
    drop policy if exists "queue in my teams" on public.send_queue;
    create policy "queue in my teams" on public.send_queue for all
      using (team_id is null or is_member_of(team_id)) with check (team_id is null or is_member_of(team_id));
  end if;
end $$;

-- Grant service role access
grant all on public.teams to service_role;
grant all on public.team_members to service_role;
grant all on public.team_invites to service_role;

