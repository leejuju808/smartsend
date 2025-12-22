-- Finalize Warmup Schema + Helpers
-- Complete warmup system with plans, steps, mailbox fields, effective cap functions, and RPCs

-- A) Plans & steps (complete)

create table if not exists public.warmup_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table if not exists public.warmup_steps (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.warmup_plans(id) on delete cascade,
  day_no int not null check (day_no >= 1),
  daily_cap int not null check (daily_cap >= 1),
  unique (plan_id, day_no)
);

create index if not exists idx_warmup_steps_plan_day on public.warmup_steps(plan_id, day_no);

-- B) Mailbox fields (you already added; ensure present)

alter table public.connected_accounts
  add column if not exists warmup_enabled boolean default true,
  add column if not exists warmup_day int default 1,
  add column if not exists warmup_started_at date,
  add column if not exists daily_cap int default 40,
  add column if not exists warmup_plan_id uuid references public.warmup_plans(id);

-- C) Default 30-day plan (idempotent)

insert into public.warmup_plans(name)
values ('default-30d')
on conflict (name) do nothing;

do $$
declare p uuid;
begin
  select id into p from public.warmup_plans where name='default-30d';
  
  -- Simple curve: start 10, +3/day to 40 (cap there), then +2/day to 80
  for d in 1..30 loop
    insert into public.warmup_steps(plan_id, day_no, daily_cap)
    values (p, d,
      case
        when d = 1 then 10
        when d <= 10 then least(10 + 3*(d-1), 40)
        else least(40 + 2*(d-10), 80)
      end
    )
    on conflict (plan_id, day_no) do nothing;
  end loop;
end $$;

-- D) Helper: effective mailbox cap from warmup (if enabled) or static daily_cap

create or replace function public.mailbox_effective_cap(p_account uuid)
returns int
language sql stable as $$
  with a as (
    select daily_cap, warmup_enabled, warmup_day, warmup_plan_id
    from public.connected_accounts where id = p_account
  )
  select case
    when (select warmup_enabled from a) is not true
      then (select daily_cap from a)
    else coalesce((
      select ws.daily_cap
      from public.warmup_steps ws
      where ws.plan_id = (select warmup_plan_id from a)
        and ws.day_no = greatest(1, (select warmup_day from a))
    ), (select daily_cap from a))
  end;
$$;

-- E) Campaign effective cap now clamps to mailbox cap (override can't exceed)

-- First ensure campaigns has daily_cap_override column
alter table public.campaigns
  add column if not exists daily_cap_override int;

create or replace function public.campaign_effective_cap(p_campaign uuid)
returns int language sql stable as $$
  with camp as (
    select daily_cap_override, daily_cap, user_id, workspace_id
    from public.campaigns where id = p_campaign
  ),
  q as (
    select account_id
    from public.send_queue
    where campaign_id = p_campaign
      and account_id is not null
    limit 1
  ),
  -- If no account_id in queue yet, get mailboxes for this campaign's user
  user_mailboxes as (
    select id
    from public.connected_accounts
    where user_id = (select user_id from camp)
       or workspace_id = (select workspace_id from camp)
    limit 1
  ),
  account_id_resolved as (
    select coalesce((select account_id from q), (select id from user_mailboxes)) as acc_id
  ),
  acc as (
    select public.mailbox_effective_cap((select acc_id from account_id_resolved)) as mb_cap
  )
  select case
    when (select daily_cap_override from camp) is not null
      then least((select daily_cap_override from camp), coalesce((select mb_cap from acc), 40))
    else coalesce((select mb_cap from acc), (select daily_cap from camp), 40)
  end;
$$;

-- F) RPCs to control warmup (start/stop/reset)

create or replace function public.warmup_start(p_account uuid, p_plan uuid default null)
returns void language sql security definer set search_path=public as $$
  update public.connected_accounts
  set warmup_enabled = true,
      warmup_day = 1,
      warmup_started_at = current_date,
      warmup_plan_id = coalesce(p_plan, warmup_plan_id)
  where id = p_account;
$$;

create or replace function public.warmup_stop(p_account uuid)
returns void language sql security definer set search_path=public as $$
  update public.connected_accounts
  set warmup_enabled = false
  where id = p_account;
$$;

create or replace function public.warmup_reset_day(p_account uuid, p_day int)
returns void language sql security definer set search_path=public as $$
  update public.connected_accounts
  set warmup_day = greatest(1, p_day),
      warmup_started_at = case when warmup_started_at is null then current_date else warmup_started_at end
  where id = p_account;
$$;

-- G) Ensure log_audit function exists (reuse existing if present)
-- (Your server/API will call public.log_audit(...) when invoking these RPCs)

-- Grant execute permissions
grant execute on function public.mailbox_effective_cap(uuid) to anon, authenticated, service_role;
grant execute on function public.campaign_effective_cap(uuid) to anon, authenticated, service_role;
grant execute on function public.warmup_start(uuid, uuid) to authenticated, service_role;
grant execute on function public.warmup_stop(uuid) to authenticated, service_role;
grant execute on function public.warmup_reset_day(uuid, int) to authenticated, service_role;

-- RLS policies for warmup_plans and warmup_steps
alter table public.warmup_plans enable row level security;
alter table public.warmup_steps enable row level security;

drop policy if exists "warmup_plans_read" on public.warmup_plans;
create policy "warmup_plans_read" on public.warmup_plans
  for select using (true);

drop policy if exists "warmup_steps_read" on public.warmup_steps;
create policy "warmup_steps_read" on public.warmup_steps
  for select using (true);
