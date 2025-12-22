-- Speeds up KPI queries
create index if not exists leads_created_idx on public.leads (created_at desc);
create index if not exists send_queue_campaign_status_idx on public.send_queue (campaign_id, status);
create index if not exists campaign_logs_event_created_idx on public.campaign_logs (event, created_at desc);
create index if not exists campaign_logs_campaign_event_created_idx on public.campaign_logs (campaign_id, event, created_at desc);


