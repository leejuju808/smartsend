-- Create plans table
create table if not exists plans (
  id text primary key,
  name text not null,
  price_usd numeric not null,
  emails_per_day int not null,
  ai_generations int not null,
  features text[]
);

-- Insert default plans
insert into plans (id, name, price_usd, emails_per_day, ai_generations, features)
values
  ('free', 'Free', 0, 50, 10, '{Basic dashboard, Limited AI generation}'),
  ('pro', 'Pro', 29, 500, 200, '{Unlimited sequences, Team invites, Analytics}'),
  ('enterprise', 'Enterprise', 99, 5000, 1000, '{Priority support, API access}')
on conflict (id) do nothing;

-- Create subscriptions table
create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  plan_id text references plans(id),
  stripe_customer_id text,
  stripe_subscription_id text,
  status text default 'inactive',
  current_period_end timestamptz,
  created_at timestamptz default now()
);

-- Add indexes for performance
create index if not exists idx_subscriptions_workspace_id on subscriptions(workspace_id);
create index if not exists idx_subscriptions_stripe_customer on subscriptions(stripe_customer_id);
create index if not exists idx_subscriptions_stripe_subscription on subscriptions(stripe_subscription_id);
create index if not exists idx_subscriptions_status on subscriptions(status);