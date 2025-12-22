-- Block 418: Outbound API v1
-- Creates API keys table for workspace-based API authentication

-- Create api_keys table
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text,
  key_hash text not null,
  created_at timestamptz default now(),
  last_used_at timestamptz
);

-- Add index for workspace lookups
create index if not exists idx_api_keys_workspace
on public.api_keys(workspace_id);

-- Add index for key_hash lookups (for authentication)
create index if not exists idx_api_keys_hash
on public.api_keys(key_hash);

-- Enable RLS
alter table public.api_keys enable row level security;

-- RLS Policy: Workspace members can view their workspace's API keys
create policy "api_keys_select_workspace_members"
on public.api_keys for select
using (
  exists (
    select 1 from public.workspace_members
    where workspace_members.workspace_id = api_keys.workspace_id
    and workspace_members.user_id = auth.uid()
  )
);

-- RLS Policy: Workspace owners/admins can manage API keys
create policy "api_keys_manage_workspace_admins"
on public.api_keys for all
using (
  exists (
    select 1 from public.workspace_members
    where workspace_members.workspace_id = api_keys.workspace_id
    and workspace_members.user_id = auth.uid()
    and workspace_members.role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1 from public.workspace_members
    where workspace_members.workspace_id = api_keys.workspace_id
    and workspace_members.user_id = auth.uid()
    and workspace_members.role in ('owner', 'admin')
  )
);

-- Ensure campaign_leads has workspace_id column (for API compatibility)
alter table public.campaign_leads
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

-- Create index for workspace lookups on campaign_leads
create index if not exists idx_campaign_leads_workspace
on public.campaign_leads(workspace_id);

