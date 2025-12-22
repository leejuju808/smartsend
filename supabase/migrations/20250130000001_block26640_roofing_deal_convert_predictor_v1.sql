-- =========================================================
-- Block 26640 — SmartSend Roofing Deal Convert Predictor v1
-- (AI win probability • Revenue prediction • Follow-up priority • "Which quotes will actually close?")
-- =========================================================
-- 
-- This block gives SmartSend the "Will this deal close?" brain.
-- 
-- For every lead / job, SmartSend shows the win probability (%), expected revenue, 
-- and tells the roofer where to focus follow-up.
-- 
-- This is how SmartSend becomes a true revenue system, not just CRM + email.

-- ============================================================================
-- PART 1 — CREATE roofing_deal_predictions TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.roofing_deal_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  -- Prediction
  win_probability integer CHECK (win_probability >= 0 AND win_probability <= 100),
  expected_revenue numeric(12,2),
  expected_profit numeric(12,2),

  -- Meta
  confidence_level text CHECK (confidence_level IN ('low', 'medium', 'high')),
  follow_up_priority text CHECK (follow_up_priority IN ('low', 'medium', 'high')),
  reason_summary text,

  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Ensure one prediction per job
  UNIQUE(job_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_roofing_deal_predictions_job 
  ON public.roofing_deal_predictions(job_id);

CREATE INDEX IF NOT EXISTS idx_roofing_deal_predictions_workspace 
  ON public.roofing_deal_predictions(workspace_id);

CREATE INDEX IF NOT EXISTS idx_roofing_deal_predictions_win_probability 
  ON public.roofing_deal_predictions(win_probability DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_roofing_deal_predictions_expected_profit 
  ON public.roofing_deal_predictions(expected_profit DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_roofing_deal_predictions_follow_up_priority 
  ON public.roofing_deal_predictions(follow_up_priority, expected_profit DESC NULLS LAST);

-- ============================================================================
-- PART 2 — RLS POLICIES
-- ============================================================================

ALTER TABLE public.roofing_deal_predictions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view predictions for jobs in their workspace
CREATE POLICY "Users can view deal predictions"
  ON public.roofing_deal_predictions
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Service role can manage predictions (for edge function)
CREATE POLICY "Service role can manage deal predictions"
  ON public.roofing_deal_predictions
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- PART 3 — TRIGGER: Update updated_at timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_roofing_deal_predictions_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_roofing_deal_predictions_updated_at 
  ON public.roofing_deal_predictions;
CREATE TRIGGER trg_set_roofing_deal_predictions_updated_at
  BEFORE UPDATE ON public.roofing_deal_predictions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_roofing_deal_predictions_updated_at();

-- ============================================================================
-- PART 4 — CREATE roofing_deal_priority VIEW
-- ============================================================================
-- Priority list ordered by expected value

CREATE OR REPLACE VIEW public.roofing_deal_priority AS
SELECT
  j.id AS job_id,
  j.workspace_id,
  j.homeowner_name,
  j.address,
  j.current_stage AS status,
  j.projected_job_value AS estimated_value,
  p.win_probability,
  p.expected_revenue,
  p.expected_profit,
  p.follow_up_priority,
  p.confidence_level,
  p.reason_summary,
  p.updated_at AS prediction_updated_at
FROM public.roofing_jobs j
LEFT JOIN public.roofing_deal_predictions p ON p.job_id = j.id
WHERE j.current_stage IN (
  'ADJUSTER_SCHEDULED',
  'CLAIM_PENDING',
  'CLAIM_APPROVED',
  'INSTALL_READY',
  'SCHEDULED_INSTALL'
)
ORDER BY 
  COALESCE(p.expected_profit, 0) DESC NULLS LAST,
  COALESCE(p.win_probability, 0) DESC NULLS LAST;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.roofing_deal_predictions IS 'Block 26640: AI-powered deal conversion predictions with win probability and expected revenue';
COMMENT ON COLUMN public.roofing_deal_predictions.win_probability IS 'Block 26640: Predicted probability (0-100%) that this deal will close';
COMMENT ON COLUMN public.roofing_deal_predictions.expected_revenue IS 'Block 26640: Expected revenue = win_probability * job_value';
COMMENT ON COLUMN public.roofing_deal_predictions.expected_profit IS 'Block 26640: Expected profit = expected_revenue * margin (typically 35%)';
COMMENT ON COLUMN public.roofing_deal_predictions.follow_up_priority IS 'Block 26640: Recommended follow-up priority (high/medium/low)';
COMMENT ON VIEW public.roofing_deal_priority IS 'Block 26640: Prioritized list of deals ordered by expected profit';
