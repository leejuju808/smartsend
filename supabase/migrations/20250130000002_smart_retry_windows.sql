-- Block 119: Smart Retry Windows (quiet hours + provider-local midnights + regional cooldowns)
-- Idempotent migration

-- A) Account-level sending preferences
create table if not exists public.account_sending_prefs (
  account_id uuid primary key,
  tz text not null default 'America/Los_Angeles',            -- IANA TZ
  quiet_start time,                                          -- e.g. '20:00'
  quiet_end time,                                            -- e.g. '08:00'
  pause_weekends boolean not null default false,             -- skip Sat/Sun for retries
  max_daily_window_end time,                                 -- hard stop in local time (optional UI)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Handle FK constraint: try to reference public.accounts(id) if it exists
do $$
begin
  -- Try to add FK constraint, but ignore if accounts table doesn't exist or has different structure
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'accounts') then
    -- Check if FK already exists
    if not exists (
      select 1 from pg_constraint 
      where conname = 'account_sending_prefs_account_id_fkey'
    ) then
      -- Try to add FK, but allow it to fail gracefully if accounts structure differs
      begin
        alter table public.account_sending_prefs
          add constraint account_sending_prefs_account_id_fkey
          foreign key (account_id) references public.accounts(id) on delete cascade;
      exception when others then
        -- If FK fails, we'll just use uuid without FK constraint
        null;
      end;
    end if;
  end if;
end $$;

-- B) Provider reset rules (quota reset hour in provider-local time)
create table if not exists public.provider_reset_rules (
  provider text primary key check (provider in ('gmail','outlook')),
  tz text not null,                  -- e.g. 'America/Los_Angeles' or tenant TZ
  reset_hour smallint not null,      -- 0..23 local hour when daily quota resets
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.provider_reset_rules (provider, tz, reset_hour)
values ('gmail','America/Los_Angeles',0), ('outlook','America/Los_Angeles',0)
on conflict (provider) do nothing;

-- C) Regional cooldowns (by TLD or region tag)
create table if not exists public.region_cooldowns (
  id uuid primary key default gen_random_uuid(),
  label text not null,                                 -- 'EU (GDPR-sensitive)', 'APAC', 'edu', etc.
  tld text,                                            -- e.g. 'edu','gov','de'
  domain text,                                         -- optional explicit domain rule
  cooldown_minutes int not null default 30,            -- minimum spacing after a deferral/429
  quiet_start time,                                    -- optional region quiet
  quiet_end time,
  tz text,                                            -- region-local TZ; if null, use account tz
  unique (coalesce(tld,''), coalesce(domain,''))
);

-- D) Helpers
create or replace function public.extract_tld(p_email text)
returns text language sql immutable as $$
  select case when p_email is null then null
              else split_part(split_part(lower(p_email),'@',2),'.', array_length(regexp_split_to_array(split_part(lower(p_email),'@',2),'\.'),1)) end
$$;

create or replace function public.match_region(p_email text)
returns table(label text, cooldown_minutes int, quiet_start time, quiet_end time, tz text)
language sql stable as $$
  with d as (select lower(split_part(p_email,'@',2)) as dom,
                  public.extract_tld(p_email) as tld)
  select r.label, r.cooldown_minutes, r.quiet_start, r.quiet_end, r.tz
  from region_cooldowns r, d
  where (r.domain is not null and r.domain = d.dom)
     or (r.tld is not null and r.tld = d.tld)
  limit 1
$$;

-- E) Compute next retry respecting all rules
create or replace function public.compute_next_retry_at(
  p_account uuid,
  p_provider text,
  p_recipient text,
  p_attempt int,
  p_error_kind text default null   -- e.g. 'rate_limit','server_error','invalid_recipient','temporary_deferral'
) returns timestamptz
language plpgsql
stable
as $$
declare
  v_now_utc timestamptz := now();
  v_pref record;
  v_prov record;
  v_reg record;

  -- base backoff (seconds) with cap
  v_base_seconds int := least( (case when p_attempt < 1 then 1 else 1 end * (2 ^ greatest(p_attempt,1))) * 60, 3600 ); -- 2^n * 60s capped at 1h
  v_jitter int := floor(random()*15)::int * 1; -- 0–14s jitter
  v_proposed timestamptz := v_now_utc + make_interval(secs => v_base_seconds + v_jitter);

  v_local timestamptz;
  v_local_time time;
  v_quiet_start time;
  v_quiet_end time;
  v_tz text;
  v_pause_weekends boolean := false;

  -- region overrides
  v_reg_quiet_start time;
  v_reg_quiet_end time;
  v_reg_tz text;
  v_reg_extra interval := interval '0 minutes';

  -- quota reset handling
  v_reset_at timestamptz;
  v_reset_local_base timestamptz;

  v_dow int;
begin
  -- Load prefs (fallback defaults)
  select * into v_pref from public.account_sending_prefs where account_id = p_account;
  if not found then
    v_pref := row(p_account, 'America/Los_Angeles'::text, null::time, null::time, false, null::time, now(), now());
  end if;

  v_tz := coalesce(v_pref.tz, 'America/Los_Angeles');

  -- Region match (optional)
  select * into v_reg from public.match_region(p_recipient);
  if found then
    v_reg_tz := v_reg.tz;
    v_reg_quiet_start := v_reg.quiet_start;
    v_reg_quiet_end := v_reg.quiet_end;
    v_reg_extra := make_interval(mins => coalesce(v_reg.cooldown_minutes, 0));
  end if;

  -- Apply rate-limit/deferral bias
  if p_error_kind in ('rate_limit','temporary_deferral') then
    v_base_seconds := least( (2 ^ greatest(p_attempt,1)) * 120, 7200 ); -- 2^n * 120s, cap 2h
    v_proposed := v_now_utc + make_interval(secs => v_base_seconds + v_jitter);
  end if;

  -- Add regional cooldown if present
  v_proposed := v_proposed + v_reg_extra;

  -- Quiet hours logic — prefer region tz if set, else account tz
  v_tz := coalesce(v_reg_tz, v_tz);
  v_local := timezone(v_tz, v_proposed);
  v_local_time := v_local::time;

  v_quiet_start := coalesce(v_reg_quiet_start, v_pref.quiet_start);
  v_quiet_end   := coalesce(v_reg_quiet_end,   v_pref.quiet_end);
  v_pause_weekends := coalesce(v_pref.pause_weekends, false);

  -- Weekend pause
  if v_pause_weekends then
    v_dow := extract(isodow from v_local); -- 6 = Sat, 7 = Sun
    if v_dow in (6,7) then
      -- push to next Monday 08:00 local (or quiet_end if defined)
      -- Saturday (6) -> add 2 days, Sunday (7) -> add 1 day
      v_local := date_trunc('day', v_local) 
        + (case when v_dow = 6 then 2 else 1 end) * interval '1 day' 
        + make_interval(hours => coalesce(extract(hour from v_quiet_end)::int, 8));
    end if;
  end if;

  -- If inside quiet window, move to quiet_end today or next day if wrap
  if v_quiet_start is not null and v_quiet_end is not null then
    if v_quiet_start < v_quiet_end then
      -- normal window (e.g., 20:00–08:00 is NOT normal; this is e.g., 12:00–14:00)
      if v_local_time between v_quiet_start and v_quiet_end then
        v_local := date_trunc('day', v_local) + v_quiet_end;
      end if;
    else
      -- overnight window (e.g., 20:00–08:00)
      if (v_local_time >= v_quiet_start) or (v_local_time < v_quiet_end) then
        if v_local_time >= v_quiet_start then
          v_local := date_trunc('day', v_local + interval '1 day') + v_quiet_end;
        else
          v_local := date_trunc('day', v_local) + v_quiet_end;
        end if;
      end if;
    end if;
  end if;

  -- Provider quota reset: if error was rate/quota, consider jumping to provider-local reset hour
  if p_error_kind in ('rate_limit','quota_exceeded') then
    select * into v_prov from public.provider_reset_rules where provider = p_provider;
    if found then
      v_reset_local_base := timezone(v_prov.tz, v_now_utc);
      v_reset_local_base := date_trunc('day', v_reset_local_base);
      v_reset_local_base := v_reset_local_base + make_interval(hours => v_prov.reset_hour);

      if timezone(v_prov.tz, v_now_utc) > v_reset_local_base then
        v_reset_local_base := v_reset_local_base + interval '1 day';
      end if;

      v_reset_at := (v_reset_local_base at time zone v_prov.tz);
      -- choose the earlier of (smart backoff honoring quiets) **after** reset OR current plan, whichever is later than now
      if v_reset_at > v_now_utc and v_reset_at < (v_local at time zone v_tz) then
        v_local := timezone(v_tz, v_reset_at + (random()*300)::int * interval '1 second'); -- add ≤5m jitter after reset
      end if;
    end if;
  end if;

  -- Honor max daily window end if set and we overshoot
  if v_pref.max_daily_window_end is not null then
    if v_local::time > v_pref.max_daily_window_end then
      v_local := date_trunc('day', v_local + interval '1 day') + v_pref.max_daily_window_end;
    end if;
  end if;

  -- Return in UTC
  return (v_local at time zone v_tz);
end;
$$;

-- F) Seed data: Give every account a default TZ + overnight quiet (20:00–08:00) if not set
-- Note: This assumes accounts table exists. If it references auth.users, adjust accordingly.
do $$
begin
  -- Try to insert defaults for existing accounts
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'accounts') then
    insert into public.account_sending_prefs (account_id, tz, quiet_start, quiet_end, pause_weekends)
    select a.id, 'America/Los_Angeles', '20:00'::time, '08:00'::time, false
    from public.accounts a
    on conflict (account_id) do nothing;
  end if;
end $$;

-- G) Region example: EDU domains → longer cooldown + school hours quiet
insert into public.region_cooldowns (label, tld, cooldown_minutes, quiet_start, quiet_end, tz)
values ('US EDU','edu', 60, '21:00','07:30','America/New_York')
on conflict do nothing;

-- H) Indexes for performance
create index if not exists idx_account_sending_prefs_account on public.account_sending_prefs(account_id);
create index if not exists idx_region_cooldowns_tld on public.region_cooldowns(tld) where tld is not null;
create index if not exists idx_region_cooldowns_domain on public.region_cooldowns(domain) where domain is not null;

