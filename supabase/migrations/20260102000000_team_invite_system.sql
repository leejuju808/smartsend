-- Team Invite System for Organizations
-- Adds org_memberships and org_invites tables based on user's schema requirements
-- This complements the existing organizations and org_members tables

-- ============================================================================
-- 1. ENSURE ORGANIZATIONS AND ORG_MEMBERS EXIST
-- ============================================================================

-- Organizations table (created in earlier migrations)
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

-- ============================================================================
-- 2. CREATE ORG_MEMBERSHIPS TABLE (if not exists from unified migration)
-- ============================================================================

create table if not exists public.org_memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  user_id uuid not null,
  role text not null check (role in ('owner','manager','member')),
  invited_by uuid,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  
  foreign key (org_id) references public.organizations(id) on delete cascade,
  foreign key (user_id) references auth.users(id) on delete cascade,
  foreign key (invited_by) references auth.users(id) on delete set null
);

-- Unique index on org_id + user_id
create unique index if not exists uniq_org_user on public.org_memberships(org_id, user_id);

-- Additional indexes
create index if not exists idx_org_memberships_org on public.org_memberships(org_id);
create index if not exists idx_org_memberships_user on public.org_memberships(user_id);
create index if not exists idx_org_memberships_role on public.org_memberships(role);

-- ============================================================================
-- 3. CREATE ORG_INVITES TABLE
-- ============================================================================

create table if not exists public.org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  email text not null,
  role text not null check (role in ('manager','member')),
  token text not null unique,
  invited_by uuid not null,
  created_at timestamptz not null default now(),
  accepted boolean not null default false,
  
  foreign key (org_id) references public.organizations(id) on delete cascade,
  foreign key (invited_by) references auth.users(id) on delete set null
);

-- Indexes
create index if not exists idx_invite_org on public.org_invites(org_id);
create index if not exists idx_invite_token on public.org_invites(token);
create index if not exists idx_invite_email on public.org_invites(email);

-- ============================================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS
alter table public.org_memberships enable row level security;
alter table public.org_invites enable row level security;

-- Helper function for RLS
create or replace function public.is_org_owner_admin(check_org_id uuid)
returns boolean language sql stable as $$
  select exists(
    select 1 from public.org_memberships
    where org_id = check_org_id and user_id = auth.uid() and role in ('owner','manager')
  );
$$;

-- Members can read their own org memberships
drop policy if exists "members_read_own_membership" on public.org_memberships;
create policy "members_read_own_membership" on public.org_memberships
  for select using (
    user_id = auth.uid() or exists(
      select 1 from public.org_memberships m
      where m.org_id = org_memberships.org_id and m.user_id = auth.uid()
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
      and m.role in ('owner','manager')
    )
  )
  with check (
    exists(
      select 1 from public.org_memberships m
      where m.org_id = org_memberships.org_id
      and m.user_id = auth.uid()
      and m.role in ('owner','manager')
    )
  );

-- Members can read invites for their org
drop policy if exists "members_read_own_invites" on public.org_invites;
create policy "members_read_own_invites" on public.org_invites
  for select using (
    exists(
      select 1 from public.org_memberships m
      where m.org_id = org_invites.org_id and m.user_id = auth.uid()
    )
  );

-- Only owners/managers can manage invites
drop policy if exists "owners_managers_manage_invites" on public.org_invites;
create policy "owners_managers_manage_invites" on public.org_invites
  for all using (
    exists(
      select 1 from public.org_memberships m
      where m.org_id = org_invites.org_id
      and m.user_id = auth.uid()
      and m.role in ('owner','manager')
    )
  )
  with check (
    exists(
      select 1 from public.org_memberships m
      where m.org_id = org_invites.org_id
      and m.user_id = auth.uid()
      and m.role in ('owner','manager')
    )
  );

-- ============================================================================
-- 5. MIGRATION: Convert existing org_members to org_memberships
-- ============================================================================

-- If org_members table exists, migrate data to org_memberships
do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'org_members') then
    insert into public.org_memberships (org_id, user_id, role, created_at)
    select org_id, user_id, role, coalesce(created_at, now())
    from public.org_members
    on conflict (org_id, user_id) do nothing;
  end if;
end $$;

-- ============================================================================
-- 6. COMMENTS
-- ============================================================================

comment on table public.org_memberships is 'Organization memberships with roles';
comment on table public.org_invites is 'Pending organization invitations';
comment on function public.is_org_owner_admin(uuid) is 'Check if current user is owner or manager of org';

