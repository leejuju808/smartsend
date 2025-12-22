-- Add meta jsonb field to leads table for storing unmapped CSV columns
alter table if exists public.leads
  add column if not exists meta jsonb default '{}'::jsonb;

-- Create index for meta field queries
create index if not exists idx_leads_meta on public.leads using gin (meta); 