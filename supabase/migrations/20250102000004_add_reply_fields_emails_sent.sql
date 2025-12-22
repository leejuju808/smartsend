-- Add reply tracking fields to emails_sent table
-- This migration adds last_reply_at, last_reply_snippet columns and an index

alter table if exists public.emails_sent
  add column if not exists last_reply_at timestamptz,
  add column if not exists last_reply_snippet text;

-- Create index for efficient querying by updated_at
create index if not exists idx_emails_sent_updated on public.emails_sent(updated_at desc nulls last);

