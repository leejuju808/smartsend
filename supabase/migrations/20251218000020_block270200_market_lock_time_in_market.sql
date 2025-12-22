-- =========================================================
-- BLOCK 270200 — SmartSend Market Lock Sprint
-- Time-in-Market Advantage (Visible)
--
-- Adds:
-- - Never-reset workspace "started_at" (market clock)
--   Stored on ss_moat_proof_stack so it persists even if logs are pruned.
-- - Extends ss_moat_recompute to compute + persist started_at (min-ever).
-- =========================================================

-- ---------------------------------------------------------
-- 1) Add started_at to never-reset proof stack
-- ---------------------------------------------------------
alter table public.ss_moat_proof_stack
  add column if not exists started_at timestamptz;

comment on column public.ss_moat_proof_stack.started_at is
  'Block 270200: Never-reset timestamp when SmartSend effectively started in this workspace (min-ever across sends/outreach/campaign creation).';

-- Backfill: if a row exists but started_at is missing, anchor it to row creation.
update public.ss_moat_proof_stack
set started_at = created_at
where started_at is null;

-- ---------------------------------------------------------
-- 2) Update ss_moat_recompute to persist started_at (min-ever)
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

  -- BLOCK 270200: never-reset market clock
  v_started_at timestamptz := null;
  v_existing_started_at timestamptz := null;
  v_first_send_at timestamptz := null;
  v_first_outreach_log_at timestamptz := null;
  v_first_campaign_at timestamptz := null;
  v_workspace_created_at timestamptz := null;

  v_has_send_logs boolean := false;
  v_send_logs_has_ws boolean := false;
  v_send_logs_has_status boolean := false;
  v_send_logs_has_sent_at boolean := false;
  v_send_logs_has_created_at boolean := false;

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

  -- BLOCK 270200: extra presence checks
  v_has_outreach_daily_log boolean := false;
  v_has_campaigns boolean := false;
  v_campaigns_has_ws boolean := false;
  v_campaigns_has_created_at boolean := false;
  v_has_workspaces boolean := false;
  v_workspaces_has_created_at boolean := false;

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

  -- BLOCK 270200
  select exists (select 1 from information_schema.tables where table_schema='public' and table_name='ss_outreach_daily_log')
    into v_has_outreach_daily_log;
  select exists (select 1 from information_schema.tables where table_schema='public' and table_name='campaigns')
    into v_has_campaigns;
  select exists (select 1 from information_schema.tables where table_schema='public' and table_name='workspaces')
    into v_has_workspaces;

  if v_has_send_logs then
    select exists (select 1 from information_schema.columns where table_schema='public' and table_name='send_logs' and column_name='workspace_id')
      into v_send_logs_has_ws;
    select exists (select 1 from information_schema.columns where table_schema='public' and table_name='send_logs' and column_name='status')
      into v_send_logs_has_status;
    select exists (select 1 from information_schema.columns where table_schema='public' and table_name='send_logs' and column_name='sent_at')
      into v_send_logs_has_sent_at;
    select exists (select 1 from information_schema.columns where table_schema='public' and table_name='send_logs' and column_name='created_at')
      into v_send_logs_has_created_at;
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

  if v_has_campaigns then
    select exists (select 1 from information_schema.columns where table_schema='public' and table_name='campaigns' and column_name='workspace_id')
      into v_campaigns_has_ws;
    select exists (select 1 from information_schema.columns where table_schema='public' and table_name='campaigns' and column_name='created_at')
      into v_campaigns_has_created_at;
  end if;

  if v_has_workspaces then
    select exists (select 1 from information_schema.columns where table_schema='public' and table_name='workspaces' and column_name='created_at')
      into v_workspaces_has_created_at;
  end if;

  -- Existing started_at (if we already have one, it must never move forward)
  begin
    select s.started_at
      into v_existing_started_at
    from public.ss_moat_proof_stack s
    where s.workspace_id = p_workspace_id;
  exception when undefined_column then
    v_existing_started_at := null;
  when undefined_table then
    v_existing_started_at := null;
  end;

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
  elsif v_has_leads then
    -- Simple heuristic if no value columns exist
    v_value := greatest(coalesce(v_hot, 0), 0) * 10000 + greatest(coalesce(v_warm, 0), 0) * 5000;
  end if;

  -- Jobs closed + revenue closed
  if v_has_leads and v_leads_has_pipeline_stage then
    execute
      'select count(*)::bigint from public.leads where workspace_id = $1 and roofing_pipeline_stage in (''installed'',''closed_won'',''won'')'
      into v_jobs_closed using p_workspace_id;

    if v_leads_has_job_value then
      execute
        'select coalesce(sum(coalesce(job_value, 0))::numeric(14,2), 0)
         from public.leads
         where workspace_id = $1 and roofing_pipeline_stage in (''installed'',''closed_won'',''won'')'
        into v_revenue_closed using p_workspace_id;
    elsif v_leads_has_estimated_value then
      execute
        'select coalesce(sum(coalesce(estimated_job_value, 0))::numeric(14,2), 0)
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

  -- -------------------------------------------------------
  -- BLOCK 270200: compute started_at (min-ever)
  -- -------------------------------------------------------
  -- Workspace created_at (fallback anchor)
  if v_has_workspaces and v_workspaces_has_created_at then
    begin
      execute 'select created_at from public.workspaces where id = $1' into v_workspace_created_at using p_workspace_id;
    exception when others then
      v_workspace_created_at := null;
    end;
  end if;

  -- First campaign creation (soft start)
  if v_has_campaigns and v_campaigns_has_ws and v_campaigns_has_created_at then
    begin
      execute 'select min(created_at) from public.campaigns where workspace_id = $1' into v_first_campaign_at using p_workspace_id;
    exception when others then
      v_first_campaign_at := null;
    end;
  end if;

  -- First outreach proof-of-life (system is running)
  if v_has_outreach_daily_log then
    begin
      execute 'select min(ran_at) from public.ss_outreach_daily_log where workspace_id = $1' into v_first_outreach_log_at using p_workspace_id;
    exception when others then
      v_first_outreach_log_at := null;
    end;
  end if;

  -- First send (hard start)
  if v_has_send_logs then
    begin
      if v_send_logs_has_ws then
        if v_send_logs_has_sent_at then
          execute
            'select min(sent_at) from public.send_logs where workspace_id = $1 and sent_at is not null'
            into v_first_send_at using p_workspace_id;
        elsif v_send_logs_has_created_at then
          execute
            'select min(created_at) from public.send_logs where workspace_id = $1'
            into v_first_send_at using p_workspace_id;
        end if;
      else
        if array_length(v_campaign_ids, 1) is not null then
          if v_send_logs_has_sent_at then
            execute
              'select min(sent_at) from public.send_logs where campaign_id = any($1) and sent_at is not null'
              into v_first_send_at using v_campaign_ids;
          elsif v_send_logs_has_created_at then
            execute
              'select min(created_at) from public.send_logs where campaign_id = any($1)'
              into v_first_send_at using v_campaign_ids;
          end if;
        end if;
      end if;
    exception when others then
      v_first_send_at := null;
    end;
  end if;

  -- Fold into a single started_at value
  v_started_at := null;
  if v_workspace_created_at is not null then
    v_started_at := v_workspace_created_at;
  end if;
  if v_first_campaign_at is not null then
    v_started_at := case when v_started_at is null then v_first_campaign_at else least(v_started_at, v_first_campaign_at) end;
  end if;
  if v_first_outreach_log_at is not null then
    v_started_at := case when v_started_at is null then v_first_outreach_log_at else least(v_started_at, v_first_outreach_log_at) end;
  end if;
  if v_first_send_at is not null then
    v_started_at := case when v_started_at is null then v_first_send_at else least(v_started_at, v_first_send_at) end;
  end if;

  -- Never move forward: if we already had a started_at, keep the earliest of both.
  if v_existing_started_at is not null then
    v_started_at := case when v_started_at is null then v_existing_started_at else least(v_existing_started_at, v_started_at) end;
  end if;

  v_started_at := coalesce(v_started_at, v_existing_started_at, v_now);

  -- Upsert (max-so-far + min-ever started_at)
  insert into public.ss_moat_proof_stack(
    workspace_id,
    started_at,
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
    v_started_at,
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
    started_at = coalesce(least(ss_moat_proof_stack.started_at, excluded.started_at), ss_moat_proof_stack.started_at, excluded.started_at),
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
    'started_at', v_started_at,
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
  'Block 267800 + 269500 + 270200: Recomputes (and max-upserts) never-reset proof counters for a workspace; also persists started_at (min-ever) for the market clock.';




