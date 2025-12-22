-- BLOCK 271900 — SmartSend Hard Ceiling Sprint
-- Demand ceiling indicator + demand vs fulfilled split + "add crew = add revenue" math.
--
-- Goal:
-- - Zero projections. No planning tools. Just mechanical math from existing ops data.
-- - Be schema-drift safe (older envs may be missing certain tables/columns).
--
-- This migration:
-- - Adds simple workspace levers (workdays per month, extended hours)
-- - Adds a single RPC to compute growth ceiling metrics for the active workspace
--
-- ---------------------------------------------------------------------------
-- 1) Workspace levers (mechanical, optional)
-- ---------------------------------------------------------------------------
alter table public.workspaces
  add column if not exists crew_workdays_per_month int not null default 22
    check (crew_workdays_per_month >= 1 and crew_workdays_per_month <= 31),
  add column if not exists crew_extended_hours boolean not null default false;

comment on column public.workspaces.crew_workdays_per_month is
  'Block 271900: Workdays per month used for capacity math (default 22).';
comment on column public.workspaces.crew_extended_hours is
  'Block 271900: If true, capacity math applies a modest hours multiplier (+20%).';

-- ---------------------------------------------------------------------------
-- 2) RPC: ss_growth_ceiling_metrics(workspace)
-- ---------------------------------------------------------------------------
create or replace function public.ss_growth_ceiling_metrics(p_workspace_id uuid)
returns table (
  workspace_id uuid,
  crew_count int,
  avg_job_duration_days numeric,
  avg_job_duration_source text,
  workdays_per_month int,
  extended_hours boolean,
  effective_workdays_per_month numeric,
  demand_generated_jobs_per_month numeric,
  demand_fulfilled_jobs_per_month numeric,
  avg_approved_job_value numeric,
  crew_capacity_jobs int,
  open_jobs bigint,
  capacity_jobs_per_month numeric,
  additional_jobs_per_month_per_crew numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workdays int := 22;
  v_extended boolean := false;
  v_effective_workdays numeric := 22;
  v_crew_count int := 0;
  v_avg_duration numeric := null;
  v_avg_duration_src text := 'default';
  v_booked_per_week numeric := 0;
  v_fulfilled_per_week numeric := 0;
  v_month_factor numeric := 4.345; -- weeks→month (365/12/7)
  v_avg_value numeric := 0;
  v_crew_capacity_jobs int := null;
  v_open_jobs bigint := 0;
  v_capacity_per_month numeric := 0;
  v_addl_per_crew numeric := 0;
  v_has_company boolean := false;
  v_sql text;
begin
  if p_workspace_id is null then
    return;
  end if;

  -- Workspace settings (optional)
  begin
    select
      coalesce(w.crew_workdays_per_month, 22),
      coalesce(w.crew_extended_hours, false),
      w.crew_capacity_jobs
    into v_workdays, v_extended, v_crew_capacity_jobs
    from public.workspaces w
    where w.id = p_workspace_id;
  exception when others then
    v_workdays := 22;
    v_extended := false;
    v_crew_capacity_jobs := null;
  end;

  v_effective_workdays := (v_workdays::numeric) * (case when v_extended then 1.2 else 1.0 end);

  -- Crew count (schema drift: is_active vs active vs is_active missing)
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'crews'
  ) then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'crews' and column_name = 'is_active'
    ) then
      execute 'select count(*)::int from public.crews where workspace_id = $1 and coalesce(is_active, true) = true'
      into v_crew_count using p_workspace_id;
    elsif exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'crews' and column_name = 'active'
    ) then
      execute 'select count(*)::int from public.crews where workspace_id = $1 and coalesce(active, true) = true'
      into v_crew_count using p_workspace_id;
    else
      execute 'select count(*)::int from public.crews where workspace_id = $1'
      into v_crew_count using p_workspace_id;
    end if;
  end if;

  -- Avg job duration (days): prefer production_calendar, then job_production_slots
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'production_calendar'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'production_calendar' and column_name in ('start_date','end_date')
    group by table_name
    having count(*) >= 2
  ) then
    begin
      select avg((pc.end_date - pc.start_date + 1)::numeric)
      into v_avg_duration
      from public.production_calendar pc
      where pc.workspace_id = p_workspace_id
        and coalesce(pc.status::text, '') in ('completed')
        and pc.end_date >= (current_date - 180);
      if v_avg_duration is not null then
        v_avg_duration_src := 'production_calendar';
      end if;
    exception when others then
      -- ignore
      v_avg_duration := null;
    end;
  end if;

  if v_avg_duration is null and exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'job_production_slots'
  ) then
    begin
      select avg((jps.end_date - jps.start_date + 1)::numeric)
      into v_avg_duration
      from public.job_production_slots jps
      where jps.workspace_id = p_workspace_id
        and coalesce(jps.status::text, '') in ('completed')
        and jps.end_date >= (current_date - 180);
      if v_avg_duration is not null then
        v_avg_duration_src := 'job_production_slots';
      end if;
    exception when others then
      v_avg_duration := null;
    end;
  end if;

  if v_avg_duration is null or v_avg_duration <= 0 then
    v_avg_duration := 2; -- fallback
    v_avg_duration_src := 'default';
  end if;

  -- Open jobs (best-effort, reusing existing RPC)
  begin
    select coalesce(x.open_jobs, 0)::bigint
    into v_open_jobs
    from public.ss_open_jobs_by_workspace(array[p_workspace_id]) x
    limit 1;
  exception when others then
    v_open_jobs := 0;
  end;

  -- Demand generated (booked jobs): estimates approved per week (last 8 weeks), then scaled to month.
  -- Uses roofing_companies to map workspace -> company ids.
  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'roofing_companies'
  ) into v_has_company;

  if v_has_company
    and exists (select 1 from information_schema.tables where table_schema='public' and table_name='estimates')
    and exists (select 1 from information_schema.columns where table_schema='public' and table_name='estimates' and column_name='company_id')
    and exists (select 1 from information_schema.columns where table_schema='public' and table_name='estimates' and column_name='approved_at')
  then
    v_sql := $q$
      select (count(*)::numeric / 8.0)
      from public.estimates e
      join public.roofing_companies rc on rc.id = e.company_id
      where rc.workspace_id = $1
        and e.approved_at is not null
        and e.approved_at >= (now() - interval '56 days')
    $q$;
    begin
      execute v_sql into v_booked_per_week using p_workspace_id;
    exception when others then
      v_booked_per_week := 0;
    end;

    -- Avg job value (approved estimates), last 180 days
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='estimates' and column_name='total') then
      v_sql := $q$
        select coalesce(avg(coalesce(e.total,0)::numeric), 0)::numeric
        from public.estimates e
        join public.roofing_companies rc on rc.id = e.company_id
        where rc.workspace_id = $1
          and e.approved_at is not null
          and e.approved_at >= (now() - interval '180 days')
      $q$;
      begin
        execute v_sql into v_avg_value using p_workspace_id;
      exception when others then
        v_avg_value := 0;
      end;
    end if;
  end if;

  -- Demand fulfilled: completed installs per week (last 8 weeks), prefer production_calendar completed distinct job_id.
  if exists (
    select 1 from information_schema.tables
    where table_schema='public' and table_name='production_calendar'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='production_calendar' and column_name='job_id'
  ) then
    v_sql := $q$
      select (count(distinct pc.job_id)::numeric / 8.0)
      from public.production_calendar pc
      where pc.workspace_id = $1
        and coalesce(pc.status::text,'') = 'completed'
        and pc.end_date >= (current_date - 56)
    $q$;
    begin
      execute v_sql into v_fulfilled_per_week using p_workspace_id;
    exception when others then
      v_fulfilled_per_week := 0;
    end;
  elsif exists (
    select 1 from information_schema.tables
    where table_schema='public' and table_name='job_production_slots'
  ) then
    v_sql := $q$
      select (count(distinct jps.job_id)::numeric / 8.0)
      from public.job_production_slots jps
      where jps.workspace_id = $1
        and coalesce(jps.status::text,'') = 'completed'
        and jps.end_date >= (current_date - 56)
    $q$;
    begin
      execute v_sql into v_fulfilled_per_week using p_workspace_id;
    exception when others then
      v_fulfilled_per_week := 0;
    end;
  end if;

  -- Capacity math
  if v_crew_count > 0 and v_avg_duration > 0 then
    v_capacity_per_month := (v_crew_count::numeric * v_effective_workdays) / v_avg_duration;
    v_addl_per_crew := v_effective_workdays / v_avg_duration;
  else
    v_capacity_per_month := 0;
    v_addl_per_crew := 0;
  end if;

  return query
    select
      p_workspace_id,
      coalesce(v_crew_count, 0),
      v_avg_duration,
      v_avg_duration_src,
      v_workdays,
      v_extended,
      v_effective_workdays,
      (coalesce(v_booked_per_week, 0) * v_month_factor),
      (coalesce(v_fulfilled_per_week, 0) * v_month_factor),
      coalesce(v_avg_value, 0),
      v_crew_capacity_jobs,
      coalesce(v_open_jobs, 0)::bigint,
      coalesce(v_capacity_per_month, 0),
      coalesce(v_addl_per_crew, 0);
end;
$$;

revoke all on function public.ss_growth_ceiling_metrics(uuid) from public;
grant execute on function public.ss_growth_ceiling_metrics(uuid) to authenticated, service_role;

comment on function public.ss_growth_ceiling_metrics(uuid) is
  'Block 271900: Returns capacity vs demand metrics (crew count, avg duration, demand generated/fulfilled) for the workspace. Uses best-effort sources with safe fallbacks.';




