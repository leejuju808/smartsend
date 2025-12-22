-- 07_billing.sql - Stripe Billing Integration
-- Creates subscriptions table for managing user plans (free, pro, agency)

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  org_id uuid not null,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan text not null default 'free', -- free | pro | agency
  status text not null default 'active',
  current_period_end timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_subscriptions_user on subscriptions(user_id);
create index if not exists idx_subscriptions_org on subscriptions(org_id);
create index if not exists idx_subscriptions_stripe_customer on subscriptions(stripe_customer_id);
create index if not exists idx_subscriptions_stripe_subscription on subscriptions(stripe_subscription_id);

-- RLS policies
alter table subscriptions enable row level security;

-- Users can read their own subscriptions
create policy "Users can read own subscriptions" on subscriptions
  for select to authenticated
  using (auth.uid() = user_id);

-- Service role can manage all subscriptions (for webhooks)
create policy "Service role can manage all subscriptions" on subscriptions
  for all to service_role
  using (true);

-- Trigger to update updated_at
create or replace function update_subscriptions_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_subscriptions_updated_at
  before update on subscriptions
  for each row
  execute function update_subscriptions_updated_at();

