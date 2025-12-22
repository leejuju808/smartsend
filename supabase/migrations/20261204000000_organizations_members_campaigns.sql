-- Organizations, Members, and Campaign Linkage
-- Implements org-based multi-tenancy with role-based access control

-- ============================================
-- 1) Organizations table
-- ============================================
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============================================
-- 2) Org Members table
-- ============================================
create table if not exists public.org_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','member','viewer')),
  unique(org_id, user_id),
  created_at timestamptz not null default now()
);

create index if not exists idx_org_members_user on public.org_members(user_id);
create index if not exists idx_org_members_org on public.org_members(org_id);

-- ============================================
-- 3) Optional profile preference (current org)
-- ============================================
alter table public.profiles
  add column if not exists current_org_id uuid references public.organizations(id) on delete set null;

create index if not exists idx_profiles_current_org on public.profiles(current_org_id);

-- ============================================
-- 4) Link campaigns to an org (nullable for solo users)
-- ============================================
alter table public.campaigns
  add column if not exists org_id uuid references public.organizations(id) on delete set null;

create index if not exists idx_campaigns_org on public.campaigns(org_id);

-- ============================================
-- 5) Helper functions for org permissions
-- ============================================

-- Get a user's role in an org
create or replace function public.user_org_role(p_org uuid, p_user uuid default auth.uid())
returns text
language sql stable as $$
  select role from public.org_members
  where org_id = p_org and user_id = p_user
  limit 1
$$;

-- Can the user view campaigns in an org?
create or replace function public.can_view_org(p_org uuid, p_user uuid default auth.uid())
returns boolean language sql stable as $$
  select exists(select 1 from public.org_members where org_id = p_org and user_id = p_user);
$$;

-- Can the user edit campaigns in an org?
create or replace function public.can_edit_org(p_org uuid, p_user uuid default auth.uid())
returns boolean language sql stable as $$
  select exists(
    select 1 from public.org_members where org_id = p_org and user_id = p_user and role in ('admin','member')
  );
$$;

-- Update existing campaign helpers to include org membership
create or replace function public.can_view_campaign(p_campaign uuid, p_user uuid default auth.uid())
returns boolean language sql stable as $$
  select
    exists(select 1 from public.campaigns c where c.id = p_campaign and c.user_id = p_user)
    or exists(select 1 from public.campaign_shares s where s.campaign_id = p_campaign and s.user_id = p_user)
    or exists(
      select 1 from public.campaigns c
      join public.org_members m on m.org_id = c.org_id
      where c.id = p_campaign and m.user_id = p_user
    );
$$;

create or replace function public.can_edit_campaign(p_campaign uuid, p_user uuid default auth.uid())
returns boolean language sql stable as $$
  select
    exists(select 1 from public.campaigns c where c.id = p_campaign and c.user_id = p_user)
    or exists(select 1 from public.campaign_shares s where s.campaign_id = p_campaign and s.user_id = p_user and s.role='editor')
    or exists(
      select 1 from public.campaigns c
      join public.org_members m on m.org_id = c.org_id and m.role in ('admin','member')
      where c.id = p_campaign and m.user_id = p_user
    );
$$;

-- ============================================
-- 6) RLS Policies
-- ============================================

alter table public.organizations enable row level security;
alter table public.org_members enable row level security;

-- Orgs: visible to members
drop policy if exists "orgs.select.member" on public.organizations;
create policy "orgs.select.member"
on public.organizations for select using (public.can_view_org(id));

-- Create org: any authenticated user
drop policy if exists "orgs.insert.auth" on public.organizations;
create policy "orgs.insert.auth"
on public.organizations for insert to authenticated with check (true);

-- Update org: admins only
drop policy if exists "orgs.update.admin" on public.organizations;
create policy "orgs.update.admin"
on public.organizations for update using (public.can_edit_org(id)) with check (public.can_edit_org(id));

-- Members table: visible to org members
drop policy if exists "members.select.self_org" on public.org_members;
create policy "members.select.self_org"
on public.org_members for select using (public.can_view_org(org_id));

-- Add members: admins only
drop policy if exists "members.insert.admin" on public.org_members;
create policy "members.insert.admin"
on public.org_members for insert with check (
  exists(select 1 from public.org_members where org_id = org_members.org_id and user_id = auth.uid() and role='admin')
);

-- Update member roles: admins only
drop policy if exists "members.update.admin" on public.org_members;
create policy "members.update.admin"
on public.org_members for update using (
  exists(select 1 from public.org_members where org_id = org_members.org_id and user_id = auth.uid() and role='admin')
) with check (
  exists(select 1 from public.org_members where org_id = org_members.org_id and user_id = auth.uid() and role='admin')
);

-- Delete membership: admin or self-leave
drop policy if exists "members.delete.admin_or_self" on public.org_members;
create policy "members.delete.admin_or_self"
on public.org_members for delete using (
  exists(select 1 from public.org_members where org_id = org_members.org_id and user_id = auth.uid() and role='admin')
  or user_id = auth.uid()
);

-- Grant necessary permissions
grant select, insert, update, delete on public.organizations to authenticated;
grant select, insert, update, delete on public.org_members to authenticated;

