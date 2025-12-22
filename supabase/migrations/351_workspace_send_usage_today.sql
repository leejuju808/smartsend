-- Block 351: Today's send usage view
-- Simple per-day send count that the dispatcher can hit quickly
-- Handles both cases: workspace_id via campaigns join or directly in send_logs

create or replace view workspace_send_usage_today as
select
  coalesce(
    sl.workspace_id,
    c.workspace_id,
    l.workspace_id
  ) as workspace_id,
  date_trunc('day', coalesce(sl.sent_at, sl.created_at))::date as usage_date,
  count(*)::integer as sends_count
from send_logs sl
left join campaigns c on c.id = sl.campaign_id
left join leads l on l.id = sl.lead_id
where coalesce(sl.sent_at, sl.created_at) >= date_trunc('day', now())
  and coalesce(sl.status, 'sent') = 'sent' -- Count sent status (default to 'sent' if null for backward compat)
  and coalesce(sl.workspace_id, c.workspace_id, l.workspace_id) is not null -- Only include rows with workspace_id
group by 
  coalesce(sl.workspace_id, c.workspace_id, l.workspace_id),
  date_trunc('day', coalesce(sl.sent_at, sl.created_at));

-- Grant access to service role
grant select on workspace_send_usage_today to service_role;
grant select on workspace_send_usage_today to authenticated;

