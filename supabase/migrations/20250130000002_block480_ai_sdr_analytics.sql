-- Block 480 — AI SDR Outcomes Dashboard (Replies • Meetings • Wins)
-- Analytics views for AI SDR performance tracking

-- ============================================================================
-- A. ai_sdr_campaign_stats — per-campaign outcomes
-- ============================================================================

create or replace view ai_sdr_campaign_stats as
select
  c.id as campaign_id,
  c.name as campaign_name,
  c.created_at as campaign_created_at,

  -- total leads in this campaign (that have ai_sdr_threads)
  count(distinct t.lead_id) as total_ai_leads,

  -- leads with at least one inbound email
  count(distinct case when e_in.id is not null then t.lead_id end) as leads_with_reply,

  -- reply rate (% of AI leads)
  case
    when count(distinct t.lead_id) = 0 then 0
    else round(
      100.0 * count(distinct case when e_in.id is not null then t.lead_id end)
      / count(distinct t.lead_id)
    , 1)
  end as reply_rate_pct,

  -- meetings
  count(distinct case when m.id is not null then t.lead_id end) as leads_with_meeting,
  count(distinct m.id) as total_meetings,

  -- close won / lost
  count(distinct case when t.status = 'closed_won' then t.lead_id end) as leads_closed_won,
  count(distinct case when t.status = 'closed_lost' then t.lead_id end) as leads_closed_lost

from campaigns c
left join ai_sdr_threads t on t.campaign_id = c.id
left join lateral (
  select id
  from emails e
  where e.lead_id = t.lead_id
    and e.direction = 'inbound'
  limit 1
) e_in on true
left join lateral (
  select m2.id
  from meetings m2
  where m2.lead_id = t.lead_id
  limit 1
) m on true
group by c.id, c.name, c.created_at;

-- ============================================================================
-- B. ai_sdr_daily_stats — per-day summary (for charts)
-- ============================================================================

create or replace view ai_sdr_daily_stats as
with days as (
  select
    date_trunc('day', e.created_at) as day,
    e.lead_id,
    e.direction
  from emails e
),
events as (
  select
    date_trunc('day', ev.created_at) as day,
    ev.event_type,
    th.campaign_id
  from ai_sdr_events ev
  join ai_sdr_threads th on th.id = ev.thread_id
),
meetings_agg as (
  select
    date_trunc('day', m.created_at) as day,
    m.id as meeting_id
  from meetings m
)
select
  d.day::date as day,

  -- inbound replies
  count(distinct case when d.direction = 'inbound' then d.lead_id end) as leads_with_reply,

  -- ai_sdr events
  count(case when e2.event_type = 'send_followup' then 1 end) as ai_sends,
  count(case when e2.event_type = 'revive_lead' then 1 end) as ai_revives,
  count(case when e2.event_type = 'close_won' then 1 end) as closes_won,
  count(case when e2.event_type = 'close_lost' then 1 end) as closes_lost,

  -- meetings
  count(distinct m.meeting_id) as meetings_created

from days d
left join events e2 on e2.day = d.day
left join meetings_agg m on m.day = d.day

group by d.day::date
order by d.day::date desc;

-- ============================================================================
-- RLS: Views inherit RLS from underlying tables
-- ============================================================================

comment on view ai_sdr_campaign_stats is 'Per-campaign AI SDR performance metrics';
comment on view ai_sdr_daily_stats is 'Daily AI SDR activity summary for charts';


