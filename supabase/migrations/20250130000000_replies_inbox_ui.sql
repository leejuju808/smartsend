-- Replies Inbox UI - Ship-ready MVP
-- Creates email_threads and email_messages tables aligned with the spec,
-- materialized view for fast inbox queries, and RLS policies

-- 1. Ensure email_threads table exists with required columns
create table if not exists public.email_threads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  provider text not null check (provider in ('gmail','outlook','smtp','other')) default 'other',
  ext_thread_id text, -- provider thread ID
  lead_name text,
  lead_email text not null,
  subject text,
  status text not null check (status in ('unreplied','replied','needs_review','archived')) default 'unreplied',
  ai_flag text check (ai_flag in ('handwritten','ooo','spammy')) null,
  last_incoming_at timestamptz,
  last_outgoing_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(org_id, provider, ext_thread_id) nulls not distinct
);

-- Add columns if table exists but missing fields
alter table public.email_threads
  add column if not exists org_id uuid,
  add column if not exists provider text,
  add column if not exists ext_thread_id text,
  add column if not exists lead_name text,
  add column if not exists lead_email text,
  add column if not exists subject text,
  add column if not exists status text default 'unreplied',
  add column if not exists ai_flag text,
  add column if not exists last_incoming_at timestamptz,
  add column if not exists last_outgoing_at timestamptz,
  add column if not exists updated_at timestamptz default now();

-- Ensure status constraint
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'email_threads_status_check'
  ) then
    alter table public.email_threads
      drop constraint if exists email_threads_status_check,
      add constraint email_threads_status_check
      check (status in ('unreplied','replied','needs_review','archived'));
  end if;
end$$;

-- 2. Ensure email_messages table exists with required columns
create table if not exists public.email_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  thread_id uuid not null references public.email_threads(id) on delete cascade,
  direction text not null check (direction in ('in','out')),
  from_email text not null,
  from_name text,
  to_emails text[] not null,
  cc_emails text[] default '{}',
  bcc_emails text[] default '{}',
  sent_at timestamptz not null,
  snippet text,
  body_html text,
  attachments jsonb default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- Add columns if table exists but missing fields
alter table public.email_messages
  add column if not exists org_id uuid,
  add column if not exists thread_id uuid,
  add column if not exists direction text,
  add column if not exists from_email text,
  add column if not exists from_name text,
  add column if not exists to_emails text[],
  add column if not exists cc_emails text[] default '{}',
  add column if not exists bcc_emails text[] default '{}',
  add column if not exists snippet text,
  add column if not exists attachments jsonb default '[]'::jsonb;

-- Ensure direction constraint
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'email_messages_direction_check'
  ) then
    alter table public.email_messages
      drop constraint if exists email_messages_direction_check,
      add constraint email_messages_direction_check
      check (direction in ('in','out'));
  end if;
end$$;

-- 3. Indexes for fast queries
create index if not exists idx_threads_org_status on public.email_threads(org_id, status);
create index if not exists idx_threads_org_last_incoming on public.email_threads(org_id, last_incoming_at desc nulls last);
create index if not exists idx_threads_org_provider on public.email_threads(org_id, provider, last_incoming_at desc nulls last);
create index if not exists idx_msgs_thread_time on public.email_messages(thread_id, sent_at desc);
create index if not exists idx_threads_search on public.email_threads using gin (to_tsvector('simple', coalesce(subject,'') || ' ' || coalesce(lead_email,'') || ' ' || coalesce(lead_name,'')));

-- 4. Materialized View for inbox (fast list)
drop materialized view if exists public.mv_replies_inbox;
create materialized view public.mv_replies_inbox as
select
  t.id as thread_id,
  t.org_id,
  t.provider,
  t.lead_name,
  t.lead_email,
  t.subject,
  t.status,
  t.ai_flag,
  greatest(
    coalesce(t.last_incoming_at, 'epoch'::timestamptz),
    coalesce(t.last_outgoing_at, 'epoch'::timestamptz)
  ) as last_activity_at,
  (select m.snippet from public.email_messages m where m.thread_id = t.id order by m.sent_at desc limit 1) as last_snippet
from public.email_threads t;

create unique index if not exists idx_mv_inbox_unique on public.mv_replies_inbox(thread_id);
create index if not exists idx_mv_inbox_org on public.mv_replies_inbox(org_id, last_activity_at desc);
create index if not exists idx_mv_inbox_status on public.mv_replies_inbox(org_id, status, last_activity_at desc);

-- 5. Refresh helper function
create or replace function public.refresh_mv_replies_inbox() returns trigger language plpgsql as $$
begin
  refresh materialized view concurrently public.mv_replies_inbox;
  return null;
exception
  when others then
    -- If concurrent refresh fails (e.g., no unique index), use non-concurrent
    refresh materialized view public.mv_replies_inbox;
    return null;
end; $$;

-- Refresh triggers (simplified - refresh on any change)
drop trigger if exists trg_refresh_mv_threads on public.email_threads;
create trigger trg_refresh_mv_threads
  after insert or update or delete on public.email_threads
  for each statement execute function public.refresh_mv_replies_inbox();

drop trigger if exists trg_refresh_mv_messages on public.email_messages;
create trigger trg_refresh_mv_messages
  after insert or update or delete on public.email_messages
  for each statement execute function public.refresh_mv_replies_inbox();

-- 6. RLS Policies
alter table public.email_threads enable row level security;
alter table public.email_messages enable row level security;

-- Drop existing policies if they exist
drop policy if exists "org only threads" on public.email_threads;
drop policy if exists "org only msgs" on public.email_messages;
drop policy if exists "org update threads" on public.email_threads;

-- Select policies
create policy "org only threads" on public.email_threads
  for select using (
    org_id::text = coalesce(
      (auth.jwt() ->> 'org_id'),
      (select org_id::text from public.profiles where id = auth.uid() limit 1)
    )
  );

create policy "org only msgs" on public.email_messages
  for select using (
    org_id::text = coalesce(
      (auth.jwt() ->> 'org_id'),
      (select org_id::text from public.profiles where id = auth.uid() limit 1)
    )
  );

-- Update policy for threads
create policy "org update threads" on public.email_threads
  for update using (
    org_id::text = coalesce(
      (auth.jwt() ->> 'org_id'),
      (select org_id::text from public.profiles where id = auth.uid() limit 1)
    )
  );

-- Grant service role access
grant all on public.email_threads to service_role;
grant all on public.email_messages to service_role;

-- Initial refresh
refresh materialized view public.mv_replies_inbox;

