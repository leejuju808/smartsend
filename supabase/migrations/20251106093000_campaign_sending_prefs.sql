-- Campaign sending preferences and helpers

-- Normalize queue scheduling columns for forward/backward compatibility
alter table public.send_queue
  add column if not exists scheduled_for timestamptz;

alter table public.send_queue
  add column if not exists scheduled_at timestamptz;

-- Ensure queue has planned_at column interoperable with legacy scheduled_for
alter table public.send_queue
  add column if not exists planned_at timestamptz;

update public.send_queue
set planned_at = coalesce(planned_at, scheduled_for, scheduled_at, now())
where planned_at is null;

update public.send_queue
set scheduled_for = coalesce(scheduled_for, scheduled_at, planned_at, now())
where scheduled_for is null;

update public.send_queue
set scheduled_at = coalesce(scheduled_at, scheduled_for, planned_at, now())
where scheduled_at is null;

-- A) Per-campaign sending preferences
create table if not exists public.campaign_sending_prefs (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  tz text not null default 'America/Los_Angeles',
  window_start text,
  window_end text,
  business_days_only boolean not null default true,
  allowed_weekdays int[] default array[1,2,3,4,5],
  pace_per_hour int not null default 40,
  daily_cap int default 250,
  jitter_seconds int not null default 180,
  holidays jsonb default '[]'::jsonb
);

comment on column public.campaign_sending_prefs.window_start is 'HH:MM in campaign timezone; null indicates no lower bound';
comment on column public.campaign_sending_prefs.window_end is 'HH:MM in campaign timezone; null indicates no upper bound';
comment on column public.campaign_sending_prefs.allowed_weekdays is '0=Sun … 6=Sat; when set overrides business_days_only flag';
comment on column public.campaign_sending_prefs.holidays is 'Array of YYYY-MM-DD strings (campaign local dates) to skip';


-- B) Track daily send counts per campaign (rollup view)
create or replace view public.v_campaign_sends_today as
with prefs as (
  select campaign_id, coalesce(tz, 'UTC') as tz
  from public.campaign_sending_prefs
)
select
  sl.campaign_id,
  (current_date at time zone coalesce(p.tz, 'UTC'))::date as local_day,
  count(*) filter (
    where sl.created_at >= date_trunc('day', (now() at time zone coalesce(p.tz,'UTC')))
      and sl.created_at < date_trunc('day', (now() at time zone coalesce(p.tz,'UTC'))) + interval '1 day'
  ) as sends_today
from public.send_logs sl
left join prefs p on p.campaign_id = sl.campaign_id
group by sl.campaign_id, local_day;


-- C) Utility: convert local HH:MM and date to timestamptz in that tz
create or replace function public._at_local_time(p_tz text, p_date date, p_hhmm text)
returns timestamptz
language sql
immutable
as $$
  select case
    when p_hhmm is null then null
    else (to_char(p_date, 'YYYY-MM-DD') || ' ' || p_hhmm)::timestamp at time zone p_tz
  end;
$$;


-- D) Compute next in-window time for a campaign, given a base instant
create or replace function public.next_in_window(p_campaign uuid, p_base timestamptz default now())
returns timestamptz
language plpgsql
stable
as $$
declare
  sp record;
  tz text;
  base_local timestamp;
  d date;
  w_start timestamptz;
  w_end timestamptz;
  weekday int;
  skip_day boolean;
  i int := 0;
begin
  select * into sp from public.campaign_sending_prefs where campaign_id = p_campaign;

  if sp is null then
    return p_base;
  end if;

  tz := coalesce(sp.tz, 'UTC');
  base_local := p_base at time zone tz;
  d := base_local::date;

  <<recalc>>
  weekday := extract(dow from d)::int;
  skip_day := false;

  if sp.allowed_weekdays is not null and array_length(sp.allowed_weekdays, 1) > 0 then
    if not (weekday = any (sp.allowed_weekdays)) then
      skip_day := true;
    end if;
  elsif sp.business_days_only and weekday in (0, 6) then
    skip_day := true;
  end if;

  if not skip_day and sp.holidays ?| array[to_char(d,'YYYY-MM-DD')] then
    skip_day := true;
  end if;

  if skip_day then
    d := d + 1;
    i := i + 1;
    if i > 30 then
      return p_base;
    end if;
    goto recalc;
  end if;

  w_start := public._at_local_time(tz, d, sp.window_start);
  w_end   := public._at_local_time(tz, d, sp.window_end);

  if w_start is null and w_end is null then
    return p_base;
  end if;

  if w_start is not null and p_base < w_start then
    return w_start;
  end if;

  if (w_start is null or p_base >= w_start) and (w_end is null or p_base <= w_end) then
    return p_base;
  end if;

  d := d + 1;
  i := i + 1;
  if i > 30 then
    return p_base;
  end if;
  goto recalc;
end;
$$;


-- E) Apply jitter around planned time
create or replace function public.apply_jitter(p_time timestamptz, p_jitter_seconds int)
returns timestamptz
language sql
volatile
as $$
  select p_time
       + ((random() * (2 * p_jitter_seconds)::float - p_jitter_seconds)::int || ' seconds')::interval;
$$;


-- F) Helper: compute next planned_at for queue (respect windows + pacing + cap)
create or replace function public.compute_next_planned_at(
  p_campaign uuid,
  p_base timestamptz default now()
) returns timestamptz
language plpgsql
stable
as $$
declare
  sp record;
  next_time timestamptz;
  spacing interval;
  queued_in_hour int;
  hour_start timestamptz;
  candidate timestamptz;
  sends_today int;
begin
  select * into sp from public.campaign_sending_prefs where campaign_id = p_campaign;

  if sp is null then
    return p_base;
  end if;

  next_time := public.next_in_window(p_campaign, p_base);

  if sp.daily_cap is not null and sp.daily_cap > 0 then
    select sends_today into sends_today
    from public.v_campaign_sends_today
    where campaign_id = p_campaign;

    if coalesce(sends_today, 0) >= sp.daily_cap then
      next_time := public.next_in_window(p_campaign, next_time + interval '1 day');
    end if;
  end if;

  hour_start := date_trunc('hour', next_time);

  select count(*) into queued_in_hour
  from public.send_queue q
  where q.campaign_id = p_campaign
    and q.sent_at is null
    and q.cancelled_at is null
    and q.planned_at >= hour_start
    and q.planned_at < hour_start + interval '1 hour';

  spacing := make_interval(secs => greatest(1, floor(3600.0 / greatest(1, sp.pace_per_hour))));

  candidate := hour_start + spacing * queued_in_hour;

  if candidate < next_time then
    candidate := next_time;
  end if;

  return public.apply_jitter(candidate, sp.jitter_seconds);
end;
$$;


-- G) Trigger: ensure planned_at/scheduled_for stay in sync and respect campaign prefs
create or replace function public._sync_send_queue_planned()
returns trigger
language plpgsql
as $$
begin
  if new.planned_at is null then
    new.planned_at := public.compute_next_planned_at(
      new.campaign_id,
      coalesce(new.scheduled_for, new.scheduled_at, now())
    );
  end if;

  if new.scheduled_for is null then
    new.scheduled_for := new.planned_at;
  end if;

  if new.scheduled_at is null then
    new.scheduled_at := new.planned_at;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_send_queue_planned_sync on public.send_queue;
create trigger trg_send_queue_planned_sync
before insert or update on public.send_queue
for each row execute function public._sync_send_queue_planned();


