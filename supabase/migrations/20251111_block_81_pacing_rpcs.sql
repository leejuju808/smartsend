-- Block 81: ISP pacing RPC helpers

-- Increment minute counter atomically
create or replace function public.rpc_inc_isp_minute_counter(
  p_account_id uuid,
  p_bucket text,
  p_minute timestamptz,
  p_n int
) returns void
language plpgsql
as $$
begin
  insert into public.isp_minute_counters(account_id, bucket, minute, sent_count)
  values (p_account_id, p_bucket, date_trunc('minute', p_minute at time zone 'UTC'), p_n)
  on conflict (account_id, bucket, minute)
  do update set sent_count = public.isp_minute_counters.sent_count + p_n;
end;
$$;

-- Fetch current minute usage + cap
create or replace function public.rpc_isp_minute_cap(
  p_account_id uuid,
  p_bucket text
) returns table (used integer, cap integer)
language plpgsql
as $$
declare
  v_min timestamptz := date_trunc('minute', now() at time zone 'UTC');
  v_rule record;
  v_used int;
begin
  select *
  into v_rule
  from public.isp_pacing_rules
  where account_id = p_account_id
    and bucket = p_bucket
  limit 1;

  if not found then
    return query select 0 as used, 60 as cap;
  end if;

  select coalesce(sent_count, 0)
  into v_used
  from public.isp_minute_counters
  where account_id = p_account_id
    and bucket = p_bucket
    and minute = v_min;

  return query select v_used, v_rule.max_per_minute;
end;
$$;

