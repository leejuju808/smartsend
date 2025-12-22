-- =========================================================
-- Block 20300 — SmartSend Inbox Property Enrichment & Roof Age Guess v1
-- (Click once and SmartSend fills in house/roof details from the address.)
-- =========================================================

-- ============================================================================
-- PART 1 — Property Enrichment Events Log Table
-- ============================================================================
-- Log each enrichment so you can debug and maybe show history later

CREATE TABLE IF NOT EXISTS public.property_enrichment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  provider TEXT,                  -- e.g. 'estated', 'attom', 'mock'
  status TEXT,                    -- 'success' | 'error'
  message TEXT,
  raw_payload JSONB,              -- optional: provider response snippet
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_property_enrichment_conversation
ON public.property_enrichment_events (conversation_id);

-- ============================================================================
-- PART 2 — Add City/State/Zip Fields to inbox_threads (if not exist)
-- ============================================================================
-- These fields are needed for property enrichment lookups

ALTER TABLE IF EXISTS public.inbox_threads
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS zip TEXT;

-- Indexes for address lookups
CREATE INDEX IF NOT EXISTS idx_inbox_threads_city ON public.inbox_threads(city) WHERE city IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inbox_threads_state ON public.inbox_threads(state) WHERE state IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inbox_threads_zip ON public.inbox_threads(zip) WHERE zip IS NOT NULL;

-- ============================================================================
-- PART 3 — Comments
-- ============================================================================

COMMENT ON TABLE public.property_enrichment_events IS 'Logs each property enrichment event for debugging and history tracking';
COMMENT ON COLUMN public.property_enrichment_events.provider IS 'Property data provider: estated, attom, mock, etc.';
COMMENT ON COLUMN public.property_enrichment_events.status IS 'Enrichment status: success or error';
COMMENT ON COLUMN public.property_enrichment_events.raw_payload IS 'Optional provider response snippet for debugging';

















































