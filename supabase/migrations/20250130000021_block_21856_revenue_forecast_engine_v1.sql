-- =========================================================
-- Block 21856 — SmartSend Roofing Revenue Forecast Engine v1
-- 💰 Predict Monthly Revenue Automatically Using AI + Pipeline Data
-- =========================================================
-- This single feature makes SmartSend feel like a true business command center.
-- Roofers always ask:
-- "How much revenue will we make this month?"
-- "Are we on track?"
-- "What is our projected pipeline?"
-- "How much money are we losing?"
-- Right now most roofing companies operate BLIND.
-- SmartSend fixes that permanently.

-- ============================================================================
-- 1. CREATE revenue_forecasts TABLE
-- ============================================================================
-- Stores daily forecast snapshots for each workspace

CREATE TABLE IF NOT EXISTS public.revenue_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  forecast_date date NOT NULL DEFAULT CURRENT_DATE,
  
  -- Forecast metrics
  forecast_weighted numeric(12,2) DEFAULT 0,
  forecast_best_case numeric(12,2) DEFAULT 0,
  forecast_worst_case numeric(12,2) DEFAULT 0,
  forecast_historical numeric(12,2) DEFAULT 0,
  
  -- Revenue leakage
  revenue_leakage numeric(12,2) DEFAULT 0,
  
  -- Estimator breakdown (JSONB)
  estimator_breakdown jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz DEFAULT now(),
  
  -- Ensure one forecast per workspace per day
  UNIQUE(workspace_id, forecast_date)
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_revenue_forecasts_workspace_date 
  ON public.revenue_forecasts(workspace_id, forecast_date DESC);
CREATE INDEX IF NOT EXISTS idx_revenue_forecasts_forecast_date 
  ON public.revenue_forecasts(forecast_date DESC);

-- Comments for documentation
COMMENT ON TABLE public.revenue_forecasts IS 'Block 21856: Daily revenue forecast snapshots combining job probability, pipeline data, and historical win rates';
COMMENT ON COLUMN public.revenue_forecasts.forecast_weighted IS 'Weighted revenue forecast: sum of (job_value × job_probability) for all active pipeline leads';
COMMENT ON COLUMN public.revenue_forecasts.forecast_best_case IS 'Best-case revenue: sum of all job values if every proposal closes';
COMMENT ON COLUMN public.revenue_forecasts.forecast_worst_case IS 'Worst-case revenue: sum of only jobs with probability ≥ 70%';
COMMENT ON COLUMN public.revenue_forecasts.forecast_historical IS 'Historical forecast: uses estimator win rates × total proposed job value';
COMMENT ON COLUMN public.revenue_forecasts.revenue_leakage IS 'Revenue lost due to missed follow-ups, slow response, ignored leads, proposal delays';
COMMENT ON COLUMN public.revenue_forecasts.estimator_breakdown IS 'JSONB breakdown by estimator_id: {estimator_id: {total, weighted, bestCase}}';

-- ============================================================================
-- 2. ENABLE RLS
-- ============================================================================

ALTER TABLE public.revenue_forecasts ENABLE ROW LEVEL SECURITY;

-- Policy: Workspace members can view forecasts for their workspace
CREATE POLICY "Workspace members can view revenue forecasts"
  ON public.revenue_forecasts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = revenue_forecasts.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Policy: Service role can insert/update forecasts (for edge function)
CREATE POLICY "Service role can manage revenue forecasts"
  ON public.revenue_forecasts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);









































