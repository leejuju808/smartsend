-- Block 311 — Team Campaign Sharing
-- Add owner_user_id and visibility columns to campaigns table

alter table campaigns
  add column if not exists owner_user_id uuid references auth.users(id),
  add column if not exists visibility text default 'shared';

alter table campaigns
  add constraint campaigns_visibility_check
  check (visibility in ('private', 'shared'));

-- Backfill owner for existing campaigns
-- Pick workspace owner as campaign owner for old rows
update campaigns c
set owner_user_id = tm.user_id
from team_members tm
where c.workspace_id = tm.workspace_id
  and c.owner_user_id is null
  and tm.role = 'owner';

-- Create indexes for performance
create index if not exists idx_campaigns_owner_user_id on campaigns(owner_user_id);
create index if not exists idx_campaigns_visibility on campaigns(visibility);







