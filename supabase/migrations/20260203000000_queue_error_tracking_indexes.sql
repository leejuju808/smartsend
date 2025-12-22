-- Queue Error Tracking - Performance Indexes
-- Index sent logs by variant for fast breakdowns
create index if not exists idx_sent_logs_campaign_variant_time on public.send_logs(campaign_id, variant_key, sent_at desc);

-- Index queue by variant + status for fast breakdowns
create index if not exists idx_sq_campaign_variant_status_time on public.send_queue(campaign_id, variant_key, status, created_at desc);

