-- =========================================================
-- Block 21746 — SmartSend Roofing Estimator Scorecard v1
-- Give roofing owners a simple, brutal, truth-telling scorecard for each estimator
-- =========================================================

-- ============================================================================
-- CREATE estimator_scorecards TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.estimator_scorecards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Period tracking
  period_start date NOT NULL,
  period_end date NOT NULL,
  
  -- Core metrics
  avg_response_time_seconds integer, -- Average time from homeowner reply → estimator response
  follow_up_completion_rate numeric(5,2), -- % of tasks/messages completed on time
  booked_estimate_rate numeric(5,2), -- % of leads they convert to scheduled estimates
  proposal_sent_rate numeric(5,2), -- % of leads who receive a proposal after estimate
  win_rate numeric(5,2), -- % of proposals turning into paying jobs
  job_value_created numeric(12,2), -- $ value created
  job_value_lost numeric(12,2), -- $ value lost (based on ignored leads or slow follow-ups)
  lead_coverage_score numeric(5,2), -- % of leads responded to within <5 minutes (hot lead metric)
  
  -- Score output
  final_letter_grade text CHECK (final_letter_grade IN ('A', 'B', 'C', 'D', 'F')),
  insight text, -- One-sentence actionable insight
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Ensure one scorecard per estimator per period
  UNIQUE(estimator_id, workspace_id, period_start, period_end)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_estimator_scorecards_estimator 
  ON public.estimator_scorecards(estimator_id, period_end DESC);
CREATE INDEX IF NOT EXISTS idx_estimator_scorecards_workspace 
  ON public.estimator_scorecards(workspace_id, period_end DESC);
CREATE INDEX IF NOT EXISTS idx_estimator_scorecards_period 
  ON public.estimator_scorecards(period_start, period_end);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_estimator_scorecards_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_estimator_scorecards_updated_at ON public.estimator_scorecards;
CREATE TRIGGER trg_estimator_scorecards_updated_at
BEFORE UPDATE ON public.estimator_scorecards
FOR EACH ROW
EXECUTE FUNCTION update_estimator_scorecards_updated_at();

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE public.estimator_scorecards ENABLE ROW LEVEL SECURITY;

-- Policy: Workspace members can read scorecards for estimators in their workspace
DROP POLICY IF EXISTS "workspace_read" ON public.estimator_scorecards;
CREATE POLICY "workspace_read"
ON public.estimator_scorecards FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = estimator_scorecards.workspace_id
    AND wm.user_id = auth.uid()
  )
);

-- Policy: Service role can insert/update (for edge function)
DROP POLICY IF EXISTS "service_role_all" ON public.estimator_scorecards;
CREATE POLICY "service_role_all"
ON public.estimator_scorecards FOR ALL
TO service_role
USING (true) WITH CHECK (true);

-- ============================================================================
-- COMMENT
-- ============================================================================

COMMENT ON TABLE public.estimator_scorecards IS 'Block 21746 — Estimator performance scorecards for roofing companies. Tracks response times, conversion rates, and revenue impact per estimator.';









































