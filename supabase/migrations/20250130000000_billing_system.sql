-- A) Billing accounts (one per user)
create table if not exists public.billing_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  plan_id uuid references public.billing_plans(id),
  status text check (status in ('active','trialing','past_due','canceled')) default 'trialing',
  trial_ends_at timestamptz,
  period_end timestamptz,
  seat_limit int default 1,
  usage_soft_cap int default 1000,
  usage_hard_cap int default 2000,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_ba_user on public.billing_accounts(user_id);

-- B) Available plans
create table if not exists public.billing_plans (
  id uuid primary key default gen_random_uuid(),
  stripe_price_id text unique,
  name text not null,
  monthly_price numeric not null,
  seat_limit int default 1,
  usage_soft_cap int default 1000,
  usage_hard_cap int default 2000,
  features jsonb default '{}'::jsonb,
  is_active boolean default true
);

-- Insert example tiers
insert into public.billing_plans (name, stripe_price_id, monthly_price, seat_limit, usage_soft_cap, usage_hard_cap, features)
values
  ('Starter', 'price_starter', 29, 1, 1000, 2000, '{"ai":"basic","support":"email"}'),
  ('Pro', 'price_pro', 79, 5, 10000, 20000, '{"ai":"enhanced","support":"priority"}')
on conflict (stripe_price_id) do nothing;

-- C) Usage ledger
create table if not exists public.billing_usage (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.billing_accounts(id) on delete cascade,
  day date not null default current_date,
  metric text not null,       -- e.g., 'emails_sent','ai_calls'
  qty int not null default 0,
  created_at timestamptz default now(),
  unique (account_id, day, metric)
);

-- D) Stripe event logs (webhook store)
create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  created_at timestamptz default now(),
  payload jsonb not null
);

-- E) Helper views
create or replace view public.v_billing_summary as
select
  b.user_id,
  p.name as plan_name,
  b.status,
  b.period_end,
  b.usage_soft_cap,
  coalesce(sum(u.qty) filter (where u.metric='emails_sent'),0) as emails_sent_today
from public.billing_accounts b
left join public.billing_plans p on p.id = b.plan_id
left join public.billing_usage u on u.account_id = b.id and u.day=current_date
group by 1,2,3,4,5;

-- Enable RLS
alter table public.billing_accounts enable row level security;
alter table public.billing_plans enable row level security;
alter table public.billing_usage enable row level security;
alter table public.stripe_events enable row level security;

-- RLS Policies
create policy "Users can view own billing account" on public.billing_accounts
  for select using (auth.uid() = user_id);

create policy "Users can view own usage" on public.billing_usage
  for select using (
    exists (
      select 1 from public.billing_accounts ba
      where ba.id = billing_usage.account_id
      and ba.user_id = auth.uid()
    )
  );

create policy "Anyone can view active plans" on public.billing_plans
  for select using (is_active = true);

create policy "Service role can manage all billing" on public.billing_accounts
  for all using (auth.role() = 'service_role');

create policy "Service role can manage all usage" on public.billing_usage
  for all using (auth.role() = 'service_role');

create policy "Service role can manage all events" on public.stripe_events
  for all using (auth.role() = 'service_role');

-- F) Helper functions for feature gates

-- Get billing account for a campaign
create or replace function public.billing_account_for_campaign(p_campaign uuid)
returns uuid
language plpgsql security definer
set search_path=public
as $$
declare
  v_account_id uuid;
begin
  select ba.id into v_account_id
  from public.billing_accounts ba
  join public.campaigns c on c.user_id = ba.user_id
  where c.id = p_campaign;
  return v_account_id;
end;
$$;

-- Get current caps for a billing account
create or replace function public.current_caps(p_account_id uuid)
returns table(usage_soft_cap int, usage_hard_cap int)
language plpgsql security definer
set search_path=public
as $$
begin
  return query
  select
    coalesce(ba.usage_soft_cap, bp.usage_soft_cap, 1000)::int,
    coalesce(ba.usage_hard_cap, bp.usage_hard_cap, 2000)::int
  from public.billing_accounts ba
  left join public.billing_plans bp on bp.id = ba.plan_id
  where ba.id = p_account_id;
end;
$$;

-- Check if sending is allowed today
create or replace function public.can_send_today(p_campaign uuid)
returns table(ok boolean, reason text)
language plpgsql security definer
set search_path=public
as $$
declare
  acc uuid;
  soft int;
  hard int;
  today int;
begin
  acc := public.billing_account_for_campaign(p_campaign);
  if acc is null then
    return query select false, 'no_billing_account'::text;
    return;
  end if;

  select usage_soft_cap, usage_hard_cap into soft, hard
  from public.current_caps(acc);

  select coalesce(qty, 0) into today
  from public.billing_usage
  where account_id = acc
    and day = current_date
    and metric = 'emails_sent';

  if today >= hard then
    return query select false, 'hard_cap_exceeded'::text;
    return;
  end if;

  if today >= soft then
    return query select true, 'soft_cap_exceeded'::text;
    return;
  end if;

  return query select true, null::text;
end;
$$;
