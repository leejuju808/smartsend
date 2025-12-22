-- BLOCK 272600 — SmartSend Point-of-No-Return Sprint
-- "If it didn’t start here, it doesn’t count."
--
-- Goal:
-- - Make SmartSend the dependable input by origin-gating revenue/pipeline/forecasting.
-- - Only SmartSend-origin jobs are counted in "business health" metrics.
--
-- Implementation:
-- - Add `origin_source` to `public.roofing_jobs` (nullable, constrained to 'smartsend')
-- - Lock origin once it becomes 'smartsend' (irreversible)
-- - Auto-stamp origin for jobs created from SmartSend leads/campaigns
-- - Backfill origin where we can prove SmartSend provenance
-- - Update `calculate_revenue_forecast` to count only SmartSend-origin jobs when available

-- ------------------------------------------------------------
-- 1) Add origin fields to roofing_jobs (schema-drift safe)
-- ------------------------------------------------------------
alter table public.roofing_jobs
  add column if not exists origin_source text,
  add column if not exists origin_set_at timestamptz;

comment on column public.roofing_jobs.origin_source is
  'Block 272600: Provenance stamp. Only origin_source=smartsend jobs count toward SmartSend performance/forecasting.';
comment on column public.roofing_jobs.origin_set_at is
  'Block 272600: Timestamp when origin_source was first set (internal, irreversible when smartsend).';

do $$
begin
  -- Tight by design: we only track SmartSend as an explicit counted origin.
  alter table public.roofing_jobs
    drop constraint if exists roofing_jobs_origin_source_check;
  alter table public.roofing_jobs
    add constraint roofing_jobs_origin_source_check
    check (origin_source is null or origin_source in ('smartsend'));
exception when others then
  -- Some envs may not allow constraint changes; fail-open but keep column.
  null;
end $$;

create index if not exists idx_roofing_jobs_origin_source
  on public.roofing_jobs(origin_source)
  where origin_source is not null;

-- ------------------------------------------------------------
-- 2) Lock origin_source once set to SmartSend
-- ------------------------------------------------------------
create or replace function public.ss_roofing_jobs_lock_origin_source()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Set origin_set_at when origin becomes SmartSend.
  if new.origin_source = 'smartsend'
     and new.origin_set_at is null
     and (tg_op = 'INSERT' or old.origin_source is distinct from 'smartsend') then
    new.origin_set_at := now();
  end if;

  -- Irreversible: once SmartSend, always SmartSend.
  if tg_op = 'UPDATE'
     and old.origin_source = 'smartsend'
     and new.origin_source is distinct from 'smartsend' then
    raise exception 'roofing_jobs.origin_source cannot be changed once set to smartsend';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ss_roofing_jobs_lock_origin_source on public.roofing_jobs;
create trigger trg_ss_roofing_jobs_lock_origin_source
  before insert or update of origin_source on public.roofing_jobs
  for each row
  execute function public.ss_roofing_jobs_lock_origin_source();

comment on function public.ss_roofing_jobs_lock_origin_source() is
  'Block 272600: Locks roofing_jobs.origin_source once set to smartsend and stamps origin_set_at.';

-- ------------------------------------------------------------
-- 3) Auto-stamp origin for SmartSend-created jobs via lead provenance
-- ------------------------------------------------------------
create or replace function public.ss_roofing_jobs_auto_set_origin_source()
returns trigger
language plpgsql
security definer
as $$
declare
  v_is_smartsend boolean := false;
begin
  -- If caller already set it, keep it.
  if new.origin_source is not null then
    return new;
  end if;

  -- Best-effort: only infer origin when we can prove it from the lead.
  if new.lead_id is null then
    return new;
  end if;

  select exists (
    select 1
    from public.leads l
    left join public.roofing_lead_sources ls on ls.id = l.lead_source_id
    where l.id = new.lead_id
      and (
        -- Any SmartSend campaign lead is SmartSend origin.
        l.campaign_id is not null
        -- Lead sources table may classify SmartSend acquisition.
        or ls.channel_type = 'smartsend'
      )
  ) into v_is_smartsend;

  if v_is_smartsend then
    new.origin_source := 'smartsend';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ss_roofing_jobs_auto_set_origin_source on public.roofing_jobs;
create trigger trg_ss_roofing_jobs_auto_set_origin_source
  before insert on public.roofing_jobs
  for each row
  execute function public.ss_roofing_jobs_auto_set_origin_source();

comment on function public.ss_roofing_jobs_auto_set_origin_source() is
  'Block 272600: Auto-stamps roofing_jobs.origin_source=smartsend when the job is provably created from SmartSend lead/campaign.';

-- ------------------------------------------------------------
-- 4) Backfill origin_source where provable
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'roofing_jobs'
      and column_name = 'origin_source'
  ) then
    return;
  end if;

  -- Backfill from leads provenance.
  update public.roofing_jobs rj
  set
    origin_source = 'smartsend',
    origin_set_at = coalesce(rj.origin_set_at, now())
  from public.leads l
  left join public.roofing_lead_sources ls on ls.id = l.lead_source_id
  where rj.lead_id = l.id
    and rj.origin_source is null
    and (
      l.campaign_id is not null
      or ls.channel_type = 'smartsend'
    );
exception when others then
  -- If roofing_lead_sources or campaign_id doesn't exist in this env, skip.
  null;
end $$;

-- ------------------------------------------------------------
-- 5) Enforce origin-gated forecasting (calculate_revenue_forecast)
-- ------------------------------------------------------------
create or replace function public.calculate_revenue_forecast(
  p_workspace_id UUID,
  p_forecast_month DATE DEFAULT DATE_TRUNC('month', NOW())::DATE
)
returns JSONB
language plpgsql
security definer
as $$
declare
  v_jobs_completed_count integer := 0;
  v_jobs_completed_value numeric(12, 2) := 0;
  v_jobs_scheduled_count integer := 0;
  v_jobs_scheduled_value numeric(12, 2) := 0;
  v_pending_approvals_count integer := 0;
  v_pending_approvals_value numeric(12, 2) := 0;
  v_avg_close_rate numeric(5, 2);
  v_pipeline_volume integer;
  v_expected_revenue numeric(12, 2);
  v_projected_revenue numeric(12, 2);
  v_has_origin_source boolean := false;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'roofing_jobs'
      and column_name = 'origin_source'
  ) into v_has_origin_source;

  -- Current month revenue (completed jobs)
  if v_has_origin_source then
    select count(*), coalesce(sum(projected_job_value), 0)
    into v_jobs_completed_count, v_jobs_completed_value
    from public.roofing_jobs
    where workspace_id = p_workspace_id
      and origin_source = 'smartsend'
      and current_stage = 'COMPLETED'
      and date_trunc('month', updated_at) = date_trunc('month', p_forecast_month);
  else
    select count(*), coalesce(sum(projected_job_value), 0)
    into v_jobs_completed_count, v_jobs_completed_value
    from public.roofing_jobs
    where workspace_id = p_workspace_id
      and current_stage = 'COMPLETED'
      and date_trunc('month', updated_at) = date_trunc('month', p_forecast_month);
  end if;

  -- Jobs scheduled for this month
  if v_has_origin_source then
    select count(*), coalesce(sum(projected_job_value), 0)
    into v_jobs_scheduled_count, v_jobs_scheduled_value
    from public.roofing_jobs
    where workspace_id = p_workspace_id
      and origin_source = 'smartsend'
      and current_stage = 'SCHEDULED_INSTALL'
      and date_trunc('month', stage_changed_at) = date_trunc('month', p_forecast_month);
  else
    select count(*), coalesce(sum(projected_job_value), 0)
    into v_jobs_scheduled_count, v_jobs_scheduled_value
    from public.roofing_jobs
    where workspace_id = p_workspace_id
      and current_stage = 'SCHEDULED_INSTALL'
      and date_trunc('month', stage_changed_at) = date_trunc('month', p_forecast_month);
  end if;

  -- Pending approvals
  if v_has_origin_source then
    select count(*), coalesce(sum(projected_job_value), 0)
    into v_pending_approvals_count, v_pending_approvals_value
    from public.roofing_jobs
    where workspace_id = p_workspace_id
      and origin_source = 'smartsend'
      and current_stage = 'CLAIM_PENDING';
  else
    select count(*), coalesce(sum(projected_job_value), 0)
    into v_pending_approvals_count, v_pending_approvals_value
    from public.roofing_jobs
    where workspace_id = p_workspace_id
      and current_stage = 'CLAIM_PENDING';
  end if;

  -- Average close rate (historical, last 6 months)
  -- Point-of-no-return rule: only SmartSend-origin leads/jobs count when lead sources exist.
  begin
    select
      case
        when count(*) > 0 then (count(*) filter (where lc.converted_to_job = true)::numeric / count(*) * 100)
        else 0
      end
    into v_avg_close_rate
    from public.leads l
    left join public.lead_conversions lc on l.id = lc.lead_id
    left join public.roofing_lead_sources ls on ls.id = l.lead_source_id
    where l.workspace_id = p_workspace_id
      and l.created_at >= now() - interval '6 months'
      and (
        l.campaign_id is not null
        or ls.channel_type = 'smartsend'
      );
  exception when others then
    -- If roofing_lead_sources/lead_source_id/campaign_id isn't available, fall back.
    select
      case
        when count(*) > 0 then (count(*) filter (where lc.converted_to_job = true)::numeric / count(*) * 100)
        else 0
      end
    into v_avg_close_rate
    from public.leads l
    left join public.lead_conversions lc on l.id = lc.lead_id
    where l.workspace_id = p_workspace_id
      and l.created_at >= now() - interval '6 months';
  end;

  -- Pipeline volume
  if v_has_origin_source then
    select count(*)
    into v_pipeline_volume
    from public.roofing_jobs
    where workspace_id = p_workspace_id
      and origin_source = 'smartsend'
      and current_stage in ('CLAIM_PENDING', 'CLAIM_APPROVED', 'INSTALL_READY');
  else
    select count(*)
    into v_pipeline_volume
    from public.roofing_jobs
    where workspace_id = p_workspace_id
      and current_stage in ('CLAIM_PENDING', 'CLAIM_APPROVED', 'INSTALL_READY');
  end if;

  -- Expected revenue = completed + scheduled + (pending * close_rate)
  v_expected_revenue := v_jobs_completed_value + v_jobs_scheduled_value +
    (v_pending_approvals_value * coalesce(v_avg_close_rate, 50) / 100);

  -- Projected revenue (seasonality factor placeholder)
  v_projected_revenue := v_expected_revenue * 1.0;

  return jsonb_build_object(
    'current_month_revenue', v_jobs_completed_value,
    'pending_approvals_count', v_pending_approvals_count,
    'pending_approvals_value', v_pending_approvals_value,
    'jobs_scheduled_count', v_jobs_scheduled_count,
    'jobs_scheduled_value', v_jobs_scheduled_value,
    'jobs_completed_count', v_jobs_completed_count,
    'jobs_completed_value', v_jobs_completed_value,
    'expected_revenue', v_expected_revenue,
    'projected_revenue', v_projected_revenue,
    'avg_close_rate', v_avg_close_rate,
    'pipeline_volume', v_pipeline_volume,
    'origin_gate', case when v_has_origin_source then 'smartsend_only' else 'unavailable' end
  );
end;
$$;

comment on function public.calculate_revenue_forecast(uuid, date) is
  'Block 272600: Revenue forecast is origin-gated. When roofing_jobs.origin_source exists, only origin_source=smartsend jobs count.';



