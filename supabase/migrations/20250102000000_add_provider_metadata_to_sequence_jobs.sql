-- Add provider metadata columns to sequence_jobs table
-- This enables tracking of email provider details and retry logic

alter table public.sequence_jobs
  add column if not exists provider text,
  add column if not exists provider_message_id text,
  add column if not exists retry_count int not null default 0;