-- Campaign Dashboard Views
-- Fast metrics + timeseries for campaign dashboard

-- 1) Per-campaign rollup
create or replace view campaign_stats as
select
  c.id as campaign_id,
  count(cl.*) filter (where cl.state in ('Pending','Queued','Sending'))              as in_queue,
  count(cl.*) filter (where cl.state = 'Sent')                                       as sent,
  count(cl.*) filter (where cl.state = 'Bounced')                                    as bounced,
  count(cl.*) filter (where cl.state = 'Error')                                      as errors,
  count(cl.*) filter (where cl.state = 'Replied')                                    as replied,
  -- reply rate on delivered (sent + replied)
  round(
    100.0 * count(cl.*) filter (where cl.state = 'Replied')
    / nullif(count(cl.*) filter (where cl.state in ('Sent','Replied')),0)
  , 2) as reply_rate_pct
from campaigns c
left join campaign_leads cl on cl.campaign_id = c.id
group by 1;

-- 2) Today usage for cap bar
create or replace view campaign_today_sent as
select
  c.id as campaign_id,
  count(*) filter (where cl.sent_at::date = now()::date) as sent_today
from campaigns c
left join campaign_leads cl on cl.campaign_id = c.id and cl.state in ('Sent','Replied')
group by 1;

-- 3) 14-day timeseries: sent & replies per day
create or replace view campaign_timeseries_14d as
with days as (
  select generate_series(date_trunc('day', now()) - interval '13 days', date_trunc('day', now()), interval '1 day') as d
)
select
  c.id as campaign_id,
  d.d::date as day,
  count(cl.*) filter (where cl.sent_at::date = d.d::date) as sent,
  count(cl.*) filter (where cl.state = 'Replied' and cl.sent_at::date <= d.d::date) as cumulative_replied
from campaigns c
cross join days d
left join campaign_leads cl on cl.campaign_id = c.id
group by 1,2
order by 1,2;

-- 4) Latest errors (for drilldown)
create or replace view campaign_send_errors as
select cl.campaign_id, cl.lead_id, cl.last_error, cl.sent_at
from campaign_leads cl
where cl.state = 'Error'
order by cl.sent_at desc nulls last;

-- Grant access to authenticated users
grant select on campaign_stats to authenticated;
grant select on campaign_today_sent to authenticated;
grant select on campaign_timeseries_14d to authenticated;
grant select on campaign_send_errors to authenticated;

