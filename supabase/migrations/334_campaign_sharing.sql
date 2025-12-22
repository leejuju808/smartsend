-- Block 334 — Team Campaign Sharing v1
-- Add owner_id + is_shared to campaigns table

-- Add owner_id column if it doesn't exist
alter table campaigns
  add column if not exists owner_id uuid references auth.users(id);

-- Add is_shared column if it doesn't exist (default true for shared campaigns)
alter table campaigns
  add column if not exists is_shared boolean not null default true;

-- If owner_user_id exists but owner_id doesn't, migrate the data
do $$
begin
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'campaigns' 
    and column_name = 'owner_user_id'
  ) and exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'campaigns' 
    and column_name = 'owner_id'
  ) then
    -- Migrate owner_user_id to owner_id where owner_id is null
    update campaigns
    set owner_id = owner_user_id
    where owner_id is null and owner_user_id is not null;
  end if;
end $$;

-- If visibility column exists, migrate it to is_shared
do $$
begin
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'campaigns' 
    and column_name = 'visibility'
  ) then
    -- Map visibility 'shared' -> is_shared = true, 'private' -> is_shared = false
    update campaigns
    set is_shared = (visibility = 'shared')
    where is_shared = true and visibility in ('private', 'shared');
  end if;
end $$;

-- Backfill owner_id for campaigns that don't have one
-- Use workspace owner from team_members
update campaigns c
set owner_id = tm.user_id
from team_members tm
where c.workspace_id = tm.workspace_id
  and c.owner_id is null
  and tm.role = 'owner'
  and not exists (
    select 1 from campaigns c2
    where c2.id = c.id and c2.owner_id is not null
  );

-- Create indexes for performance
create index if not exists idx_campaigns_owner_id on campaigns(owner_id);
create index if not exists idx_campaigns_is_shared on campaigns(workspace_id, is_shared);






