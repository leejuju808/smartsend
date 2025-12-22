-- Block 439 — Multi-User Workspaces v1
-- Team Invites • Roles • Shared Campaigns • Permissions • Activity Log
-- This block transforms SmartSend from a solo tool into a team platform

-- ============================================
-- 1) Update workspace_members role constraint to include 'readonly'
-- ============================================
-- Drop existing constraint if it exists
do $$
begin
  -- Check if constraint exists and drop it
  if exists (
    select 1 from information_schema.table_constraints 
    where constraint_name like '%workspace_members_role%' 
    and table_name = 'workspace_members'
  ) then
    alter table public.workspace_members drop constraint if exists workspace_members_role_check;
  end if;
end $$;

-- Add new constraint with readonly role
alter table public.workspace_members
  add constraint workspace_members_role_check 
  check (role in ('owner', 'admin', 'member', 'readonly'));

-- Ensure role column has default
alter table public.workspace_members
  alter column role set default 'member';

-- ============================================
-- 2) Update workspace_invites table schema
-- ============================================
-- Ensure workspace_invites exists with correct schema
create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('owner', 'admin', 'member', 'readonly')),
  token text unique not null,
  expires_at timestamptz not null default (now() + interval '3 days'),
  created_at timestamptz not null default now(),
  accepted boolean default false
);

-- Update existing invites table if it exists with different schema
do $$
begin
  -- Add accepted column if missing
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'workspace_invites' 
    and column_name = 'accepted'
  ) then
    alter table public.workspace_invites add column accepted boolean default false;
  end if;

  -- Update role constraint if needed
  if exists (
    select 1 from information_schema.table_constraints 
    where constraint_name like '%workspace_invites_role%' 
    and table_name = 'workspace_invites'
  ) then
    alter table public.workspace_invites drop constraint if exists workspace_invites_role_check;
  end if;
end $$;

-- Ensure role constraint includes readonly
alter table public.workspace_invites
  drop constraint if exists workspace_invites_role_check;

alter table public.workspace_invites
  add constraint workspace_invites_role_check 
  check (role in ('owner', 'admin', 'member', 'readonly'));

-- Create index for token lookups
create index if not exists idx_workspace_invites_token on public.workspace_invites(token);
create index if not exists idx_workspace_invites_workspace on public.workspace_invites(workspace_id);
create index if not exists idx_workspace_invites_email on public.workspace_invites(email);

-- ============================================
-- 3) Add created_by to campaigns table
-- ============================================
alter table public.campaigns
  add column if not exists created_by uuid references auth.users(id) on delete set null;

-- Backfill created_by from user_id if user_id exists
do $$
begin
  update public.campaigns
  set created_by = user_id
  where created_by is null and user_id is not null;
end $$;

create index if not exists idx_campaigns_created_by on public.campaigns(created_by);

-- ============================================
-- 4) Create workspace-level activity_log table
-- ============================================
create table if not exists public.workspace_activity_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_workspace_activity_workspace on public.workspace_activity_log(workspace_id, created_at desc);
create index if not exists idx_workspace_activity_user on public.workspace_activity_log(user_id);
create index if not exists idx_workspace_activity_entity on public.workspace_activity_log(entity_type, entity_id);
create index if not exists idx_workspace_activity_action on public.workspace_activity_log(action);

-- RLS for activity log
alter table public.workspace_activity_log enable row level security;

create policy "workspace_activity_log_read"
  on public.workspace_activity_log for select
  using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = workspace_activity_log.workspace_id
      and user_id = auth.uid()
    )
  );

-- Only workspace members can insert activity logs (via RPC)
create policy "workspace_activity_log_insert"
  on public.workspace_activity_log for insert
  with check (
    exists (
      select 1 from public.workspace_members
      where workspace_id = workspace_activity_log.workspace_id
      and user_id = auth.uid()
    )
  );

-- ============================================
-- 5) Helper function: Get user role in workspace
-- ============================================
create or replace function public.get_workspace_role(p_workspace_id uuid, p_user_id uuid)
returns text
language sql stable security definer
as $$
  select role from public.workspace_members
  where workspace_id = p_workspace_id and user_id = p_user_id;
$$;

-- ============================================
-- 6) Helper function: Check if user has required role
-- ============================================
create or replace function public.has_workspace_role(
  p_workspace_id uuid,
  p_user_id uuid,
  p_required_roles text[]
)
returns boolean
language sql stable security definer
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id
    and user_id = p_user_id
    and role = any(p_required_roles)
  );
$$;

-- ============================================
-- 7) Helper function: Log workspace activity
-- ============================================
create or replace function public.log_workspace_activity(
  p_workspace_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql security definer
as $$
declare
  v_log_id uuid;
begin
  insert into public.workspace_activity_log (
    workspace_id,
    user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    p_workspace_id,
    auth.uid(),
    p_action,
    p_entity_type,
    p_entity_id,
    p_metadata
  )
  returning id into v_log_id;

  return v_log_id;
end;
$$;

grant execute on function public.log_workspace_activity(uuid, text, text, uuid, jsonb) to authenticated;

-- ============================================
-- 8) Update is_workspace_admin function to include owner
-- ============================================
create or replace function public.is_workspace_admin(p_ws uuid)
returns boolean
language sql stable security definer
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = p_ws
    and user_id = auth.uid()
    and role in ('owner', 'admin')
  );
$$;

-- ============================================
-- 9) RPC: Create invite
-- ============================================
create or replace function public.create_workspace_invite(
  p_workspace_id uuid,
  p_email text,
  p_role text default 'member'
)
returns uuid
language plpgsql security definer
as $$
declare
  v_invite_id uuid;
  v_token text;
begin
  -- Check user is admin/owner
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'Only workspace admins can create invites';
  end if;

  -- Generate token
  v_token := gen_random_uuid()::text;

  -- Create invite
  insert into public.workspace_invites (
    workspace_id,
    email,
    role,
    token,
    expires_at
  )
  values (
    p_workspace_id,
    p_email,
    p_role,
    v_token,
    now() + interval '3 days'
  )
  returning id into v_invite_id;

  -- Log activity
  perform public.log_workspace_activity(
    p_workspace_id,
    'invite_created',
    'workspace_invite',
    v_invite_id,
    jsonb_build_object('email', p_email, 'role', p_role)
  );

  return v_invite_id;
end;
$$;

grant execute on function public.create_workspace_invite(uuid, text, text) to authenticated;

-- ============================================
-- 10) Update accept_invite function
-- ============================================
create or replace function public.accept_workspace_invite(p_token text)
returns uuid
language plpgsql security definer
as $$
declare
  v_inv public.workspace_invites%rowtype;
  v_workspace_id uuid;
begin
  -- Find valid invite
  select * into v_inv from public.workspace_invites
  where token = p_token
  and accepted = false
  and expires_at > now()
  for update;

  if not found then
    raise exception 'Invalid or expired invite';
  end if;

  -- Add member
  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_inv.workspace_id, auth.uid(), v_inv.role)
  on conflict (workspace_id, user_id) do update
  set role = v_inv.role;

  -- Mark invite as accepted
  update public.workspace_invites
  set accepted = true
  where id = v_inv.id;

  -- Log activity
  perform public.log_workspace_activity(
    v_inv.workspace_id,
    'invite_accepted',
    'workspace_invite',
    v_inv.id,
    jsonb_build_object('email', v_inv.email, 'role', v_inv.role)
  );

  return v_inv.workspace_id;
end;
$$;

grant execute on function public.accept_workspace_invite(text) to authenticated;

-- ============================================
-- 11) RPC: Update member role
-- ============================================
create or replace function public.update_workspace_member_role(
  p_workspace_id uuid,
  p_target_user_id uuid,
  p_new_role text
)
returns void
language plpgsql security definer
as $$
declare
  v_current_role text;
begin
  -- Check caller is admin/owner
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'Only workspace admins can update member roles';
  end if;

  -- Prevent changing owner role (special handling)
  select role into v_current_role
  from public.workspace_members
  where workspace_id = p_workspace_id
  and user_id = p_target_user_id;

  if v_current_role = 'owner' and p_new_role != 'owner' then
    raise exception 'Cannot change owner role';
  end if;

  -- Update role
  update public.workspace_members
  set role = p_new_role
  where workspace_id = p_workspace_id
  and user_id = p_target_user_id;

  -- Log activity
  perform public.log_workspace_activity(
    p_workspace_id,
    'member_role_updated',
    'workspace_member',
    p_target_user_id,
    jsonb_build_object('old_role', v_current_role, 'new_role', p_new_role)
  );
end;
$$;

grant execute on function public.update_workspace_member_role(uuid, uuid, text) to authenticated;

-- ============================================
-- 12) RPC: Remove workspace member
-- ============================================
create or replace function public.remove_workspace_member(
  p_workspace_id uuid,
  p_target_user_id uuid
)
returns void
language plpgsql security definer
as $$
begin
  -- Check caller is admin/owner
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'Only workspace admins can remove members';
  end if;

  -- Prevent removing owner
  if exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id
    and user_id = p_target_user_id
    and role = 'owner'
  ) then
    raise exception 'Cannot remove workspace owner';
  end if;

  -- Remove member
  delete from public.workspace_members
  where workspace_id = p_workspace_id
  and user_id = p_target_user_id;

  -- Log activity
  perform public.log_workspace_activity(
    p_workspace_id,
    'member_removed',
    'workspace_member',
    p_target_user_id,
    '{}'::jsonb
  );
end;
$$;

grant execute on function public.remove_workspace_member(uuid, uuid) to authenticated;

-- ============================================
-- 13) Update RLS policies for shared resources
-- ============================================
-- Campaigns: All workspace members can view, creators/admins can edit
do $$
begin
  -- Drop old policies if they exist
  drop policy if exists "campaigns_workspace_read" on public.campaigns;
  drop policy if exists "campaigns_workspace_write" on public.campaigns;

  -- Create new workspace-aware policies
  create policy "campaigns_workspace_read"
    on public.campaigns for select
    using (
      workspace_id is not null and
      exists (
        select 1 from public.workspace_members
        where workspace_id = campaigns.workspace_id
        and user_id = auth.uid()
      )
    );

  create policy "campaigns_workspace_write"
    on public.campaigns for all
    using (
      workspace_id is not null and
      exists (
        select 1 from public.workspace_members wm
        where wm.workspace_id = campaigns.workspace_id
        and wm.user_id = auth.uid()
        and (
          wm.role in ('owner', 'admin') or
          (wm.role in ('member', 'readonly') and campaigns.created_by = auth.uid())
        )
      )
    )
    with check (
      workspace_id is not null and
      exists (
        select 1 from public.workspace_members wm
        where wm.workspace_id = campaigns.workspace_id
        and wm.user_id = auth.uid()
        and (
          wm.role in ('owner', 'admin', 'member') or
          (wm.role = 'readonly' and campaigns.created_by = auth.uid())
        )
      )
    );
end $$;

-- ============================================
-- 14) Ensure segments table has workspace_id
-- ============================================
alter table if exists public.segments
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

-- ============================================
-- 15) Ensure inboxes/email_accounts have workspace_id
-- ============================================
-- Update email_accounts if it exists
do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'email_accounts') then
    alter table public.email_accounts
      add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
  end if;

  if exists (select 1 from information_schema.tables where table_name = 'sender_inboxes') then
    -- Already has workspace_id from Block 423
    null;
  end if;
end $$;

-- ============================================
-- 16) Comments
-- ============================================
comment on table public.workspace_activity_log is 'Audit trail for all workspace actions';
comment on column public.campaigns.created_by is 'User who created this campaign (for permission checks)';
comment on column public.workspace_members.role is 'Role: owner (full control), admin (manage team/campaigns), member (create/edit), readonly (view only)';



