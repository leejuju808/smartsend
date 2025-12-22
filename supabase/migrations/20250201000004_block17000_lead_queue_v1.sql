-- Block 17000 — Lead Queue v1
-- Speed-To-Lead Command Center for Hot & Warm Roofing Leads
-- This block turns SmartSend into a "call these people now" machine.

-- ============================================================================
-- 1. ADD last_lead_event_at COLUMN TO contacts TABLE (Optional Optimization)
-- ============================================================================
-- This column speeds up sorting by tracking when the last hot/warm/follow_up event occurred.
-- V1 can compute from email_messages, but this column is a performance optimization.

alter table public.contacts
  add column if not exists last_lead_event_at timestamptz;

-- Index for efficient sorting
create index if not exists idx_contacts_last_lead_event_at 
  on public.contacts(workspace_id, last_lead_event_at desc nulls last)
  where last_lead_event_at is not null;

-- ============================================================================
-- 2. COMMENT ON COLUMN
-- ============================================================================

comment on column public.contacts.last_lead_event_at is 
  'Timestamp of the last hot_lead, warm_lead, or follow_up intent event. Used for Lead Queue prioritization.';



























































