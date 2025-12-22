-- ============================================================================
-- Block 22017 — SmartSend Roofing "Job Health Score v2"
-- (❤️ The Master Score: One Number That Predicts Revenue — Built From All 12 SmartSend Brains)
-- ============================================================================
-- FULL BLOCK. MAX POWER. NO FILLER.
--
-- This is the crown jewel metric of SmartSend.
--
-- Roofers don't understand 12 different metrics…
-- But they understand one score:
--
-- Job Health Score (0–100)
-- "Is this job healthy, dying, or about to close?"
--
-- This is DIFFERENT from:
-- - Heat Score
-- - Momentum Score
-- - Experience Score
-- - Probability
-- - Risk Score
--
-- Those are inputs.
-- Job Health Score is the final unified result.
--
-- This becomes the #1 thing owners check every morning.
-- ============================================================================

-- ============================================================================
-- 1. ADD JOB HEALTH SCORE COLUMNS TO LEADS TABLE
-- ============================================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS job_health_score INTEGER DEFAULT 50,
  ADD COLUMN IF NOT EXISTS job_health_trend TEXT DEFAULT 'stable',
  ADD COLUMN IF NOT EXISTS last_health_update TIMESTAMPTZ;

-- Add check constraint for job_health_trend
ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_job_health_trend_check;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_job_health_trend_check
  CHECK (job_health_trend IN ('improving', 'declining', 'stable'));

-- Add check constraint for job_health_score
ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_job_health_score_check;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_job_health_score_check
  CHECK (job_health_score >= 0 AND job_health_score <= 100);

-- Add indexes for fast filtering/sorting by health score
CREATE INDEX IF NOT EXISTS idx_leads_job_health_score 
  ON public.leads(job_health_score DESC);

CREATE INDEX IF NOT EXISTS idx_leads_job_health_trend 
  ON public.leads(job_health_trend);

CREATE INDEX IF NOT EXISTS idx_leads_job_health_trend_score 
  ON public.leads(job_health_trend, job_health_score DESC);

-- Add comments for documentation
COMMENT ON COLUMN public.leads.job_health_score IS 'Block 22017: Job health score (0-100) combining all 12 SmartSend intelligence signals. Higher = healthier job.';
COMMENT ON COLUMN public.leads.job_health_trend IS 'Block 22017: Health trend: improving (score increasing), declining (score decreasing), stable (no change)';
COMMENT ON COLUMN public.leads.last_health_update IS 'Block 22017: Timestamp of last health score update';

-- ============================================================================
-- 2. CREATE HELPER FUNCTION TO COMPUTE HEALTH TREND
-- ============================================================================

CREATE OR REPLACE FUNCTION public.compute_job_health_trend(
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

COMMENT ON FUNCTION public.compute_job_health_trend IS 'Block 22017: Computes health trend based on old and new scores: improving/declining/stable';

-- ============================================================================
-- 3. CREATE VIEW: lead_health_view
-- ============================================================================
-- This view combines all 12 input signals for health score calculation
-- Used by the edge function to fetch all data in one query

CREATE OR REPLACE VIEW public.lead_health_view AS
SELECT 
  l.id as lead_id,
  
  -- Core signals (from leads table)
  COALESCE(l.momentum_score, 50) as momentum_score,
  COALESCE(l.homeowner_experience_score, 50) as homeowner_experience_score,
  COALESCE(l.job_probability, 0) as job_probability,
  COALESCE(l.risk_category, 'low') as risk_category,
  
  -- Estimator performance (from estimator_performance table)
  COALESCE(ep.performance_score, 50) as estimator_performance,
  
  -- Tone score (from most recent message with tone classification)
  COALESCE(
    (SELECT 
      CASE 
        WHEN homeowner_tone = 'positive' THEN 80
        WHEN homeowner_tone = 'appreciation' THEN 90
        WHEN homeowner_tone = 'neutral' THEN 50
        WHEN homeowner_tone = 'confused' THEN 40
        WHEN homeowner_tone = 'impatient' THEN 30
        WHEN homeowner_tone = 'price-shopping' THEN 35
        WHEN homeowner_tone = 'angry' THEN 20
        ELSE 50
      END
     FROM public.lead_activities
     WHERE lead_id = l.id 
       AND kind = 'message_in'
       AND homeowner_tone IS NOT NULL
     ORDER BY created_at DESC
     LIMIT 1),
    50
  ) as tone_score,
  
  -- Intent score (from most recent message with intent classification)
  COALESCE(
    (SELECT 
      CASE 
        WHEN homeowner_intent = 'ready to book' THEN 90
        WHEN homeowner_intent = 'high intent' THEN 80
        WHEN homeowner_intent = 'medium intent' THEN 60
        WHEN homeowner_intent = 'needs clarification' THEN 50
        WHEN homeowner_intent = 'low intent' THEN 30
        WHEN homeowner_intent = 'wants price' THEN 40
        WHEN homeowner_intent = 'stalling' THEN 25
        WHEN homeowner_intent = 'not interested' THEN 10
        ELSE 50
      END
     FROM public.lead_activities
     WHERE lead_id = l.id 
       AND kind = 'message_in'
       AND homeowner_intent IS NOT NULL
     ORDER BY created_at DESC
     LIMIT 1),
    50
  ) as intent_score,
  
  -- Stage duration penalty (how long stuck in current stage)
  CASE 
    WHEN l.stage_entered_at IS NOT NULL THEN
      GREATEST(0, 
        LEAST(10, 
          FLOOR(EXTRACT(EPOCH FROM (NOW() - l.stage_entered_at)) / 86400)::INTEGER / 7
        )
      )
    ELSE 0
  END as stage_penalty,
  
  -- Follow-up quality penalty (missed follow-ups)
  -- Check multiple possible followup table structures
  COALESCE(
    (SELECT COUNT(*)
     FROM (
       SELECT 1 FROM public.followup_tasks ft
       WHERE ft.lead_id = l.id
         AND ft.status IN ('failed', 'dead')
         AND ft.run_at > NOW() - INTERVAL '30 days'
       UNION ALL
       SELECT 1 FROM public.followup_schedules fs
       WHERE fs.lead_id = l.id
         AND fs.status = 'skipped'
         AND fs.send_at > NOW() - INTERVAL '30 days'
     ) missed_followups),
    0
  ) * 2 as followup_penalty, -- 2 points per missed follow-up, max 10
  
  -- Proposal timing penalty (overdue proposals)
  CASE 
    WHEN l.proposal_due_at IS NOT NULL AND l.proposal_due_at < NOW() THEN
      LEAST(10, 
        FLOOR(EXTRACT(EPOCH FROM (NOW() - l.proposal_due_at)) / 86400)::INTEGER
      )
    ELSE 0
  END as proposal_penalty,
  
  -- Source quality adjustment (from lead source intelligence)
  CASE 
    WHEN l.source IN ('referral', 'repeat_customer') THEN 5
    WHEN l.source IN ('google_ads', 'facebook_ads') THEN 2
    WHEN l.source IN ('cold_outreach', 'unknown') THEN -2
    ELSE 0
  END as source_adjustment,
  
  -- Current health score for trend calculation
  COALESCE(l.job_health_score, 50) as current_job_health_score

FROM public.leads l
LEFT JOIN public.estimator_performance ep 
  ON ep.estimator_id = l.owner_id 
  AND ep.workspace_id = l.workspace_id
  AND ep.calculated_at = (
    SELECT MAX(calculated_at) 
    FROM public.estimator_performance 
    WHERE estimator_id = l.owner_id 
      AND workspace_id = l.workspace_id
  );

-- Grant access
GRANT SELECT ON public.lead_health_view TO authenticated;
GRANT SELECT ON public.lead_health_view TO service_role;

COMMENT ON VIEW public.lead_health_view IS 'Block 22017: Unified view combining all 12 input signals for job health score calculation';

-- ============================================================================
-- 4. CREATE FUNCTION TO CALCULATE JOB HEALTH SCORE
-- ============================================================================
-- This function calculates the health score using the weighted formula
-- Can be called from edge function or trigger

CREATE OR REPLACE FUNCTION public.calculate_job_health_score(p_lead_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_health_view RECORD;
  v_risk_score INTEGER;
  v_health_score NUMERIC;
BEGIN
  -- Fetch all signals from view
  SELECT * INTO v_health_view
  FROM public.lead_health_view
  WHERE lead_id = p_lead_id;
  
  IF NOT FOUND THEN
    RETURN 50; -- Default score if lead not found
  END IF;
  
  -- Convert risk category to score (inverted: lower risk = higher score)
  v_risk_score := CASE v_health_view.risk_category
    WHEN 'low' THEN 85
    WHEN 'medium' THEN 60
    WHEN 'high' THEN 35
    WHEN 'critical' THEN 10
    ELSE 50 -- Default for null or unknown
  END;
  
  -- Calculate weighted health score
  v_health_score := 
    (v_health_view.momentum_score * 0.22) +
    (v_health_view.homeowner_experience_score * 0.18) +
    (v_health_view.job_probability * 0.15) +
    (v_risk_score * 0.15) +
    (v_health_view.estimator_performance * 0.10) +
    (v_health_view.tone_score * 0.05) +
    (v_health_view.intent_score * 0.05) -
    LEAST(v_health_view.stage_penalty, 10) -
    LEAST(v_health_view.followup_penalty, 10) -
    LEAST(v_health_view.proposal_penalty, 10) +
    v_health_view.source_adjustment;
  
  -- Clamp to 0-100 and round
  RETURN GREATEST(0, LEAST(100, ROUND(v_health_score)::INTEGER));
END;
$$;

COMMENT ON FUNCTION public.calculate_job_health_score IS 'Block 22017: Calculates job health score (0-100) using weighted formula from all 12 input signals';

-- ============================================================================
-- 5. CREATE FUNCTION TO UPDATE JOB HEALTH SCORE FOR A LEAD
-- ============================================================================
-- This function calculates and updates the health score, trend, and timestamp
-- Can be called from edge function or trigger

CREATE OR REPLACE FUNCTION public.update_job_health_score(p_lead_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_old_score INTEGER;
  v_new_score INTEGER;
  v_trend TEXT;
BEGIN
  -- Get current score
  SELECT COALESCE(job_health_score, 50) INTO v_old_score
  FROM public.leads
  WHERE id = p_lead_id;
  
  -- Calculate new score
  v_new_score := public.calculate_job_health_score(p_lead_id);
  
  -- Determine trend
  v_trend := public.compute_job_health_trend(v_old_score, v_new_score);
  
  -- Update lead
  UPDATE public.leads
  SET 
    job_health_score = v_new_score,
    job_health_trend = v_trend,
    last_health_update = NOW()
  WHERE id = p_lead_id;
  
  -- Log to job_timelines
  INSERT INTO public.job_timelines (
    lead_id,
    event_type,
    event_data
  ) VALUES (
    p_lead_id,
    'job_health_updated',
    jsonb_build_object(
      'category', 'ai_intelligence',
      'summary', format('Job Health is now %s (%s)', v_new_score, v_trend),
      'old_score', v_old_score,
      'new_score', v_new_score,
      'trend', v_trend
    )
  );
  
  RETURN v_new_score;
END;
$$;

COMMENT ON FUNCTION public.update_job_health_score IS 'Block 22017: Calculates and updates job health score, trend, and logs to timeline';

-- ============================================================================
-- 6. CREATE TRIGGER TO AUTO-UPDATE HEALTH SCORE WHEN INPUT METRICS CHANGE
-- ============================================================================
-- This trigger automatically recalculates health score when any input metric changes

CREATE OR REPLACE FUNCTION public.trigger_update_job_health()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Recalculate health score if any relevant field changed
  IF (
    OLD.momentum_score IS DISTINCT FROM NEW.momentum_score
    OR OLD.homeowner_experience_score IS DISTINCT FROM NEW.homeowner_experience_score
    OR OLD.job_probability IS DISTINCT FROM NEW.job_probability
    OR OLD.risk_category IS DISTINCT FROM NEW.risk_category
    OR OLD.stage_entered_at IS DISTINCT FROM NEW.stage_entered_at
    OR OLD.proposal_due_at IS DISTINCT FROM NEW.proposal_due_at
    OR OLD.owner_id IS DISTINCT FROM NEW.owner_id
  ) THEN
    PERFORM public.update_job_health_score(NEW.id);
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_job_health ON public.leads;
CREATE TRIGGER trg_update_job_health
  AFTER UPDATE ON public.leads
  FOR EACH ROW
  WHEN (
    OLD.momentum_score IS DISTINCT FROM NEW.momentum_score
    OR OLD.homeowner_experience_score IS DISTINCT FROM NEW.homeowner_experience_score
    OR OLD.job_probability IS DISTINCT FROM NEW.job_probability
    OR OLD.risk_category IS DISTINCT FROM NEW.risk_category
    OR OLD.stage_entered_at IS DISTINCT FROM NEW.stage_entered_at
    OR OLD.proposal_due_at IS DISTINCT FROM NEW.proposal_due_at
    OR OLD.owner_id IS DISTINCT FROM NEW.owner_id
  )
  EXECUTE FUNCTION public.trigger_update_job_health();

-- ============================================================================
-- 7. INITIALIZE EXISTING LEADS WITH DEFAULT SCORE
-- ============================================================================

UPDATE public.leads
SET 
  job_health_score = 50,
  job_health_trend = 'stable',
  last_health_update = NOW()
WHERE job_health_score IS NULL;

-- ============================================================================
-- 8. NOTES ON CALLING UPDATE-JOB-HEALTH EDGE FUNCTION
-- ============================================================================
-- The database trigger (trg_update_job_health) automatically recalculates
-- health scores when input metrics change in the database.
--
-- The edge function (update-job-health) can be called:
-- 1. Manually via API when you want to force a recalculation
-- 2. From other edge functions after they update metrics:
--    - After updating momentum_score → call update-job-health
--    - After updating homeowner_experience_score → call update-job-health
--    - After updating job_probability → call update-job-health
--    - After updating risk_category → call update-job-health
--    - After tone/intent classification → call update-job-health
--    - After estimator performance update → call update-job-health
--
-- Example call from another edge function:
--   const { data, error } = await supabase.functions.invoke('update-job-health', {
--     body: { lead_id: leadId }
--   });
--
-- Note: The database trigger handles most cases automatically, but calling
-- the edge function ensures the calculation uses the latest view data and
-- provides detailed breakdown in the response.

