-- =========================================================
-- Block 21812 — SmartSend Roofing Estimator Coaching Engine v1
-- 📘 AI Training Based on Real Performance
-- =========================================================
-- This system automatically generates weekly coaching insights for each estimator:
-- - What they're doing well
-- - What they're struggling with
-- - What behaviors are costing revenue
-- - Where they should focus their improvement
-- - Exact actions to take next week
--
-- This gives owners EXACT clarity on how to improve their team without watching
-- over anyone's shoulder. This raises retention, raises roofers' revenue, and
-- raises SmartSend's pricing power.

-- ============================================================================
-- CREATE estimator_coaching_reports TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.estimator_coaching_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Period tracking
  week_start date NOT NULL,
  week_end date NOT NULL,
  
  -- Coaching insights (text fields for AI-generated content)
  summary text, -- Performance summary (e.g., "Your win rate this week was 28%, above the company average of 22%.")
  strengths text, -- What they're doing well (e.g., "You respond extremely fast to emergency leads — keep prioritizing these.")
  weaknesses text, -- Critical weaknesses (e.g., "You missed 4 follow-ups this week. This likely cost $14,000 in job value.")
  action_items text, -- 3 action items for next week (e.g., "Respond to hot leads within 3 minutes\nSend proposal within 24 hours\nComplete follow-ups before noon each day")
  opportunity text, -- Opportunity alert (e.g., "Your close rate on insurance leads is 40% higher — request more insurance jobs.")
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  
  -- Ensure one coaching report per estimator per week
  UNIQUE(estimator_id, workspace_id, week_start, week_end)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_estimator_coaching_reports_estimator 
  ON public.estimator_coaching_reports(estimator_id, week_end DESC);
CREATE INDEX IF NOT EXISTS idx_estimator_coaching_reports_workspace 
  ON public.estimator_coaching_reports(workspace_id, week_end DESC);
CREATE INDEX IF NOT EXISTS idx_estimator_coaching_reports_period 
  ON public.estimator_coaching_reports(week_start, week_end);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE public.estimator_coaching_reports ENABLE ROW LEVEL SECURITY;

-- Policy: Workspace members can read coaching reports for estimators in their workspace
DROP POLICY IF EXISTS "workspace_read" ON public.estimator_coaching_reports;
CREATE POLICY "workspace_read"
ON public.estimator_coaching_reports FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = estimator_coaching_reports.workspace_id
    AND wm.user_id = auth.uid()
  )
);

-- Policy: Estimators can read their own coaching reports
DROP POLICY IF EXISTS "estimator_read_own" ON public.estimator_coaching_reports;
CREATE POLICY "estimator_read_own"
ON public.estimator_coaching_reports FOR SELECT
USING (estimator_id = auth.uid());

-- Policy: Service role can insert/update (for edge function)
DROP POLICY IF EXISTS "service_role_all" ON public.estimator_coaching_reports;
CREATE POLICY "service_role_all"
ON public.estimator_coaching_reports FOR ALL
TO service_role
USING (true) WITH CHECK (true);

-- ============================================================================
-- COMMENT
-- ============================================================================

COMMENT ON TABLE public.estimator_coaching_reports IS 'Block 21812 — Weekly AI-generated coaching insights for estimators. Analyzes performance metrics and provides actionable feedback to improve team performance.';









































