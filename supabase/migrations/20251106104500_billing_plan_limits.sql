-- Billing Block 1: Plans, usage tracking, and guards (idempotent)

-- A) Plans catalog --------------------------------------------------------
do $$
declare
  v_has_new boolean;
begin
  select exists(
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'plan_catalog'
      and column_name = 'monthly_emails'
  ) into v_has_new;

  if v_has_new is false then
    begin
      execute 'drop table if exists public.plan_catalog cascade';
    exception when undefined_table then
      null;
    end;
  end if;
end$$;

create table if not exists public.plan_catalog (
  id text primary key,
  name text not null,
  stripe_price_id text,
  monthly_emails int not null,
  max_campaigns int not null,
  max_connected_accounts int not null,
  max_seats int not null,
  features jsonb not null default '{}'::jsonb
);

create unique index if not exists uq_plan_catalog_price on public.plan_catalog(stripe_price_id) where stripe_price_id is not null;

insert into public.plan_catalog (id, name, monthly_emails, max_campaigns, max_connected_accounts, max_seats)
values
  ('free','Free', 500, 1, 1, 1),
  ('starter','Starter', 5000, 5, 2, 1),
  ('pro','Pro', 25000, 20, 5, 3),
  ('team','Team', 100000, 100, 20, 10)
on conflict (id) do update
set name = excluded.name,
    monthly_emails = excluded.monthly_emails,
    max_campaigns = excluded.max_campaigns,
    max_connected_accounts = excluded.max_connected_accounts,
    max_seats = excluded.max_seats;


-- B) Billing account owner columns ---------------------------------------
do $$
declare
  r record;
begin
  for r in (
    select constraint_name
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'billing_accounts'
      and constraint_type = 'CHECK'
      and constraint_name in ('billing_accounts_plan_chk', 'billing_accounts_plan_check')
  ) loop
    execute 'alter table public.billing_accounts drop constraint ' || quote_ident(r.constraint_name);
  end loop;

  for r in (
    select constraint_name
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'billing_accounts'
      and constraint_type = 'CHECK'
      and constraint_name in ('billing_accounts_status_chk', 'billing_accounts_status_check')
  ) loop
    execute 'alter table public.billing_accounts drop constraint ' || quote_ident(r.constraint_name);
  end loop;

  begin
    execute 'alter table public.billing_accounts drop constraint billing_accounts_plan_fkey';
  exception when undefined_object then
    null;
  end;
end$$;

alter table public.billing_accounts
  add column if not exists status text default 'none',
  add column if not exists plan text default 'free',
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists period_start timestamptz,
  add column if not exists period_end timestamptz,
  add column if not exists seats int not null default 1,
  add column if not exists meta jsonb not null default '{}'::jsonb;

update public.billing_accounts
set plan = 'free'
where plan is null or plan = '';

update public.billing_accounts
set status = 'none'
where status is null or status = '';

alter table public.billing_accounts
  add constraint billing_accounts_status_chk
    check (status in ('none','trialing','active','past_due','canceled','incomplete'));

alter table public.billing_accounts
  add constraint billing_accounts_plan_chk
    check (plan in ('free','starter','pro','team'));

alter table public.billing_accounts
  add constraint billing_accounts_plan_fkey
    foreign key (plan) references public.plan_catalog(id);

create unique index if not exists uq_ba_user on public.billing_accounts(user_id);


-- C) Metered usage per month ----------------------------------------------
create table if not exists public.billing_usage_monthly (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  y int not null,
  m int not null,
  emails_sent int not null default 0,
  contacts int not null default 0,
  campaigns int not null default 0,
  meta jsonb not null default '{}'::jsonb,
  unique (user_id, y, m)
);

create index if not exists idx_usage_user_month on public.billing_usage_monthly(user_id, y, m);


-- D) Current month helper --------------------------------------------------
create or replace function public._ym_now(out y int, out m int)
language sql
stable
as $$
  select extract(year from date_trunc('month', now() at time zone 'utc'))::int,
         extract(month from date_trunc('month', now() at time zone 'utc'))::int;
$$;


-- E) Increment usage on send logs -----------------------------------------
drop trigger if exists trg_usage_inc on public.send_logs;
drop function if exists public._trg_usage_inc();

create function public._trg_usage_inc()
returns trigger
language plpgsql
as $fn$
declare
  v_user uuid;
  v_y int;
  v_m int;
begin
  select user_id into v_user from public.campaigns where id = new.campaign_id;
  if v_user is null then
    return new;
  end if;

  select * into v_y, v_m from public._ym_now();

  insert into public.billing_usage_monthly (user_id, y, m, emails_sent)
  values (v_user, v_y, v_m, 1)
  on conflict (user_id, y, m) do update
    set emails_sent = public.billing_usage_monthly.emails_sent + 1;

  return new;
end
$fn$;

create trigger trg_usage_inc
  after insert on public.send_logs
  for each row
  when (new.status = 'sent')
  execute function public._trg_usage_inc();


-- F) Guard: can the owner send another email this period -------------------
create or replace function public.can_send_under_plan(p_campaign uuid)
returns boolean
language plpgsql
stable
as $$
declare
  v_user uuid;
  v_plan text;
  v_limit int;
  v_status text;
  v_y int;
  v_m int;
  v_used int;
begin
  select user_id into v_user from public.campaigns where id = p_campaign;
  if v_user is null then
    return false;
  end if;

  select plan, status into v_plan, v_status
  from public.billing_accounts
  where user_id = v_user;

  if v_plan is null then
    v_plan := 'free';
  end if;

  if v_status not in ('trialing','active') and v_plan <> 'free' then
    return false;
  end if;

  select monthly_emails into v_limit
  from public.plan_catalog
  where id = v_plan;

  select * into v_y, v_m from public._ym_now();

  select emails_sent into v_used
  from public.billing_usage_monthly
  where user_id = v_user
    and y = v_y
    and m = v_m;

  v_used := coalesce(v_used, 0);

  return v_used < coalesce(v_limit, 0);
end;
$$;

grant execute on function public.can_send_under_plan(uuid) to authenticated, service_role;
grant execute on function public._ym_now() to authenticated, service_role;


-- G) Backstop trigger on enqueue ------------------------------------------
drop trigger if exists trg_plan_guard on public.send_queue;
drop function if exists public._trg_plan_guard();

create function public._trg_plan_guard()
returns trigger
language plpgsql
as $fn$
begin
  if not public.can_send_under_plan(new.campaign_id) then
    raise exception 'Plan limit reached. Upgrade to send more emails this month.';
  end if;
  return new;
end
$fn$;

create trigger trg_plan_guard
  before insert on public.send_queue
  for each row
  execute function public._trg_plan_guard();


-- H) View: current usage summary ------------------------------------------
create or replace view public.v_billing_usage as
select
  ba.user_id,
  ba.plan,
  ba.status,
  ba.period_start,
  ba.period_end,
  pc.monthly_emails,
  coalesce(u.emails_sent, 0) as emails_sent,
  greatest(coalesce(pc.monthly_emails, 0) - coalesce(u.emails_sent, 0), 0) as emails_remaining
from public.billing_accounts ba
left join public.plan_catalog pc on pc.id = ba.plan
left join public.billing_usage_monthly u
  on u.user_id = ba.user_id
 and (u.y, u.m) = (select * from public._ym_now());

grant select on public.v_billing_usage to anon, authenticated;

