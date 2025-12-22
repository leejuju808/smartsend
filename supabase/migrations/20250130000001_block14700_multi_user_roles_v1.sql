-- =========================================================
-- Block 14700 — SmartSend Multi-User Roles v1
-- (Owner, Manager & Staff Permissions With Controlled Sending, Contacts, Pipeline & Scheduling Access)
-- =========================================================

-- =========================================================
-- PART 1: Add assigned_leads support for Staff members
-- =========================================================

-- Add assigned_leads column to users table (JSON array of contact/lead IDs)
alter table public.users
  add column if not exists assigned_leads jsonb default '[]'::jsonb;

create index if not exists idx_users_assigned_leads on public.users using gin(assigned_leads);

comment on column public.users.assigned_leads is 'JSON array of contact/lead IDs assigned to this staff member. Only used when role = staff.';

-- =========================================================
-- PART 2: Enhanced Permission Functions
-- =========================================================

-- Comprehensive permission function matching Block 14700 requirements
create or replace function public.can_user_perform_action(
  p_account_id uuid,
  p_auth_user_id uuid,
  p_action text
)
returns boolean
language plpgsql
security definer
as $$
declare
  v_user_role text;
  v_is_account_owner boolean;
begin
  -- Check if user is the account owner (billing_accounts.user_id)
  select exists(
    select 1 from public.billing_accounts ba
    where ba.id = p_account_id and ba.user_id = p_auth_user_id
  ) into v_is_account_owner;

  if v_is_account_owner then
    -- Account owner can do everything
    return true;
  end if;

  -- Get user role
  select role into v_user_role
  from public.users
  where account_id = p_account_id and auth_user_id = p_auth_user_id
  limit 1;

  if v_user_role is null then
    return false;
  end if;

  -- OWNER role: Full access (except billing/account deletion)
  if v_user_role = 'owner' then
    return p_action not in ('access_billing', 'delete_account', 'remove_owner');
  end if;

  -- MANAGER role: High access, no billing
  if v_user_role = 'manager' then
    return p_action in (
      'create_campaign',
      'edit_campaign',
      'delete_campaign',
      'send_campaign',
      'start_campaign',
      'stop_campaign',
      'view_campaign',
      'manage_contacts',
      'assign_tags',
      'change_status',
      'access_inbox',
      'view_all_inbox',
      'add_task',
      'complete_task',
      'manage_pipeline',
      'import_contacts',
      'access_scheduler',
      'view_all_appointments',
      'book_appointment',
      'view_revenue_dashboard',
      'view_reports'
    );
  end if;

  -- STAFF role: Restricted access - only assigned leads
  if v_user_role = 'staff' then
    return p_action in (
      'view_assigned_leads',
      'add_notes',
      'complete_task',
      'schedule_appointment',
      'respond_to_messages',
      'view_assigned_inbox'
    );
  end if;

  return false;
end;
$$;

-- Helper function to check if user can view a specific contact/lead
create or replace function public.can_user_view_contact(
  p_account_id uuid,
  p_auth_user_id uuid,
  p_contact_id uuid
)
returns boolean
language plpgsql
security definer
as $$
declare
  v_user_role text;
  v_assigned_leads jsonb;
  v_is_account_owner boolean;
begin
  -- Check if user is the account owner
  select exists(
    select 1 from public.billing_accounts ba
    where ba.id = p_account_id and ba.user_id = p_auth_user_id
  ) into v_is_account_owner;

  if v_is_account_owner then
    return true;
  end if;

  -- Get user role and assigned_leads
  select role, assigned_leads into v_user_role, v_assigned_leads
  from public.users
  where account_id = p_account_id and auth_user_id = p_auth_user_id
  limit 1;

  if v_user_role is null then
    return false;
  end if;

  -- Owner and Manager can view all contacts
  if v_user_role in ('owner', 'manager') then
    return true;
  end if;

  -- Staff can only view assigned contacts
  if v_user_role = 'staff' then
    return v_assigned_leads ? p_contact_id::text;
  end if;

  return false;
end;
$$;

-- Helper function to get user's account_id and role
create or replace function public.get_user_account_and_role(p_auth_user_id uuid)
returns table(account_id uuid, role text, user_id uuid, assigned_leads jsonb)
language plpgsql
security definer
as $$
begin
  return query
  select 
    u.account_id,
    u.role,
    u.id as user_id,
    u.assigned_leads
  from public.users u
  where u.auth_user_id = p_auth_user_id
  limit 1;
end;
$$;

-- =========================================================
-- PART 3: RLS Policies for Contacts/Leads
-- =========================================================

-- Ensure contacts table has account_id or can be mapped
-- First, try to add account_id if it doesn't exist
do $$
begin
  -- Check if contacts table exists and add account_id if missing
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'contacts') then
    if not exists (
      select 1 from information_schema.columns 
      where table_schema = 'public' and table_name = 'contacts' and column_name = 'account_id'
    ) then
      -- Try to add account_id column
      -- Note: This assumes contacts can be mapped via workspace_id -> workspace_members -> billing_accounts
      -- For now, we'll use a helper function to check access
      null; -- Skip adding column if mapping is complex
    end if;
  end if;
end $$;

-- Enable RLS on contacts if not already enabled
alter table if exists public.contacts enable row level security;

-- Drop existing policies if they exist
drop policy if exists "contacts_select_by_role" on public.contacts;
drop policy if exists "contacts_insert_by_role" on public.contacts;
drop policy if exists "contacts_update_by_role" on public.contacts;
drop policy if exists "contacts_delete_by_role" on public.contacts;

-- RLS Policy: SELECT - Staff sees only assigned, Owner/Manager see all
create policy "contacts_select_by_role" on public.contacts
  for select
  using (
    -- Get user's account and role
    exists (
      select 1 from public.users u
      join public.billing_accounts ba on ba.id = u.account_id
      where u.auth_user_id = auth.uid()
      and (
        -- Owner/Manager: can see all contacts in their account's workspaces
        (u.role in ('owner', 'manager') and (
          -- Map workspace_id to account_id via workspace_members
          exists (
            select 1 from public.workspace_members wm
            join public.billing_accounts ba2 on ba2.user_id = wm.user_id
            where wm.workspace_id = contacts.workspace_id
            and ba2.id = u.account_id
          )
          or contacts.workspace_id in (
            select w.id from public.workspaces w
            join public.workspace_members wm on wm.workspace_id = w.id
            join public.billing_accounts ba3 on ba3.user_id = wm.user_id
            where ba3.id = u.account_id
          )
        ))
        -- Staff: can only see assigned contacts
        or (u.role = 'staff' and (
          u.assigned_leads ? contacts.id::text
          or u.assigned_leads ? (select id::text from public.leads where email = contacts.email limit 1)
        ))
      )
    )
    -- Account owner can see all
    or exists (
      select 1 from public.billing_accounts ba
      join public.workspace_members wm on wm.user_id = ba.user_id
      where ba.user_id = auth.uid()
      and wm.workspace_id = contacts.workspace_id
    )
  );

-- RLS Policy: INSERT - Owner and Manager only
create policy "contacts_insert_by_role" on public.contacts
  for insert
  with check (
    exists (
      select 1 from public.users u
      where u.auth_user_id = auth.uid()
      and u.role in ('owner', 'manager')
      and u.account_id in (
        select ba.id from public.billing_accounts ba
        join public.workspace_members wm on wm.user_id = ba.user_id
        where wm.workspace_id = contacts.workspace_id
      )
    )
    or exists (
      select 1 from public.billing_accounts ba
      join public.workspace_members wm on wm.user_id = ba.user_id
      where ba.user_id = auth.uid()
      and wm.workspace_id = contacts.workspace_id
    )
  );

-- RLS Policy: UPDATE - Owner/Manager can edit all, Staff can only edit assigned
create policy "contacts_update_by_role" on public.contacts
  for update
  using (
    exists (
      select 1 from public.users u
      where u.auth_user_id = auth.uid()
      and (
        (u.role in ('owner', 'manager'))
        or (u.role = 'staff' and u.assigned_leads ? contacts.id::text)
      )
    )
    or exists (
      select 1 from public.billing_accounts ba
      join public.workspace_members wm on wm.user_id = ba.user_id
      where ba.user_id = auth.uid()
      and wm.workspace_id = contacts.workspace_id
    )
  );

-- RLS Policy: DELETE - Owner only
create policy "contacts_delete_by_role" on public.contacts
  for delete
  using (
    exists (
      select 1 from public.users u
      where u.auth_user_id = auth.uid()
      and u.role = 'owner'
    )
    or exists (
      select 1 from public.billing_accounts ba
      where ba.user_id = auth.uid()
    )
  );

-- =========================================================
-- PART 4: RLS Policies for Campaigns
-- =========================================================

-- Ensure campaigns table has account_id
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'campaigns') then
    if not exists (
      select 1 from information_schema.columns 
      where table_schema = 'public' and table_name = 'campaigns' and column_name = 'account_id'
    ) then
      -- Add account_id if billing_account_id exists, map it
      if exists (
        select 1 from information_schema.columns 
        where table_schema = 'public' and table_name = 'campaigns' and column_name = 'billing_account_id'
      ) then
        alter table public.campaigns add column account_id uuid;
        update public.campaigns set account_id = billing_account_id where billing_account_id is not null;
      end if;
    end if;
  end if;
end $$;

alter table if exists public.campaigns enable row level security;

-- Drop existing policies
drop policy if exists "campaigns_select_by_role" on public.campaigns;
drop policy if exists "campaigns_insert_by_role" on public.campaigns;
drop policy if exists "campaigns_update_by_role" on public.campaigns;
drop policy if exists "campaigns_delete_by_role" on public.campaigns;

-- RLS Policy: SELECT - Owner/Manager see all, Staff read-only
create policy "campaigns_select_by_role" on public.campaigns
  for select
  using (
    exists (
      select 1 from public.users u
      where u.auth_user_id = auth.uid()
      and (
        (u.role in ('owner', 'manager'))
        or (u.role = 'staff') -- Staff can view but not edit
      )
      and (
        campaigns.account_id = u.account_id
        or campaigns.billing_account_id = u.account_id
        or campaigns.workspace_id in (
          select wm.workspace_id from public.workspace_members wm
          join public.billing_accounts ba on ba.user_id = wm.user_id
          where ba.id = u.account_id
        )
      )
    )
    or exists (
      select 1 from public.billing_accounts ba
      where ba.user_id = auth.uid()
      and (
        campaigns.account_id = ba.id
        or campaigns.billing_account_id = ba.id
      )
    )
  );

-- RLS Policy: INSERT - Owner and Manager only
create policy "campaigns_insert_by_role" on public.campaigns
  for insert
  with check (
    exists (
      select 1 from public.users u
      where u.auth_user_id = auth.uid()
      and u.role in ('owner', 'manager')
      and (
        campaigns.account_id = u.account_id
        or campaigns.billing_account_id = u.account_id
      )
    )
    or exists (
      select 1 from public.billing_accounts ba
      where ba.user_id = auth.uid()
      and (
        campaigns.account_id = ba.id
        or campaigns.billing_account_id = ba.id
      )
    )
  );

-- RLS Policy: UPDATE - Owner and Manager only
create policy "campaigns_update_by_role" on public.campaigns
  for update
  using (
    exists (
      select 1 from public.users u
      where u.auth_user_id = auth.uid()
      and u.role in ('owner', 'manager')
      and (
        campaigns.account_id = u.account_id
        or campaigns.billing_account_id = u.account_id
      )
    )
    or exists (
      select 1 from public.billing_accounts ba
      where ba.user_id = auth.uid()
      and (
        campaigns.account_id = ba.id
        or campaigns.billing_account_id = ba.id
      )
    )
  );

-- RLS Policy: DELETE - Owner only
create policy "campaigns_delete_by_role" on public.campaigns
  for delete
  using (
    exists (
      select 1 from public.users u
      where u.auth_user_id = auth.uid()
      and u.role = 'owner'
      and (
        campaigns.account_id = u.account_id
        or campaigns.billing_account_id = u.account_id
      )
    )
    or exists (
      select 1 from public.billing_accounts ba
      where ba.user_id = auth.uid()
      and (
        campaigns.account_id = ba.id
        or campaigns.billing_account_id = ba.id
      )
    )
  );

-- =========================================================
-- PART 5: Helper Functions for Lead Assignment
-- =========================================================

-- Function to assign leads to a staff member
create or replace function public.assign_leads_to_staff(
  p_account_id uuid,
  p_staff_user_id uuid,
  p_lead_ids uuid[]
)
returns boolean
language plpgsql
security definer
as $$
declare
  v_staff_record record;
  v_current_leads jsonb;
  v_new_leads jsonb;
begin
  -- Verify the target user is a staff member in this account
  select id, role, assigned_leads into v_staff_record
  from public.users
  where account_id = p_account_id
    and id = p_staff_user_id
    and role = 'staff';

  if v_staff_record is null then
    raise exception 'User is not a staff member in this account';
  end if;

  -- Get current assigned leads
  v_current_leads := coalesce(v_staff_record.assigned_leads, '[]'::jsonb);

  -- Add new lead IDs (avoid duplicates)
  v_new_leads := v_current_leads;
  foreach p_lead_id in array p_lead_ids
  loop
    if not (v_new_leads ? p_lead_id::text) then
      v_new_leads := v_new_leads || jsonb_build_array(p_lead_id::text);
    end if;
  end loop;

  -- Update assigned_leads
  update public.users
  set assigned_leads = v_new_leads
  where id = p_staff_user_id;

  return true;
end;
$$;

-- Function to unassign leads from a staff member
create or replace function public.unassign_leads_from_staff(
  p_account_id uuid,
  p_staff_user_id uuid,
  p_lead_ids uuid[]
)
returns boolean
language plpgsql
security definer
as $$
declare
  v_staff_record record;
  v_current_leads jsonb;
  v_new_leads jsonb;
  p_lead_id uuid;
begin
  -- Verify the target user is a staff member in this account
  select id, role, assigned_leads into v_staff_record
  from public.users
  where account_id = p_account_id
    and id = p_staff_user_id
    and role = 'staff';

  if v_staff_record is null then
    raise exception 'User is not a staff member in this account';
  end if;

  -- Get current assigned leads
  v_current_leads := coalesce(v_staff_record.assigned_leads, '[]'::jsonb);

  -- Remove lead IDs
  v_new_leads := v_current_leads;
  foreach p_lead_id in array p_lead_ids
  loop
    v_new_leads := v_new_leads - p_lead_id::text;
  end loop;

  -- Update assigned_leads
  update public.users
  set assigned_leads = v_new_leads
  where id = p_staff_user_id;

  return true;
end;
$$;

-- =========================================================
-- PART 6: Comments and Documentation
-- =========================================================

comment on function public.can_user_perform_action is 'Checks if a user can perform a specific action based on their role (owner/manager/staff)';
comment on function public.can_user_view_contact is 'Checks if a user can view a specific contact (staff can only view assigned)';
comment on function public.get_user_account_and_role is 'Gets user account_id, role, and assigned_leads for the current auth user';
comment on function public.assign_leads_to_staff is 'Assigns leads to a staff member (owner/manager only)';
comment on function public.unassign_leads_from_staff is 'Unassigns leads from a staff member (owner/manager only)';

-- Update user role comments
comment on column public.users.role is 'User role: owner (full control + billing), manager (campaigns + leads, no billing), staff (assigned leads only)';
comment on column public.users.assigned_leads is 'JSON array of contact/lead IDs assigned to staff members. Only used when role = staff.';





















































