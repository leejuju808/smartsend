-- Gmail Inbound System
-- Creates email_messages, sent_messages, and gmail_connections tables for Gmail polling

-- Store each inbound/outbound email message
create table if not exists public.email_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id text,                -- gmail threadId
  provider_message_id text,      -- gmail message id
  in_reply_to text,              -- Message-Id this replies to
  references_header text,        -- raw References header
  subject text,
  from_email text,
  to_email text,
  sent_at timestamptz,
  body_plain text,
  is_inbound boolean default true,
  lead_id uuid,                  -- link to leads if known
  campaign_id uuid,              -- optional
  created_at timestamptz default now(),
  unique(provider_message_id)
);

-- record what we sent (so we can map In-Reply-To -> lead)
create table if not exists public.sent_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null,
  campaign_id uuid,
  provider_message_id text,      -- gmail Message-Id we sent
  thread_id text,
  subject text,
  to_email text,
  sent_at timestamptz default now(),
  unique(provider_message_id)
);

-- minimal gmail connection for each user (store tokens server-side only)
create table if not exists public.gmail_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  email_address text not null,
  history_id text,               -- for advanced delta later
  last_sync_at timestamptz
);

-- Indexes for efficient queries
create index if not exists idx_email_messages_thread on public.email_messages(thread_id);
create index if not exists idx_email_messages_provider_msg on public.email_messages(provider_message_id);
create index if not exists idx_email_messages_lead on public.email_messages(lead_id);
create index if not exists idx_email_messages_is_inbound on public.email_messages(is_inbound);
create index if not exists idx_email_messages_sent_at on public.email_messages(sent_at desc);

create index if not exists idx_sent_messages_lead on public.sent_messages(lead_id);
create index if not exists idx_sent_messages_provider_msg on public.sent_messages(provider_message_id);
create index if not exists idx_sent_messages_thread on public.sent_messages(thread_id);

-- RLS
alter table public.email_messages enable row level security;
alter table public.sent_messages enable row level security;
alter table public.gmail_connections enable row level security;

-- read-only to authenticated; writes come from server (service role)
create policy "read messages" on public.email_messages for select to authenticated using (true);
create policy "read sent" on public.sent_messages for select to authenticated using (true);
create policy "read gmail conn self" on public.gmail_connections for select to authenticated using (auth.uid()::text = user_id::text);

-- Revoke insert, update, delete from authenticated (only service role can write)
revoke insert, update, delete on public.email_messages, public.sent_messages, public.gmail_connections from authenticated;

-- Allow service role full access
create policy "service full access email_messages" on public.email_messages for all to service_role using (true) with check (true);
create policy "service full access sent_messages" on public.sent_messages for all to service_role using (true) with check (true);
create policy "service full access gmail_connections" on public.gmail_connections for all to service_role using (true) with check (true);

