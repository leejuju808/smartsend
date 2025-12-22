-- Add reply tracking fields to sequence_jobs table
-- This enables tracking when recipients reply to sequence emails

alter table public.sequence_jobs
  add column if not exists replied_at timestamptz,
  add column if not exists reply_from text,
  add column if not exists reply_subject text,
  add column if not exists reply_snippet text,
  add column if not exists reply_message_id text;

-- Optional helpful index for provider message ID lookups
create index if not exists sequence_jobs_provider_msg_idx on public.sequence_jobs (provider_message_id);