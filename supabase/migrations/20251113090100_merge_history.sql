-- Merge History Column
-- Records every merge action on leads table

alter table public.leads
  add column if not exists merge_history jsonb default '[]'::jsonb;

-- Add index for merge history queries
create index if not exists idx_leads_merge_history on public.leads using gin(merge_history);












