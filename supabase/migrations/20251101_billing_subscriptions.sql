-- 007_billing_subscriptions.sql

create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,                -- maps to auth.users.id
  stripe_customer_id text not null,
  stripe_subscription_id text unique,
  plan text not null default 'starter', -- 'starter' | 'pro' | 'enterprise'
  status text not null default 'inactive',
  current_period_end timestamptz,
  updated_at timestamptz default now()
);

create index if not exists billing_subscriptions_user_idx on public.billing_subscriptions(user_id);
create unique index if not exists billing_subscriptions_customer_idx on public.billing_subscriptions(stripe_customer_id);

-- If you support multi-seat later, add workspace_id and attach plan to workspace.


