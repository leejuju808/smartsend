-- Block 21660 — SmartSend Roofing ROI Engine v1
-- ("SmartSend Made You $X This Month")
-- This migration creates ROI dashboard views to show revenue attributed to SmartSend
-- and calculate ROI based on subscription cost

-- ============================================================================
-- 1. ADD MONTHLY PRICE TO PLAN_LIMITS
-- ============================================================================

alter table public.plan_limits
  add column if not exists monthly_price numeric;

-- Update plan prices
update public.plan_limits
set monthly_price = case tier
  when 'starter' then 99
  when 'growth' then 199
  when 'domination' then 399
  else 0
end
where monthly_price is null;

-- ============================================================================
-- 2. CREATE ROI DASHBOARD VIEW
-- ============================================================================
-- Calculates SmartSend-attributed revenue and jobs for each user
-- A job is SmartSend-attributed if the lead has at least one email_sends row
-- OR at least one campaign_leads row

create or replace view public.roi_dashboard as
select
  u.id as user_id,

  -- 1) SmartSend-attributed revenue THIS MONTH
  coalesce((
    select sum(l.won_value)
    from public.leads l
    left join public.email_sends es on es.lead_id = l.id
    left join public.campaign_leads cl on cl.lead_id = l.id
    where l.user_id = u.id
      and l.outcome = 'won'
      and l.won_at is not null
      and date_trunc('month', l.won_at) = date_trunc('month', now())
      and (es.id is not null or cl.id is not null)
  ), 0) as smartsend_revenue_this_month,

  -- 2) SmartSend-attributed jobs THIS MONTH
  (
    select count(distinct l.id)
    from public.leads l
    left join public.email_sends es on es.lead_id = l.id
    left join public.campaign_leads cl on cl.lead_id = l.id
    where l.user_id = u.id
      and l.outcome = 'won'
      and l.won_at is not null
      and date_trunc('month', l.won_at) = date_trunc('month', now())
      and (es.id is not null or cl.id is not null)
  ) as smartsend_jobs_this_month

from public.profiles u;

-- Grant access
grant select on public.roi_dashboard to authenticated;

-- ============================================================================
-- 3. CREATE COMBINED ROI FULL DASHBOARD VIEW
-- ============================================================================
-- Combines ROI metrics with plan information for complete dashboard view
-- Note: This assumes revenue_dashboard view exists. If it doesn't, we'll create a simplified version.

create or replace view public.roi_full_dashboard as
select
  p.id as user_id,
  p.plan_tier,

  -- ROI metrics
  rd.smartsend_revenue_this_month,
  rd.smartsend_jobs_this_month,

  -- Plan pricing
  pl.monthly_price as plan_price,

  -- ROI multiple (X) = revenue / price
  case
    when pl.monthly_price is null or pl.monthly_price = 0 then null
    else (rd.smartsend_revenue_this_month / pl.monthly_price)
  end as roi_multiple,

  -- ROI % = (revenue – price) / price * 100
  case
    when pl.monthly_price is null or pl.monthly_price = 0 then null
    else ((rd.smartsend_revenue_this_month - pl.monthly_price) / pl.monthly_price) * 100
  end as roi_percent

from public.profiles p
left join public.roi_dashboard rd on rd.user_id = p.id
left join public.plan_limits pl on pl.tier = p.plan_tier;

-- Grant access
grant select on public.roi_full_dashboard to authenticated;

-- Comments for documentation
comment on view public.roi_dashboard is 'ROI metrics per user: SmartSend-attributed revenue and jobs this month';
comment on view public.roi_full_dashboard is 'Complete ROI dashboard combining revenue attribution, plan tier, and ROI calculations';














































