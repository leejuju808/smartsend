-- Meeting analytics funnel views and optional historical snapshot table

create or replace view public.v_meeting_thread_times as
select
  t.id as thread_id,
  t.campaign_id,
  t.lead_id,
  (
    select min(mi.detected_at)
    from public.meeting_intents mi
    where mi.thread_id = t.id
  ) as intent_at,
  (
    select min(ms.created_at)
    from public.meeting_slots ms
    where ms.thread_id = t.id
  ) as proposed_at,
  (
    select min(sq.created_at)
    from public.send_queue sq
    where sq.thread_id = t.id
      and coalesce(sq.source, '') in ('meeting_suggest', 'meeting_confirm', 'meeting_autobook')
  ) as drafted_at,
  t.booked_meeting_at as booked_at,
  t.assigned_to
from public.inbox_threads t
where t.has_meeting_intent is true;


create or replace view public.v_meeting_funnels as
select
  v.thread_id,
  v.campaign_id,
  v.lead_id,
  v.assigned_to,
  v.intent_at,
  v.proposed_at,
  v.drafted_at,
  v.booked_at,
  case when v.intent_at is not null then 1 else 0 end as s_intent,
  case when v.proposed_at is not null then 1 else 0 end as s_proposed,
  case when v.booked_at is not null then 1 else 0 end as s_booked,
  extract(epoch from (v.proposed_at - v.intent_at))::bigint as sec_intent_to_proposed,
  extract(epoch from (v.drafted_at - v.intent_at))::bigint as sec_intent_to_draft,
  extract(epoch from (v.booked_at - v.intent_at))::bigint as sec_intent_to_book,
  extract(epoch from (v.booked_at - v.proposed_at))::bigint as sec_proposed_to_book
from public.v_meeting_thread_times v;


create or replace view public.v_campaign_meeting_kpis as
with base as (
  select * from public.v_meeting_funnels
)
select
  campaign_id,
  count(*) as threads_with_intent,
  sum(s_proposed)::int as threads_with_proposals,
  sum(s_booked)::int as threads_booked,
  round(100.0 * nullif(sum(s_proposed), 0) / nullif(count(*), 0), 1) as intent_to_proposed_pct,
  round(100.0 * nullif(sum(s_booked), 0) / nullif(count(*), 0), 1) as intent_to_booked_pct,
  percentile_disc(0.5) within group (order by sec_intent_to_proposed) filter (where sec_intent_to_proposed is not null) as p50_intent_to_proposed_sec,
  percentile_disc(0.5) within group (order by sec_intent_to_book) filter (where sec_intent_to_book is not null) as p50_intent_to_book_sec,
  percentile_disc(0.5) within group (order by sec_proposed_to_book) filter (where sec_proposed_to_book is not null) as p50_proposed_to_book_sec
from base
group by campaign_id;


create or replace view public.v_campaign_meeting_kpis_by_rep as
with base as (
  select * from public.v_meeting_funnels
)
select
  campaign_id,
  assigned_to,
  count(*) as threads_with_intent,
  sum(s_proposed)::int as threads_with_proposals,
  sum(s_booked)::int as threads_booked,
  round(100.0 * nullif(sum(s_booked), 0) / nullif(count(*), 0), 1) as intent_to_booked_pct,
  percentile_disc(0.5) within group (order by sec_intent_to_book) filter (where sec_intent_to_book is not null) as p50_intent_to_book_sec
from base
group by campaign_id, assigned_to;


create or replace view public.v_campaign_booked_daily as
select
  v.campaign_id,
  (v.booked_at at time zone 'UTC')::date as d_utc,
  count(*) as booked
from public.v_meeting_funnels v
where v.booked_at is not null
group by v.campaign_id, (v.booked_at at time zone 'UTC')::date
order by d_utc desc;


create table if not exists public.meeting_kpi_daily (
  d_utc date not null,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  threads_with_intent int not null,
  threads_with_proposals int not null,
  threads_booked int not null,
  intent_to_booked_pct numeric(5, 2),
  p50_intent_to_book_sec bigint,
  primary key (d_utc, campaign_id)
);



