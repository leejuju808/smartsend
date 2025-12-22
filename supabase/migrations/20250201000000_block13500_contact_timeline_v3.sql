-- Block 13500 — Contact Timeline v3 (Unified Activity Stream)
-- Unified Activity Stream: Emails, SMS, Calls, Files, Tasks, Pipeline Changes, Notes
-- This is the version that makes SmartSend feel premium and "contractor-ready"

-- ============================================================================
-- 1. CREATE contact_activity TABLE
-- ============================================================================

create table if not exists public.contact_activity (
  id uuid primary key default uuid_generate_v4(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  
  activity_type text not null check (
    activity_type in (
      'email_sent',
      'email_received',
      'sms_sent',
      'sms_received',
      'call_log',
      'file_upload',
      'task_created',
      'task_completed',
      'pipeline_update',
      'note'
    )
  ),
  
  title text,
  body text,
  meta jsonb default '{}'::jsonb,
  
  created_at timestamptz default now(),
  created_by uuid references public.profiles(id)
);

-- Indexes for performance
create index if not exists idx_contact_activity_contact_id on public.contact_activity(contact_id);
create index if not exists idx_contact_activity_created_at on public.contact_activity(created_at desc);
create index if not exists idx_contact_activity_type on public.contact_activity(activity_type);
create index if not exists idx_contact_activity_created_by on public.contact_activity(created_by);
create index if not exists idx_contact_activity_meta on public.contact_activity using gin(meta);

-- ============================================================================
-- 2. RLS POLICIES
-- ============================================================================

alter table public.contact_activity enable row level security;

-- Policy: Users can read contact activity for contacts in their workspace
create policy "contact_activity_select"
  on public.contact_activity
  for select
  using (
    exists (
      select 1 from public.contacts c
      join public.workspace_members wm on wm.workspace_id = c.workspace_id
      where c.id = contact_activity.contact_id
      and wm.user_id = auth.uid()
    )
  );

-- Policy: Users can insert contact activity for contacts in their workspace
create policy "contact_activity_insert"
  on public.contact_activity
  for insert
  with check (
    exists (
      select 1 from public.contacts c
      join public.workspace_members wm on wm.workspace_id = c.workspace_id
      where c.id = contact_activity.contact_id
      and wm.user_id = auth.uid()
    )
  );

-- Grant access
grant select, insert on public.contact_activity to authenticated;

-- ============================================================================
-- 3. HELPER FUNCTION TO LOG ACTIVITY (for server-side use)
-- ============================================================================

create or replace function public.log_contact_activity(
  p_contact_id uuid,
  p_activity_type text,
  p_title text default null,
  p_body text default null,
  p_meta jsonb default '{}'::jsonb,
  p_created_by uuid default auth.uid()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- Validate activity_type
  if p_activity_type not in (
    'email_sent', 'email_received', 'sms_sent', 'sms_received',
    'call_log', 'file_upload', 'task_created', 'task_completed',
    'pipeline_update', 'note'
  ) then
    raise exception 'Invalid activity_type: %', p_activity_type;
  end if;
  
  -- Insert activity
  insert into public.contact_activity (
    contact_id,
    activity_type,
    title,
    body,
    meta,
    created_by
  ) values (
    p_contact_id,
    p_activity_type,
    p_title,
    p_body,
    p_meta,
    p_created_by
  )
  returning id into v_id;
  
  return v_id;
end;
$$;

grant execute on function public.log_contact_activity(uuid, text, text, text, jsonb, uuid) to authenticated;

comment on function public.log_contact_activity is 'Helper function to log contact activity events';



























































