create table if not exists public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.org_members (
  org_id uuid not null references public.orgs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create table if not exists public.org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  email text not null,
  token text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz
);

alter table public.profiles
  add column if not exists org_id uuid references public.orgs (id);

create index if not exists idx_org_members_org on public.org_members (org_id);
create index if not exists idx_org_members_user on public.org_members (user_id);
create index if not exists idx_org_invites_org on public.org_invites (org_id);

comment on table public.orgs is 'Teams/organizations';
comment on table public.org_members is 'Memberships for teams';
comment on table public.org_invites is 'Pending invitations to join teams';
