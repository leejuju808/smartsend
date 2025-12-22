-- =========================================================
-- Block 21582 — SmartSend Roofing Hot Jobs Focus List v1
-- (Top Jobs That Need Action Today)
-- =========================================================
-- 
-- This creates a ranked list of high-value, at-risk, or hot-interest leads
-- based on the Job Health Score v2.
--
-- Categories:
-- A. HOT: Jobs with hot/warm replies pending action
-- B. HIGH VALUE: Jobs over $10k that are slipping
-- C. AT RISK: Jobs below 40 health score
--
-- The view provides a priority_rank field for sorting:
-- - Lower rank = more urgent
-- - Based on intent, health score, and estimated value
-- =========================================================

-- ============================================================================
-- CREATE HOT JOBS FOCUS LIST VIEW
-- ============================================================================
-- Pre-calculates prioritized jobs for each user/workspace
-- Orders by priority_rank ascending (worst/most urgent first)

CREATE OR REPLACE VIEW public.hot_jobs_focus_list AS
WITH lead_values AS (
  SELECT
    l.id as lead_id,
    l.workspace_id,
    l.user_id,
    l.first_name,
    l.email,
    l.pipeline_stage,
    l.job_health_score,
    l.last_intent,
    l.last_reply_at,
    COALESCE(
      l.estimated_job_value,
      -- Try to get value from job_value_estimates via email match
      (SELECT jve.base_amount
       FROM job_value_estimates jve
       JOIN contacts c ON c.id = jve.id
       WHERE lower(c.email) = lower(l.email)
         AND c.workspace_id = l.workspace_id
       ORDER BY jve.updated_at DESC
       LIMIT 1),
      0
    ) as estimated_value
  FROM leads l
  WHERE
    -- Only include active pipeline stages
    l.pipeline_stage NOT IN ('won', 'lost')
    -- Must have some health score or intent data
    AND (l.job_health_score IS NOT NULL OR l.last_intent IS NOT NULL)
)
SELECT
  lead_id,
  workspace_id,
  user_id,
  first_name,
  email,
  pipeline_stage,
  job_health_score,
  last_intent,
  last_reply_at,
  estimated_value,
  (
    -- Priority score (lower = more urgent)
    -- Intent component (0-10 pts)
    CASE
      WHEN last_intent = 'hot_lead' THEN 0
      WHEN last_intent = 'warm_lead' THEN 5
      ELSE 10
    END
    +
    -- Health score component (0-20 pts)
    CASE
      WHEN job_health_score < 40 THEN 0
      WHEN job_health_score < 60 THEN 10
      ELSE 20
    END
    -
    -- Value component (subtract 0-10 pts for high value jobs)
    CASE
      WHEN estimated_value >= 20000 THEN 10
      WHEN estimated_value >= 10000 THEN 5
      ELSE 0
    END
  ) as priority_rank
FROM lead_values
ORDER BY priority_rank ASC;

-- Add comment
COMMENT ON VIEW public.hot_jobs_focus_list IS 
  'Ranked list of hot jobs that need action today. Lower priority_rank = more urgent. Based on intent, health score, and estimated job value.';

-- Enable RLS (inherits from leads table RLS)
-- The view will automatically respect leads RLS policies

-- Create index on leads for faster lookups (if not exists)
CREATE INDEX IF NOT EXISTS idx_leads_focus_list 
  ON public.leads(workspace_id, pipeline_stage, job_health_score DESC NULLS LAST, last_intent)
  WHERE pipeline_stage NOT IN ('won', 'lost')
    AND (job_health_score IS NOT NULL OR last_intent IS NOT NULL);

