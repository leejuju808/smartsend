-- Update user_connections table to support Gmail OAuth flow
-- Add email_address column and rename expires_at to token_expires_at
-- Make access_token and refresh_token required

-- Add email_address column if it doesn't exist
alter table public.user_connections 
  add column if not exists email_address text;

-- Rename expires_at to token_expires_at if it exists and token_expires_at doesn't
do $$
begin
  if exists (select 1 from information_schema.columns 
             where table_schema = 'public' 
             and table_name = 'user_connections' 
             and column_name = 'expires_at')
     and not exists (select 1 from information_schema.columns 
                     where table_schema = 'public' 
                     and table_name = 'user_connections' 
                     and column_name = 'token_expires_at') then
    alter table public.user_connections 
      rename column expires_at to token_expires_at;
  end if;
end $$;

-- Ensure token_expires_at exists (create if rename didn't happen)
alter table public.user_connections 
  add column if not exists token_expires_at timestamptz;

-- Make access_token and refresh_token NOT NULL (with default for existing rows)
update public.user_connections 
  set access_token = '' where access_token is null;
update public.user_connections 
  set refresh_token = '' where refresh_token is null;

alter table public.user_connections 
  alter column access_token set not null,
  alter column refresh_token set not null;

