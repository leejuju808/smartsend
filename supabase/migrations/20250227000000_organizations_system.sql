-- Organizations system: teams, members, and campaign sharing
-- This migration creates the organizations system with RLS policies

-- organizations (teams)
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- org membership
create table if not exists org_members (
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- campaigns belong to an org (nullable until migration completes)
alter table campaigns add column if not exists org_id uuid references organizations(id) on delete set null;
create index if not exists idx_campaigns_org on campaigns(org_id);

-- share table for fine-grained access (optional per-campaign)
create table if not exists campaign_shares (
  campaign_id uuid not null references campaigns(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  can_edit boolean not null default false,
  can_send boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (campaign_id, org_id)
);

-- RLS (enable + policies)
alter table organizations enable row level security;
alter table org_members enable row level security;
alter table campaigns enable row level security;
alter table campaign_shares enable row level security;

-- helpers
create or replace function is_org_member(_org uuid)
returns boolean language sql stable as $$
  select exists(
    select 1 from org_members
    where org_id = _org and user_id = auth.uid()
  );
$$;

create or replace function is_org_admin(_org uuid)
returns boolean language sql stable as $$
  select exists(
    select 1 from org_members
    where org_id = _org and user_id = auth.uid() and role in ('owner','admin')
  );
$$;

-- organizations: member can see, owner/admin can update
create policy org_select on organizations
for select using ( is_org_member(id) );

create policy org_modify on organizations
for update using ( is_org_admin(id) );

-- org_members: members can see their org roster; only admins modify
create policy member_select on org_members
for select using ( is_org_member(org_id) );

create policy member_modify on org_members
for insert with check ( is_org_admin(org_id) )
,    update using ( is_org_admin(org_id) )
,    delete using ( is_org_admin(org_id) );

-- campaigns: owner or shared to your org
create policy campaign_select on campaigns
for select using (
  (org_id is not null and is_org_member(org_id))
  or exists(select 1 from campaign_shares s where s.campaign_id = id
            and is_org_member(s.org_id))
);

-- create/update/delete campaigns: must be admin in target org
create policy campaign_modify on campaigns
for insert with check ( org_id is not null and is_org_admin(org_id) )
,    update using ( org_id is not null and is_org_admin(org_id) )
,    delete using ( org_id is not null and is_org_admin(org_id) );

-- campaign_shares: visible to members of the shared org OR members of the campaign's org
create policy share_select on campaign_shares
for select using (
  is_org_member(org_id)
  or exists(select 1 from campaigns c where c.id = campaign_id and is_org_member(c.org_id))
);

-- campaign_shares: editable by admins of the campaign's org (who own the campaign)
create policy share_modify on campaign_shares
for insert with check (
  exists(select 1 from campaigns c where c.id = campaign_id and is_org_admin(c.org_id))
)
,    update using (
  exists(select 1 from campaigns c where c.id = campaign_id and is_org_admin(c.org_id))
)
,    delete using (
  exists(select 1 from campaigns c where c.id = campaign_id and is_org_admin(c.org_id))
);

