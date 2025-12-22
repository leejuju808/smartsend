-- Organizations & Team Sharing System
-- This migration creates organizations, org_members, org_invites tables
-- and adds org_id to campaigns, leads, and campaign_logs

-- 1) Organizations & Members

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

create table if not exists org_members (
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','member')),
  created_at timestamptz default now(),
  primary key (org_id, user_id)
);

create index if not exists idx_org_members_user on org_members(user_id);
create index if not exists idx_org_members_org on org_members(org_id);

-- helper: is the current user in this org?
create or replace function is_org_member(check_org uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from org_members
    where org_id = check_org and user_id = auth.uid()
  );
$$;

-- 2) Pending invites

create table if not exists org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin','member')),
  token text not null, -- random
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  created_at timestamptz default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);

create index if not exists idx_org_invites_token on org_invites(token);
create index if not exists idx_org_invites_org on org_invites(org_id);

-- 3) Attach data to orgs

alter table if exists campaigns add column if not exists org_id uuid references organizations(id) on delete cascade;
alter table if exists leads add column if not exists org_id uuid references organizations(id) on delete cascade;
alter table if exists campaign_logs add column if not exists org_id uuid references organizations(id) on delete cascade;

create index if not exists idx_campaigns_org on campaigns(org_id);
create index if not exists idx_leads_org on leads(org_id);
create index if not exists idx_campaign_logs_org on campaign_logs(org_id);

-- 4) Backfill: create a default org per existing user
-- (Run once in SQL editor)

insert into organizations (name, owner_id)
select 'My Workspace', u.id
from auth.users u
where not exists (select 1 from organizations o where o.owner_id = u.id);

insert into org_members (org_id, user_id, role)
select o.id, o.owner_id, 'owner' from organizations o
on conflict do nothing;

-- Backfill org_id columns using the owner's default org

update campaigns c set org_id = o.id
from organizations o
where o.owner_id = c.user_id and c.org_id is null;

-- For campaigns without user_id, try workspace_id pattern if exists
do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'campaigns' and column_name = 'workspace_id') then
    update campaigns c set org_id = o.id
    from organizations o, auth.users u
    where c.workspace_id = u.id and o.owner_id = u.id and c.org_id is null;
  end if;
end $$;

update leads l set org_id = c.org_id
from campaigns c
where l.campaign_id = c.id and l.org_id is null;

-- For leads without campaign_id, use user_id
update leads l set org_id = o.id
from organizations o
where o.owner_id = l.user_id and l.org_id is null;

update campaign_logs cl set org_id = c.org_id
from campaigns c
where cl.campaign_id = c.id and cl.org_id is null;

-- For logs without campaign_id, use lead_id
update campaign_logs cl set org_id = l.org_id
from leads l
where cl.lead_id = l.id and cl.org_id is null and l.org_id is not null;

-- 5) RLS

alter table organizations enable row level security;
alter table org_members enable row level security;
alter table org_invites enable row level security;

-- Ensure campaigns, leads, campaign_logs have RLS enabled
alter table campaigns enable row level security;
alter table leads enable row level security;
alter table campaign_logs enable row level security;

-- orgs
drop policy if exists "read my orgs" on organizations;
create policy "read my orgs"
on organizations for select
using (exists (select 1 from org_members m where m.org_id = organizations.id and m.user_id = auth.uid()));

drop policy if exists "owner manage org" on organizations;
create policy "owner manage org"
on organizations for all
using (owner_id = auth.uid());

-- members
drop policy if exists "read my memberships" on org_members;
create policy "read my memberships"
on org_members for select
using (user_id = auth.uid() or exists (select 1 from org_members m where m.org_id = org_members.org_id and m.user_id = auth.uid() and m.role in ('owner','admin')));

drop policy if exists "admin add/remove members" on org_members;
create policy "admin add/remove members"
on org_members for insert with check (
  exists (select 1 from org_members m where m.org_id = org_members.org_id and m.user_id = auth.uid() and m.role in ('owner','admin'))
);

drop policy if exists "admin delete members" on org_members;
create policy "admin delete members"
on org_members for delete using (
  exists (select 1 from org_members m where m.org_id = org_members.org_id and m.user_id = auth.uid() and m.role in ('owner','admin'))
);

-- invites
drop policy if exists "read invites in my org" on org_invites;
create policy "read invites in my org"
on org_invites for select
using (is_org_member(org_id));

drop policy if exists "admin create invites" on org_invites;
create policy "admin create invites"
on org_invites for insert with check (
  exists (select 1 from org_members m where m.org_id = org_invites.org_id and m.user_id = auth.uid() and m.role in ('owner','admin'))
);

drop policy if exists "admin revoke invites" on org_invites;
create policy "admin revoke invites"
on org_invites for update using (
  exists (select 1 from org_members m where m.org_id = org_invites.org_id and m.user_id = auth.uid() and m.role in ('owner','admin'))
);

-- data (campaigns/leads/logs) scoped by org membership

drop policy if exists "read campaigns in my org" on campaigns;
create policy "read campaigns in my org"
on campaigns for select using (is_org_member(org_id));

drop policy if exists "write campaigns in my org" on campaigns;
create policy "write campaigns in my org"
on campaigns for all using (is_org_member(org_id)) with check (is_org_member(org_id));

drop policy if exists "read leads in my org" on leads;
create policy "read leads in my org"
on leads for select using (is_org_member(org_id));

drop policy if exists "write leads in my org" on leads;
create policy "write leads in my org"
on leads for all using (is_org_member(org_id)) with check (is_org_member(org_id));

drop policy if exists "read logs in my org" on campaign_logs;
create policy "read logs in my org"
on campaign_logs for select using (is_org_member(org_id));

drop policy if exists "write logs in my org" on campaign_logs;
create policy "write logs in my org"
on campaign_logs for all using (is_org_member(org_id)) with check (is_org_member(org_id));

-- Ensure pgcrypto extension exists for token generation
create extension if not exists pgcrypto;

