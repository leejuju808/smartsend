-- Contacts Import System Migration
-- Creates tables for contacts, imports, suppression, unsubscribes, and send events

-- Contacts (per workspace/user)
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  first_name text,
  last_name text,
  company text,
  title text,
  phone text,
  custom jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, email)
);

-- Import jobs
create table if not exists public.contact_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  filename text not null,
  total_rows int default 0,
  inserted_rows int default 0,
  skipped_rows int default 0,
  status text not null default 'pending' check (status in ('pending','processing','done','failed')),
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

-- Suppression list (global per user/workspace)
create table if not exists public.suppression_list (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  reason text not null default 'manual' check (reason in ('manual','bounced','complaint','unsubscribed')),
  created_at timestamptz not null default now(),
  unique (user_id, email)
);

-- Unsubscribes (immutable audit)
create table if not exists public.unsubscribes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  source text not null default 'link' check (source in ('link','manual','api')),
  created_at timestamptz not null default now()
);

-- Lightweight campaign send log (if not present)
create table if not exists public.send_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid,
  email text not null,
  event text not null check (event in ('queued','sent','bounced','complaint','opened','clicked','unsubscribed','skipped_suppressed')),
  meta jsonb,
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_contacts_user_email on public.contacts(user_id, email);
create index if not exists idx_suppression_user_email on public.suppression_list(user_id, email);
create index if not exists idx_unsubs_user_email on public.unsubscribes(user_id, email);
create index if not exists idx_imports_user on public.contact_imports(user_id);

-- RLS
alter table public.contacts enable row level security;
create policy "contacts owner" on public.contacts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.contact_imports enable row level security;
create policy "imports owner" on public.contact_imports for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.suppression_list enable row level security;
create policy "suppress owner" on public.suppression_list for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.unsubscribes enable row level security;
create policy "unsubs owner" on public.unsubscribes for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.send_events enable row level security;
create policy "events owner" on public.send_events for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id); 