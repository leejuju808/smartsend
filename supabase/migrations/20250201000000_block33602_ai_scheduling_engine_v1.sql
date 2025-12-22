-- =========================================================
-- Block 33602 — SmartSend Roofing "AI Scheduling Engine + Calendar Sync" v1
-- (Book estimates automatically • Sync roofer's calendar • Prevent double-booking • 
--  Optimize routes • Handle reschedules without human effort)
-- =========================================================
-- 
-- This turns SmartSend from a CRM into a full-blown scheduling & operations engine.
-- 
-- FEATURES:
-- 1. Smart Booking Link for Homeowners
-- 2. Calendar Sync (Google Calendar v1)
-- 3. Appointment Types Configuration
-- 4. Route Optimization (light v1)
-- 5. Automated Reminders
-- 6. AI Rescheduling Assistant
-- 7. Appointment Outcome Logging

-- ============================================================================
-- PART 1: EXTEND APPOINTMENTS TABLE
-- ============================================================================
-- Add missing columns to existing appointments table if not present

ALTER TABLE public.appointments 
  ADD COLUMN IF NOT EXISTS contractor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS appointment_type text,
  ADD COLUMN IF NOT EXISTS start_time timestamptz,
  ADD COLUMN IF NOT EXISTS end_time timestamptz,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'canceled', 'no_show', 'rescheduled')),
  ADD COLUMN IF NOT EXISTS outcome text CHECK (outcome IN ('completed', 'reschedule_needed', 'no_show', 'hot_lead', 'lost_lead')),
  ADD COLUMN IF NOT EXISTS outcome_notes text,
  ADD COLUMN IF NOT EXISTS calendar_event_id text,
  ADD COLUMN IF NOT EXISTS calendar_provider text CHECK (calendar_provider IN ('google', 'outlook')),
  ADD COLUMN IF NOT EXISTS reminder_24h_sent boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_2h_sent boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_on_way_sent boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS route_optimized boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS previous_appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL;

-- Create index for contractor lookups
CREATE INDEX IF NOT EXISTS idx_appointments_contractor_id ON public.appointments(contractor_id);
CREATE INDEX IF NOT EXISTS idx_appointments_start_time ON public.appointments(start_time);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON public.appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_calendar_event ON public.appointments(calendar_event_id, calendar_provider) WHERE calendar_event_id IS NOT NULL;

-- ============================================================================
-- PART 2: SCHEDULE SETTINGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.schedule_settings (
  contractor_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  timezone text DEFAULT 'America/New_York',
  workdays jsonb DEFAULT '{"mon": true, "tue": true, "wed": true, "thu": true, "fri": true, "sat": false, "sun": false}'::jsonb,
  hours jsonb DEFAULT '{"start": "08:00", "end": "17:00"}'::jsonb,
  buffer_minutes int DEFAULT 15 CHECK (buffer_minutes >= 0 AND buffer_minutes <= 120),
  default_location text,
  home_base_address text, -- For route optimization
  allow_same_day_booking boolean DEFAULT true,
  booking_link_enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schedule_settings_workspace ON public.schedule_settings(workspace_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_schedule_settings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_schedule_settings_updated_at ON public.schedule_settings;
CREATE TRIGGER trg_schedule_settings_updated_at
BEFORE UPDATE ON public.schedule_settings
FOR EACH ROW EXECUTE FUNCTION public.set_schedule_settings_updated_at();

-- RLS
ALTER TABLE public.schedule_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own schedule settings"
ON public.schedule_settings FOR SELECT
USING (contractor_id = auth.uid() OR EXISTS (
  SELECT 1 FROM public.workspace_members wm 
  WHERE wm.workspace_id = schedule_settings.workspace_id 
  AND wm.user_id = auth.uid()
));

CREATE POLICY "Users can update their own schedule settings"
ON public.schedule_settings FOR UPDATE
USING (contractor_id = auth.uid())
WITH CHECK (contractor_id = auth.uid());

CREATE POLICY "Service role has full access"
ON public.schedule_settings FOR ALL
TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 3: APPOINTMENT TYPES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.appointment_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL, -- e.g., "Roof Estimate", "Storm Damage Assessment"
  duration_minutes int NOT NULL DEFAULT 45 CHECK (duration_minutes >= 15 AND duration_minutes <= 240),
  buffer_minutes int DEFAULT 15 CHECK (buffer_minutes >= 0 AND buffer_minutes <= 60),
  auto_reminder_enabled boolean DEFAULT true,
  reminder_24h_template text DEFAULT 'Reminder: Your {{appointment_type}} is scheduled for tomorrow at {{time}}.',
  reminder_2h_template text DEFAULT 'Reminder: Your {{appointment_type}} is coming up in 2 hours.',
  is_active boolean DEFAULT true,
  display_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointment_types_contractor ON public.appointment_types(contractor_id, is_active);
CREATE INDEX IF NOT EXISTS idx_appointment_types_workspace ON public.appointment_types(workspace_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_appointment_types_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointment_types_updated_at ON public.appointment_types;
CREATE TRIGGER trg_appointment_types_updated_at
BEFORE UPDATE ON public.appointment_types
FOR EACH ROW EXECUTE FUNCTION public.set_appointment_types_updated_at();

-- RLS
ALTER TABLE public.appointment_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view appointment types in their workspace"
ON public.appointment_types FOR SELECT
USING (contractor_id = auth.uid() OR EXISTS (
  SELECT 1 FROM public.workspace_members wm 
  WHERE wm.workspace_id = appointment_types.workspace_id 
  AND wm.user_id = auth.uid()
));

CREATE POLICY "Users can manage appointment types in their workspace"
ON public.appointment_types FOR ALL
USING (contractor_id = auth.uid() OR EXISTS (
  SELECT 1 FROM public.workspace_members wm 
  WHERE wm.workspace_id = appointment_types.workspace_id 
  AND wm.user_id = auth.uid()
))
WITH CHECK (contractor_id = auth.uid() OR EXISTS (
  SELECT 1 FROM public.workspace_members wm 
  WHERE wm.workspace_id = appointment_types.workspace_id 
  AND wm.user_id = auth.uid()
));

CREATE POLICY "Service role has full access"
ON public.appointment_types FOR ALL
TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 4: APPOINTMENT RESCHEDULES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.appointment_reschedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  contractor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  old_time timestamptz NOT NULL,
  new_time timestamptz NOT NULL,
  reason text,
  initiated_by text DEFAULT 'homeowner' CHECK (initiated_by IN ('homeowner', 'contractor', 'system')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointment_reschedules_appointment ON public.appointment_reschedules(appointment_id);
CREATE INDEX IF NOT EXISTS idx_appointment_reschedules_lead ON public.appointment_reschedules(lead_id);
CREATE INDEX IF NOT EXISTS idx_appointment_reschedules_contractor ON public.appointment_reschedules(contractor_id);
CREATE INDEX IF NOT EXISTS idx_appointment_reschedules_created_at ON public.appointment_reschedules(created_at DESC);

-- RLS
ALTER TABLE public.appointment_reschedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view reschedules in their workspace"
ON public.appointment_reschedules FOR SELECT
USING (
  contractor_id = auth.uid() OR 
  EXISTS (
    SELECT 1 FROM public.appointments a
    JOIN public.leads l ON l.id = a.lead_id
    JOIN public.workspace_members wm ON wm.workspace_id = l.workspace_id
    WHERE a.id = appointment_reschedules.appointment_id
    AND wm.user_id = auth.uid()
  )
);

CREATE POLICY "Service role can insert reschedules"
ON public.appointment_reschedules FOR INSERT
TO service_role WITH CHECK (true);

CREATE POLICY "Service role can update reschedules"
ON public.appointment_reschedules FOR UPDATE
TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 5: BOOKING LINKS TABLE
-- ============================================================================
-- Stores unique booking links for leads

CREATE TABLE IF NOT EXISTS public.booking_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE, -- Unique token for the booking link
  expires_at timestamptz,
  used_at timestamptz,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_booking_links_token ON public.booking_links(token);
CREATE INDEX IF NOT EXISTS idx_booking_links_lead ON public.booking_links(lead_id);
CREATE INDEX IF NOT EXISTS idx_booking_links_contractor ON public.booking_links(contractor_id);
CREATE INDEX IF NOT EXISTS idx_booking_links_active ON public.booking_links(contractor_id, lead_id) 
  WHERE used_at IS NULL AND (expires_at IS NULL OR expires_at > now());

-- RLS
ALTER TABLE public.booking_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view booking links in their workspace"
ON public.booking_links FOR SELECT
USING (
  contractor_id = auth.uid() OR
  EXISTS (
    SELECT 1 FROM public.leads l
    JOIN public.workspace_members wm ON wm.workspace_id = l.workspace_id
    WHERE l.id = booking_links.lead_id
    AND wm.user_id = auth.uid()
  )
);

CREATE POLICY "Service role has full access"
ON public.booking_links FOR ALL
TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 6: HELPER FUNCTIONS
-- ============================================================================

-- Function to generate booking link
CREATE OR REPLACE FUNCTION public.generate_booking_link(
  p_contractor_id uuid,
  p_lead_id uuid,
  p_expires_in_hours int DEFAULT 168 -- 7 days default
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token text;
  v_expires_at timestamptz;
BEGIN
  -- Generate unique token
  v_token := encode(gen_random_bytes(32), 'base64url');
  v_expires_at := now() + (p_expires_in_hours || ' hours')::interval;

  -- Insert booking link
  INSERT INTO public.booking_links (contractor_id, lead_id, token, expires_at)
  VALUES (p_contractor_id, p_lead_id, v_token, v_expires_at)
  ON CONFLICT (token) DO NOTHING
  RETURNING token INTO v_token;

  -- If conflict (unlikely), try again
  IF v_token IS NULL THEN
    v_token := encode(gen_random_bytes(32), 'base64url');
    INSERT INTO public.booking_links (contractor_id, lead_id, token, expires_at)
    VALUES (p_contractor_id, p_lead_id, v_token, v_expires_at);
  END IF;

  RETURN v_token;
END;
$$;

-- Function to get available time slots for a contractor
CREATE OR REPLACE FUNCTION public.get_available_slots(
  p_contractor_id uuid,
  p_date date,
  p_duration_minutes int DEFAULT 45
)
RETURNS TABLE (
  start_time timestamptz,
  end_time timestamptz,
  available boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_settings public.schedule_settings%ROWTYPE;
  v_workday text;
  v_day_key text;
  v_work_start time;
  v_work_end time;
  v_slot_start timestamptz;
  v_slot_end timestamptz;
  v_buffer interval;
  v_has_conflict boolean;
BEGIN
  -- Get schedule settings
  SELECT * INTO v_settings
  FROM public.schedule_settings
  WHERE contractor_id = p_contractor_id;

  IF v_settings IS NULL THEN
    RETURN; -- No settings, no slots
  END IF;

  -- Check if workday
  v_day_key := lower(to_char(p_date, 'Dy'));
  IF NOT (v_settings.workdays->>v_day_key)::boolean THEN
    RETURN; -- Not a workday
  END IF;

  -- Get work hours
  v_work_start := (v_settings.hours->>'start')::time;
  v_work_end := (v_settings.hours->>'end')::time;
  v_buffer := (COALESCE(v_settings.buffer_minutes, 15) || ' minutes')::interval;

  -- Generate 30-minute slots from work start to work end
  v_slot_start := (p_date + v_work_start)::timestamptz;
  v_slot_end := v_slot_start + (p_duration_minutes || ' minutes')::interval;

  WHILE (v_slot_end::time <= v_work_end) LOOP
    -- Check for conflicts with existing appointments
    SELECT EXISTS(
      SELECT 1 FROM public.appointments
      WHERE contractor_id = p_contractor_id
      AND status IN ('scheduled', 'rescheduled')
      AND (
        (start_time < v_slot_end AND end_time > v_slot_start)
      )
    ) INTO v_has_conflict;

    -- Also check calendar blocks if calendar sync is enabled
    -- TODO: Integrate with calendar_blocks table when available

    -- Return slot if available
    IF NOT v_has_conflict THEN
      RETURN QUERY SELECT v_slot_start, v_slot_end, true;
    ELSE
      RETURN QUERY SELECT v_slot_start, v_slot_end, false;
    END IF;

    -- Move to next slot
    v_slot_start := v_slot_start + '30 minutes'::interval;
    v_slot_end := v_slot_start + (p_duration_minutes || ' minutes')::interval;
  END LOOP;
END;
$$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.schedule_settings IS 'Contractor scheduling preferences and availability settings';
COMMENT ON TABLE public.appointment_types IS 'Configurable appointment types (Roof Estimate, Storm Damage Assessment, etc.)';
COMMENT ON TABLE public.appointment_reschedules IS 'Tracks all appointment reschedule events';
COMMENT ON TABLE public.booking_links IS 'Unique booking links sent to homeowners for self-scheduling';
COMMENT ON FUNCTION public.generate_booking_link IS 'Generates a unique booking link token for a contractor-lead pair';
COMMENT ON FUNCTION public.get_available_slots IS 'Returns available time slots for a contractor on a given date';

































