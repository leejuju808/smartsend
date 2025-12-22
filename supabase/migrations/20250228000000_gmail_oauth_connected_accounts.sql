-- Gmail OAuth Connected Accounts
-- Updates connected_accounts to match user's specification or creates it if needed

-- Check if table exists, if not create it
do $$ 
begin
  if not exists (select 1 from information_schema.tables where table_name = 'connected_accounts') then
    -- Create table if it doesn't exist
    create table connected_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('gmail','outlook')),
  email text not null,
  access_token text not null,          -- store KMS/Vault-encrypted at rest
  refresh_token text not null,
  expires_at timestamptz not null,     -- token expiry
  scope text,
  provider_account_id text,            -- Google sub / MS oid
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  end if;
end $$;

-- Add user_id column if it doesn't exist (for existing tables that use workspace_id)
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_name = 'connected_accounts' and column_name = 'user_id'
  ) then
    alter table connected_accounts add column user_id uuid references auth.users(id) on delete cascade;
    -- If you have workspace_id, you might want to map it or keep both
  end if;
end $$;

create unique index if not exists uq_connected_accounts_user_provider
  on connected_accounts(user_id, provider) where user_id is not null;

-- Add columns to emails table for Gmail provider tracking
alter table public.emails 
  add column if not exists provider text,
  add column if not exists provider_message_id text,
  add column if not exists provider_thread_id text;

create index if not exists idx_emails_provider_message_id on public.emails(provider, provider_message_id);

-- RLS policies for connected_accounts
alter table connected_accounts enable row level security;

-- Users can only see their own connected accounts
create policy if not exists "Users can view own connected accounts"
  on connected_accounts for select
  using (auth.uid() = user_id);

create policy if not exists "Users can insert own connected accounts"
  on connected_accounts for insert
  with check (auth.uid() = user_id);

create policy if not exists "Users can update own connected accounts"
  on connected_accounts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy if not exists "Users can delete own connected accounts"
  on connected_accounts for delete
  using (auth.uid() = user_id);

