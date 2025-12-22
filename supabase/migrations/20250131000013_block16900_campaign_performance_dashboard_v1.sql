-- Block 16900 — Campaign Performance Dashboard v1
-- See Which Roofing Campaigns Actually Print Money
-- This block turns SmartSend from "fire and forget" into "see what's working and double down."

-- ============================================================================
-- 1. ENSURE REQUIRED COLUMNS EXIST ON email_messages
-- ============================================================================

-- Add opened_at column if it doesn't exist
alter table public.email_messages
  add column if not exists opened_at timestamptz;

-- Ensure intent_label exists with correct constraint (may already exist from Block 15900)
alter table public.email_messages
  add column if not exists intent_label text;

-- Update constraint to match spec if it doesn't already exist
do $$
begin
  -- Drop old constraint if it exists and doesn't match
  if exists (
    select 1 from pg_constraint 
    where conname = 'email_messages_intent_label_check'
  ) then
    -- Check if constraint values match what we need
    -- If not, we'll recreate it
    null; -- Keep existing constraint from Block 15900
  else
    -- Add constraint if it doesn't exist
    alter table public.email_messages
      add constraint email_messages_intent_label_check check (
        intent_label in (
          'hot_lead',
          'warm_lead',
          'follow_up',
          'not_interested',
          'unsubscribe',
          'unknown'
        )
      );
  end if;
end $$;

-- Set default to 'unknown' if not set
alter table public.email_messages
  alter column intent_label set default 'unknown';

-- Ensure status column exists (may be named differently in some schemas)
alter table public.email_messages
  add column if not exists status text;

-- Ensure direction column supports both 'inbound'/'outbound' and 'in'/'out'
-- (This may already be handled by Block 15900, but ensure compatibility)
do $$
begin
  if exists (
    select 1 from pg_constraint 
    where conname = 'email_messages_direction_check'
  ) then
    -- Constraint exists, check if it allows our values
    null; -- Keep existing constraint
  else
    alter table public.email_messages
      add constraint email_messages_direction_check check (
        direction in ('inbound', 'outbound', 'in', 'out')
      );
  end if;
end $$;

-- ============================================================================
-- 2. ENSURE est_job_value EXISTS ON contacts
-- ============================================================================

-- Add est_job_value column if it doesn't exist (may already exist from Block 14400)
alter table public.contacts
  add column if not exists est_job_value numeric;

-- ============================================================================
-- 3. INDEXES FOR PERFORMANCE QUERIES
-- ============================================================================

-- Index for campaign stats queries (outbound messages)
create index if not exists idx_email_messages_campaign_stats_outbound
  on public.email_messages(campaign_id, direction, status, opened_at)
  where campaign_id is not null and direction in ('outbound', 'out');

-- Index for campaign stats queries (inbound messages with intent)
create index if not exists idx_email_messages_campaign_stats_inbound
  on public.email_messages(campaign_id, direction, intent_label)
  where campaign_id is not null and direction in ('inbound', 'in');

-- Index for opened_at queries
create index if not exists idx_email_messages_opened_at
  on public.email_messages(opened_at)
  where opened_at is not null;

-- Index for contact value lookups
create index if not exists idx_contacts_est_job_value
  on public.contacts(est_job_value)
  where est_job_value is not null;



























































