-- Add enrichment columns to leads table for AI-powered lead enrichment
-- This enables SmartSend to automatically enrich leads with company, title, location, LinkedIn, and summary

-- Add enrichment columns if they don't exist
alter table if exists public.leads
  add column if not exists location text,
  add column if not exists summary text;

-- Add index for location lookups
create index if not exists idx_leads_location on public.leads(location) where location is not null;

-- Add index for faster enrichment queries
create index if not exists idx_leads_enrichment on public.leads(team_id, created_at) 
  where company is null and title is null;

-- Add comment to document the enrichment feature
comment on column public.leads.location is 'Geographic location of the lead, enriched by AI';
comment on column public.leads.summary is 'AI-generated summary about the lead for personalization';

