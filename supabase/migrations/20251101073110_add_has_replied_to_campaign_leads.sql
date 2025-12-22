-- Add has_replied boolean to campaign_leads for simpler reply status tracking
-- This complements the existing reply_state enum system

alter table if exists public.campaign_leads
  add column if not exists has_replied boolean default false;

-- Create index for efficient filtering
create index if not exists idx_campaign_leads_has_replied 
  on public.campaign_leads(has_replied) where has_replied = true;

-- Add comment explaining the relationship
comment on column public.campaign_leads.has_replied is 
  'Simple boolean flag for reply status. Can be used alongside reply_state enum for more granular tracking.';

