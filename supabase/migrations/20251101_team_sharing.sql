-- 1️⃣ Teams table
create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid references auth.users(id) on delete cascade,
  created_at timestamp with time zone default now()
);

-- 2️⃣ Team members table
create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text check (role in ('owner','admin','member')) default 'member',
  created_at timestamp with time zone default now(),
  unique(team_id, user_id)
);

-- 3️⃣ Link campaigns to teams
alter table campaigns add column if not exists team_id uuid references teams(id);

-- 4️⃣ RLS
alter table teams enable row level security;
alter table team_members enable row level security;

create policy "team_owner_can_view"
on teams for select
using (auth.uid() = owner_id);

create policy "members_can_view"
on team_members for select
using (auth.uid() = user_id);

