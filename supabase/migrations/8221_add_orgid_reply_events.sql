-- 8221 - Add org_id to reply events (so suppression knows which org)

alter table public.campaign_reply_events
  add column if not exists org_id uuid;

-- index for later joins
create index if not exists idx_reply_events_orgid
  on public.campaign_reply_events (org_id);







