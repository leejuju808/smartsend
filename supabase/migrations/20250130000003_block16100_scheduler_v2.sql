-- =========================================================
-- Block 16100 — SmartSend Scheduler v2
-- AI Booking Recommendations, Weather-Aware Scheduling, Smart Time Windows,
-- Appointment Intelligence, Homeowner Self-Booking Flow
-- =========================================================

-- ============================================================================
-- 1. APPOINTMENT_FORMS TABLE
-- ============================================================================
-- Pre-appointment intelligence forms filled by homeowners

CREATE TABLE IF NOT EXISTS public.appointment_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.schedule_bookings(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Pre-appointment Questions
  has_leaks boolean,
  recent_storms boolean,
  insurance_claim_filed boolean,
  last_inspection_date date,
  roof_issue_type text CHECK (roof_issue_type IN (
    'leak',
    'storm_damage',
    'missing_shingles',
    'routine_check',
    'insurance_claim',
    'not_sure'
  )),
  issue_description text,
  
  -- Photo attachments (stored as URLs/keys)
  photo_urls jsonb DEFAULT '[]'::jsonb,
  
  -- AI-processed insights
  ai_insights jsonb DEFAULT '{}'::jsonb, -- lead_score, urgency, recommended_templates, etc.
  insurance_lead boolean DEFAULT false,
  urgent_lead boolean DEFAULT false,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointment_forms_booking 
  ON public.appointment_forms(booking_id);
CREATE INDEX IF NOT EXISTS idx_appointment_forms_workspace 
  ON public.appointment_forms(workspace_id);
CREATE INDEX IF NOT EXISTS idx_appointment_forms_insurance 
  ON public.appointment_forms(workspace_id, insurance_lead) WHERE insurance_lead = true;
CREATE INDEX IF NOT EXISTS idx_appointment_forms_urgent 
  ON public.appointment_forms(workspace_id, urgent_lead) WHERE urgent_lead = true;

-- ============================================================================
-- 2. SCHEDULER_SETTINGS TABLE (Enhanced Settings)
-- ============================================================================
-- Advanced scheduler configuration per workspace

CREATE TABLE IF NOT EXISTS public.scheduler_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Smart Time Windows
  default_slot_duration integer DEFAULT 15 CHECK (default_slot_duration IN (15, 30, 45, 60)), -- minutes
  buffer_before_appointment integer DEFAULT 5 CHECK (buffer_before_appointment >= 0 AND buffer_before_appointment <= 30), -- minutes
  buffer_after_appointment integer DEFAULT 10 CHECK (buffer_after_appointment >= 0 AND buffer_after_appointment <= 30), -- minutes
  
  -- Weather Settings
  weather_aware_enabled boolean DEFAULT true,
  block_rain boolean DEFAULT true,
  block_hail boolean DEFAULT true,
  block_snow boolean DEFAULT true,
  block_high_wind boolean DEFAULT true,
  high_wind_threshold_mph integer DEFAULT 25,
  require_daylight boolean DEFAULT true,
  
  -- AI Recommendations
  ai_recommendations_enabled boolean DEFAULT true,
  consider_travel_time boolean DEFAULT true,
  consider_storm_urgency boolean DEFAULT true,
  consider_lead_priority boolean DEFAULT true,
  
  -- Reminders
  send_booking_confirmation boolean DEFAULT true,
  send_day_before_reminder boolean DEFAULT true,
  send_hour_before_reminder boolean DEFAULT true,
  send_post_inspection_followup boolean DEFAULT true,
  
  -- No-Show Recovery
  no_show_recovery_enabled boolean DEFAULT true,
  no_show_recovery_delay_hours integer DEFAULT 2,
  
  -- Multi-User Settings
  allow_team_booking boolean DEFAULT true,
  require_assignment boolean DEFAULT false,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_scheduler_settings_workspace 
  ON public.scheduler_settings(workspace_id);

-- ============================================================================
-- 3. TRAVEL_CACHE TABLE
-- ============================================================================
-- Cache travel times between addresses for optimization

CREATE TABLE IF NOT EXISTS public.travel_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  from_address text NOT NULL,
  to_address text NOT NULL,
  travel_time_minutes integer NOT NULL,
  distance_miles numeric(10, 2),
  
  -- Cache metadata
  cached_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL, -- Cache expires after 7 days
  
  UNIQUE(workspace_id, from_address, to_address)
);

CREATE INDEX IF NOT EXISTS idx_travel_cache_workspace 
  ON public.travel_cache(workspace_id);
CREATE INDEX IF NOT EXISTS idx_travel_cache_expires 
  ON public.travel_cache(expires_at) WHERE expires_at < now();

-- ============================================================================
-- 4. WEATHER_BLOCKS TABLE
-- ============================================================================
-- Weather-based time slot blocks

CREATE TABLE IF NOT EXISTS public.weather_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  blocked_date date NOT NULL,
  blocked_time_start time NOT NULL,
  blocked_time_end time NOT NULL,
  
  -- Weather conditions
  weather_type text NOT NULL CHECK (weather_type IN ('rain', 'hail', 'snow', 'wind', 'low_light')),
  weather_intensity text CHECK (weather_intensity IN ('light', 'moderate', 'heavy', 'severe')),
  wind_speed_mph integer,
  precipitation_inches numeric(10, 2),
  
  -- Location (for multi-location roofers)
  location_address text,
  location_zip text,
  
  -- Source
  source text DEFAULT 'weather_api', -- 'weather_api', 'manual', 'forecast'
  forecast_confidence numeric(3, 2) DEFAULT 0.8 CHECK (forecast_confidence >= 0 AND forecast_confidence <= 1),
  
  created_at timestamptz DEFAULT now(),
  
  UNIQUE(workspace_id, blocked_date, blocked_time_start, blocked_time_end, location_address)
);

CREATE INDEX IF NOT EXISTS idx_weather_blocks_workspace_date 
  ON public.weather_blocks(workspace_id, blocked_date);
CREATE INDEX IF NOT EXISTS idx_weather_blocks_date_range 
  ON public.weather_blocks(workspace_id, blocked_date, blocked_time_start, blocked_time_end);

-- ============================================================================
-- 5. ENHANCE SCHEDULE_BOOKINGS TABLE (v2 Fields)
-- ============================================================================

-- Add v2 fields to existing bookings table
ALTER TABLE public.schedule_bookings
  ADD COLUMN IF NOT EXISTS assigned_to_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS booking_source text DEFAULT 'manual' CHECK (booking_source IN ('manual', 'self_booking', 'ai_recommendation', 'sms_reply', 'email_reply')),
  ADD COLUMN IF NOT EXISTS travel_time_minutes integer,
  ADD COLUMN IF NOT EXISTS estimated_job_value numeric(12, 2),
  ADD COLUMN IF NOT EXISTS roof_type_guess text,
  ADD COLUMN IF NOT EXISTS storm_risk text CHECK (storm_risk IN ('none', 'low', 'medium', 'high', 'urgent')),
  ADD COLUMN IF NOT EXISTS weather_at_appointment jsonb, -- Store weather snapshot
  ADD COLUMN IF NOT EXISTS pre_inspection_notes text,
  ADD COLUMN IF NOT EXISTS post_inspection_notes text,
  ADD COLUMN IF NOT EXISTS inspection_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS no_show_recovery_sent boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_sent_day_before boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_sent_hour_before boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS followup_sent_post_inspection boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_schedule_bookings_assigned 
  ON public.schedule_bookings(workspace_id, assigned_to_user_id) WHERE assigned_to_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_schedule_bookings_source 
  ON public.schedule_bookings(workspace_id, booking_source);
CREATE INDEX IF NOT EXISTS idx_schedule_bookings_storm_risk 
  ON public.schedule_bookings(workspace_id, storm_risk) WHERE storm_risk IS NOT NULL;

-- ============================================================================
-- 6. APPOINTMENT_REMINDERS TABLE
-- ============================================================================
-- Track reminder sends for appointments

CREATE TABLE IF NOT EXISTS public.appointment_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.schedule_bookings(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  reminder_type text NOT NULL CHECK (reminder_type IN (
    'booking_confirmation',
    'day_before',
    'hour_before',
    'post_inspection',
    'no_show_recovery'
  )),
  
  sent_at timestamptz DEFAULT now(),
  sent_via text CHECK (sent_via IN ('email', 'sms', 'both')),
  email_sent boolean DEFAULT false,
  sms_sent boolean DEFAULT false,
  
  -- Message content
  message_text text,
  weather_tip text,
  travel_note text,
  
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointment_reminders_booking 
  ON public.appointment_reminders(booking_id);
CREATE INDEX IF NOT EXISTS idx_appointment_reminders_workspace 
  ON public.appointment_reminders(workspace_id);
CREATE INDEX IF NOT EXISTS idx_appointment_reminders_type 
  ON public.appointment_reminders(booking_id, reminder_type);

-- ============================================================================
-- 7. FUNCTIONS
-- ============================================================================

-- Function to get weather-safe time slots (enhanced get_available_time_slots)
CREATE OR REPLACE FUNCTION public.get_weather_aware_time_slots(
  p_workspace_id uuid,
  p_date date,
  p_duration integer DEFAULT 15,
  p_location_address text DEFAULT NULL,
  p_location_zip text DEFAULT NULL
)
RETURNS TABLE (
  start_time timestamptz,
  end_time timestamptz,
  weather_safe boolean,
  weather_warning text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_settings public.scheduler_settings%ROWTYPE;
  v_slot_start timestamptz;
  v_slot_end timestamptz;
  v_weather_blocked boolean;
  v_warning text;
BEGIN
  -- Get scheduler settings
  SELECT * INTO v_settings
  FROM public.scheduler_settings
  WHERE workspace_id = p_workspace_id;
  
  -- If no settings, use defaults (weather-aware enabled)
  IF NOT FOUND THEN
    v_settings.weather_aware_enabled := true;
    v_settings.block_rain := true;
    v_settings.block_hail := true;
    v_settings.block_snow := true;
    v_settings.block_high_wind := true;
    v_settings.high_wind_threshold_mph := 25;
    v_settings.require_daylight := true;
  END IF;
  
  -- Get base available slots (from v1 function)
  FOR v_slot_start, v_slot_end IN 
    SELECT start_time, end_time
    FROM public.get_available_time_slots(p_workspace_id, p_date, p_duration)
  LOOP
    v_weather_blocked := false;
    v_warning := NULL;
    
    -- Check weather blocks if weather-aware is enabled
    IF v_settings.weather_aware_enabled THEN
      -- Check for weather blocks at this time
      IF EXISTS (
        SELECT 1 FROM public.weather_blocks
        WHERE workspace_id = p_workspace_id
          AND blocked_date = p_date
          AND (
            (blocked_time_start <= (v_slot_start::time) AND blocked_time_end > (v_slot_start::time))
            OR (blocked_time_start < (v_slot_end::time) AND blocked_time_end >= (v_slot_end::time))
            OR (blocked_time_start >= (v_slot_start::time) AND blocked_time_end <= (v_slot_end::time))
          )
          AND (
            location_address IS NULL 
            OR location_address = p_location_address
            OR location_zip = p_location_zip
          )
      ) THEN
        v_weather_blocked := true;
        SELECT weather_type || ' expected' INTO v_warning
        FROM public.weather_blocks
        WHERE workspace_id = p_workspace_id
          AND blocked_date = p_date
          AND blocked_time_start <= (v_slot_start::time)
          AND blocked_time_end > (v_slot_start::time)
        LIMIT 1;
      END IF;
      
      -- Check daylight requirement
      IF v_settings.require_daylight THEN
        -- Simple check: before 7 AM or after 7 PM (adjustable)
        IF EXTRACT(HOUR FROM v_slot_start) < 7 OR EXTRACT(HOUR FROM v_slot_end) > 19 THEN
          v_weather_blocked := true;
          v_warning := 'Low daylight hours';
        END IF;
      END IF;
    END IF;
    
    -- Return slot with weather safety info
    RETURN QUERY SELECT 
      v_slot_start,
      v_slot_end,
      NOT v_weather_blocked,
      v_warning;
  END LOOP;
  
  RETURN;
END;
$$;

-- Function to calculate travel time between addresses
CREATE OR REPLACE FUNCTION public.calculate_travel_time(
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
  v_expires_at timestamptz;
BEGIN
  -- Check cache first
  SELECT travel_time_minutes, expires_at INTO v_cached_time, v_expires_at
  FROM public.travel_cache
  WHERE workspace_id = p_workspace_id
    AND from_address = p_from_address
    AND to_address = p_to_address
    AND expires_at > now()
  LIMIT 1;
  
  IF v_cached_time IS NOT NULL THEN
    RETURN v_cached_time;
  END IF;
  
  -- Cache miss - return NULL (API will calculate and cache)
  -- This function is meant to be called from application code that will
  -- use a mapping service API (Google Maps, Mapbox, etc.) and then cache the result
  RETURN NULL;
END;
$$;

-- Function to sync appointment booking with pipeline
CREATE OR REPLACE FUNCTION public.sync_appointment_to_pipeline(
  p_booking_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_booking public.schedule_bookings%ROWTYPE;
  v_contact_id uuid;
  v_form public.appointment_forms%ROWTYPE;
BEGIN
  -- Get booking details
  SELECT * INTO v_booking
  FROM public.schedule_bookings
  WHERE id = p_booking_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  v_contact_id := v_booking.contact_id;
  
  -- Get appointment form if exists
  SELECT * INTO v_form
  FROM public.appointment_forms
  WHERE booking_id = p_booking_id
  LIMIT 1;
  
  -- Update contact lead status to HOT when booked
  IF v_contact_id IS NOT NULL THEN
    UPDATE public.contacts
    SET 
      lead_status = 'hot',
      next_appointment_at = v_booking.start_time,
      updated_at = now()
    WHERE id = v_contact_id
      AND (lead_status IS NULL OR lead_status NOT IN ('hot', 'won'));
    
    -- Update pipeline stage if exists
    UPDATE public.contacts
    SET pipeline_stage = 'HOT'
    WHERE id = v_contact_id
      AND pipeline_stage IS NOT NULL
      AND pipeline_stage != 'HOT'
      AND pipeline_stage != 'WON';
  END IF;
  
  -- If appointment form exists, update contact with insights
  IF v_form.id IS NOT NULL THEN
    -- Mark as insurance lead if applicable
    IF v_form.insurance_claim_filed THEN
      UPDATE public.contacts
      SET 
        tags = COALESCE(tags, '[]'::jsonb) || '["insurance_lead"]'::jsonb,
        updated_at = now()
      WHERE id = v_contact_id;
    END IF;
    
    -- Mark as urgent if applicable
    IF v_form.urgent_lead THEN
      UPDATE public.contacts
      SET 
        tags = COALESCE(tags, '[]'::jsonb) || '["urgent"]'::jsonb,
        updated_at = now()
      WHERE id = v_contact_id;
    END IF;
  END IF;
END;
$$;

-- Function to mark appointment as completed and update pipeline
CREATE OR REPLACE FUNCTION public.complete_appointment(
  p_booking_id uuid,
  p_post_inspection_notes text DEFAULT NULL,
  p_job_value numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_booking public.schedule_bookings%ROWTYPE;
BEGIN
  -- Get booking
  SELECT * INTO v_booking
  FROM public.schedule_bookings
  WHERE id = p_booking_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;
  
  -- Update booking
  UPDATE public.schedule_bookings
  SET 
    status = 'completed',
    inspection_completed_at = now(),
    post_inspection_notes = COALESCE(p_post_inspection_notes, post_inspection_notes),
    estimated_job_value = COALESCE(p_job_value, estimated_job_value),
    updated_at = now()
  WHERE id = p_booking_id;
  
  -- Update contact
  IF v_booking.contact_id IS NOT NULL THEN
    UPDATE public.contacts
    SET 
      last_appointment_at = now(),
      next_appointment_at = NULL,
      updated_at = now()
    WHERE id = v_booking.contact_id;
    
    -- Move to "Inspection Completed" stage (or keep in HOT if job value high)
    -- This is handled by application logic, but we can set a tag
    UPDATE public.contacts
    SET 
      tags = COALESCE(tags, '[]'::jsonb) || '["inspection_completed"]'::jsonb,
      updated_at = now()
    WHERE id = v_booking.contact_id;
  END IF;
END;
$$;

-- ============================================================================
-- 8. TRIGGERS
-- ============================================================================

-- Trigger to sync appointment to pipeline when created
CREATE OR REPLACE FUNCTION public.trigger_sync_appointment_to_pipeline()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'booked' OR NEW.status = 'confirmed' THEN
    PERFORM public.sync_appointment_to_pipeline(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_appointment_to_pipeline ON public.schedule_bookings;
CREATE TRIGGER trg_sync_appointment_to_pipeline
  AFTER INSERT OR UPDATE ON public.schedule_bookings
  FOR EACH ROW
  WHEN (NEW.status IN ('booked', 'confirmed'))
  EXECUTE FUNCTION public.trigger_sync_appointment_to_pipeline();

-- Trigger to update updated_at on appointment_forms
CREATE OR REPLACE FUNCTION public.set_appointment_forms_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointment_forms_updated_at ON public.appointment_forms;
CREATE TRIGGER trg_appointment_forms_updated_at
  BEFORE UPDATE ON public.appointment_forms
  FOR EACH ROW
  EXECUTE FUNCTION public.set_appointment_forms_updated_at();

-- Trigger to update updated_at on scheduler_settings
CREATE OR REPLACE FUNCTION public.set_scheduler_settings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_scheduler_settings_updated_at ON public.scheduler_settings;
CREATE TRIGGER trg_scheduler_settings_updated_at
  BEFORE UPDATE ON public.scheduler_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_scheduler_settings_updated_at();

-- Trigger to create default scheduler settings for new workspaces
CREATE OR REPLACE FUNCTION public.create_default_scheduler_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.scheduler_settings (workspace_id)
  VALUES (NEW.id)
  ON CONFLICT (workspace_id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_default_scheduler_settings ON public.workspaces;
CREATE TRIGGER trg_create_default_scheduler_settings
  AFTER INSERT ON public.workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.create_default_scheduler_settings();

-- ============================================================================
-- 9. RLS POLICIES
-- ============================================================================

ALTER TABLE public.appointment_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduler_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weather_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_reminders ENABLE ROW LEVEL SECURITY;

-- Appointment forms: workspace members can read/write
CREATE POLICY "appointment_forms_workspace_members"
  ON public.appointment_forms
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

-- Scheduler settings: workspace members can read, owners/admins can write
CREATE POLICY "scheduler_settings_workspace_members_read"
  ON public.scheduler_settings
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "scheduler_settings_workspace_owners_write"
  ON public.scheduler_settings
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- Travel cache: workspace members can read/write
CREATE POLICY "travel_cache_workspace_members"
  ON public.travel_cache
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

-- Weather blocks: workspace members can read/write
CREATE POLICY "weather_blocks_workspace_members"
  ON public.weather_blocks
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

-- Appointment reminders: workspace members can read/write
CREATE POLICY "appointment_reminders_workspace_members"
  ON public.appointment_reminders
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

-- ============================================================================
-- 10. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.appointment_forms IS 'Pre-appointment intelligence forms filled by homeowners';
COMMENT ON TABLE public.scheduler_settings IS 'Advanced scheduler configuration per workspace';
COMMENT ON TABLE public.travel_cache IS 'Cache travel times between addresses for optimization';
COMMENT ON TABLE public.weather_blocks IS 'Weather-based time slot blocks';
COMMENT ON TABLE public.appointment_reminders IS 'Track reminder sends for appointments';
COMMENT ON FUNCTION public.get_weather_aware_time_slots IS 'Get available time slots filtered by weather conditions';
COMMENT ON FUNCTION public.calculate_travel_time IS 'Calculate or retrieve cached travel time between addresses';
COMMENT ON FUNCTION public.sync_appointment_to_pipeline IS 'Sync appointment booking to pipeline (move to HOT)';
COMMENT ON FUNCTION public.complete_appointment IS 'Mark appointment as completed and update pipeline';





















































