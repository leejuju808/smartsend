-- Add provider_scopes column to sending_accounts table
-- This enables tracking which OAuth scopes are granted for each account

alter table if exists public.sending_accounts
  add column if not exists provider_scopes text[];

comment on column public.sending_accounts.provider_scopes is 'OAuth scopes granted for this account (e.g., gmail.send, gmail.readonly)';
