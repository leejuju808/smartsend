-- Block 11000 — Contact Tags & Segments v1
-- Auto-Tagging + Saved Filters + Smart Segments
-- Purpose: Give SmartSend the ability to tag contacts automatically,
-- allow users to add/remove tags easily, save filters as reusable segments,
-- and build dynamic segments that auto-update.

-- ============================================================================
-- 1. TAG STORAGE TABLES
-- ============================================================================

-- Contact Tags (junction table for many-to-many relationship)
-- Note: workspace_id serves as the organization identifier
create table if not exists public.contact_tags (
  workspace_id uuid not null, -- workspace/organization ID (same as contacts.workspace_id)
  contact_id uuid not null references public.contacts(id) on delete cascade,
  tag text not null,
  created_at timestamptz default now(),
  created_by uuid references auth.users(id) on delete set null,
  auto_tagged boolean default false, -- true if added by auto-tagging rules
  primary key (workspace_id, contact_id, tag)
);

-- Indexes for performance
create index if not exists idx_contact_tags_contact on public.contact_tags(contact_id);
create index if not exists idx_contact_tags_tag on public.contact_tags(workspace_id, tag);
create index if not exists idx_contact_tags_workspace on public.contact_tags(workspace_id);

-- Tag Definitions Table (optional but clean - stores tag metadata)
create table if not exists public.org_tags (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null, -- workspace/organization ID
  tag text not null,
  color text default 'gray',
  created_at timestamptz default now(),
  created_by uuid references auth.users(id) on delete set null,
  usage_count int default 0, -- track how many contacts have this tag
  unique(workspace_id, tag)
);

create index if not exists idx_org_tags_workspace on public.org_tags(workspace_id);

-- ============================================================================
-- 2. SEGMENTS TABLE (Enhanced)
-- ============================================================================

-- Check if segments table exists, if not create it
do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'segments') then
    create table public.segments (
      id uuid primary key default gen_random_uuid(),
      workspace_id uuid not null,
      name text not null,
      description text,
      filters jsonb not null default '{}'::jsonb,  -- stored filter config
      auto_update boolean default true,
      system_segment boolean default false,
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      created_by uuid references auth.users(id) on delete set null,
      unique(workspace_id, name)
    );
  else
    -- Add missing columns if table exists
    alter table public.segments
      add column if not exists description text,
      add column if not exists filters jsonb default '{}'::jsonb,
      add column if not exists auto_update boolean default true,
      add column if not exists system_segment boolean default false,
      add column if not exists created_by uuid references auth.users(id) on delete set null;
    
    -- Ensure workspace_id exists (it should from previous migration)
    if not exists (
      select 1 from information_schema.columns 
      where table_schema = 'public' and table_name = 'segments' and column_name = 'workspace_id'
    ) then
      alter table public.segments add column workspace_id uuid;
    end if;
  end if;
end $$;

create index if not exists idx_segments_workspace on public.segments(workspace_id);
create index if not exists idx_segments_auto_update on public.segments(workspace_id, auto_update) where auto_update = true;

-- ============================================================================
-- 3. ROW LEVEL SECURITY
-- ============================================================================

alter table public.contact_tags enable row level security;
alter table public.org_tags enable row level security;
alter table public.segments enable row level security;

-- Helper function to check workspace membership
create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = auth.uid()
  ) or exists (
    select 1 from public.workspaces
    where id = p_workspace_id and owner_id = auth.uid()
  ) or p_workspace_id = auth.uid(); -- fallback: workspace_id might be user_id in some cases
$$;

-- Contact Tags RLS
drop policy if exists "contact_tags_select" on public.contact_tags;
create policy "contact_tags_select" on public.contact_tags
  for select using (public.is_workspace_member(workspace_id));

drop policy if exists "contact_tags_insert" on public.contact_tags;
create policy "contact_tags_insert" on public.contact_tags
  for insert with check (public.is_workspace_member(workspace_id));

drop policy if exists "contact_tags_delete" on public.contact_tags;
create policy "contact_tags_delete" on public.contact_tags
  for delete using (public.is_workspace_member(workspace_id));

-- Org Tags RLS
drop policy if exists "org_tags_select" on public.org_tags;
create policy "org_tags_select" on public.org_tags
  for select using (public.is_workspace_member(workspace_id));

drop policy if exists "org_tags_insert" on public.org_tags;
create policy "org_tags_insert" on public.org_tags
  for insert with check (public.is_workspace_member(workspace_id));

drop policy if exists "org_tags_update" on public.org_tags;
create policy "org_tags_update" on public.org_tags
  for update using (public.is_workspace_member(workspace_id));

drop policy if exists "org_tags_delete" on public.org_tags;
create policy "org_tags_delete" on public.org_tags
  for delete using (public.is_workspace_member(workspace_id));

-- Segments RLS (update existing if needed)
drop policy if exists "segments_select" on public.segments;
create policy "segments_select" on public.segments
  for select using (public.is_workspace_member(workspace_id));

drop policy if exists "segments_insert" on public.segments;
create policy "segments_insert" on public.segments
  for insert with check (public.is_workspace_member(workspace_id));

drop policy if exists "segments_update" on public.segments;
create policy "segments_update" on public.segments
  for update using (public.is_workspace_member(workspace_id));

drop policy if exists "segments_delete" on public.segments;
create policy "segments_delete" on public.segments
  for delete using (public.is_workspace_member(workspace_id));

-- Service role bypass (for edge functions)
drop policy if exists "contact_tags_service_role" on public.contact_tags;
create policy "contact_tags_service_role" on public.contact_tags
  for all to service_role using (true) with check (true);

drop policy if exists "org_tags_service_role" on public.org_tags;
create policy "org_tags_service_role" on public.org_tags
  for all to service_role using (true) with check (true);

drop policy if exists "segments_service_role" on public.segments;
create policy "segments_service_role" on public.segments
  for all to service_role using (true) with check (true);

-- ============================================================================
-- 4. AUTO-TAGGING FUNCTIONS
-- ============================================================================

-- Function to add tag to contact (idempotent)
create or replace function public.add_contact_tag(
  p_workspace_id uuid,
  p_contact_id uuid,
  p_tag text,
  p_auto_tagged boolean default false,
  p_created_by uuid default null
)
returns void
language plpgsql
security definer
as $$
begin
  -- Get workspace_id from contact if not provided
  if p_workspace_id is null then
    select workspace_id into p_workspace_id
    from public.contacts
    where id = p_contact_id
    limit 1;
  end if;
  
  if p_workspace_id is null then
    return;
  end if;
  
  -- Insert tag if it doesn't exist
  insert into public.contact_tags (workspace_id, contact_id, tag, auto_tagged, created_by)
  values (p_workspace_id, p_contact_id, p_tag, p_auto_tagged, p_created_by)
  on conflict (workspace_id, contact_id, tag) do nothing;
  
  -- Update or create org_tag entry
  insert into public.org_tags (workspace_id, tag, created_by)
  values (p_workspace_id, p_tag, p_created_by)
  on conflict (workspace_id, tag) do update
    set usage_count = org_tags.usage_count + 1;
end;
$$;

-- Function to remove tag from contact
create or replace function public.remove_contact_tag(
  p_workspace_id uuid,
  p_contact_id uuid,
  p_tag text
)
returns void
language plpgsql
security definer
as $$
begin
  -- Get workspace_id from contact if not provided
  if p_workspace_id is null then
    select workspace_id into p_workspace_id
    from public.contacts
    where id = p_contact_id
    limit 1;
  end if;
  
  if p_workspace_id is null then
    return;
  end if;
  
  delete from public.contact_tags
  where workspace_id = p_workspace_id
    and contact_id = p_contact_id
    and tag = p_tag;
    
  -- Decrement usage count
  update public.org_tags
  set usage_count = greatest(0, usage_count - 1)
  where workspace_id = p_workspace_id and tag = p_tag;
end;
$$;

-- Function to log tag event to activity_events
create or replace function public.log_tag_event(
  p_workspace_id uuid,
  p_contact_id uuid,
  p_event_type text, -- 'tag_added' or 'tag_removed'
  p_tag text,
  p_auto_tagged boolean default false
)
returns void
language plpgsql
security definer
as $$
begin
  -- Only log if activity_events table exists
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'activity_events') then
    -- Check if activity_events uses workspace_id or org_id
    if exists (
      select 1 from information_schema.columns 
      where table_schema = 'public' and table_name = 'activity_events' and column_name = 'workspace_id'
    ) then
      insert into public.activity_events (
        workspace_id,
        contact_id,
        type,
        title,
        description,
        metadata
      )
      values (
        p_workspace_id,
        p_contact_id,
        p_event_type,
        case 
          when p_event_type = 'tag_added' then 'Tag added: ' || p_tag
          when p_event_type = 'tag_removed' then 'Tag removed: ' || p_tag
          else 'Tag event: ' || p_tag
        end,
        case 
          when p_auto_tagged then 'Automatically tagged'
          else 'Manually tagged'
        end,
        jsonb_build_object(
          'tag', p_tag,
          'auto_tagged', p_auto_tagged
        )
      );
    elsif exists (
      select 1 from information_schema.columns 
      where table_schema = 'public' and table_name = 'activity_events' and column_name = 'org_id'
    ) then
      insert into public.activity_events (
        org_id,
        contact_id,
        type,
        title,
        description,
        metadata
      )
      values (
        p_workspace_id,
        p_contact_id,
        p_event_type,
        case 
          when p_event_type = 'tag_added' then 'Tag added: ' || p_tag
          when p_event_type = 'tag_removed' then 'Tag removed: ' || p_tag
          else 'Tag event: ' || p_tag
        end,
        case 
          when p_auto_tagged then 'Automatically tagged'
          else 'Manually tagged'
        end,
        jsonb_build_object(
          'tag', p_tag,
          'auto_tagged', p_auto_tagged
        )
      );
    end if;
  end if;
end;
$$;

-- ============================================================================
-- 5. AUTO-TAGGING TRIGGERS
-- ============================================================================

-- Trigger function: Auto-tag on reply
create or replace function public.auto_tag_on_reply()
returns trigger
language plpgsql
security definer
as $$
declare
  v_contact_id uuid;
  v_workspace_id uuid;
begin
  -- Get contact_id and workspace_id from reply_threads
  if TG_TABLE_NAME = 'reply_threads' then
    v_contact_id := NEW.contact_id;
    v_workspace_id := NEW.workspace_id;
  elsif TG_TABLE_NAME = 'inbound_messages' then
    -- Try to get contact_id from thread
    select rt.contact_id, rt.workspace_id into v_contact_id, v_workspace_id
    from public.reply_threads rt
    where rt.id = NEW.thread_id
    limit 1;
  end if;
  
  if v_contact_id is not null and v_workspace_id is not null then
    -- Add 'replied' tag
    perform public.add_contact_tag(v_workspace_id, v_contact_id, 'replied', true);
    perform public.log_tag_event(v_workspace_id, v_contact_id, 'tag_added', 'replied', true);
  end if;
  
  return NEW;
end;
$$;

-- Trigger: When reply_thread is created/updated with new message
drop trigger if exists trg_auto_tag_on_reply_thread on public.reply_threads;
create trigger trg_auto_tag_on_reply_thread
after insert or update of last_activity_at on public.reply_threads
for each row
when (NEW.last_direction = 'inbound')
execute function public.auto_tag_on_reply();

-- Trigger function: Auto-tag on intent change
create or replace function public.auto_tag_on_intent()
returns trigger
language plpgsql
security definer
as $$
declare
  v_contact_id uuid;
  v_workspace_id uuid;
  v_old_intent text;
  v_new_intent text;
begin
  -- Get contact_id and workspace_id
  v_contact_id := NEW.contact_id;
  v_workspace_id := NEW.workspace_id;
  v_old_intent := COALESCE(OLD.latest_intent, '');
  v_new_intent := COALESCE(NEW.latest_intent, '');
  
  if v_contact_id is null or v_workspace_id is null then
    return NEW;
  end if;
  
  -- Remove old intent tags
  if v_old_intent = 'hot' then
    perform public.remove_contact_tag(v_workspace_id, v_contact_id, 'hot-lead');
  elsif v_old_intent = 'warm' then
    perform public.remove_contact_tag(v_workspace_id, v_contact_id, 'warm-lead');
  end if;
  
  -- Add new intent tags
  if v_new_intent = 'hot' then
    perform public.add_contact_tag(v_workspace_id, v_contact_id, 'hot-lead', true);
    perform public.log_tag_event(v_workspace_id, v_contact_id, 'tag_added', 'hot-lead', true);
  elsif v_new_intent = 'warm' then
    perform public.add_contact_tag(v_workspace_id, v_contact_id, 'warm-lead', true);
    perform public.log_tag_event(v_workspace_id, v_contact_id, 'tag_added', 'warm-lead', true);
  end if;
  
  return NEW;
end;
$$;

-- Trigger: When reply_thread intent changes
drop trigger if exists trg_auto_tag_on_intent on public.reply_threads;
create trigger trg_auto_tag_on_intent
after update of latest_intent on public.reply_threads
for each row
when (OLD.latest_intent IS DISTINCT FROM NEW.latest_intent)
execute function public.auto_tag_on_intent();

-- Trigger function: Auto-tag on task creation
create or replace function public.auto_tag_on_task()
returns trigger
language plpgsql
security definer
as $$
declare
  v_contact_id uuid;
  v_workspace_id uuid;
begin
  -- Get contact_id and workspace_id from task
  -- Try different possible column names
  v_contact_id := COALESCE(NEW.contact_id, NEW.lead_id);
  v_workspace_id := COALESCE(NEW.workspace_id, NEW.org_id);
  
  -- If workspace_id not found, try to get it from contact
  if v_workspace_id is null and v_contact_id is not null then
    select workspace_id into v_workspace_id
    from public.contacts
    where id = v_contact_id
    limit 1;
  end if;
  
  if v_contact_id is null or v_workspace_id is null then
    return NEW;
  end if;
  
  -- Add 'needs-follow-up' tag
  perform public.add_contact_tag(v_workspace_id, v_contact_id, 'needs-follow-up', true);
  perform public.log_tag_event(v_workspace_id, v_contact_id, 'tag_added', 'needs-follow-up', true);
  
  return NEW;
end;
$$;

-- Trigger: When task is created
drop trigger if exists trg_auto_tag_on_task on public.tasks;
create trigger trg_auto_tag_on_task
after insert on public.tasks
for each row
execute function public.auto_tag_on_task();

-- ============================================================================
-- 6. HELPER FUNCTIONS FOR SEGMENTS
-- ============================================================================

-- Function to get contacts matching segment filters
create or replace function public.get_segment_contacts(p_segment_id uuid)
returns table(contact_id uuid)
language plpgsql
security definer
as $$
declare
  v_filters jsonb;
  v_workspace_id uuid;
begin
  -- Get segment filters
  select filters, workspace_id into v_filters, v_workspace_id
  from public.segments
  where id = p_segment_id;
  
  if v_filters is null then
    return;
  end if;
  
  -- Build dynamic query based on filters
  -- This is a simplified version - you may want to expand this
  return query
  select c.id
  from public.contacts c
  where c.workspace_id = v_workspace_id
    -- Filter by tags if specified
    and (
      not (v_filters ? 'tags') or
      exists (
        select 1 from public.contact_tags ct
        where ct.contact_id = c.id
          and ct.workspace_id = v_workspace_id
          and ct.tag = any((v_filters->>'tags')::text[])
      )
    )
    -- Add more filter conditions as needed
    -- This is a basic implementation
  ;
end;
$$;

-- ============================================================================
-- 7. UPDATE TRIGGERS FOR UPDATED_AT
-- ============================================================================

-- Ensure updated_at trigger exists for segments
drop trigger if exists trg_segments_updated_at on public.segments;
create trigger trg_segments_updated_at
before update on public.segments
for each row
execute function public.set_updated_at();

-- ============================================================================
-- COMMENTS
-- ============================================================================

comment on table public.contact_tags is 'Junction table linking contacts to tags. Supports both manual and auto-tagged tags.';
comment on table public.org_tags is 'Tag definitions with metadata like color and usage count per workspace.';
comment on table public.segments is 'Saved filter combinations that can be reused. Dynamic segments auto-update based on filter rules.';
comment on column public.contact_tags.auto_tagged is 'True if tag was added automatically by system rules, false if manually added.';
comment on column public.segments.filters is 'JSON filter configuration: {tags: [], status: [], intent: [], zip: [], campaignIds: [], replied: boolean}';
comment on column public.contact_tags.workspace_id is 'Workspace/organization ID - same as contacts.workspace_id';
comment on column public.org_tags.workspace_id is 'Workspace/organization ID';

