-- Per-connected account token bucket rate limiting
create table if not exists public.rate_limits (
  account_id uuid primary key references public.connected_accounts(id) on delete cascade,
  capacity int not null default 90,
  refill_per_sec numeric not null default 0.025,
  tokens numeric not null default 90,
  updated_at timestamptz not null default now()
);

create or replace function public.rpc_rate_consume(
  p_account_id uuid,
  p_cost numeric default 1
)
returns table(allowed boolean, tokens_left numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_capacity int;
  v_refill numeric;
  v_tokens numeric;
  v_now timestamptz := now();
  v_elapsed numeric;
begin
  insert into public.rate_limits(account_id)
  values (p_account_id)
  on conflict (account_id) do nothing;

  perform 1
  from public.rate_limits
  where account_id = p_account_id
  for update;

  select capacity, refill_per_sec, tokens, updated_at
    into v_capacity, v_refill, v_tokens, v_now
  from public.rate_limits
  where account_id = p_account_id;

  v_elapsed := extract(epoch from (now() - v_now));
  v_tokens := least(v_capacity::numeric, v_tokens + v_refill * v_elapsed);

  if v_tokens >= p_cost then
    v_tokens := v_tokens - p_cost;
    update public.rate_limits
       set tokens = v_tokens, updated_at = now()
     where account_id = p_account_id;
    return query select true, v_tokens;
  else
    update public.rate_limits
       set tokens = v_tokens, updated_at = now()
     where account_id = p_account_id;
    return query select false, v_tokens;
  end if;
end;
$$;



