-- ============================================================
-- BLOCK 267200 — First Paying Roofer Conversion v1
-- "Turn Replies Into a Stripe Charge"
--
-- Objective:
-- - Paid gate for sending: unpaid => 25/day, paid => 50/day
-- - Conversion logging: record when a company becomes paid
--
-- Notes:
-- - We intentionally implement the daily send cap in the existing RPC
--   `public.check_daily_send_limit(...)` because multiple workers already call it.
-- - "Paid" is determined from `public.profiles.subscription_status in ('active','trialing')`.
-- ============================================================

-- --------------------------------------------
-- 1) Company subscription conversion logging
-- --------------------------------------------
alter table public.company_subscriptions
  add column if not exists converted_at timestamptz;

comment on column public.company_subscriptions.converted_at is
  'Timestamp when subscription first became active (BLOCK 267200).';

create or replace function public.ss_set_company_subscription_converted_at()
returns trigger
language plpgsql
as $$
begin
  -- Set once, on first transition to active
  if new.status = 'active'
     and (tg_op = 'INSERT' or coalesce(old.status,'') <> 'active')
     and new.converted_at is null then
    new.converted_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ss_company_subscription_converted_at on public.company_subscriptions;
create trigger trg_ss_company_subscription_converted_at
before insert or update on public.company_subscriptions
for each row
execute function public.ss_set_company_subscription_converted_at();

-- --------------------------------------------
-- 2) Paid sending gate: 25/day unpaid, 50/day paid
-- --------------------------------------------
-- Replaces the legacy plan-based implementation with a simple paid/unpaid gate.
create or replace function public.check_daily_send_limit(
  p_user_id uuid,
  p_count integer default 1,
  p_date date default current_date
)
returns table(
  can_send boolean,
  sends_today integer,
  daily_limit integer,
  remaining integer,
  effective_plan text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_is_paid boolean;
  v_limit integer;
  v_sends_today integer;
begin
  -- Paid if Stripe says active/trialing
  select (coalesce(subscription_status,'') in ('active','trialing'))
    into v_is_paid
  from public.profiles
  where id = p_user_id;

  v_limit := case when v_is_paid then 50 else 25 end;
  v_sends_today := public.get_user_daily_send_count(p_user_id, p_date);

  return query select
    (v_sends_today + coalesce(p_count, 1) <= v_limit) as can_send,
    v_sends_today as sends_today,
    v_limit as daily_limit,
    greatest(v_limit - v_sends_today, 0) as remaining,
    (case when v_is_paid then 'starter' else 'free' end) as effective_plan;
end;
$$;

grant execute on function public.check_daily_send_limit(uuid, integer, date) to authenticated, service_role;








