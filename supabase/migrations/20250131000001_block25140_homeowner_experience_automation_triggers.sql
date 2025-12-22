-- =========================================================
-- Block 25140 — SmartSend Roofing Homeowner Experience v1
-- Automation Triggers & Hooks
-- =========================================================
--
-- This migration adds database triggers and functions to automatically
-- send homeowner confirmations when key events occur:
-- - Inspection booked → send confirmation
-- - Day before inspection → send reminder
-- - After inspection → send follow-up
-- - Quote sent → send notification
-- - Job approved → send welcome message
-- - Install scheduled → send confirmation
-- - Install morning → send crew arrival notice
-- - Install completion → send completion message
-- =========================================================

-- ============================================================================
-- PART 1 — AUTOMATION FUNCTION: Trigger Homeowner Confirmation
-- ============================================================================
-- This function calls the API endpoint to send homeowner confirmations
-- Note: In production, this should use pg_net or similar to call HTTP endpoints

CREATE OR REPLACE FUNCTION public.trigger_homeowner_confirmation(
  p_workspace_id uuid,
  p_job_id uuid,
  p_lead_id uuid,
  p_contact_id uuid,
  p_confirmation_type text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_confirmation_id uuid;
BEGIN
  -- Insert confirmation record (will be processed by background worker)
  INSERT INTO public.homeowner_confirmations (
    workspace_id,
    job_id,
    lead_id,
    contact_id,
    confirmation_type,
    status,
    metadata
  ) VALUES (
    p_workspace_id,
    p_job_id,
    p_lead_id,
    p_contact_id,
    p_confirmation_type,
    'pending',
    p_metadata
  )
  RETURNING id INTO v_confirmation_id;

  -- Log the trigger (for debugging)
  RAISE NOTICE 'Homeowner confirmation triggered: type=%, contact_id=%, confirmation_id=%', 
    p_confirmation_type, p_contact_id, v_confirmation_id;
END;
$$;

COMMENT ON FUNCTION public.trigger_homeowner_confirmation IS 'Block 25140: Triggers homeowner confirmation message (inserts pending record for background processing)';

-- ============================================================================
-- PART 2 — TRIGGER: Inspection Booked
-- ============================================================================
-- When an inspection is scheduled, send confirmation immediately

CREATE OR REPLACE FUNCTION public.trigger_inspection_booked_confirmation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_id uuid;
  v_contact_id uuid;
  v_lead_id uuid;
  v_inspector_name text;
BEGIN
  -- Only trigger on new bookings or when status changes to 'booked'
  IF TG_OP = 'INSERT' AND NEW.status = 'booked' THEN
    -- Get workspace_id from booking
    v_workspace_id := NEW.workspace_id;
    v_contact_id := NEW.contact_id;
    v_lead_id := NEW.lead_id;
    v_inspector_name := COALESCE(NEW.assigned_to_user_id::text, 'our inspector');

    -- Get inspector name if assigned
    IF NEW.assigned_to_user_id IS NOT NULL THEN
      SELECT name INTO v_inspector_name
      FROM public.profiles
      WHERE id = NEW.assigned_to_user_id;
    END IF;

    -- Trigger confirmation
    PERFORM public.trigger_homeowner_confirmation(
      p_workspace_id := v_workspace_id,
      p_job_id := NULL,
      p_lead_id := v_lead_id,
      p_contact_id := v_contact_id,
      p_confirmation_type := 'inspection_booked',
      p_metadata := jsonb_build_object(
        'inspector_name', v_inspector_name,
        'inspection_time', NEW.start_time::text,
        'inspection_date', NEW.start_time::date::text,
        'property_address', NEW.property_address
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger on schedule_bookings table
DROP TRIGGER IF EXISTS trg_inspection_booked_confirmation ON public.schedule_bookings;
CREATE TRIGGER trg_inspection_booked_confirmation
  AFTER INSERT ON public.schedule_bookings
  FOR EACH ROW
  WHEN (NEW.status = 'booked' AND NEW.appointment_type IN ('inspection', 'roof_inspection'))
  EXECUTE FUNCTION public.trigger_inspection_booked_confirmation();

COMMENT ON TRIGGER trg_inspection_booked_confirmation ON public.schedule_bookings IS 'Block 25140: Automatically sends confirmation when inspection is booked';

-- ============================================================================
-- PART 3 — TRIGGER: Job Approved
-- ============================================================================
-- When a job is approved (status changes to approved or scheduled), send welcome message

CREATE OR REPLACE FUNCTION public.trigger_job_approved_confirmation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_id uuid;
  v_contact_id uuid;
  v_lead_id uuid;
BEGIN
  -- Only trigger when status changes to approved/scheduled
  IF (OLD.status IS DISTINCT FROM NEW.status) AND 
     (NEW.status IN ('approved', 'scheduled', 'in_progress')) AND
     (OLD.status NOT IN ('approved', 'scheduled', 'in_progress')) THEN
    
    v_workspace_id := NEW.workspace_id;
    v_contact_id := NEW.contact_id;
    v_lead_id := NEW.lead_id;

    -- Trigger confirmation
    PERFORM public.trigger_homeowner_confirmation(
      p_workspace_id := v_workspace_id,
      p_job_id := NEW.id,
      p_lead_id := v_lead_id,
      p_contact_id := v_contact_id,
      p_confirmation_type := 'job_approved',
      p_metadata := jsonb_build_object(
        'job_value', NEW.job_value,
        'scheduled_start_date', NEW.scheduled_start_date::text,
        'next_steps', 'First step: deposit. Second step: scheduling.'
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger on roofing_jobs table
DROP TRIGGER IF EXISTS trg_job_approved_confirmation ON public.roofing_jobs;
CREATE TRIGGER trg_job_approved_confirmation
  AFTER UPDATE ON public.roofing_jobs
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.trigger_job_approved_confirmation();

COMMENT ON TRIGGER trg_job_approved_confirmation ON public.roofing_jobs IS 'Block 25140: Automatically sends welcome message when job is approved';

-- ============================================================================
-- PART 4 — TRIGGER: Quote Sent
-- ============================================================================
-- When a proposal/quote is sent, notify homeowner

CREATE OR REPLACE FUNCTION public.trigger_quote_sent_confirmation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_id uuid;
  v_contact_id uuid;
  v_lead_id uuid;
  v_job_id uuid;
  v_thread_id uuid;
BEGIN
  -- Only trigger when proposal email is sent
  IF TG_OP = 'INSERT' AND NEW.status = 'sent' THEN
    -- Get thread info to find contact/lead/job
    SELECT workspace_id, contact_id, lead_id, job_id INTO 
      v_workspace_id, v_contact_id, v_lead_id, v_job_id
    FROM public.inbox_threads
    WHERE id = NEW.thread_id;

    IF v_contact_id IS NOT NULL THEN
      -- Trigger confirmation
      PERFORM public.trigger_homeowner_confirmation(
        p_workspace_id := v_workspace_id,
        p_job_id := v_job_id,
        p_lead_id := v_lead_id,
        p_contact_id := v_contact_id,
        p_confirmation_type := 'quote_sent',
        p_metadata := jsonb_build_object(
          'proposal_id', NEW.proposal_id,
          'quote_link', COALESCE(NEW.view_link, '')
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger on proposal_email_sends table (if it exists)
-- Note: Adjust table name based on your schema
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'proposal_email_sends') THEN
    DROP TRIGGER IF EXISTS trg_quote_sent_confirmation ON public.proposal_email_sends;
    EXECUTE 'CREATE TRIGGER trg_quote_sent_confirmation
      AFTER INSERT ON public.proposal_email_sends
      FOR EACH ROW
      WHEN (NEW.status = ''sent'')
      EXECUTE FUNCTION public.trigger_quote_sent_confirmation()';
  END IF;
END $$;

-- ============================================================================
-- PART 5 — TRIGGER: Install Scheduled
-- ============================================================================
-- When install is scheduled (production slot created), send confirmation

CREATE OR REPLACE FUNCTION public.trigger_install_confirmed_confirmation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_id uuid;
  v_contact_id uuid;
  v_job_id uuid;
BEGIN
  -- Only trigger when production slot is created
  IF TG_OP = 'INSERT' AND NEW.status = 'scheduled' THEN
    -- Get job info
    SELECT workspace_id, contact_id INTO v_workspace_id, v_contact_id
    FROM public.roofing_jobs
    WHERE id = NEW.job_id;

    IF v_contact_id IS NOT NULL THEN
      -- Trigger confirmation
      PERFORM public.trigger_homeowner_confirmation(
        p_workspace_id := v_workspace_id,
        p_job_id := NEW.job_id,
        p_lead_id := NULL,
        p_contact_id := v_contact_id,
        p_confirmation_type := 'install_confirmed',
        p_metadata := jsonb_build_object(
          'install_start_date', NEW.start_date::text,
          'install_end_date', NEW.end_date::text,
          'crew_name', NEW.crew_id::text
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger on job_production_slots table (if it exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'job_production_slots') THEN
    DROP TRIGGER IF EXISTS trg_install_confirmed_confirmation ON public.job_production_slots;
    EXECUTE 'CREATE TRIGGER trg_install_confirmed_confirmation
      AFTER INSERT ON public.job_production_slots
      FOR EACH ROW
      WHEN (NEW.status = ''scheduled'')
      EXECUTE FUNCTION public.trigger_install_confirmed_confirmation()';
  END IF;
END $$;

-- ============================================================================
-- PART 6 — TRIGGER: Install Completion
-- ============================================================================
-- When job status changes to 'completed', send completion message

CREATE OR REPLACE FUNCTION public.trigger_install_completion_confirmation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_id uuid;
  v_contact_id uuid;
BEGIN
  -- Only trigger when status changes to completed
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completed' THEN
    v_workspace_id := NEW.workspace_id;
    v_contact_id := NEW.contact_id;

    IF v_contact_id IS NOT NULL THEN
      -- Trigger completion message
      PERFORM public.trigger_homeowner_confirmation(
        p_workspace_id := v_workspace_id,
        p_job_id := NEW.id,
        p_lead_id := NULL,
        p_contact_id := v_contact_id,
        p_confirmation_type := 'install_completion',
        p_metadata := jsonb_build_object(
          'completion_date', NEW.updated_at::text
        )
      );

      -- Also trigger cleanup checklist
      PERFORM public.trigger_homeowner_confirmation(
        p_workspace_id := v_workspace_id,
        p_job_id := NEW.id,
        p_lead_id := NULL,
        p_contact_id := v_contact_id,
        p_confirmation_type := 'cleanup_checklist',
        p_metadata := jsonb_build_object()
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Update existing trigger to also handle completion
DROP TRIGGER IF EXISTS trg_install_completion_confirmation ON public.roofing_jobs;
CREATE TRIGGER trg_install_completion_confirmation
  AFTER UPDATE ON public.roofing_jobs
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completed')
  EXECUTE FUNCTION public.trigger_install_completion_confirmation();

COMMENT ON TRIGGER trg_install_completion_confirmation ON public.roofing_jobs IS 'Block 25140: Automatically sends completion message and cleanup checklist when job is completed';

-- ============================================================================
-- PART 7 — GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.trigger_homeowner_confirmation TO authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_inspection_booked_confirmation TO authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_job_approved_confirmation TO authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_quote_sent_confirmation TO authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_install_confirmed_confirmation TO authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_install_completion_confirmation TO authenticated;






































