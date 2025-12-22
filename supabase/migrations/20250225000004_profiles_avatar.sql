-- Ensure profiles table has avatar_url column
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email citext,
  avatar_url text,
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles
for select using (true) -- public-readable names/emails inside the app
, for update using (id = auth.uid())
with check (id = auth.uid());

create index if not exists idx_profiles_email on public.profiles(email);

-- Add avatar_url if it doesn't exist
alter table public.profiles add column if not exists avatar_url text;

