-- Add reply tracking fields to email_logs table
-- This migration adds thread_id, message_id, replied_at fields and related indexes

-- Add reply tracking fields
alter table public.email_logs
  add column if not exists thread_id text,
  add column if not exists message_id text,
  add column if not exists replied_at timestamptz;

-- Add indexes for efficient querying
create index if not exists email_logs_thread_idx on public.email_logs(thread_id);
create index if not exists email_logs_status_idx on public.email_logs(status);

-- Add lead_id column if it doesn't exist (for linking to leads table)
alter table public.email_logs
  add column if not exists lead_id uuid references public.leads(id) on delete set null;

-- Add index for lead_id lookups
create index if not exists email_logs_lead_idx on public.email_logs(lead_id);

-- Optional: Add computed column for quick reply status check on leads
alter table public.leads
  add column if not exists has_replied boolean generated always as (exists (
    select 1 from public.email_logs el
    where el.lead_id = leads.id and el.status = 'replied'
  )) stored;

-- Add index for the computed column
create index if not exists leads_has_replied_idx on public.leads(has_replied);