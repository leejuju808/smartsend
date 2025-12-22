-- Add subject_token column to campaign_leads for reply tracking
-- This stores the [SS|leadId] token appended to each email subject

do $$
begin
  -- Add subject_token to campaign_leads if it doesn't exist
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'campaign_leads' 
    and column_name = 'subject_token'
  ) then
    alter table public.campaign_leads 
    add column subject_token text;
  end if;

  -- Add index for faster lookups when matching replies
  if not exists (
    select 1 from pg_indexes 
    where indexname = 'idx_campaign_leads_subject_token'
  ) then
    create index idx_campaign_leads_subject_token 
    on public.campaign_leads(subject_token) 
    where subject_token is not null;
  end if;
end $$;

