-- Create inbox_messages table for Gmail polling system
-- This stores all received messages from connected Gmail accounts

create table if not exists public.inbox_messages (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider='gmail'),
  account_email text not null,
  thread_id text not null,
  message_id text not null unique,
  from_email text,
  to_email text,
  subject text,
  snippet text,
  body_plain text,
  received_at timestamptz,
  lead_id uuid null references leads(id),
  is_reply boolean default false,
  processed_at timestamptz,
  created_at timestamptz default now()
);

-- Index for efficient lookups by account and time
create index if not exists inbox_messages_account_idx on public.inbox_messages(account_email, received_at desc);

-- Index for message_id lookups
create index if not exists inbox_messages_message_id_idx on public.inbox_messages(message_id);

-- Index for thread lookups
create index if not exists inbox_messages_thread_id_idx on public.inbox_messages(thread_id);

-- Index for lead matching
create index if not exists inbox_messages_lead_idx on public.inbox_messages(lead_id);

-- Disable RLS for now (server-only access via service_role)
-- Can enable later if needed for dashboard views
-- alter table public.inbox_messages enable row level security;

