-- Contacts Table
create table if not exists public.contacts (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid references profiles(id) on delete cascade,
  email text not null,
  first_name text,
  last_name text,
  company text,
  imported_at timestamptz default now(),
  unique(profile_id, email)
);

-- Suppression List
create table if not exists public.suppressions (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid references profiles(id) on delete cascade,
  email text unique not null,
  reason text default 'user_suppressed',
  created_at timestamptz default now()
);

-- RLS Policies
alter table public.contacts enable row level security;
alter table public.suppressions enable row level security;

create policy "User can manage own contacts"
  on public.contacts
  for all
  using (auth.uid() = profile_id);

create policy "User can manage own suppressions"
  on public.suppressions
  for all
  using (auth.uid() = profile_id);
