-- =========================================================
-- Block 20400 — Install-Ready Playbook v1
-- (Automated Call Script + Follow-Up Sequence Built From Insurance Data)
-- =========================================================
--
-- This block is where SmartSend officially becomes a roofing closer, not just an email tool.
--
-- 20360 = understands insurance
-- 20380 = understands scope + numbers
-- 20400 = turns that intelligence into actions that book jobs
--
-- This is the block that makes SmartSend money for contractors.
-- =========================================================

-- ============================================================================
-- PART 1 — Add Install-Ready Playbook Fields to inbox_threads
-- ============================================================================

ALTER TABLE IF EXISTS public.inbox_threads
  -- Playbook generation status
  ADD COLUMN IF NOT EXISTS install_ready_playbook_generated boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS install_ready_playbook_generated_at timestamptz DEFAULT NULL,
  
  -- Call script (full personalized script)
  ADD COLUMN IF NOT EXISTS install_ready_call_script jsonb DEFAULT NULL,
  
  -- Follow-up sequence (email/SMS sequence with timing)
  ADD COLUMN IF NOT EXISTS install_ready_followup_sequence jsonb DEFAULT NULL,
  
  -- Recommended next action (single clear instruction)
  ADD COLUMN IF NOT EXISTS install_ready_next_action text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS install_ready_next_action_priority text DEFAULT NULL CHECK (install_ready_next_action_priority IN ('HIGH', 'MEDIUM', 'LOW')),
  
  -- Playbook metadata (generation details, triggers, etc.)
  ADD COLUMN IF NOT EXISTS install_ready_playbook_metadata jsonb DEFAULT '{}'::jsonb;

-- Indexes for playbook queries
CREATE INDEX IF NOT EXISTS idx_threads_playbook_generated ON public.inbox_threads(install_ready_playbook_generated) WHERE install_ready_playbook_generated = true;
CREATE INDEX IF NOT EXISTS idx_threads_playbook_generated_at ON public.inbox_threads(install_ready_playbook_generated_at DESC) WHERE install_ready_playbook_generated_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_threads_playbook_next_action ON public.inbox_threads(install_ready_next_action) WHERE install_ready_next_action IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_threads_playbook_priority ON public.inbox_threads(install_ready_next_action_priority) WHERE install_ready_next_action_priority = 'HIGH';

-- Composite index for install-ready + playbook queries
CREATE INDEX IF NOT EXISTS idx_threads_install_ready_playbook ON public.inbox_threads(insurance_install_ready, install_ready_playbook_generated, campaign_id) 
  WHERE insurance_install_ready = true;

-- ============================================================================
-- PART 2 — Comments for Documentation
-- ============================================================================

COMMENT ON COLUMN public.inbox_threads.install_ready_playbook_generated IS 'Whether install-ready playbook has been generated for this thread';
COMMENT ON COLUMN public.inbox_threads.install_ready_playbook_generated_at IS 'Timestamp when playbook was last generated';
COMMENT ON COLUMN public.inbox_threads.install_ready_call_script IS 'JSONB: {opener, proof_of_understanding, installation_readiness_check, supplement_trigger, close, full_script_text}';
COMMENT ON COLUMN public.inbox_threads.install_ready_followup_sequence IS 'JSONB: {sequence_type, messages: [{day_offset, channel, subject, body, purpose}]}';
COMMENT ON COLUMN public.inbox_threads.install_ready_next_action IS 'Single clear instruction: CALL IMMEDIATELY, Gather more info, Send deductible explanation email, Trigger supplement workflow, Follow-up Day 3, Send roofing options PDF, Await homeowner documents';
COMMENT ON COLUMN public.inbox_threads.install_ready_next_action_priority IS 'Priority level: HIGH, MEDIUM, LOW';
COMMENT ON COLUMN public.inbox_threads.install_ready_playbook_metadata IS 'JSONB: {trigger_reason, generation_confidence, contractor_name, homeowner_name, etc.}';

-- ============================================================================
-- PART 3 — Function to Get Install-Ready Playbook Summary
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_install_ready_playbook_summary(p_thread_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'playbook_generated', install_ready_playbook_generated,
    'generated_at', install_ready_playbook_generated_at,
    'call_script', install_ready_call_script,
    'followup_sequence', install_ready_followup_sequence,
    'next_action', install_ready_next_action,
    'next_action_priority', install_ready_next_action_priority,
    'metadata', install_ready_playbook_metadata,
    -- Include insurance context
    'insurance_carrier', insurance_carrier,
    'claim_status', insurance_claim_status,
    'deductible_amount', insurance_deductible_amount,
    'payout_type', insurance_payout_type,
    'install_ready', insurance_install_ready,
    -- Include scope context
    'roof_scope', roof_scope,
    'claim_financials', claim_financials
  )
  INTO v_result
  FROM public.inbox_threads
  WHERE id = p_thread_id;
  
  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.get_install_ready_playbook_summary IS 'Returns complete install-ready playbook summary including call script, follow-up sequence, and recommended action';

-- ============================================================================
-- PART 4 — Trigger to Auto-Generate Playbook When Install-Ready
-- ============================================================================

-- Function to trigger playbook generation when install_ready becomes true
CREATE OR REPLACE FUNCTION public.trigger_install_ready_playbook_generation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_should_generate boolean := false;
BEGIN
  -- Generate playbook if:
  -- 1. install_ready just became true (was false/null, now true)
  -- 2. Claim is approved and scope is parsed (even if install_ready wasn't explicitly set)
  -- 3. Homeowner expresses interest (handled separately via API)
  
  IF NEW.insurance_install_ready = true AND 
     (OLD.insurance_install_ready IS DISTINCT FROM NEW.insurance_install_ready OR
      NEW.install_ready_playbook_generated = false OR
      NEW.install_ready_playbook_generated_at IS NULL) THEN
    v_should_generate := true;
  END IF;
  
  -- Also trigger if claim is approved and scope is parsed
  IF NEW.insurance_claim_status IN ('approved', 'approved_acv_only') AND
     NEW.has_parsed_scope = true AND
     (NEW.install_ready_playbook_generated = false OR NEW.install_ready_playbook_generated_at IS NULL) THEN
    v_should_generate := true;
  END IF;
  
  -- Mark for generation (actual generation happens via Edge Function)
  IF v_should_generate THEN
    -- Set flag to indicate playbook needs generation
    -- The Edge Function will check this and generate the playbook
    NEW.install_ready_playbook_generated := false;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_trigger_install_ready_playbook ON public.inbox_threads;
CREATE TRIGGER trg_trigger_install_ready_playbook
  BEFORE UPDATE ON public.inbox_threads
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_install_ready_playbook_generation();

COMMENT ON FUNCTION public.trigger_install_ready_playbook_generation IS 'Trigger that marks threads for playbook generation when install-ready conditions are met';
COMMENT ON TRIGGER trg_trigger_install_ready_playbook ON public.inbox_threads IS 'Auto-triggers playbook generation when install-ready status changes';

-- ============================================================================
-- PART 5 — View for Install-Ready Leads Needing Playbook
-- ============================================================================

CREATE OR REPLACE VIEW public.inbox_install_ready_needs_playbook AS
SELECT 
  t.id as thread_id,
  t.campaign_id,
  t.contact_id,
  t.insurance_carrier,
  t.insurance_claim_status,
  t.insurance_deductible_amount,
  t.insurance_payout_type,
  t.insurance_install_ready,
  t.has_parsed_scope,
  t.roof_scope,
  t.claim_financials,
  t.install_ready_playbook_generated,
  t.install_ready_playbook_generated_at,
  t.last_message_at,
  t.insurance_analyzed_at
FROM public.inbox_threads t
WHERE (
  -- Install-ready but no playbook yet
  (t.insurance_install_ready = true AND t.install_ready_playbook_generated = false)
  OR
  -- Claim approved with scope but no playbook
  (t.insurance_claim_status IN ('approved', 'approved_acv_only') 
   AND t.has_parsed_scope = true 
   AND t.install_ready_playbook_generated = false)
)
ORDER BY 
  CASE WHEN t.insurance_install_ready = true THEN 1 ELSE 2 END,
  t.last_message_at DESC NULLS LAST;

COMMENT ON VIEW public.inbox_install_ready_needs_playbook IS 'View of install-ready leads that need playbook generation';
















































