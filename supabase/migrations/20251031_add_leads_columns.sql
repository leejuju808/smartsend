-- Add minimal import tracking columns to leads table
alter table if exists public.leads
  add column if not exists name text,
  add column if not exists company text,
  add column if not exists source text default 'csv'::text,
  add column if not exists import_batch uuid default gen_random_uuid(),
  add column if not exists meta jsonb default '{}'::jsonb;

-- Index for import batch queries
create index if not exists idx_leads_import_batch on public.leads(import_batch);

-- Index for GIN queries on meta field (if not exists)
create index if not exists idx_leads_meta on public.leads using gin (meta);

