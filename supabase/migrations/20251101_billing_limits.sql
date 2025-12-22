-- Billing and Plan Limits Migration
-- Adds plan limits table and usage tracking columns to teams

-- Add billing columns to teams table
alter table teams
  add column if not exists plan text default 'free',
  add column if not exists stripe_price_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_customer_id text,
  add column if not exists usage_leads int default 0,
  add column if not exists usage_sends int default 0,
  add column if not exists usage_seats int default 1;

-- Create plan_limits table
create table if not exists plan_limits (
  plan text primary key,
  max_leads int,
  max_sends int,
  max_seats int,
  price_id text
);

-- Insert free plan limits
insert into plan_limits(plan, max_leads, max_sends, max_seats, price_id)
values
  ('free', 500, 200, 1, null)
on conflict (plan) do nothing;

-- Add indexes for performance
create index if not exists idx_teams_plan on teams(plan);
create index if not exists idx_teams_stripe_price_id on teams(stripe_price_id);

