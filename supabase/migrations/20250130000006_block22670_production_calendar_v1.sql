-- =========================================================
-- Block 22670 — SmartSend Roofing Production Calendar v1
-- "Schedule, Crews, Materials Sync"
-- =========================================================
-- 
-- The calendar that actually knows if a job is READY or going to be a disaster.
-- 
-- This is where SmartSend steps out of just "numbers" and into daily operations:
-- - Who's working where
-- - When materials land
-- - Which days are overbooked
-- - Which jobs are not ready but still scheduled
--
-- This is the calendar roofing owners wish Google Calendar could be.

-- ============================================================================
-- PART 1 — CREATE crews TABLE
-- ============================================================================
-- Crews represent teams of workers assigned to jobs

CREATE TABLE IF NOT EXISTS public.crews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  foreman_name text,
  foreman_phone text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crews_workspace_idx ON public.crews(workspace_id);
CREATE INDEX IF NOT EXISTS crews_name_idx ON public.crews(workspace_id, name);

-- ============================================================================
-- PART 2 — CREATE job_production_slots TABLE
-- ============================================================================
-- This table is the spine of the production calendar:
-- Each row = "Crew X is on Job Y from start_date → end_date."

CREATE TABLE IF NOT EXISTS public.job_production_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text CHECK (status IN ('scheduled','in_progress','paused','completed','canceled')) DEFAULT 'scheduled',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Ensure end_date is after start_date
  CONSTRAINT valid_date_range CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS job_production_slots_workspace_idx ON public.job_production_slots(workspace_id);
CREATE INDEX IF NOT EXISTS job_production_slots_job_idx ON public.job_production_slots(job_id);
CREATE INDEX IF NOT EXISTS job_production_slots_crew_idx ON public.job_production_slots(crew_id);
CREATE INDEX IF NOT EXISTS job_production_slots_dates_idx ON public.job_production_slots(start_date, end_date);
CREATE INDEX IF NOT EXISTS job_production_slots_status_idx ON public.job_production_slots(status);

-- ============================================================================
-- PART 3 — ROW LEVEL SECURITY POLICIES
-- ============================================================================

ALTER TABLE public.crews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_production_slots ENABLE ROW LEVEL SECURITY;

-- Crews: Users can view/manage crews in their workspace
CREATE POLICY "Users can view crews in their workspace"
  ON public.crews FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create crews in their workspace"
  ON public.crews FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update crews in their workspace"
  ON public.crews FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete crews in their workspace"
  ON public.crews FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Job Production Slots: Users can view/manage slots in their workspace
CREATE POLICY "Users can view production slots in their workspace"
  ON public.job_production_slots FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create production slots in their workspace"
  ON public.job_production_slots FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update production slots in their workspace"
  ON public.job_production_slots FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete production slots in their workspace"
  ON public.job_production_slots FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 4 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crews TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_production_slots TO authenticated;

-- ============================================================================
-- PART 5 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.crews IS 'Crews represent teams of workers assigned to roofing jobs';
COMMENT ON TABLE public.job_production_slots IS 'Production calendar slots linking crews to jobs with scheduled dates. Each row represents a crew assignment to a job for a date range.';
COMMENT ON COLUMN public.job_production_slots.status IS 'Status of the production slot: scheduled, in_progress, paused, completed, canceled';







































