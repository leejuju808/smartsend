-- Block 21757 — SmartSend Roofing Company Scorecard v1
-- Weekly performance snapshot for entire roofing company
-- This keeps SmartSend sticky → long-term retention

-- ============================================================================
-- 1. CREATE company_scorecards TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.company_scorecards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  -- Period
  period_start date NOT NULL,
  period_end date NOT NULL,

  -- Lead Flow
  leads_total integer,
  leads_answered_fast integer,
  leads_ignored integer,

  -- Appointments
  estimates_booked integer,
  estimates_not_booked integer,
  avg_lead_to_estimate_seconds integer,

  -- Sales Pipeline
  proposals_sent integer,
  jobs_closed integer,
  jobs_lost integer,
  win_rate numeric(5,2),

  -- Money Metrics
  job_value_created numeric(12,2),
  job_value_lost numeric(12,2),
  pipeline_value numeric(12,2),

  -- Follow-Up Behavior
  follow_up_completed integer,
  follow_up_missed integer,
  follow_up_rate numeric(5,2),

  -- Estimator Performance Summary
  best_estimator_id uuid,
  worst_estimator_id uuid,
  estimator_team_avg numeric(5,2),

  -- Final Grade
  final_letter_grade text CHECK (final_letter_grade IN ('A', 'B', 'C', 'D', 'F')),
  insight text,

  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_company_scorecards_workspace 
  ON public.company_scorecards(workspace_id, period_start DESC, period_end DESC);
CREATE INDEX IF NOT EXISTS idx_company_scorecards_period 
  ON public.company_scorecards(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_company_scorecards_created_at 
  ON public.company_scorecards(created_at DESC);

-- ============================================================================
-- 2. ENABLE RLS
-- ============================================================================

ALTER TABLE public.company_scorecards ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Workspace members can view scorecards for their workspace
CREATE POLICY "workspace read"
  ON public.company_scorecards
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- RLS Policy: Service role can insert/update (for edge function)
CREATE POLICY "service role all"
  ON public.company_scorecards
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);









































