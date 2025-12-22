-- Ensure workspace scoping and uniqueness for leads
create index if not exists idx_leads_workspace on leads(workspace_id);
create unique index if not exists uq_leads_workspace_email on leads(workspace_id, email);

-- Helpful for logs (if campaign_logs table exists)
create index if not exists idx_campaign_logs_campaign on campaign_logs(campaign_id, created_at);
