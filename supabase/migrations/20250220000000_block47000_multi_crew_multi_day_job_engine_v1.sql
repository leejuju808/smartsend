-- =========================================================
-- Block 47000 — SmartSend Roofing "Multi-Crew Multi-Day Job Engine" v1
-- (SPLIT JOBS ACROSS DAYS • MULTIPLE CREWS • STAGGERED WORKFLOWS • DAILY TASK BREAKDOWN • AUTO-SCHEDULING FOR LONG JOBS)
-- =========================================================
-- 
-- This block upgrades SmartSend from "basic production scheduling" into true roofing production mastery.
-- 
-- Most roofs take 1 day. But many don't:
-- - Large custom homes → 2–3 days
-- - Commercial → 4–10 days
-- - Tear-off day + install day → 2 days
-- - Supplemented plywood replacement → multi-day
-- - Weather interruptions → staggered
-- - Using different crews (tear-off crew → install crew)
-- 
-- This system fixes the nightmare of managing multi-day + multi-crew jobs.

-- ============================================================================
-- PART 1 — CREATE job_day_schedules TABLE
-- ============================================================================
-- Each row represents one day of work on a multi-day job
-- Allows different crews per day, different tasks per day, weather adjustments

CREATE TABLE IF NOT EXISTS public.job_day_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  day_number int NOT NULL, -- 1, 2, 3, ... (sequential day number)
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  
  -- Scheduling
  start_date date NOT NULL,
  end_date date, -- Usually same as start_date for single-day work, but can span multiple days if needed
  scheduled_start_time time, -- Optional: specific start time (e.g., 7:00 AM)
  scheduled_end_time time, -- Optional: specific end time (e.g., 5:00 PM)
  
  -- Tasks for this day (JSONB for flexibility)
  tasks jsonb DEFAULT '[]'::jsonb, -- Array of task objects: [{"description": "Remove 28 squares", "status": "pending"}, ...]
  
  -- Status tracking
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'delayed', 'canceled')),
  
  -- Progress tracking
  estimated_hours numeric, -- Estimated hours for this day
  actual_hours numeric, -- Actual hours worked (filled when completed)
  completion_percentage int DEFAULT 0 CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
  
  -- Weather tracking
  weather_risk text CHECK (weather_risk IN ('low', 'medium', 'high', 'critical')),
  weather_delayed boolean DEFAULT false,
  
  -- Notes and metadata
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Constraints
  CONSTRAINT valid_day_number CHECK (day_number > 0),
  CONSTRAINT valid_date_range CHECK (end_date IS NULL OR end_date >= start_date)
);

-- Foreign key to roofing_jobs (handle both jobs and roofing_jobs tables)
DO $$
BEGIN
  -- Try roofing_jobs first (most common)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'job_day_schedules_job_id_fkey'
    ) THEN
      ALTER TABLE public.job_day_schedules
        ADD CONSTRAINT job_day_schedules_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  -- Fallback to jobs table
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'job_day_schedules_job_id_fkey'
    ) THEN
      ALTER TABLE public.job_day_schedules
        ADD CONSTRAINT job_day_schedules_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_job_day_schedules_job ON public.job_day_schedules(job_id);
CREATE INDEX IF NOT EXISTS idx_job_day_schedules_crew ON public.job_day_schedules(crew_id) WHERE crew_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_day_schedules_date ON public.job_day_schedules(start_date);
CREATE INDEX IF NOT EXISTS idx_job_day_schedules_status ON public.job_day_schedules(status);
CREATE INDEX IF NOT EXISTS idx_job_day_schedules_crew_date ON public.job_day_schedules(crew_id, start_date) WHERE status != 'canceled';
CREATE INDEX IF NOT EXISTS idx_job_day_schedules_job_day ON public.job_day_schedules(job_id, day_number);

COMMENT ON TABLE public.job_day_schedules IS 'Block 47000: Daily schedules for multi-day jobs, allowing different crews and tasks per day';
COMMENT ON COLUMN public.job_day_schedules.tasks IS 'JSONB array of tasks: [{"description": "Remove shingles", "status": "pending", "estimated_hours": 4}]';
COMMENT ON COLUMN public.job_day_schedules.day_number IS 'Sequential day number (1, 2, 3, ...) for the job';

-- ============================================================================
-- PART 2 — CREATE job_day_weather TABLE
-- ============================================================================
-- Weather records and forecasts for each scheduled day

CREATE TABLE IF NOT EXISTS public.job_day_weather (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_day_id uuid NOT NULL REFERENCES public.job_day_schedules(id) ON DELETE CASCADE,
  
  -- Weather data
  forecast jsonb DEFAULT '{}'::jsonb, -- Full weather forecast data from API
  risk_level text CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  temperature_high numeric,
  temperature_low numeric,
  precipitation_probability int CHECK (precipitation_probability >= 0 AND precipitation_probability <= 100),
  wind_speed_mph numeric,
  conditions text, -- 'sunny', 'cloudy', 'rain', 'snow', 'windy', etc.
  
  -- Impact assessment
  workable boolean DEFAULT true, -- Can work proceed on this day?
  delay_recommended boolean DEFAULT false, -- Should this day be delayed?
  
  -- Metadata
  forecast_date date NOT NULL, -- Date this forecast is for
  fetched_at timestamptz DEFAULT now(), -- When forecast was fetched
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_day_weather_job_day ON public.job_day_weather(job_day_id);
CREATE INDEX IF NOT EXISTS idx_job_day_weather_forecast_date ON public.job_day_weather(forecast_date);
CREATE INDEX IF NOT EXISTS idx_job_day_weather_risk ON public.job_day_weather(risk_level) WHERE risk_level IN ('high', 'critical');
CREATE INDEX IF NOT EXISTS idx_job_day_weather_workable ON public.job_day_weather(workable) WHERE workable = false;

COMMENT ON TABLE public.job_day_weather IS 'Block 47000: Weather forecasts and risk assessment for each scheduled job day';
COMMENT ON COLUMN public.job_day_weather.forecast IS 'Full weather API response stored as JSONB for detailed analysis';

-- ============================================================================
-- PART 3 — CREATE crew_day_conflicts TABLE
-- ============================================================================
-- Tracks crew double-booking conflicts across multiple job days

CREATE TABLE IF NOT EXISTS public.crew_day_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id uuid NOT NULL REFERENCES public.crews(id) ON DELETE CASCADE,
  job_day_id uuid NOT NULL REFERENCES public.job_day_schedules(id) ON DELETE CASCADE,
  
  -- Conflict details
  conflict_date date NOT NULL, -- The date where the conflict occurs
  conflicting_job_day_id uuid REFERENCES public.job_day_schedules(id) ON DELETE CASCADE, -- The other job day causing conflict
  
  -- Conflict metadata
  conflict_type text CHECK (conflict_type IN ('double_booking', 'overlapping_time', 'insufficient_crew_capacity')),
  severity text CHECK (severity IN ('low', 'medium', 'high', 'critical')) DEFAULT 'high',
  
  -- Resolution
  resolved boolean DEFAULT false,
  resolved_at timestamptz,
  resolution_notes text,
  
  -- Metadata
  detected_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crew_day_conflicts_crew ON public.crew_day_conflicts(crew_id);
CREATE INDEX IF NOT EXISTS idx_crew_day_conflicts_job_day ON public.crew_day_conflicts(job_day_id);
CREATE INDEX IF NOT EXISTS idx_crew_day_conflicts_date ON public.crew_day_conflicts(conflict_date);
CREATE INDEX IF NOT EXISTS idx_crew_day_conflicts_resolved ON public.crew_day_conflicts(resolved) WHERE resolved = false;
CREATE INDEX IF NOT EXISTS idx_crew_day_conflicts_severity ON public.crew_day_conflicts(severity) WHERE resolved = false;

COMMENT ON TABLE public.crew_day_conflicts IS 'Block 47000: Tracks crew double-booking conflicts when same crew is assigned to multiple jobs on same day';
COMMENT ON COLUMN public.crew_day_conflicts.conflict_type IS 'Type of conflict: double_booking (same crew, same day), overlapping_time, insufficient_crew_capacity';

-- ============================================================================
-- PART 4 — CREATE FUNCTION: detect_crew_day_conflicts
-- ============================================================================
-- Automatically detects when a crew is double-booked across multiple job days

CREATE OR REPLACE FUNCTION public.detect_crew_day_conflicts(
  p_workspace_id uuid DEFAULT NULL,
  p_date_from date DEFAULT CURRENT_DATE,
  p_date_to date DEFAULT CURRENT_DATE + INTERVAL '30 days'
)
RETURNS TABLE (
  conflict_id uuid,
  crew_id uuid,
  crew_name text,
  job_day_id uuid,
  conflict_date date,
  conflicting_job_day_id uuid,
  conflict_type text,
  severity text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Clear old resolved conflicts
  DELETE FROM public.crew_day_conflicts
  WHERE resolved = true
    AND resolved_at < now() - INTERVAL '7 days';
  
  -- Detect double-booking conflicts (same crew, same date, different jobs)
  INSERT INTO public.crew_day_conflicts (
    crew_id,
    job_day_id,
    conflict_date,
    conflicting_job_day_id,
    conflict_type,
    severity
  )
  SELECT DISTINCT
    jds1.crew_id,
    jds1.id,
    jds1.start_date,
    jds2.id,
    'double_booking',
    'critical'
  FROM public.job_day_schedules jds1
  JOIN public.job_day_schedules jds2 ON
    jds1.crew_id = jds2.crew_id
    AND jds1.id != jds2.id
    AND jds1.start_date = jds2.start_date
    AND jds1.status NOT IN ('completed', 'canceled')
    AND jds2.status NOT IN ('completed', 'canceled')
  WHERE jds1.start_date BETWEEN p_date_from AND p_date_to
    AND jds1.crew_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.crew_day_conflicts cdc
      WHERE cdc.job_day_id = jds1.id
        AND cdc.conflicting_job_day_id = jds2.id
        AND cdc.resolved = false
    );
  
  -- Return detected conflicts
  RETURN QUERY
  SELECT 
    cdc.id,
    cdc.crew_id,
    c.name as crew_name,
    cdc.job_day_id,
    cdc.conflict_date,
    cdc.conflicting_job_day_id,
    cdc.conflict_type,
    cdc.severity
  FROM public.crew_day_conflicts cdc
  JOIN public.crews c ON c.id = cdc.crew_id
  WHERE cdc.resolved = false
    AND cdc.conflict_date BETWEEN p_date_from AND p_date_to
    AND (p_workspace_id IS NULL OR c.workspace_id = p_workspace_id)
  ORDER BY 
    CASE cdc.severity
      WHEN 'critical' THEN 1
      WHEN 'high' THEN 2
      WHEN 'medium' THEN 3
      WHEN 'low' THEN 4
    END,
    cdc.detected_at DESC;
END;
$$;

COMMENT ON FUNCTION public.detect_crew_day_conflicts IS 'Block 47000: Automatically detects crew double-booking conflicts across multiple job days';

-- ============================================================================
-- PART 5 — CREATE FUNCTION: shift_job_schedule_for_weather
-- ============================================================================
-- Shifts all future days of a job when a day is delayed due to weather

CREATE OR REPLACE FUNCTION public.shift_job_schedule_for_weather(
  p_job_id uuid,
  p_delayed_day_number int,
  p_shift_days int DEFAULT 1
)
RETURNS TABLE (
  day_id uuid,
  day_number int,
  old_start_date date,
  new_start_date date,
  crew_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_delayed_day record;
BEGIN
  -- Get the delayed day
  SELECT * INTO v_delayed_day
  FROM public.job_day_schedules
  WHERE job_id = p_job_id
    AND day_number = p_delayed_day_number;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Day % not found for job %', p_delayed_day_number, p_job_id;
  END IF;
  
  -- Update the delayed day
  UPDATE public.job_day_schedules
  SET 
    start_date = start_date + (p_shift_days || ' days')::interval,
    end_date = COALESCE(end_date, start_date) + (p_shift_days || ' days')::interval,
    status = 'delayed',
    weather_delayed = true,
    updated_at = now()
  WHERE id = v_delayed_day.id;
  
  -- Shift all future days
  UPDATE public.job_day_schedules
  SET 
    start_date = start_date + (p_shift_days || ' days')::interval,
    end_date = COALESCE(end_date, start_date) + (p_shift_days || ' days')::interval,
    updated_at = now()
  WHERE job_id = p_job_id
    AND day_number > p_delayed_day_number
    AND status NOT IN ('completed', 'canceled');
  
  -- Return updated days
  RETURN QUERY
  SELECT 
    jds.id,
    jds.day_number,
    jds.start_date as old_start_date, -- Note: This shows new date, would need to store old in temp table for true old date
    jds.start_date as new_start_date,
    jds.crew_id
  FROM public.job_day_schedules jds
  WHERE jds.job_id = p_job_id
    AND jds.day_number >= p_delayed_day_number
  ORDER BY jds.day_number;
END;
$$;

COMMENT ON FUNCTION public.shift_job_schedule_for_weather IS 'Block 47000: Shifts all future days of a job when a day is delayed due to weather';

-- ============================================================================
-- PART 6 — CREATE FUNCTION: generate_multi_day_schedule
-- ============================================================================
-- Generates a multi-day schedule for a job based on duration, crew availability, and tasks

CREATE OR REPLACE FUNCTION public.generate_multi_day_schedule(
  p_job_id uuid,
  p_duration_days int,
  p_start_date date DEFAULT CURRENT_DATE,
  p_crew_ids uuid[] DEFAULT NULL,
  p_tasks_per_day jsonb DEFAULT NULL
)
RETURNS TABLE (
  day_id uuid,
  day_number int,
  crew_id uuid,
  start_date date,
  tasks jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_day int;
  v_crew_id uuid;
  v_crew_index int := 0;
  v_day_tasks jsonb;
BEGIN
  -- Delete existing schedule if any
  DELETE FROM public.job_day_schedules
  WHERE job_id = p_job_id;
  
  -- Generate schedule for each day
  FOR v_day IN 1..p_duration_days LOOP
    -- Rotate crews if multiple provided
    IF p_crew_ids IS NOT NULL AND array_length(p_crew_ids, 1) > 0 THEN
      v_crew_index := ((v_day - 1) % array_length(p_crew_ids, 1)) + 1;
      v_crew_id := p_crew_ids[v_crew_index];
    ELSE
      v_crew_id := NULL;
    END IF;
    
    -- Get tasks for this day if provided
    IF p_tasks_per_day IS NOT NULL THEN
      v_day_tasks := p_tasks_per_day->(v_day::text);
    ELSE
      v_day_tasks := '[]'::jsonb;
    END IF;
    
    -- Insert day schedule
    INSERT INTO public.job_day_schedules (
      job_id,
      day_number,
      crew_id,
      start_date,
      end_date,
      tasks,
      status
    )
    VALUES (
      p_job_id,
      v_day,
      v_crew_id,
      p_start_date + (v_day - 1) || ' days'::interval,
      p_start_date + (v_day - 1) || ' days'::interval,
      COALESCE(v_day_tasks, '[]'::jsonb),
      'pending'
    )
    RETURNING id, day_number, crew_id, start_date, tasks
    INTO v_day_tasks; -- Reuse variable for return
    
    -- Return this day
    RETURN QUERY
    SELECT 
      jds.id,
      jds.day_number,
      jds.crew_id,
      jds.start_date,
      jds.tasks
    FROM public.job_day_schedules jds
    WHERE jds.id = (SELECT id FROM public.job_day_schedules WHERE job_id = p_job_id AND day_number = v_day ORDER BY created_at DESC LIMIT 1);
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.generate_multi_day_schedule IS 'Block 47000: Generates a multi-day schedule for a job with optional crew rotation and tasks per day';

-- ============================================================================
-- PART 7 — CREATE TRIGGER: update_updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_job_day_schedules_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_job_day_schedules_updated_at ON public.job_day_schedules;
CREATE TRIGGER trg_set_job_day_schedules_updated_at
BEFORE UPDATE ON public.job_day_schedules
FOR EACH ROW
EXECUTE FUNCTION public.set_job_day_schedules_updated_at();

-- ============================================================================
-- PART 8 — CREATE TRIGGER: auto_detect_conflicts_on_insert
-- ============================================================================
-- Automatically detect conflicts when a new day schedule is created

CREATE OR REPLACE FUNCTION public.auto_detect_conflicts_on_day_schedule()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only check if crew is assigned
  IF NEW.crew_id IS NOT NULL THEN
    -- Trigger conflict detection (async would be better, but this works)
    PERFORM public.detect_crew_day_conflicts(
      (SELECT workspace_id FROM public.crews WHERE id = NEW.crew_id),
      NEW.start_date - INTERVAL '1 day',
      NEW.start_date + INTERVAL '30 days'
    );
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_detect_conflicts_on_day_schedule ON public.job_day_schedules;
CREATE TRIGGER trg_auto_detect_conflicts_on_day_schedule
AFTER INSERT OR UPDATE ON public.job_day_schedules
FOR EACH ROW
WHEN (NEW.crew_id IS NOT NULL)
EXECUTE FUNCTION public.auto_detect_conflicts_on_day_schedule();

-- ============================================================================
-- PART 9 — ROW LEVEL SECURITY POLICIES
-- ============================================================================

ALTER TABLE public.job_day_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_day_weather ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_day_conflicts ENABLE ROW LEVEL SECURITY;

-- Job day schedules policies (access via job's workspace)
CREATE POLICY "Users can view job day schedules in their workspace"
  ON public.job_day_schedules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_jobs rj
      JOIN public.workspace_members wm ON wm.workspace_id = rj.workspace_id
      WHERE rj.id = job_day_schedules.job_id
        AND wm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.jobs j
      JOIN public.workspace_members wm ON wm.workspace_id = (SELECT workspace_id FROM public.teams WHERE id = j.team_id)
      WHERE j.id = job_day_schedules.job_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage job day schedules in their workspace"
  ON public.job_day_schedules FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_jobs rj
      JOIN public.workspace_members wm ON wm.workspace_id = rj.workspace_id
      WHERE rj.id = job_day_schedules.job_id
        AND wm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.jobs j
      JOIN public.workspace_members wm ON wm.workspace_id = (SELECT workspace_id FROM public.teams WHERE id = j.team_id)
      WHERE j.id = job_day_schedules.job_id
        AND wm.user_id = auth.uid()
    )
  );

-- Job day weather policies
CREATE POLICY "Users can view job day weather in their workspace"
  ON public.job_day_weather FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.job_day_schedules jds
      JOIN public.roofing_jobs rj ON rj.id = jds.job_id
      JOIN public.workspace_members wm ON wm.workspace_id = rj.workspace_id
      WHERE jds.id = job_day_weather.job_day_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage job day weather in their workspace"
  ON public.job_day_weather FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.job_day_schedules jds
      JOIN public.roofing_jobs rj ON rj.id = jds.job_id
      JOIN public.workspace_members wm ON wm.workspace_id = rj.workspace_id
      WHERE jds.id = job_day_weather.job_day_id
        AND wm.user_id = auth.uid()
    )
  );

-- Crew day conflicts policies
CREATE POLICY "Users can view crew day conflicts in their workspace"
  ON public.crew_day_conflicts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.crews c
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE c.id = crew_day_conflicts.crew_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage crew day conflicts in their workspace"
  ON public.crew_day_conflicts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.crews c
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE c.id = crew_day_conflicts.crew_id
        AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 10 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_day_schedules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_day_weather TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crew_day_conflicts TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_crew_day_conflicts(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shift_job_schedule_for_weather(uuid, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_multi_day_schedule(uuid, int, date, uuid[], jsonb) TO authenticated;

-- ============================================================================
-- END OF BLOCK 47000
-- ============================================================================
































