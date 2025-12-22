-- Block 81: Send windows, lead timezone, ISP pacing schema/functions

-- 1) Lead timezone field (IANA; e.g., 'America/Los_Angeles')
do $$
begin
  alter table public.leads
    add column if not exists timezone text;
exception
  when duplicate_column then null;
end $$;

-- 2) Account-level default policy (DOW windows in local recipient time)
create table if not exists public.send_time_policies (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null default 'Default',
  -- e.g., {"mon":[9,17],"tue":[9,17],...} hours inclusive start, exclusive end
  windows jsonb not null default '{
    "mon":[9,17],"tue":[9,17],"wed":[9,17],
    "thu":[9,17],"fri":[9,17],"sat":null,"sun":null
  }'::jsonb,
  -- optional quiet hours override (e.g., never before 8 or after 18, even if custom)
  min_hour smallint default 8,  -- 0-23
  max_hour smallint default 18, -- 1-24
  unique (account_id, name)
);

-- 3) ISP pacing rules (per account); bucket by recipient domain
create table if not exists public.isp_pacing_rules (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  bucket text not null check (bucket in ('gmail','outlook','yahoo','other')),
  max_per_minute integer not null default 60,
  burst integer not null default 120,         -- optional short burst
  unique (account_id, bucket)
);

-- seed defaults for all accounts (idempotent)
insert into public.isp_pacing_rules (account_id, bucket, max_per_minute, burst)
select a.id, b.bucket, b.max_per_minute, b.burst
from public.accounts a
cross join (values
  ('gmail',  60, 120),
  ('outlook',40, 80),
  ('yahoo',  30, 60),
  ('other',  80, 160)
) as b(bucket, max_per_minute, burst)
on conflict (account_id, bucket) do nothing;

-- 4) Minute counters per ISP bucket (UTC minute key)
create table if not exists public.isp_minute_counters (
  id bigserial primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  bucket text not null check (bucket in ('gmail','outlook','yahoo','other')),
  minute timestamptz not null, -- truncated to minute (UTC)
  sent_count integer not null default 0,
  unique (account_id, bucket, minute)
);

-- ensure minute column is truncated to minute via constraint
alter table public.isp_minute_counters
  add constraint isp_minute_counters_minute_trunc check (
    date_trunc('minute', minute) = minute
  );

-- 5) Helper: classify recipient domain → ISP bucket
create or replace function public.fn_bucket_for_domain(p_domain text)
returns text
language sql
immutable
as $$
  select case
    when p_domain ~* '(gmail\.com|googlemail\.com|gtempaccount\.com)' then 'gmail'
    when p_domain ~* '(outlook\.com|hotmail\.|live\.|office365\.|microsoft\.com)' then 'outlook'
    when p_domain ~* '(yahoo\.|ymail\.com|rocketmail\.com)' then 'yahoo'
    else 'other'
  end
$$;

-- 6) Helper: check if a local time falls within policy window
create or replace function public.fn_within_window(
  p_tz text,
  p_windows jsonb,
  p_min smallint,
  p_max smallint
) returns boolean
language plpgsql
as $$
declare
  v_dow text;
  v_hour int;
  v_range jsonb;
  v_start int;
  v_end int;
  v_now_local timestamp;
begin
  if p_tz is null then
    -- If unknown, allow during 9-17 UTC as a safe default
    v_hour := extract(hour from (now() at time zone 'UTC'));
    return v_hour between 9 and 16;
  end if;

  v_now_local := (now() at time zone p_tz);
  v_hour := extract(hour from v_now_local);
  v_dow := lower(to_char(v_now_local, 'Dy'));

  -- map 'mon'.. 'sun'
  v_dow := case v_dow
    when 'mon' then 'mon' when 'tue' then 'tue' when 'wed' then 'wed'
    when 'thu' then 'thu' when 'fri' then 'fri' when 'sat' then 'sat'
    else 'sun'
  end;

  v_range := p_windows -> v_dow;
  if v_range is null or v_range = 'null'::jsonb then
    return false;
  end if;

  v_start := (v_range ->> 0)::int;
  v_end := (v_range ->> 1)::int;

  -- clamp by min/max
  v_start := greatest(v_start, coalesce(p_min, 0));
  v_end := least(v_end, coalesce(p_max, 24));
  if v_start >= v_end then
    return false;
  end if;

  return v_hour >= v_start and v_hour < v_end;
end;
$$;

-- 7) RPC: compute if a lead is sendable "now" under policy
create or replace function public.rpc_lead_is_sendable_now(p_lead_id uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  v_lead record;
  v_pol record;
begin
  select l.*, a.id as acct
  into v_lead
  from public.leads l
  join public.accounts a on a.id = l.account_id
  where l.id = p_lead_id;

  if not found then
    return false;
  end if;

  select *
  into v_pol
  from public.send_time_policies
  where account_id = v_lead.account_id
  order by updated_at desc
  limit 1;

  if not found then
    return public.fn_within_window(
      v_lead.timezone,
      '{"mon":[9,17],"tue":[9,17],"wed":[9,17],"thu":[9,17],"fri":[9,17],"sat":null,"sun":null}'::jsonb,
      8,
      18
    );
  else
    return public.fn_within_window(
      v_lead.timezone,
      v_pol.windows,
      v_pol.min_hour,
      v_pol.max_hour
    );
  end if;
end;
$$;

-- 8) RLS for new tables (adapt tenant model if different)
alter table public.send_time_policies enable row level security;
create policy send_time_policies_isolation
  on public.send_time_policies
  using (account_id = auth.uid());

alter table public.isp_pacing_rules enable row level security;
create policy isp_pacing_rules_isolation
  on public.isp_pacing_rules
  using (account_id = auth.uid());

alter table public.isp_minute_counters enable row level security;
create policy isp_minute_counters_isolation
  on public.isp_minute_counters
  using (account_id = auth.uid());

