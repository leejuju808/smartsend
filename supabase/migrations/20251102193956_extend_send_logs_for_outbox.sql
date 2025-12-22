-- Extend send_logs table for clarity and retry tracking
-- Add columns: subject, recipient_email, retry_count

alter table public.send_logs 
  add column if not exists subject text,
  add column if not exists recipient_email text,
  add column if not exists retry_count int default 0,
  add column if not exists status text check (status in ('sent', 'failed'));

-- Update status based on error column for existing records
-- If error exists, set status to 'failed', otherwise 'sent'
update public.send_logs
set status = case when error is not null and error != '' then 'failed' else 'sent' end
where status is null;

-- Create index on status for faster filtering
create index if not exists idx_send_logs_status on public.send_logs(status);

-- Create index on recipient_email for faster queries
create index if not exists idx_send_logs_recipient_email on public.send_logs(recipient_email);

-- Create index on retry_count
create index if not exists idx_send_logs_retry_count on public.send_logs(retry_count);

