-- ============================================================
-- BLOCK 288000 — SmartSend Silent Performance Monitor v1
-- “Fix Problems Before Users Notice.”
--
-- Internal-only monitoring of per-company risk state:
--   Healthy / At Risk / Critical
--
-- LOCKED signals (captured daily):
--   - Email send success rate
--   - Follow-up execution rate
--   - Estimate approval rate
--   - Dashboard activity (last login/activity)
--   - Payment status drift
--
-- System risk rules:
--   - Send failures > 5%            -> at_risk
--   - No activity 7 days            -> at_risk
--   - Payment past_due              -> critical
--   - Follow-ups paused + no activity -> critical
--
-- Auto-protect (silent):
--   - If Critical due to delivery -> pause company sending + log event
--     User-facing message: "Messages are temporarily paused to protect delivery."
-- ============================================================

-- ============================================================================
-- 1) TABLE: performance_health (latest status per company)
-- ============================================================================
create table if not exists public.performance_health (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.roofing_companies(id) on delete cascade,
  status text not null check (status in ('healthy','at_risk','critical')),
  reasons jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now(),
  unique (company_id)
);

create index if not exists idx_performance_health_status_computed
  on public.performance_health(status, computed_at desc);

create index if not exists idx_performance_health_company
  on public.performance_health(company_id);

comment on table public.performance_health is
  'Block 288000: Latest silent health classification per company (healthy/at_risk/critical) + reasons JSON.';

alter table public.performance_health enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='performance_health' and policyname='performance_health_service_role_all'
  ) then
    create policy performance_health_service_role_all
      on public.performance_health
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end $$;

grant all on public.performance_health to service_role;

-- ============================================================================
-- 2) TABLE: performance_health_trend_daily (daily snapshot of %)
-- ============================================================================
create table if not exists public.performance_health_trend_daily (
  day date primary key,
  total_count int not null default 0,
  healthy_count int not null default 0,
  at_risk_count int not null default 0,
  critical_count int not null default 0,
  healthy_pct numeric(6,3) not null default 0,
  at_risk_pct numeric(6,3) not null default 0,
  critical_pct numeric(6,3) not null default 0,
  computed_at timestamptz not null default now()
);

create index if not exists idx_perf_health_trend_computed
  on public.performance_health_trend_daily(computed_at desc);

comment on table public.performance_health_trend_daily is
  'Block 288000: Daily snapshot of health distribution across companies.';

alter table public.performance_health_trend_daily enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='performance_health_trend_daily' and policyname='performance_health_trend_daily_service_role_all'
  ) then
    create policy performance_health_trend_daily_service_role_all
      on public.performance_health_trend_daily
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end $$;

grant all on public.performance_health_trend_daily to service_role;

-- ============================================================================
-- 3) TABLE: performance_protection_events (auto-protect logs)
-- ============================================================================
create table if not exists public.performance_protection_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.roofing_companies(id) on delete cascade,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_perf_protection_events_company_created
  on public.performance_protection_events(company_id, created_at desc);

comment on table public.performance_protection_events is
  'Block 288000: Logs of silent auto-protect actions (e.g. delivery pause/throttle).';

alter table public.performance_protection_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='performance_protection_events' and policyname='performance_protection_events_service_role_all'
  ) then
    create policy performance_protection_events_service_role_all
      on public.performance_protection_events
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end $$;

grant all on public.performance_protection_events to service_role;

-- ============================================================================
-- 4) VIEW: performance_health_latest (convenience)
-- ============================================================================
create or replace view public.performance_health_latest as
select
  company_id,
  status,
  reasons,
  computed_at
from public.performance_health;

grant select on public.performance_health_latest to service_role;

comment on view public.performance_health_latest is
  'Block 288000: Latest performance health row per company (1 row/company).';

-- ============================================================================
-- 5) RPC: compute_performance_health(company_id)
-- ============================================================================
create or replace function public.compute_performance_health(
  p_company_id uuid,
  p_persist boolean default true
)
returns table (
  company_id uuid,
  status text,
  computed_at timestamptz,
  reasons jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();

  -- Delivery signals (24h)
  v_sent_24h int := 0;
  v_failed_24h int := 0;
  v_total_24h int := 0;
  v_failure_rate_24h numeric := 0;
  v_success_rate_24h numeric := 0;

  -- Follow-up execution signals (24h)
  v_followups_due_24h int := 0;
  v_followups_sent_24h int := 0;
  v_followup_exec_rate_24h numeric := 0;

  -- Estimate approval signals (30d)
  v_est_sent_30d int := 0;
  v_est_approved_30d int := 0;
  v_est_approval_rate_30d numeric := 0;

  -- Activity (last seen)
  v_workspace_id uuid := null;
  v_last_activity_at timestamptz := null;

  -- Payment
  v_sub_status text := null;
  v_sub_updated_at timestamptz := null;
  v_payment_past_due boolean := false;

  -- Follow-up paused
  v_followups_paused boolean := false;

  -- Derived
  v_no_activity_7d boolean := false;
  v_send_failures_over_5pct boolean := false;
  v_followups_paused_no_activity boolean := false;

  v_status text := 'healthy';
  v_reasons jsonb := jsonb_build_object('signals', jsonb_build_object(), 'reasons', '[]'::jsonb, 'flags', jsonb_build_object());
  v_reason_arr jsonb := '[]'::jsonb;
begin
  -- Resolve workspace_id (best-effort)
  begin
    select workspace_id into v_workspace_id
    from public.roofing_companies
    where id = p_company_id;
  exception when others then
    v_workspace_id := null;
  end;

  -- Email send success/failure (24h) from delivery_logs if available
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='delivery_logs') then
    select
      count(*) filter (where status = 'sent' and created_at >= v_now - interval '24 hours')::int,
      count(*) filter (where status = 'failed' and created_at >= v_now - interval '24 hours')::int
    into v_sent_24h, v_failed_24h
    from public.delivery_logs
    where company_id = p_company_id;
  end if;

  v_total_24h := v_sent_24h + v_failed_24h;
  v_failure_rate_24h := case when v_total_24h > 0 then (v_failed_24h::numeric / v_total_24h::numeric) else 0 end;
  v_success_rate_24h := case when v_total_24h > 0 then (v_sent_24h::numeric / v_total_24h::numeric) else 0 end;

  v_send_failures_over_5pct := (v_failure_rate_24h > 0.05 and v_total_24h > 0);

  -- Follow-ups paused: estimates followup_status has paused (best-effort)
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='estimates')
     and exists (select 1 from information_schema.columns where table_schema='public' and table_name='estimates' and column_name='followup_status')
     and exists (select 1 from information_schema.columns where table_schema='public' and table_name='estimates' and column_name='company_id') then
    execute $q$
      select exists(
        select 1
        from public.estimates e
        where e.company_id = $1
          and e.sent_at is not null
          and (e.approved_at is null)
          and e.followup_status = 'paused'
      )
    $q$
    into v_followups_paused
    using p_company_id;

    -- Follow-up due count (24h): active + due window
    execute $q$
      select count(*)::int
      from public.estimates e
      where e.company_id = $1
        and e.followup_status = 'active'
        and e.next_followup_at is not null
        and e.next_followup_at <= now()
        and e.next_followup_at >= now() - interval '24 hours'
    $q$
    into v_followups_due_24h
    using p_company_id;
  end if;

  -- Follow-up sent count (24h) from followups table (Block 269000) if available
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='followups')
     and exists (select 1 from information_schema.columns where table_schema='public' and table_name='followups' and column_name='sent_at') then
    execute $q$
      select count(*)::int
      from public.followups f
      join public.estimates e on e.id = f.estimate_id
      where e.company_id = $1
        and f.sent_at is not null
        and f.sent_at >= now() - interval '24 hours'
    $q$
    into v_followups_sent_24h
    using p_company_id;
  end if;

  v_followup_exec_rate_24h := case
    when v_followups_due_24h > 0 then least(1, v_followups_sent_24h::numeric / v_followups_due_24h::numeric)
    else 1
  end;

  -- Estimate approval rate (30d)
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='estimates')
     and exists (select 1 from information_schema.columns where table_schema='public' and table_name='estimates' and column_name='sent_at')
     and exists (select 1 from information_schema.columns where table_schema='public' and table_name='estimates' and column_name='approved_at')
     and exists (select 1 from information_schema.columns where table_schema='public' and table_name='estimates' and column_name='company_id') then
    execute $q$
      select
        count(*) filter (where sent_at is not null and sent_at >= now() - interval '30 days')::int,
        count(*) filter (where approved_at is not null and approved_at >= now() - interval '30 days')::int
      from public.estimates
      where company_id = $1
    $q$
    into v_est_sent_30d, v_est_approved_30d
    using p_company_id;
  end if;

  v_est_approval_rate_30d := case when v_est_sent_30d > 0 then (v_est_approved_30d::numeric / v_est_sent_30d::numeric) else 0 end;

  -- Activity: last activity (prefer workspace_activity, fallback workspace_activity_log)
  if v_workspace_id is not null then
    if exists (select 1 from information_schema.tables where table_schema='public' and table_name='workspace_activity') then
      begin
        execute $q$
          select max(created_at)
          from public.workspace_activity
          where workspace_id = $1
        $q$
        into v_last_activity_at
        using v_workspace_id;
      exception when others then
        v_last_activity_at := null;
      end;
    elsif exists (select 1 from information_schema.tables where table_schema='public' and table_name='workspace_activity_log') then
      begin
        execute $q$
          select max(created_at)
          from public.workspace_activity_log
          where workspace_id = $1
        $q$
        into v_last_activity_at
        using v_workspace_id;
      exception when others then
        v_last_activity_at := null;
      end;
    end if;
  end if;

  v_no_activity_7d := (v_last_activity_at is null or v_last_activity_at < (v_now - interval '7 days'));

  -- Payment status drift / past_due (company_subscriptions)
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='company_subscriptions') then
    begin
      select status, updated_at
      into v_sub_status, v_sub_updated_at
      from public.company_subscriptions
      where company_id = p_company_id;
    exception when others then
      v_sub_status := null;
      v_sub_updated_at := null;
    end;
  end if;

  v_payment_past_due := (v_sub_status = 'past_due');
  v_followups_paused_no_activity := (v_followups_paused and v_no_activity_7d);

  -- Status classification (system rules)
  if v_payment_past_due then
    v_status := 'critical';
  elsif v_followups_paused_no_activity then
    v_status := 'critical';
  elsif v_send_failures_over_5pct then
    v_status := 'at_risk';
  elsif v_no_activity_7d then
    v_status := 'at_risk';
  else
    v_status := 'healthy';
  end if;

  -- Reasons array in severity order
  if v_payment_past_due then
    v_reason_arr := v_reason_arr || jsonb_build_array(jsonb_build_object(
      'key','payment_past_due',
      'label','Payment status: past_due',
      'severity','critical',
      'value',coalesce(v_sub_status,'past_due')
    ));
  end if;

  if v_followups_paused_no_activity then
    v_reason_arr := v_reason_arr || jsonb_build_array(jsonb_build_object(
      'key','followups_paused_no_activity',
      'label','Follow-ups paused + no activity (7d)',
      'severity','critical',
      'value', true
    ));
  end if;

  if v_send_failures_over_5pct then
    v_reason_arr := v_reason_arr || jsonb_build_array(jsonb_build_object(
      'key','send_failures_over_5pct',
      'label','Send failures > 5% (last 24h)',
      'severity','at_risk',
      'value', round(v_failure_rate_24h * 100, 2)
    ));
  end if;

  if v_no_activity_7d then
    v_reason_arr := v_reason_arr || jsonb_build_array(jsonb_build_object(
      'key','no_activity_7d',
      'label','No dashboard activity in 7 days',
      'severity','at_risk',
      'value', coalesce(to_char(v_last_activity_at,'YYYY-MM-DD"T"HH24:MI:SSOF'), null)
    ));
  end if;

  -- Always attach signals (locked)
  v_reasons := jsonb_build_object(
    'signals', jsonb_build_object(
      'email_send_success_rate_24h', round(v_success_rate_24h * 100, 2),
      'email_send_failure_rate_24h', round(v_failure_rate_24h * 100, 2),
      'email_sent_24h', v_sent_24h,
      'email_failed_24h', v_failed_24h,
      'followup_execution_rate_24h', round(v_followup_exec_rate_24h * 100, 2),
      'followups_due_24h', v_followups_due_24h,
      'followups_sent_24h', v_followups_sent_24h,
      'estimate_approval_rate_30d', round(v_est_approval_rate_30d * 100, 2),
      'estimates_sent_30d', v_est_sent_30d,
      'estimates_approved_30d', v_est_approved_30d,
      'last_activity_at', v_last_activity_at,
      'subscription_status', v_sub_status,
      'subscription_updated_at', v_sub_updated_at,
      'followups_paused', v_followups_paused
    ),
    'reasons', v_reason_arr,
    'flags', jsonb_build_object(
      'watch_closely', (v_status = 'at_risk'),
      'admin_banner', case when v_status = 'critical' then 'Immediate attention needed' else null end
    )
  );

  if p_persist then
    insert into public.performance_health(company_id, status, reasons, computed_at)
    values (p_company_id, v_status, v_reasons, v_now)
    on conflict (company_id) do update set
      status = excluded.status,
      reasons = excluded.reasons,
      computed_at = excluded.computed_at;

    -- Auto-protect: only when Critical AND delivery is one of the reasons
    if v_status = 'critical' and v_send_failures_over_5pct then
      if exists (select 1 from information_schema.tables where table_schema='public' and table_name='company_sending_state')
         and exists (select 1 from information_schema.routines where routine_schema='public' and routine_name='pause_company_sending') then
        -- Only pause if not already paused
        if not exists (
          select 1 from public.company_sending_state s
          where s.company_id = p_company_id and coalesce(s.paused,false) = true
        ) then
          perform public.pause_company_sending(
            p_company_id,
            'performance_monitor_delivery',
            'Messages are temporarily paused to protect delivery.'
          );

          insert into public.performance_protection_events(company_id, event_type, details)
          values (
            p_company_id,
            'auto_pause_delivery',
            jsonb_build_object(
              'message','Messages are temporarily paused to protect delivery.',
              'failure_rate_24h_pct', round(v_failure_rate_24h * 100, 2),
              'sent_24h', v_sent_24h,
              'failed_24h', v_failed_24h,
              'computed_at', v_now
            )
          );
        end if;
      end if;
    end if;
  end if;

  return query
    select p_company_id, v_status, v_now, v_reasons;
end;
$$;

grant execute on function public.compute_performance_health(uuid, boolean) to service_role;

comment on function public.compute_performance_health(uuid, boolean) is
  'Block 288000: Compute silent performance health (healthy/at_risk/critical) with locked signals + reasons; optionally persists and triggers auto-protect.';

-- ============================================================================
-- 6) Daily job: compute_performance_health_daily() + trend snapshot
-- ============================================================================
create or replace function public.compute_performance_health_daily()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company record;
  v_total int := 0;
  v_healthy int := 0;
  v_at_risk int := 0;
  v_critical int := 0;
  v_day date := current_date;
  v_pct_healthy numeric(6,3) := 0;
  v_pct_at_risk numeric(6,3) := 0;
  v_pct_critical numeric(6,3) := 0;
  v_row record;
begin
  for v_company in
    select id from public.roofing_companies where is_active = true
  loop
    select * into v_row
    from public.compute_performance_health(v_company.id, true)
    limit 1;

    v_total := v_total + 1;
    if v_row.status = 'healthy' then v_healthy := v_healthy + 1; end if;
    if v_row.status = 'at_risk' then v_at_risk := v_at_risk + 1; end if;
    if v_row.status = 'critical' then v_critical := v_critical + 1; end if;
  end loop;

  if v_total > 0 then
    v_pct_healthy := round((v_healthy::numeric / v_total::numeric) * 100, 3);
    v_pct_at_risk := round((v_at_risk::numeric / v_total::numeric) * 100, 3);
    v_pct_critical := round((v_critical::numeric / v_total::numeric) * 100, 3);
  end if;

  insert into public.performance_health_trend_daily(
    day, total_count, healthy_count, at_risk_count, critical_count,
    healthy_pct, at_risk_pct, critical_pct, computed_at
  )
  values (
    v_day, v_total, v_healthy, v_at_risk, v_critical,
    v_pct_healthy, v_pct_at_risk, v_pct_critical, now()
  )
  on conflict (day) do update set
    total_count = excluded.total_count,
    healthy_count = excluded.healthy_count,
    at_risk_count = excluded.at_risk_count,
    critical_count = excluded.critical_count,
    healthy_pct = excluded.healthy_pct,
    at_risk_pct = excluded.at_risk_pct,
    critical_pct = excluded.critical_pct,
    computed_at = excluded.computed_at;

  return v_total;
end;
$$;

grant execute on function public.compute_performance_health_daily() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('performance-health-daily');
    perform cron.schedule(
      'performance-health-daily',
      '15 0 * * *', -- daily @ 00:15
      $$
      select public.compute_performance_health_daily();
      $$
    );
  end if;
exception when others then
  -- don't hard fail migration if cron isn't available in this environment
  null;
end $$;









