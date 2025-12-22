-- Leads pagination performance indexes
create index if not exists leads_created_at_idx on public.leads (created_at desc);
create index if not exists leads_campaign_status_created_idx on public.leads (campaign_id, status, created_at desc);


