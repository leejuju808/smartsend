-- ============================================================================
-- Block 24620 — SmartSend Roofing Job Timeline v2 (Complete Chronological Record)
-- ============================================================================
-- THE COMPLETE JOB TIMELINE ENGINE — ZERO FLUFF.
--
-- This block upgrades the Job Timeline into a perfect, chronological record
-- of everything that happens on a roofing job — communications, delays,
-- crew activity, material tracking, insurance events, payments, inspections,
-- photos, all in one clean timeline.
--
-- This becomes the truth system that eliminates disputes, protects roofers,
-- impresses homeowners, and gives total clarity.
-- ============================================================================

-- ============================================================================
-- PART 1 — ENHANCE job_timelines TABLE FOR JOB LINKAGE
-- ============================================================================
-- Add job_id column to link timeline events directly to roofing_jobs
-- This allows timeline to work for both leads (pre-job) and jobs (post-approval)

ALTER TABLE public.job_timelines
  ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;

-- Add workspace_id for faster filtering
ALTER TABLE public.job_timelines
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- Add user_id to track who created the event
ALTER TABLE public.job_timelines
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add event_subtype for more granular event classification
ALTER TABLE public.job_timelines
  ADD COLUMN IF NOT EXISTS event_subtype TEXT;

-- Ensure at least one link exists (lead_id OR job_id)
ALTER TABLE public.job_timelines
  ADD CONSTRAINT job_timelines_has_link CHECK (
    lead_id IS NOT NULL OR job_id IS NOT NULL
  );

-- Create indexes for job-based queries
CREATE INDEX IF NOT EXISTS idx_job_timelines_job_id_created_at
  ON public.job_timelines (job_id, created_at DESC)
  WHERE job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_job_timelines_workspace_id
  ON public.job_timelines(workspace_id)
  WHERE workspace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_job_timelines_event_subtype
  ON public.job_timelines(event_subtype)
  WHERE event_subtype IS NOT NULL;

-- ============================================================================
-- PART 2 — DEFINE THE 10 EVENT TYPES
-- ============================================================================
-- Event Type 1 — Homeowner Communication
--   - homeowner_message_inbound
--   - homeowner_message_outbound
--   - homeowner_confirmation
--   - homeowner_question
--   - homeowner_objection
--   - followup_sequence_sent
--
-- Event Type 2 — Crew Actions
--   - crew_assigned
--   - crew_on_way
--   - crew_arrived
--   - crew_note
--   - crew_issue_reported
--   - crew_photo_uploaded
--   - crew_job_completed
--
-- Event Type 3 — Supplier Actions
--   - supplier_po_sent
--   - supplier_confirmed
--   - supplier_delivery_scheduled
--   - supplier_delivery_failed
--   - supplier_supplemental_order
--   - supplier_correction_delivered
--
-- Event Type 4 — Material Events
--   - material_takeoff_created
--   - material_po_created
--   - material_confirmation
--   - material_issue_logged
--   - material_shortage_alert
--
-- Event Type 5 — Insurance Events
--   - insurance_claim_filed
--   - insurance_adjuster_assigned
--   - insurance_adjuster_inspection
--   - insurance_acv_received
--   - insurance_supplement_submitted
--   - insurance_supplement_approved
--   - insurance_depreciation_received
--
-- Event Type 6 — Payment Events
--   - payment_deposit_invoice_sent
--   - payment_deposit_collected
--   - payment_final_invoice_sent
--   - payment_final_collected
--   - payment_insurance_recorded
--   - payment_overdue_alert
--
-- Event Type 7 — Scheduling Events
--   - scheduling_inspection_scheduled
--   - scheduling_installation_scheduled
--   - scheduling_rescheduled
--   - scheduling_weather_delay
--   - scheduling_homeowner_request
--
-- Event Type 8 — Weather Events (Auto-added)
--   - weather_alert
--   - weather_hail_impact
--   - weather_wind_risk
--   - weather_job_day_change
--
-- Event Type 9 — Internal Notes
--   - internal_note
--   - internal_crew_note
--   - internal_homeowner_behavior
--   - internal_material_reminder
--   - internal_quality_control
--
-- Event Type 10 — Status Changes
--   - status_lead_in
--   - status_inspection
--   - status_quote_sent
--   - status_approved
--   - status_scheduled
--   - status_installed
--   - status_completed
--   - status_cancelled
-- ============================================================================

-- ============================================================================
-- PART 3 — CREATE HELPER FUNCTION TO LOG TIMELINE EVENTS
-- ============================================================================
-- This function makes it easy to log any timeline event with proper categorization

CREATE OR REPLACE FUNCTION public.log_job_timeline_event(
  p_job_id UUID DEFAULT NULL,
  p_lead_id UUID DEFAULT NULL,
  p_event_type TEXT,
  p_event_subtype TEXT DEFAULT NULL,
  p_message TEXT DEFAULT NULL,
  p_event_data JSONB DEFAULT '{}'::jsonb,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_workspace_id UUID;
  v_event_category TEXT;
BEGIN
  -- Validate that at least one ID is provided
  IF p_job_id IS NULL AND p_lead_id IS NULL THEN
    RAISE EXCEPTION 'Either job_id or lead_id must be provided';
  END IF;

  -- Get workspace_id from job or lead
  IF p_job_id IS NOT NULL THEN
    SELECT workspace_id INTO v_workspace_id
    FROM public.roofing_jobs
    WHERE id = p_job_id;
    
    -- If not found, try to get from lead_id
    IF v_workspace_id IS NULL AND p_lead_id IS NOT NULL THEN
      SELECT workspace_id INTO v_workspace_id
      FROM public.leads
      WHERE id = p_lead_id;
    END IF;
  ELSIF p_lead_id IS NOT NULL THEN
    SELECT workspace_id INTO v_workspace_id
    FROM public.leads
    WHERE id = p_lead_id;
  END IF;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Could not determine workspace_id';
  END IF;

  -- Determine event category based on event_type
  v_event_category := CASE
    WHEN p_event_type LIKE 'homeowner_%' OR p_event_type LIKE 'followup_%' THEN 'communication'
    WHEN p_event_type LIKE 'crew_%' THEN 'crew'
    WHEN p_event_type LIKE 'supplier_%' THEN 'supplier'
    WHEN p_event_type LIKE 'material_%' THEN 'materials'
    WHEN p_event_type LIKE 'insurance_%' THEN 'insurance'
    WHEN p_event_type LIKE 'payment_%' THEN 'payments'
    WHEN p_event_type LIKE 'scheduling_%' THEN 'scheduling'
    WHEN p_event_type LIKE 'weather_%' THEN 'weather'
    WHEN p_event_type LIKE 'internal_%' THEN 'internal'
    WHEN p_event_type LIKE 'status_%' THEN 'status'
    ELSE 'other'
  END;

  -- Insert timeline event
  INSERT INTO public.job_timelines (
    job_id,
    lead_id,
    workspace_id,
    user_id,
    event_type,
    event_subtype,
    message,
    event_category,
    event_data
  ) VALUES (
    p_job_id,
    p_lead_id,
    v_workspace_id,
    p_user_id,
    p_event_type,
    p_event_subtype,
    p_message,
    v_event_category,
    p_event_data
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.log_job_timeline_event IS 'Block 24620: Helper function to log timeline events for roofing jobs with automatic categorization';

GRANT EXECUTE ON FUNCTION public.log_job_timeline_event(UUID, UUID, TEXT, TEXT, TEXT, JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_job_timeline_event(UUID, UUID, TEXT, TEXT, TEXT, JSONB, UUID) TO service_role;

-- ============================================================================
-- PART 4 — CREATE FUNCTION TO UPDATE JOB HEALTH SCORE FROM TIMELINE EVENTS
-- ============================================================================
-- This function updates the job health score based on timeline events
-- Positive events add points, negative events subtract points

CREATE OR REPLACE FUNCTION public.update_job_health_from_timeline_event(
  p_event_type TEXT,
  p_job_id UUID DEFAULT NULL,
  p_lead_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_score_change INTEGER;
  v_current_score INTEGER;
  v_new_score INTEGER;
BEGIN
  -- Determine score change based on event type
  v_score_change := CASE
    -- Positive events
    WHEN p_event_type = 'supplier_confirmed' THEN 10
    WHEN p_event_type = 'crew_arrived' THEN 6
    WHEN p_event_type = 'insurance_supplement_approved' THEN 8
    WHEN p_event_type = 'payment_deposit_collected' THEN 5
    WHEN p_event_type = 'payment_final_collected' THEN 10
    WHEN p_event_type = 'homeowner_confirmation' THEN 5
    WHEN p_event_type = 'crew_job_completed' THEN 15
    WHEN p_event_type = 'scheduling_installation_scheduled' THEN 8
    
    -- Negative events
    WHEN p_event_type = 'material_shortage_alert' THEN -10
    WHEN p_event_type = 'homeowner_objection' THEN -7
    WHEN p_event_type = 'scheduling_weather_delay' THEN -5
    WHEN p_event_type = 'supplier_delivery_failed' THEN -8
    WHEN p_event_type = 'crew_issue_reported' THEN -6
    WHEN p_event_type = 'payment_overdue_alert' THEN -10
    
    ELSE 0
  END;

  -- Only update if there's a score change
  IF v_score_change = 0 THEN
    RETURN;
  END IF;

  -- Update job health score if job_id is provided
  IF p_job_id IS NOT NULL THEN
    -- Get current score from roofing_job_health_scores or default to 50
    SELECT COALESCE(latest_score, 50) INTO v_current_score
    FROM public.roofing_job_health_scores
    WHERE job_id = p_job_id
    ORDER BY created_at DESC
    LIMIT 1;

    v_new_score := GREATEST(0, LEAST(100, v_current_score + v_score_change));

    -- Update or insert health score
    INSERT INTO public.roofing_job_health_scores (
      org_id,
      job_id,
      latest_score,
      engagement_score,
      intent_score,
      follow_up_score,
      timeliness_score,
      score_bucket
    )
    SELECT 
      workspace_id,
      p_job_id,
      v_new_score,
      COALESCE(engagement_score, 0),
      COALESCE(intent_score, 0),
      COALESCE(follow_up_score, 0),
      COALESCE(timeliness_score, 0),
      CASE
        WHEN v_new_score >= 80 THEN 'hot'
        WHEN v_new_score >= 60 THEN 'warm'
        ELSE 'cold'
      END
    FROM public.roofing_jobs
    WHERE id = p_job_id
    ON CONFLICT (job_id) DO UPDATE SET
      latest_score = EXCLUDED.latest_score,
      score_bucket = EXCLUDED.score_bucket,
      updated_at = now();
  END IF;

  -- Also update lead health score if lead_id is provided
  IF p_lead_id IS NOT NULL THEN
    SELECT COALESCE(job_health_score, 50) INTO v_current_score
    FROM public.leads
    WHERE id = p_lead_id;

    v_new_score := GREATEST(0, LEAST(100, v_current_score + v_score_change));

    UPDATE public.leads
    SET job_health_score = v_new_score,
        last_health_update = now()
    WHERE id = p_lead_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.update_job_health_from_timeline_event IS 'Block 24620: Updates job health score based on timeline events (positive events add points, negative events subtract)';

GRANT EXECUTE ON FUNCTION public.update_job_health_from_timeline_event(TEXT, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_job_health_from_timeline_event(TEXT, UUID, UUID) TO service_role;

-- ============================================================================
-- PART 5 — CREATE TRIGGER TO AUTO-UPDATE HEALTH SCORE ON TIMELINE INSERT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_update_health_on_timeline_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Automatically update health score when timeline event is inserted
  PERFORM public.update_job_health_from_timeline_event(
    NEW.event_type,
    NEW.job_id,
    NEW.lead_id
  );
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_health_on_timeline_insert ON public.job_timelines;
CREATE TRIGGER trg_update_health_on_timeline_insert
AFTER INSERT ON public.job_timelines
FOR EACH ROW
WHEN (NEW.event_type IN (
  'supplier_confirmed', 'crew_arrived', 'insurance_supplement_approved',
  'payment_deposit_collected', 'payment_final_collected', 'homeowner_confirmation',
  'crew_job_completed', 'scheduling_installation_scheduled',
  'material_shortage_alert', 'homeowner_objection', 'scheduling_weather_delay',
  'supplier_delivery_failed', 'crew_issue_reported', 'payment_overdue_alert'
))
EXECUTE FUNCTION public.trigger_update_health_on_timeline_insert();

-- ============================================================================
-- PART 6 — UPDATE RLS POLICIES FOR JOB-BASED ACCESS
-- ============================================================================

-- Policy: Users can view timeline events for jobs in their workspace
DROP POLICY IF EXISTS "Users can view job timeline events by job" ON public.job_timelines;
CREATE POLICY "Users can view job timeline events by job"
  ON public.job_timelines
  FOR SELECT
  USING (
    -- Access via job
    (job_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.roofing_jobs j
      WHERE j.id = job_timelines.job_id
        AND j.workspace_id IN (
          SELECT workspace_id FROM public.workspace_members 
          WHERE user_id = auth.uid()
        )
    ))
    OR
    -- Access via lead (existing logic)
    (lead_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.leads l
      WHERE l.id = job_timelines.lead_id
        AND (
          EXISTS (
            SELECT 1
            FROM public.workspace_members wm
            WHERE wm.workspace_id = l.workspace_id
              AND wm.user_id = auth.uid()
          )
          OR (l.owner_id = auth.uid())
        )
    ))
  );

-- Policy: Users can insert timeline events for jobs in their workspace
DROP POLICY IF EXISTS "Users can insert job timeline events by job" ON public.job_timelines;
CREATE POLICY "Users can insert job timeline events by job"
  ON public.job_timelines
  FOR INSERT
  WITH CHECK (
    -- Access via job
    (job_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.roofing_jobs j
      WHERE j.id = job_timelines.job_id
        AND j.workspace_id IN (
          SELECT workspace_id FROM public.workspace_members 
          WHERE user_id = auth.uid()
        )
    ))
    OR
    -- Access via lead (existing logic)
    (lead_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.leads l
      WHERE l.id = job_timelines.lead_id
        AND (
          EXISTS (
            SELECT 1
            FROM public.workspace_members wm
            WHERE wm.workspace_id = l.workspace_id
              AND wm.user_id = auth.uid()
          )
          OR (l.owner_id = auth.uid())
        )
    ))
  );

-- ============================================================================
-- PART 7 — CREATE VIEW FOR FILTERED TIMELINE QUERIES
-- ============================================================================
-- This view makes it easy to query timeline events with proper categorization

CREATE OR REPLACE VIEW public.job_timeline_v2_view AS
SELECT 
  jt.id,
  jt.job_id,
  jt.lead_id,
  jt.workspace_id,
  jt.user_id,
  jt.event_type,
  jt.event_subtype,
  jt.event_category,
  jt.message,
  jt.event_summary,
  jt.event_data,
  jt.created_at,
  -- Job info
  rj.title as job_title,
  rj.status as job_status,
  rj.job_value,
  -- Lead info
  l.first_name as lead_first_name,
  l.last_name as lead_last_name,
  l.email as lead_email,
  -- User info
  u.email as user_email
FROM public.job_timelines jt
LEFT JOIN public.roofing_jobs rj ON jt.job_id = rj.id
LEFT JOIN public.leads l ON jt.lead_id = l.id
LEFT JOIN auth.users u ON jt.user_id = u.id;

COMMENT ON VIEW public.job_timeline_v2_view IS 'Block 24620: Unified view of job timeline events with related job, lead, and user information';

GRANT SELECT ON public.job_timeline_v2_view TO authenticated;

-- ============================================================================
-- PART 8 — CREATE FUNCTION TO GET TIMELINE WITH FILTERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_job_timeline(
  p_job_id UUID DEFAULT NULL,
  p_lead_id UUID DEFAULT NULL,
  p_event_category TEXT DEFAULT NULL,
  p_event_type TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  job_id UUID,
  lead_id UUID,
  event_type TEXT,
  event_subtype TEXT,
  event_category TEXT,
  message TEXT,
  event_summary TEXT,
  event_data JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    jt.id,
    jt.job_id,
    jt.lead_id,
    jt.event_type,
    jt.event_subtype,
    jt.event_category,
    jt.message,
    jt.event_summary,
    jt.event_data,
    jt.created_at
  FROM public.job_timelines jt
  WHERE 
    (p_job_id IS NULL OR jt.job_id = p_job_id)
    AND (p_lead_id IS NULL OR jt.lead_id = p_lead_id)
    AND (p_event_category IS NULL OR jt.event_category = p_event_category)
    AND (p_event_type IS NULL OR jt.event_type = p_event_type)
  ORDER BY jt.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION public.get_job_timeline IS 'Block 24620: Get filtered job timeline events with pagination support';

GRANT EXECUTE ON FUNCTION public.get_job_timeline(UUID, UUID, TEXT, TEXT, INTEGER, INTEGER) TO authenticated;

-- ============================================================================
-- PART 9 — CREATE TRIGGERS TO AUTO-LOG EVENTS FROM EXISTING TABLES
-- ============================================================================
-- These triggers automatically log timeline events when actions occur in other tables

-- Trigger: Auto-log crew assignment events
CREATE OR REPLACE FUNCTION public.trigger_log_crew_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_lead_id UUID;
BEGIN
  -- Get lead_id from job
  SELECT lead_id INTO v_lead_id
  FROM public.roofing_jobs
  WHERE id = NEW.job_id;

  -- Log crew assignment
  PERFORM public.log_job_timeline_event(
    p_job_id => NEW.job_id,
    p_lead_id => v_lead_id,
    p_event_type => 'crew_assigned',
    p_message => format('Crew assigned to job'),
    p_event_data => jsonb_build_object(
      'crew_id', NEW.crew_id,
      'assigned_at', NEW.assigned_at
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_crew_assignment ON public.job_crew_assignments;
CREATE TRIGGER trg_log_crew_assignment
AFTER INSERT ON public.job_crew_assignments
FOR EACH ROW
WHEN (NEW.unassigned_at IS NULL)
EXECUTE FUNCTION public.trigger_log_crew_assignment();

-- Trigger: Auto-log job status changes
CREATE OR REPLACE FUNCTION public.trigger_log_job_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_event_type TEXT;
BEGIN
  -- Only log if status actually changed
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Map status to event type
  v_event_type := CASE NEW.status
    WHEN 'scheduled' THEN 'status_scheduled'
    WHEN 'in_progress' THEN 'status_installed'
    WHEN 'completed' THEN 'status_completed'
    WHEN 'cancelled' THEN 'status_cancelled'
    ELSE NULL
  END;

  -- Log status change if mapped
  IF v_event_type IS NOT NULL THEN
    PERFORM public.log_job_timeline_event(
      p_job_id => NEW.id,
      p_lead_id => NEW.lead_id,
      p_event_type => v_event_type,
      p_message => format('Job status changed to %s', NEW.status),
      p_event_data => jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_job_status_change ON public.roofing_jobs;
CREATE TRIGGER trg_log_job_status_change
AFTER UPDATE ON public.roofing_jobs
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.trigger_log_job_status_change();

-- Trigger: Auto-log scheduling events
CREATE OR REPLACE FUNCTION public.trigger_log_scheduling_event()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_event_type TEXT;
  v_message TEXT;
BEGIN
  -- Determine event type based on what changed
  IF OLD.scheduled_start_date IS DISTINCT FROM NEW.scheduled_start_date THEN
    IF NEW.scheduled_start_date IS NOT NULL THEN
      v_event_type := 'scheduling_installation_scheduled';
      v_message := format('Installation scheduled for %s', NEW.scheduled_start_date);
    END IF;
  END IF;

  -- Log if event type determined
  IF v_event_type IS NOT NULL THEN
    PERFORM public.log_job_timeline_event(
      p_job_id => NEW.id,
      p_lead_id => NEW.lead_id,
      p_event_type => v_event_type,
      p_message => v_message,
      p_event_data => jsonb_build_object(
        'scheduled_start_date', NEW.scheduled_start_date,
        'scheduled_end_date', NEW.scheduled_end_date
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_scheduling_event ON public.roofing_jobs;
CREATE TRIGGER trg_log_scheduling_event
AFTER UPDATE ON public.roofing_jobs
FOR EACH ROW
WHEN (
  OLD.scheduled_start_date IS DISTINCT FROM NEW.scheduled_start_date
  OR OLD.scheduled_end_date IS DISTINCT FROM NEW.scheduled_end_date
)
EXECUTE FUNCTION public.trigger_log_scheduling_event();

-- Trigger: Auto-log payment events (when deposit_paid or balance changes)
CREATE OR REPLACE FUNCTION public.trigger_log_payment_event()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_event_type TEXT;
  v_message TEXT;
BEGIN
  -- Check if deposit was paid
  IF OLD.deposit_paid IS DISTINCT FROM NEW.deposit_paid AND NEW.deposit_paid > 0 THEN
    v_event_type := 'payment_deposit_collected';
    v_message := format('Deposit collected: $%s', NEW.deposit_paid);
    
    PERFORM public.log_job_timeline_event(
      p_job_id => NEW.id,
      p_lead_id => NEW.lead_id,
      p_event_type => v_event_type,
      p_message => v_message,
      p_event_data => jsonb_build_object(
        'amount', NEW.deposit_paid,
        'balance_remaining', NEW.balance_remaining
      )
    );
  END IF;

  -- Check if final payment collected (balance_remaining = 0)
  IF OLD.balance_remaining > 0 AND NEW.balance_remaining = 0 THEN
    v_event_type := 'payment_final_collected';
    v_message := 'Final payment collected - job fully paid';
    
    PERFORM public.log_job_timeline_event(
      p_job_id => NEW.id,
      p_lead_id => NEW.lead_id,
      p_event_type => v_event_type,
      p_message => v_message,
      p_event_data => jsonb_build_object(
        'total_paid', NEW.job_value - NEW.balance_remaining
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_payment_event ON public.roofing_jobs;
CREATE TRIGGER trg_log_payment_event
AFTER UPDATE ON public.roofing_jobs
FOR EACH ROW
WHEN (
  OLD.deposit_paid IS DISTINCT FROM NEW.deposit_paid
  OR OLD.balance_remaining IS DISTINCT FROM NEW.balance_remaining
)
EXECUTE FUNCTION public.trigger_log_payment_event();

COMMENT ON FUNCTION public.trigger_log_crew_assignment IS 'Block 24620: Auto-logs crew assignment events to timeline';
COMMENT ON FUNCTION public.trigger_log_job_status_change IS 'Block 24620: Auto-logs job status changes to timeline';
COMMENT ON FUNCTION public.trigger_log_scheduling_event IS 'Block 24620: Auto-logs scheduling events to timeline';
COMMENT ON FUNCTION public.trigger_log_payment_event IS 'Block 24620: Auto-logs payment events to timeline';

