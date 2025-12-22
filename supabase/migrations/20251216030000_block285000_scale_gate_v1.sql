-- ============================================================
-- BLOCK 285000 — SmartSend Scale Gate v1
-- “Earn the Right to Scale.”
--
-- Prevent premature scaling. No overrides.
-- Computes a Scale Readiness Score (0–100) per company, derives tier:
--   <60  -> locked
--   60-79 -> limited
--   80+ -> unlocked
--
-- Enforces tier-based outreach caps in lock_send_queue_batch_v2:
--   locked  -> 25/day
--   limited -> 50/day
--   unlocked -> unlimited + priority
--
-- Auto-block rules (immediate, no grace):
--   - delivery failure rate > 10% (24h)
--   - duplicate prevention spike (duplicate_prevented >= 10 in 24h)
--   - payment status = past_due
--
-- ============================================================

-- ============================================================================
-- 1) TABLE: scale_metrics (daily snapshots)
-- ============================================================================
create table if not exists public.scale_metrics (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.roofing_companies(id) on delete cascade,
  scale_score int not null check (scale_score >= 0 and scale_score <= 100),
  tier text not null check (tier in ('locked','limited','unlocked')),
  computed_at timestamptz not null default now()
);

create index if not exists idx_scale_metrics_company_computed
  on public.scale_metrics(company_id, computed_at desc);

comment on table public.scale_metrics is
  'Block 285000: Daily scale readiness snapshots per company (score 0-100 + tier).';

alter table public.scale_metrics enable row level security;

-- service_role full access
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='scale_metrics' and policyname='scale_metrics_service_role_all'
  ) then
    create policy scale_metrics_service_role_all
      on public.scale_metrics
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end $$;

-- authenticated read: members of the company
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='scale_metrics' and policyname='scale_metrics_select_company_members'
  ) then
    create policy scale_metrics_select_company_members
      on public.scale_metrics
      for select
      to authenticated
      using (public.is_company_member(company_id));
  end if;
end $$;

grant select on public.scale_metrics to authenticated;
grant all on public.scale_metrics to service_role;

-- Latest per company (for fast joins)
create or replace view public.scale_metrics_latest as
select distinct on (company_id)
  company_id,
  scale_score,
  tier,
  computed_at
from public.scale_metrics
order by company_id, computed_at desc;

grant select on public.scale_metrics_latest to authenticated;

comment on view public.scale_metrics_latest is
  'Block 285000: Latest scale score + tier per company.';

-- ============================================================================
-- 2) RPC: compute_scale_readiness(company_id)
--    Returns score + tier + factor breakdown + top blockers.
--    Optionally persists to scale_metrics (default true).
-- ============================================================================
create or replace function public.compute_scale_readiness(
  p_company_id uuid,
  p_persist boolean default true
)
returns table (
  company_id uuid,
  scale_score int,
  tier text,
  computed_at timestamptz,
  factors jsonb,
  blockers jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();

  -- Component scores (0-100)
  v_delivery_success numeric := 0;
  v_estimates_ratio numeric := 0;
  v_followups_active numeric := 0;
  v_payment_score numeric := 0;
  v_system_errors_score numeric := 100;

  -- Raw signals
  v_sent_7d int := 0;
  v_failed_7d int := 0;
  v_failed_24h int := 0;
  v_sent_24h int := 0;
  v_dup_24h int := 0;
  v_system_errors_7d int := 0;

  v_est_sent_30d int := 0;
  v_est_approved_30d int := 0;
  v_est_eligible_30d int := 0;
  v_est_followups_active_30d int := 0;

  v_sub_status text := null;
  v_payment_past_due boolean := false;

  -- Computed
  v_score int := 0;
  v_tier text := 'locked';

  -- Auto-blocks
  v_failure_rate_24h numeric := 1;
  v_auto_locked boolean := false;

  v_factor_rows jsonb := '[]'::jsonb;
  v_blockers jsonb := '[]'::jsonb;
begin
  -- Basic access control: must be a member (or service role path)
  if auth.uid() is not null then
    if not public.is_company_member(p_company_id) then
      raise exception 'forbidden';
    end if;
  end if;

  -- Delivery stats (7d + 24h) from Reliability Guardrails delivery_logs
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='delivery_logs') then
    select
      count(*) filter (where status = 'sent' and created_at >= v_now - interval '7 days')::int,
      count(*) filter (where status = 'failed' and created_at >= v_now - interval '7 days')::int,
      count(*) filter (where status = 'sent' and created_at >= v_now - interval '24 hours')::int,
      count(*) filter (where status = 'failed' and created_at >= v_now - interval '24 hours')::int,
      count(*) filter (where status = 'duplicate_prevented' and created_at >= v_now - interval '24 hours')::int,
      count(*) filter (where status = 'failed' and created_at >= v_now - interval '7 days')::int
    into
      v_sent_7d, v_failed_7d, v_sent_24h, v_failed_24h, v_dup_24h, v_system_errors_7d
    from public.delivery_logs
    where company_id = p_company_id;

    v_delivery_success := case
      when (v_sent_7d + v_failed_7d) > 0 then round((v_sent_7d::numeric / nullif((v_sent_7d + v_failed_7d)::numeric, 0)) * 100, 2)
      else 0
    end;

    v_failure_rate_24h := case
      when (v_sent_24h + v_failed_24h) > 0 then (v_failed_24h::numeric / nullif((v_sent_24h + v_failed_24h)::numeric, 0))
      else 1
    end;

    -- 0 errors => 100, 10+ errors => 0 (linear)
    v_system_errors_score := greatest(0, 100 - least(100, v_system_errors_7d * 10));
  end if;

  -- Estimates approved/sent (30d) + followups active rate (30d)
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='estimates')
     and exists (select 1 from information_schema.columns where table_schema='public' and table_name='estimates' and column_name='company_id') then

    execute $q$
      select
        count(*) filter (where sent_at is not null and sent_at >= now() - interval '30 days')::int as sent_30d,
        count(*) filter (where approved_at is not null and approved_at >= now() - interval '30 days')::int as approved_30d,
        count(*) filter (where sent_at is not null and sent_at >= now() - interval '30 days')::int as eligible_30d,
        count(*) filter (where sent_at is not null and sent_at >= now() - interval '30 days' and followup_status = 'active')::int as followups_active_30d
      from public.estimates
      where company_id = $1
    $q$
    into v_est_sent_30d, v_est_approved_30d, v_est_eligible_30d, v_est_followups_active_30d
    using p_company_id;

    v_estimates_ratio := case
      when v_est_sent_30d > 0 then round((v_est_approved_30d::numeric / nullif(v_est_sent_30d::numeric, 0)) * 100, 2)
      else 0
    end;

    v_followups_active := case
      when v_est_eligible_30d > 0 then round((v_est_followups_active_30d::numeric / nullif(v_est_eligible_30d::numeric, 0)) * 100, 2)
      else 0
    end;
  end if;

  -- Payment status (company_subscriptions)
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='company_subscriptions') then
    select status into v_sub_status
    from public.company_subscriptions
    where company_id = p_company_id;

    v_payment_score := case
      when v_sub_status = 'active' then 100
      when v_sub_status = 'trial' then 70
      when v_sub_status = 'past_due' then 0
      when v_sub_status = 'canceled' then 0
      else 0
    end;

    v_payment_past_due := (v_sub_status = 'past_due');
  end if;

  -- Weighted score (0-100)
  v_score := greatest(
    0,
    least(
      100,
      round(
        (v_delivery_success * 0.30)
        + (v_estimates_ratio * 0.25)
        + (v_followups_active * 0.15)
        + (v_payment_score * 0.20)
        + (v_system_errors_score * 0.10)
      )::int
    )
  );

  -- Tier by score
  v_tier := case
    when v_score < 60 then 'locked'
    when v_score < 80 then 'limited'
    else 'unlocked'
  end;

  -- Auto-block rules (immediate)
  if v_failure_rate_24h > 0.10 then
    v_auto_locked := true;
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'key','delivery_failure_rate',
      'label','Delivery failure rate > 10% (last 24h)',
      'value', round(v_failure_rate_24h * 100, 2)
    ));
  end if;

  if v_dup_24h >= 10 then
    v_auto_locked := true;
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'key','duplicate_spike',
      'label','Duplicate prevention spike (last 24h)',
      'value', v_dup_24h
    ));
  end if;

  if v_payment_past_due then
    v_auto_locked := true;
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'key','payment_past_due',
      'label','Payment status: past_due',
      'value', v_sub_status
    ));
  end if;

  if v_auto_locked then
    v_tier := 'locked';
  end if;

  -- Factor rows (for UI + top-2 blockers selection when no auto-blocks)
  v_factor_rows := jsonb_build_array(
    jsonb_build_object('key','delivery_success_rate','label','Delivery success rate','score',v_delivery_success,'weight',0.30),
    jsonb_build_object('key','estimates_approved_ratio','label','Estimates approved / sent','score',v_estimates_ratio,'weight',0.25),
    jsonb_build_object('key','followups_active_rate','label','Follow-ups active rate','score',v_followups_active,'weight',0.15),
    jsonb_build_object('key','payment_status','label','Payment status','score',v_payment_score,'weight',0.20),
    jsonb_build_object('key','system_errors_7d','label','System errors last 7 days','score',v_system_errors_score,'weight',0.10)
  );

  -- If no auto-block reasons, take lowest 2 factor scores as blockers
  if jsonb_array_length(v_blockers) = 0 then
    select coalesce(jsonb_agg(x.obj order by (x.obj->>'score')::numeric asc), '[]'::jsonb)
    into v_blockers
    from (
      select elem as obj
      from jsonb_array_elements(v_factor_rows) elem
      order by (elem->>'score')::numeric asc
      limit 2
    ) x;
  else
    -- Otherwise show top 2 auto-blocks (already ordered by insertion)
    select coalesce(jsonb_agg(elem), '[]'::jsonb)
    into v_blockers
    from (
      select elem
      from jsonb_array_elements(v_blockers) elem
      limit 2
    ) t;
  end if;

  if p_persist then
    insert into public.scale_metrics(company_id, scale_score, tier, computed_at)
    values (p_company_id, v_score, v_tier, v_now);
  end if;

  return query
    select
      p_company_id as company_id,
      v_score as scale_score,
      v_tier as tier,
      v_now as computed_at,
      v_factor_rows as factors,
      v_blockers as blockers;
end;
$$;

grant execute on function public.compute_scale_readiness(uuid, boolean) to authenticated, service_role;

comment on function public.compute_scale_readiness(uuid, boolean) is
  'Block 285000: Compute scale score+tier and return factor breakdown + top blockers. Optionally persists snapshot.';

-- ============================================================================
-- 3) Daily compute job (pg_cron if available)
-- ============================================================================
create or replace function public.compute_scale_metrics_daily()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
  v_company record;
begin
  for v_company in
    select id from public.roofing_companies where is_active = true
  loop
    perform public.compute_scale_readiness(v_company.id, true);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

grant execute on function public.compute_scale_metrics_daily() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('scale-metrics-daily');
    perform cron.schedule(
      'scale-metrics-daily',
      '10 0 * * *', -- daily @ 00:10
      $$
      select public.compute_scale_metrics_daily();
      $$
    );
  end if;
exception when others then
  -- don't hard fail migration if cron isn't available in this environment
  null;
end $$;

-- ============================================================================
-- 4) Enforce scale tiers in outbound send dequeue (campaign_send_queue)
--    Patch lock_send_queue_batch_v2 (used by supabase/functions/process-send-queue)
-- ============================================================================
-- NOTE: This enforces only outreach volume for campaign sends.
-- It intentionally does not change plan limits; it is a hard safety gate.

create or replace function public.lock_send_queue_batch_v2(
  p_worker_id uuid,
  p_limit integer default 25,
  p_workspace_id uuid default null
)
returns setof public.campaign_send_queue
language plpgsql
as $$
declare
  v_domain_health numeric(5,2);
  v_warmup_active boolean;
  v_warmup_stage integer;
  v_max_send_rate integer;
  v_sent_today integer;
  v_warmup_limit integer;
begin
  -- Warmup settings (per-workspace) if p_workspace_id provided
  if p_workspace_id is not null then
    select
      cs.domain_health_score,
      cs.warmup_active,
      cs.warmup_stage,
      cs.max_send_rate,
      (select count(*) from public.campaign_send_queue
       where workspace_id = p_workspace_id
         and status = 'sent'
         and sent_at::date = current_date)
    into v_domain_health, v_warmup_active, v_warmup_stage, v_max_send_rate, v_sent_today
    from public.company_settings cs
    where cs.workspace_id = p_workspace_id;
  end if;

  if v_warmup_active and v_warmup_stage > 0 and v_warmup_stage <= 8 then
    v_warmup_limit := case v_warmup_stage
      when 1 then 20
      when 2 then 30
      when 3 then 40
      when 4 then 50
      when 5 then 75
      when 6 then 100
      when 7 then 150
      else null
    end;
  end if;

  return query
  with
  -- Workspace -> company mapping (best-effort; only companies with workspace_id)
  company_map as (
    select rc.id as company_id, rc.workspace_id
    from public.roofing_companies rc
    where rc.workspace_id is not null
      and rc.is_active = true
  ),
  -- Latest tier snapshot (if missing, default locked)
  latest as (
    select sml.company_id, sml.tier, sml.scale_score
    from public.scale_metrics_latest sml
  ),
  -- Live auto-block signals (24h) + payment status
  dl_24h as (
    select
      d.company_id,
      count(*) filter (where d.status = 'sent' and d.created_at >= now() - interval '24 hours')::int as sent_24h,
      count(*) filter (where d.status = 'failed' and d.created_at >= now() - interval '24 hours')::int as failed_24h,
      count(*) filter (where d.status = 'duplicate_prevented' and d.created_at >= now() - interval '24 hours')::int as dup_24h
    from public.delivery_logs d
    where d.created_at >= now() - interval '24 hours'
    group by d.company_id
  ),
  subs as (
    select company_id, status
    from public.company_subscriptions
  ),
  effective as (
    select
      cm.workspace_id,
      cm.company_id,
      coalesce(lat.tier, 'locked') as snapshot_tier,
      coalesce(dl.sent_24h, 0) as sent_24h,
      coalesce(dl.failed_24h, 0) as failed_24h,
      coalesce(dl.dup_24h, 0) as dup_24h,
      (subs.status = 'past_due') as payment_past_due,
      case
        when (subs.status = 'past_due') then 'locked'
        when (coalesce(dl.sent_24h,0) + coalesce(dl.failed_24h,0)) > 0
             and (coalesce(dl.failed_24h,0)::numeric / nullif((coalesce(dl.sent_24h,0) + coalesce(dl.failed_24h,0))::numeric, 0)) > 0.10
          then 'locked'
        when coalesce(dl.dup_24h,0) >= 10 then 'locked'
        else coalesce(lat.tier, 'locked')
      end as tier_effective
    from company_map cm
    left join latest lat on lat.company_id = cm.company_id
    left join dl_24h dl on dl.company_id = cm.company_id
    left join subs on subs.company_id = cm.company_id
  ),
  sent_today_ws as (
    select workspace_id, count(*)::int as sent_today
    from public.campaign_send_queue
    where status = 'sent'
      and sent_at::date = current_date
    group by workspace_id
  ),
  limits as (
    select
      e.workspace_id,
      e.tier_effective,
      case e.tier_effective
        when 'locked' then 25
        when 'limited' then 50
        else 2147483647
      end as daily_cap,
      greatest(
        case e.tier_effective
          when 'locked' then 25
          when 'limited' then 50
          else 2147483647
        end - coalesce(st.sent_today, 0),
        0
      )::int as remaining,
      case e.tier_effective
        when 'unlocked' then 1
        when 'limited' then 2
        else 3
      end as tier_rank
    from effective e
    left join sent_today_ws st on st.workspace_id = e.workspace_id
  ),
  pick as (
    select id
    from (
      select
        q.id,
        q.workspace_id,
        q.priority,
        q.scheduled_at,
        q.created_at,
        l.remaining,
        l.tier_rank,
        row_number() over (
          partition by q.workspace_id
          order by q.priority asc, q.scheduled_at nulls first, q.created_at asc
        ) as rn
      from public.campaign_send_queue q
      left join limits l on l.workspace_id = q.workspace_id
      where q.status in ('pending', 'retry', 'queued', 'scheduled', 'throttled')
        and (q.scheduled_at is null or q.scheduled_at <= now())
        and (q.next_retry_at is null or q.next_retry_at <= now())
        and coalesce(q.attempts, 0) < coalesce(q.max_attempts, 3)
        and q.suppressed = false
        and (p_workspace_id is null or q.workspace_id = p_workspace_id)
        and (
          v_warmup_limit is null
          or v_sent_today < v_warmup_limit
        )
      for update skip locked
    ) ranked
    where (ranked.remaining is null) or (ranked.rn <= ranked.remaining)
    order by coalesce(ranked.tier_rank, 3) asc, ranked.priority asc, ranked.scheduled_at nulls first, ranked.created_at asc
    limit p_limit
  )
  update public.campaign_send_queue q
  set
    status = 'processing',
    locked_at = now(),
    worker_id = p_worker_id,
    attempts = coalesce(q.attempts, 0) + 1
  where q.id in (select id from pick)
  returning *;
end;
$$;

comment on function public.lock_send_queue_batch_v2(uuid, integer, uuid) is
  'Outbound Engine v2 dequeue + Block 285000 Scale Gate enforcement (locked=25/day, limited=50/day, unlocked=priority).';









