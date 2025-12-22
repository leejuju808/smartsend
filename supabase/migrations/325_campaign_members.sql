-- Block 325 — Team Campaign Sharing v1
-- Campaign members table with workspace_id support

-- Ensure campaign_members table exists
create table if not exists public.campaign_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor', -- 'owner' | 'editor' | 'viewer'
  created_at timestamptz default now(),
  constraint campaign_members_role_check
    check (role in ('owner', 'editor', 'viewer'))
);

-- Add workspace_id column if it doesn't exist
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'campaign_members'
      and column_name = 'workspace_id'
  ) then
    alter table public.campaign_members
      add column workspace_id uuid references public.workspaces(id) on delete cascade;
    
    -- Backfill workspace_id from campaigns table
    update public.campaign_members cm
    set workspace_id = c.workspace_id
    from public.campaigns c
    where cm.campaign_id = c.id
      and cm.workspace_id is null;
    
    -- Make workspace_id not null after backfilling
    alter table public.campaign_members
      alter column workspace_id set not null;
  end if;
end $$;

-- Ensure role constraint exists
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'campaign_members'
      and constraint_name = 'campaign_members_role_check'
  ) then
    alter table public.campaign_members
      add constraint campaign_members_role_check
      check (role in ('owner', 'editor', 'viewer'));
  end if;
end $$;

-- a user can only appear once per campaign
create unique index if not exists campaign_members_unique
  on public.campaign_members (workspace_id, campaign_id, user_id);

create index if not exists campaign_members_campaign_idx
  on public.campaign_members (workspace_id, campaign_id);

create index if not exists campaign_members_user_idx
  on public.campaign_members (user_id);

-- optional helper view: who owns what
create or replace view campaign_owners as
select
  cm.workspace_id,
  cm.campaign_id,
  cm.user_id,
  p.full_name,
  p.email
from public.campaign_members cm
left join public.profiles p on p.id = cm.user_id
where cm.role = 'owner';







