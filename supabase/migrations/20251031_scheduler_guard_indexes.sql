-- Indexes for scheduler guard queries (skip replied / cap attempts)
create index if not exists idx_leads_campaign_status on public.leads (campaign_id, status);
create index if not exists idx_leads_attempts on public.leads (campaign_id, send_attempts);

