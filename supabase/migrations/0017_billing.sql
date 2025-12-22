-- Plans reference (store Stripe price IDs)

create table if not exists public.plans (
  id text primary key,                     -- 'free' | 'pro' | 'team'
  name text not null,
  stripe_price_id text,                    -- price_xxx (recurring)
  monthly_quota_emails int not null,
  max_seats int,
  sort int not null default 0
);

-- Link users to Stripe customers

create table if not exists public.stripe_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  customer_id text not null,               -- cus_xxx
  created_at timestamptz not null default now()
);

-- Project-level subscription (one active per project)

create table if not exists public.subscriptions (
  id text primary key,                     -- sub_xxx
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, -- payer
  customer_id text not null,               -- cus_xxx
  price_id text not null,                  -- price_xxx
  plan_id text not null references public.plans(id),
  status text not null,                    -- trialing | active | past_due | canceled | incomplete
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  seats int not null default 1,
  created_at timestamptz not null default now()
);

-- Simple usage meter (emails this month)

create view public.v_monthly_email_usage as
select
  p.id as project_id,
  date_trunc('month', e.created_at) as month,
  count(*) filter (where e.direction='outbound') as outbound_emails
from public.projects p
left join public.emails e on e.project_id=p.id
group by 1,2;

-- RLS

alter table public.plans enable row level security;
alter table public.stripe_customers enable row level security;
alter table public.subscriptions enable row level security;

create policy "plans readable" on public.plans for select using (true);

create policy "owner reads own customer" on public.stripe_customers
for select using (user_id = auth.uid());

create policy "members read subscription by project" on public.subscriptions
for select using (exists (
  select 1 from public.project_members pm
  where pm.project_id = subscriptions.project_id and pm.user_id = auth.uid()
));

-- Indexes for performance
create index if not exists idx_subscriptions_project_id on public.subscriptions(project_id);
create index if not exists idx_subscriptions_user_id on public.subscriptions(user_id);
create index if not exists idx_subscriptions_status on public.subscriptions(status);
create index if not exists idx_stripe_customers_customer_id on public.stripe_customers(customer_id);

