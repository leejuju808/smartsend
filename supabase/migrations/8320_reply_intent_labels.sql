-- 8320_reply_intent_labels.sql
-- Block 8320 — Reply Intent Labels (AI Tags on Inbound Messages)
-- Adds intent classification fields to inbound_messages table

alter table public.inbound_messages
  add column if not exists intent_label text,
  add column if not exists intent_confidence numeric,
  add column if not exists intent_raw jsonb;

-- Index for efficient filtering by intent label
create index if not exists idx_inbound_messages_intent_label
  on public.inbound_messages (intent_label)
  where intent_label is not null;

-- Index for confidence-based queries
create index if not exists idx_inbound_messages_intent_confidence
  on public.inbound_messages (intent_confidence desc)
  where intent_confidence is not null;

































































