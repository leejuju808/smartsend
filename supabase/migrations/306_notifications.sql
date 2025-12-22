-- Block 306: Notifications Table + View
-- Migration 306: Core notifications table with is_read column

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id), -- recipient

  type text not null check (
    type in ('reply', 'meeting', 'billing', 'system')
  ),

  title text not null,
  body text,
  data jsonb, -- extra payload: lead_id, reply_id, meeting_id, etc.

  is_read boolean default false,
  created_at timestamptz default now()
);

create index on notifications (workspace_id, user_id, is_read);
create index on notifications (user_id, is_read);

create or replace view notifications_summary_view as
select
  user_id,
  count(*) filter (where is_read = false) as unread_count
from notifications
group by user_id;

-- Enable RLS
alter table notifications enable row level security;

-- RLS Policies
-- Users can read their own notifications
create policy "users_read_own_notifications" on notifications
  for select
  using (auth.uid() = user_id);

-- Users can update their own notifications (mark as read)
create policy "users_update_own_notifications" on notifications
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Service role can insert notifications (via edge function)
create policy "service_role_insert_notifications" on notifications
  for insert
  to service_role
  with check (true);

-- Grant permissions
grant select, update on notifications to authenticated;
grant insert on notifications to service_role;
grant select on notifications_summary_view to authenticated;







