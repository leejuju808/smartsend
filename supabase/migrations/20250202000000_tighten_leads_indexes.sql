-- Tighten leads table with proper indexes and RLS
-- Creates leads table if not exists with user_id based ownership

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  first_name text,
  last_name text,
  company text,
  title text,
  phone text,
  custom jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_leads_user_email on public.leads(user_id, email);
create unique index if not exists uniq_leads_user_email on public.leads(user_id, email);

alter table public.leads enable row level security;
drop policy if exists "owner read" on public.leads;
drop policy if exists "owner write" on public.leads;
create policy "owner read" on public.leads for select using (auth.uid() = user_id);
create policy "owner write" on public.leads for insert with check (auth.uid() = user_id);
create policy "owner update" on public.leads for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner delete" on public.leads for delete using (auth.uid() = user_id);

