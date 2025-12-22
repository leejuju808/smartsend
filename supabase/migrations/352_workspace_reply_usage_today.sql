-- Block 352: Today's reply usage view
-- Parallel to workspace_send_usage_today for reply tracking
-- Counts replies processed today per workspace

create or replace view workspace_reply_usage_today as
select
  workspace_id,
  date_trunc('day', coalesce(received_at, created_at))::date as usage_date,
  count(*)::integer as replies_count
from reply_logs
where coalesce(received_at, created_at) >= date_trunc('day', now())
  and workspace_id is not null
group by workspace_id, date_trunc('day', coalesce(received_at, created_at));

-- Grant access to service role
grant select on workspace_reply_usage_today to service_role;
grant select on workspace_reply_usage_today to authenticated;





