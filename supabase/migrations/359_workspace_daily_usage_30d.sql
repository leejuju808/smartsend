-- Block 359 — Usage History Chart v1
-- 30-day daily usage view for sends and replies

create or replace view workspace_daily_usage_30d as
with sends as (
  select
    workspace_id,
    date_trunc('day', sent_at)::date as usage_date,
    count(*)::integer as sends_count
  from send_logs
  where sent_at >= (now() - interval '30 days')
    and workspace_id is not null
  group by workspace_id, date_trunc('day', sent_at)::date
),
replies as (
  select
    workspace_id,
    date_trunc('day', coalesce(received_at, created_at))::date as usage_date,
    count(*)::integer as replies_count
  from reply_logs
  where coalesce(received_at, created_at) >= (now() - interval '30 days')
    and workspace_id is not null
  group by workspace_id, date_trunc('day', coalesce(received_at, created_at))::date
)
select
  coalesce(s.workspace_id, r.workspace_id) as workspace_id,
  coalesce(s.usage_date, r.usage_date) as usage_date,
  coalesce(s.sends_count, 0)::integer as sends_count,
  coalesce(r.replies_count, 0)::integer as replies_count
from sends s
full outer join replies r
  on s.workspace_id = r.workspace_id
  and s.usage_date = r.usage_date;





