-- Contacts table
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  first_name text,
  last_name text,
  company text,
  title text,
  phone text,
  created_at timestamptz default now(),
  updated_at timestamptz
);

-- Suppressions list
create table if not exists suppressions (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  reason text,
  created_at timestamptz default now()
);

-- Helpful indexes
create index if not exists contacts_email_idx on contacts (email);
create index if not exists suppressions_email_idx on suppressions (email);

-- RLS
alter table contacts enable row level security;
alter table suppressions enable row level security;

-- Simple open read (tighten later per tenant/workspace)
create policy "contacts read"
  on contacts for select
  to anon, authenticated
  using (true);

create policy "contacts insert (service)"
  on contacts for insert
  to service_role
  with check (true);

create policy "contacts update (service)"
  on contacts for update
  to service_role
  using (true)
  with check (true);

create policy "suppressions read"
  on suppressions for select
  to anon, authenticated
  using (true);

create policy "suppressions write (service)"
  on suppressions for insert
  to service_role
  with check (true);

-- (Optional) seed a suppression for testing
-- insert into suppressions (email, reason) values ('blocked@example.com','hard bounce') on conflict (email) do nothing;