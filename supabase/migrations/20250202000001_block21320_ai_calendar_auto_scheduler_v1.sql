-- =========================================================
-- Block 21320 — SmartSend AI Calendar Auto-Scheduler v1
-- (Automatically schedules inspections • adjuster meetings • installs • follow-ups • proposal check-ins)
-- =========================================================
--
-- This block is MASSIVE for roofing companies.
--
-- Right now, scheduling is a nightmare:
-- - no one tracks adjuster appointments
-- - inspections get forgotten
-- - installs get double-booked
-- - sales reps miss follow-ups
-- - proposal calls don't happen
-- - supplement reminders get ignored
-- - homeowners forget dates
-- - office managers are overwhelmed
--
-- SmartSend Auto-Scheduler v1 fixes ALL of this.
--
-- SmartSend will automatically generate calendar events based on:
-- - insurance timeline
-- - homeowner behavior
-- - adjuster requests
-- - install-ready signals
-- - supplement needs
-- - follow-up timing
-- - proposal engagement
-- - lead priorities
-- - Next Best Action engine
--
-- This turns SmartSend into a real operations engine.
-- =========================================================

-- ============================================================================
-- PART 1 — Extend calendar_events Table for Auto-Scheduling
-- ============================================================================

-- Add new event types to the existing event_type constraint
ALTER TABLE IF EXISTS public.calendar_events
  DROP CONSTRAINT IF EXISTS calendar_events_event_type_check;

ALTER TABLE IF EXISTS public.calendar_events
  ADD CONSTRAINT calendar_events_event_type_check CHECK (event_type IN (
    'ADJUSTER_APPT',
    'INSTALL_DATE',
    'FOLLOW_UP',
    'INSPECTION',
    'TASK',
    -- Homeowner-Facing Events
    'PROPOSAL_REVIEW_CALL',
    'INSTALL_READY_CALL',
    'DEDUCTIBLE_EXPLANATION_CALL',
    'PRE_INSTALL_WALKTHROUGH',
    'POST_INSTALL_CHECKIN',
    'REVIEW_REQUEST_CALL',
    -- Adjuster-Facing Events
    'PHOTO_SUBMISSION_DEADLINE',
    'SUPPLEMENT_FOLLOWUP',
    'APPROVAL_FOLLOWUP',
    'PAYMENT_CONFIRMATION',
    'SCOPE_REVIEW_CALL',
    -- Internal Roofing Team Events
    'CREW_ASSIGNMENT',
    'MATERIAL_ORDER_CHECK',
    'DUMPSTER_SCHEDULING',
    'CREW_ARRIVAL_CONFIRMATION',
    'FINAL_INVOICE_REMINDER'
  ));

-- Add auto-scheduling metadata columns
ALTER TABLE IF EXISTS public.calendar_events
  -- Auto-scheduling metadata
  ADD COLUMN IF NOT EXISTS auto_scheduled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_schedule_reason text, -- AI reason for scheduling
  ADD COLUMN IF NOT EXISTS auto_schedule_trigger text, -- What triggered this (e.g., 'claim_approved', 'proposal_viewed_2x')
  ADD COLUMN IF NOT EXISTS auto_schedule_confidence numeric(3,2) DEFAULT 1.0 CHECK (auto_schedule_confidence >= 0 AND auto_schedule_confidence <= 1.0),
  
  -- Assignment and roles
  ADD COLUMN IF NOT EXISTS assigned_to_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_to_role roofing_team_role, -- OWNER, SALES_REP, OFFICE_STAFF, ADJUSTER_HELPER, CREW_LEAD
  
  -- Intelligent timing metadata
  ADD COLUMN IF NOT EXISTS timing_reason text, -- Why this time was chosen
  ADD COLUMN IF NOT EXISTS homeowner_behavior_pattern jsonb DEFAULT '{}'::jsonb, -- Stores behavior patterns used for timing
  
  -- Conflict detection
  ADD COLUMN IF NOT EXISTS conflict_detected boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS conflict_resolved boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS conflict_with_event_ids uuid[], -- Array of conflicting event IDs
  
  -- Next Best Action integration
  ADD COLUMN IF NOT EXISTS next_best_action text,
  ADD COLUMN IF NOT EXISTS next_best_action_score numeric(3,2),
  
  -- Notification settings
  ADD COLUMN IF NOT EXISTS notification_sent_24h boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS notification_sent_1h boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS notification_sent_at timestamptz;

-- Indexes for auto-scheduled events
CREATE INDEX IF NOT EXISTS idx_calendar_events_auto_scheduled 
  ON public.calendar_events(workspace_id, auto_scheduled, event_date) 
  WHERE auto_scheduled = true AND status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_calendar_events_assigned_role 
  ON public.calendar_events(workspace_id, assigned_to_role, event_date) 
  WHERE assigned_to_role IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_calendar_events_assigned_user 
  ON public.calendar_events(workspace_id, assigned_to_user_id, event_date) 
  WHERE assigned_to_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_calendar_events_trigger 
  ON public.calendar_events(auto_schedule_trigger) 
  WHERE auto_schedule_trigger IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_calendar_events_conflicts 
  ON public.calendar_events(workspace_id, conflict_detected, event_date) 
  WHERE conflict_detected = true;

COMMENT ON COLUMN public.calendar_events.auto_scheduled IS 'Whether this event was auto-scheduled by AI';
COMMENT ON COLUMN public.calendar_events.auto_schedule_reason IS 'AI-generated reason for why this event was scheduled';
COMMENT ON COLUMN public.calendar_events.auto_schedule_trigger IS 'What triggered the auto-scheduling (e.g., claim_approved, proposal_viewed_2x)';
COMMENT ON COLUMN public.calendar_events.assigned_to_role IS 'Team role this event is assigned to (OWNER, SALES_REP, OFFICE_STAFF, ADJUSTER_HELPER)';
COMMENT ON COLUMN public.calendar_events.timing_reason IS 'Why this specific time was chosen based on homeowner behavior';

-- ============================================================================
-- PART 2 — Homeowner Behavior Pattern Tracking
-- ============================================================================

-- Table to track homeowner behavior patterns for intelligent timing
CREATE TABLE IF NOT EXISTS public.homeowner_behavior_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Response patterns
  preferred_reply_hour integer[], -- Hours of day when homeowner typically replies (0-23)
  preferred_reply_day_of_week integer[], -- Days of week (0=Sunday, 6=Saturday)
  avg_response_time_hours numeric(5,2), -- Average time to respond
  
  -- Engagement patterns
  proposal_view_times jsonb DEFAULT '[]'::jsonb, -- [{timestamp, duration_seconds}]
  email_open_times jsonb DEFAULT '[]'::jsonb, -- [{timestamp, hour_of_day}]
  call_preference text CHECK (call_preference IN ('morning', 'afternoon', 'evening', 'anytime')),
  
  -- Activity patterns
  most_active_hour integer, -- Hour of day when most active (0-23)
  most_active_day integer, -- Day of week when most active (0-6)
  
  -- Metadata
  pattern_confidence numeric(3,2) DEFAULT 0.5 CHECK (pattern_confidence >= 0 AND pattern_confidence <= 1.0),
  sample_size integer DEFAULT 0, -- Number of data points
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(contact_id)
);

CREATE INDEX IF NOT EXISTS idx_homeowner_behavior_contact 
  ON public.homeowner_behavior_patterns(contact_id);

CREATE INDEX IF NOT EXISTS idx_homeowner_behavior_workspace 
  ON public.homeowner_behavior_patterns(workspace_id);

CREATE INDEX IF NOT EXISTS idx_homeowner_behavior_thread 
  ON public.homeowner_behavior_patterns(thread_id) 
  WHERE thread_id IS NOT NULL;

COMMENT ON TABLE public.homeowner_behavior_patterns IS 'Tracks homeowner behavior patterns for intelligent event scheduling';

-- ============================================================================
-- PART 3 — Auto-Scheduler Core Functions
-- ============================================================================

-- Function: Get optimal time for event based on homeowner behavior
CREATE OR REPLACE FUNCTION public.get_optimal_event_time(
  p_contact_id uuid,
  p_event_type text,
  p_preferred_date date DEFAULT NULL
)
RETURNS TABLE (
  optimal_date date,
  optimal_start_time time,
  optimal_end_time time,
  timing_reason text,
  confidence numeric(3,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pattern record;
  v_preferred_hour integer;
  v_preferred_day integer;
  v_optimal_date date;
  v_optimal_time time;
  v_reason text;
  v_confidence numeric(3,2);
BEGIN
  -- Get homeowner behavior pattern
  SELECT * INTO v_pattern
  FROM public.homeowner_behavior_patterns
  WHERE contact_id = p_contact_id;
  
  -- Default to preferred date or tomorrow
  v_optimal_date := COALESCE(p_preferred_date, CURRENT_DATE + INTERVAL '1 day');
  
  -- If no pattern exists, use defaults
  IF v_pattern IS NULL THEN
    -- Default timing based on event type
    CASE p_event_type
      WHEN 'INSTALL_DATE', 'CREW_ASSIGNMENT', 'DUMPSTER_SCHEDULING' THEN
        v_optimal_time := '07:30:00'::time; -- Early morning for installs
        v_reason := 'Default: Install events scheduled for early morning';
      WHEN 'ADJUSTER_APPT', 'SCOPE_REVIEW_CALL' THEN
        v_optimal_time := '14:00:00'::time; -- Midday for adjuster meetings
        v_reason := 'Default: Adjuster meetings scheduled for midday';
      WHEN 'PROPOSAL_REVIEW_CALL', 'INSTALL_READY_CALL', 'DEDUCTIBLE_EXPLANATION_CALL' THEN
        v_optimal_time := '09:00:00'::time; -- Morning for sales calls
        v_reason := 'Default: Sales calls scheduled for morning';
      ELSE
        v_optimal_time := '10:00:00'::time; -- Default 10 AM
        v_reason := 'Default: Event scheduled for 10:00 AM';
    END CASE;
    v_confidence := 0.3;
  ELSE
    -- Use behavior pattern to determine optimal time
    v_confidence := v_pattern.pattern_confidence;
    
    -- Determine preferred hour from pattern
    IF v_pattern.most_active_hour IS NOT NULL THEN
      v_preferred_hour := v_pattern.most_active_hour;
    ELSIF array_length(v_pattern.preferred_reply_hour, 1) > 0 THEN
      -- Use most common reply hour
      SELECT mode() WITHIN GROUP (ORDER BY unnest) INTO v_preferred_hour
      FROM unnest(v_pattern.preferred_reply_hour);
    ELSE
      v_preferred_hour := 10; -- Default 10 AM
    END IF;
    
    -- Adjust based on call preference
    IF v_pattern.call_preference = 'morning' THEN
      v_preferred_hour := 9;
    ELSIF v_pattern.call_preference = 'afternoon' THEN
      v_preferred_hour := 14;
    ELSIF v_pattern.call_preference = 'evening' THEN
      v_preferred_hour := 17;
    END IF;
    
    -- Set optimal time
    v_optimal_time := make_time(v_preferred_hour, 0, 0);
    
    -- Adjust date if preferred day exists
    IF array_length(v_pattern.preferred_reply_day_of_week, 1) > 0 THEN
      SELECT mode() WITHIN GROUP (ORDER BY unnest) INTO v_preferred_day
      FROM unnest(v_pattern.preferred_reply_day_of_week);
      
      -- Adjust date to preferred day
      WHILE EXTRACT(DOW FROM v_optimal_date) != v_preferred_day LOOP
        v_optimal_date := v_optimal_date + INTERVAL '1 day';
      END LOOP;
    END IF;
    
    v_reason := format('Scheduled based on homeowner behavior: most active at %s, prefers %s calls',
      to_char(v_optimal_time, 'HH24:MI'),
      COALESCE(v_pattern.call_preference, 'anytime')
    );
  END IF;
  
  -- Calculate end time (default durations)
  DECLARE
    v_duration_minutes integer;
  BEGIN
    CASE p_event_type
      WHEN 'INSTALL_DATE' THEN v_duration_minutes := 480; -- 8 hours
      WHEN 'ADJUSTER_APPT', 'SCOPE_REVIEW_CALL' THEN v_duration_minutes := 60; -- 1 hour
      WHEN 'PROPOSAL_REVIEW_CALL', 'INSTALL_READY_CALL', 'DEDUCTIBLE_EXPLANATION_CALL' THEN v_duration_minutes := 30; -- 30 min
      WHEN 'FOLLOW_UP' THEN v_duration_minutes := 15; -- 15 min
      ELSE v_duration_minutes := 30;
    END CASE;
    
    RETURN QUERY SELECT
      v_optimal_date,
      v_optimal_time,
      (v_optimal_time + (v_duration_minutes || ' minutes')::interval)::time,
      v_reason,
      v_confidence;
  END;
END;
$$;

COMMENT ON FUNCTION public.get_optimal_event_time IS 'Determines optimal event time based on homeowner behavior patterns';

-- Function: Check for conflicts
CREATE OR REPLACE FUNCTION public.check_calendar_conflicts(
  p_workspace_id uuid,
  p_event_date date,
  p_event_start_time time,
  p_event_end_time time,
  p_assigned_to_user_id uuid DEFAULT NULL,
  p_exclude_event_id uuid DEFAULT NULL
)
RETURNS TABLE (
  has_conflict boolean,
  conflicting_event_ids uuid[],
  conflict_details jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_conflicts uuid[];
  v_details jsonb := '[]'::jsonb;
BEGIN
  -- Find overlapping events
  SELECT array_agg(id), jsonb_agg(jsonb_build_object(
    'id', id,
    'title', title,
    'event_type', event_type,
    'start_time', event_start_time,
    'end_time', event_end_time
  ))
  INTO v_conflicts, v_details
  FROM public.calendar_events
  WHERE workspace_id = p_workspace_id
    AND event_date = p_event_date
    AND status = 'scheduled'
    AND (p_exclude_event_id IS NULL OR id != p_exclude_event_id)
    AND (
      -- Time overlap check
      (
        (p_event_start_time IS NULL AND p_event_end_time IS NULL) OR
        (event_start_time IS NULL AND event_end_time IS NULL) OR
        (
          p_event_start_time IS NOT NULL AND p_event_end_time IS NOT NULL AND
          event_start_time IS NOT NULL AND event_end_time IS NOT NULL AND
          (
            (p_event_start_time < event_end_time AND p_event_end_time > event_start_time) OR
            (p_event_start_time = event_start_time)
          )
        )
      )
      OR
      -- Same user assignment conflict
      (
        p_assigned_to_user_id IS NOT NULL AND
        assigned_to_user_id = p_assigned_to_user_id
      )
    );
  
  RETURN QUERY SELECT
    COALESCE(array_length(v_conflicts, 1) > 0, false),
    COALESCE(v_conflicts, ARRAY[]::uuid[]),
    COALESCE(v_details, '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.check_calendar_conflicts IS 'Checks for calendar conflicts (overlapping times or same user assignment)';

-- Function: Auto-assign event to team role
CREATE OR REPLACE FUNCTION public.auto_assign_event_role(
  p_event_type text
)
RETURNS roofing_team_role
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  CASE p_event_type
    -- Adjuster-facing events → OWNER or ADJUSTER_HELPER
    WHEN 'ADJUSTER_APPT', 'PHOTO_SUBMISSION_DEADLINE', 'SUPPLEMENT_FOLLOWUP', 
         'APPROVAL_FOLLOWUP', 'SCOPE_REVIEW_CALL' THEN
      RETURN 'OWNER'::roofing_team_role;
    
    -- Sales/Homeowner-facing events → SALES_REP
    WHEN 'PROPOSAL_REVIEW_CALL', 'INSTALL_READY_CALL', 'DEDUCTIBLE_EXPLANATION_CALL',
         'REVIEW_REQUEST_CALL', 'FOLLOW_UP' THEN
      RETURN 'SALES_REP'::roofing_team_role;
    
    -- Operational events → OFFICE_STAFF
    WHEN 'CREW_ASSIGNMENT', 'MATERIAL_ORDER_CHECK', 'DUMPSTER_SCHEDULING',
         'CREW_ARRIVAL_CONFIRMATION', 'FINAL_INVOICE_REMINDER', 'PRE_INSTALL_WALKTHROUGH',
         'POST_INSTALL_CHECKIN' THEN
      RETURN 'OFFICE_STAFF'::roofing_team_role;
    
    -- Install events → OWNER (needs oversight)
    WHEN 'INSTALL_DATE' THEN
      RETURN 'OWNER'::roofing_team_role;
    
    -- Default
    ELSE
      RETURN 'SALES_REP'::roofing_team_role;
  END CASE;
END;
$$;

COMMENT ON FUNCTION public.auto_assign_event_role IS 'Auto-assigns event to appropriate team role based on event type';

-- ============================================================================
-- PART 4 — Auto-Schedule Trigger Functions
-- ============================================================================

-- Function: Auto-schedule event with intelligent timing and conflict detection
CREATE OR REPLACE FUNCTION public.auto_schedule_calendar_event(
  p_workspace_id uuid,
  p_event_type text,
  p_title text,
  p_description text DEFAULT NULL,
  p_contact_id uuid DEFAULT NULL,
  p_thread_id uuid DEFAULT NULL,
  p_job_id uuid DEFAULT NULL,
  p_lead_id uuid DEFAULT NULL,
  p_trigger text,
  p_trigger_reason text,
  p_preferred_date date DEFAULT NULL,
  p_preferred_time time DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_id uuid;
  v_optimal_date date;
  v_optimal_start_time time;
  v_optimal_end_time time;
  v_timing_reason text;
  v_confidence numeric(3,2);
  v_assigned_role roofing_team_role;
  v_has_conflict boolean;
  v_conflicting_ids uuid[];
  v_conflict_details jsonb;
  v_final_date date;
  v_final_start_time time;
  v_final_end_time time;
BEGIN
  -- Get optimal timing based on homeowner behavior
  IF p_contact_id IS NOT NULL THEN
    SELECT optimal_date, optimal_start_time, optimal_end_time, timing_reason, confidence
    INTO v_optimal_date, v_optimal_start_time, v_optimal_end_time, v_timing_reason, v_confidence
    FROM public.get_optimal_event_time(p_contact_id, p_event_type, p_preferred_date);
  ELSE
    -- Use provided preferences or defaults
    v_optimal_date := COALESCE(p_preferred_date, CURRENT_DATE + INTERVAL '1 day');
    v_optimal_start_time := COALESCE(p_preferred_time, '10:00:00'::time);
    v_optimal_end_time := (v_optimal_start_time + INTERVAL '30 minutes')::time;
    v_timing_reason := 'Default timing (no homeowner behavior data)';
    v_confidence := 0.3;
  END IF;
  
  -- Override with preferred time if provided
  v_final_date := COALESCE(p_preferred_date, v_optimal_date);
  v_final_start_time := COALESCE(p_preferred_time, v_optimal_start_time);
  v_final_end_time := COALESCE(
    CASE WHEN p_preferred_time IS NOT NULL THEN (p_preferred_time + INTERVAL '30 minutes')::time ELSE NULL END,
    v_optimal_end_time
  );
  
  -- Auto-assign role
  v_assigned_role := public.auto_assign_event_role(p_event_type);
  
  -- Check for conflicts
  SELECT has_conflict, conflicting_event_ids, conflict_details
  INTO v_has_conflict, v_conflicting_ids, v_conflict_details
  FROM public.check_calendar_conflicts(
    p_workspace_id,
    v_final_date,
    v_final_start_time,
    v_final_end_time,
    NULL, -- assigned_to_user_id (not checking user conflicts yet)
    NULL  -- exclude_event_id
  );
  
  -- If conflict detected, adjust time (find next available slot)
  IF v_has_conflict THEN
    -- Try next hour
    v_final_start_time := (v_final_start_time + INTERVAL '1 hour')::time;
    v_final_end_time := (v_final_start_time + INTERVAL '30 minutes')::time;
    
    -- Re-check conflict
    SELECT has_conflict INTO v_has_conflict
    FROM public.check_calendar_conflicts(
      p_workspace_id,
      v_final_date,
      v_final_start_time,
      v_final_end_time,
      NULL,
      NULL
    );
    
    -- If still conflicted, try next day
    IF v_has_conflict THEN
      v_final_date := v_final_date + INTERVAL '1 day';
      v_final_start_time := v_optimal_start_time;
      v_final_end_time := v_optimal_end_time;
      v_timing_reason := v_timing_reason || ' (adjusted due to conflict)';
    END IF;
  END IF;
  
  -- Create calendar event
  INSERT INTO public.calendar_events (
    workspace_id,
    job_id,
    thread_id,
    lead_id,
    contact_id,
    event_type,
    title,
    description,
    event_date,
    event_start_time,
    event_end_time,
    created_by,
    auto_scheduled,
    auto_schedule_reason,
    auto_schedule_trigger,
    auto_schedule_confidence,
    assigned_to_role,
    timing_reason,
    conflict_detected,
    conflict_with_event_ids,
    metadata
  )
  VALUES (
    p_workspace_id,
    p_job_id,
    p_thread_id,
    p_lead_id,
    p_contact_id,
    p_event_type,
    p_title,
    p_description,
    v_final_date,
    v_final_start_time,
    v_final_end_time,
    'AI',
    true,
    p_trigger_reason,
    p_trigger,
    v_confidence,
    v_assigned_role,
    v_timing_reason,
    v_has_conflict,
    v_conflicting_ids,
    p_metadata
  )
  RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$$;

COMMENT ON FUNCTION public.auto_schedule_calendar_event IS 'Auto-schedules calendar event with intelligent timing, conflict detection, and role assignment';

-- ============================================================================
-- PART 5 — Trigger A: Claim Approved → Auto-Schedule Install-Ready Call
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_auto_schedule_install_ready_call()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_id uuid;
  v_job_id uuid;
  v_contact_id uuid;
  v_homeowner_name text;
  v_job_value numeric;
  v_deductible numeric;
BEGIN
  -- Trigger when claim is approved
  IF NEW.insurance_claim_status = 'approved' AND
     (OLD.insurance_claim_status IS NULL OR OLD.insurance_claim_status != 'approved') THEN
    
    -- Get contact and job info
    v_contact_id := NEW.contact_id;
    
    SELECT id INTO v_job_id
    FROM public.roofing_jobs
    WHERE thread_id = NEW.id
    LIMIT 1;
    
    IF v_job_id IS NULL THEN
      v_job_id := public.get_or_create_roofing_job(p_thread_id := NEW.id);
    END IF;
    
    -- Get homeowner name
    SELECT name INTO v_homeowner_name
    FROM public.contacts
    WHERE id = v_contact_id;
    
    -- Get job value and deductible
    SELECT COALESCE(projected_job_value, 0), COALESCE(insurance_deductible, 0)
    INTO v_job_value, v_deductible
    FROM public.roofing_jobs
    WHERE id = v_job_id;
    
    -- Auto-schedule install-ready call for next morning at 9 AM
    PERFORM public.auto_schedule_calendar_event(
      p_workspace_id := NEW.workspace_id,
      p_event_type := 'INSTALL_READY_CALL',
      p_title := 'Call Homeowner to Schedule Install — Approval Received',
      p_description := format('Claim approved. Call homeowner to schedule installation. Job value: $%s, Deductible: $%s',
        to_char(v_job_value, 'FM999,999,999.00'),
        to_char(v_deductible, 'FM999,999,999.00')
      ),
      p_contact_id := v_contact_id,
      p_thread_id := NEW.id,
      p_job_id := v_job_id,
      p_trigger := 'claim_approved',
      p_trigger_reason := 'Claim approved — schedule install call with homeowner',
      p_preferred_date := CURRENT_DATE + INTERVAL '1 day',
      p_preferred_time := '09:00:00'::time,
      p_metadata := jsonb_build_object(
        'homeowner_name', v_homeowner_name,
        'job_value', v_job_value,
        'deductible', v_deductible,
        'claim_number', NEW.insurance_claim_number
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_schedule_install_ready_call ON public.inbox_threads;
CREATE TRIGGER trg_auto_schedule_install_ready_call
  AFTER UPDATE ON public.inbox_threads
  FOR EACH ROW
  WHEN (
    NEW.insurance_claim_status = 'approved' AND
    (OLD.insurance_claim_status IS NULL OR OLD.insurance_claim_status != 'approved')
  )
  EXECUTE FUNCTION public.trigger_auto_schedule_install_ready_call();

-- ============================================================================
-- PART 6 — Trigger B: Adjuster Appointment Detected → Auto-Add to Calendar
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_auto_schedule_adjuster_appointment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_id uuid;
  v_job_id uuid;
  v_contact_id uuid;
  v_event_date date;
  v_event_time time;
  v_claim_number text;
BEGIN
  -- Trigger when adjuster visit is scheduled
  IF NEW.insurance_claim_status = 'adjuster_visit_scheduled' AND
     (OLD.insurance_claim_status IS NULL OR OLD.insurance_claim_status != 'adjuster_visit_scheduled') THEN
    
    v_contact_id := NEW.contact_id;
    
    -- Try to extract date/time from latest message
    SELECT 
      CASE 
        WHEN body_text ~* '(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})' THEN
          (regexp_match(body_text, '(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})'))[1]::date
        ELSE
          CURRENT_DATE + INTERVAL '7 days'
      END,
      CASE 
        WHEN body_text ~* '(\d{1,2}):(\d{2})\s*(AM|PM)' THEN
          (regexp_match(body_text, '(\d{1,2}):(\d{2})\s*(AM|PM)'))[1]::time
        ELSE
          '14:00:00'::time
      END
    INTO v_event_date, v_event_time
    FROM public.inbox_messages
    WHERE thread_id = NEW.id
    ORDER BY sent_at DESC
    LIMIT 1;
    
    IF v_event_date IS NULL THEN
      v_event_date := CURRENT_DATE + INTERVAL '1 day';
    END IF;
    
    v_claim_number := COALESCE(NEW.insurance_claim_number, 'Unknown');
    
    -- Get or create job
    SELECT id INTO v_job_id
    FROM public.roofing_jobs
    WHERE thread_id = NEW.id
    LIMIT 1;
    
    IF v_job_id IS NULL THEN
      v_job_id := public.get_or_create_roofing_job(p_thread_id := NEW.id);
    END IF;
    
    -- Auto-schedule adjuster appointment
    PERFORM public.auto_schedule_calendar_event(
      p_workspace_id := NEW.workspace_id,
      p_event_type := 'ADJUSTER_APPT',
      p_title := format('Adjuster Meeting — %s (Claim %s)', 
        COALESCE(NEW.insurance_carrier, 'Insurance'), 
        v_claim_number
      ),
      p_description := format('Adjuster appointment detected in email. Be on site.'),
      p_contact_id := v_contact_id,
      p_thread_id := NEW.id,
      p_job_id := v_job_id,
      p_trigger := 'adjuster_appointment_detected',
      p_trigger_reason := format('Detected adjuster appointment in email: %s at %s',
        v_event_date::text,
        v_event_time::text
      ),
      p_preferred_date := v_event_date,
      p_preferred_time := v_event_time,
      p_metadata := jsonb_build_object(
        'claim_number', v_claim_number,
        'carrier', NEW.insurance_carrier,
        'adjuster_email', NEW.insurance_adjuster_email,
        'adjuster_name', NEW.insurance_adjuster_name
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_schedule_adjuster_appointment ON public.inbox_threads;
CREATE TRIGGER trg_auto_schedule_adjuster_appointment
  AFTER UPDATE ON public.inbox_threads
  FOR EACH ROW
  WHEN (
    NEW.insurance_claim_status = 'adjuster_visit_scheduled' AND
    (OLD.insurance_claim_status IS NULL OR OLD.insurance_claim_status != 'adjuster_visit_scheduled')
  )
  EXECUTE FUNCTION public.trigger_auto_schedule_adjuster_appointment();

-- ============================================================================
-- PART 7 — Trigger C: Proposal Viewed 2+ Times → Immediate Follow-Up
-- ============================================================================

-- Track proposal views
CREATE TABLE IF NOT EXISTS public.proposal_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  duration_seconds integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposal_views_proposal 
  ON public.proposal_views(proposal_id, viewed_at DESC);

CREATE INDEX IF NOT EXISTS idx_proposal_views_thread 
  ON public.proposal_views(thread_id, viewed_at DESC);

CREATE INDEX IF NOT EXISTS idx_proposal_views_contact 
  ON public.proposal_views(contact_id, viewed_at DESC);

-- Function to check for hot proposal views and auto-schedule follow-up
CREATE OR REPLACE FUNCTION public.check_proposal_views_and_schedule()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_proposal record;
  v_view_count bigint;
  v_recent_views bigint;
  v_event_id uuid;
  v_job_id uuid;
BEGIN
  -- Find proposals viewed 2+ times in last 30 minutes
  FOR v_proposal IN
    SELECT 
      p.id as proposal_id,
      p.thread_id,
      p.contact_id,
      p.workspace_id,
      COUNT(pv.id) as view_count,
      MAX(pv.viewed_at) as last_viewed_at
    FROM public.proposals p
    JOIN public.proposal_views pv ON pv.proposal_id = p.id
    WHERE p.status = 'sent'
      AND pv.viewed_at >= NOW() - INTERVAL '30 minutes'
    GROUP BY p.id, p.thread_id, p.contact_id, p.workspace_id
    HAVING COUNT(pv.id) >= 2
  LOOP
    -- Check if follow-up event already exists for today
    IF NOT EXISTS (
      SELECT 1 FROM public.calendar_events
      WHERE thread_id = v_proposal.thread_id
        AND event_type = 'FOLLOW_UP'
        AND event_date = CURRENT_DATE
        AND status = 'scheduled'
        AND metadata->>'trigger' = 'proposal_viewed_2x'
    ) THEN
      -- Get job_id
      SELECT id INTO v_job_id
      FROM public.roofing_jobs
      WHERE thread_id = v_proposal.thread_id
      LIMIT 1;
      
      -- Auto-schedule immediate follow-up (within 1 hour)
      PERFORM public.auto_schedule_calendar_event(
        p_workspace_id := v_proposal.workspace_id,
        p_event_type := 'FOLLOW_UP',
        p_title := 'Follow Up with Homeowner — They Are Hot',
        p_description := format('Homeowner viewed proposal %s times in 30 minutes. High install probability.',
          v_proposal.view_count
        ),
        p_contact_id := v_proposal.contact_id,
        p_thread_id := v_proposal.thread_id,
        p_job_id := v_job_id,
        p_trigger := 'proposal_viewed_2x',
        p_trigger_reason := format('Proposal viewed %s times in 30 minutes — immediate follow-up needed',
          v_proposal.view_count
        ),
        p_preferred_date := CURRENT_DATE,
        p_preferred_time := (CURRENT_TIME + INTERVAL '1 hour')::time,
        p_metadata := jsonb_build_object(
          'proposal_id', v_proposal.proposal_id,
          'view_count', v_proposal.view_count,
          'last_viewed_at', v_proposal.last_viewed_at,
          'priority', 'high'
        )
      );
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.check_proposal_views_and_schedule IS 'Checks for hot proposal views and auto-schedules follow-up events (call via cron)';

-- ============================================================================
-- PART 14 — Integration: Insurance Timeline → Auto-Schedule Events
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_auto_schedule_from_timeline()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_id uuid;
  v_thread_id uuid;
  v_job_id uuid;
  v_contact_id uuid;
  v_workspace_id uuid;
BEGIN
  -- Only trigger on stage changes
  IF OLD.stage = NEW.stage THEN
    RETURN NEW;
  END IF;
  
  v_contact_id := NEW.contact_id;
  v_workspace_id := NEW.workspace_id;
  
  -- Get thread_id from contact
  SELECT id INTO v_thread_id
  FROM public.inbox_threads
  WHERE contact_id = v_contact_id
  ORDER BY created_at DESC
  LIMIT 1;
  
  -- Get job_id
  IF v_thread_id IS NOT NULL THEN
    SELECT id INTO v_job_id
    FROM public.roofing_jobs
    WHERE thread_id = v_thread_id
    LIMIT 1;
  END IF;
  
  -- Auto-schedule events based on timeline stage
  CASE NEW.stage
    WHEN 'adjuster_scheduled' THEN
      -- Auto-schedule adjuster appointment reminder
      PERFORM public.auto_schedule_calendar_event(
        p_workspace_id := v_workspace_id,
        p_event_type := 'ADJUSTER_APPT',
        p_title := 'Adjuster Meeting Reminder',
        p_description := COALESCE(NEW.stage_description, 'Adjuster appointment scheduled'),
        p_contact_id := v_contact_id,
        p_thread_id := v_thread_id,
        p_job_id := v_job_id,
        p_trigger := 'insurance_timeline',
        p_trigger_reason := 'Insurance timeline: Adjuster scheduled',
        p_preferred_date := NEW.stage_date,
        p_preferred_time := '14:00:00'::time,
        p_metadata := jsonb_build_object('timeline_stage', NEW.stage)
      );
    
    WHEN 'scope_received' THEN
      -- Auto-schedule scope review call
      PERFORM public.auto_schedule_calendar_event(
        p_workspace_id := v_workspace_id,
        p_event_type := 'SCOPE_REVIEW_CALL',
        p_title := 'Review Scope with Adjuster',
        p_description := 'Scope received — review and discuss with adjuster',
        p_contact_id := v_contact_id,
        p_thread_id := v_thread_id,
        p_job_id := v_job_id,
        p_trigger := 'insurance_timeline',
        p_trigger_reason := 'Insurance timeline: Scope received',
        p_preferred_date := NEW.stage_date + INTERVAL '1 day',
        p_preferred_time := '10:00:00'::time,
        p_metadata := jsonb_build_object('timeline_stage', NEW.stage)
      );
    
    WHEN 'supplement_review' THEN
      -- Auto-schedule supplement follow-up
      PERFORM public.auto_schedule_calendar_event(
        p_workspace_id := v_workspace_id,
        p_event_type := 'SUPPLEMENT_FOLLOWUP',
        p_title := 'Follow Up on Supplement',
        p_description := 'Supplement submitted — follow up on status',
        p_contact_id := v_contact_id,
        p_thread_id := v_thread_id,
        p_job_id := v_job_id,
        p_trigger := 'insurance_timeline',
        p_trigger_reason := 'Insurance timeline: Supplement review',
        p_preferred_date := NEW.stage_date + INTERVAL '5 days',
        p_preferred_time := '09:00:00'::time,
        p_metadata := jsonb_build_object('timeline_stage', NEW.stage)
      );
    
    WHEN 'approved' THEN
      -- Auto-schedule install-ready call (already handled by trigger_auto_schedule_install_ready_call)
      -- But also schedule payment confirmation
      PERFORM public.auto_schedule_calendar_event(
        p_workspace_id := v_workspace_id,
        p_event_type := 'PAYMENT_CONFIRMATION',
        p_title := 'Confirm Payment Release',
        p_description := 'Claim approved — confirm payment has been released',
        p_contact_id := v_contact_id,
        p_thread_id := v_thread_id,
        p_job_id := v_job_id,
        p_trigger := 'insurance_timeline',
        p_trigger_reason := 'Insurance timeline: Claim approved',
        p_preferred_date := NEW.stage_date + INTERVAL '3 days',
        p_preferred_time := '10:00:00'::time,
        p_metadata := jsonb_build_object('timeline_stage', NEW.stage)
      );
    
    WHEN 'ready_to_schedule' THEN
      -- Auto-schedule proposal review call
      PERFORM public.auto_schedule_calendar_event(
        p_workspace_id := v_workspace_id,
        p_event_type := 'PROPOSAL_REVIEW_CALL',
        p_title := 'Proposal Review Call',
        p_description := 'Ready to schedule — review proposal with homeowner',
        p_contact_id := v_contact_id,
        p_thread_id := v_thread_id,
        p_job_id := v_job_id,
        p_trigger := 'insurance_timeline',
        p_trigger_reason := 'Insurance timeline: Ready to schedule',
        p_preferred_date := NEW.stage_date,
        p_preferred_time := NULL, -- Use homeowner behavior pattern
        p_metadata := jsonb_build_object('timeline_stage', NEW.stage)
      );
  END CASE;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_schedule_from_timeline ON public.insurance_timeline;
CREATE TRIGGER trg_auto_schedule_from_timeline
  AFTER INSERT OR UPDATE ON public.insurance_timeline
  FOR EACH ROW
  WHEN (OLD.stage IS DISTINCT FROM NEW.stage AND NEW.is_current_stage = true)
  EXECUTE FUNCTION public.trigger_auto_schedule_from_timeline();

COMMENT ON FUNCTION public.trigger_auto_schedule_from_timeline IS 'Block 21320: Auto-schedules calendar events based on insurance timeline stage changes';

-- ============================================================================
-- PART 15 — Integration: Follow-Up Brain → Auto-Schedule Calendar Events
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_auto_schedule_from_followup_brain()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_id uuid;
  v_thread_id uuid;
  v_job_id uuid;
  v_contact_id uuid;
  v_workspace_id uuid;
BEGIN
  -- Trigger when follow-up state changes to hot/warm or when next_action_at is set
  IF NEW.classification IN ('hot', 'warm') AND 
     (OLD.classification IS NULL OR OLD.classification != NEW.classification) THEN
    
    -- Get lead info
    SELECT workspace_id INTO v_workspace_id
    FROM public.leads
    WHERE id = NEW.lead_id;
    
    -- Get thread_id from lead
    SELECT id INTO v_thread_id
    FROM public.inbox_threads
    WHERE lead_id = NEW.lead_id
    ORDER BY created_at DESC
    LIMIT 1;
    
    -- Get contact_id
    IF v_thread_id IS NOT NULL THEN
      SELECT contact_id INTO v_contact_id
      FROM public.inbox_threads
      WHERE id = v_thread_id;
      
      -- Get job_id
      SELECT id INTO v_job_id
      FROM public.roofing_jobs
      WHERE thread_id = v_thread_id
      LIMIT 1;
    END IF;
    
    -- Auto-schedule follow-up call based on classification
    IF NEW.classification = 'hot' THEN
      -- Hot lead → immediate follow-up
      PERFORM public.auto_schedule_calendar_event(
        p_workspace_id := v_workspace_id,
        p_event_type := 'FOLLOW_UP',
        p_title := 'Hot Lead Follow-Up — High Priority',
        p_description := 'Follow-up brain detected hot lead — immediate follow-up needed',
        p_contact_id := v_contact_id,
        p_thread_id := v_thread_id,
        p_job_id := v_job_id,
        p_trigger := 'followup_brain_hot',
        p_trigger_reason := 'Follow-up brain: Hot lead detected',
        p_preferred_date := CURRENT_DATE,
        p_preferred_time := NULL, -- Use homeowner behavior pattern
        p_metadata := jsonb_build_object(
          'classification', NEW.classification,
          'lead_id', NEW.lead_id,
          'priority', 'high'
        )
      );
    ELSIF NEW.classification = 'warm' THEN
      -- Warm lead → schedule for next day
      PERFORM public.auto_schedule_calendar_event(
        p_workspace_id := v_workspace_id,
        p_event_type := 'FOLLOW_UP',
        p_title := 'Warm Lead Follow-Up',
        p_description := 'Follow-up brain detected warm lead — follow up tomorrow',
        p_contact_id := v_contact_id,
        p_thread_id := v_thread_id,
        p_job_id := v_job_id,
        p_trigger := 'followup_brain_warm',
        p_trigger_reason := 'Follow-up brain: Warm lead detected',
        p_preferred_date := CURRENT_DATE + INTERVAL '1 day',
        p_preferred_time := NULL, -- Use homeowner behavior pattern
        p_metadata := jsonb_build_object(
          'classification', NEW.classification,
          'lead_id', NEW.lead_id
        )
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_schedule_from_followup_brain ON public.followup_states;
CREATE TRIGGER trg_auto_schedule_from_followup_brain
  AFTER UPDATE ON public.followup_states
  FOR EACH ROW
  WHEN (
    NEW.classification IN ('hot', 'warm') AND
    (OLD.classification IS NULL OR OLD.classification != NEW.classification)
  )
  EXECUTE FUNCTION public.trigger_auto_schedule_from_followup_brain();

COMMENT ON FUNCTION public.trigger_auto_schedule_from_followup_brain IS 'Block 21320: Auto-schedules calendar events when follow-up brain detects hot/warm leads';

-- ============================================================================
-- PART 8 — Trigger D: Missing Photos / Adjuster Request → Urgent Reminder
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_auto_schedule_photo_submission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_id uuid;
  v_job_id uuid;
  v_contact_id uuid;
BEGIN
  -- Trigger when adjuster requests photos or missing documentation detected
  IF NEW.direction = 'in' AND (
    NEW.body_text ~* '(photo|picture|image|documentation|document)' AND
    NEW.body_text ~* '(need|required|send|submit|missing)'
  ) THEN
    v_contact_id := (SELECT contact_id FROM public.inbox_threads WHERE id = NEW.thread_id);
    
    -- Check if photo submission event already exists
    IF NOT EXISTS (
      SELECT 1 FROM public.calendar_events
      WHERE thread_id = NEW.thread_id
        AND event_type = 'PHOTO_SUBMISSION_DEADLINE'
        AND event_date >= CURRENT_DATE
        AND status = 'scheduled'
    ) THEN
      -- Get job_id
      SELECT id INTO v_job_id
      FROM public.roofing_jobs
      WHERE thread_id = NEW.thread_id
      LIMIT 1;
      
      -- Auto-schedule urgent photo submission reminder
      PERFORM public.auto_schedule_calendar_event(
        p_workspace_id := (SELECT workspace_id FROM public.inbox_threads WHERE id = NEW.thread_id),
        p_event_type := 'PHOTO_SUBMISSION_DEADLINE',
        p_title := 'Send Photos to Adjuster — Required for Next Step',
        p_description := 'Adjuster requested photos. Send immediately to avoid delays.',
        p_contact_id := v_contact_id,
        p_thread_id := NEW.thread_id,
        p_job_id := v_job_id,
        p_trigger := 'adjuster_photo_request',
        p_trigger_reason := 'Adjuster requested photos in email — urgent action needed',
        p_preferred_date := CURRENT_DATE,
        p_preferred_time := CURRENT_TIME,
        p_metadata := jsonb_build_object(
          'priority', 'urgent',
          'message_id', NEW.id
        )
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_schedule_photo_submission ON public.inbox_messages;
CREATE TRIGGER trg_auto_schedule_photo_submission
  AFTER INSERT ON public.inbox_messages
  FOR EACH ROW
  WHEN (NEW.direction = 'in')
  EXECUTE FUNCTION public.trigger_auto_schedule_photo_submission();

-- ============================================================================
-- PART 9 — Trigger E: Supplement Opportunity Found → Create Review Event
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_auto_schedule_supplement_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_id uuid;
  v_job_id uuid;
  v_contact_id uuid;
  v_underpayment_amount numeric;
  v_rcv_total numeric;
  v_estimate_total numeric;
BEGIN
  -- Check for supplement opportunity (underpayment > $3,000)
  SELECT 
    COALESCE(NEW.insurance_rcv_total, 0),
    COALESCE(NEW.insurance_estimate_total, 0)
  INTO v_rcv_total, v_estimate_total;
  
  v_underpayment_amount := GREATEST(0, v_estimate_total - v_rcv_total);
  
  -- Trigger if underpayment > $3,000
  IF v_underpayment_amount > 3000 AND
     (OLD.insurance_rcv_total IS NULL OR OLD.insurance_rcv_total != NEW.insurance_rcv_total) THEN
    
    v_contact_id := NEW.contact_id;
    
    -- Check if supplement review event already exists
    IF NOT EXISTS (
      SELECT 1 FROM public.calendar_events
      WHERE thread_id = NEW.id
        AND event_type = 'SUPPLEMENT_FOLLOWUP'
        AND event_date >= CURRENT_DATE
        AND status = 'scheduled'
    ) THEN
      -- Get job_id
      SELECT id INTO v_job_id
      FROM public.roofing_jobs
      WHERE thread_id = NEW.id
      LIMIT 1;
      
      IF v_job_id IS NULL THEN
        v_job_id := public.get_or_create_roofing_job(p_thread_id := NEW.id);
      END IF;
      
      -- Auto-schedule supplement review for next business day
      PERFORM public.auto_schedule_calendar_event(
        p_workspace_id := NEW.workspace_id,
        p_event_type := 'SUPPLEMENT_FOLLOWUP',
        p_title := format('Review Supplement Items — Underpayment: $%s',
          to_char(v_underpayment_amount, 'FM999,999,999.00')
        ),
        p_description := format('Underpayment detected: $%s. Review supplement items and send adjuster email.',
          to_char(v_underpayment_amount, 'FM999,999,999.00')
        ),
        p_contact_id := v_contact_id,
        p_thread_id := NEW.id,
        p_job_id := v_job_id,
        p_trigger := 'supplement_opportunity',
        p_trigger_reason := format('Underpayment detected: $%s — supplement review needed',
          to_char(v_underpayment_amount, 'FM999,999,999.00')
        ),
        p_preferred_date := CURRENT_DATE + INTERVAL '1 day',
        p_preferred_time := '10:00:00'::time,
        p_metadata := jsonb_build_object(
          'underpayment_amount', v_underpayment_amount,
          'rcv_total', v_rcv_total,
          'estimate_total', v_estimate_total,
          'claim_number', NEW.insurance_claim_number
        )
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_schedule_supplement_review ON public.inbox_threads;
CREATE TRIGGER trg_auto_schedule_supplement_review
  AFTER UPDATE ON public.inbox_threads
  FOR EACH ROW
  WHEN (
    NEW.insurance_rcv_total IS NOT NULL AND
    (OLD.insurance_rcv_total IS NULL OR OLD.insurance_rcv_total != NEW.insurance_rcv_total)
  )
  EXECUTE FUNCTION public.trigger_auto_schedule_supplement_review();

-- ============================================================================
-- PART 10 — Trigger F: Install Booked → Auto-Schedule Operational Events
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_auto_schedule_install_operations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_id uuid;
  v_job_id uuid;
  v_contact_id uuid;
  v_install_date date;
BEGIN
  -- Trigger when install date is set
  IF NEW.event_type = 'INSTALL_DATE' AND NEW.status = 'scheduled' AND
     (OLD.event_type IS NULL OR OLD.event_type != 'INSTALL_DATE' OR OLD.status != 'scheduled') THEN
    
    v_install_date := NEW.event_date;
    v_contact_id := NEW.contact_id;
    v_job_id := NEW.job_id;
    
    -- Auto-schedule operational events
    
    -- 1. Crew assignment (3 days before install)
    PERFORM public.auto_schedule_calendar_event(
      p_workspace_id := NEW.workspace_id,
      p_event_type := 'CREW_ASSIGNMENT',
      p_title := 'Assign Crew for Install',
      p_description := format('Install scheduled for %s. Assign crew members.',
        v_install_date::text
      ),
      p_contact_id := v_contact_id,
      p_thread_id := NEW.thread_id,
      p_job_id := v_job_id,
      p_trigger := 'install_booked',
      p_trigger_reason := 'Install date set — assign crew',
      p_preferred_date := v_install_date - INTERVAL '3 days',
      p_preferred_time := '08:00:00'::time,
      p_metadata := jsonb_build_object('install_date', v_install_date)
    );
    
    -- 2. Material order check (5 days before install)
    PERFORM public.auto_schedule_calendar_event(
      p_workspace_id := NEW.workspace_id,
      p_event_type := 'MATERIAL_ORDER_CHECK',
      p_title := 'Check Material Order Status',
      p_description := format('Install scheduled for %s. Verify materials are ordered and will arrive on time.',
        v_install_date::text
      ),
      p_contact_id := v_contact_id,
      p_thread_id := NEW.thread_id,
      p_job_id := v_job_id,
      p_trigger := 'install_booked',
      p_trigger_reason := 'Install date set — check materials',
      p_preferred_date := v_install_date - INTERVAL '5 days',
      p_preferred_time := '09:00:00'::time,
      p_metadata := jsonb_build_object('install_date', v_install_date)
    );
    
    -- 3. Dumpster scheduling (2 days before install)
    PERFORM public.auto_schedule_calendar_event(
      p_workspace_id := NEW.workspace_id,
      p_event_type := 'DUMPSTER_SCHEDULING',
      p_title := 'Schedule Dumpster Delivery',
      p_description := format('Install scheduled for %s. Schedule dumpster delivery.',
        v_install_date::text
      ),
      p_contact_id := v_contact_id,
      p_thread_id := NEW.thread_id,
      p_job_id := v_job_id,
      p_trigger := 'install_booked',
      p_trigger_reason := 'Install date set — schedule dumpster',
      p_preferred_date := v_install_date - INTERVAL '2 days',
      p_preferred_time := '10:00:00'::time,
      p_metadata := jsonb_build_object('install_date', v_install_date)
    );
    
    -- 4. Pre-install homeowner call (1 day before install)
    PERFORM public.auto_schedule_calendar_event(
      p_workspace_id := NEW.workspace_id,
      p_event_type := 'PRE_INSTALL_WALKTHROUGH',
      p_title := 'Pre-Install Call with Homeowner',
      p_description := format('Install scheduled for %s. Call homeowner to confirm and review details.',
        v_install_date::text
      ),
      p_contact_id := v_contact_id,
      p_thread_id := NEW.thread_id,
      p_job_id := v_job_id,
      p_trigger := 'install_booked',
      p_trigger_reason := 'Install date set — pre-install call',
      p_preferred_date := v_install_date - INTERVAL '1 day',
      p_preferred_time := NULL, -- Use homeowner behavior pattern
      p_metadata := jsonb_build_object('install_date', v_install_date)
    );
    
    -- 5. Post-install callback (1 day after install)
    PERFORM public.auto_schedule_calendar_event(
      p_workspace_id := NEW.workspace_id,
      p_event_type := 'POST_INSTALL_CHECKIN',
      p_title := 'Post-Install Check-In Call',
      p_description := format('Install completed on %s. Follow up with homeowner.',
        v_install_date::text
      ),
      p_contact_id := v_contact_id,
      p_thread_id := NEW.thread_id,
      p_job_id := v_job_id,
      p_trigger := 'install_booked',
      p_trigger_reason := 'Install date set — post-install follow-up',
      p_preferred_date := v_install_date + INTERVAL '1 day',
      p_preferred_time := NULL, -- Use homeowner behavior pattern
      p_metadata := jsonb_build_object('install_date', v_install_date)
    );
    
    -- 6. Payment request (3 days after install)
    PERFORM public.auto_schedule_calendar_event(
      p_workspace_id := NEW.workspace_id,
      p_event_type := 'FINAL_INVOICE_REMINDER',
      p_title := 'Send Final Invoice / Payment Request',
      p_description := format('Install completed on %s. Send final invoice and request payment.',
        v_install_date::text
      ),
      p_contact_id := v_contact_id,
      p_thread_id := NEW.thread_id,
      p_job_id := v_job_id,
      p_trigger := 'install_booked',
      p_trigger_reason := 'Install date set — payment request',
      p_preferred_date := v_install_date + INTERVAL '3 days',
      p_preferred_time := '09:00:00'::time,
      p_metadata := jsonb_build_object('install_date', v_install_date)
    );
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_schedule_install_operations ON public.calendar_events;
CREATE TRIGGER trg_auto_schedule_install_operations
  AFTER INSERT OR UPDATE ON public.calendar_events
  FOR EACH ROW
  WHEN (
    NEW.event_type = 'INSTALL_DATE' AND NEW.status = 'scheduled' AND
    (OLD.event_type IS NULL OR OLD.event_type != 'INSTALL_DATE' OR OLD.status IS DISTINCT FROM NEW.status)
  )
  EXECUTE FUNCTION public.trigger_auto_schedule_install_operations();

-- ============================================================================
-- PART 11 — Update Behavior Patterns When Homeowner Engages
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_homeowner_behavior_pattern()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact_id uuid;
  v_hour integer;
  v_day_of_week integer;
  v_pattern_id uuid;
BEGIN
  -- Only process inbound messages
  IF NEW.direction != 'in' THEN
    RETURN NEW;
  END IF;
  
  -- Get contact_id from thread
  SELECT contact_id INTO v_contact_id
  FROM public.inbox_threads
  WHERE id = NEW.thread_id;
  
  IF v_contact_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Extract hour and day of week
  v_hour := EXTRACT(HOUR FROM NEW.sent_at);
  v_day_of_week := EXTRACT(DOW FROM NEW.sent_at);
  
  -- Get or create behavior pattern
  SELECT id INTO v_pattern_id
  FROM public.homeowner_behavior_patterns
  WHERE contact_id = v_contact_id;
  
  IF v_pattern_id IS NULL THEN
    INSERT INTO public.homeowner_behavior_patterns (
      contact_id,
      thread_id,
      workspace_id,
      preferred_reply_hour,
      preferred_reply_day_of_week,
      most_active_hour,
      most_active_day,
      sample_size,
      pattern_confidence
    )
    SELECT 
      v_contact_id,
      NEW.thread_id,
      workspace_id,
      ARRAY[v_hour],
      ARRAY[v_day_of_week],
      v_hour,
      v_day_of_week,
      1,
      0.3
    FROM public.inbox_threads
    WHERE id = NEW.thread_id;
  ELSE
    -- Update existing pattern
    UPDATE public.homeowner_behavior_patterns
    SET
      preferred_reply_hour = array_append(
        COALESCE(preferred_reply_hour, ARRAY[]::integer[]),
        v_hour
      ),
      preferred_reply_day_of_week = array_append(
        COALESCE(preferred_reply_day_of_week, ARRAY[]::integer[]),
        v_day_of_week
      ),
      most_active_hour = (
        SELECT mode() WITHIN GROUP (ORDER BY unnest)
        FROM unnest(array_append(preferred_reply_hour, v_hour))
      ),
      most_active_day = (
        SELECT mode() WITHIN GROUP (ORDER BY unnest)
        FROM unnest(array_append(preferred_reply_day_of_week, v_day_of_week))
      ),
      sample_size = sample_size + 1,
      pattern_confidence = LEAST(1.0, 0.3 + (sample_size + 1) * 0.05),
      updated_at = NOW()
    WHERE id = v_pattern_id;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_homeowner_behavior_pattern ON public.inbox_messages;
CREATE TRIGGER trg_update_homeowner_behavior_pattern
  AFTER INSERT ON public.inbox_messages
  FOR EACH ROW
  WHEN (NEW.direction = 'in')
  EXECUTE FUNCTION public.update_homeowner_behavior_pattern();

-- ============================================================================
-- PART 12 — Notification Integration for Auto-Scheduled Events
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_auto_scheduled_event_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_workspace_id uuid;
  v_notification_title text;
  v_notification_body text;
BEGIN
  -- Only create notifications for auto-scheduled events
  IF NOT NEW.auto_scheduled OR NEW.status != 'scheduled' THEN
    RETURN NEW;
  END IF;
  
  v_workspace_id := NEW.workspace_id;
  
  -- Get users to notify based on assigned role
  FOR v_user_id IN
    SELECT DISTINCT om.user_id
    FROM public.org_memberships om
    WHERE om.org_id = (
      SELECT org_id FROM public.workspaces WHERE id = v_workspace_id LIMIT 1
    )
    AND om.status = 'active'
    AND (
      -- Notify assigned user if specified
      (NEW.assigned_to_user_id IS NOT NULL AND om.user_id = NEW.assigned_to_user_id)
      OR
      -- Notify users with assigned role
      (NEW.assigned_to_role IS NOT NULL AND om.roofing_role = NEW.assigned_to_role)
      OR
      -- Notify OWNER if no specific assignment
      (NEW.assigned_to_role IS NULL AND NEW.assigned_to_user_id IS NULL AND om.roofing_role = 'OWNER')
    )
  LOOP
    v_notification_title := 'Event Auto-Scheduled: ' || NEW.title;
    v_notification_body := COALESCE(NEW.auto_schedule_reason, 'SmartSend automatically scheduled this event.');
    
    -- Create notification (using existing notification system)
    INSERT INTO public.notifications (
      user_id,
      workspace_id,
      thread_id,
      job_id,
      type,
      title,
      body,
      payload,
      is_read,
      created_at
    )
    VALUES (
      v_user_id,
      v_workspace_id,
      NEW.thread_id,
      NEW.job_id,
      'calendar_event_auto_scheduled',
      v_notification_title,
      v_notification_body,
      jsonb_build_object(
        'event_id', NEW.id,
        'event_type', NEW.event_type,
        'event_date', NEW.event_date,
        'auto_schedule_reason', NEW.auto_schedule_reason,
        'trigger', NEW.auto_schedule_trigger
      ),
      false,
      NOW()
    );
  END LOOP;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_auto_scheduled_event_notifications ON public.calendar_events;
CREATE TRIGGER trg_create_auto_scheduled_event_notifications
  AFTER INSERT ON public.calendar_events
  FOR EACH ROW
  WHEN (NEW.auto_scheduled = true AND NEW.status = 'scheduled')
  EXECUTE FUNCTION public.create_auto_scheduled_event_notifications();

-- ============================================================================
-- PART 13 — RLS Policies for New Tables
-- ============================================================================

ALTER TABLE IF EXISTS public.homeowner_behavior_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.proposal_views ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view behavior patterns for their workspace
DROP POLICY IF EXISTS "Users can view behavior patterns for their workspace" ON public.homeowner_behavior_patterns;
CREATE POLICY "Users can view behavior patterns for their workspace" ON public.homeowner_behavior_patterns
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = homeowner_behavior_patterns.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Policy: Service role can manage behavior patterns
DROP POLICY IF EXISTS "Service role can manage behavior patterns" ON public.homeowner_behavior_patterns;
CREATE POLICY "Service role can manage behavior patterns" ON public.homeowner_behavior_patterns
  FOR ALL USING (auth.role() = 'service_role');

-- Policy: Users can view proposal views for their workspace
DROP POLICY IF EXISTS "Users can view proposal views for their workspace" ON public.proposal_views;
CREATE POLICY "Users can view proposal views for their workspace" ON public.proposal_views
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.proposals p
      JOIN public.inbox_threads it ON it.id = p.thread_id
      JOIN public.workspace_members wm ON wm.workspace_id = it.workspace_id
      WHERE p.id = proposal_views.proposal_id
        AND wm.user_id = auth.uid()
    )
  );

-- Policy: Service role can manage proposal views
DROP POLICY IF EXISTS "Service role can manage proposal views" ON public.proposal_views;
CREATE POLICY "Service role can manage proposal views" ON public.proposal_views
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- PART 14 — Comments
-- ============================================================================

COMMENT ON TABLE public.homeowner_behavior_patterns IS 'Block 21320: Tracks homeowner behavior patterns for intelligent event scheduling';
COMMENT ON TABLE public.proposal_views IS 'Block 21320: Tracks proposal views to detect hot leads';
COMMENT ON FUNCTION public.auto_schedule_calendar_event IS 'Block 21320: Auto-schedules calendar event with intelligent timing, conflict detection, and role assignment';
COMMENT ON FUNCTION public.check_proposal_views_and_schedule IS 'Block 21320: Checks for hot proposal views and auto-schedules follow-up events (call via cron)';

