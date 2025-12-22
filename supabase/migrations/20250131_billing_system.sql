-- Billing system tables for Stripe integration
-- 08_billing.sql

create table if not exists billing_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_subscription_id text unique not null,
  status text not null, -- trialing | active | past_due | canceled | incomplete | unpaid
  current_period_end timestamptz,
  stripe_subscription_item_id text, -- cached for metered billing
  created_at timestamptz not null default now()
);

create index if not exists billing_subscriptions_user_idx on billing_subscriptions(user_id);

-- Add RLS policies
alter table billing_customers enable row level security;
alter table billing_subscriptions enable row level security;

-- Users can only see their own billing data
create policy "Users can view own billing customer" on billing_customers
  for select using (auth.uid() = user_id);

create policy "Users can view own subscriptions" on billing_subscriptions
  for select using (auth.uid() = user_id);

-- Service role can manage all billing data (for webhooks)
create policy "Service role can manage billing customers" on billing_customers
  for all using (auth.role() = 'service_role');

create policy "Service role can manage subscriptions" on billing_subscriptions
  for all using (auth.role() = 'service_role');