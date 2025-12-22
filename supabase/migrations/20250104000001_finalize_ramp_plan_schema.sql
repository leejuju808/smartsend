-- Finalize Ramp Plan Schema + Helpers
-- Complete warmup system with plans, steps, mailbox fields, effective cap functions, and RPCs

-- A) Ensure connected_accounts has warmup fields (you added earlier, but reassert safely)

alter table public.connected_accounts
  add column if not exists daily_cap int default 40,
  add column if not exists warmup_enabled boolean default true,
  add column if not exists warmup_day int default 1,
  add column if not exists warmup_started_at date,
  add column if not exists plan_id uuid references public.warmup_plans(id) on delete set null,
  add column if not exists warmup_plan_id uuid references public.warmup_plans(id) on delete set null;

-- Sync plan_id from warmup_plan_id if plan_id is null (for backward compatibility)
update public.connected_accounts
set plan_id = warmup_plan_id
where plan_id is null and warmup_plan_id is not null;

-- B) Warmup plan + steps (idempotent)

create table if not exists public.warmup_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table if not exists public.warmup_steps (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.warmup_plans(id) on delete cascade,
  day_no int not null check (day_no >= 1),
  cap int not null check (cap >= 1),
  unique (plan_id, day_no)
);

create index if not exists idx_warmup_steps_plan_day on public.warmup_steps(plan_id, day_no);

-- Seed a sane 30-day ramp (only if not present)

do $$
declare pid uuid;
begin
  if not exists (select 1 from public.warmup_plans where name='default-30d') then
    insert into public.warmup_plans(name) values ('default-30d') returning id into pid;
    insert into public.warmup_steps(plan_id, day_no, cap)
    select pid, day_no, cap from (values
      (1,10),(2,12),(3,14),(4,16),(5,18),
      (6,20),(7,22),(8,24),(9,26),(10,28),
      (11,30),(12,32),(13,34),(14,36),(15,38),
      (16,40),(17,42),(18,44),(19,46),(20,48),
      (21,50),(22,52),(23,54),(24,56),(25,58),
      (26,60),(27,62),(28,64),(29,66),(30,70)
    ) t(day_no,cap);
  end if;
end $$;

-- C) Helper: compute today's warmup day (1-based) and cap for an account

create or replace function public.account_ramp_day(p_account uuid, p_today date default current_date)
returns int
language sql stable
as $$
  select case
           when a.warmup_started_at is null then null
           when (p_today - a.warmup_started_at) < 0 then 1
           else greatest(1, 1 + (p_today - a.warmup_started_at))
         end::int
  from public.connected_accounts a
  where a.id = p_account
$$;

create or replace function public.account_daily_cap(p_account uuid, p_today date default current_date)
returns int
language sql stable
as $$
  with a as (
    select id, daily_cap, warmup_enabled, coalesce(plan_id, warmup_plan_id) as plan_id,
           public.account_ramp_day(id, p_today) as d
    from public.connected_accounts
    where id = p_account
  ),
  s as (
    select ws.cap
    from a
    join public.warmup_steps ws on ws.plan_id = a.plan_id and ws.day_no = a.d
  )
  select
    case
      when (select warmup_enabled from a) is false then (select daily_cap from a)
      when exists (select 1 from s) then (select cap from s)
      else (select daily_cap from a) -- fallback if beyond plan length
    end
$$;

-- D) How many emails did this account send today? (across all campaigns)

create or replace view public.v_account_sent_today as
select
  sl.account_id,
  date_trunc('day', sl.created_at)::date as day,
  count(*)::int as sent_count
from public.send_logs sl
where sl.status = 'sent'
group by 1,2;

-- E) RPC: remaining capacity today for an account

create or replace function public.account_remaining_capacity(p_account uuid, p_today date default current_date)
returns int
language sql stable
as $$
  with cap as (select public.account_daily_cap(p_account, p_today) as cap),
  used as (
    select coalesce(sum(sent_count),0)::int as used
    from public.v_account_sent_today
    where account_id = p_account and day = p_today
  )
  select greatest(0, (select cap from cap) - (select used from used))
$$;

-- Grant execute permissions
grant execute on function public.account_ramp_day(uuid, date) to anon, authenticated, service_role;
grant execute on function public.account_daily_cap(uuid, date) to anon, authenticated, service_role;
grant execute on function public.account_remaining_capacity(uuid, date) to anon, authenticated, service_role;

-- F) Optional: daily auto-advance of warmup_day
create or replace function public.auto_sync_warmup_day()
returns int
language plpgsql
security definer
as $$
declare v_count int := 0;
begin
  update public.connected_accounts a
     set warmup_day = greatest(1, 1 + (current_date - a.warmup_started_at))
   where a.warmup_enabled = true
     and a.warmup_started_at is not null
     and a.warmup_day <> greatest(1, 1 + (current_date - a.warmup_started_at));
  get diagnostics v_count = row_count;
  return v_count;
end $$;

grant execute on function public.auto_sync_warmup_day() to service_role;

