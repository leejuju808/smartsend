-- 03_gmail_accounts.sql
-- Create gmail_accounts table for storing Gmail OAuth tokens
-- Handles both new tables (user_id as PK) and existing tables (id as PK)

-- Check if table exists
do $$
begin
  if not exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'gmail_accounts'
  ) then
    -- Create table with user_id as primary key (new schema)
    create table public.gmail_accounts (
      user_id uuid primary key references auth.users(id) on delete cascade,
      email text not null,
      access_token text,
      refresh_token text not null,
      token_expiry timestamptz,
      last_checked timestamptz default (now() - interval '10 minutes')
    );
  else
    -- Table exists, add missing columns
    alter table public.gmail_accounts
      add column if not exists email text,
      add column if not exists access_token text,
      add column if not exists refresh_token text,
      add column if not exists token_expiry timestamptz,
      add column if not exists last_checked timestamptz default (now() - interval '10 minutes');
    
    -- If table has id column but not user_id, ensure user_id exists
    if exists (
      select 1 from information_schema.columns 
      where table_schema = 'public' 
      and table_name = 'gmail_accounts' 
      and column_name = 'id'
    ) and not exists (
      select 1 from information_schema.columns 
      where table_schema = 'public' 
      and table_name = 'gmail_accounts' 
      and column_name = 'user_id'
    ) then
      -- Add user_id column (assuming it maps from existing structure)
      -- Note: You may need to populate this from existing data
      alter table public.gmail_accounts
        add column if not exists user_id uuid references auth.users(id) on delete cascade;
    end if;
  end if;
end $$;

-- RLS policies
alter table public.gmail_accounts enable row level security;

drop policy if exists "owner can read" on public.gmail_accounts;
create policy "owner can read" on public.gmail_accounts
  for select using (auth.uid() = user_id);

drop policy if exists "owner can update" on public.gmail_accounts;
create policy "owner can update" on public.gmail_accounts
  for update using (auth.uid() = user_id);

-- Add helpful index for thread_id lookups on emails_sent
create index if not exists idx_emails_sent_thread on public.emails_sent(thread_id);

