-- =========================================================
-- Block 21958 — SmartSend Roofing Estimator Performance Score v1
-- Unified performance score (0-100) built from 6 core signals
-- =========================================================

-- ============================================================================
-- CREATE estimator_performance TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.estimator_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  estimator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  -- Final unified score (0-100)
  performance_score integer NOT NULL CHECK (performance_score >= 0 AND performance_score <= 100),
  
  -- Individual signal scores (0-100 each)
  speed_score integer NOT NULL CHECK (speed_score >= 0 AND speed_score <= 100),
  followup_score integer NOT NULL CHECK (followup_score >= 0 AND followup_score <= 100),
  proposal_score integer NOT NULL CHECK (proposal_score >= 0 AND proposal_score <= 100),
  close_rate_score integer NOT NULL CHECK (close_rate_score >= 0 AND close_rate_score <= 100),
  tone_score integer NOT NULL CHECK (tone_score >= 0 AND tone_score <= 100),
  ai_alignment_score integer NOT NULL CHECK (ai_alignment_score >= 0 AND ai_alignment_score <= 100),
  
  -- Calculation timestamp
  calculated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Ensure one score per estimator per workspace (latest calculation)
  UNIQUE(workspace_id, estimator_id)
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_estimator_performance_workspace 
  ON public.estimator_performance(workspace_id);
CREATE INDEX IF NOT EXISTS idx_estimator_performance_estimator 
  ON public.estimator_performance(estimator_id);
CREATE INDEX IF NOT EXISTS idx_estimator_performance_score 
  ON public.estimator_performance(performance_score DESC);
CREATE INDEX IF NOT EXISTS idx_estimator_performance_calculated_at 
  ON public.estimator_performance(calculated_at DESC);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE public.estimator_performance ENABLE ROW LEVEL SECURITY;

-- Policy: Workspace members can read performance scores for estimators in their workspace
DROP POLICY IF EXISTS "workspace_read_performance" ON public.estimator_performance;
CREATE POLICY "workspace_read_performance"
ON public.estimator_performance FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = estimator_performance.workspace_id
    AND wm.user_id = auth.uid()
  )
);

-- Policy: Service role can insert/update (for edge function)
DROP POLICY IF EXISTS "service_role_all_performance" ON public.estimator_performance;
CREATE POLICY "service_role_all_performance"
ON public.estimator_performance FOR ALL
TO service_role
USING (true) WITH CHECK (true);

-- ============================================================================
-- COMMENT
-- ============================================================================

COMMENT ON TABLE public.estimator_performance IS 'Block 21958 — Estimator Performance Score v1. Unified score (0-100) built from 6 weighted signals: Speed to Lead (25%), Follow-Up Completion (25%), Proposal Turnaround (15%), Close Rate Adjusted (20%), Homeowner Tone Impact (10%), AI Alignment (5%).';









































