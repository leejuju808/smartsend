-- Exit/goal switches on sequences
alter table public.sequences
  add column if not exists exit_on_unsubscribe boolean not null default true,
  add column if not exists exit_on_reply       boolean not null default true,
  add column if not exists exit_on_bounce      boolean not null default true,
  add column if not exists goal_on_click       boolean not null default false, -- mark completed when any click happens
  add column if not exists goal_on_open        boolean not null default false; -- (optional) completed on first open

-- Track first engagement times on enrollments (for analytics)
alter table public.sequence_enrollments
  add column if not exists first_opened_at timestamptz,
  add column if not exists first_clicked_at timestamptz,
  add column if not exists completed_at timestamptz;

-- View: per-sequence, per-step send/engagement (last 90d enrollments)
create or replace view public.v_sequence_step_funnel as
with last90 as (
  select id from public.sequence_enrollments
  where created_at >= now() - interval '90 days'
)
select
  s.workspace_id,
  s.id as sequence_id,
  st.position,
  -- sent: jobs connected to an enrollment currently at or past this step
  count(j.*) filter (where j.status = 'sent') as sent,
  count(j.*) filter (where j.delivered_at is not null) as delivered,
  count(j.*) filter (where j.bounced_at   is not null) as bounced,
  -- opens/clicks via events
  count(*) filter (where e.event_type = 'opened') as opens,
  count(*) filter (where e.event_type = 'clicked') as clicks
from public.sequences s
join public.sequence_steps st on st.sequence_id = s.id
left join public.sequence_enrollments se on se.sequence_id = s.id
left join public.email_jobs j on j.campaign_id = s.campaign_id
  and j.template_id = coalesce(st.template_id, j.template_id) -- heuristic mapping
  and se.to_email = j.to_email
left join public.email_events e on e.job_id = j.id
where s.status in ('active','paused','archived')
  and (se.id is null or se.id in (select id from last90))
group by 1,2,3
order by 1,2,3;

alter view public.v_sequence_step_funnel set (security_invoker = on);

-- View: time-to-open (median) per step (using percentile_disc)
create or replace view public.v_sequence_step_time_to_open as
select
  s.workspace_id,
  s.id as sequence_id,
  st.position,
  percentile_disc(0.5) within group (order by extract(epoch from (ev_open.first_open - j.sent_time)) / 60.0) as median_minutes_to_open
from public.sequences s
join public.sequence_steps st on st.sequence_id = s.id
join lateral (
  select j2.id as job_id,
         j2.sent_at as sent_time
  from public.email_jobs j2
  where j2.campaign_id = s.campaign_id
) j on true
join lateral (
  select min(e.created_at) as first_open
  from public.email_events e
  where e.job_id = j.job_id and e.event_type = 'opened'
) ev_open on ev_open.first_open is not null
group by 1,2,3;

alter view public.v_sequence_step_time_to_open set (security_invoker = on);