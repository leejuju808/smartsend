-- 8130 - Campaign send analytics views

-- 🔹 Per-campaign aggregate stats
create or replace view public.campaign_send_stats as
select
  q.campaign_id,

  count(*)::integer as total_jobs,

  count(*) filter (where q.status = 'pending')::integer     as pending_count,
  count(*) filter (where q.status = 'processing')::integer  as processing_count,
  count(*) filter (where q.status = 'retry')::integer       as retry_count,
  count(*) filter (where q.status = 'failed')::integer      as failed_count,
  count(*) filter (where q.status = 'sent')::integer        as sent_count,

  -- basic rate metrics
  case
    when count(*) = 0 then 0.0
    else (count(*) filter (where q.status = 'sent')::numeric / count(*)::numeric)
  end as sent_rate,

  case
    when count(*) = 0 then 0.0
    else (count(*) filter (where q.status = 'failed')::numeric / count(*)::numeric)
  end as failure_rate,

  max(q.sent_at) as last_sent_at
from public.campaign_send_queue q
group by q.campaign_id;

-- 🔹 Per-lead / per-recipient status for a campaign
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

  le.status     as last_event_status,
  le.last_error as last_event_error,
  le.created_at as last_event_at
from public.campaign_send_queue q
left join last_event le
  on le.queue_id = q.id and le.rn = 1;

-- Optional: Simple RLS helper policy
-- If you're using org_id / project_id on campaign_send_queue:
-- Example: expose views per org (adapt to your structure)
alter view public.campaign_send_stats set (security_invoker = on);
alter view public.campaign_lead_send_status set (security_invoker = on);

-- Then your existing RLS on campaign_send_queue will flow through.

































































