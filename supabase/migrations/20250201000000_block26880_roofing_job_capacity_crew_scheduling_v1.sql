-- =========================================================
-- Block 26880 — SmartSend Roofing Job Capacity & Crew Scheduling Brain v1
-- (Predict crew availability • Auto-schedule jobs • Avoid overbooking • Production load forecasting)
-- =========================================================
-- 
-- This block makes SmartSend the production brain, not just sales + money.
-- 
-- Most roofers:
-- ❌ Oversell and then can't install on time
-- ❌ Don't know their true daily/weekly capacity
-- ❌ Double-book crews or waste sunny days
-- ❌ Have no way to see "Can we actually handle 3 more jobs next week?"
-- 
-- SmartSend will now answer:
-- "When can we realistically install this roof, with our current crews and weather window?"
-- 
-- This is how SmartSend becomes the end-to-end engine:
-- Leads → Money → Production.

-- ============================================================================
-- PART 1 — CREATE roofing_crews TABLE (if using separate table)
-- ============================================================================
-- Note: We'll use the existing crews table, but add daily_capacity_squares if missing

ALTER TABLE IF EXISTS public.crews
  ADD COLUMN IF NOT EXISTS daily_capacity_squares integer DEFAULT 30, -- How many squares they can install per day
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Ensure workspace_id exists (should already be there)
-- If crews table doesn't have workspace_id, we'll need to add it
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

CREATE INDEX IF NOT EXISTS idx_crews_workspace_active ON public.crews(workspace_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_crews_daily_capacity ON public.crews(daily_capacity_squares) WHERE is_active = true;

COMMENT ON COLUMN public.crews.daily_capacity_squares IS 'Block 26880: Daily capacity in squares per day';
COMMENT ON COLUMN public.crews.is_active IS 'Block 26880: Whether crew is currently active';

-- ============================================================================
-- PART 2 — ENHANCE roofing_jobs TABLE WITH PRODUCTION FIELDS
-- ============================================================================
-- Add fields for capacity-based scheduling

ALTER TABLE IF EXISTS public.roofing_jobs
  ADD COLUMN IF NOT EXISTS estimated_squares integer, -- Estimated squares for this job
  ADD COLUMN IF NOT EXISTS scheduled_start date, -- Scheduled start date (can use scheduled_start_date if exists)
  ADD COLUMN IF NOT EXISTS scheduled_end date, -- Scheduled end date (can use scheduled_end_date if exists)
  ADD COLUMN IF NOT EXISTS crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL;

-- Sync scheduled_start_date/scheduled_end_date to scheduled_start/scheduled_end if they exist
DO $$
BEGIN
  -- Copy scheduled_start_date to scheduled_start if scheduled_start_date exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'roofing_jobs' 
    AND column_name = 'scheduled_start_date'
  ) THEN
    UPDATE public.roofing_jobs
    SET scheduled_start = scheduled_start_date::date
    WHERE scheduled_start_date IS NOT NULL AND scheduled_start IS NULL;
  END IF;

  -- Copy scheduled_end_date to scheduled_end if scheduled_end_date exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'roofing_jobs' 
    AND column_name = 'scheduled_end_date'
  ) THEN
    UPDATE public.roofing_jobs
    SET scheduled_end = scheduled_end_date::date
    WHERE scheduled_end_date IS NOT NULL AND scheduled_end IS NULL;
  END IF;
END $$;

-- Use official_squares as fallback for estimated_squares
UPDATE public.roofing_jobs
SET estimated_squares = official_squares::integer
WHERE estimated_squares IS NULL AND official_squares IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_roofing_jobs_crew_scheduled ON public.roofing_jobs(crew_id, scheduled_start) WHERE crew_id IS NOT NULL AND scheduled_start IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roofing_jobs_scheduled_start ON public.roofing_jobs(scheduled_start) WHERE scheduled_start IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roofing_jobs_estimated_squares ON public.roofing_jobs(estimated_squares) WHERE estimated_squares IS NOT NULL;

COMMENT ON COLUMN public.roofing_jobs.estimated_squares IS 'Block 26880: Estimated squares for capacity planning';
COMMENT ON COLUMN public.roofing_jobs.scheduled_start IS 'Block 26880: Scheduled start date for capacity tracking';
COMMENT ON COLUMN public.roofing_jobs.scheduled_end IS 'Block 26880: Scheduled end date for capacity tracking';
COMMENT ON COLUMN public.roofing_jobs.crew_id IS 'Block 26880: Assigned crew for this job';

-- ============================================================================
-- PART 3 — CREATE VIEW: roofing_daily_capacity (Per Day, Per Crew)
-- ============================================================================
-- This gives a 30-day forecast of capacity per crew

CREATE OR REPLACE VIEW public.roofing_daily_capacity AS
SELECT
  c.id as crew_id,
  c.name as crew_name,
  c.workspace_id,
  d::date as work_date,
  COALESCE(c.daily_capacity_squares, 30) as capacity_squares,

  -- total scheduled squares on that day
  COALESCE(SUM(j.estimated_squares), 0) as scheduled_squares,

  -- remaining capacity
  COALESCE(c.daily_capacity_squares, 30) - COALESCE(SUM(j.estimated_squares), 0) as remaining_squares

FROM public.crews c
CROSS JOIN LATERAL generate_series(
  CURRENT_DATE, 
  CURRENT_DATE + INTERVAL '30 days', 
  INTERVAL '1 day'
) d
LEFT JOIN public.roofing_jobs j
  ON j.crew_id = c.id
  AND (
    -- Use scheduled_start if available, otherwise fall back to scheduled_start_date
    COALESCE(j.scheduled_start, j.scheduled_start_date::date) <= d::date
    AND (
      COALESCE(j.scheduled_end, j.scheduled_end_date::date) IS NULL 
      OR COALESCE(j.scheduled_end, j.scheduled_end_date::date) >= d::date
    )
  )
  AND j.status IN ('scheduled', 'in_progress')
WHERE c.is_active = true
GROUP BY c.id, c.name, c.workspace_id, c.daily_capacity_squares, d::date;

COMMENT ON VIEW public.roofing_daily_capacity IS 'Block 26880: Daily capacity per crew for next 30 days';

-- ============================================================================
-- PART 4 — CREATE VIEW: roofing_global_daily_capacity (All Crews Combined)
-- ============================================================================
-- Global capacity summary across all crews

CREATE OR REPLACE VIEW public.roofing_global_daily_capacity AS
SELECT
  work_date,
  workspace_id,
  SUM(capacity_squares) as total_capacity_squares,
  SUM(scheduled_squares) as total_scheduled_squares,
  SUM(remaining_squares) as total_remaining_squares,
  COUNT(DISTINCT crew_id) as active_crews_count
FROM public.roofing_daily_capacity
GROUP BY work_date, workspace_id
ORDER BY work_date;

COMMENT ON VIEW public.roofing_global_daily_capacity IS 'Block 26880: Global daily capacity summary across all crews';

-- ============================================================================
-- PART 5 — FUNCTION: Suggest Install Dates for a Job
-- ============================================================================
-- Returns available dates where a job of given size can fit

CREATE OR REPLACE FUNCTION public.suggest_install_dates(
  p_workspace_id uuid,
  p_estimated_squares integer,
  p_days_ahead integer DEFAULT 30,
  p_max_options integer DEFAULT 5
)
RETURNS TABLE (
  work_date date,
  total_capacity_squares numeric,
  total_scheduled_squares numeric,
  total_remaining_squares numeric,
  active_crews_count bigint,
  can_fit boolean
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    gdc.work_date,
    gdc.total_capacity_squares,
    gdc.total_scheduled_squares,
    gdc.total_remaining_squares,
    gdc.active_crews_count,
    (gdc.total_remaining_squares >= p_estimated_squares) as can_fit
  FROM public.roofing_global_daily_capacity gdc
  WHERE gdc.workspace_id = p_workspace_id
    AND gdc.work_date >= CURRENT_DATE
    AND gdc.work_date <= CURRENT_DATE + (p_days_ahead || ' days')::interval
    AND gdc.total_remaining_squares >= p_estimated_squares
  ORDER BY gdc.work_date ASC
  LIMIT p_max_options;
END;
$$;

COMMENT ON FUNCTION public.suggest_install_dates IS 'Block 26880: Suggest available install dates for a job of given size';

-- ============================================================================
-- PART 6 — FUNCTION: Check Crew Capacity for Date Range
-- ============================================================================
-- Check if a crew can handle a job on specific dates

CREATE OR REPLACE FUNCTION public.check_crew_capacity_for_job(
  p_crew_id uuid,
  p_start_date date,
  p_end_date date,
  p_job_squares integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_crew_capacity integer;
  v_total_scheduled numeric;
  v_remaining numeric;
  v_conflicts jsonb;
  v_result jsonb;
BEGIN
  -- Get crew capacity
  SELECT daily_capacity_squares INTO v_crew_capacity
  FROM public.crews
  WHERE id = p_crew_id AND is_active = true;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'can_fit', false,
      'reason', 'Crew not found or inactive'
    );
  END IF;
  
  -- Check each day in the range
  SELECT 
    SUM(scheduled_squares),
    MIN(remaining_squares)
  INTO v_total_scheduled, v_remaining
  FROM public.roofing_daily_capacity
  WHERE crew_id = p_crew_id
    AND work_date >= p_start_date
    AND work_date <= p_end_date;
  
  -- Check if job can fit
  IF v_remaining >= p_job_squares THEN
    RETURN jsonb_build_object(
      'can_fit', true,
      'crew_capacity', v_crew_capacity,
      'remaining_capacity', v_remaining,
      'job_squares', p_job_squares
    );
  ELSE
    RETURN jsonb_build_object(
      'can_fit', false,
      'reason', 'Insufficient capacity',
      'crew_capacity', v_crew_capacity,
      'remaining_capacity', v_remaining,
      'job_squares', p_job_squares,
      'shortfall', p_job_squares - v_remaining
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION public.check_crew_capacity_for_job IS 'Block 26880: Check if crew can handle job on given dates';

-- ============================================================================
-- PART 7 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT ON public.roofing_daily_capacity TO authenticated;
GRANT SELECT ON public.roofing_global_daily_capacity TO authenticated;
GRANT EXECUTE ON FUNCTION public.suggest_install_dates(uuid, integer, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_crew_capacity_for_job(uuid, date, date, integer) TO authenticated;

-- ============================================================================
-- END OF BLOCK 26880
-- ============================================================================



































