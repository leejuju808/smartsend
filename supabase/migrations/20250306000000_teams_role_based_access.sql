-- Teams, Members, Role-Based Access Control
-- Comprehensive team system with owner/admin/member/viewer roles

-- 1) Teams table
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

-- Migrate existing teams: if created_by exists, rename to owner_id
do $$
begin
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'teams' and column_name = 'created_by'
  ) and not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'teams' and column_name = 'owner_id'
  ) then
    alter table public.teams rename column created_by to owner_id;
    alter table public.teams alter column owner_id set not null;
  end if;
  
  -- If owner_id doesn't exist at all, add it
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'teams' and column_name = 'owner_id'
  ) then
    alter table public.teams add column owner_id uuid references auth.users(id) on delete cascade;
    -- Set owner_id from first team member with owner role, or first member
    update public.teams t
    set owner_id = (
      select tm.user_id 
      from public.team_members tm 
      where tm.team_id = t.id 
      order by case when tm.role = 'owner' then 0 else 1 end, tm.joined_at
      limit 1
    )
    where owner_id is null;
    alter table public.teams alter column owner_id set not null;
  end if;
end $$;

-- 2) Team members table
create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','member','viewer')),
  created_at timestamptz default now(),
  primary key (team_id, user_id)
);

-- 3) Team invites table
create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin','member','viewer')),
  token text not null unique,
  expires_at timestamptz not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz default now(),
  accepted_at timestamptz
);

-- Migrate existing team_invites if they have different schema
do $$
begin
  -- If old schema has 'invited_by' instead of 'created_by'
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'team_invites' and column_name = 'invited_by'
  ) and not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'team_invites' and column_name = 'created_by'
  ) then
    alter table public.team_invites rename column invited_by to created_by;
  end if;
  
  -- If old schema has 'status' instead of 'accepted_at'
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'team_invites' and column_name = 'status'
  ) and not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'team_invites' and column_name = 'accepted_at'
  ) then
    alter table public.team_invites add column accepted_at timestamptz;
    update public.team_invites set accepted_at = now() where status = 'accepted';
    alter table public.team_invites drop column if exists status;
  end if;
end $$;

-- 4) Add team_id and created_by to campaigns
alter table if exists public.campaigns
  add column if not exists team_id uuid references public.teams(id) on delete cascade,
  add column if not exists created_by uuid references auth.users(id);

-- 5) Add team_id and created_by to leads
alter table if exists public.leads
  add column if not exists team_id uuid references public.teams(id) on delete cascade,
  add column if not exists created_by uuid references auth.users(id);

-- 6) Add team_id to send_queue
alter table if exists public.send_queue add column if not exists team_id uuid references public.teams(id) on delete cascade;

-- 7) Add team_id to emails_sent
alter table if exists public.emails_sent add column if not exists team_id uuid references public.teams(id) on delete cascade;

-- 8) Optionally add team_id to gmail_accounts (for shared sending identities)
alter table if exists public.gmail_accounts add column if not exists team_id uuid references public.teams(id) on delete cascade;

-- 9) Indexes
create index if not exists idx_team_members_user on public.team_members(user_id);
create index if not exists idx_team_members_team on public.team_members(team_id);
create index if not exists idx_campaigns_team on public.campaigns(team_id);
create index if not exists idx_leads_team on public.leads(team_id);
create index if not exists idx_send_queue_team on public.send_queue(team_id);
create index if not exists idx_emails_sent_team on public.emails_sent(team_id);
create index if not exists idx_team_invites_token on public.team_invites(token);
create index if not exists idx_team_invites_email on public.team_invites(lower(email));

-- 10) Helper function: is user on team?
create or replace function public.user_on_team(p_team uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.team_members
    where team_id = p_team and user_id = auth.uid()
  );
$$;

-- 11) Helper function: role at/above
create or replace function public.user_role_at_least(p_team uuid, p_role text)
returns boolean language sql stable as $$
  with rk(role, rank) as (
    values ('viewer',1),('member',2),('admin',3),('owner',4)
  )
  select tm.user_id is not null
  from team_members tm
  join rk want on want.role = p_role
  join rk mine on mine.role = tm.role
  where tm.team_id = p_team and tm.user_id = auth.uid() and mine.rank >= want.rank;
$$;

-- 12) Enable RLS
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_invites enable row level security;
alter table if exists public.campaigns enable row level security;
alter table if exists public.leads enable row level security;
alter table if exists public.send_queue enable row level security;
alter table if exists public.emails_sent enable row level security;
alter table if exists public.gmail_accounts enable row level security;

-- 13) Drop existing policies to recreate
drop policy if exists "see my teams" on public.teams;
drop policy if exists "create team" on public.teams;
drop policy if exists "update team (owner/admin)" on public.teams;
drop policy if exists "see my team members" on public.team_members;
drop policy if exists "add member (admin+)" on public.team_members;
drop policy if exists "update member (admin+)" on public.team_members;
drop policy if exists "remove member (admin+)" on public.team_members;
drop policy if exists "admin+ can manage invites" on public.team_invites;

-- Teams policies
create policy "see my teams" on public.teams
for select using (exists (select 1 from team_members tm where tm.team_id = teams.id and tm.user_id = auth.uid()));

create policy "create team" on public.teams
for insert with check (owner_id = auth.uid());

create policy "update team (owner/admin)" on public.teams
for update using (user_role_at_least(id, 'admin'));

-- Team members policies
create policy "see my team members" on public.team_members
for select using (user_on_team(team_id));

create policy "add member (admin+)" on public.team_members
for insert with check (user_role_at_least(team_id,'admin'));

create policy "update member (admin+)" on public.team_members
for update using (user_role_at_least(team_id,'admin'));

create policy "remove member (admin+)" on public.team_members
for delete using (user_role_at_least(team_id,'admin'));

-- Team invites policies
create policy "admin+ can manage invites" on public.team_invites
for all using (user_role_at_least(team_id,'admin')) with check (user_role_at_least(team_id,'admin'));

-- Campaigns policies
drop policy if exists "read team data" on public.campaigns;
drop policy if exists "write team data (member+)" on public.campaigns;
drop policy if exists "update team data (member+)" on public.campaigns;
drop policy if exists "campaigns in my teams" on public.campaigns;

create policy "read team data" on public.campaigns for select using (user_on_team(team_id));
create policy "write team data (member+)" on public.campaigns for insert with check (user_role_at_least(team_id,'member'));
create policy "update team data (member+)" on public.campaigns for update using (user_role_at_least(team_id,'member'));

-- Leads policies
drop policy if exists "read leads" on public.leads;
drop policy if exists "write leads (member+)" on public.leads;
drop policy if exists "update leads (member+)" on public.leads;
drop policy if exists "leads in my teams" on public.leads;

create policy "read leads" on public.leads for select using (user_on_team(team_id));
create policy "write leads (member+)" on public.leads for insert with check (user_role_at_least(team_id,'member'));
create policy "update leads (member+)" on public.leads for update using (user_role_at_least(team_id,'member'));

-- Send queue policies
drop policy if exists "read queue" on public.send_queue;
drop policy if exists "enqueue (member+)" on public.send_queue;
drop policy if exists "queue in my teams" on public.send_queue;

create policy "read queue" on public.send_queue for select using (user_on_team(team_id));
create policy "enqueue (member+)" on public.send_queue for insert with check (user_role_at_least(team_id,'member'));

-- Emails sent policies
drop policy if exists "read emails_sent" on public.emails_sent;

create policy "read emails_sent" on public.emails_sent for select using (user_on_team(team_id));

-- Gmail accounts policies (optional - for shared sending identities)
drop policy if exists "read team gmail" on public.gmail_accounts;
drop policy if exists "connect (admin+)" on public.gmail_accounts;
drop policy if exists "update (admin+)" on public.gmail_accounts;

create policy "read team gmail" on public.gmail_accounts for select using (user_on_team(team_id));
create policy "connect (admin+)" on public.gmail_accounts for insert with check (user_role_at_least(team_id,'admin'));
create policy "update (admin+)" on public.gmail_accounts for update using (user_role_at_least(team_id,'admin'));

-- Grant service role access (for migrations and backfills)
grant all on public.teams to service_role;
grant all on public.team_members to service_role;
grant all on public.team_invites to service_role;

