-- Add recipient and subject columns to email_events table
-- This migration enriches the email_events table with additional context

alter table if exists public.email_events
  add column if not exists recipient text,
  add column if not exists subject text;

-- Add indexes for better query performance
create index if not exists idx_email_events_recipient on public.email_events(recipient);
create index if not exists idx_email_events_subject on public.email_events(subject);

-- Add comments for documentation
comment on column public.email_events.recipient is 'Email address of the recipient';
comment on column public.email_events.subject is 'Subject line of the email';