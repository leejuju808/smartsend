-- Block 9500: SmartSend Billing & Subscription Guard v1 (Stripe + Feature Gates)
-- Creates user-based billing tables for SmartSend subscription management

-- Stripe customer linked to Supabase user
create table if not exists billing_customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id text not null,
  created_at timestamptz default now(),
  unique (user_id),
  unique (stripe_customer_id)
);

-- Stripe subscription state
create table if not exists billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text not null,
  status text not null, -- trialing | active | past_due | canceled | incomplete | etc.
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (stripe_subscription_id)
);

create index if not exists billing_subscriptions_user_id_idx on billing_subscriptions (user_id);
create index if not exists billing_subscriptions_status_idx on billing_subscriptions (status);

-- Enable RLS
alter table billing_customers enable row level security;
alter table billing_subscriptions enable row level security;

-- RLS Policies for billing_customers
drop policy if exists "Users can view own billing customer" on billing_customers;
create policy "Users can view own billing customer" on billing_customers
  for select
  using (auth.uid() = user_id);

-- Service role can manage billing customers (for webhooks)
drop policy if exists "Service role can manage billing customers" on billing_customers;
create policy "Service role can manage billing customers" on billing_customers
  for all
  using (auth.jwt() ->> 'role' = 'service_role');

-- RLS Policies for billing_subscriptions
drop policy if exists "Users can view own subscriptions" on billing_subscriptions;
create policy "Users can view own subscriptions" on billing_subscriptions
  for select
  using (auth.uid() = user_id);

-- Service role can manage subscriptions (for webhooks)
drop policy if exists "Service role can manage subscriptions" on billing_subscriptions;
create policy "Service role can manage subscriptions" on billing_subscriptions
  for all
  using (auth.jwt() ->> 'role' = 'service_role');

-- Trigger to update updated_at timestamp
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_billing_subscriptions_updated_at on billing_subscriptions;
create trigger update_billing_subscriptions_updated_at
  before update on billing_subscriptions
  for each row
  execute function update_updated_at_column();


































































