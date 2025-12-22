-- Block 21595 — SmartSend Roofing Unified Inbox v2
-- (Threads, Filters, Lead Linking)
-- 
-- This migration creates the email_threads table and links email_sends and emails to threads
-- Every email from the same homeowner is grouped into one thread, tied to a lead + job

-- ============================================================================
-- PART 1 — Email Threads Table
-- ============================================================================
-- Represents a "conversation" between a roofer and a homeowner

create table if not exists email_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,
  primary_email text not null,          -- homeowner email (normalized)
  subject text,
  last_message_at timestamptz,
  last_intent text,                    -- hot_lead | warm_lead | question | not_interested | null
  unread_count integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes for efficient querying
create index if not exists email_threads_user_idx on email_threads (user_id, last_message_at desc);
create index if not exists email_threads_lead_idx on email_threads (lead_id);
create index if not exists email_threads_primary_email_idx on email_threads (user_id, primary_email);

-- Unique constraint: one thread per user + primary_email
create unique index if not exists email_threads_user_email_unique 
  on email_threads (user_id, primary_email);

-- ============================================================================
-- PART 2 — Link email_sends to threads
-- ============================================================================

alter table email_sends
  add column if not exists thread_id uuid references email_threads(id) on delete set null;

create index if not exists email_sends_thread_idx on email_sends (thread_id);

-- ============================================================================
-- PART 3 — Link emails/inbound_emails to threads
-- ============================================================================
-- Check which table exists and add thread_id to it

do $$
begin
  -- Try to add to emails table if it exists
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' and table_name = 'emails'
  ) then
    alter table emails
      add column if not exists thread_id uuid references email_threads(id) on delete set null;
    
    create index if not exists emails_thread_idx on emails (thread_id);
  end if;

  -- Try to add to inbound_emails table if it exists
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' and table_name = 'inbound_emails'
  ) then
    alter table inbound_emails
      add column if not exists thread_id uuid references email_threads(id) on delete set null;
    
    create index if not exists inbound_emails_thread_idx on inbound_emails (thread_id);
  end if;

  -- Try to add to email_replies table if it exists
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' and table_name = 'email_replies'
  ) then
    alter table email_replies
      add column if not exists thread_id uuid references email_threads(id) on delete set null;
    
    create index if not exists email_replies_thread_idx on email_replies (thread_id);
  end if;
end $$;

-- ============================================================================
-- PART 4 — Trigger to update updated_at
-- ============================================================================

create or replace function update_email_threads_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_email_threads_updated_at on email_threads;
create trigger trg_email_threads_updated_at
before update on email_threads
for each row
execute function update_email_threads_updated_at();

-- ============================================================================
-- PART 5 — RLS Policies
-- ============================================================================

alter table email_threads enable row level security;

-- Drop existing policies if they exist
drop policy if exists "email_threads_service_role_all" on email_threads;
drop policy if exists "email_threads_select_authenticated" on email_threads;

-- Service role has full access (needed for edge functions)
create policy "email_threads_service_role_all" on email_threads
  for all to service_role
  using (true) with check (true);

-- Authenticated users can read threads they own
create policy "email_threads_select_authenticated" on email_threads
  for select to authenticated
  using (user_id = auth.uid());

-- Authenticated users can insert/update their own threads
create policy "email_threads_insert_authenticated" on email_threads
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "email_threads_update_authenticated" on email_threads
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());














































