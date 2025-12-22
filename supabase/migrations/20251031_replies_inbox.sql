-- Add lightweight fields to surface replies in the UI

alter table public.leads
  add column if not exists last_reply_at timestamptz,
  add column if not exists last_reply_snippet text,
  add column if not exists inbox_archived boolean not null default false;

-- Helpful index for inbox queries
create index if not exists leads_inbox_idx
  on public.leads (status, inbox_archived, last_reply_at desc);

-- If your reply webhook logs replies, keep these up to date:
-- You can also backfill from campaign_logs type='reply_detected'
-- (optional backfill)
-- update leads l
-- set last_reply_at = cl.created_at,
--     last_reply_snippet = left(coalesce(cl.message,''), 240)
-- from campaign_logs cl
-- where cl.lead_id = l.id and cl.type = 'reply_detected' and l.last_reply_at is null;

