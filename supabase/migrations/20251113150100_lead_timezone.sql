-- Block 180: Add timezone to leads table
-- Enables timezone-corrected delivery scheduling

alter table public.leads
  add column if not exists timezone text default 'America/Los_Angeles';

-- Index for timezone-based queries
create index if not exists idx_leads_timezone on public.leads(timezone);

-- Comment
comment on column public.leads.timezone is 'Lead timezone (IANA timezone name) for local-time send window enforcement. Default can be overwritten by enrichment from IP or location.';












