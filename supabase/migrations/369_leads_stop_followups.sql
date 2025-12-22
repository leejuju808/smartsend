-- Block 369 — Auto "Stop Followups" Enforcement v1
-- Add stop_followups flag and last_reply_id to leads table

alter table public.leads
  add column if not exists stop_followups boolean not null default false,
  add column if not exists last_reply_id uuid;

-- Index for efficient filtering of leads with stop_followups
create index if not exists idx_leads_stop_followups
  on public.leads (workspace_id, stop_followups)
  where stop_followups = true;

-- Index for last_reply_id lookups
create index if not exists idx_leads_last_reply_id
  on public.leads (last_reply_id)
  where last_reply_id is not null;





