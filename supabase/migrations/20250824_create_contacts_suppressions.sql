-- Extensions
create extension if not exists citext;

-- CONTACTS
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  email_lower citext generated always as (email::citext) stored,
  name text,
  company text,
  tags text[] not null default '{}',
  custom jsonb,
  unsubscribed boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists uniq_contacts_user_email_lower
  on public.contacts (user_id, email_lower);

create index if not exists idx_contacts_user_created
  on public.contacts (user_id, created_at desc);

alter table public.contacts enable row level security;

create policy if not exists "contacts_select_own"
on public.contacts for select
using (auth.uid() = user_id);

create policy if not exists "contacts_insert_own"
on public.contacts for insert
with check (auth.uid() = user_id);

create policy if not exists "contacts_update_own"
on public.contacts for update
using (auth.uid() = user_id);

-- SUPPRESSIONS
create table if not exists public.suppressions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('email','domain')),
  value_lower citext not null, -- normalized email or domain
  reason text,
  created_at timestamptz not null default now()
);

create unique index if not exists uniq_suppressions_user_kind_value
  on public.suppressions (user_id, kind, value_lower);

alter table public.suppressions enable row level security;

create policy if not exists "suppressions_select_own"
on public.suppressions for select
using (auth.uid() = user_id);

create policy if not exists "suppressions_mutate_own"
on public.suppressions for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

