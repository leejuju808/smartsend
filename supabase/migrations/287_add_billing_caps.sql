-- Block 287: Overage Enforcement - Workspace Billing Caps
-- Add billing cap columns to workspaces table

alter table workspaces
add column if not exists daily_send_cap integer default 200,
add column if not exists daily_reply_cap integer default 200,
add column if not exists seat_limit integer default 1,
add column if not exists throttle_threshold numeric default 0.8; -- 80%

-- Update billing_usage_daily view to use new columns
create or replace view billing_usage_daily as
with seats as (
  select
    w.id as workspace_id,
    count(tm.id) as seats_used,
    coalesce(w.seat_limit, 1) as seats_limit
  from workspaces w
  left join team_members tm
    on tm.workspace_id = w.id
    and tm.status = 'active'
  group by w.id, w.seat_limit
),

sends as (
  select
    workspace_id,
    current_date as day,
    count(*) as sends_today
  from send_logs
  where sent_at::date = current_date
    and workspace_id is not null
  group by workspace_id
),

replies as (
  select
    workspace_id,
    current_date as day,
    count(*) as replies_today
  from inbound_messages
  where received_at::date = current_date
    and workspace_id is not null
  group by workspace_id
)

select
  s.workspace_id,
  current_date as day,
  s.seats_used,
  s.seats_limit,
  coalesce(sl.sends_today, 0) as sends_today,
  coalesce(w.daily_send_cap, w.default_daily_send_cap, 200) as daily_send_cap,
  coalesce(rl.replies_today, 0) as replies_today,
  coalesce(w.daily_reply_cap, w.default_daily_send_cap, 200) as daily_reply_cap,
  coalesce(w.throttle_threshold, 0.8) as throttle_threshold,
  (coalesce(sl.sends_today, 0) >= coalesce(w.daily_send_cap, w.default_daily_send_cap, 200)) as send_over_cap,
  (coalesce(rl.replies_today, 0) >= coalesce(w.daily_reply_cap, w.default_daily_send_cap, 200)) as reply_over_cap,
  (s.seats_used > s.seats_limit) as seat_over_cap
from seats s
join workspaces w on w.id = s.workspace_id
left join sends sl on sl.workspace_id = s.workspace_id
left join replies rl on rl.workspace_id = s.workspace_id;

-- Grant access to authenticated users
grant select on billing_usage_daily to authenticated;








