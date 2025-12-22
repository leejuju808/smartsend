-- Ensure gmail_accounts table exists with correct schema for reply detection
-- This table is used by the Gmail OAuth integration and polling system

create table if not exists public.gmail_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  access_token text,
  refresh_token text not null,
  token_expiry timestamptz,
  last_checked timestamptz default (now() - interval '10 minutes'),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Add missing columns if table already exists
do $$
begin
  -- Add columns that might not exist
  if not exists (select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'gmail_accounts' and column_name = 'email') then
    alter table public.gmail_accounts add column email text;
  end if;
  
  if not exists (select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'gmail_accounts' and column_name = 'access_token') then
    alter table public.gmail_accounts add column access_token text;
  end if;
  
  if not exists (select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'gmail_accounts' and column_name = 'refresh_token') then
    alter table public.gmail_accounts add column refresh_token text;
  end if;
  
  if not exists (select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'gmail_accounts' and column_name = 'token_expiry') then
    alter table public.gmail_accounts add column token_expiry timestamptz;
  end if;
  
  if not exists (select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'gmail_accounts' and column_name = 'last_checked') then
    alter table public.gmail_accounts add column last_checked timestamptz default (now() - interval '10 minutes');
  end if;
  
  if not exists (select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'gmail_accounts' and column_name = 'created_at') then
    alter table public.gmail_accounts add column created_at timestamptz default now();
  end if;
  
  if not exists (select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'gmail_accounts' and column_name = 'updated_at') then
    alter table public.gmail_accounts add column updated_at timestamptz default now();
  end if;
  
  -- Set defaults on existing null columns (safe operation)
  alter table public.gmail_accounts 
    alter column last_checked set default (now() - interval '10 minutes'),
    alter column created_at set default now(),
    alter column updated_at set default now();
end $$;

-- Enable row level security
alter table public.gmail_accounts enable row level security;

-- Drop existing policies and recreate
drop policy if exists "owner read" on public.gmail_accounts;
create policy "owner read" on public.gmail_accounts
  for select using (auth.uid() = user_id);

drop policy if exists "owner upsert" on public.gmail_accounts;
create policy "owner upsert" on public.gmail_accounts
  for insert with check (auth.uid() = user_id);

drop policy if exists "owner update" on public.gmail_accounts;
create policy "owner update" on public.gmail_accounts
  for update using (auth.uid() = user_id);

-- Create trigger to update updated_at
create or replace function public.update_gmail_accounts_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_gmail_accounts_updated_at on public.gmail_accounts;
create trigger trg_gmail_accounts_updated_at
before update on public.gmail_accounts
for each row execute function public.update_gmail_accounts_updated_at();

