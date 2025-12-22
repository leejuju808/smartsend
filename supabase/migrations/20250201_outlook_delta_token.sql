-- Add delta_token column for Outlook accounts to support incremental sync
alter table public.email_accounts
  add column if not exists delta_token text;

create index if not exists idx_email_accounts_delta
  on public.email_accounts (delta_token)
  where delta_token is not null;

comment on column public.email_accounts.delta_token is 'Delta sync token for Outlook/Microsoft Graph incremental queries';
