-- =========================================================
-- Block 25700 — SmartSend Roofing Homeowner Experience Engine v1
-- Automation Triggers
-- =========================================================
--
-- Automatically triggers homeowner experience messages at key stages
--

-- ============================================================================
-- PART 1 — TRIGGER: Send Lead Stage Message When Lead Created
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_homeowner_lead_stage_message()
RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger if lead has contact_id
  IF NEW.contact_id IS NOT NULL THEN
    INSERT INTO public.homeowner_confirmations (
      workspace_id,
      lead_id,
      contact_id,
      confirmation_type,
      status,
      metadata
    ) VALUES (
      NEW.workspace_id,
      NEW.id,
      NEW.contact_id,
      'lead_stage',
      'pending',
      '{}'::jsonb
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Only create trigger if leads table exists
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'leads') THEN
    DROP TRIGGER IF EXISTS trg_homeowner_lead_stage ON public.leads;
    CREATE TRIGGER trg_homeowner_lead_stage
      AFTER INSERT ON public.leads
      FOR EACH ROW
      WHEN (NEW.contact_id IS NOT NULL)
      EXECUTE FUNCTION trigger_homeowner_lead_stage_message();
  END IF;
END $$;

-- ============================================================================
-- PART 2 — TRIGGER: Send Pre-Inspection Message When Inspection Scheduled
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_homeowner_pre_inspection_message()
RETURNS TRIGGER AS $$
DECLARE
  v_contact_id uuid;
  v_workspace_id uuid;
BEGIN
  -- Get contact_id and workspace_id from lead or job
  IF NEW.lead_id IS NOT NULL THEN
    SELECT l.contact_id, l.workspace_id INTO v_contact_id, v_workspace_id
    FROM public.leads l
    WHERE l.id = NEW.lead_id;
  ELSIF NEW.job_id IS NOT NULL THEN
    SELECT j.contact_id, j.workspace_id INTO v_contact_id, v_workspace_id
    FROM public.roofing_jobs j
    WHERE j.id = NEW.job_id;
  END IF;

  -- Only trigger if contact_id exists
  IF v_contact_id IS NOT NULL AND v_workspace_id IS NOT NULL THEN
    INSERT INTO public.homeowner_confirmations (
      workspace_id,
      lead_id,
      job_id,
      contact_id,
      confirmation_type,
      status,
      metadata
    ) VALUES (
      v_workspace_id,
      NEW.lead_id,
      NEW.job_id,
      v_contact_id,
      'pre_inspection',
      'pending',
      jsonb_build_object(
        'inspection_date', NEW.scheduled_date,
        'inspection_time', NEW.scheduled_time,
        'inspector_name', NEW.inspector_name
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Only create trigger if schedule_bookings table exists
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'schedule_bookings') THEN
    DROP TRIGGER IF EXISTS trg_homeowner_pre_inspection ON public.schedule_bookings;
    CREATE TRIGGER trg_homeowner_pre_inspection
      AFTER INSERT ON public.schedule_bookings
      FOR EACH ROW
      WHEN (NEW.scheduled_date IS NOT NULL)
      EXECUTE FUNCTION trigger_homeowner_pre_inspection_message();
  END IF;
END $$;

-- ============================================================================
-- PART 3 — TRIGGER: Send Material Delivery Reminder When Materials Scheduled
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_homeowner_material_delivery_reminder()
RETURNS TRIGGER AS $$
DECLARE
  v_contact_id uuid;
  v_workspace_id uuid;
BEGIN
  -- Get contact_id and workspace_id from job
  IF NEW.job_id IS NOT NULL THEN
    SELECT j.contact_id, j.workspace_id INTO v_contact_id, v_workspace_id
    FROM public.roofing_jobs j
    WHERE j.id = NEW.job_id;
  END IF;

  -- Only trigger if contact_id exists and delivery date is tomorrow
  IF v_contact_id IS NOT NULL AND v_workspace_id IS NOT NULL AND NEW.delivery_date IS NOT NULL THEN
    -- Check if delivery is tomorrow
    IF NEW.delivery_date = CURRENT_DATE + INTERVAL '1 day' THEN
      INSERT INTO public.homeowner_confirmations (
        workspace_id,
        job_id,
        contact_id,
        confirmation_type,
        status,
        metadata
      ) VALUES (
        v_workspace_id,
        NEW.job_id,
        v_contact_id,
        'material_delivery_reminder',
        'pending',
        jsonb_build_object(
          'delivery_date', NEW.delivery_date,
          'delivery_window_start', NEW.delivery_window_start,
          'delivery_window_end', NEW.delivery_window_end
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Only create trigger if material_orders table exists
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'material_orders') THEN
    DROP TRIGGER IF EXISTS trg_homeowner_material_delivery ON public.material_orders;
    CREATE TRIGGER trg_homeowner_material_delivery
      AFTER INSERT OR UPDATE ON public.material_orders
      FOR EACH ROW
      WHEN (NEW.delivery_date IS NOT NULL)
      EXECUTE FUNCTION trigger_homeowner_material_delivery_reminder();
  END IF;
END $$;

-- ============================================================================
-- PART 4 — TRIGGER: Send Trust Messages When Job Approved
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_homeowner_trust_messages_on_approval()
RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger when job status changes to approved/scheduled
  IF NEW.status IN ('scheduled', 'approved') AND (OLD.status IS NULL OR OLD.status NOT IN ('scheduled', 'approved')) THEN
    -- Send multiple trust messages
    INSERT INTO public.homeowner_trust_messages (
      workspace_id,
      job_id,
      contact_id,
      trust_message_type,
      send_timing,
      status
    ) VALUES
      (NEW.workspace_id, NEW.id, NEW.contact_id, 'tarp_landscaping', 'on_approval', 'pending'),
      (NEW.workspace_id, NEW.id, NEW.contact_id, 'certified_suppliers', 'on_approval', 'pending'),
      (NEW.workspace_id, NEW.id, NEW.contact_id, 'certified_professionals', 'on_approval', 'pending');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Only create trigger if roofing_jobs table exists
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'roofing_jobs') THEN
    DROP TRIGGER IF EXISTS trg_homeowner_trust_on_approval ON public.roofing_jobs;
    CREATE TRIGGER trg_homeowner_trust_on_approval
      AFTER UPDATE ON public.roofing_jobs
      FOR EACH ROW
      WHEN (NEW.status IN ('scheduled', 'approved'))
      EXECUTE FUNCTION trigger_homeowner_trust_messages_on_approval();
  END IF;
END $$;

-- ============================================================================
-- PART 5 — TRIGGER: Send Trust Messages Before Install
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_homeowner_trust_messages_before_install()
RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger when install is scheduled (day before)
  IF NEW.scheduled_start_date IS NOT NULL AND NEW.scheduled_start_date = CURRENT_DATE + INTERVAL '1 day' THEN
    INSERT INTO public.homeowner_trust_messages (
      workspace_id,
      job_id,
      contact_id,
      trust_message_type,
      send_timing,
      status
    ) VALUES
      (NEW.workspace_id, NEW.id, NEW.contact_id, 'magnet_nail_collection', 'before_install', 'pending'),
      (NEW.workspace_id, NEW.id, NEW.contact_id, 'cleanup_guarantee', 'before_install', 'pending');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Only create trigger if roofing_jobs table exists
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'roofing_jobs') THEN
    DROP TRIGGER IF EXISTS trg_homeowner_trust_before_install ON public.roofing_jobs;
    CREATE TRIGGER trg_homeowner_trust_before_install
      AFTER UPDATE ON public.roofing_jobs
      FOR EACH ROW
      WHEN (NEW.scheduled_start_date IS NOT NULL)
      EXECUTE FUNCTION trigger_homeowner_trust_messages_before_install();
  END IF;
END $$;

-- ============================================================================
-- PART 6 — TRIGGER: Send Expectation Settings Before Install
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_homeowner_expectation_settings()
RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger when install is scheduled (day before)
  IF NEW.scheduled_start_date IS NOT NULL AND NEW.scheduled_start_date = CURRENT_DATE + INTERVAL '1 day' THEN
    INSERT INTO public.homeowner_expectation_settings (
      workspace_id,
      job_id,
      contact_id,
      expectation_type,
      send_timing,
      status,
      metadata
    ) VALUES
      (NEW.workspace_id, NEW.id, NEW.contact_id, 'noise_levels', 'day_before_install', 'pending', '{}'::jsonb),
      (NEW.workspace_id, NEW.id, NEW.contact_id, 'debris_expectations', 'day_before_install', 'pending', '{}'::jsonb),
      (NEW.workspace_id, NEW.id, NEW.contact_id, 'vehicle_access', 'day_before_install', 'pending', '{}'::jsonb),
      (NEW.workspace_id, NEW.id, NEW.contact_id, 'pet_safety', 'day_before_install', 'pending', '{}'::jsonb),
      (NEW.workspace_id, NEW.id, NEW.contact_id, 'crew_arrival_windows', 'day_before_install', 'pending', jsonb_build_object(
        'arrival_window_start', '8:00 AM',
        'arrival_window_end', '9:00 AM'
      ));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Only create trigger if roofing_jobs table exists
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'roofing_jobs') THEN
    DROP TRIGGER IF EXISTS trg_homeowner_expectations ON public.roofing_jobs;
    CREATE TRIGGER trg_homeowner_expectations
      AFTER UPDATE ON public.roofing_jobs
      FOR EACH ROW
      WHEN (NEW.scheduled_start_date IS NOT NULL)
      EXECUTE FUNCTION trigger_homeowner_expectation_settings();
  END IF;
END $$;

-- ============================================================================
-- PART 7 — TRIGGER: Send Education Content When Job Approved
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_homeowner_education_on_approval()
RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger when job status changes to approved/scheduled
  IF NEW.status IN ('scheduled', 'approved') AND (OLD.status IS NULL OR OLD.status NOT IN ('scheduled', 'approved')) THEN
    INSERT INTO public.homeowner_education_content (
      workspace_id,
      job_id,
      contact_id,
      education_topic,
      send_timing,
      status
    ) VALUES
      (NEW.workspace_id, NEW.id, NEW.contact_id, 'roofing_process_overview', 'on_approval', 'pending'),
      (NEW.workspace_id, NEW.id, NEW.contact_id, 'ventilation_importance', 'on_approval', 'pending');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Only create trigger if roofing_jobs table exists
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'roofing_jobs') THEN
    DROP TRIGGER IF EXISTS trg_homeowner_education_on_approval ON public.roofing_jobs;
    CREATE TRIGGER trg_homeowner_education_on_approval
      AFTER UPDATE ON public.roofing_jobs
      FOR EACH ROW
      WHEN (NEW.status IN ('scheduled', 'approved'))
      EXECUTE FUNCTION trigger_homeowner_education_on_approval();
  END IF;
END $$;

-- ============================================================================
-- PART 8 — TRIGGER: Send Playbook When Job Approved
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_homeowner_playbook_on_approval()
RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger when job status changes to approved/scheduled
  IF NEW.status IN ('scheduled', 'approved') AND (OLD.status IS NULL OR OLD.status NOT IN ('scheduled', 'approved')) THEN
    INSERT INTO public.homeowner_playbooks (
      workspace_id,
      job_id,
      contact_id,
      send_timing,
      status
    ) VALUES (
      NEW.workspace_id,
      NEW.id,
      NEW.contact_id,
      'on_approval',
      'pending'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Only create trigger if roofing_jobs table exists
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'roofing_jobs') THEN
    DROP TRIGGER IF EXISTS trg_homeowner_playbook_on_approval ON public.roofing_jobs;
    CREATE TRIGGER trg_homeowner_playbook_on_approval
      AFTER UPDATE ON public.roofing_jobs
      FOR EACH ROW
      WHEN (NEW.status IN ('scheduled', 'approved'))
      EXECUTE FUNCTION trigger_homeowner_playbook_on_approval();
  END IF;
END $$;

-- ============================================================================
-- PART 9 — TRIGGER: Send Final Invoice Message When Invoice Created
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_homeowner_final_invoice()
RETURNS TRIGGER AS $$
DECLARE
  v_contact_id uuid;
  v_workspace_id uuid;
BEGIN
  -- Only trigger for final invoices
  IF NEW.invoice_type = 'final' OR NEW.type = 'final' THEN
    -- Get contact_id and workspace_id from job
    IF NEW.job_id IS NOT NULL THEN
      SELECT j.contact_id, j.workspace_id INTO v_contact_id, v_workspace_id
      FROM public.roofing_jobs j
      WHERE j.id = NEW.job_id;
    END IF;

    IF v_contact_id IS NOT NULL AND v_workspace_id IS NOT NULL THEN
      INSERT INTO public.homeowner_confirmations (
        workspace_id,
        job_id,
        contact_id,
        confirmation_type,
        status,
        metadata
      ) VALUES (
        v_workspace_id,
        NEW.job_id,
        v_contact_id,
        'final_invoice',
        'pending',
        jsonb_build_object(
          'invoice_id', NEW.id,
          'amount', NEW.total_amount,
          'due_date', NEW.due_date
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Only create trigger if invoices table exists
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices') THEN
    DROP TRIGGER IF EXISTS trg_homeowner_final_invoice ON public.invoices;
    CREATE TRIGGER trg_homeowner_final_invoice
      AFTER INSERT ON public.invoices
      FOR EACH ROW
      WHEN (NEW.invoice_type = 'final' OR NEW.type = 'final')
      EXECUTE FUNCTION trigger_homeowner_final_invoice();
  END IF;
END $$;

-- ============================================================================
-- PART 10 — TRIGGER: Request Satisfaction Feedback After Key Stages
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_homeowner_satisfaction_request()
RETURNS TRIGGER AS $$
DECLARE
  v_contact_id uuid;
  v_workspace_id uuid;
  v_checkpoint text;
BEGIN
  -- Determine checkpoint based on what changed
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    v_checkpoint := 'post_install';
  ELSIF NEW.status = 'inspection_completed' OR (OLD.status IS NULL AND NEW.status = 'inspected') THEN
    v_checkpoint := 'post_inspection';
  ELSE
    RETURN NEW; -- No satisfaction request needed
  END IF;

  -- Get contact_id and workspace_id
  v_contact_id := NEW.contact_id;
  v_workspace_id := NEW.workspace_id;

  IF v_contact_id IS NOT NULL AND v_workspace_id IS NOT NULL THEN
    -- Create satisfaction feedback request (status = pending means not yet submitted)
    INSERT INTO public.homeowner_feedback (
      workspace_id,
      job_id,
      contact_id,
      checkpoint,
      status,
      rating
    ) VALUES (
      v_workspace_id,
      NEW.id,
      v_contact_id,
      v_checkpoint,
      'pending', -- This indicates feedback is requested but not yet submitted
      NULL -- Rating will be set when homeowner submits feedback
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Only create trigger if roofing_jobs table exists
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'roofing_jobs') THEN
    DROP TRIGGER IF EXISTS trg_homeowner_satisfaction_request ON public.roofing_jobs;
    CREATE TRIGGER trg_homeowner_satisfaction_request
      AFTER UPDATE ON public.roofing_jobs
      FOR EACH ROW
      WHEN (NEW.status = 'completed' OR NEW.status = 'inspection_completed')
      EXECUTE FUNCTION trigger_homeowner_satisfaction_request();
  END IF;
END $$;




































