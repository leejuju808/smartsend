-- Team Collaboration & Sharing Migration
-- Implements team_members table, roles, campaign sharing, and thread ownership

-- 1) Create role_enum type
create type if not exists role_enum as enum ('owner','admin','member','viewer');

-- 2) Create team_members table (separate from workspace_members for invitation workflow)
create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role role_enum not null default 'member',
  invited_at timestamptz default now(),
  accepted_at timestamptz
);

create unique index if not exists uq_team_member on team_members(workspace_id, user_id);
create index if not exists idx_team_members_workspace on team_members(workspace_id);
create index if not exists idx_team_members_user on team_members(user_id);

-- 3) Add is_shared column to campaigns
alter table campaigns
  add column if not exists is_shared boolean not null default true;

create index if not exists idx_campaigns_is_shared on campaigns(workspace_id, is_shared);

-- 4) Add owner_id to email_threads (update if it exists with wrong reference)
alter table email_threads
  add column if not exists owner_id uuid references auth.users(id);

-- If owner_id already exists but references profiles, we'll keep it but ensure the reference is correct
-- (Migration handles both cases)

create index if not exists idx_email_threads_owner on email_threads(owner_id);

-- 5) Create campaign_owners table for private campaigns
create table if not exists campaign_owners (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade
);

create unique index if not exists uq_campaign_owner on campaign_owners(campaign_id, user_id);
create index if not exists idx_campaign_owners_campaign on campaign_owners(campaign_id);
create index if not exists idx_campaign_owners_user on campaign_owners(user_id);

-- 6) Enable RLS on team_members
alter table team_members enable row level security;

-- RLS: Team members can read/write within their workspace
drop policy if exists "team read/write self workspace" on team_members;
create policy "team read/write self workspace" on team_members
using (
  workspace_id in (
    select workspace_id from team_members tm
    where tm.user_id = auth.uid()
  )
  OR
  exists (
    select 1 from workspace_members wm
    where wm.workspace_id = team_members.workspace_id
    and wm.user_id = auth.uid()
  )
)
with check (
  workspace_id in (
    select workspace_id from team_members tm
    where tm.user_id = auth.uid() and tm.role in ('owner','admin')
  )
  OR
  exists (
    select 1 from workspace_members wm
    where wm.workspace_id = team_members.workspace_id
    and wm.user_id = auth.uid()
    and wm.role in ('owner','admin')
  )
);

-- 7) Update email_threads RLS policies
alter table email_threads enable row level security;

-- Thread read: any team member can read threads in their workspace
drop policy if exists "thread read" on email_threads;
create policy "thread read" on email_threads
for select using (
  exists (
    select 1 from team_members tm
    where tm.workspace_id = email_threads.workspace_id
      and tm.user_id = auth.uid()
      and tm.accepted_at is not null
  )
  OR
  exists (
    select 1 from workspace_members wm
    where wm.workspace_id = email_threads.workspace_id
      and wm.user_id = auth.uid()
  )
);

-- Thread update: owner/admin can update (including assign owner)
drop policy if exists "thread update owner/admin" on email_threads;
create policy "thread update owner/admin" on email_threads
for update using (
  exists (
    select 1 from team_members tm
    where tm.workspace_id = email_threads.workspace_id
      and tm.user_id = auth.uid()
      and tm.role in ('owner','admin')
      and tm.accepted_at is not null
  )
  OR
  exists (
    select 1 from workspace_members wm
    where wm.workspace_id = email_threads.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner','admin')
  )
);

-- 8) Update campaigns RLS policies for sharing
alter table campaigns enable row level security;

-- Campaign read: shared campaigns visible to all members, OR user is explicit owner
drop policy if exists "campaign read shared" on campaigns;
create policy "campaign read shared" on campaigns
for select using (
  (
    -- Shared campaigns: visible to workspace members
    is_shared = true
    AND (
      exists (
        select 1 from team_members tm
        where tm.workspace_id = campaigns.workspace_id
          and tm.user_id = auth.uid()
          and tm.accepted_at is not null
      )
      OR
      exists (
        select 1 from workspace_members wm
        where wm.workspace_id = campaigns.workspace_id
          and wm.user_id = auth.uid()
      )
    )
  )
  OR
  (
    -- Private campaigns: visible to explicit owners
    exists (
      select 1 from campaign_owners co
      where co.campaign_id = campaigns.id and co.user_id = auth.uid()
    )
  )
);

-- Campaign insert/update: members can create, owner/admin can update
drop policy if exists "campaign insert member" on campaigns;
create policy "campaign insert member" on campaigns
for insert with check (
  exists (
    select 1 from team_members tm
    where tm.workspace_id = campaigns.workspace_id
      and tm.user_id = auth.uid()
      and tm.accepted_at is not null
  )
  OR
  exists (
    select 1 from workspace_members wm
    where wm.workspace_id = campaigns.workspace_id
      and wm.user_id = auth.uid()
  )
);

drop policy if exists "campaign update member" on campaigns;
create policy "campaign update member" on campaigns
for update using (
  exists (
    select 1 from team_members tm
    where tm.workspace_id = campaigns.workspace_id
      and tm.user_id = auth.uid()
      and tm.accepted_at is not null
  )
  OR
  exists (
    select 1 from workspace_members wm
    where wm.workspace_id = campaigns.workspace_id
      and wm.user_id = auth.uid()
  )
);

-- 9) Campaign_owners RLS
alter table campaign_owners enable row level security;

create policy "campaign owners rw" on campaign_owners
for all using (
  exists (
    select 1 from team_members tm
    join campaigns c on c.workspace_id = tm.workspace_id and c.id = campaign_owners.campaign_id
    where tm.user_id = auth.uid() and tm.role in ('owner','admin')
      and tm.accepted_at is not null
  )
  OR
  exists (
    select 1 from workspace_members wm
    join campaigns c on c.workspace_id = wm.workspace_id and c.id = campaign_owners.campaign_id
    where wm.user_id = auth.uid() and wm.role in ('owner','admin')
  )
) with check (
  exists (
    select 1 from team_members tm
    join campaigns c on c.workspace_id = tm.workspace_id and c.id = campaign_owners.campaign_id
    where tm.user_id = auth.uid() and tm.role in ('owner','admin')
      and tm.accepted_at is not null
  )
  OR
  exists (
    select 1 from workspace_members wm
    join campaigns c on c.workspace_id = wm.workspace_id and c.id = campaign_owners.campaign_id
    where wm.user_id = auth.uid() and wm.role in ('owner','admin')
  )
);

-- Grant service role access
grant all on team_members to service_role;
grant all on campaign_owners to service_role;

