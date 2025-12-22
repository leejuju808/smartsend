-- Add unique constraint for campaign_id and email to prevent duplicates
create unique index if not exists uq_leads_campaign_email on leads(campaign_id, email);