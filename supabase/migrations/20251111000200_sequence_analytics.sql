-- Sequence Analytics Rollups
-- Idempotent objects for per-step and branch level KPIs

-- A) Lightweight delivery logs -------------------------------------------------

create table if not exists public.delivery_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  sequence_id uuid not null references public.followup_sequences(id) on delete cascade,
  step_id uuid not null references public.followup_steps(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  status text not null default 'sent' check (status in ('sent','bounced','delivered','spam','error'))
);

create index if not exists idx_delivery_logs_seq_step on public.delivery_logs (sequence_id, step_id, status, created_at);

-- B) Step level event sources --------------------------------------------------

create or replace view public.v_step_events as
select
  dl.campaign_id,
  dl.sequence_id,
  dl.step_id,
  dl.lead_id,
  min(dl.created_at) filter (where dl.status in ('sent','delivered')) as first_send_at,
  bool_or(dl.status = 'bounced') as bounced
from public.delivery_logs dl
group by 1,2,3,4;

create or replace view public.v_step_opens as
select
  eo.lead_id,
  eo.message_id,
  min(eo.created_at) as first_open_at
from public.email_opens eo
group by 1,2;

create or replace view public.v_step_clicks as
select
  lc.lead_id,
  lc.message_id,
  min(lc.created_at) as first_click_at
from public.link_clicks lc
group by 1,2;

create or replace view public.v_message_to_step as
select
  dl.campaign_id,
  dl.sequence_id,
  dl.step_id,
  dl.lead_id,
  dl.message_id
from public.delivery_logs dl
where dl.message_id is not null;

create or replace view public.v_step_replies as
select
  se.campaign_id,
  se.sequence_id,
  se.step_id,
  se.lead_id,
  min(rl.created_at) as first_reply_at
from public.v_step_events se
join public.reply_logs rl
  on rl.lead_id = se.lead_id
where se.first_send_at is not null
  and rl.created_at >= se.first_send_at
group by 1,2,3,4;

-- C) Materialized rollups per step ---------------------------------------------

drop materialized view if exists public.mv_sequence_step_metrics cascade;

create materialized view public.mv_sequence_step_metrics as
with base as (
  select
    se.campaign_id,
    se.sequence_id,
    se.step_id,
    count(distinct se.lead_id) as sent_count,
    count(distinct se.lead_id) filter (where se.bounced) as bounce_count,
    min(se.first_send_at) as first_send_at
  from public.v_step_events se
  group by 1,2,3
),
open_events as (
  select
    ms.campaign_id,
    ms.sequence_id,
    ms.step_id,
    ms.lead_id,
    min(o.first_open_at) as first_open_at
  from public.v_message_to_step ms
  join public.v_step_opens o
    on o.message_id = ms.message_id
   and o.lead_id = ms.lead_id
  group by 1,2,3,4
),
click_events as (
  select
    ms.campaign_id,
    ms.sequence_id,
    ms.step_id,
    ms.lead_id,
    min(c.first_click_at) as first_click_at
  from public.v_message_to_step ms
  join public.v_step_clicks c
    on c.message_id = ms.message_id
   and c.lead_id = ms.lead_id
  group by 1,2,3,4
),
reply_events as (
  select
    sr.campaign_id,
    sr.sequence_id,
    sr.step_id,
    sr.lead_id,
    min(sr.first_reply_at) as first_reply_at
  from public.v_step_replies sr
  group by 1,2,3,4
),
open_stats as (
  select
    b.campaign_id,
    b.sequence_id,
    b.step_id,
    count(distinct oe.lead_id) as open_count,
    percentile_cont(0.5) within group (
      order by extract(epoch from (oe.first_open_at - b.first_send_at)) / 3600.0
    ) filter (
      where oe.first_open_at is not null
        and b.first_send_at is not null
        and oe.first_open_at >= b.first_send_at
    ) as median_hours_to_open
  from base b
  left join open_events oe
    on oe.campaign_id = b.campaign_id
   and oe.sequence_id = b.sequence_id
   and oe.step_id = b.step_id
  group by 1,2,3
),
click_stats as (
  select
    b.campaign_id,
    b.sequence_id,
    b.step_id,
    count(distinct ce.lead_id) as click_count
  from base b
  left join click_events ce
    on ce.campaign_id = b.campaign_id
   and ce.sequence_id = b.sequence_id
   and ce.step_id = b.step_id
  group by 1,2,3
),
reply_stats as (
  select
    b.campaign_id,
    b.sequence_id,
    b.step_id,
    count(distinct re.lead_id) as reply_count,
    percentile_cont(0.5) within group (
      order by extract(epoch from (re.first_reply_at - b.first_send_at)) / 3600.0
    ) filter (
      where re.first_reply_at is not null
        and b.first_send_at is not null
        and re.first_reply_at >= b.first_send_at
    ) as median_hours_to_reply
  from base b
  left join reply_events re
    on re.campaign_id = b.campaign_id
   and re.sequence_id = b.sequence_id
   and re.step_id = b.step_id
  group by 1,2,3
)
select
  b.campaign_id,
  b.sequence_id,
  b.step_id,
  b.sent_count,
  b.bounce_count,
  coalesce(os.open_count, 0) as open_count,
  coalesce(cs.click_count, 0) as click_count,
  coalesce(rs.reply_count, 0) as reply_count,
  case
    when b.sent_count > 0 then round((coalesce(os.open_count, 0)::numeric / b.sent_count) * 100, 2)
    else 0::numeric
  end as open_rate,
  case
    when b.sent_count > 0 then round((coalesce(cs.click_count, 0)::numeric / b.sent_count) * 100, 2)
    else 0::numeric
  end as click_rate,
  case
    when b.sent_count > 0 then round((coalesce(rs.reply_count, 0)::numeric / b.sent_count) * 100, 2)
    else 0::numeric
  end as reply_rate,
  os.median_hours_to_open,
  rs.median_hours_to_reply,
  now() as refreshed_at
from base b
left join open_stats os
  on os.campaign_id = b.campaign_id
 and os.sequence_id = b.sequence_id
 and os.step_id = b.step_id
left join click_stats cs
  on cs.campaign_id = b.campaign_id
 and cs.sequence_id = b.sequence_id
 and cs.step_id = b.step_id
left join reply_stats rs
  on rs.campaign_id = b.campaign_id
 and rs.sequence_id = b.sequence_id
 and rs.step_id = b.step_id;

create unique index if not exists uidx_mv_seq_step_metrics on public.mv_sequence_step_metrics (sequence_id, step_id);
create index if not exists idx_mv_seq_step_campaign on public.mv_sequence_step_metrics (campaign_id, sequence_id);

-- D) Branch performance rollups ------------------------------------------------

drop materialized view if exists public.mv_sequence_branch_metrics cascade;

create materialized view public.mv_sequence_branch_metrics as
select
  fs.sequence_id,
  fb.step_id,
  fb.goto_step,
  count(*)::int as hits,
  coalesce(
    round(
      count(*)::numeric * 100
      / nullif(sum(count(*)) over (partition by fs.sequence_id, fb.step_id), 0),
      2
    ),
    0::numeric
  ) as share_pct,
  now() as refreshed_at
from public.followup_branches fb
join public.followup_steps fs
  on fs.id = fb.step_id
join public.followup_state st
  on st.sequence_id = fs.sequence_id
 and st.current_step = fb.goto_step
group by fs.sequence_id, fb.step_id, fb.goto_step;

create unique index if not exists uidx_mv_seq_branch_metrics on public.mv_sequence_branch_metrics (sequence_id, step_id, goto_step);
create index if not exists idx_mv_seq_branch_step on public.mv_sequence_branch_metrics (step_id, goto_step);

-- E) Refresh helper & scheduling ----------------------------------------------

create or replace function public.refresh_sequence_analytics()
returns void
language plpgsql
set search_path = public
as $$
begin
  refresh materialized view public.mv_sequence_step_metrics;
  refresh materialized view public.mv_sequence_branch_metrics;
end;
$$;

create extension if not exists pg_cron;

select cron.schedule(
  'sequence_analytics_refresh',
  '*/30 * * * *',
  $$select public.refresh_sequence_analytics();$$
) where exists (select 1 from pg_extension where extname = 'pg_cron')
  and not exists (select 1 from cron.job where jobname = 'sequence_analytics_refresh');


