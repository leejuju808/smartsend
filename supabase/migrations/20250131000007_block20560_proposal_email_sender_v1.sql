-- =========================================================
-- Block 20560 — SmartSend Insurance + Proposal Email Sender v1
-- (One-Click Send • Auto-Personalized • Proposal + Estimate Delivery)
-- =========================================================
--
-- This is the block that sends money out the door for roofing companies.
-- Roofers fail because they don't send proposals fast enough.
-- SmartSend fixes that with ONE BUTTON.
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE proposal_email_sends TABLE (Track All Proposal Emails Sent)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.proposal_email_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Email details
  to_email text NOT NULL,
  to_name text,
  subject text NOT NULL,
  html_body text NOT NULL,
  text_body text,
  
  -- Email provider tracking
  provider text DEFAULT 'resend' CHECK (provider IN ('resend', 'mailersend', 'gmail', 'smtp')),
  provider_message_id text,
  
  -- Status tracking
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'cancelled')),
  error_message text,
  
  -- Trigger source (how this send was triggered)
  trigger_source text NOT NULL CHECK (trigger_source IN (
    'manual_button',
    'homeowner_request_detected',
    'claim_approval_auto',
    'hot_lead_auto'
  )),
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_proposal_email_sends_proposal ON public.proposal_email_sends(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_email_sends_thread ON public.proposal_email_sends(thread_id);
CREATE INDEX IF NOT EXISTS idx_proposal_email_sends_status ON public.proposal_email_sends(status);
CREATE INDEX IF NOT EXISTS idx_proposal_email_sends_created ON public.proposal_email_sends(created_at DESC);

-- ============================================================================
-- PART 2 — ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.proposal_email_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view proposal emails in their workspace"
  ON public.proposal_email_sends FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create proposal emails in their workspace"
  ON public.proposal_email_sends FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update proposal emails in their workspace"
  ON public.proposal_email_sends FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 3 — FUNCTION: Generate Proposal Email (AI-Powered)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_proposal_email(
  p_proposal_id uuid,
  p_contractor_settings jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_proposal record;
  v_thread record;
  v_contact record;
  v_contractor_profile record;
  v_email_data jsonb;
BEGIN
  -- Get proposal data
  SELECT p.*, t.*, c.*
  INTO v_proposal, v_thread, v_contact
  FROM public.proposals p
  JOIN public.inbox_threads t ON p.thread_id = t.id
  LEFT JOIN public.contacts c ON p.contact_id = c.id
  WHERE p.id = p_proposal_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposal not found: %', p_proposal_id;
  END IF;
  
  -- Get contractor profile settings
  SELECT * INTO v_contractor_profile
  FROM public.company_settings
  WHERE workspace_id = v_proposal.workspace_id
  LIMIT 1;
  
  -- Build email data structure (will be populated by AI in application layer)
  v_email_data := jsonb_build_object(
    'to', COALESCE(v_contact.email, v_thread.contact_email),
    'to_name', COALESCE(v_contact.name, v_proposal.proposal_data->>'homeowner_name', 'Homeowner'),
    'subject_options', ARRAY[
      format('Your Roof Replacement Proposal (%s Approved)', COALESCE(v_thread.insurance_carrier, 'Insurance')),
      'Your Full Roof Estimate is Ready',
      'Next Steps for Your Roof Replacement',
      'Proposal Attached – Let''s Get You Scheduled'
    ],
    'proposal_data', v_proposal.proposal_data,
    'insurance_data', jsonb_build_object(
      'carrier', v_thread.insurance_carrier,
      'deductible', v_thread.insurance_deductible_amount,
      'rcv_total', v_thread.claim_financials->>'rcv_total',
      'acv_total', v_thread.claim_financials->>'acv_total',
      'depreciation_recoverable', v_thread.insurance_depreciation_recoverable,
      'depreciation_amount', v_thread.insurance_depreciation_amount
    ),
    'contractor_info', jsonb_build_object(
      'company_name', COALESCE(v_contractor_profile.company_name, p_contractor_settings->>'company_name', 'Your Roofing Company'),
      'phone', COALESCE(v_contractor_profile.company_phone, p_contractor_settings->>'phone'),
      'email', COALESCE(v_contractor_profile.company_email, p_contractor_settings->>'email'),
      'signature', COALESCE(p_contractor_settings->>'email_signature', '')
    ),
    'thread_id', v_thread.id,
    'contact_id', v_contact.id
  );
  
  RETURN v_email_data;
END;
$$;

COMMENT ON FUNCTION public.generate_proposal_email IS 'Generates proposal email data structure for AI personalization (Block 20560)';

-- ============================================================================
-- PART 4 — FUNCTION: Check if Proposal Should Be Auto-Sent
-- ============================================================================

CREATE OR REPLACE FUNCTION public.should_auto_send_proposal(
  p_thread_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_thread record;
  v_proposal record;
  v_last_proposal_sent timestamptz;
  v_homeowner_requested boolean := false;
  v_claim_approved boolean := false;
  v_hot_lead boolean := false;
BEGIN
  -- Get thread data
  SELECT * INTO v_thread
  FROM public.inbox_threads
  WHERE id = p_thread_id;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Check if proposal exists
  SELECT * INTO v_proposal
  FROM public.proposals
  WHERE thread_id = p_thread_id
    AND status IN ('generated', 'draft')
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Check if proposal was already sent in last 24 hours
  SELECT MAX(sent_at) INTO v_last_proposal_sent
  FROM public.proposal_email_sends
  WHERE proposal_id = v_proposal.id
    AND status = 'sent';
  
  IF v_last_proposal_sent IS NOT NULL AND v_last_proposal_sent > NOW() - INTERVAL '24 hours' THEN
    RETURN false;
  END IF;
  
  -- Trigger 1: Homeowner asked for quote/proposal
  SELECT EXISTS (
    SELECT 1 FROM public.inbox_messages
    WHERE thread_id = p_thread_id
      AND direction = 'in'
      AND (
        body ILIKE '%send me the quote%' OR
        body ILIKE '%send me the proposal%' OR
        body ILIKE '%send me the estimate%' OR
        body ILIKE '%can you send%quote%' OR
        body ILIKE '%can you send%proposal%' OR
        body ILIKE '%can you send%estimate%'
      )
      AND sent_at > NOW() - INTERVAL '48 hours'
  ) INTO v_homeowner_requested;
  
  -- Trigger 2: Claim approved and no proposal sent in 24 hrs
  IF v_thread.insurance_claim_status = 'approved' 
     AND COALESCE(v_thread.insurance_last_updated_at, v_thread.updated_at) > NOW() - INTERVAL '48 hours'
     AND (v_last_proposal_sent IS NULL OR v_last_proposal_sent < COALESCE(v_thread.insurance_last_updated_at, v_thread.updated_at)) THEN
    v_claim_approved := true;
  END IF;
  
  -- Trigger 3: Hot Lead Engine classifies as HOT with no proposal sent
  IF v_thread.hot_lead_tier = 1 
     AND v_thread.hot_lead_score >= 80
     AND v_last_proposal_sent IS NULL THEN
    v_hot_lead := true;
  END IF;
  
  RETURN v_homeowner_requested OR v_claim_approved OR v_hot_lead;
END;
$$;

COMMENT ON FUNCTION public.should_auto_send_proposal IS 'Determines if proposal should be auto-sent based on triggers (Block 20560)';

-- ============================================================================
-- PART 5 — TRIGGER: Auto-Create Timeline Event on Proposal Send
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_timeline_on_proposal_sent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_thread_id uuid;
  v_contact_id uuid;
BEGIN
  -- Only process when status changes to 'sent'
  IF OLD.status != 'sent' AND NEW.status = 'sent' THEN
    -- Get thread_id and contact_id from proposal
    SELECT p.thread_id, p.contact_id
    INTO v_thread_id, v_contact_id
    FROM public.proposals p
    WHERE p.id = NEW.proposal_id;
    
    -- Create timeline event
    PERFORM public.create_timeline_event(
      p_event_type := 'QUOTE_SENT',
      p_event_payload := jsonb_build_object(
        'proposal_id', NEW.proposal_id,
        'email_send_id', NEW.id,
        'subject', NEW.subject,
        'trigger_source', NEW.trigger_source
      ),
      p_event_date := CURRENT_DATE,
      p_thread_id := v_thread_id,
      p_contact_id := v_contact_id,
      p_detected_from := 'trigger',
      p_detection_confidence := 1.0
    );
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_timeline_on_proposal_sent ON public.proposal_email_sends;
CREATE TRIGGER trg_timeline_on_proposal_sent
  AFTER UPDATE ON public.proposal_email_sends
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.trigger_timeline_on_proposal_sent();

COMMENT ON FUNCTION public.trigger_timeline_on_proposal_sent IS 'Auto-creates timeline event when proposal email is sent (Block 20460 integration)';

-- ============================================================================
-- PART 6 — FUNCTION: Update Lead Score After Proposal Send
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_lead_score_on_proposal_sent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_thread_id uuid;
  v_contact_id uuid;
  v_current_score integer;
  v_new_score integer;
BEGIN
  -- Only process when status changes to 'sent'
  IF OLD.status != 'sent' AND NEW.status = 'sent' THEN
    -- Get thread_id and contact_id
    SELECT p.thread_id, p.contact_id
    INTO v_thread_id, v_contact_id
    FROM public.proposals p
    WHERE p.id = NEW.proposal_id;
    
    -- Get current lead score (if using contacts table)
    IF v_contact_id IS NOT NULL THEN
      SELECT COALESCE(score, 0) INTO v_current_score
      FROM public.contacts
      WHERE id = v_contact_id;
      
      -- Add +10 for proposal sent
      v_new_score := LEAST(100, v_current_score + 10);
      
      -- Update contact score
      UPDATE public.contacts
      SET score = v_new_score
      WHERE id = v_contact_id;
      
      -- Update thread hot lead score if applicable
      UPDATE public.inbox_threads
      SET hot_lead_score = LEAST(100, COALESCE(hot_lead_score, 0) + 10),
          hot_lead_next_action = 'Await homeowner reply'
      WHERE id = v_thread_id;
      
      -- Check if tier should move from WARM → HOT
      UPDATE public.inbox_threads
      SET hot_lead_tier = 1
      WHERE id = v_thread_id
        AND hot_lead_score >= 80
        AND hot_lead_tier > 1;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_lead_score_on_proposal_sent ON public.proposal_email_sends;
CREATE TRIGGER trg_update_lead_score_on_proposal_sent
  AFTER UPDATE ON public.proposal_email_sends
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'sent')
  EXECUTE FUNCTION public.update_lead_score_on_proposal_sent();

COMMENT ON FUNCTION public.update_lead_score_on_proposal_sent IS 'Updates lead score (+10) and hot lead tier when proposal is sent (Block 20430 integration)';

-- ============================================================================
-- PART 7 — FUNCTION: Detect Proposal Request in Messages (Enhanced)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.detect_proposal_request_in_thread(
  p_thread_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_has_request boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.inbox_messages
    WHERE thread_id = p_thread_id
      AND direction = 'in'
      AND sent_at > NOW() - INTERVAL '48 hours'
      AND (
        body ILIKE '%send me the quote%' OR
        body ILIKE '%send me the proposal%' OR
        body ILIKE '%send me the estimate%' OR
        body ILIKE '%can you send%quote%' OR
        body ILIKE '%can you send%proposal%' OR
        body ILIKE '%can you send%estimate%' OR
        body ILIKE '%I need%quote%' OR
        body ILIKE '%I need%proposal%' OR
        body ILIKE '%I need%estimate%' OR
        body ILIKE '%want%quote%' OR
        body ILIKE '%want%proposal%' OR
        body ILIKE '%want%estimate%'
      )
  ) INTO v_has_request;
  
  RETURN v_has_request;
END;
$$;

COMMENT ON FUNCTION public.detect_proposal_request_in_thread IS 'Detects if homeowner requested proposal/quote in thread messages (Block 20560)';

-- ============================================================================
-- PART 8 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.proposal_email_sends IS 'Tracks all proposal emails sent to homeowners (Block 20560)';
COMMENT ON COLUMN public.proposal_email_sends.trigger_source IS 'How this send was triggered: manual_button, homeowner_request_detected, claim_approval_auto, hot_lead_auto';
COMMENT ON COLUMN public.proposal_email_sends.status IS 'Email send status: queued, sending, sent, failed, cancelled';

