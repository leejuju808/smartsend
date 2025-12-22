-- Follow-up Sequences v2
-- Schema, scheduling helpers, and supporting objects

-- ================================================
-- A) Core sequences & steps
-- ================================================

create table if not exists public.followup_sequences (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  unique (campaign_id, name)
);

create table if not exists public.followup_steps (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  sequence_id uuid not null references public.followup_sequences(id) on delete cascade,
  step_order int not null,
  delay_hours int not null default 48,
  template_id uuid not null references public.nudge_templates(id),
  send_window_start int default 8,
  send_window_end int default 17,
  stop_on_reply boolean not null default true,
  stop_on_meeting boolean not null default true,
  unique (sequence_id, step_order)
);

-- ================================================
-- B) Branch rules (optional per step)
-- ================================================

create table if not exists public.followup_branches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  step_id uuid not null references public.followup_steps(id) on delete cascade,
  condition jsonb not null,
  goto_step int not null
);

-- ================================================
-- C) Campaign quiet hours & blackout dates
-- ================================================

create table if not exists public.quiet_hours (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  tz text not null,
  start_hour int not null default 20,
  end_hour int not null default 7,
  workdays int[] not null default '{1,2,3,4,5}'
);

create table if not exists public.blackout_dates (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  date date not null,
  reason text
);

create unique index if not exists uq_blackout on public.blackout_dates (campaign_id, date);

-- ================================================
-- D) Lead sequencing state
-- ================================================

create table if not exists public.followup_state (
  lead_id uuid not null references public.leads(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  sequence_id uuid not null references public.followup_sequences(id) on delete cascade,
  current_step int not null default 0,
  last_outbound_at timestamptz,
  is_done boolean not null default false,
  primary key (lead_id, sequence_id)
);

-- ================================================
-- E) Outbox / audit trail
-- ================================================

create table if not exists public.followup_outbox (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  sequence_id uuid not null references public.followup_sequences(id) on delete cascade,
  step_id uuid not null references public.followup_steps(id) on delete cascade,
  scheduled_for timestamptz not null,
  status text not null default 'queued' check (status in ('queued','sent','skipped','cancelled','error')),
  reason text
);

-- ================================================
-- Helpful indexes
-- ================================================

create index if not exists idx_state_seq on public.followup_state (sequence_id, is_done);
create index if not exists idx_outbox_sched on public.followup_outbox (status, scheduled_for);

-- ================================================
-- Decision helpers
-- ================================================

create or replace view public.v_lead_recent_activity as
select
  s.lead_id,
  s.campaign_id,
  greatest(
    coalesce((select max(r.created_at) from public.reply_logs r where r.lead_id = s.lead_id), '-infinity'::timestamptz),
    coalesce((select max(m.created_at) from public.meetings m where m.lead_id = s.lead_id), '-infinity'::timestamptz)
  ) as last_reaction_at
from public.followup_state s;

create or replace function public.next_send_time(
  p_campaign uuid,
  p_base timestamptz,
  p_local_hour_start int,
  p_local_hour_end int
) returns timestamptz
language plpgsql
set search_path = public
as $$
declare
  v_tz text;
  v_start int;
  v_end int;
  v_days int[];
  v_dt timestamptz := p_base;
  v_local time;
  v_dow int;
  v_date date;
begin
  select tz, start_hour, end_hour, workdays into v_tz, v_start, v_end, v_days
  from public.quiet_hours where campaign_id = p_campaign;

  if v_tz is null then
    return p_base;
  end if;

  loop
    v_date := (v_dt at time zone v_tz)::date;
    v_dow := extract(isodow from (v_dt at time zone v_tz));

    if not (v_dow = any (v_days)) then
      v_dt := ((v_date + 1)::timestamptz at time zone v_tz);
      continue;
    end if;

    if exists (select 1 from public.blackout_dates b where b.campaign_id = p_campaign and b.date = v_date) then
      v_dt := ((v_date + 1)::timestamptz at time zone v_tz);
      continue;
    end if;

    v_local := (v_dt at time zone v_tz)::time;

    if v_local < make_time(greatest(v_start, p_local_hour_start), 0, 0) then
      v_dt := (v_date::timestamptz at time zone v_tz)
              + make_interval(hours => greatest(v_start, p_local_hour_start));
      continue;
    end if;

    if v_end > v_start then
      if v_local >= make_time(least(v_end, p_local_hour_end), 0, 0) then
        v_dt := ((v_date + 1)::timestamptz at time zone v_tz)
                + make_interval(hours => greatest(v_start, p_local_hour_start));
        continue;
      end if;
    else
      if v_local >= make_time(least(p_local_hour_end, 24), 0, 0) then
        v_dt := ((v_date + 1)::timestamptz at time zone v_tz)
                + make_interval(hours => greatest(v_start, p_local_hour_start));
        continue;
      end if;
    end if;

    return v_dt;
  end loop;
end;
$$;

-- Ensure execute privilege for application role if it exists
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.next_send_time(uuid, timestamptz, int, int) to authenticated;
  end if;
exception
  when insufficient_privilege then
    null;
end;
$$;




