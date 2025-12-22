-- Account Credentials System
-- Minimal account metadata + credentials separation for multi-provider email sending

-- 1) Add columns to connected_accounts for minimal metadata
alter table public.connected_accounts
  add column if not exists provider text check (provider in ('gmail','outlook','smtp')) default 'gmail',
  add column if not exists email_address text,
  add column if not exists from_name text;

-- 2) Create account_credentials table for OAuth/SMTP secrets (service-role only)
create table if not exists public.account_credentials (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  provider text not null,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  tenant_id text,        -- outlook/AAD
  smtp_host text,
  smtp_port int,
  smtp_user text,
  smtp_pass text,
  unique(account_id)
);

-- 3) Tighten access (RLS off; read/write via service role only)
alter table public.account_credentials enable row level security;

drop policy if exists "deny all" on public.account_credentials;
create policy "deny all" on public.account_credentials for all using (false) with check (false);

-- 4) Indexes for performance
create index if not exists idx_account_credentials_account_id on public.account_credentials(account_id);
create index if not exists idx_account_credentials_provider on public.account_credentials(provider);

