-- 21_growth_metrics.sql - Founder KPIs & Quarterly Growth Review
-- Creates executive dashboard metrics for tracking ARR trajectory toward $1M

-- Calculate MRR from active subscriptions with plan pricing
-- Adapts to multiple possible subscription table schemas
create or replace view founder_kpis as
with active_subs as (
  -- Try to calculate from subscriptions table if it exists
  select 
    coalesce(sum(p.price_usd), 0) as total_mrr
  from subscriptions s
  left join plans p on p.id = s.plan
  where s.status = 'active'
  union all
  -- Also try billing_subscriptions if it exists
  select coalesce(sum(p.price_usd), 0) as total_mrr
  from billing_subscriptions bs
  left join plans p on p.id = bs.plan
  where bs.status = 'active'
),
org_revenue_metrics as (
  select
    sum(mrr) as total_mrr,
    avg(churn_rate) as avg_churn
  from org_revenue
),
referral_metrics as (
  select
    sum(case when r.status = 'activated' then 1 else 0 end) as activated_referrals,
    count(*) as total_referrals
  from referrals r
),
onboarding_metrics as (
  select
    count(distinct user_id) filter (where completed) as activated_users,
    (select count(distinct id) from auth.users) as total_users,
    round(
      count(distinct user_id) filter (where completed)::numeric /
      nullif((select count(distinct id) from auth.users), 0) * 100, 2
    ) as activation_rate
  from onboarding_progress
)
select
  round(coalesce((select max(total_mrr) from active_subs), 0)::numeric, 2) as mrr,
  round(coalesce((select avg_churn from org_revenue_metrics), 0)::numeric, 2) as churn,
  round(coalesce((select activation_rate from onboarding_metrics), 0)::numeric, 2) as activation,
  round(
    coalesce((select activated_referrals::numeric from referral_metrics), 0) /
    nullif((select total_referrals::numeric from referral_metrics), 0) * 100, 2
  ) as partner_roi;

-- Cash runway calculation
-- Note: You'll need to create a finance_snapshots table or adapt this to your finance tracking
create or replace view cash_runway as
select
  case 
    when (select sum(monthly_burn) from finance_snapshots) > 0 
    then round(
      (select sum(cash_on_hand) from finance_snapshots)::numeric / 
      (select sum(monthly_burn) from finance_snapshots)::numeric, 1
    )
    else null
  end as months_left;

-- If finance_snapshots doesn't exist, create a simple mock table
create table if not exists finance_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null,
  cash_on_hand numeric not null default 0,
  monthly_burn numeric not null default 0,
  created_at timestamptz default now()
);

-- Insert default values if table is empty
insert into finance_snapshots (snapshot_date, cash_on_hand, monthly_burn)
select current_date, 0, 0
where not exists (select 1 from finance_snapshots);

-- Grant access to authenticated users
grant select on founder_kpis to authenticated;
grant select on cash_runway to authenticated;

-- Create monthly metrics snapshot table for historical tracking
create table if not exists monthly_metrics (
  id uuid primary key default gen_random_uuid(),
  month_year text not null unique, -- YYYY-MM format
  monthly_revenue numeric default 0,
  churn_rate numeric default 0,
  activation_rate numeric default 0,
  partner_mrr numeric default 0,
  created_at timestamptz default now()
);

-- Index for efficient lookups
create index if not exists idx_monthly_metrics_month on monthly_metrics(month_year desc);

-- RLS on finance_snapshots - only service role can insert/update
alter table finance_snapshots enable row level security;
alter table monthly_metrics enable row level security;

-- Authenticated users can read, service role can manage
create policy "finance_snapshots_read" on finance_snapshots
  for select to authenticated using (true);

create policy "finance_snapshots_manage" on finance_snapshots
  for all to service_role using (true);

create policy "monthly_metrics_read" on monthly_metrics
  for select to authenticated using (true);

create policy "monthly_metrics_manage" on monthly_metrics
  for all to service_role using (true);

-- Create quarterly_reports table for storing historical quarterly reviews
create table if not exists quarterly_reports (
  quarter text primary key, -- e.g. "Q1-2025"
  report_data jsonb not null,
  created_at timestamptz default now()
);

-- Index for efficient lookups
create index if not exists idx_quarterly_reports_quarter on quarterly_reports(quarter desc);

-- RLS on quarterly_reports
alter table quarterly_reports enable row level security;

-- Authenticated users can read, service role can manage
create policy "quarterly_reports_read" on quarterly_reports
  for select to authenticated using (true);

create policy "quarterly_reports_manage" on quarterly_reports
  for all to service_role using (true);
