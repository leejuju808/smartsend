-- Billing Core System - Idempotent Migration
-- Creates billing_accounts, billing_plans, usage_ledger and helper functions

-- A) Billing accounts (1:N users possible later; start 1:1 with owner)
create table if not exists public.billing_accounts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade, -- owner
  stripe_customer_id text unique,
  stripe_subscription_id text,
  plan_code text not null default 'starter',         -- 'starter' | 'pro' | 'scale'
  status text not null default 'active',             -- 'active' | 'past_due' | 'canceled' | 'trialing'
  current_period_start timestamptz,
  current_period_end timestamptz,
  seats int not null default 1
);

create index if not exists idx_billing_user on public.billing_accounts(user_id);

-- B) Plan catalog (editable)
create table if not exists public.billing_plans (
  code text primary key,            -- 'starter','pro','scale'
  name text not null,
  monthly_price_cents int not null,
  monthly_send_cap int not null,    -- soft cap per period
  seat_price_cents int not null default 0
);

insert into public.billing_plans (code,name,monthly_price_cents,monthly_send_cap,seat_price_cents)
values
  ('starter','Starter',2900,200,0),
  ('pro','Pro',9900,2000,0),
  ('scale','Scale',24900,10000,0)
on conflict (code) do update
set name=excluded.name,
    monthly_price_cents=excluded.monthly_price_cents,
    monthly_send_cap=excluded.monthly_send_cap,
    seat_price_cents=excluded.seat_price_cents;

-- C) Tie connected_accounts & campaigns to a billing account
alter table public.connected_accounts
  add column if not exists billing_account_id uuid references public.billing_accounts(id) on delete set null;

alter table public.campaigns
  add column if not exists billing_account_id uuid references public.billing_accounts(id) on delete set null;

-- Backfill: join by owner
update public.campaigns c
set billing_account_id = ba.id
from public.billing_accounts ba
where ba.user_id = c.user_id and c.billing_account_id is null;

update public.connected_accounts a
set billing_account_id = ba.id
from public.billing_accounts ba
where ba.user_id = a.user_id and a.billing_account_id is null;

-- D) Usage ledger (immutable)
create table if not exists public.usage_ledger (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  billing_account_id uuid not null references public.billing_accounts(id) on delete cascade,
  resource text not null,           -- 'send','seat','inbox_scan', etc.
  quantity int not null default 1,
  meta jsonb default '{}'::jsonb
);

create index if not exists idx_usage_period on public.usage_ledger(billing_account_id, created_at);

-- E) Current period bounds for an account (falls back to calendar month)
create or replace function public.billing_period_bounds(p_ba uuid)
returns table(period_start timestamptz, period_end timestamptz)
language sql stable as $$
  with b as (
    select current_period_start, current_period_end
    from public.billing_accounts where id = p_ba
  )
  select
    coalesce((select current_period_start from b),
             date_trunc('month', now())) as period_start,
    coalesce((select current_period_end from b),
             (date_trunc('month', now()) + interval '1 month - 1 second')) as period_end
$$;

-- F) Usage so far in period for a resource (e.g., 'send')
create or replace function public.usage_in_period(p_ba uuid, p_resource text)
returns int
language sql stable as $$
  with bounds as (select * from public.billing_period_bounds(p_ba))
  select coalesce(sum(quantity),0)::int
  from public.usage_ledger u
  join bounds b on u.created_at >= b.period_start and u.created_at <= b.period_end
  where u.billing_account_id = p_ba
    and u.resource = p_resource
$$;

-- G) Plan send cap
create or replace function public.plan_send_cap(p_ba uuid)
returns int
language sql stable as $$
  select bp.monthly_send_cap
  from public.billing_accounts ba
  join public.billing_plans bp on bp.code = ba.plan_code
  where ba.id = p_ba
$$;

-- H) Record a usage event
create or replace function public.record_usage(p_ba uuid, p_resource text, p_qty int default 1, p_meta jsonb default '{}'::jsonb)
returns void
language plpgsql security definer set search_path=public as $$
begin
  insert into public.usage_ledger(billing_account_id, resource, quantity, meta)
  values (p_ba, p_resource, p_qty, p_meta);
end;
$$;

-- I) Ensure billing account exists for user (called on sign-in)
create or replace function public.ensure_billing_account()
returns uuid
language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  select id into v_id from public.billing_accounts where user_id = auth.uid();
  if v_id is null then
    insert into public.billing_accounts(user_id, plan_code, status)
    values (auth.uid(), 'starter', 'active')
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- J) Dashboard views
create or replace view public.billing_overview as
select
  ba.id as billing_account_id,
  ba.user_id,
  ba.plan_code,
  ba.status,
  ba.current_period_start,
  ba.current_period_end,
  bp.monthly_send_cap,
  public.usage_in_period(ba.id, 'send') as sends_used,
  (bp.monthly_send_cap - public.usage_in_period(ba.id, 'send')) as sends_left
from public.billing_accounts ba
join public.billing_plans bp on bp.code = ba.plan_code;

create or replace view public.usage_recent as
select
  u.created_at,
  u.billing_account_id,
  u.resource,
  u.quantity,
  u.meta
from public.usage_ledger u
order by u.created_at desc
limit 500;

