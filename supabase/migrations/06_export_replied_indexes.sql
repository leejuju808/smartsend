-- 06_export_replied_indexes.sql

create index if not exists idx_leads_campaign_status_created
  on public.leads (campaign_id, status, created_at desc);


