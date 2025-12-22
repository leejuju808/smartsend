-- SmartSend — Block 19: Team Spaces & Roles V2 (ACL + Invites + Audit Log)
-- Unified org-based access control system

-- ==============================================================================
-- 1) ENHANCE ORG SYSTEM WITH VIEWER ROLE AND ACL TABLES
-- ==============================================================================

-- Update org_members to include viewer role
alter table if exists public.org_members 
  drop constraint if exists org_members_role_check;

alter table if exists public.org_members 
  add constraint org_members_role_check 
  check (role in ('owner','admin','member','viewer'));

-- Update org_invites to include viewer role
alter table if exists public.org_invites 
  drop constraint if exists org_invites_role_check;

alter table if exists public.org_invites 
  add constraint org_invites_role_check 
  check (role in ('owner','admin','member','viewer'));

-- Add campaign_acl table for per-campaign permissions
create table if not exists public.campaign_acl (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  permission text not null check (permission in ('read','write')),
  created_at timestamptz default now(),
  unique(campaign_id, user_id)
);

create index if not exists idx_campaign_acl_campaign on public.campaign_acl(campaign_id);
create index if not exists idx_campaign_acl_user on public.campaign_acl(user_id);
create index if not exists idx_campaign_acl_org on public.campaign_acl(org_id);

-- Add inbox_acl table for per-inbox permissions
create table if not exists public.inbox_acl (
  id uuid primary key default gen_random_uuid(),
  inbox_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  permission text not null check (permission in ('read','write')),
  created_at timestamptz default now(),
  unique(inbox_id, user_id)
);

create index if not exists idx_inbox_acl_inbox on public.inbox_acl(inbox_id);
create index if not exists idx_inbox_acl_user on public.inbox_acl(user_id);
create index if not exists idx_inbox_acl_org on public.inbox_acl(org_id);

-- Ensure audit_log table exists (already created in 20241220_audit_logs.sql, but enhance if needed)
-- Rename audit_logs to audit_log for consistency if not already done
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='audit_logs') 
     and not exists (select 1 from information_schema.tables where table_schema='public' and table_name='audit_log') then
    alter table public.audit_logs rename to audit_log;
  end if;
end $$;

-- Ensure audit_log has the fields we need
alter table if exists public.audit_log 
  rename column target_type to target_table;

alter table if exists public.audit_log 
  add column if not exists details jsonb;

-- ==============================================================================
-- 2) ACL HELPER FUNCTIONS
-- ==============================================================================

-- Get current user's role in org
create or replace function public.current_role(p_org_id uuid)
returns text
language plpgsql
security definer
as $$
declare
  v_role text;
begin
  select role into v_role
  from public.org_members
  where org_id = p_org_id
    and user_id = auth.uid();
  
  return v_role;
end;
$$;

-- Check if user is admin or owner
create or replace function public.require_admin(p_org_id uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  v_role text;
begin
  select role into v_role
  from public.org_members
  where org_id = p_org_id
    and user_id = auth.uid();
  
  return v_role in ('owner', 'admin');
end;
$$;

-- Check if user can read campaign (org member + campaign_acl + owner/admin always allowed)
create or replace function public.can_read_campaign(p_campaign_id uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  v_org_id uuid;
  v_role text;
  v_has_acl boolean;
begin
  -- Get campaign's org_id (assuming campaigns has org_id or user_id)
  select org_id into v_org_id from public.campaigns where id = p_campaign_id;
  
  -- If no org_id found, try to infer from creator
  if v_org_id is null then
    select org_id into v_org_id 
    from public.profiles 
    where id in (
      select user_id from public.campaigns where id = p_campaign_id
    )
    limit 1;
  end if;
  
  -- Owner/Admin can always read
  select role into v_role
  from public.org_members
  where org_id = v_org_id
    and user_id = auth.uid();
  
  if v_role in ('owner', 'admin') then
    return true;
  end if;
  
  -- Check if user is org member (member+ can read)
  if v_role in ('member', 'viewer') then
    return true;
  end if;
  
  -- Check campaign_acl
  select exists(
    select 1 from public.campaign_acl
    where campaign_id = p_campaign_id
      and user_id = auth.uid()
  ) into v_has_acl;
  
  return v_has_acl;
end;
$$;

-- Check if user can write campaign
create or replace function public.can_write_campaign(p_campaign_id uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  v_org_id uuid;
  v_role text;
  v_has_acl boolean;
begin
  -- Get campaign's org_id
  select org_id into v_org_id from public.campaigns where id = p_campaign_id;
  
  if v_org_id is null then
    select org_id into v_org_id 
    from public.profiles 
    where id in (
      select user_id from public.campaigns where id = p_campaign_id
    )
    limit 1;
  end if;
  
  -- Owner/Admin can always write
  select role into v_role
  from public.org_members
  where org_id = v_org_id
    and user_id = auth.uid();
  
  if v_role in ('owner', 'admin') then
    return true;
  end if;
  
  -- Member can write
  if v_role = 'member' then
    return true;
  end if;
  
  -- Viewer cannot write
  if v_role = 'viewer' then
    return false;
  end if;
  
  -- Check campaign_acl for write permission
  select exists(
    select 1 from public.campaign_acl
    where campaign_id = p_campaign_id
      and user_id = auth.uid()
      and permission = 'write'
  ) into v_has_acl;
  
  return v_has_acl;
end;
$$;

-- Similar functions for inbox (using inbox_threads as the base)
create or replace function public.can_read_inbox(p_inbox_id uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  v_org_id uuid;
  v_role text;
begin
  -- Get inbox's org_id from workspace
  select w.org_id into v_org_id
  from public.inbox_threads i
  left join public.workspaces w on w.id = i.workspace_id
  where i.id = p_inbox_id;
  
  select role into v_role
  from public.org_members
  where org_id = v_org_id
    and user_id = auth.uid();
  
  if v_role in ('owner', 'admin', 'member', 'viewer') then
    return true;
  end if;
  
  return false;
end;
$$;

create or replace function public.can_write_inbox(p_inbox_id uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  v_org_id uuid;
  v_role text;
begin
  select w.org_id into v_org_id
  from public.inbox_threads i
  left join public.workspaces w on w.id = i.workspace_id
  where i.id = p_inbox_id;
  
  select role into v_role
  from public.org_members
  where org_id = v_org_id
    and user_id = auth.uid();
  
  if v_role in ('owner', 'admin', 'member') then
    return true;
  end if;
  
  return false;
end;
$$;

-- ==============================================================================
-- 3) RLS POLICIES FOR ACL TABLES
-- ==============================================================================

alter table if exists public.campaign_acl enable row level security;
alter table if exists public.inbox_acl enable row level security;

-- campaign_acl: users can read ACL for their org's campaigns, owners/admins can manage
create policy "campaign_acl_read_org" on public.campaign_acl
  for select using (
    exists(
      select 1 from public.org_members
      where org_id = campaign_acl.org_id
        and user_id = auth.uid()
    )
  );

create policy "campaign_acl_write_admin" on public.campaign_acl
  for all using (
    exists(
      select 1 from public.org_members
      where org_id = campaign_acl.org_id
        and user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  );

-- inbox_acl: similar to campaign_acl
create policy "inbox_acl_read_org" on public.inbox_acl
  for select using (
    exists(
      select 1 from public.org_members
      where org_id = inbox_acl.org_id
        and user_id = auth.uid()
    )
  );

create policy "inbox_acl_write_admin" on public.inbox_acl
  for all using (
    exists(
      select 1 from public.org_members
      where org_id = inbox_acl.org_id
        and user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  );

-- ==============================================================================
-- 4) ENSURE CAMPAIGNS AND INBOX TABLES HAVE ORG_ID
-- ==============================================================================

-- Add org_id to campaigns if not exists
alter table if exists public.campaigns 
  add column if not exists org_id uuid references public.orgs(id) on delete cascade;

create index if not exists idx_campaigns_org on public.campaigns(org_id) where org_id is not null;

-- Auto-populate org_id from user's profile
create or replace function public.set_campaign_org_id()
returns trigger
language plpgsql
as $$
begin
  if new.org_id is null and new.user_id is not null then
    select org_id into new.org_id
    from public.profiles
    where id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_campaign_org_id on public.campaigns;
create trigger trg_set_campaign_org_id
  before insert on public.campaigns
  for each row
  execute function public.set_campaign_org_id();

-- ==============================================================================
-- 5) UPDATE ORG_INVITES TABLE IF NEEDED (for token-based invites)
-- ==============================================================================

-- Ensure org_invites has expires_at
alter table if exists public.org_invites 
  add column if not exists expires_at timestamptz default (now() + interval '7 days');

-- ==============================================================================
-- 6) CREATE HELPER VIEW FOR ORG MEMBERS WITH USER EMAILS
-- ==============================================================================

create or replace view public.org_members_with_users as
select 
  om.id,
  om.org_id,
  om.user_id,
  om.role,
  om.created_at,
  p.email
from public.org_members om
left join public.profiles p on p.id = om.user_id;

-- Grant access to authenticated users
grant select on public.org_members_with_users to authenticated;

-- ==============================================================================
-- 7) AUTO-CREATE ORG FOR NEW USERS
-- ==============================================================================

-- Create trigger to auto-create org when profile is created
create or replace function public.create_default_org_for_user()
returns trigger
language plpgsql
security definer
as $$
declare
  v_org_id uuid;
begin
  -- Only if org_id is not set
  if new.org_id is null then
    -- Create personal org
    insert into public.orgs (name, owner_id)
    values (coalesce(new.full_name, new.email) || '''s Workspace', new.id)
    returning id into v_org_id;
    
    -- Add user as owner
    insert into public.org_members (org_id, user_id, role)
    values (v_org_id, new.id, 'owner')
    on conflict do nothing;
    
    -- Update profile with org_id
    new.org_id := v_org_id;
  end if;
  
  return new;
end;
$$;

drop trigger if exists trg_create_default_org_for_user on public.profiles;
create trigger trg_create_default_org_for_user
  before insert on public.profiles
  for each row
  execute function public.create_default_org_for_user();

-- ==============================================================================
-- COMMENTS
-- ==============================================================================

comment on table public.campaign_acl is 'Per-campaign access control permissions';
comment on table public.inbox_acl is 'Per-inbox access control permissions';
comment on table public.audit_log is 'Audit trail for org actions';
comment on function public.current_role(uuid) is 'Get current user role in org';
comment on function public.require_admin(uuid) is 'Check if user is admin/owner';
comment on function public.can_read_campaign(uuid) is 'Check if user can read campaign';
comment on function public.can_write_campaign(uuid) is 'Check if user can write campaign';
comment on function public.can_read_inbox(uuid) is 'Check if user can read inbox';
comment on function public.can_write_inbox(uuid) is 'Check if user can write inbox';

