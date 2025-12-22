-- Block 9200 — SmartSend Team Campaign Sharing v1 (Teams + Members + Shared Campaigns)
-- Goal: Let users share SmartSend campaigns with teammates

-- 1) DB: Teams + Members

-- a) smartsend_teams
create table if not exists smartsend_teams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

create index if not exists smartsend_teams_owner_idx on smartsend_teams (owner_id);

-- b) smartsend_team_members
create table if not exists smartsend_team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references smartsend_teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member', -- owner | admin | member
  created_at timestamptz default now(),
  unique(team_id, user_id)
);

create index if not exists smartsend_team_members_team_idx on smartsend_team_members (team_id);
create index if not exists smartsend_team_members_user_idx on smartsend_team_members (user_id);

-- 2) DB: Attach Campaigns to Teams

-- a) Add team_id + visibility to campaigns
alter table campaigns
  add column if not exists team_id uuid references smartsend_teams(id) on delete set null,
  add column if not exists visibility text default 'private'; -- private | team

create index if not exists campaigns_team_id_idx on campaigns (team_id);
create index if not exists campaigns_visibility_idx on campaigns (visibility);

-- 3) RLS: Team-Aware Access

-- Enable RLS on new tables
alter table smartsend_teams enable row level security;
alter table smartsend_team_members enable row level security;

-- Teams: owners can read their teams
create policy "teams_select_own"
on smartsend_teams
for select
using (
  owner_id = auth.uid()
  OR
  exists (
    select 1 from smartsend_team_members
    where team_id = smartsend_teams.id
    and user_id = auth.uid()
  )
);

-- Team members: users can read their own memberships
create policy "team_members_select_own"
on smartsend_team_members
for select
using (
  user_id = auth.uid()
  OR
  exists (
    select 1 from smartsend_team_members tm
    where tm.team_id = smartsend_team_members.team_id
    and tm.user_id = auth.uid()
    and tm.role in ('owner', 'admin')
  )
);

-- Team members: owners/admins can insert
create policy "team_members_insert_admin"
on smartsend_team_members
for insert
with check (
  exists (
    select 1 from smartsend_team_members tm
    where tm.team_id = smartsend_team_members.team_id
    and tm.user_id = auth.uid()
    and tm.role in ('owner', 'admin')
  )
);

-- Campaigns: Extend existing RLS to support team sharing
-- Note: This migration adds team-aware policies. If you have existing policies,
-- you may need to review and potentially merge them with these new policies.

-- Drop our specific policies if they exist (to allow re-running migration)
drop policy if exists "campaigns_owner_or_team_members" on campaigns;
drop policy if exists "campaigns_owner_or_admin_update" on campaigns;
drop policy if exists "campaigns_insert_own_team_sharing" on campaigns;

-- SELECT: Owner OR team members (if visibility = 'team')
-- This policy allows campaign owners and team members to view shared campaigns
create policy "campaigns_owner_or_team_members"
on campaigns
for select
using (
  -- owner can always see
  auth.uid() = user_id
  OR
  (
    -- team members can see if campaign is shared with team
    visibility = 'team'
    AND team_id is not null
    AND team_id in (
      select team_id from smartsend_team_members
      where user_id = auth.uid()
    )
  )
);

-- UPDATE: Owner OR team admin/owner (if visibility = 'team')
create policy "campaigns_owner_or_admin_update"
on campaigns
for update
using (
  auth.uid() = user_id
  OR
  (
    visibility = 'team'
    AND team_id is not null
    AND team_id in (
      select team_id from smartsend_team_members
      where user_id = auth.uid()
      and role in ('owner', 'admin')
    )
  )
)
with check (
  auth.uid() = user_id
  OR
  (
    visibility = 'team'
    AND team_id is not null
    AND team_id in (
      select team_id from smartsend_team_members
      where user_id = auth.uid()
      and role in ('owner', 'admin')
    )
  )
);

-- INSERT: Users can create campaigns (will set team_id/visibility separately)
-- Note: Only create this if no insert policy exists. Existing insert policies should remain.
-- If you need to ensure team_id is set, you can add a trigger or handle in application code.
do $$
begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' 
    and tablename = 'campaigns' 
    and policyname like '%insert%'
  ) then
    create policy "campaigns_insert_own_team_sharing"
    on campaigns
    for insert
    with check (auth.uid() = user_id);
  end if;
end $$;

-- 4) Supabase Function: Find User by Email
-- This function allows looking up auth.users by email (security definer)
create or replace function find_user_by_email(p_email text)
returns setof auth.users
language sql
security definer
as $$
  select * from auth.users where email = p_email;
$$;

