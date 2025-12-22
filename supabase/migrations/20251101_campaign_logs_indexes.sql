-- Campaign logs helpful indexes for viewer pagination and filters

create index if not exists campaign_logs_campaign_created_idx
  on public.campaign_logs (campaign_id, created_at desc);

-- Backward compatible: both event and event_type may exist; index on event
create index if not exists campaign_logs_event_created_idx
  on public.campaign_logs (event, created_at desc);


