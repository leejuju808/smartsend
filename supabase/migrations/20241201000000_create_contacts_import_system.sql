-- Extensions
create extension if not exists citext;

-- Contacts
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email citext not null,
  first_name text,
  last_name text,
  company text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index if not exists contacts_user_email_unique
  on public.contacts (user_id, email);

-- Suppression list
create table if not exists public.suppression_list (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email citext not null,
  reason text,
  created_at timestamptz default now()
);
create unique index if not exists suppression_user_email_unique
  on public.suppression_list (user_id, email);

-- Import runs (for analytics)
create table if not exists public.imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  filename text,
  total_rows int default 0,
  inserted int default 0,
  updated int default 0,
  skipped_duplicate int default 0,     -- duplicates within the same file
  skipped_suppressed int default 0,
  invalid int default 0,
  created_at timestamptz default now()
);

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql security definer;

drop trigger if exists contacts_set_updated_at on public.contacts;
create trigger contacts_set_updated_at
before update on public.contacts
for each row execute function public.set_updated_at();

-- RLS
alter table public.contacts enable row level security;
alter table public.suppression_list enable row level security;
alter table public.imports enable row level security;

create policy "contacts: own rows"
  on public.contacts for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "suppression: own rows"
  on public.suppression_list for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "imports: own rows"
  on public.imports for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid()); 