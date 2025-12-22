-- Add thread_id column to leads table for Gmail thread tracking
-- This allows efficient lookup of threads without searching Gmail API

alter table leads add column if not exists thread_id text;

create index if not exists idx_leads_thread on leads(thread_id);

