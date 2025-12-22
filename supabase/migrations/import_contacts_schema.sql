-- Contacts table (safe create) — adjust columns if you already have this table
create extension if not exists citext;

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  email citext not null,
  first_name text,
  last_name text,
  company text,
  created_at timestamptz default now()
);

create unique index if not exists uniq_contacts_profile_email
  on contacts(profile_id, email);

-- Suppressions table
create table if not exists suppressions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  email citext not null,
  reason text,
  created_at timestamptz default now()
);

create unique index if not exists uniq_suppressions_profile_email
  on suppressions(profile_id, email);

-- RLS
alter table contacts enable row level security;
alter table suppressions enable row level security;

-- Assuming profiles.id == auth.uid() (standard Supabase pattern)
-- Contacts RLS: owner can CRUD own rows
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'contacts' and policyname = 'contacts_select_own'
  ) then
    create policy "contacts_select_own" on contacts for select
      using (profile_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'contacts' and policyname = 'contacts_insert_own'
  ) then
    create policy "contacts_insert_own" on contacts for insert
      with check (profile_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'contacts' and policyname = 'contacts_update_own'
  ) then
    create policy "contacts_update_own" on contacts for update
      using (profile_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'contacts' and policyname = 'contacts_delete_own'
  ) then
    create policy "contacts_delete_own" on contacts for delete
      using (profile_id = auth.uid());
  end if;
end $$;

-- Suppressions RLS: owner can CRUD own rows
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'suppressions' and policyname = 'suppressions_select_own'
  ) then
    create policy "suppressions_select_own" on suppressions for select
      using (profile_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'suppressions' and policyname = 'suppressions_insert_own'
  ) then
    create policy "suppressions_insert_own" on suppressions for insert
      with check (profile_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'suppressions' and policyname = 'suppressions_update_own'
  ) then
    create policy "suppressions_update_own" on suppressions for update
      using (profile_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'suppressions' and policyname = 'suppressions_delete_own'
  ) then
    create policy "suppressions_delete_own" on suppressions for delete
      using (profile_id = auth.uid());
  end if;
end $$;
