-- A) Lead country (ISO-3166-1 alpha-2 like 'US', 'GB', 'CA')

alter table public.leads
  add column if not exists country_code text;  -- nullable

create index if not exists idx_leads_country on public.leads(country_code);

-- Campaign-level toggles + default country fallback

alter table public.campaigns
  add column if not exists skip_weekends boolean not null default true,
  add column if not exists skip_holidays boolean not null default true,
  add column if not exists fallback_country text; -- e.g., 'US'
  add column if not exists use_lead_local_time boolean not null default false,
  add column if not exists fallback_timezone text; -- e.g., 'America/New_York'

-- Optional: domain → country mapping (helps auto-fill)

create table if not exists public.domain_countries (
  domain citext primary key,
  country_code text not null
);

-- B) Holidays table (country + date)

create table if not exists public.holidays (
  id uuid primary key default gen_random_uuid(),
  country_code text not null,
  holiday_date date not null,
  name text,
  unique (country_code, holiday_date)
);

create index if not exists idx_holidays_country_date on public.holidays(country_code, holiday_date);

-- C) Helper: pick lead timezone (from campaign_leads or campaign fallback)

create or replace function public.pick_lead_timezone(p_lead uuid, p_campaign uuid)
returns text
language sql stable
set search_path=public
as $$
  select coalesce(
    (select timezone from public.campaign_leads where lead_id = p_lead and campaign_id = p_campaign and timezone is not null),
    (select fallback_timezone from public.campaigns where id = p_campaign and use_lead_local_time = true),
    'Etc/UTC'
  )
$$;

-- D) Pick a country for a lead (using campaign defaults)

create or replace function public.pick_lead_country(p_lead uuid, p_campaign uuid)
returns text
language sql stable
set search_path=public
as $$
  with l as (select country_code, domain::citext as domain from public.leads where id = p_lead),
  via_domain as (
    select dc.country_code from l join public.domain_countries dc on dc.domain = l.domain
  ),
  via_campaign as (
    select fallback_country as country, skip_weekends, skip_holidays
    from public.campaigns where id = p_campaign
  )
  select
    case
      -- If both toggles are off, we don't need a country → return null
      when (select skip_weekends from via_campaign) = false
        and (select skip_holidays from via_campaign) = false
      then null
      else coalesce(
        (select country_code from l where country_code is not null),
        (select country_code from via_domain),
        (select country from via_campaign where country is not null),
        null
      )
    end
$$;

-- E) Timezone-aware send window function (extends apply_send_window)

create or replace function public.apply_send_window_tz(
  p_base timestamptz,
  p_start text,
  p_end text,
  p_tz text
) returns timestamptz
language plpgsql immutable
as $$
declare
  sh int; sm int; eh int; em int;
  local_ts timestamp;
  local_date date;
  s timestamptz; e timestamptz; t timestamptz := p_base;
begin
  if p_start is null or p_end is null then
    return p_base;
  end if;

  if p_tz is null then
    -- Fallback to UTC-based window (like apply_send_window)
    sh := split_part(p_start, ':', 1)::int; sm := split_part(p_start, ':', 2)::int;
    eh := split_part(p_end,   ':', 1)::int; em := split_part(p_end,   ':', 2)::int;
    
    local_date := (p_base at time zone 'UTC')::date;
    s := make_timestamptz(extract(year from local_date)::int, extract(month from local_date)::int, extract(day from local_date)::int, sh, sm, 0);
    e := make_timestamptz(extract(year from local_date)::int, extract(month from local_date)::int, extract(day from local_date)::int, eh, em, 0);
    
    if t < s then return s; end if;
    if t > e then return s + interval '1 day'; end if;
    return t;
  end if;

  -- Convert to local timezone
  local_ts := (p_base at time zone p_tz)::timestamp;
  local_date := local_ts::date;
  
  sh := split_part(p_start, ':', 1)::int; sm := split_part(p_start, ':', 2)::int;
  eh := split_part(p_end,   ':', 1)::int; em := split_part(p_end,   ':', 2)::int;

  -- Create timestamps in local timezone, then convert back to UTC
  -- Pattern: (timestamp AT TIME ZONE tz)::timestamptz interprets timestamp as being IN tz and converts to UTC
  s := ((local_date + make_time(sh, sm, 0)) at time zone p_tz)::timestamptz;
  e := ((local_date + make_time(eh, em, 0)) at time zone p_tz)::timestamptz;

  -- Convert base time to local for comparison
  local_ts := (p_base at time zone p_tz)::timestamp;
  local_ts := date_trunc('day', local_ts) + make_time(extract(hour from local_ts)::int, extract(minute from local_ts)::int, 0);
  t := (local_ts at time zone p_tz)::timestamptz;

  if t < s then return s; end if;
  if t > e then return s + interval '1 day'; end if;
  return t;
end $$;

-- F) Is business day in a timezone/country (weekend + holiday aware)

create or replace function public.is_business_day(
  p_instant timestamptz,
  p_tz text,            -- IANA TZ
  p_country text,       -- ISO-2 country (may be null)
  p_skip_weekends boolean default true,
  p_skip_holidays boolean default true
) returns boolean
language plpgsql immutable
as $$
declare
  local_ts timestamp;
  dow int;
  local_date date;
  is_holiday boolean := false;
begin
  if not p_skip_weekends and not p_skip_holidays then
    return true;
  end if;

  local_ts := case when p_tz is null then (p_instant at time zone 'UTC')::timestamp else (p_instant at time zone p_tz)::timestamp end;
  dow := extract(dow from local_ts);                -- 0=Sun .. 6=Sat
  local_date := local_ts::date;                     -- date in local timezone

  if p_skip_weekends and (dow = 0 or dow = 6) then
    return false;
  end if;

  if p_skip_holidays and p_country is not null then
    select exists(
      select 1 from public.holidays h
      where h.country_code = p_country and h.holiday_date = local_date
    ) into is_holiday;
    if is_holiday then return false; end if;
  end if;

  return true;
end $$;

-- G) Next business window (combines TZ window + business day rules)

create or replace function public.next_business_window_tz(
  p_base timestamptz,
  p_start text,
  p_end text,
  p_tz text,
  p_country text,
  p_skip_weekends boolean,
  p_skip_holidays boolean
) returns timestamptz
language plpgsql immutable
as $$
declare
  ts timestamptz := public.apply_send_window_tz(p_base, p_start, p_end, p_tz);
  tries int := 0;
begin
  if p_tz is null then
    -- No TZ window → still enforce business day with UTC day checks
    ts := p_base;
  end if;

  -- If not a business day, advance to next day's window start until it is.
  while not public.is_business_day(ts, p_tz, p_country, p_skip_weekends, p_skip_holidays) loop
    ts := public.apply_send_window_tz(ts + interval '1 day', p_start, p_end, p_tz);
    tries := tries + 1;
    if tries > 14 then  -- safety: max 2 weeks lookahead
      exit;
    end if;
  end loop;

  return ts;
end $$;

-- H) Rebucket queued items to business days

create or replace function public.rebucket_queue_to_business_days(
  p_campaign uuid,
  p_limit int default 2000
) returns int
language plpgsql
security definer
set search_path=public
as $$
declare
  v_count int := 0;
  r record;
  v_tz text;
  v_country text;
  v_start text;
  v_end text;
  v_skip_w boolean;
  v_skip_h boolean;
  v_new timestamptz;
begin
  select skip_weekends, skip_holidays into v_skip_w, v_skip_h
  from public.campaigns where id = p_campaign;

  if coalesce(v_skip_w,false)=false and coalesce(v_skip_h,false)=false then
    return 0;
  end if;

  for r in
    select q.id, q.lead_id, q.scheduled_at,
           cs.send_start, cs.send_end
    from public.send_queue q
    left join public.campaign_steps cs
      on cs.campaign_id = q.campaign_id and cs.step_no = q.step_no
    where q.campaign_id = p_campaign
      and q.status in ('queued','sending')
    order by q.scheduled_at asc
    limit p_limit
  loop
    v_tz := public.pick_lead_timezone(r.lead_id, p_campaign);
    v_country := public.pick_lead_country(r.lead_id, p_campaign);
    v_start := r.send_start; v_end := r.send_end;

    v_new := public.next_business_window_tz(
      r.scheduled_at, v_start, v_end, v_tz, v_country, v_skip_w, v_skip_h
    );

    if v_new <> r.scheduled_at then
      update public.send_queue set scheduled_at = v_new where id = r.id;
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end $$;

grant execute on function public.pick_lead_timezone(uuid, uuid) to anon, authenticated;
grant execute on function public.pick_lead_country(uuid, uuid) to anon, authenticated;
grant execute on function public.apply_send_window_tz(timestamptz, text, text, text) to anon, authenticated;
grant execute on function public.is_business_day(timestamptz, text, text, boolean, boolean) to anon, authenticated;
grant execute on function public.next_business_window_tz(timestamptz, text, text, text, text, boolean, boolean) to anon, authenticated;
grant execute on function public.rebucket_queue_to_business_days(uuid, int) to authenticated;

