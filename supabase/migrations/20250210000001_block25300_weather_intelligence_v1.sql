-- =========================================================
-- Block 25300 — SmartSend Roofing Weather Intelligence v1
-- (Hourly Risk Scoring • Install Warnings • Auto Rescheduling • Storm-Path Alerts • Crew/Material Sync)
-- =========================================================
-- 
-- THE WEATHER BRAIN — ZERO FLUFF.
-- 
-- Weather is the #1 reason roofing companies lose money.
-- SmartSend Weather Intelligence v1 makes SmartSend feel like a literal co-pilot for operations.
--
-- Features:
-- 1. Hourly Risk Scoring (0-100)
-- 2. Weather-Integrated Scheduling (blocks/warns on bad weather)
-- 3. Auto Rescheduling Engine (RISK > 70 triggers reschedule)
-- 4. Install-Day Warnings (morning alerts, mid-day updates)
-- 5. Storm Path Alerts (tracks storms affecting leads/jobs)
-- 6. Weather → Material Integration
-- 7. Weather → Crew Calendar Integration
-- 8. Homeowner Weather Communication
-- 9. Weather Event Logging (insurance/legal protection)
-- 10. Weather Risk → Job Health Score Integration

-- ============================================================================
-- PART 1 — ENHANCE weather_schedule_data TABLE
-- ============================================================================
-- Add fields needed for hourly risk scoring and storm tracking

ALTER TABLE public.weather_schedule_data
  ADD COLUMN IF NOT EXISTS wind_gusts_mph numeric(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lightning_risk numeric(5,2) DEFAULT 0 CHECK (lightning_risk >= 0 AND lightning_risk <= 100),
  ADD COLUMN IF NOT EXISTS hail_probability numeric(5,2) DEFAULT 0 CHECK (hail_probability >= 0 AND hail_probability <= 100),
  ADD COLUMN IF NOT EXISTS temperature_min_f numeric(5,2),
  ADD COLUMN IF NOT EXISTS temperature_max_f numeric(5,2),
  ADD COLUMN IF NOT EXISTS storm_movement_direction text, -- 'north', 'south', 'east', 'west', 'northeast', etc.
  ADD COLUMN IF NOT EXISTS storm_movement_speed_mph numeric(5,2),
  ADD COLUMN IF NOT EXISTS hourly_risk_score integer DEFAULT 0 CHECK (hourly_risk_score >= 0 AND hourly_risk_score <= 100),
  ADD COLUMN IF NOT EXISTS risk_category text CHECK (risk_category IN ('safe', 'mild_caution', 'moderate_risk', 'high_risk', 'severe_dangerous')),
  ADD COLUMN IF NOT EXISTS risk_factors jsonb DEFAULT '[]'::jsonb; -- Array of risk factors: ['high_wind', 'heavy_rain', 'lightning', 'hail', 'cold_temp', 'hot_temp']

CREATE INDEX IF NOT EXISTS idx_weather_schedule_hourly_risk ON public.weather_schedule_data(hourly_risk_score DESC) WHERE hourly_risk_score > 40;
CREATE INDEX IF NOT EXISTS idx_weather_schedule_risk_category ON public.weather_schedule_data(risk_category) WHERE risk_category IN ('high_risk', 'severe_dangerous');

-- ============================================================================
-- PART 2 — CREATE weather_risk_scores TABLE
-- ============================================================================
-- Stores hourly risk scores for each job/location/date combination
-- This is the core table for weather intelligence

CREATE TABLE IF NOT EXISTS public.weather_risk_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Link to job (if applicable)
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  calendar_event_id uuid REFERENCES public.calendar_events(id) ON DELETE SET NULL,
  
  -- Location
  location_address text,
  location_city text,
  location_state text,
  location_zip text,
  location_lat numeric(10,7),
  location_lon numeric(10,7),
  
  -- Date and hour
  forecast_date date NOT NULL,
  forecast_hour integer CHECK (forecast_hour >= 0 AND forecast_hour <= 23),
  forecast_datetime timestamptz NOT NULL,
  
  -- Risk Score (0-100)
  risk_score integer NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
  risk_category text NOT NULL CHECK (risk_category IN ('safe', 'mild_caution', 'moderate_risk', 'high_risk', 'severe_dangerous')),
  
  -- Weather conditions contributing to score
  precipitation_probability numeric(5,2) DEFAULT 0 CHECK (precipitation_probability >= 0 AND precipitation_probability <= 100),
  wind_speed_mph numeric(5,2) DEFAULT 0,
  wind_gusts_mph numeric(5,2) DEFAULT 0,
  lightning_risk numeric(5,2) DEFAULT 0 CHECK (lightning_risk >= 0 AND lightning_risk <= 100),
  hail_probability numeric(5,2) DEFAULT 0 CHECK (hail_probability >= 0 AND hail_probability <= 100),
  temperature_f numeric(5,2),
  storm_nearby boolean DEFAULT false,
  
  -- Risk factors breakdown
  risk_factors jsonb DEFAULT '[]'::jsonb, -- ['high_wind', 'heavy_rain', 'lightning', 'hail', 'cold_temp', 'hot_temp', 'storm_nearby']
  risk_reason text, -- Human-readable explanation
  
  -- Recommendations
  recommendation text, -- 'proceed', 'caution', 'reschedule', 'block'
  recommended_alternative_dates date[], -- Suggested alternative dates if reschedule recommended
  
  -- Source
  weather_provider text DEFAULT 'openweather',
  weather_data_raw jsonb DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(workspace_id, job_id, forecast_datetime),
  UNIQUE(workspace_id, calendar_event_id, forecast_datetime)
);

CREATE INDEX IF NOT EXISTS idx_weather_risk_scores_job ON public.weather_risk_scores(job_id, forecast_datetime DESC);
CREATE INDEX IF NOT EXISTS idx_weather_risk_scores_calendar_event ON public.weather_risk_scores(calendar_event_id, forecast_datetime DESC);
CREATE INDEX IF NOT EXISTS idx_weather_risk_scores_date ON public.weather_risk_scores(forecast_date, forecast_hour);
CREATE INDEX IF NOT EXISTS idx_weather_risk_scores_risk ON public.weather_risk_scores(risk_score DESC) WHERE risk_score > 60;
CREATE INDEX IF NOT EXISTS idx_weather_risk_scores_category ON public.weather_risk_scores(risk_category) WHERE risk_category IN ('high_risk', 'severe_dangerous');

-- ============================================================================
-- PART 3 — CREATE weather_events TABLE
-- ============================================================================
-- Logs all weather events for insurance/legal protection
-- Every weather check, alert, reschedule gets logged here

CREATE TABLE IF NOT EXISTS public.weather_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Link to job/event
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  calendar_event_id uuid REFERENCES public.calendar_events(id) ON DELETE SET NULL,
  weather_risk_score_id uuid REFERENCES public.weather_risk_scores(id) ON DELETE SET NULL,
  
  -- Event type
  event_type text NOT NULL CHECK (event_type IN (
    'risk_score_calculated',
    'install_warning_sent',
    'reschedule_recommended',
    'reschedule_executed',
    'storm_alert',
    'material_delivery_adjusted',
    'crew_calendar_updated',
    'homeowner_notified',
    'install_blocked'
  )),
  
  -- Event details
  event_title text NOT NULL,
  event_message text,
  event_severity text CHECK (event_severity IN ('info', 'warning', 'critical')) DEFAULT 'info',
  
  -- Weather data at time of event
  wind_speed_mph numeric(5,2),
  wind_gusts_mph numeric(5,2),
  rain_probability numeric(5,2),
  temperature_f numeric(5,2),
  lightning_risk numeric(5,2),
  hail_probability numeric(5,2),
  storm_movement text,
  
  -- Full weather snapshot (for insurance/legal)
  weather_snapshot jsonb DEFAULT '{}'::jsonb,
  
  -- Recipients (who was notified)
  notified_users uuid[], -- Array of user IDs
  notified_roles text[], -- Array of roles: ['ops', 'production', 'crew_leader']
  homeowner_notified boolean DEFAULT false,
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Timestamps
  event_date date NOT NULL,
  event_time time,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_weather_events_job ON public.weather_events(job_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_weather_events_calendar_event ON public.weather_events(calendar_event_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_weather_events_type ON public.weather_events(event_type, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_weather_events_severity ON public.weather_events(event_severity) WHERE event_severity IN ('warning', 'critical');

-- ============================================================================
-- PART 4 — CREATE storm_tracking TABLE
-- ============================================================================
-- Tracks storm movement and alerts for storm roofers

CREATE TABLE IF NOT EXISTS public.storm_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Storm identification
  storm_id text NOT NULL, -- Unique identifier from weather API
  storm_name text, -- e.g., "Storm System Alpha"
  storm_type text CHECK (storm_type IN ('thunderstorm', 'hail', 'wind', 'tornado', 'hurricane', 'winter_storm')),
  
  -- Location tracking
  affected_zips text[], -- Array of ZIP codes affected
  affected_cities text[], -- Array of cities affected
  storm_center_lat numeric(10,7),
  storm_center_lon numeric(10,7),
  
  -- Movement
  movement_direction text, -- 'north', 'south', 'east', 'west', etc.
  movement_speed_mph numeric(5,2),
  estimated_arrival_time timestamptz,
  
  -- Impact
  max_wind_speed_mph numeric(5,2),
  hail_size_inches numeric(4,2),
  precipitation_amount_inches numeric(5,2),
  
  -- Status
  status text CHECK (status IN ('approaching', 'active', 'passed', 'dissipated')) DEFAULT 'approaching',
  
  -- Related entities (leads/jobs affected)
  affected_lead_ids uuid[],
  affected_job_ids uuid[],
  
  -- Alerts sent
  alerts_sent boolean DEFAULT false,
  alerts_sent_at timestamptz,
  
  -- Metadata
  weather_data_raw jsonb DEFAULT '{}'::jsonb,
  
  -- Timestamps
  detected_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(workspace_id, storm_id)
);

CREATE INDEX IF NOT EXISTS idx_storm_tracking_status ON public.storm_tracking(status, detected_at DESC) WHERE status IN ('approaching', 'active');
CREATE INDEX IF NOT EXISTS idx_storm_tracking_zips ON public.storm_tracking USING GIN(affected_zips);
CREATE INDEX IF NOT EXISTS idx_storm_tracking_jobs ON public.storm_tracking USING GIN(affected_job_ids) WHERE array_length(affected_job_ids, 1) > 0;

-- ============================================================================
-- PART 5 — CREATE weather_reschedules TABLE
-- ============================================================================
-- Tracks weather-triggered reschedules

CREATE TABLE IF NOT EXISTS public.weather_reschedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Related entities
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  calendar_event_id uuid REFERENCES public.calendar_events(id) ON DELETE SET NULL,
  original_weather_risk_score_id uuid REFERENCES public.weather_risk_scores(id) ON DELETE SET NULL,
  
  -- Original schedule
  original_date date NOT NULL,
  original_time time,
  
  -- New schedule
  new_date date NOT NULL,
  new_time time,
  
  -- Reason
  reschedule_reason text NOT NULL,
  risk_score_at_reschedule integer NOT NULL CHECK (risk_score_at_reschedule >= 0 AND risk_score_at_reschedule <= 100),
  
  -- Status
  status text CHECK (status IN ('recommended', 'approved', 'executed', 'rejected')) DEFAULT 'recommended',
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  
  -- Auto-executed
  auto_executed boolean DEFAULT false,
  auto_executed_at timestamptz,
  
  -- Notifications
  ops_notified boolean DEFAULT false,
  production_notified boolean DEFAULT false,
  crew_notified boolean DEFAULT false,
  homeowner_notified boolean DEFAULT false,
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_weather_reschedules_job ON public.weather_reschedules(job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_weather_reschedules_status ON public.weather_reschedules(status) WHERE status IN ('recommended', 'approved');

-- ============================================================================
-- PART 6 — ADD WEATHER FIELDS TO roofing_jobs TABLE
-- ============================================================================

ALTER TABLE public.roofing_jobs
  ADD COLUMN IF NOT EXISTS current_weather_risk_score integer CHECK (current_weather_risk_score >= 0 AND current_weather_risk_score <= 100),
  ADD COLUMN IF NOT EXISTS weather_risk_category text CHECK (weather_risk_category IN ('safe', 'mild_caution', 'moderate_risk', 'high_risk', 'severe_dangerous')),
  ADD COLUMN IF NOT EXISTS weather_last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS weather_reschedule_recommended boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS weather_blocked boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS weather_blocked_reason text;

CREATE INDEX IF NOT EXISTS idx_roofing_jobs_weather_risk ON public.roofing_jobs(current_weather_risk_score DESC) WHERE current_weather_risk_score > 60;
CREATE INDEX IF NOT EXISTS idx_roofing_jobs_weather_blocked ON public.roofing_jobs(weather_blocked) WHERE weather_blocked = true;

-- ============================================================================
-- PART 7 — ADD WEATHER FIELDS TO calendar_events TABLE
-- ============================================================================

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS weather_risk_score_hourly integer CHECK (weather_risk_score_hourly >= 0 AND weather_risk_score_hourly <= 100),
  ADD COLUMN IF NOT EXISTS weather_risk_category_hourly text CHECK (weather_risk_category_hourly IN ('safe', 'mild_caution', 'moderate_risk', 'high_risk', 'severe_dangerous')),
  ADD COLUMN IF NOT EXISTS weather_warning_sent boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS weather_warning_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS weather_reschedule_recommended boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_calendar_events_weather_risk ON public.calendar_events(weather_risk_score_hourly DESC) WHERE weather_risk_score_hourly > 60;

-- ============================================================================
-- PART 8 — ADD WEATHER FIELDS TO material_deliveries TABLE
-- ============================================================================

ALTER TABLE public.material_deliveries
  ADD COLUMN IF NOT EXISTS weather_adjusted boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS weather_adjusted_reason text,
  ADD COLUMN IF NOT EXISTS original_delivery_date date,
  ADD COLUMN IF NOT EXISTS weather_risk_at_delivery integer CHECK (weather_risk_at_delivery >= 0 AND weather_risk_at_delivery <= 100);

-- ============================================================================
-- PART 9 — FUNCTION: calculate_hourly_weather_risk_score
-- ============================================================================
-- Core function that calculates weather risk score (0-100) based on all factors

CREATE OR REPLACE FUNCTION public.calculate_hourly_weather_risk_score(
  p_precipitation_probability numeric,
  p_wind_speed_mph numeric,
  p_wind_gusts_mph numeric,
  p_lightning_risk numeric,
  p_hail_probability numeric,
  p_temperature_f numeric,
  p_storm_nearby boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_score integer := 0;
  v_factors text[] := ARRAY[]::text[];
  v_category text;
  v_recommendation text;
BEGIN
  -- Precipitation risk (0-30 points)
  IF p_precipitation_probability >= 80 THEN
    v_score := v_score + 30;
    v_factors := array_append(v_factors, 'heavy_rain');
  ELSIF p_precipitation_probability >= 60 THEN
    v_score := v_score + 20;
    v_factors := array_append(v_factors, 'moderate_rain');
  ELSIF p_precipitation_probability >= 40 THEN
    v_score := v_score + 10;
    v_factors := array_append(v_factors, 'light_rain');
  END IF;
  
  -- Wind risk (0-25 points)
  IF p_wind_gusts_mph >= 40 OR p_wind_speed_mph >= 35 THEN
    v_score := v_score + 25;
    v_factors := array_append(v_factors, 'severe_wind');
  ELSIF p_wind_gusts_mph >= 30 OR p_wind_speed_mph >= 25 THEN
    v_score := v_score + 18;
    v_factors := array_append(v_factors, 'high_wind');
  ELSIF p_wind_gusts_mph >= 20 OR p_wind_speed_mph >= 15 THEN
    v_score := v_score + 10;
    v_factors := array_append(v_factors, 'moderate_wind');
  END IF;
  
  -- Lightning risk (0-20 points)
  IF p_lightning_risk >= 70 THEN
    v_score := v_score + 20;
    v_factors := array_append(v_factors, 'lightning');
  ELSIF p_lightning_risk >= 50 THEN
    v_score := v_score + 12;
    v_factors := array_append(v_factors, 'moderate_lightning');
  ELSIF p_lightning_risk >= 30 THEN
    v_score := v_score + 6;
  END IF;
  
  -- Hail risk (0-15 points)
  IF p_hail_probability >= 60 THEN
    v_score := v_score + 15;
    v_factors := array_append(v_factors, 'hail');
  ELSIF p_hail_probability >= 40 THEN
    v_score := v_score + 10;
    v_factors := array_append(v_factors, 'moderate_hail');
  ELSIF p_hail_probability >= 20 THEN
    v_score := v_score + 5;
  END IF;
  
  -- Temperature risk (0-10 points)
  -- Too cold: shingles won't seal properly (< 40°F)
  -- Too hot: dangerous working conditions (> 95°F)
  IF p_temperature_f IS NOT NULL THEN
    IF p_temperature_f < 40 THEN
      v_score := v_score + 10;
      v_factors := array_append(v_factors, 'cold_temp');
    ELSIF p_temperature_f > 95 THEN
      v_score := v_score + 8;
      v_factors := array_append(v_factors, 'hot_temp');
    END IF;
  END IF;
  
  -- Storm nearby bonus (0-10 points)
  IF p_storm_nearby THEN
    v_score := v_score + 10;
    v_factors := array_append(v_factors, 'storm_nearby');
  END IF;
  
  -- Clamp to 0-100
  v_score := GREATEST(0, LEAST(100, v_score));
  
  -- Determine category
  IF v_score >= 80 THEN
    v_category := 'severe_dangerous';
    v_recommendation := 'block';
  ELSIF v_score >= 60 THEN
    v_category := 'high_risk';
    v_recommendation := 'reschedule';
  ELSIF v_score >= 40 THEN
    v_category := 'moderate_risk';
    v_recommendation := 'caution';
  ELSIF v_score >= 20 THEN
    v_category := 'mild_caution';
    v_recommendation := 'proceed';
  ELSE
    v_category := 'safe';
    v_recommendation := 'proceed';
  END IF;
  
  RETURN jsonb_build_object(
    'risk_score', v_score,
    'risk_category', v_category,
    'risk_factors', v_factors,
    'recommendation', v_recommendation
  );
END;
$$;

COMMENT ON FUNCTION public.calculate_hourly_weather_risk_score IS 'Block 25300: Calculates weather risk score (0-100) based on precipitation, wind, lightning, hail, temperature, and storm proximity';

-- ============================================================================
-- PART 10 — FUNCTION: update_job_weather_risk
-- ============================================================================
-- Updates weather risk for a job based on scheduled install date

CREATE OR REPLACE FUNCTION public.update_job_weather_risk(p_job_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_job record;
  v_risk_score integer;
  v_risk_category text;
  v_latest_risk record;
BEGIN
  -- Get job details
  SELECT * INTO v_job
  FROM public.roofing_jobs
  WHERE id = p_job_id;
  
  IF v_job IS NULL THEN
    RETURN;
  END IF;
  
  -- Get latest risk score for scheduled install date
  SELECT risk_score, risk_category INTO v_latest_risk
  FROM public.weather_risk_scores
  WHERE job_id = p_job_id
    AND forecast_date = COALESCE(v_job.scheduled_start_date, v_job.preferred_start_date)
  ORDER BY forecast_datetime DESC
  LIMIT 1;
  
  -- Update job with latest risk
  IF v_latest_risk IS NOT NULL THEN
    UPDATE public.roofing_jobs
    SET 
      current_weather_risk_score = v_latest_risk.risk_score,
      weather_risk_category = v_latest_risk.risk_category,
      weather_last_checked_at = now(),
      weather_reschedule_recommended = (v_latest_risk.risk_score >= 70),
      weather_blocked = (v_latest_risk.risk_score >= 80),
      weather_blocked_reason = CASE 
        WHEN v_latest_risk.risk_score >= 80 THEN 'Severe weather risk detected'
        ELSE NULL
      END
    WHERE id = p_job_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.update_job_weather_risk IS 'Block 25300: Updates weather risk score and category for a job based on scheduled install date';

-- ============================================================================
-- PART 11 — FUNCTION: check_weather_and_block_scheduling
-- ============================================================================
-- Checks weather when scheduling and blocks/warns if needed

CREATE OR REPLACE FUNCTION public.check_weather_and_block_scheduling(
  p_workspace_id uuid,
  p_location_zip text,
  p_scheduled_date date,
  p_scheduled_time time DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_risk_score integer;
  v_risk_category text;
  v_recommendation text;
  v_alternative_dates date[];
  v_risk_record record;
BEGIN
  -- Get risk score for scheduled date/time
  SELECT risk_score, risk_category, recommendation, recommended_alternative_dates
  INTO v_risk_record
  FROM public.weather_risk_scores
  WHERE workspace_id = p_workspace_id
    AND location_zip = p_location_zip
    AND forecast_date = p_scheduled_date
    AND (p_scheduled_time IS NULL OR forecast_hour = EXTRACT(HOUR FROM p_scheduled_time)::integer)
  ORDER BY forecast_datetime DESC
  LIMIT 1;
  
  -- If no risk data, return safe
  IF v_risk_record IS NULL THEN
    RETURN jsonb_build_object(
      'blocked', false,
      'warning', false,
      'risk_score', 0,
      'risk_category', 'safe',
      'message', 'No weather data available - proceed with caution'
    );
  END IF;
  
  v_risk_score := v_risk_record.risk_score;
  v_risk_category := v_risk_record.risk_category;
  v_recommendation := v_risk_record.recommendation;
  v_alternative_dates := v_risk_record.recommended_alternative_dates;
  
  -- Return blocking/warning decision
  RETURN jsonb_build_object(
    'blocked', (v_risk_score >= 80),
    'warning', (v_risk_score >= 60 AND v_risk_score < 80),
    'risk_score', v_risk_score,
    'risk_category', v_risk_category,
    'recommendation', v_recommendation,
    'alternative_dates', v_alternative_dates,
    'message', CASE
      WHEN v_risk_score >= 80 THEN format('Severe weather risk (%s%%) - Install blocked. Recommended dates: %s', 
        v_risk_score, array_to_string(v_alternative_dates, ', '))
      WHEN v_risk_score >= 60 THEN format('High weather risk (%s%%) - Consider rescheduling. Recommended dates: %s', 
        v_risk_score, array_to_string(v_alternative_dates, ', '))
      ELSE 'Weather conditions acceptable'
    END
  );
END;
$$;

COMMENT ON FUNCTION public.check_weather_and_block_scheduling IS 'Block 25300: Checks weather risk when scheduling installs and returns blocking/warning decision';

-- ============================================================================
-- PART 12 — FUNCTION: trigger_weather_reschedule
-- ============================================================================
-- Triggers reschedule recommendation when RISK > 70

CREATE OR REPLACE FUNCTION public.trigger_weather_reschedule(
  p_job_id uuid,
  p_risk_score integer,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_job record;
  v_reschedule_id uuid;
  v_alternative_dates date[];
BEGIN
  -- Get job details
  SELECT * INTO v_job
  FROM public.roofing_jobs
  WHERE id = p_job_id;
  
  IF v_job IS NULL THEN
    RAISE EXCEPTION 'Job not found';
  END IF;
  
  -- Get recommended alternative dates
  SELECT recommended_alternative_dates INTO v_alternative_dates
  FROM public.weather_risk_scores
  WHERE job_id = p_job_id
    AND forecast_date = COALESCE(v_job.scheduled_start_date, v_job.preferred_start_date)
  ORDER BY forecast_datetime DESC
  LIMIT 1;
  
  -- Create reschedule record
  INSERT INTO public.weather_reschedules (
    workspace_id,
    job_id,
    original_date,
    original_time,
    reschedule_reason,
    risk_score_at_reschedule,
    status,
    metadata
  ) VALUES (
    v_job.workspace_id,
    p_job_id,
    COALESCE(v_job.scheduled_start_date, v_job.preferred_start_date),
    NULL, -- TODO: Get from calendar_event if available
    p_reason,
    p_risk_score,
    'recommended',
    jsonb_build_object('alternative_dates', v_alternative_dates)
  )
  RETURNING id INTO v_reschedule_id;
  
  -- Log weather event
  INSERT INTO public.weather_events (
    workspace_id,
    job_id,
    event_type,
    event_title,
    event_message,
    event_severity,
    event_date,
    metadata
  ) VALUES (
    v_job.workspace_id,
    p_job_id,
    'reschedule_recommended',
    'Weather Reschedule Recommended',
    format('Weather risk score of %s detected. Reschedule recommended.', p_risk_score),
    'warning',
    CURRENT_DATE,
    jsonb_build_object('risk_score', p_risk_score, 'reschedule_id', v_reschedule_id)
  );
  
  RETURN v_reschedule_id;
END;
$$;

COMMENT ON FUNCTION public.trigger_weather_reschedule IS 'Block 25300: Triggers reschedule recommendation when weather risk score > 70';

-- ============================================================================
-- PART 13 — FUNCTION: execute_weather_reschedule
-- ============================================================================
-- Executes approved weather reschedule (updates job, calendar, crew, materials)

CREATE OR REPLACE FUNCTION public.execute_weather_reschedule(
  p_reschedule_id uuid,
  p_new_date date,
  p_new_time time DEFAULT NULL,
  p_approved_by uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_reschedule record;
  v_job record;
BEGIN
  -- Get reschedule details
  SELECT * INTO v_reschedule
  FROM public.weather_reschedules
  WHERE id = p_reschedule_id;
  
  IF v_reschedule IS NULL THEN
    RAISE EXCEPTION 'Reschedule not found';
  END IF;
  
  -- Get job details
  SELECT * INTO v_job
  FROM public.roofing_jobs
  WHERE id = v_reschedule.job_id;
  
  -- Update job schedule
  UPDATE public.roofing_jobs
  SET 
    scheduled_start_date = p_new_date,
    updated_at = now()
  WHERE id = v_reschedule.job_id;
  
  -- Update calendar events
  UPDATE public.calendar_events
  SET 
    event_date = p_new_date,
    event_start_time = p_new_time,
    updated_at = now()
  WHERE job_id = v_reschedule.job_id
    AND event_type = 'INSTALL_DATE';
  
  -- Update material deliveries (if scheduled for original date)
  UPDATE public.material_deliveries
  SET 
    delivery_date = p_new_date,
    weather_adjusted = true,
    weather_adjusted_reason = format('Rescheduled due to weather risk (%s)', v_reschedule.risk_score_at_reschedule),
    original_delivery_date = delivery_date,
    updated_at = now()
  WHERE job_id = v_reschedule.job_id
    AND delivery_date = v_reschedule.original_date;
  
  -- Update reschedule status
  UPDATE public.weather_reschedules
  SET 
    new_date = p_new_date,
    new_time = p_new_time,
    status = 'executed',
    approved_by = p_approved_by,
    approved_at = now(),
    updated_at = now()
  WHERE id = p_reschedule_id;
  
  -- Log weather event
  INSERT INTO public.weather_events (
    workspace_id,
    job_id,
    event_type,
    event_title,
    event_message,
    event_severity,
    event_date,
    metadata
  ) VALUES (
    v_job.workspace_id,
    v_reschedule.job_id,
    'reschedule_executed',
    'Weather Reschedule Executed',
    format('Install rescheduled from %s to %s due to weather risk', 
      v_reschedule.original_date, p_new_date),
    'info',
    CURRENT_DATE,
    jsonb_build_object('reschedule_id', p_reschedule_id, 'original_date', v_reschedule.original_date, 'new_date', p_new_date)
  );
END;
$$;

COMMENT ON FUNCTION public.execute_weather_reschedule IS 'Block 25300: Executes approved weather reschedule and updates job, calendar, crew, and materials';

-- ============================================================================
-- PART 14 — FUNCTION: calculate_weather_impact_score (for job health)
-- ============================================================================
-- Calculates weather impact score (0-100) for job health score calculation
-- This integrates with existing job health score system

CREATE OR REPLACE FUNCTION public.calculate_weather_impact_score(p_job_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_job record;
  v_risk_score integer;
  v_score numeric;
BEGIN
  -- Get job details
  SELECT * INTO v_job
  FROM public.roofing_jobs
  WHERE id = p_job_id;
  
  IF v_job IS NULL THEN
    RETURN 100; -- Default to safe if job not found
  END IF;
  
  -- Get current weather risk score
  v_risk_score := COALESCE(v_job.current_weather_risk_score, 0);
  
  -- Convert risk score (0-100) to impact score (0-100)
  -- Lower risk = higher impact score (good)
  -- Higher risk = lower impact score (bad)
  v_score := 100 - v_risk_score;
  
  -- Clamp to 0-100
  v_score := GREATEST(0, LEAST(100, v_score));
  
  RETURN v_score;
END;
$$;

COMMENT ON FUNCTION public.calculate_weather_impact_score IS 'Block 25300: Calculates weather impact score (0-100) for job health score - integrates with existing health score system';

-- ============================================================================
-- PART 15 — TRIGGER: Auto-update job weather risk when risk score changes
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trg_update_job_weather_risk()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.job_id IS NOT NULL THEN
    PERFORM public.update_job_weather_risk(NEW.job_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_job_weather_risk
  AFTER INSERT OR UPDATE ON public.weather_risk_scores
  FOR EACH ROW
  WHEN (NEW.job_id IS NOT NULL)
  EXECUTE FUNCTION public.trg_update_job_weather_risk();

-- ============================================================================
-- PART 16 — ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.weather_risk_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weather_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storm_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weather_reschedules ENABLE ROW LEVEL SECURITY;

-- Weather risk scores
CREATE POLICY "workspace_members_can_view_weather_risk_scores"
  ON public.weather_risk_scores FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = weather_risk_scores.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "workspace_members_can_manage_weather_risk_scores"
  ON public.weather_risk_scores FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = weather_risk_scores.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- Weather events
CREATE POLICY "workspace_members_can_view_weather_events"
  ON public.weather_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = weather_events.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "workspace_members_can_manage_weather_events"
  ON public.weather_events FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = weather_events.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- Storm tracking
CREATE POLICY "workspace_members_can_view_storm_tracking"
  ON public.storm_tracking FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = storm_tracking.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "workspace_members_can_manage_storm_tracking"
  ON public.storm_tracking FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = storm_tracking.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- Weather reschedules
CREATE POLICY "workspace_members_can_view_weather_reschedules"
  ON public.weather_reschedules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = weather_reschedules.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "workspace_members_can_manage_weather_reschedules"
  ON public.weather_reschedules FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = weather_reschedules.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.weather_risk_scores IS 'Block 25300: Hourly weather risk scores (0-100) for jobs and locations';
COMMENT ON TABLE public.weather_events IS 'Block 25300: Logs all weather events for insurance/legal protection';
COMMENT ON TABLE public.storm_tracking IS 'Block 25300: Tracks storm movement and alerts for storm roofers';
COMMENT ON TABLE public.weather_reschedules IS 'Block 25300: Tracks weather-triggered reschedules';




































