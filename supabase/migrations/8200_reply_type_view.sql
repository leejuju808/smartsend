-- 8200 - Add last_reply_type to per-lead status view

-- Rebuild campaign_lead_send_status to include latest reply_type

create or replace view public.campaign_lead_send_status as
with last_event as (
  select
    e.queue_id,
    e.status,
    e.last_error,
    e.created_at,
    row_number() over (partition by e.queue_id order by e.created_at desc) as rn
  from public.campaign_send_events e
),
last_reply as (
  select
    r.queue_id,
    r.reply_type,
    r.body,
    r.created_at,
    row_number() over (partition by r.queue_id order by r.created_at desc) as rn
  from public.campaign_reply_events r
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
  le.created_at as last_event_at,

  lr.reply_type as last_reply_type
from public.campaign_send_queue q
left join last_event le
  on le.queue_id = q.id and le.rn = 1
left join last_reply lr
  on lr.queue_id = q.id and lr.rn = 1;

































































