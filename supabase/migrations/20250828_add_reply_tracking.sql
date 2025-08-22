-- Reply detection support: add fields and indexes

-- Track Gmail reply message id and received timestamp on outbound messages
alter table if exists public.outbound_messages
  add column if not exists reply_gmail_id text,
  add column if not exists reply_received_at timestamptz;

-- Fast lookup for replied state by owner/lead
create index if not exists idx_om_owner_lead_replied on public.outbound_messages(owner, lead_id, replied);

-- Lead-level last reply timestamp for quick checks
alter table if exists public.leads
  add column if not exists last_replied_at timestamptz;

-- Mailbox: track last time we polled for replies
alter table if exists public.mailboxes
  add column if not exists last_reply_check_at timestamptz;

