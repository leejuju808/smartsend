-- Optional: keep compact event history blobs for quick load
alter table public.send_queue
  add column if not exists meta jsonb default '{}'::jsonb; -- store small per-attempt info

-- Index for fetching a single lead timeline fast
create index if not exists idx_sq_by_campaign_lead on public.send_queue(campaign_id, lead_id, created_at);
create index if not exists idx_sl_by_campaign_lead on public.send_logs(campaign_id, lead_id, sent_at);
create index if not exists idx_bounce_by_lead on public.bounce_logs(lead_id, created_at);
create index if not exists idx_complaint_by_lead on public.complaint_logs(lead_id, created_at);

-- No RLS changes — existing campaign access covers all.

