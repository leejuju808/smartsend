-- =========================================================
-- Block 12100 — SmartSend User Roles & Multi-User Access v1
-- (Owner, Manager, Staff roles for roofing companies)
-- =========================================================

-- A) Update users table: Change 'viewer' role to 'staff'
-- First, update existing 'viewer' roles to 'staff'
update public.users
set role = 'staff'
where role = 'viewer';

-- Update the role constraint
alter table public.users
  drop constraint if exists users_role_check;

alter table public.users
  add constraint users_role_check check (role in ('owner', 'manager', 'staff'));

-- B) Update user_invites table: Change 'viewer' role to 'staff'
update public.user_invites
set role = 'staff'
where role = 'viewer';

-- Update the role constraint
alter table public.user_invites
  drop constraint if exists user_invites_role_check;

alter table public.user_invites
  add constraint user_invites_role_check check (role in ('owner', 'manager', 'staff'));

-- C) Update permission function to use 'staff' instead of 'viewer'
-- Simplified permissions for roofing companies
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

  -- Owner role: Full access (except billing/account deletion)
  if v_user_role = 'owner' then
    return p_action not in ('access_billing', 'delete_account', 'remove_owner');
  end if;

  -- Manager role: Can create/edit campaigns, manage leads, view dashboard
  if v_user_role = 'manager' then
    return p_action in (
      'create_campaign',
      'edit_campaign',
      'delete_campaign',
      'import_leads',
      'assign_tags',
      'view_inbox',
      'reply_to_leads',
      'manage_lead_statuses',
      'view_dashboard',
      'view_roi',
      'view_timeline',
      'view_activity_log',
      'edit_template',
      'view_templates'
    );
  end if;

  -- Staff role: Limited access - inbox, replies, lead status, timeline
  if v_user_role = 'staff' then
    return p_action in (
      'view_inbox',
      'reply_to_leads',
      'update_lead_status',
      'view_timeline',
      'view_assigned_lists',
      'view_hot_leads',
      'view_warm_leads',
      'view_follow_ups'
    );
  end if;

  return false;
end;
$$;

-- D) Add company name to billing_accounts for invite emails
alter table public.billing_accounts
  add column if not exists company_name text;

-- E) Update comments
comment on column public.users.role is 'User role: owner (full control + billing), manager (campaigns + leads), staff (inbox + replies only)';
comment on column public.user_invites.role is 'Invite role: owner, manager, or staff';

-- F) Helper function to check if user has permission for route
create or replace function public.has_permission(
  p_account_id uuid,
  p_auth_user_id uuid,
  p_permission text
)
returns boolean
language plpgsql
security definer
as $$
begin
  return public.can_user_perform_action(p_account_id, p_auth_user_id, p_permission);
end;
$$;

-- G) Ensure only one owner per account
create or replace function public.ensure_single_owner()
returns trigger
language plpgsql
as $$
begin
  -- If trying to set role to 'owner', ensure no other owner exists
  if new.role = 'owner' then
    if exists (
      select 1 from public.users
      where account_id = new.account_id
        and role = 'owner'
        and id != coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) then
      raise exception 'Only one owner allowed per account';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ensure_single_owner on public.users;
create trigger trg_ensure_single_owner
  before insert or update on public.users
  for each row
  execute function public.ensure_single_owner();

-- H) Update permission initialization to use 'staff' terminology
create or replace function public.init_account_permissions()
returns void
language plpgsql
as $$
begin
  -- Update all billing_accounts that don't have permission settings
  -- Note: Permissions are now simpler - managers can always create campaigns
  -- Staff permissions are hardcoded in can_user_perform_action
  update public.billing_accounts
  set meta = jsonb_set(
    coalesce(meta, '{}'::jsonb),
    '{permissions}',
    jsonb_build_object(
      'manager_can_send', true,  -- Managers can send campaigns by default
      'staff_can_update_pipeline', true  -- Staff can update lead status
    )
  )
  where meta->'permissions' is null;
end;
$$;

-- Run initialization for existing accounts
select public.init_account_permissions();





















































