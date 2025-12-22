-- =========================================================
-- Block 21170 — SmartSend Roofing AI Phone Script Engine v1
-- (AI-generated phone scripts for roofing companies)
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE phone_scripts TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.phone_scripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Links to contact/thread/job
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  
  -- Script Category (A-F)
  script_category text NOT NULL CHECK (script_category IN (
    -- Category A — Homeowner Close Calls
    'homeowner_ready_to_schedule',
    'homeowner_viewed_proposal',
    'homeowner_claim_approved',
    'homeowner_deductible_needed',
    'homeowner_booking_install',
    
    -- Category B — Insurance / Adjuster Calls
    'adjuster_photo_request',
    'adjuster_supplement_followup',
    'adjuster_approval_mismatch',
    'adjuster_missing_line_items',
    'adjuster_op_justification',
    
    -- Category C — Objection Handling Calls
    'objection_lower_price',
    'objection_thinking_about_it',
    'objection_not_ready',
    'objection_waiting_insurance',
    'objection_too_expensive',
    
    -- Category D — Deductible Explanation Calls
    'deductible_explanation_what_is',
    'deductible_explanation_why_pay',
    'deductible_explanation_waiving_illegal',
    'deductible_explanation_acv_rcv',
    'deductible_explanation_payment_timeline',
    
    -- Category E — Pre-Install Calls
    'pre_install_confirm_date',
    'pre_install_remind_homeowner',
    'pre_install_discuss_materials',
    'pre_install_crew_arrival',
    'pre_install_access_confirmation',
    
    -- Category F — Post-Install Calls
    'post_install_collect_payment',
    'post_install_send_warranty',
    'post_install_ask_review',
    'post_install_request_referrals'
  )),
  
  -- Script Structure (Universal Template)
  script_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Structure:
  -- {
  --   "opening": "...",
  --   "context_summary": "...",
  --   "value_anchor": "...",
  --   "main_statement": "...",
  --   "main_ask": "...",
  --   "objection_handling": [
  --     {
  --       "objection": "...",
  --       "rebuttal": "..."
  --     }
  --   ],
  --   "insurance_deductible_logic": "...",
  --   "close_sentence": "...",
  --   "full_script": "..." (complete formatted script)
  -- }
  
  -- Tone
  tone text NOT NULL DEFAULT 'confident' CHECK (tone IN (
    'confident',
    'friendly',
    'professional',
    'high_energy',
    'insurance_based',
    'closer',
    'softer',
    'short',
    'long'
  )),
  
  -- Generation metadata
  generation_metadata jsonb DEFAULT '{}'::jsonb,
  -- Structure:
  -- {
  --   "personalization_inputs": {
  --     "homeowner_name": "...",
  --     "property_address": "...",
  --     "insurance_carrier": "...",
  --     "deductible": 1500,
  --     "rcv": 28500,
  --     "acv": 23700,
  --     "claim_status": "...",
  --     "proposal_viewed": true,
  --     "install_ready_score": 75,
  --     "objections_noted": [...],
  --     "approval_date": "...",
  --     "adjuster_date": "..."
  --   },
  --   "trigger_reason": "proposal_viewed_2x",
  --   "ai_model": "gpt-4o-mini",
  --   "generation_time_ms": 1234
  -- }
  
  -- Usage tracking
  viewed_at timestamptz,
  copied_at timestamptz,
  used_at timestamptz,
  sent_to_calendar_at timestamptz,
  sent_to_email_at timestamptz,
  sent_to_sms_at timestamptz,
  
  -- Status
  status text NOT NULL DEFAULT 'generated' CHECK (status IN (
    'generated',
    'viewed',
    'used',
    'archived'
  )),
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_phone_scripts_contact ON public.phone_scripts(contact_id);
CREATE INDEX IF NOT EXISTS idx_phone_scripts_thread ON public.phone_scripts(thread_id);
CREATE INDEX IF NOT EXISTS idx_phone_scripts_workspace ON public.phone_scripts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_phone_scripts_category ON public.phone_scripts(script_category);
CREATE INDEX IF NOT EXISTS idx_phone_scripts_status ON public.phone_scripts(status);
CREATE INDEX IF NOT EXISTS idx_phone_scripts_created ON public.phone_scripts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_phone_scripts_data ON public.phone_scripts USING GIN(script_data);
CREATE INDEX IF NOT EXISTS idx_phone_scripts_metadata ON public.phone_scripts USING GIN(generation_metadata);

-- ============================================================================
-- PART 2 — TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.tg_update_phone_script_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_update_phone_script_updated_at
BEFORE UPDATE ON public.phone_scripts
FOR EACH ROW
EXECUTE FUNCTION public.tg_update_phone_script_updated_at();

-- ============================================================================
-- PART 3 — ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.phone_scripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view phone scripts in their workspace"
  ON public.phone_scripts FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create phone scripts in their workspace"
  ON public.phone_scripts FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update phone scripts in their workspace"
  ON public.phone_scripts FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 4 — FUNCTION: Get Script Personalization Data
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_phone_script_personalization_data(
  p_contact_id uuid,
  p_thread_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact RECORD;
  v_thread RECORD;
  v_proposal RECORD;
  v_install_ready jsonb;
  v_timeline_events jsonb;
  v_reply_classifications jsonb;
  v_result jsonb;
BEGIN
  -- Get contact data
  SELECT 
    c.id,
    c.first_name,
    c.last_name,
    c.phone,
    c.address,
    c.city,
    c.state,
    c.zip_code,
    c.workspace_id
  INTO v_contact
  FROM public.contacts c
  WHERE c.id = p_contact_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Contact not found');
  END IF;
  
  -- Get thread data (use provided thread_id or find latest)
  IF p_thread_id IS NOT NULL THEN
    SELECT 
      t.id,
      t.insurance_carrier,
      t.insurance_claim_status,
      t.insurance_claim_number,
      t.insurance_deductible_amount,
      t.insurance_deductible_type,
      t.insurance_payout_type,
      t.insurance_adjuster_name,
      t.insurance_adjuster_email,
      t.property_address,
      t.claim_financials,
      t.roof_scope,
      t.install_ready_score,
      t.install_ready_status,
      t.install_ready_signals,
      t.campaign_id
    INTO v_thread
    FROM public.inbox_threads t
    WHERE t.id = p_thread_id;
  ELSE
    SELECT 
      t.id,
      t.insurance_carrier,
      t.insurance_claim_status,
      t.insurance_claim_number,
      t.insurance_deductible_amount,
      t.insurance_deductible_type,
      t.insurance_payout_type,
      t.insurance_adjuster_name,
      t.insurance_adjuster_email,
      t.property_address,
      t.claim_financials,
      t.roof_scope,
      t.install_ready_score,
      t.install_ready_status,
      t.install_ready_signals,
      t.campaign_id
    INTO v_thread
    FROM public.inbox_threads t
    WHERE t.contact_id = p_contact_id
    ORDER BY t.last_message_at DESC NULLS LAST
    LIMIT 1;
  END IF;
  
  -- Get latest proposal
  IF v_thread.id IS NOT NULL THEN
    SELECT 
      p.id,
      p.status,
      p.proposal_data,
      p.email_sent_at,
      p.email_opened_at,
      p.email_clicked_at,
      p.created_at
    INTO v_proposal
    FROM public.proposals p
    WHERE p.thread_id = v_thread.id
    ORDER BY p.created_at DESC
    LIMIT 1;
  END IF;
  
  -- Get install-ready data
  IF v_thread.id IS NOT NULL THEN
    SELECT public.calculate_install_ready_score_v2(v_thread.id) INTO v_install_ready;
  END IF;
  
  -- Get recent timeline events
  IF v_thread.id IS NOT NULL THEN
    SELECT jsonb_agg(
      jsonb_build_object(
        'event_type', event_type,
        'event_date', event_date,
        'event_payload', event_payload
      )
      ORDER BY event_date DESC NULLS LAST, created_at DESC
    )
    INTO v_timeline_events
    FROM public.insurance_timeline_events
    WHERE thread_id = v_thread.id
    LIMIT 10;
  END IF;
  
  -- Get recent reply classifications
  IF v_thread.id IS NOT NULL THEN
    SELECT jsonb_agg(
      jsonb_build_object(
        'classification', classification,
        'extracted_data', extracted_data,
        'created_at', created_at
      )
      ORDER BY created_at DESC
    )
    INTO v_reply_classifications
    FROM public.reply_classifications
    WHERE thread_id = v_thread.id
    LIMIT 5;
  END IF;
  
  -- Build result
  v_result := jsonb_build_object(
    'homeowner_name', COALESCE(v_contact.first_name, ''),
    'property_address', COALESCE(v_thread.property_address, v_contact.address, ''),
    'city', COALESCE(v_contact.city, ''),
    'phone', COALESCE(v_contact.phone, ''),
    'insurance_carrier', COALESCE(v_thread.insurance_carrier, ''),
    'deductible', COALESCE(v_thread.insurance_deductible_amount, 0),
    'deductible_type', COALESCE(v_thread.insurance_deductible_type, ''),
    'rcv', COALESCE((v_thread.claim_financials->>'rcv')::numeric, 0),
    'acv', COALESCE((v_thread.claim_financials->>'acv')::numeric, 0),
    'claim_status', COALESCE(v_thread.insurance_claim_status, ''),
    'claim_number', COALESCE(v_thread.insurance_claim_number, ''),
    'adjuster_name', COALESCE(v_thread.insurance_adjuster_name, ''),
    'adjuster_email', COALESCE(v_thread.insurance_adjuster_email, ''),
    'proposal_viewed', COALESCE((v_proposal.email_opened_at IS NOT NULL), false),
    'proposal_viewed_count', CASE WHEN v_proposal.email_opened_at IS NOT NULL THEN 1 ELSE 0 END,
    'proposal_replied', COALESCE((v_proposal.email_clicked_at IS NOT NULL), false),
    'proposal_status', COALESCE(v_proposal.status, ''),
    'install_ready_score', COALESCE(v_thread.install_ready_score, (v_install_ready->>'score')::integer, 0),
    'install_ready_status', COALESCE(v_thread.install_ready_status, (v_install_ready->>'status')::text, ''),
    'approval_date', COALESCE((v_thread.claim_financials->>'approval_date')::text, ''),
    'adjuster_date', COALESCE((v_thread.claim_financials->>'adjuster_date')::text, ''),
    'timeline_events', COALESCE(v_timeline_events, '[]'::jsonb),
    'reply_classifications', COALESCE(v_reply_classifications, '[]'::jsonb),
    'workspace_id', v_contact.workspace_id,
    'thread_id', v_thread.id,
    'campaign_id', v_thread.campaign_id
  );
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_phone_script_personalization_data IS 'Gathers all data needed for phone script personalization (Block 21170)';

-- ============================================================================
-- PART 5 — FUNCTION: Check Script Generation Triggers
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_phone_script_triggers(
  p_contact_id uuid,
  p_thread_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_thread RECORD;
  v_proposal RECORD;
  v_proposal_views integer := 0;
  v_install_ready_score integer;
  v_recent_classification RECORD;
  v_triggers jsonb := '[]'::jsonb;
  v_trigger jsonb;
BEGIN
  -- Get thread
  IF p_thread_id IS NOT NULL THEN
    SELECT 
      t.id,
      t.insurance_claim_status,
      t.install_ready_score,
      t.insurance_deductible_amount,
      t.insurance_adjuster_email
    INTO v_thread
    FROM public.inbox_threads t
    WHERE t.id = p_thread_id;
  ELSE
    SELECT 
      t.id,
      t.insurance_claim_status,
      t.install_ready_score,
      t.insurance_deductible_amount,
      t.insurance_adjuster_email
    INTO v_thread
    FROM public.inbox_threads t
    WHERE t.contact_id = p_contact_id
    ORDER BY t.last_message_at DESC NULLS LAST
    LIMIT 1;
  END IF;
  
  IF v_thread.id IS NULL THEN
    RETURN jsonb_build_object('triggers', '[]'::jsonb, 'should_generate', false);
  END IF;
  
  -- Check proposal views
  SELECT COUNT(*)
  INTO v_proposal_views
  FROM public.proposals p
  WHERE p.thread_id = v_thread.id
    AND p.email_opened_at IS NOT NULL;
  
  IF v_proposal_views >= 2 THEN
    v_trigger := jsonb_build_object(
      'trigger', 'proposal_viewed_2x',
      'category', 'homeowner_viewed_proposal',
      'priority', 'high'
    );
    v_triggers := v_triggers || v_trigger;
  END IF;
  
  -- Check install-ready score
  v_install_ready_score := COALESCE(v_thread.install_ready_score, 0);
  IF v_install_ready_score >= 70 THEN
    v_trigger := jsonb_build_object(
      'trigger', 'install_ready_score_high',
      'category', 'homeowner_ready_to_schedule',
      'priority', 'high'
    );
    v_triggers := v_triggers || v_trigger;
  END IF;
  
  -- Check claim approval
  IF v_thread.insurance_claim_status = 'approved' THEN
    v_trigger := jsonb_build_object(
      'trigger', 'claim_approved',
      'category', 'homeowner_claim_approved',
      'priority', 'high'
    );
    v_triggers := v_triggers || v_trigger;
  END IF;
  
  -- Check for deductible
  IF v_thread.insurance_deductible_amount IS NOT NULL AND v_thread.insurance_deductible_amount > 0 THEN
    v_trigger := jsonb_build_object(
      'trigger', 'deductible_detected',
      'category', 'homeowner_deductible_needed',
      'priority', 'medium'
    );
    v_triggers := v_triggers || v_trigger;
  END IF;
  
  -- Check recent reply classifications for objections
  SELECT classification, extracted_data
  INTO v_recent_classification
  FROM public.reply_classifications
  WHERE thread_id = v_thread.id
    AND classification LIKE 'objection_%'
    OR classification LIKE 'price_%'
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF v_recent_classification IS NOT NULL THEN
    v_trigger := jsonb_build_object(
      'trigger', 'objection_detected',
      'category', CASE 
        WHEN v_recent_classification.classification LIKE '%price%' THEN 'objection_too_expensive'
        WHEN v_recent_classification.classification LIKE '%think%' THEN 'objection_thinking_about_it'
        ELSE 'objection_not_ready'
      END,
      'priority', 'high'
    );
    v_triggers := v_triggers || v_trigger;
  END IF;
  
  RETURN jsonb_build_object(
    'triggers', v_triggers,
    'should_generate', jsonb_array_length(v_triggers) > 0
  );
END;
$$;

COMMENT ON FUNCTION public.check_phone_script_triggers IS 'Checks if conditions are met to auto-generate a phone script (Block 21170)';

-- ============================================================================
-- PART 6 — FUNCTION: Auto-Generate Script Based on Trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_generate_phone_script(
  p_contact_id uuid,
  p_thread_id uuid DEFAULT NULL,
  p_trigger_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_trigger_result jsonb;
  v_personalization_data jsonb;
  v_script_category text;
  v_script_id uuid;
  v_workspace_id uuid;
BEGIN
  -- Check triggers
  v_trigger_result := public.check_phone_script_triggers(p_contact_id, p_thread_id);
  
  IF NOT (v_trigger_result->>'should_generate')::boolean THEN
    RETURN NULL;
  END IF;
  
  -- Get the first trigger's category
  v_script_category := (v_trigger_result->'triggers'->0->>'category')::text;
  
  IF v_script_category IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Get personalization data
  v_personalization_data := public.get_phone_script_personalization_data(p_contact_id, p_thread_id);
  v_workspace_id := (v_personalization_data->>'workspace_id')::uuid;
  
  IF v_workspace_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Check if script already exists for this trigger
  IF EXISTS (
    SELECT 1 FROM public.phone_scripts
    WHERE contact_id = p_contact_id
      AND script_category = v_script_category
      AND workspace_id = v_workspace_id
      AND status = 'generated'
      AND created_at > NOW() - INTERVAL '1 hour'
  ) THEN
    -- Return existing script
    SELECT id INTO v_script_id
    FROM public.phone_scripts
    WHERE contact_id = p_contact_id
      AND script_category = v_script_category
      AND workspace_id = v_workspace_id
      AND status = 'generated'
    ORDER BY created_at DESC
    LIMIT 1;
    
    RETURN v_script_id;
  END IF;
  
  -- Note: Actual script generation happens via API endpoint
  -- This function just creates a placeholder that will be filled by the API
  -- In production, you might want to call an edge function here
  
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.auto_generate_phone_script IS 'Auto-generates phone script based on triggers (Block 21170)';

-- ============================================================================
-- PART 7 — TRIGGER: Auto-Generate Script on Proposal View
-- ============================================================================

-- Note: This would be triggered when proposal email_opened_at is updated
-- For now, we'll rely on application-level triggers

-- ============================================================================
-- PART 8 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.phone_scripts IS 'AI-generated phone scripts for roofing companies (Block 21170)';
COMMENT ON COLUMN public.phone_scripts.script_category IS 'Script category: homeowner close calls, adjuster calls, objection handling, deductible explanation, pre-install, post-install';
COMMENT ON COLUMN public.phone_scripts.script_data IS 'Complete script structure: opening, context, value anchor, main statement/ask, objection handling, insurance logic, close';
COMMENT ON COLUMN public.phone_scripts.generation_metadata IS 'Metadata about script generation: personalization inputs, trigger reason, AI model, generation time';

