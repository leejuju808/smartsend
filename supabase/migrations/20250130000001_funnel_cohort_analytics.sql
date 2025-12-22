-- Funnel + Cohort Analytics Views
-- Idempotent: all views are created or replaced

-- A) Sent per (campaign, step)
create or replace view public.v_sent_per_step as
select
  sl.campaign_id,
  coalesce(sl.step_no, 1) as step_no,
  count(sl.id) as sent
from public.send_logs sl
group by 1,2;

-- B) First events per send (reuse from earlier slice if present)
create or replace view public.v_send_first_events as
select
  sl.id as send_log_id,
  sl.campaign_id,
  sl.step_no,
  sl.lead_id,
  min(te.created_at) filter (where te.type='open')  as first_open_at,
  min(te.created_at) filter (where te.type='click') as first_click_at
from public.send_logs sl
left join public.tracking_events te on te.send_log_id = sl.id
group by 1,2,3,4;

-- C) Replies per (campaign, step) — any inbound after the send
create or replace view public.v_replies_per_send as
with after_send as (
  select
    sl.id as send_log_id,
    m.id  as msg_id,
    m.created_at
  from public.send_logs sl
  join public.inbox_threads t on t.campaign_id = sl.campaign_id and t.lead_id = sl.lead_id
  join public.inbox_messages m on m.thread_id = t.id and m.direction = 'inbound'
  where m.created_at >= sl.created_at
)
select
  s.send_log_id,
  min(a.created_at) as first_reply_at
from public.send_logs s
left join after_send a on a.send_log_id = s.id
group by 1;

-- D) Optional "booked" heuristic (positive intent)
create or replace view public.v_booked_per_send as
select
  s.id as send_log_id,
  min(m.created_at) as first_booked_at
from public.send_logs s
join public.inbox_threads t on t.campaign_id = s.campaign_id and t.lead_id = s.lead_id
join public.inbox_messages m on m.thread_id = t.id and m.direction='inbound'
where m.ai_label = 'positive' and coalesce(m.ai_intent,'') ilike '%book%'
group by 1;

-- E) Rollup funnel per (campaign, step)
create or replace view public.v_campaign_step_funnel as
with base as (
  select sl.id, sl.campaign_id, coalesce(sl.step_no,1) as step_no, sl.created_at
  from public.send_logs sl
),
e as (
  select send_log_id,
         (first_open_at is not null)  as opened,
         (first_click_at is not null) as clicked
  from public.v_send_first_events
),
r as (
  select send_log_id, (first_reply_at is not null) as replied
  from public.v_replies_per_send
),
b as (
  select send_log_id, (first_booked_at is not null) as booked
  from public.v_booked_per_send
)
select
  bse.campaign_id,
  bse.step_no,
  count(*)                                           as sent,
  count(*) filter (where e.opened)                   as opens,
  count(*) filter (where e.clicked)                  as clicks,
  count(*) filter (where r.replied)                  as replies,
  count(*) filter (where coalesce(b.booked,false))   as booked,
  min(bse.created_at)                                as first_sent_at,
  max(bse.created_at)                                as last_sent_at
from base bse
left join e on e.send_log_id = bse.id
left join r on r.send_log_id = bse.id
left join b on b.send_log_id = bse.id
group by 1,2
order by 1,2;

-- F) Daily cohort (by send date, all steps aggregated; add step if desired)
create or replace view public.v_campaign_daily_cohort as
with s as (
  select campaign_id, date_trunc('day', created_at)::date as sent_day, id as send_log_id
  from public.send_logs
),
e as (
  select send_log_id,
         (min(created_at) filter (where type='open'))  is not null as opened,
         (min(created_at) filter (where type='click')) is not null as clicked
  from public.tracking_events
  group by 1
),
r as (
  select s.id as send_log_id,
         (min(m.created_at)) is not null as replied
  from public.send_logs s
  join public.inbox_threads t on t.campaign_id = s.campaign_id and t.lead_id = s.lead_id
  join public.inbox_messages m on m.thread_id = t.id and m.direction='inbound'
  where m.created_at >= s.created_at
  group by 1
)
select
  s.campaign_id,
  s.sent_day,
  count(*)                                       as sent,
  count(*) filter (where coalesce(e.opened,false))  as opens,
  count(*) filter (where coalesce(e.clicked,false)) as clicks,
  count(*) filter (where coalesce(r.replied,false)) as replies
from s
left join e on e.send_log_id = s.send_log_id
left join r on r.send_log_id = s.send_log_id
group by 1,2
order by 2 desc;

