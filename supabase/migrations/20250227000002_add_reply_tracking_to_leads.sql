-- Add reply tracking columns to leads table
-- This migration adds the columns needed for the reply detection system

alter table public.leads
  add column if not exists replied boolean default false,
  add column if not exists reply_text text,
  add column if not exists replied_at timestamptz;

-- Create index for fast querying of replied leads
create index if not exists idx_leads_replied on public.leads(replied, replied_at desc) where replied = true;

