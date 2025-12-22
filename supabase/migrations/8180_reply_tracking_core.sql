-- 8180 - Reply tracking core

-- 1) Add reply status onto the queue rows
alter table public.campaign_send_queue
  add column if not exists reply_status text not null default 'none'
    check (reply_status in ('none', 'replied', 'ignore')),
  add column if not exists replied_at timestamptz,
  add column if not exists last_inbound_message text;

create index if not exists idx_campaign_send_queue_reply_status
  on public.campaign_send_queue (reply_status);

-- 2) Per-reply event log (inbound messages)
create table if not exists public.campaign_reply_events (
  id uuid primary key default gen_random_uuid(),

  queue_id uuid not null references public.campaign_send_queue(id) on delete cascade,
  campaign_id uuid not null,
  lead_id uuid,
  from_email text not null,

  -- basic captured payload
  subject text,
  body text,

  -- classification of the reply (AI / heuristics)
  reply_type text
    check (reply_type in ('positive', 'neutral', 'negative', 'ooh', 'unsubscribe', 'unknown')),

  -- raw metadata from provider (if needed later)
  meta jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

create index if not exists idx_campaign_reply_events_queue
  on public.campaign_reply_events (queue_id, created_at);

create index if not exists idx_campaign_reply_events_campaign
  on public.campaign_reply_events (campaign_id, created_at);

-- 3) Upgrade campaign_send_stats to include replies (recreate view)

create or replace view public.campaign_send_stats as
select
  q.campaign_id,

  count(*)::integer as total_jobs,

  count(*) filter (where q.status = 'pending')::integer     as pending_count,
  count(*) filter (where q.status = 'processing')::integer  as processing_count,
  count(*) filter (where q.status = 'retry')::integer       as retry_count,
  count(*) filter (where q.status = 'failed')::integer      as failed_count,
  count(*) filter (where q.status = 'sent')::integer        as sent_count,

  -- reply counts (based on queue rows)
  count(*) filter (where q.reply_status = 'replied')::integer as replied_count,

  -- basic rate metrics
  case
    when count(*) = 0 then 0.0
    else (count(*) filter (where q.status = 'sent')::numeric / count(*)::numeric)
  end as sent_rate,

  case
    when count(*) = 0 then 0.0
    else (count(*) filter (where q.status = 'failed')::numeric / count(*)::numeric)
  end as failure_rate,

  case
    when count(*) = 0 then 0.0
    else (count(*) filter (where q.reply_status = 'replied')::numeric / count(*)::numeric)
  end as reply_rate,

  max(q.sent_at)     as last_sent_at,
  max(q.replied_at)  as last_replied_at
from public.campaign_send_queue q
group by q.campaign_id;

-- 4) Upgrade per-lead view to include reply info (recreate view)

create or replace view public.campaign_lead_send_status as
with last_event as (
  select
    e.queue_id,
    e.status,
    e.last_error,
    e.created_at,
    row_number() over (partition by e.queue_id order by e.created_at desc) as rn
  from public.campaign_send_events e
)
select
  q.id as queue_id,
  q.campaign_id,
  q.lead_id,
  q.to_email,

  q.status as queue_status,
  q.attempts,
  q.max_attempts,
  q.sent_at,

  q.reply_status,
  q.replied_at,
  q.last_inbound_message,

  le.status     as last_event_status,
  le.last_error as last_event_error,
  le.created_at as last_event_at
from public.campaign_send_queue q
left join last_event le
  on le.queue_id = q.id and le.rn = 1;

































































