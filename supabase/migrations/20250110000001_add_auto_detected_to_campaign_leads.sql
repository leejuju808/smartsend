-- Add auto_detected column to campaign_leads table
-- This migration adds auto_detected boolean column to track AI-detected replies

-- Add auto_detected column if it doesn't exist
alter table public.campaign_leads
  add column if not exists auto_detected boolean default false;

-- Add index for efficient querying of auto-detected replies
create index if not exists campaign_leads_auto_detected_idx 
  on public.campaign_leads(auto_detected) 
  where auto_detected = true;

-- Add comment for documentation
comment on column public.campaign_leads.auto_detected is 
  'True when reply was automatically detected by the detect-replies edge function';

