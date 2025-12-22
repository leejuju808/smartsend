-- Plan-based send caps and account rate limits

-- A) Plan → default caps
create table if not exists public.plan_send_caps (
  plan text primary key check (plan in ('free','starter','pro','team')),
  capacity int not null,
  refill_per_sec numeric not null
);

insert into public.plan_send_caps(plan, capacity, refill_per_sec) values
  ('free',    20,  20.0/3600.0),
  ('starter', 90,  90.0/3600.0),
  ('pro',     200, 200.0/3600.0),
  ('team',    600, 600.0/3600.0)
on conflict (plan) do nothing;

-- B) Rate limits table (if not created earlier)
create table if not exists public.rate_limits (
  account_id uuid primary key references public.connected_accounts(id) on delete cascade,
  capacity int not null,
  refill_per_sec numeric not null,
  tokens numeric not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_rate_limits_updated on public.rate_limits(updated_at desc);

-- C) Helper: seed/refresh a connected account’s bucket from its owner’s plan
create or replace function public.rpc_seed_rate_limit_from_plan(p_account_id uuid)
returns public.rate_limits
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_plan text;
  v_cap int;
  v_refill numeric;
  v_row public.rate_limits;
begin
  select user_id into v_user from public.connected_accounts where id = p_account_id;

  if v_user is null then
    raise exception 'Account % not found', p_account_id;
  end if;

  select coalesce(plan,'free') into v_plan
  from public.billing_accounts where user_id = v_user
  order by created_at desc limit 1;

  select capacity, refill_per_sec into v_cap, v_refill
  from public.plan_send_caps where plan = v_plan;

  if v_cap is null then
    select capacity, refill_per_sec into v_cap, v_refill
    from public.plan_send_caps where plan = 'free';
  end if;

  insert into public.rate_limits(account_id, capacity, refill_per_sec, tokens)
  values (p_account_id, v_cap, v_refill, v_cap)
  on conflict (account_id) do update
    set capacity = excluded.capacity,
        refill_per_sec = excluded.refill_per_sec,
        tokens = least(public.rate_limits.tokens + (excluded.capacity - public.rate_limits.capacity), excluded.capacity),
        updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

-- D) Adaptive consume
create or replace function public.rpc_rate_consume(p_account_id uuid, p_cost numeric default 1)
returns table(allowed boolean, tokens_left numeric, capacity int, refill_per_sec numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_capacity int;
  v_refill numeric;
  v_tokens numeric;
  v_prev_update timestamptz;
  v_elapsed numeric;
begin
  perform public.rpc_seed_rate_limit_from_plan(p_account_id);

  select capacity, refill_per_sec, tokens, updated_at
    into v_capacity, v_refill, v_tokens, v_prev_update
  from public.rate_limits where account_id = p_account_id
  for update;

  v_elapsed := extract(epoch from (now() - v_prev_update));
  v_tokens := least(v_capacity::numeric, v_tokens + v_refill * v_elapsed);

  if v_tokens >= p_cost then
    v_tokens := v_tokens - p_cost;
    update public.rate_limits
      set tokens = v_tokens, updated_at = now()
      where account_id = p_account_id;
    return query select true, v_tokens, v_capacity, v_refill;
  else
    update public.rate_limits
      set tokens = v_tokens, updated_at = now()
      where account_id = p_account_id;
    return query select false, v_tokens, v_capacity, v_refill;
  end if;
end;
$$;

-- E) Backoff helper using per-account refill
create or replace function public.rpc_backoff_for_account(p_account_id uuid, p_tokens_left numeric)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_refill numeric;
  v_need numeric := greatest(1 - p_tokens_left, 0);
  v_secs int;
begin
  select refill_per_sec into v_refill from public.rate_limits where account_id = p_account_id;

  if v_refill is null or v_refill <= 0 then
    v_secs := 600;
  else
    v_secs := ceil(v_need / v_refill);
  end if;

  return least(greatest(v_secs, 300), 1800);
end;
$$;




