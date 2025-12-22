-- =========================================================
-- Block 20990 — SmartSend Reply Classification Engine v2
-- (Deep Intent Detection • Insurance Awareness • Adjuster Language Parsing • Lead Heat Upgrade • Action Routing)
-- =========================================================
--
-- This block is MASSIVE.
-- This is where SmartSend becomes scary smart and leaves every cold email tool and roofing CRM in the dust.
--
-- Reply Classification Engine v2 turns homeowner + adjuster replies into:
-- - Actions
-- - Signals
-- - Triggers
-- - Lead scoring
-- - Stage updates
-- - AI-driven insights
--
-- No manual reading needed.
-- SmartSend reads every message and instantly knows what to do.
--
-- This is ONE OF THE MOST IMPORTANT BRAINS IN SMARTSEND.
-- =========================================================

-- ============================================================================
-- PART 1 — Create Reply Classifications Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.reply_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Links to message and lead
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  message_id uuid, -- References messages table (flexible - may be in different schemas)
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  
  -- Primary classification
  classification text NOT NULL CHECK (classification IN (
    -- Homeowner Intent Categories (14 classes)
    'interested_wants_inspection',
    'interested_wants_estimate',
    'interested_ready_to_book',
    'interested_wants_to_move_forward',
    'insurance_claim_filed',
    'insurance_adjuster_scheduled',
    'insurance_needs_help_filing_claim',
    'insurance_claim_approved',
    'insurance_approval_attached',
    'insurance_asking_questions',
    'price_concern_objection',
    'not_interested_already_hired',
    'not_interested_no_damage',
    'not_interested_remove_me',
    
    -- Adjuster Intent Categories
    'adjuster_scheduled_appointment',
    'adjuster_requesting_photos',
    'adjuster_requesting_estimate',
    'adjuster_denied_supplement',
    'adjuster_pending_review',
    'adjuster_approved_supplement',
    'adjuster_asking_homeowner_info',
    'adjuster_sending_scope',
    'adjuster_adjusting_pricing',
    'adjuster_approved_claim',
    
    -- Fallback categories
    'neutral',
    'ambiguous',
    'unsubscribe',
    'ooo',
    'spam_complaint'
  )),
  
  -- Confidence score (0-1)
  confidence_score numeric(3,2) NOT NULL DEFAULT 0.5 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  
  -- Extracted data (JSONB) - Secondary signals
  extracted_data jsonb DEFAULT '{}'::jsonb,
  -- Structure:
  -- {
  --   "adjuster_name": "John Smith",
  --   "carrier": "State Farm",
  --   "claim_number": "123456789",
  --   "adjuster_appointment_date": "2025-02-15T10:00:00Z",
  --   "storm_damage_date": "2025-01-20",
  --   "insurance_questions": ["What is my deductible?", "When will I get paid?"],
  --   "deductible_info": {"amount": 1500, "type": "fixed"},
  --   "acv_rcv_language": {"rcv": 22800, "acv": 18000, "depreciation": 4800},
  --   "approval_wording": "Your claim has been approved",
  --   "ready_to_book_phrases": ["let's get started", "when can we schedule"],
  --   "roof_type": "asphalt shingle",
  --   "location": "main roof",
  --   "missing_photos": true,
  --   "missing_documentation": ["scope", "estimate"],
  --   "scope_pdf_detected": true,
  --   "approval_pdf_detected": true,
  --   "market_pricing_language": "pricing seems high",
  --   "approval_denial_terms": "approved"
  -- }
  
  -- Triggered actions (JSONB) - What SmartSend did based on this classification
  triggered_actions jsonb DEFAULT '{}'::jsonb,
  -- Structure:
  -- {
  --   "stage_updated": "INSTALL_READY",
  --   "heat_score_adjusted": 30,
  --   "notifications_sent": ["owner", "team"],
  --   "calendar_events_created": [{"id": "...", "title": "Call homeowner", "date": "..."}],
  --   "activity_feed_events_created": [{"id": "...", "type": "..."}],
  --   "proposal_suggested": true,
  --   "sequence_stopped": false,
  --   "suppressed_email": false
  -- }
  
  -- Insurance context used for classification
  insurance_context jsonb DEFAULT '{}'::jsonb,
  -- Structure:
  -- {
  --   "carrier": "State Farm",
  --   "claim_status": "pending",
  --   "estimated_rcv": 22800,
  --   "deductible": 1500,
  --   "supplements_detected": ["steep", "drip edge"]
  -- }
  
  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_reply_classifications_lead ON public.reply_classifications(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reply_classifications_message ON public.reply_classifications(message_id) WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reply_classifications_thread ON public.reply_classifications(thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reply_classifications_classification ON public.reply_classifications(classification);
CREATE INDEX IF NOT EXISTS idx_reply_classifications_confidence ON public.reply_classifications(confidence_score DESC);
CREATE INDEX IF NOT EXISTS idx_reply_classifications_created ON public.reply_classifications(created_at DESC);

-- Composite index for lead + classification queries
CREATE INDEX IF NOT EXISTS idx_reply_classifications_lead_class ON public.reply_classifications(lead_id, classification) WHERE lead_id IS NOT NULL;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_reply_classifications_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reply_classifications_updated_at ON public.reply_classifications;
CREATE TRIGGER trg_reply_classifications_updated_at
  BEFORE UPDATE ON public.reply_classifications
  FOR EACH ROW
  EXECUTE FUNCTION public.set_reply_classifications_updated_at();

-- ============================================================================
-- PART 2 — Classification Action Trigger Functions
-- ============================================================================

-- Function to update lead heat score based on classification
CREATE OR REPLACE FUNCTION public.update_lead_heat_from_classification(
  p_lead_id uuid,
  p_classification text,
  p_confidence numeric DEFAULT 1.0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_score_delta integer := 0;
  v_current_score integer;
  v_new_score integer;
  v_workspace_id uuid;
BEGIN
  -- Get current score and workspace
  SELECT score, workspace_id INTO v_current_score, v_workspace_id
  FROM public.leads
  WHERE id = p_lead_id;
  
  IF v_workspace_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Calculate score delta based on classification
  -- Weighted by confidence (if confidence is 0.8, apply 80% of the points)
  CASE p_classification
    WHEN 'interested_ready_to_book', 'interested_wants_to_move_forward' THEN
      v_score_delta := ROUND(30 * p_confidence);
    WHEN 'interested_wants_estimate' THEN
      v_score_delta := ROUND(10 * p_confidence);
    WHEN 'insurance_approval_attached', 'insurance_claim_approved' THEN
      v_score_delta := ROUND(20 * p_confidence);
    WHEN 'insurance_adjuster_scheduled' THEN
      v_score_delta := ROUND(15 * p_confidence);
    WHEN 'insurance_asking_questions', 'interested_wants_inspection' THEN
      v_score_delta := ROUND(5 * p_confidence);
    WHEN 'price_concern_objection' THEN
      v_score_delta := ROUND(-10 * p_confidence);
    WHEN 'not_interested_already_hired', 'not_interested_no_damage' THEN
      v_score_delta := ROUND(-50 * p_confidence);
    WHEN 'not_interested_remove_me' THEN
      v_score_delta := ROUND(-100 * p_confidence);
    ELSE
      v_score_delta := 0;
  END CASE;
  
  -- Update lead score
  v_new_score := GREATEST(0, LEAST(100, COALESCE(v_current_score, 0) + v_score_delta));
  
  UPDATE public.leads
  SET score = v_new_score,
      updated_at = now()
  WHERE id = p_lead_id;
  
  -- Also update lead_heat_scores if table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'lead_heat_scores') THEN
    INSERT INTO public.lead_heat_scores (
      contact_id,
      workspace_id,
      heat_score,
      heat_level,
      last_calculated_at
    )
    VALUES (
      p_lead_id,
      v_workspace_id,
      v_new_score,
      CASE
        WHEN v_new_score >= 70 THEN 'hot'
        WHEN v_new_score >= 40 THEN 'warm'
        ELSE 'cold'
      END,
      now()
    )
    ON CONFLICT (contact_id) DO UPDATE
    SET heat_score = v_new_score,
        heat_level = CASE
          WHEN v_new_score >= 70 THEN 'hot'
          WHEN v_new_score >= 40 THEN 'warm'
          ELSE 'cold'
        END,
        last_calculated_at = now(),
        updated_at = now();
  END IF;
END;
$$;

-- Function to update pipeline stage based on classification
CREATE OR REPLACE FUNCTION public.update_pipeline_stage_from_classification(
  p_thread_id uuid,
  p_classification text,
  p_extracted_data jsonb DEFAULT '{}'::jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_stage text;
  v_job_id uuid;
  v_status_reason text;
BEGIN
  -- Map classification to pipeline stage
  CASE p_classification
    WHEN 'insurance_adjuster_scheduled' THEN
      v_new_stage := 'ADJUSTER_SCHEDULED';
      v_status_reason := 'Adjuster appointment scheduled';
    WHEN 'insurance_claim_filed' THEN
      v_new_stage := 'CLAIM_FILED';
      v_status_reason := 'Claim filed';
    WHEN 'insurance_claim_approved', 'insurance_approval_attached' THEN
      v_new_stage := 'CLAIM_APPROVED';
      v_status_reason := 'Claim approved';
    WHEN 'interested_ready_to_book', 'interested_wants_to_move_forward' THEN
      v_new_stage := 'INSTALL_READY';
      v_status_reason := 'Homeowner ready to move forward';
    WHEN 'interested_wants_estimate' THEN
      v_new_stage := 'NEW_LEAD';
      v_status_reason := 'Estimate requested';
    WHEN 'not_interested_already_hired' THEN
      v_new_stage := 'LOST';
      v_status_reason := 'Already hired someone else';
    WHEN 'not_interested_no_damage', 'not_interested_remove_me' THEN
      v_new_stage := 'NOT_A_FIT';
      v_status_reason := 'Not interested';
    ELSE
      -- No stage change needed
      RETURN NULL;
  END CASE;
  
  -- Update inbox_threads insurance_claim_status if applicable
  IF p_classification LIKE 'insurance_%' THEN
    UPDATE public.inbox_threads
    SET insurance_claim_status = CASE
      WHEN p_classification = 'insurance_claim_filed' THEN 'claim_filed_awaiting_adjuster'
      WHEN p_classification = 'insurance_adjuster_scheduled' THEN 'adjuster_visit_scheduled'
      WHEN p_classification = 'insurance_claim_approved' OR p_classification = 'insurance_approval_attached' THEN 'approved'
      ELSE insurance_claim_status
    END,
    updated_at = now()
    WHERE id = p_thread_id;
  END IF;
  
  -- Update roofing_jobs stage if job exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'roofing_jobs') THEN
    SELECT id INTO v_job_id
    FROM public.roofing_jobs
    WHERE thread_id = p_thread_id
    LIMIT 1;
    
    IF v_job_id IS NOT NULL THEN
      -- Use existing update function if available
      IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'update_roofing_job_stage'
      ) THEN
        PERFORM public.update_roofing_job_stage(
          p_job_id := v_job_id,
          p_new_stage := v_new_stage::roofing_job_stage,
          p_status_reason := v_status_reason,
          p_create_timeline_event := true
        );
      ELSE
        -- Fallback: direct update
        UPDATE public.roofing_jobs
        SET current_stage = v_new_stage::roofing_job_stage,
            status_reason = v_status_reason,
            stage_changed_at = now(),
            updated_at = now()
        WHERE id = v_job_id;
      END IF;
    END IF;
  END IF;
  
  RETURN v_new_stage;
END;
$$;

-- Function to create activity feed event from classification
CREATE OR REPLACE FUNCTION public.create_activity_feed_from_classification(
  p_classification_id uuid,
  p_classification text,
  p_lead_id uuid,
  p_thread_id uuid,
  p_extracted_data jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_id uuid;
  v_event_type text;
  v_event_text text;
  v_event_icon text;
  v_action_suggestion text;
  v_workspace_id uuid;
  v_campaign_id uuid;
BEGIN
  -- Get workspace and campaign from thread
  SELECT campaign_id INTO v_campaign_id
  FROM public.inbox_threads
  WHERE id = p_thread_id;
  
  IF p_lead_id IS NOT NULL THEN
    SELECT workspace_id INTO v_workspace_id
    FROM public.leads
    WHERE id = p_lead_id;
  END IF;
  
  -- Map classification to activity feed event
  CASE p_classification
    WHEN 'interested_ready_to_book', 'interested_wants_to_move_forward' THEN
      v_event_type := 'homeowner_replied';
      v_event_text := '🔥 Homeowner is ready to move forward';
      v_event_icon := '🔥';
      v_action_suggestion := 'CALL NOW';
    WHEN 'insurance_approval_attached', 'insurance_claim_approved' THEN
      v_event_type := 'claim_approved';
      v_event_text := format('📄 Approval letter parsed — RCV $%s', 
        COALESCE((p_extracted_data->>'rcv')::text, 'N/A'));
      v_event_icon := '📄';
      v_action_suggestion := 'Review approval and schedule install';
    WHEN 'adjuster_requesting_photos' THEN
      v_event_type := 'need_photos_requested';
      v_event_text := '🧰 Adjuster requested photos';
      v_event_icon := '🧰';
      v_action_suggestion := 'Add to calendar and send photos ASAP';
    WHEN 'price_concern_objection' THEN
      v_event_type := 'homeowner_replied';
      v_event_text := '⚠ Price objection — recommended script ready';
      v_event_icon := '⚠';
      v_action_suggestion := 'Review pricing script';
    WHEN 'insurance_adjuster_scheduled' THEN
      v_event_type := 'adjuster_visit_scheduled';
      v_event_text := format('📅 Adjuster visit scheduled — %s', 
        COALESCE((p_extracted_data->>'adjuster_appointment_date')::text, 'Date TBD'));
      v_event_icon := '📅';
      v_action_suggestion := 'Prepare for adjuster meeting';
    WHEN 'insurance_claim_filed' THEN
      v_event_type := 'claim_filed_detected';
      v_event_text := '📋 Claim filed detected';
      v_event_icon := '📋';
      v_action_suggestion := 'Track claim progress';
    WHEN 'not_interested_remove_me' THEN
      v_event_type := 'homeowner_replied';
      v_event_text := '🚫 Homeowner requested removal';
      v_event_icon := '🚫';
      v_action_suggestion := 'Stop sequence and suppress email';
    ELSE
      v_event_type := 'homeowner_replied';
      v_event_text := format('💬 Reply classified: %s', p_classification);
      v_event_icon := '💬';
      v_action_suggestion := NULL;
  END CASE;
  
  -- Create activity feed event (use existing table if available)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'activity_feed_events') THEN
    INSERT INTO public.activity_feed_events (
      lead_id,
      thread_id,
      campaign_id,
      event_type,
      event_text,
      event_icon,
      action_suggestion,
      metadata
    )
    VALUES (
      p_lead_id,
      p_thread_id,
      v_campaign_id,
      v_event_type,
      v_event_text,
      v_event_icon,
      v_action_suggestion,
      jsonb_build_object(
        'classification', p_classification,
        'classification_id', p_classification_id,
        'extracted_data', p_extracted_data
      )
    )
    RETURNING id INTO v_event_id;
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'activity_events') THEN
    -- Fallback to activity_events table
    INSERT INTO public.activity_events (
      org_id,
      type,
      title,
      description,
      contact_id,
      campaign_id,
      reply_thread_id,
      metadata
    )
    VALUES (
      v_workspace_id,
      v_event_type,
      v_event_text,
      v_action_suggestion,
      p_lead_id,
      v_campaign_id,
      p_thread_id,
      jsonb_build_object(
        'classification', p_classification,
        'classification_id', p_classification_id,
        'extracted_data', p_extracted_data,
        'icon', v_event_icon
      )
    )
    RETURNING id INTO v_event_id;
  END IF;
  
  RETURN v_event_id;
END;
$$;

-- ============================================================================
-- PART 3 — Main Classification Processing Function
-- ============================================================================

-- This function processes a classification and triggers all actions
CREATE OR REPLACE FUNCTION public.process_reply_classification_v2(
  p_message_id uuid,
  p_thread_id uuid,
  p_lead_id uuid,
  p_classification text,
  p_confidence_score numeric,
  p_extracted_data jsonb DEFAULT '{}'::jsonb,
  p_insurance_context jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_classification_id uuid;
  v_triggered_actions jsonb := '{}'::jsonb;
  v_stage_updated text;
  v_activity_event_id uuid;
BEGIN
  -- Insert classification record
  INSERT INTO public.reply_classifications (
    lead_id,
    message_id,
    thread_id,
    classification,
    confidence_score,
    extracted_data,
    insurance_context
  )
  VALUES (
    p_lead_id,
    p_message_id,
    p_thread_id,
    p_classification,
    p_confidence_score,
    p_extracted_data,
    p_insurance_context
  )
  RETURNING id INTO v_classification_id;
  
  -- 1. Update lead heat score
  PERFORM public.update_lead_heat_from_classification(
    p_lead_id := p_lead_id,
    p_classification := p_classification,
    p_confidence := p_confidence_score
  );
  
  v_triggered_actions := jsonb_set(
    v_triggered_actions,
    '{heat_score_adjusted}',
    to_jsonb(true)
  );
  
  -- 2. Update pipeline stage
  v_stage_updated := public.update_pipeline_stage_from_classification(
    p_thread_id := p_thread_id,
    p_classification := p_classification,
    p_extracted_data := p_extracted_data
  );
  
  IF v_stage_updated IS NOT NULL THEN
    v_triggered_actions := jsonb_set(
      v_triggered_actions,
      '{stage_updated}',
      to_jsonb(v_stage_updated)
    );
  END IF;
  
  -- 3. Create activity feed event
  v_activity_event_id := public.create_activity_feed_from_classification(
    p_classification_id := v_classification_id,
    p_classification := p_classification,
    p_lead_id := p_lead_id,
    p_thread_id := p_thread_id,
    p_extracted_data := p_extracted_data
  );
  
  IF v_activity_event_id IS NOT NULL THEN
    v_triggered_actions := jsonb_set(
      v_triggered_actions,
      '{activity_feed_events_created}',
      jsonb_build_array(jsonb_build_object('id', v_activity_event_id))
    );
  END IF;
  
  -- 4. Handle special actions based on classification
  CASE p_classification
    WHEN 'interested_ready_to_book', 'interested_wants_to_move_forward' THEN
      -- Suggest proposal if not sent
      v_triggered_actions := jsonb_set(
        v_triggered_actions,
        '{proposal_suggested}',
        to_jsonb(true)
      );
      
      -- Mark as HOT
      IF p_lead_id IS NOT NULL THEN
        UPDATE public.leads
        SET classification = 'hot',
            updated_at = now()
        WHERE id = p_lead_id;
      END IF;
      
    WHEN 'not_interested_remove_me' THEN
      -- Stop sequence and suppress email
      v_triggered_actions := jsonb_set(
        v_triggered_actions,
        '{sequence_stopped}',
        to_jsonb(true)
      );
      
      v_triggered_actions := jsonb_set(
        v_triggered_actions,
        '{suppressed_email}',
        to_jsonb(true)
      );
      
      -- Suppress email address
      IF p_lead_id IS NOT NULL THEN
        INSERT INTO public.suppressions_email (email, reason)
        SELECT email, 'not_interested_remove_me'
        FROM public.leads
        WHERE id = p_lead_id
        ON CONFLICT (email) DO NOTHING;
      END IF;
      
    WHEN 'adjuster_requesting_photos' THEN
      -- Suggest calendar event
      v_triggered_actions := jsonb_set(
        v_triggered_actions,
        '{calendar_event_suggested}',
        jsonb_build_object(
          'title', 'Send photos to adjuster',
          'priority', 'high',
          'action', 'create_calendar_event'
        )
      );
  END CASE;
  
  -- Update classification with triggered actions
  UPDATE public.reply_classifications
  SET triggered_actions = v_triggered_actions
  WHERE id = v_classification_id;
  
  RETURN v_classification_id;
END;
$$;

-- ============================================================================
-- PART 4 — Auto-Classification Trigger
-- ============================================================================

-- Function to trigger classification for new inbound messages
CREATE OR REPLACE FUNCTION public.trigger_reply_classification_v2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_supabase_url text;
  v_service_role_key text;
BEGIN
  -- Only process inbound messages
  IF NEW.direction = 'inbound' OR NEW.direction = 'in' THEN
    -- Get Supabase URL and service role key from environment
    -- Note: In production, these should be set via Supabase secrets
    v_supabase_url := current_setting('app.supabase_url', true);
    v_service_role_key := current_setting('app.service_role_key', true);
    
    -- If environment variables not available, use pg_notify to trigger edge function
    -- The edge function can be called via webhook or pg_notify listener
    PERFORM pg_notify('reply_classify_v2', json_build_object(
      'message_id', NEW.id,
      'thread_id', NEW.thread_id,
      'lead_id', NEW.lead_id
    )::text);
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the insert
    RAISE WARNING 'Failed to trigger reply classification v2: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Create trigger on messages table (if exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'messages') THEN
    DROP TRIGGER IF EXISTS trg_reply_classification_v2 ON public.messages;
    CREATE TRIGGER trg_reply_classification_v2
      AFTER INSERT ON public.messages
      FOR EACH ROW
      WHEN (NEW.direction = 'inbound' OR NEW.direction = 'in')
      EXECUTE FUNCTION public.trigger_reply_classification_v2();
  END IF;
END $$;

-- Create trigger on inbox_messages table (if exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'inbox_messages') THEN
    DROP TRIGGER IF EXISTS trg_reply_classification_v2_inbox ON public.inbox_messages;
    CREATE TRIGGER trg_reply_classification_v2_inbox
      AFTER INSERT ON public.inbox_messages
      FOR EACH ROW
      WHEN (NEW.direction = 'inbound' OR NEW.direction = 'in')
      EXECUTE FUNCTION public.trigger_reply_classification_v2();
  END IF;
END $$;

-- ============================================================================
-- PART 5 — Comments
-- ============================================================================

COMMENT ON TABLE public.reply_classifications IS 'Reply Classification Engine v2 - Deep intent detection for homeowner and adjuster replies';
COMMENT ON COLUMN public.reply_classifications.classification IS 'Primary classification: 14 homeowner categories + adjuster categories';
COMMENT ON COLUMN public.reply_classifications.extracted_data IS 'Secondary signals extracted: adjuster names, claim numbers, dates, insurance details, etc.';
COMMENT ON COLUMN public.reply_classifications.triggered_actions IS 'Actions triggered by this classification: stage updates, notifications, calendar events, etc.';
COMMENT ON COLUMN public.reply_classifications.insurance_context IS 'Insurance context used for classification: carrier, claim status, RCV, deductible, supplements';

COMMENT ON FUNCTION public.update_lead_heat_from_classification IS 'Updates lead heat score based on classification with weighted confidence';
COMMENT ON FUNCTION public.update_pipeline_stage_from_classification IS 'Updates pipeline stage (roofing_jobs and inbox_threads) based on classification';
COMMENT ON FUNCTION public.create_activity_feed_from_classification IS 'Creates activity feed event with icon, description, and action suggestion';
COMMENT ON FUNCTION public.process_reply_classification_v2 IS 'Main processing function that handles classification and triggers all actions';
COMMENT ON FUNCTION public.trigger_reply_classification_v2 IS 'Trigger function that automatically classifies new inbound messages via pg_notify';

