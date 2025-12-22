-- Speed up dashboard
create index if not exists idx_campaign_logs_ws_event_created
  on campaign_logs (campaign_id, event, created_at);

create index if not exists idx_send_queue_ws_status_scheduled
  on send_queue (campaign_id, status, scheduled_at);

-- Optional: if campaigns table exists and carries workspace_id, wire a quick view for logs with workspace_id
-- Adjust names if different.
create or replace view v_campaign_logs_ws as
select cl.*, c.workspace_id
from campaign_logs cl
join campaigns c on c.id = cl.campaign_id;

create or replace view v_send_queue_ws as
select sq.*, c.workspace_id
from send_queue sq
join campaigns c on c.id = sq.campaign_id;

-- 7-day series helper (UTC; change to your tz if desired)
create or replace view v_last7 as
select generate_series(date_trunc('day', now()) - interval '6 days',
                       date_trunc('day', now()),
                       interval '1 day')::date as d; 