-- Core assumptions for analytics:
-- - public.messages has at least: id (uuid), is_reply (bool), reply_intent (text), created_at (timestamptz), direction (text), bounce (bool)
--   If some columns are missing in your schema, add them or adjust the view accordingly.
-- - public.meetings has: id, message_id, intent, status, created_at (from earlier migration).

create or replace view public.v_metrics_core as
with replies as (
  select
    count(*) filter (where m.is_reply is true)                            as total_replies,
    count(*) filter (where m.is_reply is true and m.reply_intent = 'interested') as interested_replies,
    count(*) filter (where m.bounce is true)                              as total_bounces,
    count(*) filter (where m.created_at >= now() - interval '7 days' and m.direction = 'outbound') as recent_sends,
    count(*) filter (where m.created_at >= now() - interval '7 days' and m.is_reply is true) as recent_replies
  from public.messages m
),
meet as (
  select
    count(*) as meetings_created,
    count(*) filter (where status = 'emailed') as meetings_emailed
  from public.meetings
)
select
  r.total_replies,
  r.interested_replies,
  m.meetings_created,
  m.meetings_emailed,
  case
    when (coalesce(r.recent_sends,0)) = 0 then 0
    else round( (coalesce(r.total_bounces,0)::numeric / greatest(1, r.recent_sends)) * 100, 2)
  end as bounce_rate,
  r.recent_sends,
  r.recent_replies
from replies r cross join meet m;

comment on view public.v_metrics_core is 'Aggregated metrics to drive MB/100, reply→meeting %, and sender health.';
