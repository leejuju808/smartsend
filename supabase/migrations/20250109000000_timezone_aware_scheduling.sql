-- A) Lead timezone (IANA TZ like "America/New_York")

alter table public.leads
  add column if not exists timezone text;  -- nullable; fallback rules below

create index if not exists idx_leads_timezone on public.leads(timezone);

-- B) Campaign-level toggle + default timezone fallback

alter table public.campaigns
  add column if not exists use_lead_local_time boolean not null default false,
  add column if not exists fallback_timezone text; -- e.g., "America/Los_Angeles"

-- C) Optional mapping table you can curate (domain -> IANA TZ)

create table if not exists public.domain_timezones (
  domain citext primary key,
  timezone text not null  -- IANA TZ
);

-- D) TZ-aware window function (respects start/end in local time)

create or replace function public.apply_send_window_tz(
  p_base timestamptz,
  p_start text,  -- 'HH:MM'
  p_end text,    -- 'HH:MM'
  p_tz text      -- IANA timezone like 'America/New_York', null = UTC fallback
) returns timestamptz
language plpgsql immutable
as $$
declare
  sh int; sm int; eh int; em int;
  local_base timestamptz;
  local_start timestamptz;
  local_end   timestamptz;
  result      timestamptz;
begin
  if p_start is null or p_end is null then
    return p_base;
  end if;

  -- If no timezone provided, fall back to UTC-based window (original behavior)
  if p_tz is null then
    return public.apply_send_window(p_base, p_start, p_end);
  end if;

  sh := split_part(p_start, ':', 1)::int; sm := split_part(p_start, ':', 2)::int;
  eh := split_part(p_end,   ':', 1)::int; em := split_part(p_end,   ':', 2)::int;

  -- interpret base in lead's local day
  local_base := (p_base at time zone p_tz);

  -- create window boundaries in UTC (representing local time in the timezone)
  local_start := make_timestamptz(extract(year from local_base)::int, extract(month from local_base)::int, extract(day from local_base)::int, sh, sm, 0, p_tz);
  local_end   := make_timestamptz(extract(year from local_base)::int, extract(month from local_base)::int, extract(day from local_base)::int, eh, em, 0, p_tz);

  -- compare: convert timestamptz boundaries to local time for comparison with local_base
  if local_base < (local_start at time zone p_tz) then
    result := local_start;        -- snap to window start (already in UTC)
  elsif local_base > (local_end at time zone p_tz) then
    result := local_start + interval '1 day'; -- next day's window start
  else
    result := p_base;  -- keep original time if within window
  end if;

  return result;
end $$;

-- E) Helper: choose a timezone for a lead with fallbacks

create or replace function public.pick_lead_timezone(
  p_lead uuid,
  p_campaign uuid
) returns text
language sql stable
set search_path=public
as $$
  with l as (
    select timezone, domain::citext as domain from public.leads where id = p_lead
  ),
  via_domain as (
    select dt.timezone
    from l
    join public.domain_timezones dt on dt.domain = l.domain
  ),
  via_campaign as (
    select c.fallback_timezone as timezone, c.use_lead_local_time as use_local
    from public.campaigns c where c.id = p_campaign
  )
  select
    case
      when (select use_local from via_campaign) is not true then null
      else coalesce(
        (select timezone from l where timezone is not null),
        (select timezone from via_domain),
        (select timezone from via_campaign where fallback_timezone is not null),
        null
      )
    end
$$;

