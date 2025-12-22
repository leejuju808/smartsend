-- Create helpful indexes for leads filtering and campaign leads joins
-- Note: idx_leads_org is already created in 20250216000004_org_project_linkage_rls.sql

-- Index on leads email for search
create index if not exists idx_leads_email on leads(lower(email));

-- Index on campaign_leads for fast joins  
create index if not exists idx_campaign_leads_cid_lid on campaign_leads(campaign_id, lead_id);

-- Add composite index for faster filtering when both org_id and status are used
create index if not exists idx_leads_org_status on leads(org_id, status);

-- Add index for updated_at for recent activity sorting
create index if not exists idx_leads_updated_at on leads(updated_at desc);

