-- Add missing last_checked_at column to connected_accounts for polling
alter table if exists public.connected_accounts
  add column if not exists last_checked_at timestamptz default now();

-- Add index for efficient polling queries
create index if not exists idx_connected_accounts_last_checked 
  on public.connected_accounts(last_checked_at) where last_checked_at is not null;

