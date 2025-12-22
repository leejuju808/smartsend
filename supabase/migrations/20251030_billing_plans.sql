-- Plans, subscriptions, and plan → limits mapping

-- 1) Plans enum
do $$ begin
  create type plan_t as enum ('free','starter','pro');
exception when duplicate_object then null; end $$;


-- 2) Billing subscriptions table
create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  plan plan_t not null default 'free',
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text not null default 'inactive', -- trialing/active/past_due/canceled/incomplete/...
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists billing_ws_unique on public.billing_subscriptions(workspace_id);


-- 3) Plan limits definition and seed
create table if not exists public.plan_limits (
  plan plan_t primary key,
  hard_cap_per_day int not null,
  burst_per_minute int not null
);

insert into public.plan_limits(plan, hard_cap_per_day, burst_per_minute) values
  ('free',    50, 10),
  ('starter', 500, 60),
  ('pro',     2500, 120)
on conflict (plan) do update set
  hard_cap_per_day = excluded.hard_cap_per_day,
  burst_per_minute = excluded.burst_per_minute;


-- 4) Ensure workspace_limits has expected columns
-- (table may already exist from other migrations)
create table if not exists public.workspace_limits (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  hard_cap_per_day int not null default 50,
  burst_per_minute int not null default 10
);

do $$ begin
  alter table public.workspace_limits add column if not exists updated_at timestamptz not null default now();
exception when others then null; end $$;


-- 5) Helper to apply plan → limits
create or replace function public.apply_plan_to_workspace(_workspace_id uuid, _plan plan_t)
returns void
language plpgsql
security definer
as $$
declare
  lim record;
begin
  select * into lim from public.plan_limits where plan = _plan;
  if lim is null then raise exception 'plan limits not found'; end if;

  insert into public.workspace_limits(workspace_id, hard_cap_per_day, burst_per_minute, updated_at)
  values (_workspace_id, lim.hard_cap_per_day, lim.burst_per_minute, now())
  on conflict (workspace_id) do update set
    hard_cap_per_day = excluded.hard_cap_per_day,
    burst_per_minute = excluded.burst_per_minute,
    updated_at = now();

  update public.billing_subscriptions
     set plan = _plan, updated_at = now()
   where workspace_id = _workspace_id;
end $$;

revoke all on function public.apply_plan_to_workspace(uuid,plan_t) from public;
grant execute on function public.apply_plan_to_workspace(uuid,plan_t) to authenticated;


