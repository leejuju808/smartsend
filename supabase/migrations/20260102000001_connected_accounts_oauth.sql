-- Connected Accounts OAuth System
-- Unified table for storing OAuth tokens from email providers (Gmail, Outlook, etc.)
-- Used for reply detection and read-only access to inboxes
-- This migration harmonizes existing schemas and adds polling support

-- Add missing columns if table already exists (safe migration)
do $$
begin
  -- Add last_checked_at for polling support
  if not exists (select 1 from information_schema.columns 
      where table_schema = 'public' and table_name = 'connected_accounts' and column_name = 'last_checked_at') then
    alter table public.connected_accounts add column last_checked_at timestamptz;
  end if;
  
  -- Ensure email column exists
  if not exists (select 1 from information_schema.columns 
      where table_schema = 'public' and table_name = 'connected_accounts' and column_name = 'email') then
    alter table public.connected_accounts add column email text;
  end if;
  
  -- Support both token_expires_at and expires_at for compatibility
  if not exists (select 1 from information_schema.columns 
      where table_schema = 'public' and table_name = 'connected_accounts' and column_name = 'token_expires_at') then
    alter table public.connected_accounts add column token_expires_at timestamptz;
  end if;
end $$;

-- Create unique index on (user_id, provider, email)
create unique index if not exists connected_accounts_user_provider_email_uq
  on public.connected_accounts (user_id, provider, lower(email));

-- Create index for polling queries
create index if not exists connected_accounts_last_checked_idx
  on public.connected_accounts(last_checked_at);

-- Normalize email on insert/update
create or replace function public.normalize_connected_email()
returns trigger language plpgsql as $$
begin
  if new.email is not null then 
    new.email := lower(new.email); 
  end if;
  return new;
end $$;

drop trigger if exists trg_normalize_connected_email on public.connected_accounts;
create trigger trg_normalize_connected_email
before insert or update on public.connected_accounts
for each row execute function public.normalize_connected_email();

-- Create a safe public view (no tokens)
create or replace view public.connected_accounts_public as
select
  id,
  user_id,
  provider,
  email,
  coalesce(token_expires_at, expires_at) as token_expires_at,
  last_checked_at,
  created_at
from public.connected_accounts;

-- Enable row level security
alter table public.connected_accounts enable row level security;

-- RLS policies
drop policy if exists "owner can CRUD connected_accounts" on public.connected_accounts;
create policy "owner can CRUD connected_accounts"
on public.connected_accounts
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Allow public view to be read by owner
grant select on public.connected_accounts_public to authenticated;

create policy "owner can read accounts_public"
on public.connected_accounts
for select
to authenticated
using (auth.uid() = user_id);

