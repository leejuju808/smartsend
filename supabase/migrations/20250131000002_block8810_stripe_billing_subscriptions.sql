-- Block 8810 — Stripe Billing + Plan Limits (Starter / Growth / Domination Actually Enforced)
-- Subscriptions table for linking users to plans and Stripe

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan text not null check (plan in ('starter','growth','domination')),
  status text not null default 'active' check (status in ('active','past_due','canceled','incomplete')),
  created_at timestamptz not null default now(),
  current_period_start timestamptz,
  current_period_end timestamptz
);

create unique index if not exists subscriptions_owner_id_idx
  on public.subscriptions(owner_id);

-- Enable RLS
alter table public.subscriptions enable row level security;

-- RLS Policies: Users can view their own subscription
drop policy if exists "Users can view own subscription" on public.subscriptions;
create policy "Users can view own subscription" on public.subscriptions
  for select
  using (auth.uid() = owner_id);

-- Service role can manage all subscriptions (for webhooks)
drop policy if exists "Service role can manage subscriptions" on public.subscriptions;
create policy "Service role can manage subscriptions" on public.subscriptions
  for all
  using (auth.jwt() ->> 'role' = 'service_role');

























































