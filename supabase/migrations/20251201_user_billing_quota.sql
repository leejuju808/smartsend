-- 07_billing_and_quota.sql
-- User-based billing with monthly send quotas

-- Ensure profiles table has required billing columns (idempotent)
-- Note: This may already exist from other migrations, but we ensure it's there
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  stripe_customer_id text,
  plan text not null default 'free',     -- free | pro | team
  plan_status text not null default 'inactive', -- active | trialing | past_due | canceled | inactive
  plan_period_end timestamptz,           -- subscription current_period_end
  seats int not null default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Add columns if they don't exist (idempotent)
alter table public.profiles add column if not exists plan text;
alter table public.profiles alter column plan set default 'free';

alter table public.profiles add column if not exists plan_status text;
alter table public.profiles alter column plan_status set default 'inactive';

alter table public.profiles add column if not exists plan_period_end timestamptz;
alter table public.profiles add column if not exists seats int;
alter table public.profiles alter column seats set default 1;

-- Update default values for existing rows
update public.profiles set plan = 'free' where plan is null;
update public.profiles set plan_status = 'inactive' where plan_status is null;
update public.profiles set seats = 1 where seats is null;

-- Make columns not null after backfilling
alter table public.profiles alter column plan set not null;
alter table public.profiles alter column plan_status set not null;

create index if not exists idx_profiles_customer on public.profiles (stripe_customer_id);

-- Monthly metered usage: one row per user per period
create table if not exists public.send_usage (
  user_id uuid references auth.users(id) on delete cascade,
  period_key text not null,               -- e.g., '2025-10' (UTC month)
  sends int not null default 0,
  primary key (user_id, period_key),
  updated_at timestamptz default now()
);

create index if not exists idx_send_usage_user_period on public.send_usage (user_id, period_key);

-- Helper: plan limits (overrideable)
create table if not exists public.plan_limits (
  plan text primary key,
  monthly_send_limit int not null
);

insert into public.plan_limits(plan, monthly_send_limit) values
  ('free', 100),
  ('pro', 5000),
  ('team', 25000)
on conflict (plan) do nothing;

-- RPC: atomically assert quota and increment N sends
create or replace function public.consume_send_quota(p_user uuid, p_count int, p_now timestamptz default now())
returns table(ok boolean, remaining int, limit int, period_key text)
language plpgsql
security definer
as $$
declare
  v_plan text;
  v_status text;
  v_limit int;
  v_key text := to_char(date_trunc('month', p_now), 'YYYY-MM');
  v_curr int;
begin
  -- read plan + status
  select plan, plan_status into v_plan, v_status from public.profiles where id = p_user;
  if v_plan is null then
    v_plan := 'free';
    v_status := 'inactive';
  end if;

  -- resolve limit
  select monthly_send_limit into v_limit from public.plan_limits where plan = v_plan;
  if v_limit is null then v_limit := 100; end if;

  -- free users only active if inactive? still allow limit; for paid require active|trialing
  if v_plan <> 'free' and v_status not in ('active','trialing') then
    return query select false, 0, v_limit, v_key; return;
  end if;

  -- upsert usage row then check
  insert into public.send_usage(user_id, period_key, sends)
    values (p_user, v_key, 0)
  on conflict (user_id, period_key) do nothing;

  select sends into v_curr from public.send_usage where user_id = p_user and period_key = v_key for update;

  if v_curr + p_count > v_limit then
    return query select false, greatest(v_limit - v_curr, 0), v_limit, v_key; return;
  end if;

  update public.send_usage
    set sends = sends + p_count, updated_at = now()
    where user_id = p_user and period_key = v_key;

  return query select true, (v_limit - (v_curr + p_count)), v_limit, v_key;
end $$;

grant execute on function public.consume_send_quota(uuid,int,timestamptz) to anon, authenticated;

-- RLS Policies
alter table public.profiles enable row level security;
alter table public.send_usage enable row level security;
alter table public.plan_limits enable row level security;

-- Profiles: users can read own, service role can update (for webhooks)
drop policy if exists "profiles_read_own" on public.profiles;
create policy "profiles_read_own" on public.profiles
  for select to authenticated using (auth.uid() = id);

drop policy if exists "profiles_service_update" on public.profiles;
create policy "profiles_service_update" on public.profiles
  for update to service_role using (true) with check (true);

drop policy if exists "profiles_service_insert" on public.profiles;
create policy "profiles_service_insert" on public.profiles
  for insert to service_role with check (true);

-- Send usage: service role can write, users can read own
drop policy if exists "send_usage_read_own" on public.send_usage;
create policy "send_usage_read_own" on public.send_usage
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "send_usage_service_write" on public.send_usage;
create policy "send_usage_service_write" on public.send_usage
  for all to service_role using (true) with check (true);

-- Plan limits: public read
drop policy if exists "plan_limits_read_all" on public.plan_limits;
create policy "plan_limits_read_all" on public.plan_limits
  for select to anon, authenticated using (true);

