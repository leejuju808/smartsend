-- Plan entitlements + usage counters + helper RPCs (idempotent)

-- A) Plan entitlements --------------------------------------------------------
create table if not exists public.plan_entitlements (
  plan text primary key,
  monthly_sends int not null,
  monthly_ai_actions int not null,
  max_campaigns int not null,
  max_seats int not null,
  features jsonb not null default '{}'::jsonb
);

insert into public.plan_entitlements(plan, monthly_sends, monthly_ai_actions, max_campaigns, max_seats, features)
values
  ('free',    200,   200,   2,   1, '{"book_it": true, "ab_variants": false, "team_share": false}'),
  ('starter', 3000,  3000,  10,  3, '{"book_it": true, "ab_variants": true,  "team_share": true }'),
  ('pro',     15000, 15000, 50, 10, '{"book_it": true, "ab_variants": true,  "team_share": true }'),
  ('team',    50000, 50000, 200, 50, '{"book_it": true, "ab_variants": true,  "team_share": true }')
on conflict (plan) do update
set monthly_sends = excluded.monthly_sends,
    monthly_ai_actions = excluded.monthly_ai_actions,
    max_campaigns = excluded.max_campaigns,
    max_seats = excluded.max_seats,
    features = excluded.features;


-- B) Usage counters -----------------------------------------------------------
create table if not exists public.usage_counters (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.billing_accounts(id) on delete cascade,
  y int not null,
  m int not null check (m between 1 and 12),
  sends int not null default 0,
  ai_actions int not null default 0,
  meta jsonb not null default '{}'::jsonb,
  unique (account_id, y, m)
);

create index if not exists idx_usage_account_ym on public.usage_counters(account_id, y, m);


-- C) Helper: entitlements lookup ----------------------------------------------
drop function if exists public.get_entitlements(uuid);
drop function if exists public.get_entitlements();

create or replace function public.get_entitlements(p_user_id uuid default auth.uid())
returns table(
  plan text,
  status text,
  period_end timestamptz,
  seats int,
  feature_flags jsonb,
  monthly_sends int,
  monthly_ai_actions int,
  max_campaigns int,
  max_seats int,
  used_sends int,
  used_ai_actions int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := coalesce(p_user_id, auth.uid());
  v_ba uuid;
  v_plan text := 'free';
  v_status text := 'none';
  v_period_end timestamptz;
  v_seats int := 1;
  v_ms int;
  v_ma int;
  v_mc int;
  v_msats int;
  v_feats jsonb;
  v_now timestamptz := now();
  v_y int := extract(year from v_now);
  v_m int := extract(month from v_now);
  v_used_s int := 0;
  v_used_ai int := 0;
begin
  if v_user is not null then
    select id, plan, status, period_end, seats
      into v_ba, v_plan, v_status, v_period_end, v_seats
    from public.billing_accounts
    where user_id = v_user
    limit 1;
  end if;

  select monthly_sends, monthly_ai_actions, max_campaigns, max_seats, features
    into v_ms, v_ma, v_mc, v_msats, v_feats
  from public.plan_entitlements
  where plan = coalesce(v_plan, 'free');

  if v_ba is not null then
    select sends, ai_actions
      into v_used_s, v_used_ai
    from public.usage_counters
    where account_id = v_ba
      and y = v_y
      and m = v_m
    limit 1;
  end if;

  v_used_s := coalesce(v_used_s, 0);
  v_used_ai := coalesce(v_used_ai, 0);

  return query select
    coalesce(v_plan, 'free'),
    coalesce(v_status, 'none'),
    v_period_end,
    coalesce(v_seats, 1),
    coalesce(v_feats, '{}'::jsonb),
    v_ms,
    v_ma,
    v_mc,
    v_msats,
    v_used_s,
    v_used_ai;
end;
$$;

revoke all on function public.get_entitlements(uuid) from public;
revoke all on function public.get_entitlements() from public;
grant execute on function public.get_entitlements(uuid) to service_role;
grant execute on function public.get_entitlements() to authenticated;


-- D) Mutator: bump usage ------------------------------------------------------
drop function if exists public.bump_usage(uuid, text, int);

create or replace function public.bump_usage(p_account uuid, p_kind text, p_amount int default 1)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_y int := extract(year from v_now);
  v_m int := extract(month from v_now);
begin
  if p_account is null then
    raise exception 'account required';
  end if;

  insert into public.usage_counters(account_id, y, m)
  values (p_account, v_y, v_m)
  on conflict (account_id, y, m) do nothing;

  if p_kind = 'send' then
    update public.usage_counters
      set sends = sends + greatest(p_amount, 1)
    where account_id = p_account
      and y = v_y
      and m = v_m;
  elsif p_kind = 'ai' then
    update public.usage_counters
      set ai_actions = ai_actions + greatest(p_amount, 1)
    where account_id = p_account
      and y = v_y
      and m = v_m;
  else
    raise exception 'unsupported usage kind %', p_kind;
  end if;
end;
$$;

revoke all on function public.bump_usage(uuid, text, int) from public;
grant execute on function public.bump_usage(uuid, text, int) to service_role;





