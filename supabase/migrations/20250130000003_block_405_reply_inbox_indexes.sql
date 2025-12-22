-- Block 405 — Smart Reply Status Filters & Inbox v1
-- Add indexes for reply inbox queries

-- Ensure last_reply_event_id column exists (should already exist from Block 404)
alter table public.campaign_leads
  add column if not exists last_reply_event_id uuid references public.email_events(id) on delete set null;

-- Helpful indexes for the inbox
create index if not exists idx_campaign_leads_replied
  on public.campaign_leads (is_replied, replied_at desc);

create index if not exists idx_email_events_inbound_reply
  on public.email_events (lead_id, event_type, created_at desc)
  where direction = 'inbound' and event_type = 'reply';



