-- Analytics Schema Updates
-- Ensure expected columns exist for the analytics system

-- Ensure expected columns exist (only if not already created by earlier steps)
alter table if exists messages
  add column if not exists direction text check (direction in ('outbound','inbound')),
  add column if not exists is_reply boolean,
  add column if not exists received_at timestamptz;

alter table if exists meetings
  add column if not exists created_at timestamptz default now();

-- Add missing columns to senders table for analytics
alter table if exists senders
  add column if not exists health_status text check (health_status in ('green','yellow','red')) default 'green',
  add column if not exists bounce_rate_30d numeric default 0,
  add column if not exists daily_limit int default 50,
  add column if not exists sent_today int default 0;

-- Helpful indexes for analytics window scans
create index if not exists messages_received_at_idx on messages (received_at);
create index if not exists meetings_created_at_idx on meetings (created_at);
create index if not exists email_events_created_at_idx on email_events (created_at);
create index if not exists email_events_type_idx on email_events (event_type);
create index if not exists inbound_messages_created_at_idx on inbound_messages (created_at);

-- RLS reminders (loose defaults shown earlier; tighten per tenant/workspace when ready)
-- grant select on messages, meetings, email_events, senders to anon, authenticated;