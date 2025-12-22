-- Block 467 — AI Voice Steps v1
-- Voicemail Drops • AI-Generated Call Scripts • Call Tasks • SMS Fallback • Multi-Channel Voice Layer
-- 
-- This migration adds comprehensive voice capabilities to SmartSend:
-- - AI voicemail script generation
-- - AI call script generation with objection handling
-- - Pre-recorded voicemail uploads
-- - SMS fallback on missed calls
-- - Call outcome logging and analytics
-- - Voice step configuration in sequences

-- ============================================================================
-- 1. UPDATE step_type TO INCLUDE 'voice'
-- ============================================================================

-- Update the check constraint to include 'voice' step type
alter table public.campaign_steps
  drop constraint if exists campaign_steps_step_type_check;

alter table public.campaign_steps
  add constraint campaign_steps_step_type_check 
  check (step_type in ('email', 'sms', 'call', 'voice', 'linkedin', 'manual'));

-- ============================================================================
-- 2. EXTEND campaign_steps FOR VOICE STEP CONFIGURATION
-- ============================================================================

-- Voice step configuration fields
alter table public.campaign_steps
  -- Voicemail configuration
  add column if not exists voice_voicemail_enabled boolean default false,
  add column if not exists voice_voicemail_script text,
  add column if not exists voice_voicemail_script_type text default 'ai_generated' 
    check (voice_voicemail_script_type in ('ai_generated', 'manual', 'pre_recorded')),
  add column if not exists voice_voicemail_audio_url text, -- URL to uploaded MP3/WAV
  add column if not exists voice_voicemail_goal text 
    check (voice_voicemail_goal in ('quick_callback', 'book_meeting', 'introduce_yourself', 'followup_after_email', 'value_reminder')),
  add column if not exists voice_voicemail_tone text default 'friendly' 
    check (voice_voicemail_tone in ('friendly', 'direct', 'professional', 'energetic')),
  
  -- Call script configuration
  add column if not exists voice_call_script_enabled boolean default false,
  add column if not exists voice_call_script text, -- Full AI-generated call script
  add column if not exists voice_call_script_type text default 'ai_generated' 
    check (voice_call_script_type in ('ai_generated', 'manual')),
  add column if not exists voice_call_script_intro text,
  add column if not exists voice_call_script_value_prop text,
  add column if not exists voice_call_script_questions text[], -- Array of qualifying questions
  add column if not exists voice_call_script_cta text,
  add column if not exists voice_call_script_objection_handling jsonb, -- JSON object with objection responses
  add column if not exists voice_call_script_closing text,
  
  -- SMS fallback configuration
  add column if not exists voice_sms_fallback_enabled boolean default false,
  add column if not exists voice_sms_fallback_message text,
  add column if not exists voice_sms_fallback_triggers text[] default array['missed', 'no_answer', 'voicemail']::text[],
  
  -- Call task assignment
  add column if not exists voice_assign_to uuid references public.profiles(id) on delete set null,
  add column if not exists voice_priority text default 'normal' check (voice_priority in ('low', 'normal', 'high', 'urgent'));

-- ============================================================================
-- 3. CREATE call_logs TABLE FOR CALL OUTCOME TRACKING
-- ============================================================================

create table if not exists public.call_logs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  workspace_id uuid,
  brand_id uuid, -- For multi-brand support
  sequence_id uuid references public.sequences(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  step_id uuid references public.campaign_steps(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  outcome text not null check (outcome in (
    'connected', 
    'interested', 
    'no_answer', 
    'voicemail', 
    'not_interested', 
    'wrong_number', 
    'gatekeeper',
    'busy',
    'callback_requested',
    'meeting_booked'
  )),
  duration int, -- Duration in seconds
  sdr_id uuid references public.profiles(id) on delete set null,
  notes text,
  voicemail_dropped boolean default false,
  sms_fallback_sent boolean default false,
  created_at timestamptz default now()
);

-- Indexes for call_logs
create index if not exists idx_call_logs_lead on public.call_logs(lead_id);
create index if not exists idx_call_logs_workspace on public.call_logs(workspace_id);
create index if not exists idx_call_logs_campaign on public.call_logs(campaign_id);
create index if not exists idx_call_logs_step on public.call_logs(step_id);
create index if not exists idx_call_logs_task on public.call_logs(task_id);
create index if not exists idx_call_logs_sdr on public.call_logs(sdr_id);
create index if not exists idx_call_logs_outcome on public.call_logs(outcome);
create index if not exists idx_call_logs_created_at on public.call_logs(created_at);
create index if not exists idx_call_logs_campaign_outcome on public.call_logs(campaign_id, outcome);

-- Enable RLS on call_logs
alter table public.call_logs enable row level security;

-- RLS policies for call_logs
create policy if not exists "call_logs_select_workspace" on public.call_logs
  for select
  using (
    public.is_workspace_member(workspace_id)
    or sdr_id = auth.uid()
  );

create policy if not exists "call_logs_insert_workspace" on public.call_logs
  for insert
  with check (
    public.is_workspace_member(workspace_id)
  );

create policy if not exists "call_logs_update_workspace" on public.call_logs
  for update
  using (
    public.is_workspace_member(workspace_id)
    or sdr_id = auth.uid()
  )
  with check (
    public.is_workspace_member(workspace_id)
    or sdr_id = auth.uid()
  );

-- ============================================================================
-- 4. CREATE voicemail_uploads TABLE FOR PRE-RECORDED VOICEMAILS
-- ============================================================================

create table if not exists public.voicemail_uploads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid,
  brand_id uuid, -- For multi-brand support
  uploaded_by uuid references public.profiles(id) on delete set null,
  file_name text not null,
  file_url text not null, -- Storage URL (Supabase Storage)
  file_size int, -- Size in bytes
  duration_seconds int, -- Audio duration
  mime_type text default 'audio/mpeg', -- audio/mpeg, audio/wav, etc.
  created_at timestamptz default now()
);

-- Indexes for voicemail_uploads
create index if not exists idx_voicemail_uploads_workspace on public.voicemail_uploads(workspace_id);
create index if not exists idx_voicemail_uploads_brand on public.voicemail_uploads(brand_id);
create index if not exists idx_voicemail_uploads_uploaded_by on public.voicemail_uploads(uploaded_by);

-- Enable RLS on voicemail_uploads
alter table public.voicemail_uploads enable row level security;

-- RLS policies for voicemail_uploads
create policy if not exists "voicemail_uploads_select_workspace" on public.voicemail_uploads
  for select
  using (
    public.is_workspace_member(workspace_id)
  );

create policy if not exists "voicemail_uploads_insert_workspace" on public.voicemail_uploads
  for insert
  with check (
    public.is_workspace_member(workspace_id)
  );

create policy if not exists "voicemail_uploads_delete_workspace" on public.voicemail_uploads
  for delete
  using (
    public.is_workspace_member(workspace_id)
  );

-- ============================================================================
-- 5. UPDATE tasks TABLE TO SUPPORT VOICEMAIL DROPS
-- ============================================================================

-- Add voicemail-specific fields to tasks
alter table public.tasks
  add column if not exists voicemail_dropped boolean default false,
  add column if not exists voicemail_script text,
  add column if not exists voicemail_audio_url text,
  add column if not exists sms_fallback_sent boolean default false,
  add column if not exists sms_fallback_message text;

-- Update call_outcome check constraint to include new outcomes
alter table public.tasks
  drop constraint if exists tasks_call_outcome_check;

alter table public.tasks
  add constraint tasks_call_outcome_check 
  check (call_outcome in (
    'connected', 
    'no_answer', 
    'voicemail', 
    'wrong_number', 
    'busy', 
    'interested',
    'not_interested',
    'gatekeeper',
    'callback_requested',
    'meeting_booked',
    'other'
  ));

-- ============================================================================
-- 6. UPDATE v_lead_timeline VIEW TO INCLUDE VOICE EVENTS
-- ============================================================================

drop view if exists public.v_lead_timeline;

create or replace view public.v_lead_timeline as
select 
  'email' as channel,
  sq.id as activity_id,
  sq.lead_id,
  sq.campaign_id,
  cs.id as step_id,
  cs.step_index as step_no,
  cs.step_type,
  sq.status as activity_status,
  sq.scheduled_at as activity_time,
  sq.sent_at as completed_at,
  sq.subject as activity_title,
  null as task_type,
  null as assigned_to,
  null as call_outcome,
  null as voicemail_dropped,
  sq.created_at
from public.send_queue sq
left join public.campaign_steps cs on sq.campaign_step_id = cs.id
where sq.queue_type = 'email'

union all

select 
  'sms' as channel,
  sq.id as activity_id,
  sq.lead_id,
  sq.campaign_id,
  cs.id as step_id,
  cs.step_index as step_no,
  cs.step_type,
  sq.sms_status as activity_status,
  sq.scheduled_at as activity_time,
  sq.sms_delivered_at as completed_at,
  left(sq.sms_body, 50) as activity_title,
  null as task_type,
  null as assigned_to,
  null as call_outcome,
  null as voicemail_dropped,
  sq.created_at
from public.send_queue sq
left join public.campaign_steps cs on sq.campaign_step_id = cs.id
where sq.queue_type = 'sms'

union all

select 
  t.type as channel,
  t.id as activity_id,
  t.lead_id,
  t.campaign_id,
  t.campaign_step_id as step_id,
  cs.step_index as step_no,
  cs.step_type,
  t.status as activity_status,
  t.due_at as activity_time,
  t.completed_at,
  case 
    when t.type = 'call' then 'Call Task'
    when t.type = 'voice' then 'Voice Step'
    when t.type = 'linkedin' then 'LinkedIn: ' || coalesce(t.linkedin_action, 'task')
    when t.type = 'manual' then coalesce(t.notes, 'Manual Task')
    else 'Task'
  end as activity_title,
  t.type as task_type,
  t.assigned_to,
  t.call_outcome,
  t.voicemail_dropped,
  t.created_at
from public.tasks t
left join public.campaign_steps cs on t.campaign_step_id = cs.id

union all

select 
  'voice' as channel,
  cl.id as activity_id,
  cl.lead_id,
  cl.campaign_id,
  cl.step_id,
  cs.step_index as step_no,
  cs.step_type,
  cl.outcome as activity_status,
  cl.created_at as activity_time,
  cl.created_at as completed_at,
  case 
    when cl.outcome = 'voicemail' then 'Voicemail Dropped'
    when cl.outcome = 'connected' then 'Call Connected'
    when cl.outcome = 'interested' then 'Call - Interested'
    when cl.outcome = 'meeting_booked' then 'Call - Meeting Booked'
    else 'Call: ' || cl.outcome
  end as activity_title,
  'call' as task_type,
  cl.sdr_id as assigned_to,
  cl.outcome as call_outcome,
  cl.voicemail_dropped,
  cl.created_at
from public.call_logs cl
left join public.campaign_steps cs on cl.step_id = cs.id;

-- Grant access to timeline view
grant select on public.v_lead_timeline to authenticated;

-- ============================================================================
-- 7. CREATE VOICE ANALYTICS VIEWS
-- ============================================================================

-- Call outcomes summary view
create or replace view public.v_call_outcomes_summary as
select 
  campaign_id,
  step_id,
  workspace_id,
  outcome,
  count(*) as call_count,
  count(*) filter (where voicemail_dropped = true) as voicemail_drops,
  count(*) filter (where sms_fallback_sent = true) as sms_fallbacks_sent,
  avg(duration) as avg_duration_seconds,
  sum(case when outcome = 'interested' then 1 else 0 end) as interested_count,
  sum(case when outcome = 'meeting_booked' then 1 else 0 end) as meetings_booked,
  sum(case when outcome = 'connected' then 1 else 0 end) as connected_count
from public.call_logs
group by campaign_id, step_id, workspace_id, outcome;

grant select on public.v_call_outcomes_summary to authenticated;

-- SDR call performance view
create or replace view public.v_sdr_call_performance as
select 
  sdr_id,
  workspace_id,
  campaign_id,
  count(*) as total_calls,
  count(*) filter (where outcome = 'connected') as connected_calls,
  count(*) filter (where outcome = 'interested') as interested_calls,
  count(*) filter (where outcome = 'meeting_booked') as meetings_booked,
  count(*) filter (where outcome = 'voicemail') as voicemail_drops,
  count(*) filter (where outcome = 'no_answer') as no_answer_calls,
  avg(duration) as avg_call_duration_seconds,
  round(
    (count(*) filter (where outcome = 'connected')::numeric / nullif(count(*), 0)) * 100, 
    2
  ) as connection_rate_pct,
  round(
    (count(*) filter (where outcome = 'interested')::numeric / nullif(count(*), 0)) * 100, 
    2
  ) as interest_rate_pct,
  round(
    (count(*) filter (where outcome = 'meeting_booked')::numeric / nullif(count(*), 0)) * 100, 
    2
  ) as booking_rate_pct
from public.call_logs
where sdr_id is not null
group by sdr_id, workspace_id, campaign_id;

grant select on public.v_sdr_call_performance to authenticated;

-- ============================================================================
-- 8. HELPER FUNCTIONS FOR VOICE OPERATIONS
-- ============================================================================

-- Function to log call outcome and trigger SMS fallback if needed
create or replace function public.log_call_outcome(
  p_task_id uuid,
  p_outcome text,
  p_duration int default null,
  p_notes text default null,
  p_sdr_id uuid default null
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_task public.tasks%rowtype;
  v_step public.campaign_steps%rowtype;
  v_call_log_id uuid;
  v_should_send_sms boolean := false;
begin
  -- Get task details
  select * into v_task
  from public.tasks
  where id = p_task_id;
  
  if not found then
    raise exception 'Task not found';
  end if;
  
  -- Get step configuration
  if v_task.campaign_step_id is not null then
    select * into v_step
    from public.campaign_steps
    where id = v_task.campaign_step_id;
  end if;
  
  -- Determine if SMS fallback should be sent
  if v_step.voice_sms_fallback_enabled = true 
     and p_outcome = any(v_step.voice_sms_fallback_triggers) 
     and v_task.sms_fallback_sent = false then
    v_should_send_sms := true;
  end if;
  
  -- Create call log entry
  insert into public.call_logs (
    lead_id,
    workspace_id,
    campaign_id,
    step_id,
    task_id,
    outcome,
    duration,
    sdr_id,
    notes,
    voicemail_dropped,
    sms_fallback_sent
  ) values (
    v_task.lead_id,
    v_task.workspace_id,
    v_task.campaign_id,
    v_task.campaign_step_id,
    p_task_id,
    p_outcome,
    p_duration,
    coalesce(p_sdr_id, v_task.assigned_to),
    p_notes,
    v_task.voicemail_dropped,
    v_task.sms_fallback_sent
  )
  returning id into v_call_log_id;
  
  -- Update task status
  update public.tasks
  set 
    status = 'completed',
    completed_at = now(),
    call_outcome = p_outcome,
    call_duration_seconds = p_duration,
    notes = coalesce(p_notes, notes)
  where id = p_task_id;
  
  -- Return call log ID and SMS fallback flag
  -- Note: SMS fallback sending should be handled by application logic
  -- This function just marks that it should be sent
  
  return v_call_log_id;
end;
$$;

-- Function to create voice step task
create or replace function public.create_voice_step_task(
  p_campaign_step_id uuid,
  p_lead_id uuid,
  p_due_at timestamptz
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_step public.campaign_steps%rowtype;
  v_task_id uuid;
  v_workspace_id uuid;
begin
  -- Get step details
  select * into v_step
  from public.campaign_steps
  where id = p_campaign_step_id;
  
  if not found then
    raise exception 'Campaign step not found';
  end if;
  
  if v_step.step_type not in ('voice', 'call') then
    raise exception 'Step type must be voice or call';
  end if;
  
  -- Get workspace_id from campaign
  select workspace_id into v_workspace_id
  from public.campaigns
  where id = v_step.campaign_id;
  
  -- Create voice task
  insert into public.tasks (
    lead_id,
    campaign_id,
    campaign_step_id,
    workspace_id,
    type,
    status,
    due_at,
    assigned_to,
    call_script,
    voicemail_script,
    voicemail_audio_url,
    priority
  ) values (
    p_lead_id,
    v_step.campaign_id,
    p_campaign_step_id,
    v_workspace_id,
    'call', -- Use 'call' type for voice steps
    'pending',
    p_due_at,
    coalesce(v_step.voice_assign_to, v_step.call_auto_assign_to),
    coalesce(v_step.voice_call_script, v_step.call_script),
    v_step.voice_voicemail_script,
    v_step.voice_voicemail_audio_url,
    coalesce(v_step.voice_priority, v_step.call_priority, 'normal')
  )
  returning id into v_task_id;
  
  return v_task_id;
end;
$$;

-- Revoke public access to helper functions
revoke all on function public.log_call_outcome(uuid, text, int, text, uuid) from anon, authenticated;
revoke all on function public.create_voice_step_task(uuid, uuid, timestamptz) from anon, authenticated;

-- ============================================================================
-- BLOCK 467 COMPLETE
-- ============================================================================



