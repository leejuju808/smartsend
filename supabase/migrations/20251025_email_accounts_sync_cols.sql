alter table public.email_accounts
  add column if not exists last_sync_at timestamptz,
  add column if not exists last_sync_status text check (last_sync_status in ('ok','error')) ,
  add column if not exists last_sync_error text;

-- Optional: for quick filtering
create index if not exists idx_email_accounts_last_sync on public.email_accounts (last_sync_at desc); 