-- Block 261 — Lead Enrichment Engine v1
-- Add enrichment columns to leads table

ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS enriched boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS enriched_at timestamptz,
ADD COLUMN IF NOT EXISTS enrichment_source text,
ADD COLUMN IF NOT EXISTS enrichment_data jsonb,
ADD COLUMN IF NOT EXISTS enrichment_score int DEFAULT 0;

-- Indexes for enrichment queries
CREATE INDEX IF NOT EXISTS idx_leads_enriched ON public.leads(enriched) WHERE enriched = false;
CREATE INDEX IF NOT EXISTS idx_leads_enrichment_score ON public.leads(enrichment_score);
CREATE INDEX IF NOT EXISTS idx_leads_enrichment_source ON public.leads(enrichment_source);

-- Comments for documentation
COMMENT ON COLUMN public.leads.enriched IS 'Whether this lead has been enriched';
COMMENT ON COLUMN public.leads.enriched_at IS 'Timestamp when enrichment was completed';
COMMENT ON COLUMN public.leads.enrichment_source IS 'Source of enrichment data (e.g., engine_v1, clearbit, etc.)';
COMMENT ON COLUMN public.leads.enrichment_data IS 'Structured enrichment results stored as JSONB';
COMMENT ON COLUMN public.leads.enrichment_score IS 'Enrichment health score (0-100) based on available fields';









