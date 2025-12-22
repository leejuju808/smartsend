-- Block 14800 — Hot Lead Alerts v1
-- Instant Notifications for Hot/Warm Replies + Dashboard Badge
-- "Never miss a money email again"

-- ============================================================================
-- 1. NOTIFICATION PREFERENCES TABLE
-- ============================================================================

create table if not exists public.notification_preferences (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,

  notify_hot_lead_email boolean not null default true,
  notify_warm_lead_email boolean not null default true,
  notify_task_assigned_email boolean not null default false,

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique (user_id, workspace_id)
);

-- Indexes
create index if not exists idx_notification_preferences_user_workspace 
  on public.notification_preferences(user_id, workspace_id);

-- RLS
alter table public.notification_preferences enable row level security;

-- Users can read their own preferences
create policy "users_read_own_preferences"
on public.notification_preferences
for select
using (user_id = auth.uid());

-- Users can update their own preferences
create policy "users_update_own_preferences"
on public.notification_preferences
for update
using (user_id = auth.uid());

-- Users can insert their own preferences
create policy "users_insert_own_preferences"
on public.notification_preferences
for insert
with check (user_id = auth.uid());

-- Service role can do everything (for edge functions)
create policy "service_role_all_preferences"
on public.notification_preferences
for all
to service_role
using (true)
with check (true);

-- ============================================================================
-- 2. EXTEND NOTIFICATIONS TABLE (In-App)
-- ============================================================================

-- The notifications table already exists from Block 9500 (uses org_id)
-- For Block 14800, we'll add workspace_id support and email_message_id

-- Add workspace_id column (nullable for backward compatibility)
alter table public.notifications
  add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;

-- Add email_message_id column
alter table public.notifications
  add column if not exists email_message_id uuid references public.email_messages(id) on delete set null;

-- Note: The existing table uses 'read' boolean column
-- We'll use 'read' in the database but map it to 'is_read' in API responses for consistency with spec

-- Update type check constraint to include 'task_created' if not already present
-- The existing constraint already includes 'hot_lead' and 'warm_lead', so we just need 'task_created'
-- We'll need to drop and recreate the constraint
alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check check (
    type in ('reply', 'hot_lead', 'warm_lead', 'task_due', 'system', 'task_created')
  );

-- Indexes for workspace-based queries
create index if not exists notifications_workspace_idx
  on public.notifications (workspace_id, created_at desc)
  where workspace_id is not null;

create index if not exists notifications_email_message_idx
  on public.notifications (email_message_id)
  where email_message_id is not null;

-- Index for unread notifications (using read column (is_read is mapped in API)
create index if not exists notifications_user_unread_idx_v2
  on public.notifications (user_id, read, created_at desc)
  where read = false;

-- RLS policy for workspace-based notifications
-- Add policy to allow service role to insert workspace-based notifications
create policy if not exists "service_role_insert_workspace_notifications"
on public.notifications
for insert
to service_role
with check (true);

-- Policy for workspace members to see workspace notifications
create policy if not exists "users_read_workspace_notifications"
on public.notifications
for select
using (
  user_id = auth.uid()
  and (
    workspace_id in (
      select workspace_id from public.workspace_members where user_id = auth.uid()
    )
    or org_id in (
      select org_id from public.org_members where user_id = auth.uid()
    )
    or org_id in (
      select org_id from public.org_memberships where user_id = auth.uid() and (status is null or status = 'active')
    )
  )
);

