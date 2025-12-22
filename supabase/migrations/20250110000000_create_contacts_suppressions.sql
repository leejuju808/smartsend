-- CONTACTS
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  normalized_email text not null unique,
  domain text not null,
  first_name text,
  last_name text,
  company text,
  title text,
  created_at timestamptz default now()
);

create index if not exists contacts_domain_idx on public.contacts (domain);
create unique index if not exists contacts_normalized_email_idx on public.contacts (normalized_email);

alter table public.contacts enable row level security;

-- permissive read for now; tighten later with user ownership once multi-tenant auth lands
create policy "contacts read for authenticated" on public.contacts
for select to authenticated using (true);

create policy "contacts insert via service role" on public.contacts
for insert to service_role with check (true);


-- SUPPRESSIONS
create type suppression_type as enum ('email','domain');

create table if not exists public.suppressions (
  id uuid primary key default gen_random_uuid(),
  type suppression_type not null,
  value text not null unique, -- normalized email or domain
  reason text,
  created_at timestamptz default now()
);

create unique index if not exists suppressions_value_idx on public.suppressions (value);
create index if not exists suppressions_type_idx on public.suppressions (type);

alter table public.suppressions enable row level security;

create policy "suppressions read for authenticated" on public.suppressions
for select to authenticated using (true);

create policy "suppressions insert via service role" on public.suppressions
for insert to service_role with check (true);
