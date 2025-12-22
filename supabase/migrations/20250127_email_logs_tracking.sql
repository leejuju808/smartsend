-- 07_email_logs_tracking.sql
-- Add tracking fields to email_logs table for open and click tracking

alter table public.email_logs
  add column if not exists opened_at timestamptz,
  add column if not exists clicked_at timestamptz,
  add column if not exists provider_message_id text;

create index if not exists email_logs_open_idx on public.email_logs (opened_at);
create index if not exists email_logs_click_idx on public.email_logs (clicked_at);
create index if not exists email_logs_provider_message_idx on public.email_logs (provider_message_id);