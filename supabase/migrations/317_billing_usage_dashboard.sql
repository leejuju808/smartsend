-- Block 317 — Billing Usage Dashboard v1
-- Plan limits + usage views for billing dashboard

-- 1) Extend plan_limits table with additional fields
alter table public.plan_limits
  add column if not exists name text,
  add column if not exists daily_send_cap integer,
  add column if not exists monthly_send_cap integer,
  add column if not exists seat_limit integer,
  add column if not exists reply_cap integer,
  add column if not exists meeting_cap integer;

-- Update existing plan_limits with new values
-- Use hard_cap_per_day as daily_send_cap if daily_send_cap is null
update public.plan_limits
set 
  name = case 
    when plan::text = 'free' then 'Free'
    when plan::text = 'starter' then 'Starter'
    when plan::text = 'pro' then 'Pro'
    else plan::text
  end,
  daily_send_cap = coalesce(daily_send_cap, hard_cap_per_day),
  monthly_send_cap = coalesce(monthly_send_cap, hard_cap_per_day * 30),
  seat_limit = coalesce(seat_limit, case 
    when plan::text = 'free' then 1
    when plan::text = 'starter' then 3
    when plan::text = 'pro' then 10
    else 1
  end),
  reply_cap = coalesce(reply_cap, case 
    when plan::text = 'free' then 50
    when plan::text = 'starter' then 500
    when plan::text = 'pro' then 2000
    else 50
  end),
  meeting_cap = coalesce(meeting_cap, case 
    when plan::text = 'free' then 10
    when plan::text = 'starter' then 100
    when plan::text = 'pro' then 500
    else 10
  end);

-- Insert/update with example seeds (adjust to your pricing)
insert into public.plan_limits (plan, name, hard_cap_per_day, burst_per_minute, daily_send_cap, monthly_send_cap, seat_limit, reply_cap, meeting_cap)
values
  ('free', 'Free', 50, 10, 200, 3000, 1, 50, 10),
  ('starter', 'Starter', 500, 60, 1000, 20000, 3, 500, 100),
  ('pro', 'Pro', 2500, 120, 5000, 100000, 10, 2000, 500)
on conflict (plan) do update set
  name = excluded.name,
  daily_send_cap = excluded.daily_send_cap,
  monthly_send_cap = excluded.monthly_send_cap,
  seat_limit = excluded.seat_limit,
  reply_cap = excluded.reply_cap,
  meeting_cap = excluded.meeting_cap;

-- 2) Daily usage view per workspace
create or replace view workspace_usage_daily as
with dates as (
  select
    w.id as workspace_id,
    d::date as day
  from workspaces w
  cross join generate_series(
    current_date - interval '60 days',
    current_date,
    interval '1 day'
  ) as d
),
daily_sends as (
  select
    c.workspace_id,
    date_trunc('day', sl.sent_at)::date as day,
    count(*) as send_count
  from send_logs sl
  join campaigns c on c.id = sl.campaign_id
  where sl.sent_at is not null
  group by c.workspace_id, date_trunc('day', sl.sent_at)
),
daily_replies as (
  -- Count replies from inbox_messages (inbound messages)
  -- Handle both cases: inbox_messages with campaign_id or workspace_id via inbox_threads
  select
    coalesce(c.workspace_id, it.workspace_id) as workspace_id,
    date_trunc('day', im.received_at)::date as day,
    count(*) as reply_count
  from inbox_messages im
  left join campaigns c on c.id = im.campaign_id
  left join inbox_threads it on it.id = im.thread_id
  where im.direction in ('in', 'inbound')
    and im.received_at is not null
    and coalesce(c.workspace_id, it.workspace_id) is not null
  group by coalesce(c.workspace_id, it.workspace_id), date_trunc('day', im.received_at)
  
  union all
  
  -- Also count from email_replies if available
  -- Handle both cases: email_logs with workspace_id directly, or via campaigns
  select
    coalesce(el.workspace_id, c.workspace_id) as workspace_id,
    date_trunc('day', coalesce(er.received_at, er.created_at))::date as day,
    count(*) as reply_count
  from email_replies er
  join email_logs el on el.id = er.email_log_id
  left join campaigns c on c.id = el.campaign_id
  where coalesce(el.workspace_id, c.workspace_id) is not null
    and coalesce(er.received_at, er.created_at) is not null
  group by coalesce(el.workspace_id, c.workspace_id), date_trunc('day', coalesce(er.received_at, er.created_at))
),
daily_replies_agg as (
  select
    workspace_id,
    day,
    sum(reply_count) as reply_count
  from daily_replies
  group by workspace_id, day
),
daily_meetings as (
  select
    workspace_id,
    date_trunc('day', start_time)::date as day,
    count(*) as meeting_count
  from lead_meetings
  where start_time is not null
  group by workspace_id, date_trunc('day', start_time)
)
select
  d.workspace_id,
  d.day,
  coalesce(s.send_count, 0) as send_count,
  coalesce(r.reply_count, 0) as reply_count,
  coalesce(m.meeting_count, 0) as meeting_count
from dates d
left join daily_sends s
  on s.workspace_id = d.workspace_id and s.day = d.day
left join daily_replies_agg r
  on r.workspace_id = d.workspace_id and r.day = d.day
left join daily_meetings m
  on m.workspace_id = d.workspace_id and m.day = d.day;

-- Grant access to authenticated users
grant select on workspace_usage_daily to authenticated;

-- 3) Summary usage vs limits
create or replace view workspace_usage_summary as
select
  w.id as workspace_id,
  w.name as workspace_name,
  coalesce(bs.plan::text, w.plan, 'free') as billing_plan,

  pl.name as plan_name,
  pl.daily_send_cap,
  pl.monthly_send_cap,
  pl.seat_limit,
  pl.reply_cap,
  pl.meeting_cap,

  -- seats (active team members)
  (
    select count(distinct tm.user_id)
    from team_members tm
    where tm.workspace_id = w.id
      and tm.status = 'active'
  ) as seat_count,

  -- today
  (
    select coalesce(sum(send_count), 0)
    from workspace_usage_daily d
    where d.workspace_id = w.id
      and d.day = current_date
  ) as sends_today,

  (
    select coalesce(sum(reply_count), 0)
    from workspace_usage_daily d
    where d.workspace_id = w.id
      and d.day = current_date
  ) as replies_today,

  (
    select coalesce(sum(meeting_count), 0)
    from workspace_usage_daily d
    where d.workspace_id = w.id
      and d.day = current_date
  ) as meetings_today,

  -- month to date (calendar month)
  (
    select coalesce(sum(send_count), 0)
    from workspace_usage_daily d
    where d.workspace_id = w.id
      and d.day >= date_trunc('month', current_date)::date
      and d.day <= current_date
  ) as sends_month,

  (
    select coalesce(sum(reply_count), 0)
    from workspace_usage_daily d
    where d.workspace_id = w.id
      and d.day >= date_trunc('month', current_date)::date
      and d.day <= current_date
  ) as replies_month,

  (
    select coalesce(sum(meeting_count), 0)
    from workspace_usage_daily d
    where d.workspace_id = w.id
      and d.day >= date_trunc('month', current_date)::date
      and d.day <= current_date
  ) as meetings_month

from workspaces w
left join billing_subscriptions bs on bs.workspace_id = w.id
left join plan_limits pl on pl.plan::text = coalesce(bs.plan::text, w.plan, 'free');

-- Grant access to authenticated users
grant select on workspace_usage_summary to authenticated;

-- Create indexes for performance
create index if not exists idx_send_logs_campaign_sent_at 
  on send_logs(campaign_id, sent_at) 
  where sent_at is not null;

create index if not exists idx_inbox_messages_campaign_received 
  on inbox_messages(campaign_id, received_at) 
  where direction = 'in' and received_at is not null;

create index if not exists idx_email_replies_received 
  on email_replies(coalesce(received_at, created_at)) 
  where coalesce(received_at, created_at) is not null;

create index if not exists idx_lead_meetings_workspace_start 
  on lead_meetings(workspace_id, start_time) 
  where start_time is not null;

