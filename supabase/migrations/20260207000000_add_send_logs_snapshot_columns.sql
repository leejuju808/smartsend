-- Add snapshot columns to send_logs for email preview
alter table public.send_logs
  add column if not exists subject_rendered text,
  add column if not exists html_rendered text,
  add column if not exists headers jsonb,             -- optional: From/To/Message-Id
  add column if not exists provider_url text;         -- optional deep-link (Gmail/Outlook/etc)

-- Create index if not exists
create index if not exists idx_send_logs_by_id on public.send_logs(id);

