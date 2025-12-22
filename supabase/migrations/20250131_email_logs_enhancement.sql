-- Enhance email_logs table with additional fields for send queue system
-- Add missing fields to support the new send queue system

-- Add body_html column if it doesn't exist
alter table public.email_logs
  add column if not exists body_html text;

-- Add body_text column if it doesn't exist
alter table public.email_logs
  add column if not exists body_text text;

-- Add provider column to track which email provider was used
alter table public.email_logs
  add column if not exists provider text default 'gmail' check (provider in ('gmail', 'outlook', 'smtp'));

-- Add provider_message_id if it doesn't exist (may already be in another migration)
alter table public.email_logs
  add column if not exists provider_message_id text;

-- Add opened_at if it doesn't exist (may already be in another migration)
alter table public.email_logs
  add column if not exists opened_at timestamptz;

-- Add clicked_at if it doesn't exist (may already be in another migration)
alter table public.email_logs
  add column if not exists clicked_at timestamptz;

-- Add click_url if it doesn't exist (may already be in another migration)
alter table public.email_logs
  add column if not exists click_url text;

-- Create index on provider if it doesn't exist
create index if not exists email_logs_provider_idx on public.email_logs (provider);

-- Grant service role permission to insert/update email_logs (for send queue worker)
grant insert, update on public.email_logs to service_role;
