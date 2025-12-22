-- Add has_replied column to emails table for automatic reply detection
alter table public.emails
  add column if not exists has_replied boolean default false;

-- Add index for efficient querying
create index if not exists idx_emails_has_replied on public.emails(has_replied);

-- Also ensure thread_id exists on emails table (may already exist)
alter table public.emails
  add column if not exists thread_id text;

-- Add index for thread_id lookups
create index if not exists idx_emails_thread_id on public.emails(thread_id);

