-- Create connected_accounts table for Gmail OAuth integration
create table if not exists connected_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  provider text not null, -- 'gmail'
  account_email text not null,
  access_token text not null,
  refresh_token text not null,
  scope text,
  token_expiry timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider, account_email)
);

-- Add indexes for efficient lookups
create index if not exists idx_connected_accounts_workspace_provider on connected_accounts(workspace_id, provider);
create index if not exists idx_connected_accounts_token_expiry on connected_accounts(token_expiry) where token_expiry is not null;

-- Add RLS policies
alter table connected_accounts enable row level security;

-- Policy to allow workspace members to read their workspace's connected accounts
create policy "Workspace members can view connected accounts"
  on connected_accounts for select
  using (
    exists (
      select 1 from workspace_members wm
      where wm.workspace_id = connected_accounts.workspace_id
      and wm.user_id = auth.uid()
    )
  );

-- Policy to allow workspace members to insert (for OAuth flow)
create policy "Workspace members can insert connected accounts"
  on connected_accounts for insert
  with check (
    exists (
      select 1 from workspace_members wm
      where wm.workspace_id = connected_accounts.workspace_id
      and wm.user_id = auth.uid()
    )
  );

-- Policy to allow workspace members to update their connected accounts
create policy "Workspace members can update connected accounts"
  on connected_accounts for update
  using (
    exists (
      select 1 from workspace_members wm
      where wm.workspace_id = connected_accounts.workspace_id
      and wm.user_id = auth.uid()
    )
  );

-- Policy to allow workspace members to delete their connected accounts
create policy "Workspace members can delete connected accounts"
  on connected_accounts for delete
  using (
    exists (
      select 1 from workspace_members wm
      where wm.workspace_id = connected_accounts.workspace_id
      and wm.user_id = auth.uid()
    )
  );
