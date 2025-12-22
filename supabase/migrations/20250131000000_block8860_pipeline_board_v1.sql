-- =========================================================
-- Block 8860 — Pipeline Board v1 (Kanban for Roofing Jobs)
-- =========================================================
-- This block adds pipeline_stage column to leads table for Kanban board functionality
-- Stages: new, contacted, scheduled, proposal, won, lost

-- Add pipeline_stage column to leads table
alter table public.leads
  add column if not exists pipeline_stage text not null default 'new'
  check (
    pipeline_stage in (
      'new',
      'contacted',
      'scheduled',
      'proposal',
      'won',
      'lost'
    )
  );

-- Create index for fast pipeline stage queries
create index if not exists idx_leads_pipeline_stage 
  on public.leads(pipeline_stage) 
  where pipeline_stage is not null;

-- Create index for workspace + pipeline stage queries
create index if not exists idx_leads_workspace_pipeline_stage 
  on public.leads(workspace_id, pipeline_stage) 
  where workspace_id is not null;

























































