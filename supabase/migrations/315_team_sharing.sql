-- Block 315 — Team Campaign Sharing v1
-- Shared sequences, shared campaigns, role-based controls

-- ============================================================================
-- 1. SHARING TABLES
-- ============================================================================

-- Campaign shares table
create table if not exists public.campaign_shares (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz default now(),
  unique (campaign_id, user_id)
);

create index if not exists idx_campaign_shares_workspace on public.campaign_shares (workspace_id);
create index if not exists idx_campaign_shares_campaign on public.campaign_shares (campaign_id);
create index if not exists idx_campaign_shares_user on public.campaign_shares (user_id);

-- Sequence shares table
create table if not exists public.sequence_shares (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sequence_id uuid not null references public.sequences(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz default now(),
  unique (sequence_id, user_id)
);

create index if not exists idx_sequence_shares_workspace on public.sequence_shares (workspace_id);
create index if not exists idx_sequence_shares_sequence on public.sequence_shares (sequence_id);
create index if not exists idx_sequence_shares_user on public.sequence_shares (user_id);

-- Enable RLS on sharing tables
alter table public.campaign_shares enable row level security;
alter table public.sequence_shares enable row level security;

-- RLS policies for campaign_shares
create policy "campaign_shares_select"
on public.campaign_shares
for select
using (
  workspace_id in (
    select workspace_id from public.team_members where user_id = auth.uid() and status = 'active'
  )
  or workspace_id in (
    select workspace_id from public.workspace_members where user_id = auth.uid()
  )
);

-- RLS policies for sequence_shares
create policy "sequence_shares_select"
on public.sequence_shares
for select
using (
  workspace_id in (
    select workspace_id from public.team_members where user_id = auth.uid() and status = 'active'
  )
  or workspace_id in (
    select workspace_id from public.workspace_members where user_id = auth.uid()
  )
);

-- INSERT/UPDATE/DELETE policies for campaign_shares (workspace members can manage)
create policy "campaign_shares_insert"
on public.campaign_shares
for insert
with check (
  workspace_id in (
    select workspace_id from public.team_members where user_id = auth.uid() and status = 'active'
  )
  or workspace_id in (
    select workspace_id from public.workspace_members where user_id = auth.uid()
  )
);

create policy "campaign_shares_update"
on public.campaign_shares
for update
using (
  workspace_id in (
    select workspace_id from public.team_members where user_id = auth.uid() and status = 'active'
  )
  or workspace_id in (
    select workspace_id from public.workspace_members where user_id = auth.uid()
  )
)
with check (
  workspace_id in (
    select workspace_id from public.team_members where user_id = auth.uid() and status = 'active'
  )
  or workspace_id in (
    select workspace_id from public.workspace_members where user_id = auth.uid()
  )
);

create policy "campaign_shares_delete"
on public.campaign_shares
for delete
using (
  workspace_id in (
    select workspace_id from public.team_members where user_id = auth.uid() and status = 'active'
  )
  or workspace_id in (
    select workspace_id from public.workspace_members where user_id = auth.uid()
  )
);

-- INSERT/UPDATE/DELETE policies for sequence_shares (workspace members can manage)
create policy "sequence_shares_insert"
on public.sequence_shares
for insert
with check (
  workspace_id in (
    select workspace_id from public.team_members where user_id = auth.uid() and status = 'active'
  )
  or workspace_id in (
    select workspace_id from public.workspace_members where user_id = auth.uid()
  )
);

create policy "sequence_shares_update"
on public.sequence_shares
for update
using (
  workspace_id in (
    select workspace_id from public.team_members where user_id = auth.uid() and status = 'active'
  )
  or workspace_id in (
    select workspace_id from public.workspace_members where user_id = auth.uid()
  )
)
with check (
  workspace_id in (
    select workspace_id from public.team_members where user_id = auth.uid() and status = 'active'
  )
  or workspace_id in (
    select workspace_id from public.workspace_members where user_id = auth.uid()
  )
);

create policy "sequence_shares_delete"
on public.sequence_shares
for delete
using (
  workspace_id in (
    select workspace_id from public.team_members where user_id = auth.uid() and status = 'active'
  )
  or workspace_id in (
    select workspace_id from public.workspace_members where user_id = auth.uid()
  )
);

-- ============================================================================
-- 2. UPDATE CAMPAIGN RLS POLICIES
-- ============================================================================

-- Drop existing campaign SELECT policies that might conflict
drop policy if exists "campaigns_select_shared" on public.campaigns;
drop policy if exists "campaigns tenant readers" on public.campaigns;
drop policy if exists "campaigns_select" on public.campaigns;
drop policy if exists "campaigns_read_with_visibility" on public.campaigns;
drop policy if exists "campaigns are readable by owner" on public.campaigns;
drop policy if exists "users select their campaigns" on public.campaigns;

-- SELECT: Workspace member OR specifically shared
create policy "campaign_select_shared"
on public.campaigns
for select
using (
  workspace_id in (
    select workspace_id from public.team_members where user_id = auth.uid() and status = 'active'
  )
  or workspace_id in (
    select workspace_id from public.workspace_members where user_id = auth.uid()
  )
  or id in (
    select campaign_id from public.campaign_shares where user_id = auth.uid()
  )
);

-- Drop existing UPDATE policies
drop policy if exists "campaign_update_shared" on public.campaigns;
drop policy if exists "campaigns_update" on public.campaigns;
drop policy if exists "campaigns_update_owner_or_admin" on public.campaigns;
drop policy if exists "campaigns editors" on public.campaigns;
drop policy if exists "users update their campaigns" on public.campaigns;

-- UPDATE: Only owner/editor role in shares OR workspace member with write access
create policy "campaign_update_shared"
on public.campaigns
for update
using (
  id in (
    select campaign_id from public.campaign_shares
    where user_id = auth.uid()
      and role in ('owner', 'editor')
  )
  or (
    workspace_id in (
      select workspace_id from public.team_members 
      where user_id = auth.uid() and status = 'active'
    )
    or workspace_id in (
      select workspace_id from public.workspace_members 
      where user_id = auth.uid()
    )
  )
)
with check (
  id in (
    select campaign_id from public.campaign_shares
    where user_id = auth.uid()
      and role in ('owner', 'editor')
  )
  or (
    workspace_id in (
      select workspace_id from public.team_members 
      where user_id = auth.uid() and status = 'active'
    )
    or workspace_id in (
      select workspace_id from public.workspace_members 
      where user_id = auth.uid()
    )
  )
);

-- Drop existing DELETE policies
drop policy if exists "campaign_delete_shared" on public.campaigns;
drop policy if exists "campaigns_delete" on public.campaigns;
drop policy if exists "campaigns_delete_owner_or_admin" on public.campaigns;

-- DELETE: Only owner role in shares OR workspace owner/admin
create policy "campaign_delete_shared"
on public.campaigns
for delete
using (
  id in (
    select campaign_id from public.campaign_shares
    where user_id = auth.uid()
      and role = 'owner'
  )
  or (
    workspace_id in (
      select workspace_id from public.team_members 
      where user_id = auth.uid() 
      and status = 'active'
      and role in ('owner', 'admin')
    )
    or workspace_id in (
      select workspace_id from public.workspace_members 
      where user_id = auth.uid()
      and role in ('owner', 'admin')
    )
  )
);

-- ============================================================================
-- 3. UPDATE SEQUENCE RLS POLICIES
-- ============================================================================

-- Drop existing sequence SELECT policies that might conflict
drop policy if exists "sequences_select_shared" on public.sequences;
drop policy if exists "sequences_select" on public.sequences;
drop policy if exists "sequences_select_member" on public.sequences;
drop policy if exists "sequences_rw" on public.sequences;
drop policy if exists "members read sequences" on public.sequences;
drop policy if exists "Users manage own sequences" on public.sequences;

-- SELECT: Workspace member OR specifically shared
create policy "sequences_select_shared"
on public.sequences
for select
using (
  workspace_id in (
    select workspace_id from public.team_members where user_id = auth.uid() and status = 'active'
  )
  or workspace_id in (
    select workspace_id from public.workspace_members where user_id = auth.uid()
  )
  or id in (
    select sequence_id from public.sequence_shares where user_id = auth.uid()
  )
);

-- Drop existing UPDATE policies
drop policy if exists "sequences_update_shared" on public.sequences;
drop policy if exists "sequences_modify" on public.sequences;
drop policy if exists "sequences_mutate_member" on public.sequences;
drop policy if exists "sequences_rw" on public.sequences;
drop policy if exists "members write sequences" on public.sequences;

-- UPDATE: Only owner/editor role in shares OR workspace member with write access
create policy "sequences_update_shared"
on public.sequences
for update
using (
  id in (
    select sequence_id from public.sequence_shares
    where user_id = auth.uid()
      and role in ('owner', 'editor')
  )
  or (
    workspace_id in (
      select workspace_id from public.team_members 
      where user_id = auth.uid() and status = 'active'
    )
    or workspace_id in (
      select workspace_id from public.workspace_members 
      where user_id = auth.uid()
    )
  )
)
with check (
  id in (
    select sequence_id from public.sequence_shares
    where user_id = auth.uid()
      and role in ('owner', 'editor')
  )
  or (
    workspace_id in (
      select workspace_id from public.team_members 
      where user_id = auth.uid() and status = 'active'
    )
    or workspace_id in (
      select workspace_id from public.workspace_members 
      where user_id = auth.uid()
    )
  )
);

-- Drop existing DELETE policies
drop policy if exists "sequences_delete_shared" on public.sequences;
drop policy if exists "sequences_modify" on public.sequences;
drop policy if exists "sequences_mutate_member" on public.sequences;

-- DELETE: Only owner role in shares OR workspace owner/admin
create policy "sequences_delete_shared"
on public.sequences
for delete
using (
  id in (
    select sequence_id from public.sequence_shares
    where user_id = auth.uid()
      and role = 'owner'
  )
  or (
    workspace_id in (
      select workspace_id from public.team_members 
      where user_id = auth.uid() 
      and status = 'active'
      and role in ('owner', 'admin')
    )
    or workspace_id in (
      select workspace_id from public.workspace_members 
      where user_id = auth.uid()
      and role in ('owner', 'admin')
    )
  )
);

-- ============================================================================
-- 4. GRANT PERMISSIONS
-- ============================================================================

grant select, insert, update, delete on public.campaign_shares to authenticated;
grant select, insert, update, delete on public.sequence_shares to authenticated;

