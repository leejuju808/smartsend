-- =========================================================
-- Block 22280 — SmartSend Roofing Job Calendar & Crew View v1
-- (Who's On What Roof, When?)
-- =========================================================
-- 
-- This block gives roofers two things they desperately need:
-- 1. A job calendar → what's scheduled each day
-- 2. A crew view → which crew is on which job
-- 
-- This is how the owner stops guessing and starts running the week like a machine.

-- ============================================================================
-- PART 1 — CREATE crews TABLE
-- ============================================================================
-- Why roofers care: They can set up "Crew 1 – Main Roof", "Crew 2 – Repairs", etc.

CREATE TABLE IF NOT EXISTS public.crews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  name text NOT NULL,               -- "Crew 1", "Tear-off Crew", etc.
  color text,                       -- optional hex for UI (e.g. "#F97316")
  is_active boolean DEFAULT true,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crews_workspace_idx
  ON public.crews(workspace_id, is_active);

-- ============================================================================
-- PART 2 — CREATE crew_members TABLE (optional but strong)
-- ============================================================================
-- If you want to show names per crew later.

CREATE TABLE IF NOT EXISTS public.crew_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,

  name text NOT NULL,          -- "Jose", "Mike", etc.
  role text,                   -- "Lead", "Installer", etc.

  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crew_members_workspace_idx
  ON public.crew_members(workspace_id, is_active);

CREATE INDEX IF NOT EXISTS crew_members_crew_idx
  ON public.crew_members(crew_id) WHERE crew_id IS NOT NULL;

-- ============================================================================
-- PART 3 — CREATE job_crew_assignments TABLE
-- ============================================================================
-- Link jobs to crews (one job → one crew for now; later can allow multiple).
-- v1 assumption: 1 active crew per job.

CREATE TABLE IF NOT EXISTS public.job_crew_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  crew_id uuid NOT NULL REFERENCES public.crews(id) ON DELETE CASCADE,

  assigned_at timestamptz DEFAULT now(),
  unassigned_at timestamptz,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_crew_assignments_job_idx
  ON public.job_crew_assignments(job_id);

CREATE INDEX IF NOT EXISTS job_crew_assignments_crew_idx
  ON public.job_crew_assignments(crew_id);

CREATE INDEX IF NOT EXISTS job_crew_assignments_active_idx
  ON public.job_crew_assignments(job_id, crew_id)
  WHERE unassigned_at IS NULL;

-- ============================================================================
-- PART 4 — UPDATED_AT TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_crews_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crews_updated_at ON public.crews;
CREATE TRIGGER trg_crews_updated_at
BEFORE UPDATE ON public.crews
FOR EACH ROW
EXECUTE FUNCTION public.set_crews_updated_at();

CREATE OR REPLACE FUNCTION public.set_crew_members_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crew_members_updated_at ON public.crew_members;
CREATE TRIGGER trg_crew_members_updated_at
BEFORE UPDATE ON public.crew_members
FOR EACH ROW
EXECUTE FUNCTION public.set_crew_members_updated_at();

CREATE OR REPLACE FUNCTION public.set_job_crew_assignments_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_job_crew_assignments_updated_at ON public.job_crew_assignments;
CREATE TRIGGER trg_job_crew_assignments_updated_at
BEFORE UPDATE ON public.job_crew_assignments
FOR EACH ROW
EXECUTE FUNCTION public.set_job_crew_assignments_updated_at();

-- ============================================================================
-- PART 5 — ROW LEVEL SECURITY FOR crews
-- ============================================================================

ALTER TABLE public.crews ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view crews in their workspace
CREATE POLICY "Users can view crews in their workspace"
  ON public.crews FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can create crews in their workspace
CREATE POLICY "Users can create crews in their workspace"
  ON public.crews FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can update crews in their workspace
CREATE POLICY "Users can update crews in their workspace"
  ON public.crews FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can delete crews in their workspace
CREATE POLICY "Users can delete crews in their workspace"
  ON public.crews FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 6 — ROW LEVEL SECURITY FOR crew_members
-- ============================================================================

ALTER TABLE public.crew_members ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view crew members in their workspace
CREATE POLICY "Users can view crew members in their workspace"
  ON public.crew_members FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can create crew members in their workspace
CREATE POLICY "Users can create crew members in their workspace"
  ON public.crew_members FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can update crew members in their workspace
CREATE POLICY "Users can update crew members in their workspace"
  ON public.crew_members FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can delete crew members in their workspace
CREATE POLICY "Users can delete crew members in their workspace"
  ON public.crew_members FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 7 — ROW LEVEL SECURITY FOR job_crew_assignments
-- ============================================================================

ALTER TABLE public.job_crew_assignments ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view job crew assignments in their workspace
CREATE POLICY "Users can view job crew assignments in their workspace"
  ON public.job_crew_assignments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_jobs j
      JOIN public.workspace_members wm ON wm.workspace_id = j.workspace_id
      WHERE j.id = job_crew_assignments.job_id
        AND wm.user_id = auth.uid()
    )
  );

-- Policy: Users can create job crew assignments in their workspace
CREATE POLICY "Users can create job crew assignments in their workspace"
  ON public.job_crew_assignments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.roofing_jobs j
      JOIN public.workspace_members wm ON wm.workspace_id = j.workspace_id
      WHERE j.id = job_crew_assignments.job_id
        AND wm.user_id = auth.uid()
    )
  );

-- Policy: Users can update job crew assignments in their workspace
CREATE POLICY "Users can update job crew assignments in their workspace"
  ON public.job_crew_assignments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_jobs j
      JOIN public.workspace_members wm ON wm.workspace_id = j.workspace_id
      WHERE j.id = job_crew_assignments.job_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.roofing_jobs j
      JOIN public.workspace_members wm ON wm.workspace_id = j.workspace_id
      WHERE j.id = job_crew_assignments.job_id
        AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 8 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crews TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crew_members TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.job_crew_assignments TO authenticated;








































