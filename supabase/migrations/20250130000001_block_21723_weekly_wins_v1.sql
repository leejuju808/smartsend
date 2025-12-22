-- Block 21723 — SmartSend Roofing "This Week's Wins" Dashboard Section v1
-- A weekly highlight reel that makes the roofer feel SmartSend is working

-- Create view: company_weekly_wins_view
-- Aggregates hot/warm leads, jobs booked, and values for Monday-Sunday (or rolling 7 days)

create or replace view public.company_weekly_wins_view as
with week as (
  select
    date_trunc('week', now()) as week_start,
    date_trunc('week', now()) + interval '7 days' as week_end
),
hot_leads as (
  select company_id, count(*) as hot_count
  from public.leads, week
  where (intent = 'hot' OR score_bucket = 'hot')
    and created_at >= week.week_start
    and created_at < week.week_end
    and company_id is not null
  group by company_id
),
warm_leads as (
  select company_id, count(*) as warm_count
  from public.leads, week
  where (intent = 'warm' OR score_bucket = 'warm')
    and created_at >= week.week_start
    and created_at < week.week_end
    and company_id is not null
  group by company_id
),
booked_jobs as (
  select
    company_id,
    count(*) as jobs_count,
    coalesce(sum(estimated_value), 0) as jobs_value,
    max(estimated_value) as biggest_job_value
  from public.jobs, week
  where booked_at >= week.week_start
    and booked_at < week.week_end
    and company_id is not null
  group by company_id
)
select
  coalesce(hot_leads.company_id, warm_leads.company_id, booked_jobs.company_id) as company_id,
  coalesce(hot_leads.hot_count, 0) as hot_leads,
  coalesce(warm_leads.warm_count, 0) as warm_leads,
  coalesce(booked_jobs.jobs_count, 0) as jobs_booked,
  coalesce(booked_jobs.jobs_value, 0) as booked_value,
  coalesce(booked_jobs.biggest_job_value, 0) as biggest_job_value
from hot_leads
full join warm_leads
  on warm_leads.company_id = hot_leads.company_id
full join booked_jobs
  on booked_jobs.company_id = coalesce(hot_leads.company_id, warm_leads.company_id);

-- Grant access to authenticated users
grant select on public.company_weekly_wins_view to authenticated;

-- Comment on the view
comment on view public.company_weekly_wins_view is
  'Weekly wins aggregation: hot/warm leads generated, jobs booked, and values for the current week (Monday-Sunday). Builds trust and shows ROI.';











































