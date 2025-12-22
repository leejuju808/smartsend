-- Block 459 — Multi-Channel Steps v1
-- Email + SMS + Call Tasks + LinkedIn Tasks • Unified Timeline • Multi-Touch Sequences
-- 
-- This migration adds multi-channel support to SmartSend sequences:
-- - Email steps (already supported)
-- - SMS steps
-- - Call tasks
-- - LinkedIn tasks
-- - Manual tasks

-- ============================================================================
-- 1. ADD step_type TO campaign_steps
-- ============================================================================

-- Add step_type column to campaign_steps if it doesn't exist
alter table public.campaign_steps
  add column if not exists step_type text default 'email' 
    check (step_type in ('email', 'sms', 'call', 'linkedin', 'manual'));

-- Update existing steps to be email type
update public.campaign_steps 
set step_type = 'email' 
where step_type is null;

-- Make step_type not null after backfilling
alter table public.campaign_steps
  alter column step_type set not null;

-- Add indexes for step_type queries
create index if not exists idx_campaign_steps_type 
  on public.campaign_steps(campaign_id, step_type);

-- ============================================================================
-- 2. EXTEND campaign_steps FOR MULTI-CHANNEL CONFIGURATION
-- ============================================================================

-- SMS step configuration fields
alter table public.campaign_steps
  add column if not exists sms_body text,
  add column if not exists sms_phone_field text default 'phone', -- field mapping for phone number
  add column if not exists sms_provider text default 'twilio', -- twilio | nexmo | telnyx
  add column if not exists sms_send_window_start text, -- HH:MM format
  add column if not exists sms_send_window_end text, -- HH:MM format
  add column if not exists sms_throttle_per_hour int default 10;

-- Call task step configuration fields
alter table public.campaign_steps
  add column if not exists call_script text,
  add column if not exists call_notes_template text,
  add column if not exists call_deadline_hours int default 24, -- hours after step triggers
  add column if not exists call_auto_assign_to uuid references public.profiles(id) on delete set null,
  add column if not exists call_priority text default 'normal' check (call_priority in ('low', 'normal', 'high', 'urgent'));

-- LinkedIn task step configuration fields
alter table public.campaign_steps
  add column if not exists linkedin_action text check (linkedin_action in ('visit_profile', 'connect', 'message', 'like_post', 'follow_company')),
  add column if not exists linkedin_message_text text,
  add column if not exists linkedin_instructions text,
  add column if not exists linkedin_auto_assign_to uuid references public.profiles(id) on delete set null;

-- Manual task step configuration fields
alter table public.campaign_steps
  add column if not exists manual_task_title text,
  add column if not exists manual_task_description text,
  add column if not exists manual_task_auto_assign_to uuid references public.profiles(id) on delete set null,
  add column if not exists manual_task_deadline_hours int default 48;

-- Generic step configuration (JSONB for flexibility)
alter table public.campaign_steps
  add column if not exists step_config jsonb default '{}'::jsonb;

-- ============================================================================
-- 3. CREATE tasks TABLE FOR CALL, LINKEDIN, AND MANUAL TASKS
-- ============================================================================

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  campaign_step_id uuid references public.campaign_steps(id) on delete set null,
  workspace_id uuid, -- for workspace-level filtering
  type text not null check (type in ('call', 'linkedin', 'manual')),
  status text default 'pending' check (status in ('pending', 'in_progress', 'completed', 'skipped', 'cancelled')),
  due_at timestamptz,
  completed_at timestamptz,
  assigned_to uuid references public.profiles(id) on delete set null,
  notes text,
  -- Call-specific fields
  call_script text,
  call_outcome text check (call_outcome in ('connected', 'no_answer', 'voicemail', 'wrong_number', 'busy', 'other')),
  call_duration_seconds int,
  -- LinkedIn-specific fields
  linkedin_action text check (linkedin_action in ('visit_profile', 'connect', 'message', 'like_post', 'follow_company')),
  linkedin_message_text text,
  linkedin_profile_url text,
  -- Task metadata
  priority text default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes for tasks
create index if not exists idx_tasks_lead on public.tasks(lead_id);
create index if not exists idx_tasks_campaign on public.tasks(campaign_id);
create index if not exists idx_tasks_campaign_step on public.tasks(campaign_step_id);
create index if not exists idx_tasks_workspace on public.tasks(workspace_id);
create index if not exists idx_tasks_assigned_to on public.tasks(assigned_to);
create index if not exists idx_tasks_status on public.tasks(status);
create index if not exists idx_tasks_due_at on public.tasks(due_at);
create index if not exists idx_tasks_type on public.tasks(type);
create index if not exists idx_tasks_pending_due on public.tasks(status, due_at) 
  where status in ('pending', 'in_progress');

-- Trigger to update updated_at
create or replace function public.set_tasks_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_tasks_updated_at on public.tasks;
create trigger trg_tasks_updated_at
  before update on public.tasks
  for each row
  execute function public.set_tasks_updated_at();

-- Enable RLS on tasks
alter table public.tasks enable row level security;

-- Helper function to check workspace membership (handles both team_members and workspace_members)
create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1 from public.team_members
    where workspace_id = p_workspace_id 
      and user_id = auth.uid() 
      and (status = 'active' or status is null)
  )
  or exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id 
      and user_id = auth.uid()
      and (status = 'active' or status is null)
  );
$$;

-- RLS policies for tasks (users can see tasks in their workspace)
create policy if not exists "tasks_select_workspace" on public.tasks
  for select
  using (
    public.is_workspace_member(workspace_id)
    or assigned_to = auth.uid()
  );

create policy if not exists "tasks_insert_workspace" on public.tasks
  for insert
  with check (
    public.is_workspace_member(workspace_id)
  );

create policy if not exists "tasks_update_assigned_or_workspace" on public.tasks
  for update
  using (
    assigned_to = auth.uid()
    or public.is_workspace_member(workspace_id)
  )
  with check (
    assigned_to = auth.uid()
    or public.is_workspace_member(workspace_id)
  );

-- ============================================================================
-- 4. EXTEND send_queue FOR SMS SUPPORT
-- ============================================================================

-- Add SMS-specific columns to send_queue
alter table public.send_queue
  add column if not exists queue_type text default 'email' check (queue_type in ('email', 'sms')),
  add column if not exists sms_body text,
  add column if not exists sms_to_phone text,
  add column if not exists sms_provider text default 'twilio',
  add column if not exists sms_provider_message_id text,
  add column if not exists sms_status text check (sms_status in ('queued', 'sent', 'delivered', 'failed', 'undelivered')),
  add column if not exists sms_delivered_at timestamptz,
  add column if not exists sms_failed_at timestamptz,
  add column if not exists sms_error_code text,
  add column if not exists sms_error_message text;

-- Update existing send_queue rows to be email type
update public.send_queue 
set queue_type = 'email' 
where queue_type is null;

-- Make queue_type not null after backfilling
alter table public.send_queue
  alter column queue_type set not null;

-- Indexes for SMS queue queries
create index if not exists idx_send_queue_type on public.send_queue(queue_type, status);
create index if not exists idx_send_queue_sms_status on public.send_queue(sms_status, scheduled_at) 
  where queue_type = 'sms';

-- ============================================================================
-- 5. CREATE SMS STATS TRACKING TABLE
-- ============================================================================

create table if not exists public.sms_stats (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns(id) on delete set null,
  campaign_step_id uuid references public.campaign_steps(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  send_queue_id uuid references public.send_queue(id) on delete set null,
  workspace_id uuid,
  -- SMS delivery stats
  sent_at timestamptz,
  delivered_at timestamptz,
  replied_at timestamptz,
  failed_at timestamptz,
  -- Provider info
  provider text,
  provider_message_id text,
  provider_status text,
  -- Reply tracking (reuses Block 438 reply intent system)
  reply_intent text check (reply_intent in ('interested', 'not_interested', 'maybe', 'unsubscribe', 'other')),
  reply_text text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes for SMS stats
create index if not exists idx_sms_stats_campaign on public.sms_stats(campaign_id);
create index if not exists idx_sms_stats_campaign_step on public.sms_stats(campaign_step_id);
create index if not exists idx_sms_stats_lead on public.sms_stats(lead_id);
create index if not exists idx_sms_stats_workspace on public.sms_stats(workspace_id);
create index if not exists idx_sms_stats_sent_at on public.sms_stats(sent_at);

-- Enable RLS on sms_stats
alter table public.sms_stats enable row level security;

-- RLS policies for sms_stats
create policy if not exists "sms_stats_select_workspace" on public.sms_stats
  for select
  using (
    public.is_workspace_member(workspace_id)
  );

-- ============================================================================
-- 6. CREATE SMS SUPPRESSION TABLE FOR COMPLIANCE (STOP handling)
-- ============================================================================

create table if not exists public.sms_suppressions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid,
  phone_number text not null,
  reason text default 'stop' check (reason in ('stop', 'bounce', 'complaint', 'manual')),
  suppressed_at timestamptz default now(),
  created_at timestamptz default now(),
  unique(workspace_id, phone_number)
);

-- Indexes for SMS suppressions
create index if not exists idx_sms_suppressions_phone on public.sms_suppressions(phone_number);
create index if not exists idx_sms_suppressions_workspace on public.sms_suppressions(workspace_id);

-- Enable RLS on sms_suppressions
alter table public.sms_suppressions enable row level security;

-- RLS policies for sms_suppressions
create policy if not exists "sms_suppressions_select_workspace" on public.sms_suppressions
  for select
  using (
    public.is_workspace_member(workspace_id)
  );

-- ============================================================================
-- 7. ADD campaign_step_id TO send_queue FOR BETTER TRACKING
-- ============================================================================

alter table public.send_queue
  add column if not exists campaign_step_id uuid references public.campaign_steps(id) on delete set null;

create index if not exists idx_send_queue_campaign_step on public.send_queue(campaign_step_id);

-- ============================================================================
-- 8. CREATE MULTI-CHANNEL TIMELINE VIEW
-- ============================================================================

create or replace view public.v_lead_timeline as
select 
  'email' as channel,
  sq.id as activity_id,
  sq.lead_id,
  sq.campaign_id,
  cs.id as step_id,
  cs.step_no,
  cs.step_type,
  sq.status as activity_status,
  sq.scheduled_at as activity_time,
  sq.sent_at as completed_at,
  sq.subject as activity_title,
  null as task_type,
  null as assigned_to,
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
  cs.step_no,
  cs.step_type,
  sq.sms_status as activity_status,
  sq.scheduled_at as activity_time,
  sq.sms_delivered_at as completed_at,
  left(sq.sms_body, 50) as activity_title,
  null as task_type,
  null as assigned_to,
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
  cs.step_no,
  cs.step_type,
  t.status as activity_status,
  t.due_at as activity_time,
  t.completed_at,
  case 
    when t.type = 'call' then 'Call Task'
    when t.type = 'linkedin' then 'LinkedIn: ' || coalesce(t.linkedin_action, 'task')
    when t.type = 'manual' then coalesce(t.notes, 'Manual Task')
    else 'Task'
  end as activity_title,
  t.type as task_type,
  t.assigned_to,
  t.created_at
from public.tasks t
left join public.campaign_steps cs on t.campaign_step_id = cs.id;

-- Grant access to timeline view
grant select on public.v_lead_timeline to authenticated;

-- ============================================================================
-- 9. HELPER FUNCTIONS FOR MULTI-CHANNEL OPERATIONS
-- ============================================================================

-- Function to check if phone number is suppressed
create or replace function public.is_sms_suppressed(p_phone text, p_workspace_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 
    from public.sms_suppressions 
    where phone_number = p_phone 
      and (workspace_id = p_workspace_id or workspace_id is null)
  );
$$;

-- Function to create task from campaign step
create or replace function public.create_task_from_step(
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
  
  -- Get workspace_id from campaign
  select workspace_id into v_workspace_id
  from public.campaigns
  where id = v_step.campaign_id;
  
  -- Create task based on step type
  if v_step.step_type = 'call' then
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
      priority
    ) values (
      p_lead_id,
      v_step.campaign_id,
      p_campaign_step_id,
      v_workspace_id,
      'call',
      'pending',
      p_due_at,
      v_step.call_auto_assign_to,
      v_step.call_script,
      v_step.call_priority
    )
    returning id into v_task_id;
    
  elsif v_step.step_type = 'linkedin' then
    insert into public.tasks (
      lead_id,
      campaign_id,
      campaign_step_id,
      workspace_id,
      type,
      status,
      due_at,
      assigned_to,
      linkedin_action,
      linkedin_message_text,
      priority
    ) values (
      p_lead_id,
      v_step.campaign_id,
      p_campaign_step_id,
      v_workspace_id,
      'linkedin',
      'pending',
      p_due_at,
      v_step.linkedin_auto_assign_to,
      v_step.linkedin_action,
      v_step.linkedin_message_text,
      'normal'
    )
    returning id into v_task_id;
    
  elsif v_step.step_type = 'manual' then
    insert into public.tasks (
      lead_id,
      campaign_id,
      campaign_step_id,
      workspace_id,
      type,
      status,
      due_at,
      assigned_to,
      notes,
      priority
    ) values (
      p_lead_id,
      v_step.campaign_id,
      p_campaign_step_id,
      v_workspace_id,
      'manual',
      'pending',
      p_due_at,
      v_step.manual_task_auto_assign_to,
      v_step.manual_task_description,
      'normal'
    )
    returning id into v_task_id;
  else
    raise exception 'Step type % does not create tasks', v_step.step_type;
  end if;
  
  return v_task_id;
end;
$$;

-- Revoke public access to helper functions
revoke all on function public.is_sms_suppressed(text, uuid) from anon, authenticated;
revoke all on function public.create_task_from_step(uuid, uuid, timestamptz) from anon, authenticated;

-- ============================================================================
-- 10. CREATE ACTIVITY LOG TABLE FOR MULTI-CHANNEL TRACKING
-- ============================================================================

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid,
  campaign_id uuid references public.campaigns(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  activity_type text not null check (activity_type in ('email_sent', 'email_opened', 'email_clicked', 'email_replied', 
                                                       'sms_sent', 'sms_delivered', 'sms_replied', 'sms_failed',
                                                       'task_created', 'task_completed', 'task_skipped',
                                                       'call_completed', 'linkedin_action_completed')),
  activity_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Indexes for activity log
create index if not exists idx_activity_log_workspace on public.activity_log(workspace_id);
create index if not exists idx_activity_log_campaign on public.activity_log(campaign_id);
create index if not exists idx_activity_log_lead on public.activity_log(lead_id);
create index if not exists idx_activity_log_type on public.activity_log(activity_type);
create index if not exists idx_activity_log_created_at on public.activity_log(created_at);

-- Enable RLS on activity_log
alter table public.activity_log enable row level security;

-- RLS policies for activity_log
create policy if not exists "activity_log_select_workspace" on public.activity_log
  for select
  using (
    public.is_workspace_member(workspace_id)
  );

-- ============================================================================
-- BLOCK 459 COMPLETE
-- ============================================================================

