-- ============================================================================
-- Block 21998 — SmartSend Roofing "Job Momentum Score" v1
-- (📈 The One Metric That Shows Whether a Job Is MOVING… or STUCK & Dying)
-- ============================================================================
-- FULL BLOCK. PURE EXECUTION. NO FILLER.
--
-- SmartSend now has emotional intelligence (Experience Score), skill intelligence 
-- (Estimator Score), source intelligence, probability, risk, etc.
--
-- Now we add the FINAL movement-based intelligence:
--
-- Job Momentum Score (0–100)
-- A single metric that tells owners & estimators if the job is trending toward 
-- a win, stalled, or slipping away.
--
-- This becomes the heartbeat of every job.
--
-- Roofers have NEVER had this visibility.
-- ============================================================================

-- ============================================================================
-- 1. ADD MOMENTUM COLUMNS TO LEADS TABLE
-- ============================================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS momentum_score INTEGER DEFAULT 50,
  ADD COLUMN IF NOT EXISTS momentum_trend TEXT DEFAULT 'neutral',
  ADD COLUMN IF NOT EXISTS last_momentum_update TIMESTAMPTZ;

-- Add check constraint for momentum_trend
ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_momentum_trend_check;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_momentum_trend_check
  CHECK (momentum_trend IN ('positive', 'neutral', 'negative'));

-- Add check constraint for momentum_score
ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_momentum_score_check;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_momentum_score_check
  CHECK (momentum_score >= 0 AND momentum_score <= 100);

-- Add indexes for fast filtering/sorting by momentum score
CREATE INDEX IF NOT EXISTS idx_leads_momentum_score 
  ON public.leads(momentum_score DESC);

CREATE INDEX IF NOT EXISTS idx_leads_momentum_trend 
  ON public.leads(momentum_trend);

CREATE INDEX IF NOT EXISTS idx_leads_momentum_trend_score 
  ON public.leads(momentum_trend, momentum_score DESC);

-- Add composite index for risk + momentum queries (low momentum + high risk = critical)
CREATE INDEX IF NOT EXISTS idx_leads_momentum_risk 
  ON public.leads(momentum_score, risk_score DESC) 
  WHERE momentum_score < 30 OR risk_score > 50;

-- Add comments for documentation
COMMENT ON COLUMN public.leads.momentum_score IS 'Block 21998: Job momentum score (0-100) indicating if the job is accelerating or decelerating. Higher = accelerating toward win, lower = stalled or slipping away.';
COMMENT ON COLUMN public.leads.momentum_trend IS 'Block 21998: Momentum trend: positive (score increasing), negative (score decreasing), neutral (no change)';
COMMENT ON COLUMN public.leads.last_momentum_update IS 'Block 21998: Timestamp of last momentum score update';

-- ============================================================================
-- 2. HELPER FUNCTION TO COMPUTE MOMENTUM TREND
-- ============================================================================

CREATE OR REPLACE FUNCTION public.compute_momentum_trend(
  p_old_score INTEGER,
  p_new_score INTEGER
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_new_score > p_old_score THEN
    RETURN 'positive';
  ELSIF p_new_score < p_old_score THEN
    RETURN 'negative';
  ELSE
    RETURN 'neutral';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.compute_momentum_trend IS 'Block 21998: Computes momentum trend based on old and new scores: positive/negative/neutral';

-- ============================================================================
-- 3. TRIGGER TO AUTO-UPDATE MOMENTUM TREND WHEN SCORE CHANGES
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_momentum_trend()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- If momentum_score changed, update trend
  IF OLD.momentum_score IS DISTINCT FROM NEW.momentum_score THEN
    NEW.momentum_trend := public.compute_momentum_trend(
      COALESCE(OLD.momentum_score, 50),
      COALESCE(NEW.momentum_score, 50)
    );
    NEW.last_momentum_update := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_momentum_trend ON public.leads;
CREATE TRIGGER trg_update_momentum_trend
  BEFORE UPDATE OF momentum_score ON public.leads
  FOR EACH ROW
  WHEN (OLD.momentum_score IS DISTINCT FROM NEW.momentum_score)
  EXECUTE FUNCTION public.update_momentum_trend();

-- ============================================================================
-- 4. INITIALIZE EXISTING LEADS WITH DEFAULT SCORE
-- ============================================================================

UPDATE public.leads
SET 
  momentum_score = 50,
  momentum_trend = 'neutral',
  last_momentum_update = now()
WHERE momentum_score IS NULL;









































