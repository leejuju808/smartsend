-- ============================================================
-- BLOCK 273200 — Jobs Must Be Logged (SmartSend System of Record)
-- "If it's not logged, it didn't happen."
--
-- Goal:
-- - When a lead is marked WON, ensure a SmartSend job record exists.
-- - Best-effort + schema-drift safe: supports different roofing_jobs schemas.
--
-- Strategy:
-- - BEFORE UPDATE on leads: if status/outcome becomes "won", auto-create roofing_jobs row if missing.
-- - Stamp origin_source='smartsend' when the column exists.
-- - Never block on unknown schema; fail-open but still write best-effort.
-- ============================================================

create or replace function public.ss_ensure_job_logged_for_lead_win(p_lead_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead record;
  v_job_id uuid;
  v_has_jobs boolean := false;
  v_jobs_has_workspace boolean := false;
  v_jobs_has_lead boolean := false;
  v_jobs_has_thread boolean := false;
  v_jobs_has_contact boolean := false;
  v_jobs_has_title boolean := false;
  v_jobs_has_job_value boolean := false;
  v_jobs_has_projected_value boolean := false;
  v_jobs_has_status boolean := false;
  v_jobs_has_stage boolean := false;
  v_jobs_has_origin boolean := false;
begin
  if p_lead_id is null then
    return null;
  end if;

  select * into v_lead
  from public.leads
  where id = p_lead_id;

  if v_lead is null then
    return null;
  end if;

  select exists (
    select 1 from information_schema.tables
    where table_schema='public' and table_name='roofing_jobs'
  ) into v_has_jobs;

  if not v_has_jobs then
    return null;
  end if;

  -- Column presence (schema drift safe)
  select exists (select 1 from information_schema.columns where table_schema='public' and table_name='roofing_jobs' and column_name='workspace_id')
    into v_jobs_has_workspace;
  select exists (select 1 from information_schema.columns where table_schema='public' and table_name='roofing_jobs' and column_name='lead_id')
    into v_jobs_has_lead;
  select exists (select 1 from information_schema.columns where table_schema='public' and table_name='roofing_jobs' and column_name='thread_id')
    into v_jobs_has_thread;
  select exists (select 1 from information_schema.columns where table_schema='public' and table_name='roofing_jobs' and column_name='contact_id')
    into v_jobs_has_contact;
  select exists (select 1 from information_schema.columns where table_schema='public' and table_name='roofing_jobs' and column_name='title')
    into v_jobs_has_title;
  select exists (select 1 from information_schema.columns where table_schema='public' and table_name='roofing_jobs' and column_name='job_value')
    into v_jobs_has_job_value;
  select exists (select 1 from information_schema.columns where table_schema='public' and table_name='roofing_jobs' and column_name='projected_job_value')
    into v_jobs_has_projected_value;
  select exists (select 1 from information_schema.columns where table_schema='public' and table_name='roofing_jobs' and column_name='status')
    into v_jobs_has_status;
  select exists (select 1 from information_schema.columns where table_schema='public' and table_name='roofing_jobs' and column_name='current_stage')
    into v_jobs_has_stage;
  select exists (select 1 from information_schema.columns where table_schema='public' and table_name='roofing_jobs' and column_name='origin_source')
    into v_jobs_has_origin;

  -- If a job already exists for this lead, return it.
  if v_jobs_has_lead then
    begin
      execute 'select id from public.roofing_jobs where lead_id = $1 limit 1'
        into v_job_id using p_lead_id;
      if v_job_id is not null then
        return v_job_id;
      end if;
    exception when others then
      null;
    end;
  end if;

  -- Create minimal job record with whatever columns exist.
  begin
    execute format(
      'insert into public.roofing_jobs(%s) values (%s) returning id',
      -- columns
      array_to_string(array_remove(array[
        case when v_jobs_has_workspace then 'workspace_id' end,
        case when v_jobs_has_lead then 'lead_id' end,
        case when v_jobs_has_title then 'title' end,
        case when v_jobs_has_job_value then 'job_value' end,
        case when v_jobs_has_projected_value then 'projected_job_value' end,
        case when v_jobs_has_status then 'status' end,
        case when v_jobs_has_stage then 'current_stage' end,
        case when v_jobs_has_origin then 'origin_source' end
      ], null), ','),
      -- placeholders
      array_to_string(array_remove(array[
        case when v_jobs_has_workspace then '$1' end,
        case when v_jobs_has_lead then '$2' end,
        case when v_jobs_has_title then '$3' end,
        case when v_jobs_has_job_value then '$4' end,
        case when v_jobs_has_projected_value then '$5' end,
        case when v_jobs_has_status then '$6' end,
        case when v_jobs_has_stage then '$7' end,
        case when v_jobs_has_origin then '$8' end
      ], null), ',')
    )
    into v_job_id
    using
      -- $1 workspace_id
      (case when v_jobs_has_workspace then v_lead.workspace_id else null end),
      -- $2 lead_id
      (case when v_jobs_has_lead then v_lead.id else null end),
      -- $3 title
      (case when v_jobs_has_title then coalesce(nullif(trim(coalesce(v_lead.name,'')),''), v_lead.email, 'Roofing Job') end),
      -- $4 job_value
      (case when v_jobs_has_job_value then coalesce(v_lead.estimated_job_value, 0) end),
      -- $5 projected_job_value
      (case when v_jobs_has_projected_value then coalesce(v_lead.estimated_job_value, 0) end),
      -- $6 status (older schema)
      (case when v_jobs_has_status then 'unscheduled' end),
      -- $7 current_stage (newer schema)
      (case when v_jobs_has_stage then 'INSTALL_READY' end),
      -- $8 origin_source
      (case when v_jobs_has_origin then 'smartsend' end);
  exception when others then
    -- fail-open: don't break lead updates
    v_job_id := null;
  end;

  return v_job_id;
end;
$$;

revoke all on function public.ss_ensure_job_logged_for_lead_win(uuid) from public;
grant execute on function public.ss_ensure_job_logged_for_lead_win(uuid) to service_role;

comment on function public.ss_ensure_job_logged_for_lead_win(uuid) is
  'Block 273200: Ensures a roofing_jobs row exists when a lead is marked won (schema-drift safe, best-effort).';

create or replace function public.trg_ss_jobs_must_be_logged_on_lead_win()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
  v_old text := lower(coalesce(n->>'status', o->>'status', ''));
  v_new text := lower(coalesce(n->>'status', ''));
  v_old_outcome text := lower(coalesce(o->>'outcome', ''));
  v_new_outcome text := lower(coalesce(n->>'outcome', ''));
begin
  -- Only act on transitions into WON (status or outcome).
  if (v_old is distinct from v_new and v_new = 'won')
     or (v_old_outcome is distinct from v_new_outcome and v_new_outcome = 'won') then
    perform public.ss_ensure_job_logged_for_lead_win(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ss_jobs_must_be_logged_on_lead_win on public.leads;
create trigger trg_ss_jobs_must_be_logged_on_lead_win
before update on public.leads
for each row
execute function public.trg_ss_jobs_must_be_logged_on_lead_win();

comment on function public.trg_ss_jobs_must_be_logged_on_lead_win() is
  'Block 273200: When a lead becomes won, ensure a SmartSend job record exists (auto-log).';



