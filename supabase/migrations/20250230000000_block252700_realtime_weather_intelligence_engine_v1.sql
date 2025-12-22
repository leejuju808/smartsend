-- =========================================================
-- Block 252700 — SmartSend Real-Time Weather Intelligence Engine v1
-- "Delays, OSHA Heat Alerts, Rain/Wind Warnings, Auto-Schedule Adjustments"
-- =========================================================
-- 
-- This is the feature no roofing CRM in the world does properly.
-- When roofers see it, they will say:
-- "SmartSend knows the weather better than my foremen."
-- "We used to lose THOUSANDS from bad scheduling — now it never happens."
-- "We look stupid not using this."
-- 
-- Weather is the #1 cause of:
-- - job delays
-- - wasted crew time
-- - ruined materials
-- - OSHA violations
-- - callbacks
-- - angry customers
-- - scheduling chaos
-- 
-- SmartSend will FIX all of this.
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE job_weather_status TABLE
-- ============================================================================
-- Stores current weather forecast and risk level for each job

CREATE TABLE IF NOT EXISTS public.job_weather_status (
  job_id uuid PRIMARY KEY REFERENCES public.jobs(id) ON DELETE CASCADE,
  forecast jsonb DEFAULT '{}'::jsonb,           -- Full forecast data (hourly + daily)
  updated_at timestamptz DEFAULT now(),
  risk_level text DEFAULT 'normal' CHECK (risk_level IN ('normal', 'caution', 'high_risk')),
  
  -- Current conditions summary
  current_risk_score integer CHECK (current_risk_score >= 0 AND current_risk_score <= 100),
  current_heat_index_f numeric(5,2),            -- OSHA heat index
  current_wind_speed_mph numeric(5,2),
  current_rain_probability numeric(5,2),
  
  -- Next 48 hours summary
  next_48h_max_risk_score integer,
  next_48h_worst_conditions text,               -- 'rain', 'wind', 'heat', 'hail'
  next_48h_worst_time timestamptz,
  
  -- Material delivery protection
  material_delivery_risk_score integer,
  material_delivery_safe boolean DEFAULT true,
  
  -- Metadata
  last_checked_at timestamptz DEFAULT now(),
  weather_provider text DEFAULT 'openweather'
);

CREATE INDEX IF NOT EXISTS idx_job_weather_status_risk ON public.job_weather_status(risk_level, current_risk_score DESC) WHERE risk_level != 'normal';
CREATE INDEX IF NOT EXISTS idx_job_weather_status_updated ON public.job_weather_status(updated_at DESC);

COMMENT ON TABLE public.job_weather_status IS 'Block 252700: Current weather status and forecast for each job';
COMMENT ON COLUMN public.job_weather_status.current_heat_index_f IS 'OSHA heat index for worker safety compliance';

-- ============================================================================
-- PART 2 — ENHANCE weather_events TABLE
-- ============================================================================
-- Add event types specific to Block 252700

DO $$ 
BEGIN
  -- Check if we need to alter the enum (PostgreSQL doesn't support ALTER TYPE easily, so we'll use text with CHECK)
  -- The table already exists from Block 25300, so we'll just ensure our event types are supported
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'weather_events'
  ) THEN
    -- The event_type is already text with CHECK, so we can add new values
    -- But we need to drop and recreate the constraint if it exists
    ALTER TABLE public.weather_events 
      DROP CONSTRAINT IF EXISTS weather_events_event_type_check;
    
    ALTER TABLE public.weather_events
      ADD CONSTRAINT weather_events_event_type_check 
      CHECK (event_type IN (
        'risk_score_calculated',
        'install_warning_sent',
        'reschedule_recommended',
        'reschedule_executed',
        'storm_alert',
        'material_delivery_adjusted',
        'crew_calendar_updated',
        'homeowner_notified',
        'install_blocked',
        -- Block 252700 specific types
        'rain_alert',
        'wind_alert',
        'heat_alert',
        'hail_warning'
      ));
  END IF;
END $$;

-- Add severity field if it doesn't exist (with correct values)
ALTER TABLE public.weather_events
  DROP CONSTRAINT IF EXISTS weather_events_event_severity_check;

ALTER TABLE public.weather_events
  ADD CONSTRAINT weather_events_event_severity_check
  CHECK (event_severity IN ('low', 'medium', 'high', 'info', 'warning', 'critical'));

-- Add heat_index field for OSHA compliance
ALTER TABLE public.weather_events
  ADD COLUMN IF NOT EXISTS heat_index_f numeric(5,2);

COMMENT ON COLUMN public.weather_events.heat_index_f IS 'Block 252700: OSHA heat index at time of event';

-- ============================================================================
-- PART 3 — FUNCTION: calculate_osha_heat_index
-- ============================================================================
-- Calculates OSHA heat index from temperature and humidity
-- Critical thresholds:
-- 90°F → frequent water breaks
-- 103°F → mandatory shade + rotation
-- 110°F → STOP WORK conditions

CREATE OR REPLACE FUNCTION public.calculate_osha_heat_index(
  p_temperature_f numeric,
  p_humidity_percent numeric
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_heat_index numeric;
  v_temp_squared numeric;
  v_humidity_squared numeric;
BEGIN
  -- Heat index formula (approximation for temperatures > 80°F)
  -- HI = -42.379 + 2.04901523*T + 10.14333127*RH - 0.22475541*T*RH 
  --      - 6.83783e-3*T^2 - 5.481717e-2*RH^2 + 1.22874e-3*T^2*RH 
  --      + 8.5282e-4*T*RH^2 - 1.99e-6*T^2*RH^2
  
  IF p_temperature_f IS NULL OR p_humidity_percent IS NULL THEN
    RETURN NULL;
  END IF;
  
  IF p_temperature_f < 80 THEN
    -- Below 80°F, heat index equals temperature
    RETURN p_temperature_f;
  END IF;
  
  v_temp_squared := p_temperature_f * p_temperature_f;
  v_humidity_squared := p_humidity_percent * p_humidity_percent;
  
  v_heat_index := -42.379
    + (2.04901523 * p_temperature_f)
    + (10.14333127 * p_humidity_percent)
    - (0.22475541 * p_temperature_f * p_humidity_percent)
    - (0.00683783 * v_temp_squared)
    - (0.05481717 * v_humidity_squared)
    + (0.00122874 * v_temp_squared * p_humidity_percent)
    + (0.00085282 * p_temperature_f * v_humidity_squared)
    - (0.00000199 * v_temp_squared * v_humidity_squared);
  
  -- Round to 2 decimal places
  RETURN ROUND(v_heat_index, 2);
END;
$$;

COMMENT ON FUNCTION public.calculate_osha_heat_index IS 'Block 252700: Calculates OSHA heat index from temperature (F) and humidity (%)';

-- ============================================================================
-- PART 4 — FUNCTION: get_osha_heat_alert_level
-- ============================================================================
-- Returns OSHA heat alert level and required actions

CREATE OR REPLACE FUNCTION public.get_osha_heat_alert_level(
  p_heat_index_f numeric
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_level text;
  v_message text;
  v_actions text[];
BEGIN
  IF p_heat_index_f IS NULL THEN
    RETURN jsonb_build_object(
      'level', 'none',
      'message', 'Heat index not available',
      'actions', ARRAY[]::text[]
    );
  END IF;
  
  IF p_heat_index_f >= 110 THEN
    v_level := 'stop_work';
    v_message := format('⚠️ OSHA HEAT ALERT - Heat Index %.0f°F - STOP WORK CONDITIONS', p_heat_index_f);
    v_actions := ARRAY['STOP ALL WORK', 'Seek immediate shade', 'Hydrate', 'Contact supervisor'];
  ELSIF p_heat_index_f >= 103 THEN
    v_level := 'mandatory_breaks';
    v_message := format('⚠️ OSHA HEAT ALERT - Heat Index %.0f°F - Mandatory shade + rotation required', p_heat_index_f);
    v_actions := ARRAY['Mandatory 15-minute breaks every hour', 'Work in shade when possible', 'Rotate heavy work', 'Frequent hydration'];
  ELSIF p_heat_index_f >= 90 THEN
    v_level := 'frequent_breaks';
    v_message := format('⚠️ OSHA HEAT ALERT - Heat Index %.0f°F - Frequent water breaks required', p_heat_index_f);
    v_actions := ARRAY['Frequent water breaks', 'Monitor for heat stress symptoms', 'Limit heavy work in direct sun'];
  ELSE
    v_level := 'normal';
    v_message := format('Heat Index %.0f°F - Normal working conditions', p_heat_index_f);
    v_actions := ARRAY[]::text[];
  END IF;
  
  RETURN jsonb_build_object(
    'level', v_level,
    'message', v_message,
    'actions', v_actions,
    'heat_index', p_heat_index_f
  );
END;
$$;

COMMENT ON FUNCTION public.get_osha_heat_alert_level IS 'Block 252700: Returns OSHA heat alert level and required actions based on heat index';

-- ============================================================================
-- PART 5 — FUNCTION: evaluate_weather_rules
-- ============================================================================
-- Core intelligence engine: evaluates all weather rules and triggers alerts
-- Rules:
-- 1. Rain: ≥20% = medium alert, ≥60% = high risk, auto-reschedule
-- 2. Wind: ≥25mph = caution, ≥35mph = shutdown recommended
-- 3. Heat: OSHA thresholds (90°, 103°, 110°)
-- 4. Hail: Any hail = high risk, stop work

CREATE OR REPLACE FUNCTION public.evaluate_weather_rules(
  p_job_id uuid,
  p_forecast_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_job record;
  v_events jsonb := '[]'::jsonb;
  v_event jsonb;
  v_rain_prob numeric;
  v_wind_speed numeric;
  v_wind_gust numeric;
  v_temperature numeric;
  v_humidity numeric;
  v_heat_index numeric;
  v_hail_prob numeric;
  v_lightning_risk numeric;
  v_hour_data jsonb;
  v_hours jsonb;
  v_working_hours_start int := 7;  -- 7 AM
  v_working_hours_end int := 17;   -- 5 PM
  v_hour int;
BEGIN
  -- Get job details
  SELECT * INTO v_job
  FROM public.jobs
  WHERE id = p_job_id;
  
  IF v_job IS NULL THEN
    RETURN jsonb_build_object('error', 'Job not found');
  END IF;
  
  -- Extract hourly forecast
  v_hours := COALESCE(p_forecast_data->'hourly', '[]'::jsonb);
  
  -- Process each hour in working hours
  FOR v_hour IN v_working_hours_start..v_working_hours_end LOOP
    -- Find hour data
    SELECT hour_data INTO v_hour_data
    FROM jsonb_array_elements(v_hours) AS hour_data
    WHERE (hour_data->>'hour')::int = v_hour
    LIMIT 1;
    
    IF v_hour_data IS NULL THEN
      CONTINUE;
    END IF;
    
    v_rain_prob := COALESCE((v_hour_data->>'precipitation_probability')::numeric, 0);
    v_wind_speed := COALESCE((v_hour_data->>'wind_speed_mph')::numeric, 0);
    v_wind_gust := COALESCE((v_hour_data->>'wind_gusts_mph')::numeric, 0);
    v_temperature := COALESCE((v_hour_data->>'temperature_f')::numeric, 0);
    v_humidity := COALESCE((v_hour_data->>'humidity_percent')::numeric, 50);
    v_hail_prob := COALESCE((v_hour_data->>'hail_probability')::numeric, 0);
    v_lightning_risk := COALESCE((v_hour_data->>'lightning_risk')::numeric, 0);
    
    -- Calculate heat index
    v_heat_index := public.calculate_osha_heat_index(v_temperature, v_humidity);
    
    -- RULE 1: Rain Alert
    IF v_rain_prob >= 60 THEN
      v_event := jsonb_build_object(
        'event_type', 'rain_alert',
        'severity', 'high',
        'message', format('High rain probability (%.0f%%) during working hours', v_rain_prob),
        'hour', v_hour,
        'rain_probability', v_rain_prob,
        'action', 'auto-reschedule'
      );
      v_events := v_events || jsonb_build_array(v_event);
    ELSIF v_rain_prob >= 20 THEN
      v_event := jsonb_build_object(
        'event_type', 'rain_alert',
        'severity', 'medium',
        'message', format('Rain probability (%.0f%%) during working hours', v_rain_prob),
        'hour', v_hour,
        'rain_probability', v_rain_prob,
        'action', 'notify_pm_foreman'
      );
      v_events := v_events || jsonb_build_array(v_event);
    END IF;
    
    -- RULE 2: Wind Alert
    IF v_wind_speed >= 35 OR v_wind_gust >= 40 THEN
      v_event := jsonb_build_object(
        'event_type', 'wind_alert',
        'severity', 'high',
        'message', format('High Wind Alert — Unsafe for Shingle Installation (%.0f mph gusts)', v_wind_gust),
        'hour', v_hour,
        'wind_speed', v_wind_speed,
        'wind_gust', v_wind_gust,
        'action', 'shutdown_recommended'
      );
      v_events := v_events || jsonb_build_array(v_event);
    ELSIF v_wind_speed >= 25 OR v_wind_gust >= 30 THEN
      v_event := jsonb_build_object(
        'event_type', 'wind_alert',
        'severity', 'medium',
        'message', format('High wind conditions (%.0f mph) - Exercise caution', v_wind_speed),
        'hour', v_hour,
        'wind_speed', v_wind_speed,
        'wind_gust', v_wind_gust,
        'action', 'caution'
      );
      v_events := v_events || jsonb_build_array(v_event);
    END IF;
    
    -- RULE 3: Heat/OSHA Alert
    IF v_heat_index IS NOT NULL THEN
      IF v_heat_index >= 110 THEN
        v_event := jsonb_build_object(
          'event_type', 'heat_alert',
          'severity', 'high',
          'message', format('⚠️ OSHA HEAT ALERT - Heat Index %.0f°F - STOP WORK CONDITIONS', v_heat_index),
          'hour', v_hour,
          'heat_index', v_heat_index,
          'temperature', v_temperature,
          'action', 'stop_work'
        );
        v_events := v_events || jsonb_build_array(v_event);
      ELSIF v_heat_index >= 103 THEN
        v_event := jsonb_build_object(
          'event_type', 'heat_alert',
          'severity', 'high',
          'message', format('⚠️ OSHA HEAT ALERT - Heat Index %.0f°F - Mandatory shade + rotation', v_heat_index),
          'hour', v_hour,
          'heat_index', v_heat_index,
          'temperature', v_temperature,
          'action', 'mandatory_breaks'
        );
        v_events := v_events || jsonb_build_array(v_event);
      ELSIF v_heat_index >= 90 THEN
        v_event := jsonb_build_object(
          'event_type', 'heat_alert',
          'severity', 'medium',
          'message', format('⚠️ OSHA HEAT ALERT - Heat Index %.0f°F - Frequent water breaks required', v_heat_index),
          'hour', v_hour,
          'heat_index', v_heat_index,
          'temperature', v_temperature,
          'action', 'frequent_breaks'
        );
        v_events := v_events || jsonb_build_array(v_event);
      END IF;
    END IF;
    
    -- RULE 4: Hail Warning
    IF v_hail_prob >= 20 OR v_lightning_risk >= 50 THEN
      v_event := jsonb_build_object(
        'event_type', 'hail_warning',
        'severity', 'high',
        'message', format('Hail or lightning in forecast - STOP ALL WORK + protect materials', v_hail_prob),
        'hour', v_hour,
        'hail_probability', v_hail_prob,
        'lightning_risk', v_lightning_risk,
        'action', 'stop_work_protect_materials'
      );
      v_events := v_events || jsonb_build_array(v_event);
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'job_id', p_job_id,
    'events', v_events,
    'event_count', jsonb_array_length(v_events)
  );
END;
$$;

COMMENT ON FUNCTION public.evaluate_weather_rules IS 'Block 252700: Core intelligence engine - evaluates weather rules and triggers alerts';

-- ============================================================================
-- PART 6 — FUNCTION: trigger_weather_event
-- ============================================================================
-- Creates weather event record and sends notifications

CREATE OR REPLACE FUNCTION public.trigger_weather_event(
  p_job_id uuid,
  p_event_type text,
  p_message text,
  p_severity text DEFAULT 'medium',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_job record;
  v_workspace_id uuid;
  v_event_id uuid;
  v_heat_index numeric;
BEGIN
  -- Get job and workspace
  SELECT j.*, j.company_id as workspace_id INTO v_job
  FROM public.jobs j
  WHERE j.id = p_job_id;
  
  IF v_job IS NULL THEN
    -- Try roofing_jobs table
    SELECT rj.*, rj.workspace_id INTO v_job
    FROM public.roofing_jobs rj
    WHERE rj.id = p_job_id;
    
    IF v_job IS NULL THEN
      RAISE EXCEPTION 'Job not found';
    END IF;
  END IF;
  
  v_workspace_id := COALESCE(v_job.workspace_id, v_job.company_id);
  
  -- Extract heat index from metadata if available
  v_heat_index := (p_metadata->>'heat_index')::numeric;
  
  -- Create weather event
  INSERT INTO public.weather_events (
    workspace_id,
    job_id,
    event_type,
    event_title,
    event_message,
    event_severity,
    event_date,
    heat_index_f,
    wind_speed_mph,
    rain_probability,
    hail_probability,
    temperature_f,
    metadata
  ) VALUES (
    v_workspace_id,
    p_job_id,
    p_event_type,
    CASE p_event_type
      WHEN 'rain_alert' THEN 'Rain Alert'
      WHEN 'wind_alert' THEN 'Wind Alert'
      WHEN 'heat_alert' THEN 'OSHA Heat Alert'
      WHEN 'hail_warning' THEN 'Hail Warning'
      ELSE 'Weather Event'
    END,
    p_message,
    p_severity,
    CURRENT_DATE,
    v_heat_index,
    (p_metadata->>'wind_speed')::numeric,
    (p_metadata->>'rain_probability')::numeric,
    (p_metadata->>'hail_probability')::numeric,
    (p_metadata->>'temperature')::numeric,
    p_metadata
  )
  RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$$;

COMMENT ON FUNCTION public.trigger_weather_event IS 'Block 252700: Creates weather event record and triggers notifications';

-- ============================================================================
-- PART 7 — FUNCTION: auto_reschedule_for_weather
-- ============================================================================
-- Automatically reschedules job when severe weather triggers

CREATE OR REPLACE FUNCTION public.auto_reschedule_for_weather(
  p_job_id uuid,
  p_reason text,
  p_new_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_job record;
  v_workspace_id uuid;
  v_old_date date;
  v_new_date date;
  v_crew_assignments uuid[];
  v_milestones uuid[];
BEGIN
  -- Get job
  SELECT * INTO v_job
  FROM public.jobs
  WHERE id = p_job_id;
  
  IF v_job IS NULL THEN
    RETURN jsonb_build_object('error', 'Job not found');
  END IF;
  
  v_workspace_id := COALESCE(v_job.company_id, (SELECT workspace_id FROM public.roofing_jobs WHERE id = p_job_id LIMIT 1));
  v_old_date := COALESCE(v_job.production_date, (SELECT scheduled_start_date FROM public.roofing_jobs WHERE id = p_job_id LIMIT 1));
  
  -- Determine new date (next available day or provided)
  IF p_new_date IS NULL THEN
    v_new_date := CURRENT_DATE + INTERVAL '2 days';  -- Default: 2 days out
  ELSE
    v_new_date := p_new_date;
  END IF;
  
  -- Update job production date
  UPDATE public.jobs
  SET production_date = v_new_date,
      updated_at = now()
  WHERE id = p_job_id;
  
  -- Update roofing_jobs if exists
  UPDATE public.roofing_jobs
  SET scheduled_start_date = v_new_date,
      updated_at = now()
  WHERE id = p_job_id;
  
  -- Reschedule production milestones
  UPDATE public.production_milestones
  SET scheduled_date = v_new_date + (scheduled_date - v_old_date),
      due_date = CASE WHEN due_date IS NOT NULL THEN v_new_date + (due_date - v_old_date) ELSE NULL END,
      updated_at = now()
  WHERE job_id = p_job_id
    AND status IN ('pending', 'in_progress');
  
  -- Reschedule crew assignments (from Block 251900)
  UPDATE public.crew_assignments
  SET assigned_date = v_new_date + (assigned_date - v_old_date),
      updated_at = now()
  WHERE job_id = p_job_id
    AND assigned_date >= v_old_date;
  
  -- Create weather event
  PERFORM public.trigger_weather_event(
    p_job_id,
    'reschedule_executed',
    format('⚠️ WEATHER DELAY - %s. Job moved from %s to %s.', p_reason, v_old_date, v_new_date),
    'high',
    jsonb_build_object(
      'old_date', v_old_date,
      'new_date', v_new_date,
      'auto_rescheduled', true
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'job_id', p_job_id,
    'old_date', v_old_date,
    'new_date', v_new_date,
    'message', format('Job rescheduled from %s to %s due to weather', v_old_date, v_new_date)
  );
END;
$$;

COMMENT ON FUNCTION public.auto_reschedule_for_weather IS 'Block 252700: Automatically reschedules job, milestones, and crew assignments for weather delays';

-- ============================================================================
-- PART 8 — FUNCTION: check_material_delivery_weather
-- ============================================================================
-- Checks weather before material delivery and recommends rescheduling if needed

CREATE OR REPLACE FUNCTION public.check_material_delivery_weather(
  p_job_id uuid,
  p_delivery_date date
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_job record;
  v_weather_status record;
  v_rain_prob numeric;
  v_wind_speed numeric;
  v_humidity numeric;
  v_risk_score integer := 0;
  v_is_safe boolean := true;
  v_warning_message text;
BEGIN
  -- Get job and weather status
  SELECT j.* INTO v_job
  FROM public.jobs j
  WHERE id = p_job_id;
  
  IF v_job IS NULL THEN
    RETURN jsonb_build_object('error', 'Job not found');
  END IF;
  
  -- Get weather forecast for delivery date
  SELECT * INTO v_weather_status
  FROM public.job_weather_status
  WHERE job_id = p_job_id;
  
  IF v_weather_status IS NULL OR v_weather_status.forecast = '{}'::jsonb THEN
    RETURN jsonb_build_object(
      'warning', true,
      'message', 'No weather data available for material delivery date'
    );
  END IF;
  
  -- Extract forecast data for delivery date
  -- Simplified: check daily forecast
  v_rain_prob := COALESCE((v_weather_status.forecast->'daily'->0->>'precipitation_probability')::numeric, 0);
  v_wind_speed := COALESCE((v_weather_status.forecast->'daily'->0->>'wind_speed_mph')::numeric, 0);
  v_humidity := COALESCE((v_weather_status.forecast->'daily'->0->>'humidity_percent')::numeric, 50);
  
  -- Evaluate risk
  IF v_rain_prob >= 40 THEN
    v_risk_score := v_risk_score + 50;
    v_is_safe := false;
    v_warning_message := format('Rain expected (%.0f%%) - Recommend rescheduling delivery to avoid damage', v_rain_prob);
  END IF;
  
  IF v_wind_speed >= 25 THEN
    v_risk_score := v_risk_score + 30;
    v_is_safe := false;
    IF v_warning_message IS NULL THEN
      v_warning_message := format('High wind (%.0f mph) - Recommend rescheduling delivery', v_wind_speed);
    END IF;
  END IF;
  
  IF v_humidity > 80 THEN
    -- High humidity is bad for TPO/EPDM installs
    v_risk_score := v_risk_score + 20;
    v_is_safe := false;
    IF v_warning_message IS NULL THEN
      v_warning_message := 'High humidity - Not ideal for TPO/EPDM installation';
    END IF;
  END IF;
  
  -- Update job_weather_status
  UPDATE public.job_weather_status
  SET material_delivery_risk_score = v_risk_score,
      material_delivery_safe = v_is_safe,
      updated_at = now()
  WHERE job_id = p_job_id;
  
  -- Create event if unsafe
  IF NOT v_is_safe THEN
    PERFORM public.trigger_weather_event(
      p_job_id,
      'material_delivery_adjusted',
      format('⚠️ MATERIAL DELIVERY WARNING - %s', v_warning_message),
      'medium',
      jsonb_build_object(
        'delivery_date', p_delivery_date,
        'rain_probability', v_rain_prob,
        'wind_speed', v_wind_speed,
        'humidity', v_humidity,
        'risk_score', v_risk_score
      )
    );
  END IF;
  
  RETURN jsonb_build_object(
    'safe', v_is_safe,
    'risk_score', v_risk_score,
    'warning', v_warning_message,
    'delivery_date', p_delivery_date
  );
END;
$$;

COMMENT ON FUNCTION public.check_material_delivery_weather IS 'Block 252700: Checks weather before material delivery and recommends rescheduling if needed';

-- ============================================================================
-- PART 9 — TRIGGER: Auto-update job_weather_status timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trg_update_job_weather_status_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  NEW.last_checked_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_job_weather_status_updated_at
  BEFORE UPDATE ON public.job_weather_status
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_update_job_weather_status_timestamp();

-- ============================================================================
-- PART 10 — ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.job_weather_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_members_can_view_job_weather_status"
  ON public.job_weather_status FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_weather_status.job_id
      AND (
        j.company_id IN (
          SELECT roofing_company_id FROM public.roofing_company_members
          WHERE user_id = auth.uid() AND is_active = true
        )
        OR EXISTS (
          SELECT 1 FROM public.roofing_companies rc
          WHERE rc.id = j.company_id AND rc.owner_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "company_members_can_manage_job_weather_status"
  ON public.job_weather_status FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_weather_status.job_id
      AND (
        j.company_id IN (
          SELECT roofing_company_id FROM public.roofing_company_members
          WHERE user_id = auth.uid() AND is_active = true
        )
        OR EXISTS (
          SELECT 1 FROM public.roofing_companies rc
          WHERE rc.id = j.company_id AND rc.owner_id = auth.uid()
        )
      )
    )
  );

-- ============================================================================
-- PART 11 — FUNCTION: notify_customer_weather_delay
-- ============================================================================
-- Sends customer notification when weather delay occurs (Block 252300 integration)

CREATE OR REPLACE FUNCTION public.notify_customer_weather_delay(
  p_job_id uuid,
  p_old_date date,
  p_new_date date,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_job record;
  v_company_id uuid;
  v_homeowner_name text;
  v_homeowner_phone text;
  v_homeowner_email text;
  v_message text;
  v_event_id uuid;
BEGIN
  -- Get job details
  SELECT j.*, j.company_id INTO v_job
  FROM public.jobs j
  WHERE j.id = p_job_id;
  
  IF v_job IS NULL THEN
    RAISE EXCEPTION 'Job not found';
  END IF;
  
  v_company_id := v_job.company_id;
  v_homeowner_name := COALESCE(v_job.homeowner_name, 'Valued Customer');
  v_homeowner_phone := v_job.homeowner_phone;
  v_homeowner_email := v_job.homeowner_email;
  
  -- Build message
  v_message := format(
    'Hi %s, Due to weather conditions, your roofing project schedule is being adjusted. This ensures the highest quality installation. Updated schedule: %s. We apologize for any inconvenience.',
    v_homeowner_name,
    to_char(p_new_date, 'Month DD, YYYY')
  );
  
  -- Send customer message via communication engine (Block 252300)
  INSERT INTO public.communication_events (
    job_id,
    customer_id,
    event_type,
    message_body,
    channel,
    recipient_phone,
    recipient_email,
    status,
    metadata
  ) VALUES (
    p_job_id,
    v_job.contact_id,
    'appointment_confirmed', -- Reuse type, metadata indicates weather delay
    v_message,
    CASE WHEN v_homeowner_phone IS NOT NULL THEN 'sms' ELSE 'email' END,
    v_homeowner_phone,
    v_homeowner_email,
    'pending',
    jsonb_build_object(
      'type', 'weather_delay',
      'old_date', p_old_date,
      'new_date', p_new_date,
      'reason', p_reason
    )
  )
  RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$$;

COMMENT ON FUNCTION public.notify_customer_weather_delay IS 'Block 252700: Sends customer notification when weather delay occurs (integrates with Block 252300)';

-- ============================================================================
-- PART 12 — FUNCTION: record_weather_delay_cost
-- ============================================================================
-- Records weather delay costs to job_costs table (Block 252600 integration)

CREATE OR REPLACE FUNCTION public.record_weather_delay_cost(
  p_job_id uuid,
  p_delay_days int,
  p_labor_cost_per_day numeric DEFAULT 500.00,
  p_description text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_job record;
  v_company_id uuid;
  v_cost_id uuid;
  v_total_cost numeric;
  v_desc text;
BEGIN
  -- Get job details
  SELECT j.*, j.company_id INTO v_job
  FROM public.jobs j
  WHERE j.id = p_job_id;
  
  IF v_job IS NULL THEN
    RAISE EXCEPTION 'Job not found';
  END IF;
  
  v_company_id := v_job.company_id;
  v_total_cost := p_delay_days * p_labor_cost_per_day;
  v_desc := COALESCE(
    p_description,
    format('Weather delay cost - %s day(s) at $%s/day', p_delay_days, p_labor_cost_per_day)
  );
  
  -- Insert cost into job_costs (Block 252600)
  INSERT INTO public.job_costs (
    job_id,
    company_id,
    cost_type,
    description,
    amount,
    source_type,
    metadata
  ) VALUES (
    p_job_id,
    v_company_id,
    'misc',
    v_desc,
    v_total_cost,
    'weather_delay',
    jsonb_build_object(
      'delay_days', p_delay_days,
      'cost_per_day', p_labor_cost_per_day,
      'total_cost', v_total_cost
    )
  )
  RETURNING id INTO v_cost_id;
  
  RETURN v_cost_id;
END;
$$;

COMMENT ON FUNCTION public.record_weather_delay_cost IS 'Block 252700: Records weather delay costs to job_costs (integrates with Block 252600 profitability engine)';

-- ============================================================================
-- PART 13 — UPDATE auto_reschedule_for_weather TO INTEGRATE
-- ============================================================================
-- Enhanced version that notifies customers and records costs

CREATE OR REPLACE FUNCTION public.auto_reschedule_for_weather_v2(
  p_job_id uuid,
  p_reason text,
  p_new_date date DEFAULT NULL,
  p_notify_customer boolean DEFAULT true,
  p_record_cost boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_reschedule_result jsonb;
  v_old_date date;
  v_new_date date;
  v_delay_days int;
  v_notification_id uuid;
  v_cost_id uuid;
BEGIN
  -- Call base reschedule function
  v_reschedule_result := public.auto_reschedule_for_weather(p_job_id, p_reason, p_new_date);
  
  IF (v_reschedule_result->>'error') IS NOT NULL THEN
    RETURN v_reschedule_result;
  END IF;
  
  v_old_date := (v_reschedule_result->>'old_date')::date;
  v_new_date := (v_reschedule_result->>'new_date')::date;
  v_delay_days := v_new_date - v_old_date;
  
  -- Notify customer
  IF p_notify_customer THEN
    BEGIN
      v_notification_id := public.notify_customer_weather_delay(
        p_job_id,
        v_old_date,
        v_new_date,
        p_reason
      );
    EXCEPTION WHEN OTHERS THEN
      -- Log but don't fail
      RAISE NOTICE 'Failed to send customer notification: %', SQLERRM;
    END;
  END IF;
  
  -- Record cost
  IF p_record_cost AND v_delay_days > 0 THEN
    BEGIN
      v_cost_id := public.record_weather_delay_cost(
        p_job_id,
        v_delay_days,
        500.00, -- Default $500/day labor cost
        format('Weather delay: %s days', v_delay_days)
      );
    EXCEPTION WHEN OTHERS THEN
      -- Log but don't fail
      RAISE NOTICE 'Failed to record weather delay cost: %', SQLERRM;
    END;
  END IF;
  
  -- Update result
  v_reschedule_result := v_reschedule_result || jsonb_build_object(
    'customer_notified', v_notification_id IS NOT NULL,
    'cost_recorded', v_cost_id IS NOT NULL,
    'delay_days', v_delay_days
  );
  
  RETURN v_reschedule_result;
END;
$$;

COMMENT ON FUNCTION public.auto_reschedule_for_weather_v2 IS 'Block 252700: Enhanced auto-reschedule that notifies customers and records costs';

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.job_weather_status IS 'Block 252700: Real-time weather status and forecast for each job site';
COMMENT ON FUNCTION public.calculate_osha_heat_index IS 'Block 252700: Calculates OSHA heat index from temperature and humidity';
COMMENT ON FUNCTION public.evaluate_weather_rules IS 'Block 252700: Core intelligence engine - evaluates weather rules (rain, wind, heat, hail) and triggers alerts';
COMMENT ON FUNCTION public.auto_reschedule_for_weather IS 'Block 252700: Automatically reschedules job, milestones, crew assignments for weather delays';
COMMENT ON FUNCTION public.check_material_delivery_weather IS 'Block 252700: Checks weather before material delivery and recommends rescheduling if needed';
COMMENT ON FUNCTION public.notify_customer_weather_delay IS 'Block 252700: Sends customer notification when weather delay occurs (integrates with Block 252300)';
COMMENT ON FUNCTION public.record_weather_delay_cost IS 'Block 252700: Records weather delay costs to job_costs (integrates with Block 252600 profitability engine)';
























