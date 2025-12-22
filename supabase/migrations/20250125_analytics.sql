-- Analytics Dashboard Migration
-- Creates views for email analytics with KPIs, per-campaign stats, and time-series data

-- 1) Unique-event rollups (per email)
create or replace view public.email_events_unique as
select
  email_log_id,
  max(case when event_type = 'open' then 1 else 0 end) as opened,
  max(case when event_type = 'click' then 1 else 0 end) as clicked
from public.email_events
group by email_log_id;

-- 2) Per-campaign aggregates
create or replace view public.campaign_analytics as
select
  c.workspace_id,
  c.id as campaign_id,
  count(el.id) filter (where el.status = 'sent')::int as sent,
  coalesce(sum(eu.opened),0)::int as unique_opens,
  coalesce(sum(eu.clicked),0)::int as unique_clicks,
  count(el.id) filter (where el.replied is true)::int as replies,
  case when count(el.id) filter (where el.status = 'sent') > 0
    then round(100.0 * coalesce(sum(eu.opened),0) / count(el.id) filter (where el.status = 'sent'), 2)
    else 0 end as open_rate_pct,
  case when count(el.id) filter (where el.status = 'sent') > 0
    then round(100.0 * coalesce(sum(eu.clicked),0) / count(el.id) filter (where el.status = 'sent'), 2)
    else 0 end as click_rate_pct,
  case when count(el.id) filter (where el.status = 'sent') > 0
    then round(100.0 * count(el.id) filter (where el.replied is true) / count(el.id) filter (where el.status = 'sent'), 2)
    else 0 end as reply_rate_pct,
  min(el.sent_at) as first_sent_at,
  max(el.sent_at) as last_sent_at
from public.campaigns c
left join public.email_logs el on el.campaign_id = c.id and el.status in ('sent','skipped_suppressed')
left join public.email_events_unique eu on eu.email_log_id = el.id
group by c.workspace_id, c.id;

-- 3) Workspace daily time-series
create or replace view public.analytics_daily as
with base as (
  select
    el.workspace_id,
    date_trunc('day', el.sent_at)::date as d,
    count(el.id) filter (where el.status = 'sent')::int as sent
  from public.email_logs el
  group by el.workspace_id, date_trunc('day', el.sent_at)
),
opens as (
  select
    el.workspace_id,
    date_trunc('day', el.sent_at)::date as d,
    count(distinct ee.email_log_id)::int as unique_opens
  from public.email_logs el
  join public.email_events ee on ee.email_log_id = el.id and ee.event_type='open'
  group by el.workspace_id, date_trunc('day', el.sent_at)
),
clicks as (
  select
    el.workspace_id,
    date_trunc('day', el.sent_at)::date as d,
    count(distinct ee.email_log_id)::int as unique_clicks
  from public.email_logs el
  join public.email_events ee on ee.email_log_id = el.id and ee.event_type='click'
  group by el.workspace_id, date_trunc('day', el.sent_at)
),
replies as (
  select
    el.workspace_id,
    date_trunc('day', el.sent_at)::date as d,
    count(el.id)::int as replies
  from public.email_logs el
  where el.replied is true
  group by el.workspace_id, date_trunc('day', el.sent_at)
)
select
  coalesce(b.workspace_id, o.workspace_id, c.workspace_id, r.workspace_id) as workspace_id,
  coalesce(b.d, o.d, c.d, r.d) as d,
  coalesce(b.sent,0) as sent,
  coalesce(o.unique_opens,0) as unique_opens,
  coalesce(c.unique_clicks,0) as unique_clicks,
  coalesce(r.replies,0) as replies
from base b
full join opens o  on o.workspace_id=b.workspace_id and o.d=b.d
full join clicks c on c.workspace_id=coalesce(b.workspace_id,o.workspace_id) and c.d=coalesce(b.d,o.d)
full join replies r on r.workspace_id=coalesce(b.workspace_id,o.workspace_id,c.workspace_id) and r.d=coalesce(b.d,o.d,c.d)
order by d asc;

-- 4) RLS (mirror your workspace guard pattern)
alter view public.campaign_analytics set (security_invoker = on);
alter view public.analytics_daily set (security_invoker = on);