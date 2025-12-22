-- BLOCK 269500 — SmartSend Dependence Sprint
-- Hard-link revenue flow to SmartSend RUNNING/PAUSED.
--
-- Adds:
-- - Workspace-wide outreach state (running/paused) + paused_at
-- - Daily proof-of-life log: "Outreach ran today."
-- - Extends ss_moat_proof_stack with jobs_closed + revenue_closed (all-time, max-so-far)
-- - Updates ss_moat_recompute to compute the new fields (schema-drift safe, best-effort)

-- ---------------------------------------------------------
-- 1) Workspace-wide outreach state
-- ---------------------------------------------------------
alter table public.workspaces
  add column if not exists outreach_state text not null default 'running'
    check (outreach_state in ('running','paused')),
  add column if not exists outreach_paused_at timestamptz;

comment on column public.workspaces.outreach_state is
  'Block 269500: Workspace-wide automation state. running=outreach on, paused=outreach off.';
comment on column public.workspaces.outreach_paused_at is
  'Block 269500: Timestamp when workspace-wide outreach was paused.';

-- ---------------------------------------------------------
-- 2) Daily proof-of-life log
-- ---------------------------------------------------------
create table if not exists public.ss_outreach_daily_log (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  day date not null,
  ran_at timestamptz not null default now(),
  primary key (workspace_id, day)
);

create index if not exists ss_outreach_daily_log_day_idx
  on public.ss_outreach_daily_log(day desc, ran_at desc);

alter table public.ss_outreach_daily_log enable row level security;

drop policy if exists "ss_outreach_daily_log_select_workspace_members" on public.ss_outreach_daily_log;
create policy "ss_outreach_daily_log_select_workspace_members" on public.ss_outreach_daily_log
  for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = ss_outreach_daily_log.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "ss_outreach_daily_log_service_role_all" on public.ss_outreach_daily_log;
create policy "ss_outreach_daily_log_service_role_all" on public.ss_outreach_daily_log
  for all
  to service_role
  using (true)
  with check (true);

grant select on public.ss_outreach_daily_log to authenticated;
grant all on public.ss_outreach_daily_log to service_role;

-- Helper: log "Outreach ran today" (idempotent)
create or replace function public.ss_outreach_log_today(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := (now() at time zone 'utc')::date;
begin
  if p_workspace_id is null then
    raise exception 'workspace_id required' using errcode = '22004';
  end if;

  insert into public.ss_outreach_daily_log(workspace_id, day, ran_at)
  values (p_workspace_id, v_day, now())
  on conflict (workspace_id, day)
  do update set ran_at = excluded.ran_at;
end;
$$;

revoke all on function public.ss_outreach_log_today(uuid) from public;
grant execute on function public.ss_outreach_log_today(uuid) to authenticated, service_role;

comment on function public.ss_outreach_log_today(uuid) is
  'Block 269500: Upserts a daily proof-of-life record (“Outreach ran today.”) for a workspace.';

-- ---------------------------------------------------------
-- 3) Extend never-reset proof stack with "jobs closed"
-- ---------------------------------------------------------
alter table public.ss_moat_proof_stack
  add column if not exists jobs_closed_all_time bigint not null default 0,
  add column if not exists revenue_closed_all_time numeric(14,2) not null default 0;

comment on column public.ss_moat_proof_stack.jobs_closed_all_time is
  'Block 269500: Count of closed/won jobs all-time (max-so-far).';
comment on column public.ss_moat_proof_stack.revenue_closed_all_time is
  'Block 269500: Closed/won revenue all-time (max-so-far).';

-- ---------------------------------------------------------
-- 4) Update ss_moat_recompute to compute new fields
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
  v_jobs_booked bigint := 0;
  v_value numeric(14,2) := 0;
  v_jobs_closed bigint := 0;
  v_revenue_closed numeric(14,2) := 0;

  v_has_send_logs boolean := false;
  v_send_logs_has_ws boolean := false;
  v_send_logs_has_status boolean := false;

  v_has_reply_events boolean := false;

  v_has_appts boolean := false;
  v_appts_has_status boolean := false;

  v_has_leads boolean := false;
  v_leads_has_first_hot boolean := false;
  v_leads_has_first_warm boolean := false;
  v_leads_has_estimated_value boolean := false;
  v_leads_has_job_value boolean := false;
  v_leads_has_pipeline_stage boolean := false;

  v_has_estimates boolean := false;
  v_estimates_has_workspace boolean := false;
  v_estimates_has_total boolean := false;
  v_estimates_has_status boolean := false;
  v_estimates_has_company boolean := false;
  v_has_roofing_companies boolean := false;

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

  -- Presence checks (schema drift safe)
  select exists (select 1 from information_schema.tables where table_schema='public' and table_name='send_logs')
    into v_has_send_logs;
  select exists (select 1 from information_schema.tables where table_schema='public' and table_name='smartsend_reply_events')
    into v_has_reply_events;
  select exists (select 1 from information_schema.tables where table_schema='public' and table_name='appointments')
    into v_has_appts;
  select exists (select 1 from information_schema.tables where table_schema='public' and table_name='leads')
    into v_has_leads;
  select exists (select 1 from information_schema.tables where table_schema='public' and table_name='estimates')
    into v_has_estimates;
  select exists (select 1 from information_schema.tables where table_schema='public' and table_name='roofing_companies')
    into v_has_roofing_companies;

  if v_has_send_logs then
    select exists (select 1 from information_schema.columns where table_schema='public' and table_name='send_logs' and column_name='workspace_id')
      into v_send_logs_has_ws;
    select exists (select 1 from information_schema.columns where table_schema='public' and table_name='send_logs' and column_name='status')
      into v_send_logs_has_status;
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

  if v_has_estimates then
    select exists (select 1 from information_schema.columns where table_schema='public' and table_name='estimates' and column_name='workspace_id')
      into v_estimates_has_workspace;
    select exists (select 1 from information_schema.columns where table_schema='public' and table_name='estimates' and column_name='total')
      into v_estimates_has_total;
    select exists (select 1 from information_schema.columns where table_schema='public' and table_name='estimates' and column_name='status')
      into v_estimates_has_status;
    select exists (select 1 from information_schema.columns where table_schema='public' and table_name='estimates' and column_name='company_id')
      into v_estimates_has_company;
  end if;

  -- Campaign ids (used to link reply events and sometimes send logs)
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
        into v_jobs_booked using p_workspace_id;
    else
      execute
        'select count(*)::bigint from public.appointments where workspace_id = $1'
        into v_jobs_booked using p_workspace_id;
    end if;
  end if;

  -- Estimated value all-time (best-effort; fall back to simple heuristic)
  if v_has_leads and (v_leads_has_estimated_value or v_leads_has_job_value) then
    if v_leads_has_pipeline_stage then
      if v_leads_has_estimated_value then
        execute
          'select coalesce(sum(coalesce(estimated_job_value, 0))::numeric(14,2), 0)
           from public.leads
           where workspace_id = $1 and roofing_pipeline_stage in (''installed'',''closed_won'',''won'')'
          into v_value using p_workspace_id;
      else
        execute
          'select coalesce(sum(coalesce(job_value, 0))::numeric(14,2), 0)
           from public.leads
           where workspace_id = $1 and roofing_pipeline_stage in (''installed'',''closed_won'',''won'')'
          into v_value using p_workspace_id;
      end if;
    else
      if v_leads_has_estimated_value then
        execute
          'select coalesce(sum(coalesce(estimated_job_value, 0))::numeric(14,2), 0)
           from public.leads where workspace_id = $1'
          into v_value using p_workspace_id;
      else
        execute
          'select coalesce(sum(coalesce(job_value, 0))::numeric(14,2), 0)
           from public.leads where workspace_id = $1'
          into v_value using p_workspace_id;
      end if;
    end if;
  else
    v_value := (coalesce(v_hot, 0) * 10000 + coalesce(v_warm, 0) * 5000)::numeric(14,2);
  end if;

  -- Jobs closed + revenue closed (best-effort)
  -- Preference order:
  -- 1) If leads has roofing_pipeline_stage: count/sum closed stages
  -- 2) Else, if estimates exist: count approved and sum totals (workspace or company->workspace)
  if v_has_leads and v_leads_has_pipeline_stage then
    execute
      'select count(*)::bigint
       from public.leads
       where workspace_id = $1 and roofing_pipeline_stage in (''installed'',''closed_won'',''won'')'
      into v_jobs_closed using p_workspace_id;

    if v_leads_has_estimated_value then
      execute
        'select coalesce(sum(coalesce(estimated_job_value, 0))::numeric(14,2), 0)
         from public.leads
         where workspace_id = $1 and roofing_pipeline_stage in (''installed'',''closed_won'',''won'')'
        into v_revenue_closed using p_workspace_id;
    elsif v_leads_has_job_value then
      execute
        'select coalesce(sum(coalesce(job_value, 0))::numeric(14,2), 0)
         from public.leads
         where workspace_id = $1 and roofing_pipeline_stage in (''installed'',''closed_won'',''won'')'
        into v_revenue_closed using p_workspace_id;
    else
      v_revenue_closed := 0;
    end if;
  elsif v_has_estimates and v_estimates_has_status then
    if v_estimates_has_workspace then
      execute
        'select count(*)::bigint from public.estimates where workspace_id = $1 and status = ''approved'''
        into v_jobs_closed using p_workspace_id;
      if v_estimates_has_total then
        execute
          'select coalesce(sum(coalesce(total, 0))::numeric(14,2), 0)
           from public.estimates where workspace_id = $1 and status = ''approved'''
          into v_revenue_closed using p_workspace_id;
      end if;
    elsif v_estimates_has_company and v_has_roofing_companies then
      -- Join through roofing_companies -> workspace_id
      execute
        'select count(*)::bigint
         from public.estimates e
         join public.roofing_companies rc on rc.id = e.company_id
         where rc.workspace_id = $1 and e.status = ''approved'''
        into v_jobs_closed using p_workspace_id;
      if v_estimates_has_total then
        execute
          'select coalesce(sum(coalesce(e.total, 0))::numeric(14,2), 0)
           from public.estimates e
           join public.roofing_companies rc on rc.id = e.company_id
           where rc.workspace_id = $1 and e.status = ''approved'''
          into v_revenue_closed using p_workspace_id;
      end if;
    end if;
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
    jobs_closed_all_time,
    revenue_closed_all_time,
    created_at,
    updated_at
  )
  values (
    p_workspace_id,
    greatest(coalesce(v_emails, 0), 0),
    greatest(coalesce(v_replies, 0), 0),
    greatest(coalesce(v_hot, 0), 0),
    greatest(coalesce(v_warm, 0), 0),
    greatest(coalesce(v_jobs_booked, 0), 0),
    greatest(coalesce(v_value, 0), 0),
    greatest(coalesce(v_jobs_closed, 0), 0),
    greatest(coalesce(v_revenue_closed, 0), 0),
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
    jobs_closed_all_time = greatest(ss_moat_proof_stack.jobs_closed_all_time, excluded.jobs_closed_all_time),
    revenue_closed_all_time = greatest(ss_moat_proof_stack.revenue_closed_all_time, excluded.revenue_closed_all_time),
    updated_at = v_now;

  return jsonb_build_object(
    'workspace_id', p_workspace_id,
    'as_of', v_now,
    'emails_sent', v_emails,
    'replies', v_replies,
    'hot_all_time', v_hot,
    'warm_all_time', v_warm,
    'jobs_booked', v_jobs_booked,
    'estimated_value', v_value,
    'jobs_closed', v_jobs_closed,
    'revenue_closed', v_revenue_closed
  );
end;
$$;

revoke all on function public.ss_moat_recompute(uuid) from public;
grant execute on function public.ss_moat_recompute(uuid) to authenticated, service_role;

comment on function public.ss_moat_recompute(uuid) is
  'Block 267800 + 269500: Recomputes (and max-upserts) never-reset proof counters for a workspace (incl. jobs_closed + revenue_closed).';





