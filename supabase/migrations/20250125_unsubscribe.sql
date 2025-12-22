-- One-Click Unsubscribe — Suppression List + Signed Link
-- Migration: 20250125_unsubscribe.sql

create table if not exists public.suppression_list (
  email text primary key,
  reason text default 'user_unsubscribed',
  created_at timestamptz default now()
);

-- Optional: fast lookup index (email is PK, but add if you switch keys later)
create index if not exists ix_suppression_reason on public.suppression_list (reason);

-- Add RLS policies for suppression_list
alter table public.suppression_list enable row level security;

-- Allow authenticated users to read suppression list
create policy "Users can read suppression list" on public.suppression_list
  for select using (auth.role() = 'authenticated');

-- Allow system to insert/update suppression list entries
create policy "System can manage suppression list" on public.suppression_list
  for all using (true);