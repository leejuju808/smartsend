-- Add reply_type and reply_confidence to campaign_logs
alter table public.campaign_logs
  add column if not exists reply_type text,
  add column if not exists reply_confidence numeric;

create index if not exists campaign_logs_reply_type_idx on public.campaign_logs(reply_type);

