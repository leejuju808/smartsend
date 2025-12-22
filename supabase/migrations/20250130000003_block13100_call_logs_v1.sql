-- Block 13100 — Direct Call Log + Phone Activity Tracking v1
-- Inbound/Outbound Call Notes + Missed Call Alerts + Pipeline Sync
-- This migration creates the call logging system for SmartSend

-- ============================================================================
-- 1. CREATE CALL_LOGS TABLE
-- ============================================================================

create table if not exists public.call_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null, -- organization/workspace ID
  contact_id uuid references public.contacts(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  phone text not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  outcome text not null, -- 'talked', 'no_answer', 'left_voicemail', 'missed', 'declined', 'scheduled_inspection', 'estimate_discussed', 'interested'
  notes text,
  follow_up_at timestamptz null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================================
-- 2. CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

create index if not exists idx_call_logs_contact on public.call_logs(contact_id) where contact_id is not null;
create index if not exists idx_call_logs_org on public.call_logs(org_id);
create index if not exists idx_call_logs_user on public.call_logs(user_id);
create index if not exists idx_call_logs_created_at on public.call_logs(created_at desc);
create index if not exists idx_call_logs_org_contact on public.call_logs(org_id, contact_id) where contact_id is not null;
create index if not exists idx_call_logs_follow_up on public.call_logs(follow_up_at) where follow_up_at is not null;

-- ============================================================================
-- 3. CREATE UPDATED_AT TRIGGER
-- ============================================================================

create or replace function public.set_call_logs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_call_logs_updated_at on public.call_logs;
create trigger trg_call_logs_updated_at
before update on public.call_logs
for each row
execute function public.set_call_logs_updated_at();

-- ============================================================================
-- 4. ENABLE RLS
-- ============================================================================

alter table public.call_logs enable row level security;

-- ============================================================================
-- 5. RLS POLICIES
-- ============================================================================

-- Users can view call logs in their org
create policy "users_view_call_logs"
on public.call_logs
for select
using (
  org_id in (
    select org_id from public.org_members where user_id = auth.uid()
    union
    select org_id from public.org_memberships where user_id = auth.uid() and (status is null or status = 'active')
  )
);

-- Users can insert call logs in their org
create policy "users_insert_call_logs"
on public.call_logs
for insert
with check (
  org_id in (
    select org_id from public.org_members where user_id = auth.uid()
    union
    select org_id from public.org_memberships where user_id = auth.uid() and (status is null or status = 'active')
  )
  and user_id = auth.uid()
);

-- Users can update their own call logs or if they are admins/owners
create policy "users_update_call_logs"
on public.call_logs
for update
using (
  org_id in (
    select org_id from public.org_members where user_id = auth.uid()
    union
    select org_id from public.org_memberships where user_id = auth.uid() and (status is null or status = 'active')
  )
  and (
    user_id = auth.uid()
    or exists (
      select 1 from public.org_members om
      where om.org_id = call_logs.org_id
      and om.user_id = auth.uid()
      and om.role in ('owner', 'admin')
    )
    or exists (
      select 1 from public.org_memberships om
      where om.org_id = call_logs.org_id
      and om.user_id = auth.uid()
      and om.role in ('owner', 'admin')
      and (om.status is null or om.status = 'active')
    )
  )
);

-- Service role can manage call logs (for system automation)
create policy "service_role_manage_call_logs"
on public.call_logs
for all
to service_role
using (true)
with check (true);

-- ============================================================================
-- 6. PIPELINE AUTOMATION FUNCTION
-- ============================================================================

-- Function to automatically update pipeline stage based on call outcome
create or replace function public.auto_update_pipeline_from_call()
returns trigger
language plpgsql
security definer
as $$
declare
  v_contact_id uuid;
  v_outcome text;
begin
  -- Only process if contact_id is set
  if new.contact_id is null then
    return new;
  end if;

  v_contact_id := new.contact_id;
  v_outcome := new.outcome;

  -- Update pipeline stage based on outcome
  if v_outcome = 'scheduled_inspection' then
    update public.contacts
    set pipeline_stage = 'inspection',
        inspection_at = coalesce(new.follow_up_at, now()),
        updated_at = now()
    where id = v_contact_id;
    
  elsif v_outcome = 'estimate_discussed' then
    update public.contacts
    set pipeline_stage = 'estimate_sent',
        updated_at = now()
    where id = v_contact_id;
    
  elsif v_outcome = 'declined' then
    -- V2: Move to 'Lost' stage (for now, just log it)
    -- Future: update public.contacts set pipeline_stage = 'lost' where id = v_contact_id;
    null;
  end if;

  return new;
end;
$$;

-- Create trigger for pipeline automation
drop trigger if exists trg_auto_update_pipeline_from_call on public.call_logs;
create trigger trg_auto_update_pipeline_from_call
after insert on public.call_logs
for each row
when (new.contact_id is not null)
execute function public.auto_update_pipeline_from_call();

-- ============================================================================
-- 7. TASK CREATION FUNCTION
-- ============================================================================

-- Function to automatically create follow-up tasks
create or replace function public.create_task_from_call_followup()
returns trigger
language plpgsql
security definer
as $$
declare
  v_task_id uuid;
  v_contact_id uuid;
  v_org_id uuid;
  v_assigned_to uuid;
  v_title text;
begin
  -- Only create task if follow_up_at is set
  if new.follow_up_at is null then
    return new;
  end if;

  v_contact_id := new.contact_id;
  v_org_id := new.org_id;
  v_assigned_to := new.user_id;

  -- Build task title based on outcome
  if new.outcome = 'missed' then
    v_title := format('Follow up on missed call from %s', coalesce(new.phone, 'contact'));
  elsif new.outcome = 'no_answer' then
    v_title := format('Follow up call to %s', coalesce(new.phone, 'contact'));
  elsif new.outcome = 'left_voicemail' then
    v_title := format('Follow up after voicemail to %s', coalesce(new.phone, 'contact'));
  elsif new.outcome = 'talked' and new.notes is not null then
    v_title := format('Follow up call: %s', left(new.notes, 50));
  else
    v_title := format('Follow up call to %s', coalesce(new.phone, 'contact'));
  end if;

  -- Create task
  insert into public.tasks (
    org_id,
    contact_id,
    assigned_to,
    title,
    notes,
    due_at,
    auto_generated,
    auto_type,
    created_by
  )
  values (
    v_org_id,
    v_contact_id,
    v_assigned_to,
    v_title,
    coalesce(new.notes, 'Follow-up call'),
    new.follow_up_at,
    true,
    'call_followup',
    new.user_id
  )
  on conflict do nothing; -- Prevent duplicates

  return new;
end;
$$;

-- Create trigger for task creation
drop trigger if exists trg_create_task_from_call_followup on public.call_logs;
create trigger trg_create_task_from_call_followup
after insert on public.call_logs
for each row
when (new.follow_up_at is not null)
execute function public.create_task_from_call_followup();

-- ============================================================================
-- 8. MISSED CALL NOTIFICATION FUNCTION
-- ============================================================================

-- Function to create notifications for missed calls
create or replace function public.create_missed_call_notification()
returns trigger
language plpgsql
security definer
as $$
declare
  v_contact_name text;
  v_phone text;
  v_workspace_id uuid;
begin
  -- Only process missed calls
  if new.outcome != 'missed' then
    return new;
  end if;

  v_phone := new.phone;
  
  -- Get contact name if available
  if new.contact_id is not null then
    select coalesce(
      first_name || ' ' || last_name,
      first_name,
      last_name,
      email
    ) into v_contact_name
    from public.contacts
    where id = new.contact_id;
  end if;

  -- Map org_id to workspace_id
  -- Try to get workspace_id from workspace table first
  select id into v_workspace_id
  from public.workspaces
  where org_id = new.org_id
  limit 1;

  -- Fallback: use org_id as workspace_id if no mapping found
  if v_workspace_id is null then
    v_workspace_id := new.org_id;
  end if;

  -- Create notification
  insert into public.notifications (
    workspace_id,
    user_id,
    type,
    title,
    body,
    link,
    read
  )
  values (
    v_workspace_id,
    new.user_id,
    'missed_call',
    format('Missed call from %s', coalesce(v_contact_name, v_phone)),
    format('Missed call from %s — follow-up recommended.', coalesce(v_contact_name, v_phone)),
    case 
      when new.contact_id is not null then format('/dashboard/contacts/%s', new.contact_id)
      else '/dashboard/contacts'
    end,
    false
  )
  on conflict do nothing;

  -- Add "Missed Call" tag to contact if contact_id exists
  if new.contact_id is not null then
    update public.contacts
    set tags = coalesce(tags, '[]'::jsonb) || '["Missed Call"]'::jsonb
    where id = new.contact_id
    and not (tags @> '["Missed Call"]'::jsonb);
  end if;

  return new;
end;
$$;

-- Create trigger for missed call notifications
drop trigger if exists trg_create_missed_call_notification on public.call_logs;
create trigger trg_create_missed_call_notification
after insert on public.call_logs
for each row
when (new.outcome = 'missed')
execute function public.create_missed_call_notification();

-- ============================================================================
-- 9. HELPER FUNCTION TO AUTO-MATCH CONTACT BY PHONE
-- ============================================================================

-- Function to find contact by phone number (for inbound calls)
create or replace function public.find_contact_by_phone(
  p_org_id uuid,
  p_phone text
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_contact_id uuid;
begin
  -- Try to find contact by phone number (normalize phone for matching)
  select id into v_contact_id
  from public.contacts
  where org_id = p_org_id
  and (
    phone = p_phone
    or phone = regexp_replace(p_phone, '[^0-9]', '', 'g')
    or regexp_replace(phone, '[^0-9]', '', 'g') = regexp_replace(p_phone, '[^0-9]', '', 'g')
  )
  limit 1;

  return v_contact_id;
end;
$$;

-- Grant execute to authenticated users
grant execute on function public.find_contact_by_phone(uuid, text) to authenticated;

-- ============================================================================
-- 10. COMMENTS
-- ============================================================================

comment on table public.call_logs is 'Call Logs - Tracks inbound/outbound phone calls with outcomes and follow-ups';
comment on column public.call_logs.direction is 'Call direction: inbound or outbound';
comment on column public.call_logs.outcome is 'Call outcome: talked, no_answer, left_voicemail, missed, declined, scheduled_inspection, estimate_discussed, interested';
comment on column public.call_logs.follow_up_at is 'When to follow up on this call (creates task automatically)';

