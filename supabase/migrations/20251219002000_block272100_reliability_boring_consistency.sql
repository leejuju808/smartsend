-- ============================================================
-- BLOCK 272100 — SmartSend Reliability Sprint
-- “Make results boringly consistent.”
--
-- Ships:
-- - Rolling weekly baseline ("Normal Range") for:
--   homeowners contacted / replies / jobs booked
-- - Quiet drift detection:
--   "Activity below normal this week."
-- - Bounded auto-correction (safe, reversible):
--   - Increase volume slightly (campaign daily_cap bump)
--   - Expand area slightly (reactivate a small number of paused ZIPs)
--   - Tighten follow-ups slightly (workspace multiplier used by followup orchestrator)
--
-- Principles:
-- - Bad weeks don’t spiral: auto-corrections are small + expire automatically.
-- - No alerts, no blame: drift is a single line.
-- - Schema-drift safe: best-effort metrics from whichever tables exist.
-- ============================================================

-- ------------------------------------------------------------
-- 0) Workspace knobs (safe defaults)
-- ------------------------------------------------------------
alter table public.workspaces
  add column if not exists reliability_autocorrect_enabled boolean not null default true,
  add column if not exists reliability_followup_multiplier numeric not null default 1.0
    check (reliability_followup_multiplier >= 0.5 and reliability_followup_multiplier <= 1.5);

comment on column public.workspaces.reliability_autocorrect_enabled is
  'Block 272100: Enables silent auto-correction (bounded + reversible).';
comment on column public.workspaces.reliability_followup_multiplier is
  'Block 272100: Multiplier applied to follow-up delay ( <1 = tighter / faster follow-ups ).';

-- ------------------------------------------------------------
-- 1) Weekly activity metrics (per workspace, Monday week start)
-- ------------------------------------------------------------
create table if not exists public.ss_reliability_weekly_metrics (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  week_start date not null, -- Monday (UTC)
  homeowners_contacted int not null default 0,
  replies int not null default 0,
  jobs_booked int not null default 0,
  computed_at timestamptz not null default now(),
  primary key (workspace_id, week_start)
);

create index if not exists idx_ss_rel_weekly_metrics_ws_week
  on public.ss_reliability_weekly_metrics(workspace_id, week_start desc);

comment on table public.ss_reliability_weekly_metrics is
  'Block 272100: Weekly totals (Monday-start) for contacted/replies/jobs booked per workspace.';

alter table public.ss_reliability_weekly_metrics enable row level security;

drop policy if exists "ss_rel_weekly_metrics_select_workspace_members" on public.ss_reliability_weekly_metrics;
create policy "ss_rel_weekly_metrics_select_workspace_members" on public.ss_reliability_weekly_metrics
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = ss_reliability_weekly_metrics.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "ss_rel_weekly_metrics_service_role_all" on public.ss_reliability_weekly_metrics;
create policy "ss_rel_weekly_metrics_service_role_all" on public.ss_reliability_weekly_metrics
  for all
  to service_role
  using (true)
  with check (true);

grant select on public.ss_reliability_weekly_metrics to authenticated;
grant all on public.ss_reliability_weekly_metrics to service_role;

-- ------------------------------------------------------------
-- 2) Baseline config + snapshot (Normal Range)
-- ------------------------------------------------------------
create table if not exists public.ss_reliability_baseline_config (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  window_weeks int not null default 8 check (window_weeks >= 4 and window_weeks <= 26),
  min_weeks int not null default 4 check (min_weeks >= 3 and min_weeks <= 12),
  method text not null default 'median_mad' check (method in ('median_mad')),
  updated_at timestamptz not null default now()
);

comment on table public.ss_reliability_baseline_config is
  'Block 272100: Baseline settings (rolling window) per workspace.';

alter table public.ss_reliability_baseline_config enable row level security;

drop policy if exists "ss_rel_baseline_cfg_select_workspace_members" on public.ss_reliability_baseline_config;
create policy "ss_rel_baseline_cfg_select_workspace_members" on public.ss_reliability_baseline_config
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = ss_reliability_baseline_config.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "ss_rel_baseline_cfg_write_workspace_members" on public.ss_reliability_baseline_config;
create policy "ss_rel_baseline_cfg_write_workspace_members" on public.ss_reliability_baseline_config
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = ss_reliability_baseline_config.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner','admin')
    )
  )
  with check (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = ss_reliability_baseline_config.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner','admin')
    )
  );

drop policy if exists "ss_rel_baseline_cfg_service_role_all" on public.ss_reliability_baseline_config;
create policy "ss_rel_baseline_cfg_service_role_all" on public.ss_reliability_baseline_config
  for all
  to service_role
  using (true)
  with check (true);

grant select on public.ss_reliability_baseline_config to authenticated;
grant all on public.ss_reliability_baseline_config to service_role;

create table if not exists public.ss_reliability_baseline_latest (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  week_start date not null, -- baseline computed "as of" week start
  window_weeks int not null,
  sample_weeks int not null,
  baseline jsonb not null default '{}'::jsonb, -- { homeowners_contacted:{center,low,high}, replies:{...}, jobs_booked:{...} }
  computed_at timestamptz not null default now()
);

comment on table public.ss_reliability_baseline_latest is
  'Block 272100: Latest computed Normal Range baseline per workspace (JSON ranges).';

alter table public.ss_reliability_baseline_latest enable row level security;

drop policy if exists "ss_rel_baseline_latest_select_workspace_members" on public.ss_reliability_baseline_latest;
create policy "ss_rel_baseline_latest_select_workspace_members" on public.ss_reliability_baseline_latest
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = ss_reliability_baseline_latest.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "ss_rel_baseline_latest_service_role_all" on public.ss_reliability_baseline_latest;
create policy "ss_rel_baseline_latest_service_role_all" on public.ss_reliability_baseline_latest
  for all
  to service_role
  using (true)
  with check (true);

grant select on public.ss_reliability_baseline_latest to authenticated;
grant all on public.ss_reliability_baseline_latest to service_role;

-- ------------------------------------------------------------
-- 3) Drift + auto-correction state (auditable, quiet)
-- ------------------------------------------------------------
create table if not exists public.ss_reliability_drift_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  week_start date not null,
  drift_state text not null check (drift_state in ('normal','below_normal','above_normal')),
  message text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_ss_rel_drift_events_ws_created
  on public.ss_reliability_drift_events(workspace_id, created_at desc);

comment on table public.ss_reliability_drift_events is
  'Block 272100: Quiet drift event log (no notifications), used for UI line + debugging.';

alter table public.ss_reliability_drift_events enable row level security;

drop policy if exists "ss_rel_drift_events_select_workspace_members" on public.ss_reliability_drift_events;
create policy "ss_rel_drift_events_select_workspace_members" on public.ss_reliability_drift_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = ss_reliability_drift_events.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "ss_rel_drift_events_service_role_all" on public.ss_reliability_drift_events;
create policy "ss_rel_drift_events_service_role_all" on public.ss_reliability_drift_events
  for all
  to service_role
  using (true)
  with check (true);

grant select on public.ss_reliability_drift_events to authenticated;
grant all on public.ss_reliability_drift_events to service_role;

create table if not exists public.ss_reliability_autocorrect_state (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  week_start date not null,
  volume_bump_pct int not null default 0,         -- 0..25 (applied to campaigns.daily_cap)
  area_reactivated_zips int not null default 0,   -- count of zips reactivated this week
  followup_tighten_pct int not null default 0,    -- 0..20 (0.0..0.8 multiplier effect)
  applied_at timestamptz,
  expires_at timestamptz,
  details jsonb not null default '{}'::jsonb
);

comment on table public.ss_reliability_autocorrect_state is
  'Block 272100: Current week auto-correction deltas (bounded + reversible).';

alter table public.ss_reliability_autocorrect_state enable row level security;

drop policy if exists "ss_rel_autocorrect_state_select_workspace_members" on public.ss_reliability_autocorrect_state;
create policy "ss_rel_autocorrect_state_select_workspace_members" on public.ss_reliability_autocorrect_state
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = ss_reliability_autocorrect_state.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "ss_rel_autocorrect_state_service_role_all" on public.ss_reliability_autocorrect_state;
create policy "ss_rel_autocorrect_state_service_role_all" on public.ss_reliability_autocorrect_state
  for all
  to service_role
  using (true)
  with check (true);

grant select on public.ss_reliability_autocorrect_state to authenticated;
grant all on public.ss_reliability_autocorrect_state to service_role;

-- ------------------------------------------------------------
-- 4) Helper: start-of-week Monday (UTC) for timestamptz/date
-- ------------------------------------------------------------
create or replace function public.ss_week_start_monday_utc(p_ts timestamptz)
returns date
language sql
immutable
as $$
  select (
    (date_trunc('day', (p_ts at time zone 'utc'))::date)
    - (((extract(dow from (p_ts at time zone 'utc'))::int + 6) % 7))::int
  )::date
$$;

comment on function public.ss_week_start_monday_utc(timestamptz) is
  'Block 272100: Returns Monday week start date for a UTC timestamp.';

-- ------------------------------------------------------------
-- 5) Compute weekly metrics (best-effort sources)
-- ------------------------------------------------------------
create or replace function public.ss_reliability_compute_weekly_metrics(
  p_workspace_id uuid,
  p_week_start date
)
returns table (
  workspace_id uuid,
  week_start date,
  homeowners_contacted int,
  replies int,
  jobs_booked int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week_start date := p_week_start;
  v_week_end date := (p_week_start + 7);
  v_start_ts timestamptz := (p_week_start::timestamp at time zone 'utc');
  v_end_ts timestamptz := ((p_week_start + 7)::timestamp at time zone 'utc');
  v_contacted int := 0;
  v_replies int := 0;
  v_jobs int := 0;
  v_send_queue_has_updated_at boolean := false;
begin
  if p_workspace_id is null or p_week_start is null then
    return;
  end if;

  -- homeowners contacted: prefer send_queue (new), then campaign_send_queue, then send_logs.
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='send_queue') then
    begin
      select exists (
        select 1
        from information_schema.columns
        where table_schema='public' and table_name='send_queue' and column_name='updated_at'
      ) into v_send_queue_has_updated_at;

      if v_send_queue_has_updated_at then
        execute $q$
          select count(distinct sq.lead_id)::int
          from public.send_queue sq
          where sq.workspace_id = $1
            and sq.lead_id is not null
            and sq.status in ('sent','delivered')
            and sq.updated_at >= $2::timestamptz
            and sq.updated_at < $3::timestamptz
        $q$ into v_contacted using p_workspace_id, v_start_ts, v_end_ts;
      else
        execute $q$
          select count(distinct sq.lead_id)::int
          from public.send_queue sq
          where sq.workspace_id = $1
            and sq.lead_id is not null
            and sq.status in ('sent','delivered')
            and sq.created_at >= $2::timestamptz
            and sq.created_at < $3::timestamptz
        $q$ into v_contacted using p_workspace_id, v_start_ts, v_end_ts;
      end if;
    exception when others then
      v_contacted := 0;
    end;
  elsif exists (select 1 from information_schema.tables where table_schema='public' and table_name='campaign_send_queue') then
    begin
      execute $q$
        select count(distinct q.lead_id)::int
        from public.campaign_send_queue q
        join public.campaigns c on c.id = q.campaign_id
        where c.workspace_id = $1
          and q.lead_id is not null
          and q.status in ('sent','delivered')
          and coalesce(q.sent_at, q.updated_at, q.created_at) >= $2::timestamptz
          and coalesce(q.sent_at, q.updated_at, q.created_at) < $3::timestamptz
      $q$ into v_contacted using p_workspace_id, v_start_ts, v_end_ts;
    exception when others then
      v_contacted := 0;
    end;
  elsif exists (select 1 from information_schema.tables where table_schema='public' and table_name='send_logs') then
    begin
      execute $q$
        select count(*)::int
        from public.send_logs sl
        join public.campaigns c on c.id = sl.campaign_id
        where c.workspace_id = $1
          and sl.status in ('sent','delivered')
          and sl.sent_at >= $2::timestamptz
          and sl.sent_at < $3::timestamptz
      $q$ into v_contacted using p_workspace_id, v_start_ts, v_end_ts;
    exception when others then
      v_contacted := 0;
    end;
  end if;

  -- replies: prefer smartsend_reply_events, fallback to leads.replied_at if present
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='smartsend_reply_events') then
    begin
      execute $q$
        select count(*)::int
        from public.smartsend_reply_events r
        join public.campaigns c on c.id = r.campaign_id
        where c.workspace_id = $1
          and r.created_at >= $2::timestamptz
          and r.created_at < $3::timestamptz
      $q$ into v_replies using p_workspace_id, v_start_ts, v_end_ts;
    exception when others then
      v_replies := 0;
    end;
  elsif exists (select 1 from information_schema.tables where table_schema='public' and table_name='leads')
    and exists (select 1 from information_schema.columns where table_schema='public' and table_name='leads' and column_name='replied_at') then
    begin
      execute $q$
        select count(distinct l.id)::int
        from public.leads l
        where l.workspace_id = $1
          and l.replied_at is not null
          and l.replied_at >= $2::timestamptz
          and l.replied_at < $3::timestamptz
      $q$ into v_replies using p_workspace_id, v_start_ts, v_end_ts;
    exception when others then
      v_replies := 0;
    end;
  end if;

  -- jobs booked: prefer appointments, fallback to leads.appointment_booked_at if present
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='appointments') then
    begin
      execute $q$
        select count(*)::int
        from public.appointments a
        where a.workspace_id = $1
          and coalesce(a.status,'') not in ('cancelled','canceled')
          and a.created_at >= $2::timestamptz
          and a.created_at < $3::timestamptz
      $q$ into v_jobs using p_workspace_id, v_start_ts, v_end_ts;
    exception when others then
      v_jobs := 0;
    end;
  elsif exists (select 1 from information_schema.tables where table_schema='public' and table_name='leads')
    and exists (select 1 from information_schema.columns where table_schema='public' and table_name='leads' and column_name='appointment_booked_at') then
    begin
      execute $q$
        select count(distinct l.id)::int
        from public.leads l
        where l.workspace_id = $1
          and l.appointment_booked_at is not null
          and l.appointment_booked_at >= $2::timestamptz
          and l.appointment_booked_at < $3::timestamptz
      $q$ into v_jobs using p_workspace_id, v_start_ts, v_end_ts;
    exception when others then
      v_jobs := 0;
    end;
  end if;

  return query
    select p_workspace_id, v_week_start, coalesce(v_contacted,0), coalesce(v_replies,0), coalesce(v_jobs,0);
end;
$$;

revoke all on function public.ss_reliability_compute_weekly_metrics(uuid, date) from public;
grant execute on function public.ss_reliability_compute_weekly_metrics(uuid, date) to authenticated, service_role;

comment on function public.ss_reliability_compute_weekly_metrics(uuid, date) is
  'Block 272100: Computes weekly contacted/replies/jobs booked per workspace using best-effort sources.';

-- ------------------------------------------------------------
-- 6) Upsert weekly metrics row
-- ------------------------------------------------------------
create or replace function public.ss_reliability_upsert_weekly_metrics(
  p_workspace_id uuid,
  p_week_start date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  select * into v_row
  from public.ss_reliability_compute_weekly_metrics(p_workspace_id, p_week_start)
  limit 1;

  if v_row is null then
    return;
  end if;

  insert into public.ss_reliability_weekly_metrics(
    workspace_id, week_start, homeowners_contacted, replies, jobs_booked, computed_at
  )
  values (
    v_row.workspace_id,
    v_row.week_start,
    v_row.homeowners_contacted,
    v_row.replies,
    v_row.jobs_booked,
    now()
  )
  on conflict (workspace_id, week_start) do update set
    homeowners_contacted = excluded.homeowners_contacted,
    replies = excluded.replies,
    jobs_booked = excluded.jobs_booked,
    computed_at = excluded.computed_at;
end;
$$;

revoke all on function public.ss_reliability_upsert_weekly_metrics(uuid, date) from public;
grant execute on function public.ss_reliability_upsert_weekly_metrics(uuid, date) to service_role;

comment on function public.ss_reliability_upsert_weekly_metrics(uuid, date) is
  'Block 272100: Upserts ss_reliability_weekly_metrics for a given workspace+week.';

-- ------------------------------------------------------------
-- 7) Baseline computation (median ± 2*MAD, clamped >=0)
-- ------------------------------------------------------------
create or replace function public.ss_reliability_compute_baseline(
  p_workspace_id uuid,
  p_asof_week_start date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg record;
  v_asof date;
  v_window int := 8;
  v_min int := 4;
  v_sample int := 0;
  v_json jsonb := '{}'::jsonb;

  -- metric arrays
  a_contacted int[];
  a_replies int[];
  a_jobs int[];

  -- centers
  m_contacted numeric := 0;
  m_replies numeric := 0;
  m_jobs numeric := 0;

  -- MADs
  mad_contacted numeric := 0;
  mad_replies numeric := 0;
  mad_jobs numeric := 0;

  -- ranges
  low_c numeric := 0; high_c numeric := 0;
  low_r numeric := 0; high_r numeric := 0;
  low_j numeric := 0; high_j numeric := 0;
begin
  if p_workspace_id is null then
    return '{}'::jsonb;
  end if;

  -- Config (optional)
  select * into v_cfg
  from public.ss_reliability_baseline_config
  where workspace_id = p_workspace_id;

  if v_cfg is not null then
    v_window := coalesce(v_cfg.window_weeks, v_window);
    v_min := coalesce(v_cfg.min_weeks, v_min);
  end if;

  -- as-of week start (default: current week start)
  v_asof := coalesce(p_asof_week_start, public.ss_week_start_monday_utc(now()));

  -- Pull last N completed weeks (exclude current week)
  select
    array_agg(homeowners_contacted order by week_start desc),
    array_agg(replies order by week_start desc),
    array_agg(jobs_booked order by week_start desc),
    count(*)::int
  into a_contacted, a_replies, a_jobs, v_sample
  from (
    select *
    from public.ss_reliability_weekly_metrics
    where workspace_id = p_workspace_id
      and week_start < v_asof
    order by week_start desc
    limit v_window
  ) x;

  if v_sample is null then v_sample := 0; end if;
  if v_sample < v_min then
    return jsonb_build_object(
      'ok', false,
      'reason', 'insufficient_history',
      'sample_weeks', v_sample,
      'min_weeks', v_min,
      'window_weeks', v_window,
      'asof_week_start', v_asof
    );
  end if;

  -- MEDIAN helper: percentile_cont(0.5)
  select percentile_cont(0.5) within group (order by v) into m_contacted
  from unnest(a_contacted) as v;
  select percentile_cont(0.5) within group (order by v) into m_replies
  from unnest(a_replies) as v;
  select percentile_cont(0.5) within group (order by v) into m_jobs
  from unnest(a_jobs) as v;

  -- MAD: median(|x - median|)
  select percentile_cont(0.5) within group (order by abs(v - m_contacted)) into mad_contacted
  from unnest(a_contacted) as v;
  select percentile_cont(0.5) within group (order by abs(v - m_replies)) into mad_replies
  from unnest(a_replies) as v;
  select percentile_cont(0.5) within group (order by abs(v - m_jobs)) into mad_jobs
  from unnest(a_jobs) as v;

  -- Use a robust scale factor for MAD (~1.4826) and widen slightly (x2).
  -- range = median ± 2 * (1.4826 * MAD)
  low_c := greatest(0, m_contacted - (2 * 1.4826 * mad_contacted));
  high_c := greatest(0, m_contacted + (2 * 1.4826 * mad_contacted));
  low_r := greatest(0, m_replies - (2 * 1.4826 * mad_replies));
  high_r := greatest(0, m_replies + (2 * 1.4826 * mad_replies));
  low_j := greatest(0, m_jobs - (2 * 1.4826 * mad_jobs));
  high_j := greatest(0, m_jobs + (2 * 1.4826 * mad_jobs));

  v_json := jsonb_build_object(
    'ok', true,
    'method', 'median_mad',
    'window_weeks', v_window,
    'sample_weeks', v_sample,
    'asof_week_start', v_asof,
    'homeowners_contacted', jsonb_build_object(
      'center', round(m_contacted, 2),
      'low', round(low_c, 2),
      'high', round(high_c, 2)
    ),
    'replies', jsonb_build_object(
      'center', round(m_replies, 2),
      'low', round(low_r, 2),
      'high', round(high_r, 2)
    ),
    'jobs_booked', jsonb_build_object(
      'center', round(m_jobs, 2),
      'low', round(low_j, 2),
      'high', round(high_j, 2)
    )
  );

  -- persist latest snapshot
  insert into public.ss_reliability_baseline_latest(
    workspace_id, week_start, window_weeks, sample_weeks, baseline, computed_at
  )
  values (
    p_workspace_id, v_asof, v_window, v_sample, v_json, now()
  )
  on conflict (workspace_id) do update set
    week_start = excluded.week_start,
    window_weeks = excluded.window_weeks,
    sample_weeks = excluded.sample_weeks,
    baseline = excluded.baseline,
    computed_at = excluded.computed_at;

  return v_json;
end;
$$;

revoke all on function public.ss_reliability_compute_baseline(uuid, date) from public;
grant execute on function public.ss_reliability_compute_baseline(uuid, date) to authenticated, service_role;

comment on function public.ss_reliability_compute_baseline(uuid, date) is
  'Block 272100: Computes and persists Normal Range baseline (median±MAD) for a workspace.';

-- ------------------------------------------------------------
-- 8) Auto-correction (bounded, reversible)
-- ------------------------------------------------------------
create or replace function public.ss_reliability_autocorrect(
  p_workspace_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_week_start date := public.ss_week_start_monday_utc(v_now);
  v_week_end date := v_week_start + 7;
  v_week_start_ts timestamptz := (v_week_start::timestamp at time zone 'utc');
  v_progress numeric := least(1, greatest(0, extract(epoch from (v_now - v_week_start_ts)) / (7*24*60*60)));

  v_enabled boolean := true;
  v_follow_mult numeric := 1.0;

  v_baseline jsonb;
  v_ok boolean := false;

  -- current week-to-date metrics (as partial week)
  v_cur_contacted int := 0;
  v_cur_replies int := 0;
  v_cur_jobs int := 0;

  -- expected ranges scaled by progress
  v_low_contacted numeric := null;
  v_low_replies numeric := null;
  v_low_jobs numeric := null;
  v_high_contacted numeric := null;
  v_high_replies numeric := null;
  v_high_jobs numeric := null;

  v_below boolean := false;
  v_above boolean := false;

  v_message text := '';

  v_state record;
  v_volume_bump int := 0;
  v_follow_tighten int := 0;
  v_area_bump int := 0;

  v_details jsonb := '{}'::jsonb;
  v_original_caps jsonb := '{}'::jsonb;
  v_changed boolean := false;
  v_has_existing_state boolean := false;
begin
  if p_workspace_id is null then
    return jsonb_build_object('ok', false, 'error', 'workspace_required');
  end if;

  -- Respect opt-out
  begin
    select
      coalesce(reliability_autocorrect_enabled, true),
      coalesce(reliability_followup_multiplier, 1.0)
    into v_enabled, v_follow_mult
    from public.workspaces
    where id = p_workspace_id;
  exception when others then
    v_enabled := true;
    v_follow_mult := 1.0;
  end;

  if not v_enabled then
    return jsonb_build_object('ok', true, 'enabled', false, 'message', 'autocorrect_disabled');
  end if;

  -- Upsert current week WTD metrics into weekly table (for history consistency).
  perform public.ss_reliability_upsert_weekly_metrics(p_workspace_id, v_week_start);

  -- Compute baseline (excludes current week)
  v_baseline := public.ss_reliability_compute_baseline(p_workspace_id, v_week_start);
  v_ok := coalesce((v_baseline->>'ok')::boolean, false);

  -- If no baseline yet, do nothing.
  if not v_ok then
    return jsonb_build_object('ok', true, 'enabled', true, 'baseline_ok', false, 'baseline', v_baseline);
  end if;

  -- Current week-to-date metrics (best effort using the same compute fn but clipped to now)
  -- We compute full-week counts and scale by progress as a conservative proxy, then compare to scaled baseline.
  -- This avoids false drift early in the week without requiring day-of-week baselines.
  select
    coalesce(m.homeowners_contacted,0),
    coalesce(m.replies,0),
    coalesce(m.jobs_booked,0)
  into v_cur_contacted, v_cur_replies, v_cur_jobs
  from public.ss_reliability_weekly_metrics m
  where m.workspace_id = p_workspace_id and m.week_start = v_week_start;

  v_low_contacted := greatest(0, (v_baseline->'homeowners_contacted'->>'low')::numeric) * v_progress;
  v_high_contacted := greatest(0, (v_baseline->'homeowners_contacted'->>'high')::numeric) * v_progress;
  v_low_replies := greatest(0, (v_baseline->'replies'->>'low')::numeric) * v_progress;
  v_high_replies := greatest(0, (v_baseline->'replies'->>'high')::numeric) * v_progress;
  v_low_jobs := greatest(0, (v_baseline->'jobs_booked'->>'low')::numeric) * v_progress;
  v_high_jobs := greatest(0, (v_baseline->'jobs_booked'->>'high')::numeric) * v_progress;

  -- Drift state: only after the week is at least half complete (prevents Monday panic).
  if v_progress >= 0.5 then
    v_below := (v_cur_contacted < v_low_contacted) or (v_cur_replies < v_low_replies) or (v_cur_jobs < v_low_jobs);
    v_above := (v_cur_contacted > v_high_contacted) or (v_cur_replies > v_high_replies) or (v_cur_jobs > v_high_jobs);
  else
    v_below := false;
    v_above := false;
  end if;

  if v_below then
    v_message := 'Activity below normal this week.';
  elsif v_above then
    v_message := 'Activity above normal this week.';
  else
    v_message := '';
  end if;

  -- Record drift event (dedupe by day)
  if v_message <> '' then
    if not exists (
      select 1
      from public.ss_reliability_drift_events e
      where e.workspace_id = p_workspace_id
        and e.week_start = v_week_start
        and e.drift_state = (case when v_below then 'below_normal' when v_above then 'above_normal' else 'normal' end)
        and (e.created_at at time zone 'utc')::date = (v_now at time zone 'utc')::date
    ) then
      insert into public.ss_reliability_drift_events(workspace_id, week_start, drift_state, message, details)
      values (
        p_workspace_id,
        v_week_start,
        case when v_below then 'below_normal' when v_above then 'above_normal' else 'normal' end,
        v_message,
        jsonb_build_object(
          'progress', round(v_progress, 3),
          'current', jsonb_build_object('homeowners_contacted', v_cur_contacted, 'replies', v_cur_replies, 'jobs_booked', v_cur_jobs),
          'baseline_scaled_low', jsonb_build_object('homeowners_contacted', round(v_low_contacted,2), 'replies', round(v_low_replies,2), 'jobs_booked', round(v_low_jobs,2)),
          'baseline_scaled_high', jsonb_build_object('homeowners_contacted', round(v_high_contacted,2), 'replies', round(v_high_replies,2), 'jobs_booked', round(v_high_jobs,2))
        )
      );
    end if;
  end if;

  -- Load current autocorrect state for this week (if any)
  select * into v_state
  from public.ss_reliability_autocorrect_state
  where workspace_id = p_workspace_id;

  v_has_existing_state := (v_state is not null);

  -- Expire prior week's correction: revert followup multiplier to 1.0 when expired
  if v_state is not null and v_state.expires_at is not null and v_state.expires_at <= v_now then
    begin
      update public.workspaces
      set reliability_followup_multiplier = 1.0
      where id = p_workspace_id;
    exception when others then
      null;
    end;

    -- Revert campaign daily_cap (if we stored originals)
    if exists (select 1 from information_schema.tables where table_schema='public' and table_name='campaigns')
      and exists (select 1 from information_schema.columns where table_schema='public' and table_name='campaigns' and column_name='daily_cap')
    then
      begin
        update public.campaigns c
        set daily_cap = coalesce((x.value->>'daily_cap')::int, c.daily_cap)
        from (
          select key as campaign_id, value
          from jsonb_each(coalesce(v_state.details->'original_campaign_caps','{}'::jsonb))
        ) x
        where c.id = (x.campaign_id)::uuid
          and c.workspace_id = p_workspace_id;
      exception when others then
        null;
      end;
    end if;

    delete from public.ss_reliability_autocorrect_state
    where workspace_id = p_workspace_id;

    v_state := null;
    v_has_existing_state := false;
  end if;

  -- If we are below normal: apply small corrections (once/week, reversible).
  if v_below then
    if v_has_existing_state then
      v_volume_bump := coalesce(v_state.volume_bump_pct, 0);
      v_follow_tighten := coalesce(v_state.followup_tighten_pct, 0);
      v_area_bump := coalesce(v_state.area_reactivated_zips, 0);
      v_original_caps := coalesce(v_state.details->'original_campaign_caps','{}'::jsonb);
    else
      v_volume_bump := 0;
      v_follow_tighten := 0;
      v_area_bump := 0;
      v_original_caps := '{}'::jsonb;
    end if;

    -- Volume bump: up to +10% once per week, capped at +25% total.
    if v_volume_bump < 25 then
      v_volume_bump := least(25, greatest(v_volume_bump, 0) + 10);
    end if;

    -- Follow-up tighten: set workspace multiplier down to 0.9 (10% faster) max once.
    if v_follow_tighten < 10 then
      v_follow_tighten := 10;
    end if;

    -- Area: reactivate up to 2 paused ZIPs per week (best-effort, only if table exists).
    if v_area_bump < 2
      and exists (select 1 from information_schema.tables where table_schema='public' and table_name='campaign_zip_controls')
      and exists (select 1 from information_schema.views where table_schema='public' and table_name='v_campaign_zip_presence_30d')
    then
      -- Reactivate the "best" paused ZIP (highest contacted last 30d) across active campaigns.
      -- This is intentionally conservative and reversible (user can pause again).
      begin
        with candidate as (
          select
            v.campaign_id,
            v.zip,
            v.homeowners_contacted
          from public.v_campaign_zip_presence_30d v
          join public.campaigns c on c.id = v.campaign_id
          join public.campaign_zip_controls z on z.campaign_id = v.campaign_id and z.zip = v.zip
          where c.workspace_id = p_workspace_id
            and coalesce(c.status,'running') in ('running')
            and z.is_active is distinct from true
            and v.zip <> 'unknown'
          order by v.homeowners_contacted desc, v.zip asc
          limit 1
        )
        select public.ss_campaign_set_zip_active(candidate.campaign_id, candidate.zip, true)
        from candidate;

        -- increment if we actually had a candidate
        if found then
          v_area_bump := v_area_bump + 1;
        end if;
      exception when others then
        null;
      end;
    end if;

    -- Apply follow-up multiplier (10% tighter)
    begin
      update public.workspaces
      set reliability_followup_multiplier = (1.0 - (v_follow_tighten::numeric / 100.0))
      where id = p_workspace_id;
    exception when others then
      null;
    end;

    -- Apply campaign daily_cap bumps (best-effort; non-compounding + reversible)
    if exists (select 1 from information_schema.tables where table_schema='public' and table_name='campaigns')
      and exists (select 1 from information_schema.columns where table_schema='public' and table_name='campaigns' and column_name='daily_cap')
    then
      begin
        -- Capture original caps once/week so bumps do not compound
        if v_original_caps = '{}'::jsonb then
          select jsonb_object_agg(c.id::text, jsonb_build_object('daily_cap', coalesce(c.daily_cap, 50)))
          into v_original_caps
          from public.campaigns c
          where c.workspace_id = p_workspace_id
            and coalesce(c.status,'running') in ('running');

          if v_original_caps is null then
            v_original_caps := '{}'::jsonb;
          end if;
        end if;

        update public.campaigns c
        set daily_cap = greatest(
          0,
          floor(
            coalesce((x.value->>'daily_cap')::numeric, coalesce(c.daily_cap, 50)::numeric)
            * (1 + (v_volume_bump::numeric/100.0))
          )::int
        )
        from (
          select key as campaign_id, value
          from jsonb_each(coalesce(v_original_caps,'{}'::jsonb))
        ) x
        where c.id = (x.campaign_id)::uuid
          and c.workspace_id = p_workspace_id
          and coalesce(c.status,'running') in ('running');
      exception when others then
        null;
      end;
    end if;

    v_changed := true;
  end if;

  -- Persist state (only if below)
  if v_changed then
    v_details := jsonb_build_object(
      'progress', round(v_progress, 3),
      'baseline', v_baseline,
      'current_week', jsonb_build_object('homeowners_contacted', v_cur_contacted, 'replies', v_cur_replies, 'jobs_booked', v_cur_jobs),
      'original_campaign_caps', coalesce(v_original_caps,'{}'::jsonb)
    );

    insert into public.ss_reliability_autocorrect_state(
      workspace_id, week_start, volume_bump_pct, area_reactivated_zips, followup_tighten_pct,
      applied_at, expires_at, details
    )
    values (
      p_workspace_id,
      v_week_start,
      v_volume_bump,
      v_area_bump,
      v_follow_tighten,
      v_now,
      ((v_week_end::timestamp at time zone 'utc') + interval '1 day'), -- expire shortly after week end (UTC)
      v_details
    )
    on conflict (workspace_id) do update set
      week_start = excluded.week_start,
      volume_bump_pct = excluded.volume_bump_pct,
      area_reactivated_zips = excluded.area_reactivated_zips,
      followup_tighten_pct = excluded.followup_tighten_pct,
      applied_at = excluded.applied_at,
      expires_at = excluded.expires_at,
      details = excluded.details;
  end if;

  return jsonb_build_object(
    'ok', true,
    'enabled', true,
    'week_start', v_week_start,
    'progress', round(v_progress, 3),
    'baseline', v_baseline,
    'drift_message', v_message,
    'autocorrect_applied', v_changed
  );
end;
$$;

revoke all on function public.ss_reliability_autocorrect(uuid) from public;
grant execute on function public.ss_reliability_autocorrect(uuid) to service_role;

comment on function public.ss_reliability_autocorrect(uuid) is
  'Block 272100: Applies bounded auto-corrections for below-normal weeks; writes drift events; self-expires.';

-- ------------------------------------------------------------
-- 9) Daily tick: refresh last N weeks + run autocorrect
-- ------------------------------------------------------------
create or replace function public.ss_reliability_tick_daily()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws record;
  v_now timestamptz := now();
  v_week_start date := public.ss_week_start_monday_utc(v_now);
  v_w date;
  v_count int := 0;
begin
  for v_ws in
    select id from public.workspaces
  loop
    -- Upsert last 12 weeks (including current for continuity)
    v_w := v_week_start;
    for i in 0..11 loop
      perform public.ss_reliability_upsert_weekly_metrics(v_ws.id, (v_w - (i*7)));
    end loop;

    -- Baseline + autocorrect
    perform public.ss_reliability_compute_baseline(v_ws.id, v_week_start);
    perform public.ss_reliability_autocorrect(v_ws.id);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.ss_reliability_tick_daily() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('ss-reliability-tick-daily');
    perform cron.schedule(
      'ss-reliability-tick-daily',
      '20 1 * * *', -- daily @ 01:20 UTC
      $$
      select public.ss_reliability_tick_daily();
      $$
    );
  end if;
exception when others then
  -- do not hard-fail if cron isn't available
  null;
end $$;




