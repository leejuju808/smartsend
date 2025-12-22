-- Contacts + Suppressions core schema for CSV import → dedupe → suppression
create extension if not exists "uuid-ossp";

create table if not exists public.contacts (
  id uuid primary key default uuid_generate_v4(),
  email text not null,
  email_norm text generated always as (lower(trim(email))) stored,
  first_name text,
  last_name text,
  company text,
  title text,
  phone text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep email_norm unique for dedupe
create unique index if not exists contacts_email_norm_key on public.contacts(email_norm);

-- Fast lookups
create index if not exists idx_contacts_company on public.contacts(company);
create index if not exists idx_contacts_created_at on public.contacts(created_at desc);

-- simple trigger to bump updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_contacts_updated_at on public.contacts;
create trigger trg_contacts_updated_at
before update on public.contacts
for each row execute function public.set_updated_at();

-- Suppression list
create table if not exists public.suppressions (
  id uuid primary key default uuid_generate_v4(),
  email text not null,
  email_norm text generated always as (lower(trim(email))) stored,
  reason text,
  created_at timestamptz not null default now()
);

create unique index if not exists suppressions_email_norm_key on public.suppressions(email_norm);

-- OPTIONAL: RLS scaffolding (enable when you add workspace/user ownership)
-- alter table public.contacts enable row level security;
-- alter table public.suppressions enable row level security;
-- create policy "read-all-dev" on public.contacts for select to authenticated using (true);
-- create policy "read-all-dev-supp" on public.suppressions for select to authenticated using (true);
