-- Block 406 — Reply Reason Tags v1
-- Add reply reason tags to email_events and campaign_leads for manual categorization
-- 
-- Schema upgrades:
-- 1. email_events: Add reply_reason column
-- 2. campaign_leads: Add last_reply_reason column with index

-- 1.1 Add reply_reason to email_events
alter table public.email_events
  add column if not exists reply_reason text
    check (reply_reason in (
      'interested',
      'not_fit',
      'ooo',
      'booked',
      'follow_up_later',
      'uncategorized'
    ));

-- Only used for inbound reply events, but no need to enforce at DB level
-- We'll just set it in app code

-- 1.2 Add last_reply_reason to campaign_leads
alter table public.campaign_leads
  add column if not exists last_reply_reason text
    check (last_reply_reason in (
      'interested',
      'not_fit',
      'ooo',
      'booked',
      'follow_up_later',
      'uncategorized'
    ));

-- Create index for fast filtering & reporting
create index if not exists idx_campaign_leads_last_reply_reason
  on public.campaign_leads (last_reply_reason)
  where last_reply_reason is not null;



