-- =========================================================
-- Block 21200 — SmartSend Roofing Price Objection Brain v1
-- ("Price Is Too High" • "Other Roofer Cheaper" • Deductible Confusion • ACV/RCV Misunderstandings • Insurance Price Logic)
-- =========================================================
--
-- This is one of the MOST IMPORTANT sales features for roofing companies.
--
-- If a roofer can handle objections confidently → they close MORE jobs.
-- If they freeze, hesitate, or get defensive → they LOSE the job.
--
-- SmartSend Roofing Price Objection Brain v1 solves ALL of these with AI-powered,
-- claim-aware, deductible-aware, proposal-aware rebuttals.
--
-- Features:
-- 1. Core Objection Detection (Homeowner + Adjuster)
-- 2. AI-Powered Response Generation (Short SMS, Medium Email, Long Phone Script)
-- 3. Personalization from Multiple Engines (Attachment Analyzer, Scope Comparison, Insurance Timeline, Proposal Builder, Reply Classification)
-- 4. Dynamic Response Builder with Tone Options
-- 5. Follow-Up Integration
-- =========================================================

-- ============================================================================
-- PART 1 — Create price_objection_responses Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.price_objection_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Objection Detection
  detected_objection_type text NOT NULL CHECK (detected_objection_type IN (
    -- Homeowner Objections
    'price_too_high',
    'other_roofer_cheaper',
    'still_getting_quotes',
    'insurance_didnt_approve_amount',
    'want_to_wait',
    'not_in_rush',
    'need_to_think',
    'check_with_adjuster',
    'cant_afford_deductible',
    'why_pay_deductible',
    -- Adjuster Objections
    'drip_edge_not_required',
    'no_steep_charge_needed',
    'dont_pay_o_and_p',
    'scope_includes_everything',
    'photos_dont_support_supplement',
    -- Generic
    'other'
  )),
  
  detected_objection_text text,
  detection_confidence numeric(3,2) DEFAULT 0.5 CHECK (detection_confidence >= 0 AND detection_confidence <= 1),
  detected_from text, -- 'reply_classification', 'manual', 'ai_detection'
  
  -- Context Data (from various engines)
  context_data jsonb DEFAULT '{}'::jsonb,
  -- Structure:
  -- {
  --   "insurance_rcv": 28500,
  --   "insurance_acv": 25000,
  --   "deductible": 1500,
  --   "proposal_price": 22680,
  --   "underpayment_amount": 4480,
  --   "missing_items": [...],
  --   "underpriced_items": [...],
  --   "o_and_p_missing": true,
  --   "approval_status": "approved",
  --   "supplement_pending": false,
  --   "carrier_name": "State Farm",
  --   "homeowner_name": "Sarah Thompson",
  --   "emotional_tone": "concerned",
  --   "buying_signals": ["price_conscious"],
  --   "urgency": "low"
  -- }
  
  -- Generated Responses
  response_short text, -- SMS-style (1-2 sentences)
  response_medium text, -- Email reply (3-5 sentences)
  response_long text, -- Phone script (full conversation)
  
  -- Response Tone
  response_tone text DEFAULT 'confident' CHECK (response_tone IN (
    'confident',
    'friendly',
    'professional',
    'short_direct',
    'detailed_educational',
    'insurance_heavy',
    'soft_reassurance'
  )),
  
  -- Usage Tracking
  response_used boolean DEFAULT false,
  response_format_used text, -- 'short', 'medium', 'long'
  response_used_at timestamptz,
  
  -- AI Generation Metadata
  generation_metadata jsonb DEFAULT '{}'::jsonb,
  ai_confidence_score numeric(3,2) CHECK (ai_confidence_score >= 0 AND ai_confidence_score <= 1),
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_objection_responses_thread ON public.price_objection_responses(thread_id);
CREATE INDEX IF NOT EXISTS idx_objection_responses_contact ON public.price_objection_responses(contact_id);
CREATE INDEX IF NOT EXISTS idx_objection_responses_lead ON public.price_objection_responses(lead_id);
CREATE INDEX IF NOT EXISTS idx_objection_responses_type ON public.price_objection_responses(detected_objection_type);
CREATE INDEX IF NOT EXISTS idx_objection_responses_used ON public.price_objection_responses(response_used) WHERE response_used = false;
CREATE INDEX IF NOT EXISTS idx_objection_responses_created ON public.price_objection_responses(created_at DESC);

-- ============================================================================
-- PART 2 — Create objection_detection_log Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.objection_detection_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  message_id uuid,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  
  -- Detection Details
  detected_objection_types text[] DEFAULT '{}',
  detection_confidence numeric(3,2) DEFAULT 0.5,
  detection_source text, -- 'reply_classification', 'ai_analysis', 'manual'
  
  -- Message Context
  message_text text,
  message_subject text,
  sender_email text,
  
  -- Response Generated
  response_id uuid REFERENCES public.price_objection_responses(id) ON DELETE SET NULL,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_objection_log_thread ON public.objection_detection_log(thread_id);
CREATE INDEX IF NOT EXISTS idx_objection_log_message ON public.objection_detection_log(message_id);
CREATE INDEX IF NOT EXISTS idx_objection_log_created ON public.objection_detection_log(created_at DESC);

-- ============================================================================
-- PART 3 — Function to Gather Context Data
-- ============================================================================

CREATE OR REPLACE FUNCTION public.gather_objection_context(p_thread_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_context jsonb := '{}'::jsonb;
  v_thread record;
  v_scope_comparison record;
  v_proposal record;
  v_insurance_attachment record;
  v_timeline_events jsonb;
BEGIN
  -- Get thread data
  SELECT 
    t.*,
    c.first_name,
    c.last_name,
    c.email,
    c.phone
  INTO v_thread
  FROM public.inbox_threads t
  LEFT JOIN public.contacts c ON t.contact_id = c.id
  WHERE t.id = p_thread_id;
  
  IF NOT FOUND THEN
    RETURN v_context;
  END IF;
  
  -- Build context object
  v_context := jsonb_build_object(
    'homeowner_name', COALESCE(v_thread.first_name || ' ' || v_thread.last_name, 'Valued Customer'),
    'homeowner_email', v_thread.email,
    'homeowner_phone', v_thread.phone,
    'insurance_carrier', v_thread.insurance_carrier,
    'insurance_rcv', (v_thread.claim_financials->>'rcv_total')::numeric,
    'insurance_acv', (v_thread.claim_financials->>'acv_total')::numeric,
    'deductible', (v_thread.claim_financials->>'deductible')::numeric,
    'depreciation_recoverable', COALESCE((v_thread.claim_financials->>'depreciation_recoverable')::boolean, false)
  );
  
  -- Get scope comparison data (from Block 21080)
  SELECT 
    insurance_rcv,
    smartsend_estimate_total,
    underpayment_amount,
    missing_line_items,
    underpriced_line_items,
    o_and_p_missing_total,
    o_and_p_included,
    o_and_p_should_be_included
  INTO v_scope_comparison
  FROM public.scope_comparisons
  WHERE thread_id = p_thread_id
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF FOUND THEN
    v_context := v_context || jsonb_build_object(
      'underpayment_amount', v_scope_comparison.underpayment_amount,
      'missing_items', v_scope_comparison.missing_line_items,
      'underpriced_items', v_scope_comparison.underpriced_line_items,
      'o_and_p_missing', COALESCE(v_scope_comparison.o_and_p_missing_total, 0) > 0,
      'o_and_p_included', v_scope_comparison.o_and_p_included,
      'o_and_p_should_be_included', v_scope_comparison.o_and_p_should_be_included
    );
  END IF;
  
  -- Get proposal data (from Block 20520)
  SELECT 
    proposal_data->>'project_price' as proposal_price,
    proposal_data->>'homeowner_name' as proposal_homeowner_name,
    status as proposal_status
  INTO v_proposal
  FROM public.proposals
  WHERE thread_id = p_thread_id
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF FOUND THEN
    v_context := v_context || jsonb_build_object(
      'proposal_price', (v_proposal.proposal_price)::numeric,
      'proposal_status', v_proposal.proposal_status
    );
  END IF;
  
  -- Get insurance timeline events (from Block 21050)
  SELECT jsonb_agg(
    jsonb_build_object(
      'event_type', event_type,
      'event_date', event_date,
      'confidence_score', confidence_score
    )
  )
  INTO v_timeline_events
  FROM public.insurance_timeline_events
  WHERE thread_id = p_thread_id
  ORDER BY event_date DESC
  LIMIT 10;
  
  IF v_timeline_events IS NOT NULL THEN
    v_context := v_context || jsonb_build_object(
      'timeline_events', v_timeline_events,
      'approval_status', (
        SELECT event_type 
        FROM public.insurance_timeline_events 
        WHERE thread_id = p_thread_id 
          AND event_type IN ('claim_approved', 'supplement_approved', 'claim_denied')
        ORDER BY event_date DESC 
        LIMIT 1
      ),
      'supplement_pending', EXISTS (
        SELECT 1 
        FROM public.insurance_timeline_events 
        WHERE thread_id = p_thread_id 
          AND event_type = 'supplement_submitted'
          AND event_date > NOW() - INTERVAL '30 days'
      )
    );
  END IF;
  
  -- Get latest reply classification (from Block 20990)
  SELECT 
    classification,
    confidence_score,
    extracted_data,
    insurance_context
  INTO v_context
  FROM public.reply_classifications
  WHERE thread_id = p_thread_id
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF FOUND THEN
    v_context := v_context || jsonb_build_object(
      'latest_classification', v_context->>'classification',
      'classification_confidence', v_context->>'confidence_score',
      'extracted_data', v_context->'extracted_data',
      'insurance_context', v_context->'insurance_context'
    );
  END IF;
  
  RETURN v_context;
END;
$$;

COMMENT ON FUNCTION public.gather_objection_context IS 'Gathers all context data from various engines for objection response generation';

-- ============================================================================
-- PART 4 — Function to Detect Objections from Text
-- ============================================================================

CREATE OR REPLACE FUNCTION public.detect_price_objection(
  p_text text,
  p_subject text DEFAULT NULL,
  p_thread_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  v_objection_types text[] := '{}';
  v_confidence numeric;
  v_detected_type text;
BEGIN
  -- Simple keyword-based detection (can be enhanced with AI)
  -- This is a fallback - the edge function will do AI-based detection
  
  p_text := LOWER(COALESCE(p_text, ''));
  p_subject := LOWER(COALESCE(p_subject, ''));
  
  -- Price too high
  IF p_text ~* '(price|cost|expensive|too high|too much|afford)' THEN
    v_objection_types := array_append(v_objection_types, 'price_too_high');
    v_detected_type := 'price_too_high';
    v_confidence := 0.7;
  END IF;
  
  -- Other roofer cheaper
  IF p_text ~* '(cheaper|lower price|better deal|another.*roofer|competitor)' THEN
    v_objection_types := array_append(v_objection_types, 'other_roofer_cheaper');
    IF v_detected_type IS NULL THEN
      v_detected_type := 'other_roofer_cheaper';
      v_confidence := 0.75;
    END IF;
  END IF;
  
  -- Still getting quotes
  IF p_text ~* '(still.*quote|getting.*quote|comparing|shopping)' THEN
    v_objection_types := array_append(v_objection_types, 'still_getting_quotes');
    IF v_detected_type IS NULL THEN
      v_detected_type := 'still_getting_quotes';
      v_confidence := 0.8;
    END IF;
  END IF;
  
  -- Insurance didn't approve
  IF p_text ~* '(insurance.*approve|didn.*approve|denied|rejected)' THEN
    v_objection_types := array_append(v_objection_types, 'insurance_didnt_approve_amount');
    IF v_detected_type IS NULL THEN
      v_detected_type := 'insurance_didnt_approve_amount';
      v_confidence := 0.85;
    END IF;
  END IF;
  
  -- Want to wait
  IF p_text ~* '(wait|not.*rush|think.*about|need.*time)' THEN
    v_objection_types := array_append(v_objection_types, 'want_to_wait');
    IF v_detected_type IS NULL THEN
      v_detected_type := 'want_to_wait';
      v_confidence := 0.7;
    END IF;
  END IF;
  
  -- Deductible concerns
  IF p_text ~* '(deductible|out.*pocket|pay.*deductible|afford.*deductible)' THEN
    v_objection_types := array_append(v_objection_types, 'cant_afford_deductible');
    IF v_detected_type IS NULL THEN
      v_detected_type := 'cant_afford_deductible';
      v_confidence := 0.8;
    END IF;
  END IF;
  
  -- Build result
  v_result := jsonb_build_object(
    'detected_objection_types', v_objection_types,
    'primary_objection_type', COALESCE(v_detected_type, 'other'),
    'confidence', COALESCE(v_confidence, 0.5),
    'detection_method', 'keyword_based'
  );
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.detect_price_objection IS 'Detects price objections from text using keyword matching (fallback - AI detection in edge function)';

-- ============================================================================
-- PART 5 — Function to Store Objection Response
-- ============================================================================

CREATE OR REPLACE FUNCTION public.store_objection_response(
  p_thread_id uuid,
  p_objection_type text,
  p_objection_text text DEFAULT NULL,
  p_context_data jsonb DEFAULT '{}'::jsonb,
  p_response_short text DEFAULT NULL,
  p_response_medium text DEFAULT NULL,
  p_response_long text DEFAULT NULL,
  p_response_tone text DEFAULT 'confident',
  p_detection_confidence numeric DEFAULT 0.5,
  p_ai_confidence_score numeric DEFAULT NULL,
  p_detected_from text DEFAULT 'ai_detection'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_response_id uuid;
  v_thread record;
BEGIN
  -- Get thread info
  SELECT contact_id, lead_id, workspace_id
  INTO v_thread
  FROM public.inbox_threads
  WHERE id = p_thread_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Thread not found: %', p_thread_id;
  END IF;
  
  -- Insert response
  INSERT INTO public.price_objection_responses (
    thread_id,
    contact_id,
    lead_id,
    workspace_id,
    detected_objection_type,
    detected_objection_text,
    detection_confidence,
    detected_from,
    context_data,
    response_short,
    response_medium,
    response_long,
    response_tone,
    ai_confidence_score,
    generation_metadata
  ) VALUES (
    p_thread_id,
    v_thread.contact_id,
    v_thread.lead_id,
    v_thread.workspace_id,
    p_objection_type,
    p_objection_text,
    p_detection_confidence,
    p_detected_from,
    p_context_data,
    p_response_short,
    p_response_medium,
    p_response_long,
    p_response_tone,
    p_ai_confidence_score,
    jsonb_build_object(
      'generated_at', NOW(),
      'tone', p_response_tone
    )
  )
  RETURNING id INTO v_response_id;
  
  RETURN v_response_id;
END;
$$;

COMMENT ON FUNCTION public.store_objection_response IS 'Stores generated objection response with all context';

-- ============================================================================
-- PART 6 — Trigger to Update updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION public.tg_update_objection_response_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_objection_response_updated_at ON public.price_objection_responses;
CREATE TRIGGER trg_update_objection_response_updated_at
  BEFORE UPDATE ON public.price_objection_responses
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_update_objection_response_updated_at();

-- ============================================================================
-- PART 7 — RLS Policies
-- ============================================================================

ALTER TABLE public.price_objection_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.objection_detection_log ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read objection responses for their workspace threads
CREATE POLICY "Users can read objection responses for their workspace"
  ON public.price_objection_responses
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Service role can do everything
CREATE POLICY "Service role can manage objection responses"
  ON public.price_objection_responses
  FOR ALL
  USING (auth.role() = 'service_role');

-- Policy: Users can read objection detection log for their workspace
CREATE POLICY "Users can read objection detection log"
  ON public.objection_detection_log
  FOR SELECT
  USING (
    thread_id IN (
      SELECT id FROM public.inbox_threads
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
    )
  );

-- Policy: Service role can manage objection detection log
CREATE POLICY "Service role can manage objection detection log"
  ON public.objection_detection_log
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- PART 8 — Comments
-- ============================================================================

COMMENT ON TABLE public.price_objection_responses IS 'Stores AI-generated objection responses with short/medium/long formats';
COMMENT ON TABLE public.objection_detection_log IS 'Logs all objection detections from messages';
COMMENT ON COLUMN public.price_objection_responses.detected_objection_type IS 'Type of objection detected (price_too_high, other_roofer_cheaper, etc.)';
COMMENT ON COLUMN public.price_objection_responses.context_data IS 'Context data gathered from Attachment Analyzer, Scope Comparison, Insurance Timeline, Proposal Builder, and Reply Classification engines';
COMMENT ON COLUMN public.price_objection_responses.response_short IS 'SMS-style response (1-2 sentences)';
COMMENT ON COLUMN public.price_objection_responses.response_medium IS 'Email reply response (3-5 sentences)';
COMMENT ON COLUMN public.price_objection_responses.response_long IS 'Phone script response (full conversation)';

-- ============================================================================
-- PART 9 — Integration with Reply Classification Engine v2
-- ============================================================================
-- Auto-trigger objection response generation when price_concern_objection is detected

CREATE OR REPLACE FUNCTION public.trigger_objection_response_on_classification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_edge_url text;
BEGIN
  -- Only trigger if classification is price_concern_objection
  IF NEW.classification = 'price_concern_objection' 
     AND NEW.thread_id IS NOT NULL 
     AND (OLD.classification IS NULL OR OLD.classification != 'price_concern_objection') THEN
    
    -- Get edge function base URL
    v_edge_url := COALESCE(
      current_setting('app.settings.edge_base_url', true),
      current_setting('app.supabase_url', true),
      'https://' || current_setting('app.project_ref', true) || '.supabase.co'
    ) || '/functions/v1/price-objection-brain-v1';
    
    -- Call edge function (fire and forget)
    IF v_edge_url IS NOT NULL AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
      PERFORM net.http_post(
        url := v_edge_url,
        body := json_build_object(
          'thread_id', NEW.thread_id::text,
          'objection_type', 'price_too_high',
          'objection_text', COALESCE(NEW.extracted_data->>'objection_text', ''),
          'message_text', COALESCE(NEW.extracted_data->>'message_text', ''),
          'message_subject', COALESCE(NEW.extracted_data->>'message_subject', ''),
          'tone', 'confident',
          'regenerate', false
        )::text,
        headers := json_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || COALESCE(
            current_setting('app.supabase_service_role_key', true),
            current_setting('app.service_role_key', true)
          )
        )::text
      );
    END IF;
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the update
    RAISE WARNING 'Failed to trigger objection response: %', SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_objection_response_on_classification ON public.reply_classifications;
CREATE TRIGGER trg_objection_response_on_classification
  AFTER INSERT OR UPDATE ON public.reply_classifications
  FOR EACH ROW
  WHEN (NEW.classification = 'price_concern_objection')
  EXECUTE FUNCTION public.trigger_objection_response_on_classification();

COMMENT ON FUNCTION public.trigger_objection_response_on_classification IS 'Auto-triggers objection response generation when price_concern_objection is detected in reply classification';
COMMENT ON TRIGGER trg_objection_response_on_classification ON public.reply_classifications IS 'Auto-triggers Block 21200 objection response generation';

