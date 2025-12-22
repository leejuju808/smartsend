-- BLOCK 270800 — SmartSend Capacity Control Sprint
-- Demand throttle (LOW/NORMAL/HIGH) + crew-aware outreach + spillover zip toggles.
--
-- Goal:
-- - Give roofers a mechanical volume control
-- - Auto-slow outreach when crew capacity is exceeded
-- - Provide a clear "You're full" signal: "Demand exceeds availability."
--
-- Notes:
-- - We keep logic schema-drift safe where possible.
-- - Core enforcement happens in the send worker; DB provides settings + helper rollups.

-- ---------------------------------------------------------
-- 1) Workspace settings (throttle + crew capacity)
-- ---------------------------------------------------------
alter table public.workspaces
  add column if not exists demand_throttle text not null default 'normal'
    check (demand_throttle in ('low', 'normal', 'high')),
  add column if not exists crew_capacity_jobs int;

comment on column public.workspaces.demand_throttle is
  'Block 270800: Mechanical demand throttle (low/normal/high). Controls daily outbound volume.';
comment on column public.workspaces.crew_capacity_jobs is
  'Block 270800: Crew capacity as max concurrent booked/open jobs. When exceeded, outreach auto-slows/stops.';

-- ---------------------------------------------------------
-- 2) Spillover zip controls (workspace-level)
-- ---------------------------------------------------------
create table if not exists public.workspace_spillover_zips (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  zip text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, zip)
);

create index if not exists workspace_spillover_zips_workspace_idx
  on public.workspace_spillover_zips(workspace_id, is_active);

alter table public.workspace_spillover_zips enable row level security;

drop policy if exists "workspace_spillover_zips_select_workspace_members" on public.workspace_spillover_zips;
create policy "workspace_spillover_zips_select_workspace_members" on public.workspace_spillover_zips
  for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_spillover_zips.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "workspace_spillover_zips_service_role_all" on public.workspace_spillover_zips;
create policy "workspace_spillover_zips_service_role_all" on public.workspace_spillover_zips
  for all
  to service_role
  using (true)
  with check (true);

grant select on public.workspace_spillover_zips to authenticated;
grant all on public.workspace_spillover_zips to service_role;

-- Keep updated_at fresh
create or replace function public.ss_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_workspace_spillover_zips_updated_at on public.workspace_spillover_zips;
create trigger trg_workspace_spillover_zips_updated_at
before update on public.workspace_spillover_zips
for each row execute function public.ss_touch_updated_at();

-- ---------------------------------------------------------
-- 3) Helper rollups for the send worker (batch-friendly)
-- ---------------------------------------------------------

-- 3a) Open booked jobs per workspace (best-effort)
--     Prefers appointments table if present.
create or replace function public.ss_open_jobs_by_workspace(p_workspace_ids uuid[])
returns table (
  workspace_id uuid,
  open_jobs bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_appts boolean := false;
  v_appts_has_status boolean := false;
  v_sql text;
begin
  if p_workspace_ids is null or array_length(p_workspace_ids, 1) is null then
    return;
  end if;

  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'appointments'
  ) into v_has_appts;

  if not v_has_appts then
    return query
      select ws.workspace_id, 0::bigint
      from (select unnest(p_workspace_ids) as workspace_id) ws;
    return;
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'appointments' and column_name = 'status'
  ) into v_appts_has_status;

  if v_appts_has_status then
    v_sql := $q$
      with ws as (select unnest($1::uuid[]) as workspace_id),
      c as (
        select
          a.workspace_id,
          count(*)::bigint as open_jobs
        from public.appointments a
        where a.workspace_id = any($1::uuid[])
          and (
            a.status is null
            or lower(a.status) not in ('cancelled','canceled','completed','done','closed','won')
          )
        group by a.workspace_id
      )
      select ws.workspace_id, coalesce(c.open_jobs, 0)::bigint as open_jobs
      from ws
      left join c using (workspace_id)
    $q$;
    return query execute v_sql using p_workspace_ids;
  else
    v_sql := $q$
      with ws as (select unnest($1::uuid[]) as workspace_id),
      c as (
        select
          a.workspace_id,
          count(*)::bigint as open_jobs
        from public.appointments a
        where a.workspace_id = any($1::uuid[])
        group by a.workspace_id
      )
      select ws.workspace_id, coalesce(c.open_jobs, 0)::bigint as open_jobs
      from ws
      left join c using (workspace_id)
    $q$;
    return query execute v_sql using p_workspace_ids;
  end if;
end;
$$;

revoke all on function public.ss_open_jobs_by_workspace(uuid[]) from public;
grant execute on function public.ss_open_jobs_by_workspace(uuid[]) to authenticated, service_role;

comment on function public.ss_open_jobs_by_workspace(uuid[]) is
  'Block 270800: Returns best-effort open booked jobs per workspace (appointments-based when available).';

-- 3b) Sends today per workspace (UTC day; send_queue-based, best-effort)
create or replace function public.ss_send_queue_sent_today_counts(p_workspace_ids uuid[])
returns table (
  workspace_id uuid,
  sent_today bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_send_queue boolean := false;
  v_has_ws boolean := false;
  v_has_updated boolean := false;
  v_start timestamptz;
  v_sql text;
begin
  if p_workspace_ids is null or array_length(p_workspace_ids, 1) is null then
    return;
  end if;

  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'send_queue'
  ) into v_has_send_queue;

  if not v_has_send_queue then
    return query
      select ws.workspace_id, 0::bigint
      from (select unnest(p_workspace_ids) as workspace_id) ws;
    return;
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'send_queue' and column_name = 'workspace_id'
  ) into v_has_ws;

  if not v_has_ws then
    return query
      select ws.workspace_id, 0::bigint
      from (select unnest(p_workspace_ids) as workspace_id) ws;
    return;
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'send_queue' and column_name = 'updated_at'
  ) into v_has_updated;

  v_start := (date_trunc('day', now() at time zone 'utc') at time zone 'utc');

  v_sql := $q$
    with ws as (select unnest($1::uuid[]) as workspace_id),
    c as (
      select
        q.workspace_id,
        count(*)::bigint as sent_today
      from public.send_queue q
      where q.workspace_id = any($1::uuid[])
        and q.status in ('sent','delivered')
        and $2::timestamptz is not null
        and (q.updated_at >= $2::timestamptz)
      group by q.workspace_id
    )
    select ws.workspace_id, coalesce(c.sent_today, 0)::bigint as sent_today
    from ws
    left join c using (workspace_id)
  $q$;

  if not v_has_updated then
    -- Fall back to created_at if updated_at is missing
    v_sql := $q$
      with ws as (select unnest($1::uuid[]) as workspace_id),
      c as (
        select
          q.workspace_id,
          count(*)::bigint as sent_today
        from public.send_queue q
        where q.workspace_id = any($1::uuid[])
          and q.status in ('sent','delivered')
          and $2::timestamptz is not null
          and (q.created_at >= $2::timestamptz)
        group by q.workspace_id
      )
      select ws.workspace_id, coalesce(c.sent_today, 0)::bigint as sent_today
      from ws
      left join c using (workspace_id)
    $q$;
  end if;

  return query execute v_sql using p_workspace_ids, v_start;
end;
$$;

revoke all on function public.ss_send_queue_sent_today_counts(uuid[]) from public;
grant execute on function public.ss_send_queue_sent_today_counts(uuid[]) to authenticated, service_role;

comment on function public.ss_send_queue_sent_today_counts(uuid[]) is
  'Block 270800: Returns sends today per workspace (UTC day) from send_queue, for throttling.';





