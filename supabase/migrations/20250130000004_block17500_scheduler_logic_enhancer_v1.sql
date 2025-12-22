-- =========================================================
-- Block 17500 — SmartSend Scheduling Logic Enhancer v1
-- (Travel-Time Awareness, Smart Buffers, Crew Routing, Weather Blocks, 
--  Priority Booking & Automatic Time Suggestions)
-- =========================================================

-- ============================================================================
-- 1. CREW_ASSIGNMENTS TABLE
-- ============================================================================
-- Track which team members are assigned to which appointments

CREATE TABLE IF NOT EXISTS public.crew_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES public.schedule_bookings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Assignment metadata
  assigned_at timestamptz DEFAULT now(),
  assigned_by_user_id uuid REFERENCES auth.users(id),
  assignment_reason text, -- e.g., "closest_to_location", "load_balancing", "manual"
  
  -- Location tracking for routing
  crew_member_address text, -- Current location or home base
  crew_member_zip text,
  
  created_at timestamptz DEFAULT now(),
  
  UNIQUE(booking_id, user_id) -- One crew member per booking (can extend to multiple later)
);

CREATE INDEX IF NOT EXISTS idx_crew_assignments_workspace 
  ON public.crew_assignments(workspace_id);
CREATE INDEX IF NOT EXISTS idx_crew_assignments_booking 
  ON public.crew_assignments(booking_id);
CREATE INDEX IF NOT EXISTS idx_crew_assignments_user 
  ON public.crew_assignments(workspace_id, user_id);
-- Note: Date-based index on crew_assignments would require a join, so we index by booking_id instead
-- The booking table already has indexes on start_time

-- ============================================================================
-- 2. ENHANCE SCHEDULER_SETTINGS TABLE
-- ============================================================================
-- Add travel time, buffer, daylight, and priority settings

ALTER TABLE public.scheduler_settings
  ADD COLUMN IF NOT EXISTS office_address text,
  ADD COLUMN IF NOT EXISTS office_zip text,
  ADD COLUMN IF NOT EXISTS office_city text,
  ADD COLUMN IF NOT EXISTS office_state text,
  
  -- Travel Time Settings
  ADD COLUMN IF NOT EXISTS travel_time_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS travel_buffer_minutes integer DEFAULT 15 CHECK (travel_buffer_minutes >= 0 AND travel_buffer_minutes <= 60),
  ADD COLUMN IF NOT EXISTS max_travel_time_minutes integer DEFAULT 60 CHECK (max_travel_time_minutes >= 15 AND max_travel_time_minutes <= 180),
  ADD COLUMN IF NOT EXISTS use_traffic_data boolean DEFAULT true,
  
  -- Smart Buffer Logic
  ADD COLUMN IF NOT EXISTS default_inspection_duration integer DEFAULT 30 CHECK (default_inspection_duration IN (20, 25, 30, 35, 40, 45)),
  ADD COLUMN IF NOT EXISTS buffer_between_jobs_minutes integer DEFAULT 15 CHECK (buffer_between_jobs_minutes >= 10 AND buffer_between_jobs_minutes <= 30),
  ADD COLUMN IF NOT EXISTS storm_damage_buffer_extra_minutes integer DEFAULT 10 CHECK (storm_damage_buffer_extra_minutes >= 0 AND storm_damage_buffer_extra_minutes <= 30),
  ADD COLUMN IF NOT EXISTS insurance_claim_buffer_extra_minutes integer DEFAULT 15 CHECK (insurance_claim_buffer_extra_minutes >= 0 AND insurance_claim_buffer_extra_minutes <= 30),
  ADD COLUMN IF NOT EXISTS simple_repair_buffer_minutes integer DEFAULT 10 CHECK (simple_repair_buffer_minutes >= 5 AND simple_repair_buffer_minutes <= 20),
  
  -- Daylight Logic
  ADD COLUMN IF NOT EXISTS daylight_start_buffer_minutes integer DEFAULT 30 CHECK (daylight_start_buffer_minutes >= 0 AND daylight_start_buffer_minutes <= 120),
  ADD COLUMN IF NOT EXISTS daylight_end_buffer_minutes integer DEFAULT 30 CHECK (daylight_end_buffer_minutes >= 0 AND daylight_end_buffer_minutes <= 120),
  ADD COLUMN IF NOT EXISTS use_seasonal_daylight boolean DEFAULT true,
  
  -- Priority Booking
  ADD COLUMN IF NOT EXISTS priority_booking_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS priority_insurance_leads boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS priority_storm_damage boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS priority_hot_leads boolean DEFAULT true,
  
  -- Same-Day Scheduling
  ADD COLUMN IF NOT EXISTS allow_same_day_booking boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS same_day_booking_cutoff_hours integer DEFAULT 2 CHECK (same_day_booking_cutoff_hours >= 1 AND same_day_booking_cutoff_hours <= 12),
  
  -- Quality Scoring
  ADD COLUMN IF NOT EXISTS quality_scoring_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS hide_risky_slots boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_quality_score numeric(3, 2) DEFAULT 0.5 CHECK (min_quality_score >= 0 AND min_quality_score <= 1);

-- ============================================================================
-- 3. ENHANCE SCHEDULE_BOOKINGS TABLE
-- ============================================================================
-- Add quality score and conflict resolution fields

ALTER TABLE public.schedule_bookings
  ADD COLUMN IF NOT EXISTS quality_score numeric(3, 2) CHECK (quality_score >= 0 AND quality_score <= 1),
  ADD COLUMN IF NOT EXISTS quality_category text CHECK (quality_category IN ('optimal', 'good', 'risky')),
  ADD COLUMN IF NOT EXISTS travel_time_from_previous integer, -- minutes from previous appointment
  ADD COLUMN IF NOT EXISTS travel_time_from_office integer, -- minutes from office
  ADD COLUMN IF NOT EXISTS previous_appointment_id uuid REFERENCES public.schedule_bookings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS conflict_resolved boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS conflict_resolution_action text CHECK (conflict_resolution_action IN ('replaced', 'shifted', 'cancelled', 'none')),
  ADD COLUMN IF NOT EXISTS rescheduled_from_booking_id uuid REFERENCES public.schedule_bookings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS daylight_safe boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS sunrise_time timestamptz,
  ADD COLUMN IF NOT EXISTS sunset_time timestamptz;

CREATE INDEX IF NOT EXISTS idx_schedule_bookings_quality 
  ON public.schedule_bookings(workspace_id, quality_score DESC) WHERE quality_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_schedule_bookings_previous 
  ON public.schedule_bookings(workspace_id, previous_appointment_id) WHERE previous_appointment_id IS NOT NULL;

-- ============================================================================
-- 4. APPOINTMENT_QUALITY_FACTORS TABLE
-- ============================================================================
-- Track factors that contribute to appointment quality score

CREATE TABLE IF NOT EXISTS public.appointment_quality_factors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.schedule_bookings(id) ON DELETE CASCADE,
  
  -- Factor scores (0-1)
  travel_time_score numeric(3, 2) DEFAULT 1.0,
  weather_score numeric(3, 2) DEFAULT 1.0,
  daylight_score numeric(3, 2) DEFAULT 1.0,
  job_type_score numeric(3, 2) DEFAULT 1.0,
  lead_priority_score numeric(3, 2) DEFAULT 1.0,
  crew_availability_score numeric(3, 2) DEFAULT 1.0,
  storm_urgency_score numeric(3, 2) DEFAULT 1.0,
  
  -- Factor details
  travel_time_minutes integer,
  weather_condition text,
  daylight_hours_remaining numeric(4, 2),
  job_type text,
  lead_status text,
  crew_member_id uuid,
  storm_risk_level text,
  
  -- Overall
  overall_score numeric(3, 2),
  calculated_at timestamptz DEFAULT now(),
  
  UNIQUE(booking_id)
);

CREATE INDEX IF NOT EXISTS idx_appointment_quality_factors_booking 
  ON public.appointment_quality_factors(booking_id);

-- ============================================================================
-- 5. SCHEDULER_INSIGHTS TABLE
-- ============================================================================
-- Store scheduling metrics for insights page

CREATE TABLE IF NOT EXISTS public.scheduler_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Date range for these insights
  insight_date date NOT NULL,
  
  -- Metrics
  total_appointments integer DEFAULT 0,
  average_travel_time_minutes numeric(5, 2),
  peak_booking_hour integer, -- 0-23
  risky_schedule_patterns jsonb DEFAULT '{}'::jsonb,
  no_show_count integer DEFAULT 0,
  weather_cancellation_count integer DEFAULT 0,
  same_day_booking_count integer DEFAULT 0,
  priority_booking_count integer DEFAULT 0,
  
  -- Quality metrics
  average_quality_score numeric(3, 2),
  optimal_slot_count integer DEFAULT 0,
  good_slot_count integer DEFAULT 0,
  risky_slot_count integer DEFAULT 0,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(workspace_id, insight_date)
);

CREATE INDEX IF NOT EXISTS idx_scheduler_insights_workspace_date 
  ON public.scheduler_insights(workspace_id, insight_date DESC);

-- ============================================================================
-- 6. FUNCTIONS - TRAVEL TIME CALCULATION
-- ============================================================================

-- Function to calculate travel time between two addresses
-- This will be called from API which uses mapping service
CREATE OR REPLACE FUNCTION public.calculate_and_cache_travel_time(
  p_workspace_id uuid,
  p_from_address text,
  p_to_address text,
  p_travel_time_minutes integer,
  p_distance_miles numeric DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cached_id uuid;
BEGIN
  -- Insert or update cache
  INSERT INTO public.travel_cache (
    workspace_id,
    from_address,
    to_address,
    travel_time_minutes,
    distance_miles,
    expires_at
  )
  VALUES (
    p_workspace_id,
    p_from_address,
    p_to_address,
    p_travel_time_minutes,
    p_distance_miles,
    now() + interval '7 days'
  )
  ON CONFLICT (workspace_id, from_address, to_address)
  DO UPDATE SET
    travel_time_minutes = p_travel_time_minutes,
    distance_miles = p_distance_miles,
    cached_at = now(),
    expires_at = now() + interval '7 days';
  
  RETURN p_travel_time_minutes;
END;
$$;

-- Function to get travel time from cache or calculate
CREATE OR REPLACE FUNCTION public.get_travel_time(
  p_workspace_id uuid,
  p_from_address text,
  p_to_address text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cached_time integer;
BEGIN
  -- Check cache
  SELECT travel_time_minutes INTO v_cached_time
  FROM public.travel_cache
  WHERE workspace_id = p_workspace_id
    AND from_address = p_from_address
    AND to_address = p_to_address
    AND expires_at > now()
  LIMIT 1;
  
  RETURN v_cached_time; -- NULL if not cached, API will calculate
END;
$$;

-- ============================================================================
-- 7. FUNCTIONS - DAYLIGHT LOGIC
-- ============================================================================

-- Function to get sunrise/sunset times for a date and location
CREATE OR REPLACE FUNCTION public.get_daylight_times(
  p_date date,
  p_latitude numeric DEFAULT NULL,
  p_longitude numeric DEFAULT NULL,
  p_zip_code text DEFAULT NULL
)
RETURNS TABLE (
  sunrise_time timestamptz,
  sunset_time timestamptz,
  daylight_hours numeric(4, 2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sunrise timestamptz;
  v_sunset timestamptz;
  v_daylight_hours numeric(4, 2);
BEGIN
  -- For now, use approximate times based on date
  -- In production, this would call a sunrise/sunset API or use PostGIS
  -- Default to reasonable times (can be enhanced with actual API)
  
  -- Approximate: summer (June) = 5:30 AM - 8:30 PM, winter (Dec) = 7:00 AM - 5:00 PM
  -- This is a simplified version - should be replaced with actual calculation
  
  IF EXTRACT(MONTH FROM p_date) BETWEEN 4 AND 9 THEN
    -- Spring/Summer: longer days
    v_sunrise := (p_date::text || ' 05:30:00')::timestamptz;
    v_sunset := (p_date::text || ' 20:30:00')::timestamptz;
  ELSE
    -- Fall/Winter: shorter days
    v_sunrise := (p_date::text || ' 07:00:00')::timestamptz;
    v_sunset := (p_date::text || ' 17:00:00')::timestamptz;
  END IF;
  
  v_daylight_hours := EXTRACT(EPOCH FROM (v_sunset - v_sunrise)) / 3600.0;
  
  RETURN QUERY SELECT v_sunrise, v_sunset, v_daylight_hours;
END;
$$;

-- Function to check if time slot is within daylight hours
CREATE OR REPLACE FUNCTION public.is_daylight_safe(
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_workspace_id uuid,
  p_location_address text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_settings public.scheduler_settings%ROWTYPE;
  v_daylight RECORD;
  v_sunrise timestamptz;
  v_sunset timestamptz;
  v_safe_start timestamptz;
  v_safe_end timestamptz;
BEGIN
  -- Get scheduler settings
  SELECT * INTO v_settings
  FROM public.scheduler_settings
  WHERE workspace_id = p_workspace_id;
  
  -- If daylight not required, return true
  IF NOT FOUND OR NOT v_settings.require_daylight THEN
    RETURN true;
  END IF;
  
  -- Get daylight times
  SELECT * INTO v_daylight
  FROM public.get_daylight_times(
    p_date := DATE(p_start_time),
    p_zip_code := v_settings.office_zip
  );
  
  v_sunrise := v_daylight.sunrise_time;
  v_sunset := v_daylight.sunset_time;
  
  -- Add buffers
  v_safe_start := v_sunrise + (v_settings.daylight_start_buffer_minutes || ' minutes')::interval;
  v_safe_end := v_sunset - (v_settings.daylight_end_buffer_minutes || ' minutes')::interval;
  
  -- Check if slot is within safe daylight window
  RETURN p_start_time >= v_safe_start AND p_end_time <= v_safe_end;
END;
$$;

-- ============================================================================
-- 8. FUNCTIONS - APPOINTMENT QUALITY SCORING
-- ============================================================================

-- Function to calculate appointment quality score
CREATE OR REPLACE FUNCTION public.calculate_appointment_quality_score(
  p_booking_id uuid
)
RETURNS numeric(3, 2)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_booking public.schedule_bookings%ROWTYPE;
  v_settings public.scheduler_settings%ROWTYPE;
  v_factors public.appointment_quality_factors%ROWTYPE;
  v_score numeric(3, 2) := 1.0;
  v_travel_score numeric(3, 2) := 1.0;
  v_weather_score numeric(3, 2) := 1.0;
  v_daylight_score numeric(3, 2) := 1.0;
  v_job_type_score numeric(3, 2) := 1.0;
  v_lead_score numeric(3, 2) := 1.0;
  v_storm_score numeric(3, 2) := 1.0;
BEGIN
  -- Get booking
  SELECT * INTO v_booking
  FROM public.schedule_bookings
  WHERE id = p_booking_id;
  
  IF NOT FOUND THEN
    RETURN 0.0;
  END IF;
  
  -- Get settings
  SELECT * INTO v_settings
  FROM public.scheduler_settings
  WHERE workspace_id = v_booking.workspace_id;
  
  -- Travel time score (shorter = better, max 60 min = score 1.0, 120+ min = score 0.3)
  IF v_booking.travel_time_from_previous IS NOT NULL THEN
    IF v_booking.travel_time_from_previous <= 15 THEN
      v_travel_score := 1.0;
    ELSIF v_booking.travel_time_from_previous <= 30 THEN
      v_travel_score := 0.9;
    ELSIF v_booking.travel_time_from_previous <= 45 THEN
      v_travel_score := 0.7;
    ELSIF v_booking.travel_time_from_previous <= 60 THEN
      v_travel_score := 0.5;
    ELSE
      v_travel_score := 0.3;
    END IF;
  END IF;
  
  -- Weather score (from weather_at_appointment or weather_blocks)
  IF v_booking.weather_at_appointment IS NOT NULL THEN
    -- If weather data exists and is safe, score = 1.0, else = 0.3
    v_weather_score := CASE 
      WHEN (v_booking.weather_at_appointment->>'safe')::boolean THEN 1.0
      ELSE 0.3
    END;
  ELSE
    v_weather_score := 1.0; -- No weather data = assume safe
  END IF;
  
  -- Daylight score
  IF v_booking.daylight_safe THEN
    v_daylight_score := 1.0;
  ELSE
    v_daylight_score := 0.2; -- Very low score if not daylight safe
  END IF;
  
  -- Job type score (insurance/storm = higher priority = better score)
  v_job_type_score := CASE v_booking.appointment_type
    WHEN 'insurance_inspection' THEN 1.0
    WHEN 'storm_damage_assessment' THEN 1.0
    WHEN 'full_roof_estimate' THEN 0.9
    WHEN 'roof_inspection' THEN 0.8
    WHEN 'leak_check' THEN 0.7
    ELSE 0.6
  END;
  
  -- Lead priority score (from contact)
  IF v_booking.contact_id IS NOT NULL THEN
    SELECT 
      CASE lead_status
        WHEN 'hot' THEN 1.0
        WHEN 'warm' THEN 0.8
        WHEN 'cold' THEN 0.6
        ELSE 0.5
      END INTO v_lead_score
    FROM public.contacts
    WHERE id = v_booking.contact_id;
  END IF;
  
  -- Storm urgency score
  v_storm_score := CASE v_booking.storm_risk
    WHEN 'urgent' THEN 1.0
    WHEN 'high' THEN 0.9
    WHEN 'medium' THEN 0.7
    WHEN 'low' THEN 0.5
    ELSE 0.3
  END;
  
  -- Calculate weighted average
  v_score := (
    (v_travel_score * 0.25) +
    (v_weather_score * 0.20) +
    (v_daylight_score * 0.15) +
    (v_job_type_score * 0.15) +
    (v_lead_score * 0.15) +
    (v_storm_score * 0.10)
  );
  
  -- Determine category
  DECLARE
    v_category text;
  BEGIN
    IF v_score >= 0.85 THEN
      v_category := 'optimal';
    ELSIF v_score >= 0.65 THEN
      v_category := 'good';
    ELSE
      v_category := 'risky';
    END IF;
    
    -- Update booking with score and category
    UPDATE public.schedule_bookings
    SET 
      quality_score = v_score,
      quality_category = v_category,
      updated_at = now()
    WHERE id = p_booking_id;
    
    -- Store factors
    INSERT INTO public.appointment_quality_factors (
      booking_id,
      travel_time_score,
      weather_score,
      daylight_score,
      job_type_score,
      lead_priority_score,
      storm_urgency_score,
      travel_time_minutes,
      job_type,
      storm_risk_level,
      overall_score
    )
    VALUES (
      p_booking_id,
      v_travel_score,
      v_weather_score,
      v_daylight_score,
      v_job_type_score,
      v_lead_score,
      v_storm_score,
      v_booking.travel_time_from_previous,
      v_booking.appointment_type,
      v_booking.storm_risk::text,
      v_score
    )
    ON CONFLICT (booking_id)
    DO UPDATE SET
      travel_time_score = v_travel_score,
      weather_score = v_weather_score,
      daylight_score = v_daylight_score,
      job_type_score = v_job_type_score,
      lead_priority_score = v_lead_score,
      storm_urgency_score = v_storm_score,
      travel_time_minutes = v_booking.travel_time_from_previous,
      job_type = v_booking.appointment_type,
      storm_risk_level = v_booking.storm_risk::text,
      overall_score = v_score,
      calculated_at = now();
  END;
  
  RETURN v_score;
END;
$$;

-- ============================================================================
-- 9. FUNCTIONS - ENHANCED SLOT CALCULATION WITH TRAVEL TIME
-- ============================================================================

-- Enhanced function to get available slots with travel time awareness
CREATE OR REPLACE FUNCTION public.get_smart_available_slots(
  p_workspace_id uuid,
  p_date date,
  p_duration integer DEFAULT 30,
  p_property_address text DEFAULT NULL,
  p_appointment_type text DEFAULT NULL,
  p_contact_id uuid DEFAULT NULL,
  p_exclude_booking_id uuid DEFAULT NULL -- For re-scheduling
)
RETURNS TABLE (
  start_time timestamptz,
  end_time timestamptz,
  travel_time_from_previous integer,
  travel_time_from_office integer,
  quality_score numeric(3, 2),
  quality_category text,
  weather_safe boolean,
  daylight_safe boolean,
  available boolean,
  reason text -- Why slot is available or not
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_settings public.scheduler_settings%ROWTYPE;
  v_slot_start timestamptz;
  v_slot_end timestamptz;
  v_previous_booking public.schedule_bookings%ROWTYPE;
  v_travel_time integer;
  v_office_travel_time integer;
  v_quality_score numeric(3, 2);
  v_quality_category text;
  v_weather_safe boolean;
  v_daylight_safe boolean;
  v_available boolean;
  v_reason text;
BEGIN
  -- Get settings
  SELECT * INTO v_settings
  FROM public.scheduler_settings
  WHERE workspace_id = p_workspace_id;
  
  IF NOT FOUND THEN
    -- Use defaults
    v_settings.travel_time_enabled := true;
    v_settings.travel_buffer_minutes := 15;
    v_settings.max_travel_time_minutes := 60;
    v_settings.require_daylight := true;
    v_settings.quality_scoring_enabled := true;
    v_settings.hide_risky_slots := false;
  END IF;
  
  -- Get base available slots (from existing function)
  FOR v_slot_start, v_slot_end IN 
    SELECT start_time, end_time
    FROM public.get_weather_aware_time_slots(
      p_workspace_id,
      p_date,
      p_duration,
      p_property_address,
      NULL -- zip
    )
    WHERE weather_safe = true -- Only weather-safe slots
  LOOP
    v_available := true;
    v_reason := 'Available';
    v_travel_time := NULL;
    v_office_travel_time := NULL;
    v_quality_score := 1.0;
    v_quality_category := 'good';
    
    -- Check daylight
    v_daylight_safe := public.is_daylight_safe(
      v_slot_start,
      v_slot_end,
      p_workspace_id,
      p_property_address
    );
    
    IF NOT v_daylight_safe THEN
      IF v_settings.require_daylight THEN
        v_available := false;
        v_reason := 'Outside daylight hours';
      ELSE
        v_reason := 'Low daylight warning';
      END IF;
    END IF;
    
    -- Get previous appointment for travel time calculation
    IF v_settings.travel_time_enabled AND p_property_address IS NOT NULL THEN
      -- Find previous appointment on same day
      SELECT * INTO v_previous_booking
      FROM public.schedule_bookings
      WHERE workspace_id = p_workspace_id
        AND DATE(start_time) = p_date
        AND start_time < v_slot_start
        AND status IN ('booked', 'confirmed')
        AND (p_exclude_booking_id IS NULL OR id != p_exclude_booking_id)
      ORDER BY start_time DESC
      LIMIT 1;
      
      -- Calculate travel time from previous appointment
      IF v_previous_booking.id IS NOT NULL THEN
        SELECT travel_time_minutes INTO v_travel_time
        FROM public.get_travel_time(
          p_workspace_id,
          v_previous_booking.property_address,
          p_property_address
        );
        
        -- If not cached, estimate (1 mile = 2 minutes average)
        IF v_travel_time IS NULL THEN
          -- Estimate: will be calculated by API
          v_travel_time := NULL; -- API will calculate
        END IF;
        
        -- Check if travel time makes slot impossible
        IF v_travel_time IS NOT NULL THEN
          DECLARE
            v_previous_end timestamptz;
            v_required_start timestamptz;
          BEGIN
            v_previous_end := v_previous_booking.end_time;
            v_required_start := v_previous_end + 
              (v_settings.buffer_between_jobs_minutes || ' minutes')::interval +
              (v_travel_time || ' minutes')::interval +
              (v_settings.travel_buffer_minutes || ' minutes')::interval;
            
            IF v_slot_start < v_required_start THEN
              v_available := false;
              v_reason := format('Cannot reach in time (need %s min travel + buffer)', v_travel_time);
            END IF;
            
            -- Check max travel time
            IF v_travel_time > v_settings.max_travel_time_minutes THEN
              v_available := false;
              v_reason := format('Travel time too long (%s min)', v_travel_time);
            END IF;
          END;
        END IF;
      END IF;
      
      -- Calculate travel time from office
      IF v_settings.office_address IS NOT NULL THEN
        SELECT travel_time_minutes INTO v_office_travel_time
        FROM public.get_travel_time(
          p_workspace_id,
          v_settings.office_address,
          p_property_address
        );
      END IF;
    END IF;
    
    -- Calculate quality score (simplified)
    IF v_settings.quality_scoring_enabled THEN
      -- Simple scoring based on factors
      v_quality_score := 1.0;
      
      -- Reduce score for travel time
      IF v_travel_time IS NOT NULL THEN
        IF v_travel_time > 45 THEN
          v_quality_score := v_quality_score - 0.3;
        ELSIF v_travel_time > 30 THEN
          v_quality_score := v_quality_score - 0.2;
        ELSIF v_travel_time > 15 THEN
          v_quality_score := v_quality_score - 0.1;
        END IF;
      END IF;
      
      -- Reduce score if not daylight safe
      IF NOT v_daylight_safe THEN
        v_quality_score := v_quality_score - 0.2;
      END IF;
      
      -- Determine category
      IF v_quality_score >= 0.85 THEN
        v_quality_category := 'optimal';
      ELSIF v_quality_score >= 0.65 THEN
        v_quality_category := 'good';
      ELSE
        v_quality_category := 'risky';
      END IF;
      
      -- Hide risky slots if configured
      IF v_settings.hide_risky_slots AND v_quality_category = 'risky' THEN
        v_available := false;
        v_reason := 'Risky slot (hidden)';
      END IF;
      
      -- Check min quality score
      IF v_quality_score < COALESCE(v_settings.min_quality_score, 0.5) THEN
        v_available := false;
        v_reason := format('Quality score too low (%.2f)', v_quality_score);
      END IF;
    END IF;
    
    -- Check weather (already filtered, but double-check)
    v_weather_safe := true; -- Already filtered by get_weather_aware_time_slots
    
    -- Return slot
    IF v_available THEN
      RETURN QUERY SELECT 
        v_slot_start,
        v_slot_end,
        v_travel_time,
        v_office_travel_time,
        v_quality_score,
        v_quality_category,
        v_weather_safe,
        v_daylight_safe,
        true,
        v_reason;
    END IF;
  END LOOP;
  
  RETURN;
END;
$$;

-- ============================================================================
-- 10. FUNCTIONS - PRIORITY BOOKING LOGIC
-- ============================================================================

-- Function to get priority-ordered available slots
CREATE OR REPLACE FUNCTION public.get_priority_slots(
  p_workspace_id uuid,
  p_date date,
  p_duration integer DEFAULT 30,
  p_property_address text DEFAULT NULL,
  p_appointment_type text DEFAULT NULL,
  p_contact_id uuid DEFAULT NULL,
  p_lead_priority text DEFAULT NULL -- 'insurance', 'storm', 'hot', 'warm', 'cold'
)
RETURNS TABLE (
  start_time timestamptz,
  end_time timestamptz,
  priority_rank integer,
  quality_score numeric(3, 2),
  reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_settings public.scheduler_settings%ROWTYPE;
  v_rank integer := 1;
BEGIN
  -- Get settings
  SELECT * INTO v_settings
  FROM public.scheduler_settings
  WHERE workspace_id = p_workspace_id;
  
  -- Get smart slots
  FOR v_rank, start_time, end_time, quality_score, reason IN
    SELECT 
      ROW_NUMBER() OVER (ORDER BY 
        CASE 
          WHEN p_lead_priority = 'insurance' AND v_settings.priority_insurance_leads THEN 1
          WHEN p_lead_priority = 'storm' AND v_settings.priority_storm_damage THEN 2
          WHEN p_lead_priority = 'hot' AND v_settings.priority_hot_leads THEN 3
          ELSE 4
        END,
        quality_score DESC,
        start_time ASC
      )::integer as rank,
      start_time,
      end_time,
      quality_score,
      reason
    FROM public.get_smart_available_slots(
      p_workspace_id,
      p_date,
      p_duration,
      p_property_address,
      p_appointment_type,
      p_contact_id
    )
    WHERE available = true
  LOOP
    RETURN QUERY SELECT 
      start_time,
      end_time,
      v_rank,
      quality_score,
      reason;
  END LOOP;
  
  RETURN;
END;
$$;

-- ============================================================================
-- 11. FUNCTIONS - CONFLICT RESOLUTION
-- ============================================================================

-- Function to detect and resolve appointment conflicts
CREATE OR REPLACE FUNCTION public.detect_appointment_conflict(
  p_workspace_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_exclude_booking_id uuid DEFAULT NULL
)
RETURNS TABLE (
  conflict_exists boolean,
  conflicting_booking_id uuid,
  conflict_type text -- 'overlap', 'travel_time', 'crew_unavailable'
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_conflict_id uuid;
BEGIN
  -- Check for overlapping bookings
  SELECT id INTO v_conflict_id
  FROM public.schedule_bookings
  WHERE workspace_id = p_workspace_id
    AND status IN ('booked', 'confirmed')
    AND (p_exclude_booking_id IS NULL OR id != p_exclude_booking_id)
    AND (start_time, end_time) OVERLAPS (p_start_time, p_end_time)
  LIMIT 1;
  
  IF v_conflict_id IS NOT NULL THEN
    RETURN QUERY SELECT true, v_conflict_id, 'overlap';
    RETURN;
  END IF;
  
  -- No conflict
  RETURN QUERY SELECT false, NULL::uuid, NULL::text;
END;
$$;

-- ============================================================================
-- 12. FUNCTIONS - CREW ROUTING
-- ============================================================================

-- Function to assign crew member to appointment based on location
CREATE OR REPLACE FUNCTION public.assign_crew_to_appointment(
  p_booking_id uuid,
  p_property_address text,
  p_preferred_user_id uuid DEFAULT NULL
)
RETURNS uuid -- Returns assigned user_id
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_booking public.schedule_bookings%ROWTYPE;
  v_assigned_user_id uuid;
  v_settings public.scheduler_settings%ROWTYPE;
BEGIN
  -- Get booking
  SELECT * INTO v_booking
  FROM public.schedule_bookings
  WHERE id = p_booking_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;
  
  -- Get settings
  SELECT * INTO v_settings
  FROM public.scheduler_settings
  WHERE workspace_id = v_booking.workspace_id;
  
  -- If preferred user provided and available, use them
  IF p_preferred_user_id IS NOT NULL THEN
    -- Check if user is available at this time
    IF NOT EXISTS (
      SELECT 1 FROM public.schedule_bookings
      WHERE workspace_id = v_booking.workspace_id
        AND assigned_to_user_id = p_preferred_user_id
        AND status IN ('booked', 'confirmed')
        AND (start_time, end_time) OVERLAPS (v_booking.start_time, v_booking.end_time)
        AND id != p_booking_id
    ) THEN
      v_assigned_user_id := p_preferred_user_id;
    END IF;
  END IF;
  
  -- If no preferred user or not available, find closest available crew member
  IF v_assigned_user_id IS NULL THEN
    -- For v1, assign to first available workspace member
    -- In v2, this would calculate travel times and pick closest
    SELECT user_id INTO v_assigned_user_id
    FROM public.workspace_members
    WHERE workspace_id = v_booking.workspace_id
      AND role IN ('owner', 'admin', 'member')
      AND user_id NOT IN (
        SELECT assigned_to_user_id
        FROM public.schedule_bookings
        WHERE workspace_id = v_booking.workspace_id
          AND status IN ('booked', 'confirmed')
          AND (start_time, end_time) OVERLAPS (v_booking.start_time, v_booking.end_time)
          AND assigned_to_user_id IS NOT NULL
          AND id != p_booking_id
      )
    LIMIT 1;
  END IF;
  
  -- Create assignment
  IF v_assigned_user_id IS NOT NULL THEN
    INSERT INTO public.crew_assignments (
      workspace_id,
      booking_id,
      user_id,
      assignment_reason,
      crew_member_address
    )
    VALUES (
      v_booking.workspace_id,
      p_booking_id,
      v_assigned_user_id,
      CASE WHEN p_preferred_user_id IS NOT NULL THEN 'manual' ELSE 'load_balancing' END,
      NULL -- Will be populated from user profile
    )
    ON CONFLICT (booking_id, user_id) DO NOTHING;
    
    -- Update booking
    UPDATE public.schedule_bookings
    SET assigned_to_user_id = v_assigned_user_id
    WHERE id = p_booking_id;
  END IF;
  
  RETURN v_assigned_user_id;
END;
$$;

-- ============================================================================
-- 13. FUNCTIONS - RE-SCHEDULING INTELLIGENCE
-- ============================================================================

-- Function to get best alternative slots when re-scheduling
CREATE OR REPLACE FUNCTION public.get_reschedule_alternatives(
  p_booking_id uuid,
  p_preferred_date date DEFAULT NULL,
  p_max_alternatives integer DEFAULT 3
)
RETURNS TABLE (
  start_time timestamptz,
  end_time timestamptz,
  quality_score numeric(3, 2),
  travel_time_from_previous integer,
  rank integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_booking public.schedule_bookings%ROWTYPE;
  v_target_date date;
  v_rank integer := 1;
BEGIN
  -- Get original booking
  SELECT * INTO v_booking
  FROM public.schedule_bookings
  WHERE id = p_booking_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Use preferred date or next 7 days
  v_target_date := COALESCE(p_preferred_date, CURRENT_DATE + 1);
  
  -- Get smart slots for target date and next few days
  FOR v_rank, start_time, end_time, quality_score, travel_time_from_previous IN
    SELECT 
      ROW_NUMBER() OVER (ORDER BY 
        CASE WHEN DATE(start_time) = v_target_date THEN 1 ELSE 2 END,
        quality_score DESC,
        start_time ASC
      )::integer as rank,
      start_time,
      end_time,
      quality_score,
      travel_time_from_previous
    FROM public.get_smart_available_slots(
      v_booking.workspace_id,
      v_target_date,
      v_booking.duration,
      v_booking.property_address,
      v_booking.appointment_type,
      v_booking.contact_id,
      p_booking_id -- Exclude current booking
    )
    WHERE available = true
      AND DATE(start_time) BETWEEN v_target_date AND v_target_date + 7
    LIMIT p_max_alternatives
  LOOP
    RETURN QUERY SELECT 
      start_time,
      end_time,
      quality_score,
      travel_time_from_previous,
      v_rank;
  END LOOP;
  
  RETURN;
END;
$$;

-- ============================================================================
-- 14. TRIGGERS
-- ============================================================================

-- Trigger to calculate quality score when booking is created/updated
CREATE OR REPLACE FUNCTION public.trigger_calculate_quality_score()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Calculate quality score after booking is created/updated
  IF NEW.status IN ('booked', 'confirmed') THEN
    PERFORM public.calculate_appointment_quality_score(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_calculate_quality_score ON public.schedule_bookings;
CREATE TRIGGER trg_calculate_quality_score
  AFTER INSERT OR UPDATE ON public.schedule_bookings
  FOR EACH ROW
  WHEN (NEW.status IN ('booked', 'confirmed'))
  EXECUTE FUNCTION public.trigger_calculate_quality_score();

-- ============================================================================
-- 15. RLS POLICIES
-- ============================================================================

ALTER TABLE public.crew_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_quality_factors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduler_insights ENABLE ROW LEVEL SECURITY;

-- Crew assignments: workspace members can read/write
CREATE POLICY "crew_assignments_workspace_members"
  ON public.crew_assignments
  FOR ALL
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

-- Appointment quality factors: workspace members can read
CREATE POLICY "appointment_quality_factors_workspace_members"
  ON public.appointment_quality_factors
  FOR SELECT
  USING (
    booking_id IN (
      SELECT id FROM public.schedule_bookings
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    )
  );

-- Scheduler insights: workspace members can read
CREATE POLICY "scheduler_insights_workspace_members"
  ON public.scheduler_insights
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- 16. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.crew_assignments IS 'Track which team members are assigned to which appointments';
COMMENT ON TABLE public.appointment_quality_factors IS 'Track factors that contribute to appointment quality score';
COMMENT ON TABLE public.scheduler_insights IS 'Store scheduling metrics for insights page';
COMMENT ON FUNCTION public.calculate_and_cache_travel_time IS 'Calculate and cache travel time between addresses';
COMMENT ON FUNCTION public.get_travel_time IS 'Get travel time from cache or return NULL for API calculation';
COMMENT ON FUNCTION public.get_daylight_times IS 'Get sunrise/sunset times for a date and location';
COMMENT ON FUNCTION public.is_daylight_safe IS 'Check if time slot is within daylight hours';
COMMENT ON FUNCTION public.calculate_appointment_quality_score IS 'Calculate appointment quality score based on multiple factors';
COMMENT ON FUNCTION public.get_smart_available_slots IS 'Get available slots with travel time awareness, weather, daylight, and quality scoring';
COMMENT ON FUNCTION public.get_priority_slots IS 'Get priority-ordered available slots based on lead priority';
COMMENT ON FUNCTION public.detect_appointment_conflict IS 'Detect appointment conflicts (overlap, travel time, crew)';
COMMENT ON FUNCTION public.assign_crew_to_appointment IS 'Assign crew member to appointment based on location and availability';
COMMENT ON FUNCTION public.get_reschedule_alternatives IS 'Get best alternative slots when re-scheduling';

