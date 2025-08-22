-- Teams and sharing model layered on top of existing workspaces

-- 1) Teams tables (true tables; map 1:1 with workspaces for now)
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text check (role in ('owner','admin','member')) default 'member',
  created_at timestamptz not null default now()
);

create index if not exists idx_team_members_team on public.team_members(team_id);
create index if not exists idx_team_members_user on public.team_members(user_id);

alter table if exists public.teams enable row level security;
alter table if exists public.team_members enable row level security;

drop policy if exists "teams_select_member" on public.teams;
create policy "teams_select_member" on public.teams
  for select using (
    exists (
      select 1 from public.team_members m
      where m.team_id = teams.id and m.user_id = auth.uid()
    )
  );

drop policy if exists "team_members_select_self" on public.team_members;
create policy "team_members_select_self" on public.team_members
  for select using (user_id = auth.uid());

drop policy if exists "team_members_mutate_owner" on public.team_members;
create policy "team_members_mutate_owner" on public.team_members
  for all using (
    exists (
      select 1 from public.teams t
      where t.id = team_members.team_id and t.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.teams t
      where t.id = team_members.team_id and t.owner_id = auth.uid()
    )
  );

-- 2) Shared resources: add team_id alongside existing user/workspace ownership
alter table if exists public.campaigns add column if not exists team_id uuid references public.teams(id);
alter table if exists public.contacts add column if not exists team_id uuid references public.teams(id);
alter table if exists public.sequences add column if not exists team_id uuid references public.teams(id);

-- 3) RLS for shared access via team membership
alter table if exists public.campaigns enable row level security;
drop policy if exists "campaigns_select_member_team" on public.campaigns;
drop policy if exists "campaigns_mutate_member_team" on public.campaigns;
create policy if not exists "campaigns_select_member_team" on public.campaigns
  for select using (
    team_id is null or exists (select 1 from public.team_members m where m.team_id = campaigns.team_id and m.user_id = auth.uid())
  );
create policy if not exists "campaigns_mutate_member_team" on public.campaigns
  for all using (
    team_id is null or exists (select 1 from public.team_members m where m.team_id = campaigns.team_id and m.user_id = auth.uid())
  ) with check (
    team_id is null or exists (select 1 from public.team_members m where m.team_id = campaigns.team_id and m.user_id = auth.uid())
  );

alter table if exists public.contacts enable row level security;
drop policy if exists "contacts_select_member_team" on public.contacts;
drop policy if exists "contacts_mutate_member_team" on public.contacts;
create policy if not exists "contacts_select_member_team" on public.contacts
  for select using (
    team_id is null or exists (select 1 from public.team_members m where m.team_id = contacts.team_id and m.user_id = auth.uid())
  );
create policy if not exists "contacts_mutate_member_team" on public.contacts
  for all using (
    team_id is null or exists (select 1 from public.team_members m where m.team_id = contacts.team_id and m.user_id = auth.uid())
  ) with check (
    team_id is null or exists (select 1 from public.team_members m where m.team_id = contacts.team_id and m.user_id = auth.uid())
  );

alter table if exists public.sequences enable row level security;
drop policy if exists "sequences_select_member_team" on public.sequences;
drop policy if exists "sequences_mutate_member_team" on public.sequences;
create policy if not exists "sequences_select_member_team" on public.sequences
  for select using (
    team_id is null or exists (select 1 from public.team_members m where m.team_id = sequences.team_id and m.user_id = auth.uid())
  );
create policy if not exists "sequences_mutate_member_team" on public.sequences
  for all using (
    team_id is null or exists (select 1 from public.team_members m where m.team_id = sequences.team_id and m.user_id = auth.uid())
  ) with check (
    team_id is null or exists (select 1 from public.team_members m where m.team_id = sequences.team_id and m.user_id = auth.uid())
  );

-- 4) Backfill & mapping from existing workspaces (if present)
-- Create a team per workspace and map memberships
do $$
declare
  w record;
  new_team uuid;
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='workspaces') then
    for w in select id, name, owner_id from public.workspaces loop
      insert into public.teams(id, name, owner_id, created_at)
      values (gen_random_uuid(), coalesce(w.name, 'Team'), w.owner_id, now())
      returning id into new_team;

      insert into public.team_members(team_id, user_id, role)
      select new_team, m.user_id, m.role
      from public.workspace_members m where m.workspace_id = w.id;

      update public.campaigns set team_id = new_team where workspace_id = w.id and team_id is null;
      update public.contacts set team_id = new_team where workspace_id = w.id and team_id is null;
      update public.sequences set team_id = new_team where team_id is null and exists (
        select 1 from public.campaigns c where c.user_id = sequences.user_id and c.workspace_id = w.id
      );
    end loop;
  end if;
end $$;

-- 5) Sequence sharing mechanics: allow per-run sender association
alter table if exists public.sequence_runs
  add column if not exists sender_user_id uuid references auth.users(id) on delete cascade;

create index if not exists sequence_runs_sender_idx on public.sequence_runs(sender_user_id);

