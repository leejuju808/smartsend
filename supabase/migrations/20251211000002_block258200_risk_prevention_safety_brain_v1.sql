-- Block 258200 — SmartSend AI Risk Prevention & Safety Brain v1
-- Incident Prediction, Safety Monitoring, OSHA Automation, Crew Risk Scores
-- This block turns SmartSend into the proactive safety brain for roofing crews.

-- ============================================================================
-- PART 1 — safety_events (Unified Safety/Hazard Event Log)
-- ============================================================================
-- Captures AI- and human-detected safety events tied to jobs and crews.

CREATE TABLE IF NOT EXISTS public.safety_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  crew_member_id uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,

  -- Classification
  event_type text NOT NULL, -- e.g. 'hazard_detected', 'ppe_missing', 'high_wind', 'heat_index_high', 'ladder_issue', 'near_miss'
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),

  -- Description & media
  description text,
  photos text[] DEFAULT '{}', -- storage URLs for supporting photos
  weather jsonb DEFAULT '{}'::jsonb, -- { temperature, heat_index, wind_speed, conditions }

  -- Source metadata
  source text, -- 'photo_ai', 'weather_monitor', 'manual_report', 'checklist', etc.
  metadata jsonb DEFAULT '{}'::jsonb,

  created_at timestamptz DEFAULT now()
);

-- Attach job_id FK to roofing_jobs or jobs if present
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_name = 'safety_events' AND constraint_name = 'safety_events_job_id_fkey'
    ) THEN
      ALTER TABLE public.safety_events
        ADD CONSTRAINT safety_events_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE SET NULL;
    END IF;
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_name = 'safety_events' AND constraint_name = 'safety_events_job_id_fkey'
    ) THEN
      ALTER TABLE public.safety_events
        ADD CONSTRAINT safety_events_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_safety_events_job ON public.safety_events(job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_safety_events_crew ON public.safety_events(crew_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_safety_events_type ON public.safety_events(event_type);
CREATE INDEX IF NOT EXISTS idx_safety_events_severity ON public.safety_events(severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_safety_events_workspace ON public.safety_events(workspace_id, created_at DESC);

COMMENT ON TABLE public.safety_events IS 'Unified safety/hazard event log (AI + manual) for jobs and crews (Block 258200).';

-- ============================================================================
-- PART 2 — incident_predictions (Proactive Incident Risk Model Storage)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.incident_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,

  probability numeric(4,3) NOT NULL CHECK (probability >= 0 AND probability <= 1), -- 0.0–1.0
  risk_level text NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  risk_factors jsonb NOT NULL DEFAULT '{}'::jsonb, -- structured breakdown of why risk is high

  valid_for_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);

-- Attach job_id FK to roofing_jobs or jobs if present
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_name = 'incident_predictions' AND constraint_name = 'incident_predictions_job_id_fkey'
    ) THEN
      ALTER TABLE public.incident_predictions
        ADD CONSTRAINT incident_predictions_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE SET NULL;
    END IF;
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_name = 'incident_predictions' AND constraint_name = 'incident_predictions_job_id_fkey'
    ) THEN
      ALTER TABLE public.incident_predictions
        ADD CONSTRAINT incident_predictions_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_incident_predictions_job ON public.incident_predictions(job_id, valid_for_date DESC);
CREATE INDEX IF NOT EXISTS idx_incident_predictions_crew ON public.incident_predictions(crew_id, valid_for_date DESC);
CREATE INDEX IF NOT EXISTS idx_incident_predictions_workspace ON public.incident_predictions(workspace_id, valid_for_date DESC);
CREATE INDEX IF NOT EXISTS idx_incident_predictions_risk ON public.incident_predictions(risk_level, probability DESC);

COMMENT ON TABLE public.incident_predictions IS 'Stored incident risk predictions per job/crew (Block 258200).';

-- ============================================================================
-- PART 3 — Helper Functions: Near-Miss Trends and Safety Gate
-- ============================================================================

-- Near-miss trend summary for a crew over a time window
CREATE OR REPLACE FUNCTION public.get_crew_near_miss_trends(
  p_crew_id uuid,
  p_days int DEFAULT 30
)
RETURNS TABLE (
  crew_id uuid,
  window_days int,
  near_miss_count int,
  high_severity_count int,
  ladder_related_count int,
  last_event_at timestamptz
) LANGUAGE sql STABLE AS $$
  SELECT
    p_crew_id AS crew_id,
    p_days AS window_days,
    COUNT(*)::int AS near_miss_count,
    COUNT(*) FILTER (WHERE severity IN ('high', 'critical'))::int AS high_severity_count,
    COUNT(*) FILTER (WHERE event_type = 'ladder_issue')::int AS ladder_related_count,
    MAX(created_at) AS last_event_at
  FROM public.safety_events
  WHERE crew_id = p_crew_id
    AND created_at >= now() - (p_days || ' days')::interval
    AND (event_type = 'near_miss' OR metadata->>'near_miss' = 'true');
$$;

COMMENT ON FUNCTION public.get_crew_near_miss_trends(uuid, int) IS 'Summarizes near-miss trends for a crew over the last N days (Block 258200).';

-- Safety gate: can this job start today?
CREATE OR REPLACE FUNCTION public.check_job_safety_gate(
  p_job_id uuid
)
RETURNS TABLE (
  job_id uuid,
  can_start boolean,
  blocking_reasons text[],
  latest_score numeric,
  last_checklist_at timestamptz
) LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_can_start boolean := true;
  v_reasons text[] := ARRAY[]::text[];
  v_last_checklist timestamptz;
  v_score numeric := NULL;
BEGIN
  -- 1) Require a completed safety checklist for today (from Block 49000)
  SELECT MAX(created_at)
  INTO v_last_checklist
  FROM public.safety_checklists
  WHERE job_id = p_job_id
    AND completed = true
    AND created_at::date = CURRENT_DATE;

  IF v_last_checklist IS NULL THEN
    v_can_start := false;
    v_reasons := array_append(v_reasons, 'No completed safety checklist for today');
  END IF;

  -- 2) Check job-level safety score if table exists (Block 49000)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'safety_scores'
  ) THEN
    BEGIN
      SELECT score
      INTO v_score
      FROM public.safety_scores
      WHERE job_id = p_job_id
      ORDER BY calculated_at DESC
      LIMIT 1;
    EXCEPTION WHEN undefined_column THEN
      -- In some environments safety_scores may be employee-based; ignore in that case
      v_score := NULL;
    END;

    IF v_score IS NOT NULL AND v_score < 80 THEN
      v_can_start := false;
      v_reasons := array_append(v_reasons, 'Job safety score is below 80');
    END IF;
  END IF;

  -- 3) Block on any high/critical safety events for today
  IF EXISTS (
    SELECT 1 FROM public.safety_events
    WHERE job_id = p_job_id
      AND created_at::date = CURRENT_DATE
      AND severity IN ('high', 'critical')
  ) THEN
    v_can_start := false;
    v_reasons := array_append(v_reasons, 'Open high/critical safety events on this job today');
  END IF;

  RETURN QUERY
  SELECT p_job_id, v_can_start, v_reasons, v_score, v_last_checklist;
END;
$$;

COMMENT ON FUNCTION public.check_job_safety_gate(uuid) IS 'Enforces pre-start safety gate for a job (checklist + score + high/critical events) (Block 258200).';

-- ============================================================================
-- PART 4 — Row Level Security & Grants
-- ============================================================================

ALTER TABLE public.safety_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_predictions ENABLE ROW LEVEL SECURITY;

-- safety_events: workspace members for job''s workspace or crew workspace
CREATE POLICY "safety_events_workspace_member" ON public.safety_events
  FOR SELECT USING (
    -- Direct workspace scope
    (workspace_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = safety_events.workspace_id
        AND wm.user_id = auth.uid()
    ))
    OR
    -- Derive workspace from roofing_jobs
    EXISTS (
      SELECT 1
      FROM public.roofing_jobs rj
      JOIN public.workspace_members wm ON wm.workspace_id = rj.workspace_id
      WHERE rj.id = safety_events.job_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "safety_events_insert_service_role" ON public.safety_events
  FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "safety_events_update_service_role" ON public.safety_events
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- incident_predictions: workspace-scoped access
CREATE POLICY "incident_predictions_workspace_member" ON public.incident_predictions
  FOR SELECT USING (
    workspace_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = incident_predictions.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "incident_predictions_insert_service_role" ON public.incident_predictions
  FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "incident_predictions_update_service_role" ON public.incident_predictions
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);

GRANT SELECT ON public.safety_events TO authenticated;
GRANT SELECT ON public.incident_predictions TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_crew_near_miss_trends(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_job_safety_gate(uuid) TO authenticated;

COMMENT ON POLICY "safety_events_workspace_member" ON public.safety_events IS 'Workspace members can view safety events for their jobs/workspace (Block 258200).';
COMMENT ON POLICY "incident_predictions_workspace_member" ON public.incident_predictions IS 'Workspace members can view incident predictions for their workspace (Block 258200).';













