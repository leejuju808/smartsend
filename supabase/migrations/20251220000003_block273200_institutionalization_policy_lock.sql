-- ============================================================
-- BLOCK 273200 — SmartSend Institutionalization Sprint
-- Make SmartSend survive any single person:
-- - Outreach runs daily (manual pause blocked)
-- - Follow-ups are mandatory (cannot be disabled)
-- - SmartSend duty is a role (on-duty + backup)
-- - Turnover safe defaults (auto-repair duty assignment)
-- ============================================================

-- ------------------------------------------------------------
-- 1) Workspace policy lock (default ON, irreversible)
-- ------------------------------------------------------------
alter table public.workspaces
  add column if not exists institutional_policy_locked boolean not null default true;

alter table public.workspaces
  add column if not exists institutional_policy_locked_at timestamptz null;

alter table public.workspaces
  add column if not exists institutional_policy_locked_by uuid null references auth.users(id) on delete set null;

comment on column public.workspaces.institutional_policy_locked is
  'Block 273200: Company policy lock. When true, manual pauses and disabling follow-ups are blocked.';

comment on column public.workspaces.institutional_policy_locked_at is
  'Block 273200: Timestamp when company policy lock became active.';

comment on column public.workspaces.institutional_policy_locked_by is
  'Block 273200: User who initiated the policy lock (nullable for migration/default).';

-- Best-effort: stamp locked_at for existing workspaces that are already locked (migration backfill).
do $$
begin
  update public.workspaces
     set institutional_policy_locked_at = coalesce(institutional_policy_locked_at, now())
   where institutional_policy_locked = true;
exception when others then
  null;
end $$;

create or replace function public.ss_is_institutional_policy_locked(p_workspace_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_locked boolean := false;
begin
  if p_workspace_id is null then
    return false;
  end if;

  begin
    select coalesce(w.institutional_policy_locked, false)
      into v_locked
    from public.workspaces w
    where w.id = p_workspace_id;
  exception when others then
    v_locked := false;
  end;

  return coalesce(v_locked, false);
end;
$$;

revoke all on function public.ss_is_institutional_policy_locked(uuid) from public;
grant execute on function public.ss_is_institutional_policy_locked(uuid) to authenticated, service_role;

comment on function public.ss_is_institutional_policy_locked(uuid) is
  'Block 273200: Returns whether institutional policy is locked for a workspace (schema-drift safe).';

-- Irreversibility + manual pause block.
create or replace function public.trg_ss_workspace_institutional_policy_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_old_locked boolean := coalesce(old.institutional_policy_locked, false);
  v_new_locked boolean := coalesce(new.institutional_policy_locked, false);
  v_old_state text := lower(coalesce(old.outreach_state, 'running'));
  v_new_state text := lower(coalesce(new.outreach_state, 'running'));
  v_new_reason text := lower(coalesce(new.outreach_paused_reason, ''));
begin
  -- 1) Irreversible: once locked, cannot be unlocked by any authenticated user.
  if tg_op = 'UPDATE'
     and v_old_locked = true
     and v_new_locked is distinct from true then
    raise exception 'Institutional policy is locked and cannot be disabled.';
  end if;

  -- 2) Stamp locked metadata when lock is first enabled.
  if v_old_locked is distinct from true and v_new_locked = true then
    if new.institutional_policy_locked_at is null then
      new.institutional_policy_locked_at := now();
    end if;
    if new.institutional_policy_locked_by is null then
      new.institutional_policy_locked_by := v_actor;
    end if;
  end if;

  -- 3) Manual pause is not allowed when policy is locked (but system/billing pauses can still happen).
  if v_new_locked = true
     and v_actor is not null
     and v_old_state is distinct from v_new_state
     and v_new_state = 'paused'
     and coalesce(v_new_reason, '') = 'manual' then
    raise exception 'Company policy: Outreach cannot be paused.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ss_workspace_institutional_policy_guard on public.workspaces;
create trigger trg_ss_workspace_institutional_policy_guard
before update on public.workspaces
for each row
execute function public.trg_ss_workspace_institutional_policy_guard();

comment on function public.trg_ss_workspace_institutional_policy_guard() is
  'Block 273200: Makes institutional policy irreversible and blocks manual outreach pause when locked.';

-- ------------------------------------------------------------
-- 2) Role-based reality: "Who handles SmartSend today?"
-- ------------------------------------------------------------
create table if not exists public.ss_duty_assignments (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  primary_user_id uuid null references auth.users(id) on delete set null,
  backup_user_id uuid null references auth.users(id) on delete set null,
  updated_by uuid null references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

comment on table public.ss_duty_assignments is
  'Block 273200: On-duty SmartSend operator assignment (primary + backup) per workspace.';

alter table public.ss_duty_assignments enable row level security;

drop policy if exists "ss_duty_assignments_select_workspace_members" on public.ss_duty_assignments;
create policy "ss_duty_assignments_select_workspace_members"
  on public.ss_duty_assignments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = ss_duty_assignments.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "ss_duty_assignments_modify_owner_admin" on public.ss_duty_assignments;
create policy "ss_duty_assignments_modify_owner_admin"
  on public.ss_duty_assignments
  for insert, update, delete
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = ss_duty_assignments.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner','admin')
    )
  )
  with check (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = ss_duty_assignments.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner','admin')
    )
  );

drop policy if exists "ss_duty_assignments_service_role_all" on public.ss_duty_assignments;
create policy "ss_duty_assignments_service_role_all"
  on public.ss_duty_assignments
  for all
  to service_role
  using (true)
  with check (true);

grant select, insert, update, delete on public.ss_duty_assignments to authenticated;
grant all on public.ss_duty_assignments to service_role;

create or replace function public.ss_get_on_duty_operator(p_workspace_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_primary uuid;
  v_backup uuid;
  v_candidate uuid;
begin
  if p_workspace_id is null then
    return null;
  end if;

  -- Read configured assignment (if present)
  select primary_user_id, backup_user_id
    into v_primary, v_backup
  from public.ss_duty_assignments
  where workspace_id = p_workspace_id;

  -- Primary if still a member
  if v_primary is not null then
    if exists (select 1 from public.workspace_members wm where wm.workspace_id = p_workspace_id and wm.user_id = v_primary) then
      return v_primary;
    end if;
  end if;

  -- Backup if still a member
  if v_backup is not null then
    if exists (select 1 from public.workspace_members wm where wm.workspace_id = p_workspace_id and wm.user_id = v_backup) then
      return v_backup;
    end if;
  end if;

  -- Fallback: owner, then admin, then any member
  select wm.user_id into v_candidate
  from public.workspace_members wm
  where wm.workspace_id = p_workspace_id
    and wm.role = 'owner'
  limit 1;
  if v_candidate is not null then
    return v_candidate;
  end if;

  select wm.user_id into v_candidate
  from public.workspace_members wm
  where wm.workspace_id = p_workspace_id
    and wm.role = 'admin'
  limit 1;
  if v_candidate is not null then
    return v_candidate;
  end if;

  select wm.user_id into v_candidate
  from public.workspace_members wm
  where wm.workspace_id = p_workspace_id
  limit 1;

  return v_candidate;
end;
$$;

revoke all on function public.ss_get_on_duty_operator(uuid) from public;
grant execute on function public.ss_get_on_duty_operator(uuid) to authenticated, service_role;

comment on function public.ss_get_on_duty_operator(uuid) is
  'Block 273200: Returns the on-duty SmartSend operator for a workspace (primary -> backup -> owner/admin fallback).';

-- Auto-repair duty assignments when membership changes (turnover immunity).
create or replace function public.ss_duty_assignments_repair(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_primary uuid;
  v_backup uuid;
begin
  if p_workspace_id is null then
    return;
  end if;

  -- Ensure row exists (idempotent)
  insert into public.ss_duty_assignments(workspace_id)
  values (p_workspace_id)
  on conflict (workspace_id) do nothing;

  select primary_user_id, backup_user_id
    into v_primary, v_backup
  from public.ss_duty_assignments
  where workspace_id = p_workspace_id;

  -- Null out assignments that are no longer members
  if v_primary is not null and not exists (select 1 from public.workspace_members wm where wm.workspace_id = p_workspace_id and wm.user_id = v_primary) then
    v_primary := null;
  end if;
  if v_backup is not null and not exists (select 1 from public.workspace_members wm where wm.workspace_id = p_workspace_id and wm.user_id = v_backup) then
    v_backup := null;
  end if;

  -- If primary missing, set to fallback operator
  if v_primary is null then
    v_primary := public.ss_get_on_duty_operator(p_workspace_id);
  end if;

  update public.ss_duty_assignments
     set primary_user_id = v_primary,
         backup_user_id = v_backup,
         updated_at = now()
   where workspace_id = p_workspace_id;
end;
$$;

revoke all on function public.ss_duty_assignments_repair(uuid) from public;
grant execute on function public.ss_duty_assignments_repair(uuid) to service_role;

comment on function public.ss_duty_assignments_repair(uuid) is
  'Block 273200: Repairs duty assignments after turnover (removes invalid assignees, falls back to owner/admin).';

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'workspace_members'
  ) then
    execute $q$
      create or replace function public.trg_ss_workspace_members_duty_repair()
      returns trigger
      language plpgsql
      security definer
      set search_path = public
      as $fn$
      begin
        perform public.ss_duty_assignments_repair(coalesce(NEW.workspace_id, OLD.workspace_id));
        return coalesce(NEW, OLD);
      end;
      $fn$;
    $q$;

    execute 'drop trigger if exists trg_ss_workspace_members_duty_repair on public.workspace_members;';
    execute 'create trigger trg_ss_workspace_members_duty_repair after insert or update or delete on public.workspace_members for each row execute function public.trg_ss_workspace_members_duty_repair();';
  end if;
exception when others then
  null;
end $$;

-- ------------------------------------------------------------
-- 3) Follow-ups are mandatory (cannot be disabled when policy locked)
-- ------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'campaign_follow_up_settings'
  ) then
    execute $q$
      create or replace function public.trg_ss_campaign_followups_policy_guard()
      returns trigger
      language plpgsql
      security definer
      set search_path = public
      as $fn$
      declare
        v_actor uuid := auth.uid();
        v_ws uuid;
        v_locked boolean := false;
        v_enabled_old boolean := coalesce(old.enabled, true);
        v_enabled_new boolean := coalesce(new.enabled, true);
        v_max_new int := coalesce(new.max_follow_ups, 1);
      begin
        -- Only block human changes (service/cron should be able to pause for safety)
        if v_actor is null then
          return new;
        end if;

        select c.workspace_id into v_ws
        from public.campaigns c
        where c.id = new.campaign_id;

        if v_ws is null then
          return new;
        end if;

        v_locked := public.ss_is_institutional_policy_locked(v_ws);

        if v_locked then
          if v_enabled_old is true and v_enabled_new is false then
            raise exception 'Company policy: Follow-ups are mandatory.';
          end if;
          if v_max_new < 1 then
            raise exception 'Company policy: max_follow_ups cannot be < 1.';
          end if;
        end if;

        return new;
      end;
      $fn$;
    $q$;

    execute 'drop trigger if exists trg_ss_campaign_followups_policy_guard on public.campaign_follow_up_settings;';
    execute 'create trigger trg_ss_campaign_followups_policy_guard before update on public.campaign_follow_up_settings for each row execute function public.trg_ss_campaign_followups_policy_guard();';
  end if;
exception when others then
  null;
end $$;

-- Estimates followups: prevent manually pausing followups on sent estimates when locked.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'estimates'
  ) then
    execute $q$
      create or replace function public.trg_ss_estimates_followup_policy_guard()
      returns trigger
      language plpgsql
      security definer
      set search_path = public
      as $fn$
      declare
        v_actor uuid := auth.uid();
        v_ws uuid;
        v_locked boolean := false;
        v_old text := coalesce(old.followup_status, '');
        v_new text := coalesce(new.followup_status, '');
      begin
        -- Only block authenticated human actions.
        if v_actor is null then
          return new;
        end if;

        -- Only when attempting to pause an active follow-up on a sent estimate.
        if lower(v_old) = 'active' and lower(v_new) = 'paused' and new.sent_at is not null and coalesce(new.status::text,'') <> 'approved' and new.approved_at is null then
          begin
            -- Best-effort: derive workspace_id via roofing_companies.
            select rc.workspace_id into v_ws
            from public.roofing_companies rc
            where rc.id = new.company_id;
          exception when others then
            v_ws := null;
          end;

          if v_ws is not null then
            v_locked := public.ss_is_institutional_policy_locked(v_ws);
            if v_locked then
              raise exception 'Company policy: Follow-ups are mandatory.';
            end if;
          end if;
        end if;

        return new;
      end;
      $fn$;
    $q$;

    execute 'drop trigger if exists trg_ss_estimates_followup_policy_guard on public.estimates;';
    execute 'create trigger trg_ss_estimates_followup_policy_guard before update on public.estimates for each row execute function public.trg_ss_estimates_followup_policy_guard();';
  end if;
exception when others then
  null;
end $$;

-- ------------------------------------------------------------
-- 4) Daily operator task (policy creates it automatically)
-- ------------------------------------------------------------
create or replace function public.ss_policy_create_daily_operator_task(
  p_workspace_id uuid,
  p_for_day date default (now() at time zone 'utc')::date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_task_id uuid;
  v_due timestamptz;
  v_day date := p_for_day;
begin
  if p_workspace_id is null then
    return null;
  end if;

  -- Only create if tasks_v3 exists.
  if not exists (
    select 1 from information_schema.tables
    where table_schema='public' and table_name='tasks_v3'
  ) then
    return null;
  end if;

  v_user := public.ss_get_on_duty_operator(p_workspace_id);

  -- Due at 9am local is ideal, but we can't reliably infer TZ here; use 16:00 UTC as a consistent morning-ish slot for US.
  v_due := (v_day::timestamptz + time '16:00');

  -- Dedupe by workspace/day/title.
  select t.id into v_task_id
  from public.tasks_v3 t
  where t.workspace_id = p_workspace_id
    and t.task_type = 'admin_domain_issue'
    and t.due_date = v_day
    and t.title = 'SmartSend Daily Operator Queue'
  limit 1;

  if v_task_id is not null then
    return v_task_id;
  end if;

  insert into public.tasks_v3 (
    workspace_id,
    user_id,
    task_type,
    priority,
    status,
    title,
    description,
    due_at,
    due_date,
    metadata
  )
  values (
    p_workspace_id,
    v_user,
    'admin_domain_issue',
    'high',
    'open',
    'SmartSend Daily Operator Queue',
    'Company policy: review the Daily Operator Queue and clear anything that blocks job flow (hot replies, stalled estimates, follow-ups due).',
    v_due,
    v_day,
    jsonb_build_object('policy','institutional','block','273200','source','cron')
  )
  returning id into v_task_id;

  return v_task_id;
end;
$$;

revoke all on function public.ss_policy_create_daily_operator_task(uuid, date) from public;
grant execute on function public.ss_policy_create_daily_operator_task(uuid, date) to service_role;

comment on function public.ss_policy_create_daily_operator_task(uuid, date) is
  'Block 273200: Creates a daily operator task (idempotent) assigned to the on-duty operator.';



