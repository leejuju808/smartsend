-- Team-Based Billing System Migration
-- Single source of truth for plan limits and team billing

-- 1) Plan limits catalog (editable by you; read-only in app)
create table if not exists public.plan_limits (
  plan text primary key,              -- 'free','starter','pro'
  daily_cap int not null,             -- max emails/day per team
  ai_rewrites_month int not null,     -- AI variants/month/team
  team_seats int not null,            -- members
  campaigns int not null,             -- active campaigns
  created_at timestamptz default now()
);

-- Seed plan limits
insert into public.plan_limits(plan,daily_cap,ai_rewrites_month,team_seats,campaigns) values
('free',   25,   50,  1, 1)
on conflict (plan) do update set
  daily_cap = excluded.daily_cap,
  ai_rewrites_month = excluded.ai_rewrites_month,
  team_seats = excluded.team_seats,
  campaigns = excluded.campaigns;

insert into public.plan_limits(plan,daily_cap,ai_rewrites_month,team_seats,campaigns) values
('starter',200,  500, 3, 5),
('pro',    1000, 3000,10, 50)
on conflict (plan) do update set
  daily_cap = excluded.daily_cap,
  ai_rewrites_month = excluded.ai_rewrites_month,
  team_seats = excluded.team_seats,
  campaigns = excluded.campaigns;

-- 2) Ensure billing_customers table exists with team_id and plan
create table if not exists public.billing_customers (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  stripe_customer_id text unique not null,
  plan text not null default 'free',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Add plan column if it doesn't exist
do $$ begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'billing_customers' and column_name = 'plan'
  ) then
    alter table public.billing_customers add column plan text not null default 'free';
  end if;
end $$;

-- Ensure default fallback for non-paying teams
alter table public.billing_customers
  alter column plan set default 'free';

-- 3) Create billing_subscriptions table for team-level subscriptions
create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  stripe_subscription_id text unique not null,
  status text not null default 'active',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 4) Usage tracking view for monthly metrics
create or replace view public.v_usage_month as
select
  bc.team_id,
  date_trunc('month', created_at) as month,
  'sends' as metric,
  count(*)::int as qty
from public.send_queue sq
join public.campaigns c on c.id = sq.campaign_id
join public.billing_customers bc on bc.team_id = c.team_id
where sq.status = 'sent' and sq.created_at >= date_trunc('month', now() - interval '6 months')
group by bc.team_id, month
union all
select
  bc.team_id,
  date_trunc('month', created_at) as month,
  'ai_rewrite' as metric,
  count(*)::int as qty
from public.template_versions tv
join public.campaigns c on c.id = tv.campaign_id
join public.billing_customers bc on bc.team_id = c.team_id
where tv.variant_key is not null and tv.created_at >= date_trunc('month', now() - interval '6 months')
group by bc.team_id, month;

-- 5) Quick view to read limits with team
create or replace view public.v_team_plan as
select 
  bc.team_id, 
  coalesce(bc.plan,'free') as plan, 
  pl.*
from public.billing_customers bc
join public.plan_limits pl on pl.plan = coalesce(bc.plan,'free');

-- 6) RLS Policies
alter table public.plan_limits enable row level security;
create policy "plans_public_read" on public.plan_limits
  for select using (true);

alter table public.billing_customers enable row level security;
alter table public.billing_subscriptions enable row level security;

-- Team members can read billing info for their team
create policy "team_reads_billing" on public.billing_customers
  for select using (
    exists (
      select 1 from public.team_members tm 
      where tm.team_id = billing_customers.team_id and tm.user_id = auth.uid()
    )
  );

create policy "team_reads_subscriptions" on public.billing_subscriptions
  for select using (
    exists (
      select 1 from public.team_members tm 
      where tm.team_id = billing_subscriptions.team_id and tm.user_id = auth.uid()
    )
  );

-- Service role can manage all billing data (for webhooks)
create policy "service_role_all_billing" on public.billing_customers
  for all using (auth.role() = 'service_role');

create policy "service_role_all_subscriptions" on public.billing_subscriptions
  for all using (auth.role() = 'service_role');

-- 7) Indexes for performance
create index if not exists idx_billing_customers_team_id on public.billing_customers(team_id);
create index if not exists idx_billing_customers_stripe_id on public.billing_customers(stripe_customer_id);
create index if not exists idx_billing_subscriptions_team_id on public.billing_subscriptions(team_id);
create index if not exists idx_billing_subscriptions_stripe_id on public.billing_subscriptions(stripe_subscription_id);

-- 8) Grant access to views
grant select on public.v_team_plan to authenticated;
grant select on public.v_usage_month to authenticated;

-- 9) Helper function: Get team plan
create or replace function public.get_team_plan(p_team_id uuid)
returns text language sql stable as $$
  select coalesce(plan, 'free') from public.billing_customers where team_id = p_team_id;
$$;

grant execute on function public.get_team_plan(uuid) to authenticated;

