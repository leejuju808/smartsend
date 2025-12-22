-- Stripe Billing + Plan Gates Migration
-- Creates billing_customers and subscriptions tables with RLS

create table if not exists billing_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique not null,
  created_at timestamp default now()
);

create type subscription_status as enum ('trialing','active','past_due','canceled','incomplete','incomplete_expired','unpaid');

create table if not exists subscriptions (
  id text primary key, -- stripe subscription id
  user_id uuid references auth.users(id) on delete cascade,
  price_id text not null,
  status subscription_status not null,
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  created_at timestamptz default now()
);

create index on subscriptions (user_id);

-- RLS
alter table billing_customers enable row level security;
alter table subscriptions enable row level security;

create policy "own billing row" on billing_customers
  for select using (auth.uid() = user_id);

create policy "own subs" on subscriptions
  for select using (auth.uid() = user_id);

-- Service role can manage all (for webhooks)
create policy "service_role_all_billing_customers" on billing_customers
  for all using (auth.role() = 'service_role');

create policy "service_role_all_subscriptions" on subscriptions
  for all using (auth.role() = 'service_role');

