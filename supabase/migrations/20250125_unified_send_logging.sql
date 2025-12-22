-- Unified Send Logging (Gmail + Outlook)
-- Add provider + ids to campaign_logs

alter table public.campaign_logs
  add column if not exists provider text check (provider in ('gmail','outlook')) default 'gmail',
  add column if not exists message_id text,
  add column if not exists snippet text;

-- Update thread_id to allow null temporarily (backward compatibility)
alter table public.campaign_logs alter column thread_id drop not null;

-- Helpful indexes
create index if not exists idx_campaign_logs_provider on public.campaign_logs(provider);
create index if not exists idx_campaign_logs_thread on public.campaign_logs(thread_id);
create index if not exists idx_campaign_logs_lead_provider on public.campaign_logs(lead_id, provider);
create index if not exists idx_campaign_logs_message_id on public.campaign_logs(message_id);

-- Optional: outbound/inbound flag for bidirectional tracking
alter table public.campaign_logs 
  add column if not exists direction text check (direction in ('outbound','inbound')) default 'outbound';

-- Ensure RLS policies allow owners to insert rows for their own leads
-- The existing policies should already handle this, but let's ensure it's clear
