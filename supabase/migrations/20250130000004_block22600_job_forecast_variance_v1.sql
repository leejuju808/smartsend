-- =========================================================
-- Block 22600 — SmartSend Roofing Job Forecasting & Variance Alerts v1
-- (See which jobs are drifting toward loss BEFORE it's too late)
-- =========================================================
-- 
-- This block flips SmartSend from "what happened" to "what's about to happen if you don't fix it."
-- 
-- Roofers get:
-- - Estimated vs Actual vs Forecast profit per job
-- - Alerts when material spend is trending above budget
-- - Alerts when labor hours are burning too fast
-- - Alerts when projected margin drops below target
-- - Simple flags: 🟢 On Track / 🟡 At Risk / 🔴 Losing Money

-- ============================================================================
-- PART 1 — ADD BUDGET + PROGRESS FIELDS TO roofing_jobs
-- ============================================================================
-- Extend roofing_jobs table with budget tracking and progress percentage

ALTER TABLE public.roofing_jobs
  ADD COLUMN IF NOT EXISTS estimated_material_cost numeric(10,2),
  ADD COLUMN IF NOT EXISTS estimated_labor_cost numeric(10,2),
  ADD COLUMN IF NOT EXISTS target_profit_margin numeric(5,2) DEFAULT 35.00, -- e.g. 35.00 (%)
  ADD COLUMN IF NOT EXISTS progress_percent numeric(5,2) DEFAULT 0; -- 0–100, manual in v1

COMMENT ON COLUMN public.roofing_jobs.estimated_material_cost IS 'Block 22600: Budgeted material cost for forecasting';
COMMENT ON COLUMN public.roofing_jobs.estimated_labor_cost IS 'Block 22600: Budgeted labor cost for forecasting';
COMMENT ON COLUMN public.roofing_jobs.target_profit_margin IS 'Block 22600: Target profit margin percentage (e.g. 35.00)';
COMMENT ON COLUMN public.roofing_jobs.progress_percent IS 'Block 22600: Job completion percentage (0-100), manual in v1';

-- ============================================================================
-- PART 2 — CREATE job_variance_alerts TABLE
-- ============================================================================
-- Store job-level variance alerts (NOT per line item)

CREATE TABLE IF NOT EXISTS public.job_variance_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,

  type text CHECK (type IN ('material_overrun','labor_overrun','margin_risk','overall_risk')) NOT NULL,
  severity text CHECK (severity IN ('info','warning','critical')) DEFAULT 'warning',

  budget_value numeric(12,2),
  forecast_value numeric(12,2),
  variance_value numeric(12,2),
  variance_percent numeric(6,2),

  message text NOT NULL,

  status text CHECK (status IN ('open','acknowledged','resolved','dismissed')) DEFAULT 'open',

  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_variance_alerts_workspace_idx
  ON public.job_variance_alerts(workspace_id);

CREATE INDEX IF NOT EXISTS job_variance_alerts_job_idx
  ON public.job_variance_alerts(job_id);

CREATE INDEX IF NOT EXISTS job_variance_alerts_status_idx
  ON public.job_variance_alerts(status) WHERE status = 'open';

CREATE INDEX IF NOT EXISTS job_variance_alerts_type_idx
  ON public.job_variance_alerts(type);

ALTER TABLE public.job_variance_alerts ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view variance alerts for jobs in their workspace
CREATE POLICY "variance_select" ON public.job_variance_alerts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = job_variance_alerts.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- RLS Policy: Users can insert variance alerts for jobs in their workspace
CREATE POLICY "variance_insert" ON public.job_variance_alerts
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = job_variance_alerts.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- RLS Policy: Users can update variance alerts for jobs in their workspace
CREATE POLICY "variance_update" ON public.job_variance_alerts
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = job_variance_alerts.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- RLS Policy: Users can delete variance alerts for jobs in their workspace
CREATE POLICY "variance_delete" ON public.job_variance_alerts
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = job_variance_alerts.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.job_variance_alerts IS 'Block 22600: Job-level variance alerts for forecasting and budget tracking';







































