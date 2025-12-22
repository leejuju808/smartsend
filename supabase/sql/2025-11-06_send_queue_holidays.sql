-- Lead country column for holiday lookups -------------------------------------
alter table public.leads
  add column if not exists country text;


-- Holidays catalog -------------------------------------------------------------
create table if not exists public.holidays (
  country text not null,
  d date not null,
  name text not null,
  observed boolean not null default true,
  primary key (country, d, name)
);

do $$
begin
  begin
    alter table public.holidays drop constraint holidays_pkey;
  exception
    when undefined_object then
      null;
  end;

  begin
    alter table public.holidays add constraint holidays_pkey primary key (country, d, name);
  exception
    when duplicate_table then
      null;
  end;
end;
$$;

create index if not exists idx_holidays_country_date on public.holidays(country, d);

-- Campaign send window columns -------------------------------------------------
alter table if exists public.campaigns
  add column if not exists send_tz text,
  add column if not exists window_start time,
  add column if not exists window_end time,
  add column if not exists business_days_only boolean default true,
  add column if not exists holidays_country text,
  add column if not exists quiet_hours jsonb default '{}'::jsonb;

-- Lead timezone metadata -------------------------------------------------------
alter table if exists public.leads
  add column if not exists tz text;

-- Account timezone helper ------------------------------------------------------
drop function if exists public.account_tz(uuid);

create or replace function public.account_tz(p_account uuid)
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select meta->>'tz' from public.connected_accounts where id = p_account),
    'America/Los_Angeles'
  );
$$;

-- Campaign timezone helper -----------------------------------------------------
drop function if exists public.campaign_tz(uuid);

create or replace function public.campaign_tz(p_campaign uuid)
returns text
language sql
stable
set search_path = public
as $$
  with c as (
    select send_tz, from_account_id
    from public.campaigns
    where id = p_campaign
  )
  select coalesce(
    nullif(c.send_tz, ''),
    public.account_tz(c.from_account_id)
  )
  from c;
$$;

-- Helper: is given local date a holiday for a country? -------------------------
create or replace function public.is_holiday_local(p_country text, p_date date)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists(
    select 1
    from public.holidays h
    where h.country = upper(coalesce(p_country, ''))
      and h.d = p_date
      and h.observed
  );
$$;

drop function if exists public.is_holiday(date, text);

create or replace function public.is_holiday(p_date date, p_country text)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists(
    select 1
    from public.holidays h
    where upper(h.country) = upper(coalesce(p_country, 'US'))
      and h.d = p_date
      and h.observed
  );
$$;

drop function if exists public.is_business_day(date, text);

create or replace function public.is_business_day(p_date date, p_country text)
returns boolean
language sql
stable
set search_path = public
as $$
  select (extract(isodow from p_date)::int between 1 and 5)
         and not public.is_holiday(p_date, p_country);
$$;

drop function if exists public.next_send_window(uuid, uuid, timestamptz);

create or replace function public.next_send_window(
  p_campaign uuid,
  p_lead uuid,
  p_base timestamptz default now()
)
returns table(
  window_start_utc timestamptz,
  window_end_utc   timestamptz,
  window_tz        text,
  business_day     date,
  reason           text
)
language plpgsql
stable
set search_path = public
as $$
declare
  v_lead_tz text;
  v_lead_country text;
  v_campaign_country text;
  v_tz text;
  v_country text;
  v_bdo boolean := true;
  v_ws time := time '09:00';
  v_we time := time '17:00';
  v_local timestamp;
  v_day date;
  v_start_local timestamp;
  v_end_local timestamp;
  v_reason text := '';
  i int := 0;
begin
  select
    coalesce(nullif(l.tz, ''), nullif(l.meta->>'tz', '')),
    coalesce(nullif(l.country, ''), nullif(l.meta->>'country', ''))
  into v_lead_tz, v_lead_country
  from public.leads l
  where l.id = p_lead;

  select
    coalesce(c.business_days_only, true),
    coalesce(c.window_start, time '09:00'),
    coalesce(c.window_end, time '17:00'),
    coalesce(nullif(c.holidays_country, ''), 'US')
  into v_bdo, v_ws, v_we, v_campaign_country
  from public.campaigns c
  where c.id = p_campaign;

  v_country := coalesce(nullif(v_lead_country, ''), v_campaign_country, 'US');
  v_tz := coalesce(nullif(v_lead_tz, ''), public.campaign_tz(p_campaign), 'UTC');

  if v_we <= v_ws then
    v_we := (v_ws + interval '1 hour')::time;
  end if;

  v_local := p_base at time zone v_tz;
  v_day := v_local::date;

  <<seek>>
  loop
    exit when i > 30;

    if v_bdo and not public.is_business_day(v_day, v_country) then
      v_reason := 'skip: non-business day';
      v_day := (v_day + interval '1 day')::date;
      v_local := v_local + interval '1 day';
      i := i + 1;
      continue;
    end if;

    v_start_local := (v_day + v_ws)::timestamp;
    v_end_local   := (v_day + v_we)::timestamp;

    if v_local <= v_start_local then
      -- ok, today's window
      v_reason := coalesce(nullif(v_reason, ''), 'ok');
    elsif v_local >= v_end_local then
      v_day := (v_day + interval '1 day')::date;
      v_local := v_local + interval '1 day';
      v_reason := 'rollover: after window';
      i := i + 1;
      continue;
    else
      v_start_local := v_local;
      v_reason := 'inside window';
    end if;

    return query
      select
        (v_start_local at time zone v_tz)::timestamptz,
        (v_end_local at time zone v_tz)::timestamptz,
        v_tz,
        v_day,
        coalesce(nullif(v_reason, ''), 'ok');
    return;
  end loop;

  return query
    select
      (p_base + interval '24 hours')::timestamptz,
      (p_base + interval '25 hours')::timestamptz,
      v_tz,
      (p_base at time zone v_tz)::date,
      'fallback';
end;
$$;

drop function if exists public.preview_next_windows(uuid, uuid, int, timestamptz);

create or replace function public.preview_next_windows(
  p_campaign uuid,
  p_lead uuid,
  p_n int default 5,
  p_base timestamptz default now()
)
returns table(
  i int,
  start_utc timestamptz,
  end_utc timestamptz,
  local_date date,
  tz text
)
language plpgsql
stable
set search_path = public
as $$
declare
  k int := 1;
  cur_start timestamptz;
  cur_end   timestamptz;
  cur_tz    text;
  cur_day   date;
begin
  while k <= greatest(1, p_n) loop
    select window_start_utc, window_end_utc, window_tz, business_day
      into cur_start, cur_end, cur_tz, cur_day
    from public.next_send_window(
      p_campaign,
      p_lead,
      case when k = 1 then p_base else cur_end + interval '1 minute' end
    )
    limit 1;

    return query
      select k, cur_start, cur_end, cur_day, cur_tz;

    k := k + 1;
  end loop;
end;
$$;


-- Business window finder with optional holiday skipping -----------------------
drop function if exists public.next_window_utc(timestamptz, text, text, text, int[]);

create or replace function public.next_window_utc(
  p_from timestamptz,
  p_tz text,
  p_start text,
  p_end text,
  p_days int[] default array[1,2,3,4,5],
  p_skip_holidays boolean default false,
  p_country text default null
) returns timestamptz
language plpgsql
stable
set search_path = public
as $$
declare
  local_from timestamp;
  d date;
  tod time;
  dow int;
  start_local timestamp;
  end_local timestamp;
  candidate_local timestamp;
  i int := 0;
  tz_use text := coalesce(nullif(p_tz, ''), 'UTC');
begin
  local_from := p_from at time zone tz_use;
  d := date_trunc('day', local_from)::date;
  tod := local_from::time;

  loop
    exit when i > 31;
    dow := extract(isodow from d);

    if p_days is null or array_length(p_days, 1) is null or p_days @> array[dow] then
      if not (p_skip_holidays and public.is_holiday_local(p_country, d)) then
        start_local := d::timestamp + (p_start)::time;
        end_local := d::timestamp + (p_end)::time;

        if tod < (p_end)::time then
          if tod < (p_start)::time then
            candidate_local := start_local;
          else
            candidate_local := local_from;
          end if;

          if candidate_local <= end_local then
            return (candidate_local at time zone tz_use);
          end if;
        end if;
      end if;
    end if;

    d := d + interval '1 day';
    tod := time '00:00';
    i := i + 1;
  end loop;

  return p_from;
end;
$$;


-- Enqueue upgrade with holiday skipping ---------------------------------------
drop function if exists public.enqueue_step_for_leads(uuid,int,uuid[],timestamptz,int,int,boolean,text,text,int[]);

create or replace function public.enqueue_step_for_leads(
  p_campaign uuid,
  p_step_no int,
  p_leads uuid[],
  p_start_at timestamptz,
  p_per_min int default 20,
  p_jitter_seconds int default 45,
  p_business_hours boolean default false,
  p_window_start text default '08:00',
  p_window_end text default '17:00',
  p_days int[] default array[1,2,3,4,5],
  p_skip_holidays boolean default true
) returns int
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  i int := 0;
  batch_min int := greatest(p_per_min, 1);
  v_owner uuid;
  v_due timestamptz := p_start_at;
  v_lead uuid;
  v_tz text;
  v_campaign_tz text;
  v_country_raw text;
  v_country text;
  v_campaign_country text;
  v_due_effective timestamptz;
  v_jitter int;
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_window_tz text;
  v_window_reason text;
  v_due_local_date date;
  v_use_window boolean;
begin
  select user_id,
         coalesce(nullif(c.holidays_country, ''), 'US')
    into v_owner, v_campaign_country
    from public.campaigns c
   where c.id = p_campaign;

  if v_owner is null then
    raise exception 'Campaign not found';
  end if;

  v_campaign_tz := coalesce(public.campaign_tz(p_campaign), 'UTC');

  foreach v_lead in array p_leads loop
    if i > 0 and i % batch_min = 0 then
      v_due := v_due + interval '1 minute';
    end if;

    select
      coalesce(nullif(l.tz, ''), nullif(l.meta->>'tz', ''), v_campaign_tz),
      coalesce(nullif(l.country, ''), nullif(l.meta->>'country', ''))
      into v_tz, v_country_raw
      from public.leads l
     where l.id = v_lead;

    v_tz := coalesce(nullif(v_tz, ''), v_campaign_tz, 'UTC');
    v_country := upper(coalesce(v_country_raw, v_campaign_country, 'US'));
    v_due_local_date := (v_due at time zone v_tz)::date;

    select window_start_utc, window_end_utc, window_tz, reason
      into v_window_start, v_window_end, v_window_tz, v_window_reason
    from public.next_send_window(p_campaign, v_lead, v_due)
    limit 1;

    v_use_window := false;

    if p_business_hours then
      v_due_effective := coalesce(v_window_start, v_due);
      if v_window_start is not null and v_window_end is not null then
        v_use_window := true;
      end if;
    else
      v_due_effective := v_due;
      if p_skip_holidays and public.is_holiday(v_due_local_date, v_country) then
        v_due_effective := coalesce(v_window_start, v_due);
        if v_window_start is not null and v_window_end is not null then
          v_use_window := true;
        end if;
      end if;
    end if;

    v_jitter := case when p_jitter_seconds <= 0 then 0 else floor(random() * p_jitter_seconds)::int end;

    if v_jitter > 0 then
      v_due_effective := v_due_effective + make_interval(secs => v_jitter);
    end if;

    if v_use_window then
      if v_window_start is not null and v_due_effective < v_window_start then
        v_due_effective := v_window_start;
      end if;
      if v_window_end is not null and v_due_effective >= v_window_end then
        v_due_effective := greatest(
          coalesce(v_window_start, v_due_effective),
          v_window_end - interval '1 second'
        );
      end if;
      if v_window_start is not null and v_due_effective < v_window_start then
        v_due_effective := v_window_start;
      end if;
    end if;

    insert into public.send_queue (campaign_id, lead_id, step_no, due_at)
    select p_campaign, v_lead, p_step_no,
           v_due_effective
    where not exists (
      select 1
      from public.send_queue q
      where q.campaign_id = p_campaign
        and q.lead_id = v_lead
        and q.step_no = p_step_no
    )
    on conflict do nothing;

    update public.campaign_leads
       set status = 'queued'
     where campaign_id = p_campaign
       and lead_id = v_lead
       and status = 'new';

    i := i + 1;
  end loop;

  return i;
end;
$$;


revoke all on function public.enqueue_step_for_leads(uuid,int,uuid[],timestamptz,int,int,boolean,text,text,int[],boolean) from public;
grant execute on function public.enqueue_step_for_leads(uuid,int,uuid[],timestamptz,int,int,boolean,text,text,int[],boolean) to service_role;


-- Optional seeds ---------------------------------------------------------------
insert into public.holidays(country, d, name, observed) values
  ('US','2025-01-01','New Year''s Day', true),
  ('US','2025-01-20','MLK Day (Observed)', true),
  ('US','2025-02-17','Presidents Day', true),
  ('US','2025-05-26','Memorial Day', true),
  ('US','2025-07-04','Independence Day', true),
  ('US','2025-09-01','Labor Day', true),
  ('US','2025-11-27','Thanksgiving', true),
  ('US','2025-12-25','Christmas', true)
on conflict do nothing;

grant execute on function public.next_send_window(uuid, uuid, timestamptz) to service_role;
grant execute on function public.preview_next_windows(uuid, uuid, int, timestamptz) to service_role;

