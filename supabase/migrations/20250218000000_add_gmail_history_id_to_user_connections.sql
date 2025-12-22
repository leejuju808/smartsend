-- Add gmail_history_id to user_connections for incremental Gmail sync
-- This allows us to use Gmail's History API for efficient polling

alter table public.user_connections
  add column if not exists gmail_history_id text;

-- Add index for faster lookups of Gmail connections
create index if not exists idx_user_connections_gmail
  on public.user_connections(provider)
  where provider = 'gmail';

-- Rename expires_at to token_expires_at for consistency with the spec
alter table public.user_connections
  rename column expires_at to token_expires_at;

