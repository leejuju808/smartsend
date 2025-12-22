-- ============================================================
-- BLOCK 272900 — SmartSend Self-Policing Sprint (Owner Correction)
-- SmartSend doesn’t just run the business — it checks the owner.
--
-- Ships:
-- - Owner override audit trail (volume / cadence / area / pause)
-- - Blunt, quiet one-line callout: "This action reduced job flow."
-- - "Owner override." marker when performance dips after manual interference
-- - Default reversion after X days back to last-known-proven settings (server-side, no prompt)
-- - Hot-lead ignore detection (inbound reply + no outbound contact after threshold) -> blunt callout
-- ============================================================

-- ------------------------------------------------------------
-- 0) Config (workspace-scoped)
-- ------------------------------------------------------------
create table if not exists public.ss_owner_self_police_config (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  revert_after_days int not null default 3 check (revert_after_days between 1 and 30),
  override_lookback_days int not null default 7 check (override_lookback_days between 1 and 60),
  hot_lead_ignore_minutes int not null default 120 check (hot_lead_ignore_minutes between 15 and 1440),
  updated_at timestamptz not null default now()
);

comment on table public.ss_owner_self_police_config is
  'Block 272900: Workspace-level knobs for self-policing (reversion window, override lookback, hot lead ignore threshold).';

alter table public.ss_owner_self_police_config enable row level security;

drop policy if exists "ss_owner_self_police_config_select_workspace_members" on public.ss_owner_self_police_config;
create policy "ss_owner_self_police_config_select_workspace_members"
  on public.ss_owner_self_police_config
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = ss_owner_self_police_config.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "ss_owner_self_police_config_modify_owner_admin" on public.ss_owner_self_police_config;
create policy "ss_owner_self_police_config_modify_owner_admin"
  on public.ss_owner_self_police_config
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = ss_owner_self_police_config.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner','admin')
    )
  )
  with check (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = ss_owner_self_police_config.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner','admin')
    )
  );

drop policy if exists "ss_owner_self_police_config_service_role_all" on public.ss_owner_self_police_config;
create policy "ss_owner_self_police_config_service_role_all"
  on public.ss_owner_self_police_config
  for all
  to service_role
  using (true)
  with check (true);

grant select, insert, update, delete on public.ss_owner_self_police_config to authenticated;
grant all on public.ss_owner_self_police_config to service_role;

create or replace function public.ss_owner_self_police_get_config(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
begin
  if p_workspace_id is null then
    return jsonb_build_object(
      'revert_after_days', 3,
      'override_lookback_days', 7,
      'hot_lead_ignore_minutes', 120
    );
  end if;

  select * into v
  from public.ss_owner_self_police_config
  where workspace_id = p_workspace_id;

  if v is null then
    insert into public.ss_owner_self_police_config(workspace_id)
    values (p_workspace_id)
    on conflict (workspace_id) do nothing;

    select * into v
    from public.ss_owner_self_police_config
    where workspace_id = p_workspace_id;
  end if;

  return jsonb_build_object(
    'revert_after_days', coalesce(v.revert_after_days, 3),
    'override_lookback_days', coalesce(v.override_lookback_days, 7),
    'hot_lead_ignore_minutes', coalesce(v.hot_lead_ignore_minutes, 120)
  );
end;
$$;

revoke all on function public.ss_owner_self_police_get_config(uuid) from public;
grant execute on function public.ss_owner_self_police_get_config(uuid) to authenticated, service_role;

comment on function public.ss_owner_self_police_get_config(uuid) is
  'Block 272900: Returns (and lazily initializes) self-policing config for a workspace.';

-- ------------------------------------------------------------
-- 1) Authority events (UI reads this; always one-line)
-- ------------------------------------------------------------
create table if not exists public.ss_owner_authority_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_type text not null check (event_type in ('owner_error_callout','owner_override_marker','default_reversion')),
  message text not null,
  created_at timestamptz not null default now(),
  actor_id uuid references auth.users(id) on delete set null,
  override_id uuid,
  dedupe_key text,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists idx_ss_owner_authority_events_ws_created
  on public.ss_owner_authority_events(workspace_id, created_at desc);

create unique index if not exists uq_ss_owner_authority_events_dedupe
  on public.ss_owner_authority_events(workspace_id, event_type, dedupe_key)
  where dedupe_key is not null;

comment on table public.ss_owner_authority_events is
  'Block 272900: Blunt, quiet one-line system events for self-policing and marking owner overrides.';

alter table public.ss_owner_authority_events enable row level security;

drop policy if exists "ss_owner_authority_events_select_workspace_members" on public.ss_owner_authority_events;
create policy "ss_owner_authority_events_select_workspace_members"
  on public.ss_owner_authority_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = ss_owner_authority_events.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "ss_owner_authority_events_service_role_all" on public.ss_owner_authority_events;
create policy "ss_owner_authority_events_service_role_all"
  on public.ss_owner_authority_events
  for all
  to service_role
  using (true)
  with check (true);

grant select on public.ss_owner_authority_events to authenticated;
grant all on public.ss_owner_authority_events to service_role;

-- ------------------------------------------------------------
-- 2) Owner overrides (source of truth for "manual interference")
-- ------------------------------------------------------------
create table if not exists public.ss_owner_overrides (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_at timestamptz not null default now(),
  actor_id uuid references auth.users(id) on delete set null,
  target_type text not null check (target_type in ('workspace','campaign','campaign_followup','campaign_zip')),
  target_id uuid,
  field text not null,
  old_value jsonb,
  new_value jsonb,
  revert_to jsonb,
  reason text not null check (reason in (
    'pause_outreach',
    'undercut_volume',
    'constrict_area',
    'slow_cadence',
    'disable_followups'
  )),
  expires_at timestamptz not null,
  reverted_at timestamptz,
  revert_meta jsonb not null default '{}'::jsonb,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists idx_ss_owner_overrides_ws_created
  on public.ss_owner_overrides(workspace_id, created_at desc);

create index if not exists idx_ss_owner_overrides_due
  on public.ss_owner_overrides(expires_at)
  where reverted_at is null;

comment on table public.ss_owner_overrides is
  'Block 272900: Logged owner manual overrides that reduce job flow; used for marking dips and automatic reversion.';

alter table public.ss_owner_overrides enable row level security;

drop policy if exists "ss_owner_overrides_select_workspace_members" on public.ss_owner_overrides;
create policy "ss_owner_overrides_select_workspace_members"
  on public.ss_owner_overrides
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = ss_owner_overrides.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "ss_owner_overrides_insert_owner_admin" on public.ss_owner_overrides;
create policy "ss_owner_overrides_insert_owner_admin"
  on public.ss_owner_overrides
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = ss_owner_overrides.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner','admin')
    )
  );

drop policy if exists "ss_owner_overrides_service_role_all" on public.ss_owner_overrides;
create policy "ss_owner_overrides_service_role_all"
  on public.ss_owner_overrides
  for all
  to service_role
  using (true)
  with check (true);

grant select, insert on public.ss_owner_overrides to authenticated;
grant all on public.ss_owner_overrides to service_role;

-- ------------------------------------------------------------
-- 3) Helpers: ranking + logging
-- ------------------------------------------------------------
create or replace function public.ss_throttle_rank(p text)
returns int
language sql
immutable
as $$
  select case lower(coalesce(p,'normal'))
    when 'high' then 3
    when 'normal' then 2
    when 'low' then 1
    else 2
  end;
$$;

comment on function public.ss_throttle_rank(text) is
  'Block 272900: Orders demand_throttle for downgrade detection (high>normal>low).';

create or replace function public.ss_owner_log_override(
  p_workspace_id uuid,
  p_target_type text,
  p_target_id uuid,
  p_field text,
  p_old jsonb,
  p_new jsonb,
  p_reason text,
  p_actor_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg jsonb;
  v_days int := 3;
  v_id uuid;
begin
  if p_workspace_id is null then
    return null;
  end if;

  v_cfg := public.ss_owner_self_police_get_config(p_workspace_id);
  v_days := greatest(1, least(30, coalesce((v_cfg->>'revert_after_days')::int, 3)));

  insert into public.ss_owner_overrides(
    workspace_id,
    actor_id,
    target_type,
    target_id,
    field,
    old_value,
    new_value,
    revert_to,
    reason,
    expires_at,
    meta
  )
  values (
    p_workspace_id,
    p_actor_id,
    p_target_type,
    p_target_id,
    p_field,
    p_old,
    p_new,
    p_old,
    p_reason,
    now() + make_interval(days => v_days),
    jsonb_build_object('block', '272900')
  )
  returning id into v_id;

  -- Blunt, quiet callout (one line, no explanation)
  insert into public.ss_owner_authority_events(
    workspace_id,
    event_type,
    message,
    actor_id,
    override_id,
    meta
  )
  values (
    p_workspace_id,
    'owner_error_callout',
    'This action reduced job flow.',
    p_actor_id,
    v_id,
    jsonb_build_object(
      'reason', p_reason,
      'target_type', p_target_type,
      'target_id', p_target_id,
      'field', p_field
    )
  );

  return v_id;
end;
$$;

revoke all on function public.ss_owner_log_override(uuid, text, uuid, text, jsonb, jsonb, text, uuid) from public;
grant execute on function public.ss_owner_log_override(uuid, text, uuid, text, jsonb, jsonb, text, uuid) to service_role;

comment on function public.ss_owner_log_override(uuid, text, uuid, text, jsonb, jsonb, text, uuid) is
  'Block 272900: Inserts an owner override row + emits blunt callout. Intended for triggers (service-only).';

-- ------------------------------------------------------------
-- 4) Triggers: log harmful owner changes (schema-drift-safe via JSON)
-- ------------------------------------------------------------
create or replace function public.trg_ss_owner_override_workspaces()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := null;
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
  v_old text;
  v_new text;
begin
  -- Only police authenticated human actions (not service_role / cron / system)
  if v_actor is null then
    return new;
  end if;

  -- Only owner/admin
  select wm.role into v_role
  from public.workspace_members wm
  where wm.workspace_id = new.id
    and wm.user_id = v_actor
  limit 1;

  if coalesce(v_role,'') not in ('owner','admin') then
    return new;
  end if;

  -- Outreach pause (RUNNING -> PAUSED)
  v_old := lower(coalesce(o->>'outreach_state', 'running'));
  v_new := lower(coalesce(n->>'outreach_state', 'running'));
  if v_old is distinct from v_new and v_new = 'paused' then
    perform public.ss_owner_log_override(new.id, 'workspace', new.id, 'outreach_state', to_jsonb(v_old), to_jsonb(v_new), 'pause_outreach', v_actor);
  end if;

  -- Volume undercut (demand_throttle downgrade)
  v_old := lower(coalesce(o->>'demand_throttle', 'normal'));
  v_new := lower(coalesce(n->>'demand_throttle', 'normal'));
  if v_old is distinct from v_new and public.ss_throttle_rank(v_new) < public.ss_throttle_rank(v_old) then
    perform public.ss_owner_log_override(new.id, 'workspace', new.id, 'demand_throttle', to_jsonb(v_old), to_jsonb(v_new), 'undercut_volume', v_actor);
  end if;

  -- Area constrict (Zip ON -> OFF)
  if (o ? 'area_zip_enabled') and (n ? 'area_zip_enabled') then
    if coalesce((o->>'area_zip_enabled')::boolean, false) is true
       and coalesce((n->>'area_zip_enabled')::boolean, false) is false then
      perform public.ss_owner_log_override(new.id, 'workspace', new.id, 'area_zip_enabled', to_jsonb(true), to_jsonb(false), 'constrict_area', v_actor);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ss_owner_override_workspaces on public.workspaces;
create trigger trg_ss_owner_override_workspaces
after update on public.workspaces
for each row execute function public.trg_ss_owner_override_workspaces();

comment on function public.trg_ss_owner_override_workspaces() is
  'Block 272900: Logs owner overrides on workspace levers (pause/volume/area) and emits blunt callout.';

create or replace function public.trg_ss_owner_override_campaigns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := null;
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
  v_ws uuid;
  v_old_i int;
  v_new_i int;
begin
  if v_actor is null then
    return new;
  end if;

  v_ws := new.workspace_id;
  if v_ws is null then
    return new;
  end if;

  select wm.role into v_role
  from public.workspace_members wm
  where wm.workspace_id = v_ws
    and wm.user_id = v_actor
  limit 1;

  if coalesce(v_role,'') not in ('owner','admin') then
    return new;
  end if;

  -- Daily cap decrease => volume undercut
  if (o ? 'daily_cap') and (n ? 'daily_cap') then
    v_old_i := nullif(coalesce(o->>'daily_cap',''), '')::int;
    v_new_i := nullif(coalesce(n->>'daily_cap',''), '')::int;
    if v_old_i is not null and v_new_i is not null and v_new_i < v_old_i then
      perform public.ss_owner_log_override(v_ws, 'campaign', new.id, 'daily_cap', to_jsonb(v_old_i), to_jsonb(v_new_i), 'undercut_volume', v_actor);
    end if;
  end if;

  -- Cadence slowed (min minutes increase)
  if (o ? 'cadence_min_minutes') and (n ? 'cadence_min_minutes') then
    v_old_i := nullif(coalesce(o->>'cadence_min_minutes',''), '')::int;
    v_new_i := nullif(coalesce(n->>'cadence_min_minutes',''), '')::int;
    if v_old_i is not null and v_new_i is not null and v_new_i > v_old_i then
      perform public.ss_owner_log_override(v_ws, 'campaign', new.id, 'cadence_min_minutes', to_jsonb(v_old_i), to_jsonb(v_new_i), 'slow_cadence', v_actor);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ss_owner_override_campaigns on public.campaigns;
create trigger trg_ss_owner_override_campaigns
after update on public.campaigns
for each row execute function public.trg_ss_owner_override_campaigns();

comment on function public.trg_ss_owner_override_campaigns() is
  'Block 272900: Logs owner overrides on campaign levers (daily cap/cadence) and emits blunt callout.';

-- campaign_follow_up_settings.enabled OFF => disable_followups (best-effort if table exists)
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'campaign_follow_up_settings'
  ) then
    execute $q$
      create or replace function public.trg_ss_owner_override_followups()
      returns trigger
      language plpgsql
      security definer
      set search_path = public
      as $fn$
      declare
        v_actor uuid := auth.uid();
        v_role text := null;
        v_ws uuid;
        v_old boolean := coalesce(old.enabled, true);
        v_new boolean := coalesce(new.enabled, true);
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

        select wm.role into v_role
        from public.workspace_members wm
        where wm.workspace_id = v_ws and wm.user_id = v_actor
        limit 1;

        if coalesce(v_role,'') not in ('owner','admin') then
          return new;
        end if;

        if v_old is true and v_new is false then
          perform public.ss_owner_log_override(v_ws, 'campaign_followup', new.campaign_id, 'enabled', to_jsonb(true), to_jsonb(false), 'disable_followups', v_actor);
        end if;

        return new;
      end;
      $fn$;
    $q$;

    execute 'drop trigger if exists trg_ss_owner_override_followups on public.campaign_follow_up_settings;';
    execute 'create trigger trg_ss_owner_override_followups after update on public.campaign_follow_up_settings for each row execute function public.trg_ss_owner_override_followups();';
  end if;
exception when others then
  null;
end $$;

-- ------------------------------------------------------------
-- 5) Default reversion job: revert due overrides (no prompt)
-- ------------------------------------------------------------
create or replace function public.ss_owner_revert_due_overrides()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  v_done int := 0;
  v_sql text;
begin
  for v in
    select *
    from public.ss_owner_overrides
    where reverted_at is null
      and expires_at <= now()
    order by expires_at asc
    limit 500
  loop
    begin
      if v.target_type = 'workspace' then
        v_sql := format('update public.workspaces set %I = ($1)::%s where id = $2', v.field, 'text');
        -- Handle common types: boolean/int/text (best-effort)
        if jsonb_typeof(v.revert_to) = 'boolean' then
          v_sql := format('update public.workspaces set %I = ($1)::boolean where id = $2', v.field);
          execute v_sql using (v.revert_to::text), v.workspace_id;
        elsif jsonb_typeof(v.revert_to) = 'number' then
          v_sql := format('update public.workspaces set %I = ($1)::int where id = $2', v.field);
          execute v_sql using (v.revert_to::text), v.workspace_id;
        else
          v_sql := format('update public.workspaces set %I = ($1)::text where id = $2', v.field);
          execute v_sql using trim(both '"' from (v.revert_to::text)), v.workspace_id;
        end if;
      elsif v.target_type = 'campaign' then
        if v.target_id is null then
          -- nothing to do
          null;
        elsif jsonb_typeof(v.revert_to) = 'number' then
          v_sql := format('update public.campaigns set %I = ($1)::int where id = $2', v.field);
          execute v_sql using (v.revert_to::text), v.target_id;
        else
          v_sql := format('update public.campaigns set %I = ($1)::text where id = $2', v.field);
          execute v_sql using trim(both '"' from (v.revert_to::text)), v.target_id;
        end if;
      elsif v.target_type = 'campaign_followup' then
        if v.target_id is not null and v.field = 'enabled' then
          update public.campaign_follow_up_settings
             set enabled = (v.revert_to::text)::boolean,
                 updated_at = now()
           where campaign_id = v.target_id;
        end if;
      end if;

      update public.ss_owner_overrides
         set reverted_at = now(),
             revert_meta = revert_meta || jsonb_build_object('reverted_by', 'cron', 'reverted_at', now())
       where id = v.id;

      insert into public.ss_owner_authority_events(
        workspace_id, event_type, message, actor_id, override_id, dedupe_key, meta
      )
      values (
        v.workspace_id,
        'default_reversion',
        'Defaults restored.',
        null,
        v.id,
        'default_reversion:' || v.id::text,
        jsonb_build_object('reason', v.reason, 'field', v.field, 'target_type', v.target_type, 'target_id', v.target_id)
      )
      on conflict do nothing;

      v_done := v_done + 1;
    exception when others then
      -- best-effort; don't block other reverts
      update public.ss_owner_overrides
         set reverted_at = now(),
             revert_meta = revert_meta || jsonb_build_object('revert_failed', true, 'revert_failed_at', now())
       where id = v.id
         and reverted_at is null;
    end;
  end loop;

  return v_done;
end;
$$;

revoke all on function public.ss_owner_revert_due_overrides() from public;
grant execute on function public.ss_owner_revert_due_overrides() to service_role;

comment on function public.ss_owner_revert_due_overrides() is
  'Block 272900: Automatically reverts expired owner overrides back to prior proven settings.';

-- ------------------------------------------------------------
-- 6) Owner override marker: write "Owner override." when dips occur
-- ------------------------------------------------------------
create or replace function public.ss_owner_mark_override_dips_daily()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws record;
  v_cfg jsonb;
  v_days int := 7;
  v_count int := 0;
  v_week_start date := public.ss_week_start_monday_utc(now());
begin
  for v_ws in
    select id from public.workspaces
  loop
    v_cfg := public.ss_owner_self_police_get_config(v_ws.id);
    v_days := greatest(1, least(60, coalesce((v_cfg->>'override_lookback_days')::int, 7)));

    -- Only mark when there is a below-normal drift event for the current week
    -- AND there was an owner override in the recent lookback window.
    if exists (
      select 1
      from public.ss_reliability_drift_events e
      where e.workspace_id = v_ws.id
        and e.week_start = v_week_start
        and e.drift_state = 'below_normal'
        and (e.created_at at time zone 'utc')::date = (now() at time zone 'utc')::date
    ) and exists (
      select 1
      from public.ss_owner_overrides o
      where o.workspace_id = v_ws.id
        and o.created_at >= now() - make_interval(days => v_days)
        and o.reverted_at is null
    ) then
      insert into public.ss_owner_authority_events(
        workspace_id, event_type, message, dedupe_key, meta
      )
      values (
        v_ws.id,
        'owner_override_marker',
        'Owner override.',
        'owner_override_marker:' || v_ws.id::text || ':' || v_week_start::text || ':' || (now() at time zone 'utc')::date::text,
        jsonb_build_object('week_start', v_week_start)
      )
      on conflict do nothing;

      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.ss_owner_mark_override_dips_daily() to service_role;

comment on function public.ss_owner_mark_override_dips_daily() is
  'Block 272900: Inserts a one-line "Owner override." marker when current week is below normal and recent owner override exists.';

-- ------------------------------------------------------------
-- 7) Hot lead ignore detection: inbound reply + no outbound contact after threshold
-- ------------------------------------------------------------
create or replace function public.ss_owner_hot_lead_ignore_tick()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws record;
  v_cfg jsonb;
  v_minutes int := 120;
  v_count int := 0;
  v_deadline timestamptz;
  v_hot_count int := 0;
  v_oldest timestamptz;
  v_dedupe text;
begin
  for v_ws in
    select id from public.workspaces
  loop
    v_cfg := public.ss_owner_self_police_get_config(v_ws.id);
    v_minutes := greatest(15, least(1440, coalesce((v_cfg->>'hot_lead_ignore_minutes')::int, 120)));
    v_deadline := now() - make_interval(mins => v_minutes);

    -- Definition (schema known from Block 292000):
    -- - outreach_status='hot'
    -- - last_reply_at exists and is older than threshold
    -- - last_contacted_at is null OR older than last_reply_at (no outbound contact since the hot reply)
    begin
      select count(*)::int, min(l.last_reply_at)
        into v_hot_count, v_oldest
      from public.leads l
      where l.workspace_id = v_ws.id
        and l.outreach_status = 'hot'
        and l.last_reply_at is not null
        and l.last_reply_at <= v_deadline
        and (l.last_contacted_at is null or l.last_contacted_at < l.last_reply_at);
    exception when others then
      v_hot_count := 0;
      v_oldest := null;
    end;

    if coalesce(v_hot_count, 0) > 0 then
      v_dedupe := 'ignored_hot_leads:' || v_ws.id::text || ':' || (now() at time zone 'utc')::date::text;
      insert into public.ss_owner_authority_events(
        workspace_id, event_type, message, dedupe_key, meta
      )
      values (
        v_ws.id,
        'owner_error_callout',
        'This action reduced job flow.',
        v_dedupe,
        jsonb_build_object('reason','ignored_hot_leads','count',v_hot_count,'oldest_last_reply_at',v_oldest,'threshold_minutes',v_minutes)
      )
      on conflict do nothing;

      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.ss_owner_hot_lead_ignore_tick() to service_role;

comment on function public.ss_owner_hot_lead_ignore_tick() is
  'Block 272900: Emits blunt callout when hot leads are waiting too long without outbound contact after inbound reply.';

-- ------------------------------------------------------------
-- 8) Cron wiring (best-effort)
-- ------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('ss-owner-revert-due-overrides');
    perform cron.schedule(
      'ss-owner-revert-due-overrides',
      '25 1 * * *', -- daily @ 01:25 UTC
      $$ select public.ss_owner_revert_due_overrides(); $$
    );

    perform cron.unschedule('ss-owner-mark-override-dips');
    perform cron.schedule(
      'ss-owner-mark-override-dips',
      '30 1 * * *', -- daily @ 01:30 UTC (after reliability tick @ 01:20)
      $$ select public.ss_owner_mark_override_dips_daily(); $$
    );

    perform cron.unschedule('ss-owner-hot-lead-ignore-tick');
    perform cron.schedule(
      'ss-owner-hot-lead-ignore-tick',
      '*/30 * * * *', -- every 30 minutes
      $$ select public.ss_owner_hot_lead_ignore_tick(); $$
    );
  end if;
exception when others then
  null;
end $$;

-- ============================================================
-- END BLOCK 272900
-- ============================================================




