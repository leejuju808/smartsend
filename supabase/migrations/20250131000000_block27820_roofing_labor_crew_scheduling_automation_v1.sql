-- =========================================================
-- Block 27820 — SmartSend Roofing Labor & Crew Scheduling Automation v1
-- (Auto-slot jobs onto crews • Balance workload by capacity • Prevent overbooking • Show each crew's weekly money & squares)
-- =========================================================
-- 
-- This is where SmartSend steps into the production manager's brain.
-- 
-- Right now most roofing companies schedule crews like this:
-- ❌ Whiteboard
-- ❌ Group chat
-- ❌ Texting foremen
-- ❌ Guessing which crew is free
-- ❌ Overbooking
-- ❌ Forgetting small repair jobs
-- ❌ Scheduling before materials arrive
-- ❌ No idea how much "money" each crew is producing
-- 
-- SmartSend will now:
-- ✅ Automatically assign jobs to roofing crews based on availability, capacity (squares/day), 
--    material readiness, and job type — while giving the owner a full weekly schedule with profit per crew.
-- 
-- This turns SmartSend into the operations system, not just a CRM.

-- ============================================================================
-- PART 1 — CREATE roofing_crews TABLE (if not exists, use existing crews table)
-- ============================================================================
-- Note: We'll enhance the existing crews table with additional fields needed for scheduling

-- Ensure crews table has all required fields
ALTER TABLE IF EXISTS public.crews
  ADD COLUMN IF NOT EXISTS daily_capacity_squares numeric DEFAULT 25,  -- average crew
  ADD COLUMN IF NOT EXISTS crew_type text DEFAULT 'roof';              -- roof, repair, gutters

-- Ensure workspace_id exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'crews' 
    AND column_name = 'workspace_id'
  ) THEN
    ALTER TABLE public.crews ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Ensure name exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'crews' 
    AND column_name = 'name'
  ) THEN
    ALTER TABLE public.crews ADD COLUMN name text;
  END IF;
END $$;

-- Ensure foreman_name exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'crews' 
    AND column_name = 'foreman_name'
  ) THEN
    ALTER TABLE public.crews ADD COLUMN foreman_name text;
  END IF;
END $$;

-- Ensure foreman_phone exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'crews' 
    AND column_name = 'foreman_phone'
  ) THEN
    ALTER TABLE public.crews ADD COLUMN foreman_phone text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_crews_workspace_active ON public.crews(workspace_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_crews_daily_capacity ON public.crews(daily_capacity_squares) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_crews_type ON public.crews(crew_type) WHERE is_active = true;

COMMENT ON COLUMN public.crews.daily_capacity_squares IS 'Block 27820: Daily capacity in squares per day';
COMMENT ON COLUMN public.crews.crew_type IS 'Block 27820: Type of crew - roof, repair, gutters';

-- ============================================================================
-- PART 2 — CREATE roofing_crew_availability TABLE
-- ============================================================================
-- Optional for PTO / weather / blocked days

CREATE TABLE IF NOT EXISTS public.roofing_crew_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id uuid NOT NULL REFERENCES public.crews(id) ON DELETE CASCADE,
  date date NOT NULL,
  available boolean DEFAULT true,
  reason text, -- e.g., 'PTO', 'weather', 'blocked'
  created_at timestamptz DEFAULT now(),
  UNIQUE(crew_id, date)
);

CREATE INDEX IF NOT EXISTS idx_crew_availability_crew_date ON public.roofing_crew_availability(crew_id, date);
CREATE INDEX IF NOT EXISTS idx_crew_availability_date ON public.roofing_crew_availability(date) WHERE available = false;

COMMENT ON TABLE public.roofing_crew_availability IS 'Block 27820: Crew availability tracking for PTO, weather, blocked days';

-- ============================================================================
-- PART 3 — CREATE roofing_scheduled_jobs TABLE
-- ============================================================================
-- This is the core scheduling table that links jobs to crews with dates

CREATE TABLE IF NOT EXISTS public.roofing_scheduled_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  total_squares numeric NOT NULL,
  status text CHECK (
    status IN ('scheduled','in_progress','completed','delayed','canceled')
  ) DEFAULT 'scheduled',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_job ON public.roofing_scheduled_jobs(job_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_crew ON public.roofing_scheduled_jobs(crew_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_dates ON public.roofing_scheduled_jobs(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_status ON public.roofing_scheduled_jobs(status) WHERE status != 'canceled';
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_crew_date ON public.roofing_scheduled_jobs(crew_id, start_date) WHERE status != 'canceled';

COMMENT ON TABLE public.roofing_scheduled_jobs IS 'Block 27820: Scheduled jobs assigned to crews with dates and squares';

-- ============================================================================
-- PART 4 — ADD scheduling_status TO roofing_jobs TABLE
-- ============================================================================

ALTER TABLE IF EXISTS public.roofing_jobs
  ADD COLUMN IF NOT EXISTS scheduling_status text CHECK (
    scheduling_status IN (
      'not_ready',
      'materials_pending',
      'ready_to_schedule',
      'scheduled',
      'in_progress',
      'completed'
    )
  ) DEFAULT 'not_ready';

CREATE INDEX IF NOT EXISTS idx_roofing_jobs_scheduling_status ON public.roofing_jobs(scheduling_status) WHERE scheduling_status = 'ready_to_schedule';

COMMENT ON COLUMN public.roofing_jobs.scheduling_status IS 'Block 27820: Scheduling status for auto-scheduling workflow';

-- ============================================================================
-- PART 5 — CREATE VIEW: roofing_crew_load_by_week
-- ============================================================================
-- This is how SmartSend detects overbooking

CREATE OR REPLACE VIEW public.roofing_crew_load_by_week AS
SELECT
  crew_id,
  date_trunc('week', start_date)::date as week,
  sum(total_squares) as squares_scheduled
FROM public.roofing_scheduled_jobs
WHERE status != 'canceled'
GROUP BY crew_id, week;

COMMENT ON VIEW public.roofing_crew_load_by_week IS 'Block 27820: Weekly square load per crew for overbooking detection';

-- ============================================================================
-- PART 6 — CREATE VIEW: roofing_crew_weekly_money
-- ============================================================================
-- Owners LOVE seeing: "Crew A produced $32,500 this week"

CREATE OR REPLACE VIEW public.roofing_crew_weekly_money AS
SELECT
  s.crew_id,
  date_trunc('week', s.start_date)::date as week,
  sum(COALESCE(p.final_revenue, j.job_value, j.projected_job_value, 0)) as revenue,
  sum(COALESCE(p.gross_profit, 0)) as profit,
  sum(s.total_squares) as squares
FROM public.roofing_scheduled_jobs s
JOIN public.roofing_jobs j ON j.id = s.job_id
LEFT JOIN public.roofing_job_profit p ON p.job_id = j.id
WHERE s.status != 'canceled'
GROUP BY s.crew_id, week;

COMMENT ON VIEW public.roofing_crew_weekly_money IS 'Block 27820: Weekly revenue, profit, and squares per crew for owner dashboard';

-- ============================================================================
-- PART 7 — ROW LEVEL SECURITY POLICIES
-- ============================================================================

ALTER TABLE public.roofing_crew_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roofing_scheduled_jobs ENABLE ROW LEVEL SECURITY;

-- Crew availability policies
CREATE POLICY "Users can view crew availability in their workspace"
  ON public.roofing_crew_availability FOR SELECT
  USING (
    crew_id IN (
      SELECT c.id FROM public.crews c
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage crew availability in their workspace"
  ON public.roofing_crew_availability FOR ALL
  USING (
    crew_id IN (
      SELECT c.id FROM public.crews c
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE wm.user_id = auth.uid()
    )
  );

-- Scheduled jobs policies
CREATE POLICY "Users can view scheduled jobs in their workspace"
  ON public.roofing_scheduled_jobs FOR SELECT
  USING (
    job_id IN (
      SELECT j.id FROM public.roofing_jobs j
      JOIN public.workspace_members wm ON wm.workspace_id = j.workspace_id
      WHERE wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage scheduled jobs in their workspace"
  ON public.roofing_scheduled_jobs FOR ALL
  USING (
    job_id IN (
      SELECT j.id FROM public.roofing_jobs j
      JOIN public.workspace_members wm ON wm.workspace_id = j.workspace_id
      WHERE wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 8 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT ON public.roofing_crew_load_by_week TO authenticated;
GRANT SELECT ON public.roofing_crew_weekly_money TO authenticated;

-- ============================================================================
-- END OF BLOCK 27820
-- ============================================================================



































