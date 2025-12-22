-- Create role_permissions table
create table if not exists role_permissions (
  role text primary key,
  can_send boolean default false,
  can_edit boolean default false,
  can_invite boolean default false,
  can_manage boolean default false
);

-- Insert default role permissions
insert into role_permissions (role, can_send, can_edit, can_invite, can_manage)
values
  ('owner', true, true, true, true),
  ('manager', true, true, true, false),
  ('member', true, false, false, false)
on conflict (role) do nothing;

-- Create activity_log table
create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid,
  user_email text,
  action text,
  meta jsonb,
  created_at timestamptz default now()
);

-- Enable RLS and create policy for activity_log
alter table activity_log enable row level security;
create policy "allow read insert" on activity_log for all using (true) with check (true);