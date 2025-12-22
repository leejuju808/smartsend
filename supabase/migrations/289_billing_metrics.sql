-- Block 289: Advanced Billing Metrics
-- 7-day & 30-day rolling usage views + composite metrics view

-- 7-day rolling sends
create or replace view billing_sends_7d as
select
  workspace_id,
  count(*) as sends_7d
from send_logs
where sent_at >= now() - interval '7 days'
  and workspace_id is not null
group by workspace_id;

-- 30-day rolling sends
create or replace view billing_sends_30d as
select
  workspace_id,
  count(*) as sends_30d
from send_logs
where sent_at >= now() - interval '30 days'
  and workspace_id is not null
group by workspace_id;

-- 7-day replies (using inbound_messages)
create or replace view billing_replies_7d as
select
  workspace_id,
  count(*) as replies_7d
from inbound_messages
where received_at >= now() - interval '7 days'
  and workspace_id is not null
group by workspace_id;

-- 30-day replies (using inbound_messages)
create or replace view billing_replies_30d as
select
  workspace_id,
  count(*) as replies_30d
from inbound_messages
where received_at >= now() - interval '30 days'
  and workspace_id is not null
group by workspace_id;

-- Composite metrics view
create or replace view billing_metrics as
select
  w.id as workspace_id,
  coalesce(s7.sends_7d, 0) as sends_7d,
  coalesce(s30.sends_30d, 0) as sends_30d,
  coalesce(r7.replies_7d, 0) as replies_7d,
  coalesce(r30.replies_30d, 0) as replies_30d
from workspaces w
left join billing_sends_7d s7 on s7.workspace_id = w.id
left join billing_sends_30d s30 on s30.workspace_id = w.id
left join billing_replies_7d r7 on r7.workspace_id = w.id
left join billing_replies_30d r30 on r30.workspace_id = w.id;

-- Grant access to authenticated users
grant select on billing_sends_7d to authenticated;
grant select on billing_sends_30d to authenticated;
grant select on billing_replies_7d to authenticated;
grant select on billing_replies_30d to authenticated;
grant select on billing_metrics to authenticated;








