-- Block 11: Team Collaboration & Shared Campaigns
-- Enables multi-user teams to share projects, campaigns, and inboxes with proper permissions

-- 1. Create team_role enum
do $$ begin
  create type team_role as enum ('owner','admin','member','viewer');
exception when duplicate_object then null; 
end $$;

-- 2. Update project_members table to add invitation and acceptance fields
alter table if exists public.project_members
  add column if not exists invited_by uuid references auth.users(id),
  add column if not exists invited_at timestamptz default now(),
  add column if not exists accepted boolean default false,
  add column if not exists accepted_at timestamptz;

-- Update role column to use enum type if it exists
-- Note: We'll keep role as text for now to maintain compatibility, but use enum values
do $$ 
begin
  -- If role column doesn't match our expected values, we'll need to update existing data
  -- Set default accepted to true for existing members
  update public.project_members 
  set accepted = true, accepted_at = added_at 
  where accepted is null or accepted = false;
end $$;

-- Create unique index to ensure one membership per user per project
create unique index if not exists project_members_unique
  on public.project_members(project_id, user_id);

-- 3. Update is_member() helper to use project_members
create or replace function public.is_member(p_project uuid)
returns boolean 
language sql 
stable 
security definer 
set search_path=public 
as $$
  select exists(
    select 1 from public.project_members pm
    where pm.project_id = p_project 
      and pm.user_id = auth.uid()
      and pm.accepted = true
  );
$$;

-- 4. Owner-check helper
create or replace function public.is_owner(p_project uuid)
returns boolean 
language sql 
stable 
security definer 
set search_path=public 
as $$
  select exists(
    select 1 from public.project_members pm
    where pm.project_id = p_project 
      and pm.user_id = auth.uid() 
      and pm.role = 'owner'
      and pm.accepted = true
  );
$$;

-- 5. Admin-check helper
create or replace function public.is_admin(p_project uuid)
returns boolean 
language sql 
stable 
security definer 
set search_path=public 
as $$
  select exists(
    select 1 from public.project_members pm
    where pm.project_id = p_project 
      and pm.user_id = auth.uid() 
      and pm.role in ('owner', 'admin')
      and pm.accepted = true
  );
$$;

-- 6. Update RLS policy for project_members to allow admins/owners to invite
drop policy if exists "members read/write membership" on public.project_members;
drop policy if exists "admins can invite members" on public.project_members;
drop policy if exists "users can accept invites" on public.project_members;

-- Members can view their own memberships and memberships in projects they belong to
create policy "members can view memberships" on public.project_members
  for select using (
    user_id = auth.uid() 
    or is_member(project_id)
  );

-- Admins and owners can invite new members
create policy "admins can invite members" on public.project_members
  for insert with check (
    is_admin(project_id)
  );

-- Users can accept their own invites
create policy "users can accept invites" on public.project_members
  for update using (
    user_id = auth.uid()
  )
  with check (
    user_id = auth.uid()
  );

-- Admins and owners can update/remove members (except owners)
create policy "admins can manage members" on public.project_members
  for update using (
    is_admin(project_id) 
    and not exists (
      select 1 from public.project_members pm2
      where pm2.project_id = project_members.project_id
        and pm2.id = project_members.id
        and pm2.role = 'owner'
    )
  );

create policy "admins can remove members" on public.project_members
  for delete using (
    is_admin(project_id)
    and user_id != auth.uid() -- Can't delete yourself
  );

