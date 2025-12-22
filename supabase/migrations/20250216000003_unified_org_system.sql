-- Unified Organizations System with Invites and Multi-User Sharing
-- This migration works with existing 'organizations' and 'org_memberships' tables
-- Adds missing components and helper functions

-- Note: The system uses 'organizations' and 'org_memberships' tables
-- with a combined approach where invites are stored as pending memberships

-- ============================================================================
-- 1. ENSURE EXISTING TABLES EXIST (idempotent)
-- ============================================================================

-- Organizations table (uses organizations, not orgs, based on existing schema)
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

-- Org membership (uses org_memberships with pending/active pattern)
create table if not exists public.org_memberships (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  invited_email text,
  role text not null default 'member',
  status text not null default 'active', -- 'active' | 'pending' | 'accepted' | 'expired' | 'revoked'
  invited_token text,
  created_at timestamptz default now()
);

-- Add constraints if they don't exist
do $$
begin
  -- Add unique constraint for active memberships
  if not exists (
    select 1 from pg_constraint where conname = 'idx_org_memberships_active'
  ) then
    create unique index idx_org_memberships_active 
    on public.org_memberships(org_id, user_id) 
    where user_id is not null;
  end if;

  -- Add unique constraint for pending invites
  if not exists (
    select 1 from pg_constraint where conname = 'idx_org_memberships_pending_invite'
  ) then
    create unique index idx_org_memberships_pending_invite 
    on public.org_memberships(org_id, invited_email) 
    where user_id is null and status = 'pending';
  end if;
end $$;

-- ============================================================================
-- 2. INDEXES
-- ============================================================================

create index if not exists idx_org_memberships_org on public.org_memberships(org_id);
create index if not exists idx_org_memberships_user on public.org_memberships(user_id);
create index if not exists idx_org_memberships_token on public.org_memberships(invited_token) where invited_token is not null;
create index if not exists idx_org_memberships_status on public.org_memberships(status);
create index if not exists idx_org_memberships_email on public.org_memberships(invited_email) where invited_email is not null;

-- ============================================================================
-- 3. ROW LEVEL SECURITY
-- ============================================================================

alter table public.organizations enable row level security;
alter table public.org_memberships enable row level security;

-- Helper functions for RLS
create or replace function public.is_org_member(check_org uuid)
returns boolean language sql stable as $$
  select exists(
    select 1 from public.org_memberships
    where org_id = check_org and user_id = auth.uid() and status = 'active'
  );
$$;

-- Base policies for organizations
drop policy if exists "org_members_can_read_org" on public.organizations;
create policy "org_members_can_read_org" on public.organizations for select using (
  is_org_member(id) or owner_id = auth.uid()
);

-- Policies for org_memberships
drop policy if exists "members_read_own_membership" on public.org_memberships;
create policy "members_read_own_membership" on public.org_memberships for select using (
  user_id = auth.uid() or exists(
    select 1 from public.org_memberships m
    where m.org_id = org_memberships.org_id and m.user_id = auth.uid()
  )
);

drop policy if exists "owner_admin_manage_memberships" on public.org_memberships;
create policy "owner_admin_manage_memberships" on public.org_memberships for all using (
  exists(
    select 1 from public.org_memberships m
    where m.org_id = org_memberships.org_id
    and m.user_id = auth.uid()
    and m.role in ('owner','admin')
  )
) with check (
  exists(
    select 1 from public.org_memberships m
    where m.org_id = org_memberships.org_id
    and m.user_id = auth.uid()
    and m.role in ('owner','admin')
  )
);

-- ============================================================================
-- 4. RPC HELPER FUNCTIONS
-- ============================================================================

-- Current user's orgs
drop function if exists public.my_orgs();
create or replace function public.my_orgs()
returns table(id uuid, name text, role text) language sql stable as $$
  select o.id, o.name, m.role
  from public.organizations o join public.org_memberships m on m.org_id = o.id
  where m.user_id = auth.uid() and m.status = 'active'
  order by o.created_at desc;
$$;

grant execute on function public.my_orgs() to authenticated;

-- Ensure a default org on signup (call from backend once)
drop function if exists public.ensure_default_org();
create or replace function public.ensure_default_org()
returns uuid language plpgsql security definer as $$
declare oid uuid;
begin
  select o.id into oid from public.organizations o
  join public.org_memberships m on m.org_id = o.id
  where m.user_id = auth.uid() and m.status = 'active' limit 1;

  if oid is null then
    insert into public.organizations(name, owner_id) 
    values ('My Workspace', auth.uid()) returning id into oid;
    insert into public.org_memberships(org_id, user_id, role, status) 
    values (oid, auth.uid(), 'owner', 'active');
  end if;
  return oid;
end;
$$;

grant execute on function public.ensure_default_org() to authenticated;

-- Trigger to auto-add owner membership
create or replace function public.add_owner_membership()
returns trigger language plpgsql as $$
begin
  if not exists (
    select 1 from public.org_memberships 
    where org_id = new.id and user_id = new.owner_id
  ) then
    insert into public.org_memberships(org_id, user_id, role, status)
    values (new.id, new.owner_id, 'owner', 'active');
  end if;
  return new;
end $$;

drop trigger if exists trg_add_owner_membership on public.organizations;
create trigger trg_add_owner_membership
after insert on public.organizations
for each row execute function public.add_owner_membership();

-- ============================================================================
-- 5. BACKFILL EXISTING DATA (if needed)
-- ============================================================================

-- Create default orgs for existing users who don't have any
do $$
declare r record; v_org uuid;
begin
  for r in select distinct u.id as uid from auth.users u 
  where not exists (
    select 1 from public.org_memberships m 
    where m.user_id = u.id and m.status = 'active'
  ) 
  loop
    insert into public.organizations (name, owner_id) 
    values ('My Workspace', r.uid) returning id into v_org;
  end loop;
end $$;

-- ============================================================================
-- 6. COMMENTS
-- ============================================================================

comment on table public.organizations is 'Organizations (workspaces) with multi-user sharing';
comment on table public.org_memberships is 'Organization memberships with roles (pending invites and active members)';
comment on function public.my_orgs() is 'Returns current user''s organizations with their role';
comment on function public.ensure_default_org() is 'Creates default org for current user if none exists';
comment on function public.is_org_member(uuid) is 'Checks if current user is an active member of the org';
