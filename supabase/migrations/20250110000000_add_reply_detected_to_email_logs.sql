-- Add reply_detected column to email_logs table
-- This migration adds reply_detected boolean column for autonomous reply detection

-- Add reply_detected column if it doesn't exist
alter table public.email_logs
  add column if not exists reply_detected boolean default false;

-- Add index for efficient querying of reply_detected emails
create index if not exists email_logs_reply_detected_idx 
  on public.email_logs(reply_detected) 
  where reply_detected = true;

-- Add comment for documentation
comment on column public.email_logs.reply_detected is 
  'True when reply was automatically detected by the detect-replies edge function';

