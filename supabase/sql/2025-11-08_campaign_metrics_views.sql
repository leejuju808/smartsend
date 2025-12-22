create or replace view public.v_campaign_kpis as
with
  outbound as (
    select t.campaign_id, count(*) as sent, max(nm.sent_at) as last_sent_at
    from public.normalized_messages nm
    join public.inbox_threads t on t.id = nm.linked_thread_id
    where nm.direction = 'outbound'
    group by 1
  ),
  inbound as (
    select
      t.campaign_id,
      count(*) as inbound,
      count(*) filter (
        where coalesce(nm.ai_label, '') in ('human_reply', 'question', 'positive', 'neutral', 'routing')
      ) as replies,
      max(nm.sent_at) as last_inbound_at
    from public.normalized_messages nm
    join public.inbox_threads t on t.id = nm.linked_thread_id
    where nm.direction = 'inbound'
    group by 1
  ),
  opens as (
    select o.campaign_id, count(*) as opens
    from public.tracking_events e
    join public.outbox_requests o on o.id = e.outbox_id
    where e.kind = 'opened'
    group by 1
  ),
  clicks as (
    select o.campaign_id, count(*) as clicks
    from public.tracking_events e
    join public.outbox_requests o on o.id = e.outbox_id
    where e.kind = 'clicked'
    group by 1
  ),
  bounces as (
    select t.campaign_id, count(*) as bounces
    from public.normalized_messages nm
    join public.inbox_threads t on t.id = nm.linked_thread_id
    where nm.direction = 'outbound' and coalesce(nm.ai_label, '') = 'bounce'
    group by 1
  ),
  threads as (
    select campaign_id, count(*) as threads
    from public.inbox_threads
    group by 1
  )
select
  c.id as campaign_id,
  c.name,
  coalesce(o.sent, 0) as sent,
  coalesce(i.inbound, 0) as inbound,
  coalesce(i.replies, 0) as replies,
  coalesce(op.opens, 0) as opens,
  coalesce(cl.clicks, 0) as clicks,
  coalesce(b.bounces, 0) as bounces,
  coalesce(th.threads, 0) as threads,
  o.last_sent_at,
  i.last_inbound_at,
  case
    when coalesce(o.sent, 0) > 0
      then round((coalesce(i.replies, 0)::numeric / o.sent) * 100, 2)
    else 0
  end as reply_rate_pct,
  case
    when coalesce(o.sent, 0) > 0
      then round((coalesce(op.opens, 0)::numeric / o.sent) * 100, 2)
    else 0
  end as open_rate_pct,
  case
    when coalesce(o.sent, 0) > 0
      then round((coalesce(cl.clicks, 0)::numeric / o.sent) * 100, 2)
    else 0
  end as click_rate_pct,
  case
    when coalesce(o.sent, 0) > 0
      then round((coalesce(b.bounces, 0)::numeric / o.sent) * 100, 2)
    else 0
  end as bounce_rate_pct
from public.campaigns c
left join outbound o on o.campaign_id = c.id
left join inbound i on i.campaign_id = c.id
left join opens op on op.campaign_id = c.id
left join clicks cl on cl.campaign_id = c.id
left join bounces b on b.campaign_id = c.id
left join threads th on th.campaign_id = c.id;

create or replace view public.v_campaign_daily as
with
  days as (
    select
      generate_series((current_date - 89)::date, current_date::date, interval '1 day')::date as d
  ),
  outbound as (
    select t.campaign_id, nm.sent_at::date as d, count(*) as sent
    from public.normalized_messages nm
    join public.inbox_threads t on t.id = nm.linked_thread_id
    where nm.direction = 'outbound'
    group by 1, 2
  ),
  inbound as (
    select
      t.campaign_id,
      nm.sent_at::date as d,
      count(*) as inbound,
      count(*) filter (
        where coalesce(nm.ai_label, '') in ('human_reply', 'question', 'positive', 'neutral', 'routing')
      ) as replies
    from public.normalized_messages nm
    join public.inbox_threads t on t.id = nm.linked_thread_id
    where nm.direction = 'inbound'
    group by 1, 2
  ),
  opens as (
    select o.campaign_id, e.created_at::date as d, count(*) as opens
    from public.tracking_events e
    join public.outbox_requests o on o.id = e.outbox_id
    where e.kind = 'opened'
    group by 1, 2
  ),
  clicks as (
    select o.campaign_id, e.created_at::date as d, count(*) as clicks
    from public.tracking_events e
    join public.outbox_requests o on o.id = e.outbox_id
    where e.kind = 'clicked'
    group by 1, 2
  )
select
  c.id as campaign_id,
  c.name,
  d.d,
  coalesce(o.sent, 0) as sent,
  coalesce(i.inbound, 0) as inbound,
  coalesce(i.replies, 0) as replies,
  coalesce(op.opens, 0) as opens,
  coalesce(cl.clicks, 0) as clicks
from public.campaigns c
cross join days d
left join outbound o on o.campaign_id = c.id and o.d = d.d
left join inbound i on i.campaign_id = c.id and i.d = d.d
left join opens op on op.campaign_id = c.id and op.d = d.d
left join clicks cl on cl.campaign_id = c.id and cl.d = d.d;




