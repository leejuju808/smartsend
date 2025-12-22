-- Sending Profiles System
-- Per-connected account sending profiles with daily caps, rate limits, windows, holidays, and scheduling

-- A) Per-connected account sending profile
create table if not exists public.account_sending_profiles (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  account_id uuid unique not null references public.connected_accounts(id) on delete cascade,

  -- caps
  daily_cap int not null default 200,                 -- max "sent" per calendar day (account tz)
  per_minute_rate int not null default 8,             -- rolling rate cap (emails/min)

  -- scheduling window (account-local)
  tz text not null default 'America/Los_Angeles',
  window_start time with time zone,                   -- e.g., '09:00'
  window_end   time with time zone,                   -- e.g., '17:00'
  business_days_only boolean not null default true,   -- Mon-Fri only
  respect_lead_local_time boolean not null default true, -- true → compute using lead tz for *window*, else account tz

  -- jitter between sends (0..600s typical)
  min_spacing_seconds int not null default 8
);

create index if not exists idx_prof_account on public.account_sending_profiles(account_id);

-- B) Optional holiday calendar per account (idempotent)
create table if not exists public.account_holidays (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  tz text not null default 'America/Los_Angeles',
  holiday_date date not null,
  unique(account_id, holiday_date)
);
create index if not exists idx_holidays_account on public.account_holidays(account_id, holiday_date);

-- C) Daily counters (incremented on 'sent')
create table if not exists public.account_daily_counters (
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  day date not null,
  tz text not null,
  sent_count int not null default 0,
  primary key (account_id, day)
);

-- D) send_queue fields used by scheduler
alter table public.send_queue
  add column if not exists scheduled_at timestamptz,
  add column if not exists not_before timestamptz,
  add column if not exists attempt_after timestamptz;

-- Update status column constraint to include new statuses if needed
do $$
begin
  -- Check if status column exists and update constraint
  if exists (select 1 from information_schema.columns 
             where table_schema = 'public' and table_name = 'send_queue' and column_name = 'status') then
    -- Drop existing constraint if it exists
    if exists (select 1 from pg_constraint where conname = 'send_queue_status_check') then
      alter table public.send_queue drop constraint send_queue_status_check;
    end if;
    -- Add new constraint with all statuses
    alter table public.send_queue add constraint send_queue_status_check 
      check (status in ('queued','scheduled','sending','sent','failed','canceled','deferred'));
  end if;
end $$;

-- Set default status if needed
do $$
begin
  if exists (select 1 from information_schema.columns 
             where table_schema = 'public' and table_name = 'send_queue' and column_name = 'status') then
    -- Update null statuses to 'queued'
    update public.send_queue set status = 'queued' where status is null;
    alter table public.send_queue alter column status set default 'queued';
  end if;
end $$;

create index if not exists idx_queue_sched on public.send_queue(status, coalesce(scheduled_at, not_before), account_id);
create index if not exists idx_queue_attempt on public.send_queue(status, attempt_after);

-- E) Helper: is_business_day with holidays (account or lead tz)
create or replace function public.is_business_day(p_date date, p_account uuid)
returns boolean
language sql stable as $$
  with w as (
    select extract(dow from p_date)::int as dow
  ),
  h as (
    select 1 from public.account_holidays ah
    where ah.account_id = p_account and ah.holiday_date = p_date
    limit 1
  )
  select case
           when exists(select 1 from h) then false
           when (select dow from w) in (0,6) then false  -- Sun(0), Sat(6)
           else true
         end;
$$;

-- F) Next window opener (respect account or lead tz)
create or replace function public.next_window_start(
  p_account uuid,
  p_lead_tz text,
  p_now timestamptz default now()
) returns timestamptz
language plpgsql stable
as $$
declare
  v_profile record;
  v_tz text;
  v_ws time with time zone;
  v_we time with time zone;
  v_dt timestamptz;
  v_date date;
  v_try int := 0;
  v_begin timestamptz;
  v_end timestamptz;
begin
  select * into v_profile from public.account_sending_profiles where account_id = p_account;
  if not found then
    -- default: send now
    return p_now;
  end if;

  v_tz := case when v_profile.respect_lead_local_time and p_lead_tz is not null then p_lead_tz else v_profile.tz end;
  v_ws := coalesce(v_profile.window_start, '08:00'::time with time zone);
  v_we := coalesce(v_profile.window_end,   '17:00'::time with time zone);

  -- Start with today's date in chosen tz
  v_dt := p_now at time zone v_tz;
  v_date := (v_dt)::date;

  <<search_loop>>
  loop
    exit when v_try > 30; -- safety: 1 month
    -- If business days only, skip weekends/holidays
    if not v_profile.business_days_only or public.is_business_day(v_date, p_account) then
      -- candidates
      -- begin and end of window on v_date in v_tz
      -- Create timestamp without timezone, then interpret it in the target timezone
      v_begin := timezone(v_tz, (v_date + v_ws)::timestamp);
      v_end   := timezone(v_tz, (v_date + v_we)::timestamp);

      if p_now <= v_begin then
        return v_begin;
      elsif p_now > v_begin and p_now <= v_end then
        return p_now; -- we're inside the window
      end if;
    end if;

    -- move to next day
    v_date := v_date + 1;
    v_try := v_try + 1;
  end loop;

  -- fallback
  return p_now;
end;
$$;

-- G) Rolling throttle: when can this account send next?
create or replace function public.account_throttle_frees_at(
  p_account uuid,
  p_now timestamptz default now()
) returns timestamptz
language plpgsql stable
as $$
declare
  v_profile record;
  v_per_min int;
  v_window_seconds int;
  v_since timestamptz;
  v_sent int;
  v_last timestamptz;
begin
  select * into v_profile from public.account_sending_profiles where account_id = p_account;
  if not found then
    return p_now;
  end if;

  v_per_min := greatest(1, v_profile.per_minute_rate);
  v_window_seconds := 60;
  v_since := p_now - make_interval(secs := v_window_seconds);

  -- Count sent in last 60s and also get last sent timestamp
  select count(*), max(created_at) into v_sent, v_last
  from public.send_logs
  where account_id = p_account
    and status = 'sent'
    and created_at >= v_since;

  if v_sent < v_per_min then
    -- respect min spacing between last send and now
    if v_last is not null and v_profile.min_spacing_seconds > 0 then
      return greatest(p_now, v_last + make_interval(secs := v_profile.min_spacing_seconds));
    end if;
    return p_now;
  end if;

  -- throttle -> free at earliest of (since + 60s) OR (last + spacing)
  return greatest(v_since + make_interval(secs := 60), coalesce(v_last, p_now) + make_interval(secs := v_profile.min_spacing_seconds));
end;
$$;

-- H) Daily cap remaining for account at 'now' in account tz
create or replace function public.account_daily_remaining(
  p_account uuid,
  p_now timestamptz default now()
) returns int
language plpgsql stable
as $$
declare
  v_profile record;
  v_local_day date;
  v_sent int;
begin
  select * into v_profile from public.account_sending_profiles where account_id = p_account;
  if not found then return 999999; end if;

  v_local_day := (p_now at time zone v_profile.tz)::date;

  select count(*) into v_sent
  from public.send_logs
  where account_id = p_account
    and status = 'sent'
    and (created_at at time zone v_profile.tz)::date = v_local_day;

  return greatest(0, v_profile.daily_cap - coalesce(v_sent,0));
end;
$$;

-- I) Counter maintenance on send (increment daily_counters)
create or replace function public.tg_bump_daily_counter()
returns trigger
language plpgsql
as $$
declare
  v_profile record;
  v_day date;
begin
  if NEW.status = 'sent' then
    select * into v_profile from public.account_sending_profiles where account_id = NEW.account_id;
    if found then
      v_day := (NEW.created_at at time zone v_profile.tz)::date;

      insert into public.account_daily_counters(account_id, day, tz, sent_count)
      values (NEW.account_id, v_day, v_profile.tz, 1)
      on conflict (account_id, day)
      do update set sent_count = public.account_daily_counters.sent_count + 1;
    end if;
  end if;
  return NEW;
end $$;

drop trigger if exists trg_sendlogs_bump_daily on public.send_logs;
create trigger trg_sendlogs_bump_daily
after insert on public.send_logs
for each row execute function public.tg_bump_daily_counter();

-- J) Next permissible send at (main RPC function)
create or replace function public.next_permissible_send_at(
  p_account uuid,
  p_lead_tz text,
  p_now timestamptz default now()
) returns timestamptz
language plpgsql stable
as $$
declare
  v_win timestamptz;
  v_thr timestamptz;
  v_rem int;
begin
  v_win := public.next_window_start(p_account, p_lead_tz, p_now);
  v_thr := public.account_throttle_frees_at(p_account, p_now);

  v_rem := public.account_daily_remaining(p_account, greatest(v_win, v_thr));
  if v_rem <= 0 then
    -- move to next business day window open
    v_win := public.next_window_start(p_account, p_lead_tz, (greatest(v_win, v_thr) + interval '12 hours'));
    -- loop to tomorrow if still same date
    v_win := public.next_window_start(p_account, p_lead_tz, v_win + interval '12 hours');
    return v_win;
  end if;

  return greatest(v_win, v_thr);
end;
$$;

-- K) Seed default profiles for existing connected accounts
insert into public.account_sending_profiles(account_id, daily_cap, per_minute_rate, tz, window_start, window_end, business_days_only, respect_lead_local_time, min_spacing_seconds)
select ca.id, 200, 8, 'America/Los_Angeles', '09:00'::time with time zone, '17:00'::time with time zone, true, true, 8
from public.connected_accounts ca
left join public.account_sending_profiles p on p.account_id = ca.id
where p.id is null;

-- L) RLS policies for new tables
alter table public.account_sending_profiles enable row level security;
alter table public.account_holidays enable row level security;
alter table public.account_daily_counters enable row level security;

-- Allow users to read their own account profiles
drop policy if exists "Users can read own account profiles" on public.account_sending_profiles;
create policy "Users can read own account profiles" on public.account_sending_profiles
  for select using (
    exists (
      select 1 from public.connected_accounts ca
      where ca.id = account_sending_profiles.account_id
      and ca.user_id = auth.uid()
    )
  );

-- Allow users to update their own account profiles
drop policy if exists "Users can update own account profiles" on public.account_sending_profiles;
create policy "Users can update own account profiles" on public.account_sending_profiles
  for update using (
    exists (
      select 1 from public.connected_accounts ca
      where ca.id = account_sending_profiles.account_id
      and ca.user_id = auth.uid()
    )
  );

-- Allow users to read their own holidays
drop policy if exists "Users can read own holidays" on public.account_holidays;
create policy "Users can read own holidays" on public.account_holidays
  for select using (
    exists (
      select 1 from public.connected_accounts ca
      where ca.id = account_holidays.account_id
      and ca.user_id = auth.uid()
    )
  );

-- Allow users to manage their own holidays
drop policy if exists "Users can manage own holidays" on public.account_holidays;
create policy "Users can manage own holidays" on public.account_holidays
  for all using (
    exists (
      select 1 from public.connected_accounts ca
      where ca.id = account_holidays.account_id
      and ca.user_id = auth.uid()
    )
  );

-- Allow users to read their own daily counters
drop policy if exists "Users can read own daily counters" on public.account_daily_counters;
create policy "Users can read own daily counters" on public.account_daily_counters
  for select using (
    exists (
      select 1 from public.connected_accounts ca
      where ca.id = account_daily_counters.account_id
      and ca.user_id = auth.uid()
    )
  );

-- Grant execute on functions
grant execute on function public.is_business_day(date, uuid) to authenticated, anon;
grant execute on function public.next_window_start(uuid, text, timestamptz) to authenticated, anon;
grant execute on function public.account_throttle_frees_at(uuid, timestamptz) to authenticated, anon;
grant execute on function public.account_daily_remaining(uuid, timestamptz) to authenticated, anon;
grant execute on function public.next_permissible_send_at(uuid, text, timestamptz) to authenticated, anon;

