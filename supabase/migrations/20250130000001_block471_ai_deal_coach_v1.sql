-- Block 471 — AI Deal Coach v1
-- Deal Analysis • Win Probability Engine • Next-Step Guidance • Objection Handling • Pipeline Intelligence
-- This block adds the intelligence layer on top of Deals — the AI that analyzes deals, predicts outcomes, and tells SDRs exactly what to do next.

-- ============================================================================
-- 1️⃣ DEAL COACH INSIGHTS TABLE
-- ============================================================================

create table if not exists public.deal_coach_insights (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  
  -- Win Probability Engine Outputs
  win_probability int check (win_probability >= 0 and win_probability <= 100),
  confidence_score numeric check (confidence_score >= 0 and confidence_score <= 1),
  
  -- Deal Summary (AI-Generated)
  summary text,
  
  -- Risk Factors
  risk_tags text[] default '{}'::text[],
  risk_factors jsonb default '{}'::jsonb, -- Detailed risk data
  
  -- Next Step Engine
  recommended_next_action text,
  recommended_action_type text check (recommended_action_type in (
    'send_followup_email',
    'send_pricing_reminder',
    'send_case_study',
    'sms_nudge',
    'call_attempt',
    'linkedin_touch',
    'reshare_proposal',
    'ask_clarifying_question',
    'schedule_demo',
    'ask_timeline',
    'request_buying_process',
    'other'
  )),
  recommended_timing timestamptz,
  recommended_timing_reason text,
  
  -- Objection Handling
  detected_objections text[] default '{}'::text[],
  objection_responses jsonb default '{}'::jsonb, -- Map of objection -> AI-generated response
  
  -- SDR Priority
  sdr_priority text check (sdr_priority in ('low', 'medium', 'high', 'urgent')) default 'medium',
  priority_reason text,
  
  -- Message Template (1-click insert)
  suggested_message_template text,
  suggested_message_subject text,
  
  -- Analysis Metadata
  analysis_factors jsonb default '{}'::jsonb, -- Stage weight, reply engagement, ICP match, etc.
  last_analyzed_at timestamptz default now(),
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  unique(deal_id)
);

create index if not exists idx_deal_coach_insights_deal on public.deal_coach_insights(deal_id);
create index if not exists idx_deal_coach_insights_workspace on public.deal_coach_insights(workspace_id);
create index if not exists idx_deal_coach_insights_priority on public.deal_coach_insights(sdr_priority, workspace_id);
create index if not exists idx_deal_coach_insights_win_prob on public.deal_coach_insights(win_probability desc, workspace_id);
create index if not exists idx_deal_coach_insights_last_analyzed on public.deal_coach_insights(last_analyzed_at desc);

-- Trigger to update updated_at
create trigger trg_deal_coach_insights_updated_at
before update on public.deal_coach_insights
for each row
execute function public.set_updated_at();

-- ============================================================================
-- 2️⃣ DEAL COACH REPORTS TABLE (Pipeline-Wide Daily Reports)
-- ============================================================================

create table if not exists public.deal_coach_reports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  report_date date not null,
  
  -- Report Content
  priority_deals jsonb default '[]'::jsonb, -- Array of {deal_id, win_probability, action_needed}
  stalled_deals jsonb default '[]'::jsonb, -- Array of {deal_id, stage, days_since_activity}
  risks jsonb default '[]'::jsonb, -- Array of risk descriptions
  opportunities jsonb default '[]'::jsonb, -- Array of opportunity descriptions
  
  -- Summary Stats
  total_deals int default 0,
  high_priority_deals int default 0,
  stalled_deals_count int default 0,
  avg_win_probability numeric,
  
  created_at timestamptz not null default now(),
  
  unique(workspace_id, brand_id, report_date)
);

create index if not exists idx_deal_coach_reports_workspace on public.deal_coach_reports(workspace_id, report_date desc);
create index if not exists idx_deal_coach_reports_brand on public.deal_coach_reports(brand_id, report_date desc) where brand_id is not null;
create index if not exists idx_deal_coach_reports_date on public.deal_coach_reports(report_date desc);

-- ============================================================================
-- 3️⃣ DEAL COACH ACTIVITY LOG TABLE
-- ============================================================================

create table if not exists public.deal_coach_activity (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  
  action_type text not null check (action_type in (
    'analyzed',
    'probability_updated',
    'next_action_suggested',
    'objection_response_generated',
    'risk_detected',
    'summary_generated'
  )),
  action_details jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_deal_coach_activity_deal on public.deal_coach_activity(deal_id, created_at desc);
create index if not exists idx_deal_coach_activity_workspace on public.deal_coach_activity(workspace_id, created_at desc);

-- ============================================================================
-- 4️⃣ HELPER FUNCTION: Calculate Win Probability
-- ============================================================================

create or replace function public.calculate_deal_win_probability(
  p_deal_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_deal record;
  v_lead record;
  v_base_probability int;
  v_final_probability int;
  v_confidence numeric;
  v_factors jsonb := '{}'::jsonb;
  v_stage_weight int;
  v_reply_engagement_score int := 0;
  v_icp_score int;
  v_velocity_score int := 0;
  v_meeting_quality_score int := 0;
  v_competitor_penalty int := 0;
  v_research_boost int := 0;
  v_days_in_stage int;
  v_last_reply_days int;
  v_meeting_notes text;
  v_competitor_mentions int;
begin
  -- Get deal data
  select * into v_deal
  from public.deals
  where id = p_deal_id;
  
  if not found then
    return jsonb_build_object('error', 'Deal not found');
  end if;
  
  -- Get lead data
  select * into v_lead
  from public.leads
  where id = v_deal.lead_id;
  
  -- A. Stage weight (baseline probability)
  case v_deal.stage
    when 'Qualified' then v_stage_weight := 35;
    when 'Meeting Scheduled' then v_stage_weight := 45;
    when 'Proposal Sent' then v_stage_weight := 60;
    when 'Negotiation' then v_stage_weight := 75;
    when 'Won' then return jsonb_build_object('win_probability', 100, 'confidence', 1.0, 'factors', jsonb_build_object('stage', 'Won'));
    when 'Lost' then return jsonb_build_object('win_probability', 0, 'confidence', 1.0, 'factors', jsonb_build_object('stage', 'Lost'));
    else v_stage_weight := 20; -- Default for 'New' or unknown stages
  end case;
  
  v_base_probability := v_stage_weight;
  v_factors := jsonb_set(v_factors, '{stage_weight}', to_jsonb(v_stage_weight));
  
  -- B. Reply engagement
  select 
    extract(day from (now() - max(created_at)))::int
  into v_last_reply_days
  from public.campaign_logs
  where lead_id = v_deal.lead_id
    and direction = 'inbound'
    and created_at > now() - interval '30 days';
  
  if v_last_reply_days is not null then
    if v_last_reply_days <= 7 then
      v_reply_engagement_score := 10;
    elsif v_last_reply_days <= 10 then
      v_reply_engagement_score := 0;
    elsif v_last_reply_days <= 14 then
      v_reply_engagement_score := -5;
    else
      v_reply_engagement_score := -18;
    end if;
  else
    -- No reply in last 30 days
    v_reply_engagement_score := -15;
  end if;
  
  v_factors := jsonb_set(v_factors, '{reply_engagement}', to_jsonb(v_reply_engagement_score));
  
  -- C. ICP match
  if v_lead.icp_score is not null then
    if v_lead.icp_score >= 80 then
      v_icp_score := 8;
    elsif v_lead.icp_score >= 60 then
      v_icp_score := 5;
    elsif v_lead.icp_score >= 40 then
      v_icp_score := 0;
    else
      v_icp_score := -5;
    end if;
  else
    v_icp_score := 0;
  end if;
  
  v_factors := jsonb_set(v_factors, '{icp_score}', to_jsonb(v_icp_score));
  
  -- D. Deal velocity (days in current stage)
  select extract(day from (now() - v_deal.updated_at))::int into v_days_in_stage;
  
  if v_days_in_stage > 30 then
    v_velocity_score := -10;
  elsif v_days_in_stage > 14 then
    v_velocity_score := -5;
  elsif v_days_in_stage > 7 then
    v_velocity_score := 0;
  else
    v_velocity_score := 5; -- Fast-moving deals get boost
  end if;
  
  v_factors := jsonb_set(v_factors, '{velocity_score}', to_jsonb(v_velocity_score));
  
  -- E. Meeting quality (analyze meeting notes)
  select string_agg(dn.note_text, ' ')
  into v_meeting_notes
  from public.deal_notes dn
  where dn.deal_id = p_deal_id
    and dn.note_text ilike '%meeting%'
    and dn.created_at > now() - interval '30 days';
  
  if v_meeting_notes is not null then
    -- Simple sentiment analysis (can be enhanced with AI)
    if v_meeting_notes ilike '%positive%' or v_meeting_notes ilike '%interested%' or v_meeting_notes ilike '%excited%' then
      v_meeting_quality_score := 8;
    elsif v_meeting_notes ilike '%negative%' or v_meeting_notes ilike '%concern%' or v_meeting_notes ilike '%not interested%' then
      v_meeting_quality_score := -12;
    else
      v_meeting_quality_score := 0;
    end if;
  end if;
  
  v_factors := jsonb_set(v_factors, '{meeting_quality_score}', to_jsonb(v_meeting_quality_score));
  
  -- F. Competitor mentions (from email context)
  select count(*)
  into v_competitor_mentions
  from public.campaign_logs
  where lead_id = v_deal.lead_id
    and (snippet ilike '%competitor%' or snippet ilike '%alternative%' or snippet ilike '%comparing%')
    and created_at > now() - interval '30 days';
  
  if v_competitor_mentions > 0 then
    v_competitor_penalty := -9;
  end if;
  
  v_factors := jsonb_set(v_factors, '{competitor_penalty}', to_jsonb(v_competitor_penalty));
  
  -- G. Research Agent signals (from lead_enrichment or research_cache)
  -- This would be enhanced with actual research data
  -- For now, placeholder
  v_research_boost := 0;
  v_factors := jsonb_set(v_factors, '{research_boost}', to_jsonb(v_research_boost));
  
  -- Calculate final probability
  v_final_probability := greatest(0, least(100, 
    v_base_probability + 
    v_reply_engagement_score + 
    v_icp_score + 
    v_velocity_score + 
    v_meeting_quality_score + 
    v_competitor_penalty + 
    v_research_boost
  ));
  
  -- Calculate confidence based on data availability
  v_confidence := 0.5; -- Base confidence
  if v_last_reply_days is not null then v_confidence := v_confidence + 0.1; end if;
  if v_lead.icp_score is not null then v_confidence := v_confidence + 0.1; end if;
  if v_meeting_notes is not null then v_confidence := v_confidence + 0.08; end if;
  v_confidence := least(0.95, v_confidence);
  
  return jsonb_build_object(
    'win_probability', v_final_probability,
    'confidence', v_confidence,
    'factors', v_factors
  );
end;
$$;

-- ============================================================================
-- 5️⃣ HELPER FUNCTION: Detect Risk Factors
-- ============================================================================

create or replace function public.detect_deal_risk_factors(
  p_deal_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_deal record;
  v_risks jsonb := '[]'::jsonb;
  v_risk_tags text[] := '{}'::text[];
  v_last_reply_days int;
  v_days_in_stage int;
  v_competitor_mentions int;
  v_negative_sentiment boolean := false;
begin
  -- Get deal data
  select * into v_deal
  from public.deals
  where id = p_deal_id;
  
  if not found then
    return jsonb_build_object('risks', '[]'::jsonb, 'risk_tags', '{}'::text[]);
  end if;
  
  -- Risk: No reply in X days
  select 
    extract(day from (now() - max(created_at)))::int
  into v_last_reply_days
  from public.campaign_logs
  where lead_id = v_deal.lead_id
    and direction = 'inbound'
    and created_at > now() - interval '60 days';
  
  if v_last_reply_days is null or v_last_reply_days > 10 then
    v_risks := v_risks || jsonb_build_object(
      'type', 'no_reply',
      'severity', case when v_last_reply_days > 14 then 'high' else 'medium' end,
      'message', format('No reply in %s days', coalesce(v_last_reply_days, 60)),
      'days', coalesce(v_last_reply_days, 60)
    );
    v_risk_tags := array_append(v_risk_tags, format('No reply (%s days)', coalesce(v_last_reply_days, 60)));
  end if;
  
  -- Risk: Deal stuck in stage
  select extract(day from (now() - v_deal.updated_at))::int into v_days_in_stage;
  
  if v_days_in_stage > 14 and v_deal.stage not in ('Won', 'Lost') then
    v_risks := v_risks || jsonb_build_object(
      'type', 'stuck_in_stage',
      'severity', case when v_days_in_stage > 30 then 'high' else 'medium' end,
      'message', format('Deal stuck in %s stage for %s days', v_deal.stage, v_days_in_stage),
      'stage', v_deal.stage,
      'days', v_days_in_stage
    );
    v_risk_tags := array_append(v_risk_tags, format('Stuck in %s (%s days)', v_deal.stage, v_days_in_stage));
  end if;
  
  -- Risk: Competitor mentions
  select count(*)
  into v_competitor_mentions
  from public.campaign_logs
  where lead_id = v_deal.lead_id
    and (snippet ilike '%competitor%' or snippet ilike '%alternative%' or snippet ilike '%comparing%')
    and created_at > now() - interval '30 days';
  
  if v_competitor_mentions > 0 then
    v_risks := v_risks || jsonb_build_object(
      'type', 'competitor_reference',
      'severity', 'medium',
      'message', 'Competitor mentioned in communications',
      'mentions', v_competitor_mentions
    );
    v_risk_tags := array_append(v_risk_tags, 'Competitor reference');
  end if;
  
  -- Risk: Negative sentiment
  if v_deal.sentiment = 'negative' then
    v_risks := v_risks || jsonb_build_object(
      'type', 'negative_sentiment',
      'severity', 'high',
      'message', 'Negative sentiment detected'
    );
    v_risk_tags := array_append(v_risk_tags, 'Negative sentiment');
  end if;
  
  return jsonb_build_object(
    'risks', v_risks,
    'risk_tags', v_risk_tags
  );
end;
$$;

-- ============================================================================
-- 6️⃣ RLS POLICIES
-- ============================================================================

alter table public.deal_coach_insights enable row level security;
alter table public.deal_coach_reports enable row level security;
alter table public.deal_coach_activity enable row level security;

-- Deal Coach Insights RLS
create policy "deal_coach_insights_select_workspace_member" on public.deal_coach_insights
  for select
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = deal_coach_insights.workspace_id
      and wm.user_id = auth.uid()
    )
  );

create policy "deal_coach_insights_insert_service" on public.deal_coach_insights
  for insert
  with check (true);

create policy "deal_coach_insights_update_service" on public.deal_coach_insights
  for update
  using (true)
  with check (true);

-- Deal Coach Reports RLS
create policy "deal_coach_reports_select_workspace_member" on public.deal_coach_reports
  for select
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = deal_coach_reports.workspace_id
      and wm.user_id = auth.uid()
    )
  );

create policy "deal_coach_reports_insert_service" on public.deal_coach_reports
  for insert
  with check (true);

-- Deal Coach Activity RLS
create policy "deal_coach_activity_select_workspace_member" on public.deal_coach_activity
  for select
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = deal_coach_activity.workspace_id
      and wm.user_id = auth.uid()
    )
  );

create policy "deal_coach_activity_insert_service" on public.deal_coach_activity
  for insert
  with check (true);

-- ============================================================================
-- 7️⃣ GRANT PERMISSIONS
-- ============================================================================

grant execute on function public.calculate_deal_win_probability(uuid) to service_role, authenticated;
grant execute on function public.detect_deal_risk_factors(uuid) to service_role, authenticated;

grant select on public.deal_coach_insights to authenticated;
grant select on public.deal_coach_reports to authenticated;
grant select on public.deal_coach_activity to authenticated;

-- ============================================================================
-- 8️⃣ COMMENTS
-- ============================================================================

comment on table public.deal_coach_insights is 'AI-generated insights for each deal: win probability, next steps, objections, risks, and recommendations';
comment on table public.deal_coach_reports is 'Daily pipeline-wide AI reports with priority deals, stalled deals, risks, and opportunities';
comment on table public.deal_coach_activity is 'Activity log of AI Deal Coach actions (analyzes, updates, suggestions)';

comment on function public.calculate_deal_win_probability(uuid) is 'Calculates win probability based on stage, reply engagement, ICP match, velocity, meeting quality, competitor mentions, and research signals';
comment on function public.detect_deal_risk_factors(uuid) is 'Detects risk factors like no reply, stuck deals, competitor mentions, negative sentiment';

-- ============================================================================
-- 9️⃣ TRIGGER: Auto-Analyze Deal When Updated
-- ============================================================================

-- Ensure pg_net extension is available
create extension if not exists pg_net;

-- Create function to trigger AI Deal Coach analysis
create or replace function public.trigger_ai_deal_coach()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  func_url text;
  payload jsonb;
begin
  -- Only trigger for open deals
  if new.status != 'open' then
    return new;
  end if;
  
  -- Build the edge function URL
  func_url := coalesce(
    current_setting('app.supabase_url', true),
    current_setting('app.public_supabase_url', true),
    'https://' || current_setting('app.project_ref', true) || '.supabase.co'
  ) || '/functions/v1/ai-deal-coach';
  
  -- Build payload
  payload := jsonb_build_object(
    'deal_id', new.id,
    'workspace_id', new.workspace_id,
    'trigger', 'deal_update',
    'brand_id', new.brand_id
  );
  
  -- Call Edge Function via HTTP if pg_net is available
  if exists (select 1 from pg_extension where extname = 'pg_net') then
    -- Fire and forget - don't wait for response
    perform net.http_post(
      url := func_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(
          current_setting('app.supabase_service_role_key', true),
          current_setting('app.service_role_key', true)
        )
      ),
      body := payload
    );
  else
    -- Log warning if pg_net is not available
    raise warning 'pg_net extension not available, cannot call ai-deal-coach function';
  end if;
  
  return new;
exception
  when others then
    -- Log error but don't fail the update
    raise warning 'Failed to trigger ai-deal-coach: %', sqlerrm;
    return new;
end;
$$;

-- Drop existing trigger if exists
drop trigger if exists trg_ai_deal_coach_on_deal_update on public.deals;

-- Create trigger on deals table (after update)
create trigger trg_ai_deal_coach_on_deal_update
after update of stage, probability, status, value, updated_at on public.deals
for each row
when (new.status = 'open')
execute function public.trigger_ai_deal_coach();

-- Also trigger on insert for new deals
drop trigger if exists trg_ai_deal_coach_on_deal_insert on public.deals;

create trigger trg_ai_deal_coach_on_deal_insert
after insert on public.deals
for each row
when (new.status = 'open')
execute function public.trigger_ai_deal_coach();

-- ============================================================================
-- 🔟 FUNCTION: Generate Daily Report (Called by Cron)
-- ============================================================================

create or replace function public.generate_daily_deal_coach_report()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  func_url text;
  workspace_record record;
begin
  -- Build the edge function URL
  func_url := coalesce(
    current_setting('app.supabase_url', true),
    current_setting('app.public_supabase_url', true),
    'https://' || current_setting('app.project_ref', true) || '.supabase.co'
  ) || '/functions/v1/ai-deal-coach';
  
  -- Loop through all workspaces
  for workspace_record in
    select id from public.workspaces
  loop
    -- Build payload for daily report
    perform net.http_post(
      url := func_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(
          current_setting('app.supabase_service_role_key', true),
          current_setting('app.service_role_key', true)
        )
      ),
      body := jsonb_build_object(
        'workspace_id', workspace_record.id,
        'trigger', 'daily_report'
      )
    );
  end loop;
exception
  when others then
    raise warning 'Failed to generate daily deal coach reports: %', sqlerrm;
end;
$$;

-- ============================================================================
-- 1️⃣1️⃣ CRON JOB SETUP (Daily at 6 AM)
-- ============================================================================

-- Note: Cron job configuration should be added to supabase/config.toml:
-- [cron.jobs."ai-deal-coach-daily"]
-- schedule = "0 6 * * *"   # Daily at 6 AM UTC
-- endpoint = "/functions/v1/ai-deal-coach"
-- 
-- Or use pg_cron extension:
-- select cron.schedule(
--   'ai-deal-coach-daily-report',
--   '0 6 * * *',
--   $$ select public.generate_daily_deal_coach_report(); $$
-- );

-- ============================================================================
-- Block 471 Database Schema Complete ✅
-- ============================================================================

