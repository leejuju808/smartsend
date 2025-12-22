-- 8500_campaign_team_sharing.sql
-- Block 8500 — Team Campaign Sharing (Private vs Shared Campaigns)
-- Adds created_by and is_shared columns to campaigns table
-- Implements RLS policies for private vs shared campaign access

-- 1) Add owner + sharing flag to campaigns
alter table public.campaigns
  add column if not exists created_by uuid
    references public.profiles(id),
  add column if not exists is_shared boolean not null default false;

-- Migrate from existing owner_user_id/visibility if they exist
do $$
begin
  -- Migrate owner_user_id to created_by (profiles.id = auth.users.id typically)
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'campaigns' 
    and column_name = 'owner_user_id'
  ) then
    update public.campaigns
    set created_by = owner_user_id
    where created_by is null and owner_user_id is not null;
  end if;

  -- Migrate visibility to is_shared
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'campaigns' 
    and column_name = 'visibility'
  ) then
    update public.campaigns
    set is_shared = (visibility = 'team')
    where is_shared = false and visibility in ('team', 'private');
  end if;
end $$;

-- Create indexes for performance
create index if not exists idx_campaigns_created_by 
  on public.campaigns(created_by);
create index if not exists idx_campaigns_is_shared 
  on public.campaigns(is_shared);
create index if not exists idx_campaigns_workspace_sharing 
  on public.campaigns(workspace_id, is_shared);

-- 2) Update RLS on campaigns for private vs shared
alter table public.campaigns enable row level security;

-- Clean out old policies if needed
drop policy if exists "Workspace members can select campaigns" on public.campaigns;
drop policy if exists "Workspace members can insert campaigns" on public.campaigns;
drop policy if exists "Workspace members can update campaigns" on public.campaigns;
drop policy if exists "Workspace members can delete campaigns" on public.campaigns;
drop policy if exists "campaigns_select" on public.campaigns;
drop policy if exists "campaigns_insert" on public.campaigns;
drop policy if exists "campaigns_update" on public.campaigns;
drop policy if exists "Team sharing: select campaigns" on public.campaigns;
drop policy if exists "Team sharing: insert campaigns" on public.campaigns;
drop policy if exists "Team sharing: update campaigns" on public.campaigns;
drop policy if exists "Team sharing: delete campaigns" on public.campaigns;

-- 1) SELECT: who can SEE a campaign?
-- Rule: any workspace member can see shared campaigns.
--       Only owner can see private ones.
create policy "Team sharing: select campaigns"
on public.campaigns
for select
using (
  -- Must belong to the workspace
  workspace_id in (
    select wm.workspace_id
    from public.workspace_members wm
    where wm.user_id = auth.uid()
  )
  and (
    is_shared = true
    or created_by = auth.uid()
  )
);

-- 2) INSERT: who can create campaigns?
-- Rule: any workspace member can create; created_by is set to auth.uid().
create policy "Team sharing: insert campaigns"
on public.campaigns
for insert
with check (
  workspace_id in (
    select wm.workspace_id
    from public.workspace_members wm
    where wm.user_id = auth.uid()
  )
  and created_by = auth.uid()
);

-- 3) UPDATE: who can edit a campaign?
-- Rule: owner can always edit.
--       For now, we'll allow any workspace member to edit shared campaigns.
create policy "Team sharing: update campaigns"
on public.campaigns
for update
using (
  workspace_id in (
    select wm.workspace_id
    from public.workspace_members wm
    where wm.user_id = auth.uid()
  )
  and (
    created_by = auth.uid()
    or is_shared = true
  )
)
with check (
  workspace_id in (
    select wm.workspace_id
    from public.workspace_members wm
    where wm.user_id = auth.uid()
  )
  and (
    created_by = auth.uid()
    or is_shared = true
  )
);

-- 4) DELETE: who can delete campaigns?
-- Rule: only owner can delete (even if it's shared).
create policy "Team sharing: delete campaigns"
on public.campaigns
for delete
using (
  workspace_id in (
    select wm.workspace_id
    from public.workspace_members wm
    where wm.user_id = auth.uid()
  )
  and created_by = auth.uid()
);

































































