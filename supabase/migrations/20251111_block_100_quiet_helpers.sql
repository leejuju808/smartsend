-- Convert HH:MM to time
create or replace function public.hhmm_to_time(p text) returns time
language sql immutable as
$$
  select make_time(split_part(p,':',1)::int, split_part(p,':',2)::int, 0)
$$;

-- Is local time within [start,end) window; supports overnight spans (e.g., 20:00→07:00)
create or replace function public.is_quiet_now(
  p_timezone text,
  p_start_hhmm text,
  p_end_hhmm text
) returns boolean
language plpgsql stable as
$$
declare
  now_local time;
  t_start time := public.hhmm_to_time(p_start_hhmm);
  t_end   time := public.hhmm_to_time(p_end_hhmm);
begin
  now_local := (now() at time zone p_timezone)::time;

  if t_start <= t_end then
    return now_local >= t_start and now_local < t_end;         -- same-day window
  else
    return now_local >= t_start or  now_local < t_end;         -- overnight window
  end if;
end
$$;

-- Resolve effective quiet window for an ISP at account scope
create or replace function public.is_quiet_for_isp(
  p_account_id uuid,
  p_isp_key text
) returns boolean
language plpgsql stable as
$$
declare
  tz text;
  base jsonb;
  ov record;
  use_enabled boolean;
  s text;
  e text;
begin
  select timezone, quiet_hours
    into tz, base
    from public.accounts
   where id = p_account_id;

  select enabled, start_hhmm, end_hhmm
    into ov
    from public.isp_quiet_overrides
   where account_id = p_account_id
     and isp_key = p_isp_key;

  use_enabled := coalesce(ov.enabled, coalesce((base->>'enabled')::boolean, true));
  if use_enabled is false then
    return false;
  end if;

  s := coalesce(ov.start_hhmm, coalesce(base->>'start','20:00'));
  e := coalesce(ov.end_hhmm,   coalesce(base->>'end','07:00'));

  return public.is_quiet_now(coalesce(tz,'America/Los_Angeles'), s, e);
end
$$;

