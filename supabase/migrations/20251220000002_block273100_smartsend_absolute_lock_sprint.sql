-- BLOCK 273100 — SmartSend Absolute Lock Sprint
-- "If it’s not logged, it didn’t happen."
--
-- Goal (mechanical enforcement):
-- - SmartSend becomes the system-of-record for homeowner conversations and downstream ops decisions.
-- - Anything not provably created/linked inside SmartSend becomes uncounted in performance + ops signals.
--
-- Strategy:
-- - Ensure roofing jobs get origin-stamped when they have *any* SmartSend-proven linkage (lead/thread/campaign/proposal/storm intake).
-- - Ensure core performance/ops views only aggregate SmartSend-counted jobs.

-- -------------------------------------------------------------------
-- 1) Upgrade auto-origin stamping to cover all SmartSend-linked jobs
-- -------------------------------------------------------------------
-- NOTE: We intentionally avoid compile-time dependency on optional columns by
-- inspecting NEW via jsonb (columns absent from the table are simply missing
-- from the jsonb object).
create or replace function public.ss_roofing_jobs_auto_set_origin_source()
returns trigger
language plpgsql
security definer
as $$
declare
  v jsonb := to_jsonb(NEW);
begin
  -- If caller already set it, keep it.
  if NEW.origin_source is not null then
    return NEW;
  end if;

  -- Absolute lock principle:
  -- If the record is linked to any SmartSend object, it counts as logged-in-SmartSend.
  --
  -- These link fields exist across different schema generations:
  -- - lead_id / thread_id / campaign_id (inbox + campaigns)
  -- - proposal_id (proposal → job conversion)
  -- - storm_lead_id (storm intake system)
  if (v ? 'lead_id') and (v->>'lead_id') is not null then
    NEW.origin_source := 'smartsend';
    return NEW;
  end if;

  if (v ? 'thread_id') and (v->>'thread_id') is not null then
    NEW.origin_source := 'smartsend';
    return NEW;
  end if;

  if (v ? 'campaign_id') and (v->>'campaign_id') is not null then
    NEW.origin_source := 'smartsend';
    return NEW;
  end if;

  if (v ? 'proposal_id') and (v->>'proposal_id') is not null then
    NEW.origin_source := 'smartsend';
    return NEW;
  end if;

  if (v ? 'storm_lead_id') and (v->>'storm_lead_id') is not null then
    NEW.origin_source := 'smartsend';
    return NEW;
  end if;

  -- Otherwise: leave origin_source NULL (uncounted / untrusted).
  return NEW;
end;
$$;

comment on function public.ss_roofing_jobs_auto_set_origin_source() is
  'Block 273100: Auto-stamps roofing_jobs.origin_source=smartsend when the job is provably linked to SmartSend (lead/thread/campaign/proposal/storm intake).';

-- Recreate trigger to ensure it points at the upgraded function definition
drop trigger if exists trg_ss_roofing_jobs_auto_set_origin_source on public.roofing_jobs;
create trigger trg_ss_roofing_jobs_auto_set_origin_source
  before insert on public.roofing_jobs
  for each row
  execute function public.ss_roofing_jobs_auto_set_origin_source();

-- -------------------------------------------------------------------
-- 2) Backfill origin_source for existing logged jobs (best-effort)
-- -------------------------------------------------------------------
do $$
begin
  update public.roofing_jobs
  set
    origin_source = 'smartsend',
    origin_set_at = coalesce(origin_set_at, now())
  where origin_source is null
    and (
      lead_id is not null
      or thread_id is not null
      or campaign_id is not null
      or proposal_id is not null
      or storm_lead_id is not null
    );
exception when others then
  -- Some environments won't have all columns; skip quietly (fail-open).
  null;
end $$;

-- -------------------------------------------------------------------
-- 3) “No record = no credit” by gating core performance views
-- -------------------------------------------------------------------
-- These views are used directly by the app routes for hiring/crew/expansion decisions.
-- They must reflect SmartSend-counted reality only.

-- Sales Team Performance (origin-gated)
create or replace view public.v_sales_team_performance as
select
  l.workspace_id,
  l.assigned_to_user_id,
  u.email as rep_email,

  -- Lead metrics
  count(distinct l.id) as total_leads,
  count(distinct l.id) filter (where l.status = 'won') as leads_won,

  -- Conversion metrics
  count(distinct lc.lead_id) filter (where lc.converted_to_inspection = true) as inspections_scheduled,
  count(distinct lc.lead_id) filter (where lc.converted_to_quote = true) as quotes_sent,
  -- Absolute Lock: job credit only when a SmartSend-counted job actually exists
  count(distinct l.id) filter (where rj.id is not null) as jobs_won,

  -- Win rate
  case
    when count(distinct l.id) > 0 then
      (count(distinct l.id) filter (where rj.id is not null)::numeric / count(distinct l.id) * 100)
    else 0
  end as close_rate_pct,

  -- Average job size (SmartSend-counted jobs only)
  avg(rj.projected_job_value) as avg_job_size,

  -- Total revenue (SmartSend-counted jobs only)
  coalesce(sum(rj.projected_job_value), 0) as total_revenue,

  -- Response time
  avg(l.first_reply_time_minutes) as avg_response_time_minutes,

  -- Inspections per week (last 4 weeks)
  count(distinct lc.lead_id) filter (
    where lc.inspection_scheduled_at >= now() - interval '4 weeks'
      and lc.converted_to_inspection = true
  ) / 4.0 as inspections_per_week
from public.leads l
left join public.lead_conversions lc on l.id = lc.lead_id
left join public.roofing_jobs rj
  on l.id = rj.lead_id
 and rj.origin_source = 'smartsend'
left join auth.users u on l.assigned_to_user_id = u.id
where l.assigned_to_user_id is not null
group by l.workspace_id, l.assigned_to_user_id, u.email;

comment on view public.v_sales_team_performance is
  'Block 273100: Sales team performance is SmartSend-counted only (roofing_jobs.origin_source=smartsend).';

-- Crew Performance (origin-gated)
create or replace view public.v_crew_performance as
select
  rj.workspace_id,
  coalesce(rj.crew_name, 'Unassigned') as crew_name,

  count(*) filter (where rj.current_stage = 'COMPLETED') as jobs_completed,
  count(*) filter (where rj.current_stage in ('IN_PROGRESS', 'SCHEDULED_INSTALL')) as jobs_in_progress,

  -- Install speed
  avg(rj.install_duration_hours) filter (where rj.install_duration_hours is not null) as avg_install_hours,
  avg(rj.install_duration_hours / 24.0) filter (where rj.install_duration_hours is not null) as avg_install_days,

  -- Quality metrics
  avg(rj.quality_score) filter (where rj.quality_score is not null) as avg_quality_score,
  avg(rj.callback_rate) filter (where rj.callback_rate is not null) as avg_callback_rate,

  -- Profitability
  avg(rj.actual_margin_pct) filter (where rj.actual_margin_pct is not null) as avg_margin_pct,
  sum(rj.actual_gross_profit) filter (where rj.actual_gross_profit is not null) as total_profit,

  count(*) as total_jobs
from public.roofing_jobs rj
where (rj.crew_name is not null or rj.crew_id is not null)
  and rj.origin_source = 'smartsend'
group by rj.workspace_id, coalesce(rj.crew_name, 'Unassigned');

comment on view public.v_crew_performance is
  'Block 273100: Crew performance is SmartSend-counted only (roofing_jobs.origin_source=smartsend).';

-- Job Profitability (origin-gated)
create or replace view public.v_job_profitability as
select
  rj.workspace_id,
  rj.current_stage,
  rj.carrier,

  count(*) as job_count,
  avg(rj.projected_job_value) as avg_job_value,
  sum(rj.projected_job_value) as total_job_value,

  avg(rj.actual_margin_pct) filter (where rj.actual_margin_pct is not null) as avg_margin_pct,
  avg(rj.actual_gross_profit) filter (where rj.actual_gross_profit is not null) as avg_profit,
  sum(rj.actual_gross_profit) filter (where rj.actual_gross_profit is not null) as total_profit,

  count(*) filter (where rj.carrier is not null) as insurance_jobs,
  count(*) filter (where rj.carrier is null) as retail_jobs,

  avg(rj.actual_margin_pct) filter (where rj.carrier is not null and rj.actual_margin_pct is not null) as avg_insurance_margin,
  avg(rj.actual_margin_pct) filter (where rj.carrier is null and rj.actual_margin_pct is not null) as avg_retail_margin
from public.roofing_jobs rj
where rj.current_stage in ('COMPLETED', 'IN_PROGRESS', 'SCHEDULED_INSTALL')
  and rj.origin_source = 'smartsend'
group by rj.workspace_id, rj.current_stage, rj.carrier;

comment on view public.v_job_profitability is
  'Block 273100: Profitability analytics are SmartSend-counted only (roofing_jobs.origin_source=smartsend).';

-- Owner Dashboard (origin-gated)
-- Keeps "What does SmartSend say?" consistent across the app.
create or replace view public.v_owner_dashboard as
select
  w.id as workspace_id,

  -- Monthly Revenue
  coalesce(sum(rj.projected_job_value) filter (
    where rj.current_stage = 'COMPLETED'
      and date_trunc('month', rj.updated_at) = date_trunc('month', now())
  ), 0) as monthly_revenue,

  -- Profit Margin
  avg(rj.actual_margin_pct) filter (
    where rj.current_stage = 'COMPLETED'
      and rj.actual_margin_pct is not null
  ) as avg_profit_margin,

  -- Hot Leads Count (leads are already SmartSend records; keep as-is)
  count(*) filter (
    where l.quality_score >= 70
      and l.status = 'new'
  ) as hot_leads_count,

  -- Jobs at Risk
  count(*) filter (
    where rj.current_stage in ('CLAIM_PENDING', 'ADJUSTER_SCHEDULED')
      and rj.stage_changed_at < now() - interval '14 days'
  ) as jobs_at_risk,

  -- Avg Days to Complete Jobs
  avg(extract(epoch from (rj.updated_at - rj.created_at)) / 86400) filter (
    where rj.current_stage = 'COMPLETED'
  ) as avg_days_to_complete,

  -- Material Waste Trends (if tracked)
  count(*) filter (
    where rj.actual_material_cost > rj.est_material_cost * 1.1
  ) as high_waste_jobs,

  1.0 as weather_impact_score,
  0 as supplier_issues_count,

  -- Crew Efficiency
  avg(rj.install_duration_hours) filter (
    where rj.install_duration_hours is not null
  ) as avg_crew_hours,

  0 as avg_insurance_payout_days,

  -- Sales Rep Rankings (top 3, already origin-gated by v_sales_team_performance)
  (
    select jsonb_agg(s.obj order by (s.obj->>'total_revenue')::numeric desc)
    from (
      select jsonb_build_object(
        'rep_email', rep_email,
        'total_revenue', total_revenue,
        'win_rate', close_rate_pct
      ) as obj
      from public.v_sales_team_performance
      where workspace_id = w.id
      order by total_revenue desc
      limit 3
    ) s
  ) as top_sales_reps

from public.workspaces w
left join public.leads l
  on l.workspace_id = w.id
left join public.roofing_jobs rj
  on rj.workspace_id = w.id
 and rj.origin_source = 'smartsend'
group by w.id;

comment on view public.v_owner_dashboard is
  'Block 273100: Owner dashboard aggregates SmartSend-counted jobs only (roofing_jobs.origin_source=smartsend).';


