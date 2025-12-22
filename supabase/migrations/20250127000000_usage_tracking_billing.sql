-- Plans & limits (seedable)

create table if not exists public.plans (
  id text primary key,                 -- e.g., 'free', 'pro', 'scale'
  name text not null,
  daily_cap int not null,              -- max sends per day across all mailboxes
  monthly_cap int not null             -- optional global ceiling
);

insert into public.plans (id, name, daily_cap, monthly_cap)
values
  ('free','Free', 25, 600),
  ('pro','Pro', 400, 12000),
  ('scale','Scale', 2000, 60000)
on conflict (id) do update set
  name = excluded.name,
  daily_cap = excluded.daily_cap,
  monthly_cap = excluded.monthly_cap;

-- Subscription snapshot (simple; Stripe webhook writes into this)

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_id text not null references public.plans(id),
  status text not null default 'active',   -- 'active','past_due','canceled','trialing'
  current_period_start timestamptz,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

-- Usage ledger (one row per successful send)

create table if not exists public.usage_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mailbox_id uuid references public.connected_accounts(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  queue_id uuid references public.send_queue(id) on delete set null,
  occurred_at timestamptz not null default now()
);

create index if not exists idx_usage_user_day on public.usage_ledger(user_id, occurred_at);
create index if not exists idx_usage_period on public.usage_ledger(occurred_at);

-- Helper: get limits for user (plan + counts: today & this period)

create or replace function public.get_usage_limits(p_user uuid)
returns table (
  plan_id text,
  daily_cap int,
  monthly_cap int,
  today_count int,
  period_count int,
  period_start timestamptz,
  period_end timestamptz,
  sub_status text
)
language plpgsql
stable
as $$
declare
  v_plan text;
  v_daily int;
  v_monthly int;
  v_ps timestamptz;
  v_pe timestamptz;
  v_status text;
begin
  select s.plan_id, s.current_period_start, s.current_period_end, s.status
    into v_plan, v_ps, v_pe, v_status
  from public.subscriptions s
  where s.user_id = p_user;

  if v_plan is null then
    v_plan := 'free';
  end if;

  select daily_cap, monthly_cap into v_daily, v_monthly
  from public.plans where id = v_plan;

  if v_ps is null or v_pe is null then
    -- default to calendar month if not set
    v_ps := date_trunc('month', now());
    v_pe := (date_trunc('month', now()) + interval '1 month');
  end if;

  return query
  with today as (
    select count(*)::int c
    from public.usage_ledger
    where user_id = p_user
      and occurred_at >= date_trunc('day', now())
  ), period as (
    select count(*)::int c
    from public.usage_ledger
    where user_id = p_user
      and occurred_at >= v_ps and occurred_at < v_pe
  )
  select v_plan, v_daily, v_monthly,
         coalesce((select c from today),0),
         coalesce((select c from period),0),
         v_ps, v_pe, coalesce(v_status,'active');
end
$$;





