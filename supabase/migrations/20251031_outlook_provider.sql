-- Add Outlook support to connected_accounts and provider_messages

-- Allow outlook in connected_accounts provider check
alter table public.connected_accounts
  drop constraint if exists connected_accounts_provider_check;

alter table public.connected_accounts
  add constraint connected_accounts_provider_check
  check (provider in ('gmail','outlook'));

-- Optional: index for outlook polling
create index if not exists idx_provider_messages_outlook
  on public.provider_messages(provider, provider_message_id)
  where provider='outlook';

-- Keep existing RLS/workspace policies (no changes needed)

