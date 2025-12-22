-- =========================================================
-- Block 19860 — Inbox Real-Time Calling & Booking Tools v1
-- (Click-to-Call, Call Logging, Call Outcome Tracking, Appointment Booking Modal, and Roofing-Focused Scheduling Engine)
-- =========================================================

-- ============================================================================
-- PART 1 — Call Logs Table
-- ============================================================================
-- Tracks all call attempts and outcomes

CREATE TABLE IF NOT EXISTS public.call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE SET NULL,
  call_type text NOT NULL DEFAULT 'attempted' CHECK (call_type IN ('attempted', 'completed')),
  outcome text CHECK (outcome IN (
    'booked_estimate',
    'left_voicemail',
    'no_answer',
    'wrong_number',
    'needs_follow_up',
    'not_interested',
    'job_closed_won',
    'job_lost'
  )),
  duration_seconds integer, -- Future: call duration tracking
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Indexes for call logs
CREATE INDEX IF NOT EXISTS idx_call_logs_workspace_id ON public.call_logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_contact_id ON public.call_logs(contact_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_thread_id ON public.call_logs(thread_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_outcome ON public.call_logs(outcome);
CREATE INDEX IF NOT EXISTS idx_call_logs_created_at ON public.call_logs(created_at DESC);

-- ============================================================================
-- PART 2 — Appointments Table
-- ============================================================================
-- Stores booked appointments/estimates

CREATE TABLE IF NOT EXISTS public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.crm_jobs(id) ON DELETE SET NULL,
  date date NOT NULL,
  time time NOT NULL,
  duration_minutes integer DEFAULT 30 CHECK (duration_minutes >= 15 AND duration_minutes <= 180),
  job_type text, -- Auto-filled from AI (e.g., 'roof_replacement', 'roof_repair', 'storm_damage_claim')
  address text, -- Auto-filled if available from contact
  notes text,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Indexes for appointments
CREATE INDEX IF NOT EXISTS idx_appointments_workspace_id ON public.appointments(workspace_id);
CREATE INDEX IF NOT EXISTS idx_appointments_contact_id ON public.appointments(contact_id);
CREATE INDEX IF NOT EXISTS idx_appointments_thread_id ON public.appointments(thread_id);
CREATE INDEX IF NOT EXISTS idx_appointments_job_id ON public.appointments(job_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON public.appointments(date);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON public.appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_created_at ON public.appointments(created_at DESC);

-- Updated_at trigger for appointments
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

-- ============================================================================
-- PART 3 — Jobs Conversions Table (if not exists)
-- ============================================================================
-- Tracks conversions from calls/appointments to jobs

CREATE TABLE IF NOT EXISTS public.jobs_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE SET NULL,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  call_log_id uuid REFERENCES public.call_logs(id) ON DELETE SET NULL,
  conversion_type text NOT NULL CHECK (conversion_type IN ('appointment_booked', 'call_booked', 'estimate_scheduled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for jobs conversions
CREATE INDEX IF NOT EXISTS idx_jobs_conversions_workspace_id ON public.jobs_conversions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_jobs_conversions_contact_id ON public.jobs_conversions(contact_id);
CREATE INDEX IF NOT EXISTS idx_jobs_conversions_thread_id ON public.jobs_conversions(thread_id);
CREATE INDEX IF NOT EXISTS idx_jobs_conversions_appointment_id ON public.jobs_conversions(appointment_id);
CREATE INDEX IF NOT EXISTS idx_jobs_conversions_call_log_id ON public.jobs_conversions(call_log_id);

-- ============================================================================
-- PART 4 — Call Outcome Intelligence Functions
-- ============================================================================
-- Functions to analyze call outcomes and suggest next steps

CREATE OR REPLACE FUNCTION public.analyze_call_outcome(
  p_call_log_id uuid,
  p_outcome text,
  p_thread_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact_id uuid;
  v_thread_summary text;
  v_suggested_action text;
  v_ai_summary text;
  v_result jsonb;
BEGIN
  -- Get contact_id from call log
  SELECT contact_id INTO v_contact_id
  FROM public.call_logs
  WHERE id = p_call_log_id;
  
  -- Get thread messages for context (simplified - adjust based on your schema)
  SELECT string_agg(body_text, ' ') INTO v_thread_summary
  FROM public.inbox_messages
  WHERE thread_id = p_thread_id
  LIMIT 10;
  
  -- Analyze outcome and suggest action
  CASE p_outcome
    WHEN 'left_voicemail' THEN
      v_suggested_action := 'Send follow-up text message';
      v_ai_summary := 'Left voicemail. Follow up with text message to increase response rate.';
    WHEN 'no_answer' THEN
      v_suggested_action := 'Try again in 3 hours';
      v_ai_summary := 'No answer. Schedule follow-up call for 3 hours later.';
    WHEN 'needs_follow_up' THEN
      v_suggested_action := 'Address missing question';
      v_ai_summary := 'Needs follow-up. Review conversation to identify missing information.';
    WHEN 'not_interested' THEN
      v_suggested_action := 'Close lead';
      v_ai_summary := 'Not interested. Consider closing this lead.';
    WHEN 'booked_estimate' THEN
      v_suggested_action := 'Prepare estimate materials';
      v_ai_summary := 'Estimate booked. Prepare estimate materials and confirm appointment details.';
    WHEN 'job_closed_won' THEN
      v_suggested_action := 'Update pipeline and celebrate!';
      v_ai_summary := 'Job won! Update pipeline status and prepare for next steps.';
    WHEN 'job_lost' THEN
      v_suggested_action := 'Log reason and move on';
      v_ai_summary := 'Job lost. Log reason for future learning.';
    ELSE
      v_suggested_action := 'Review call notes';
      v_ai_summary := 'Call completed. Review notes for next steps.';
  END CASE;
  
  -- Build result
  v_result := jsonb_build_object(
    'suggested_action', v_suggested_action,
    'ai_summary', v_ai_summary,
    'outcome', p_outcome
  );
  
  RETURN v_result;
END;
$$;

-- ============================================================================
-- PART 5 — Task Automation Functions
-- ============================================================================
-- Auto-create tasks based on call outcomes

CREATE OR REPLACE FUNCTION public.create_task_from_call_outcome(
  p_call_log_id uuid,
  p_outcome text,
  p_contact_id uuid,
  p_thread_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task_id uuid;
  v_task_title text;
  v_due_date date;
BEGIN
  -- Determine task details based on outcome
  CASE p_outcome
    WHEN 'left_voicemail' THEN
      v_task_title := 'Follow up on voicemail';
      v_due_date := CURRENT_DATE + INTERVAL '1 day';
    WHEN 'no_answer' THEN
      v_task_title := 'Call back - no answer';
      v_due_date := CURRENT_DATE;
    WHEN 'needs_follow_up' THEN
      v_task_title := 'Follow up - address question';
      v_due_date := CURRENT_DATE + INTERVAL '1 day';
    WHEN 'not_interested' THEN
      v_task_title := 'Close lead - not interested';
      v_due_date := CURRENT_DATE;
    WHEN 'booked_estimate' THEN
      -- Don't create task for booked estimates (appointment handles this)
      RETURN NULL;
    WHEN 'job_closed_won' THEN
      -- Close all open tasks
      UPDATE public.tasks
      SET status = 'completed'
      WHERE contact_id = p_contact_id AND status = 'open';
      RETURN NULL;
    WHEN 'job_lost' THEN
      -- Close all open tasks
      UPDATE public.tasks
      SET status = 'completed'
      WHERE contact_id = p_contact_id AND status = 'open';
      RETURN NULL;
    ELSE
      RETURN NULL;
  END CASE;
  
  -- Create task if needed (assuming tasks table exists)
  -- Adjust based on your actual tasks table schema
  IF v_task_title IS NOT NULL THEN
    INSERT INTO public.tasks (
      contact_id,
      thread_id,
      title,
      due_date,
      status,
      created_at
    )
    VALUES (
      p_contact_id,
      p_thread_id,
      v_task_title,
      v_due_date,
      'open',
      now()
    )
    RETURNING id INTO v_task_id;
  END IF;
  
  RETURN v_task_id;
END;
$$;

-- ============================================================================
-- PART 6 — Phone Number Validation & Normalization
-- ============================================================================
-- Enhanced phone utilities (building on existing functions)

-- Function to extract all phone numbers from text
CREATE OR REPLACE FUNCTION public.extract_all_phone_numbers(p_text text)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_numbers text[];
  v_match text;
BEGIN
  -- Find all phone number patterns
  FOR v_match IN
    SELECT regexp_replace(
      (regexp_match(p_text, '\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}', 'g'))[1],
      '[^0-9]', '', 'g'
    )
  LOOP
    IF length(v_match) = 10 THEN
      v_numbers := array_append(v_numbers, v_match);
    END IF;
  END LOOP;
  
  RETURN COALESCE(v_numbers, ARRAY[]::text[]);
END;
$$;

-- Function to suggest best phone number from contact/thread
CREATE OR REPLACE FUNCTION public.suggest_phone_number(
  p_contact_id uuid,
  p_thread_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_phone text;
  v_message_phones text[];
  v_message_body text;
BEGIN
  -- First, try contact phone
  SELECT phone INTO v_phone
  FROM public.contacts
  WHERE id = p_contact_id AND phone IS NOT NULL;
  
  -- If no contact phone, try to extract from thread messages
  IF v_phone IS NULL AND p_thread_id IS NOT NULL THEN
    SELECT string_agg(body_text, ' ') INTO v_message_body
    FROM public.inbox_messages
    WHERE thread_id = p_thread_id
    LIMIT 20;
    
    IF v_message_body IS NOT NULL THEN
      v_message_phones := public.extract_all_phone_numbers(v_message_body);
      IF array_length(v_message_phones, 1) > 0 THEN
        v_phone := public.normalize_phone(v_message_phones[1]);
      END IF;
    END IF;
  END IF;
  
  RETURN v_phone;
END;
$$;

-- ============================================================================
-- PART 7 — Availability Helper Functions
-- ============================================================================
-- Functions to get available appointment times based on schedule settings

CREATE OR REPLACE FUNCTION public.get_available_times(
  p_workspace_id uuid,
  p_date date,
  p_duration_minutes integer DEFAULT 30
)
RETURNS time[]
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_settings record;
  v_day_name text;
  v_start_time time;
  v_end_time time;
  v_enabled boolean;
  v_available_times time[];
  v_current_time time;
  v_slot_time time;
BEGIN
  -- Get schedule settings for workspace
  SELECT * INTO v_settings
  FROM public.schedule_availability
  WHERE workspace_id = p_workspace_id
  LIMIT 1;
  
  -- If no settings, return empty array
  IF v_settings IS NULL THEN
    RETURN ARRAY[]::time[];
  END IF;
  
  -- Determine day of week
  v_day_name := lower(to_char(p_date, 'Day'));
  v_day_name := trim(v_day_name);
  
  -- Get day settings
  CASE v_day_name
    WHEN 'monday' THEN
      v_start_time := v_settings.monday_start;
      v_end_time := v_settings.monday_end;
      v_enabled := v_settings.monday_enabled;
    WHEN 'tuesday' THEN
      v_start_time := v_settings.tuesday_start;
      v_end_time := v_settings.tuesday_end;
      v_enabled := v_settings.tuesday_enabled;
    WHEN 'wednesday' THEN
      v_start_time := v_settings.wednesday_start;
      v_end_time := v_settings.wednesday_end;
      v_enabled := v_settings.wednesday_enabled;
    WHEN 'thursday' THEN
      v_start_time := v_settings.thursday_start;
      v_end_time := v_settings.thursday_end;
      v_enabled := v_settings.thursday_enabled;
    WHEN 'friday' THEN
      v_start_time := v_settings.friday_start;
      v_end_time := v_settings.friday_end;
      v_enabled := v_settings.friday_enabled;
    WHEN 'saturday' THEN
      v_start_time := v_settings.saturday_start;
      v_end_time := v_settings.saturday_end;
      v_enabled := v_settings.saturday_enabled;
    WHEN 'sunday' THEN
      v_start_time := v_settings.sunday_start;
      v_end_time := v_settings.sunday_end;
      v_enabled := v_settings.sunday_enabled;
    ELSE
      RETURN ARRAY[]::time[];
  END CASE;
  
  -- If day not enabled, return empty
  IF NOT v_enabled OR v_start_time IS NULL OR v_end_time IS NULL THEN
    RETURN ARRAY[]::time[];
  END IF;
  
  -- Generate available time slots
  v_current_time := v_start_time;
  WHILE v_current_time + (p_duration_minutes || ' minutes')::interval <= v_end_time LOOP
    -- Check if this time slot conflicts with existing appointments
    IF NOT EXISTS (
      SELECT 1
      FROM public.appointments
      WHERE workspace_id = p_workspace_id
        AND date = p_date
        AND time <= v_current_time
        AND time + (duration_minutes || ' minutes')::interval > v_current_time
        AND status != 'cancelled'
    ) THEN
      v_available_times := array_append(v_available_times, v_current_time);
    END IF;
    
    -- Move to next slot (using time_between_appointments if available)
    v_current_time := v_current_time + COALESCE(
      (v_settings.time_between_appointments || ' minutes')::interval,
      (p_duration_minutes || ' minutes')::interval
    );
  END LOOP;
  
  RETURN v_available_times;
END;
$$;

-- ============================================================================
-- PART 8 — ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on new tables
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs_conversions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for call_logs
DROP POLICY IF EXISTS "call_logs_select" ON public.call_logs;
CREATE POLICY "call_logs_select"
  ON public.call_logs
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "call_logs_insert" ON public.call_logs;
CREATE POLICY "call_logs_insert"
  ON public.call_logs
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "call_logs_update" ON public.call_logs;
CREATE POLICY "call_logs_update"
  ON public.call_logs
  FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for appointments
DROP POLICY IF EXISTS "appointments_select" ON public.appointments;
CREATE POLICY "appointments_select"
  ON public.appointments
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "appointments_insert" ON public.appointments;
CREATE POLICY "appointments_insert"
  ON public.appointments
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "appointments_update" ON public.appointments;
CREATE POLICY "appointments_update"
  ON public.appointments
  FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for jobs_conversions
DROP POLICY IF EXISTS "jobs_conversions_select" ON public.jobs_conversions;
CREATE POLICY "jobs_conversions_select"
  ON public.jobs_conversions
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "jobs_conversions_insert" ON public.jobs_conversions;
CREATE POLICY "jobs_conversions_insert"
  ON public.jobs_conversions
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.call_logs IS 'Tracks all call attempts and outcomes from inbox. Foundation for call analytics and follow-up automation.';
COMMENT ON TABLE public.appointments IS 'Stores booked appointments/estimates. Integrates with scheduler availability system.';
COMMENT ON TABLE public.jobs_conversions IS 'Tracks conversions from calls/appointments to jobs. Powers pipeline analytics.';
COMMENT ON FUNCTION public.analyze_call_outcome IS 'AI-powered analysis of call outcomes. Suggests next steps based on outcome type.';
COMMENT ON FUNCTION public.create_task_from_call_outcome IS 'Auto-creates tasks based on call outcomes (e.g., follow-up tasks for voicemails).';
COMMENT ON FUNCTION public.suggest_phone_number IS 'Suggests best phone number from contact record or thread messages.';
COMMENT ON FUNCTION public.get_available_times IS 'Returns available appointment times for a given date based on schedule settings.';



















































