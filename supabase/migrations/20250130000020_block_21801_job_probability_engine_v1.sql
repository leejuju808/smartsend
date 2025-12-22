-- =========================================================
-- Block 21801 — SmartSend Roofing Job Probability Engine v1
-- 📈 Predict the Likelihood of Winning Every Job
-- =========================================================
-- This system gives every lead + proposal a Job Win Probability (0–100%), 
-- powered by real data. Roofers will see:
-- - Which leads will probably close
-- - Which ones are long shots
-- - Which ones need more follow-up
-- - Which estimator is more likely to win certain jobs
-- - How much pipeline revenue is real vs fake

-- ============================================================================
-- 1. ADD JOB PROBABILITY COLUMNS TO LEADS TABLE
-- ============================================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS job_probability INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS job_probability_category TEXT DEFAULT 'low';

-- Add indexes for fast filtering/sorting by job probability
CREATE INDEX IF NOT EXISTS idx_leads_job_probability ON public.leads(job_probability DESC);
CREATE INDEX IF NOT EXISTS idx_leads_job_probability_category ON public.leads(job_probability_category);

-- Add comments for documentation
COMMENT ON COLUMN public.leads.job_probability IS 'Block 21801: Job win probability score (0-100) indicating likelihood of closing. Higher = more likely to win.';
COMMENT ON COLUMN public.leads.job_probability_category IS 'Block 21801: Probability category: high (70-100), medium (40-69), low (0-39), dead (<0)';

-- ============================================================================
-- 2. HELPER FUNCTION TO COMPUTE PROBABILITY CATEGORY FROM SCORE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.compute_job_probability_category(p_score INTEGER)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_score >= 70 THEN
    RETURN 'high';
  ELSIF p_score >= 40 THEN
    RETURN 'medium';
  ELSIF p_score >= 0 THEN
    RETURN 'low';
  ELSE
    RETURN 'dead';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.compute_job_probability_category IS 'Block 21801: Converts job probability score (0-100) to category: high/medium/low/dead';









































