-- Block 442 — Team Inbox Assignment v1
-- Assign Inboxes to Specific Teammates • Per-SDR Sending Pools • Access Control • Load Rules
-- This enables SmartSend to control which teammate uses which sending inboxes for multi-SDR teams

-- ============================================
-- 1) Create inbox_assignments table
-- ============================================

create table if not exists public.inbox_assignments (
  id uuid primary key default gen_random_uuid(),
  inbox_id uuid not null references public.sender_inboxes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  unique(inbox_id, user_id)
);

-- Index for fast lookups
create index if not exists idx_inbox_assign on public.inbox_assignments(inbox_id, user_id);
create index if not exists idx_inbox_assign_user on public.inbox_assignments(user_id);
create index if not exists idx_inbox_assign_inbox on public.inbox_assignments(inbox_id);

-- ============================================
-- 2) Add assignment_mode column to sender_inboxes
-- ============================================

alter table public.sender_inboxes
  add column if not exists assignment_mode text default 'shared' check (assignment_mode in ('shared', 'assigned'));

-- Set default for existing rows
update public.sender_inboxes
set assignment_mode = 'shared'
where assignment_mode is null;

-- ============================================
-- 3) Enable RLS on inbox_assignments
-- ============================================

alter table public.inbox_assignments enable row level security;

-- RLS Policies for inbox_assignments
-- Users can view assignments for inboxes in their workspace
create policy "inbox_assignments_select_workspace_member" on public.inbox_assignments
  for select using (
    exists (
      select 1 from public.sender_inboxes si
      join public.workspace_members wm on wm.workspace_id = si.workspace_id
      where si.id = inbox_assignments.inbox_id
        and wm.user_id = auth.uid()
    )
  );

-- Only admins/owners can insert assignments
create policy "inbox_assignments_insert_admin" on public.inbox_assignments
  for insert with check (
    exists (
      select 1 from public.sender_inboxes si
      join public.workspace_members wm on wm.workspace_id = si.workspace_id
      where si.id = inbox_assignments.inbox_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  );

-- Only admins/owners can update assignments
create policy "inbox_assignments_update_admin" on public.inbox_assignments
  for update using (
    exists (
      select 1 from public.sender_inboxes si
      join public.workspace_members wm on wm.workspace_id = si.workspace_id
      where si.id = inbox_assignments.inbox_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  );

-- Only admins/owners can delete assignments
create policy "inbox_assignments_delete_admin" on public.inbox_assignments
  for delete using (
    exists (
      select 1 from public.sender_inboxes si
      join public.workspace_members wm on wm.workspace_id = si.workspace_id
      where si.id = inbox_assignments.inbox_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  );

-- ============================================
-- 4) Helper functions for assignment checks
-- ============================================

-- Check if user is admin or owner of workspace
create or replace function public.is_workspace_admin_or_owner(p_workspace_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id
      and user_id = p_user_id
      and role in ('owner', 'admin')
  );
$$;

-- Check if user can use an inbox (assigned or shared mode)
create or replace function public.can_user_use_inbox(p_inbox_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.sender_inboxes si
    where si.id = p_inbox_id
      and (
        -- Shared mode: any workspace member can use
        (si.assignment_mode = 'shared' and exists (
          select 1 from public.workspace_members wm
          where wm.workspace_id = si.workspace_id
            and wm.user_id = p_user_id
        ))
        -- Assigned mode: only assigned users or admins/owners can use
        or (si.assignment_mode = 'assigned' and (
          exists (
            select 1 from public.inbox_assignments ia
            where ia.inbox_id = p_inbox_id
              and ia.user_id = p_user_id
          )
          or public.is_workspace_admin_or_owner(si.workspace_id, p_user_id)
        ))
      )
  );
$$;

-- Get assigned users for an inbox
create or replace function public.get_inbox_assigned_users(p_inbox_id uuid)
returns table(user_id uuid, email text, full_name text)
language sql
stable
security definer
set search_path = public
as $$
  select 
    ia.user_id,
    p.email,
    p.full_name
  from public.inbox_assignments ia
  join public.profiles p on p.id = ia.user_id
  where ia.inbox_id = p_inbox_id;
$$;

-- Get inboxes available to a user (assigned + shared)
create or replace function public.get_user_available_inboxes(p_user_id uuid default auth.uid(), p_workspace_id uuid default null)
returns table(
  inbox_id uuid,
  email text,
  domain_id uuid,
  assignment_mode text,
  workspace_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct
    si.id as inbox_id,
    si.email,
    si.domain_id,
    si.assignment_mode,
    si.workspace_id
  from public.sender_inboxes si
  join public.workspace_members wm on wm.workspace_id = si.workspace_id
  where wm.user_id = p_user_id
    and (p_workspace_id is null or si.workspace_id = p_workspace_id)
    and (
      -- Shared inboxes
      si.assignment_mode = 'shared'
      -- Assigned inboxes
      or (si.assignment_mode = 'assigned' and exists (
        select 1 from public.inbox_assignments ia
        where ia.inbox_id = si.id
          and ia.user_id = p_user_id
      ))
      -- Admin/owner can use any inbox
      or public.is_workspace_admin_or_owner(si.workspace_id, p_user_id)
    )
    and si.connected = true;
$$;

-- ============================================
-- 5) Update pick_rotation_inbox to consider assignments
-- ============================================

create or replace function public.pick_rotation_inbox(
  p_domain_id uuid,
  p_user_id uuid default auth.uid(),
  p_today_start timestamptz default date_trunc('day', now())
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inbox_id uuid;
  v_inbox_pool record;
  v_usage_count int;
  v_health_score int;
  v_best_score numeric := -999999;
  v_best_inbox uuid;
  v_workspace_id uuid;
begin
  -- Get workspace_id from domain
  select workspace_id into v_workspace_id
  from public.sender_domains
  where id = p_domain_id;
  
  -- Step 1: Fetch inbox pool for the domain, filtered by assignment
  for v_inbox_pool in
    select 
      si.id,
      si.daily_limit,
      si.assignment_mode,
      coalesce(ih.score, 50) as health_score,
      coalesce(ih.spam_rate, 0) as spam_rate,
      coalesce(ih.bounce_rate, 0) as bounce_rate
    from public.sender_inboxes si
    left join public.inbox_health ih on ih.inbox_id = si.id
    where si.domain_id = p_domain_id
      and si.connected = true
      and (
        -- Shared mode: available to all workspace members
        si.assignment_mode = 'shared'
        -- Assigned mode: only if user is assigned or is admin/owner
        or (si.assignment_mode = 'assigned' and (
          exists (
            select 1 from public.inbox_assignments ia
            where ia.inbox_id = si.id
              and ia.user_id = p_user_id
          )
          or public.is_workspace_admin_or_owner(v_workspace_id, p_user_id)
        ))
      )
  loop
    -- Step 2: Filter out unhealthy inboxes
    if v_inbox_pool.health_score >= 30 
       and v_inbox_pool.spam_rate <= 0.01 
       and v_inbox_pool.bounce_rate <= 0.05 then
      
      -- Step 3: Get today's send usage for this inbox
      select coalesce(count(*), 0) into v_usage_count
      from public.email_events
      where sender_inbox_id = v_inbox_pool.id
        and event_type = 'sent'
        and created_at >= p_today_start;
      
      -- Step 4: Calculate rotation score
      -- Formula: weight_health * health_score - weight_volume * usage_today
      -- Defaults: weight_health = 2, weight_volume = 1
      declare
        v_rotation_score numeric;
        v_weight_health numeric := 2;
        v_weight_volume numeric := 1;
      begin
        v_rotation_score := (v_weight_health * v_inbox_pool.health_score) - (v_weight_volume * v_usage_count);
        
        -- Step 5: Track best inbox
        if v_rotation_score > v_best_score then
          v_best_score := v_rotation_score;
          v_best_inbox := v_inbox_pool.id;
        end if;
      end;
    end if;
  end loop;
  
  -- If no healthy inbox found, fallback to any connected inbox (if user has access)
  if v_best_inbox is null then
    select id into v_best_inbox
    from public.sender_inboxes
    where domain_id = p_domain_id
      and connected = true
      and (
        assignment_mode = 'shared'
        or (assignment_mode = 'assigned' and (
          exists (
            select 1 from public.inbox_assignments ia
            where ia.inbox_id = sender_inboxes.id
              and ia.user_id = p_user_id
          )
          or public.is_workspace_admin_or_owner(v_workspace_id, p_user_id)
        ))
      )
    limit 1;
  end if;
  
  -- Return null if still no inbox found
  return v_best_inbox;
end;
$$;

-- ============================================
-- 6) Function to log assignment activity
-- ============================================

create or replace function public.log_inbox_assignment_activity(
  p_inbox_id uuid,
  p_action text, -- 'assigned', 'unassigned', 'mode_changed'
  p_user_id uuid default auth.uid(),
  p_target_user_id uuid default null,
  p_details jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log_id uuid;
  v_workspace_id uuid;
  v_inbox_email text;
  v_actor_name text;
  v_target_name text;
begin
  -- Get workspace_id and inbox email
  select si.workspace_id, si.email into v_workspace_id, v_inbox_email
  from public.sender_inboxes si
  where si.id = p_inbox_id;
  
  -- Get actor name
  select coalesce(full_name, email, 'Unknown') into v_actor_name
  from public.profiles
  where id = p_user_id;
  
  -- Get target user name if provided
  if p_target_user_id is not null then
    select coalesce(full_name, email, 'Unknown') into v_target_name
    from public.profiles
    where id = p_target_user_id;
  end if;
  
  -- Log to activity_log if table exists (handle different schemas)
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'activity_log') then
    -- Check if audit_action enum exists
    if exists (select 1 from pg_type where typname = 'audit_action' and typnamespace = 'public'::regnamespace) then
      -- Use audit_action enum version
      insert into public.activity_log(
        account_id,
        actor_user_id,
        action,
        entity_type,
        entity_id,
        entity_name,
        details
      )
      values (
        v_workspace_id,
        p_user_id,
        case p_action
          when 'assigned' then 'update'::public.audit_action
          when 'unassigned' then 'update'::public.audit_action
          when 'mode_changed' then 'update'::public.audit_action
          else 'update'::public.audit_action
        end,
        'inbox_assignment',
        p_inbox_id,
        v_inbox_email,
        jsonb_build_object(
          'action', p_action,
          'inbox_id', p_inbox_id,
          'inbox_email', v_inbox_email,
          'actor', v_actor_name,
          'target_user_id', p_target_user_id,
          'target_user_name', v_target_name,
          'details', p_details
        )
      )
      returning id into v_log_id;
    else
      -- Fallback: try inserting without enum (if table has different structure)
      begin
        insert into public.activity_log(
          account_id,
          actor_user_id,
          entity_type,
          entity_id,
          entity_name,
          details
        )
        values (
          v_workspace_id,
          p_user_id,
          'inbox_assignment',
          p_inbox_id,
          v_inbox_email,
          jsonb_build_object(
            'action', p_action,
            'inbox_id', p_inbox_id,
            'inbox_email', v_inbox_email,
            'actor', v_actor_name,
            'target_user_id', p_target_user_id,
            'target_user_name', v_target_name,
            'details', p_details
          )
        )
        returning id into v_log_id;
      exception when others then
        -- If insert fails, just continue without logging
        v_log_id := null;
      end;
    end if;
  end if;
  
  return v_log_id;
end;
$$;

-- ============================================
-- 7) Trigger to log assignment changes
-- ============================================

create or replace function public.trg_log_inbox_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    perform public.log_inbox_assignment_activity(
      NEW.inbox_id,
      'assigned',
      auth.uid(),
      NEW.user_id
    );
    return NEW;
  elsif TG_OP = 'DELETE' then
    perform public.log_inbox_assignment_activity(
      OLD.inbox_id,
      'unassigned',
      auth.uid(),
      OLD.user_id
    );
    return OLD;
  end if;
  return NULL;
end;
$$;

create trigger trg_inbox_assignment_log
  after insert or delete on public.inbox_assignments
  for each row
  execute function public.trg_log_inbox_assignment();

-- ============================================
-- 8) Trigger to log assignment_mode changes
-- ============================================

create or replace function public.trg_log_inbox_mode_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if OLD.assignment_mode is distinct from NEW.assignment_mode then
    perform public.log_inbox_assignment_activity(
      NEW.id,
      'mode_changed',
      auth.uid(),
      null,
      jsonb_build_object(
        'old_mode', OLD.assignment_mode,
        'new_mode', NEW.assignment_mode
      )
    );
  end if;
  return NEW;
end;
$$;

create trigger trg_inbox_mode_change_log
  after update on public.sender_inboxes
  for each row
  when (OLD.assignment_mode is distinct from NEW.assignment_mode)
  execute function public.trg_log_inbox_mode_change();

-- ============================================
-- 9) Comments
-- ============================================

comment on table public.inbox_assignments is 'Assigns inboxes to specific users for team inbox management';
comment on column public.sender_inboxes.assignment_mode is 'Assignment mode: shared (everyone with permission) or assigned (only assigned users)';
comment on function public.is_workspace_admin_or_owner is 'Checks if user is admin or owner of a workspace';
comment on function public.can_user_use_inbox is 'Checks if a user can use an inbox based on assignment mode and permissions';
comment on function public.get_inbox_assigned_users is 'Returns list of users assigned to an inbox';
comment on function public.get_user_available_inboxes is 'Returns list of inboxes available to a user (assigned + shared)';
comment on function public.pick_rotation_inbox is 'Picks the best inbox for rotation considering team assignments, health score, and daily usage';
comment on function public.log_inbox_assignment_activity is 'Logs inbox assignment activity to activity_log table';

