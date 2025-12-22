-- Block 9700 — Global Activity Feed (Org-Wide Timeline)
-- Creates activity_events table and triggers to track all key events

-- ============================================================================
-- 1. ACTIVITY EVENTS TABLE
-- ============================================================================

create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null, -- organization/workspace ID
  user_id uuid null references auth.users(id) on delete set null, -- who triggered the event (null = system)
  
  type text not null, 
  -- 'email_sent', 'reply', 'intent_hot', 'intent_warm',
  -- 'status_change', 'task_created', 'task_completed',
  -- 'campaign_start', 'campaign_pause', 'campaign_resume',
  -- 'tag_added', 'tag_removed', 'contact_created'
  
  title text not null,
  description text null,
  
  contact_id uuid null, -- references contacts(id) if exists
  campaign_id uuid null references public.campaigns(id) on delete set null,
  reply_thread_id uuid null, -- references reply_threads(id) if exists
  task_id uuid null, -- references tasks(id) if exists
  
  metadata jsonb default '{}'::jsonb, -- additional context
  
  created_at timestamptz default now()
);

-- Indexes for performance
create index if not exists idx_activity_events_org_created 
  on public.activity_events(org_id, created_at desc);
  
create index if not exists idx_activity_events_contact 
  on public.activity_events(contact_id, created_at desc);
  
create index if not exists idx_activity_events_campaign 
  on public.activity_events(campaign_id, created_at desc);
  
create index if not exists idx_activity_events_type 
  on public.activity_events(org_id, type, created_at desc);

-- RLS: Users can only see events belonging to their org
alter table public.activity_events enable row level security;

-- Helper function to check org membership
create or replace function public.is_org_member(p_org_id uuid)
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1
    from public.org_members om
    where om.org_id = p_org_id 
    and om.user_id = auth.uid()
  );
$$;

-- RLS Policy: Users can read events from orgs they belong to
create policy "activity_events_select_org_member"
  on public.activity_events
  for select
  using (
    org_id in (
      select org_id from public.org_members where user_id = auth.uid()
    )
  );

-- Service role can do everything (for triggers)
create policy "activity_events_service_role"
  on public.activity_events
  for all
  to service_role
  using (true)
  with check (true);

-- ============================================================================
-- 2. HELPER FUNCTION TO CREATE ACTIVITY EVENTS
-- ============================================================================

create or replace function public.create_activity_event(
  p_org_id uuid,
  p_type text,
  p_title text,
  p_description text default null,
  p_user_id uuid default null,
  p_contact_id uuid default null,
  p_campaign_id uuid default null,
  p_reply_thread_id uuid default null,
  p_task_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_event_id uuid;
begin
  insert into public.activity_events (
    org_id,
    user_id,
    type,
    title,
    description,
    contact_id,
    campaign_id,
    reply_thread_id,
    task_id,
    metadata
  ) values (
    p_org_id,
    p_user_id,
    p_type,
    p_title,
    p_description,
    p_contact_id,
    p_campaign_id,
    p_reply_thread_id,
    p_task_id,
    p_metadata
  )
  returning id into v_event_id;
  
  return v_event_id;
end;
$$;

-- ============================================================================
-- 3. TRIGGERS FOR EMAIL SENT
-- ============================================================================

-- Note: This assumes email_logs or send_queue table exists
-- Adjust table/column names based on your actual schema

-- Trigger function for email sent
create or replace function public.track_email_sent()
returns trigger
language plpgsql
security definer
as $$
declare
  v_org_id uuid;
  v_contact_id uuid;
  v_campaign_id uuid;
  v_email text;
begin
  -- Get org_id from campaign or contact
  if NEW.campaign_id is not null then
    select org_id into v_org_id from public.campaigns where id = NEW.campaign_id;
  elsif NEW.contact_id is not null then
    select org_id into v_org_id from public.contacts where id = NEW.contact_id;
  end if;
  
  -- If still no org_id, try to get from lead
  if v_org_id is null and NEW.lead_id is not null then
    select org_id into v_org_id from public.leads where id = NEW.lead_id;
  end if;
  
  if v_org_id is null then
    return NEW;
  end if;
  
  -- Get email address
  v_email := coalesce(NEW.to_email, NEW.to_address, 'unknown');
  
  -- Get contact_id if available
  if NEW.contact_id is not null then
    v_contact_id := NEW.contact_id;
  elsif NEW.lead_id is not null then
    -- Try to find contact by lead
    select id into v_contact_id from public.contacts 
    where lead_id = NEW.lead_id limit 1;
  end if;
  
  -- Create activity event
  perform public.create_activity_event(
    p_org_id := v_org_id,
    p_type := 'email_sent',
    p_title := 'Email sent to ' || v_email,
    p_description := coalesce(NEW.subject, ''),
    p_user_id := NEW.user_id,
    p_contact_id := v_contact_id,
    p_campaign_id := NEW.campaign_id,
    p_metadata := jsonb_build_object(
      'email', v_email,
      'subject', NEW.subject,
      'status', NEW.status
    )
  );
  
  return NEW;
end;
$$;

-- Apply trigger (adjust table name as needed)
-- This will be applied conditionally based on which tables exist

-- ============================================================================
-- 4. TRIGGERS FOR REPLY RECEIVED
-- ============================================================================

create or replace function public.track_reply_received()
returns trigger
language plpgsql
security definer
as $$
declare
  v_org_id uuid;
  v_contact_id uuid;
  v_contact_name text;
  v_snippet text;
begin
  -- Get org_id from thread or lead
  if NEW.thread_id is not null then
    select rt.org_id, rt.lead_id into v_org_id, v_contact_id
    from public.reply_threads rt
    where rt.id = NEW.thread_id;
  elsif NEW.lead_id is not null then
    select org_id into v_org_id from public.leads where id = NEW.lead_id;
    v_contact_id := NEW.lead_id;
  end if;
  
  if v_org_id is null then
    return NEW;
  end if;
  
  -- Get contact name
  if v_contact_id is not null then
    select coalesce(first_name || ' ' || last_name, email, 'Unknown') into v_contact_name
    from public.contacts
    where id = v_contact_id
    limit 1;
    
    if v_contact_name is null then
      select coalesce(first_name || ' ' || last_name, email, 'Unknown') into v_contact_name
      from public.leads
      where id = v_contact_id
      limit 1;
    end if;
  end if;
  
  -- Get snippet (first 100 chars)
  v_snippet := left(coalesce(NEW.body, NEW.body_text, ''), 100);
  
  -- Create activity event
  perform public.create_activity_event(
    p_org_id := v_org_id,
    p_type := 'reply',
    p_title := 'Reply from ' || coalesce(v_contact_name, 'Unknown'),
    p_description := v_snippet,
    p_user_id := NEW.user_id,
    p_contact_id := v_contact_id,
    p_reply_thread_id := NEW.thread_id,
    p_metadata := jsonb_build_object(
      'snippet', v_snippet,
      'intent', NEW.intent_label
    )
  );
  
  return NEW;
end;
$$;

-- ============================================================================
-- 5. TRIGGERS FOR HOT LEAD DETECTED
-- ============================================================================

create or replace function public.track_hot_lead()
returns trigger
language plpgsql
security definer
as $$
declare
  v_org_id uuid;
  v_contact_name text;
begin
  -- Only track HOT intent
  if NEW.intent_label != 'HOT' and NEW.intent != 'HOT' then
    return NEW;
  end if;
  
  -- Get org_id
  if NEW.org_id is not null then
    v_org_id := NEW.org_id;
  elsif NEW.lead_id is not null then
    select org_id into v_org_id from public.leads where id = NEW.lead_id;
  end if;
  
  if v_org_id is null then
    return NEW;
  end if;
  
  -- Get contact name
  if NEW.lead_id is not null then
    select coalesce(first_name || ' ' || last_name, email, 'Unknown') into v_contact_name
    from public.leads
    where id = NEW.lead_id
    limit 1;
  end if;
  
  -- Create activity event
  perform public.create_activity_event(
    p_org_id := v_org_id,
    p_type := 'intent_hot',
    p_title := 'HOT lead detected',
    p_description := coalesce('Lead: ' || v_contact_name, ''),
    p_contact_id := NEW.lead_id,
    p_campaign_id := NEW.campaign_id,
    p_metadata := jsonb_build_object(
      'intent', 'HOT',
      'source', 'reply_detection'
    )
  );
  
  return NEW;
end;
$$;

-- ============================================================================
-- 6. TRIGGERS FOR STATUS CHANGE
-- ============================================================================

create or replace function public.track_status_change()
returns trigger
language plpgsql
security definer
as $$
declare
  v_org_id uuid;
  v_contact_name text;
begin
  -- Only track if status actually changed
  if OLD.status = NEW.status then
    return NEW;
  end if;
  
  -- Get org_id
  if NEW.org_id is not null then
    v_org_id := NEW.org_id;
  elsif NEW.id is not null then
    -- Try to get from leads table
    select org_id into v_org_id from public.leads where id = NEW.id;
  end if;
  
  if v_org_id is null then
    return NEW;
  end if;
  
  -- Get contact name
  select coalesce(first_name || ' ' || last_name, email, 'Unknown') into v_contact_name
  from public.leads
  where id = NEW.id
  limit 1;
  
  -- Create activity event
  perform public.create_activity_event(
    p_org_id := v_org_id,
    p_type := 'status_change',
    p_title := 'Status changed: ' || coalesce(OLD.status, 'Unknown') || ' → ' || NEW.status,
    p_description := coalesce('Lead: ' || v_contact_name, ''),
    p_contact_id := NEW.id,
    p_metadata := jsonb_build_object(
      'old_status', OLD.status,
      'new_status', NEW.status
    )
  );
  
  return NEW;
end;
$$;

-- ============================================================================
-- 7. TRIGGERS FOR TASK CREATED/COMPLETED
-- ============================================================================

create or replace function public.track_task_event()
returns trigger
language plpgsql
security definer
as $$
declare
  v_org_id uuid;
  v_event_type text;
  v_title text;
begin
  -- Determine event type
  if TG_OP = 'INSERT' then
    v_event_type := 'task_created';
    v_title := 'Task created: ' || NEW.title;
  elsif TG_OP = 'UPDATE' and OLD.status != NEW.status and NEW.status = 'done' then
    v_event_type := 'task_completed';
    v_title := 'Task completed: ' || NEW.title;
  else
    return NEW;
  end if;
  
  -- Get org_id
  if NEW.org_id is not null then
    v_org_id := NEW.org_id;
  elsif NEW.workspace_id is not null then
    v_org_id := NEW.workspace_id;
  elsif NEW.lead_id is not null then
    select org_id into v_org_id from public.leads where id = NEW.lead_id;
  end if;
  
  if v_org_id is null then
    return NEW;
  end if;
  
  -- Create activity event
  perform public.create_activity_event(
    p_org_id := v_org_id,
    p_type := v_event_type,
    p_title := v_title,
    p_description := NEW.description,
    p_user_id := NEW.created_by,
    p_contact_id := NEW.lead_id,
    p_campaign_id := NEW.campaign_id,
    p_task_id := NEW.id,
    p_metadata := jsonb_build_object(
      'due_date', NEW.due_date,
      'status', NEW.status
    )
  );
  
  return NEW;
end;
$$;

-- ============================================================================
-- 8. TRIGGERS FOR CAMPAIGN EVENTS
-- ============================================================================

create or replace function public.track_campaign_event()
returns trigger
language plpgsql
security definer
as $$
declare
  v_event_type text;
  v_title text;
begin
  -- Determine event type based on status change
  if OLD.status != NEW.status then
    case NEW.status
      when 'running', 'active' then
        if OLD.status = 'paused' then
          v_event_type := 'campaign_resume';
          v_title := 'Campaign resumed: ' || NEW.name;
        else
          v_event_type := 'campaign_start';
          v_title := 'Campaign started: ' || NEW.name;
        end if;
      when 'paused' then
        v_event_type := 'campaign_pause';
        v_title := 'Campaign paused: ' || NEW.name;
      else
        return NEW;
    end case;
  else
    return NEW;
  end if;
  
  -- Create activity event
  perform public.create_activity_event(
    p_org_id := NEW.org_id,
    p_type := v_event_type,
    p_title := v_title,
    p_campaign_id := NEW.id,
    p_metadata := jsonb_build_object(
      'old_status', OLD.status,
      'new_status', NEW.status
    )
  );
  
  return NEW;
end;
$$;

-- ============================================================================
-- 9. TRIGGERS FOR TAG ADDED/REMOVED
-- ============================================================================

-- Note: Tag changes depend on how tags are stored (jsonb array vs separate table)
-- This assumes tags are stored as jsonb array on contacts/leads

create or replace function public.track_tag_change()
returns trigger
language plpgsql
security definer
as $$
declare
  v_org_id uuid;
  v_old_tags text[];
  v_new_tags text[];
  v_added_tags text[];
  v_removed_tags text[];
  v_tag text;
begin
  -- Only track if tags actually changed
  if OLD.tags = NEW.tags then
    return NEW;
  end if;
  
  -- Get org_id
  if NEW.org_id is not null then
    v_org_id := NEW.org_id;
  elsif NEW.id is not null then
    select org_id into v_org_id from public.contacts where id = NEW.id;
    if v_org_id is null then
      select org_id into v_org_id from public.leads where id = NEW.id;
    end if;
  end if;
  
  if v_org_id is null then
    return NEW;
  end if;
  
  -- Convert jsonb arrays to text arrays
  v_old_tags := array(select jsonb_array_elements_text(OLD.tags));
  v_new_tags := array(select jsonb_array_elements_text(NEW.tags));
  
  -- Find added tags
  foreach v_tag in array v_new_tags
  loop
    if not (v_tag = any(v_old_tags)) then
      v_added_tags := array_append(v_added_tags, v_tag);
    end if;
  end loop;
  
  -- Find removed tags
  foreach v_tag in array v_old_tags
  loop
    if not (v_tag = any(v_new_tags)) then
      v_removed_tags := array_append(v_removed_tags, v_tag);
    end if;
  end loop;
  
  -- Create events for added tags
  foreach v_tag in array v_added_tags
  loop
    perform public.create_activity_event(
      p_org_id := v_org_id,
      p_type := 'tag_added',
      p_title := 'Tag added: ' || v_tag,
      p_contact_id := NEW.id,
      p_metadata := jsonb_build_object('tag', v_tag)
    );
  end loop;
  
  -- Create events for removed tags
  foreach v_tag in array v_removed_tags
  loop
    perform public.create_activity_event(
      p_org_id := v_org_id,
      p_type := 'tag_removed',
      p_title := 'Tag removed: ' || v_tag,
      p_contact_id := NEW.id,
      p_metadata := jsonb_build_object('tag', v_tag)
    );
  end loop;
  
  return NEW;
end;
$$;

-- ============================================================================
-- 10. TRIGGER FOR CONTACT CREATED
-- ============================================================================

create or replace function public.track_contact_created()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Create activity event
  perform public.create_activity_event(
    p_org_id := NEW.org_id,
    p_type := 'contact_created',
    p_title := 'Contact created: ' || coalesce(NEW.first_name || ' ' || NEW.last_name, NEW.email),
    p_description := NEW.email,
    p_contact_id := NEW.id,
    p_metadata := jsonb_build_object(
      'email', NEW.email,
      'source', NEW.last_source
    )
  );
  
  return NEW;
end;
$$;

-- ============================================================================
-- 11. APPLY TRIGGERS (Conditional - only if tables exist)
-- ============================================================================

-- Note: These triggers will be applied conditionally based on which tables exist
-- You may need to adjust table/column names based on your actual schema

-- Email sent trigger (adjust table name)
do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'email_logs') then
    drop trigger if exists trg_track_email_sent on public.email_logs;
    create trigger trg_track_email_sent
      after insert on public.email_logs
      for each row
      when (NEW.status = 'sent')
      execute function public.track_email_sent();
  end if;
  
  if exists (select 1 from information_schema.tables where table_name = 'send_queue') then
    drop trigger if exists trg_track_email_sent_queue on public.send_queue;
    create trigger trg_track_email_sent_queue
      after update on public.send_queue
      for each row
      when (OLD.status != 'sent' and NEW.status = 'sent')
      execute function public.track_email_sent();
  end if;
end $$;

-- Reply received trigger
do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'inbound_messages') then
    drop trigger if exists trg_track_reply_received on public.inbound_messages;
    create trigger trg_track_reply_received
      after insert on public.inbound_messages
      for each row
      execute function public.track_reply_received();
  end if;
  
  if exists (select 1 from information_schema.tables where table_name = 'replies') then
    drop trigger if exists trg_track_reply_received_replies on public.replies;
    create trigger trg_track_reply_received_replies
      after insert on public.replies
      for each row
      execute function public.track_reply_received();
  end if;
end $$;

-- HOT lead trigger
do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'reply_logs') then
    drop trigger if exists trg_track_hot_lead on public.reply_logs;
    create trigger trg_track_hot_lead
      after insert or update on public.reply_logs
      for each row
      when (NEW.intent_label = 'HOT' or NEW.intent = 'HOT')
      execute function public.track_hot_lead();
  end if;
end $$;

-- Status change trigger (on leads)
do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'leads') then
    drop trigger if exists trg_track_status_change on public.leads;
    create trigger trg_track_status_change
      after update on public.leads
      for each row
      when (OLD.status is distinct from NEW.status)
      execute function public.track_status_change();
  end if;
end $$;

-- Task triggers
do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'tasks') then
    drop trigger if exists trg_track_task_created on public.tasks;
    create trigger trg_track_task_created
      after insert on public.tasks
      for each row
      execute function public.track_task_event();
      
    drop trigger if exists trg_track_task_completed on public.tasks;
    create trigger trg_track_task_completed
      after update on public.tasks
      for each row
      when (OLD.status != 'done' and NEW.status = 'done')
      execute function public.track_task_event();
  end if;
end $$;

-- Campaign event trigger
do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'campaigns') then
    drop trigger if exists trg_track_campaign_event on public.campaigns;
    create trigger trg_track_campaign_event
      after update on public.campaigns
      for each row
      when (OLD.status is distinct from NEW.status)
      execute function public.track_campaign_event();
  end if;
end $$;

-- Tag change trigger (on contacts)
do $$
begin
  if exists (
    select 1 from information_schema.columns 
    where table_name = 'contacts' and column_name = 'tags'
  ) then
    drop trigger if exists trg_track_tag_change_contacts on public.contacts;
    create trigger trg_track_tag_change_contacts
      after update on public.contacts
      for each row
      when (OLD.tags is distinct from NEW.tags)
      execute function public.track_tag_change();
  end if;
  
  if exists (
    select 1 from information_schema.columns 
    where table_name = 'leads' and column_name = 'tags'
  ) then
    drop trigger if exists trg_track_tag_change_leads on public.leads;
    create trigger trg_track_tag_change_leads
      after update on public.leads
      for each row
      when (OLD.tags is distinct from NEW.tags)
      execute function public.track_tag_change();
  end if;
end $$;

-- Contact created trigger
do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'contacts') then
    drop trigger if exists trg_track_contact_created on public.contacts;
    create trigger trg_track_contact_created
      after insert on public.contacts
      for each row
      execute function public.track_contact_created();
  end if;
end $$;





























































