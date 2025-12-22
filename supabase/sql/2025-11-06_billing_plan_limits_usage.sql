-- Billing plan limits, usage views, and enforcement guards (idempotent)

-- A) Plan limits lookup -----------------------------------------------------
create or replace function public.plan_limits(p_plan text)
returns jsonb
language sql
stable
as $$
  select case lower(coalesce(p_plan, 'free'))
    when 'free'    then jsonb_build_object('seats_max', 1,  'campaigns_max', 1)
    when 'starter' then jsonb_build_object('seats_max', 3,  'campaigns_max', 3)
    when 'pro'     then jsonb_build_object('seats_max', 10, 'campaigns_max', 10)
    when 'team'    then jsonb_build_object('seats_max', 20, 'campaigns_max', 30)
    else                  jsonb_build_object('seats_max', 1,  'campaigns_max', 1)
  end
$$;


-- B) Billing accounts essentials --------------------------------------------
alter table public.billing_accounts
  add column if not exists plan text
    check (plan in ('free','starter','pro','team'))
    default 'free',
  add column if not exists status text
    check (status in ('none','trialing','active','past_due','canceled','incomplete'))
    default 'none',
  add column if not exists seats int not null default 1;

create index if not exists idx_billing_user on public.billing_accounts(user_id);


-- C) Usage views -------------------------------------------------------------
drop view if exists public.v_billing_campaign_usage;
create or replace view public.v_billing_campaign_usage as
select
  ba.id as billing_id,
  ba.user_id as owner_id,
  count(c.id)::int as campaigns_used
from public.billing_accounts ba
left join public.campaigns c
  on c.user_id = ba.user_id
group by 1, 2;


drop view if exists public.v_billing_seat_usage;
create or replace view public.v_billing_seat_usage as
with owners_campaigns as (
  select c.id as campaign_id,
         c.user_id as owner_id
  from public.campaigns c
),
member_rows as (
  -- members invited to owner's campaigns
  select oc.owner_id,
         cm.user_id as member_user_id
  from owners_campaigns oc
  join public.campaign_members cm
    on cm.campaign_id = oc.campaign_id
  union
  -- include the owner (always consumes a seat)
  select ba.user_id as owner_id,
         ba.user_id as member_user_id
  from public.billing_accounts ba
)
select
  ba.id as billing_id,
  ba.user_id as owner_id,
  count(distinct mr.member_user_id)::int as seats_used
from public.billing_accounts ba
left join member_rows mr
  on mr.owner_id = ba.user_id
group by 1, 2;


create or replace view public.v_billing_usage as
select
  ba.id as billing_id,
  ba.user_id as owner_id,
  ba.plan,
  ba.status,
  (public.plan_limits(ba.plan)->>'seats_max')::int as seats_max,
  (public.plan_limits(ba.plan)->>'campaigns_max')::int as campaigns_max,
  coalesce(su.seats_used, 0) as seats_used,
  coalesce(cu.campaigns_used, 0) as campaigns_used
from public.billing_accounts ba
left join public.v_billing_seat_usage su
  on su.billing_id = ba.id
left join public.v_billing_campaign_usage cu
  on cu.billing_id = ba.id;

alter view public.v_billing_usage set (security_barrier = true);


-- D) Usage RPC ---------------------------------------------------------------
drop function if exists public.get_my_billing_usage();
create or replace function public.get_my_billing_usage()
returns public.v_billing_usage
language sql
stable
security definer
set search_path = public
as $$
  select v.*
  from public.v_billing_usage v
  where v.owner_id = auth.uid()
  limit 1
$$;

revoke all on function public.get_my_billing_usage() from public;
grant execute on function public.get_my_billing_usage() to authenticated, service_role;


-- E) Campaign limit guard ----------------------------------------------------
drop trigger if exists trg_guard_campaigns on public.campaigns;
drop trigger if exists trg_campaign_limit on public.campaigns;
drop function if exists public.guard_free_caps();
drop function if exists public._enforce_campaign_limit();

create or replace function public._enforce_campaign_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_plan text;
  v_campaigns_max int;
  v_campaigns_used int;
begin
  v_owner := coalesce(new.user_id, auth.uid());
  if v_owner is null then
    raise exception 'owner required';
  end if;

  select plan,
         (public.plan_limits(plan)->>'campaigns_max')::int,
         coalesce(cu.campaigns_used, 0)
  into v_plan, v_campaigns_max, v_campaigns_used
  from public.billing_accounts ba
  left join public.v_billing_campaign_usage cu
    on cu.billing_id = ba.id
  where ba.user_id = v_owner
  limit 1;

  if v_plan is null then
    insert into public.billing_accounts(user_id, plan, status, seats)
    values (v_owner, 'free', 'none', 1)
    on conflict (user_id) do nothing;

    v_plan := 'free';
    v_campaigns_max := (public.plan_limits('free')->>'campaigns_max')::int;
    v_campaigns_used := 0;
  end if;

  if v_campaigns_used >= v_campaigns_max then
    raise exception 'Plan % limit reached: max % campaigns. Upgrade to add more.',
      v_plan, v_campaigns_max
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger trg_campaign_limit
before insert on public.campaigns
for each row
execute function public._enforce_campaign_limit();


-- F) Seat limit guard --------------------------------------------------------
drop trigger if exists trg_seat_limit on public.campaign_members;
drop function if exists public._enforce_seat_limit();

create or replace function public._enforce_seat_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_plan text;
  v_seats_max int;
  v_seats_used int;
begin
  select c.user_id into v_owner
  from public.campaigns c
  where c.id = new.campaign_id;

  if v_owner is null then
    raise exception 'Campaign owner not found';
  end if;

  select plan,
         (public.plan_limits(plan)->>'seats_max')::int,
         coalesce(su.seats_used, 0)
  into v_plan, v_seats_max, v_seats_used
  from public.billing_accounts ba
  left join public.v_billing_seat_usage su
    on su.billing_id = ba.id
  where ba.user_id = v_owner
  limit 1;

  if v_plan is null then
    insert into public.billing_accounts(user_id, plan, status, seats)
    values (v_owner, 'free', 'none', 1)
    on conflict (user_id) do nothing;

    v_plan := 'free';
    v_seats_max := (public.plan_limits('free')->>'seats_max')::int;
    v_seats_used := 1; -- owner consumes one seat
  end if;

  if v_seats_used >= v_seats_max then
    raise exception 'Plan % seat limit reached: max % seats. Remove a member or upgrade.',
      v_plan, v_seats_max
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger trg_seat_limit
before insert on public.campaign_members
for each row
execute function public._enforce_seat_limit();











