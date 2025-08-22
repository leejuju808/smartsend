-- Monthly email send logs (separate from outbox)
create extension if not exists pgcrypto;

create table if not exists public.email_send_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  meta jsonb
);

create index if not exists idx_email_send_logs_user_time on public.email_send_logs (user_id, created_at desc);

alter table public.email_send_logs enable row level security;

-- Allow users to insert/select their own rows
drop policy if exists "email_send_logs_insert_own" on public.email_send_logs;
create policy "email_send_logs_insert_own"
on public.email_send_logs for insert
with check (auth.uid() = user_id);

drop policy if exists "email_send_logs_select_own" on public.email_send_logs;
create policy "email_send_logs_select_own"
on public.email_send_logs for select
using (auth.uid() = user_id);

-- Ensure profiles.subscription_status exists
alter table public.profiles add column if not exists subscription_status text default 'free';

