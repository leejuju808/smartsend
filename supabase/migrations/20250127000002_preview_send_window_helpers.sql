-- Preview Send Window Helpers (Idempotent)
-- Provides preview functions to calculate when campaign steps will actually send
-- Run in Supabase SQL

-- Ensure required columns exist on connected_accounts (idempotent)
alter table public.connected_accounts
  add column if not exists business_days_only boolean default false;

-- A) Compute next scheduled time for a given (campaign, step_no, lead),
--    starting from a base instant (default now), with/without jitter.
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
  holiday_region text,
  scheduled_at_earliest timestamptz,
  scheduled_at_latest timestamptz
)
language plpgsql
stable
set search_path = public
as $$
declare
  v_step record;
  v_account uuid;
  v_earliest timestamptz;
  v_latest   timestamptz;
  v_jitter int := 0;
  v_jitter_cfg int := 0;
  v_tz text;
  v_region text;
  v_biz boolean;
begin
  select id, step_no, offset_days, send_start, send_end
    into v_step
  from public.campaign_steps
  where campaign_id = p_campaign and step_no = p_step_no and enabled
  limit 1;

  if not found then
    raise exception 'step not found or disabled';
  end if;

  select account_id into v_account from public.campaigns where id = p_campaign;

  select 
    coalesce(timezone, 'America/Los_Angeles'),
    coalesce(holiday_region, 'US'),
    coalesce(business_days_only, false),
    coalesce(jitter_max_seconds, 0)
    into v_tz, v_region, v_biz, v_jitter_cfg
  from public.connected_accounts where id = v_account;

  -- base = p_base + step offset
  v_earliest := p_base + (v_step.offset_days || ' days')::interval;

  -- apply business-day + window clamp
  v_earliest := public.business_windowed_send_time_for_step(v_account, v_earliest, v_step.id);

  -- compute latest = with jitter range (preview as range, not random)
  if p_include_jitter and v_jitter_cfg > 0 then
    v_latest := v_earliest + make_interval(secs => v_jitter_cfg);
  else
    v_latest := v_earliest;
  end if;

  return query
  select
    p_campaign, p_lead, p_step_no,
    v_tz, v_step.send_start, v_step.send_end, v_biz, v_region,
    v_earliest, v_latest;
end;
$$;

-- B) Preview whole sequence from a start instant (step 1..N),
--    returns a row per step with earliest/latest schedule.
create or replace function public.preview_sequence_schedule(
  p_campaign uuid,
  p_lead uuid,
  p_start_at timestamptz default now(),
  p_include_jitter boolean default false
)
returns table(
  step_no int,
  scheduled_at_earliest timestamptz,
  scheduled_at_latest timestamptz
)
language plpgsql
stable
set search_path = public
as $$
declare
  v_account uuid;
  v_tz text;
  v_region text;
  v_biz boolean;
  v_jitter_cfg int := 0;
  v_cur_base timestamptz := p_start_at;
  v_sched_e timestamptz;
  v_sched_l timestamptz;
  r record;
begin
  select account_id into v_account from public.campaigns where id = p_campaign;
  select 
    coalesce(timezone, 'America/Los_Angeles'),
    coalesce(holiday_region, 'US'),
    coalesce(business_days_only, false),
    coalesce(jitter_max_seconds, 0)
    into v_tz, v_region, v_biz, v_jitter_cfg
  from public.connected_accounts where id = v_account;

  for r in
    select id, step_no, offset_days
    from public.campaign_steps
    where campaign_id = p_campaign and enabled
    order by step_no
  loop
    -- base for this step = last SENT time (simulated) + offset_days
    v_cur_base := v_cur_base + (r.offset_days || ' days')::interval;

    v_sched_e := public.business_windowed_send_time_for_step(v_account, v_cur_base, r.id);
    v_sched_l := case when p_include_jitter and v_jitter_cfg > 0
                      then v_sched_e + make_interval(secs => v_jitter_cfg)
                      else v_sched_e end;

    step_no := r.step_no;
    scheduled_at_earliest := v_sched_e;
    scheduled_at_latest   := v_sched_l;
    return next;

    -- simulate that this step was sent at earliest time for chaining
    v_cur_base := v_sched_e;
  end loop;
end;
$$;

-- Grant execute permissions
grant execute on function public.preview_next_send_for_step to authenticated;
grant execute on function public.preview_sequence_schedule to authenticated;

