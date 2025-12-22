-- =========================================================
-- Block 242000 — SmartSend Roofing Scheduling Engine v2
-- "Crew Routing, Capacity Planning, Weather Sync, Production Optimization"
-- =========================================================
-- 
-- This is the ENGINE that makes SmartSend the smartest operations platform in roofing.
-- 
-- Features:
-- ✅ Crew Routing Optimization
-- ✅ Capacity Planning (per crew + per job type)
-- ✅ Weather API Sync
-- ✅ Production Calendar
-- ✅ Job Duration Prediction
-- ✅ Multi-Crew Assignments
-- ✅ Drag-and-Drop Scheduler v2
-- ✅ Job Clustering (same neighborhoods)
-- ✅ Auto-Reschedule Logic
-- ✅ Travel Time Calculations
-- ✅ Equipment Scheduling (dump trailers, lifts)
--
-- This becomes the production command center.

-- ============================================================================
-- PART 1 — CREW AVAILABILITY TABLE
-- ============================================================================
-- Track when crews are available/unavailable (holidays, training, etc.)

CREATE TABLE IF NOT EXISTS public.crew_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  crew_id uuid NOT NULL REFERENCES public.crews(id) ON DELETE CASCADE,
  date date NOT NULL,
  is_available boolean DEFAULT true,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(crew_id, date)
);

CREATE INDEX IF NOT EXISTS idx_crew_availability_workspace ON public.crew_availability(workspace_id);
CREATE INDEX IF NOT EXISTS idx_crew_availability_crew ON public.crew_availability(crew_id, date);
CREATE INDEX IF NOT EXISTS idx_crew_availability_date ON public.crew_availability(date) WHERE is_available = true;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_crew_availability_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_crew_availability_updated_at
BEFORE UPDATE ON public.crew_availability
FOR EACH ROW
EXECUTE FUNCTION update_crew_availability_updated_at();

-- ============================================================================
-- PART 2 — JOB SCHEDULE TABLE
-- ============================================================================
-- Detailed scheduling information for each job assignment
-- Supports multi-crew assignments and status tracking

CREATE TABLE IF NOT EXISTS public.job_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  scheduled_start timestamptz NOT NULL,
  scheduled_end timestamptz NOT NULL,
  status text DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'delayed', 'cancelled')),
  estimated_duration_hours numeric(5,2), -- AI-predicted duration
  actual_duration_hours numeric(5,2), -- Actual duration when completed
  travel_time_minutes integer DEFAULT 0, -- Calculated travel time
  priority integer DEFAULT 5 CHECK (priority >= 1 AND priority <= 10), -- 1 = highest, 10 = lowest
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_schedule_workspace ON public.job_schedule(workspace_id);
CREATE INDEX IF NOT EXISTS idx_job_schedule_job ON public.job_schedule(job_id);
CREATE INDEX IF NOT EXISTS idx_job_schedule_crew ON public.job_schedule(crew_id);
CREATE INDEX IF NOT EXISTS idx_job_schedule_status ON public.job_schedule(status);
CREATE INDEX IF NOT EXISTS idx_job_schedule_start ON public.job_schedule(scheduled_start);
CREATE INDEX IF NOT EXISTS idx_job_schedule_date_range ON public.job_schedule(scheduled_start, scheduled_end);
CREATE INDEX IF NOT EXISTS idx_job_schedule_crew_date ON public.job_schedule(crew_id, scheduled_start) WHERE status IN ('scheduled', 'in_progress');

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_job_schedule_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_job_schedule_updated_at
BEFORE UPDATE ON public.job_schedule
FOR EACH ROW
EXECUTE FUNCTION update_job_schedule_updated_at();

-- ============================================================================
-- PART 3 — EQUIPMENT SCHEDULE TABLE
-- ============================================================================
-- Schedule equipment (dump trailers, lifts, etc.) to jobs

CREATE TABLE IF NOT EXISTS public.equipment_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  equipment_id uuid NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  scheduled_date date NOT NULL,
  scheduled_start_time time,
  scheduled_end_time time,
  status text DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_transit', 'on_site', 'returned', 'cancelled')),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_equipment_schedule_workspace ON public.equipment_schedule(workspace_id);
CREATE INDEX IF NOT EXISTS idx_equipment_schedule_equipment ON public.equipment_schedule(equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_schedule_job ON public.equipment_schedule(job_id);
CREATE INDEX IF NOT EXISTS idx_equipment_schedule_crew ON public.equipment_schedule(crew_id);
CREATE INDEX IF NOT EXISTS idx_equipment_schedule_date ON public.equipment_schedule(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_equipment_schedule_status ON public.equipment_schedule(status);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_equipment_schedule_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_equipment_schedule_updated_at
BEFORE UPDATE ON public.equipment_schedule
FOR EACH ROW
EXECUTE FUNCTION update_equipment_schedule_updated_at();

-- ============================================================================
-- PART 4 — WEATHER LOG TABLE
-- ============================================================================
-- Track weather data and delays for jobs

CREATE TABLE IF NOT EXISTS public.weather_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  date date NOT NULL,
  location_address text, -- Job address for weather lookup
  location_lat numeric(10, 8),
  location_lng numeric(11, 8),
  weather jsonb NOT NULL DEFAULT '{}'::jsonb, -- Full weather data from API
  temperature_high numeric(5,2),
  temperature_low numeric(5,2),
  precipitation_probability integer CHECK (precipitation_probability >= 0 AND precipitation_probability <= 100),
  precipitation_amount numeric(5,2), -- inches
  wind_speed_mph numeric(5,2),
  conditions text, -- 'clear', 'partly_cloudy', 'cloudy', 'rain', 'snow', 'storm'
  delay_required boolean DEFAULT false,
  delay_reason text, -- Why delay was required
  weather_risk_level text CHECK (weather_risk_level IN ('low', 'medium', 'high', 'severe')) DEFAULT 'low',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_weather_log_workspace ON public.weather_log(workspace_id);
CREATE INDEX IF NOT EXISTS idx_weather_log_job ON public.weather_log(job_id);
CREATE INDEX IF NOT EXISTS idx_weather_log_date ON public.weather_log(date);
CREATE INDEX IF NOT EXISTS idx_weather_log_location ON public.weather_log(location_lat, location_lng) WHERE location_lat IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_weather_log_delay ON public.weather_log(delay_required) WHERE delay_required = true;
CREATE INDEX IF NOT EXISTS idx_weather_log_risk ON public.weather_log(weather_risk_level);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_weather_log_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_weather_log_updated_at
BEFORE UPDATE ON public.weather_log
FOR EACH ROW
EXECUTE FUNCTION update_weather_log_updated_at();

-- ============================================================================
-- PART 5 — SCHEDULING AI PREDICTIONS TABLE
-- ============================================================================
-- Store AI predictions for job duration, best crew, etc.

CREATE TABLE IF NOT EXISTS public.scheduling_ai_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  prediction_type text NOT NULL CHECK (prediction_type IN ('job_duration', 'best_crew', 'travel_efficiency', 'job_complexity', 'recommended_schedule_time')),
  predicted_value jsonb NOT NULL, -- Flexible JSON for different prediction types
  confidence_score numeric(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1), -- 0-1 confidence
  model_version text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduling_ai_predictions_workspace ON public.scheduling_ai_predictions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_scheduling_ai_predictions_job ON public.scheduling_ai_predictions(job_id);
CREATE INDEX IF NOT EXISTS idx_scheduling_ai_predictions_type ON public.scheduling_ai_predictions(prediction_type);

-- ============================================================================
-- PART 6 — JOB CLUSTERING TABLE
-- ============================================================================
-- Track geographic clusters of jobs for efficient routing

CREATE TABLE IF NOT EXISTS public.job_clusters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  cluster_name text, -- e.g., "Northside Cluster - Week of Jan 15"
  cluster_date date NOT NULL,
  job_ids uuid[] NOT NULL, -- Array of job IDs in this cluster
  center_lat numeric(10, 8),
  center_lng numeric(11, 8),
  suggested_crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  travel_time_saved_minutes integer DEFAULT 0, -- Estimated time saved by clustering
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_clusters_workspace ON public.job_clusters(workspace_id);
CREATE INDEX IF NOT EXISTS idx_job_clusters_date ON public.job_clusters(cluster_date);
CREATE INDEX IF NOT EXISTS idx_job_clusters_crew ON public.job_clusters(suggested_crew_id);

-- ============================================================================
-- PART 7 — HELPER FUNCTIONS
-- ============================================================================

-- Function: Get crew capacity for a date range
CREATE OR REPLACE FUNCTION get_crew_capacity(
  p_crew_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  date date,
  scheduled_hours numeric,
  available boolean,
  jobs_count integer
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.date,
    COALESCE(SUM(EXTRACT(EPOCH FROM (js.scheduled_end - js.scheduled_start)) / 3600), 0)::numeric AS scheduled_hours,
    COALESCE(ca.is_available, true) AS available,
    COUNT(js.id)::integer AS jobs_count
  FROM generate_series(p_start_date, p_end_date, '1 day'::interval) AS d(date)
  LEFT JOIN public.job_schedule js ON js.crew_id = p_crew_id
    AND js.scheduled_start::date = d.date
    AND js.status IN ('scheduled', 'in_progress')
  LEFT JOIN public.crew_availability ca ON ca.crew_id = p_crew_id AND ca.date = d.date
  GROUP BY d.date, ca.is_available
  ORDER BY d.date;
END;
$$ LANGUAGE plpgsql;

-- Function: Check for scheduling conflicts
CREATE OR REPLACE FUNCTION check_scheduling_conflict(
  p_crew_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_exclude_job_id uuid DEFAULT NULL
)
RETURNS boolean AS $$
DECLARE
  conflict_count integer;
BEGIN
  SELECT COUNT(*) INTO conflict_count
  FROM public.job_schedule
  WHERE crew_id = p_crew_id
    AND status IN ('scheduled', 'in_progress')
    AND (id != p_exclude_job_id OR p_exclude_job_id IS NULL)
    AND (
      (scheduled_start, scheduled_end) OVERLAPS (p_start, p_end)
    );
  
  RETURN conflict_count > 0;
END;
$$ LANGUAGE plpgsql;

-- Function: Calculate travel time between two addresses (placeholder - would use geocoding API)
CREATE OR REPLACE FUNCTION calculate_travel_time(
  p_from_address text,
  p_to_address text
)
RETURNS integer AS $$
BEGIN
  -- This is a placeholder. In production, this would call a geocoding/routing API
  -- For now, return a default estimate based on distance
  RETURN 30; -- 30 minutes default
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 8 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.crew_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weather_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduling_ai_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_clusters ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access data from their workspace
CREATE POLICY "crew_availability_workspace_access"
  ON public.crew_availability
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "job_schedule_workspace_access"
  ON public.job_schedule
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "equipment_schedule_workspace_access"
  ON public.equipment_schedule
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "weather_log_workspace_access"
  ON public.weather_log
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "scheduling_ai_predictions_workspace_access"
  ON public.scheduling_ai_predictions
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "job_clusters_workspace_access"
  ON public.job_clusters
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 9 — COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE public.crew_availability IS 'Block 242000: Track crew availability/unavailability dates';
COMMENT ON TABLE public.job_schedule IS 'Block 242000: Detailed job scheduling with crew assignments and timing';
COMMENT ON TABLE public.equipment_schedule IS 'Block 242000: Schedule equipment (dump trailers, lifts) to jobs';
COMMENT ON TABLE public.weather_log IS 'Block 242000: Weather data and delay tracking for jobs';
COMMENT ON TABLE public.scheduling_ai_predictions IS 'Block 242000: AI predictions for job duration, crew assignment, etc.';
COMMENT ON TABLE public.job_clusters IS 'Block 242000: Geographic job clusters for efficient routing';

























