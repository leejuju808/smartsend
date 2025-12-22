-- ============================================================================
-- Block 262000 — SmartSend AI Dispatch, Scheduling & Route Optimization Engine v1
-- Right Crew · Right Job · Right Time · Lowest Cost
-- ============================================================================
--
-- This block turns daily scheduling from "gut feel" into math + intelligence:
-- - AI job-to-crew matching based on skills, certifications, history and load
-- - Constraint-based scheduling (daylight, materials, permits, homeowner windows)
-- - Route-aware dispatch to cut miles, drive time and fuel
-- - Storm re-scheduling mode, what‑if simulation and conflict auto‑resolution
--
-- The goal of this migration is to add the core data spine the AI engine needs:
--   1) crew_capabilities   — what each crew can actually do
--   2) job_requirements    — what each job needs to be done right
--   3) schedules           — per‑job, per‑crew date + time windows for dispatch
--
-- NOTE:
-- - This is intentionally additive/idempotent and does not break existing
--   scheduling blocks (job_schedule, crew_schedules, schedule_events, etc.).
-- - AI/route logic (functions, views, services) will build on top of these
--   tables and existing scheduling/dispatch blocks (224000, 259600, 261900).
--


-- ============================================================================
-- 1. crew_capabilities — Per‑crew skills & certifications
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.crew_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tie capabilities to tenant + crew
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  crew_id uuid NOT NULL REFERENCES public.crews(id) ON DELETE CASCADE,

  -- Examples: steep_roof, metal, commercial, repair, service, gutters, siding
  skill text NOT NULL,
  certified boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crew_capabilities_workspace_crew
  ON public.crew_capabilities(workspace_id, crew_id);

CREATE INDEX IF NOT EXISTS idx_crew_capabilities_skill
  ON public.crew_capabilities(skill);

CREATE INDEX IF NOT EXISTS idx_crew_capabilities_crew_certified
  ON public.crew_capabilities(crew_id, certified);

COMMENT ON TABLE public.crew_capabilities IS
  'Block 262000: Per-crew skills and certifications used for AI job-to-crew matching, dispatch rules, and load balancing.';


-- ============================================================================
-- 2. job_requirements — Per‑job skill + certification needs
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.job_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tie requirements to tenant + job
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,

  -- Examples mirror crew_capabilities.skill (steep_roof, metal, commercial, etc.)
  required_skill text NOT NULL,
  certification_required boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_requirements_workspace_job
  ON public.job_requirements(workspace_id, job_id);

CREATE INDEX IF NOT EXISTS idx_job_requirements_skill
  ON public.job_requirements(required_skill);

CREATE INDEX IF NOT EXISTS idx_job_requirements_job_skill
  ON public.job_requirements(job_id, required_skill);

COMMENT ON TABLE public.job_requirements IS
  'Block 262000: Per-job skill and certification requirements used for AI crew matching, scheduling constraints, and risk checks.';


-- ============================================================================
-- 3. schedules — Per‑job, per‑crew dispatch windows
-- ============================================================================
-- This table is the AI/dispatch-facing representation of "who goes where, when".
-- It complements (does not replace) existing job_schedule / crew_schedules:
-- - job_schedule       → production calendar & high-level dates
-- - crew_schedules     → multi-day, capacity-aware crew blocks
-- - schedules (this)   → day-level, time-window dispatch plan used by routing
--

CREATE TABLE IF NOT EXISTS public.schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenant scoping for fast filtering and RLS
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  -- Core relationship: a crew on a job at a specific date/time window
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  crew_id uuid NOT NULL REFERENCES public.crews(id) ON DELETE CASCADE,

  scheduled_date date NOT NULL,
  start_window time,   -- earliest planned arrival
  end_window time,     -- latest planned departure

  -- planned | in_progress | delayed | completed
  status text NOT NULL DEFAULT 'planned' CHECK (status IN (
    'planned',
    'in_progress',
    'delayed',
    'completed'
  )),

  -- Optional metadata for AI / simulator
  source text,          -- ai | manual | storm_mode | what_if

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schedules_workspace_date
  ON public.schedules(workspace_id, scheduled_date);

CREATE INDEX IF NOT EXISTS idx_schedules_workspace_crew_date
  ON public.schedules(workspace_id, crew_id, scheduled_date);

CREATE INDEX IF NOT EXISTS idx_schedules_job
  ON public.schedules(job_id);

CREATE INDEX IF NOT EXISTS idx_schedules_status_date
  ON public.schedules(status, scheduled_date);

COMMENT ON TABLE public.schedules IS
  'Block 262000: Per-job, per-crew dispatch schedule with daily time windows used for AI routing, storm re-scheduling, and what-if simulation.';


-- updated_at trigger for schedules (reuses shared helper if present)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'update_updated_at_column'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_schedules_updated_at'
  ) THEN
    CREATE TRIGGER trg_schedules_updated_at
    BEFORE UPDATE ON public.schedules
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END;
$$;


-- ============================================================================
-- 4. ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS
ALTER TABLE public.crew_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;


-- 4.1 crew_capabilities RLS
-- Workspace members can see/update capabilities for crews in their workspace.

DROP POLICY IF EXISTS "crew_capabilities_workspace_member" ON public.crew_capabilities;
CREATE POLICY "crew_capabilities_workspace_member" ON public.crew_capabilities
  FOR ALL USING (
    workspace_id IS NULL OR EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = crew_capabilities.workspace_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IS NULL OR EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = crew_capabilities.workspace_id
        AND wm.user_id = auth.uid()
    )
  );


-- 4.2 job_requirements RLS
-- Team members on the job's team can see/update requirements.

DROP POLICY IF EXISTS "job_requirements_team_member" ON public.job_requirements;
CREATE POLICY "job_requirements_team_member" ON public.job_requirements
  FOR ALL USING (
    EXISTS (
      SELECT 1
      FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = job_requirements.job_id
        AND tm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = job_requirements.job_id
        AND tm.user_id = auth.uid()
    )
  );


-- 4.3 schedules RLS
-- Workspace members can see/update dispatch schedules in their workspace.

DROP POLICY IF EXISTS "schedules_workspace_member_read" ON public.schedules;
CREATE POLICY "schedules_workspace_member_read" ON public.schedules
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = schedules.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "schedules_workspace_member_write" ON public.schedules;
CREATE POLICY "schedules_workspace_member_write" ON public.schedules
  FOR ALL USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = schedules.workspace_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = schedules.workspace_id
        AND wm.user_id = auth.uid()
    )
  );


-- 4.4 Service role full access

DROP POLICY IF EXISTS "crew_capabilities_service_role" ON public.crew_capabilities;
CREATE POLICY "crew_capabilities_service_role" ON public.crew_capabilities
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "job_requirements_service_role" ON public.job_requirements;
CREATE POLICY "job_requirements_service_role" ON public.job_requirements
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "schedules_service_role" ON public.schedules;
CREATE POLICY "schedules_service_role" ON public.schedules
  FOR ALL TO service_role USING (true) WITH CHECK (true);














