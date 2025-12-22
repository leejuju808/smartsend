-- Update email_logs table for analytics tracking
-- Add timestamp column and update status check constraint to include delivered, opened, replied

-- Add timestamp column if not exists
alter table public.email_logs
  add column if not exists timestamp timestamptz default now();

-- Drop and recreate status check constraint to include new statuses
alter table public.email_logs
  drop constraint if exists email_logs_status_check;

alter table public.email_logs
  add constraint email_logs_status_check
  check (status in ('queued', 'sent', 'delivered', 'failed', 'skipped_suppressed', 'opened', 'replied'));

-- Ensure campaign_id and lead_id are properly indexed
create index if not exists email_logs_campaign_lead_idx on public.email_logs(campaign_id, lead_id);
create index if not exists email_logs_timestamp_idx on public.email_logs(timestamp);