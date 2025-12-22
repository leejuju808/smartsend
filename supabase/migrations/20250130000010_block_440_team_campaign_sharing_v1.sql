-- Block 440 — Team Campaign Sharing v1
-- Campaign Ownership • Shared Editing • Step Locking • Collaboration Controls
-- This migration implements team-level campaign management for SDR teams, agencies, and multi-inbox operations

-- ============================================
-- 1) Campaign Ownership
-- ============================================
-- Add owner_id column to campaigns table
-- Note: profiles.id references auth.users(id), so owner_id can reference profiles(id) or auth.users(id)
-- We'll use auth.users(id) for consistency with other tables
alter table public.campaigns
  add column if not exists owner_id uuid references auth.users(id) on delete set null;

-- Create index for owner lookups
create index if not exists idx_campaigns_owner on public.campaigns(owner_id);

-- Backfill: Set owner_id to creator (user_id or created_by) for existing campaigns
do $$
begin
  -- Try user_id first if it exists
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'campaigns' and column_name = 'user_id'
  ) then
    update public.campaigns
    set owner_id = user_id
    where owner_id is null and user_id is not null;
  end if;
  
  -- Try created_by if it exists
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'campaigns' and column_name = 'created_by'
  ) then
    update public.campaigns
    set owner_id = created_by
    where owner_id is null and created_by is not null;
  end if;
end $$;

-- ============================================
-- 2) Campaign Collaborators Table
-- ============================================
create table if not exists public.campaign_collaborators (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('editor', 'viewer')),
  added_at timestamptz not null default now(),
  added_by uuid references auth.users(id) on delete set null,
  unique(campaign_id, user_id)
);

-- Indexes for performance
create index if not exists idx_camp_collab_campaign on public.campaign_collaborators(campaign_id);
create index if not exists idx_camp_collab_user on public.campaign_collaborators(user_id);

-- Enable RLS
alter table public.campaign_collaborators enable row level security;

-- RLS Policy: Users can view collaborators for campaigns they have access to
create policy "campaign_collaborators: select accessible campaigns"
  on public.campaign_collaborators for select
  using (
    -- Owner can see all collaborators
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_collaborators.campaign_id
      and c.owner_id = auth.uid()
    )
    -- Collaborator can see all collaborators
    or exists (
      select 1 from public.campaign_collaborators cc
      where cc.campaign_id = campaign_collaborators.campaign_id
      and cc.user_id = auth.uid()
    )
    -- Workspace admin can see collaborators
    or exists (
      select 1 from public.campaigns c
      join public.workspace_members wm on wm.workspace_id = c.workspace_id
      where c.id = campaign_collaborators.campaign_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
    )
  );

-- RLS Policy: Owner and workspace admins can manage collaborators
create policy "campaign_collaborators: manage by owner/admin"
  on public.campaign_collaborators for all
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_collaborators.campaign_id
      and (
        -- Campaign owner
        c.owner_id = auth.uid()
        -- Workspace admin
        or exists (
          select 1 from public.workspace_members wm
          where wm.workspace_id = c.workspace_id
          and wm.user_id = auth.uid()
          and wm.role in ('owner', 'admin')
        )
      )
    )
  )
  with check (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_collaborators.campaign_id
      and (
        -- Campaign owner
        c.owner_id = auth.uid()
        -- Workspace admin
        or exists (
          select 1 from public.workspace_members wm
          where wm.workspace_id = c.workspace_id
          and wm.user_id = auth.uid()
          and wm.role in ('owner', 'admin')
        )
      )
    )
  );

-- ============================================
-- 3) Step Locking Feature
-- ============================================
-- Add locked column to campaign_steps
alter table public.campaign_steps
  add column if not exists locked boolean not null default false;

-- Add locked_by column to track who locked the step
alter table public.campaign_steps
  add column if not exists locked_by uuid references auth.users(id) on delete set null;

-- Add locked_at timestamp
alter table public.campaign_steps
  add column if not exists locked_at timestamptz;

-- Create index for locked steps queries
create index if not exists idx_campaign_steps_locked on public.campaign_steps(campaign_id, locked) where locked = true;

-- ============================================
-- 4) Conflict Prevention (Editing Tracking)
-- ============================================
-- Add editing_by column to track who is currently editing a step
alter table public.campaign_steps
  add column if not exists editing_by uuid references auth.users(id) on delete set null;

-- Add editing_at timestamp
alter table public.campaign_steps
  add column if not exists editing_at timestamptz;

-- Create index for active editing queries
create index if not exists idx_campaign_steps_editing on public.campaign_steps(campaign_id, editing_by) where editing_by is not null;

-- ============================================
-- 5) Helper Functions for Access Control
-- ============================================

-- Function: Get user's role for a campaign
create or replace function public.get_campaign_user_role(
  p_campaign_id uuid,
  p_user_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  -- Check if owner (owner_id references auth.users(id))
  select 'owner' into v_role
  from public.campaigns
  where id = p_campaign_id
  and owner_id = p_user_id
  limit 1;

  if v_role is not null then
    return v_role;
  end if;

  -- Check if workspace admin
  select 'admin' into v_role
  from public.campaigns c
  join public.workspace_members wm on wm.workspace_id = c.workspace_id
  where c.id = p_campaign_id
  and wm.user_id = p_user_id
  and wm.role in ('owner', 'admin')
  limit 1;

  if v_role is not null then
    return v_role;
  end if;

  -- Check collaborator role (user_id references auth.users(id))
  select cc.role into v_role
  from public.campaign_collaborators cc
  where cc.campaign_id = p_campaign_id
  and cc.user_id = p_user_id
  limit 1;

  return v_role;
end;
$$;

-- Function: Check if user can edit campaign
create or replace function public.can_edit_campaign(
  p_campaign_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  v_role := public.get_campaign_user_role(p_campaign_id, p_user_id);
  return v_role in ('owner', 'admin', 'editor');
end;
$$;

-- Function: Check if user can edit step
create or replace function public.can_edit_step(
  p_step_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_campaign_id uuid;
  v_role text;
  v_locked boolean;
begin
  -- Get campaign_id and locked status from step
  select cs.campaign_id, cs.locked
  into v_campaign_id, v_locked
  from public.campaign_steps cs
  where cs.id = p_step_id
  limit 1;

  if v_campaign_id is null then
    return false;
  end if;

  -- Get user role
  v_role := public.get_campaign_user_role(v_campaign_id, p_user_id);

  -- Admins can always edit (override locks)
  if v_role = 'admin' then
    return true;
  end if;

  -- Owner can always edit
  if v_role = 'owner' then
    return true;
  end if;

  -- Editors can edit if step is not locked
  if v_role = 'editor' then
    return not coalesce(v_locked, false);
  end if;

  -- Viewers cannot edit
  return false;
end;
$$;

-- Function: Lock/unlock step
create or replace function public.toggle_step_lock(
  p_step_id uuid,
  p_lock boolean,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign_id uuid;
  v_role text;
begin
  -- Get campaign_id
  select campaign_id into v_campaign_id
  from public.campaign_steps
  where id = p_step_id
  limit 1;

  if v_campaign_id is null then
    raise exception 'Step not found';
  end if;

  -- Get user role
  v_role := public.get_campaign_user_role(v_campaign_id, p_user_id);

  -- Only owner or admin can lock/unlock
  if v_role not in ('owner', 'admin') then
    raise exception 'Only campaign owner or admin can lock/unlock steps';
  end if;

  -- Update step lock status (locked_by references auth.users(id))
  update public.campaign_steps
  set
    locked = p_lock,
    locked_by = case when p_lock then p_user_id else null end,
    locked_at = case when p_lock then now() else null end
  where id = p_step_id;

  return true;
end;
$$;

-- Function: Set editing status
create or replace function public.set_step_editing(
  p_step_id uuid,
  p_user_id uuid,
  p_editing boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Update editing status (editing_by references auth.users(id))
  update public.campaign_steps
  set
    editing_by = case when p_editing then p_user_id else null end,
    editing_at = case when p_editing then now() else null end
  where id = p_step_id;

  return true;
end;
$$;

-- Function: Transfer campaign ownership
create or replace function public.transfer_campaign_ownership(
  p_campaign_id uuid,
  p_new_owner_user_id uuid,
  p_current_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_role text;
begin
  -- Get current user role
  v_current_role := public.get_campaign_user_role(p_campaign_id, p_current_user_id);

  -- Only owner can transfer ownership
  if v_current_role != 'owner' then
    raise exception 'Only campaign owner can transfer ownership';
  end if;

  -- Update ownership (owner_id references auth.users(id))
  update public.campaigns
  set owner_id = p_new_owner_user_id
  where id = p_campaign_id;

  -- Add old owner as editor if not already a collaborator
  insert into public.campaign_collaborators (campaign_id, user_id, role, added_by)
  values (p_campaign_id, p_current_user_id, 'editor', p_new_owner_user_id)
  on conflict (campaign_id, user_id) do nothing;

  return true;
end;
$$;

-- Function: Add campaign collaborator
create or replace function public.add_campaign_collaborator(
  p_campaign_id uuid,
  p_user_id uuid,
  p_role text,
  p_added_by_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_collab_id uuid;
  v_current_role text;
begin
  -- Validate role
  if p_role not in ('editor', 'viewer') then
    raise exception 'Invalid role. Must be editor or viewer';
  end if;

  -- Check permissions
  v_current_role := public.get_campaign_user_role(p_campaign_id, p_added_by_user_id);
  if v_current_role not in ('owner', 'admin') then
    raise exception 'Only campaign owner or admin can add collaborators';
  end if;

  -- Insert or update collaborator (user_id references auth.users(id))
  insert into public.campaign_collaborators (campaign_id, user_id, role, added_by)
  values (p_campaign_id, p_user_id, p_role, p_added_by_user_id)
  on conflict (campaign_id, user_id) do update
  set role = excluded.role,
      added_by = excluded.added_by,
      added_at = now()
  returning id into v_collab_id;

  return v_collab_id;
end;
$$;

-- Function: Remove campaign collaborator
create or replace function public.remove_campaign_collaborator(
  p_campaign_id uuid,
  p_user_id uuid,
  p_removed_by_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_role text;
begin
  -- Check permissions
  v_current_role := public.get_campaign_user_role(p_campaign_id, p_removed_by_user_id);
  if v_current_role not in ('owner', 'admin') then
    raise exception 'Only campaign owner or admin can remove collaborators';
  end if;

  -- Don't allow removing the owner
  if exists (
    select 1 from public.campaigns
    where id = p_campaign_id
    and owner_id = p_user_id
  ) then
    raise exception 'Cannot remove campaign owner';
  end if;

  -- Remove collaborator
  delete from public.campaign_collaborators
  where campaign_id = p_campaign_id
  and user_id = p_user_id;

  return true;
end;
$$;

-- ============================================
-- 6) Activity Log Integration
-- ============================================

-- Extend activity_log to support campaign collaboration events
-- The activity_log table already exists, we just need to ensure it has the right structure

-- Function: Log campaign collaboration activity
create or replace function public.log_campaign_collaboration_activity(
  p_workspace_id uuid,
  p_campaign_id uuid,
  p_user_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log_id uuid;
  v_account_id uuid;
begin
  -- Get account_id from campaign if available
  select account_id into v_account_id
  from public.campaigns
  where id = p_campaign_id
  limit 1;

  -- Insert into activity_log (using existing structure - actor_user_id references auth.users(id))
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'activity_log'
  ) then
    -- Check if audit_action enum exists and if p_action is valid
    declare
      v_action_valid boolean;
      v_action_enum text;
    begin
      -- Try to cast to enum, catch error if invalid
      begin
        v_action_enum := p_action::public.audit_action::text;
        v_action_valid := true;
      exception when others then
        -- If action is not in enum, use 'update' as default
        v_action_enum := 'update';
        v_action_valid := false;
      end;

      -- Check if activity_log has workspace_id column
      if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'activity_log' and column_name = 'workspace_id'
      ) then
        insert into public.activity_log (
          workspace_id,
          campaign_id,
          actor_user_id,
          action,
          entity_type,
          entity_id,
          details
        )
        values (
          p_workspace_id,
          p_campaign_id,
          p_user_id,
          v_action_enum::public.audit_action,
          p_entity_type,
          p_entity_id,
          p_metadata
        )
        returning id into v_log_id;
      else
        -- Use account_id if workspace_id doesn't exist
        insert into public.activity_log (
          account_id,
          campaign_id,
          actor_user_id,
          action,
          entity_type,
          entity_id,
          details
        )
        values (
          v_account_id,
          p_campaign_id,
          p_user_id,
          v_action_enum::public.audit_action,
          p_entity_type,
          p_entity_id,
          p_metadata
        )
        returning id into v_log_id;
      end if;
    end;
  end if;

  -- Also log to workspace_activity if it exists
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'workspace_activity'
  ) then
    insert into public.workspace_activity (
      workspace_id,
      type,
      subtype,
      actor_id,
      campaign_id,
      metadata
    )
    values (
      p_workspace_id,
      'team',
      p_action,
      p_user_id,
      p_campaign_id,
      jsonb_build_object(
        'entity_type', p_entity_type,
        'entity_id', p_entity_id,
        'metadata', p_metadata
      )
    );
  end if;

  return v_log_id;
end;
$$;

-- Trigger: Log step lock/unlock events
create or replace function public.trg_log_step_lock()
returns trigger
language plpgsql
as $$
declare
  v_campaign_id uuid;
  v_workspace_id uuid;
  v_user_id uuid;
begin
  -- Get campaign and workspace info
  select c.id, c.workspace_id into v_campaign_id, v_workspace_id
  from public.campaigns c
  where c.id = new.campaign_id
  limit 1;

  -- locked_by already references auth.users(id), so use it directly
  v_user_id := new.locked_by;

  -- Log lock event
  if (old.locked is distinct from new.locked) and new.locked then
    perform public.log_campaign_collaboration_activity(
      v_workspace_id,
      v_campaign_id,
      v_user_id,
      'lock_step',
      'campaign_step',
      new.id,
      jsonb_build_object(
        'step_index', new.step_index,
        'step_no', coalesce(new.step_no, new.step_index)
      )
    );
  end if;

  -- Log unlock event
  if (old.locked is distinct from new.locked) and not new.locked then
    perform public.log_campaign_collaboration_activity(
      v_workspace_id,
      v_campaign_id,
      v_user_id,
      'unlock_step',
      'campaign_step',
      new.id,
      jsonb_build_object(
        'step_index', new.step_index,
        'step_no', coalesce(new.step_no, new.step_index)
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists t_log_step_lock on public.campaign_steps;
create trigger t_log_step_lock
after update on public.campaign_steps
for each row
when (old.locked is distinct from new.locked)
execute function public.trg_log_step_lock();

-- Trigger: Log step edit events
create or replace function public.trg_log_step_edit()
returns trigger
language plpgsql
as $$
declare
  v_campaign_id uuid;
  v_workspace_id uuid;
  v_user_id uuid;
begin
  -- Only log if content actually changed
  if (
    old.subject_template is distinct from new.subject_template
    or old.body_template is distinct from new.body_template
    or old.body_html is distinct from new.body_html
    or old.body is distinct from new.body
  ) then
    -- Get campaign and workspace info
    select c.id, c.workspace_id into v_campaign_id, v_workspace_id
    from public.campaigns c
    where c.id = new.campaign_id
    limit 1;

    -- editing_by already references auth.users(id), so use it directly
    v_user_id := coalesce(new.editing_by, auth.uid());

    -- Log edit event
    perform public.log_campaign_collaboration_activity(
      v_workspace_id,
      v_campaign_id,
      v_user_id,
      'edit_step',
      'campaign_step',
      new.id,
      jsonb_build_object(
        'step_index', new.step_index,
        'step_no', coalesce(new.step_no, new.step_index),
        'fields_changed', case
          when old.subject_template is distinct from new.subject_template then 'subject'
          when old.body_template is distinct from new.body_template then 'body'
          when old.body_html is distinct from new.body_html then 'body_html'
          when old.body is distinct from new.body then 'body'
          else 'unknown'
        end
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists t_log_step_edit on public.campaign_steps;
create trigger t_log_step_edit
after update on public.campaign_steps
for each row
execute function public.trg_log_step_edit();

-- Trigger: Log collaborator addition
create or replace function public.trg_log_collaborator_add()
returns trigger
language plpgsql
as $$
declare
  v_campaign_id uuid;
  v_workspace_id uuid;
  v_user_id uuid;
  v_added_by_user_id uuid;
begin
  -- Get campaign and workspace info
  select c.id, c.workspace_id into v_campaign_id, v_workspace_id
  from public.campaigns c
  where c.id = new.campaign_id
  limit 1;

  -- user_id and added_by already reference auth.users(id)
  v_user_id := new.user_id;
  v_added_by_user_id := new.added_by;

  -- Log collaborator addition
  perform public.log_campaign_collaboration_activity(
    v_workspace_id,
    v_campaign_id,
    coalesce(v_added_by_user_id, auth.uid()),
    'add_collaborator',
    'campaign_collaborator',
    new.id,
    jsonb_build_object(
      'collaborator_user_id', v_user_id,
      'role', new.role
    )
  );

  return new;
end;
$$;

drop trigger if exists t_log_collaborator_add on public.campaign_collaborators;
create trigger t_log_collaborator_add
after insert on public.campaign_collaborators
for each row
execute function public.trg_log_collaborator_add();

-- Trigger: Log collaborator removal
create or replace function public.trg_log_collaborator_remove()
returns trigger
language plpgsql
as $$
declare
  v_campaign_id uuid;
  v_workspace_id uuid;
  v_user_id uuid;
begin
  -- Get campaign and workspace info
  select c.id, c.workspace_id into v_campaign_id, v_workspace_id
  from public.campaigns c
  where c.id = old.campaign_id
  limit 1;

  -- user_id already references auth.users(id)
  v_user_id := old.user_id;

  -- Log collaborator removal
  perform public.log_campaign_collaboration_activity(
    v_workspace_id,
    v_campaign_id,
    auth.uid(),
    'remove_collaborator',
    'campaign_collaborator',
    old.id,
    jsonb_build_object(
      'collaborator_user_id', v_user_id,
      'role', old.role
    )
  );

  return old;
end;
$$;

drop trigger if exists t_log_collaborator_remove on public.campaign_collaborators;
create trigger t_log_collaborator_remove
after delete on public.campaign_collaborators
for each row
execute function public.trg_log_collaborator_remove();

-- Trigger: Log ownership transfer
create or replace function public.trg_log_ownership_transfer()
returns trigger
language plpgsql
as $$
declare
  v_workspace_id uuid;
  v_old_owner_user_id uuid;
  v_new_owner_user_id uuid;
begin
  -- Only log if owner actually changed
  if old.owner_id is distinct from new.owner_id then
    -- Get workspace info
    select workspace_id into v_workspace_id
    from public.campaigns
    where id = new.id
    limit 1;

    -- owner_id already references auth.users(id)
    v_old_owner_user_id := old.owner_id;
    v_new_owner_user_id := new.owner_id;

    -- Log ownership transfer
    perform public.log_campaign_collaboration_activity(
      v_workspace_id,
      new.id,
      coalesce(v_old_owner_user_id, auth.uid()),
      'transfer_ownership',
      'campaign',
      new.id,
      jsonb_build_object(
        'old_owner_id', old.owner_id,
        'new_owner_id', new.owner_id,
        'old_owner_user_id', v_old_owner_user_id,
        'new_owner_user_id', v_new_owner_user_id
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists t_log_ownership_transfer on public.campaigns;
create trigger t_log_ownership_transfer
after update on public.campaigns
for each row
when (old.owner_id is distinct from new.owner_id)
execute function public.trg_log_ownership_transfer();

-- ============================================
-- 7) Default Collaborator Assignment
-- ============================================
-- Function: Set default collaborators when campaign is created
create or replace function public.set_default_campaign_collaborators()
returns trigger
language plpgsql
as $$
declare
  v_workspace_id uuid;
  v_member_record record;
begin
  -- Get workspace_id
  v_workspace_id := new.workspace_id;

  -- If workspace_id exists, add all workspace members as editors by default
  if v_workspace_id is not null then
    for v_member_record in
      select wm.user_id, wm.role
      from public.workspace_members wm
      where wm.workspace_id = v_workspace_id
      and wm.user_id != auth.uid() -- Don't add the creator (they're the owner)
    loop
      -- Add workspace member as editor (user_id references auth.users(id))
      insert into public.campaign_collaborators (campaign_id, user_id, role, added_by)
      values (
        new.id,
        v_member_record.user_id,
        case when v_member_record.role in ('owner', 'admin') then 'editor' else 'viewer' end,
        auth.uid()
      )
      on conflict (campaign_id, user_id) do nothing;
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists t_set_default_collaborators on public.campaigns;
create trigger t_set_default_collaborators
after insert on public.campaigns
for each row
execute function public.set_default_campaign_collaborators();

-- ============================================
-- 8) RLS Policies for Campaigns
-- ============================================
-- Update campaigns RLS to respect ownership and collaboration

-- Drop existing policies if they conflict
drop policy if exists "campaigns: select accessible" on public.campaigns;
drop policy if exists "campaigns: update accessible" on public.campaigns;

-- Policy: Users can view campaigns they own, collaborate on, or are workspace members of
create policy "campaigns: select accessible"
  on public.campaigns for select
  using (
    -- Owner can see (owner_id references auth.users(id))
    owner_id = auth.uid()
    -- Collaborator can see (user_id references auth.users(id))
    or exists (
      select 1 from public.campaign_collaborators cc
      where cc.campaign_id = campaigns.id
      and cc.user_id = auth.uid()
    )
    -- Workspace member can see
    or exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = campaigns.workspace_id
      and wm.user_id = auth.uid()
    )
  );

-- Policy: Users can update campaigns based on their role
create policy "campaigns: update accessible"
  on public.campaigns for update
  using (
    -- Owner can update (owner_id references auth.users(id))
    owner_id = auth.uid()
    -- Admin can update
    or exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = campaigns.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
    )
    -- Editor can update (user_id references auth.users(id))
    or exists (
      select 1 from public.campaign_collaborators cc
      where cc.campaign_id = campaigns.id
      and cc.user_id = auth.uid()
      and cc.role = 'editor'
    )
  )
  with check (
    -- Owner can update
    owner_id = auth.uid()
    -- Admin can update
    or exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = campaigns.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
    )
    -- Editor can update
    or exists (
      select 1 from public.campaign_collaborators cc
      where cc.campaign_id = campaigns.id
      and cc.user_id = auth.uid()
      and cc.role = 'editor'
    )
  );

-- ============================================
-- 9) RLS Policies for Campaign Steps
-- ============================================
-- Update campaign_steps RLS to respect locking and collaboration

-- Drop existing policies if they conflict
drop policy if exists "campaign_steps: select accessible" on public.campaign_steps;
drop policy if exists "campaign_steps: update accessible" on public.campaign_steps;

-- Policy: Users can view steps for campaigns they have access to
create policy "campaign_steps: select accessible"
  on public.campaign_steps for select
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_steps.campaign_id
      and (
        -- Owner can see (owner_id references auth.users(id))
        c.owner_id = auth.uid()
        -- Collaborator can see (user_id references auth.users(id))
        or exists (
          select 1 from public.campaign_collaborators cc
          where cc.campaign_id = c.id
          and cc.user_id = auth.uid()
        )
        -- Workspace member can see
        or exists (
          select 1 from public.workspace_members wm
          where wm.workspace_id = c.workspace_id
          and wm.user_id = auth.uid()
        )
      )
    )
  );

-- Policy: Users can update steps based on their role and lock status
create policy "campaign_steps: update accessible"
  on public.campaign_steps for update
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_steps.campaign_id
      and (
        -- Owner can always update (owner_id references auth.users(id))
        c.owner_id = auth.uid()
        -- Admin can always update (override locks)
        or exists (
          select 1 from public.workspace_members wm
          where wm.workspace_id = c.workspace_id
          and wm.user_id = auth.uid()
          and wm.role in ('owner', 'admin')
        )
        -- Editor can update if step is not locked (user_id references auth.users(id))
        or (
          not coalesce(campaign_steps.locked, false)
          and exists (
            select 1 from public.campaign_collaborators cc
            where cc.campaign_id = c.id
            and cc.user_id = auth.uid()
            and cc.role = 'editor'
          )
        )
      )
    )
  )
  with check (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_steps.campaign_id
      and (
        -- Owner can always update
        c.owner_id = auth.uid()
        -- Admin can always update (override locks)
        or exists (
          select 1 from public.workspace_members wm
          where wm.workspace_id = c.workspace_id
          and wm.user_id = auth.uid()
          and wm.role in ('owner', 'admin')
        )
        -- Editor can update if step is not locked
        or (
          not coalesce(campaign_steps.locked, false)
          and exists (
            select 1 from public.campaign_collaborators cc
            where cc.campaign_id = c.id
            and cc.user_id = auth.uid()
            and cc.role = 'editor'
          )
        )
      )
    )
  );

-- ============================================
-- 10) Grant Permissions
-- ============================================
grant select, insert, update, delete on public.campaign_collaborators to authenticated;
grant execute on function public.get_campaign_user_role(uuid, uuid) to authenticated;
grant execute on function public.can_edit_campaign(uuid, uuid) to authenticated;
grant execute on function public.can_edit_step(uuid, uuid) to authenticated;
grant execute on function public.toggle_step_lock(uuid, boolean, uuid) to authenticated;
grant execute on function public.set_step_editing(uuid, uuid, boolean) to authenticated;
grant execute on function public.transfer_campaign_ownership(uuid, uuid, uuid) to authenticated;
grant execute on function public.add_campaign_collaborator(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.remove_campaign_collaborator(uuid, uuid, uuid) to authenticated;
grant execute on function public.log_campaign_collaboration_activity(uuid, uuid, uuid, text, text, uuid, jsonb) to authenticated;

-- ============================================
-- Block 440 Complete
-- ============================================
-- Team Campaign Sharing v1 is now live:
-- ✓ Campaign ownership
-- ✓ Collaborator permissions (editor/viewer)
-- ✓ Step locking
-- ✓ Conflict prevention (editing tracking)
-- ✓ Access control functions
-- ✓ Activity logging
-- ✓ Ownership transfer
-- ✓ Default collaborator assignment

