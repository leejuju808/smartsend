-- Lightweight metrics views (idempotent)
-- Run in Supabase SQL

-- Normalize day
create or replace function public.day_utc(ts timestamptz)
returns date language sql immutable as $$
  select (ts at time zone 'UTC')::date;
$$;

-- A) Sent per day (by campaign)
create or replace view public.v_sent_daily as
select
  campaign_id,
  day_utc(created_at) as day,
  count(*)::int as sent
from public.send_logs
where status = 'sent'
group by 1,2;

-- B) Replies per day (by campaign) — any inbound on thread counts as reply
-- If you store campaign_id on threads, join to threads
create or replace view public.v_replies_daily as
select
  t.campaign_id,
  day_utc(coalesce(m.received_at, m.sent_at, m.created_at)) as day,
  count(distinct m.thread_id)::int as replies
from public.inbox_messages m
join public.inbox_threads t on t.id = m.thread_id
where m.direction in ('inbound', 'in')
group by 1,2;

-- C) Labels per day (unsubscribe/bounce)
create or replace view public.v_labels_daily as
select
  t.campaign_id,
  day_utc(coalesce(m.received_at, m.sent_at, m.created_at)) as day,
  coalesce(m.ai_label, m.reply_label) as ai_label,
  count(*)::int as cnt
from public.inbox_messages m
join public.inbox_threads t on t.id = m.thread_id
where m.direction in ('inbound', 'in') and coalesce(m.ai_label, m.reply_label) is not null
group by 1,2,3;

-- D) Top domains (by sent and replies) — rolling 30d
create or replace view public.v_top_domains_30d as
with s as (
  select l.domain, sl.campaign_id
  from public.send_logs sl
  join public.leads l on l.id = sl.lead_id
  where sl.status='sent' and sl.created_at >= now() - interval '30 days'
),
r as (
  select l.domain, t.campaign_id
  from public.inbox_messages m
  join public.inbox_threads t on t.id = m.thread_id
  join public.leads l on l.id = t.lead_id
  where m.direction in ('inbound', 'in') 
    and coalesce(m.received_at, m.sent_at, m.created_at) >= now() - interval '30 days'
)
select
  coalesce(s.campaign_id, r.campaign_id) as campaign_id,
  coalesce(s.domain, r.domain) as domain,
  (select count(*) from s s2 where s2.domain=coalesce(s.domain,r.domain) and s2.campaign_id=coalesce(s.campaign_id,r.campaign_id))::int as sent_30d,
  (select count(*) from r r2 where r2.domain=coalesce(s.domain,r.domain) and r2.campaign_id=coalesce(s.campaign_id,r.campaign_id))::int as replies_30d
from s
full outer join r on r.domain=s.domain and r.campaign_id=s.campaign_id
where coalesce(s.domain,r.domain) is not null
group by 1,2;

-- E) Campaign summary (last 7d + lifetime)
create or replace view public.v_campaign_summary as
with sent_all as (
  select campaign_id, count(*)::int as sent_all
  from public.send_logs where status='sent'
  group by 1
),
sent_7 as (
  select campaign_id, count(*)::int as sent_7d
  from public.send_logs
  where status='sent' and created_at >= now() - interval '7 days'
  group by 1
),
rep_all as (
  select t.campaign_id, count(distinct m.thread_id)::int as replies_all
  from public.inbox_messages m
  join public.inbox_threads t on t.id = m.thread_id
  where m.direction in ('inbound', 'in')
  group by 1
),
rep_7 as (
  select t.campaign_id, count(distinct m.thread_id)::int as replies_7d
  from public.inbox_messages m
  join public.inbox_threads t on t.id = m.thread_id
  where m.direction in ('inbound', 'in')
    and coalesce(m.received_at, m.sent_at, m.created_at) >= now() - interval '7 days'
  group by 1
),
unsub as (
  select t.campaign_id, count(*)::int as unsub_7d
  from public.inbox_messages m
  join public.inbox_threads t on t.id=m.thread_id
  where m.direction in ('inbound', 'in') 
    and coalesce(m.ai_label, m.reply_label)='unsubscribe'
    and coalesce(m.received_at, m.sent_at, m.created_at) >= now() - interval '7 days'
  group by 1
),
bounce as (
  select t.campaign_id, count(*)::int as bounce_7d
  from public.inbox_messages m
  join public.inbox_threads t on t.id=m.thread_id
  where m.direction in ('inbound', 'in') 
    and coalesce(m.ai_label, m.reply_label)='bounce'
    and coalesce(m.received_at, m.sent_at, m.created_at) >= now() - interval '7 days'
  group by 1
)
select
  c.id as campaign_id,
  coalesce(sa.sent_all,0) as sent_all,
  coalesce(s7.sent_7d,0) as sent_7d,
  coalesce(ra.replies_all,0) as replies_all,
  coalesce(r7.replies_7d,0) as replies_7d,
  coalesce(u.unsub_7d,0) as unsub_7d,
  coalesce(b.bounce_7d,0) as bounce_7d,
  case when coalesce(s7.sent_7d,0)>0 then round(coalesce(r7.replies_7d,0)::numeric / s7.sent_7d, 4) else 0 end as reply_rate_7d,
  case when coalesce(s7.sent_7d,0)>0 then round(coalesce(u.unsub_7d,0)::numeric / s7.sent_7d, 4) else 0 end as unsub_rate_7d,
  case when coalesce(s7.sent_7d,0)>0 then round(coalesce(b.bounce_7d,0)::numeric / s7.sent_7d, 4) else 0 end as bounce_rate_7d
from public.campaigns c
left join sent_all sa on sa.campaign_id=c.id
left join sent_7 s7 on s7.campaign_id=c.id
left join rep_all ra on ra.campaign_id=c.id
left join rep_7 r7 on r7.campaign_id=c.id
left join unsub u on u.campaign_id=c.id
left join bounce b on b.campaign_id=c.id;
