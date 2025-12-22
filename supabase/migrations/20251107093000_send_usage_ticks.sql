-- Send usage rolling counters and guard RPCs

-- A) Minute buckets for usage counts (append-only, compacted daily)
create table if not exists public.send_usage_ticks (
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  bucket_min timestamptz not null,
  attempts int not null default 0,
  sent_ok int not null default 0,
  primary key (account_id, bucket_min)
);

create index if not exists idx_send_usage_range on public.send_usage_ticks(account_id, bucket_min);

-- Helper: truncate to minute
create or replace function public.trunc_minute(ts timestamptz)
returns timestamptz language sql immutable as $$
  date_trunc('minute', ts)
$$;

-- B) Upsert a tick (used both pre- and post-send)
create or replace function public.tick_send_usage(p_account uuid, p_attempts int, p_sent_ok int)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.send_usage_ticks(account_id, bucket_min, attempts, sent_ok)
  values (p_account, public.trunc_minute(now()), p_attempts, p_sent_ok)
  on conflict (account_id, bucket_min) do update
    set attempts = public.send_usage_ticks.attempts + excluded.attempts,
        sent_ok = public.send_usage_ticks.sent_ok + excluded.sent_ok;
$$;

revoke all on function public.tick_send_usage(uuid, int, int) from public;
grant execute on function public.tick_send_usage(uuid, int, int) to authenticated;

-- C) Compute rolling windows + check budget atomically
-- Returns: ok, retry_in_minutes, hourly_used, hourly_quota, daily_used, daily_quota
create or replace function public.check_and_reserve_send(p_account uuid, p_units int default 1)
returns table(
  ok boolean,
  retry_in_minutes int,
  hourly_used int,
  hourly_quota int,
  daily_used int,
  daily_quota int
) language plpgsql security definer set search_path=public as $$
declare
  b record;
  since_hour timestamptz := now() - interval '60 minutes';
  since_day  timestamptz := now() - interval '24 hours';
  used_hour int;
  used_day  int;
  can_hour boolean;
  can_day boolean;
  retry_min int := 0;
begin
  select coalesce(daily_quota, 1800) as dq, coalesce(hourly_quota, 200) as hq, coalesce(burst, 20) as burst
    into b
  from public.send_rate_budgets where account_id = p_account;

  -- if no budget row, assume defaults
  if b is null then
    b := (1800, 200, 20);
  end if;

  -- compute rolling usage from ticks
  select coalesce(sum(attempts), 0) into used_hour
    from public.send_usage_ticks
   where account_id = p_account and bucket_min >= since_hour;

  select coalesce(sum(attempts), 0) into used_day
    from public.send_usage_ticks
   where account_id = p_account and bucket_min >= since_day;

  can_hour := (used_hour + p_units) <= b.hq;
  can_day  := (used_day  + p_units) <= b.dq;

  if can_hour and can_day then
    -- reserve immediately (attempts +p_units, sent_ok +0)
    perform public.tick_send_usage(p_account, p_units, 0);
    return query select true, 0, used_hour + p_units, b.hq, used_day + p_units, b.dq;
  end if;

  -- compute retry suggestion (minutes until next minute exits hour window)
  if not can_hour then
    -- simple hint: wait 1 minute (keeps it cheap)
    retry_min := greatest(retry_min, 1);
  end if;
  if not can_day then
    -- conservative: wait 15 min if daily cap exceeded
    retry_min := greatest(retry_min, 15);
  end if;

  return query select false, retry_min, used_hour, b.hq, used_day, b.dq;
end$$;

revoke all on function public.check_and_reserve_send(uuid, int) from public;
grant execute on function public.check_and_reserve_send(uuid, int) to authenticated;

-- D) Maintenance: compact old ticks (optional)
create or replace function public.compact_send_usage_daily()
returns void language sql security definer set search_path=public as $$
  delete from public.send_usage_ticks
   where bucket_min < now() - interval '7 days';
$$;


