-- =========================================================
-- Block 8870 — Revenue & Activity Dashboard v1
-- =========================================================
-- Add revenue tracking fields to leads table for dashboard metrics

-- Add revenue fields to leads table
alter table public.leads
  add column if not exists estimated_value numeric(12,2),
  add column if not exists actual_value numeric(12,2),
  add column if not exists closed_at timestamptz;

-- Create indexes for dashboard queries
create index if not exists idx_leads_closed_at 
  on public.leads(closed_at desc) 
  where closed_at is not null;

create index if not exists idx_leads_workspace_closed_at 
  on public.leads(workspace_id, closed_at desc) 
  where closed_at is not null and workspace_id is not null;

-- Index for pipeline value queries (non-won/non-lost with estimated_value)
create index if not exists idx_leads_pipeline_value 
  on public.leads(workspace_id, pipeline_stage, estimated_value) 
  where pipeline_stage not in ('won', 'lost') 
    and estimated_value is not null 
    and workspace_id is not null;

























































