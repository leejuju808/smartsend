-- Gmail Reply Detection Migration
-- Adds thread linkage and reply metadata to email_logs table
-- Adds last_history_id tracking to user_email_providers table

-- Add reply detection columns to email_logs
alter table public.email_logs
  add column if not exists provider_thread_id text,
  add column if not exists provider_message_id text,
  add column if not exists reply_intent text,          -- e.g. 'positive' | 'neutral' | 'ooo' | 'bounce'
  add column if not exists reply_snippet text,
  add column if not exists replied_at timestamptz;

-- Store last processed Gmail history position per connected account
alter table public.user_email_providers
  add column if not exists last_history_id text;

-- Create indexes for efficient reply matching
create index if not exists email_logs_thread_idx on public.email_logs (provider_thread_id);
create index if not exists email_logs_provider_msg_idx on public.email_logs (provider_message_id);
create index if not exists email_logs_replied_at_idx on public.email_logs (replied_at) where replied_at is not null;

-- Update status check constraint to include 'replied'
alter table public.email_logs drop constraint if exists email_logs_status_check;
alter table public.email_logs add constraint email_logs_status_check 
  check (status in ('queued','sent','delivered','opened','clicked','replied','failed','skipped_suppressed'));