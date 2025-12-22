-- =========================================================
-- BLOCK 267800 — SmartSend Moat Sprint v1
-- “Make Switching Feel Painful” (facts + outcomes, no dark patterns)
--
-- Adds:
-- - Never-reset proof stack per workspace (stored as max-so-far)
-- - City timeline RPC (started_at, weeks active, replies trend)
-- - Warm timestamp for all-time warm counting
-- =========================================================

-- ---------------------------------------------------------
-- 0) Lead timestamps for all-time counting
-- ---------------------------------------------------------
alter table public.leads
  add column if not exists first_warm_at timestamptz;

comment on column public.leads.first_warm_at is
  'Block 267800: First time lead was labeled warm (for all-time proof counters).';

-- ---------------------------------------------------------
-- 1) Never-reset proof stack table (max-so-far)
-- ---------------------------------------------------------
create table if not exists public.ss_moat_proof_stack (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,

  emails_sent_all_time bigint not null default 0,
  replies_all_time bigint not null default 0,
  hot_all_time bigint not null default 0,
  warm_all_time bigint not null default 0,
  jobs_booked_all_time bigint not null default 0,
  estimated_value_all_time numeric(14,2) not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ss_moat_proof_stack_updated_at_idx
  on public.ss_moat_proof_stack(updated_at desc);

alter table public.ss_moat_proof_stack enable row level security;

drop policy if exists "ss_moat_proof_stack_select_workspace_members" on public.ss_moat_proof_stack;
create policy "ss_moat_proof_stack_select_workspace_members" on public.ss_moat_proof_stack
  for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = ss_moat_proof_stack.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "ss_moat_proof_stack_service_role_all" on public.ss_moat_proof_stack;
create policy "ss_moat_proof_stack_service_role_all" on public.ss_moat_proof_stack
  for all
  to service_role
  using (true)
  with check (true);

grant select on public.ss_moat_proof_stack to authenticated;
grant all on public.ss_moat_proof_stack to service_role;

-- ---------------------------------------------------------
-- 2) Helper: compute proof stack (best-effort, schema-drift safe)
--    IMPORTANT: values only ever increase (max-so-far).
-- ---------------------------------------------------------
create or replace function public.ss_moat_recompute(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();

  v_emails bigint := 0;
  v_replies bigint := 0;
  v_hot bigint := 0;
  v_warm bigint := 0;
  v_jobs bigint := 0;
  v_value numeric(14,2) := 0;

  v_has_send_logs boolean := false;
  v_send_logs_has_ws boolean := false;
  v_send_logs_has_status boolean := false;
  v_send_logs_has_sent_at boolean := false;

  v_has_reply_events boolean := false;
  v_reply_events_has_created boolean := false;

  v_has_appts boolean := false;
  v_appts_has_status boolean := false;

  v_has_leads boolean := false;
  v_leads_has_first_hot boolean := false;
  v_leads_has_first_warm boolean := false;
  v_leads_has_estimated_value boolean := false;
  v_leads_has_job_value boolean := false;
  v_leads_has_pipeline_stage boolean := false;

  v_campaign_ids uuid[];
begin
  if p_workspace_id is null then
    raise exception 'workspace_id required' using errcode = '22004';
  end if;

  -- Enforce membership for authenticated callers (service role is allowed too).
  if auth.uid() is not null then
    if not exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = p_workspace_id and wm.user_id = auth.uid()
    ) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;

  -- Table/column presence checks (schema drift safe)
  select exists (select 1 from information_schema.tables where table_schema='public' and table_name='send_logs')
    into v_has_send_logs;
  select exists (select 1 from information_schema.tables where table_schema='public' and table_name='smartsend_reply_events')
    into v_has_reply_events;
  select exists (select 1 from information_schema.tables where table_schema='public' and table_name='appointments')
    into v_has_appts;
  select exists (select 1 from information_schema.tables where table_schema='public' and table_name='leads')
    into v_has_leads;

  if v_has_send_logs then
    select exists (select 1 from information_schema.columns where table_schema='public' and table_name='send_logs' and column_name='workspace_id')
      into v_send_logs_has_ws;
    select exists (select 1 from information_schema.columns where table_schema='public' and table_name='send_logs' and column_name='status')
      into v_send_logs_has_status;
    select exists (select 1 from information_schema.columns where table_schema='public' and table_name='send_logs' and column_name='sent_at')
      into v_send_logs_has_sent_at;
  end if;

  if v_has_reply_events then
    select exists (select 1 from information_schema.columns where table_schema='public' and table_name='smartsend_reply_events' and column_name='created_at')
      into v_reply_events_has_created;
  end if;

  if v_has_appts then
    select exists (select 1 from information_schema.columns where table_schema='public' and table_name='appointments' and column_name='status')
      into v_appts_has_status;
  end if;

  if v_has_leads then
    select exists (select 1 from information_schema.columns where table_schema='public' and table_name='leads' and column_name='first_hot_at')
      into v_leads_has_first_hot;
    select exists (select 1 from information_schema.columns where table_schema='public' and table_name='leads' and column_name='first_warm_at')
      into v_leads_has_first_warm;
    select exists (select 1 from information_schema.columns where table_schema='public' and table_name='leads' and column_name='estimated_job_value')
      into v_leads_has_estimated_value;
    select exists (select 1 from information_schema.columns where table_schema='public' and table_name='leads' and column_name='job_value')
      into v_leads_has_job_value;
    select exists (select 1 from information_schema.columns where table_schema='public' and table_name='leads' and column_name='roofing_pipeline_stage')
      into v_leads_has_pipeline_stage;
  end if;

  -- Campaign ids (used to link reply events)
  select array_agg(c.id)
    into v_campaign_ids
  from public.campaigns c
  where c.workspace_id = p_workspace_id;
  v_campaign_ids := coalesce(v_campaign_ids, array[]::uuid[]);

  -- Emails sent (all-time)
  if v_has_send_logs then
    if v_send_logs_has_ws then
      if v_send_logs_has_status then
        execute
          'select count(*)::bigint from public.send_logs where workspace_id = $1 and status in (''sent'',''delivered'')'
          into v_emails using p_workspace_id;
      else
        execute
          'select count(*)::bigint from public.send_logs where workspace_id = $1'
          into v_emails using p_workspace_id;
      end if;
    else
      -- Fallback: campaign-scoped logs
      if array_length(v_campaign_ids, 1) is not null then
        if v_send_logs_has_status then
          execute
            'select count(*)::bigint from public.send_logs where campaign_id = any($1) and status in (''sent'',''delivered'')'
            into v_emails using v_campaign_ids;
        else
          execute
            'select count(*)::bigint from public.send_logs where campaign_id = any($1)'
            into v_emails using v_campaign_ids;
        end if;
      end if;
    end if;
  end if;

  -- Replies received (all-time)
  if v_has_reply_events and array_length(v_campaign_ids, 1) is not null then
    execute
      'select count(*)::bigint from public.smartsend_reply_events where campaign_id = any($1)'
      into v_replies using v_campaign_ids;
  end if;

  -- Hot/Warm all-time (count of leads that ever hit the label)
  if v_has_leads then
    if v_leads_has_first_hot then
      execute
        'select count(*)::bigint from public.leads where workspace_id = $1 and first_hot_at is not null'
        into v_hot using p_workspace_id;
    else
      execute
        'select count(*)::bigint from public.leads where workspace_id = $1 and outreach_status = ''hot'''
        into v_hot using p_workspace_id;
    end if;

    if v_leads_has_first_warm then
      execute
        'select count(*)::bigint from public.leads where workspace_id = $1 and first_warm_at is not null'
        into v_warm using p_workspace_id;
    else
      execute
        'select count(*)::bigint from public.leads where workspace_id = $1 and outreach_status = ''warm'''
        into v_warm using p_workspace_id;
    end if;
  end if;

  -- Jobs booked (appointments) all-time
  if v_has_appts then
    if v_appts_has_status then
      execute
        'select count(*)::bigint from public.appointments where workspace_id = $1 and status is distinct from ''cancelled'''
        into v_jobs using p_workspace_id;
    else
      execute
        'select count(*)::bigint from public.appointments where workspace_id = $1'
        into v_jobs using p_workspace_id;
    end if;
  end if;

  -- Estimated value all-time (best-effort; fall back to simple heuristic)
  if v_has_leads and (v_leads_has_estimated_value or v_leads_has_job_value) then
    if v_leads_has_pipeline_stage then
      -- Prefer closed/installed if pipeline exists (closer to "generated")
      if v_leads_has_estimated_value then
        execute
          'select coalesce(sum(coalesce(estimated_job_value, 0))::numeric(14,2), 0) from public.leads where workspace_id = $1 and roofing_pipeline_stage in (''installed'',''closed_won'',''won'')'
          into v_value using p_workspace_id;
      else
        execute
          'select coalesce(sum(coalesce(job_value, 0))::numeric(14,2), 0) from public.leads where workspace_id = $1 and roofing_pipeline_stage in (''installed'',''closed_won'',''won'')'
          into v_value using p_workspace_id;
      end if;
    else
      -- No pipeline stage: sum across all leads
      if v_leads_has_estimated_value then
        execute
          'select coalesce(sum(coalesce(estimated_job_value, 0))::numeric(14,2), 0) from public.leads where workspace_id = $1'
          into v_value using p_workspace_id;
      else
        execute
          'select coalesce(sum(coalesce(job_value, 0))::numeric(14,2), 0) from public.leads where workspace_id = $1'
          into v_value using p_workspace_id;
      end if;
    end if;
  else
    -- Heuristic fallback (matches Revenue Activity v1 feel)
    v_value := (coalesce(v_hot, 0) * 10000 + coalesce(v_warm, 0) * 5000)::numeric(14,2);
  end if;

  -- Upsert (max-so-far)
  insert into public.ss_moat_proof_stack(
    workspace_id,
    emails_sent_all_time,
    replies_all_time,
    hot_all_time,
    warm_all_time,
    jobs_booked_all_time,
    estimated_value_all_time,
    created_at,
    updated_at
  )
  values (
    p_workspace_id,
    greatest(coalesce(v_emails, 0), 0),
    greatest(coalesce(v_replies, 0), 0),
    greatest(coalesce(v_hot, 0), 0),
    greatest(coalesce(v_warm, 0), 0),
    greatest(coalesce(v_jobs, 0), 0),
    greatest(coalesce(v_value, 0), 0),
    v_now,
    v_now
  )
  on conflict (workspace_id) do update
  set
    emails_sent_all_time = greatest(ss_moat_proof_stack.emails_sent_all_time, excluded.emails_sent_all_time),
    replies_all_time = greatest(ss_moat_proof_stack.replies_all_time, excluded.replies_all_time),
    hot_all_time = greatest(ss_moat_proof_stack.hot_all_time, excluded.hot_all_time),
    warm_all_time = greatest(ss_moat_proof_stack.warm_all_time, excluded.warm_all_time),
    jobs_booked_all_time = greatest(ss_moat_proof_stack.jobs_booked_all_time, excluded.jobs_booked_all_time),
    estimated_value_all_time = greatest(ss_moat_proof_stack.estimated_value_all_time, excluded.estimated_value_all_time),
    updated_at = v_now;

  return jsonb_build_object(
    'workspace_id', p_workspace_id,
    'as_of', v_now,
    'emails_sent', v_emails,
    'replies', v_replies,
    'hot_all_time', v_hot,
    'warm_all_time', v_warm,
    'jobs_booked', v_jobs,
    'estimated_value', v_value
  );
end;
$$;

revoke all on function public.ss_moat_recompute(uuid) from public;
grant execute on function public.ss_moat_recompute(uuid) to authenticated, service_role;

comment on function public.ss_moat_recompute(uuid) is
  'Block 267800: Recomputes (and max-upserts) never-reset proof counters for a workspace.';

-- ---------------------------------------------------------
-- 3) City timeline RPC (simple list: dates + counts + replies trend)
-- ---------------------------------------------------------
create or replace function public.ss_city_timeline(
  p_workspace_id uuid,
  p_weeks int default 8
)
returns table(
  city text,
  state text,
  started_at timestamptz,
  weeks_active int,
  replies_by_week jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_weeks int := greatest(coalesce(p_weeks, 8), 1);
begin
  if p_workspace_id is null then
    raise exception 'workspace_id required' using errcode = '22004';
  end if;

  if auth.uid() is not null then
    if not exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = p_workspace_id and wm.user_id = auth.uid()
    ) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;

  -- Prefer last_reply_at (exists in modern outreach lead labeling).
  return query
  with cities as (
    select
      nullif(trim(coalesce(l.city, '')), '') as city,
      nullif(trim(coalesce(l.state, '')), '') as state,
      min(l.created_at) as started_at
    from public.leads l
    where l.workspace_id = p_workspace_id
      and nullif(trim(coalesce(l.city, '')), '') is not null
    group by 1,2
  ),
  weeks as (
    select generate_series(
      date_trunc('week', v_now) - ((v_weeks - 1) * interval '1 week'),
      date_trunc('week', v_now),
      interval '1 week'
    ) as wk
  ),
  replies as (
    select
      nullif(trim(coalesce(l.city, '')), '') as city,
      nullif(trim(coalesce(l.state, '')), '') as state,
      date_trunc('week', l.last_reply_at) as wk,
      count(*)::int as replies
    from public.leads l
    where l.workspace_id = p_workspace_id
      and l.last_reply_at is not null
      and l.last_reply_at >= (date_trunc('week', v_now) - ((v_weeks - 1) * interval '1 week'))
      and nullif(trim(coalesce(l.city, '')), '') is not null
    group by 1,2,3
  )
  select
    c.city,
    c.state,
    c.started_at,
    greatest(1, ceil(extract(epoch from (v_now - c.started_at)) / 604800.0)::int) as weeks_active,
    jsonb_agg(
      jsonb_build_object(
        'week_start', w.wk,
        'replies', coalesce(r.replies, 0)
      )
      order by w.wk
    ) as replies_by_week
  from cities c
  cross join weeks w
  left join replies r
    on r.city is not distinct from c.city
   and r.state is not distinct from c.state
   and r.wk = w.wk
  group by c.city, c.state, c.started_at
  order by c.started_at asc nulls last, c.city asc;
end;
$$;

revoke all on function public.ss_city_timeline(uuid, int) from public;
grant execute on function public.ss_city_timeline(uuid, int) to authenticated, service_role;

comment on function public.ss_city_timeline(uuid, int) is
  'Block 267800: Returns per-city started_at, weeks active, and a simple replies trend (by week) for a workspace.';








