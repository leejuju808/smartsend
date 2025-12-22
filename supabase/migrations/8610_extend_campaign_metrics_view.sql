-- 8610_extend_campaign_metrics_view.sql

drop view if exists public.v_campaign_metrics;

create or replace view public.v_campaign_metrics as
with events as (
  select
    e.workspace_id,
    e.campaign_id,
    count(*) filter (where e.event_type = 'sent') as sent_events,
    count(*) filter (where e.event_type = 'delivered') as delivered_events,
    count(distinct e.recipient_email) filter (where e.event_type = 'open') as unique_opens,
    count(distinct e.recipient_email) filter (where e.event_type = 'click') as unique_clicks,
    count(*) filter (where e.event_type = 'bounce') as bounces
  from public.email_events e
  group by e.workspace_id, e.campaign_id
),
replies as (
  select
    im.workspace_id,
    im.campaign_id,
    count(distinct im.from_email) as unique_replies
  from public.inbound_messages im
  where im.campaign_id is not null
  group by im.workspace_id, im.campaign_id
)
select
  c.workspace_id,
  c.id as campaign_id,

  c.name as campaign_name,
  c.created_at as campaign_created_at,

  coalesce(ev.sent_events, 0) as total_sent,
  coalesce(ev.delivered_events, 0) as total_delivered,
  coalesce(ev.unique_opens, 0) as unique_opens,
  coalesce(ev.unique_clicks, 0) as unique_clicks,
  coalesce(ev.bounces, 0) as total_bounces,
  coalesce(rp.unique_replies, 0) as unique_replies,

  case
    when coalesce(ev.delivered_events, 0) > 0
      then (ev.unique_opens::numeric / ev.delivered_events::numeric)
    else 0
  end as open_rate,

  case
    when coalesce(ev.delivered_events, 0) > 0
      then (ev.unique_clicks::numeric / ev.delivered_events::numeric)
    else 0
  end as click_rate,

  case
    when coalesce(ev.delivered_events, 0) > 0
      then (coalesce(rp.unique_replies, 0)::numeric / ev.delivered_events::numeric)
    else 0
  end as reply_rate
from public.campaigns c
left join events ev
  on ev.workspace_id = c.workspace_id
 and ev.campaign_id = c.id
left join replies rp
  on rp.workspace_id = c.workspace_id
 and rp.campaign_id = c.id;

