-- SmartSend Contacts Schema Migration
-- Creates contacts table with RLS policies as specified in requirements

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  email text not null,
  name text,
  company text,
  title text,
  phone text,
  tags text[] default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, email)
);

-- RLS (UI reads/writes by owner)
alter table public.contacts enable row level security;

do $$ begin
  create policy "owner read contacts" on public.contacts
  for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "owner write contacts" on public.contacts
  for insert with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "owner update contacts" on public.contacts
  for update using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;