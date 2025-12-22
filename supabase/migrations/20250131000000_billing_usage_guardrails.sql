-- Billing Usage Helpers + Plan Guardrails (Idempotent)
-- This migration adds usage tracking functions and plan enforcement

-- A) Link campaigns to a billing account via owner
create or replace function public.billing_account_for_campaign(p_campaign uuid)
returns uuid
language sql stable as $$
  select ba.id
  from public.campaigns c
  join public.billing_accounts ba on ba.user_id = coalesce(c.owner_id, c.user_id)
  where c.id = p_campaign
  limit 1;
$$;

-- B) Usage upsert (per day, per metric)
create or replace function public.usage_add(
  p_account uuid, 
  p_metric text, 
  p_qty int, 
  p_day date default current_date
)
returns void
language plpgsql security definer as $$
begin
  insert into public.billing_usage as u (account_id, day, metric, qty)
  values (p_account, p_day, p_metric, p_qty)
  on conflict (account_id, day, metric)
  do update set qty = u.qty + excluded.qty;
end; 
$$;

-- C) Read current caps from plan/account
create or replace function public.current_caps(p_account uuid)
returns table(usage_soft_cap int, usage_hard_cap int, seat_limit int, status text)
language sql stable as $$
  select coalesce(p.usage_soft_cap, ba.usage_soft_cap),
         coalesce(p.usage_hard_cap, ba.usage_hard_cap),
         coalesce(p.seat_limit, ba.seat_limit),
         ba.status
  from public.billing_accounts ba
  left join public.billing_plans p on p.id = ba.plan_id
  where ba.id = p_account;
$$;

-- D) Check + (optionally) add usage atomically
--    metric examples: 'emails_sent', 'ai_calls'
create or replace function public.check_and_add_usage(
  p_account uuid,
  p_metric text,
  p_qty int,
  p_soft_only boolean default true,     -- if true, allow up to hard_cap but mark soft breach
  p_commit boolean default true         -- if true, write usage on pass
)
returns table(ok boolean, total_today int, soft_cap int, hard_cap int, breach text)
language plpgsql security definer as $$
declare
  v_soft int; v_hard int; v_status text;
  v_today int := 0; v_new int;
begin
  select usage_soft_cap, usage_hard_cap, status
    into v_soft, v_hard, v_status
  from public.current_caps(p_account);

  if v_status in ('canceled','past_due') then
    return query select false, 0, v_soft, v_hard, 'account_inactive';
    return;
  end if;

  select coalesce(qty,0) into v_today
  from public.billing_usage
  where account_id = p_account and day = current_date and metric = p_metric
  for update; -- lock row if exists

  v_new := v_today + p_qty;

  if v_new > v_hard then
    return query select false, v_today, v_soft, v_hard, 'hard_cap_exceeded';
    return;
  end if;

  if p_commit then
    perform public.usage_add(p_account, p_metric, p_qty, current_date);
  end if;

  if v_new > v_soft then
    return query select (not p_soft_only), v_new, v_soft, v_hard, 'soft_cap_exceeded';
  else
    return query select true, v_new, v_soft, v_hard, null::text;
  end if;
end; 
$$;

-- E) Seat usage (count owner + collaborators with any role)
create or replace function public.seats_used_for_account(p_account uuid)
returns int
language sql stable as $$
  with owner as (
    select c.owner_id
    from public.campaigns c
    join public.billing_accounts ba on ba.user_id = coalesce(c.owner_id, c.user_id)
    where ba.id = p_account
    limit 1
  ),
  collab as (
    select count(distinct user_id) as n
    from public.campaign_shares s
    join public.campaigns c on c.id = s.campaign_id
    join public.billing_accounts ba on ba.user_id = coalesce(c.owner_id, c.user_id)
    where ba.id = p_account
  )
  select 1 + coalesce((select n from collab),0);
$$;

-- F) Seat check
create or replace function public.can_add_collaborator(p_campaign uuid)
returns table(ok boolean, seats_used int, seat_limit int)
language sql stable as $$
  select
    (select seats_used_for_account(public.billing_account_for_campaign(p_campaign))) < 
    (select seat_limit from public.current_caps(public.billing_account_for_campaign(p_campaign))),
    (select seats_used_for_account(public.billing_account_for_campaign(p_campaign))),
    (select seat_limit from public.current_caps(public.billing_account_for_campaign(p_campaign)));
$$;

-- Grant execute permissions to service_role
grant execute on function public.billing_account_for_campaign(uuid) to service_role;
grant execute on function public.usage_add(uuid, text, int, date) to service_role;
grant execute on function public.current_caps(uuid) to service_role;
grant execute on function public.check_and_add_usage(uuid, text, int, boolean, boolean) to service_role;
grant execute on function public.seats_used_for_account(uuid) to service_role;
grant execute on function public.can_add_collaborator(uuid) to service_role;

