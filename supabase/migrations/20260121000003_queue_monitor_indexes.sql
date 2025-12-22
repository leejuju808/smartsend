-- Campaign Queue Monitor - Performance Indexes
-- Speeds up queue table scans by state & attempts

create index if not exists idx_sq_campaign_status_attempts on public.send_queue(campaign_id, status, attempts, created_at desc);

create index if not exists idx_sq_campaign_variant on public.send_queue(campaign_id, variant_key);

