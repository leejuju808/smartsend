-- Contacts & Suppressions with RLS, constraints, and email normalization
-- Run this in Supabase SQL editor

-- 1) Contacts table
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id),
  email text not null,
  first_name text,
  last_name text,
  company text,
  custom jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Normalize email to lowercase + trimmed
create or replace function public.normalize_email(txt text)
returns text language sql immutable as $$
  select case
    when txt is null then null
    else lower(trim(txt))
  end
$$;

-- Keep email normalized on insert/update
create or replace function public.contacts_email_normalize_trg()
returns trigger language plpgsql as $$
begin
  new.email := public.normalize_email(new.email);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_contacts_email_norm on public.contacts;
create trigger trg_contacts_email_norm
before insert or update on public.contacts
for each row execute function public.contacts_email_normalize_trg();

-- Each owner can only have a contact once per email
create unique index if not exists contacts_owner_email_uniq
on public.contacts (owner_user_id, email);

-- 2) Suppressions table
create table if not exists public.suppressions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id),
  email text not null,
  reason text check (reason in ('bounced','complaint','unsubscribed','manual')),
  source text check (source in ('system','provider','user')),
  created_at timestamptz default now()
);

-- Normalize email on suppressions too
create or replace function public.suppressions_email_normalize_trg()
returns trigger language plpgsql as $$
begin
  new.email := public.normalize_email(new.email);
  return new;
end;
$$;

drop trigger if exists trg_suppressions_email_norm on public.suppressions;
create trigger trg_suppressions_email_norm
before insert or update on public.suppressions
for each row execute function public.suppressions_email_normalize_trg();

-- One suppression per owner/email
create unique index if not exists suppressions_owner_email_uniq
on public.suppressions (owner_user_id, email);

-- 3) RLS
alter table public.contacts enable row level security;
alter table public.suppressions enable row level security;

drop policy if exists "contacts_select_own" on public.contacts;
create policy "contacts_select_own"
on public.contacts for select
to authenticated
using (owner_user_id = auth.uid());

drop policy if exists "contacts_ins_own" on public.contacts;
create policy "contacts_ins_own"
on public.contacts for insert
to authenticated
with check (owner_user_id = auth.uid());

drop policy if exists "contacts_upd_own" on public.contacts;
create policy "contacts_upd_own"
on public.contacts for update
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

drop policy if exists "contacts_del_own" on public.contacts;
create policy "contacts_del_own"
on public.contacts for delete
to authenticated
using (owner_user_id = auth.uid());

drop policy if exists "suppressions_select_own" on public.suppressions;
create policy "suppressions_select_own"
on public.suppressions for select
to authenticated
using (owner_user_id = auth.uid());

drop policy if exists "suppressions_ins_own" on public.suppressions;
create policy "suppressions_ins_own"
on public.suppressions for insert
to authenticated
with check (owner_user_id = auth.uid());

drop policy if exists "suppressions_del_own" on public.suppressions;
create policy "suppressions_del_own"
on public.suppressions for delete
to authenticated
using (owner_user_id = auth.uid());

-- 4) Helpful indices
create index if not exists contacts_owner_updated_idx on public.contacts (owner_user_id, updated_at desc);
create index if not exists suppressions_owner_created_idx on public.suppressions (owner_user_id, created_at desc);
