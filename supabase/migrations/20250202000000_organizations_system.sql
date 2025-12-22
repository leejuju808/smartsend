-- Organizations (workspaces)

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

-- Members & roles

create type org_role as enum ('owner','admin','member');

create table if not exists org_memberships (
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  invited_email text,
  role org_role not null default 'member',
  status text not null default 'active', -- 'active' | 'pending'
  invited_token text,                    -- for pending invites
  created_at timestamptz default now()
);

-- Unique constraint for active memberships (org_id, user_id) where user_id is not null
create unique index if not exists idx_org_memberships_active 
on org_memberships(org_id, user_id) 
where user_id is not null;

-- Unique constraint for pending invites (org_id, invited_email)
-- Only applies when user_id is NULL
create unique index if not exists idx_org_memberships_pending_invite 
on org_memberships(org_id, invited_email) 
where user_id is null and status = 'pending';

-- Ensure campaigns belong to an org
alter table campaigns
  add column if not exists org_id uuid references organizations(id) on delete cascade;

-- Optional: per-campaign collaborators outside the org
create type campaign_perm as enum ('view','edit');
create table if not exists campaign_collaborators (
  campaign_id uuid references campaigns(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  permission campaign_perm not null default 'view',
  created_at timestamptz default now(),
  primary key (campaign_id, user_id)
);

-- RLS
alter table organizations enable row level security;
alter table org_memberships enable row level security;
alter table campaigns enable row level security;
alter table campaign_collaborators enable row level security;

-- Helper: is member of org
create or replace function is_org_member(_org uuid)
returns boolean language sql stable as $$
  select exists(
    select 1 from org_memberships
    where org_id = _org and user_id = auth.uid() and status = 'active'
  );
$$;

-- Policies
create policy "org members can read org"
on organizations for select
to authenticated
using (is_org_member(id) or owner_id = auth.uid());

create policy "owner/admin can manage org"
on organizations for update
to authenticated
using (exists (
  select 1 from org_memberships m
  where m.org_id = organizations.id
    and m.user_id = auth.uid()
    and m.role in ('owner','admin')
));

create policy "members read own membership"
on org_memberships for select
to authenticated
using (user_id = auth.uid() or exists(
  select 1 from org_memberships m
  where m.org_id = org_memberships.org_id and m.user_id = auth.uid()
));

create policy "owner/admin manage memberships"
on org_memberships for all
to authenticated
using (exists(
  select 1 from org_memberships m
  where m.org_id = org_memberships.org_id
  and m.user_id = auth.uid()
  and m.role in ('owner','admin')
))
with check (exists(
  select 1 from org_memberships m
  where m.org_id = org_memberships.org_id
  and m.user_id = auth.uid()
  and m.role in ('owner','admin')
));

-- Campaign access: members of the org OR explicit collaborator
create policy "org members read campaigns"
on campaigns for select
to authenticated
using (is_org_member(org_id) or exists(
  select 1 from campaign_collaborators cc
  where cc.campaign_id = campaigns.id and cc.user_id = auth.uid()
));

create policy "owners/admins write campaigns"
on campaigns for insert
to authenticated
with check (is_org_member(org_id));

create policy "owners/admins update campaigns"
on campaigns for update
to authenticated
using (is_org_member(org_id));

-- Collaborators policy
create policy "read collaborators you're in"
on campaign_collaborators for select
to authenticated
using (user_id = auth.uid() or exists(
  select 1 from campaigns c
  join org_memberships m on m.org_id = c.org_id and m.user_id = auth.uid()
  where c.id = campaign_collaborators.campaign_id
));

create policy "org admins manage collaborators"
on campaign_collaborators for all
to authenticated
using (exists(
  select 1 from campaigns c
  join org_memberships m on m.org_id = c.org_id and m.user_id = auth.uid()
  where c.id = campaign_collaborators.campaign_id
  and m.role in ('owner','admin')
))
with check (exists(
  select 1 from campaigns c
  join org_memberships m on m.org_id = c.org_id and m.user_id = auth.uid()
  where c.id = campaign_collaborators.campaign_id
  and m.role in ('owner','admin')
));

-- Convenience default: when a user creates an org, add membership as owner
create or replace function add_owner_membership()
returns trigger language plpgsql as $$
begin
  -- Only insert if membership doesn't already exist
  if not exists (
    select 1 from org_memberships 
    where org_id = new.id and user_id = new.owner_id
  ) then
    insert into org_memberships(org_id, user_id, role, status)
    values (new.id, new.owner_id, 'owner', 'active');
  end if;
  return new;
end $$;

drop trigger if exists trg_add_owner_membership on organizations;
create trigger trg_add_owner_membership
after insert on organizations
for each row execute function add_owner_membership();

-- Indexes for performance
create index if not exists idx_org_memberships_user on org_memberships(user_id, status);
create index if not exists idx_org_memberships_org on org_memberships(org_id, status);
create index if not exists idx_campaigns_org on campaigns(org_id);
create index if not exists idx_campaign_collaborators_campaign on campaign_collaborators(campaign_id);
create index if not exists idx_campaign_collaborators_user on campaign_collaborators(user_id);
create index if not exists idx_org_memberships_token on org_memberships(invited_token) where invited_token is not null;

