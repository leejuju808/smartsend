create extension if not exists pg_net;

-- A) One subscription per account (team/org)
create table if not exists public.account_subscriptions (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  subscription_status text not null default 'inactive',
  current_period_end timestamptz,
  plan_name text,
  plan_seat_limit int,
  enforcement_mode text not null default 'hard' check (enforcement_mode in ('hard', 'soft')),
  updated_at timestamptz not null default now()
);

create index if not exists idx_subs_customer on public.account_subscriptions (stripe_customer_id);
create index if not exists idx_subs_subscription on public.account_subscriptions (stripe_subscription_id);

-- B) Usage view: how many seats used right now
create or replace view public.account_seat_usage as
select
  a.id as account_id,
  count(tm.*)::int as seats_used
from public.accounts a
left join public.team_members tm
  on tm.account_id = a.id
  and tm.is_active is true
group by a.id;

-- C) Convenience view: join limits + usage
create or replace view public.account_billing_status as
select
  s.account_id,
  s.plan_name,
  s.plan_seat_limit,
  u.seats_used,
  greatest(u.seats_used - coalesce(s.plan_seat_limit, 0), 0) as seats_over,
  s.subscription_status,
  s.enforcement_mode,
  s.current_period_end
from public.account_subscriptions s
join public.account_seat_usage u on u.account_id = s.account_id;

-- D) Hard-stop trigger: block inserts when hard enforcement would exceed seats
create or replace function public.enforce_seat_limit()
returns trigger
language plpgsql
as $$
declare
  seat_limit int;
  seats_used int;
  mode text;
begin
  select plan_seat_limit, enforcement_mode
    into seat_limit, mode
  from public.account_subscriptions
  where account_id = new.account_id
  for update;

  if not found then
    return new;
  end if;

  if mode = 'hard' and seat_limit is not null then
    select seats_used
      into seats_used
    from public.account_seat_usage
    where account_id = new.account_id;

    if coalesce(seats_used, 0) >= seat_limit then
      raise exception 'Seat limit reached (% seats). Upgrade plan or remove a member.', seat_limit
        using errcode = '23514';
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists trg_enforce_seat_limit on public.team_members;
create trigger trg_enforce_seat_limit
  before insert on public.team_members
  for each row execute function public.enforce_seat_limit();

-- E) Seat sync notifications
create or replace function public.notify_seat_sync()
returns trigger
language plpgsql
as $$
declare
  acct uuid;
begin
  if tg_op in ('INSERT', 'UPDATE') then
    acct := new.account_id;
  else
    acct := old.account_id;
  end if;

  perform net.http_post(
    url := current_setting('app.seat_sync_url', true),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', current_setting('app.seat_sync_secret', true)
    ),
    body := jsonb_build_object('account_id', acct)
  );

  return null;
end
$$;

drop trigger if exists trg_seat_sync_ins on public.team_members;
create trigger trg_seat_sync_ins
  after insert on public.team_members
  for each row execute function public.notify_seat_sync();

drop trigger if exists trg_seat_sync_upd on public.team_members;
create trigger trg_seat_sync_upd
  after update of is_active on public.team_members
  for each row execute function public.notify_seat_sync();

drop trigger if exists trg_seat_sync_del on public.team_members;
create trigger trg_seat_sync_del
  after delete on public.team_members
  for each row execute function public.notify_seat_sync();




