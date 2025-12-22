-- Add outbound tracking fields to emails table
alter table if exists public.emails
  add column if not exists provider text,           -- 'gmail' | 'outlook' | etc
  add column if not exists sent_at timestamptz,       -- when we successfully sent
  add column if not exists to_recipients text[];      -- parsed recipients when sending

-- Ensure is_incoming exists (for inbox compatibility)
alter table if exists public.emails
  add column if not exists is_incoming boolean default false;

-- Ensure sender exists (for inbox compatibility)
alter table if exists public.emails
  add column if not exists sender text;

-- Ensure gmail_message_id and gmail_thread_id exist
alter table if exists public.emails
  add column if not exists gmail_message_id text,
  add column if not exists gmail_thread_id text;

-- Add index for provider lookups
create index if not exists idx_emails_provider on public.emails(provider);
create index if not exists idx_emails_sent_at on public.emails(sent_at desc nulls last);

-- Ensure campaign_logs table has event column (it may use event_type in some migrations)
-- Add event column if it doesn't exist
alter table if exists public.campaign_logs
  add column if not exists event text;

-- Create index on campaign_logs.event for fast lookups
create index if not exists campaign_logs_event_idx on public.campaign_logs(event);

-- Also ensure email_id exists in campaign_logs for linking
alter table if exists public.campaign_logs
  add column if not exists email_id uuid references public.emails(id) on delete set null;

