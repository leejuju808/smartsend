-- Time helpers + preview engine (idempotent)
-- Adds timezone on leads, step window controls, business-days flag, and deterministic jitter.

-- A) Lead timezone (IANA)
alter table public.leads
  add column if not exists tz text;  -- e.g., 'America/Los_Angeles'

-- B) Per-step sending window + rules
alter table public.campaign_steps
  add column if not exists window_start text,              -- 'HH:MM' local to lead tz (nullable)
  add column if not exists window_end   text,              -- 'HH:MM' local to lead tz (nullable)
  add column if not exists business_days_only boolean default true,
  add column if not exists jitter_seconds int default 0;   -- spread inside window; 0 = no jitter

-- C) Utility: 'HH:MM' -> seconds since midnight
create or replace function public.hhmm_to_seconds(p text)
returns int language plpgsql immutable as $$
declare h int; m int;
begin
  if p is null or trim(p) = '' then return null; end if;
  h := split_part(p, ':', 1)::int;
  m := split_part(p, ':', 2)::int;
  return h*3600 + m*60;
end $$;

-- D) Utility: clamp to next valid window boundary in a tz, honoring business days
-- Returns: (window_start_at, window_end_at) in UTC for the next available window >= base
create or replace function public.next_window_utc(
  p_base timestamptz,
  p_tz text,
  p_window_start text,
  p_window_end   text,
  p_business_days_only boolean
)
returns table(win_start timestamptz, win_end timestamptz)
language plpgsql stable as $$
declare
  d int := 0;
  local_date date;
  ws int; we int;
  loc_start timestamptz;
  loc_end   timestamptz;
  dow int;
begin
  ws := public.hhmm_to_seconds(coalesce(p_window_start,'09:00'));
  we := public.hhmm_to_seconds(coalesce(p_window_end,'17:00'));
  if we is null or ws is null or we <= ws then
    -- fallback to 09:00-17:00 if invalid
    ws := 9*3600; we := 17*3600;
  end if;

  <<seek>>
  loop
    local_date := (p_base at time zone p_tz)::date + d;
    dow := extract(dow from local_date); -- 0=Sun ... 6=Sat
    if p_business_days_only and (dow = 0 or dow = 6) then
      d := d + 1;
      continue;
    end if;

    loc_start := (local_date::timestamptz at time zone p_tz)
                 + make_interval(secs => ws);
    loc_end   := (local_date::timestamptz at time zone p_tz)
                 + make_interval(secs => we);

    -- Convert back to UTC
    win_start := timezone('UTC', loc_start);
    win_end   := timezone('UTC', loc_end);

    -- Case A: base before today's window start in local tz -> use today
    if p_base <= win_start then
      return next;
    end if;

    -- Case B: base within today's window -> start now, end at today end
    if p_base > win_start and p_base < win_end then
      win_start := p_base;
      return next;
    end if;

    -- Case C: base after today's window -> try next day
    d := d + 1;
  end loop;
end $$;

-- E) Deterministic per-(campaign,step,lead) jitter within window
-- Uses md5 to create a stable offset < jitter_seconds
create or replace function public.jitterize(
  p_base timestamptz,
  p_campaign uuid,
  p_step int,
  p_lead uuid,
  p_window_start timestamptz,
  p_window_end timestamptz,
  p_jitter_seconds int
) returns timestamptz
language plpgsql immutable as $$
declare
  span int;
  max_jitter int;
  hash_hex text;
  hash_val bigint;
  jitter int;
  scheduled timestamptz;
begin
  if p_jitter_seconds is null or p_jitter_seconds <= 0 then
    return greatest(p_base, p_window_start);
  end if;

  span := extract(epoch from (p_window_end - greatest(p_base, p_window_start)));
  if span <= 0 then
    return greatest(p_base, p_window_start);
  end if;

  max_jitter := least(p_jitter_seconds, span);
  hash_hex := md5(p_campaign::text || '-' || p_step::text || '-' || p_lead::text);
  -- take first 15 hex as positive bigint
  hash_val := ('x' || substr(hash_hex,1,15))::bit(60)::bigint;
  jitter := (hash_val % max_jitter);

  scheduled := greatest(p_base, p_window_start) + make_interval(secs => jitter);
  if scheduled > p_window_end then
    scheduled := p_window_end; -- clamp
  end if;
  return scheduled;
end $$;

-- F) Compute preview for a single (campaign, step, lead)
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
  window_start text,
  window_end text,
  business_days_only boolean,
  jitter_seconds int,
  base_at timestamptz,
  win_start_utc timestamptz,
  win_end_utc timestamptz,
  scheduled_at timestamptz,
  reason text
)
language plpgsql stable as $$
declare
  s record;
  l_tz text;
  b boolean;
  js int;
  ws text;
  we text;
  w record;
  sched timestamptz;
  why text := '';
begin
  select coalesce(window_start, send_start), coalesce(window_end, send_end), business_days_only, jitter_seconds
    into ws, we, b, js
    from public.campaign_steps
   where campaign_id = p_campaign and step_no = p_step_no and enabled;

  if ws is null and we is null then
    -- fallback to campaign-level defaults later if you add them; for now use 09:00-17:00
    ws := '09:00'; we := '17:00';
  end if;

  select coalesce(tz,'UTC') into l_tz from public.leads where id = p_lead;

  -- Find next window
  select * into w from public.next_window_utc(p_base, l_tz, ws, we, coalesce(b,true)) as t(win_start timestamptz, win_end timestamptz);

  if w.win_start is null then
    return;
  end if;

  if p_base < w.win_start then
    why := 'before window';
  elsif p_base >= w.win_start and p_base < w.win_end then
    why := 'inside window';
  else
    why := 'after window (rolled)';
  end if;

  if p_include_jitter then
    sched := public.jitterize(p_base, p_campaign, p_step_no, p_lead, w.win_start, w.win_end, coalesce(js,0));
  else
    sched := greatest(p_base, w.win_start);
  end if;

  campaign_id := p_campaign;
  lead_id := p_lead;
  step_no := p_step_no;
  tz := l_tz;
  window_start := ws;
  window_end := we;
  business_days_only := coalesce(b,true);
  jitter_seconds := coalesce(js,0);
  base_at := p_base;
  win_start_utc := w.win_start;
  win_end_utc := w.win_end;
  scheduled_at := sched;
  reason := why;

  return next;
end $$;

-- G) Batch preview for many leads in a campaign step
create or replace function public.preview_next_send_for_step_many(
  p_campaign uuid,
  p_step_no int,
  p_leads uuid[],
  p_base timestamptz default now(),
  p_include_jitter boolean default false
)
returns table(
  campaign_id uuid,
  lead_id uuid,
  step_no int,
  tz text,
  scheduled_at timestamptz
)
language sql stable as $$
  select x.campaign_id, x.lead_id, x.step_no, x.tz, x.scheduled_at
  from unnest(p_leads) as lid
  cross join lateral public.preview_next_send_for_step(p_campaign, p_step_no, lid, p_base, p_include_jitter) x
$$;

-- H) Enqueue helper that uses the same logic
create or replace function public.enqueue_step1_for_leads_with_rules(
  p_campaign uuid,
  p_step_no int,
  p_leads uuid[],
  p_base timestamptz default now(),
  p_include_jitter boolean default true
) returns int
language plpgsql security definer as $$
declare
  r record;
  inserted int := 0;
begin
  for r in
    select * from public.preview_next_send_for_step_many(p_campaign, p_step_no, p_leads, p_base, p_include_jitter)
  loop
    -- Skip if already queued
    if not exists (
      select 1 from public.send_queue
      where campaign_id = r.campaign_id and lead_id = r.lead_id and step_no = r.step_no
    ) then
      insert into public.send_queue (campaign_id, lead_id, step_no, scheduled_for, status)
      values (r.campaign_id, r.lead_id, r.step_no, r.scheduled_at, 'queued');
      inserted := inserted + 1;
    end if;
  end loop;
  return inserted;
end $$;

-- Grant execute permissions
grant execute on function public.hhmm_to_seconds(text) to authenticated, service_role;
grant execute on function public.next_window_utc(timestamptz, text, text, text, boolean) to authenticated, service_role;
grant execute on function public.jitterize(timestamptz, uuid, int, uuid, timestamptz, timestamptz, int) to authenticated, service_role;
grant execute on function public.preview_next_send_for_step(uuid, int, uuid, timestamptz, boolean) to authenticated, service_role;
grant execute on function public.preview_next_send_for_step_many(uuid, int, uuid[], timestamptz, boolean) to authenticated, service_role;
grant execute on function public.enqueue_step1_for_leads_with_rules(uuid, int, uuid[], timestamptz, boolean) to authenticated, service_role;

