-- 1) DB — limits, safe alters, indexes, helpers (idempotent)
--    Run in Supabase SQL.

-- A) Sending limits (per connected account + per campaign)
create table if not exists public.account_sending_limits (
  account_id uuid primary key references public.connected_accounts(id) on delete cascade,
  daily_cap int not null default 200,
  per_minute_cap int not null default 10,
  tz text not null default 'America/Los_Angeles',
  window_start text,
  window_end   text,
  business_days_only boolean not null default true
);

create table if not exists public.campaign_sending_limits (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  daily_cap int,
  per_minute_cap int,
  recipient_cooldown_hours int not null default 72
);

-- B) Queue columns to support back-pressure (safe-adds)
alter table public.send_queue
  add column if not exists not_before timestamptz,
  add column if not exists locked_at timestamptz,
  add column if not exists retry_at timestamptz,
  add column if not exists status text
    check (status in ('pending','scheduled','sending','sent','failed','canceled','deferred'))
    default 'pending';

create index if not exists idx_sq_not_before on public.send_queue(not_before);
create index if not exists idx_sq_status_notbefore on public.send_queue(status, not_before);
create index if not exists idx_sq_account on public.send_queue(account_id);
create index if not exists idx_sq_campaign on public.send_queue(campaign_id);
create index if not exists idx_sq_locked on public.send_queue(locked_at);

-- C) Utility: parse 'HH:MM' into today's timestamp in a given TZ
create or replace function public.tz_today_at(p_tz text, p_hhmm text, p_now timestamptz default now())
returns timestamptz
language sql
stable
as $$
  with base as (
    select (p_now at time zone p_tz)::date as d
  )
  select
    ((d::text || ' ' || coalesce(p_hhmm,'00:00'))::timestamp at time zone p_tz)
  from base
$$;

-- D) Utility: are we inside the allowed window (and business days if set)?
create or replace function public.in_sending_window(
  p_tz text,
  p_window_start text,
  p_window_end text,
  p_business_days_only boolean,
  p_now timestamptz default now()
) returns boolean
language plpgsql
stable
as $$
declare
  v_start timestamptz;
  v_end   timestamptz;
  v_dow   int;
begin
  if p_business_days_only then
    v_dow := extract(isodow from (p_now at time zone p_tz));
    if v_dow in (6,7) then
      return false;
    end if;
  end if;

  if p_window_start is null or p_window_end is null then
    return true;
  end if;

  v_start := public.tz_today_at(p_tz, p_window_start, p_now);
  v_end   := public.tz_today_at(p_tz, p_window_end, p_now);

  if p_now >= v_start and p_now <= v_end then
    return true;
  end if;
  return false;
end;
$$;

-- E) Remaining capacity (account-level) using local day in account TZ
create or replace function public.account_remaining_today(p_account uuid, p_now timestamptz default now())
returns int
language plpgsql
stable
as $$
declare
  v_tz text;
  v_cap int;
  v_start timestamptz;
  v_end timestamptz;
  v_used int;
begin
  select tz, daily_cap into v_tz, v_cap from public.account_sending_limits where account_id = p_account;
  if v_tz is null then
    v_tz := 'America/Los_Angeles';
    v_cap := 200;
  end if;

  v_start := date_trunc('day', (p_now at time zone v_tz)) at time zone v_tz;
  v_end   := (date_trunc('day', (p_now at time zone v_tz)) + interval '1 day') at time zone v_tz;

  select count(*) into v_used
  from public.send_logs
  where account_id = p_account
    and created_at >= v_start and created_at < v_end;

  return greatest(v_cap - coalesce(v_used,0), 0);
end;
$$;

-- F) Remaining capacity (campaign-level, optional cap)
create or replace function public.campaign_remaining_today(p_campaign uuid, p_now timestamptz default now())
returns int
language plpgsql
stable
as $$
declare
  v_cap int;
  v_used int;
begin
  select daily_cap into v_cap from public.campaign_sending_limits where campaign_id = p_campaign;
  if v_cap is null then
    return 2147483647;
  end if;

  select count(*) into v_used
  from public.send_logs
  where campaign_id = p_campaign
    and created_at::date = (p_now at time zone 'UTC')::date;

  return greatest(v_cap - coalesce(v_used,0), 0);
end;
$$;

-- G) Per-minute throttling windows (account- and campaign- burst)
create or replace function public.account_remaining_minute(p_account uuid, p_now timestamptz default now())
returns int
language plpgsql
stable
as $$
declare
  v_cap int := 10;
  v_used int;
begin
  select per_minute_cap into v_cap from public.account_sending_limits where account_id = p_account;
  if v_cap is null then v_cap := 10; end if;

  select count(*) into v_used
  from public.send_logs
  where account_id = p_account
    and created_at >= (p_now - interval '60 seconds');

  return greatest(v_cap - coalesce(v_used,0), 0);
end;
$$;

create or replace function public.campaign_remaining_minute(p_campaign uuid, p_now timestamptz default now())
returns int
language plpgsql
stable
as $$
declare
  v_cap int;
  v_used int;
begin
  select per_minute_cap into v_cap from public.campaign_sending_limits where campaign_id = p_campaign;
  if v_cap is null then
    return 2147483647;
  end if;

  select count(*) into v_used
  from public.send_logs
  where campaign_id = p_campaign
    and created_at >= (p_now - interval '60 seconds');

  return greatest(v_cap - coalesce(v_used,0), 0);
end;
$$;

-- H) Recipient cooldown within a campaign (hours)
create or replace function public.recipient_eligible_now(p_campaign uuid, p_lead uuid, p_now timestamptz default now())
returns boolean
language plpgsql
stable
as $$
declare
  v_cool int := 72;
  v_last timestamptz;
begin
  select recipient_cooldown_hours into v_cool from public.campaign_sending_limits where campaign_id = p_campaign;
  if v_cool is null then v_cool := 72; end if;

  select max(created_at) into v_last
  from public.send_logs
  where campaign_id = p_campaign and lead_id = p_lead;

  if v_last is null then
    return true;
  end if;

  return (p_now - v_last) >= (v_cool || ' hours')::interval;
end;
$$;

-- I) Atomic dequeue: pick the next eligible send, lock it, and return its id
--    Use SKIP LOCKED to cooperate across workers.
create or replace function public.dequeue_next_send(p_now timestamptz default now())
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_account uuid;
  v_campaign uuid;
  v_lead uuid;
  v_tz text;
  v_ws text;
  v_we text;
  v_biz boolean;
  v_acc_rem int;
  v_acc_min int;
  v_cam_rem int;
  v_cam_min int;
  v_ok boolean := true;
begin
  -- 1) pick a candidate that's ready (status pending, not_before satisfied, retry_at passed),
  --    prioritizing oldest first; avoid items someone else locked.
  select q.id, q.account_id, q.campaign_id, q.lead_id
    into v_id, v_account, v_campaign, v_lead
  from public.send_queue q
  where q.status = 'pending'
    and (q.not_before is null or q.not_before <= p_now)
    and (q.retry_at   is null or q.retry_at   <= p_now)
  order by coalesce(q.not_before, q.created_at), q.created_at
  for update skip locked
  limit 1;

  if v_id is null then
    return null;
  end if;

  -- Guard suppression/dup/cap at tenant-recipient level
  perform public.guard_queue_item(v_id, p_now);

  -- Re-check it's still pending & not moved by guard; otherwise exit
  if (select status from public.send_queue where id = v_id) <> 'pending' then
    return null;
  end if;

  -- 2) check window for the account
  select tz, window_start, window_end, business_days_only
    into v_tz, v_ws, v_we, v_biz
  from public.account_sending_limits
  where account_id = v_account;

  if v_tz is null then v_tz := 'America/Los_Angeles'; end if;

  if not public.in_sending_window(v_tz, v_ws, v_we, coalesce(v_biz,true), p_now) then
    -- defer to next window start
    update public.send_queue
      set not_before = greatest(
            coalesce(not_before, p_now),
            public.tz_today_at(v_tz, coalesce(v_ws,'09:00'), p_now) + interval '1 day'
          ),
          status = 'deferred',
          updated_at = now()
    where id = v_id;
    return null;
  end if;

  -- 3) capacities
  v_acc_rem := public.account_remaining_today(v_account, p_now);
  v_acc_min := public.account_remaining_minute(v_account, p_now);
  v_cam_rem := public.campaign_remaining_today(v_campaign, p_now);
  v_cam_min := public.campaign_remaining_minute(v_campaign, p_now);

  v_ok := v_ok and (v_acc_rem > 0) and (v_cam_rem > 0) and (v_acc_min > 0) and (v_cam_min > 0);
  if not v_ok then
    -- back-pressure: nudge not_before a bit into the future (next minute tick or next day if day-cap hit)
    if v_acc_rem = 0 or v_cam_rem = 0 then
      -- push to next day start in account TZ
      update public.send_queue
        set not_before = public.tz_today_at(v_tz, coalesce(v_ws,'09:00'), p_now) + interval '1 day',
            status = 'deferred',
            updated_at = now()
      where id = v_id;
    else
      update public.send_queue
        set not_before = p_now + interval '60 seconds',
            status = 'deferred',
            updated_at = now()
      where id = v_id;
    end if;
    return null;
  end if;

  -- 4) recipient cooldown
  if not public.recipient_eligible_now(v_campaign, v_lead, p_now) then
    update public.send_queue
      set not_before = p_now + interval '6 hours',
          status = 'deferred',
          updated_at = now()
    where id = v_id;
    return null;
  end if;

  -- 5) lock for the worker
  update public.send_queue
    set status = 'scheduled',
        locked_at = now(),
        updated_at = now()
  where id = v_id;

  return v_id;
end;
$$;

-- Notes
-- • All functions are stable or security definer as appropriate.
-- • We keep “counts” off send_logs to avoid extra counter tables; if you need ultra-high throughput later, we can add append-only counters with triggers.

