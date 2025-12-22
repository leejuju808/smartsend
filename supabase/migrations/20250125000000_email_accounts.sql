-- Create email_accounts table for connected inboxes
create table if not exists public.email_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  user_id uuid not null,
  provider text not null check (provider in ('gmail','outlook')),
  email text not null,
  access_token text not null,     -- store encrypted at rest
  refresh_token text not null,    -- store encrypted at rest
  expires_at timestamptz not null,
  last_checked_at timestamptz,    -- watermark for polling
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Create index for efficient querying of active accounts
create index if not exists idx_email_accounts_active
  on public.email_accounts (is_active, provider);

-- Create index for workspace-based queries
create index if not exists idx_email_accounts_workspace
  on public.email_accounts (workspace_id, is_active);

-- Enable Row Level Security
alter table public.email_accounts enable row level security;

-- Policy: Users can read their own accounts
create policy "owner can read their accounts"
on public.email_accounts for select
to authenticated
using (auth.uid() = user_id);

-- Policy: Users can insert their own accounts
create policy "owner can insert their accounts"
on public.email_accounts for insert
to authenticated
with check (auth.uid() = user_id);

-- Policy: Users can update their own accounts
create policy "owner can update their accounts"
on public.email_accounts for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Policy: Users can delete their own accounts
create policy "owner can delete their accounts"
on public.email_accounts for delete
to authenticated
using (auth.uid() = user_id);

-- Service role can do everything (for server functions)
create policy "service role full access"
on public.email_accounts
to service_role
using (true)
with check (true);