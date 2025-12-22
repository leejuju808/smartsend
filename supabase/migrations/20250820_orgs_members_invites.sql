-- Organizations
create table if not exists public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  seat_limit int default 1,
  stripe_subscription_id text,
  created_at timestamptz default now()
);

-- Org memberships
create table if not exists public.org_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.orgs(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'member', -- owner|admin|member|viewer
  created_at timestamptz default now(),
  unique(org_id, user_id)
);

-- Extend profiles with org_id
alter table public.profiles
  add column if not exists org_id uuid references public.orgs(id);

-- Create indexes
create index if not exists idx_org_members_org on public.org_members (org_id);
create index if not exists idx_org_members_user on public.org_members (user_id);
create index if not exists idx_orgs_stripe_subscription on public.orgs (stripe_subscription_id);

comment on table public.orgs is 'Teams/organizations with seat limits';
comment on table public.org_members is 'Memberships for teams with roles';
