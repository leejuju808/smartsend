-- Gmail Pub/Sub webhook support: add last_history_id to connected_accounts
-- Track Gmail connection & last processed history id

alter table if exists public.connected_accounts
  add column if not exists last_history_id text;

-- Optional: speed
create index if not exists connected_accounts_email_idx on public.connected_accounts(email);

-- Ensure messages table has required columns for Gmail webhook
-- Note: thread_id can reference either threads.id (uuid) or campaign_logs.id (uuid) depending on schema
do $$
begin
  -- Add thread_id if it doesn't exist (nullable since we may match later)
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'messages' and column_name = 'thread_id'
  ) then
    alter table public.messages add column thread_id uuid;
  end if;

  -- Ensure direction supports 'incoming' (in addition to existing 'in','out')
  -- We'll allow both schemas for compatibility
  alter table public.messages drop constraint if exists messages_direction_check;
  alter table public.messages add constraint messages_direction_check 
    check (direction in ('in', 'out', 'incoming', 'outgoing', 'inbound', 'outbound'));

  -- Add external_id if missing
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'messages' and column_name = 'external_id'
  ) then
    alter table public.messages add column external_id text;
  end if;

  -- Add sent_at if missing
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'messages' and column_name = 'sent_at'
  ) then
    alter table public.messages add column sent_at timestamptz;
  end if;
end$$;

-- Ensure campaign_logs has required columns
do $$
begin
  -- Add email_id if missing
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'campaign_logs' and column_name = 'email_id'
  ) then
    alter table public.campaign_logs add column email_id text;
  end if;

  -- Add from_email if missing
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'campaign_logs' and column_name = 'from_email'
  ) then
    alter table public.campaign_logs add column from_email text;
  end if;

  -- Add to_email if missing
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'campaign_logs' and column_name = 'to_email'
  ) then
    alter table public.campaign_logs add column to_email text;
  end if;

  -- Add last_message_at if missing
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'campaign_logs' and column_name = 'last_message_at'
  ) then
    alter table public.campaign_logs add column last_message_at timestamptz;
  end if;

  -- Add replied if missing
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'campaign_logs' and column_name = 'replied'
  ) then
    alter table public.campaign_logs add column replied boolean default false;
  end if;
end$$;

-- Performance indexes (idempotent)
create index if not exists messages_external_idx on public.messages(external_id);
create index if not exists messages_thread_time_idx on public.messages(thread_id, sent_at) where thread_id is not null;
create index if not exists campaign_logs_email_from_to_idx on public.campaign_logs(from_email, to_email) where from_email is not null and to_email is not null;

