-- 004_reply_detection.sql

-- Optional: store provider thread/message id on queue rows
alter table public.send_queue
  add column if not exists thread_id text,
  add column if not exists provider text;

create index if not exists send_queue_thread_idx on public.send_queue (thread_id);

-- Inbound webhook raw log (for debugging)
create table if not exists public.inbound_logs (
  id uuid primary key default gen_random_uuid(),
  provider text,                       -- "gmail" | "outlook" | "postmark" | etc.
  received_at timestamptz default now(),
  payload jsonb,
  email_from text,
  email_subject text,
  email_body text
);

-- Helpful view for search route (join lead/campaign labels)
create or replace view public.send_queue_view as
select
  sq.id,
  sq.status,
  sq.attempt_count,
  sq.max_attempts,
  sq.updated_at,
  sq.campaign_id,
  l.email as lead_email,
  c.name as campaign_name
from public.send_queue sq
left join public.leads l on l.id = sq.lead_id
left join public.campaigns c on c.id = sq.campaign_id;
