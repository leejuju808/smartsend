-- ============================================================
-- BLOCK 273700 — SmartSend Authority Transfer Sprint
-- Make the owner obey the system:
-- - Proven-path lock: once settings produce jobs + maintain reply health, they become immutable.
-- - Deviation requires evidence: owner must submit a reason; changes become requests, not actions.
-- - System overrides emotion: owner cannot pause/slow/stop proven setups.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Proven-path lock (workspace-scoped)
-- ------------------------------------------------------------
create table if not exists public.ss_proven_path_locks (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  locked_at timestamptz not null default now(),
  locked_by text not null default 'system',
  snapshot jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb
);

comment on table public.ss_proven_path_locks is
  'Block 273700: When present, workspace OS configuration is proven and locked (owner cannot change).';

alter table public.ss_proven_path_locks enable row level security;

drop policy if exists "ss_proven_path_locks_select_workspace_members" on public.ss_proven_path_locks;
create policy "ss_proven_path_locks_select_workspace_members"
  on public.ss_proven_path_locks
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = ss_proven_path_locks.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "ss_proven_path_locks_service_role_all" on public.ss_proven_path_locks;
create policy "ss_proven_path_locks_service_role_all"
  on public.ss_proven_path_locks
  for all
  to service_role
  using (true)
  with check (true);

revoke insert, update, delete on public.ss_proven_path_locks from authenticated;
grant select on public.ss_proven_path_locks to authenticated;
grant all on public.ss_proven_path_locks to service_role;

-- ------------------------------------------------------------
-- 2) Deviation requests (evidence-gated)
-- ------------------------------------------------------------
create table if not exists public.ss_deviation_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  reason text not null check (reason in ('capacity_change','crew_change','geographic_expansion')),
  target text not null,
  requested_changes jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  decision_meta jsonb not null default '{}'::jsonb
);

create index if not exists idx_ss_deviation_requests_ws_created
  on public.ss_deviation_requests(workspace_id, created_at desc);
create index if not exists idx_ss_deviation_requests_status_created
  on public.ss_deviation_requests(status, created_at desc);

comment on table public.ss_deviation_requests is
  'Block 273700: Owner change requests when proven-path lock prevents edits; reason required, system must approve.';

alter table public.ss_deviation_requests enable row level security;

drop policy if exists "ss_deviation_requests_select_workspace_members" on public.ss_deviation_requests;
create policy "ss_deviation_requests_select_workspace_members"
  on public.ss_deviation_requests
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = ss_deviation_requests.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "ss_deviation_requests_insert_owner_admin" on public.ss_deviation_requests;
create policy "ss_deviation_requests_insert_owner_admin"
  on public.ss_deviation_requests
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = ss_deviation_requests.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner','admin')
    )
  );

drop policy if exists "ss_deviation_requests_service_role_all" on public.ss_deviation_requests;
create policy "ss_deviation_requests_service_role_all"
  on public.ss_deviation_requests
  for all
  to service_role
  using (true)
  with check (true);

revoke update, delete on public.ss_deviation_requests from authenticated;
grant select, insert on public.ss_deviation_requests to authenticated;
grant all on public.ss_deviation_requests to service_role;

-- ------------------------------------------------------------
-- 3) Signals: compute reply health + wins (best-effort)
-- ------------------------------------------------------------
create or replace function public.ss_authority_compute_signals(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sends_7d bigint := 0;
  v_replies_7d bigint := 0;
  v_wins_14d bigint := 0;
  v_reply_health numeric := 0;
begin
  if p_workspace_id is null then
    return jsonb_build_object('sends_7d',0,'replies_7d',0,'reply_health_7d',0,'wins_14d',0);
  end if;

  -- Sends last 7d (proxy): send_queue delivered/sent updated recently
  begin
    select count(*)::bigint
      into v_sends_7d
    from public.send_queue sq
    where sq.workspace_id = p_workspace_id
      and sq.status in ('sent','delivered')
      and sq.updated_at >= now() - interval '7 days';
  exception when others then
    v_sends_7d := 0;
  end;

  -- Replies last 7d (proxy): leads replied_at recently
  begin
    select count(*)::bigint
      into v_replies_7d
    from public.leads l
    where l.workspace_id = p_workspace_id
      and l.replied_at is not null
      and l.replied_at >= now() - interval '7 days';
  exception when others then
    v_replies_7d := 0;
  end;

  -- Wins last 14d (proxy): leads closed stage
  begin
    select count(*)::bigint
      into v_wins_14d
    from public.leads l
    where l.workspace_id = p_workspace_id
      and (
        (l.pipeline_stage = 'won' and l.closed_at >= now() - interval '14 days')
        or (l.roofing_pipeline_stage in ('installed','closed_won','won') and l.closed_at >= now() - interval '14 days')
      );
  exception when others then
    v_wins_14d := 0;
  end;

  if coalesce(v_sends_7d,0) > 0 then
    v_reply_health := (coalesce(v_replies_7d,0)::numeric / v_sends_7d::numeric);
  else
    v_reply_health := 0;
  end if;

  return jsonb_build_object(
    'sends_7d', coalesce(v_sends_7d,0),
    'replies_7d', coalesce(v_replies_7d,0),
    'reply_health_7d', coalesce(v_reply_health,0),
    'wins_14d', coalesce(v_wins_14d,0)
  );
end;
$$;

revoke all on function public.ss_authority_compute_signals(uuid) from public;
grant execute on function public.ss_authority_compute_signals(uuid) to authenticated, service_role;

comment on function public.ss_authority_compute_signals(uuid) is
  'Block 273700: Computes lightweight performance signals (reply health, wins) used for proven-path lock.';

-- ------------------------------------------------------------
-- 4) Proven-path detection + lock (system-only)
-- ------------------------------------------------------------
create or replace function public.ss_is_proven_path_locked(p_workspace_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.ss_proven_path_locks l
    where l.workspace_id = $1
  );
$$;

revoke all on function public.ss_is_proven_path_locked(uuid) from public;
grant execute on function public.ss_is_proven_path_locked(uuid) to authenticated, service_role;

create or replace function public.ss_maybe_lock_proven_path(p_workspace_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stack record;
  v_ws record;
  v_signals jsonb;
  v_jobs_closed bigint := 0;
  v_revenue_closed numeric := 0;
  v_sends_7d bigint := 0;
  v_reply_health numeric := 0;
  v_should_lock boolean := false;
  v_snapshot jsonb;
begin
  if p_workspace_id is null then
    return false;
  end if;

  if public.ss_is_proven_path_locked(p_workspace_id) then
    return true;
  end if;

  -- Pull never-reset job/revenue memory (best-effort)
  begin
    select jobs_closed_all_time, revenue_closed_all_time
      into v_jobs_closed, v_revenue_closed
    from public.ss_moat_proof_stack
    where workspace_id = p_workspace_id;
  exception when others then
    v_jobs_closed := 0;
    v_revenue_closed := 0;
  end;

  v_signals := public.ss_authority_compute_signals(p_workspace_id);
  v_sends_7d := coalesce((v_signals->>'sends_7d')::bigint, 0);
  v_reply_health := coalesce((v_signals->>'reply_health_7d')::numeric, 0);

  -- Definition of "proven":
  -- - produced at least one closed job OR meaningful closed revenue
  -- - and maintained reply health in recent activity
  v_should_lock :=
    (
      coalesce(v_jobs_closed, 0) >= 1
      or coalesce(v_revenue_closed, 0) >= 5000
    )
    and coalesce(v_sends_7d, 0) >= 50
    and coalesce(v_reply_health, 0) >= 0.01;

  if not v_should_lock then
    return false;
  end if;

  -- Snapshot current OS levers (best-effort)
  select
    w.id,
    w.demand_throttle,
    w.crew_capacity_jobs,
    w.area_zip_enabled,
    w.outreach_state,
    w.reliability_followup_multiplier
  into v_ws
  from public.workspaces w
  where w.id = p_workspace_id;

  v_snapshot := jsonb_build_object(
    'demand_throttle', coalesce(v_ws.demand_throttle, 'normal'),
    'crew_capacity_jobs', v_ws.crew_capacity_jobs,
    'area_zip_enabled', coalesce(v_ws.area_zip_enabled, false),
    'outreach_state', coalesce(v_ws.outreach_state, 'running'),
    'reliability_followup_multiplier', coalesce(v_ws.reliability_followup_multiplier, 1)
  );

  insert into public.ss_proven_path_locks(workspace_id, locked_at, locked_by, snapshot, metrics)
  values (
    p_workspace_id,
    now(),
    'system',
    v_snapshot,
    jsonb_build_object(
      'jobs_closed_all_time', coalesce(v_jobs_closed,0),
      'revenue_closed_all_time', coalesce(v_revenue_closed,0),
      'signals', v_signals
    )
  )
  on conflict (workspace_id) do nothing;

  -- Emit one-line authority event (dedupe per workspace)
  insert into public.ss_owner_authority_events(
    workspace_id, event_type, message, dedupe_key, meta
  )
  values (
    p_workspace_id,
    'default_reversion',
    'Proven path locked.',
    'proven_path_locked:' || p_workspace_id::text,
    jsonb_build_object('block','273700','snapshot',v_snapshot)
  )
  on conflict do nothing;

  return true;
end;
$$;

revoke all on function public.ss_maybe_lock_proven_path(uuid) from public;
grant execute on function public.ss_maybe_lock_proven_path(uuid) to service_role;

comment on function public.ss_maybe_lock_proven_path(uuid) is
  'Block 273700: If workspace has proven results + reply health, insert ss_proven_path_locks row and emit authority event.';

-- ------------------------------------------------------------
-- 5) Enforcement: owner cannot edit proven-path fields
-- ------------------------------------------------------------
create or replace function public.trg_ss_proven_path_guard_workspaces()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
begin
  -- Only block authenticated human actions. System/cron/service_role pass (auth.uid() is null).
  if v_actor is null then
    return new;
  end if;

  if not public.ss_is_proven_path_locked(new.id) then
    return new;
  end if;

  -- If any OS lever changes, block.
  if (o->>'demand_throttle') is distinct from (n->>'demand_throttle')
     or (o->>'crew_capacity_jobs') is distinct from (n->>'crew_capacity_jobs')
     or (o->>'area_zip_enabled') is distinct from (n->>'area_zip_enabled')
     or (o->>'outreach_state') is distinct from (n->>'outreach_state') then
    raise exception 'System performance indicates continuation.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ss_proven_path_guard_workspaces on public.workspaces;
create trigger trg_ss_proven_path_guard_workspaces
before update on public.workspaces
for each row execute function public.trg_ss_proven_path_guard_workspaces();

comment on function public.trg_ss_proven_path_guard_workspaces() is
  'Block 273700: Blocks owner edits to proven workspace levers (volume/area/capacity/outreach_state).';

create or replace function public.trg_ss_proven_path_guard_campaigns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_ws uuid := new.workspace_id;
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
begin
  if v_actor is null then
    return new;
  end if;
  if v_ws is null then
    return new;
  end if;
  if not public.ss_is_proven_path_locked(v_ws) then
    return new;
  end if;

  -- Campaign-level knobs that commonly get "tweaked" and break winners.
  if (o ? 'daily_cap') and (n ? 'daily_cap') and (o->>'daily_cap') is distinct from (n->>'daily_cap') then
    raise exception 'System performance indicates continuation.' using errcode = 'P0001';
  end if;
  if (o ? 'cadence_min_minutes') and (n ? 'cadence_min_minutes') and (o->>'cadence_min_minutes') is distinct from (n->>'cadence_min_minutes') then
    raise exception 'System performance indicates continuation.' using errcode = 'P0001';
  end if;
  if (o ? 'status') and (n ? 'status') and (lower(coalesce(o->>'status','')) is distinct from lower(coalesce(n->>'status',''))) then
    -- Prevent manual pause/stop via campaign status change when proven.
    raise exception 'System performance indicates continuation.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ss_proven_path_guard_campaigns on public.campaigns;
create trigger trg_ss_proven_path_guard_campaigns
before update on public.campaigns
for each row execute function public.trg_ss_proven_path_guard_campaigns();

comment on function public.trg_ss_proven_path_guard_campaigns() is
  'Block 273700: Blocks owner edits to campaign knobs when workspace proven path is locked.';

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema='public' and table_name='campaign_follow_up_settings'
  ) then
    execute $q$
      create or replace function public.trg_ss_proven_path_guard_followups()
      returns trigger
      language plpgsql
      security definer
      set search_path = public
      as $fn$
      declare
        v_actor uuid := auth.uid();
        v_ws uuid;
      begin
        if v_actor is null then
          return new;
        end if;

        select c.workspace_id into v_ws
        from public.campaigns c
        where c.id = new.campaign_id;

        if v_ws is null then
          return new;
        end if;

        if public.ss_is_proven_path_locked(v_ws) then
          raise exception 'System performance indicates continuation.' using errcode = 'P0001';
        end if;

        return new;
      end;
      $fn$;
    $q$;

    execute 'drop trigger if exists trg_ss_proven_path_guard_followups on public.campaign_follow_up_settings;';
    execute 'create trigger trg_ss_proven_path_guard_followups before update on public.campaign_follow_up_settings for each row execute function public.trg_ss_proven_path_guard_followups();';
  end if;
exception when others then
  null;
end $$;

-- ============================================================
-- END BLOCK 273700
-- ============================================================



