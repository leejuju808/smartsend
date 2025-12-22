-- ============================================================================
-- Block 22192 — SmartSend Roofing "Win Probability Engine v1"
-- (📈 AI-Driven Real-Time % Chance to Win Every Job — The #1 Metric Owners Obsess Over)
-- ============================================================================
-- FULL BLOCK. ZERO CUTS.
--
-- This block transforms SmartSend from a CRM into a real sales intelligence weapon.
--
-- Roofing owners always ask:
-- "What are our chances of winning this job?"
-- "Which jobs should we focus on this week?"
-- "Which ones are slipping?"
-- "Which estimator is best positioned to close?"
-- "What is the REAL health of our pipeline?"
--
-- Right now they GUESS.
-- SmartSend will CALCULATE.
-- ============================================================================

-- ============================================================================
-- 1. ADD WIN PROBABILITY COLUMNS TO LEADS TABLE
-- ============================================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS win_probability INT DEFAULT 50 CHECK (win_probability >= 0 AND win_probability <= 100),
  ADD COLUMN IF NOT EXISTS win_probability_reason TEXT,
  ADD COLUMN IF NOT EXISTS win_probability_updated_at TIMESTAMPTZ;

-- Add index for fast filtering/sorting by win probability
CREATE INDEX IF NOT EXISTS idx_leads_win_probability 
  ON public.leads(win_probability DESC) 
  WHERE win_probability IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_win_probability_updated_at 
  ON public.leads(win_probability_updated_at DESC) 
  WHERE win_probability_updated_at IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN public.leads.win_probability IS 'Block 22192: Real-time probability score (0-100%) that this job will be won, calculated from 20+ intelligence signals';
COMMENT ON COLUMN public.leads.win_probability_reason IS 'Block 22192: AI-generated explanation of top 3 reasons for the win probability score';
COMMENT ON COLUMN public.leads.win_probability_updated_at IS 'Block 22192: Timestamp when win probability was last calculated';

-- ============================================================================
-- 2. UPDATE lead_full_intelligence_view TO INCLUDE WIN PROBABILITY
-- ============================================================================
-- Add win_probability to the intelligence view so it's available for AI calculations

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
  l.job_probability,
  l.win_probability,  -- NEW: Win Probability Engine v1
  l.win_probability_reason,  -- NEW: Win Probability Engine v1
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

-- Grant access
GRANT SELECT ON public.lead_full_intelligence_view TO authenticated;
GRANT SELECT ON public.lead_full_intelligence_view TO service_role;

COMMENT ON VIEW public.lead_full_intelligence_view IS 'Block 22192: Updated to include win_probability and win_probability_reason from Win Probability Engine v1';

-- ============================================================================
-- 3. UPDATE JOB_TIMELINES EVENT TYPE SUPPORT
-- ============================================================================
-- Add support for probability_updated event type

-- Note: job_timelines table already supports flexible event_type, so no schema change needed
-- But we document the new event type here for reference

COMMENT ON TABLE public.job_timelines IS 'Block 22192: Supports probability_updated event type with event_data containing win_probability and reason';









































