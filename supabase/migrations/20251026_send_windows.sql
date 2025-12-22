-- Send Windows migration
-- Creates table for per-workspace send windows with timezone, daily limits, and time restrictions

create table if not exists send_windows (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  timezone text not null default 'America/Los_Angeles',
  -- JSON array of windows: [{ "dow":[1,2,3,4,5], "start":"08:00", "end":"11:00" }, ...]
  windows jsonb not null default '[]'::jsonb,
  per_day int not null default 40,
  min_gap_seconds int not null default 90, -- spacing between sends
  updated_at timestamptz default now()
);

create unique index if not exists send_windows_workspace_uq on send_windows(workspace_id);

-- RLS policies
alter table send_windows enable row level security;

drop policy if exists "send_windows_workspace_members_read" on send_windows;
create policy "send_windows_workspace_members_read" on send_windows
  for select using (is_workspace_member(workspace_id));

drop policy if exists "send_windows_workspace_owners_write" on send_windows;
create policy "send_windows_workspace_owners_write" on send_windows
  for all using (has_workspace_role(workspace_id, array['owner','admin']))
  with check (has_workspace_role(workspace_id, array['owner','admin']));

-- Grant permissions
grant select, insert, update, delete on send_windows to authenticated;
