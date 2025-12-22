-- Block 441 — Saved Filters & Views v1
-- Global Saved Filters for Leads • Campaigns • Inboxes • Engagement • Custom Views + Sharing
-- This block gives SmartSend the UI/UX power that CRMs like HubSpot, Apollo, and Notion use

-- ============================================
-- 1) Create saved_views table
-- ============================================
create table if not exists public.saved_views (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  entity_type text not null check (entity_type in ('leads', 'campaigns', 'inboxes', 'sequences', 'events', 'domains')),
  config jsonb not null default '{}'::jsonb,
  -- config structure:
  -- {
  --   "filters": [
  --     { "field": "score", "operator": ">", "value": 50 },
  --     { "field": "status", "operator": "=", "value": "engaged" }
  --   ],
  --   "sort": [
  --     { "field": "created_at", "direction": "desc" }
  --   ],
  --   "hiddenColumns": ["phone_number", "owner_id"]
  -- }
  shared boolean not null default false,
  is_default boolean not null default false,
  category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================
-- 2) Indexes for performance
-- ============================================
create index if not exists idx_saved_views_workspace_entity on public.saved_views(workspace_id, entity_type);
create index if not exists idx_saved_views_user on public.saved_views(user_id);
create index if not exists idx_saved_views_shared on public.saved_views(workspace_id, shared, entity_type);
create index if not exists idx_saved_views_default on public.saved_views(workspace_id, user_id, entity_type, is_default) where is_default = true;

-- ============================================
-- 3) Unique constraint: only one default per user per entity
-- ============================================
create unique index if not exists idx_saved_views_unique_default 
on public.saved_views(workspace_id, user_id, entity_type) 
where is_default = true;

-- ============================================
-- 4) Update trigger for updated_at
-- ============================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_saved_views_updated_at
before update on public.saved_views
for each row
execute function public.set_updated_at();

-- ============================================
-- 5) Row Level Security (RLS)
-- ============================================
alter table public.saved_views enable row level security;

-- Policy: Users can read their own views and shared views in their workspace
create policy "saved_views_select"
on public.saved_views
for select
using (
  -- Own views
  user_id = auth.uid()
  OR
  -- Shared views in workspace
  (
    shared = true
    AND workspace_id IN (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
    )
  )
);

-- Policy: Users can create views in workspaces they're members of
create policy "saved_views_insert"
on public.saved_views
for insert
with check (
  workspace_id IN (
    select workspace_id from public.workspace_members
    where user_id = auth.uid()
  )
  AND user_id = auth.uid()
);

-- Policy: Users can update their own views
-- Admins/Owners can update shared views
create policy "saved_views_update"
on public.saved_views
for update
using (
  user_id = auth.uid()
  OR
  (
    shared = true
    AND workspace_id IN (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  )
)
with check (
  user_id = auth.uid()
  OR
  (
    shared = true
    AND workspace_id IN (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  )
);

-- Policy: Users can delete their own views
-- Admins/Owners can delete shared views
create policy "saved_views_delete"
on public.saved_views
for delete
using (
  user_id = auth.uid()
  OR
  (
    shared = true
    AND workspace_id IN (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  )
);

-- ============================================
-- 6) Helper function: Get user's role in workspace
-- ============================================
create or replace function public.get_user_workspace_role(p_workspace_id uuid, p_user_id uuid)
returns text
language sql
stable
as $$
  select role::text
  from public.workspace_members
  where workspace_id = p_workspace_id
  and user_id = p_user_id;
$$;

-- ============================================
-- 7) Function: Set default view (ensures only one default per user/entity)
-- ============================================
create or replace function public.set_default_saved_view(
  p_view_id uuid,
  p_workspace_id uuid,
  p_user_id uuid,
  p_entity_type text
)
returns void
language plpgsql
security definer
as $$
begin
  -- Unset other defaults for this user/entity
  update public.saved_views
  set is_default = false
  where workspace_id = p_workspace_id
    and user_id = p_user_id
    and entity_type = p_entity_type
    and is_default = true
    and id != p_view_id;
  
  -- Set this view as default
  update public.saved_views
  set is_default = true
  where id = p_view_id
    and workspace_id = p_workspace_id
    and user_id = p_user_id
    and entity_type = p_entity_type;
end;
$$;

-- ============================================
-- 8) Seed default views (optional - can be done via API)
-- ============================================
-- Note: Default views will be created via API on workspace creation
-- This is just a reference structure

comment on table public.saved_views is 'Saved filter and view configurations for data tables';
comment on column public.saved_views.entity_type is 'The table/entity this view applies to: leads, campaigns, inboxes, sequences, events, domains';
comment on column public.saved_views.config is 'JSONB containing filters, sort, and hiddenColumns configuration';
comment on column public.saved_views.shared is 'If true, view is visible to all workspace members';
comment on column public.saved_views.is_default is 'If true, this is the default view for this user/entity (only one allowed)';
comment on column public.saved_views.category is 'Optional category for organizing views (e.g., "My Views", "Team Views", "Lead Management")';



