-- Block 229 — Lead Enrichment Mini v1
-- Add enrichment fields to leads table for AI-powered enrichment

ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS guessed_company text,
ADD COLUMN IF NOT EXISTS guessed_industry text,
ADD COLUMN IF NOT EXISTS guessed_title text,
ADD COLUMN IF NOT EXISTS guessed_linkedin text,
ADD COLUMN IF NOT EXISTS guessed_location text,
ADD COLUMN IF NOT EXISTS enriched boolean DEFAULT false;

-- Add indexes for filtering
CREATE INDEX IF NOT EXISTS idx_leads_enriched ON public.leads(enriched);
CREATE INDEX IF NOT EXISTS idx_leads_guessed_industry ON public.leads(guessed_industry);
CREATE INDEX IF NOT EXISTS idx_leads_guessed_location ON public.leads(guessed_location);










