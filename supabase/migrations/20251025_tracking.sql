-- Email Tracking Migration
-- Creates tables for tracking opens and clicks for sent emails

create extension if not exists pgcrypto;

-- email_logs table to track each sent email
create table if not exists public.email_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  to_email text not null,
  subject text not null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  opened boolean default false,
  clicked boolean default false,
  status text not null default 'queued' check (status in ('queued','sent','failed','skipped_suppressed')),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists ix_email_logs_user on public.email_logs(user_id, created_at desc);
create index if not exists ix_email_logs_campaign on public.email_logs(campaign_id);
create index if not exists ix_email_logs_to_email on public.email_logs(to_email);

-- email_events table to log each open/click event
create table if not exists public.email_events (
  id bigserial primary key,
  email_log_id uuid not null references public.email_logs(id) on delete cascade,
  event_type text not null check (event_type in ('open','click')),
  url text,                          -- only for clicks
  ip text,
  ua text,
  created_at timestamptz default now()
);

create index if not exists ix_email_events_log on public.email_events(email_log_id, event_type, created_at);

-- Enable RLS
alter table public.email_logs enable row level security;
alter table public.email_events enable row level security;

-- RLS policies for email_logs
drop policy if exists "email_logs_insert_own" on public.email_logs;
create policy "email_logs_insert_own"
on public.email_logs for insert
with check (auth.uid() = user_id);

drop policy if exists "email_logs_select_own" on public.email_logs;
create policy "email_logs_select_own"
on public.email_logs for select
using (auth.uid() = user_id);

-- RLS policies for email_events
drop policy if exists "email_events_select_own" on public.email_events;
create policy "email_events_select_own"
on public.email_events for select
using (
  exists (
    select 1 from public.email_logs el
    where el.id = email_events.email_log_id
    and el.user_id = auth.uid()
  )
);

-- Allow service role to insert events (for tracking pixel and redirect handler)
drop policy if exists "email_events_insert" on public.email_events;
create policy "email_events_insert"
on public.email_events for insert
with check (true); 