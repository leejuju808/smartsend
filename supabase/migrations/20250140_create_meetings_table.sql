-- Create meetings table and add calendly_url to profiles
-- This migration implements the meeting intent detection system

-- Enable required extension (usually on by default in Supabase)
create extension if not exists pgcrypto;

-- Add Calendly URL to profiles (non-breaking)
alter table if exists public.profiles
  add column if not exists calendly_url text;

-- Meetings table (user-owned)
create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_email text not null,
  thread_id text,
  subject text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null check (status in ('proposed','booked','declined','canceled')) default 'proposed',
  calendly_link text,
  ics text,          -- raw ICS string (small enough for most cases; ok to store)
  location text default 'Zoom',
  created_at timestamptz not null default now()
);

-- Helpful indexes
create index if not exists idx_meetings_user_created on public.meetings(user_id, created_at desc);
create index if not exists idx_meetings_user_status on public.meetings(user_id, status);

-- RLS
alter table public.meetings enable row level security;

-- Policies: user can CRUD only own rows
drop policy if exists "meetings_select_own" on public.meetings;
create policy "meetings_select_own"
  on public.meetings for select
  using (auth.uid() = user_id);

drop policy if exists "meetings_insert_own" on public.meetings;
create policy "meetings_insert_own"
  on public.meetings for insert
  with check (auth.uid() = user_id);

drop policy if exists "meetings_update_own" on public.meetings;
create policy "meetings_update_own"
  on public.meetings for update
  using (auth.uid() = user_id);

drop policy if exists "meetings_delete_own" on public.meetings;
create policy "meetings_delete_own"
  on public.meetings for delete
  using (auth.uid() = user_id);

-- Add comment for documentation
comment on table public.meetings is 'Tracks meetings created from reply intent detection'; 