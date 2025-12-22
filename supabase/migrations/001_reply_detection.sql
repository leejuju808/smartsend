-- 001_reply_detection.sql
-- Minimal schema + indexes for reply detection system

-- Threads table (if you don't already have one)
create table if not exists threads (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete set null,
  last_message_at timestamptz default now(),
  replied boolean default false,
  created_at timestamptz default now()
);

-- Emails table essentials (adapt if already exist)
alter table emails
  add column if not exists thread_id uuid references threads(id) on delete cascade,
  add column if not exists direction text check (direction in ('inbound','outbound')) default 'inbound',
  add column if not exists status text default 'received',
  add column if not exists classification text; -- 'reply' | 'ooo' | 'bounce' | 'unsubscribe' | 'noise'

create index if not exists idx_emails_thread_created on emails(thread_id, created_at);
create index if not exists idx_emails_direction on emails(direction);

-- Leads: ensure a status column
alter table leads
  add column if not exists status text check (status in ('new','queued','sending','replied','paused','won','lost')) default 'new';

-- Campaign sends/steps table you use to schedule future sends
-- We'll pause further sends when replied is detected
alter table campaign_sends
  add column if not exists paused boolean default false,
  add column if not exists step int default 1;

-- A small event log (optional)
create table if not exists email_events (
  id bigserial primary key,
  email_id uuid references emails(id) on delete cascade,
  event text,            -- 'classified_reply' | 'paused_sends' | ...
  meta jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_email_events_email_id on email_events(email_id);
create index if not exists idx_campaign_sends_paused on campaign_sends(paused, scheduled_at);

