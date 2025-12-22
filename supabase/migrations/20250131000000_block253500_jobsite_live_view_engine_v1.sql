-- =========================================================
-- Block 253500 — SmartSend Jobsite Live View Engine v1
-- "Real-Time Crew Check-In Map, Auto-Arrival Detection, Geo-Fencing, Job Location Heatmap, Route Tracking"
-- =========================================================
-- 
-- This block gives roofing companies real-time eyes on their operations.
-- 
-- Right now roofing companies:
-- - Don't know if crews actually arrived
-- - Don't know when crews leave
-- - Don't know who's on which job
-- - Don't know when subs show up
-- - Don't know if crews are wasting time
-- - Don't know if jobs are running late
-- - Don't know if foremen bounce between jobs
-- - Can't prove time-on-site for payroll/disputes
-- - Have ZERO real-time job visibility
-- 
-- SmartSend will change ALL OF THIS.
-- 
-- Roofers will say:
-- "SmartSend finally shows us EXACTLY where crews are."
-- "No more guessing or calling foremen."
-- "We'd be stupid not using this."
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE employee_location_logs TABLE
-- ============================================================================
-- Tracks continuous GPS location updates from mobile app
-- Used for breadcrumb trails, real-time tracking, and auto-arrival detection

CREATE TABLE IF NOT EXISTS public.employee_location_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.workforce_employees(id) ON DELETE CASCADE,
  lat numeric(10, 8) NOT NULL,
  lng numeric(11, 8) NOT NULL,
  accuracy numeric, -- GPS accuracy in meters
  heading numeric, -- Direction of travel in degrees (0-360)
  speed numeric, -- Speed in km/h
  recorded_at timestamptz DEFAULT now() NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_location_logs_employee ON public.employee_location_logs(employee_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_employee_location_logs_recorded_at ON public.employee_location_logs(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_employee_location_logs_recent ON public.employee_location_logs(employee_id, recorded_at DESC) 
  WHERE recorded_at > now() - interval '30 days';
CREATE INDEX IF NOT EXISTS idx_employee_location_logs_location ON public.employee_location_logs(lat, lng);

COMMENT ON TABLE public.employee_location_logs IS 'Continuous GPS location tracking for employees (Block 253500)';
COMMENT ON COLUMN public.employee_location_logs.recorded_at IS 'When the GPS location was recorded (may differ from created_at for delayed uploads)';

-- ============================================================================
-- PART 2 — CREATE job_geofences TABLE
-- ============================================================================
-- Defines geofence boundaries for each job site
-- Used for auto-arrival detection and check-in validation

CREATE TABLE IF NOT EXISTS public.job_geofences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  lat numeric(10, 8) NOT NULL,
  lng numeric(11, 8) NOT NULL,
  radius_meters int DEFAULT 120 CHECK (radius_meters > 0),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_geofences_job ON public.job_geofences(job_id);
CREATE INDEX IF NOT EXISTS idx_job_geofences_location ON public.job_geofences(lat, lng);

COMMENT ON TABLE public.job_geofences IS 'Geofence boundaries for job sites (Block 253500)';
COMMENT ON COLUMN public.job_geofences.radius_meters IS 'Radius of geofence in meters (default 120m = ~394 feet)';

-- Auto-create geofence when job site coordinates are set
CREATE OR REPLACE FUNCTION public.auto_create_job_geofence()
RETURNS TRIGGER AS $$
BEGIN
  -- If job has site_lat and site_lng but no geofence exists, create one
  IF NEW.site_lat IS NOT NULL AND NEW.site_lng IS NOT NULL THEN
    INSERT INTO public.job_geofences (job_id, lat, lng, radius_meters)
    SELECT NEW.id, NEW.site_lat, NEW.site_lng, 120
    WHERE NOT EXISTS (
      SELECT 1 FROM public.job_geofences WHERE job_id = NEW.id
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_create_job_geofence ON public.jobs;
CREATE TRIGGER trg_auto_create_job_geofence
AFTER INSERT OR UPDATE OF site_lat, site_lng ON public.jobs
FOR EACH ROW
WHEN (NEW.site_lat IS NOT NULL AND NEW.site_lng IS NOT NULL)
EXECUTE FUNCTION public.auto_create_job_geofence();

-- ============================================================================
-- PART 3 — CREATE employee_job_visits TABLE
-- ============================================================================
-- Tracks when employees actually arrived or left a job site
-- Auto-populated by geofence detection

CREATE TABLE IF NOT EXISTS public.employee_job_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.workforce_employees(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  arrived_at timestamptz NOT NULL,
  left_at timestamptz,
  arrival_lat numeric(10, 8),
  arrival_lng numeric(11, 8),
  departure_lat numeric(10, 8),
  departure_lng numeric(11, 8),
  duration_minutes int, -- Calculated when left_at is set
  auto_detected boolean DEFAULT true, -- true if auto-detected via geofence, false if manual
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_job_visits_employee ON public.employee_job_visits(employee_id, arrived_at DESC);
CREATE INDEX IF NOT EXISTS idx_employee_job_visits_job ON public.employee_job_visits(job_id, arrived_at DESC);
CREATE INDEX IF NOT EXISTS idx_employee_job_visits_active ON public.employee_job_visits(employee_id, job_id) 
  WHERE left_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_employee_job_visits_date ON public.employee_job_visits(arrived_at DESC);

COMMENT ON TABLE public.employee_job_visits IS 'Tracks employee arrivals and departures at job sites (Block 253500)';
COMMENT ON COLUMN public.employee_job_visits.auto_detected IS 'true if detected automatically via geofence, false if manually logged';

-- Auto-calculate duration when left_at is set
CREATE OR REPLACE FUNCTION public.calculate_visit_duration()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.left_at IS NOT NULL AND NEW.arrived_at IS NOT NULL THEN
    NEW.duration_minutes := EXTRACT(EPOCH FROM (NEW.left_at - NEW.arrived_at)) / 60;
  END IF;
  
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calculate_visit_duration ON public.employee_job_visits;
CREATE TRIGGER trg_calculate_visit_duration
BEFORE INSERT OR UPDATE ON public.employee_job_visits
FOR EACH ROW
EXECUTE FUNCTION public.calculate_visit_duration();

-- ============================================================================
-- PART 4 — GPS DISTANCE CALCULATION FUNCTION (METERS)
-- ============================================================================
-- Calculates distance between two GPS coordinates in meters using Haversine formula

CREATE OR REPLACE FUNCTION public.calculate_distance_meters(
  lat1 numeric,
  lng1 numeric,
  lat2 numeric,
  lng2 numeric
) RETURNS numeric AS $$
DECLARE
  earth_radius_meters numeric := 6371000; -- Earth radius in meters
  dlat numeric;
  dlng numeric;
  a numeric;
  c numeric;
BEGIN
  dlat := radians(lat2 - lat1);
  dlng := radians(lng2 - lng1);
  
  a := sin(dlat / 2) * sin(dlat / 2) +
       cos(radians(lat1)) * cos(radians(lat2)) *
       sin(dlng / 2) * sin(dlng / 2);
  
  c := 2 * atan2(sqrt(a), sqrt(1 - a));
  
  RETURN earth_radius_meters * c;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.calculate_distance_meters IS 'Calculates distance between two GPS coordinates in meters using Haversine formula (Block 253500)';

-- ============================================================================
-- PART 5 — CHECK IF LOCATION IS WITHIN GEOFENCE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_within_geofence(
  p_lat numeric,
  p_lng numeric,
  p_job_id uuid
) RETURNS boolean AS $$
DECLARE
  v_geofence public.job_geofences%ROWTYPE;
  v_distance_meters numeric;
BEGIN
  -- Get geofence for job
  SELECT * INTO v_geofence
  FROM public.job_geofences
  WHERE job_id = p_job_id
  LIMIT 1;
  
  -- If no geofence exists, return false
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Calculate distance
  v_distance_meters := public.calculate_distance_meters(
    p_lat, p_lng,
    v_geofence.lat, v_geofence.lng
  );
  
  -- Check if within radius
  RETURN v_distance_meters <= v_geofence.radius_meters;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION public.is_within_geofence IS 'Checks if a location is within a job site geofence (Block 253500)';

-- ============================================================================
-- PART 6 — AUTO-ARRIVAL DETECTION FUNCTION
-- ============================================================================
-- Called when employee location is logged
-- Automatically creates visit records when employee enters geofence

CREATE OR REPLACE FUNCTION public.detect_job_arrival(
  p_employee_id uuid,
  p_lat numeric,
  p_lng numeric,
  p_recorded_at timestamptz DEFAULT now()
)
RETURNS jsonb AS $$
DECLARE
  v_job_id uuid;
  v_geofence public.job_geofences%ROWTYPE;
  v_existing_visit public.employee_job_visits%ROWTYPE;
  v_result jsonb := '{}'::jsonb;
BEGIN
  -- Find jobs with geofences that contain this location
  FOR v_geofence IN
    SELECT g.*
    FROM public.job_geofences g
    WHERE public.calculate_distance_meters(p_lat, p_lng, g.lat, g.lng) <= g.radius_meters
    ORDER BY public.calculate_distance_meters(p_lat, p_lng, g.lat, g.lng) ASC
    LIMIT 1
  LOOP
    v_job_id := v_geofence.job_id;
    
    -- Check if there's an active visit (arrived but not left)
    SELECT * INTO v_existing_visit
    FROM public.employee_job_visits
    WHERE employee_id = p_employee_id
      AND job_id = v_job_id
      AND left_at IS NULL
    ORDER BY arrived_at DESC
    LIMIT 1;
    
    -- If no active visit, create one
    IF NOT FOUND THEN
      INSERT INTO public.employee_job_visits (
        employee_id,
        job_id,
        arrived_at,
        arrival_lat,
        arrival_lng,
        auto_detected
      ) VALUES (
        p_employee_id,
        v_job_id,
        p_recorded_at,
        p_lat,
        p_lng,
        true
      )
      RETURNING * INTO v_existing_visit;
      
      v_result := jsonb_build_object(
        'action', 'arrived',
        'job_id', v_job_id,
        'visit_id', v_existing_visit.id,
        'arrived_at', v_existing_visit.arrived_at
      );
      
      -- Trigger alert (will be handled by application layer)
      -- For now, we'll return the result and let the API handle alerts
    END IF;
    
    EXIT; -- Only process first matching geofence
  END LOOP;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.detect_job_arrival IS 'Auto-detects when employee arrives at a job site via geofence (Block 253500)';

-- ============================================================================
-- PART 7 — AUTO-DEPARTURE DETECTION FUNCTION
-- ============================================================================
-- Checks if employee has left geofence and marks visit as complete

CREATE OR REPLACE FUNCTION public.detect_job_departure(
  p_employee_id uuid,
  p_lat numeric,
  p_lng numeric,
  p_recorded_at timestamptz DEFAULT now()
)
RETURNS jsonb AS $$
DECLARE
  v_active_visit public.employee_job_visits%ROWTYPE;
  v_geofence public.job_geofences%ROWTYPE;
  v_distance_meters numeric;
  v_result jsonb := '{}'::jsonb;
  v_outside_duration interval := '5 minutes'; -- Must be outside for 5 minutes
BEGIN
  -- Find active visits for this employee
  FOR v_active_visit IN
    SELECT *
    FROM public.employee_job_visits
    WHERE employee_id = p_employee_id
      AND left_at IS NULL
    ORDER BY arrived_at DESC
  LOOP
    -- Get geofence for this job
    SELECT * INTO v_geofence
    FROM public.job_geofences
    WHERE job_id = v_active_visit.job_id
    LIMIT 1;
    
    -- If no geofence, skip
    IF NOT FOUND THEN
      CONTINUE;
    END IF;
    
    -- Calculate distance from geofence center
    v_distance_meters := public.calculate_distance_meters(
      p_lat, p_lng,
      v_geofence.lat, v_geofence.lng
    );
    
    -- If outside geofence, check if they've been outside long enough
    IF v_distance_meters > v_geofence.radius_meters THEN
      -- Check if this is the first time we detected them outside
      -- For now, we'll mark as left immediately (can be enhanced to require 5 min outside)
      UPDATE public.employee_job_visits
      SET 
        left_at = p_recorded_at,
        departure_lat = p_lat,
        departure_lng = p_lng
      WHERE id = v_active_visit.id
        AND left_at IS NULL;
      
      -- If update succeeded, return result
      IF FOUND THEN
        v_result := jsonb_build_object(
          'action', 'departed',
          'job_id', v_active_visit.job_id,
          'visit_id', v_active_visit.id,
          'left_at', p_recorded_at
        );
        
        EXIT; -- Only process first active visit
      END IF;
    END IF;
  END LOOP;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.detect_job_departure IS 'Auto-detects when employee leaves a job site (Block 253500)';

-- ============================================================================
-- PART 8 — TRIGGER AUTO-DETECTION ON LOCATION LOG
-- ============================================================================
-- Automatically triggers arrival/departure detection when location is logged

CREATE OR REPLACE FUNCTION public.process_location_log()
RETURNS TRIGGER AS $$
DECLARE
  v_arrival_result jsonb;
  v_departure_result jsonb;
BEGIN
  -- First check for departure (in case they left before new location)
  v_departure_result := public.detect_job_departure(
    NEW.employee_id,
    NEW.lat,
    NEW.lng,
    NEW.recorded_at
  );
  
  -- Then check for arrival
  v_arrival_result := public.detect_job_arrival(
    NEW.employee_id,
    NEW.lat,
    NEW.lng,
    NEW.recorded_at
  );
  
  -- Store results in metadata for debugging (optional)
  -- Could also trigger alerts here via pg_notify or similar
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_process_location_log ON public.employee_location_logs;
CREATE TRIGGER trg_process_location_log
AFTER INSERT ON public.employee_location_logs
FOR EACH ROW
EXECUTE FUNCTION public.process_location_log();

-- ============================================================================
-- PART 9 — GET EMPLOYEE BREADCRUMB TRAIL
-- ============================================================================
-- Returns GPS breadcrumb trail for an employee within a time range

CREATE OR REPLACE FUNCTION public.get_employee_breadcrumbs(
  p_employee_id uuid,
  p_start_time timestamptz DEFAULT now() - interval '24 hours',
  p_end_time timestamptz DEFAULT now()
)
RETURNS TABLE (
  id uuid,
  lat numeric,
  lng numeric,
  accuracy numeric,
  heading numeric,
  speed numeric,
  recorded_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    l.id,
    l.lat,
    l.lng,
    l.accuracy,
    l.heading,
    l.speed,
    l.recorded_at
  FROM public.employee_location_logs l
  WHERE l.employee_id = p_employee_id
    AND l.recorded_at >= p_start_time
    AND l.recorded_at <= p_end_time
  ORDER BY l.recorded_at ASC;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION public.get_employee_breadcrumbs IS 'Returns GPS breadcrumb trail for an employee (Block 253500)';

-- ============================================================================
-- PART 10 — GET JOB LOCATION HEATMAP DATA
-- ============================================================================
-- Returns location data for heatmap visualization

CREATE OR REPLACE FUNCTION public.get_job_heatmap_data(
  p_company_id uuid,
  p_start_date date DEFAULT CURRENT_DATE - interval '30 days',
  p_end_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  job_id uuid,
  lat numeric,
  lng numeric,
  visit_count bigint,
  total_duration_minutes numeric,
  employee_count bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    v.job_id,
    g.lat,
    g.lng,
    COUNT(DISTINCT v.id)::bigint as visit_count,
    SUM(v.duration_minutes)::numeric as total_duration_minutes,
    COUNT(DISTINCT v.employee_id)::bigint as employee_count
  FROM public.employee_job_visits v
  JOIN public.job_geofences g ON g.job_id = v.job_id
  JOIN public.jobs j ON j.id = v.job_id
  JOIN public.workforce_employees e ON e.id = v.employee_id
  WHERE e.company_id = p_company_id
    AND DATE(v.arrived_at) >= p_start_date
    AND DATE(v.arrived_at) <= p_end_date
    AND v.left_at IS NOT NULL -- Only completed visits
  GROUP BY v.job_id, g.lat, g.lng
  ORDER BY visit_count DESC;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION public.get_job_heatmap_data IS 'Returns job location heatmap data (Block 253500)';

-- ============================================================================
-- PART 11 — GET CREW LOCATION TIMELINE
-- ============================================================================
-- Returns detailed timeline of employee movements for a day

CREATE OR REPLACE FUNCTION public.get_crew_timeline(
  p_employee_id uuid,
  p_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  event_type text,
  job_id uuid,
  job_address text,
  lat numeric,
  lng numeric,
  timestamp timestamptz,
  duration_minutes int
) AS $$
BEGIN
  RETURN QUERY
  WITH visit_events AS (
    SELECT
      'arrived'::text as event_type,
      v.job_id,
      COALESCE(j.notes, j.address, 'Unknown') as job_address,
      v.arrival_lat as lat,
      v.arrival_lng as lng,
      v.arrived_at as timestamp,
      NULL::int as duration_minutes
    FROM public.employee_job_visits v
    JOIN public.jobs j ON j.id = v.job_id
    WHERE v.employee_id = p_employee_id
      AND DATE(v.arrived_at) = p_date
    
    UNION ALL
    
    SELECT
      'left'::text as event_type,
      v.job_id,
      COALESCE(j.notes, j.address, 'Unknown') as job_address,
      v.departure_lat as lat,
      v.departure_lng as lng,
      v.left_at as timestamp,
      v.duration_minutes
    FROM public.employee_job_visits v
    JOIN public.jobs j ON j.id = v.job_id
    WHERE v.employee_id = p_employee_id
      AND DATE(v.left_at) = p_date
      AND v.left_at IS NOT NULL
  )
  SELECT *
  FROM visit_events
  ORDER BY timestamp ASC;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION public.get_crew_timeline IS 'Returns detailed timeline of employee movements for a day (Block 253500)';

-- ============================================================================
-- PART 12 — CALCULATE ETA TO JOB
-- ============================================================================
-- Estimates arrival time based on current location, distance, and traffic

CREATE OR REPLACE FUNCTION public.calculate_job_eta(
  p_employee_id uuid,
  p_job_id uuid
)
RETURNS jsonb AS $$
DECLARE
  v_current_location public.employee_location_logs%ROWTYPE;
  v_job_geofence public.job_geofences%ROWTYPE;
  v_distance_meters numeric;
  v_distance_miles numeric;
  v_current_speed_kmh numeric;
  v_avg_speed_kmh numeric := 50; -- Default average speed (can be enhanced with traffic data)
  v_eta_minutes numeric;
  v_result jsonb;
BEGIN
  -- Get most recent location for employee
  SELECT * INTO v_current_location
  FROM public.employee_location_logs
  WHERE employee_id = p_employee_id
  ORDER BY recorded_at DESC
  LIMIT 1;
  
  -- If no location data, return null
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'eta_minutes', NULL,
      'distance_miles', NULL,
      'status', 'no_location_data'
    );
  END IF;
  
  -- Get job geofence
  SELECT * INTO v_job_geofence
  FROM public.job_geofences
  WHERE job_id = p_job_id
  LIMIT 1;
  
  -- If no geofence, return null
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'eta_minutes', NULL,
      'distance_miles', NULL,
      'status', 'no_geofence'
    );
  END IF;
  
  -- Calculate distance
  v_distance_meters := public.calculate_distance_meters(
    v_current_location.lat,
    v_current_location.lng,
    v_job_geofence.lat,
    v_job_geofence.lng
  );
  
  v_distance_miles := v_distance_meters * 0.000621371; -- Convert to miles
  
  -- Use current speed if available, otherwise use average
  IF v_current_location.speed IS NOT NULL AND v_current_location.speed > 0 THEN
    v_avg_speed_kmh := v_current_location.speed;
  END IF;
  
  -- Calculate ETA (convert km/h to miles/min)
  v_eta_minutes := (v_distance_miles / (v_avg_speed_kmh * 0.621371)) * 60;
  
  -- Build result
  v_result := jsonb_build_object(
    'eta_minutes', ROUND(v_eta_minutes, 1),
    'distance_miles', ROUND(v_distance_miles, 2),
    'current_speed_kmh', v_current_location.speed,
    'status', 'en_route'
  );
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION public.calculate_job_eta IS 'Calculates estimated arrival time to job site (Block 253500)';

-- ============================================================================
-- PART 13 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- employee_location_logs RLS
ALTER TABLE public.employee_location_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "employee_location_logs_company_access" ON public.employee_location_logs;
CREATE POLICY "employee_location_logs_company_access" ON public.employee_location_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS(
      SELECT 1 FROM public.workforce_employees e
      WHERE e.id = employee_location_logs.employee_id
      AND e.company_id IN (
        SELECT company_id FROM public.workforce_employees
        WHERE id IN (
          SELECT employee_id FROM public.workforce_employees
          WHERE company_id = e.company_id
        )
      )
    )
  );

-- job_geofences RLS
ALTER TABLE public.job_geofences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "job_geofences_company_access" ON public.job_geofences;
CREATE POLICY "job_geofences_company_access" ON public.job_geofences
  FOR SELECT
  TO authenticated
  USING (
    EXISTS(
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_geofences.job_id
    )
  );

-- employee_job_visits RLS
ALTER TABLE public.employee_job_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "employee_job_visits_company_access" ON public.employee_job_visits;
CREATE POLICY "employee_job_visits_company_access" ON public.employee_job_visits
  FOR SELECT
  TO authenticated
  USING (
    EXISTS(
      SELECT 1 FROM public.workforce_employees e
      WHERE e.id = employee_job_visits.employee_id
      AND e.company_id IN (
        SELECT company_id FROM public.workforce_employees
        WHERE id = employee_job_visits.employee_id
      )
    )
  );

-- Service role has full access to all tables
DROP POLICY IF EXISTS "employee_location_logs_service_role" ON public.employee_location_logs;
CREATE POLICY "employee_location_logs_service_role" ON public.employee_location_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "job_geofences_service_role" ON public.job_geofences;
CREATE POLICY "job_geofences_service_role" ON public.job_geofences
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "employee_job_visits_service_role" ON public.employee_job_visits;
CREATE POLICY "employee_job_visits_service_role" ON public.employee_job_visits
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 14 — CLEANUP OLD LOCATION LOGS (30 DAY RETENTION)
-- ============================================================================
-- Function to clean up location logs older than 30 days
-- Can be called by a scheduled job

CREATE OR REPLACE FUNCTION public.cleanup_old_location_logs()
RETURNS int AS $$
DECLARE
  v_deleted_count int;
BEGIN
  DELETE FROM public.employee_location_logs
  WHERE recorded_at < now() - interval '30 days';
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.cleanup_old_location_logs IS 'Cleans up location logs older than 30 days (Block 253500)';
























