-- Block 21532 — SmartSend Plan-Based Sending Limits v1 (Starter / Growth / Domination)
-- This migration adds plan tiers to profiles and creates plan_limits table
-- Plan tiers: starter, growth, domination

-- ============================================================================
-- PART 1 — Add plan_tier to profiles
-- ============================================================================

alter table public.profiles
  add column if not exists plan_tier text not null default 'starter';

-- Ensure plan_tier has a check constraint for valid values
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints 
    where constraint_name = 'profiles_plan_tier_check' 
    and table_name = 'profiles'
  ) then
    alter table public.profiles
      add constraint profiles_plan_tier_check 
      check (plan_tier in ('starter', 'growth', 'domination'));
  end if;
end $$;

-- Create index for plan_tier lookups
create index if not exists idx_profiles_plan_tier on public.profiles(plan_tier);

-- ============================================================================
-- PART 2 — Create plan_limits table
-- ============================================================================

create table if not exists public.plan_limits (
  id uuid primary key default gen_random_uuid(),
  tier text not null unique, -- starter | growth | domination
  max_campaigns integer not null,
  monthly_email_limit integer not null,
  max_daily_limit integer not null,
  created_at timestamptz default now()
);

-- Add check constraint for tier values
alter table public.plan_limits
  add constraint plan_limits_tier_check 
  check (tier in ('starter', 'growth', 'domination'));

-- Create index for tier lookups
create index if not exists idx_plan_limits_tier on public.plan_limits(tier);

-- ============================================================================
-- PART 3 — Insert plan limits data
-- ============================================================================

insert into public.plan_limits (tier, max_campaigns, monthly_email_limit, max_daily_limit)
values
  ('starter', 1, 500, 25),
  ('growth', 3, 2000, 75),
  ('domination', 999, 10000, 200)
on conflict (tier) do update
set
  max_campaigns = excluded.max_campaigns,
  monthly_email_limit = excluded.monthly_email_limit,
  max_daily_limit = excluded.max_daily_limit;

-- ============================================================================
-- PART 4 — Add index to email_sends for monthly usage queries
-- ============================================================================

-- Index for efficient monthly usage queries (campaign_id + sent_at)
create index if not exists email_sends_sent_at_idx on public.email_sends(sent_at) 
  where sent_at is not null;

-- Index for campaign-based queries
create index if not exists email_sends_campaign_sent_at_idx on public.email_sends(campaign_id, sent_at) 
  where sent_at is not null;














































