create table if not exists public.leads (
  id uuid default gen_random_uuid() primary key,
  owner_email text not null,
  email text not null,
  name text,
  company text,
  custom1 text,
  custom2 text,
  custom3 text,
  unsubscribed boolean default false not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (owner_email, email)
);

alter table public.leads enable row level security;

drop policy if exists "Owners can manage their leads" on public.leads;
create policy "Owners can manage their leads" on public.leads
  for all using (true) with check (true);

