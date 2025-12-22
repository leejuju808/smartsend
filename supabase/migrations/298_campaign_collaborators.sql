-- Block 297 — Team Campaign Sharing
-- Campaign Collaborators Table for Team-Based Campaign Access

-- 1. Create campaign_collaborators table
create table if not exists public.campaign_collaborators (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('viewer', 'editor')),
  created_at timestamp with time zone default now(),
  unique (campaign_id, user_id)
);

-- Indexes for performance
create index if not exists idx_campaign_collaborators_campaign on public.campaign_collaborators(campaign_id);
create index if not exists idx_campaign_collaborators_user on public.campaign_collaborators(user_id);

-- 2. Create view to join team member info
create or replace view public.campaign_collaborators_view as
select
  cc.id,
  cc.campaign_id,
  cc.user_id,
  cc.role,
  cc.created_at,
  tm.name as user_name,
  tm.email as user_email
from public.campaign_collaborators cc
left join public.team_members tm
  on tm.user_id = cc.user_id
  and tm.workspace_id = (select workspace_id from public.campaigns c where c.id = cc.campaign_id);

-- 3. Enable RLS
alter table public.campaign_collaborators enable row level security;

-- 4. RLS Policy: Workspace members can read campaign collaborators
create policy "workspace members can read campaign collaborators"
on public.campaign_collaborators
for select
using (
  exists (
    select 1
    from public.campaigns c
    join public.team_members tm
      on tm.workspace_id = c.workspace_id
      and tm.user_id = auth.uid()
      and tm.status = 'active'
    where c.id = campaign_collaborators.campaign_id
  )
  or exists (
    select 1
    from public.campaigns c
    join public.workspace_members wm
      on wm.workspace_id = c.workspace_id
      and wm.user_id = auth.uid()
    where c.id = campaign_collaborators.campaign_id
  )
);

-- 5. RLS Policy: Workspace owners/admins can manage campaign collaborators
create policy "workspace members can manage campaign collaborators"
on public.campaign_collaborators
for all
using (
  exists (
    select 1
    from public.campaigns c
    join public.team_members tm
      on tm.workspace_id = c.workspace_id
      and tm.user_id = auth.uid()
      and tm.role in ('owner', 'admin')
      and tm.status = 'active'
    where c.id = campaign_collaborators.campaign_id
  )
  or exists (
    select 1
    from public.campaigns c
    join public.workspace_members wm
      on wm.workspace_id = c.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
    where c.id = campaign_collaborators.campaign_id
  )
)
with check (
  exists (
    select 1
    from public.campaigns c
    join public.team_members tm
      on tm.workspace_id = c.workspace_id
      and tm.user_id = auth.uid()
      and tm.role in ('owner', 'admin')
      and tm.status = 'active'
    where c.id = campaign_collaborators.campaign_id
  )
  or exists (
    select 1
    from public.campaigns c
    join public.workspace_members wm
      on wm.workspace_id = c.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
    where c.id = campaign_collaborators.campaign_id
  )
);

-- 6. Grant permissions
grant select, insert, update, delete on public.campaign_collaborators to authenticated;
grant select on public.campaign_collaborators_view to authenticated;








