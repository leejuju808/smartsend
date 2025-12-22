-- Gmail watch logs table
create table if not exists public.gmail_watch_logs (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  action text not null check (action in ('start','renew','stop','error')),
  history_id text,
  expiration_ms text,
  created_at timestamptz default now()
);

create index if not exists gmail_watch_logs_email_idx on public.gmail_watch_logs(email);

-- Ensure connected_accounts has email column (if using account_email, add email as well)
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'connected_accounts' 
    and column_name = 'email'
  ) then
    -- If account_email exists, copy it to email for compatibility
    if exists (
      select 1 from information_schema.columns 
      where table_schema = 'public' 
      and table_name = 'connected_accounts' 
      and column_name = 'account_email'
    ) then
      -- Add email column and populate from account_email
      alter table public.connected_accounts add column email text;
      update public.connected_accounts set email = account_email where email is null and account_email is not null;
    else
      alter table public.connected_accounts add column email text;
    end if;
  end if;
end $$;

-- Ensure connected_accounts has token_expiry column (if using expires_at, we'll handle both in code)
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'connected_accounts' 
    and column_name = 'token_expiry'
  ) then
    -- If expires_at exists, we'll use that in code, but add token_expiry for consistency
    alter table public.connected_accounts add column token_expiry timestamptz;
    -- Copy from expires_at if it exists
    if exists (
      select 1 from information_schema.columns 
      where table_schema = 'public' 
      and table_name = 'connected_accounts' 
      and column_name = 'expires_at'
    ) then
      update public.connected_accounts set token_expiry = expires_at where token_expiry is null and expires_at is not null;
    end if;
  end if;
end $$;

-- Ensure connected_accounts has last_history_id column
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'connected_accounts' 
    and column_name = 'last_history_id'
  ) then
    alter table public.connected_accounts add column last_history_id text;
  end if;
end $$;

