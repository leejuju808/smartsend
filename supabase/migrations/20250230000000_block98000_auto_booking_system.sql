-- =========================================================
-- Block 98000 — SmartSend Auto-Booking Engine v1
-- "Auto-Booking Engine + AI Scheduling Assistant"
-- =========================================================
--
-- This block turns SmartSend into a 24/7 roofing receptionist that:
-- ✔ Reads homeowner replies
-- ✔ Identifies booking intent
-- ✔ Suggests time windows automatically
-- ✔ Confirms appointments
-- ✔ Adds them to roofer's schedule
-- ✔ Sends the roofer a "job booked" alert
--
-- =========================================================

-- ============================================================================
-- PART 1 — APPOINTMENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  homeowner_name text,
  homeowner_address text,
  homeowner_email text,
  homeowner_phone text,
  date date NOT NULL,
  time text NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled', 'rescheduled')),
  confirmation_sent boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_appointments_user_id ON public.appointments(user_id);
CREATE INDEX IF NOT EXISTS idx_appointments_user_date ON public.appointments(user_id, date);
CREATE INDEX IF NOT EXISTS idx_appointments_lead_id ON public.appointments(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_status ON public.appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON public.appointments(date);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_appointments_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_appointments_updated_at ON public.appointments;
CREATE TRIGGER trg_set_appointments_updated_at
BEFORE UPDATE ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.set_appointments_updated_at();

-- Enable RLS
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view their own appointments" ON public.appointments;
CREATE POLICY "Users can view their own appointments"
ON public.appointments
FOR SELECT
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert their own appointments" ON public.appointments;
CREATE POLICY "Users can insert their own appointments"
ON public.appointments
FOR INSERT
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own appointments" ON public.appointments;
CREATE POLICY "Users can update their own appointments"
ON public.appointments
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role can manage appointments" ON public.appointments;
CREATE POLICY "Service role can manage appointments"
ON public.appointments
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================================================
-- PART 2 — USER AVAILABILITY TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  weekday int NOT NULL CHECK (weekday BETWEEN 1 AND 7), -- 1=Mon ... 7=Sun
  start_time text NOT NULL, -- e.g., "9:00 AM"
  end_time text NOT NULL,   -- e.g., "5:00 PM"
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, weekday)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_availability_user_id ON public.user_availability(user_id);
CREATE INDEX IF NOT EXISTS idx_user_availability_weekday ON public.user_availability(weekday);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_user_availability_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_user_availability_updated_at ON public.user_availability;
CREATE TRIGGER trg_set_user_availability_updated_at
BEFORE UPDATE ON public.user_availability
FOR EACH ROW
EXECUTE FUNCTION public.set_user_availability_updated_at();

-- Enable RLS
ALTER TABLE public.user_availability ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view their own availability" ON public.user_availability;
CREATE POLICY "Users can view their own availability"
ON public.user_availability
FOR SELECT
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can manage their own availability" ON public.user_availability;
CREATE POLICY "Users can manage their own availability"
ON public.user_availability
FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role can manage availability" ON public.user_availability;
CREATE POLICY "Service role can manage availability"
ON public.user_availability
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================================================
-- PART 3 — DEFAULT AVAILABILITY SEED FUNCTION
-- ============================================================================

-- Function to seed default availability (Mon-Sat, 9 AM - 5 PM)
CREATE OR REPLACE FUNCTION public.seed_default_availability(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only seed if user doesn't have any availability set
  IF NOT EXISTS (SELECT 1 FROM public.user_availability WHERE user_id = p_user_id) THEN
    INSERT INTO public.user_availability (user_id, weekday, start_time, end_time)
    VALUES
      (p_user_id, 1, '9:00 AM', '5:00 PM'), -- Monday
      (p_user_id, 2, '9:00 AM', '5:00 PM'), -- Tuesday
      (p_user_id, 3, '9:00 AM', '5:00 PM'), -- Wednesday
      (p_user_id, 4, '9:00 AM', '5:00 PM'), -- Thursday
      (p_user_id, 5, '9:00 AM', '5:00 PM'), -- Friday
      (p_user_id, 6, '9:00 AM', '5:00 PM'); -- Saturday
  END IF;
END;
$$;

-- ============================================================================
-- PART 4 — HELPER FUNCTION: Get Next Available Slot
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_next_available_slot(
  p_user_id uuid,
  p_days_ahead int DEFAULT 7
)
RETURNS TABLE (
  date date,
  time text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_weekday int;
  v_start_time text;
  v_end_time text;
  v_check_date date;
  v_found boolean;
  v_appointment_count int;
BEGIN
  -- Get user's availability
  FOR v_weekday, v_start_time, v_end_time IN
    SELECT weekday, start_time, end_time
    FROM public.user_availability
    WHERE user_id = p_user_id
    ORDER BY weekday
  LOOP
    -- Check each day from today forward
    FOR i IN 0..p_days_ahead LOOP
      v_check_date := CURRENT_DATE + i;
      
      -- Check if this date matches the weekday (1=Mon, 7=Sun)
      IF EXTRACT(DOW FROM v_check_date) = (v_weekday - 1) THEN
        -- Check if there's already an appointment at the start time
        SELECT COUNT(*) INTO v_appointment_count
        FROM public.appointments
        WHERE user_id = p_user_id
          AND date = v_check_date
          AND time = v_start_time
          AND status = 'scheduled';
        
        -- If no appointment at this time, return it
        IF v_appointment_count = 0 THEN
          RETURN QUERY SELECT v_check_date, v_start_time;
          RETURN;
        END IF;
      END IF;
    END LOOP;
  END LOOP;
  
  -- If no slot found, return null
  RETURN;
END;
$$;

COMMENT ON TABLE public.appointments IS 'Stores scheduled appointments/estimates booked through SmartSend';
COMMENT ON TABLE public.user_availability IS 'Stores user availability windows by weekday';
COMMENT ON FUNCTION public.seed_default_availability(uuid) IS 'Seeds default Mon-Sat 9-5 availability for a new user';
COMMENT ON FUNCTION public.get_next_available_slot(uuid, int) IS 'Returns the next available appointment slot for a user';


























