-- Optional DB indexes to keep it snappy
create index if not exists idx_logs_campaign_time on public.send_logs(campaign_id, sent_at desc);
create index if not exists idx_sq_campaign_status_updated on public.send_queue(campaign_id, status, created_at desc);

