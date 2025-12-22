-- ============================================================================
-- Block 22158 — SmartSend Roofing "Estimator Coaching Engine v1"
-- (🧠📈 AI Performance Coaching for Every Estimator — Personalized, Automatic, Relentless)
-- ============================================================================
-- FULL BLOCK. MAX DEPTH.
--
-- This is one of the MOST IMPORTANT features in the entire SmartSend intelligence stack.
-- This is the system that makes SmartSend feel like a sales manager, not software.
--
-- Roofing owners STRUGGLE with:
--   - inconsistent estimators
--   - poor follow-up habits
--   - slow proposal delivery
--   - bad tone management
--   - mis-handled objections
--   - lack of accountability
--   - blind spots in communication
--   - missed opportunities
--   - repeated mistakes
--
-- Owners hate micromanaging.
-- Estimators hate being micromanaged.
--
-- SmartSend fixes BOTH.
--
-- This engine becomes the sales manager in a box.
-- ============================================================================

-- ============================================================================
-- 1. UPDATE estimator_coaching_reports TABLE
-- ============================================================================
-- Add report_type and add JSONB fields for structured data
-- Keep existing text fields for backward compatibility

ALTER TABLE public.estimator_coaching_reports
  ADD COLUMN IF NOT EXISTS report_type text NOT NULL DEFAULT 'weekly' CHECK (report_type IN ('daily', 'weekly')),
  ADD COLUMN IF NOT EXISTS insights jsonb,
  ADD COLUMN IF NOT EXISTS recommendations jsonb,
  ADD COLUMN IF NOT EXISTS strengths_data jsonb, -- JSONB version (keeping text field for backward compat)
  ADD COLUMN IF NOT EXISTS weaknesses_data jsonb, -- JSONB version (keeping text field for backward compat)
  ADD COLUMN IF NOT EXISTS top_priority text,
  ADD COLUMN IF NOT EXISTS scripts jsonb,
  ADD COLUMN IF NOT EXISTS patterns jsonb; -- patterns hurting/improving performance

-- Update unique constraint to include report_type
ALTER TABLE public.estimator_coaching_reports
  DROP CONSTRAINT IF EXISTS estimator_coaching_reports_estimator_id_workspace_id_week_start_week_end_key;

CREATE UNIQUE INDEX IF NOT EXISTS estimator_coaching_reports_unique_period
  ON public.estimator_coaching_reports(estimator_id, workspace_id, report_type, week_start, week_end);

-- Add index for report_type filtering
CREATE INDEX IF NOT EXISTS idx_estimator_coaching_reports_type 
  ON public.estimator_coaching_reports(report_type, week_end DESC);

-- Add GIN indexes for JSONB fields
CREATE INDEX IF NOT EXISTS idx_estimator_coaching_reports_insights_gin 
  ON public.estimator_coaching_reports USING gin(insights);
CREATE INDEX IF NOT EXISTS idx_estimator_coaching_reports_recommendations_gin 
  ON public.estimator_coaching_reports USING gin(recommendations);
CREATE INDEX IF NOT EXISTS idx_estimator_coaching_reports_strengths_data_gin 
  ON public.estimator_coaching_reports USING gin(strengths_data);
CREATE INDEX IF NOT EXISTS idx_estimator_coaching_reports_weaknesses_data_gin 
  ON public.estimator_coaching_reports USING gin(weaknesses_data);

-- Comments for documentation
COMMENT ON COLUMN public.estimator_coaching_reports.report_type IS 'Block 22158: Type of report - daily or weekly';
COMMENT ON COLUMN public.estimator_coaching_reports.insights IS 'Block 22158: JSONB containing AI-generated insights about performance';
COMMENT ON COLUMN public.estimator_coaching_reports.recommendations IS 'Block 22158: JSONB array of specific actionable recommendations';
COMMENT ON COLUMN public.estimator_coaching_reports.strengths_data IS 'Block 22158: JSONB array of strengths identified (new structured format)';
COMMENT ON COLUMN public.estimator_coaching_reports.weaknesses_data IS 'Block 22158: JSONB array of weaknesses identified (new structured format)';
COMMENT ON COLUMN public.estimator_coaching_reports.top_priority IS 'Block 22158: Single top priority improvement item';
COMMENT ON COLUMN public.estimator_coaching_reports.scripts IS 'Block 22158: JSONB array of suggested scripts for the estimator';
COMMENT ON COLUMN public.estimator_coaching_reports.patterns IS 'Block 22158: JSONB containing patterns hurting/improving performance';

-- ============================================================================
-- 2. CREATE VIEW: estimator_full_intelligence_view
-- ============================================================================
-- Unified view aggregating ALL intelligence signals for coaching engine
-- Combines data from estimator_performance, scorecards, leaderboard, leads, etc.

CREATE OR REPLACE VIEW public.estimator_full_intelligence_view AS
SELECT 
  p.id as estimator_id,
  p.workspace_id,
  p.full_name as estimator_name,
  
  -- Performance Score (from estimator_performance)
  ep.performance_score,
  ep.speed_score,
  ep.followup_score,
  ep.proposal_score,
  ep.close_rate_score,
  ep.tone_score,
  ep.ai_alignment_score,
  ep.calculated_at as performance_calculated_at,
  
  -- Leaderboard Metrics (last 30 days)
  elv.jobs_won_30d,
  elv.revenue_won_30d,
  elv.active_jobs,
  elv.avg_active_job_health,
  elv.at_risk_jobs,
  elv.close_rate_30d,
  
  -- Scorecard Metrics (latest period)
  esc.avg_response_time_seconds,
  esc.follow_up_completion_rate,
  esc.booked_estimate_rate,
  esc.proposal_sent_rate,
  esc.win_rate as scorecard_win_rate,
  esc.job_value_created,
  esc.job_value_lost,
  esc.lead_coverage_score,
  esc.final_letter_grade,
  esc.period_start as scorecard_period_start,
  esc.period_end as scorecard_period_end,
  
  -- Pipeline Behavior (from leads)
  COUNT(l.id) FILTER (WHERE l.status NOT IN ('won', 'lost')) as pipeline_active_count,
  COUNT(l.id) FILTER (WHERE l.status = 'won') as pipeline_won_count,
  COUNT(l.id) FILTER (WHERE l.status = 'lost') as pipeline_lost_count,
  
  -- Speed Metrics
  AVG(EXTRACT(EPOCH FROM (l.first_response_at - l.created_at))) FILTER (
    WHERE l.first_response_at IS NOT NULL AND l.created_at IS NOT NULL
  ) as avg_speed_to_lead_seconds,
  
  -- Proposal Timing
  AVG(EXTRACT(EPOCH FROM (pr.created_at - l.created_at))) FILTER (
    WHERE pr.created_at IS NOT NULL AND l.created_at IS NOT NULL
  ) as avg_speed_to_proposal_seconds,
  
  -- Follow-Up Consistency (from action_queue or tasks)
  COUNT(DISTINCT aq.id) FILTER (WHERE aq.completed = true) as completed_followups,
  COUNT(DISTINCT aq.id) FILTER (WHERE aq.completed = false AND aq.due_at < NOW()) as missed_followups,
  
  -- Conversation Behavior (from leads tone/intent)
  AVG(CASE 
    WHEN l.homeowner_tone = 'positive' THEN 1 
    WHEN l.homeowner_tone = 'neutral' THEN 0.5 
    WHEN l.homeowner_tone = 'negative' THEN 0 
    ELSE NULL 
  END) as avg_tone_score,
  
  COUNT(DISTINCT l.id) FILTER (
    WHERE l.homeowner_tone = 'negative' AND l.status = 'lost'
  ) as lost_negative_tone_count,
  
  -- Job Health Patterns
  AVG(l.job_health_score) FILTER (WHERE l.job_health_score IS NOT NULL) as avg_job_health,
  AVG(l.momentum_score) FILTER (WHERE l.momentum_score IS NOT NULL) as avg_momentum,
  AVG(l.homeowner_experience_score) FILTER (WHERE l.homeowner_experience_score IS NOT NULL) as avg_experience_score,
  
  -- Win vs Loss Patterns
  COUNT(l.id) FILTER (WHERE l.status = 'won' AND l.lead_source = 'referral') as won_referrals,
  COUNT(l.id) FILTER (WHERE l.status = 'won' AND l.lead_source = 'insurance') as won_insurance,
  COUNT(l.id) FILTER (WHERE l.status = 'lost' AND l.lead_source = 'referral') as lost_referrals,
  COUNT(l.id) FILTER (WHERE l.status = 'lost' AND l.lead_source = 'insurance') as lost_insurance,
  
  -- Lead Source Compatibility
  COUNT(DISTINCT l.lead_source) FILTER (WHERE l.status = 'won') as winning_sources_count,
  
  -- Job Save Performance
  COUNT(DISTINCT jse.lead_id) FILTER (WHERE jse.status = 'active') as active_job_saves,
  COUNT(DISTINCT jse.lead_id) FILTER (WHERE jse.status = 'resolved') as resolved_job_saves,
  
  -- Revenue Metrics
  SUM(l.estimated_job_value) FILTER (WHERE l.status = 'won') as total_revenue_won,
  SUM(l.estimated_job_value) FILTER (WHERE l.status = 'lost') as total_revenue_lost,
  AVG(l.estimated_job_value) FILTER (WHERE l.status = 'won') as avg_job_size_closed,
  
  -- Intelligence Indicators
  AVG(l.momentum_score) FILTER (WHERE l.momentum_score IS NOT NULL) as avg_momentum_generated,
  AVG(l.homeowner_experience_score) FILTER (WHERE l.homeowner_experience_score IS NOT NULL) as avg_experience_influenced,
  COUNT(l.id) FILTER (WHERE l.risk_score > 70) as high_risk_jobs_created,
  
  -- Timestamps
  MAX(l.updated_at) as last_lead_activity_at,
  NOW() as intelligence_snapshot_at

FROM public.profiles p
LEFT JOIN public.estimator_performance ep
  ON ep.estimator_id = p.id
  AND ep.workspace_id = p.workspace_id
  AND ep.calculated_at = (
    SELECT MAX(calculated_at) 
    FROM public.estimator_performance 
    WHERE estimator_id = p.id 
      AND workspace_id = p.workspace_id
  )
LEFT JOIN public.estimator_leaderboard_view elv
  ON elv.estimator_id = p.id
  AND elv.workspace_id = p.workspace_id
LEFT JOIN public.estimator_scorecards esc
  ON esc.estimator_id = p.id
  AND esc.workspace_id = p.workspace_id
  AND esc.period_end = (
    SELECT MAX(period_end) 
    FROM public.estimator_scorecards 
    WHERE estimator_id = p.id 
      AND workspace_id = p.workspace_id
  )
LEFT JOIN public.leads l
  ON l.owner_id = p.id
  AND l.workspace_id = p.workspace_id
LEFT JOIN public.proposals pr
  ON pr.lead_id = l.id
LEFT JOIN public.action_queue aq
  ON aq.lead_id = l.id
  AND aq.assigned_to = p.id
LEFT JOIN public.job_save_events jse
  ON jse.lead_id = l.id
WHERE 
  p.workspace_id IS NOT NULL
GROUP BY
  p.id,
  p.workspace_id,
  p.full_name,
  ep.performance_score,
  ep.speed_score,
  ep.followup_score,
  ep.proposal_score,
  ep.close_rate_score,
  ep.tone_score,
  ep.ai_alignment_score,
  ep.calculated_at,
  elv.jobs_won_30d,
  elv.revenue_won_30d,
  elv.active_jobs,
  elv.avg_active_job_health,
  elv.at_risk_jobs,
  elv.close_rate_30d,
  esc.avg_response_time_seconds,
  esc.follow_up_completion_rate,
  esc.booked_estimate_rate,
  esc.proposal_sent_rate,
  esc.win_rate,
  esc.job_value_created,
  esc.job_value_lost,
  esc.lead_coverage_score,
  esc.final_letter_grade,
  esc.period_start,
  esc.period_end;

-- Grant access
GRANT SELECT ON public.estimator_full_intelligence_view TO authenticated;
GRANT SELECT ON public.estimator_full_intelligence_view TO service_role;

COMMENT ON VIEW public.estimator_full_intelligence_view IS 'Block 22158: Unified view combining all intelligence signals for Estimator Coaching Engine. Aggregates performance scores, pipeline behavior, conversation intelligence, and win/loss patterns.';

-- ============================================================================
-- 3. UPDATE RLS POLICIES
-- ============================================================================
-- Ensure policies work with new report_type field

-- Policy already exists, but ensure it covers all report types
-- (existing policies should work fine)

-- ============================================================================
-- 4. HELPER FUNCTION: Get coaching report period dates
-- ============================================================================
-- Helper function to calculate period start/end dates

CREATE OR REPLACE FUNCTION public.get_coaching_period_dates(
  p_report_type text,
  p_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE(period_start date, period_end date) AS $$
BEGIN
  IF p_report_type = 'daily' THEN
    RETURN QUERY SELECT p_date, p_date;
  ELSIF p_report_type = 'weekly' THEN
    -- Get Monday of the week containing p_date
    RETURN QUERY SELECT 
      (p_date - EXTRACT(DOW FROM p_date)::integer + 1)::date as period_start,
      (p_date - EXTRACT(DOW FROM p_date)::integer + 7)::date as period_end;
  ELSE
    RAISE EXCEPTION 'Invalid report_type: %. Must be daily or weekly', p_report_type;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.get_coaching_period_dates IS 'Block 22158: Helper function to calculate period start/end dates for coaching reports';

