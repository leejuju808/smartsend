-- =========================================================
-- Block 30988 — SmartSend Roofing "SmartPhone → CRM Sync + Call Recording Intelligence" v1
-- (Sync calls from contractor's actual phone • Auto-log every call • Transcribe voicemails • Detect buying signals • Turn conversations into revenue tasks)
-- =========================================================

-- ============================================================================
-- 1. ADD lead_id TO call_logs (if not exists)
-- ============================================================================

alter table if exists public.call_logs
  add column if not exists lead_id uuid references public.leads(id) on delete set null;

-- Create index for lead lookups
create index if not exists idx_call_logs_lead_id on public.call_logs(lead_id) where lead_id is not null;

-- ============================================================================
-- 2. CREATE call_to_lead_map TABLE
-- ============================================================================
-- Maps phone numbers to leads for automatic association

create table if not exists public.call_to_lead_map (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.call_logs(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  phone text not null,
  matched_at timestamptz default now(),
  created_at timestamptz default now(),
  unique(call_id, lead_id)
);

-- Indexes
create index if not exists idx_call_to_lead_map_call on public.call_to_lead_map(call_id);
create index if not exists idx_call_to_lead_map_lead on public.call_to_lead_map(lead_id);
create index if not exists idx_call_to_lead_map_phone on public.call_to_lead_map(phone);

-- RLS
alter table public.call_to_lead_map enable row level security;

-- Policy: Users can view mappings for their org
create policy "users_view_call_to_lead_map"
on public.call_to_lead_map
for select
using (
  exists (
    select 1 from public.call_logs cl
    where cl.id = call_to_lead_map.call_id
    and cl.org_id in (
      select org_id from public.org_members where user_id = auth.uid()
      union
      select org_id from public.org_memberships where user_id = auth.uid() and (status is null or status = 'active')
    )
  )
);

-- Service role can manage mappings
create policy "service_role_manage_call_to_lead_map"
on public.call_to_lead_map
for all
to service_role
using (true)
with check (true);

-- ============================================================================
-- 3. CREATE call_recordings TABLE
-- ============================================================================

create table if not exists public.call_recordings (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.call_logs(id) on delete cascade,
  recording_url text not null,
  transcription text,
  transcription_status text default 'pending' check (transcription_status in ('pending', 'processing', 'completed', 'failed')),
  duration_seconds int,
  file_size_bytes bigint,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes
create index if not exists idx_call_recordings_call on public.call_recordings(call_id);
create index if not exists idx_call_recordings_status on public.call_recordings(transcription_status);
create index if not exists idx_call_recordings_created_at on public.call_recordings(created_at desc);

-- RLS
alter table public.call_recordings enable row level security;

-- Policy: Users can view recordings for calls in their org
create policy "users_view_call_recordings"
on public.call_recordings
for select
using (
  exists (
    select 1 from public.call_logs cl
    where cl.id = call_recordings.call_id
    and cl.org_id in (
      select org_id from public.org_members where user_id = auth.uid()
      union
      select org_id from public.org_memberships where user_id = auth.uid() and (status is null or status = 'active')
    )
  )
);

-- Service role can manage recordings
create policy "service_role_manage_call_recordings"
on public.call_recordings
for all
to service_role
using (true)
with check (true);

-- Updated_at trigger
create or replace function public.set_call_recordings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_call_recordings_updated_at on public.call_recordings;
create trigger trg_call_recordings_updated_at
before update on public.call_recordings
for each row
execute function public.set_call_recordings_updated_at();

-- ============================================================================
-- 4. CREATE call_insights TABLE
-- ============================================================================
-- Stores AI-detected buying signals and intelligence from call transcripts

create table if not exists public.call_insights (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.call_logs(id) on delete cascade,
  signal text not null, -- e.g., 'buying_signal', 'urgency', 'price_sensitivity', 'objection', 'insurance_involvement', 'project_size'
  value int not null, -- Score or value for this signal (-100 to 100)
  confidence numeric(3,2) default 0.5 check (confidence >= 0 and confidence <= 1),
  metadata jsonb default '{}'::jsonb, -- Additional context, detected phrases, etc.
  created_at timestamptz default now()
);

-- Indexes
create index if not exists idx_call_insights_call on public.call_insights(call_id);
create index if not exists idx_call_insights_signal on public.call_insights(signal);
create index if not exists idx_call_insights_value on public.call_insights(value desc);

-- RLS
alter table public.call_insights enable row level security;

-- Policy: Users can view insights for calls in their org
create policy "users_view_call_insights"
on public.call_insights
for select
using (
  exists (
    select 1 from public.call_logs cl
    where cl.id = call_insights.call_id
    and cl.org_id in (
      select org_id from public.org_members where user_id = auth.uid()
      union
      select org_id from public.org_memberships where user_id = auth.uid() and (status is null or status = 'active')
    )
  )
);

-- Service role can manage insights
create policy "service_role_manage_call_insights"
on public.call_insights
for all
to service_role
using (true)
with check (true);

-- ============================================================================
-- 5. CREATE call_tasks TABLE
-- ============================================================================
-- Auto-generated tasks from call intelligence

create table if not exists public.call_tasks (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  call_id uuid references public.call_logs(id) on delete set null,
  task_type text not null default 'call_followup' check (task_type in ('call_followup', 'send_document', 'schedule_appointment', 'follow_up', 'other')),
  description text not null,
  due_at timestamptz,
  priority text default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text default 'open' check (status in ('open', 'completed', 'cancelled')),
  auto_generated boolean default true,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes
create index if not exists idx_call_tasks_lead on public.call_tasks(lead_id);
create index if not exists idx_call_tasks_call on public.call_tasks(call_id);
create index if not exists idx_call_tasks_status on public.call_tasks(status);
create index if not exists idx_call_tasks_due_at on public.call_tasks(due_at) where due_at is not null;

-- RLS
alter table public.call_tasks enable row level security;

-- Policy: Users can view tasks for leads in their org
create policy "users_view_call_tasks"
on public.call_tasks
for select
using (
  exists (
    select 1 from public.leads l
    where l.id = call_tasks.lead_id
    and (
      l.user_id = auth.uid()
      or exists (
        select 1 from public.org_members om
        join public.leads l2 on l2.id = call_tasks.lead_id
        where om.user_id = auth.uid()
        and om.org_id = l2.user_id -- Assuming user_id maps to org context
      )
    )
  )
);

-- Service role can manage tasks
create policy "service_role_manage_call_tasks"
on public.call_tasks
for all
to service_role
using (true)
with check (true);

-- Updated_at trigger
create or replace function public.set_call_tasks_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_call_tasks_updated_at on public.call_tasks;
create trigger trg_call_tasks_updated_at
before update on public.call_tasks
for each row
execute function public.set_call_tasks_updated_at();

-- ============================================================================
-- 6. CREATE lead_score_logs TABLE (if not exists)
-- ============================================================================
-- Logs all lead score changes with reasons

create table if not exists public.lead_score_logs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  signal text not null, -- e.g., 'call_intelligence_boost', 'reply_received', 'email_opened'
  value int not null, -- Score delta
  old_score int,
  new_score int,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Indexes
create index if not exists idx_lead_score_logs_lead on public.lead_score_logs(lead_id);
create index if not exists idx_lead_score_logs_signal on public.lead_score_logs(signal);
create index if not exists idx_lead_score_logs_created_at on public.lead_score_logs(created_at desc);

-- RLS
alter table public.lead_score_logs enable row level security;

-- Policy: Users can view score logs for their leads
create policy "users_view_lead_score_logs"
on public.lead_score_logs
for select
using (
  exists (
    select 1 from public.leads l
    where l.id = lead_score_logs.lead_id
    and l.user_id = auth.uid()
  )
);

-- Service role can manage score logs
create policy "service_role_manage_lead_score_logs"
on public.lead_score_logs
for all
to service_role
using (true)
with check (true);

-- ============================================================================
-- 7. CREATE update_lead_score FUNCTION
-- ============================================================================
-- Updates lead score and logs the change

create or replace function public.update_lead_score(
  p_lead_id uuid,
  p_delta int default 0
)
returns int
language plpgsql
security definer
as $$
declare
  v_old_score int;
  v_new_score int;
  v_current_score int;
begin
  -- Get current score
  select coalesce(score, 0) into v_current_score
  from public.leads
  where id = p_lead_id;

  if v_current_score is null then
    raise exception 'Lead not found: %', p_lead_id;
  end if;

  v_old_score := v_current_score;
  v_new_score := greatest(0, least(100, v_current_score + p_delta));

  -- Update lead score
  -- Note: score_updated_at will be updated by trigger if it exists
  update public.leads
  set score = v_new_score
  where id = p_lead_id;

  -- Log the change
  insert into public.lead_score_logs (
    lead_id,
    signal,
    value,
    old_score,
    new_score
  )
  values (
    p_lead_id,
    'call_intelligence_boost',
    p_delta,
    v_old_score,
    v_new_score
  );

  return v_new_score;
end;
$$;

-- Grant execute to service role
grant execute on function public.update_lead_score(uuid, int) to service_role;

-- ============================================================================
-- 8. HELPER FUNCTION: Find lead by phone number
-- ============================================================================

create or replace function public.find_lead_by_phone(
  p_org_id uuid,
  p_phone text
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_lead_id uuid;
begin
  -- Try to find lead by phone number (normalize phone for matching)
  select id into v_lead_id
  from public.leads
  where (
    -- Match by exact phone or normalized phone
    phone = p_phone
    or phone = regexp_replace(p_phone, '[^0-9]', '', 'g')
    or regexp_replace(phone, '[^0-9]', '', 'g') = regexp_replace(p_phone, '[^0-9]', '', 'g')
  )
  -- Match by org context (assuming leads have user_id that maps to org)
  and user_id in (
    select user_id from public.org_members where org_id = p_org_id
  )
  limit 1;

  return v_lead_id;
end;
$$;

-- Grant execute to authenticated users
grant execute on function public.find_lead_by_phone(uuid, text) to authenticated;
grant execute on function public.find_lead_by_phone(uuid, text) to service_role;

-- ============================================================================
-- 10. AUTO-MAP CALLS TO LEADS BY PHONE NUMBER
-- ============================================================================
-- Trigger to automatically map calls to leads when a call is logged

create or replace function public.auto_map_call_to_lead()
returns trigger
language plpgsql
security definer
as $$
declare
  v_lead_id uuid;
  v_org_id uuid;
begin
  -- Only process if lead_id is not already set
  if new.lead_id is not null then
    return new;
  end if;

  -- Get org_id from call_logs
  v_org_id := new.org_id;

  -- Try to find lead by phone number
  v_lead_id := public.find_lead_by_phone(v_org_id, new.phone);

  if v_lead_id is not null then
    -- Update call_logs with lead_id
    update public.call_logs
    set lead_id = v_lead_id
    where id = new.id;

    -- Create mapping entry
    insert into public.call_to_lead_map (call_id, lead_id, phone)
    values (new.id, v_lead_id, new.phone)
    on conflict (call_id, lead_id) do nothing;
  end if;

  return new;
end;
$$;

-- Create trigger for auto-mapping
drop trigger if exists trg_auto_map_call_to_lead on public.call_logs;
create trigger trg_auto_map_call_to_lead
after insert on public.call_logs
for each row
when (new.lead_id is null)
execute function public.auto_map_call_to_lead();

-- ============================================================================
-- 11. AUTO-PROCESS RECORDINGS WHEN CREATED
-- ============================================================================
-- Note: This trigger will call the Edge Function via pg_net
-- Make sure pg_net extension is enabled

create or replace function public.trigger_process_call_recording()
returns trigger
language plpgsql
security definer
as $$
declare
  v_supabase_url text;
  v_service_role_key text;
begin
  -- Only process if recording_url is set and transcription is pending
  if new.recording_url is null or new.transcription_status != 'pending' then
    return new;
  end if;

  -- Get environment variables (these should be set in Supabase)
  -- For now, we'll use a webhook approach - the Edge Function should be called
  -- from the application or via a scheduled job when recordings are created
  
  -- This is a placeholder - actual implementation would use pg_net or
  -- be handled by the application calling the Edge Function directly
  
  return new;
end;
$$;

-- Note: The actual processing should be triggered by:
-- 1. Application calling the Edge Function after inserting a recording
-- 2. A scheduled job that processes pending recordings
-- 3. A webhook from Twilio/Vonage when recording is ready

-- ============================================================================
-- 12. COMMENTS
-- ============================================================================

comment on table public.call_recordings is 'Stores call recordings and transcriptions';
comment on table public.call_insights is 'AI-detected buying signals and intelligence from call transcripts';
comment on table public.call_tasks is 'Auto-generated tasks from call intelligence analysis';
comment on table public.call_to_lead_map is 'Maps phone calls to leads for automatic association';
comment on table public.lead_score_logs is 'Audit log of all lead score changes with reasons';


































