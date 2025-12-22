-- =========================================================
-- Block 20460 — SmartSend Lead Timeline + Claim Journey Map v1
-- (The Visual Flow From Storm → Claim → Approval → Install)
-- =========================================================
--
-- This block is the clarity engine for roofing contractors.
-- It visualizes the full path of every homeowner:
-- - When storm happened
-- - When claim was filed
-- - When adjuster came
-- - When approval dropped
-- - When scope was parsed
-- - When depreciation is released
-- - When install is ready
-- - When follow-up is needed
--
-- Roofers NEVER see this anywhere else.
-- SmartSend becomes their insurance GPS.
-- =========================================================

-- ============================================================================
-- PART 1 — Create insurance_timeline_events Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.insurance_timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Link to lead/thread/contact (flexible linking)
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  email_id uuid, -- Can reference inbox_messages or email_messages
  
  -- Event classification
  event_type text NOT NULL CHECK (event_type IN (
    'STORM_EVENT',
    'CLAIM_FILED',
    'ADJUSTER_ASSIGNED',
    'ADJUSTER_VISIT',
    'CLAIM_APPROVED',
    'CLAIM_DENIED',
    'SCOPE_PARSED',
    'INSTALL_READY',
    'FOLLOW_UP_SENT',
    'QUOTE_SENT',
    'DEPRECIATION_RELEASED',
    'SUPPLEMENT_SUBMITTED',
    'MANUAL_STAGE_UPDATE'
  )),
  
  -- Event data (flexible JSONB payload)
  event_payload jsonb DEFAULT '{}'::jsonb,
  
  -- Event date (when the event actually occurred, not when it was detected)
  event_date date,
  
  -- Detection metadata
  detected_from text CHECK (detected_from IN ('email', 'attachment', 'manual', 'api', 'trigger')),
  detection_confidence numeric(3,2) CHECK (detection_confidence >= 0.0 AND detection_confidence <= 1.0),
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Ensure at least one link exists
  CONSTRAINT timeline_event_has_link CHECK (
    lead_id IS NOT NULL OR thread_id IS NOT NULL OR contact_id IS NOT NULL
  )
);

-- Indexes for timeline queries
CREATE INDEX IF NOT EXISTS idx_timeline_events_lead ON public.insurance_timeline_events(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_timeline_events_thread ON public.insurance_timeline_events(thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_timeline_events_contact ON public.insurance_timeline_events(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_timeline_events_type ON public.insurance_timeline_events(event_type);
CREATE INDEX IF NOT EXISTS idx_timeline_events_date ON public.insurance_timeline_events(event_date DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_timeline_events_created ON public.insurance_timeline_events(created_at DESC);

-- Composite index for timeline queries (most common)
CREATE INDEX IF NOT EXISTS idx_timeline_events_thread_type_date ON public.insurance_timeline_events(thread_id, event_type, event_date DESC NULLS LAST) WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_timeline_events_lead_type_date ON public.insurance_timeline_events(lead_id, event_type, event_date DESC NULLS LAST) WHERE lead_id IS NOT NULL;

-- GIN index for JSONB payload searches
CREATE INDEX IF NOT EXISTS idx_timeline_events_payload ON public.insurance_timeline_events USING GIN(event_payload);

COMMENT ON TABLE public.insurance_timeline_events IS 'Timeline events tracking the full claim journey from storm detection to install-ready';
COMMENT ON COLUMN public.insurance_timeline_events.event_type IS 'Event type: STORM_EVENT, CLAIM_FILED, ADJUSTER_ASSIGNED, ADJUSTER_VISIT, CLAIM_APPROVED, CLAIM_DENIED, SCOPE_PARSED, INSTALL_READY, FOLLOW_UP_SENT, QUOTE_SENT, DEPRECIATION_RELEASED, SUPPLEMENT_SUBMITTED, MANUAL_STAGE_UPDATE';
COMMENT ON COLUMN public.insurance_timeline_events.event_payload IS 'JSONB payload with event-specific data (dates, amounts, names, etc.)';
COMMENT ON COLUMN public.insurance_timeline_events.event_date IS 'Date when the event actually occurred (storm date, claim file date, etc.)';
COMMENT ON COLUMN public.insurance_timeline_events.detected_from IS 'Source of detection: email, attachment, manual, api, trigger';

-- ============================================================================
-- PART 2 — Trigger to Update Updated_At Timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_timeline_event_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_timeline_event_timestamp ON public.insurance_timeline_events;
CREATE TRIGGER trg_update_timeline_event_timestamp
  BEFORE UPDATE ON public.insurance_timeline_events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_timeline_event_timestamp();

-- ============================================================================
-- PART 3 — Function to Create Timeline Event
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_timeline_event(
  p_event_type text,
  p_event_payload jsonb DEFAULT '{}'::jsonb,
  p_event_date date DEFAULT NULL,
  p_lead_id uuid DEFAULT NULL,
  p_thread_id uuid DEFAULT NULL,
  p_contact_id uuid DEFAULT NULL,
  p_email_id uuid DEFAULT NULL,
  p_detected_from text DEFAULT 'api',
  p_detection_confidence numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_id uuid;
  v_resolved_thread_id uuid;
  v_resolved_contact_id uuid;
  v_resolved_lead_id uuid;
BEGIN
  -- Resolve thread_id from lead_id or contact_id if not provided
  IF p_thread_id IS NULL THEN
    IF p_lead_id IS NOT NULL THEN
      SELECT id INTO v_resolved_thread_id
      FROM public.inbox_threads
      WHERE lead_id = p_lead_id
      ORDER BY last_message_at DESC
      LIMIT 1;
    ELSIF p_contact_id IS NOT NULL THEN
      SELECT id INTO v_resolved_thread_id
      FROM public.inbox_threads
      WHERE contact_id = p_contact_id
      ORDER BY last_message_at DESC
      LIMIT 1;
    END IF;
  ELSE
    v_resolved_thread_id := p_thread_id;
  END IF;
  
  -- Resolve contact_id from thread_id if not provided
  IF p_contact_id IS NULL AND v_resolved_thread_id IS NOT NULL THEN
    SELECT contact_id INTO v_resolved_contact_id
    FROM public.inbox_threads
    WHERE id = v_resolved_thread_id;
  ELSE
    v_resolved_contact_id := p_contact_id;
  END IF;
  
  -- Resolve lead_id from thread_id if not provided
  IF p_lead_id IS NULL AND v_resolved_thread_id IS NOT NULL THEN
    SELECT lead_id INTO v_resolved_lead_id
    FROM public.inbox_threads
    WHERE id = v_resolved_thread_id;
  ELSE
    v_resolved_lead_id := p_lead_id;
  END IF;
  
  -- Insert timeline event
  INSERT INTO public.insurance_timeline_events (
    event_type,
    event_payload,
    event_date,
    lead_id,
    thread_id,
    contact_id,
    email_id,
    detected_from,
    detection_confidence
  ) VALUES (
    p_event_type,
    p_event_payload,
    COALESCE(p_event_date, CURRENT_DATE),
    v_resolved_lead_id,
    v_resolved_thread_id,
    v_resolved_contact_id,
    p_email_id,
    p_detected_from,
    p_detection_confidence
  )
  RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$$;

COMMENT ON FUNCTION public.create_timeline_event IS 'Creates a timeline event with automatic resolution of thread_id/contact_id/lead_id relationships';

-- ============================================================================
-- PART 4 — Trigger: Auto-Create Timeline Events on Claim Status Updates (Block 20360)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_timeline_on_claim_status_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_type text;
  v_event_payload jsonb;
  v_event_date date;
BEGIN
  -- Only process if claim status actually changed
  IF OLD.insurance_claim_status IS DISTINCT FROM NEW.insurance_claim_status THEN
    -- Map claim status to event type
    CASE NEW.insurance_claim_status
      WHEN 'approved' THEN
        v_event_type := 'CLAIM_APPROVED';
        v_event_payload := jsonb_build_object(
          'approval_type', NEW.insurance_payout_type,
          'rcv_total', NEW.claim_financials->>'rcv_total',
          'acv_total', NEW.claim_financials->>'acv_total',
          'deductible', NEW.insurance_deductible_amount,
          'depreciation_recoverable', NEW.insurance_depreciation_recoverable
        );
        v_event_date := COALESCE(
          (NEW.insurance_analysis_metadata->>'approval_date')::date,
          (NEW.claim_financials->>'approval_date')::date,
          CURRENT_DATE
        );
      WHEN 'approved_acv_only' THEN
        v_event_type := 'CLAIM_APPROVED';
        v_event_payload := jsonb_build_object(
          'approval_type', 'ACV',
          'acv_total', NEW.claim_financials->>'acv_total',
          'deductible', NEW.insurance_deductible_amount
        );
        v_event_date := COALESCE(
          (NEW.insurance_analysis_metadata->>'approval_date')::date,
          (NEW.claim_financials->>'approval_date')::date,
          CURRENT_DATE
        );
      WHEN 'denied' THEN
        v_event_type := 'CLAIM_DENIED';
        v_event_payload := jsonb_build_object(
          'denial_reason', NEW.insurance_analysis_metadata->>'denial_reason'
        );
        v_event_date := COALESCE(
          (NEW.insurance_analysis_metadata->>'denial_date')::date,
          CURRENT_DATE
        );
      WHEN 'claim_filed_awaiting_adjuster' THEN
        v_event_type := 'CLAIM_FILED';
        v_event_payload := jsonb_build_object(
          'claim_number', NEW.insurance_analysis_metadata->>'claim_number',
          'insurance_carrier', NEW.insurance_carrier
        );
        v_event_date := COALESCE(
          (NEW.insurance_analysis_metadata->>'claim_file_date')::date,
          CURRENT_DATE
        );
      WHEN 'adjuster_visit_scheduled' THEN
        v_event_type := 'ADJUSTER_ASSIGNED';
        v_event_payload := jsonb_build_object(
          'adjuster_name', NEW.insurance_analysis_metadata->>'adjuster_name',
          'adjuster_email', NEW.insurance_analysis_metadata->>'adjuster_email',
          'scheduled_date', NEW.insurance_analysis_metadata->>'adjuster_scheduled_date'
        );
        v_event_date := (NEW.insurance_analysis_metadata->>'adjuster_scheduled_date')::date;
      WHEN 'under_review' THEN
        v_event_type := 'ADJUSTER_VISIT';
        v_event_payload := jsonb_build_object(
          'adjuster_name', NEW.insurance_analysis_metadata->>'adjuster_name',
          'visit_completed', true
        );
        v_event_date := COALESCE(
          (NEW.insurance_analysis_metadata->>'adjuster_visit_date')::date,
          CURRENT_DATE
        );
      ELSE
        -- Unknown status, skip
        RETURN NEW;
    END CASE;
    
    -- Create timeline event
    PERFORM public.create_timeline_event(
      p_event_type := v_event_type,
      p_event_payload := v_event_payload,
      p_event_date := v_event_date,
      p_thread_id := NEW.id,
      p_contact_id := NEW.contact_id,
      p_detected_from := 'trigger',
      p_detection_confidence := 0.9
    );
  END IF;
  
  -- Check for install-ready status change
  IF OLD.insurance_install_ready IS DISTINCT FROM NEW.insurance_install_ready AND NEW.insurance_install_ready = true THEN
    PERFORM public.create_timeline_event(
      p_event_type := 'INSTALL_READY',
      p_event_payload := jsonb_build_object(
        'rcv_total', NEW.claim_financials->>'rcv_total',
        'roof_squares', NEW.roof_scope->>'total_squares',
        'next_action', NEW.install_ready_next_action
      ),
      p_event_date := CURRENT_DATE,
      p_thread_id := NEW.id,
      p_contact_id := NEW.contact_id,
      p_detected_from := 'trigger',
      p_detection_confidence := 0.95
    );
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_timeline_on_claim_status_update ON public.inbox_threads;
CREATE TRIGGER trg_timeline_on_claim_status_update
  AFTER UPDATE ON public.inbox_threads
  FOR EACH ROW
  WHEN (
    OLD.insurance_claim_status IS DISTINCT FROM NEW.insurance_claim_status OR
    OLD.insurance_install_ready IS DISTINCT FROM NEW.insurance_install_ready
  )
  EXECUTE FUNCTION public.trigger_timeline_on_claim_status_update();

COMMENT ON FUNCTION public.trigger_timeline_on_claim_status_update IS 'Auto-creates timeline events when claim status or install-ready status changes (Block 20360 integration)';

-- ============================================================================
-- PART 5 — Trigger: Auto-Create Timeline Events on Scope Parsing (Block 20380)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_timeline_on_scope_parsed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- When scope is parsed (has_parsed_scope becomes true)
  IF OLD.has_parsed_scope IS DISTINCT FROM NEW.has_parsed_scope AND NEW.has_parsed_scope = true THEN
    PERFORM public.create_timeline_event(
      p_event_type := 'SCOPE_PARSED',
      p_event_payload := jsonb_build_object(
        'roof_squares', NEW.roof_scope->>'total_squares',
        'material', NEW.roof_scope->>'material',
        'rcv_total', NEW.claim_financials->>'rcv_total',
        'acv_total', NEW.claim_financials->>'acv_total',
        'missing_items', NEW.profitability_signals->>'missing_items',
        'supplement_opportunity', NEW.profitability_signals->>'supplement_opportunity'
      ),
      p_event_date := CURRENT_DATE,
      p_thread_id := NEW.id,
      p_contact_id := NEW.contact_id,
      p_detected_from := 'attachment',
      p_detection_confidence := 0.9
    );
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_timeline_on_scope_parsed ON public.inbox_threads;
CREATE TRIGGER trg_timeline_on_scope_parsed
  AFTER UPDATE ON public.inbox_threads
  FOR EACH ROW
  WHEN (OLD.has_parsed_scope IS DISTINCT FROM NEW.has_parsed_scope)
  EXECUTE FUNCTION public.trigger_timeline_on_scope_parsed();

COMMENT ON FUNCTION public.trigger_timeline_on_scope_parsed IS 'Auto-creates timeline events when scope is parsed from attachments (Block 20380 integration)';

-- ============================================================================
-- PART 6 — Trigger: Auto-Create Timeline Events on Hot Lead Score Recalculation (Block 20430)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_timeline_on_hot_lead_score()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_previous_tier integer;
  v_current_tier integer;
BEGIN
  -- Only create event if tier changed significantly (Tier 1 = HOT)
  v_previous_tier := COALESCE(OLD.hot_lead_tier, 5);
  v_current_tier := COALESCE(NEW.hot_lead_tier, 5);
  
  -- If lead became HOT (Tier 1), create event
  IF v_current_tier = 1 AND v_previous_tier != 1 THEN
    PERFORM public.create_timeline_event(
      p_event_type := 'INSTALL_READY',
      p_event_payload := jsonb_build_object(
        'hot_lead_score', NEW.hot_lead_score,
        'hot_lead_tier', NEW.hot_lead_tier,
        'next_action', NEW.hot_lead_next_action,
        'score_breakdown', NEW.hot_lead_score_breakdown
      ),
      p_event_date := CURRENT_DATE,
      p_thread_id := NEW.id,
      p_contact_id := NEW.contact_id,
      p_detected_from := 'trigger',
      p_detection_confidence := 0.85
    );
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_timeline_on_hot_lead_score ON public.inbox_threads;
CREATE TRIGGER trg_timeline_on_hot_lead_score
  AFTER UPDATE ON public.inbox_threads
  FOR EACH ROW
  WHEN (OLD.hot_lead_tier IS DISTINCT FROM NEW.hot_lead_tier)
  EXECUTE FUNCTION public.trigger_timeline_on_hot_lead_score();

COMMENT ON FUNCTION public.trigger_timeline_on_hot_lead_score IS 'Auto-creates timeline events when hot lead score changes significantly (Block 20430 integration)';

-- ============================================================================
-- PART 7 — Trigger: Auto-Create Timeline Events on New Inbound Messages (Storm Detection)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_timeline_on_new_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_message_text text;
  v_storm_keywords text[];
  v_has_storm boolean := false;
  v_storm_date_guess date;
BEGIN
  -- Only process inbound messages
  IF NEW.direction = 'in' AND NEW.thread_id IS NOT NULL THEN
    v_message_text := COALESCE(NEW.body, NEW.body_text, '');
    
    -- Check for storm event keywords
    v_storm_keywords := ARRAY[
      'hail storm',
      'windstorm',
      'storm hit',
      'insurance suggested filing claim',
      'hail damage',
      'wind damage',
      'storm damage'
    ];
    
    -- Check if message contains storm keywords
    v_has_storm := EXISTS (
      SELECT 1 FROM unnest(v_storm_keywords) keyword
      WHERE v_message_text ILIKE '%' || keyword || '%'
    );
    
    -- If storm detected and no storm event exists for this thread, create one
    IF v_has_storm AND NOT EXISTS (
      SELECT 1 FROM public.insurance_timeline_events
      WHERE thread_id = NEW.thread_id
        AND event_type = 'STORM_EVENT'
    ) THEN
      -- Try to extract date from message (simple heuristic: look for dates in last 30 days)
      v_storm_date_guess := COALESCE(
        -- Try to extract date from text (simplified - could be enhanced with NLP)
        NULL, -- Placeholder for date extraction logic
        CURRENT_DATE - INTERVAL '7 days' -- Default to 7 days ago
      );
      
      PERFORM public.create_timeline_event(
        p_event_type := 'STORM_EVENT',
        p_event_payload := jsonb_build_object(
          'storm_date_detected', true,
          'storm_date_guess', v_storm_date_guess::text,
          'detected_keywords', v_storm_keywords
        ),
        p_event_date := v_storm_date_guess,
        p_thread_id := NEW.thread_id,
        p_email_id := NEW.id,
        p_detected_from := 'email',
        p_detection_confidence := 0.7
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_timeline_on_new_message ON public.inbox_messages;
CREATE TRIGGER trg_timeline_on_new_message
  AFTER INSERT ON public.inbox_messages
  FOR EACH ROW
  WHEN (NEW.direction = 'in')
  EXECUTE FUNCTION public.trigger_timeline_on_new_message();

COMMENT ON FUNCTION public.trigger_timeline_on_new_message IS 'Auto-detects storm events from inbound messages and creates timeline events';

-- ============================================================================
-- PART 8 — Function to Get Complete Timeline for Lead/Thread
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_claim_journey_timeline(
  p_thread_id uuid DEFAULT NULL,
  p_lead_id uuid DEFAULT NULL,
  p_contact_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_timeline jsonb;
  v_thread_record record;
BEGIN
  -- Resolve thread_id if not provided
  IF p_thread_id IS NULL THEN
    IF p_lead_id IS NOT NULL THEN
      SELECT id INTO p_thread_id
      FROM public.inbox_threads
      WHERE lead_id = p_lead_id
      ORDER BY last_message_at DESC
      LIMIT 1;
    ELSIF p_contact_id IS NOT NULL THEN
      SELECT id INTO p_thread_id
      FROM public.inbox_threads
      WHERE contact_id = p_contact_id
      ORDER BY last_message_at DESC
      LIMIT 1;
    END IF;
  END IF;
  
  -- Get thread data for context
  IF p_thread_id IS NOT NULL THEN
    SELECT * INTO v_thread_record
    FROM public.inbox_threads
    WHERE id = p_thread_id;
  END IF;
  
  -- Get all timeline events
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', id,
      'event_type', event_type,
      'event_date', event_date,
      'event_payload', event_payload,
      'detected_from', detected_from,
      'detection_confidence', detection_confidence,
      'created_at', created_at
    ) ORDER BY COALESCE(event_date, created_at::date) ASC, created_at ASC
  ), '[]'::jsonb)
  INTO v_timeline
  FROM public.insurance_timeline_events
  WHERE (
    (p_thread_id IS NOT NULL AND thread_id = p_thread_id) OR
    (p_lead_id IS NOT NULL AND lead_id = p_lead_id) OR
    (p_contact_id IS NOT NULL AND contact_id = p_contact_id)
  );
  
  -- Build complete timeline response with thread context
  RETURN jsonb_build_object(
    'thread_id', p_thread_id,
    'lead_id', p_lead_id,
    'contact_id', p_contact_id,
    'timeline_events', v_timeline,
    'thread_context', CASE
      WHEN v_thread_record.id IS NOT NULL THEN jsonb_build_object(
        'insurance_carrier', v_thread_record.insurance_carrier,
        'claim_status', v_thread_record.insurance_claim_status,
        'install_ready', v_thread_record.insurance_install_ready,
        'hot_lead_score', v_thread_record.hot_lead_score,
        'hot_lead_tier', v_thread_record.hot_lead_tier
      )
      ELSE '{}'::jsonb
    END
  );
END;
$$;

COMMENT ON FUNCTION public.get_claim_journey_timeline IS 'Returns complete claim journey timeline for a lead/thread with all events in chronological order';

-- ============================================================================
-- PART 9 — Function to Get Current Stage and Next Action
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_current_claim_stage(
  p_thread_id uuid DEFAULT NULL,
  p_lead_id uuid DEFAULT NULL,
  p_contact_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_current_stage text;
  v_next_action text;
  v_timeline_duration integer;
  v_first_event_date date;
  v_last_event_date date;
  v_thread_record record;
  v_stage_icon text;
BEGIN
  -- Resolve thread_id if not provided
  IF p_thread_id IS NULL THEN
    IF p_lead_id IS NOT NULL THEN
      SELECT id INTO p_thread_id
      FROM public.inbox_threads
      WHERE lead_id = p_lead_id
      ORDER BY last_message_at DESC
      LIMIT 1;
    ELSIF p_contact_id IS NOT NULL THEN
      SELECT id INTO p_thread_id
      FROM public.inbox_threads
      WHERE contact_id = p_contact_id
      ORDER BY last_message_at DESC
      LIMIT 1;
    END IF;
  END IF;
  
  -- Get thread data
  IF p_thread_id IS NOT NULL THEN
    SELECT * INTO v_thread_record
    FROM public.inbox_threads
    WHERE id = p_thread_id;
  END IF;
  
  -- Determine current stage based on thread status and latest timeline event
  IF v_thread_record.id IS NOT NULL THEN
    -- Check for install-ready first (highest priority)
    IF v_thread_record.insurance_install_ready = true THEN
      v_current_stage := 'INSTALL READY';
      v_stage_icon := '🔥';
      v_next_action := COALESCE(
        v_thread_record.install_ready_next_action,
        v_thread_record.hot_lead_next_action,
        'CALL NOW'
      );
    -- Check claim status
    ELSIF v_thread_record.insurance_claim_status = 'approved' THEN
      v_current_stage := 'Claim Approved (RCV)';
      v_stage_icon := '🟩';
      v_next_action := CASE
        WHEN v_thread_record.has_parsed_scope = true THEN 'Review scope and schedule install'
        ELSE 'Wait for scope/estimate'
      END;
    ELSIF v_thread_record.insurance_claim_status = 'approved_acv_only' THEN
      v_current_stage := 'Claim Approved (ACV)';
      v_stage_icon := '🟩';
      v_next_action := 'Review ACV details and discuss with homeowner';
    ELSIF v_thread_record.insurance_claim_status = 'adjuster_visit_scheduled' THEN
      v_current_stage := 'Adjuster Visit Scheduled';
      v_stage_icon := '🟨';
      v_next_action := 'Prepare for adjuster meeting';
    ELSIF v_thread_record.insurance_claim_status = 'claim_filed_awaiting_adjuster' THEN
      v_current_stage := 'Claim Filed';
      v_stage_icon := '🟩';
      v_next_action := 'Wait for adjuster assignment';
    ELSIF v_thread_record.insurance_claim_status = 'denied' THEN
      v_current_stage := 'Claim Denied';
      v_stage_icon := '❌';
      v_next_action := 'Review denial reason and consider appeal';
    ELSE
      v_current_stage := 'New Lead';
      v_stage_icon := '🟦';
      v_next_action := 'Initial contact and assessment';
    END IF;
  ELSE
    v_current_stage := 'Unknown';
    v_stage_icon := '❓';
    v_next_action := 'Gather information';
  END IF;
  
  -- Calculate timeline duration
  SELECT 
    MIN(event_date),
    MAX(event_date)
  INTO v_first_event_date, v_last_event_date
  FROM public.insurance_timeline_events
  WHERE (
    (p_thread_id IS NOT NULL AND thread_id = p_thread_id) OR
    (p_lead_id IS NOT NULL AND lead_id = p_lead_id) OR
    (p_contact_id IS NOT NULL AND contact_id = p_contact_id)
  );
  
  IF v_first_event_date IS NOT NULL AND v_last_event_date IS NOT NULL THEN
    v_timeline_duration := v_last_event_date - v_first_event_date;
  ELSE
    v_timeline_duration := NULL;
  END IF;
  
  -- Return stage summary
  RETURN jsonb_build_object(
    'current_stage', v_current_stage,
    'stage_icon', v_stage_icon,
    'next_action', v_next_action,
    'timeline_duration_days', v_timeline_duration,
    'first_event_date', v_first_event_date,
    'last_event_date', v_last_event_date,
    'thread_id', p_thread_id,
    'insurance_carrier', v_thread_record.insurance_carrier,
    'claim_status', v_thread_record.insurance_claim_status,
    'install_ready', v_thread_record.insurance_install_ready,
    'hot_lead_score', v_thread_record.hot_lead_score,
    'hot_lead_tier', v_thread_record.hot_lead_tier
  );
END;
$$;

COMMENT ON FUNCTION public.get_current_claim_stage IS 'Returns current claim stage, next action, and timeline duration for a lead/thread';

-- ============================================================================
-- PART 10 — View for Install-Ready Timeline Display
-- ============================================================================

CREATE OR REPLACE VIEW public.claim_journey_timeline_view AS
SELECT 
  t.id as thread_id,
  t.contact_id,
  t.campaign_id,
  t.insurance_carrier,
  t.insurance_claim_status,
  t.insurance_install_ready,
  t.hot_lead_score,
  t.hot_lead_tier,
  -- Get timeline events as JSONB array
  COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'event_type', e.event_type,
        'event_date', e.event_date,
        'event_payload', e.event_payload,
        'created_at', e.created_at
      ) ORDER BY COALESCE(e.event_date, e.created_at::date) ASC, e.created_at ASC
    )
    FROM public.insurance_timeline_events e
    WHERE e.thread_id = t.id
  ), '[]'::jsonb) as timeline_events,
  -- Current stage summary
  CASE
    WHEN t.insurance_install_ready = true THEN '🔥 INSTALL READY'
    WHEN t.insurance_claim_status = 'approved' THEN '🟩 Claim Approved (RCV)'
    WHEN t.insurance_claim_status = 'approved_acv_only' THEN '🟩 Claim Approved (ACV)'
    WHEN t.insurance_claim_status = 'adjuster_visit_scheduled' THEN '🟨 Adjuster Visit Scheduled'
    WHEN t.insurance_claim_status = 'claim_filed_awaiting_adjuster' THEN '🟩 Claim Filed'
    WHEN t.insurance_claim_status = 'denied' THEN '❌ Claim Denied'
    ELSE '🟦 New Lead'
  END as current_stage_label,
  -- Next action
  COALESCE(
    t.install_ready_next_action,
    t.hot_lead_next_action,
    t.insurance_next_action,
    'Review and follow up'
  ) as next_action,
  -- Timeline duration
  (
    SELECT MAX(e.event_date) - MIN(e.event_date)
    FROM public.insurance_timeline_events e
    WHERE e.thread_id = t.id
  ) as timeline_duration_days
FROM public.inbox_threads t
WHERE t.insurance_carrier IS NOT NULL
  OR t.insurance_claim_status IS NOT NULL
  OR EXISTS (
    SELECT 1 FROM public.insurance_timeline_events e
    WHERE e.thread_id = t.id
  );

COMMENT ON VIEW public.claim_journey_timeline_view IS 'Complete claim journey timeline view with current stage, next action, and all events for each thread';

-- ============================================================================
-- PART 11 — RLS Policies
-- ============================================================================

ALTER TABLE public.insurance_timeline_events ENABLE ROW LEVEL SECURITY;

-- Users can view timeline events for threads in their campaigns
CREATE POLICY "Users can view timeline events in their campaigns"
  ON public.insurance_timeline_events FOR SELECT
  USING (
    thread_id IN (
      SELECT id FROM public.inbox_threads 
      WHERE campaign_id IN (
        SELECT campaign_id FROM public.campaigns WHERE owner_id = auth.uid()
      )
    )
    OR
    lead_id IN (
      SELECT id FROM public.leads
      WHERE campaign_id IN (
        SELECT campaign_id FROM public.campaigns WHERE owner_id = auth.uid()
      )
    )
    OR
    contact_id IN (
      SELECT id FROM public.contacts
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
      )
    )
  );

-- Service role can do everything
CREATE POLICY "Service role full access timeline events"
  ON public.insurance_timeline_events
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- PART 12 — Helper Function for Manual Stage Updates
-- ============================================================================

CREATE OR REPLACE FUNCTION public.manual_update_claim_stage(
  p_thread_id uuid,
  p_stage text,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_id uuid;
BEGIN
  -- Create manual stage update event
  v_event_id := public.create_timeline_event(
    p_event_type := 'MANUAL_STAGE_UPDATE',
    p_event_payload := jsonb_build_object(
      'stage', p_stage,
      'notes', p_notes,
      'updated_by', auth.uid()::text
    ),
    p_event_date := CURRENT_DATE,
    p_thread_id := p_thread_id,
    p_detected_from := 'manual',
    p_detection_confidence := 1.0
  );
  
  RETURN v_event_id;
END;
$$;

COMMENT ON FUNCTION public.manual_update_claim_stage IS 'Allows contractors to manually update claim stage and creates timeline event';

-- ============================================================================
-- PART 13 — Summary Comments
-- ============================================================================

COMMENT ON TABLE public.insurance_timeline_events IS 
'Block 20460 — Lead Timeline + Claim Journey Map
Visualizes the full path of every homeowner from storm detection to install-ready.
This is the clarity engine for roofing contractors - SmartSend becomes their insurance GPS.';

