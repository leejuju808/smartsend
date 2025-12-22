-- Block 416 — Team Collaboration v1 (Shared Campaigns, Team Roles, Audit Log)
-- This migration implements the foundation for multi-user SmartSend workspaces

-- ============================================
-- 1) Workspaces Table (v1-lite)
-- ============================================
-- Every user belongs to one workspace by default
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create index if not exists idx_workspaces_created_by on public.workspaces(created_by);

-- ============================================
-- 2) Workspace Members Table
-- ============================================
create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'member')),
  invited_email text,
  created_at timestamptz default now(),
  unique(workspace_id, user_id) where user_id is not null,
  unique(workspace_id, invited_email) where invited_email is not null
);

create index if not exists idx_workspace_members_workspace on public.workspace_members(workspace_id);
create index if not exists idx_workspace_members_user on public.workspace_members(user_id);
create index if not exists idx_workspace_members_invited_email on public.workspace_members(invited_email) where invited_email is not null;

-- ============================================
-- 3) Campaign → Workspace Ownership
-- ============================================
-- Ensure campaigns table has workspace_id
alter table public.campaigns add column if not exists workspace_id uuid;

-- Update existing campaigns to belong to workspace of creator
-- This assumes campaigns have created_by or user_id column
do $$
declare
  v_campaign record;
  v_workspace_id uuid;
begin
  for v_campaign in 
    select id, coalesce(created_by, user_id) as creator_id 
    from public.campaigns 
    where workspace_id is null
    limit 1000
  loop
    -- Get or create workspace for this user
    select id into v_workspace_id
    from public.workspace_members
    where user_id = v_campaign.creator_id
    limit 1;
    
    -- If no workspace found, create one
    if v_workspace_id is null then
      insert into public.workspaces (name, created_by)
      values ('My Workspace', v_campaign.creator_id)
      returning id into v_workspace_id;
      
      -- Add creator as owner
      insert into public.workspace_members (workspace_id, user_id, role)
      values (v_workspace_id, v_campaign.creator_id, 'owner')
      on conflict (workspace_id, user_id) do nothing;
    end if;
    
    -- Update campaign
    update public.campaigns
    set workspace_id = v_workspace_id
    where id = v_campaign.id;
  end loop;
end $$;

-- Add foreign key constraint
alter table public.campaigns 
  add constraint fk_campaign_workspace 
  foreign key (workspace_id) references public.workspaces(id) on delete cascade;

create index if not exists idx_campaigns_workspace on public.campaigns(workspace_id);

-- ============================================
-- 4) Campaign Permissions Table
-- ============================================
create table if not exists public.campaign_permissions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  can_view boolean default true,
  can_edit boolean default false,
  can_send boolean default false,
  can_view_analytics boolean default true,
  created_at timestamptz default now(),
  unique(campaign_id, user_id)
);

create index if not exists idx_campaign_permissions_campaign on public.campaign_permissions(campaign_id);
create index if not exists idx_campaign_permissions_user on public.campaign_permissions(user_id);

-- ============================================
-- 5) Audit Log Table
-- ============================================
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  details jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_audit_log_workspace on public.audit_log(workspace_id, created_at desc);
create index if not exists idx_audit_log_actor on public.audit_log(actor_id, created_at desc);
create index if not exists idx_audit_log_target on public.audit_log(target_type, target_id);
create index if not exists idx_audit_log_action on public.audit_log(action);

-- ============================================
-- 6) RLS Policies
-- ============================================

-- Enable RLS
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.campaign_permissions enable row level security;
alter table public.audit_log enable row level security;

-- 6.1 Workspaces: Members can view their workspaces
drop policy if exists "workspace members can view" on public.workspaces;
create policy "workspace members can view" on public.workspaces
  for select using (
    id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
    )
  );

-- 6.2 Workspace Members: Users can see their own membership
drop policy if exists "workspace members can view" on public.workspace_members;
create policy "workspace members can view" on public.workspace_members
  for select using (auth.uid() = user_id);

-- 6.3 Campaigns: Users can view campaigns in their workspace
drop policy if exists "workspace campaign access" on public.campaigns;
create policy "workspace campaign access" on public.campaigns
  for select using (
    workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
    )
  );

-- 6.4 Campaign Permissions: Users can view their own permissions
drop policy if exists "users can view own permissions" on public.campaign_permissions;
create policy "users can view own permissions" on public.campaign_permissions
  for select using (auth.uid() = user_id);

-- 6.5 Audit Log: Workspace members can view their workspace audit logs
drop policy if exists "workspace members can view audit log" on public.audit_log;
create policy "workspace members can view audit log" on public.audit_log
  for select using (
    workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
    )
  );

-- ============================================
-- 7) Helper Functions
-- ============================================

-- 7.1 Function to log audit actions
create or replace function public.log_action(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_action text,
  p_target_type text,
  p_target_id uuid default null,
  p_details jsonb default null
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_log_id uuid;
begin
  insert into public.audit_log (
    workspace_id,
    actor_id,
    action,
    target_type,
    target_id,
    details
  )
  values (
    p_workspace_id,
    p_actor_id,
    p_action,
    p_target_type,
    p_target_id,
    p_details
  )
  returning id into v_log_id;
  
  return v_log_id;
end;
$$;

-- 7.2 Function to ensure user has a workspace
create or replace function public.ensure_user_workspace(p_user_id uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  v_workspace_id uuid;
begin
  -- Check if user already has a workspace
  select workspace_id into v_workspace_id
  from public.workspace_members
  where user_id = p_user_id
  limit 1;
  
  -- If not, create one
  if v_workspace_id is null then
    insert into public.workspaces (name, created_by)
    values ('My Workspace', p_user_id)
    returning id into v_workspace_id;
    
    -- Add user as owner
    insert into public.workspace_members (workspace_id, user_id, role)
    values (v_workspace_id, p_user_id, 'owner')
    on conflict (workspace_id, user_id) do nothing;
  end if;
  
  return v_workspace_id;
end;
$$;

-- ============================================
-- 8) Default Permissions for Campaign Creators
-- ============================================
-- When a campaign is created, grant full permissions to creator
create or replace function public.grant_campaign_creator_permissions()
returns trigger
language plpgsql
as $$
declare
  v_creator_id uuid;
begin
  -- Get creator from campaign (try created_by first, then user_id)
  v_creator_id := coalesce(new.created_by, new.user_id);
  
  if v_creator_id is not null then
    -- Grant full permissions to creator
    insert into public.campaign_permissions (
      campaign_id,
      user_id,
      can_view,
      can_edit,
      can_send,
      can_view_analytics
    )
    values (
      new.id,
      v_creator_id,
      true,
      true,
      true,
      true
    )
    on conflict (campaign_id, user_id) do nothing;
  end if;
  
  return new;
end;
$$;

-- Create trigger for new campaigns
drop trigger if exists trg_grant_campaign_creator_permissions on public.campaigns;
create trigger trg_grant_campaign_creator_permissions
  after insert on public.campaigns
  for each row
  execute function public.grant_campaign_creator_permissions();

-- ============================================
-- 9) Comments
-- ============================================
comment on table public.workspaces is 'Top-level tenant container for multi-user workspaces';
comment on table public.workspace_members is 'Membership records linking users to workspaces with roles';
comment on table public.campaign_permissions is 'Per-campaign permissions for team members (View, Edit, Send, Analytics)';
comment on table public.audit_log is 'Audit trail of actions performed in workspaces';

comment on column public.workspace_members.role is 'Workspace-level role: owner, manager, or member';
comment on column public.workspace_members.invited_email is 'Email address for pending invites (before user signs up)';
comment on column public.campaign_permissions.can_view is 'Permission to view campaign';
comment on column public.campaign_permissions.can_edit is 'Permission to edit campaign';
comment on column public.campaign_permissions.can_send is 'Permission to send emails from campaign';
comment on column public.campaign_permissions.can_view_analytics is 'Permission to view campaign analytics';

