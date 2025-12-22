-- Block 8600 — Campaign Analytics Overview (Sends / Opens / Clicks / Replies)
-- This view aggregates basic metrics per (workspace, campaign).
-- Depends on:
--   email_events(workspace_id, campaign_id, recipient_email, event_type)
--   inbound_messages(workspace_id, campaign_id, from_email)

create or replace view public.v_campaign_metrics as
with events as (
  select
    c.workspace_id,
    e.campaign_id,
    -- distinct per recipient for rate math
    -- Handle variations: 'sent' or 'Sent'
    count(*) filter (where lower(e.event_type) = 'sent') as sent_events,
    -- Handle variations: 'delivered' or 'Delivered'
    count(*) filter (where lower(e.event_type) = 'delivered') as delivered_events,
    -- Handle variations: 'open', 'opened', 'Open', 'Opened'
    -- Count distinct lead_id for unique opens (more reliable than email)
    count(distinct e.lead_id) filter (where lower(e.event_type) in ('open', 'opened') and e.lead_id is not null) as unique_opens,
    -- Handle variations: 'click', 'clicked', 'Click', 'Clicked'
    -- Count distinct lead_id for unique clicks
    count(distinct e.lead_id) filter (where lower(e.event_type) in ('click', 'clicked') and e.lead_id is not null) as unique_clicks,
    -- Handle variations: 'bounce', 'bounced', 'Bounce', 'Bounced'
    count(*) filter (where lower(e.event_type) in ('bounce', 'bounced')) as bounces
  from public.email_events e
  inner join public.campaigns c on c.id = e.campaign_id
  group by c.workspace_id, e.campaign_id
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

  coalesce(ev.sent_events, 0) as total_sent,
  coalesce(ev.delivered_events, 0) as total_delivered,
  coalesce(ev.unique_opens, 0) as unique_opens,
  coalesce(ev.unique_clicks, 0) as unique_clicks,
  coalesce(ev.bounces, 0) as total_bounces,
  coalesce(rp.unique_replies, 0) as unique_replies,

  -- rates (0–1)
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

-- Grant select to authenticated users
grant select on public.v_campaign_metrics to authenticated;

