-- =========================================================
-- Block 14600 — SmartSend Scheduler v1
-- Simple Contractor-Friendly Calendar for Booking Roof Inspections & Estimates FAST
-- =========================================================

-- ============================================================================
-- 1. SCHEDULE_AVAILABILITY TABLE
-- ============================================================================
-- Stores availability settings per workspace (roofer)

CREATE TABLE IF NOT EXISTS public.schedule_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Business Hours
  monday_start time DEFAULT '08:00',
  monday_end time DEFAULT '18:00',
  monday_enabled boolean DEFAULT true,
  
  tuesday_start time DEFAULT '08:00',
  tuesday_end time DEFAULT '18:00',
  tuesday_enabled boolean DEFAULT true,
  
  wednesday_start time DEFAULT '08:00',
  wednesday_end time DEFAULT '18:00',
  wednesday_enabled boolean DEFAULT true,
  
  thursday_start time DEFAULT '08:00',
  thursday_end time DEFAULT '18:00',
  thursday_enabled boolean DEFAULT true,
  
  friday_start time DEFAULT '08:00',
  friday_end time DEFAULT '18:00',
  friday_enabled boolean DEFAULT true,
  
  saturday_start time DEFAULT '08:00',
  saturday_end time DEFAULT '18:00',
  saturday_enabled boolean DEFAULT false,
  
  sunday_start time DEFAULT NULL,
  sunday_end time DEFAULT NULL,
  sunday_enabled boolean DEFAULT false,
  
  -- Appointment Settings
  time_between_appointments integer DEFAULT 30 CHECK (time_between_appointments >= 15 AND time_between_appointments <= 90), -- minutes
  max_appointments_per_day integer DEFAULT 3 CHECK (max_appointments_per_day >= 1 AND max_appointments_per_day <= 10),
  default_appointment_duration integer DEFAULT 30 CHECK (default_appointment_duration IN (30, 45, 60, 90)), -- minutes
  
  -- Public Booking Page Settings
  company_slug text UNIQUE, -- e.g., "abc-roofing" for /schedule/abc-roofing
  company_name text,
  company_logo_url text,
  booking_intro_text text DEFAULT 'Book your free roof inspection or estimate below.',
  
  -- Auto-reply settings
  auto_reply_enabled boolean DEFAULT true,
  auto_reply_message text DEFAULT 'Sure — here''s my schedule. Pick any time that works:',
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_schedule_availability_workspace 
  ON public.schedule_availability(workspace_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_schedule_availability_slug 
  ON public.schedule_availability(company_slug) WHERE company_slug IS NOT NULL;

-- ============================================================================
-- 2. SCHEDULE_BLOCKED_DAYS TABLE
-- ============================================================================
-- Holidays or busy days when roofer is unavailable

CREATE TABLE IF NOT EXISTS public.schedule_blocked_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  blocked_date date NOT NULL,
  reason text, -- e.g., "Holiday", "Busy", "Vacation"
  created_at timestamptz DEFAULT now(),
  UNIQUE(workspace_id, blocked_date)
);

CREATE INDEX IF NOT EXISTS idx_schedule_blocked_days_workspace_date 
  ON public.schedule_blocked_days(workspace_id, blocked_date);

-- ============================================================================
-- 3. SCHEDULE_BOOKINGS TABLE
-- ============================================================================
-- Actual appointments booked by homeowners

CREATE TABLE IF NOT EXISTS public.schedule_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  
  -- Appointment Details
  appointment_type text NOT NULL CHECK (appointment_type IN (
    'roof_inspection',
    'leak_check',
    'full_roof_estimate',
    'insurance_inspection',
    'storm_damage_assessment',
    'gutter_roof_check'
  )),
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  duration integer NOT NULL, -- minutes
  
  -- Homeowner Info (from booking form)
  homeowner_name text NOT NULL,
  homeowner_email text NOT NULL,
  homeowner_phone text,
  property_address text NOT NULL,
  notes text, -- Additional notes from homeowner
  
  -- Status
  status text NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'confirmed', 'cancelled', 'completed', 'no_show')),
  
  -- Notifications
  confirmation_sent boolean DEFAULT false,
  reminder_sent boolean DEFAULT false,
  calendar_invite_sent boolean DEFAULT false,
  
  -- Auto-generated fields
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Ensure no double booking
  CONSTRAINT no_overlapping_bookings EXCLUDE USING gist (
    workspace_id WITH =,
    tstzrange(start_time, end_time) WITH &&
  ) WHERE (status IN ('booked', 'confirmed'))
);

CREATE INDEX IF NOT EXISTS idx_schedule_bookings_workspace 
  ON public.schedule_bookings(workspace_id);

CREATE INDEX IF NOT EXISTS idx_schedule_bookings_contact 
  ON public.schedule_bookings(contact_id) WHERE contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_schedule_bookings_start_time 
  ON public.schedule_bookings(start_time);

CREATE INDEX IF NOT EXISTS idx_schedule_bookings_status 
  ON public.schedule_bookings(workspace_id, status, start_time);

CREATE INDEX IF NOT EXISTS idx_schedule_bookings_date_range 
  ON public.schedule_bookings(workspace_id, start_time, end_time);

-- ============================================================================
-- 4. ADD APPOINTMENT FIELDS TO CONTACTS TABLE
-- ============================================================================

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS last_appointment_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_appointment_at timestamptz,
  ADD COLUMN IF NOT EXISTS total_appointments integer DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_contacts_next_appointment 
  ON public.contacts(workspace_id, next_appointment_at) WHERE next_appointment_at IS NOT NULL;

-- ============================================================================
-- 5. APPOINTMENT TYPES CONFIGURATION TABLE
-- ============================================================================
-- Different appointment types with their durations and prep notes

CREATE TABLE IF NOT EXISTS public.schedule_appointment_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  type_key text NOT NULL CHECK (type_key IN (
    'roof_inspection',
    'leak_check',
    'full_roof_estimate',
    'insurance_inspection',
    'storm_damage_assessment',
    'gutter_roof_check'
  )),
  display_name text NOT NULL,
  duration integer NOT NULL CHECK (duration IN (30, 45, 60, 90)), -- minutes
  prep_notes text, -- Notes for roofer before appointment
  follow_up_steps text, -- Auto-generated follow-up steps
  
  enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  
  UNIQUE(workspace_id, type_key)
);

CREATE INDEX IF NOT EXISTS idx_schedule_appointment_types_workspace 
  ON public.schedule_appointment_types(workspace_id);

-- Insert default appointment types for new workspaces
CREATE OR REPLACE FUNCTION public.create_default_appointment_types()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.schedule_appointment_types (workspace_id, type_key, display_name, duration)
  VALUES
    (NEW.id, 'roof_inspection', 'Roof Inspection', 30),
    (NEW.id, 'leak_check', 'Leak Check', 30),
    (NEW.id, 'full_roof_estimate', 'Full Roof Estimate', 60),
    (NEW.id, 'insurance_inspection', 'Insurance Inspection', 45),
    (NEW.id, 'storm_damage_assessment', 'Storm Damage Assessment', 45),
    (NEW.id, 'gutter_roof_check', 'Gutter + Roof Check', 45)
  ON CONFLICT DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- Trigger to create default appointment types when workspace is created
DROP TRIGGER IF EXISTS trg_create_default_appointment_types ON public.workspaces;
CREATE TRIGGER trg_create_default_appointment_types
  AFTER INSERT ON public.workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.create_default_appointment_types();

-- ============================================================================
-- 6. HELPER FUNCTIONS
-- ============================================================================

-- Function to get available time slots for a date
CREATE OR REPLACE FUNCTION public.get_available_time_slots(
  p_workspace_id uuid,
  p_date date,
  p_duration integer DEFAULT 30
)
RETURNS TABLE (
  start_time timestamptz,
  end_time timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_availability public.schedule_availability%ROWTYPE;
  v_day_name text;
  v_day_start time;
  v_day_end time;
  v_day_enabled boolean;
  v_time_between integer;
  v_max_per_day integer;
  v_current_time time;
  v_slot_start timestamptz;
  v_slot_end timestamptz;
  v_existing_count integer;
BEGIN
  -- Get availability settings
  SELECT * INTO v_availability
  FROM public.schedule_availability
  WHERE workspace_id = p_workspace_id;
  
  IF NOT FOUND THEN
    RETURN; -- No availability settings
  END IF;
  
  -- Check if date is blocked
  IF EXISTS (
    SELECT 1 FROM public.schedule_blocked_days
    WHERE workspace_id = p_workspace_id AND blocked_date = p_date
  ) THEN
    RETURN; -- Day is blocked
  END IF;
  
  -- Determine day of week settings
  v_day_name := to_char(p_date, 'Day');
  
  CASE v_day_name
    WHEN 'Monday   ' THEN
      v_day_start := v_availability.monday_start;
      v_day_end := v_availability.monday_end;
      v_day_enabled := v_availability.monday_enabled;
    WHEN 'Tuesday  ' THEN
      v_day_start := v_availability.tuesday_start;
      v_day_end := v_availability.tuesday_end;
      v_day_enabled := v_availability.tuesday_enabled;
    WHEN 'Wednesday' THEN
      v_day_start := v_availability.wednesday_start;
      v_day_end := v_availability.wednesday_end;
      v_day_enabled := v_availability.wednesday_enabled;
    WHEN 'Thursday ' THEN
      v_day_start := v_availability.thursday_start;
      v_day_end := v_availability.thursday_end;
      v_day_enabled := v_availability.thursday_enabled;
    WHEN 'Friday   ' THEN
      v_day_start := v_availability.friday_start;
      v_day_end := v_availability.friday_end;
      v_day_enabled := v_availability.friday_enabled;
    WHEN 'Saturday ' THEN
      v_day_start := v_availability.saturday_start;
      v_day_end := v_availability.saturday_end;
      v_day_enabled := v_availability.saturday_enabled;
    WHEN 'Sunday   ' THEN
      v_day_start := v_availability.sunday_start;
      v_day_end := v_availability.sunday_end;
      v_day_enabled := v_availability.sunday_enabled;
  END CASE;
  
  IF NOT v_day_enabled OR v_day_start IS NULL OR v_day_end IS NULL THEN
    RETURN; -- Day not enabled
  END IF;
  
  v_time_between := v_availability.time_between_appointments;
  v_max_per_day := v_availability.max_appointments_per_day;
  
  -- Count existing appointments for the day
  SELECT COUNT(*) INTO v_existing_count
  FROM public.schedule_bookings
  WHERE workspace_id = p_workspace_id
    AND DATE(start_time) = p_date
    AND status IN ('booked', 'confirmed');
  
  IF v_existing_count >= v_max_per_day THEN
    RETURN; -- Max appointments reached
  END IF;
  
  -- Generate time slots
  v_current_time := v_day_start;
  
  WHILE v_current_time + (p_duration || ' minutes')::interval <= v_day_end LOOP
    v_slot_start := (p_date::text || ' ' || v_current_time::text)::timestamptz;
    v_slot_end := v_slot_start + (p_duration || ' minutes')::interval;
    
    -- Check if slot overlaps with existing booking
    IF NOT EXISTS (
      SELECT 1 FROM public.schedule_bookings
      WHERE workspace_id = p_workspace_id
        AND status IN ('booked', 'confirmed')
        AND (
          (start_time, end_time) OVERLAPS (v_slot_start, v_slot_end)
        )
    ) THEN
      RETURN QUERY SELECT v_slot_start, v_slot_end;
    END IF;
    
    -- Move to next slot
    v_current_time := v_current_time + ((p_duration + v_time_between) || ' minutes')::interval;
  END LOOP;
  
  RETURN;
END;
$$;

-- Function to create booking and sync with contact/pipeline
CREATE OR REPLACE FUNCTION public.create_appointment_booking(
  p_workspace_id uuid,
  p_appointment_type text,
  p_start_time timestamptz,
  p_homeowner_name text,
  p_homeowner_email text,
  p_homeowner_phone text DEFAULT NULL,
  p_property_address text,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact_id uuid;
  v_appointment_type_rec public.schedule_appointment_types%ROWTYPE;
  v_duration integer;
  v_end_time timestamptz;
  v_booking_id uuid;
BEGIN
  -- Get appointment type details
  SELECT * INTO v_appointment_type_rec
  FROM public.schedule_appointment_types
  WHERE workspace_id = p_workspace_id
    AND type_key = p_appointment_type
    AND enabled = true;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment type not found or disabled';
  END IF;
  
  v_duration := v_appointment_type_rec.duration;
  v_end_time := p_start_time + (v_duration || ' minutes')::interval;
  
  -- Get or create contact
  SELECT id INTO v_contact_id
  FROM public.contacts
  WHERE workspace_id = p_workspace_id
    AND lower(email) = lower(p_homeowner_email)
  LIMIT 1;
  
  IF v_contact_id IS NULL THEN
    INSERT INTO public.contacts (
      workspace_id,
      email,
      first_name,
      last_name,
      phone,
      source
    )
    VALUES (
      p_workspace_id,
      lower(p_homeowner_email),
      split_part(p_homeowner_name, ' ', 1),
      split_part(p_homeowner_name, ' ', 2),
      p_homeowner_phone,
      'scheduler_booking'
    )
    RETURNING id INTO v_contact_id;
  ELSE
    -- Update contact info if provided
    UPDATE public.contacts
    SET 
      phone = COALESCE(p_homeowner_phone, phone),
      first_name = COALESCE(split_part(p_homeowner_name, ' ', 1), first_name),
      last_name = COALESCE(split_part(p_homeowner_name, ' ', 2), last_name),
      updated_at = now()
    WHERE id = v_contact_id;
  END IF;
  
  -- Create booking
  INSERT INTO public.schedule_bookings (
    workspace_id,
    contact_id,
    appointment_type,
    start_time,
    end_time,
    duration,
    homeowner_name,
    homeowner_email,
    homeowner_phone,
    property_address,
    notes,
    status
  )
  VALUES (
    p_workspace_id,
    v_contact_id,
    p_appointment_type,
    p_start_time,
    v_end_time,
    v_duration,
    p_homeowner_name,
    p_homeowner_email,
    p_homeowner_phone,
    p_property_address,
    p_notes,
    'booked'
  )
  RETURNING id INTO v_booking_id;
  
  -- Update contact appointment tracking
  UPDATE public.contacts
  SET 
    next_appointment_at = p_start_time,
    total_appointments = total_appointments + 1,
    updated_at = now()
  WHERE id = v_contact_id;
  
  -- Update lead status to HOT
  UPDATE public.contacts
  SET lead_status = 'hot'
  WHERE id = v_contact_id
    AND (lead_status IS NULL OR lead_status NOT IN ('hot', 'won'));
  
  RETURN v_booking_id;
END;
$$;

-- ============================================================================
-- 7. TRIGGERS
-- ============================================================================

-- Update updated_at on schedule_availability
CREATE OR REPLACE FUNCTION public.set_schedule_availability_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_schedule_availability_updated_at ON public.schedule_availability;
CREATE TRIGGER trg_schedule_availability_updated_at
  BEFORE UPDATE ON public.schedule_availability
  FOR EACH ROW
  EXECUTE FUNCTION public.set_schedule_availability_updated_at();

-- Update updated_at on schedule_bookings
CREATE OR REPLACE FUNCTION public.set_schedule_bookings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_schedule_bookings_updated_at ON public.schedule_bookings;
CREATE TRIGGER trg_schedule_bookings_updated_at
  BEFORE UPDATE ON public.schedule_bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_schedule_bookings_updated_at();

-- ============================================================================
-- 8. RLS POLICIES
-- ============================================================================

ALTER TABLE public.schedule_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_blocked_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_appointment_types ENABLE ROW LEVEL SECURITY;

-- Schedule availability: workspace members can read/write
CREATE POLICY "schedule_availability_workspace_members"
  ON public.schedule_availability
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

-- Blocked days: workspace members can read/write
CREATE POLICY "schedule_blocked_days_workspace_members"
  ON public.schedule_blocked_days
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

-- Bookings: workspace members can read/write
CREATE POLICY "schedule_bookings_workspace_members"
  ON public.schedule_bookings
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

-- Appointment types: workspace members can read/write
CREATE POLICY "schedule_appointment_types_workspace_members"
  ON public.schedule_appointment_types
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
-- 9. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.schedule_availability IS 'Availability settings per workspace (roofer)';
COMMENT ON TABLE public.schedule_blocked_days IS 'Holidays or busy days when roofer is unavailable';
COMMENT ON TABLE public.schedule_bookings IS 'Appointments booked by homeowners';
COMMENT ON TABLE public.schedule_appointment_types IS 'Appointment type configurations with durations and prep notes';





















































