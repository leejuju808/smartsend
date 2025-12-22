-- Minimal threads and messages schema for replies inbox
-- This replaces/adds a clean threads/messages structure

create table if not exists threads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  campaign_id uuid,
  lead_id uuid,
  lead_email text not null,
  subject text,
  last_message_at timestamptz not null default now(),
  status text not null default 'open', -- open | replied | archived
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references threads(id) on delete cascade,
  org_id uuid not null,
  direction text not null check (direction in ('inbound','outbound')),
  from_email text not null,
  to_email text[] not null,
  body_text text,
  body_html text,
  external_provider text,        -- 'gmail' | 'outlook'
  external_id text,              -- provider msg id
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Quick index helpers
create index if not exists idx_threads_org_last on threads(org_id, last_message_at desc);
create index if not exists idx_messages_thread_time on messages(thread_id, sent_at asc);
create index if not exists idx_threads_lead_email on threads(lead_email);
create index if not exists idx_messages_org on messages(org_id);

-- RLS (simplified)
alter table threads enable row level security;
alter table messages enable row level security;

-- Drop existing policies if they exist
drop policy if exists "read threads by org" on threads;
drop policy if exists "read messages by org" on messages;
drop policy if exists "insert outbound messages" on messages;
drop policy if exists "insert threads" on threads;
drop policy if exists "update threads" on threads;

-- Read policies
create policy "read threads by org" on threads
for select using (
  org_id = (select org_id from profiles p where p.id = auth.uid())
);

create policy "read messages by org" on messages
for select using (
  org_id = (select org_id from profiles p where p.id = auth.uid())
);

-- Insert policies
create policy "insert threads" on threads
for insert with check (
  org_id = (select org_id from profiles p where p.id = auth.uid())
);

create policy "insert outbound messages" on messages
for insert with check (
  org_id = (select org_id from profiles p where p.id = auth.uid())
);

-- Update policies
create policy "update threads" on threads
for update using (
  org_id = (select org_id from profiles p where p.id = auth.uid())
);

