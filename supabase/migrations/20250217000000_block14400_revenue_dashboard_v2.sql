-- Block 14400 — Revenue / Activity Dashboard v2
-- Attach $ to Leads + Campaign Revenue View
-- "How much revenue did SmartSend help close?"
-- "Which campaign is actually making me money?"

-- ============================================================================
-- 1. ADD REVENUE FIELDS ON CONTACTS
-- ============================================================================

alter table public.contacts
  add column if not exists source_campaign_id uuid references public.campaigns(id) on delete set null,
  add column if not exists est_job_value numeric(12,2),   -- estimated value when hot
  add column if not exists actual_job_value numeric(12,2), -- filled when job is won
  add column if not exists won_at timestamptz;            -- when we marked it as won

-- Index for source_campaign_id lookups
create index if not exists contacts_source_campaign_id_idx on public.contacts(source_campaign_id) where source_campaign_id is not null;

-- Index for revenue queries
create index if not exists contacts_won_at_idx on public.contacts(won_at) where won_at is not null;
create index if not exists contacts_lead_status_idx on public.contacts(lead_status) where lead_status in ('hot', 'warm', 'won');

-- ============================================================================
-- 2. CREATE REVENUE VIEWS FOR DASHBOARD
-- ============================================================================

-- A. Revenue Summary (last 30 days)
create or replace view public.revenue_stats_30d as
with window as (
  select now() - interval '30 days' as start_time
),
won_contacts as (
  select
    count(*) as won_count,
    coalesce(sum(actual_job_value), 0) as won_revenue
  from public.contacts, window
  where lead_status = 'won'
    and won_at is not null
    and won_at >= window.start_time
),
pipeline_value as (
  select
    coalesce(sum(est_job_value) filter (where lead_status = 'hot'), 0) as hot_pipeline,
    coalesce(sum(est_job_value) filter (where lead_status = 'warm'), 0) as warm_pipeline
  from public.contacts
),
lifetime_revenue as (
  select
    coalesce(sum(actual_job_value), 0) as lifetime_revenue
  from public.contacts
  where lead_status = 'won' and actual_job_value is not null
)
select
  won_contacts.won_count,
  won_contacts.won_revenue,
  pipeline_value.hot_pipeline,
  pipeline_value.warm_pipeline,
  lifetime_revenue.lifetime_revenue
from won_contacts, pipeline_value, lifetime_revenue;

-- B. Revenue by Campaign
create or replace view public.revenue_by_campaign as
select
  c.source_campaign_id as campaign_id,
  count(*) as total_contacts,
  count(*) filter (where c.lead_status = 'hot') as hot_leads,
  count(*) filter (where c.lead_status = 'won') as won_leads,
  coalesce(sum(c.est_job_value), 0) as pipeline_estimate,
  coalesce(sum(c.actual_job_value), 0) as won_revenue
from public.contacts c
where c.source_campaign_id is not null
group by c.source_campaign_id;

-- Grant access to views
grant select on public.revenue_stats_30d to authenticated;
grant select on public.revenue_by_campaign to authenticated;

comment on view public.revenue_stats_30d is 'Revenue summary for last 30 days: won count, won revenue, pipeline estimates, lifetime revenue';
comment on view public.revenue_by_campaign is 'Revenue breakdown by campaign: contacts, hot/won leads, pipeline estimate, won revenue';



























































