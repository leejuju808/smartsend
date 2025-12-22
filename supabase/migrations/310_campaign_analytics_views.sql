-- Block 310 — Campaign Analytics Dashboard v1
-- Creates views for campaign analytics: daily metrics and summary stats

-- a) Daily metrics per campaign
create or replace view campaign_stats_daily as
with days as (
  select
    s.campaign_id,
    date_trunc('day', s.sent_at) as day
  from send_logs s
  where s.sent_at is not null
  group by s.campaign_id, date_trunc('day', s.sent_at)
)
select
  d.campaign_id,
  d.day::date as day,

  -- sends
  (
    select count(*) 
    from send_logs s
    where s.campaign_id = d.campaign_id
      and date_trunc('day', s.sent_at) = d.day
      and s.status = 'sent'
  ) as sent_count,

  -- opens
  (
    select count(distinct e.lead_id)
    from delivery_events e
    where e.campaign_id = d.campaign_id
      and e.kind = 'open'
      and date_trunc('day', e.created_at) = d.day
  ) as open_count,

  -- clicks
  (
    select count(distinct e.lead_id)
    from delivery_events e
    where e.campaign_id = d.campaign_id
      and e.kind = 'click'
      and date_trunc('day', e.created_at) = d.day
  ) as click_count,

  -- replies
  (
    select count(distinct r.lead_id)
    from email_replies r
    where r.campaign_id = d.campaign_id
      and date_trunc('day', coalesce(r.received_at, r.created_at)) = d.day
  ) as reply_count,

  -- meetings
  (
    select count(distinct m.lead_id)
    from lead_meetings m
    where m.campaign_id = d.campaign_id
      and date_trunc('day', m.start_time) = d.day
  ) as meeting_count

from days d;

-- b) Overall campaign summary
create or replace view campaign_stats_summary as
select
  c.id as campaign_id,
  c.workspace_id,
  c.name,

  -- totals
  coalesce(sum(sd.sent_count), 0) as total_sent,
  coalesce(sum(sd.open_count), 0) as total_opens,
  coalesce(sum(sd.click_count), 0) as total_clicks,
  coalesce(sum(sd.reply_count), 0) as total_replies,
  coalesce(sum(sd.meeting_count), 0) as total_meetings,

  -- basic rates
  case when sum(sd.sent_count) > 0
    then round(100.0 * sum(sd.open_count) / sum(sd.sent_count), 2)
    else 0 end as open_rate,

  case when sum(sd.sent_count) > 0
    then round(100.0 * sum(sd.click_count) / sum(sd.sent_count), 2)
    else 0 end as click_rate,

  case when sum(sd.sent_count) > 0
    then round(100.0 * sum(sd.reply_count) / sum(sd.sent_count), 2)
    else 0 end as reply_rate,

  case when sum(sd.sent_count) > 0
    then round(100.0 * sum(sd.meeting_count) / sum(sd.sent_count), 2)
    else 0 end as meeting_rate

from campaigns c
left join campaign_stats_daily sd
  on sd.campaign_id = c.id
group by c.id, c.workspace_id, c.name;

-- Grant access to authenticated users
grant select on campaign_stats_daily to authenticated;
grant select on campaign_stats_summary to authenticated;

-- Add comments
comment on view campaign_stats_daily is 'Daily aggregated statistics per campaign: sends, opens, clicks, replies, meetings';
comment on view campaign_stats_summary is 'Overall campaign statistics with conversion rates';







