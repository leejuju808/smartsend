-- =========================================================
-- Block 22064 — SmartSend Roofing Estimator Leaderboard v1
-- Competitive Scoreboard That Drives Revenue Every Week
-- =========================================================
-- FULL BLOCK. NO FLUFF.
--
-- This is the natural follow-up to Estimator Scorecard + Performance Score.
-- You've built all the brains:
--   - Estimator Performance Score
--   - Job Health Score
--   - Momentum / Experience / Risk
--   - Win/Loss Reasons
--   - Lead Source Intelligence
--   - Daily Company Pulse
--
-- Now we weaponize them into something owners AND estimators feel in their chest:
--   Estimator Leaderboard v1
--   "Here's who's winning, who's slipping, and who's just taking up payroll."
--
-- This becomes:
--   - the weekly sales meeting screen
--   - the bonus + spiff scoreboard
--   - the motivation wall for every estimator
--   - the truth serum for owners
-- =========================================================

-- ============================================================================
-- CREATE estimator_leaderboard_view
-- ============================================================================
-- Aggregates core metrics per estimator for leaderboard ranking
-- Time window: last 30 days (can be extended to support 7d/90d later)
-- ============================================================================

CREATE OR REPLACE VIEW public.estimator_leaderboard_view AS
SELECT
  l.workspace_id,
  p.id as estimator_id,
  p.full_name as estimator_name,

  -- Latest performance score (from estimator_performance table)
  ep.performance_score,

  -- Jobs Won (last 30 days)
  COUNT(l.id) FILTER (
    WHERE l.status = 'won'
      AND l.updated_at >= NOW() - INTERVAL '30 days'
  ) as jobs_won_30d,

  -- Revenue Won (last 30 days)
  COALESCE(SUM(l.estimated_job_value) FILTER (
    WHERE l.status = 'won'
      AND l.updated_at >= NOW() - INTERVAL '30 days'
  ), 0) as revenue_won_30d,

  -- Active Jobs (not won/lost)
  COUNT(l.id) FILTER (
    WHERE l.status NOT IN ('won','lost')
  ) as active_jobs,

  -- Average Job Health of Active Jobs
  COALESCE(AVG(l.job_health_score) FILTER (
    WHERE l.status NOT IN ('won','lost')
  ), 0) as avg_active_job_health,

  -- Jobs at Risk (active jobs with health < 50)
  COUNT(l.id) FILTER (
    WHERE l.status NOT IN ('won','lost')
      AND l.job_health_score < 50
  ) as at_risk_jobs,

  -- Close Rate (last 30 days)
  CASE
    WHEN COUNT(l.id) FILTER (
      WHERE l.status IN ('won','lost')
        AND l.updated_at >= NOW() - INTERVAL '30 days'
    ) = 0
    THEN 0
    ELSE
      100.0 *
      COUNT(l.id) FILTER (
        WHERE l.status = 'won'
          AND l.updated_at >= NOW() - INTERVAL '30 days'
      )
      /
      COUNT(l.id) FILTER (
        WHERE l.status IN ('won','lost')
          AND l.updated_at >= NOW() - INTERVAL '30 days'
      )
  END as close_rate_30d

FROM public.profiles p
INNER JOIN public.leads l
  ON l.estimator_id = p.id
LEFT JOIN public.estimator_performance ep
  ON ep.estimator_id = p.id
  AND ep.workspace_id = l.workspace_id
  AND ep.calculated_at = (
    SELECT MAX(calculated_at)
    FROM public.estimator_performance ep2
    WHERE ep2.estimator_id = p.id
      AND ep2.workspace_id = l.workspace_id
  )
WHERE 
  l.workspace_id IS NOT NULL
GROUP BY
  l.workspace_id,
  p.id,
  p.full_name,
  ep.performance_score;

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT ON public.estimator_leaderboard_view TO authenticated;
GRANT SELECT ON public.estimator_leaderboard_view TO service_role;

-- ============================================================================
-- COMMENT
-- ============================================================================

COMMENT ON VIEW public.estimator_leaderboard_view IS 'Block 22064 — Estimator Leaderboard View. Aggregates performance metrics per estimator for competitive leaderboard ranking. Powers the weekly sales meeting screen and bonus scoreboard.';

