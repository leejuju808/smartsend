-- 8330_lead_reply_intent_fields.sql
-- Block 8330 — Intent-Driven Lead Enrichment (Store Intent on Lead + Show in UI)
-- Adds intent classification fields to leads table so we can track reply intent at the lead level

alter table public.leads
  add column if not exists reply_intent_label text,
  add column if not exists reply_intent_confidence numeric,
  add column if not exists reply_intent_updated_at timestamptz;

-- Index for efficient filtering by intent label
create index if not exists idx_leads_reply_intent_label
  on public.leads (reply_intent_label)
  where reply_intent_label is not null;

-- Index for confidence-based queries
create index if not exists idx_leads_reply_intent_confidence
  on public.leads (reply_intent_confidence desc)
  where reply_intent_confidence is not null;
































































