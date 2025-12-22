-- =========================================================
-- Block 19970 — SmartSend Inbox Smart Calendar v1
-- (Estimate Calendar, Crew Calendar, Real-Time Availability, Mobile Scheduling, and Roofing-Focused Time Blocking)
-- =========================================================

-- ============================================================================
-- PART 1 — Appointment Types Table
-- ============================================================================
-- Defines different types of appointments with icons, colors, durations

CREATE TABLE IF NOT EXISTS public.appointment_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  icon text NOT NULL, -- e.g., 'estimate', 'inspection', 'repair', 'insurance', 'storm', 'followup', 'walkthrough', 'production', 'pickup'
  color text NOT NULL DEFAULT '#3B82F6', -- Hex color code
  default_duration_minutes integer NOT NULL DEFAULT 30 CHECK (default_duration_minutes >= 15 AND default_duration_minutes <= 480),
  recommended_times jsonb DEFAULT '[]'::jsonb, -- Array of recommended time windows, e.g., [{"start": "09:00", "end": "12:00"}, {"start": "13:00", "end": "17:00"}]
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Ensure unique appointment type names per workspace
  UNIQUE(workspace_id, name)
);

-- Insert default appointment types
INSERT INTO public.appointment_types (workspace_id, name, icon, color, default_duration_minutes, recommended_times)
VALUES
  (NULL, 'Estimate Appointment', 'estimate', '#3B82F6', 60, '[{"start": "09:00", "end": "12:00"}, {"start": "13:00", "end": "17:00"}]'::jsonb),
  (NULL, 'Inspection', 'inspection', '#10B981', 45, '[{"start": "08:00", "end": "18:00"}]'::jsonb),
  (NULL, 'Repair Assessment', 'repair', '#F59E0B', 30, '[{"start": "09:00", "end": "17:00"}]'::jsonb),
  (NULL, 'Insurance Meeting', 'insurance', '#8B5CF6', 60, '[{"start": "09:00", "end": "12:00"}, {"start": "13:00", "end": "16:00"}]'::jsonb),
  (NULL, 'Storm Check', 'storm', '#EF4444', 30, '[{"start": "08:00", "end": "18:00"}]'::jsonb),
  (NULL, 'Follow-Up Visit', 'followup', '#06B6D4', 30, '[{"start": "09:00", "end": "17:00"}]'::jsonb),
  (NULL, 'Job Walkthrough', 'walkthrough', '#6366F1', 45, '[{"start": "09:00", "end": "12:00"}, {"start": "13:00", "end": "17:00"}]'::jsonb),
  (NULL, 'Production Meeting', 'production', '#EC4899', 60, '[{"start": "09:00", "end": "12:00"}]'::jsonb),
  (NULL, 'Customer Pickup', 'pickup', '#14B8A6', 15, '[{"start": "09:00", "end": "17:00"}]'::jsonb)
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_appointment_types_workspace ON public.appointment_types(workspace_id);
CREATE INDEX IF NOT EXISTS idx_appointment_types_active ON public.appointment_types(workspace_id, is_active) WHERE is_active = true;

-- ============================================================================
-- PART 2 — Enhanced Appointments Table
-- ============================================================================
-- Extend existing appointments table with new fields

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS appointment_type_id uuid REFERENCES public.appointment_types(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_rep_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS start_time timestamptz, -- Calculated from date + time
  ADD COLUMN IF NOT EXISTS end_time timestamptz, -- Calculated from start_time + duration_minutes
  ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'America/New_York',
  ADD COLUMN IF NOT EXISTS location_address text, -- Full address for mapping
  ADD COLUMN IF NOT EXISTS location_coordinates point, -- PostGIS point for geocoding
  ADD COLUMN IF NOT EXISTS travel_time_minutes integer DEFAULT 0, -- Estimated travel time (v2)
  ADD COLUMN IF NOT EXISTS storm_related boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS storm_event_id uuid REFERENCES public.weather_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS priority text DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent', 'emergency')),
  ADD COLUMN IF NOT EXISTS ai_suggested boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_suggestion_reason text,
  ADD COLUMN IF NOT EXISTS confirmation_sent boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_sent boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS calendar_synced boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS external_calendar_id text; -- For Google Calendar sync

-- Update start_time and end_time from date + time + duration
CREATE OR REPLACE FUNCTION public.update_appointment_times()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.date IS NOT NULL AND NEW.time IS NOT NULL AND NEW.duration_minutes IS NOT NULL THEN
    NEW.start_time := (NEW.date + NEW.time)::timestamptz;
    NEW.end_time := NEW.start_time + (NEW.duration_minutes || ' minutes')::interval;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_appointment_times ON public.appointments;
CREATE TRIGGER trg_update_appointment_times
BEFORE INSERT OR UPDATE ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.update_appointment_times();

-- Backfill start_time and end_time for existing appointments
UPDATE public.appointments
SET start_time = (date + time)::timestamptz,
    end_time = (date + time)::timestamptz + (duration_minutes || ' minutes')::interval
WHERE start_time IS NULL OR end_time IS NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_appointment_type ON public.appointments(appointment_type_id);
CREATE INDEX IF NOT EXISTS idx_appointments_assigned_rep ON public.appointments(assigned_rep_id);
CREATE INDEX IF NOT EXISTS idx_appointments_start_time ON public.appointments(start_time);
CREATE INDEX IF NOT EXISTS idx_appointments_end_time ON public.appointments(end_time);
CREATE INDEX IF NOT EXISTS idx_appointments_storm_related ON public.appointments(storm_related, start_time);
CREATE INDEX IF NOT EXISTS idx_appointments_priority ON public.appointments(priority, start_time);

-- ============================================================================
-- PART 3 — Rep Availability Table
-- ============================================================================
-- Tracks rep availability, workload, and constraints

CREATE TABLE IF NOT EXISTS public.rep_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Availability settings
  active_weekdays text[] DEFAULT ARRAY['monday', 'tuesday', 'wednesday', 'thursday', 'friday']::text[],
  day_start_time time DEFAULT '09:00',
  day_end_time time DEFAULT '17:00',
  timezone text DEFAULT 'America/New_York',
  
  -- Constraints
  max_appointments_per_day integer DEFAULT 8,
  min_time_between_appointments_minutes integer DEFAULT 15,
  lunch_start_time time DEFAULT '12:00',
  lunch_end_time time DEFAULT '13:00',
  
  -- Workload tracking
  current_daily_appointments integer DEFAULT 0,
  current_weekly_appointments integer DEFAULT 0,
  
  -- Status
  is_active boolean DEFAULT true,
  is_on_vacation boolean DEFAULT false,
  vacation_start_date date,
  vacation_end_date date,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_rep_availability_workspace ON public.rep_availability(workspace_id);
CREATE INDEX IF NOT EXISTS idx_rep_availability_user ON public.rep_availability(user_id);
CREATE INDEX IF NOT EXISTS idx_rep_availability_active ON public.rep_availability(workspace_id, is_active) WHERE is_active = true;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_rep_availability_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_rep_availability_updated_at ON public.rep_availability;
CREATE TRIGGER trg_set_rep_availability_updated_at
BEFORE UPDATE ON public.rep_availability
FOR EACH ROW
EXECUTE FUNCTION public.set_rep_availability_updated_at();

-- ============================================================================
-- PART 4 — Availability Blocks Table
-- ============================================================================
-- Blocks time slots based on various constraints (storms, holidays, breaks, etc.)

CREATE TABLE IF NOT EXISTS public.availability_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE, -- NULL = applies to all reps
  
  -- Block details
  block_type text NOT NULL CHECK (block_type IN ('storm', 'holiday', 'lunch', 'break', 'meeting', 'personal', 'travel', 'quiet_hours', 'business_hours')),
  title text NOT NULL,
  description text,
  
  -- Time range
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  
  -- Storm-specific
  storm_event_id uuid REFERENCES public.weather_events(id) ON DELETE SET NULL,
  
  -- Recurring blocks (for lunch, breaks, etc.)
  is_recurring boolean DEFAULT false,
  recurrence_pattern jsonb, -- e.g., {"frequency": "daily", "days": ["monday", "tuesday", ...]}
  
  -- Status
  is_active boolean DEFAULT true,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_availability_blocks_workspace ON public.availability_blocks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_availability_blocks_user ON public.availability_blocks(user_id);
CREATE INDEX IF NOT EXISTS idx_availability_blocks_time_range ON public.availability_blocks USING gist (tstzrange(start_time, end_time));
CREATE INDEX IF NOT EXISTS idx_availability_blocks_storm ON public.availability_blocks(storm_event_id);
CREATE INDEX IF NOT EXISTS idx_availability_blocks_type ON public.availability_blocks(block_type, start_time);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_availability_blocks_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_availability_blocks_updated_at ON public.availability_blocks;
CREATE TRIGGER trg_set_availability_blocks_updated_at
BEFORE UPDATE ON public.availability_blocks
FOR EACH ROW
EXECUTE FUNCTION public.set_availability_blocks_updated_at();

-- ============================================================================
-- PART 5 — Smart Time Suggestions Table
-- ============================================================================
-- Stores AI-generated time suggestions for appointments

CREATE TABLE IF NOT EXISTS public.smart_time_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  
  -- Suggestion details
  suggested_start_time timestamptz NOT NULL,
  suggested_end_time timestamptz NOT NULL,
  confidence_score numeric(3,2) CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),
  suggestion_reason text NOT NULL, -- e.g., "Hot emergency - recommend today between 2-4 PM"
  
  -- Context used for suggestion
  job_type text,
  severity text,
  urgency text,
  location_zip text,
  rep_availability jsonb, -- Available rep IDs and their schedules
  storm_impact jsonb, -- Storm-related factors
  
  -- Status
  is_accepted boolean DEFAULT false,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + INTERVAL '7 days')
);

CREATE INDEX IF NOT EXISTS idx_smart_time_suggestions_workspace ON public.smart_time_suggestions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_smart_time_suggestions_thread ON public.smart_time_suggestions(thread_id);
CREATE INDEX IF NOT EXISTS idx_smart_time_suggestions_contact ON public.smart_time_suggestions(contact_id);
CREATE INDEX IF NOT EXISTS idx_smart_time_suggestions_time ON public.smart_time_suggestions(suggested_start_time);
CREATE INDEX IF NOT EXISTS idx_smart_time_suggestions_expires ON public.smart_time_suggestions(expires_at) WHERE is_accepted = false;

-- ============================================================================
-- PART 6 — Daily Schedule Digest Table
-- ============================================================================
-- Tracks daily schedule digests sent to users

CREATE TABLE IF NOT EXISTS public.daily_schedule_digests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Digest date
  digest_date date NOT NULL,
  
  -- Content
  appointments_count integer DEFAULT 0,
  appointments jsonb DEFAULT '[]'::jsonb, -- Array of appointment summaries
  storm_alerts jsonb DEFAULT '[]'::jsonb,
  prep_tasks jsonb DEFAULT '[]'::jsonb,
  important_notes jsonb DEFAULT '[]'::jsonb,
  
  -- Delivery status
  email_sent boolean DEFAULT false,
  email_sent_at timestamptz,
  push_sent boolean DEFAULT false,
  push_sent_at timestamptz,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(workspace_id, user_id, digest_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_schedule_digests_workspace ON public.daily_schedule_digests(workspace_id);
CREATE INDEX IF NOT EXISTS idx_daily_schedule_digests_user ON public.daily_schedule_digests(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_schedule_digests_date ON public.daily_schedule_digests(digest_date);

-- ============================================================================
-- PART 7 — Real-Time Availability Engine Functions
-- ============================================================================

-- Function to check if a time slot is available
CREATE OR REPLACE FUNCTION public.is_time_slot_available(
  p_workspace_id uuid,
  p_user_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_exclude_appointment_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_has_conflict boolean;
  v_has_block boolean;
  v_rep_availability record;
BEGIN
  -- Check rep availability settings
  SELECT * INTO v_rep_availability
  FROM public.rep_availability
  WHERE workspace_id = p_workspace_id
    AND user_id = p_user_id
    AND is_active = true;
  
  -- If rep is on vacation, not available
  IF v_rep_availability IS NOT NULL AND v_rep_availability.is_on_vacation = true THEN
    IF p_start_time::date >= v_rep_availability.vacation_start_date 
       AND p_start_time::date <= v_rep_availability.vacation_end_date THEN
      RETURN false;
    END IF;
  END IF;
  
  -- Check for conflicting appointments
  SELECT EXISTS(
    SELECT 1
    FROM public.appointments
    WHERE workspace_id = p_workspace_id
      AND assigned_rep_id = p_user_id
      AND status IN ('scheduled', 'confirmed')
      AND (id != p_exclude_appointment_id OR p_exclude_appointment_id IS NULL)
      AND tstzrange(start_time, end_time) && tstzrange(p_start_time, p_end_time)
  ) INTO v_has_conflict;
  
  IF v_has_conflict THEN
    RETURN false;
  END IF;
  
  -- Check for availability blocks
  SELECT EXISTS(
    SELECT 1
    FROM public.availability_blocks
    WHERE workspace_id = p_workspace_id
      AND (user_id = p_user_id OR user_id IS NULL)
      AND is_active = true
      AND tstzrange(start_time, end_time) && tstzrange(p_start_time, p_end_time)
  ) INTO v_has_block;
  
  IF v_has_block THEN
    RETURN false;
  END IF;
  
  -- Check business hours (if rep availability exists)
  IF v_rep_availability IS NOT NULL THEN
    -- Check if time is within day_start_time and day_end_time
    -- This is simplified - you may want more sophisticated logic
    IF EXTRACT(HOUR FROM p_start_time::time) < EXTRACT(HOUR FROM v_rep_availability.day_start_time)
       OR EXTRACT(HOUR FROM p_end_time::time) > EXTRACT(HOUR FROM v_rep_availability.day_end_time) THEN
      RETURN false;
    END IF;
  END IF;
  
  RETURN true;
END;
$$;

-- Function to get available time slots for a date
CREATE OR REPLACE FUNCTION public.get_available_time_slots(
  p_workspace_id uuid,
  p_user_id uuid,
  p_date date,
  p_duration_minutes integer DEFAULT 30
)
RETURNS TABLE (
  start_time timestamptz,
  end_time timestamptz,
  is_available boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rep_availability record;
  v_current_time timestamptz;
  v_end_time timestamptz;
  v_slot_start timestamptz;
  v_slot_end timestamptz;
  v_day_start time;
  v_day_end time;
BEGIN
  -- Get rep availability
  SELECT * INTO v_rep_availability
  FROM public.rep_availability
  WHERE workspace_id = p_workspace_id
    AND user_id = p_user_id
    AND is_active = true;
  
  -- Default times if no rep availability
  IF v_rep_availability IS NULL THEN
    v_day_start := '09:00'::time;
    v_day_end := '17:00'::time;
  ELSE
    v_day_start := v_rep_availability.day_start_time;
    v_day_end := v_rep_availability.day_end_time;
  END IF;
  
  -- Generate time slots
  v_current_time := (p_date + v_day_start)::timestamptz;
  v_end_time := (p_date + v_day_end)::timestamptz;
  
  WHILE v_current_time + (p_duration_minutes || ' minutes')::interval <= v_end_time LOOP
    v_slot_start := v_current_time;
    v_slot_end := v_current_time + (p_duration_minutes || ' minutes')::interval;
    
    -- Check availability
    RETURN QUERY
    SELECT 
      v_slot_start,
      v_slot_end,
      public.is_time_slot_available(p_workspace_id, p_user_id, v_slot_start, v_slot_end);
    
    -- Move to next slot (15-minute increments)
    v_current_time := v_current_time + INTERVAL '15 minutes';
  END LOOP;
END;
$$;

-- ============================================================================
-- PART 8 — Smart Time Suggestion Function (AI-Powered)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_smart_time_suggestions(
  p_workspace_id uuid,
  p_thread_id uuid,
  p_contact_id uuid,
  p_job_type text DEFAULT NULL,
  p_severity text DEFAULT NULL,
  p_urgency text DEFAULT NULL,
  p_location_zip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_suggestions jsonb := '[]'::jsonb;
  v_suggestion jsonb;
  v_recommended_time timestamptz;
  v_reason text;
  v_confidence numeric;
  v_has_storm boolean;
  v_storm_event_id uuid;
BEGIN
  -- Check for storm events
  IF p_location_zip IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1
      FROM public.weather_events
      WHERE workspace_id = p_workspace_id
        AND zip = p_location_zip
        AND storm_started_at >= CURRENT_DATE - INTERVAL '7 days'
        AND storm_started_at <= CURRENT_DATE + INTERVAL '3 days'
    ) INTO v_has_storm;
    
    IF v_has_storm THEN
      SELECT id INTO v_storm_event_id
      FROM public.weather_events
      WHERE workspace_id = p_workspace_id
        AND zip = p_location_zip
        AND storm_started_at >= CURRENT_DATE - INTERVAL '7 days'
      ORDER BY storm_started_at DESC
      LIMIT 1;
    END IF;
  END IF;
  
  -- Generate suggestions based on urgency and job type
  IF p_urgency = 'emergency' OR p_severity = 'hot' THEN
    -- Hot Emergency: Recommend today between 2-4 PM
    v_recommended_time := (CURRENT_DATE + INTERVAL '14 hours')::timestamptz;
    v_reason := 'Hot Emergency - Recommend: Today between 2-4 PM';
    v_confidence := 0.9;
    
    v_suggestion := jsonb_build_object(
      'suggested_start_time', v_recommended_time,
      'suggested_end_time', v_recommended_time + INTERVAL '1 hour',
      'confidence_score', v_confidence,
      'suggestion_reason', v_reason,
      'storm_event_id', v_storm_event_id
    );
    
    v_suggestions := v_suggestions || v_suggestion;
  ELSIF p_job_type = 'insurance_claim' OR p_job_type LIKE '%insurance%' THEN
    -- Insurance Claim: Recommend tomorrow morning before adjuster arrives
    v_recommended_time := (CURRENT_DATE + INTERVAL '1 day' + INTERVAL '9 hours')::timestamptz;
    v_reason := 'Insurance Claim - Recommend: Tomorrow morning before adjuster arrives';
    v_confidence := 0.85;
    
    v_suggestion := jsonb_build_object(
      'suggested_start_time', v_recommended_time,
      'suggested_end_time', v_recommended_time + INTERVAL '1 hour',
      'confidence_score', v_confidence,
      'suggestion_reason', v_reason
    );
    
    v_suggestions := v_suggestions || v_suggestion;
  ELSIF v_has_storm THEN
    -- Storm-related: Block morning/afternoon for inspections
    v_recommended_time := (CURRENT_DATE + INTERVAL '1 day' + INTERVAL '8 hours')::timestamptz;
    v_reason := 'Storm Priority Day - Recommend: Tomorrow morning for inspection';
    v_confidence := 0.8;
    
    v_suggestion := jsonb_build_object(
      'suggested_start_time', v_recommended_time,
      'suggested_end_time', v_recommended_time + INTERVAL '45 minutes',
      'confidence_score', v_confidence,
      'suggestion_reason', v_reason,
      'storm_event_id', v_storm_event_id
    );
    
    v_suggestions := v_suggestions || v_suggestion;
  ELSE
    -- Default: Next available slot
    v_recommended_time := (CURRENT_DATE + INTERVAL '1 day' + INTERVAL '10 hours')::timestamptz;
    v_reason := 'Next available time slot';
    v_confidence := 0.7;
    
    v_suggestion := jsonb_build_object(
      'suggested_start_time', v_recommended_time,
      'suggested_end_time', v_recommended_time + INTERVAL '30 minutes',
      'confidence_score', v_confidence,
      'suggestion_reason', v_reason
    );
    
    v_suggestions := v_suggestions || v_suggestion;
  END IF;
  
  RETURN v_suggestions;
END;
$$;

-- ============================================================================
-- PART 9 — Auto-Update Pipeline & Tasks Functions
-- ============================================================================

-- Function to update pipeline when appointment is booked
CREATE OR REPLACE FUNCTION public.update_pipeline_on_appointment_booked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update thread pipeline stage to 'estimate_scheduled'
  IF NEW.thread_id IS NOT NULL THEN
    UPDATE public.inbox_threads
    SET pipeline_stage = 'estimate_scheduled',
        updated_at = now()
    WHERE id = NEW.thread_id;
  END IF;
  
  -- Update CRM job status if exists
  IF NEW.job_id IS NOT NULL THEN
    UPDATE public.crm_jobs
    SET status = 'booked',
        updated_at = now()
    WHERE id = NEW.job_id;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_pipeline_on_appointment_booked ON public.appointments;
CREATE TRIGGER trg_update_pipeline_on_appointment_booked
AFTER INSERT ON public.appointments
FOR EACH ROW
WHEN (NEW.status = 'scheduled')
EXECUTE FUNCTION public.update_pipeline_on_appointment_booked();

-- Function to create follow-up tasks when appointment is booked
CREATE OR REPLACE FUNCTION public.create_appointment_followup_tasks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task_id uuid;
BEGIN
  -- Create prep task for appointment
  INSERT INTO public.tasks (
    contact_id,
    thread_id,
    title,
    description,
    due_date,
    priority,
    status,
    created_at
  )
  VALUES (
    NEW.contact_id,
    NEW.thread_id,
    'Prepare for ' || COALESCE((SELECT name FROM public.appointment_types WHERE id = NEW.appointment_type_id), 'appointment'),
    'Appointment scheduled for ' || NEW.date::text || ' at ' || NEW.time::text,
    NEW.date - INTERVAL '1 day', -- Due day before appointment
    CASE 
      WHEN NEW.priority IN ('urgent', 'emergency') THEN 'high'
      ELSE 'medium'
    END,
    'open',
    now()
  )
  RETURNING id INTO v_task_id;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_appointment_followup_tasks ON public.appointments;
CREATE TRIGGER trg_create_appointment_followup_tasks
AFTER INSERT ON public.appointments
FOR EACH ROW
WHEN (NEW.status = 'scheduled')
EXECUTE FUNCTION public.create_appointment_followup_tasks();

-- ============================================================================
-- PART 10 — Storm Day Time Blocking Function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.block_storm_days()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_storm_event record;
  v_block_start timestamptz;
  v_block_end timestamptz;
BEGIN
  -- Find recent storm events
  FOR v_storm_event IN
    SELECT we.*, w.id as workspace_id
    FROM public.weather_events we
    JOIN public.workspaces w ON w.id = we.workspace_id
    WHERE we.storm_started_at >= CURRENT_DATE - INTERVAL '7 days'
      AND we.storm_started_at <= CURRENT_DATE + INTERVAL '3 days'
      AND we.severity IN ('high', 'severe', 'extreme')
  LOOP
    -- Block morning for inspections (8 AM - 12 PM)
    v_block_start := (v_storm_event.storm_started_at::date + INTERVAL '8 hours')::timestamptz;
    v_block_end := (v_storm_event.storm_started_at::date + INTERVAL '12 hours')::timestamptz;
    
    -- Create availability block if it doesn't exist
    INSERT INTO public.availability_blocks (
      workspace_id,
      block_type,
      title,
      description,
      start_time,
      end_time,
      storm_event_id,
      is_active
    )
    VALUES (
      v_storm_event.workspace_id,
      'storm',
      'Storm Inspection Block - Morning',
      'Morning blocked for storm inspections',
      v_block_start,
      v_block_end,
      v_storm_event.id,
      true
    )
    ON CONFLICT DO NOTHING;
    
    -- Block afternoon for inspections (1 PM - 5 PM)
    v_block_start := (v_storm_event.storm_started_at::date + INTERVAL '13 hours')::timestamptz;
    v_block_end := (v_storm_event.storm_started_at::date + INTERVAL '17 hours')::timestamptz;
    
    INSERT INTO public.availability_blocks (
      workspace_id,
      block_type,
      title,
      description,
      start_time,
      end_time,
      storm_event_id,
      is_active
    )
    VALUES (
      v_storm_event.workspace_id,
      'storm',
      'Storm Inspection Block - Afternoon',
      'Afternoon blocked for storm inspections',
      v_block_start,
      v_block_end,
      v_storm_event.id,
      true
    )
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;

-- ============================================================================
-- PART 11 — Daily Schedule Digest Function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_daily_schedule_digest(
  p_workspace_id uuid,
  p_user_id uuid,
  p_date date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_digest jsonb;
  v_appointments jsonb := '[]'::jsonb;
  v_appointment jsonb;
  v_storm_alerts jsonb := '[]'::jsonb;
  v_prep_tasks jsonb := '[]'::jsonb;
  v_appt_record record;
  v_storm_record record;
  v_task_record record;
BEGIN
  -- Get appointments for the day
  FOR v_appt_record IN
    SELECT 
      a.*,
      c.name as contact_name,
      c.phone as contact_phone,
      c.email as contact_email,
      at.name as appointment_type_name,
      at.color as appointment_type_color,
      at.icon as appointment_type_icon
    FROM public.appointments a
    JOIN public.contacts c ON c.id = a.contact_id
    LEFT JOIN public.appointment_types at ON at.id = a.appointment_type_id
    WHERE a.workspace_id = p_workspace_id
      AND a.assigned_rep_id = p_user_id
      AND a.date = p_date
      AND a.status IN ('scheduled', 'confirmed')
    ORDER BY a.time ASC
  LOOP
    v_appointment := jsonb_build_object(
      'id', v_appt_record.id,
      'time', v_appt_record.time::text,
      'duration_minutes', v_appt_record.duration_minutes,
      'contact_name', v_appt_record.contact_name,
      'contact_phone', v_appt_record.contact_phone,
      'contact_email', v_appt_record.contact_email,
      'address', v_appt_record.address,
      'appointment_type', v_appt_record.appointment_type_name,
      'appointment_type_color', v_appt_record.appointment_type_color,
      'appointment_type_icon', v_appt_record.appointment_type_icon,
      'job_type', v_appt_record.job_type,
      'priority', v_appt_record.priority,
      'notes', v_appt_record.notes
    );
    
    v_appointments := v_appointments || v_appointment;
  END LOOP;
  
  -- Get storm alerts
  FOR v_storm_record IN
    SELECT *
    FROM public.weather_events
    WHERE workspace_id = p_workspace_id
      AND storm_started_at::date = p_date
      AND severity IN ('high', 'severe', 'extreme')
  LOOP
    v_storm_alerts := v_storm_alerts || jsonb_build_object(
      'storm_type', v_storm_record.storm_type,
      'severity', v_storm_record.severity,
      'zip', v_storm_record.zip,
      'headline', v_storm_record.nws_headline
    );
  END LOOP;
  
  -- Get prep tasks
  FOR v_task_record IN
    SELECT *
    FROM public.tasks
    WHERE contact_id IN (
      SELECT contact_id
      FROM public.appointments
      WHERE workspace_id = p_workspace_id
        AND assigned_rep_id = p_user_id
        AND date = p_date
    )
    AND status = 'open'
    AND due_date <= p_date
  LOOP
    v_prep_tasks := v_prep_tasks || jsonb_build_object(
      'id', v_task_record.id,
      'title', v_task_record.title,
      'description', v_task_record.description,
      'priority', v_task_record.priority
    );
  END LOOP;
  
  -- Build digest
  v_digest := jsonb_build_object(
    'workspace_id', p_workspace_id,
    'user_id', p_user_id,
    'digest_date', p_date,
    'appointments_count', jsonb_array_length(v_appointments),
    'appointments', v_appointments,
    'storm_alerts', v_storm_alerts,
    'prep_tasks', v_prep_tasks,
    'important_notes', '[]'::jsonb
  );
  
  RETURN v_digest;
END;
$$;

-- ============================================================================
-- PART 12 — ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.appointment_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rep_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smart_time_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_schedule_digests ENABLE ROW LEVEL SECURITY;

-- RLS Policies for appointment_types
CREATE POLICY "appointment_types_select"
  ON public.appointment_types
  FOR SELECT
  USING (
    workspace_id IS NULL OR
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "appointment_types_insert"
  ON public.appointment_types
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "appointment_types_update"
  ON public.appointment_types
  FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for rep_availability
CREATE POLICY "rep_availability_select"
  ON public.rep_availability
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "rep_availability_insert"
  ON public.rep_availability
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "rep_availability_update"
  ON public.rep_availability
  FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for availability_blocks
CREATE POLICY "availability_blocks_select"
  ON public.availability_blocks
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "availability_blocks_insert"
  ON public.availability_blocks
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "availability_blocks_update"
  ON public.availability_blocks
  FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for smart_time_suggestions
CREATE POLICY "smart_time_suggestions_select"
  ON public.smart_time_suggestions
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "smart_time_suggestions_insert"
  ON public.smart_time_suggestions
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "smart_time_suggestions_update"
  ON public.smart_time_suggestions
  FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for daily_schedule_digests
CREATE POLICY "daily_schedule_digests_select"
  ON public.daily_schedule_digests
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
    AND user_id = auth.uid()
  );

CREATE POLICY "daily_schedule_digests_insert"
  ON public.daily_schedule_digests
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
    AND user_id = auth.uid()
  );

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.appointment_types IS 'Defines different types of appointments with icons, colors, and default durations';
COMMENT ON TABLE public.rep_availability IS 'Tracks rep availability, workload, and constraints';
COMMENT ON TABLE public.availability_blocks IS 'Blocks time slots based on various constraints (storms, holidays, breaks, etc.)';
COMMENT ON TABLE public.smart_time_suggestions IS 'Stores AI-generated time suggestions for appointments';
COMMENT ON TABLE public.daily_schedule_digests IS 'Tracks daily schedule digests sent to users';
COMMENT ON FUNCTION public.is_time_slot_available IS 'Checks if a time slot is available for a rep considering all constraints';
COMMENT ON FUNCTION public.get_available_time_slots IS 'Returns available time slots for a date and rep';
COMMENT ON FUNCTION public.generate_smart_time_suggestions IS 'AI-powered function to generate smart time suggestions based on job type, urgency, and storm impact';
COMMENT ON FUNCTION public.block_storm_days IS 'Automatically blocks time slots for storm days';
COMMENT ON FUNCTION public.generate_daily_schedule_digest IS 'Generates daily schedule digest with appointments, storm alerts, and prep tasks';



















































