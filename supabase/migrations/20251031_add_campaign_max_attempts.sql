-- Add max_attempts column to campaigns table if it doesn't exist
alter table if exists public.campaigns
  add column if not exists max_attempts int default 3;

