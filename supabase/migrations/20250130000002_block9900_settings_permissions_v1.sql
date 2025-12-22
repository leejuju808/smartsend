-- =========================================================
-- Block 9900 — Settings & Permissions v1
-- (Account Settings, User Roles, Team Access, and Basic Permissions)
-- =========================================================

-- A) Users Table (Team Members)
-- Links team members to billing_accounts (one account can have multiple users)
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.billing_accounts(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  email text not null,
  name text,
  role text not null default 'owner' check (role in ('owner', 'manager', 'viewer')),
  invited_by uuid references public.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  -- Ensure email is unique per account
  unique(account_id, email)
);

create index if not exists idx_users_account_id on public.users(account_id);
create index if not exists idx_users_auth_user_id on public.users(auth_user_id);
create index if not exists idx_users_email on public.users(email);
create index if not exists idx_users_role on public.users(role);

-- Link users to auth.users via auth_user_id (set when user accepts invite)
comment on table public.users is 'Team members linked to billing accounts. Each user belongs to one account. auth_user_id links to auth.users when user accepts invite.';

-- B) User Invites Table
-- For email invites before user accepts
create table if not exists public.user_invites (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.billing_accounts(id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner', 'manager', 'viewer')),
  token text not null unique,
  accepted boolean not null default false,
  created_at timestamptz default now(),
  expires_at timestamptz not null,
  invited_by uuid references public.users(id),
  -- Ensure one pending invite per email per account
  unique(account_id, email, accepted) where accepted = false
);

create index if not exists idx_user_invites_account_id on public.user_invites(account_id);
create index if not exists idx_user_invites_token on public.user_invites(token);
create index if not exists idx_user_invites_email on public.user_invites(email);
create index if not exists idx_user_invites_accepted on public.user_invites(accepted, expires_at);

comment on table public.user_invites is 'Pending invitations for team members. Tokens expire after expires_at.';

-- C) Add permission settings to billing_accounts.meta
-- Ensure meta column exists and has default
alter table public.billing_accounts
  add column if not exists meta jsonb default '{}'::jsonb;

-- Initialize default permission settings in meta if not present
-- This will be done via a function that can be called on existing accounts
create or replace function public.init_account_permissions()
returns void
language plpgsql
as $$
begin
  -- Update all billing_accounts that don't have permission settings
  update public.billing_accounts
  set meta = jsonb_set(
    coalesce(meta, '{}'::jsonb),
    '{permissions}',
    jsonb_build_object(
      'manager_can_send', false,
      'viewer_can_update_pipeline', true,
      'viewer_can_see_revenue_dashboard', false
    )
  )
  where meta->'permissions' is null;
end;
$$;

-- Run initialization
select public.init_account_permissions();

-- D) Create owner user for existing billing_accounts
-- Backfill: Create a user record for each billing_account owner
insert into public.users (account_id, auth_user_id, email, name, role, created_at)
select 
  ba.id as account_id,
  au.id as auth_user_id,
  au.email,
  p.full_name as name,
  'owner' as role,
  ba.created_at
from public.billing_accounts ba
join auth.users au on ba.user_id = au.id
left join public.profiles p on au.id = p.id
where not exists (
  select 1 from public.users u where u.account_id = ba.id and u.email = au.email
)
on conflict (account_id, email) do nothing;

-- E) Row Level Security Policies
alter table public.users enable row level security;
alter table public.user_invites enable row level security;

-- Users: Can read users in their account
drop policy if exists "users_select_account" on public.users;
create policy "users_select_account" on public.users
  for select
  using (
    -- User is a member of this account
    account_id in (
      select u.account_id from public.users u where u.auth_user_id = auth.uid()
      union
      -- User is the owner of this account
      select ba.id from public.billing_accounts ba where ba.user_id = auth.uid()
    )
  );

-- Users: Only owners can insert/update/delete
drop policy if exists "users_modify_owner" on public.users;
create policy "users_modify_owner" on public.users
  for all
  using (
    -- User is the account owner
    account_id in (
      select ba.id from public.billing_accounts ba where ba.user_id = auth.uid()
    )
    or
    -- User is an owner role member
    exists (
      select 1 from public.users u
      where u.account_id = account_id
      and u.auth_user_id = auth.uid()
      and u.role = 'owner'
    )
  );

-- User invites: Can read invites for their account
drop policy if exists "user_invites_select_account" on public.user_invites;
create policy "user_invites_select_account" on public.user_invites
  for select
  using (
    account_id in (
      select u.account_id from public.users u where u.auth_user_id = auth.uid()
      union
      select ba.id from public.billing_accounts ba where ba.user_id = auth.uid()
    )
  );

-- User invites: Only owners can manage invites
drop policy if exists "user_invites_modify_owner" on public.user_invites;
create policy "user_invites_modify_owner" on public.user_invites
  for all
  using (
    -- User is the account owner
    account_id in (
      select ba.id from public.billing_accounts ba where ba.user_id = auth.uid()
    )
    or
    -- User is an owner role member
    exists (
      select 1 from public.users u
      where u.account_id = account_id
      and u.auth_user_id = auth.uid()
      and u.role = 'owner'
    )
  );

-- F) Helper function to get user's account_id and role by auth_user_id
create or replace function public.get_user_account_role(p_auth_user_id uuid)
returns table(account_id uuid, role text, user_id uuid)
language plpgsql
security definer
as $$
begin
  return query
  select u.account_id, u.role, u.id as user_id
  from public.users u
  where u.auth_user_id = p_auth_user_id
  limit 1;
end;
$$;

-- Helper function to get user's account_id and role by email
create or replace function public.get_user_account_role_by_email(p_user_email text)
returns table(account_id uuid, role text, user_id uuid)
language plpgsql
security definer
as $$
begin
  return query
  select u.account_id, u.role, u.id as user_id
  from public.users u
  where u.email = p_user_email
  limit 1;
end;
$$;

-- G) Helper function to check if user can perform action
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
  v_permissions jsonb;
  v_is_account_owner boolean;
begin
  -- Check if user is the account owner
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

  -- Get account permissions
  select meta->'permissions' into v_permissions
  from public.billing_accounts
  where id = p_account_id;

  -- Owner role can do everything (except account-level actions like billing)
  if v_user_role = 'owner' and p_action not in ('access_billing', 'delete_account') then
    return true;
  end if;

  -- Check action-specific permissions
  case p_action
    when 'send_campaign' then
      if v_user_role = 'manager' then
        return coalesce((v_permissions->>'manager_can_send')::boolean, false);
      end if;
      return false;
    
    when 'edit_template' then
      return v_user_role in ('owner', 'manager');
    
    when 'create_campaign' then
      return v_user_role in ('owner', 'manager');
    
    when 'update_pipeline' then
      if v_user_role = 'viewer' then
        return coalesce((v_permissions->>'viewer_can_update_pipeline')::boolean, true);
      end if;
      return true;
    
    when 'view_revenue_dashboard' then
      if v_user_role = 'viewer' then
        return coalesce((v_permissions->>'viewer_can_see_revenue_dashboard')::boolean, false);
      end if;
      return true;
    
    when 'access_billing' then
      return v_user_role = 'owner';
    
    when 'invite_users' then
      return v_user_role = 'owner';
    
    else
      return false;
  end case;
end;
$$;

-- Comments
comment on column public.users.account_id is 'Billing account this user belongs to';
comment on column public.users.role is 'User role: owner (full control), manager (can create/edit campaigns), viewer (read-only with optional pipeline updates)';
comment on column public.user_invites.token is 'Unique token for invite acceptance. Expires at expires_at';
comment on column public.user_invites.accepted is 'Whether the invite has been accepted and user created';

