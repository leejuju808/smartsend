-- ─────────────────────────────────────────────────────────────────────────────
-- Timezone, Business Days, Jitter, Preview, Enqueue System
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- A) Light schema helpers (idempotent)
-- ─────────────────────────────────────────────────────────────────────────────

-- Default campaign-level sending prefs (step-level windows still win if present)
alter table public.campaigns
  add column if not exists tz_default text,                          -- e.g. 'America/Los_Angeles'
  add column if not exists business_days_only boolean not null default true,
  add column if not exists default_send_start text,                  -- 'HH:MM'
  add column if not exists default_send_end text;                    -- 'HH:MM'

-- Lead timezone (per-lead override)
alter table public.leads
  add column if not exists tz text;                                  -- IANA tz like 'America/New_York'

-- Optional: campaign-scoped holidays
create table if not exists public.campaign_holidays (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  holiday_date date not null,
  name text,
  unique (campaign_id, holiday_date)
);
create index if not exists idx_camp_holidays on public.campaign_holidays(campaign_id, holiday_date);

-- Send queue status column if missing (handle both scheduled_at and scheduled_for)
do $$ begin
  -- Ensure status column exists
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'send_queue' and column_name = 'status'
  ) then
    alter table public.send_queue
      add column status text not null default 'pending' check (status in ('pending','sent','canceled','failed'));
  end if;

  -- Ensure scheduled_at exists (prefer scheduled_at, but handle scheduled_for)
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'send_queue' and column_name = 'scheduled_at'
  ) then
    if exists (
      select 1 from information_schema.columns 
      where table_schema = 'public' and table_name = 'send_queue' and column_name = 'scheduled_for'
    ) then
      -- scheduled_for exists, create scheduled_at as alias or rename
      alter table public.send_queue add column scheduled_at timestamptz;
      update public.send_queue set scheduled_at = scheduled_for where scheduled_at is null;
    else
      alter table public.send_queue add column scheduled_at timestamptz;
    end if;
  end if;
end $$;

create index if not exists idx_send_queue_sched on public.send_queue(campaign_id, scheduled_at, status);

-- ─────────────────────────────────────────────────────────────────────────────
-- B) Utilities
-- ─────────────────────────────────────────────────────────────────────────────

-- Parse 'HH:MM' into seconds from midnight
create or replace function public._parse_hhmm(p text) returns int
language sql immutable as $$
  select
    case
      when p is null or trim(p) = '' then null
      else
        split_part(p, ':', 1)::int * 3600 +
        split_part(p, ':', 2)::int * 60
    end;
$$;

-- Clamp a timestamp into [local_day + start, local_day + end] in a given tz
create or replace function public._window_for_day(p_base timestamptz, p_tz text, p_start text, p_end text)
returns table(window_start timestamptz, window_end timestamptz)
language plpgsql immutable as $$
declare
  v_date date;
  v_start_sec int;
  v_end_sec int;
begin
  v_date := (p_base at time zone p_tz)::date;
  v_start_sec := coalesce(public._parse_hhmm(p_start), 9*3600);  -- default 09:00
  v_end_sec   := coalesce(public._parse_hhmm(p_end),   17*3600); -- default 17:00
  if v_end_sec <= v_start_sec then
    -- guard: ensure non-empty window, bump end to start+1h
    v_end_sec := v_start_sec + 3600;
  end if;

  window_start := timezone(p_tz, (v_date)::timestamp) + make_interval(secs => v_start_sec);
  window_end   := timezone(p_tz, (v_date)::timestamp) + make_interval(secs => v_end_sec);
  return next;
end;
$$;

-- Weekend / holiday checker
create or replace function public._is_business_day(p_campaign uuid, p_day date)
returns boolean
language sql stable as $$
  with weekend as (
    select extract(isodow from p_day)::int in (6,7) as is_weekend
  ),
  hol as (
    select exists(
      select 1 from public.campaign_holidays h
      where h.campaign_id = p_campaign and h.holiday_date = p_day
    ) as is_holiday
  )
  select not ((select is_weekend from weekend) or (select is_holiday from hol));
$$;

-- Next business day >= given local day
create or replace function public._next_business_day(p_campaign uuid, p_local_day date)
returns date
language plpgsql stable as $$
declare
  d date := p_local_day;
begin
  loop
    exit when public._is_business_day(p_campaign, d);
    d := d + 1;
  end loop;
  return d;
end;
$$;

-- Deterministic jitter within a window (seconds offset)
-- Hash of (campaign, lead, step) → uniform in [0, p_max_seconds]
create or replace function public._deterministic_jitter(
  p_campaign uuid, p_lead uuid, p_step int, p_max_seconds int default 2700  -- 45 minutes
) returns int
language sql immutable as $$
  select (('x' || substr(encode(digest(p_campaign::text || ':' || p_lead::text || ':' || p_step::text, 'sha256'), 'hex'), 1, 8))::bit(32)::int % (p_max_seconds+1));
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- C) Preview next send for a (campaign, step, lead)
--    Honors step offsets, per-lead tz, campaign defaults, business days, jitter
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.preview_next_send_for_step(
  p_campaign uuid,
  p_step_no int,
  p_lead uuid,
  p_base timestamptz default now(),
  p_include_jitter boolean default false
)
returns table(
  campaign_id uuid,
  lead_id uuid,
  step_no int,
  tz text,
  window_start timestamptz,
  window_end timestamptz,
  business_days_only boolean,
  scheduled_at timestamptz,
  reason text
)
language plpgsql stable
as $$
declare
  v_tz text;
  v_biz boolean;
  v_start text;
  v_end text;
  v_local_day date;
  v_step record;
  v_campaign record;
  v_ws timestamptz;
  v_we timestamptz;
  v_sched timestamptz;
  v_jitter int := 0;
begin
  campaign_id := p_campaign;
  lead_id := p_lead;
  step_no := p_step_no;

  -- fetch campaign defaults
  select c.tz_default, c.business_days_only, c.default_send_start, c.default_send_end
  into v_campaign
  from public.campaigns c
  where c.id = p_campaign;

  -- fetch step
  select s.step_no, s.offset_days, s.send_start, s.send_end
  into v_step
  from public.campaign_steps s
  where s.campaign_id = p_campaign and s.step_no = p_step_no;

  -- choose timezone: lead -> campaign -> UTC
  select coalesce(l.tz, v_campaign.tz_default, 'UTC') into v_tz
  from public.leads l where l.id = p_lead;

  -- choose windows: step override -> campaign defaults
  v_start := coalesce(v_step.send_start, v_campaign.default_send_start, '09:00');
  v_end   := coalesce(v_step.send_end,   v_campaign.default_send_end,   '17:00');
  v_biz   := coalesce(v_campaign.business_days_only, true);

  -- base instant + offset_days (relative to PRIOR SENT; for preview we use p_base + offset)
  -- The caller should pass p_base = prior_step_sent_at; if unknown, p_base = now()
  p_base := p_base + make_interval(days => coalesce(v_step.offset_days, 0));

  -- Compute initial window for that local day
  select ws.window_start, ws.window_end
    into v_ws, v_we
  from public._window_for_day(p_base, v_tz, v_start, v_end) as ws;

  -- If business days only, and local day is weekend/holiday, shift to next business day
  v_local_day := (p_base at time zone v_tz)::date;
  if v_biz and not public._is_business_day(p_campaign, v_local_day) then
    v_local_day := public._next_business_day(p_campaign, v_local_day);
    v_ws := timezone(v_tz, (v_local_day)::timestamp) + make_interval(secs => public._parse_hhmm(v_start));
    v_we := timezone(v_tz, (v_local_day)::timestamp) + make_interval(secs => public._parse_hhmm(v_end));
  end if;

  -- If base is before window_start, schedule at start; if within window, schedule at base; if after window, move to next day window
  if p_base <= v_ws then
    v_sched := v_ws;
    reason := 'base_before_window';
  elsif p_base > v_ws and p_base <= v_we then
    v_sched := p_base;
    reason := 'base_inside_window';
  else
    -- move to next day window; if business only, skip to next business day
    v_local_day := ((p_base at time zone v_tz)::date) + 1;
    if v_biz then
      v_local_day := public._next_business_day(p_campaign, v_local_day);
    end if;
    v_ws := timezone(v_tz, (v_local_day)::timestamp) + make_interval(secs => public._parse_hhmm(v_start));
    v_we := timezone(v_tz, (v_local_day)::timestamp) + make_interval(secs => public._parse_hhmm(v_end));
    v_sched := v_ws;
    reason := 'base_after_window';
  end if;

  -- Deterministic jitter within the window
  if p_include_jitter then
    v_jitter := public._deterministic_jitter(p_campaign, p_lead, p_step_no, greatest( (extract(epoch from (v_we - v_sched))::int - 60), 0));
    v_sched := v_sched + make_interval(secs => v_jitter);
    reason := reason || '+jitter';
  end if;

  tz := v_tz;
  window_start := v_ws;
  window_end := v_we;
  business_days_only := v_biz;
  scheduled_at := v_sched;

  return next;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- D) Enqueue RPCs
-- ─────────────────────────────────────────────────────────────────────────────

-- D1) Enqueue a single (campaign, step, lead)
create or replace function public.enqueue_next_send_for_step(
  p_campaign uuid,
  p_step_no int,
  p_lead uuid,
  p_base timestamptz default now(),
  p_include_jitter boolean default true
) returns timestamptz
language plpgsql security definer
as $$
declare
  r record;
begin
  if not public.can_edit_campaign(p_campaign) then
    raise exception 'Forbidden';
  end if;

  select * into r from public.preview_next_send_for_step(p_campaign, p_step_no, p_lead, p_base, p_include_jitter);

  -- Insert into send_queue, handling both scheduled_at and scheduled_for columns
  -- Also handle different unique constraints (with or without step_no)
  do $$
  begin
    -- Try with step_no constraint first (if it exists)
    if exists (
      select 1 from pg_constraint 
      where conrelid = 'public.send_queue'::regclass 
        and conname = 'uq_sq_campaign_lead_step'
    ) then
      insert into public.send_queue (campaign_id, lead_id, scheduled_at, status, created_at, step_no)
      values (p_campaign, p_lead, r.scheduled_at, 'pending', now(), p_step_no)
      on conflict (campaign_id, lead_id, step_no) do update
        set scheduled_at = r.scheduled_at,
            status = 'pending',
            updated_at = now();
    -- Try without step_no constraint
    elsif exists (
      select 1 from pg_constraint 
      where conrelid = 'public.send_queue'::regclass 
        and (conname = 'uq_sq_campaign_lead' or conname = 'send_queue_campaign_lead_unique')
    ) then
      -- If no step constraint, we can only have one queue item per lead per campaign
      -- Delete existing and insert new
      delete from public.send_queue 
      where campaign_id = p_campaign and lead_id = p_lead;
      
      insert into public.send_queue (campaign_id, lead_id, scheduled_at, status, created_at, step_no)
      values (p_campaign, p_lead, r.scheduled_at, 'pending', now(), p_step_no);
    else
      -- No unique constraint, just insert
      insert into public.send_queue (campaign_id, lead_id, scheduled_at, status, created_at, step_no)
      values (p_campaign, p_lead, r.scheduled_at, 'pending', now(), p_step_no);
    end if;
  end $$;

  return r.scheduled_at;
end;
$$;

-- D2) Bulk preview (optional utility): next send for all enabled leads on a step
-- You can wrap with your own filtering, here we assume a join table campaign->leads exists (if not, call this from app code per lead).
-- Keeping it simple: accept a list of lead UUIDs.
create or replace function public.bulk_preview_next_send(
  p_campaign uuid,
  p_step_no int,
  p_leads uuid[],
  p_base timestamptz default now(),
  p_include_jitter boolean default true
) returns table(lead_id uuid, scheduled_at timestamptz, tz text)
language plpgsql stable
as $$
begin
  return query
  select r.lead_id, r.scheduled_at, r.tz
  from unnest(p_leads) as lid
  cross join lateral public.preview_next_send_for_step(p_campaign, p_step_no, lid, p_base, p_include_jitter) as r;
end;
$$;

-- D3) Bulk enqueue (array of leads)
create or replace function public.bulk_enqueue_next_send(
  p_campaign uuid,
  p_step_no int,
  p_leads uuid[],
  p_base timestamptz default now(),
  p_include_jitter boolean default true
) returns int
language plpgsql security definer
as $$
declare
  r record;
  v_count int := 0;
begin
  if not public.can_edit_campaign(p_campaign) then
    raise exception 'Forbidden';
  end if;

  for r in
    select r.lead_id, r.scheduled_at
    from unnest(p_leads) as lid
    cross join lateral public.preview_next_send_for_step(p_campaign, p_step_no, lid, p_base, p_include_jitter) as r
  loop
    -- Handle different unique constraints
    if exists (
      select 1 from pg_constraint 
      where conrelid = 'public.send_queue'::regclass 
        and conname = 'uq_sq_campaign_lead_step'
    ) then
      insert into public.send_queue (campaign_id, lead_id, scheduled_at, status, created_at, step_no)
      values (p_campaign, r.lead_id, r.scheduled_at, 'pending', now(), p_step_no)
      on conflict (campaign_id, lead_id, step_no) do update
        set scheduled_at = r.scheduled_at,
            status = 'pending',
            updated_at = now();
    elsif exists (
      select 1 from pg_constraint 
      where conrelid = 'public.send_queue'::regclass 
        and (conname = 'uq_sq_campaign_lead' or conname = 'send_queue_campaign_lead_unique')
    ) then
      delete from public.send_queue 
      where campaign_id = p_campaign and lead_id = r.lead_id;
      
      insert into public.send_queue (campaign_id, lead_id, scheduled_at, status, created_at, step_no)
      values (p_campaign, r.lead_id, r.scheduled_at, 'pending', now(), p_step_no);
    else
      insert into public.send_queue (campaign_id, lead_id, scheduled_at, status, created_at, step_no)
      values (p_campaign, r.lead_id, r.scheduled_at, 'pending', now(), p_step_no);
    end if;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- Grant execute permissions
grant execute on function public.preview_next_send_for_step to authenticated;
grant execute on function public.enqueue_next_send_for_step to authenticated;
grant execute on function public.bulk_preview_next_send to authenticated;
grant execute on function public.bulk_enqueue_next_send to authenticated;

