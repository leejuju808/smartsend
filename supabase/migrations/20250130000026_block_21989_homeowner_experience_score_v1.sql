-- ============================================================================
-- Block 21989 — SmartSend Roofing "Homeowner Experience Score" v1
-- (💬 How Does the Homeowner Feel About the Sales Process? — The Missing Signal That Changes Everything)
-- ============================================================================
-- FULL BLOCK. PURE WEAPON MODE. ZERO FLUFF.
--
-- This block adds the final emotional intelligence layer that NO roofing CRM has:
-- Homeowner Experience Score (0–100)
-- A single metric showing how positive or negative the homeowner's journey has been.
--
-- This literally tells owners:
-- "This homeowner likes you, keep going."
-- "This homeowner is slipping away."
-- "This homeowner is frustrated — fix it now."
-- "This homeowner is loving the communication — push the close."
--
-- INSANE value. INSANE retention.
--
-- This dataset ties into:
-- - Job Probability
-- - Risk Engine
-- - Routing
-- - Coaching
-- - Follow-up Logic
-- - Win/Loss Patterns
-- - Proposal Timing
-- - Action Queue
--
-- This makes SmartSend a sales psychologist.
-- ============================================================================

-- ============================================================================
-- 1. ADD HOMEOWNER EXPERIENCE COLUMNS TO LEADS TABLE
-- ============================================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS homeowner_experience_score INTEGER DEFAULT 50,
  ADD COLUMN IF NOT EXISTS experience_trend TEXT DEFAULT 'stable',
  ADD COLUMN IF NOT EXISTS last_experience_update TIMESTAMPTZ;

-- Add check constraint for experience_trend
ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_experience_trend_check;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_experience_trend_check
  CHECK (experience_trend IN ('improving', 'declining', 'stable'));

-- Add check constraint for homeowner_experience_score
ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_homeowner_experience_score_check;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_homeowner_experience_score_check
  CHECK (homeowner_experience_score >= 0 AND homeowner_experience_score <= 100);

-- Add indexes for fast filtering/sorting by experience score
CREATE INDEX IF NOT EXISTS idx_leads_homeowner_experience_score 
  ON public.leads(homeowner_experience_score DESC);

CREATE INDEX IF NOT EXISTS idx_leads_experience_trend 
  ON public.leads(experience_trend);

CREATE INDEX IF NOT EXISTS idx_leads_experience_trend_score 
  ON public.leads(experience_trend, homeowner_experience_score DESC);

-- Add comments for documentation
COMMENT ON COLUMN public.leads.homeowner_experience_score IS 'Block 21989: Homeowner experience score (0-100) indicating how positive or negative the homeowner journey has been. Higher = more positive experience.';
COMMENT ON COLUMN public.leads.experience_trend IS 'Block 21989: Experience trend: improving (score increasing), declining (score decreasing), stable (no change)';
COMMENT ON COLUMN public.leads.last_experience_update IS 'Block 21989: Timestamp of last experience score update';

-- ============================================================================
-- 2. HELPER FUNCTION TO COMPUTE EXPERIENCE TREND
-- ============================================================================

CREATE OR REPLACE FUNCTION public.compute_experience_trend(
  p_old_score INTEGER,
  p_new_score INTEGER
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_new_score > p_old_score THEN
    RETURN 'improving';
  ELSIF p_new_score < p_old_score THEN
    RETURN 'declining';
  ELSE
    RETURN 'stable';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.compute_experience_trend IS 'Block 21989: Computes experience trend based on old and new scores: improving/declining/stable';

-- ============================================================================
-- 3. TRIGGER TO AUTO-UPDATE EXPERIENCE TREND WHEN SCORE CHANGES
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_experience_trend()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- If homeowner_experience_score changed, update trend
  IF OLD.homeowner_experience_score IS DISTINCT FROM NEW.homeowner_experience_score THEN
    NEW.experience_trend := public.compute_experience_trend(
      COALESCE(OLD.homeowner_experience_score, 50),
      COALESCE(NEW.homeowner_experience_score, 50)
    );
    NEW.last_experience_update := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_experience_trend ON public.leads;
CREATE TRIGGER trg_update_experience_trend
  BEFORE UPDATE OF homeowner_experience_score ON public.leads
  FOR EACH ROW
  WHEN (OLD.homeowner_experience_score IS DISTINCT FROM NEW.homeowner_experience_score)
  EXECUTE FUNCTION public.update_experience_trend();

-- ============================================================================
-- 4. INITIALIZE EXISTING LEADS WITH DEFAULT SCORE
-- ============================================================================

UPDATE public.leads
SET 
  homeowner_experience_score = 50,
  experience_trend = 'stable',
  last_experience_update = now()
WHERE homeowner_experience_score IS NULL;









































