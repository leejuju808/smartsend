-- Add workspace_invites table for magic-link invitations
create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  email text not null,
  token text not null unique,
  role public.workspace_role not null default 'member',
  expires_at timestamptz not null,
  accepted_at timestamptz
);

-- Add invited_by to workspace_members if not exists (optional tracking)
alter table if exists public.workspace_members add column if not exists invited_by uuid;

-- Enable RLS on workspace_invites
alter table public.workspace_invites enable row level security;

-- RLS policies for workspace_invites
create policy "inv_read" on public.workspace_invites
  for select using ( public.is_workspace_admin(workspace_id) );

create policy "inv_write" on public.workspace_invites
  for insert with check ( public.is_workspace_admin(workspace_id) );

create policy "inv_update" on public.workspace_invites
  for update using ( public.is_workspace_admin(workspace_id) );

create policy "inv_delete" on public.workspace_invites
  for delete using ( public.is_workspace_admin(workspace_id) );

-- Helper function to check role level
create or replace function public.role_at_least(p_workspace uuid, p_min public.workspace_role)
returns boolean language sql stable as $$
  select (
    select case
      when wm.role='owner' then 4
      when wm.role='admin' then 3
      when wm.role='member' then 2
      else 1
    end >= case
      when p_min='owner' then 4
      when p_min='admin' then 3
      when p_min='member' then 2
      else 1
    end
    from public.workspace_members wm
    where wm.workspace_id = p_workspace and wm.user_id = auth.uid()
  ) is true;
$$;

-- Update existing policies to use role_at_least for more granular control
-- Add member management policies (if not already existing)
create policy "wm_member_create" on public.workspace_members
  for insert with check ( public.is_workspace_admin(workspace_id) );

create policy "wm_member_update" on public.workspace_members
  for update using ( public.is_workspace_admin(workspace_id) );

create policy "wm_member_delete" on public.workspace_members
  for delete using ( public.is_workspace_admin(workspace_id) );

-- Add workspace_id to sending_accounts if missing
alter table if exists public.sending_accounts add column if not exists workspace_id uuid references public.workspaces(id);

-- Add workspace_id to campaign_logs if missing  
alter table if exists public.campaign_logs add column if not exists workspace_id uuid references public.workspaces(id);

-- Enable RLS if not already enabled
alter table if exists public.sending_accounts enable row level security;
alter table if exists public.campaign_logs enable row level security;

-- Add RLS policies for sending_accounts
create policy "accounts_read" on public.sending_accounts
  for select using ( public.is_workspace_member(workspace_id) );

create policy "accounts_write" on public.sending_accounts
  for insert with check ( public.is_workspace_admin(workspace_id) );

create policy "accounts_update" on public.sending_accounts
  for update using ( public.is_workspace_admin(workspace_id) );

create policy "accounts_delete" on public.sending_accounts
  for delete using ( public.is_workspace_admin(workspace_id) );

-- Add RLS policies for campaign_logs
create policy "logs_read" on public.campaign_logs
  for select using ( public.is_workspace_member(workspace_id) );

create policy "logs_write" on public.campaign_logs
  for insert with check ( public.is_workspace_member(workspace_id) );
