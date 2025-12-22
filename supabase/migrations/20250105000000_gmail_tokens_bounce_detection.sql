-- Gmail Token Storage for Bounce Detection
-- Add gmail_tokens column to connected_accounts for storing OAuth tokens
-- Used for reading push notifications to detect bounces

-- Where we store OAuth tokens for Gmail per connected mailbox
alter table public.connected_accounts
  add column if not exists gmail_tokens jsonb;
  -- { access_token, refresh_token, expiry_date, scope, token_type, id_token? }

-- Optional helper view to hide secrets from the client
create or replace view public.v_connected_accounts_public as
select id, user_id, provider, daily_cap, warmup_enabled, warmup_day, warmup_started_at, provider_domain
from public.connected_accounts;

-- Add index on send_logs.to_email for bounce detection fallback queries
create index if not exists idx_send_logs_to_email_sent_at on public.send_logs(to_email, sent_at);

