-- Billing & Usage Tracking System
-- Maps teams to Stripe customers/subscriptions and tracks usage for metered billing

-- 1) Map team ↔ Stripe
create table if not exists public.billing_customers (
  team_id uuid primary key references public.teams(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text,
  item_sends_id text,         -- Stripe subscription_item for "Email Sends (metered)"
  item_ai_id text,            -- Stripe subscription_item for "AI Rewrites (metered)"
  plan text,                  -- e.g., 'starter', 'pro'
  status text,                -- 'active','trialing','past_due','canceled','incomplete'...
  current_period_end timestamptz,
  created_at timestamptz not null default now()
);

-- 2) Local usage buffer (flush to Stripe usage records)
create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  metric text not null check (metric in ('send','ai_rewrite','seat')),
  quantity integer not null check (quantity > 0),
  at timestamptz not null default now(),
  stripe_usage_record_id text,
  reported boolean not null default false
);

-- 3) Fast monthly rollups for dashboard
create materialized view if not exists public.v_usage_month AS
select
  team_id,
  date_trunc('month', at) as month,
  metric,
  sum(quantity) as qty
from public.usage_events
group by 1,2,3;

-- 4) Indexes for performance
create index if not exists idx_usage_events_unreported on public.usage_events(reported) where reported = false;
create index if not exists idx_usage_events_team_metric on public.usage_events(team_id, metric, at);
create index if not exists idx_billing_customers_stripe_customer on public.billing_customers(stripe_customer_id);
create index if not exists idx_billing_customers_stripe_subscription on public.billing_customers(stripe_subscription_id);

-- 5) RLS (anyone on the team can view; nobody inserts directly from client)
alter table public.billing_customers enable row level security;
alter table public.usage_events enable row level security;

create policy "billing read team" on public.billing_customers
for select using (exists (
  select 1 from public.team_members tm
  where tm.team_id = billing_customers.team_id and tm.user_id = auth.uid()
));

create policy "usage read team" on public.usage_events
for select using (exists (
  select 1 from public.team_members tm
  where tm.team_id = usage_events.team_id and tm.user_id = auth.uid()
));

-- Note: INSERT/UPDATE on usage_events should only be done by service role (Edge Functions)
-- INSERT/UPDATE on billing_customers should only be done by service role (webhook)

