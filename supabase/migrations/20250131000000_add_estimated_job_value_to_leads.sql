-- Block 8500 — Owner Dashboard (Today's Money Snapshot)
-- Add estimated_job_value column to leads table

alter table public.leads
add column if not exists estimated_job_value numeric(12,2) null;

-- Add index for efficient pipeline value queries
create index if not exists idx_leads_status_estimated_value
  on public.leads(status, estimated_job_value)
  where status in ('open', 'in_progress') and estimated_job_value is not null;

comment on column public.leads.estimated_job_value is 'Estimated job value in dollars for pipeline calculations';

























































