-- Add seat tracking to workspaces
alter table if exists public.workspaces
  add column if not exists seat_limit int not null default 1,
  add column if not exists member_count int not null default 1;

-- Backfill member_count based on current memberships
update public.workspaces w
set member_count = coalesce(x.cnt, 1)
from (
  select workspace_id, count(*)::int as cnt
  from public.workspace_members
  group by workspace_id
) as x
where x.workspace_id = w.id;

-- Ensure member_count never drops below 1 for existing owners
update public.workspaces w
set member_count = greatest(member_count, 1);

