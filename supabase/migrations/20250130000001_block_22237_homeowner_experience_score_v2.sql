-- ============================================================================
-- Block 22237 — SmartSend Roofing "Homeowner Experience Score v2"
-- (🙂→😡 The Real-Time Emotional Pulse of Every Job — Now 10× Smarter, 10× More Useful)
-- ============================================================================
-- FULL. NO BULLSHIT.
--
-- This block upgrades one of the most important intelligence metrics in SmartSend:
-- the Experience Score — the emotional satisfaction level of the homeowner.
--
-- Version 1 already existed — basic tone tracking + positive/negative indicators.
-- But now with all systems built (Transcript, Tone Engine, Intent Engine, Hot Lead Detector, 
-- Loss Reason Detector, Coaching Engine, Pipeline v2, Save Engine), we can create a TRUE 
-- emotional intelligence system.
--
-- This will become one of the MOST valuable numbers for roofers.
-- ============================================================================

-- ============================================================================
-- 1. ADD EXPERIENCE SCORE TREND COLUMN (Numeric -20 to +20)
-- ============================================================================
-- This represents the change in experience score since last calculation
-- Positive = improving, Negative = declining, 0 = stable

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS experience_score_trend INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS experience_last_updated TIMESTAMPTZ;

-- Add check constraint for experience_score_trend (-20 to +20)
ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_experience_score_trend_check;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_experience_score_trend_check
  CHECK (experience_score_trend >= -20 AND experience_score_trend <= 20);

-- Add index for fast filtering/sorting by experience trend
CREATE INDEX IF NOT EXISTS idx_leads_experience_score_trend 
  ON public.leads(experience_score_trend DESC);

-- Add index for experience_last_updated
CREATE INDEX IF NOT EXISTS idx_leads_experience_last_updated 
  ON public.leads(experience_last_updated DESC NULLS LAST);

-- Add comments for documentation
COMMENT ON COLUMN public.leads.experience_score_trend IS 'Block 22237: Experience score trend (-20 to +20) indicating change since last calculation. Positive = improving, Negative = declining, 0 = stable';
COMMENT ON COLUMN public.leads.experience_last_updated IS 'Block 22237: Timestamp when experience score was last calculated by v2 engine';

-- ============================================================================
-- 2. UPDATE lead_full_intelligence_view TO INCLUDE NEW COLUMNS
-- ============================================================================

CREATE OR REPLACE VIEW public.lead_full_intelligence_view AS
SELECT 
  l.id as lead_id,
  l.account_id,
  l.workspace_id,
  l.owner_id,
  l.email,
  l.first_name,
  l.last_name,
  l.status,
  l.pipeline_stage,
  
  -- Intelligence Scores
  l.job_health_score,
  l.job_health_trend,
  l.momentum_score,
  l.momentum_trend,
  l.homeowner_experience_score,
  l.experience_trend,
  l.experience_score_trend,  -- NEW: Numeric trend (-20 to +20)
  l.experience_last_updated,  -- NEW: Last update timestamp
  l.job_probability,
  l.risk_score,
  l.risk_category,
  
  -- Behavioral Data
  l.last_message_at,
  l.last_reply_at,
  l.next_follow_up_at,
  l.created_at as lead_created_at,
  
  -- Tone & Intent History (from latest messages)
  l.homeowner_tone,
  (SELECT intent FROM public.lead_intent_events 
   WHERE contact_id = l.id 
   ORDER BY created_at DESC LIMIT 1) as latest_intent,
  
  -- Stage Duration
  EXTRACT(EPOCH FROM (NOW() - l.created_at)) / 86400 as days_since_created,
  EXTRACT(EPOCH FROM (NOW() - COALESCE(l.last_message_at, l.created_at))) / 86400 as days_since_last_message,
  EXTRACT(EPOCH FROM (NOW() - COALESCE(l.last_reply_at, l.created_at))) / 86400 as days_since_last_reply,
  
  -- Estimator Performance
  COALESCE(ep.performance_score, 50) as estimator_performance,
  
  -- Lead Source Quality
  ls.lead_quality_score as source_quality_score,
  ls.lead_source as source_category,
  
  -- Job Save Status
  js.has_active_save,
  js.save_severity,
  
  -- Proposal Status (if proposals table exists)
  COALESCE((SELECT COUNT(*) > 0 FROM public.proposals WHERE lead_id = l.id), false) as has_proposal,
  (SELECT MAX(created_at) FROM public.proposals WHERE lead_id = l.id) as last_proposal_at,
  
  -- Inspection Status (check for scheduled estimate)
  COALESCE(l.next_estimate_at IS NOT NULL, false) as has_inspection,
  l.next_estimate_at as last_inspection_at,
  
  -- Current Next Action (if exists)
  l.next_action,
  l.next_action_reason,
  l.next_action_generated_at

FROM public.leads l
LEFT JOIN public.estimator_performance ep 
  ON ep.estimator_id = l.owner_id 
  AND ep.workspace_id = l.workspace_id
  AND ep.calculated_at = (
    SELECT MAX(calculated_at) 
    FROM public.estimator_performance 
    WHERE estimator_id = l.owner_id 
      AND workspace_id = l.workspace_id
  )
LEFT JOIN public.lead_source_performance ls
  ON ls.workspace_id = l.workspace_id
  AND ls.lead_source = l.lead_source
LEFT JOIN (
  SELECT 
    lead_id,
    COUNT(*) > 0 as has_active_save,
    MAX(severity) as save_severity
  FROM public.job_save_events
  WHERE status = 'active'
  GROUP BY lead_id
) js ON js.lead_id = l.id;

-- Update comment
COMMENT ON VIEW public.lead_full_intelligence_view IS 'Block 22237: Updated to include experience_score_trend and experience_last_updated for Experience Score v2';

-- ============================================================================
-- 3. HELPER FUNCTION TO UPDATE EXPERIENCE TREND WHEN SCORE CHANGES
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_experience_score_trend()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_old_score INTEGER;
  v_new_score INTEGER;
  v_trend INTEGER;
BEGIN
  -- Get old and new scores
  v_old_score := COALESCE(OLD.homeowner_experience_score, 50);
  v_new_score := COALESCE(NEW.homeowner_experience_score, 50);
  
  -- Calculate trend (-20 to +20)
  -- If score increased, trend is positive
  -- If score decreased, trend is negative
  -- Cap at -20 and +20
  v_trend := GREATEST(-20, LEAST(20, v_new_score - v_old_score));
  
  -- Update trend and timestamp
  NEW.experience_score_trend := v_trend;
  NEW.experience_last_updated := now();
  
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.update_experience_score_trend IS 'Block 22237: Automatically calculates experience_score_trend (-20 to +20) when homeowner_experience_score changes';

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trg_update_experience_score_trend ON public.leads;

-- Create trigger
CREATE TRIGGER trg_update_experience_score_trend
  BEFORE UPDATE OF homeowner_experience_score ON public.leads
  FOR EACH ROW
  WHEN (OLD.homeowner_experience_score IS DISTINCT FROM NEW.homeowner_experience_score)
  EXECUTE FUNCTION public.update_experience_score_trend();

-- ============================================================================
-- 4. INITIALIZE EXISTING LEADS WITH DEFAULT VALUES
-- ============================================================================

UPDATE public.leads
SET 
  experience_score_trend = 0,
  experience_last_updated = COALESCE(last_experience_update, now())
WHERE experience_score_trend IS NULL OR experience_last_updated IS NULL;









































