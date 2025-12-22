-- =========================================================
-- Block 27520 — SmartSend Roofing Job Forecasting & Revenue Projection Engine v1
-- (Predict next 30/60/90 day revenue • Forecast install load • Spot slow months BEFORE they happen)
-- =========================================================
-- 
-- This block is where SmartSend becomes the crystal ball for roofers.
-- 
-- Most roofing owners:
-- ❌ Ask "How's next month looking?" and nobody actually knows
-- ❌ Don't see slow periods until the calendar is already empty
-- ❌ Guess on hiring crews or buying trucks
-- ❌ Only react after the pipeline dries up
-- 
-- SmartSend will now:
-- ✅ Use deals + proposal + status + schedule to predict 30/60/90-day revenue and install load
-- ✅ Warn the owner when a slow period is coming
-- 
-- That's real CEO-level visibility.

-- ============================================================================
-- PART 1 — REVENUE FORECAST VIEWS
-- ============================================================================

-- A) Immediate scheduled revenue (jobs already on calendar)
CREATE OR REPLACE VIEW public.roofing_scheduled_revenue AS
SELECT
  j.id AS job_id,
  j.workspace_id,
  COALESCE(j.title, j.homeowner_name, 'Untitled Job') AS job_name,
  j.status,
  -- Use job_value if available, otherwise projected_job_value, otherwise 0
  COALESCE(j.job_value, j.projected_job_value, 0) AS value,
  -- Use scheduled_start if available, otherwise scheduled_start_date, otherwise created_at
  COALESCE(j.scheduled_start, j.scheduled_start_date::date, j.created_at::date) AS date_bucket
FROM public.roofing_jobs j
WHERE j.status IN ('accepted', 'scheduled', 'in_progress')
  AND (
    j.scheduled_start IS NOT NULL 
    OR j.scheduled_start_date IS NOT NULL
    OR j.created_at IS NOT NULL
  )
  AND COALESCE(j.job_value, j.projected_job_value, 0) > 0;

COMMENT ON VIEW public.roofing_scheduled_revenue IS 'Block 27520: Revenue from jobs already scheduled/accepted';

-- B) Pipeline projected revenue (not yet scheduled, but likely to close)
-- Uses deal predictions with win probability
CREATE OR REPLACE VIEW public.roofing_pipeline_forecast AS
SELECT
  j.id AS job_id,
  j.workspace_id,
  COALESCE(j.title, j.homeowner_name, 'Untitled Job') AS job_name,
  COALESCE(j.status, j.current_stage::text) AS status,
  -- Use job_value if available, otherwise projected_job_value, otherwise 0
  COALESCE(j.job_value, j.projected_job_value, 0) AS value,
  COALESCE(d.win_probability, 0) AS win_probability,
  -- Projected expected revenue = value * win_probability / 100
  (COALESCE(j.job_value, j.projected_job_value, 0) * COALESCE(d.win_probability, 0) / 100.0) AS expected_value,
  -- Rough expected close date: use created_at + 14 days as a basic assumption
  -- Can be refined later with more sophisticated logic
  (j.created_at::date + INTERVAL '14 days')::date AS date_bucket
FROM public.roofing_jobs j
LEFT JOIN public.roofing_deal_predictions d ON d.job_id = j.id
WHERE (
  -- Jobs in early pipeline stages
  j.status IN ('unscheduled', 'lead', 'estimate_sent', 'negotiation')
  OR j.current_stage IN ('NEW_LEAD', 'CLAIM_FILED', 'ADJUSTER_SCHEDULED', 'CLAIM_PENDING', 'CLAIM_APPROVED', 'INSTALL_READY')
)
  AND j.created_at IS NOT NULL
  AND COALESCE(j.job_value, j.projected_job_value, 0) > 0;

COMMENT ON VIEW public.roofing_pipeline_forecast IS 'Block 27520: Pipeline revenue forecast using win probability';

-- C) 30/60/90 Day Revenue Projection View
CREATE OR REPLACE VIEW public.roofing_revenue_projection AS
WITH
scheduled AS (
  SELECT
    date_bucket,
    workspace_id,
    SUM(value) AS scheduled_revenue
  FROM public.roofing_scheduled_revenue
  WHERE date_bucket BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'
  GROUP BY date_bucket, workspace_id
),
pipeline AS (
  SELECT
    date_bucket,
    workspace_id,
    SUM(expected_value) AS pipeline_revenue
  FROM public.roofing_pipeline_forecast
  WHERE date_bucket BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'
  GROUP BY date_bucket, workspace_id
),
combined AS (
  SELECT
    COALESCE(s.date_bucket, p.date_bucket) AS date_bucket,
    COALESCE(s.workspace_id, p.workspace_id) AS workspace_id,
    COALESCE(s.scheduled_revenue, 0) AS scheduled_revenue,
    COALESCE(p.pipeline_revenue, 0) AS pipeline_revenue,
    COALESCE(s.scheduled_revenue, 0) + COALESCE(p.pipeline_revenue, 0) AS total_projected
  FROM scheduled s
  FULL OUTER JOIN pipeline p ON p.date_bucket = s.date_bucket AND p.workspace_id = s.workspace_id
)
SELECT
  date_bucket,
  workspace_id,
  scheduled_revenue,
  pipeline_revenue,
  total_projected,
  CASE
    WHEN date_bucket <= CURRENT_DATE + INTERVAL '30 days' THEN '30'
    WHEN date_bucket <= CURRENT_DATE + INTERVAL '60 days' THEN '60'
    WHEN date_bucket <= CURRENT_DATE + INTERVAL '90 days' THEN '90'
    ELSE 'future'
  END AS window_bucket
FROM combined
WHERE date_bucket BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days';

COMMENT ON VIEW public.roofing_revenue_projection IS 'Block 27520: Daily revenue projection for next 90 days';

-- D) Window summary (for 30/60/90 rollups)
CREATE OR REPLACE VIEW public.roofing_revenue_projection_windows AS
SELECT
  workspace_id,
  window_bucket,
  SUM(scheduled_revenue) AS total_scheduled,
  SUM(pipeline_revenue) AS total_pipeline,
  SUM(total_projected) AS total_projected
FROM public.roofing_revenue_projection
GROUP BY workspace_id, window_bucket
ORDER BY workspace_id, window_bucket;

COMMENT ON VIEW public.roofing_revenue_projection_windows IS 'Block 27520: Revenue projection summary by 30/60/90 day windows';

-- ============================================================================
-- PART 2 — INSTALL LOAD FORECAST (SQUARES / JOBS)
-- ============================================================================

-- A) Squares per day / week from scheduled jobs
CREATE OR REPLACE VIEW public.roofing_install_load_forecast AS
SELECT
  j.id AS job_id,
  j.workspace_id,
  COALESCE(j.title, j.homeowner_name, 'Untitled Job') AS job_name,
  j.status,
  COALESCE(j.estimated_squares, 0) AS estimated_squares,
  -- Use scheduled_start if available, otherwise scheduled_start_date, otherwise created_at
  COALESCE(j.scheduled_start, j.scheduled_start_date::date, j.created_at::date) AS date_bucket
FROM public.roofing_jobs j
WHERE j.status IN ('accepted', 'scheduled', 'in_progress')
  AND (
    j.scheduled_start IS NOT NULL 
    OR j.scheduled_start_date IS NOT NULL
    OR j.created_at IS NOT NULL
  )
  AND COALESCE(j.estimated_squares, 0) > 0;

COMMENT ON VIEW public.roofing_install_load_forecast IS 'Block 27520: Install load forecast by day';

-- B) Group by week
CREATE OR REPLACE VIEW public.roofing_install_load_by_week AS
SELECT
  workspace_id,
  DATE_TRUNC('week', date_bucket)::date AS week_start,
  COUNT(*) AS jobs_count,
  SUM(estimated_squares) AS total_squares
FROM public.roofing_install_load_forecast
WHERE date_bucket BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'
GROUP BY workspace_id, DATE_TRUNC('week', date_bucket)::date
ORDER BY workspace_id, week_start;

COMMENT ON VIEW public.roofing_install_load_by_week IS 'Block 27520: Install load forecast by week';

-- C) Weekly capacity (from roofing_global_daily_capacity)
CREATE OR REPLACE VIEW public.roofing_install_capacity_by_week AS
SELECT
  workspace_id,
  DATE_TRUNC('week', work_date)::date AS week_start,
  SUM(total_capacity_squares) AS weekly_capacity_squares
FROM public.roofing_global_daily_capacity
WHERE work_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'
GROUP BY workspace_id, DATE_TRUNC('week', work_date)::date
ORDER BY workspace_id, week_start;

COMMENT ON VIEW public.roofing_install_capacity_by_week IS 'Block 27520: Weekly capacity summary';

-- D) Install load vs capacity comparison
CREATE OR REPLACE VIEW public.roofing_install_load_vs_capacity AS
SELECT
  COALESCE(l.workspace_id, c.workspace_id) AS workspace_id,
  COALESCE(l.week_start, c.week_start) AS week_start,
  COALESCE(l.jobs_count, 0) AS jobs_count,
  COALESCE(l.total_squares, 0) AS total_squares,
  COALESCE(c.weekly_capacity_squares, 0) AS weekly_capacity_squares,
  CASE
    WHEN COALESCE(c.weekly_capacity_squares, 0) = 0 THEN NULL
    ELSE (COALESCE(l.total_squares, 0)::numeric / NULLIF(c.weekly_capacity_squares, 0))
  END AS capacity_ratio
FROM public.roofing_install_load_by_week l
FULL OUTER JOIN public.roofing_install_capacity_by_week c 
  ON c.workspace_id = l.workspace_id 
  AND c.week_start = l.week_start
ORDER BY COALESCE(l.workspace_id, c.workspace_id), COALESCE(l.week_start, c.week_start);

COMMENT ON VIEW public.roofing_install_load_vs_capacity IS 'Block 27520: Install load vs capacity comparison by week';

-- ============================================================================
-- PART 3 — OWNER TARGETS TABLE (FOR REVENUE GOALS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.roofing_owner_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  monthly_revenue_target numeric NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  -- One target per workspace (can be updated)
  UNIQUE(workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_roofing_owner_targets_workspace 
  ON public.roofing_owner_targets(workspace_id);

COMMENT ON TABLE public.roofing_owner_targets IS 'Block 27520: Owner-set monthly revenue targets for forecast comparison';

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.set_roofing_owner_targets_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_roofing_owner_targets_updated_at 
  ON public.roofing_owner_targets;
CREATE TRIGGER trg_set_roofing_owner_targets_updated_at
  BEFORE UPDATE ON public.roofing_owner_targets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_roofing_owner_targets_updated_at();

-- RLS Policies
ALTER TABLE public.roofing_owner_targets ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view targets for their workspace
CREATE POLICY "Users can view owner targets"
  ON public.roofing_owner_targets
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Owners can manage targets
CREATE POLICY "Owners can manage targets"
  ON public.roofing_owner_targets
  FOR ALL
  USING (
    workspace_id IN (
      SELECT w.id FROM public.workspaces w
      WHERE w.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT w.id FROM public.workspaces w
      WHERE w.owner_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 4 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT ON public.roofing_scheduled_revenue TO authenticated;
GRANT SELECT ON public.roofing_pipeline_forecast TO authenticated;
GRANT SELECT ON public.roofing_revenue_projection TO authenticated;
GRANT SELECT ON public.roofing_revenue_projection_windows TO authenticated;
GRANT SELECT ON public.roofing_install_load_forecast TO authenticated;
GRANT SELECT ON public.roofing_install_load_by_week TO authenticated;
GRANT SELECT ON public.roofing_install_capacity_by_week TO authenticated;
GRANT SELECT ON public.roofing_install_load_vs_capacity TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roofing_owner_targets TO authenticated;

-- ============================================================================
-- END OF BLOCK 27520
-- ============================================================================



































