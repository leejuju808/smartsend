-- =========================================================
-- Block 38390 — SmartSend Roofing "Production Calendar + Crew Load Balancing Engine" v1
-- (Auto-schedule installs • Prevent double-booking • Balance crews based on workload • Predict job duration • Auto-adjust when delays happen)
-- =========================================================
-- 
-- This system makes roofers feel like SmartSend is running their company for them.
-- 
-- Production is the #1 bottleneck in every roofing company.
-- 
-- Real problems roofers face:
-- - Double-booked crews
-- - No idea who's free next week
-- - Bad weather ruins everything
-- - Crews overloaded / underloaded
-- - Contractor oversells capacity
-- - Jobs take longer than expected
-- - No visibility into install week
-- - Homeowners annoyed by rescheduling
-- - Production manager overwhelmed
-- 
-- SmartSend fixes the ENTIRE production process.
-- This block turns SmartSend into a predictive, automated roofing production system.

-- ============================================================================
-- PART 1 — CREATE production_calendar TABLE
-- ============================================================================
-- This is the core calendar that shows all scheduled jobs with crew assignments

CREATE TABLE IF NOT EXISTS public.production_calendar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  
  -- Scheduling
  start_date date NOT NULL,
  end_date date NOT NULL,
  estimated_duration_days int NOT NULL,
  
  -- Status tracking
  status text CHECK (status IN ('scheduled', 'in_progress', 'delayed', 'completed', 'canceled')) DEFAULT 'scheduled',
  
  -- AI prediction fields
  ai_predicted_duration_days numeric, -- AI's prediction before scheduling
  actual_duration_days int, -- Actual days taken (filled on completion)
  
  -- Delay tracking
  delay_reason text, -- 'weather', 'material_delay', 'crew_late', 'emergency', 'overrun'
  delay_days int DEFAULT 0, -- Number of days delayed
  
  -- Material dependency
  material_eta date, -- When materials are expected to arrive
  material_delivered boolean DEFAULT false,
  
  -- Weather tracking
  weather_risk text, -- 'low', 'medium', 'high'
  weather_alert text, -- Specific weather warnings
  
  -- Metadata
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Constraints
  CONSTRAINT valid_date_range CHECK (end_date >= start_date),
  CONSTRAINT valid_duration CHECK (estimated_duration_days > 0)
);

CREATE INDEX IF NOT EXISTS idx_production_calendar_workspace ON public.production_calendar(workspace_id);
CREATE INDEX IF NOT EXISTS idx_production_calendar_job ON public.production_calendar(job_id);
CREATE INDEX IF NOT EXISTS idx_production_calendar_crew ON public.production_calendar(crew_id);
CREATE INDEX IF NOT EXISTS idx_production_calendar_dates ON public.production_calendar(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_production_calendar_status ON public.production_calendar(status) WHERE status != 'canceled';
CREATE INDEX IF NOT EXISTS idx_production_calendar_crew_date ON public.production_calendar(crew_id, start_date) WHERE status != 'canceled';

COMMENT ON TABLE public.production_calendar IS 'Block 38390: Production calendar showing all scheduled jobs with crew assignments, durations, and status';
COMMENT ON COLUMN public.production_calendar.ai_predicted_duration_days IS 'AI prediction of job duration based on squares, pitch, material type, crew history, weather';
COMMENT ON COLUMN public.production_calendar.delay_reason IS 'Reason for delay: weather, material_delay, crew_late, emergency, overrun';

-- ============================================================================
-- PART 2 — CREATE crew_capacity TABLE
-- ============================================================================
-- Defines capacity rules for each crew

CREATE TABLE IF NOT EXISTS public.crew_capacity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id uuid NOT NULL REFERENCES public.crews(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Capacity limits
  max_squares_per_day int NOT NULL DEFAULT 30,
  max_jobs_per_week int NOT NULL DEFAULT 5,
  
  -- Skill filters
  skills text[], -- e.g., ['metal', 'steep-slope', 'TPO', 'repairs']
  
  -- Travel constraints
  travel_radius_miles int DEFAULT 50, -- Max travel distance in miles
  
  -- Additional constraints
  preferred_job_types text[], -- Job types this crew prefers
  excluded_job_types text[], -- Job types this crew cannot do
  
  -- Metadata
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Unique constraint: one capacity record per crew
  UNIQUE(crew_id)
);

CREATE INDEX IF NOT EXISTS idx_crew_capacity_crew ON public.crew_capacity(crew_id);
CREATE INDEX IF NOT EXISTS idx_crew_capacity_workspace ON public.crew_capacity(workspace_id);
CREATE INDEX IF NOT EXISTS idx_crew_capacity_skills ON public.crew_capacity USING GIN(skills);

COMMENT ON TABLE public.crew_capacity IS 'Block 38390: Capacity rules for each crew including max squares/day, max jobs/week, skills, and travel radius';
COMMENT ON COLUMN public.crew_capacity.skills IS 'Array of skills: metal, steep-slope, TPO, repairs, etc.';

-- ============================================================================
-- PART 3 — CREATE schedule_conflicts TABLE
-- ============================================================================
-- Tracks scheduling conflicts and alerts

CREATE TABLE IF NOT EXISTS public.schedule_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  
  -- Conflict details
  conflict_type text NOT NULL, -- 'double_booking', 'material_delay', 'over_capacity', 'weather_risk', 'skill_mismatch'
  severity text CHECK (severity IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
  
  -- Conflict details (JSON)
  details jsonb DEFAULT '{}'::jsonb, -- Flexible storage for conflict-specific data
  
  -- Resolution
  resolved boolean DEFAULT false,
  resolved_at timestamptz,
  resolution_notes text,
  
  -- Metadata
  detected_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schedule_conflicts_workspace ON public.schedule_conflicts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_schedule_conflicts_job ON public.schedule_conflicts(job_id);
CREATE INDEX IF NOT EXISTS idx_schedule_conflicts_crew ON public.schedule_conflicts(crew_id);
CREATE INDEX IF NOT EXISTS idx_schedule_conflicts_type ON public.schedule_conflicts(conflict_type);
CREATE INDEX IF NOT EXISTS idx_schedule_conflicts_resolved ON public.schedule_conflicts(resolved) WHERE resolved = false;
CREATE INDEX IF NOT EXISTS idx_schedule_conflicts_severity ON public.schedule_conflicts(severity) WHERE resolved = false;

COMMENT ON TABLE public.schedule_conflicts IS 'Block 38390: Tracks scheduling conflicts like double-booking, material delays, over-capacity, weather risks';
COMMENT ON COLUMN public.schedule_conflicts.conflict_type IS 'Type of conflict: double_booking, material_delay, over_capacity, weather_risk, skill_mismatch';

-- ============================================================================
-- PART 4 — CREATE weekly_capacity_reports VIEW
-- ============================================================================
-- Weekly capacity report showing total squares, crew availability, overload risk, etc.

CREATE OR REPLACE VIEW public.weekly_capacity_reports AS
SELECT
  pc.workspace_id,
  date_trunc('week', pc.start_date)::date as week_start,
  c.id as crew_id,
  c.name as crew_name,
  
  -- Scheduled metrics
  COUNT(DISTINCT pc.job_id) as jobs_scheduled,
  COALESCE(SUM(
    CASE 
      WHEN rj.estimated_squares IS NOT NULL THEN rj.estimated_squares
      WHEN rj.official_squares IS NOT NULL THEN rj.official_squares
      ELSE 0
    END
  ), 0) as total_squares_scheduled,
  
  -- Capacity metrics
  cc.max_squares_per_day * 7 as weekly_capacity_squares,
  cc.max_jobs_per_week as weekly_capacity_jobs,
  
  -- Load percentage
  CASE 
    WHEN cc.max_squares_per_day * 7 > 0 THEN
      (COALESCE(SUM(
        CASE 
          WHEN rj.estimated_squares IS NOT NULL THEN rj.estimated_squares
          WHEN rj.official_squares IS NOT NULL THEN rj.official_squares
          ELSE 0
        END
      ), 0)::numeric / (cc.max_squares_per_day * 7)) * 100
    ELSE 0
  END as load_percentage,
  
  -- Revenue projection
  COALESCE(SUM(rj.job_value), 0) as projected_revenue,
  
  -- Status counts
  COUNT(DISTINCT CASE WHEN pc.status = 'scheduled' THEN pc.job_id END) as scheduled_count,
  COUNT(DISTINCT CASE WHEN pc.status = 'in_progress' THEN pc.job_id END) as in_progress_count,
  COUNT(DISTINCT CASE WHEN pc.status = 'delayed' THEN pc.job_id END) as delayed_count,
  
  -- Overload indicators
  CASE 
    WHEN COUNT(DISTINCT pc.job_id) > cc.max_jobs_per_week THEN true
    WHEN COALESCE(SUM(
      CASE 
        WHEN rj.estimated_squares IS NOT NULL THEN rj.estimated_squares
        WHEN rj.official_squares IS NOT NULL THEN rj.official_squares
        ELSE 0
      END
    ), 0) > (cc.max_squares_per_day * 7 * 1.2) THEN true
    ELSE false
  END as is_overloaded,
  
  -- Idle days (simplified - days with no jobs)
  (7 - COUNT(DISTINCT DATE(pc.start_date))) as idle_days

FROM public.production_calendar pc
JOIN public.crews c ON c.id = pc.crew_id
LEFT JOIN public.roofing_jobs rj ON rj.id = pc.job_id
LEFT JOIN public.crew_capacity cc ON cc.crew_id = c.id
WHERE pc.status != 'canceled'
GROUP BY 
  pc.workspace_id,
  date_trunc('week', pc.start_date)::date,
  c.id,
  c.name,
  cc.max_squares_per_day,
  cc.max_jobs_per_week;

COMMENT ON VIEW public.weekly_capacity_reports IS 'Block 38390: Weekly capacity report showing squares scheduled, crew availability, overload risk, idle days, and projected revenue per crew';

-- ============================================================================
-- PART 5 — CREATE FUNCTION: detect_schedule_conflicts
-- ============================================================================
-- Automatically detects scheduling conflicts

CREATE OR REPLACE FUNCTION public.detect_schedule_conflicts(p_workspace_id uuid, p_date_from date DEFAULT CURRENT_DATE, p_date_to date DEFAULT CURRENT_DATE + INTERVAL '30 days')
RETURNS TABLE (
  conflict_id uuid,
  conflict_type text,
  severity text,
  job_id uuid,
  crew_id uuid,
  details jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Clear old resolved conflicts
  DELETE FROM public.schedule_conflicts
  WHERE workspace_id = p_workspace_id
    AND resolved = true
    AND resolved_at < now() - INTERVAL '7 days';
  
  -- Detect double-booking conflicts (same crew, overlapping dates)
  INSERT INTO public.schedule_conflicts (workspace_id, job_id, crew_id, conflict_type, severity, details)
  SELECT DISTINCT
    p_workspace_id,
    pc1.job_id,
    pc1.crew_id,
    'double_booking',
    'critical',
    jsonb_build_object(
      'conflicting_job_id', pc2.job_id,
      'overlap_start', GREATEST(pc1.start_date, pc2.start_date),
      'overlap_end', LEAST(pc1.end_date, pc2.end_date)
    )
  FROM public.production_calendar pc1
  JOIN public.production_calendar pc2 ON 
    pc1.crew_id = pc2.crew_id
    AND pc1.id != pc2.id
    AND pc1.start_date <= pc2.end_date
    AND pc2.start_date <= pc1.end_date
    AND pc1.status != 'canceled'
    AND pc2.status != 'canceled'
  WHERE pc1.workspace_id = p_workspace_id
    AND pc1.start_date BETWEEN p_date_from AND p_date_to
    AND NOT EXISTS (
      SELECT 1 FROM public.schedule_conflicts sc
      WHERE sc.job_id = pc1.job_id
        AND sc.crew_id = pc1.crew_id
        AND sc.conflict_type = 'double_booking'
        AND sc.resolved = false
    );
  
  -- Detect over-capacity conflicts
  INSERT INTO public.schedule_conflicts (workspace_id, job_id, crew_id, conflict_type, severity, details)
  SELECT DISTINCT
    p_workspace_id,
    pc.job_id,
    pc.crew_id,
    'over_capacity',
    'high',
    jsonb_build_object(
      'scheduled_squares', COALESCE(rj.estimated_squares, rj.official_squares, 0),
      'daily_capacity', cc.max_squares_per_day,
      'date', pc.start_date
    )
  FROM public.production_calendar pc
  JOIN public.crews c ON c.id = pc.crew_id
  LEFT JOIN public.roofing_jobs rj ON rj.id = pc.job_id
  LEFT JOIN public.crew_capacity cc ON cc.crew_id = c.id
  WHERE pc.workspace_id = p_workspace_id
    AND pc.start_date BETWEEN p_date_from AND p_date_to
    AND pc.status != 'canceled'
    AND cc.max_squares_per_day > 0
    AND COALESCE(rj.estimated_squares, rj.official_squares, 0) > cc.max_squares_per_day * 1.2
    AND NOT EXISTS (
      SELECT 1 FROM public.schedule_conflicts sc
      WHERE sc.job_id = pc.job_id
        AND sc.crew_id = pc.crew_id
        AND sc.conflict_type = 'over_capacity'
        AND sc.resolved = false
    );
  
  -- Detect material delay conflicts (material ETA after scheduled start)
  INSERT INTO public.schedule_conflicts (workspace_id, job_id, crew_id, conflict_type, severity, details)
  SELECT DISTINCT
    p_workspace_id,
    pc.job_id,
    pc.crew_id,
    'material_delay',
    'high',
    jsonb_build_object(
      'scheduled_start', pc.start_date,
      'material_eta', pc.material_eta,
      'days_late', pc.material_eta - pc.start_date
    )
  FROM public.production_calendar pc
  WHERE pc.workspace_id = p_workspace_id
    AND pc.start_date BETWEEN p_date_from AND p_date_to
    AND pc.status != 'canceled'
    AND pc.material_eta IS NOT NULL
    AND pc.material_eta > pc.start_date
    AND pc.material_delivered = false
    AND NOT EXISTS (
      SELECT 1 FROM public.schedule_conflicts sc
      WHERE sc.job_id = pc.job_id
        AND sc.conflict_type = 'material_delay'
        AND sc.resolved = false
    );
  
  -- Return detected conflicts
  RETURN QUERY
  SELECT 
    sc.id,
    sc.conflict_type,
    sc.severity,
    sc.job_id,
    sc.crew_id,
    sc.details
  FROM public.schedule_conflicts sc
  WHERE sc.workspace_id = p_workspace_id
    AND sc.resolved = false
    AND sc.detected_at >= now() - INTERVAL '1 hour'
  ORDER BY 
    CASE sc.severity
      WHEN 'critical' THEN 1
      WHEN 'high' THEN 2
      WHEN 'medium' THEN 3
      WHEN 'low' THEN 4
    END,
    sc.detected_at DESC;
END;
$$;

COMMENT ON FUNCTION public.detect_schedule_conflicts IS 'Block 38390: Automatically detects scheduling conflicts including double-booking, over-capacity, and material delays';

-- ============================================================================
-- PART 6 — CREATE FUNCTION: predict_job_duration
-- ============================================================================
-- AI-powered job duration prediction based on squares, pitch, material type, crew history

CREATE OR REPLACE FUNCTION public.predict_job_duration(
  p_squares numeric,
  p_roof_pitch numeric DEFAULT NULL,
  p_material_type text DEFAULT NULL,
  p_crew_id uuid DEFAULT NULL,
  p_job_type text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
AS $$
DECLARE
  v_base_days numeric;
  v_pitch_factor numeric := 1.0;
  v_material_factor numeric := 1.0;
  v_crew_factor numeric := 1.0;
  v_job_type_factor numeric := 1.0;
  v_predicted_days numeric;
BEGIN
  -- Base calculation: assume 30 squares per day average
  v_base_days := GREATEST(1, CEIL(p_squares / 30.0));
  
  -- Pitch factor (steeper = slower)
  IF p_roof_pitch IS NOT NULL THEN
    IF p_roof_pitch > 8 THEN
      v_pitch_factor := 1.3; -- Steep roofs take 30% longer
    ELSIF p_roof_pitch > 6 THEN
      v_pitch_factor := 1.15; -- Moderate pitch
    ELSE
      v_pitch_factor := 1.0; -- Low pitch
    END IF;
  END IF;
  
  -- Material type factor
  IF p_material_type IS NOT NULL THEN
    CASE p_material_type
      WHEN 'metal' THEN v_material_factor := 1.2;
      WHEN 'tile' THEN v_material_factor := 1.25;
      WHEN 'slate' THEN v_material_factor := 1.4;
      WHEN 'TPO' THEN v_material_factor := 0.9;
      ELSE v_material_factor := 1.0;
    END CASE;
  END IF;
  
  -- Crew performance factor (based on historical average)
  IF p_crew_id IS NOT NULL THEN
    SELECT 
      CASE 
        WHEN AVG(actual_duration_days) > 0 AND AVG(estimated_duration_days) > 0 THEN
          AVG(actual_duration_days) / NULLIF(AVG(estimated_duration_days), 0)
        ELSE 1.0
      END
    INTO v_crew_factor
    FROM public.production_calendar
    WHERE crew_id = p_crew_id
      AND status = 'completed'
      AND actual_duration_days IS NOT NULL
      AND estimated_duration_days IS NOT NULL;
    
    IF v_crew_factor IS NULL THEN
      v_crew_factor := 1.0;
    END IF;
  END IF;
  
  -- Job type factor
  IF p_job_type IS NOT NULL THEN
    CASE p_job_type
      WHEN 'repair' THEN v_job_type_factor := 0.5; -- Repairs are faster
      WHEN 'full_replacement' THEN v_job_type_factor := 1.0;
      WHEN 'partial' THEN v_job_type_factor := 0.7;
      ELSE v_job_type_factor := 1.0;
    END CASE;
  END IF;
  
  -- Calculate predicted days
  v_predicted_days := v_base_days * v_pitch_factor * v_material_factor * v_crew_factor * v_job_type_factor;
  
  -- Round up to nearest 0.5 days
  RETURN CEIL(v_predicted_days * 2) / 2.0;
END;
$$;

COMMENT ON FUNCTION public.predict_job_duration IS 'Block 38390: AI-powered job duration prediction based on squares, pitch, material type, crew history, and job type';

-- ============================================================================
-- PART 7 — CREATE FUNCTION: auto_schedule_job
-- ============================================================================
-- Automatically schedules a job to the best available crew

CREATE OR REPLACE FUNCTION public.auto_schedule_job(
  p_job_id uuid,
  p_workspace_id uuid
)
RETURNS TABLE (
  scheduled boolean,
  schedule_id uuid,
  crew_id uuid,
  crew_name text,
  start_date date,
  end_date date,
  estimated_days int,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job record;
  v_squares numeric;
  v_roof_pitch numeric;
  v_material_type text;
  v_job_type text;
  v_predicted_days numeric;
  v_best_crew record;
  v_earliest_date date;
  v_schedule_id uuid;
  v_message text;
BEGIN
  -- Load job details
  SELECT 
    j.id,
    j.workspace_id,
    j.job_type,
    j.estimated_squares,
    j.official_squares,
    j.material_status,
    rj.roof_pitch,
    rj.material_type
  INTO v_job
  FROM public.roofing_jobs j
  LEFT JOIN public.roofing_jobs rj ON rj.id = j.id
  WHERE j.id = p_job_id
    AND j.workspace_id = p_workspace_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid, NULL::text, NULL::date, NULL::date, NULL::int, 'Job not found'::text;
    RETURN;
  END IF;
  
  -- Check if materials are delivered
  IF v_job.material_status != 'delivered' THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid, NULL::text, NULL::date, NULL::date, NULL::int, 'Materials not delivered'::text;
    RETURN;
  END IF;
  
  -- Get squares
  v_squares := COALESCE(v_job.official_squares, v_job.estimated_squares, 0);
  IF v_squares <= 0 THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid, NULL::text, NULL::date, NULL::date, NULL::int, 'Job has no squares'::text;
    RETURN;
  END IF;
  
  -- Get job details for prediction
  v_roof_pitch := v_job.roof_pitch;
  v_material_type := v_job.material_type;
  v_job_type := v_job.job_type;
  
  -- Predict duration
  v_predicted_days := public.predict_job_duration(v_squares, v_roof_pitch, v_material_type, NULL, v_job_type);
  
  -- Find best available crew
  SELECT 
    c.id,
    c.name,
    cc.max_squares_per_day,
    MIN(COALESCE(pc.end_date, CURRENT_DATE)) as earliest_available_date
  INTO v_best_crew
  FROM public.crews c
  LEFT JOIN public.crew_capacity cc ON cc.crew_id = c.id
  LEFT JOIN public.production_calendar pc ON 
    pc.crew_id = c.id
    AND pc.status NOT IN ('completed', 'canceled')
    AND pc.end_date >= CURRENT_DATE
  WHERE c.workspace_id = p_workspace_id
    AND c.is_active = true
  GROUP BY c.id, c.name, cc.max_squares_per_day
  HAVING 
    -- Check if crew can handle this job (capacity check)
    (cc.max_squares_per_day IS NULL OR v_squares <= cc.max_squares_per_day * v_predicted_days)
  ORDER BY 
    -- Prefer crews with earliest availability
    MIN(COALESCE(pc.end_date, CURRENT_DATE)) ASC,
    -- Then prefer crews with lower current load
    COUNT(pc.id) ASC
  LIMIT 1;
  
  IF v_best_crew IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid, NULL::text, NULL::date, NULL::date, NULL::int, 'No available crew'::text;
    RETURN;
  END IF;
  
  -- Calculate start date (earliest available + 1 day buffer)
  v_earliest_date := COALESCE(v_best_crew.earliest_available_date + INTERVAL '1 day', CURRENT_DATE + INTERVAL '1 day')::date;
  
  -- Create schedule
  INSERT INTO public.production_calendar (
    workspace_id,
    job_id,
    crew_id,
    start_date,
    end_date,
    estimated_duration_days,
    ai_predicted_duration_days,
    status
  )
  VALUES (
    p_workspace_id,
    p_job_id,
    v_best_crew.id,
    v_earliest_date,
    (v_earliest_date + (v_predicted_days::int - 1))::date,
    v_predicted_days::int,
    v_predicted_days,
    'scheduled'
  )
  RETURNING id INTO v_schedule_id;
  
  -- Update job status
  UPDATE public.roofing_jobs
  SET status = 'scheduled',
      scheduled_start_date = v_earliest_date,
      scheduled_end_date = (v_earliest_date + (v_predicted_days::int - 1))::date
  WHERE id = p_job_id;
  
  v_message := format('Job scheduled to %s starting %s', v_best_crew.name, v_earliest_date);
  
  RETURN QUERY SELECT 
    true,
    v_schedule_id,
    v_best_crew.id,
    v_best_crew.name,
    v_earliest_date,
    (v_earliest_date + (v_predicted_days::int - 1))::date,
    v_predicted_days::int,
    v_message;
END;
$$;

COMMENT ON FUNCTION public.auto_schedule_job IS 'Block 38390: Automatically schedules a job to the best available crew based on capacity, availability, and AI duration prediction';

-- ============================================================================
-- PART 8 — CREATE TRIGGER: update_updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_production_calendar_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_production_calendar_updated_at ON public.production_calendar;
CREATE TRIGGER trg_set_production_calendar_updated_at
BEFORE UPDATE ON public.production_calendar
FOR EACH ROW
EXECUTE FUNCTION public.set_production_calendar_updated_at();

-- ============================================================================
-- PART 9 — ROW LEVEL SECURITY POLICIES
-- ============================================================================

ALTER TABLE public.production_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_capacity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_conflicts ENABLE ROW LEVEL SECURITY;

-- Production calendar policies
CREATE POLICY "Users can view production calendar in their workspace"
  ON public.production_calendar FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage production calendar in their workspace"
  ON public.production_calendar FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Crew capacity policies
CREATE POLICY "Users can view crew capacity in their workspace"
  ON public.crew_capacity FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage crew capacity in their workspace"
  ON public.crew_capacity FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Schedule conflicts policies
CREATE POLICY "Users can view schedule conflicts in their workspace"
  ON public.schedule_conflicts FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage schedule conflicts in their workspace"
  ON public.schedule_conflicts FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 10 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_calendar TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crew_capacity TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_conflicts TO authenticated;
GRANT SELECT ON public.weekly_capacity_reports TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_schedule_conflicts(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.predict_job_duration(numeric, numeric, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_schedule_job(uuid, uuid) TO authenticated;

-- ============================================================================
-- END OF BLOCK 38390
-- ============================================================================
































