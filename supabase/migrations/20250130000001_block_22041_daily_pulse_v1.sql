-- ============================================================================
-- Block 22041 — SmartSend Roofing "Daily Company Pulse" v1
-- (📅 The Morning Command Center — What Every Roofing Owner Sees at 7:00 AM)
-- ============================================================================
-- FULL BLOCK. NO FLUFF. THIS IS A TOP-TIER FEATURE THAT MAKES SMARTSEND FEEL LIKE A REAL COMPANY OPERATING SYSTEM.
--
-- This is the first screen the owner sees every morning.
-- Not a dashboard. Not a list of leads. Not a CRM table.
-- A Daily Pulse Report: A single intelligence-packed overview of
-- 🔥 what's going right,
-- ⚠️ what's going wrong,
-- 🚨 what needs attention today,
-- 💰 and where revenue is hiding.
-- ============================================================================

-- ============================================================================
-- 1. CREATE workspace_stats TABLE
-- ============================================================================
-- Stores aggregated workspace-level metrics including company health score

CREATE TABLE IF NOT EXISTS public.workspace_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Company Health Score (0-100) - Master metric
  company_health_score integer DEFAULT 50 CHECK (company_health_score >= 0 AND company_health_score <= 100),
  
  -- Timestamps
  calculated_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Ensure one stat row per workspace
  UNIQUE(workspace_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_workspace_stats_workspace 
  ON public.workspace_stats(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_stats_health_score 
  ON public.workspace_stats(company_health_score DESC);

-- RLS Policies
ALTER TABLE public.workspace_stats ENABLE ROW LEVEL SECURITY;

-- Policy: Workspace members can read stats for their workspace
CREATE POLICY "workspace_stats_select_workspace" ON public.workspace_stats
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_stats.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- Policy: Service role can insert/update stats
CREATE POLICY "workspace_stats_service_role_all" ON public.workspace_stats
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_workspace_stats_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_workspace_stats_updated_at
BEFORE UPDATE ON public.workspace_stats
FOR EACH ROW
EXECUTE FUNCTION update_workspace_stats_updated_at();

-- ============================================================================
-- 2. CREATE daily_pulse_view
-- ============================================================================
-- This view pulls all required metrics together for the owner's morning report

CREATE OR REPLACE VIEW public.daily_pulse_view AS
SELECT
  w.id as workspace_id,
  
  -- 1. Company health core metrics
  COALESCE(
    (SELECT AVG(job_health_score)::numeric(5,2)
     FROM public.leads 
     WHERE workspace_id = w.id 
     AND status NOT IN ('won','lost')
     AND job_health_score IS NOT NULL),
    50
  ) as avg_job_health,
  
  COALESCE(
    (SELECT 
       COUNT(*) FILTER (WHERE status = 'won' AND updated_at >= NOW() - INTERVAL '7 days')::numeric
       / GREATEST(COUNT(*), 1)::numeric * 100
     FROM public.leads 
     WHERE workspace_id = w.id
     AND updated_at >= NOW() - INTERVAL '7 days'),
    0
  ) as win_rate_7d,
  
  COALESCE(
    (SELECT AVG(performance_score)::numeric(5,2)
     FROM public.estimator_performance ep
     JOIN public.profiles p ON p.id = ep.estimator_id
     WHERE p.workspace_id = w.id),
    50
  ) as avg_estimator_perf,
  
  -- Pipeline velocity: average days in current stage for active leads
  COALESCE(
    (SELECT AVG(
       EXTRACT(EPOCH FROM (NOW() - COALESCE(stage_entered_at, created_at))) / 86400
     )::numeric(5,2)
     FROM public.leads
     WHERE workspace_id = w.id
     AND status NOT IN ('won','lost')),
    0
  ) as pipeline_velocity,
  
  -- Risk ratio: percentage of jobs in high/critical risk
  COALESCE(
    (SELECT 
       COUNT(*) FILTER (WHERE risk_category IN ('high','critical'))::numeric
       / GREATEST(COUNT(*), 1)::numeric * 100
     FROM public.leads 
     WHERE workspace_id = w.id 
     AND status NOT IN ('won','lost')),
    0
  ) as risk_ratio,
  
  -- 2. Revenue today
  COALESCE(
    (SELECT SUM(estimated_job_value)
     FROM public.leads 
     WHERE workspace_id = w.id 
     AND status = 'won' 
     AND DATE(updated_at) = CURRENT_DATE),
    0
  ) as revenue_today,
  
  -- Revenue last 7 days
  COALESCE(
    (SELECT SUM(estimated_job_value)
     FROM public.leads 
     WHERE workspace_id = w.id 
     AND status = 'won' 
     AND updated_at >= NOW() - INTERVAL '7 days'),
    0
  ) as revenue_last_7_days,
  
  -- 3. Health distribution
  COALESCE(
    (SELECT COUNT(*)
     FROM public.leads 
     WHERE workspace_id = w.id 
     AND job_health_score >= 75 
     AND status NOT IN ('won','lost')),
    0
  ) as healthy_jobs,
  
  COALESCE(
    (SELECT COUNT(*)
     FROM public.leads 
     WHERE workspace_id = w.id 
     AND job_health_score BETWEEN 50 AND 74 
     AND status NOT IN ('won','lost')),
    0
  ) as watchlist_jobs,
  
  COALESCE(
    (SELECT COUNT(*)
     FROM public.leads 
     WHERE workspace_id = w.id 
     AND job_health_score < 50 
     AND status NOT IN ('won','lost')),
    0
  ) as at_risk_jobs,
  
  -- 4. Estimator performance snapshot (count of estimators with performance data)
  COALESCE(
    (SELECT COUNT(DISTINCT ep.estimator_id)
     FROM public.estimator_performance ep
     JOIN public.profiles p ON p.id = ep.estimator_id
     WHERE p.workspace_id = w.id),
    0
  ) as estimator_count,
  
  -- 5. Pipeline movement (events in last 24 hours)
  COALESCE(
    (SELECT COUNT(*)
     FROM public.job_timelines jt
     JOIN public.leads l ON l.id = jt.lead_id
     WHERE l.workspace_id = w.id
     AND jt.created_at >= NOW() - INTERVAL '24 hours'),
    0
  ) as pipeline_events_24h

FROM public.workspaces w;

-- Grant access
GRANT SELECT ON public.daily_pulse_view TO authenticated;
GRANT SELECT ON public.daily_pulse_view TO service_role;

COMMENT ON VIEW public.daily_pulse_view IS 'Block 22041: Daily Pulse view aggregating all company health metrics for the morning command center';

-- ============================================================================
-- 3. CREATE FUNCTION TO CALCULATE COMPANY HEALTH SCORE
-- ============================================================================
-- Formula (simplified v1):
-- company_health = 
--   (avg_job_health * 0.25) +
--   (win_rate_7d * 0.20) +
--   (avg_estimator_perf * 0.20) +
--   (pipeline_velocity_normalized * 0.15) +
--   ((1 - risk_ratio/100) * 100 * 0.20)

CREATE OR REPLACE FUNCTION public.calculate_company_health_score(p_workspace_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_pulse RECORD;
  v_health_score NUMERIC;
  v_pipeline_velocity_normalized NUMERIC;
BEGIN
  -- Fetch pulse data
  SELECT * INTO v_pulse
  FROM public.daily_pulse_view
  WHERE workspace_id = p_workspace_id;
  
  IF NOT FOUND THEN
    RETURN 50; -- Default score if workspace not found
  END IF;
  
  -- Normalize pipeline velocity (invert: lower velocity = higher score, max 30 days = 0, 0 days = 100)
  -- Velocity is in days, so we want: 0 days = 100, 30 days = 0
  v_pipeline_velocity_normalized := GREATEST(0, LEAST(100, 
    100 - (COALESCE(v_pulse.pipeline_velocity, 0) / 30.0 * 100)
  ));
  
  -- Calculate weighted health score
  v_health_score := 
    (COALESCE(v_pulse.avg_job_health, 50) * 0.25) +
    (COALESCE(v_pulse.win_rate_7d, 0) * 0.20) +
    (COALESCE(v_pulse.avg_estimator_perf, 50) * 0.20) +
    (v_pipeline_velocity_normalized * 0.15) +
    ((1 - COALESCE(v_pulse.risk_ratio, 0) / 100.0) * 100 * 0.20);
  
  -- Clamp to 0-100 and round
  RETURN GREATEST(0, LEAST(100, ROUND(v_health_score)::INTEGER));
END;
$$;

COMMENT ON FUNCTION public.calculate_company_health_score IS 'Block 22041: Calculates company health score (0-100) using weighted formula from pulse metrics';

