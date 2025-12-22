-- Block 407 — Follow-Up Later View + Reschedule Engine v1
-- Add follow-up scheduling fields to campaign_leads for managing future follow-ups

-- 1.1 Add follow-up scheduling columns
alter table public.campaign_leads
  add column if not exists follow_up_at timestamptz,
  add column if not exists follow_up_completed boolean default false,
  add column if not exists follow_up_notes text;

-- 1.2 Index for sorting
create index if not exists idx_campaign_leads_follow_up_at
  on public.campaign_leads (follow_up_at asc)
  where follow_up_at is not null;



