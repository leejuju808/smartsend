-- Performance indexes for /api/leads list endpoint
-- Supports filtering by campaign_id, status, and created_at with pagination

-- Index for campaign + created_at (descending) - primary use case
create index if not exists leads_campaign_created_idx 
  on public.leads (campaign_id, created_at desc);

-- Index for campaign + status + created_at (descending) - filtered queries
create index if not exists leads_campaign_status_created_idx 
  on public.leads (campaign_id, status, created_at desc);

-- Note: These indexes complement existing indexes and help with:
-- 1. Campaign-specific lists ordered by date
-- 2. Status-filtered campaign lists
-- 3. Date range queries within campaigns

