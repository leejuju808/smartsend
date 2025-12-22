-- =========================================================
-- Block 22029 — SmartSend Roofing Estimator Scorecard v1
-- Daily Coaching Dashboard for Each Estimator — Built to Move Revenue
-- =========================================================
-- FULL BLOCK. NO FLUFF. THIS IS THE ONE JULIAN OR THE OWNER WILL OPEN WHEN ASKING:
-- "IS THIS ESTIMATOR ACTUALLY MAKING ME MONEY?"
-- =========================================================

-- ============================================================================
-- CREATE estimator_scorecard_view
-- ============================================================================
-- This view aggregates estimator performance data for the scorecard UI
-- Combines performance scores, pipeline stats, and outcomes

CREATE OR REPLACE VIEW public.estimator_scorecard_view AS
SELECT
  p.workspace_id,
  p.id as estimator_id,
  p.full_name as estimator_name,

  -- Performance scores (from estimator_performance table)
  ep.performance_score,
  ep.speed_score,
  ep.followup_score,
  ep.proposal_score,
  ep.close_rate_score,
  ep.tone_score,
  ep.ai_alignment_score,

  -- Pipeline stats (active jobs not won/lost)
  COUNT(l.id) FILTER (WHERE l.status NOT IN ('won','lost')) as active_jobs,
  COALESCE(SUM(l.estimated_job_value) FILTER (WHERE l.status NOT IN ('won','lost')), 0) as active_pipeline_value,
  COALESCE(AVG(l.job_health_score) FILTER (WHERE l.status NOT IN ('won','lost')), 0) as avg_active_job_health,

  -- Outcomes last 30 days
  COUNT(l.id) FILTER (
    WHERE l.status = 'won'
      AND l.updated_at >= (NOW() - INTERVAL '30 days')
  ) as jobs_won_30d,
  COALESCE(SUM(l.estimated_job_value) FILTER (
    WHERE l.status = 'won'
      AND l.updated_at >= (NOW() - INTERVAL '30 days')
  ), 0) as revenue_won_30d,

  COUNT(l.id) FILTER (
    WHERE l.status = 'lost'
      AND l.updated_at >= (NOW() - INTERVAL '30 days')
  ) as jobs_lost_30d,

  -- Close rate approximate (last 30d)
  CASE
    WHEN COUNT(l.id) FILTER (
      WHERE l.status IN ('won','lost')
        AND l.updated_at >= (NOW() - INTERVAL '30 days')
    ) = 0
    THEN 0
    ELSE
      100.0 * COUNT(l.id) FILTER (
        WHERE l.status = 'won'
          AND l.updated_at >= (NOW() - INTERVAL '30 days')
      )
      / COUNT(l.id) FILTER (
        WHERE l.status IN ('won','lost')
          AND l.updated_at >= (NOW() - INTERVAL '30 days')
      )
  END as close_rate_30d

FROM public.profiles p
LEFT JOIN public.estimator_performance ep
  ON ep.estimator_id = p.id
  AND ep.calculated_at = (
    SELECT MAX(calculated_at)
    FROM public.estimator_performance ep2
    WHERE ep2.estimator_id = p.id
  )
LEFT JOIN public.leads l
  ON l.estimator_id = p.id
GROUP BY
  p.workspace_id,
  p.id,
  p.full_name,
  ep.performance_score,
  ep.speed_score,
  ep.followup_score,
  ep.proposal_score,
  ep.close_rate_score,
  ep.tone_score,
  ep.ai_alignment_score;

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT ON public.estimator_scorecard_view TO authenticated;
GRANT SELECT ON public.estimator_scorecard_view TO service_role;

-- ============================================================================
-- COMMENT
-- ============================================================================

COMMENT ON VIEW public.estimator_scorecard_view IS 'Block 22029 — Estimator Scorecard View. Aggregates performance scores, pipeline stats, and outcomes for each estimator. Powers the coaching dashboard UI.';









































