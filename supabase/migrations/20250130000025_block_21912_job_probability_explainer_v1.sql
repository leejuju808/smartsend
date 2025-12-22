-- =========================================================
-- Block 21912 — SmartSend Roofing Job Probability Explainer v1
-- 📊 "Why Is This Job at 62%?" — Transparent AI That Roofers Trust
-- =========================================================
-- This system explains WHY a lead has a specific job probability score.
-- It generates natural language explanations using AI, showing:
-- - Positive factors (why probability increases)
-- - Negative factors (why probability decreases)
-- - Risk drivers
-- - Action recommendations
-- - Confidence score
--
-- This dramatically increases trust, retention, and usage of SmartSend.
-- Roofers HATE black-box AI. They want clarity and understanding.

-- ============================================================================
-- 1. ADD PROBABILITY EXPLANATION COLUMNS TO LEADS TABLE
-- ============================================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS probability_explanation JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS probability_confidence INTEGER DEFAULT NULL;

-- Add index for fast filtering/sorting by confidence
CREATE INDEX IF NOT EXISTS idx_leads_probability_confidence 
  ON public.leads(probability_confidence DESC NULLS LAST)
  WHERE probability_confidence IS NOT NULL;

-- Add GIN index for JSONB queries on explanation
CREATE INDEX IF NOT EXISTS idx_leads_probability_explanation_gin 
  ON public.leads USING GIN(probability_explanation)
  WHERE probability_explanation IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN public.leads.probability_explanation IS 'Block 21912: AI-generated explanation of job probability score. JSON structure: {positive_factors: [], negative_factors: [], risk_drivers: [], action_recommendations: [], confidence: 0-100}';
COMMENT ON COLUMN public.leads.probability_confidence IS 'Block 21912: AI confidence score (0-100) in the probability explanation. Higher = more confident in the explanation.';

-- ============================================================================
-- 2. HELPER FUNCTION TO TRIGGER EXPLANATION GENERATION
-- ============================================================================
-- This function can be called from triggers or edge functions
-- to automatically generate explanations when probability changes

CREATE OR REPLACE FUNCTION public.trigger_probability_explanation(p_lead_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- This function is a placeholder that can be called from triggers
  -- The actual explanation generation happens in the edge function
  -- We log an event to job_timelines to indicate explanation should be generated
  INSERT INTO public.job_timelines (
    lead_id,
    event_type,
    event_data
  ) VALUES (
    p_lead_id,
    'probability_explanation_requested',
    jsonb_build_object('triggered_at', now())
  ) ON CONFLICT DO NOTHING;
END;
$$;

COMMENT ON FUNCTION public.trigger_probability_explanation IS 'Block 21912: Triggers probability explanation generation for a lead. Should be called when job_probability changes.';









































