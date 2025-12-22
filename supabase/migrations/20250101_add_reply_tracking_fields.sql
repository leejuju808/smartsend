-- Add reply tracking fields to email_logs table
-- This migration adds columns for reply detection and open/click tracking

alter table email_logs
  add column if not exists reply_from text,
  add column if not exists reply_subject text,
  add column if not exists reply_text text,
  add column if not exists opened_at timestamptz,
  add column if not exists clicked_at timestamptz;

-- Add index for message_id if it doesn't exist (for reply matching)
create index if not exists idx_email_logs_message_id on public.email_logs(message_id) where message_id is not null;

-- Add index for opened_at for faster queries
create index if not exists idx_email_logs_opened_at on public.email_logs(opened_at) where opened_at is not null;

-- Add index for clicked_at for faster queries
create index if not exists idx_email_logs_clicked_at on public.email_logs(clicked_at) where clicked_at is not null;
