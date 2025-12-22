-- ============================================================================
-- Block 21834 — SmartSend Roofing Job Timeline v1
-- ============================================================================
-- Full "Cradle-to-Close" Timeline for Every Roofing Job — The Owner's Dream View
--
-- This table creates a unified chronological feed of everything that happened
-- with a lead/job: messages, follow-ups, heat scores, job probability changes,
-- routing decisions, proposal events, booking events, tone/intent classification,
-- resurrection attempts, coaching triggers, internal notes, status changes, files.
--
-- This is what owners look at to understand: "Why did we win or lose this job?"
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.job_timelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast loading of timeline (most common query: get all events for a lead, newest first)
CREATE INDEX IF NOT EXISTS idx_job_timelines_lead_id_created_at
  ON public.job_timelines (lead_id, created_at DESC);

-- Additional indexes for performance
CREATE INDEX IF NOT EXISTS idx_job_timelines_lead_id ON public.job_timelines(lead_id);
CREATE INDEX IF NOT EXISTS idx_job_timelines_created_at ON public.job_timelines(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_timelines_event_type ON public.job_timelines(event_type);

-- RLS: Enable Row Level Security
ALTER TABLE public.job_timelines ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view timeline events for leads in their workspace
CREATE POLICY "Users can view job timeline events"
  ON public.job_timelines
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.leads l
      WHERE l.id = job_timelines.lead_id
        AND (
          -- Workspace-based access (if workspace_id exists)
          EXISTS (
            SELECT 1
            FROM public.workspace_members wm
            WHERE wm.workspace_id = l.workspace_id
              AND wm.user_id = auth.uid()
          )
          OR
          -- Owner-based access (if owner_id exists)
          (l.owner_id = auth.uid())
          OR
          -- Team-based access (if team_id exists)
          EXISTS (
            SELECT 1
            FROM public.teams t
            JOIN public.team_members tm ON tm.team_id = t.id
            WHERE t.id = l.team_id
              AND tm.user_id = auth.uid()
          )
        )
    )
  );

-- Policy: Service role can insert timeline events (for system operations)
CREATE POLICY "Service role can insert timeline events"
  ON public.job_timelines
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Policy: Authenticated users can insert timeline events (for manual notes, etc.)
CREATE POLICY "Authenticated users can insert timeline events"
  ON public.job_timelines
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.leads l
      WHERE l.id = job_timelines.lead_id
        AND (
          EXISTS (
            SELECT 1
            FROM public.workspace_members wm
            WHERE wm.workspace_id = l.workspace_id
              AND wm.user_id = auth.uid()
          )
          OR (l.owner_id = auth.uid())
          OR EXISTS (
            SELECT 1
            FROM public.teams t
            JOIN public.team_members tm ON tm.team_id = t.id
            WHERE t.id = l.team_id
              AND tm.user_id = auth.uid()
          )
        )
    )
  );

-- ============================================================================
-- Event Types Supported (Version 1)
-- ============================================================================
-- Communication:
--   - homeowner_reply
--   - estimator_reply
--   - outbound_message
--   - tone_intent_detected
--
-- Lead Management:
--   - lead_created
--   - lead_routed
--   - heat_score_updated
--   - job_probability_updated
--   - lead_resurrection_triggered
--
-- Sales Pipeline:
--   - estimate_booked
--   - estimate_completed
--   - proposal_sent
--   - job_lost
--   - job_won
--
-- Follow-Up:
--   - follow_up_completed
--   - follow_up_missed
--
-- Internal:
--   - internal_note
--   - file_uploaded
--   - coaching_trigger
-- ============================================================================









































