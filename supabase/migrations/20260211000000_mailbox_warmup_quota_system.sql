-- Mailbox Warmup and Quota Management System
-- Extends connected_accounts with warmup settings, creates ramp plans, usage tracking
-- Implements per-mailbox daily caps and warmup day progression

-- =====================================================
-- 1. Extend connected_accounts table
-- =====================================================
alter table public.connected_accounts
  add column if not exists daily_cap int default 40,
  add column if not exists warmup_enabled boolean default true,
  add column if not exists warmup_day int default 1,
  add column if not exists warmup_started_at date,
  add column if not exists provider_domain text;

-- =====================================================
-- 2. Warmup Plans (predefined ramp schedules)
-- =====================================================
create table if not exists public.warmup_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz default now()
);

-- =====================================================
-- 3. Warmup Steps (daily allowances per plan)
-- =====================================================
create table if not exists public.warmup_steps (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.warmup_plans(id) on delete cascade,
  day_number int not null,
  allowed_sends int not null,
  unique (plan_id, day_number)
);

create index if not exists idx_warmup_steps_plan_day on public.warmup_steps(plan_id, day_number);

-- =====================================================
-- 4. Bind mailbox to plan
-- =====================================================
alter table public.connected_accounts
  add column if not exists warmup_plan_id uuid references public.warmup_plans(id);

-- =====================================================
-- 5. Usage Ledger (per mailbox per day)
-- =====================================================
create table if not exists public.send_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  usage_date date not null default (current_date),
  sent_count int not null default 0,
  unique (account_id, usage_date)
);

create index if not exists idx_send_usage_account_date on public.send_usage(account_id, usage_date);
create index if not exists idx_send_usage_user_date on public.send_usage(user_id, usage_date);

-- =====================================================
-- 6. View: Today's quota status per mailbox
-- =====================================================
create or replace view public.v_mailbox_quota_today as
select
  a.id as account_id,
  a.user_id,
  coalesce(u.sent_count, 0) as sent_today,
  a.daily_cap,
  a.warmup_enabled,
  a.warmup_day,
  a.warmup_started_at,
  a.warmup_plan_id
from public.connected_accounts a
left join public.send_usage u
  on u.account_id = a.id and u.usage_date = current_date;

-- =====================================================
-- 7. RPC: Compute today's allowance for a mailbox
-- =====================================================
create or replace function public.get_mailbox_allowance(acct_id uuid)
returns table (allowed_today int, sent_today int, hard_cap int)
language sql stable as $$
  with a as (
    select *
    from public.v_mailbox_quota_today
    where account_id = acct_id
  ),
  day_calc as (
    select
      case
        when a.warmup_enabled is false or a.warmup_plan_id is null
          then null
        else greatest(1, coalesce(a.warmup_day,
               (current_date - coalesce(a.warmup_started_at, current_date))::int + 1))
      end as d
    from a
  ),
  warm as (
    select ws.allowed_sends
    from a
    join day_calc d on true
    join warmup_steps ws on ws.plan_id = a.warmup_plan_id and ws.day_number =
      least(d.d, (select max(day_number) from warmup_steps where plan_id = a.warmup_plan_id))
  )
  select
    coalesce((select allowed_sends from warm), 999999) as allowed_today,
    (select sent_today from a) as sent_today,
    (select daily_cap from a) as hard_cap;
$$;

-- =====================================================
-- 8. RPC: Bump usage safely (upsert + atomic add)
-- =====================================================
create or replace function public.bump_send_usage(acct_id uuid, inc_by int)
returns void language plpgsql as $$
begin
  insert into public.send_usage(account_id, user_id, usage_date, sent_count)
  select a.id, a.user_id, current_date, inc_by
  from public.connected_accounts a
  where a.id = acct_id
  on conflict (account_id, usage_date)
  do update set sent_count = public.send_usage.sent_count + inc_by;
end; $$;

-- =====================================================
-- 9. RPC: Warmup rollover (advance warmup day)
-- =====================================================
create or replace function public.warmup_rollover_task()
returns void language sql as $$
  -- set start date if warmup is enabled and not set
  update public.connected_accounts
     set warmup_started_at = current_date
   where warmup_enabled = true
     and warmup_started_at is null;

  -- increment day (cap at max defined in plan)
  update public.connected_accounts a
     set warmup_day = least(
           coalesce(a.warmup_day,1) + 1,
           coalesce( (select max(day_number) from warmup_steps where plan_id = a.warmup_plan_id), 9999)
         )
   where warmup_enabled = true
     and warmup_started_at is not null;
$$;

-- =====================================================
-- 10. Add account_id to send_queue if missing
-- =====================================================
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_name = 'send_queue' and column_name = 'account_id'
  ) then
    alter table public.send_queue
      add column account_id uuid references public.connected_accounts(id);
    
    create index if not exists idx_send_queue_account_id 
      on public.send_queue(account_id) 
      where account_id is not null;
  end if;
end $$;

-- =====================================================
-- 11. RLS Policies
-- =====================================================
alter table public.warmup_plans enable row level security;
alter table public.warmup_steps enable row level security;
alter table public.send_usage enable row level security;

-- Users can read warmup plans (public config)
drop policy if exists "warmup_plans_read" on public.warmup_plans;
create policy "warmup_plans_read" on public.warmup_plans
  for select using (true);

drop policy if exists "warmup_steps_read" on public.warmup_steps;
create policy "warmup_steps_read" on public.warmup_steps
  for select using (true);

-- Users can only see their own usage
drop policy if exists "send_usage_own" on public.send_usage;
create policy "send_usage_own" on public.send_usage
  for select using (auth.uid() = user_id);

-- Service role can manage everything
drop policy if exists "service_role_warmup_plans" on public.warmup_plans;
create policy "service_role_warmup_plans" on public.warmup_plans
  for all to service_role using (true) with check (true);

drop policy if exists "service_role_warmup_steps" on public.warmup_steps;
create policy "service_role_warmup_steps" on public.warmup_steps
  for all to service_role using (true) with check (true);

drop policy if exists "service_role_send_usage" on public.send_usage;
create policy "service_role_send_usage" on public.send_usage
  for all to service_role using (true) with check (true);

-- =====================================================
-- 12. Seed default 30-day warmup plan
-- =====================================================
insert into public.warmup_plans (name) values ('default-30d')
on conflict (name) do nothing;

with p as (
  select id from public.warmup_plans where name='default-30d'
)
insert into public.warmup_steps (plan_id, day_number, allowed_sends)
select p.id, x.day, x.allowed
from p cross join (values
  (1,10),(2,12),(3,15),(4,18),(5,20),
  (6,22),(7,25),(8,28),(9,30),(10,32),
  (11,35),(12,38),(13,40),(14,42),(15,45),
  (16,48),(17,50),(18,55),(19,60),(20,65),
  (21,70),(22,75),(23,80),(24,85),(25,90),
  (26,95),(27,100),(28,110),(29,120),(30,130)
) as x(day, allowed)
on conflict (plan_id, day_number) do nothing;

