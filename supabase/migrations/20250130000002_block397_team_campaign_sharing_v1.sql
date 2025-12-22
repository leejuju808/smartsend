-- Block 397 — Team Campaign Sharing v1
-- Add owner_user_id + visibility to campaigns table
-- Migration from owner_id/is_shared to owner_user_id/visibility

-- Add owner_user_id column if it doesn't exist
alter table public.campaigns
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null;

-- Add visibility column if it doesn't exist
alter table public.campaigns
  add column if not exists visibility text not null default 'team';

-- Migrate data from owner_id to owner_user_id if owner_id exists
do $$
begin
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'campaigns' 
    and column_name = 'owner_id'
  ) then
    -- Migrate owner_id to owner_user_id where owner_user_id is null
    update public.campaigns
    set owner_user_id = owner_id
    where owner_user_id is null and owner_id is not null;
  end if;
end $$;

-- Migrate data from is_shared to visibility if is_shared exists
do $$
begin
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'campaigns' 
    and column_name = 'is_shared'
  ) then
    -- Map is_shared true -> 'team', false -> 'private'
    update public.campaigns
    set visibility = case when is_shared then 'team' else 'private' end
    where visibility = 'team' and is_shared is not null;
  end if;
end $$;

-- Migrate existing visibility column if it uses different values
do $$
begin
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'campaigns' 
    and column_name = 'visibility'
  ) then
    -- Map 'workspace' -> 'team', 'restricted' -> 'private'
    update public.campaigns
    set visibility = case 
      when visibility = 'workspace' then 'team'
      when visibility = 'restricted' then 'private'
      else visibility
    end
    where visibility in ('workspace', 'restricted');
  end if;
end $$;

-- Add constraint for visibility values
do $$
begin
  -- Drop existing constraint if it exists with different values
  if exists (
    select 1 from information_schema.table_constraints 
    where constraint_name = 'campaigns_visibility_check'
    and table_name = 'campaigns'
  ) then
    alter table public.campaigns drop constraint campaigns_visibility_check;
  end if;
  
  -- Add new constraint
  alter table public.campaigns
    add constraint campaigns_visibility_check
    check (visibility in ('team', 'private'));
exception
  when others then null;
end $$;

-- Backfill owner_user_id for campaigns that don't have one
-- Use workspace owner from team_members or workspace_members
update public.campaigns c
set owner_user_id = tm.user_id
from team_members tm
where c.workspace_id = tm.workspace_id
  and c.owner_user_id is null
  and tm.role = 'owner'
  and not exists (
    select 1 from public.campaigns c2
    where c2.id = c.id and c2.owner_user_id is not null
  );

-- Fallback to workspace_members if team_members didn't work
update public.campaigns c
set owner_user_id = wm.user_id
from workspace_members wm
where c.workspace_id = wm.workspace_id
  and c.owner_user_id is null
  and wm.role = 'owner'
  and not exists (
    select 1 from public.campaigns c2
    where c2.id = c.id and c2.owner_user_id is not null
  );

-- Ensure visibility is set for all campaigns
update public.campaigns
set visibility = 'team'
where visibility is null or visibility not in ('team', 'private');

-- Create indexes for performance
create index if not exists idx_campaigns_owner_user_id
  on public.campaigns (owner_user_id);

create index if not exists idx_campaigns_visibility
  on public.campaigns (visibility);

create index if not exists idx_campaigns_workspace_visibility
  on public.campaigns (workspace_id, visibility);




