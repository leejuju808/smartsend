-- Add click_url column to email_logs table
alter table public.email_logs
  add column if not exists click_url text;

create index if not exists email_logs_click_url_idx on public.email_logs (click_url);
