-- QA scheduler assertion helpers (Block 99)
-- Provides instrumentation functions to probe scheduler predicates and assert expectations.

begin;

create or replace function qa.scheduler_probe_counts(p_account uuid)
returns json
language sql
stable
as $$
  with base as (
    select
      l.id as lead_id,
      lower(split_part(l.email, '@', 2)) as domain
    from public.leads l
    where l.account_id = p_account
  ),
  resolved as (
    select
      b.lead_id,
      b.domain,
      coalesce(mc.isp_key, 'other') as isp_key
    from base b
    left join public.mx_cache mc
      on mc.domain = b.domain
  ),
  no_backoff as (
    select r.*
    from resolved r
    where not public.is_quiet_for_isp(p_account, r.isp_key)
      and not exists (
      select 1
      from public.domain_reputation dr
      where dr.account_id = p_account
        and dr.domain = r.domain
        and dr.last_backoff_until is not null
        and dr.last_backoff_until > now()
    )
  ),
  lead_counts as (
    select isp_key, count(*)::int as lead_count
    from no_backoff
    group by isp_key
  ),
  caps_raw as (
    select
      isp_key,
      hourly_cap,
      daily_cap,
      max_concurrency,
      quiet_hours,
      (quiet_hours ->> 'start')::time as quiet_start,
      (quiet_hours ->> 'end')::time as quiet_end,
      coalesce(quiet_hours ->> 'tz', 'UTC') as quiet_tz,
      (timezone(coalesce(quiet_hours ->> 'tz', 'UTC'), now()))::time as local_time
    from public.isp_caps
    where account_id = p_account
  ),
  caps as (
    select
      cr.isp_key,
      cr.hourly_cap,
      cr.daily_cap,
      cr.max_concurrency,
      case
        when cr.quiet_start is null or cr.quiet_end is null then false
        when cr.quiet_start <= cr.quiet_end then cr.local_time between cr.quiet_start and cr.quiet_end
        else cr.local_time >= cr.quiet_start or cr.local_time <= cr.quiet_end
      end as in_quiet_hours
    from caps_raw cr
  ),
  hour_start as (
    select date_trunc('hour', now()) as ts
  ),
  day_start as (
    select date_trunc('day', now()) as ts
  ),
  hourly_usage as (
    select
      coalesce(so.isp_key, 'other') as isp_key,
      count(*)::int as sent
    from public.send_outcomes so,
         hour_start hs
    where so.account_id = p_account
      and so.created_at >= hs.ts
    group by coalesce(so.isp_key, 'other')
  ),
  daily_usage as (
    select
      coalesce(so.isp_key, 'other') as isp_key,
      count(*)::int as sent
    from public.send_outcomes so,
         day_start ds
    where so.account_id = p_account
      and so.created_at >= ds.ts
    group by coalesce(so.isp_key, 'other')
  ),
  isp_keys as (
    select unnest(array['gmail', 'outlook', 'yahoo', 'other']) as isp_key
  ),
  availability as (
    select
      k.isp_key,
      case
        when coalesce(c.in_quiet_hours, false) then 0
        else greatest(
          least(
            coalesce(c.hourly_cap, 1000000) - coalesce(hu.sent, 0),
            coalesce(c.daily_cap, 1000000) - coalesce(du.sent, 0)
          ),
          0
        )
      end as capacity
    from isp_keys k
    left join caps c on c.isp_key = k.isp_key
    left join hourly_usage hu on hu.isp_key = k.isp_key
    left join daily_usage du on du.isp_key = k.isp_key
  ),
  counts as (
    select
      k.isp_key,
      case
        when a.capacity is null then coalesce(lc.lead_count, 0)
        else least(a.capacity, coalesce(lc.lead_count, 0))
      end as picked
    from isp_keys k
    left join availability a on a.isp_key = k.isp_key
    left join lead_counts lc on lc.isp_key = k.isp_key
  )
  select json_build_object(
    'gmail',   coalesce((select picked from counts where isp_key = 'gmail'), 0),
    'outlook', coalesce((select picked from counts where isp_key = 'outlook'), 0),
    'yahoo',   coalesce((select picked from counts where isp_key = 'yahoo'), 0),
    'other',   coalesce((select picked from counts where isp_key = 'other'), 0)
  );
$$;

create or replace function qa.expect_counts(
  p_gmail int,
  p_outlook int,
  p_yahoo int,
  p_other int,
  p_actual json
)
returns text
language plpgsql
as $$
declare
  g int;
  o int;
  y int;
  x int;
  fail text := '';
begin
  g := coalesce((p_actual ->> 'gmail')::int, 0);
  o := coalesce((p_actual ->> 'outlook')::int, 0);
  y := coalesce((p_actual ->> 'yahoo')::int, 0);
  x := coalesce((p_actual ->> 'other')::int, 0);

  if g < p_gmail then
    fail := fail || format('gmail<%s (got %s); ', p_gmail, g);
  end if;

  if o < p_outlook then
    fail := fail || format('outlook<%s (got %s); ', p_outlook, o);
  end if;

  if y < p_yahoo then
    fail := fail || format('yahoo<%s (got %s); ', p_yahoo, y);
  end if;

  if x < p_other then
    fail := fail || format('other<%s (got %s); ', p_other, x);
  end if;

  if fail = '' then
    return 'OK';
  else
    return fail;
  end if;
end
$$;

commit;

