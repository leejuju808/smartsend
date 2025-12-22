-- =========================================================
-- Block 22390 — SmartSend Roofing Crew Capacity Engine v1
-- (Daily Labor Capacity + Overbooking Prevention)
-- =========================================================
-- 
-- This block introduces true operational intelligence into SmartSend.
-- It prevents overbooking, overlapping jobs, and impossible weekly workloads.
-- This is a USP feature that makes SmartSend look like elite construction software.

-- ============================================================================
-- PART 1 — ADD CAPACITY FIELDS TO crews TABLE
-- ============================================================================
-- daily_capacity: How many jobs a crew can do per day (default 1.0 = normal-sized roof)
-- notes: Optional notes about the crew

ALTER TABLE IF EXISTS public.crews
  ADD COLUMN IF NOT EXISTS daily_capacity numeric DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS notes text;

-- ============================================================================
-- PART 2 — ADD LABOR EFFORT TO roofing_jobs TABLE
-- ============================================================================
-- labor_effort: How "heavy" the job is (1.0 = full roof, 0.5 = small repair, 2.0 = large complex job)
-- scheduled_duration_days: Number of days the job takes (for calculating daily load)

ALTER TABLE IF EXISTS public.roofing_jobs
  ADD COLUMN IF NOT EXISTS labor_effort numeric DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS scheduled_duration_days integer DEFAULT 1;

-- Update scheduled_duration_days based on start/end dates if not set
UPDATE public.roofing_jobs
SET scheduled_duration_days = GREATEST(
  1,
  COALESCE(
    (scheduled_end_date - scheduled_start_date)::integer + 1,
    1
  )
)
WHERE scheduled_start_date IS NOT NULL
  AND scheduled_duration_days = 1;

-- ============================================================================
-- PART 3 — CREATE VIEW: crew_daily_schedule_load
-- ============================================================================
-- This view expands each job assignment into individual working days
-- with the labor_effort distributed across those days.

CREATE OR REPLACE VIEW public.crew_daily_schedule_load AS
SELECT
  c.id AS crew_id,
  j.id AS job_id,
  j.scheduled_start_date,
  j.scheduled_end_date,
  j.labor_effort,
  d.day::date AS working_day
FROM public.crews c
JOIN public.job_crew_assignments jca ON jca.crew_id = c.id
JOIN public.roofing_jobs j ON j.id = jca.job_id
CROSS JOIN LATERAL (
  SELECT generate_series(
    j.scheduled_start_date,
    COALESCE(j.scheduled_end_date, j.scheduled_start_date),
    interval '1 day'
  ) AS day
) d
WHERE jca.unassigned_at IS NULL
  AND j.scheduled_start_date IS NOT NULL
  AND j.status IN ('scheduled', 'in_progress');

-- ============================================================================
-- PART 4 — CREATE VIEW: crew_capacity_load
-- ============================================================================
-- This view aggregates daily loads per crew per day.
-- Shows total_load = sum of labor_effort for all jobs on that day.

CREATE OR REPLACE VIEW public.crew_capacity_load AS
SELECT
  crew_id,
  working_day,
  SUM(labor_effort) AS total_load
FROM public.crew_daily_schedule_load
GROUP BY crew_id, working_day;

-- ============================================================================
-- PART 5 — CREATE FUNCTION: check_crew_capacity
-- ============================================================================
-- Helper function to check if a crew can handle a job on specific dates.
-- Returns: ok boolean, conflicts array

CREATE OR REPLACE FUNCTION public.check_crew_capacity(
  p_crew_id uuid,
  p_job_id uuid,
  p_start_date date,
  p_end_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_crew_capacity numeric;
  v_job_effort numeric;
  v_end_date date;
  v_conflicts jsonb := '[]'::jsonb;
  v_day date;
  v_current_load numeric;
  v_conflict jsonb;
BEGIN
  -- Get crew capacity
  SELECT COALESCE(daily_capacity, 1.0) INTO v_crew_capacity
  FROM public.crews
  WHERE id = p_crew_id;
  
  IF v_crew_capacity IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Crew not found');
  END IF;
  
  -- Get job labor effort
  SELECT COALESCE(labor_effort, 1.0) INTO v_job_effort
  FROM public.roofing_jobs
  WHERE id = p_job_id;
  
  IF v_job_effort IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Job not found');
  END IF;
  
  -- Determine end date
  v_end_date := COALESCE(p_end_date, p_start_date);
  
  -- Check each day in the range
  v_day := p_start_date;
  WHILE v_day <= v_end_date LOOP
    -- Get current load for this day (excluding the job we're checking if it's already scheduled)
    SELECT COALESCE(SUM(cdl.labor_effort), 0) INTO v_current_load
    FROM public.crew_daily_schedule_load cdl
    WHERE cdl.crew_id = p_crew_id
      AND cdl.working_day = v_day
      AND cdl.job_id != p_job_id;
    
    -- Check if adding this job would exceed capacity
    IF (v_current_load + v_job_effort) > v_crew_capacity THEN
      v_conflict := jsonb_build_object(
        'day', v_day::text,
        'currentLoad', v_current_load,
        'jobEffort', v_job_effort,
        'capacity', v_crew_capacity,
        'totalAfter', v_current_load + v_job_effort
      );
      v_conflicts := v_conflicts || jsonb_build_array(v_conflict);
    END IF;
    
    v_day := v_day + interval '1 day';
  END LOOP;
  
  RETURN jsonb_build_object(
    'ok', jsonb_array_length(v_conflicts) = 0,
    'conflicts', v_conflicts,
    'capacity', v_crew_capacity,
    'jobEffort', v_job_effort
  );
END;
$$;

COMMENT ON FUNCTION public.check_crew_capacity IS 'Checks if a crew can handle a job on specific dates. Returns ok status and conflicts array.';

-- ============================================================================
-- PART 6 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT ON public.crew_daily_schedule_load TO authenticated;
GRANT SELECT ON public.crew_capacity_load TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_crew_capacity(uuid, uuid, date, date) TO authenticated;

-- ============================================================================
-- PART 7 — INDEXES FOR PERFORMANCE
-- ============================================================================

-- Index on job_crew_assignments for active assignments
CREATE INDEX IF NOT EXISTS idx_job_crew_assignments_active_crew
  ON public.job_crew_assignments(crew_id, job_id)
  WHERE unassigned_at IS NULL;

-- Index on roofing_jobs for scheduled jobs
CREATE INDEX IF NOT EXISTS idx_roofing_jobs_scheduled_dates
  ON public.roofing_jobs(scheduled_start_date, scheduled_end_date)
  WHERE scheduled_start_date IS NOT NULL;








































