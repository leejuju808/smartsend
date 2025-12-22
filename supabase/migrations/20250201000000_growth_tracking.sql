-- Growth Tracking & Referrals Migration
-- Creates tables for tracking growth metrics, referrals, experiments, and usage

-- ============================================================================
-- 1. USER USAGE TRACKING (Extend profiles table)
-- ============================================================================

-- Add usage tracking columns to profiles
alter table if exists public.profiles
  add column if not exists first_campaign_sent_at timestamptz,
  add column if not exists emails_sent_count int default 0,
  add column if not exists campaigns_launched_count int default 0,
  add column if not exists replies_received_count int default 0;

create index if not exists idx_profiles_first_campaign 
  on public.profiles(first_campaign_sent_at) 
  where first_campaign_sent_at is not null;

-- Function to increment emails sent
create or replace function public.increment_user_emails(uid uuid, count int)
returns void language plpgsql security definer as $$
begin
  update public.profiles
    set emails_sent_count = coalesce(emails_sent_count, 0) + count,
        updated_at = now()
  where id = uid;
end; $$;

-- Function to mark first campaign sent
create or replace function public.mark_first_campaign_sent(uid uuid)
returns void language plpgsql security definer as $$
begin
  update public.profiles
    set first_campaign_sent_at = coalesce(first_campaign_sent_at, now()),
        campaigns_launched_count = coalesce(campaigns_launched_count, 0) + 1,
        updated_at = now()
  where id = uid
    and first_campaign_sent_at is null;
end; $$;

-- Function to increment replies
create or replace function public.increment_user_replies(uid uuid, count int)
returns void language plpgsql security definer as $$
begin
  update public.profiles
    set replies_received_count = coalesce(replies_received_count, 0) + count,
        updated_at = now()
  where id = uid;
end; $$;

-- Grant execute to service_role only
revoke all on function public.increment_user_emails(uuid, int) from public;
grant execute on function public.increment_user_emails(uuid, int) to service_role;

revoke all on function public.mark_first_campaign_sent(uuid) from public;
grant execute on function public.mark_first_campaign_sent(uuid) to service_role;

revoke all on function public.increment_user_replies(uuid, int) from public;
grant execute on function public.increment_user_replies(uuid, int) to service_role;

-- ============================================================================
-- 2. REFERRALS TABLE (Compat with existing schema)
-- ============================================================================

-- Note: Referrals table already exists with schema: id, inviter, invitee, email, status
-- We just need to add tracking columns if they don't exist

alter table if exists public.referrals
  add column if not exists converted_at timestamptz,
  add column if not exists reward_applied boolean default false,
  add column if not exists reward_applied_at timestamptz;

create index if not exists idx_referrals_converted 
  on public.referrals(status, converted_at) 
  where status = 'converted';

create index if not exists idx_referrals_reward_applied 
  on public.referrals(reward_applied) 
  where reward_applied = true;

-- ============================================================================
-- 3. GROWTH EXPERIMENTS TABLE
-- ============================================================================

create table if not exists public.growth_experiments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  hypothesis text,
  start_date timestamptz not null default now(),
  end_date timestamptz,
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'cancelled')),
  
  -- Configuration
  config jsonb default '{}',
  
  -- Results
  metrics jsonb default '{}',
  notes text,
  
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_growth_experiments_status 
  on public.growth_experiments(status);

create index if not exists idx_growth_experiments_dates 
  on public.growth_experiments(start_date, end_date);

-- RLS
alter table public.growth_experiments enable row level security;

-- Service role has full access
create policy "Service role has full access to growth_experiments"
  on public.growth_experiments for all
  to service_role
  using (true)
  with check (true);

-- Users can view all experiments (read-only)
create policy "Users can view growth experiments"
  on public.growth_experiments for select
  to authenticated
  using (true);

-- Update timestamp trigger
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_growth_experiments_updated on public.growth_experiments;
create trigger trg_growth_experiments_updated
  before update on public.growth_experiments
  for each row
  execute function public.touch_updated_at();

-- ============================================================================
-- 4. FOUNDER KPIS VIEW (Aggregated growth metrics)
-- ============================================================================

create or replace view public.founder_kpis as
select
  -- Activation metrics
  (select count(*) from public.profiles) as total_signups,
  (select count(*) from public.profiles where first_campaign_sent_at is not null) as activated_users,
  round(
    (select count(*)::float from public.profiles where first_campaign_sent_at is not null) /
    nullif((select count(*) from public.profiles), 0) * 100,
    2
  ) as activation_rate_pct,
  
  -- Upgrade metrics
  (select count(*) from public.profiles where plan in ('pro', 'enterprise')) as paid_users,
  round(
    (select count(*)::float from public.profiles where plan in ('pro', 'enterprise')) /
    nullif((select count(*) from public.profiles), 0) * 100,
    2
  ) as upgrade_rate_pct,
  
  -- Referral metrics (using existing 'status' field)
  (select count(*) from public.referrals) as total_referrals,
  (select count(*) from public.referrals where status = 'converted') as referral_conversions,
  round(
    (select count(*)::float from public.referrals where status = 'converted') /
    nullif((select count(*) from public.referrals), 0) * 100,
    2
  ) as referral_conversion_rate_pct,
  
  -- Usage metrics
  (select sum(emails_sent_count) from public.profiles) as total_emails_sent,
  (select sum(campaigns_launched_count) from public.profiles) as total_campaigns_launched,
  (select sum(replies_received_count) from public.profiles) as total_replies_received,
  
  -- Churn (last 30 days)
  (select count(*) from public.profiles 
   where plan != 'free' 
   and updated_at < now() - interval '30 days') as at_risk_users,
  
  now() as last_updated
;

-- Grant read access to authenticated users
grant select on public.founder_kpis to authenticated;
grant select on public.founder_kpis to anon;

-- ============================================================================
-- 5. GROWTH FUNNEL VIEW
-- ============================================================================

create or replace view public.growth_funnel as
select
  date_trunc('day', created_at) as signup_date,
  count(*) as signups,
  
  -- Activated (sent first campaign within 7 days)
  count(*) filter (
    where first_campaign_sent_at is not null 
    and first_campaign_sent_at <= created_at + interval '7 days'
  ) as activated_7d,
  
  -- Converted to paid
  count(*) filter (where plan in ('pro', 'enterprise')) as converted_paid,
  
  -- Churned (inactive for 30+ days)
  count(*) filter (
    where updated_at < now() - interval '30 days'
    and plan != 'free'
  ) as churned_30d
  
from public.profiles
where created_at >= now() - interval '90 days'
group by 1
order by 1 desc;

grant select on public.growth_funnel to authenticated;
grant select on public.growth_funnel to anon;

-- ============================================================================
-- 6. REFERRAL DASHBOARD VIEW (Using existing schema: inviter, status)
-- ============================================================================

create or replace view public.referral_dashboard as
select
  r.inviter as referrer_id,
  p.email as referrer_email,
  p.full_name as referrer_name,
  count(*) as total_referrals,
  count(*) filter (where r.status = 'converted') as conversions,
  round(
    count(*) filter (where r.status = 'converted')::float /
    nullif(count(*), 0) * 100,
    2
  ) as conversion_rate_pct,
  min(r.created_at) as first_referral,
  max(r.created_at) filter (where r.status = 'converted') as last_conversion
from public.referrals r
join public.profiles p on p.id = r.inviter
where r.inviter is not null
group by r.inviter, p.email, p.full_name
order by conversions desc, total_referrals desc;

grant select on public.referral_dashboard to authenticated;

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

comment on table public.referrals is 'Tracks referral invites and conversions';
comment on table public.growth_experiments is 'Log of A/B tests and growth experiments';
comment on view public.founder_kpis is 'Aggregated growth metrics for founders';
comment on view public.growth_funnel is 'Daily funnel view: signups → activation → conversion → retention';
comment on view public.referral_dashboard is 'Per-user referral performance metrics';

