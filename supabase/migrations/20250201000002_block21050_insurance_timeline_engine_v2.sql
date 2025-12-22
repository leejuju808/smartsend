-- =========================================================
-- Block 21050 — SmartSend Insurance Timeline Engine v2
-- (Deep Claim Event Detection • Approval Date Extraction • Adjuster Journey Mapping Upgrade • Multi-Email Claim History Parser)
-- =========================================================
--
-- This block turns SmartSend into a full claim historian — something no CRM on earth does.
--
-- Insurance Timeline Engine v1 (20460) gave us:
-- - Basic claim journey
-- - Key milestones
-- - Install-ready triggers
--
-- v2 transforms SmartSend into a COMPLETE claim reconstruction engine that reads months of emails,
-- PDFs, adjuster comments, and homeowner forwards… and builds an accurate timeline automatically.
--
-- This is INSANE value for roofing companies.
-- =========================================================

-- ============================================================================
-- PART 1 — Extend insurance_timeline_events Table with New Event Types
-- ============================================================================

-- Drop the old CHECK constraint
ALTER TABLE IF EXISTS public.insurance_timeline_events
  DROP CONSTRAINT IF EXISTS insurance_timeline_events_event_type_check;

-- Add new CHECK constraint with all 13+ claim milestones
ALTER TABLE IF EXISTS public.insurance_timeline_events
  ADD CONSTRAINT insurance_timeline_events_event_type_check CHECK (event_type IN (
    -- Original v1 events
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
    'MANUAL_STAGE_UPDATE',
    -- New v2 events (13+ claim milestones)
    'STORM_DATE',
    'CLAIM_FILED_DATE',
    'FIRST_CONTACT_FROM_CARRIER',
    'ADJUSTER_ASSIGNED_DESK',
    'ADJUSTER_ASSIGNED_FIELD',
    'ADJUSTER_APPOINTMENT',
    'PHOTOS_REQUESTED',
    'DOCUMENTS_REQUESTED',
    'SCOPE_SENT',
    'PRICING_UPDATED',
    'SUPPLEMENT_REQUESTED',
    'SUPPLEMENT_APPROVED',
    'CLAIM_APPROVED_ACV',
    'CLAIM_APPROVED_RCV',
    'PAYMENT_SENT',
    'FUNDS_DISBURSED'
  ));

-- ============================================================================
-- PART 2 — Add New Fields for Enhanced Event Detection
-- ============================================================================

-- Add raw_text field (stores the original text that triggered the event)
ALTER TABLE IF EXISTS public.insurance_timeline_events
  ADD COLUMN IF NOT EXISTS raw_text text;

-- Add source_type field (more granular than detected_from)
ALTER TABLE IF EXISTS public.insurance_timeline_events
  ADD COLUMN IF NOT EXISTS source_type text CHECK (source_type IN (
    'email_adjuster',
    'email_homeowner',
    'email_carrier',
    'email_third_party',
    'email_inspection_company',
    'pdf_scope_of_loss',
    'pdf_approval_letter',
    'pdf_adjuster_notes',
    'pdf_engineer_report',
    'pdf_photoset',
    'pdf_payment_statement',
    'phone_call_summary',
    'ai_estimator',
    'manual_entry',
    'system_trigger',
    'api'
  ));

-- Rename detection_confidence to confidence_score for consistency (keep both for backward compatibility)
ALTER TABLE IF EXISTS public.insurance_timeline_events
  ADD COLUMN IF NOT EXISTS confidence_score numeric(3,2) CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0);

-- Add structured_data field for additional structured information
ALTER TABLE IF EXISTS public.insurance_timeline_events
  ADD COLUMN IF NOT EXISTS structured_data jsonb DEFAULT '{}'::jsonb;

-- Add event_time for precise timestamps (not just dates)
ALTER TABLE IF EXISTS public.insurance_timeline_events
  ADD COLUMN IF NOT EXISTS event_time timestamptz;

-- Add indexes for new fields
CREATE INDEX IF NOT EXISTS idx_timeline_events_source_type ON public.insurance_timeline_events(source_type);
CREATE INDEX IF NOT EXISTS idx_timeline_events_confidence ON public.insurance_timeline_events(confidence_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_timeline_events_time ON public.insurance_timeline_events(event_time DESC NULLS LAST);

-- Update comments
COMMENT ON COLUMN public.insurance_timeline_events.raw_text IS 'Original text that triggered the event detection (for debugging and verification)';
COMMENT ON COLUMN public.insurance_timeline_events.source_type IS 'Granular source type: email_adjuster, email_homeowner, pdf_scope_of_loss, etc.';
COMMENT ON COLUMN public.insurance_timeline_events.confidence_score IS 'Confidence score (0.0-1.0) for event detection accuracy';
COMMENT ON COLUMN public.insurance_timeline_events.structured_data IS 'Structured data extracted from the event (amounts, names, claim numbers, etc.)';
COMMENT ON COLUMN public.insurance_timeline_events.event_time IS 'Precise timestamp when the event occurred (includes time, not just date)';

-- ============================================================================
-- PART 3 — Create Discrepancy Detection Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.insurance_timeline_discrepancies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Link to timeline events or thread
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  
  -- Discrepancy details
  discrepancy_type text NOT NULL CHECK (discrepancy_type IN (
    'APPROVAL_AMOUNT_MISMATCH',
    'APPROVAL_STATUS_MISMATCH',
    'ADJUSTER_DATE_CONFLICT',
    'SUPPLEMENT_STATUS_MISMATCH',
    'PAYMENT_MISSING_DEPRECIATION',
    'SCOPE_MISSING_ITEMS',
    'MULTIPLE_APPROVAL_DATES',
    'CLAIM_NUMBER_MISMATCH',
    'ADJUSTER_NAME_MISMATCH',
    'CARRIER_MISMATCH'
  )),
  
  -- What was detected
  detected_value jsonb NOT NULL, -- The conflicting values
  source_events uuid[], -- Array of event IDs that conflict
  
  -- Severity
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  
  -- Resolution
  is_resolved boolean DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id),
  resolution_notes text,
  
  -- Metadata
  detected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Ensure at least one link exists
  CONSTRAINT discrepancy_has_link CHECK (
    thread_id IS NOT NULL OR contact_id IS NOT NULL OR lead_id IS NOT NULL
  )
);

-- Indexes for discrepancies
CREATE INDEX IF NOT EXISTS idx_discrepancies_thread ON public.insurance_timeline_discrepancies(thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_discrepancies_contact ON public.insurance_timeline_discrepancies(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_discrepancies_type ON public.insurance_timeline_discrepancies(discrepancy_type);
CREATE INDEX IF NOT EXISTS idx_discrepancies_severity ON public.insurance_timeline_discrepancies(severity);
CREATE INDEX IF NOT EXISTS idx_discrepancies_resolved ON public.insurance_timeline_discrepancies(is_resolved) WHERE is_resolved = false;
CREATE INDEX IF NOT EXISTS idx_discrepancies_detected ON public.insurance_timeline_discrepancies(detected_at DESC);

COMMENT ON TABLE public.insurance_timeline_discrepancies IS 'Flags inconsistencies in claim data (e.g., adjuster says approved but PDF shows different amount)';
COMMENT ON COLUMN public.insurance_timeline_discrepancies.detected_value IS 'JSONB object containing the conflicting values that triggered the discrepancy';
COMMENT ON COLUMN public.insurance_timeline_discrepancies.source_events IS 'Array of event IDs that conflict with each other';

-- ============================================================================
-- PART 4 — Update create_timeline_event Function to Support New Fields
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_timeline_event(
  p_event_type text,
  p_event_payload jsonb DEFAULT '{}'::jsonb,
  p_event_date date DEFAULT NULL,
  p_event_time timestamptz DEFAULT NULL,
  p_lead_id uuid DEFAULT NULL,
  p_thread_id uuid DEFAULT NULL,
  p_contact_id uuid DEFAULT NULL,
  p_email_id uuid DEFAULT NULL,
  p_detected_from text DEFAULT 'api',
  p_source_type text DEFAULT NULL,
  p_detection_confidence numeric DEFAULT NULL,
  p_confidence_score numeric DEFAULT NULL,
  p_raw_text text DEFAULT NULL,
  p_structured_data jsonb DEFAULT '{}'::jsonb
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
  v_final_confidence numeric;
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
  
  -- Use confidence_score if provided, otherwise fall back to detection_confidence
  v_final_confidence := COALESCE(p_confidence_score, p_detection_confidence);
  
  -- Insert timeline event
  INSERT INTO public.insurance_timeline_events (
    event_type,
    event_payload,
    event_date,
    event_time,
    lead_id,
    thread_id,
    contact_id,
    email_id,
    detected_from,
    source_type,
    detection_confidence,
    confidence_score,
    raw_text,
    structured_data
  ) VALUES (
    p_event_type,
    p_event_payload,
    COALESCE(p_event_date, p_event_time::date, CURRENT_DATE),
    p_event_time,
    v_resolved_lead_id,
    v_resolved_thread_id,
    v_resolved_contact_id,
    p_email_id,
    p_detected_from,
    p_source_type,
    v_final_confidence,
    v_final_confidence,
    p_raw_text,
    p_structured_data
  )
  RETURNING id INTO v_event_id;
  
  -- Trigger discrepancy detection
  PERFORM public.detect_timeline_discrepancies(v_resolved_thread_id, v_resolved_contact_id, v_resolved_lead_id);
  
  RETURN v_event_id;
END;
$$;

COMMENT ON FUNCTION public.create_timeline_event IS 'Creates a timeline event with automatic resolution of relationships and discrepancy detection (v2 enhanced)';

-- ============================================================================
-- PART 5 — Discrepancy Detection Function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.detect_timeline_discrepancies(
  p_thread_id uuid DEFAULT NULL,
  p_contact_id uuid DEFAULT NULL,
  p_lead_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_events record;
  v_approval_events record;
  v_adjuster_events record;
  v_approval_amounts numeric[];
  v_approval_dates date[];
  v_adjuster_dates date[];
  v_adjuster_names text[];
  v_discrepancy_type text;
  v_severity text;
  v_detected_value jsonb;
  v_source_events uuid[];
BEGIN
  -- Only process if we have a link
  IF p_thread_id IS NULL AND p_contact_id IS NULL AND p_lead_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Check for approval amount mismatches
  SELECT array_agg(DISTINCT (event_payload->>'rcv_total')::numeric), array_agg(id)
  INTO v_approval_amounts, v_source_events
  FROM public.insurance_timeline_events
  WHERE (
    (p_thread_id IS NOT NULL AND thread_id = p_thread_id) OR
    (p_contact_id IS NOT NULL AND contact_id = p_contact_id) OR
    (p_lead_id IS NOT NULL AND lead_id = p_lead_id)
  )
  AND event_type IN ('CLAIM_APPROVED', 'CLAIM_APPROVED_RCV', 'CLAIM_APPROVED_ACV')
  AND event_payload->>'rcv_total' IS NOT NULL
  AND confidence_score >= 0.7;
  
  -- If multiple different approval amounts detected
  IF array_length(v_approval_amounts, 1) > 1 AND array_length(array(SELECT DISTINCT unnest(v_approval_amounts)), 1) > 1 THEN
    v_discrepancy_type := 'APPROVAL_AMOUNT_MISMATCH';
    v_severity := 'high';
    v_detected_value := jsonb_build_object(
      'amounts', v_approval_amounts,
      'count', array_length(v_approval_amounts, 1)
    );
    
    -- Check if discrepancy already exists
    IF NOT EXISTS (
      SELECT 1 FROM public.insurance_timeline_discrepancies
      WHERE (
        (p_thread_id IS NOT NULL AND thread_id = p_thread_id) OR
        (p_contact_id IS NOT NULL AND contact_id = p_contact_id) OR
        (p_lead_id IS NOT NULL AND lead_id = p_lead_id)
      )
      AND discrepancy_type = v_discrepancy_type
      AND is_resolved = false
    ) THEN
      INSERT INTO public.insurance_timeline_discrepancies (
        thread_id, contact_id, lead_id,
        discrepancy_type, detected_value, source_events, severity
      ) VALUES (
        p_thread_id, p_contact_id, p_lead_id,
        v_discrepancy_type, v_detected_value, v_source_events, v_severity
      );
    END IF;
  END IF;
  
  -- Check for adjuster date conflicts
  SELECT array_agg(DISTINCT event_date), array_agg(id)
  INTO v_adjuster_dates, v_source_events
  FROM public.insurance_timeline_events
  WHERE (
    (p_thread_id IS NOT NULL AND thread_id = p_thread_id) OR
    (p_contact_id IS NOT NULL AND contact_id = p_contact_id) OR
    (p_lead_id IS NOT NULL AND lead_id = p_lead_id)
  )
  AND event_type IN ('ADJUSTER_ASSIGNED', 'ADJUSTER_ASSIGNED_DESK', 'ADJUSTER_ASSIGNED_FIELD', 'ADJUSTER_APPOINTMENT', 'ADJUSTER_VISIT')
  AND event_date IS NOT NULL
  AND confidence_score >= 0.7;
  
  -- If multiple different adjuster dates detected
  IF array_length(v_adjuster_dates, 1) > 1 AND array_length(array(SELECT DISTINCT unnest(v_adjuster_dates)), 1) > 1 THEN
    v_discrepancy_type := 'ADJUSTER_DATE_CONFLICT';
    v_severity := 'medium';
    v_detected_value := jsonb_build_object(
      'dates', array(SELECT DISTINCT unnest(v_adjuster_dates)),
      'count', array_length(v_adjuster_dates, 1)
    );
    
    IF NOT EXISTS (
      SELECT 1 FROM public.insurance_timeline_discrepancies
      WHERE (
        (p_thread_id IS NOT NULL AND thread_id = p_thread_id) OR
        (p_contact_id IS NOT NULL AND contact_id = p_contact_id) OR
        (p_lead_id IS NOT NULL AND lead_id = p_lead_id)
      )
      AND discrepancy_type = v_discrepancy_type
      AND is_resolved = false
    ) THEN
      INSERT INTO public.insurance_timeline_discrepancies (
        thread_id, contact_id, lead_id,
        discrepancy_type, detected_value, source_events, severity
      ) VALUES (
        p_thread_id, p_contact_id, p_lead_id,
        v_discrepancy_type, v_detected_value, v_source_events, v_severity
      );
    END IF;
  END IF;
  
  -- Check for approval status mismatch (approved vs denied)
  SELECT COUNT(*) INTO v_discrepancy_type
  FROM public.insurance_timeline_events
  WHERE (
    (p_thread_id IS NOT NULL AND thread_id = p_thread_id) OR
    (p_contact_id IS NOT NULL AND contact_id = p_contact_id) OR
    (p_lead_id IS NOT NULL AND lead_id = p_lead_id)
  )
  AND event_type IN ('CLAIM_APPROVED', 'CLAIM_APPROVED_RCV', 'CLAIM_APPROVED_ACV', 'CLAIM_DENIED')
  AND confidence_score >= 0.7;
  
  -- If both approved and denied events exist
  IF (
    EXISTS (
      SELECT 1 FROM public.insurance_timeline_events
      WHERE (
        (p_thread_id IS NOT NULL AND thread_id = p_thread_id) OR
        (p_contact_id IS NOT NULL AND contact_id = p_contact_id) OR
        (p_lead_id IS NOT NULL AND lead_id = p_lead_id)
      )
      AND event_type IN ('CLAIM_APPROVED', 'CLAIM_APPROVED_RCV', 'CLAIM_APPROVED_ACV')
      AND confidence_score >= 0.7
    )
    AND EXISTS (
      SELECT 1 FROM public.insurance_timeline_events
      WHERE (
        (p_thread_id IS NOT NULL AND thread_id = p_thread_id) OR
        (p_contact_id IS NOT NULL AND contact_id = p_contact_id) OR
        (p_lead_id IS NOT NULL AND lead_id = p_lead_id)
      )
      AND event_type = 'CLAIM_DENIED'
      AND confidence_score >= 0.7
    )
  ) THEN
    v_discrepancy_type := 'APPROVAL_STATUS_MISMATCH';
    v_severity := 'critical';
    v_detected_value := jsonb_build_object(
      'has_approved', true,
      'has_denied', true
    );
    
    SELECT array_agg(id) INTO v_source_events
    FROM public.insurance_timeline_events
    WHERE (
      (p_thread_id IS NOT NULL AND thread_id = p_thread_id) OR
      (p_contact_id IS NOT NULL AND contact_id = p_contact_id) OR
      (p_lead_id IS NOT NULL AND lead_id = p_lead_id)
    )
    AND event_type IN ('CLAIM_APPROVED', 'CLAIM_APPROVED_RCV', 'CLAIM_APPROVED_ACV', 'CLAIM_DENIED')
    AND confidence_score >= 0.7;
    
    IF NOT EXISTS (
      SELECT 1 FROM public.insurance_timeline_discrepancies
      WHERE (
        (p_thread_id IS NOT NULL AND thread_id = p_thread_id) OR
        (p_contact_id IS NOT NULL AND contact_id = p_contact_id) OR
        (p_lead_id IS NOT NULL AND lead_id = p_lead_id)
      )
      AND discrepancy_type = v_discrepancy_type
      AND is_resolved = false
    ) THEN
      INSERT INTO public.insurance_timeline_discrepancies (
        thread_id, contact_id, lead_id,
        discrepancy_type, detected_value, source_events, severity
      ) VALUES (
        p_thread_id, p_contact_id, p_lead_id,
        v_discrepancy_type, v_detected_value, v_source_events, v_severity
      );
    END IF;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.detect_timeline_discrepancies IS 'Automatically detects inconsistencies in claim timeline data (approval amounts, dates, statuses)';

-- ============================================================================
-- PART 6 — Trigger to Update Updated_At for Discrepancies
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_discrepancy_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_discrepancy_timestamp ON public.insurance_timeline_discrepancies;
CREATE TRIGGER trg_update_discrepancy_timestamp
  BEFORE UPDATE ON public.insurance_timeline_discrepancies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_discrepancy_timestamp();

-- ============================================================================
-- PART 7 — Enhanced Timeline Query Function with Discrepancies
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_claim_journey_timeline_v2(
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
  v_discrepancies jsonb;
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
  
  -- Get all timeline events with enhanced fields
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', id,
      'event_type', event_type,
      'event_date', event_date,
      'event_time', event_time,
      'event_payload', event_payload,
      'structured_data', structured_data,
      'detected_from', detected_from,
      'source_type', source_type,
      'detection_confidence', detection_confidence,
      'confidence_score', confidence_score,
      'raw_text', raw_text,
      'created_at', created_at
    ) ORDER BY COALESCE(event_time, event_date::timestamptz, created_at) ASC
  ), '[]'::jsonb)
  INTO v_timeline
  FROM public.insurance_timeline_events
  WHERE (
    (p_thread_id IS NOT NULL AND thread_id = p_thread_id) OR
    (p_lead_id IS NOT NULL AND lead_id = p_lead_id) OR
    (p_contact_id IS NOT NULL AND contact_id = p_contact_id)
  );
  
  -- Get unresolved discrepancies
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', id,
      'discrepancy_type', discrepancy_type,
      'severity', severity,
      'detected_value', detected_value,
      'source_events', source_events,
      'detected_at', detected_at
    ) ORDER BY 
      CASE severity
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        WHEN 'low' THEN 4
      END,
      detected_at DESC
  ), '[]'::jsonb)
  INTO v_discrepancies
  FROM public.insurance_timeline_discrepancies
  WHERE (
    (p_thread_id IS NOT NULL AND thread_id = p_thread_id) OR
    (p_lead_id IS NOT NULL AND lead_id = p_lead_id) OR
    (p_contact_id IS NOT NULL AND contact_id = p_contact_id)
  )
  AND is_resolved = false;
  
  -- Build complete timeline response with discrepancies
  RETURN jsonb_build_object(
    'thread_id', p_thread_id,
    'lead_id', p_lead_id,
    'contact_id', p_contact_id,
    'timeline_events', v_timeline,
    'discrepancies', v_discrepancies,
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

COMMENT ON FUNCTION public.get_claim_journey_timeline_v2 IS 'Returns complete claim journey timeline v2 with events, confidence scores, and discrepancies';

-- ============================================================================
-- PART 8 — RLS Policies for Discrepancies
-- ============================================================================

ALTER TABLE public.insurance_timeline_discrepancies ENABLE ROW LEVEL SECURITY;

-- Users can view discrepancies for threads in their campaigns
CREATE POLICY "Users can view discrepancies in their campaigns"
  ON public.insurance_timeline_discrepancies FOR SELECT
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

-- Users can update discrepancies (to mark as resolved)
CREATE POLICY "Users can update discrepancies in their campaigns"
  ON public.insurance_timeline_discrepancies FOR UPDATE
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
CREATE POLICY "Service role full access discrepancies"
  ON public.insurance_timeline_discrepancies
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- PART 9 — Summary Comments
-- ============================================================================

COMMENT ON TABLE public.insurance_timeline_events IS 
'Block 21050 — Insurance Timeline Engine v2
Complete claim reconstruction engine that reads months of emails, PDFs, adjuster comments, and homeowner forwards to build an accurate timeline automatically.
This is INSANE value for roofing companies - turns SmartSend into something NO competitor can copy easily.';

COMMENT ON TABLE public.insurance_timeline_discrepancies IS 
'Block 21050 — Discrepancy Detection
Flags inconsistencies in claim data (e.g., adjuster says approved but PDF shows different amount).
Gives contractors more negotiating power by identifying data conflicts.';

