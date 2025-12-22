-- Lite Analytics Slice #4: MB/100 Analytics Views
-- Creates replies table (if needed) and metric aggregation views

-- OPTIONAL: create a minimal replies table if you don't already store inbound replies
create table if not exists public.replies (
  id uuid primary key default gen_random_uuid(),
  sender_email text not null,          -- prospect email (the person who replied)
  to_sender_email text,                -- which of your mailboxes they replied to
  message_id text,                     -- your internal id, if any
  campaign_id uuid,
  intent text,                         -- e.g., 'MEETING_INTENT' | 'NO_INTENT' | null
  body_excerpt text,
  received_at timestamptz not null default now()
);
create index if not exists replies_received_at_idx on public.replies(received_at);
alter table public.replies enable row level security;
create policy "replies read for authenticated" on public.replies for select to authenticated using (true);
create policy "replies insert via service role" on public.replies for insert to service_role with check (true);

-- ========== AGGREGATION WINDOWS ==========
-- Day buckets last 30 days
create or replace view public.metrics_days as
select generate_series::date as day
from generate_series( current_date - interval '29 days', current_date, interval '1 day');

-- Replies per day (last 30d)
create or replace view public.metrics_replies_daily as
select
  d.day,
  coalesce(count(r.id), 0)::int as replies
from public.metrics_days d
left join public.replies r
  on date(r.received_at) = d.day
group by d.day
order by d.day;

-- Meetings per day (last 30d)
create or replace view public.metrics_meetings_daily as
select
  d.day,
  coalesce(count(m.id), 0)::int as meetings
from public.metrics_days d
left join public.meetings m
  on date(m.detected_at) = d.day
group by d.day
order by d.day;

-- Rollups (last 30d totals)
create or replace view public.metrics_rollup_30d as
with r as (select sum(replies)::int as replies_30d from public.metrics_replies_daily),
     m as (select sum(meetings)::int as meetings_30d from public.metrics_meetings_daily)
select
  coalesce(r.replies_30d,0) as replies_30d,
  coalesce(m.meetings_30d,0) as meetings_30d,
  case when coalesce(r.replies_30d,0) = 0 then 0
       else round( (m.meetings_30d::numeric / nullif(r.replies_30d,0)) * 100, 2)
  end as mb_per_100_30d,
  case when coalesce(r.replies_30d,0) = 0 then 0
       else round( (m.meetings_30d::numeric / nullif(r.replies_30d,0)) * 100, 2)
  end as replies_to_meetings_pct_30d; -- same as MB/100, expressed as %

-- Today snapshot
create or replace view public.metrics_today as
select
  (select replies from public.metrics_replies_daily where day = current_date) as replies_today,
  (select meetings from public.metrics_meetings_daily where day = current_date) as meetings_today;

-- OPTIONAL: simple per-sender rollup last 7 days
create or replace view public.metrics_per_sender_7d as
with days as (
  select generate_series::date as day
  from generate_series(current_date - interval '6 days', current_date, interval '1 day')
),
rep as (
  select to_sender_email as sender_email, date(received_at) as day, count(*)::int as replies
  from public.replies
  where received_at >= current_date - interval '6 days'
  group by 1,2
),
meet as (
  select m.sender_email as sender_email, date(m.detected_at) as day, count(*)::int as meetings
  from public.meetings m
  where m.detected_at >= current_date - interval '6 days'
  group by 1,2
)
select
  coalesce(sp.sender_email, rep.sender_email, meet.sender_email) as sender_email,
  (select health_color from public.sender_health_today sht where sht.sender_email = coalesce(sp.sender_email, rep.sender_email, meet.sender_email)) as health_color,
  coalesce(sum(rep.replies),0)::int as replies_7d,
  coalesce(sum(meet.meetings),0)::int as meetings_7d,
  case when coalesce(sum(rep.replies),0) = 0 then 0
       else round((sum(meet.meetings)::numeric / nullif(sum(rep.replies),0)) * 100, 2)
  end as mb_per_100_7d
from (
  select distinct sender_email from public.send_policies
) sp
left join rep on rep.sender_email = sp.sender_email
left join meet on meet.sender_email = sp.sender_email
group by 1,2
order by mb_per_100_7d desc nulls last;
