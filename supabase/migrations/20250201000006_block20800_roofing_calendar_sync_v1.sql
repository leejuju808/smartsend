-- =========================================================
-- Block 20800 — SmartSend Roofing Calendar Sync v1
-- (Install Scheduling • Adjuster Appointments • Proposal Follow-Ups • Automated Reminders)
-- =========================================================
--
-- This block is CRITICAL.
--
-- Right now, SmartSend knows:
-- - When adjusters are scheduled
-- - When claims are approved
-- - When homeowners reply
-- - When proposals go out
-- - When leads become install-ready
-- - When jobs are scheduled in CRM stages
--
-- But roofers forget to schedule, remind, and follow up.
--
-- Block 20800 turns SmartSend into a scheduling assistant that syncs your job pipeline 
-- with a clean, simple calendar view.
-- =========================================================

-- ============================================================================
-- PART 1 — Create calendar_events Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Links to job/thread/contact
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Event type
  event_type text NOT NULL CHECK (event_type IN (
    'ADJUSTER_APPT',
    'INSTALL_DATE',
    'FOLLOW_UP',
    'INSPECTION',
    'TASK' -- v2
  )),
  
  -- Event details
  title text NOT NULL,
  description text,
  
  -- Event timing
  event_date date NOT NULL,
  event_start_time time,
  event_end_time time,
  
  -- Status
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled', 'rescheduled')),
  completed_at timestamptz,
  
  -- Creator tracking
  created_by text NOT NULL DEFAULT 'AI' CHECK (created_by IN ('AI', 'user')),
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Metadata (stores additional context like claim number, job value, etc.)
  metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Ensure at least one link exists
  CONSTRAINT calendar_event_has_link CHECK (
    job_id IS NOT NULL OR thread_id IS NOT NULL OR lead_id IS NOT NULL OR contact_id IS NOT NULL
  )
);

-- Indexes for calendar queries
CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON public.calendar_events(event_date);
CREATE INDEX IF NOT EXISTS idx_calendar_events_type ON public.calendar_events(event_type);
CREATE INDEX IF NOT EXISTS idx_calendar_events_status ON public.calendar_events(status);
CREATE INDEX IF NOT EXISTS idx_calendar_events_workspace ON public.calendar_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_job ON public.calendar_events(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calendar_events_thread ON public.calendar_events(thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calendar_events_date_range ON public.calendar_events(workspace_id, event_date, status);

-- Composite index for common queries (upcoming events by workspace)
CREATE INDEX IF NOT EXISTS idx_calendar_events_upcoming ON public.calendar_events(workspace_id, event_date, status) 
  WHERE event_date >= CURRENT_DATE AND status = 'scheduled';

COMMENT ON TABLE public.calendar_events IS 'Calendar events for roofing jobs: adjuster appointments, install dates, follow-ups, inspections';
COMMENT ON COLUMN public.calendar_events.event_type IS 'Event type: ADJUSTER_APPT, INSTALL_DATE, FOLLOW_UP, INSPECTION, TASK';
COMMENT ON COLUMN public.calendar_events.status IS 'Event status: scheduled, completed, cancelled, rescheduled';
COMMENT ON COLUMN public.calendar_events.created_by IS 'Who created this event: AI (auto-generated) or user (manually created)';
COMMENT ON COLUMN public.calendar_events.metadata IS 'JSONB metadata: claim_number, job_value, adjuster_name, homeowner_name, etc.';

-- ============================================================================
-- PART 2 — Function to Create Calendar Event
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_calendar_event(
  p_workspace_id uuid,
  p_event_type text,
  p_title text,
  p_description text DEFAULT NULL,
  p_event_date date,
  p_event_start_time time DEFAULT NULL,
  p_event_end_time time DEFAULT NULL,
  p_job_id uuid DEFAULT NULL,
  p_thread_id uuid DEFAULT NULL,
  p_lead_id uuid DEFAULT NULL,
  p_contact_id uuid DEFAULT NULL,
  p_created_by text DEFAULT 'AI',
  p_created_by_user_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_id uuid;
  v_workspace_id uuid;
BEGIN
  -- Determine workspace_id if not provided
  IF p_workspace_id IS NULL THEN
    -- Try to get from thread
    IF p_thread_id IS NOT NULL THEN
      SELECT workspace_id INTO v_workspace_id
      FROM public.inbox_threads
      WHERE id = p_thread_id;
    -- Try to get from job
    ELSIF p_job_id IS NOT NULL THEN
      SELECT workspace_id INTO v_workspace_id
      FROM public.roofing_jobs rj
      JOIN public.inbox_threads it ON rj.thread_id = it.id
      WHERE rj.id = p_job_id;
    -- Try to get from lead
    ELSIF p_lead_id IS NOT NULL THEN
      SELECT workspace_id INTO v_workspace_id
      FROM public.leads
      WHERE id = p_lead_id;
    -- Try to get from contact
    ELSIF p_contact_id IS NOT NULL THEN
      SELECT workspace_id INTO v_workspace_id
      FROM public.contacts
      WHERE id = p_contact_id;
    END IF;
  ELSE
    v_workspace_id := p_workspace_id;
  END IF;
  
  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'workspace_id is required';
  END IF;
  
  -- Insert calendar event
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
    created_by_user_id,
    metadata
  )
  VALUES (
    v_workspace_id,
    p_job_id,
    p_thread_id,
    p_lead_id,
    p_contact_id,
    p_event_type,
    p_title,
    p_description,
    p_event_date,
    p_event_start_time,
    p_event_end_time,
    p_created_by,
    p_created_by_user_id,
    p_metadata
  )
  RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$$;

COMMENT ON FUNCTION public.create_calendar_event IS 'Creates a calendar event. Auto-determines workspace_id from linked entities if not provided.';

-- ============================================================================
-- PART 3 — Trigger A: Adjuster Visits (from Block 20360 Insurance Brain)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_create_adjuster_appointment_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_id uuid;
  v_job_id uuid;
  v_claim_number text;
  v_carrier text;
  v_homeowner_name text;
  v_job_value numeric;
  v_event_date date;
  v_event_time time;
  v_email_text text;
BEGIN
  -- Only process if adjuster visit is scheduled
  IF NEW.insurance_claim_status = 'adjuster_visit_scheduled' AND
     (OLD.insurance_claim_status IS NULL OR OLD.insurance_claim_status != 'adjuster_visit_scheduled') THEN
    
    -- Get job_id
    SELECT id INTO v_job_id
    FROM public.roofing_jobs
    WHERE thread_id = NEW.id
    LIMIT 1;
    
    -- If no job exists, create one
    IF v_job_id IS NULL THEN
      v_job_id := public.get_or_create_roofing_job(p_thread_id := NEW.id);
    END IF;
    
    -- Extract claim number and carrier
    v_claim_number := COALESCE(NEW.insurance_claim_number, 'Unknown');
    v_carrier := COALESCE(NEW.insurance_carrier, 'Unknown Carrier');
    
    -- Get homeowner name from contact
    SELECT c.name INTO v_homeowner_name
    FROM public.contacts c
    JOIN public.inbox_threads it ON it.contact_id = c.id
    WHERE it.id = NEW.id
    LIMIT 1;
    
    -- Get job value
    SELECT projected_job_value INTO v_job_value
    FROM public.roofing_jobs
    WHERE id = v_job_id;
    
    -- Try to extract date from email text (get latest message)
    SELECT 
      CASE 
        WHEN body_text ~* '(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})' THEN
          -- Try to parse date from email body
          (regexp_match(body_text, '(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})'))[1]::date
        ELSE
          CURRENT_DATE + INTERVAL '7 days' -- Default to 7 days from now
      END,
      CASE 
        WHEN body_text ~* '(\d{1,2}):(\d{2})\s*(AM|PM)' THEN
          -- Try to parse time
          (regexp_match(body_text, '(\d{1,2}):(\d{2})\s*(AM|PM)'))[1]::time
        ELSE
          NULL
      END
    INTO v_event_date, v_event_time
    FROM public.inbox_messages
    WHERE thread_id = NEW.id
    ORDER BY sent_at DESC
    LIMIT 1;
    
    -- If no date found, default to tomorrow
    IF v_event_date IS NULL THEN
      v_event_date := CURRENT_DATE + INTERVAL '1 day';
    END IF;
    
    -- Create calendar event
    PERFORM public.create_calendar_event(
      p_workspace_id := NEW.workspace_id,
      p_event_type := 'ADJUSTER_APPT',
      p_title := 'Adjuster Visit — Claim #' || v_claim_number,
      p_description := 'Adjuster appointment scheduled for ' || v_carrier || ' claim #' || v_claim_number,
      p_event_date := v_event_date,
      p_event_start_time := v_event_time,
      p_job_id := v_job_id,
      p_thread_id := NEW.id,
      p_created_by := 'AI',
      p_metadata := jsonb_build_object(
        'claim_number', v_claim_number,
        'carrier', v_carrier,
        'homeowner_name', v_homeowner_name,
        'job_value', v_job_value,
        'stage', 'ADJUSTER_SCHEDULED'
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_adjuster_appointment_event ON public.inbox_threads;
CREATE TRIGGER trg_create_adjuster_appointment_event
  AFTER UPDATE ON public.inbox_threads
  FOR EACH ROW
  WHEN (
    NEW.insurance_claim_status = 'adjuster_visit_scheduled' AND
    (OLD.insurance_claim_status IS NULL OR OLD.insurance_claim_status != 'adjuster_visit_scheduled')
  )
  EXECUTE FUNCTION public.trigger_create_adjuster_appointment_event();

COMMENT ON FUNCTION public.trigger_create_adjuster_appointment_event IS 'Auto-creates calendar event when adjuster visit is scheduled (from Insurance Brain block 20360)';

-- ============================================================================
-- PART 4 — Trigger B: Install-Ready Follow-Up (from Block 20400)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_create_install_ready_followup_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_id uuid;
  v_job_id uuid;
  v_homeowner_name text;
  v_job_value numeric;
BEGIN
  -- Only process if install-ready just became true
  IF NEW.insurance_install_ready = true AND 
     (OLD.insurance_install_ready IS NULL OR OLD.insurance_install_ready = false) THEN
    
    -- Get job_id
    SELECT id INTO v_job_id
    FROM public.roofing_jobs
    WHERE thread_id = NEW.id
    LIMIT 1;
    
    -- If no job exists, create one
    IF v_job_id IS NULL THEN
      v_job_id := public.get_or_create_roofing_job(p_thread_id := NEW.id);
    END IF;
    
    -- Get homeowner name
    SELECT c.name INTO v_homeowner_name
    FROM public.contacts c
    JOIN public.inbox_threads it ON it.contact_id = c.id
    WHERE it.id = NEW.id
    LIMIT 1;
    
    -- Get job value
    SELECT COALESCE(projected_job_value, 0) INTO v_job_value
    FROM public.roofing_jobs
    WHERE id = v_job_id;
    
    -- Create follow-up event (roofer needs to call homeowner to schedule install)
    PERFORM public.create_calendar_event(
      p_workspace_id := NEW.workspace_id,
      p_event_type := 'FOLLOW_UP',
      p_title := 'Call Homeowner to Schedule Install — $' || to_char(v_job_value, 'FM999,999,999.00') || ' Job',
      p_description := 'Homeowner is install-ready. Call to schedule installation date.',
      p_event_date := CURRENT_DATE,
      p_job_id := v_job_id,
      p_thread_id := NEW.id,
      p_created_by := 'AI',
      p_metadata := jsonb_build_object(
        'homeowner_name', v_homeowner_name,
        'job_value', v_job_value,
        'stage', 'INSTALL_READY',
        'action', 'call_to_schedule'
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_install_ready_followup_event ON public.inbox_threads;
CREATE TRIGGER trg_create_install_ready_followup_event
  AFTER UPDATE ON public.inbox_threads
  FOR EACH ROW
  WHEN (
    NEW.insurance_install_ready = true AND 
    (OLD.insurance_install_ready IS NULL OR OLD.insurance_install_ready = false)
  )
  EXECUTE FUNCTION public.trigger_create_install_ready_followup_event();

COMMENT ON FUNCTION public.trigger_create_install_ready_followup_event IS 'Auto-creates follow-up event when install-ready is triggered (from block 20400)';

-- ============================================================================
-- PART 5 — Trigger C: Proposal Follow-Up Events (from Block 20560)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_create_proposal_followup_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_id uuid;
  v_thread_id uuid;
  v_job_id uuid;
  v_homeowner_name text;
  v_proposal_amount numeric;
  v_workspace_id uuid;
BEGIN
  -- Only process when proposal is sent (status changes to 'sent')
  IF NEW.status = 'sent' AND (OLD.status IS NULL OR OLD.status != 'sent') THEN
    
    v_thread_id := NEW.thread_id;
    
    -- Get workspace_id from thread
    SELECT workspace_id INTO v_workspace_id
    FROM public.inbox_threads
    WHERE id = v_thread_id;
    
    -- Get job_id
    SELECT id INTO v_job_id
    FROM public.roofing_jobs
    WHERE thread_id = v_thread_id
    LIMIT 1;
    
    -- Get homeowner name
    SELECT c.name INTO v_homeowner_name
    FROM public.contacts c
    JOIN public.inbox_threads it ON it.contact_id = c.id
    WHERE it.id = v_thread_id
    LIMIT 1;
    
    -- Get proposal amount
    v_proposal_amount := COALESCE(NEW.total_amount, 0);
    
    -- Create follow-up event for tomorrow
    PERFORM public.create_calendar_event(
      p_workspace_id := v_workspace_id,
      p_event_type := 'FOLLOW_UP',
      p_title := 'Follow Up on Proposal — ' || COALESCE(v_homeowner_name, 'Homeowner'),
      p_description := 'Follow up on proposal sent. Check for homeowner response.',
      p_event_date := CURRENT_DATE + INTERVAL '1 day',
      p_job_id := v_job_id,
      p_thread_id := v_thread_id,
      p_created_by := 'AI',
      p_metadata := jsonb_build_object(
        'homeowner_name', v_homeowner_name,
        'proposal_amount', v_proposal_amount,
        'proposal_id', NEW.id,
        'action', 'follow_up_proposal'
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_proposal_followup_event ON public.proposals;
CREATE TRIGGER trg_create_proposal_followup_event
  AFTER UPDATE ON public.proposals
  FOR EACH ROW
  WHEN (NEW.status = 'sent' AND (OLD.status IS NULL OR OLD.status != 'sent'))
  EXECUTE FUNCTION public.trigger_create_proposal_followup_event();

COMMENT ON FUNCTION public.trigger_create_proposal_followup_event IS 'Auto-creates follow-up event when proposal is sent (from block 20560)';

-- ============================================================================
-- PART 6 — Trigger D: Adjuster Follow-Ups (Unresponsive) (from Block 20590)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_and_create_adjuster_followup_events()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_thread record;
  v_event_id uuid;
  v_job_id uuid;
  v_claim_number text;
BEGIN
  -- Find threads where adjuster hasn't replied in 48+ hours
  FOR v_thread IN
    SELECT 
      it.id as thread_id,
      it.workspace_id,
      it.insurance_adjuster_email,
      it.insurance_adjuster_name,
      it.insurance_claim_number,
      MAX(ite.created_at) as last_adjuster_activity
    FROM public.inbox_threads it
    LEFT JOIN public.insurance_timeline_events ite ON ite.thread_id = it.id
      AND ite.event_type IN ('ADJUSTER_VISIT', 'ADJUSTER_CONTACTED', 'CLAIM_APPROVED', 'SCOPE_PARSED')
    WHERE it.insurance_adjuster_email IS NOT NULL
      AND it.insurance_claim_status NOT IN ('approved', 'denied')
      AND (ite.created_at IS NULL OR ite.created_at < NOW() - INTERVAL '48 hours')
    GROUP BY it.id, it.workspace_id, it.insurance_adjuster_email, it.insurance_adjuster_name, it.insurance_claim_number
    HAVING MAX(ite.created_at) IS NULL OR MAX(ite.created_at) < NOW() - INTERVAL '48 hours'
  LOOP
    -- Check if follow-up event already exists for today
    IF NOT EXISTS (
      SELECT 1 FROM public.calendar_events
      WHERE thread_id = v_thread.thread_id
        AND event_type = 'FOLLOW_UP'
        AND event_date = CURRENT_DATE
        AND status = 'scheduled'
        AND metadata->>'action' = 'follow_up_adjuster'
    ) THEN
      -- Get job_id
      SELECT id INTO v_job_id
      FROM public.roofing_jobs
      WHERE thread_id = v_thread.thread_id
      LIMIT 1;
      
      v_claim_number := COALESCE(v_thread.insurance_claim_number, 'Unknown');
      
      -- Create follow-up event
      PERFORM public.create_calendar_event(
        p_workspace_id := v_thread.workspace_id,
        p_event_type := 'FOLLOW_UP',
        p_title := 'Follow Up with Adjuster — Claim #' || v_claim_number,
        p_description := 'Adjuster has not replied in 48+ hours. Follow up needed.',
        p_event_date := CURRENT_DATE,
        p_thread_id := v_thread.thread_id,
        p_job_id := v_job_id,
        p_created_by := 'AI',
        p_metadata := jsonb_build_object(
          'claim_number', v_claim_number,
          'adjuster_email', v_thread.insurance_adjuster_email,
          'adjuster_name', v_thread.insurance_adjuster_name,
          'action', 'follow_up_adjuster',
          'reason', 'unresponsive_48h'
        )
      );
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.check_and_create_adjuster_followup_events IS 'Checks for unresponsive adjusters and creates follow-up events (from block 20590). Should be called by cron job.';

-- ============================================================================
-- PART 7 — Trigger E: Missed Homeowner Follow-Up (from Block 20770)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_and_create_homeowner_followup_events()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_thread record;
  v_event_id uuid;
  v_job_id uuid;
  v_homeowner_name text;
BEGIN
  -- Find threads where homeowner replied but hasn't been addressed in >12 hours
  FOR v_thread IN
    SELECT 
      it.id as thread_id,
      it.workspace_id,
      it.last_message_at,
      it.last_direction,
      c.name as homeowner_name
    FROM public.inbox_threads it
    JOIN public.contacts c ON c.id = it.contact_id
    WHERE it.last_direction = 'in'
      AND it.last_message_at < NOW() - INTERVAL '12 hours'
      AND it.last_message_at IS NOT NULL
      -- Check if there's no outbound message after the last inbound
      AND NOT EXISTS (
        SELECT 1 FROM public.inbox_messages im
        WHERE im.thread_id = it.id
          AND im.direction = 'out'
          AND im.sent_at > it.last_message_at
      )
  LOOP
    -- Check if follow-up event already exists for today
    IF NOT EXISTS (
      SELECT 1 FROM public.calendar_events
      WHERE thread_id = v_thread.thread_id
        AND event_type = 'FOLLOW_UP'
        AND event_date = CURRENT_DATE
        AND status = 'scheduled'
        AND metadata->>'action' = 'reply_to_homeowner'
    ) THEN
      -- Get job_id
      SELECT id INTO v_job_id
      FROM public.roofing_jobs
      WHERE thread_id = v_thread.thread_id
      LIMIT 1;
      
      v_homeowner_name := v_thread.homeowner_name;
      
      -- Create follow-up event
      PERFORM public.create_calendar_event(
        p_workspace_id := v_thread.workspace_id,
        p_event_type := 'FOLLOW_UP',
        p_title := 'Reply to Homeowner — High Priority',
        p_description := 'Homeowner replied ' || EXTRACT(HOUR FROM (NOW() - v_thread.last_message_at)) || ' hours ago. Response needed.',
        p_event_date := CURRENT_DATE,
        p_thread_id := v_thread.thread_id,
        p_job_id := v_job_id,
        p_created_by := 'AI',
        p_metadata := jsonb_build_object(
          'homeowner_name', v_homeowner_name,
          'action', 'reply_to_homeowner',
          'reason', 'unanswered_12h',
          'priority', 'high'
        )
      );
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.check_and_create_homeowner_followup_events IS 'Checks for unanswered homeowner replies and creates follow-up events (from block 20770). Should be called by cron job.';

-- ============================================================================
-- PART 8 — Function to Mark Event as Completed When Homeowner Replies
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_complete_proposal_followup_on_reply()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- When homeowner replies, mark proposal follow-up events as completed
  IF NEW.direction = 'in' THEN
    UPDATE public.calendar_events
    SET 
      status = 'completed',
      completed_at = NOW(),
      updated_at = NOW()
    WHERE thread_id = NEW.thread_id
      AND event_type = 'FOLLOW_UP'
      AND metadata->>'action' = 'follow_up_proposal'
      AND status = 'scheduled';
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_complete_proposal_followup ON public.inbox_messages;
CREATE TRIGGER trg_auto_complete_proposal_followup
  AFTER INSERT ON public.inbox_messages
  FOR EACH ROW
  WHEN (NEW.direction = 'in')
  EXECUTE FUNCTION public.auto_complete_proposal_followup_on_reply();

COMMENT ON FUNCTION public.auto_complete_proposal_followup_on_reply IS 'Auto-marks proposal follow-up events as completed when homeowner replies';

-- ============================================================================
-- PART 9 — Integration with CRM Stages (Block 20620)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_job_stage_on_install_date()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job_id uuid;
BEGIN
  -- When install date is set, update job stage to SCHEDULED_INSTALL
  IF NEW.event_type = 'INSTALL_DATE' AND NEW.status = 'scheduled' AND
     (OLD.event_type IS NULL OR OLD.event_type != 'INSTALL_DATE' OR OLD.status != 'scheduled') THEN
    
    -- Get job_id
    v_job_id := COALESCE(NEW.job_id, NULL);
    
    IF v_job_id IS NULL AND NEW.thread_id IS NOT NULL THEN
      SELECT id INTO v_job_id
      FROM public.roofing_jobs
      WHERE thread_id = NEW.thread_id
      LIMIT 1;
    END IF;
    
    -- Update job stage
    IF v_job_id IS NOT NULL THEN
      PERFORM public.update_roofing_job_stage(
        p_job_id := v_job_id,
        p_new_stage := 'SCHEDULED_INSTALL',
        p_status_reason := 'Install date scheduled: ' || NEW.event_date::text,
        p_create_timeline_event := true
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_job_stage_on_install_date ON public.calendar_events;
CREATE TRIGGER trg_update_job_stage_on_install_date
  AFTER INSERT OR UPDATE ON public.calendar_events
  FOR EACH ROW
  WHEN (
    NEW.event_type = 'INSTALL_DATE' AND NEW.status = 'scheduled' AND
    (OLD.event_type IS NULL OR OLD.event_type != 'INSTALL_DATE' OR OLD.status IS DISTINCT FROM NEW.status)
  )
  EXECUTE FUNCTION public.update_job_stage_on_install_date();

COMMENT ON FUNCTION public.update_job_stage_on_install_date IS 'Auto-updates job stage to SCHEDULED_INSTALL when install date is set (integration with block 20620)';

-- ============================================================================
-- PART 10 — Function to Auto-Move Stage When Event Date Passes
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_and_update_stages_for_past_events()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event record;
BEGIN
  -- Find install date events that have passed
  FOR v_event IN
    SELECT 
      ce.id as event_id,
      ce.job_id,
      ce.thread_id,
      ce.event_date
    FROM public.calendar_events ce
    JOIN public.roofing_jobs rj ON rj.id = ce.job_id
    WHERE ce.event_type = 'INSTALL_DATE'
      AND ce.status = 'scheduled'
      AND ce.event_date < CURRENT_DATE
      AND rj.current_stage = 'SCHEDULED_INSTALL'
  LOOP
    -- Move to IN_PROGRESS
    PERFORM public.update_roofing_job_stage(
      p_job_id := v_event.job_id,
      p_new_stage := 'IN_PROGRESS',
      p_status_reason := 'Install date passed: ' || v_event.event_date::text,
      p_create_timeline_event := true
    );
    
    -- Mark event as completed
    UPDATE public.calendar_events
    SET 
      status = 'completed',
      completed_at = NOW(),
      updated_at = NOW()
    WHERE id = v_event.event_id;
  END LOOP;
  
  -- After 1 day in IN_PROGRESS, optionally move to COMPLETED (manual override available)
  -- This is handled by a separate cron job or manual action
END;
$$;

COMMENT ON FUNCTION public.check_and_update_stages_for_past_events IS 'Checks for past install dates and updates job stages. Should be called by cron job daily.';

-- ============================================================================
-- PART 11 — Notification Hooks (Block 20770)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_calendar_event_notifications()
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
  -- Only create notifications for scheduled events
  IF NEW.status != 'scheduled' THEN
    RETURN NEW;
  END IF;
  
  v_workspace_id := NEW.workspace_id;
  
  -- Get workspace owner/admin users to notify
  FOR v_user_id IN
    SELECT DISTINCT wm.user_id
    FROM public.workspace_members wm
    WHERE wm.workspace_id = v_workspace_id
      AND wm.role IN ('owner', 'admin')
  LOOP
    -- Create notification based on event type and timing
    CASE NEW.event_type
      WHEN 'ADJUSTER_APPT' THEN
        -- Notify 1 hour before adjuster appointment
        IF NEW.event_date = CURRENT_DATE AND 
           (NEW.event_start_time IS NULL OR NEW.event_start_time <= (CURRENT_TIME + INTERVAL '1 hour')) THEN
          v_notification_title := 'Adjuster Appointment Today';
          v_notification_body := NEW.title;
          
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
            'adjuster_scheduled_inspection',
            v_notification_title,
            v_notification_body,
            jsonb_build_object('event_id', NEW.id, 'event_type', NEW.event_type),
            false,
            NOW()
          );
        END IF;
        
      WHEN 'INSTALL_DATE' THEN
        -- Notify on day of install
        IF NEW.event_date = CURRENT_DATE THEN
          v_notification_title := 'Install Scheduled Today';
          v_notification_body := NEW.title;
          
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
            'install_ready',
            v_notification_title,
            v_notification_body,
            jsonb_build_object('event_id', NEW.id, 'event_type', NEW.event_type),
            false,
            NOW()
          );
        END IF;
        
      WHEN 'FOLLOW_UP' THEN
        -- Notify for missed follow-ups
        IF NEW.event_date < CURRENT_DATE THEN
          v_notification_title := 'Missed Follow-Up';
          v_notification_body := NEW.title;
          
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
            CASE 
              WHEN NEW.metadata->>'action' = 'follow_up_proposal' THEN 'missed_follow_up_proposal'
              WHEN NEW.metadata->>'action' = 'follow_up_adjuster' THEN 'missed_follow_up_adjuster'
              WHEN NEW.metadata->>'action' = 'reply_to_homeowner' THEN 'missed_follow_up_homeowner'
              ELSE 'missed_follow_up_hot_lead'
            END,
            v_notification_title,
            v_notification_body,
            jsonb_build_object('event_id', NEW.id, 'event_type', NEW.event_type),
            false,
            NOW()
          );
        END IF;
    END CASE;
  END LOOP;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_calendar_event_notifications ON public.calendar_events;
CREATE TRIGGER trg_create_calendar_event_notifications
  AFTER INSERT OR UPDATE ON public.calendar_events
  FOR EACH ROW
  WHEN (NEW.status = 'scheduled')
  EXECUTE FUNCTION public.create_calendar_event_notifications();

COMMENT ON FUNCTION public.create_calendar_event_notifications IS 'Creates notifications for calendar events (1 hour before adjuster appt, day of install, missed follow-ups)';

-- ============================================================================
-- PART 12 — Helper Function to Get Calendar Events for Date Range
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_calendar_events(
  p_workspace_id uuid,
  p_start_date date,
  p_end_date date,
  p_event_types text[] DEFAULT NULL,
  p_status text DEFAULT 'scheduled'
)
RETURNS TABLE (
  id uuid,
  job_id uuid,
  thread_id uuid,
  lead_id uuid,
  contact_id uuid,
  event_type text,
  title text,
  description text,
  event_date date,
  event_start_time time,
  event_end_time time,
  status text,
  created_by text,
  metadata jsonb,
  homeowner_name text,
  claim_number text,
  job_value numeric,
  carrier text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ce.id,
    ce.job_id,
    ce.thread_id,
    ce.lead_id,
    ce.contact_id,
    ce.event_type,
    ce.title,
    ce.description,
    ce.event_date,
    ce.event_start_time,
    ce.event_end_time,
    ce.status,
    ce.created_by,
    ce.metadata,
    COALESCE(
      ce.metadata->>'homeowner_name',
      c.name,
      ''
    ) as homeowner_name,
    COALESCE(
      ce.metadata->>'claim_number',
      it.insurance_claim_number,
      ''
    ) as claim_number,
    COALESCE(
      (ce.metadata->>'job_value')::numeric,
      rj.projected_job_value,
      0
    ) as job_value,
    COALESCE(
      ce.metadata->>'carrier',
      it.insurance_carrier,
      ''
    ) as carrier
  FROM public.calendar_events ce
  LEFT JOIN public.inbox_threads it ON it.id = ce.thread_id
  LEFT JOIN public.contacts c ON c.id = ce.contact_id OR c.id = it.contact_id
  LEFT JOIN public.roofing_jobs rj ON rj.id = ce.job_id
  WHERE ce.workspace_id = p_workspace_id
    AND ce.event_date BETWEEN p_start_date AND p_end_date
    AND ce.status = COALESCE(p_status, ce.status)
    AND (p_event_types IS NULL OR ce.event_type = ANY(p_event_types))
  ORDER BY ce.event_date, ce.event_start_time NULLS LAST;
END;
$$;

COMMENT ON FUNCTION public.get_calendar_events IS 'Gets calendar events for a date range with enriched data (homeowner name, claim number, job value, carrier)';

-- ============================================================================
-- PART 13 — RLS Policies
-- ============================================================================

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view calendar events for their workspace
DROP POLICY IF EXISTS "Users can view calendar events for their workspace" ON public.calendar_events;
CREATE POLICY "Users can view calendar events for their workspace" ON public.calendar_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = calendar_events.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Policy: Users can create calendar events for their workspace
DROP POLICY IF EXISTS "Users can create calendar events for their workspace" ON public.calendar_events;
CREATE POLICY "Users can create calendar events for their workspace" ON public.calendar_events
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = calendar_events.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Policy: Users can update calendar events for their workspace
DROP POLICY IF EXISTS "Users can update calendar events for their workspace" ON public.calendar_events;
CREATE POLICY "Users can update calendar events for their workspace" ON public.calendar_events
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = calendar_events.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Policy: Users can delete calendar events for their workspace
DROP POLICY IF EXISTS "Users can delete calendar events for their workspace" ON public.calendar_events;
CREATE POLICY "Users can delete calendar events for their workspace" ON public.calendar_events
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = calendar_events.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 14 — Comments
-- ============================================================================

COMMENT ON TABLE public.calendar_events IS 'Block 20800: Calendar events for roofing jobs - automatically created from adjuster visits, install-ready triggers, proposals, and follow-ups';
COMMENT ON FUNCTION public.create_calendar_event IS 'Creates a calendar event with automatic workspace detection';
COMMENT ON FUNCTION public.trigger_create_adjuster_appointment_event IS 'Auto-creates calendar event when adjuster visit is scheduled (from Insurance Brain)';
COMMENT ON FUNCTION public.trigger_create_install_ready_followup_event IS 'Auto-creates follow-up event when install-ready is triggered';
COMMENT ON FUNCTION public.trigger_create_proposal_followup_event IS 'Auto-creates follow-up event when proposal is sent';
COMMENT ON FUNCTION public.check_and_create_adjuster_followup_events IS 'Checks for unresponsive adjusters and creates follow-up events (call via cron)';
COMMENT ON FUNCTION public.check_and_create_homeowner_followup_events IS 'Checks for unanswered homeowner replies and creates follow-up events (call via cron)';
COMMENT ON FUNCTION public.update_job_stage_on_install_date IS 'Auto-updates job stage to SCHEDULED_INSTALL when install date is set';
COMMENT ON FUNCTION public.check_and_update_stages_for_past_events IS 'Checks for past install dates and updates job stages (call via cron)';
















































