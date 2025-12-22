-- Block 12900: Organization Roles & Permissions v1
-- Implements role-based access control (Owner, Manager, Staff, Read-Only)
-- Enables safe multi-user access for roofing teams

-- ============================================================================
-- 1. ENSURE ORG_MEMBERSHIPS TABLE EXISTS WITH CORRECT STRUCTURE
-- ============================================================================

-- Create org_memberships if it doesn't exist (handles both org_members and org_memberships scenarios)
create table if not exists public.org_memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  invited_email text,
  role text not null default 'owner',
  status text not null default 'active', -- 'active' | 'pending' | 'accepted' | 'expired' | 'revoked'
  invited_token text,
  created_at timestamptz default now(),
  unique(org_id, user_id) where user_id is not null,
  unique(org_id, invited_email) where user_id is null and status = 'pending'
);

-- Create index on role for fast permission checks
create index if not exists org_users_role_idx on public.org_memberships(role);
create index if not exists idx_org_memberships_org on public.org_memberships(org_id);
create index if not exists idx_org_memberships_user on public.org_memberships(user_id);
create index if not exists idx_org_memberships_status on public.org_memberships(status);

-- ============================================================================
-- 2. UPDATE ROLE COLUMN TO SUPPORT NEW ROLES
-- ============================================================================

-- Drop existing check constraint if it exists
do $$
begin
  -- Remove old check constraint if exists
  alter table public.org_memberships drop constraint if exists org_memberships_role_check;
  
  -- Add new check constraint with Block 12900 roles
  alter table public.org_memberships add constraint org_memberships_role_check 
    check (role in ('owner', 'manager', 'staff', 'read_only'));
end $$;

-- Migrate existing roles to new system
-- admin -> manager, member -> staff, viewer -> read_only
do $$
begin
  update public.org_memberships 
  set role = case 
    when role = 'admin' then 'manager'
    when role = 'member' then 'staff'
    when role = 'viewer' then 'read_only'
    else role
  end
  where role in ('admin', 'member', 'viewer');
end $$;

-- Ensure owner role exists for org owners
do $$
begin
  insert into public.org_memberships (org_id, user_id, role, status)
  select o.id, o.owner_id, 'owner', 'active'
  from public.organizations o
  where not exists (
    select 1 from public.org_memberships m
    where m.org_id = o.id and m.user_id = o.owner_id
  )
  on conflict (org_id, user_id) do nothing;
end $$;

-- ============================================================================
-- 3. PERMISSION CHECK FUNCTIONS
-- ============================================================================

-- Get user's role in an org
create or replace function public.get_user_org_role(
  p_org_id uuid,
  p_user_id uuid default auth.uid()
)
returns text
language sql stable security definer as $$
  select role from public.org_memberships
  where org_id = p_org_id 
    and user_id = p_user_id 
    and status = 'active'
  limit 1;
$$;

-- Central permission check function
create or replace function public.check_permission(
  p_org_id uuid,
  p_user_id uuid default auth.uid(),
  p_action text
)
returns boolean
language plpgsql stable security definer as $$
declare
  v_role text;
begin
  -- Get user's role
  select role into v_role
  from public.org_memberships
  where org_id = p_org_id 
    and user_id = p_user_id 
    and status = 'active'
  limit 1;

  if v_role is null then
    return false;
  end if;

  -- Owner has all permissions
  if v_role = 'owner' then
    return true;
  end if;

  -- Permission matrix based on action
  case p_action
    -- Campaign permissions
    when 'campaign.create' then
      return v_role in ('owner', 'manager');
    when 'campaign.edit' then
      return v_role in ('owner', 'manager');
    when 'campaign.activate' then
      return v_role in ('owner', 'manager');
    when 'campaign.view' then
      return true; -- All roles can view
    
    -- Contact permissions
    when 'contacts.view' then
      return true; -- All roles can view
    when 'contacts.edit' then
      return v_role in ('owner', 'manager', 'staff');
    when 'contacts.import' then
      return v_role in ('owner', 'manager');
    when 'contacts.delete' then
      return v_role in ('owner', 'manager');
    
    -- Inbox permissions
    when 'inbox.view' then
      return true; -- All roles can view
    when 'inbox.reply' then
      return v_role in ('owner', 'manager', 'staff');
    when 'inbox.snooze' then
      return v_role in ('owner', 'manager', 'staff');
    when 'inbox.assign' then
      return v_role in ('owner', 'manager', 'staff');
    
    -- Pipeline permissions
    when 'pipeline.view' then
      return true; -- All roles can view
    when 'pipeline.update' then
      return v_role in ('owner', 'manager', 'staff');
    when 'pipeline.add_inspection' then
      return v_role in ('owner', 'manager', 'staff');
    when 'pipeline.add_estimate' then
      return v_role in ('owner', 'manager', 'staff');
    when 'pipeline.add_job_won' then
      return v_role in ('owner', 'manager', 'staff');
    
    -- Revenue permissions
    when 'revenue.view' then
      return v_role in ('owner', 'manager'); -- Staff and read_only cannot view
    
    -- Billing permissions
    when 'billing.view' then
      return v_role in ('owner', 'manager');
    when 'billing.manage' then
      return v_role = 'owner';
    when 'billing.change_plan' then
      return v_role = 'owner';
    
    -- Team management permissions
    when 'team.add_user' then
      return v_role in ('owner', 'manager');
    when 'team.remove_user' then
      return v_role in ('owner', 'manager');
    when 'team.change_role' then
      return v_role in ('owner', 'manager');
    
    -- Sending permissions
    when 'send_emails' then
      return v_role in ('owner', 'manager', 'staff');
    
    else
      return false;
  end case;
end;
$$;

-- Helper: Check if user is org member
create or replace function public.is_org_member(
  p_org_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql stable security definer as $$
  select exists(
    select 1 from public.org_memberships
    where org_id = p_org_id 
      and user_id = p_user_id 
      and status = 'active'
  );
$$;

-- Helper: Check if user is owner or manager
create or replace function public.is_org_admin(
  p_org_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql stable security definer as $$
  select exists(
    select 1 from public.org_memberships
    where org_id = p_org_id 
      and user_id = p_user_id 
      and role in ('owner', 'manager')
      and status = 'active'
  );
$$;

-- Grant execute permissions
grant execute on function public.get_user_org_role(uuid, uuid) to authenticated;
grant execute on function public.check_permission(uuid, uuid, text) to authenticated;
grant execute on function public.is_org_member(uuid, uuid) to authenticated;
grant execute on function public.is_org_admin(uuid, uuid) to authenticated;

-- ============================================================================
-- 4. UPDATE RLS POLICIES FOR ORG_MEMBERSHIPS
-- ============================================================================

alter table public.org_memberships enable row level security;

-- Members can read their own membership and see other members in their org
drop policy if exists "members_read_own_membership" on public.org_memberships;
create policy "members_read_own_membership" on public.org_memberships
  for select using (
    user_id = auth.uid() 
    or exists(
      select 1 from public.org_memberships m
      where m.org_id = org_memberships.org_id 
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
  );

-- Only owners/managers can manage memberships
drop policy if exists "owners_managers_manage_memberships" on public.org_memberships;
create policy "owners_managers_manage_memberships" on public.org_memberships
  for all using (
    exists(
      select 1 from public.org_memberships m
      where m.org_id = org_memberships.org_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'manager')
        and m.status = 'active'
    )
  )
  with check (
    exists(
      select 1 from public.org_memberships m
      where m.org_id = org_memberships.org_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'manager')
        and m.status = 'active'
    )
  );

-- ============================================================================
-- 5. UPDATE RLS POLICIES FOR CAMPAIGNS
-- ============================================================================

-- Ensure campaigns table has org_id
alter table public.campaigns add column if not exists org_id uuid references public.organizations(id) on delete set null;
create index if not exists idx_campaigns_org on public.campaigns(org_id);

alter table public.campaigns enable row level security;

-- View campaigns: all org members can view
drop policy if exists "campaigns_view_org_members" on public.campaigns;
create policy "campaigns_view_org_members" on public.campaigns
  for select using (
    org_id is null -- legacy solo campaigns
    or public.is_org_member(org_id)
  );

-- Create campaigns: owner and manager only
drop policy if exists "campaigns_create_admin" on public.campaigns;
create policy "campaigns_create_admin" on public.campaigns
  for insert with check (
    org_id is null -- legacy solo campaigns
    or public.check_permission(org_id, auth.uid(), 'campaign.create')
  );

-- Edit campaigns: owner and manager only
drop policy if exists "campaigns_edit_admin" on public.campaigns;
create policy "campaigns_edit_admin" on public.campaigns
  for update using (
    org_id is null -- legacy solo campaigns
    or public.check_permission(org_id, auth.uid(), 'campaign.edit')
  )
  with check (
    org_id is null
    or public.check_permission(org_id, auth.uid(), 'campaign.edit')
  );

-- Delete campaigns: owner only
drop policy if exists "campaigns_delete_owner" on public.campaigns;
create policy "campaigns_delete_owner" on public.campaigns
  for delete using (
    org_id is null -- legacy solo campaigns
    or public.check_permission(org_id, auth.uid(), 'billing.manage')
  );

-- ============================================================================
-- 6. UPDATE RLS POLICIES FOR CONTACTS (if table exists)
-- ============================================================================

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'contacts') then
    -- Ensure contacts has org_id
    alter table public.contacts add column if not exists org_id uuid references public.organizations(id) on delete set null;
    create index if not exists idx_contacts_org on public.contacts(org_id);
    
    alter table public.contacts enable row level security;
    
    -- View contacts: all org members
    drop policy if exists "contacts_view_org_members" on public.contacts;
    execute 'create policy "contacts_view_org_members" on public.contacts
      for select using (
        org_id is null or public.is_org_member(org_id)
      )';
    
    -- Edit contacts: owner, manager, staff
    drop policy if exists "contacts_edit_staff" on public.contacts;
    execute 'create policy "contacts_edit_staff" on public.contacts
      for update using (
        org_id is null or public.check_permission(org_id, auth.uid(), ''contacts.edit'')
      )
      with check (
        org_id is null or public.check_permission(org_id, auth.uid(), ''contacts.edit'')
      )';
    
    -- Import/delete contacts: owner, manager only
    drop policy if exists "contacts_import_admin" on public.contacts;
    execute 'create policy "contacts_import_admin" on public.contacts
      for insert with check (
        org_id is null or public.check_permission(org_id, auth.uid(), ''contacts.import'')
      )';
    
    drop policy if exists "contacts_delete_admin" on public.contacts;
    execute 'create policy "contacts_delete_admin" on public.contacts
      for delete using (
        org_id is null or public.check_permission(org_id, auth.uid(), ''contacts.delete'')
      )';
  end if;
end $$;

-- ============================================================================
-- 7. UPDATE RLS POLICIES FOR PIPELINE/LEADS (if table exists)
-- ============================================================================

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'leads') then
    alter table public.leads add column if not exists org_id uuid references public.organizations(id) on delete set null;
    create index if not exists idx_leads_org on public.leads(org_id);
    
    alter table public.leads enable row level security;
    
    -- View leads: all org members
    drop policy if exists "leads_view_org_members" on public.leads;
    execute 'create policy "leads_view_org_members" on public.leads
      for select using (
        org_id is null or public.is_org_member(org_id)
      )';
    
    -- Update leads: owner, manager, staff
    drop policy if exists "leads_update_staff" on public.leads;
    execute 'create policy "leads_update_staff" on public.leads
      for update using (
        org_id is null or public.check_permission(org_id, auth.uid(), ''pipeline.update'')
      )
      with check (
        org_id is null or public.check_permission(org_id, auth.uid(), ''pipeline.update'')
      )';
  end if;
end $$;

-- ============================================================================
-- 8. UPDATE RLS POLICIES FOR INBOX (if tables exist)
-- ============================================================================

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'inbox_threads') then
    alter table public.inbox_threads add column if not exists org_id uuid references public.organizations(id) on delete set null;
    create index if not exists idx_inbox_threads_org on public.inbox_threads(org_id);
    
    alter table public.inbox_threads enable row level security;
    
    -- View inbox: all org members
    drop policy if exists "inbox_view_org_members" on public.inbox_threads;
    execute 'create policy "inbox_view_org_members" on public.inbox_threads
      for select using (
        org_id is null or public.is_org_member(org_id)
      )';
    
    -- Reply/snooze/assign: owner, manager, staff
    drop policy if exists "inbox_reply_staff" on public.inbox_threads;
    execute 'create policy "inbox_reply_staff" on public.inbox_threads
      for update using (
        org_id is null or public.check_permission(org_id, auth.uid(), ''inbox.reply'')
      )
      with check (
        org_id is null or public.check_permission(org_id, auth.uid(), ''inbox.reply'')
      )';
  end if;
end $$;

-- ============================================================================
-- 9. COMMENTS
-- ============================================================================

comment on table public.org_memberships is 'Organization memberships with Block 12900 roles: owner, manager, staff, read_only';
comment on function public.check_permission(uuid, uuid, text) is 'Central permission check function for Block 12900 role-based access control';
comment on function public.get_user_org_role(uuid, uuid) is 'Get user role in organization';
comment on function public.is_org_member(uuid, uuid) is 'Check if user is active member of organization';
comment on function public.is_org_admin(uuid, uuid) is 'Check if user is owner or manager of organization';




























































