-- Block 12600 — Job Value Dashboard v1
-- Revenue Tracking, Funnel Metrics, Close Rate Analytics
-- This migration creates views and functions for revenue dashboard

-- ============================================================================
-- 1. REVENUE JOBS VIEW
-- ============================================================================
-- Aggregates job wins with campaign attribution
create or replace view public.revenue_jobs_view as
select
  c.workspace_id,
  c.id as contact_id,
  c.job_value,
  c.job_won_at,
  c.estimate_amount,
  c.estimate_sent_at,
  c.pipeline_stage,
  c.inspection_at,
  c.created_at as lead_created_at,
  cc.campaign_id,
  camp.name as campaign_name
from public.contacts c
left join public.campaign_contacts cc on cc.contact_id = c.id
left join public.campaigns camp on camp.id = cc.campaign_id;

-- Grant access
grant select on public.revenue_jobs_view to authenticated;

-- Create index for performance (on underlying table)
-- Note: indexes on views don't exist, but we ensure contacts table has proper indexes
-- from Block 12500

-- ============================================================================
-- 2. REVENUE DASHBOARD AGGREGATION FUNCTION
-- ============================================================================
-- RPC function to get revenue dashboard data for a workspace and date range
create or replace function public.get_revenue_dashboard(
  p_workspace_id uuid,
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_campaign_id uuid default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_result jsonb;
  v_kpis jsonb;
  v_funnel jsonb;
  v_revenue_over_time jsonb;
  v_campaigns jsonb;
  v_pipeline_value jsonb;
begin
  -- KPIs: Jobs Won, Revenue Won, Avg Job Value, Leads, Inspections, Estimates, Close Rates
  select jsonb_build_object(
    'jobsWon', coalesce(sum(case when c.job_won_at between p_start_date and p_end_date then 1 else 0 end), 0),
    'revenueWon', coalesce(sum(case when c.job_won_at between p_start_date and p_end_date then c.job_value else 0 end), 0),
    'avgJobValue', coalesce(avg(case when c.job_won_at between p_start_date and p_end_date then c.job_value else null end), null),
    'leads', coalesce(count(*) filter (where c.created_at between p_start_date and p_end_date), 0),
    'inspections', coalesce(count(*) filter (where c.inspection_at between p_start_date and p_end_date), 0),
    'estimates', coalesce(count(*) filter (where c.estimate_sent_at between p_start_date and p_end_date), 0),
    'closeRateEstimates', case 
      when count(*) filter (where c.estimate_sent_at between p_start_date and p_end_date) > 0
      then round(
        (count(*) filter (where c.job_won_at between p_start_date and p_end_date)::numeric / 
         count(*) filter (where c.estimate_sent_at between p_start_date and p_end_date)::numeric) * 100,
        2
      )
      else 0
    end,
    'closeRateLeads', case
      when count(*) filter (where c.created_at between p_start_date and p_end_date) > 0
      then round(
        (count(*) filter (where c.job_won_at between p_start_date and p_end_date)::numeric /
         count(*) filter (where c.created_at between p_start_date and p_end_date)::numeric) * 100,
        2
      )
      else 0
    end,
    'pipelineValue', (
      select jsonb_build_object(
        'estimateTotal', coalesce(sum(case when c2.pipeline_stage = 'estimate_sent' then c2.estimate_amount else 0 end), 0),
        'jobsWonFuture', coalesce(sum(case when c2.pipeline_stage = 'job_won' then c2.job_value else 0 end), 0)
      )
      from public.contacts c2
      where c2.workspace_id = p_workspace_id
        and c2.pipeline_stage in ('estimate_sent', 'job_won')
        and (p_campaign_id is null or exists (
          select 1 from public.campaign_contacts cc2 
          where cc2.contact_id = c2.id and cc2.campaign_id = p_campaign_id
        ))
    )
  ) into v_kpis
  from public.contacts c
  where c.workspace_id = p_workspace_id
    and (p_campaign_id is null or exists (
      select 1 from public.campaign_contacts cc 
      where cc.contact_id = c.id and cc.campaign_id = p_campaign_id
    ));

  -- Funnel: New Leads → Inspections → Estimates → Won
  select jsonb_build_object(
    'newLeads', coalesce(count(*) filter (
      where c.created_at between p_start_date and p_end_date
    ), 0),
    'inspections', coalesce(count(*) filter (
      where c.inspection_at between p_start_date and p_end_date
    ), 0),
    'estimates', coalesce(count(*) filter (
      where c.estimate_sent_at between p_start_date and p_end_date
    ), 0),
    'jobsWon', coalesce(count(*) filter (
      where c.job_won_at between p_start_date and p_end_date
    ), 0)
  ) into v_funnel
  from public.contacts c
  where c.workspace_id = p_workspace_id
    and (p_campaign_id is null or exists (
      select 1 from public.campaign_contacts cc 
      where cc.contact_id = c.id and cc.campaign_id = p_campaign_id
    ));

  -- Revenue Over Time: Group by day
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'date', date_trunc('day', c.job_won_at)::text,
      'revenue', sum(c.job_value)
    ) order by date_trunc('day', c.job_won_at)
  ), '[]'::jsonb) into v_revenue_over_time
  from public.contacts c
  where c.workspace_id = p_workspace_id
    and c.job_won_at between p_start_date and p_end_date
    and c.job_value is not null
    and (p_campaign_id is null or exists (
      select 1 from public.campaign_contacts cc 
      where cc.contact_id = c.id and cc.campaign_id = p_campaign_id
    ))
  group by date_trunc('day', c.job_won_at);

  -- Campaign Revenue Attribution
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'campaignId', camp.id,
      'campaignName', camp.name,
      'leads', count(distinct c.id),
      'jobsWon', count(distinct c.id) filter (where c.job_won_at between p_start_date and p_end_date),
      'revenueWon', coalesce(sum(c.job_value) filter (where c.job_won_at between p_start_date and p_end_date), 0),
      'avgJobValue', coalesce(avg(c.job_value) filter (where c.job_won_at between p_start_date and p_end_date), null),
      'closeRate', case
        when count(distinct c.id) filter (where c.estimate_sent_at between p_start_date and p_end_date) > 0
        then round(
          (count(distinct c.id) filter (where c.job_won_at between p_start_date and p_end_date)::numeric /
           count(distinct c.id) filter (where c.estimate_sent_at between p_start_date and p_end_date)::numeric) * 100,
          2
        )
        else 0
      end
    ) order by sum(c.job_value) filter (where c.job_won_at between p_start_date and p_end_date) desc nulls last
  ), '[]'::jsonb) into v_campaigns
  from public.campaigns camp
  inner join public.campaign_contacts cc on cc.campaign_id = camp.id
  inner join public.contacts c on c.id = cc.contact_id
  where camp.workspace_id = p_workspace_id
    and (p_campaign_id is null or camp.id = p_campaign_id)
    and c.created_at between p_start_date and p_end_date
  group by camp.id, camp.name;

  -- Build final result
  v_result := jsonb_build_object(
    'kpis', v_kpis,
    'funnel', v_funnel,
    'revenueOverTime', v_revenue_over_time,
    'campaigns', v_campaigns
  );

  return v_result;
end;
$$;

-- Grant execute to authenticated users
grant execute on function public.get_revenue_dashboard(uuid, timestamptz, timestamptz, uuid) to authenticated;

-- ============================================================================
-- 3. PIPELINE VALUE SNAPSHOT VIEW (Current Active Pipeline)
-- ============================================================================
-- View for current pipeline value by stage
create or replace view public.pipeline_value_snapshot as
select
  workspace_id,
  count(*) filter (where pipeline_stage = 'new_lead') as new_leads_count,
  count(*) filter (where pipeline_stage = 'inspection') as inspections_count,
  coalesce(sum(estimate_amount) filter (where pipeline_stage = 'estimate_sent'), 0) as estimate_total,
  count(*) filter (where pipeline_stage = 'estimate_sent') as estimates_count,
  coalesce(sum(job_value) filter (where pipeline_stage = 'job_won'), 0) as jobs_won_value,
  count(*) filter (where pipeline_stage = 'job_won') as jobs_won_count
from public.contacts
where pipeline_stage is not null
group by workspace_id;

-- Grant access
grant select on public.pipeline_value_snapshot to authenticated;

