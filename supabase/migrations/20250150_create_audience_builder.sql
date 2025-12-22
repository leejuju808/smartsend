-- Contacts: add computed domain + helpful indexes
alter table public.contacts
  add column if not exists domain text
  generated always as (split_part(lower(email::text), '@', 2)) stored;

create index if not exists contacts_user_domain_idx on public.contacts (user_id, domain);
create index if not exists contacts_user_company_idx on public.contacts (user_id, company);
create index if not exists contacts_user_created_idx on public.contacts (user_id, created_at desc);

-- Segments (saved filters)
create table if not exists public.segments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  definition jsonb not null,      -- e.g. {"q":"acme","domains":["gmail.com"],"companies":["Acme"],"has_name":true,"created_from":"2025-01-01","created_to":"2025-08-31"}
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS
alter table public.segments enable row level security;

create policy "segments: own rows"
  on public.segments for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid()); 