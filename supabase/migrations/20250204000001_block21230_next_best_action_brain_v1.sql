-- =========================================================
-- Block 21230 — SmartSend Roofing "Next Best Action" Brain v1
-- (Always tells the contractor the ONE highest-ROI action to take on every lead)
-- =========================================================
--
-- This block is a GAME-CHANGER.
--
-- Every CRM tells contractors "here's your leads."
-- NONE tell them:
--   👉 Here's exactly what you should do next to make the most money.
--   👉 Here's the ONE action that moves the job forward fastest.
--   👉 Here's what will close the deal today.
--
-- This block creates a decision engine that analyzes:
--   - homeowner replies
--   - insurance timeline
--   - underpayment totals
--   - supplement opportunities
--   - proposal behavior
--   - adjuster activity
--   - install-ready score
--   - objection patterns
--   - project context
--   - lead age
--   - follow-up history
--
-- ...and then SmartSend tells the roofer the next best action with ONE clear instruction.
--
-- This is the heartbeat of a REAL revenue system.
-- =========================================================

-- ============================================================================
-- PART 1 — Add Next Best Action Fields to inbox_threads
-- ============================================================================

ALTER TABLE IF EXISTS public.inbox_threads
  -- Next Best Action (the single highest-ROI action)
  ADD COLUMN IF NOT EXISTS next_best_action text DEFAULT NULL,
  -- Action types: 'call_now', 'send_proposal', 'follow_up_now', 'request_approval_letter',
  --               'send_supplement_request', 'send_photos', 'explain_deductible', 
  --               'use_objection_response', 'send_reengagement', 'maintain'
  
  -- Action Priority (HIGH, MEDIUM, LOW, URGENT)
  ADD COLUMN IF NOT EXISTS next_best_action_priority text DEFAULT NULL CHECK (next_best_action_priority IN ('HIGH', 'MEDIUM', 'LOW', 'URGENT')),
  
  -- Action Details (why this action, context, etc.)
  ADD COLUMN IF NOT EXISTS next_best_action_details jsonb DEFAULT '{}'::jsonb,
  -- Structure:
  -- {
  --   "action": "CALL NOW — homeowner is ready to book install.",
  --   "why": [
  --     "Proposal viewed 3 times",
  --     "Claim approved",
  --     "Deductible confirmed",
  --     "Homeowner replied: 'What's next?'"
  --   ],
  --   "context": {
  --     "install_ready_score": 84,
  --     "proposal_view_count": 3,
  --     "claim_status": "approved",
  --     "deductible_known": true
  --   },
  --   "roi_estimate": "high",
  --   "urgency_reason": "Homeowner is hot — act now before they choose another roofer"
  -- }
  
  -- Action Metadata (calculation info, last updated, etc.)
  ADD COLUMN IF NOT EXISTS next_best_action_metadata jsonb DEFAULT '{}'::jsonb,
  -- Structure:
  -- {
  --   "calculated_at": "2025-02-04T12:00:00Z",
  --   "version": "v1",
  --   "trigger_reason": "proposal_viewed",
  --   "calculation_time_ms": 120,
  --   "evaluated_conditions": [
  --     "install_ready_score >= 70",
  --     "proposal_viewed >= 2",
  --     "claim_approved"
  --   ]
  -- }
  
  -- Last calculation timestamp
  ADD COLUMN IF NOT EXISTS next_best_action_calculated_at timestamptz DEFAULT NULL;

-- Indexes for next best action queries
CREATE INDEX IF NOT EXISTS idx_threads_next_best_action ON public.inbox_threads(next_best_action) WHERE next_best_action IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_threads_next_best_action_priority ON public.inbox_threads(next_best_action_priority) WHERE next_best_action_priority IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_threads_next_best_action_urgent ON public.inbox_threads(campaign_id, next_best_action_priority) WHERE next_best_action_priority IN ('HIGH', 'URGENT');
CREATE INDEX IF NOT EXISTS idx_threads_next_best_action_calculated_at ON public.inbox_threads(next_best_action_calculated_at DESC) WHERE next_best_action_calculated_at IS NOT NULL;

-- ============================================================================
-- PART 2 — Next Best Action History Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.next_best_action_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  
  -- Action snapshot
  action text NOT NULL,
  previous_action text,
  priority text CHECK (priority IN ('HIGH', 'MEDIUM', 'LOW', 'URGENT')),
  previous_priority text CHECK (previous_priority IN ('HIGH', 'MEDIUM', 'LOW', 'URGENT')),
  
  -- Action details snapshot
  action_details jsonb DEFAULT '{}'::jsonb,
  
  -- What triggered the change
  trigger_reason text,
  -- Examples: "install_ready_score_changed", "proposal_viewed", "claim_approved", "underpayment_detected", "objection_detected"
  
  -- Timestamp
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_next_best_action_history_thread ON public.next_best_action_history(thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_next_best_action_history_campaign ON public.next_best_action_history(campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_next_best_action_history_action ON public.next_best_action_history(action, priority) WHERE priority IN ('HIGH', 'URGENT');

COMMENT ON TABLE public.next_best_action_history IS 'Tracks next best action changes over time for transparency and debugging';
COMMENT ON COLUMN public.next_best_action_history.trigger_reason IS 'What caused the action to change: install_ready_score_changed, proposal_viewed, claim_approved, etc.';

-- ============================================================================
-- PART 3 — Function to Calculate Next Best Action
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_next_best_action(p_thread_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_thread RECORD;
  v_action text;
  v_priority text;
  v_details jsonb;
  v_metadata jsonb;
  v_why text[] := '{}'::text[];
  v_context jsonb := '{}'::jsonb;
  v_install_ready_score integer;
  v_proposal_view_count integer;
  v_proposal_sent boolean;
  v_proposal_replied boolean;
  v_claim_status text;
  v_claim_approved boolean;
  v_approval_letter_exists boolean;
  v_underpayment_amount numeric;
  v_supplement_requested boolean;
  v_adjuster_requested_photos boolean;
  v_deductible_known boolean;
  v_has_objection boolean;
  v_lead_age_days integer;
  v_last_message_days integer;
  v_last_reply_at timestamptz;
  v_last_message_at timestamptz;
BEGIN
  -- Get thread data with all relevant information
  SELECT 
    t.*,
    -- Install-ready score
    t.install_ready_score,
    -- Proposal info
    (SELECT COUNT(*) FROM public.proposal_events pe
     JOIN public.proposals p ON pe.proposal_id = p.id
     WHERE p.thread_id = t.id
     AND pe.event_type IN ('opened', 'reopened')) as proposal_view_count,
    (SELECT EXISTS(SELECT 1 FROM public.proposals p WHERE p.thread_id = t.id)) as proposal_sent,
    (SELECT EXISTS(SELECT 1 FROM public.inbox_messages m
     WHERE m.thread_id = t.id
     AND m.direction = 'in'
     AND m.sent_at > (SELECT MAX(p.created_at) FROM public.proposals p WHERE p.thread_id = t.id))) as proposal_replied,
    -- Insurance info
    t.insurance_claim_status,
    (SELECT EXISTS(SELECT 1 FROM public.insurance_attachments ia
     WHERE ia.thread_id = t.id
     AND (ia.attachment_type = 'approval_letter' OR ia.attachment_type = 'scope_of_loss'))) as approval_letter_exists,
    -- Underpayment info
    (SELECT COALESCE(MAX(sc.underpayment_amount), 0) FROM public.scope_comparisons sc
     JOIN public.insurance_attachments ia ON sc.insurance_attachment_id = ia.id
     WHERE ia.thread_id = t.id) as underpayment_amount,
    (SELECT EXISTS(SELECT 1 FROM public.adjuster_emails ae
     WHERE ae.thread_id = t.id
     AND ae.email_type = 'supplement_request'
     AND ae.status = 'sent')) as supplement_requested,
    -- Adjuster info
    (SELECT EXISTS(SELECT 1 FROM public.inbox_messages m
     WHERE m.thread_id = t.id
     AND m.direction = 'in'
     AND (LOWER(m.body_text) LIKE '%photos%' OR LOWER(m.body_text) LIKE '%pictures%')
     AND m.sent_at >= NOW() - INTERVAL '7 days')) as adjuster_requested_photos,
    -- Deductible info
    (t.insurance_deductible_amount IS NOT NULL) as deductible_known,
    -- Objection info
    (SELECT EXISTS(SELECT 1 FROM public.price_objection_responses por
     WHERE por.thread_id = t.id
     AND por.created_at >= NOW() - INTERVAL '7 days')) as has_objection,
    -- Lead age
    EXTRACT(EPOCH FROM (NOW() - t.created_at)) / 86400 as lead_age_days,
    -- Last message info
    (SELECT MAX(m.sent_at) FROM public.inbox_messages m WHERE m.thread_id = t.id AND m.direction = 'in') as last_reply_at,
    (SELECT MAX(m.sent_at) FROM public.inbox_messages m WHERE m.thread_id = t.id) as last_message_at
  INTO v_thread
  FROM public.inbox_threads t
  WHERE t.id = p_thread_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Thread not found');
  END IF;
  
  -- Extract values
  v_install_ready_score := COALESCE(v_thread.install_ready_score, 0);
  v_proposal_view_count := COALESCE(v_thread.proposal_view_count, 0);
  v_proposal_sent := COALESCE(v_thread.proposal_sent, false);
  v_proposal_replied := COALESCE(v_thread.proposal_replied, false);
  v_claim_status := v_thread.insurance_claim_status;
  v_claim_approved := (v_claim_status = 'approved');
  v_approval_letter_exists := COALESCE(v_thread.approval_letter_exists, false);
  v_underpayment_amount := COALESCE(v_thread.underpayment_amount, 0);
  v_supplement_requested := COALESCE(v_thread.supplement_requested, false);
  v_adjuster_requested_photos := COALESCE(v_thread.adjuster_requested_photos, false);
  v_deductible_known := COALESCE(v_thread.deductible_known, false);
  v_has_objection := COALESCE(v_thread.has_objection, false);
  v_lead_age_days := COALESCE(v_thread.lead_age_days, 0);
  v_last_reply_at := v_thread.last_reply_at;
  v_last_message_at := v_thread.last_message_at;
  
  IF v_last_message_at IS NOT NULL THEN
    v_last_message_days := EXTRACT(EPOCH FROM (NOW() - v_last_message_at)) / 86400;
  ELSE
    v_last_message_days := v_lead_age_days;
  END IF;
  
  -- ========================================================================
  -- DECISION LOGIC (Priority Order - Highest ROI First)
  -- ========================================================================
  
  -- 1. Install-Ready Score ≥ 70 → CALL NOW
  IF v_install_ready_score >= 70 THEN
    v_action := 'call_now';
    v_priority := 'HIGH';
    v_why := ARRAY[
      'Homeowner is ready to book the install',
      format('Install-Ready Score: %s', v_install_ready_score)
    ];
    v_context := jsonb_build_object(
      'install_ready_score', v_install_ready_score,
      'install_ready_status', v_thread.install_ready_status
    );
    
    -- Add more context if available
    IF v_proposal_view_count > 0 THEN
      v_why := v_why || format('Proposal viewed %s time(s)', v_proposal_view_count);
    END IF;
    IF v_claim_approved THEN
      v_why := v_why || 'Claim approved';
    END IF;
    IF v_deductible_known THEN
      v_why := v_why || 'Deductible confirmed';
    END IF;
    
  -- 2. Claim Approved + Proposal Not Viewed → SEND PROPOSAL
  ELSIF v_claim_approved AND v_proposal_sent AND v_proposal_view_count = 0 THEN
    v_action := 'send_proposal';
    v_priority := 'HIGH';
    v_why := ARRAY[
      'Insurance approved the roof',
      'Proposal not yet viewed by homeowner'
    ];
    v_context := jsonb_build_object(
      'claim_status', v_claim_status,
      'proposal_sent', v_proposal_sent,
      'proposal_view_count', v_proposal_view_count
    );
    
  -- 3. Proposal Viewed ≥2 Times + No Reply → FOLLOW UP NOW
  ELSIF v_proposal_view_count >= 2 AND NOT v_proposal_replied THEN
    v_action := 'follow_up_now';
    v_priority := 'HIGH';
    v_why := ARRAY[
      format('Proposal viewed %s time(s)', v_proposal_view_count),
      'Homeowner is hot — follow up ASAP before they choose another roofer'
    ];
    v_context := jsonb_build_object(
      'proposal_view_count', v_proposal_view_count,
      'proposal_replied', v_proposal_replied
    );
    
  -- 4. Missing Approval Letter → REQUEST IT
  ELSIF v_claim_approved AND NOT v_approval_letter_exists THEN
    v_action := 'request_approval_letter';
    v_priority := 'MEDIUM';
    v_why := ARRAY[
      'Homeowner said claim approved',
      'No approval letter detected',
      'Underpayment analysis incomplete without approval letter'
    ];
    v_context := jsonb_build_object(
      'claim_status', v_claim_status,
      'approval_letter_exists', v_approval_letter_exists
    );
    
  -- 5. Underpayment > $3,000 + No Supplement Requested → SEND SUPPLEMENT REQUEST
  ELSIF v_underpayment_amount > 3000 AND NOT v_supplement_requested THEN
    v_action := 'send_supplement_request';
    v_priority := 'HIGH';
    v_why := ARRAY[
      format('Missing items: $%s underpayment', v_underpayment_amount),
      'Claim under-reviewed',
      'Adjuster waiting'
    ];
    v_context := jsonb_build_object(
      'underpayment_amount', v_underpayment_amount,
      'supplement_requested', v_supplement_requested
    );
    
  -- 6. Adjuster Requested Photos → SEND PHOTOS / CALL ADJUSTER
  ELSIF v_adjuster_requested_photos THEN
    v_action := 'send_photos';
    v_priority := 'URGENT';
    v_why := ARRAY[
      'Adjuster waiting on photos',
      'Send now to avoid delay'
    ];
    v_context := jsonb_build_object(
      'adjuster_requested_photos', v_adjuster_requested_photos
    );
    
  -- 7. Deductible Unknown → EXPLAIN DEDUCTIBLE
  ELSIF NOT v_deductible_known AND (v_claim_approved OR v_claim_status = 'pending_approval') THEN
    v_action := 'explain_deductible';
    v_priority := 'MEDIUM';
    v_why := ARRAY[
      'Homeowner is confused about deductible',
      'Send deductible explanation'
    ];
    v_context := jsonb_build_object(
      'deductible_known', v_deductible_known,
      'claim_status', v_claim_status
    );
    
  -- 8. Objection Detected → USE OBJECTION RESPONSE
  ELSIF v_has_objection THEN
    v_action := 'use_objection_response';
    v_priority := 'HIGH';
    v_why := ARRAY[
      'Homeowner has objection',
      'Send specific rebuttal'
    ];
    v_context := jsonb_build_object(
      'has_objection', v_has_objection
    );
    
  -- 9. Lead Cold for 7 Days → SEND REENGAGEMENT MESSAGE
  ELSIF v_last_message_days >= 7 THEN
    v_action := 'send_reengagement';
    v_priority := 'MEDIUM';
    v_why := ARRAY[
      format('No activity for %s days', ROUND(v_last_message_days)),
      'Revive lead with reengagement message'
    ];
    v_context := jsonb_build_object(
      'last_message_days', v_last_message_days,
      'lead_age_days', v_lead_age_days
    );
    
  -- 10. No Action Possible → MAINTAIN
  ELSE
    v_action := 'maintain';
    v_priority := 'LOW';
    v_why := ARRAY['Lead is up to date'];
    v_context := jsonb_build_object(
      'status', 'no_action_needed'
    );
  END IF;
  
  -- Build details object
  v_details := jsonb_build_object(
    'action', CASE v_action
      WHEN 'call_now' THEN 'CALL NOW — homeowner is ready to book install.'
      WHEN 'send_proposal' THEN 'Send the proposal'
      WHEN 'follow_up_now' THEN 'Follow up with homeowner NOW'
      WHEN 'request_approval_letter' THEN 'Request approval letter from homeowner'
      WHEN 'send_supplement_request' THEN format('Send supplement request for missing items ($%s)', v_underpayment_amount)
      WHEN 'send_photos' THEN 'Send photos / Call adjuster'
      WHEN 'explain_deductible' THEN 'Send deductible explanation'
      WHEN 'use_objection_response' THEN 'Use objection response'
      WHEN 'send_reengagement' THEN 'Send reengagement message'
      WHEN 'maintain' THEN 'Maintain — lead is up to date'
      ELSE 'Unknown action'
    END,
    'why', v_why,
    'context', v_context,
    'roi_estimate', CASE v_priority
      WHEN 'URGENT' THEN 'very_high'
      WHEN 'HIGH' THEN 'high'
      WHEN 'MEDIUM' THEN 'medium'
      ELSE 'low'
    END
  );
  
  -- Build metadata object
  v_metadata := jsonb_build_object(
    'calculated_at', NOW(),
    'version', 'v1',
    'trigger_reason', 'manual_calculation',
    'evaluated_conditions', jsonb_build_array(
      format('install_ready_score >= 70: %s', v_install_ready_score >= 70),
      format('claim_approved: %s', v_claim_approved),
      format('proposal_view_count >= 2: %s', v_proposal_view_count >= 2),
      format('underpayment_amount > 3000: %s', v_underpayment_amount > 3000),
      format('has_objection: %s', v_has_objection),
      format('lead_cold_7_days: %s', v_last_message_days >= 7)
    )
  );
  
  RETURN jsonb_build_object(
    'action', v_action,
    'priority', v_priority,
    'details', v_details,
    'metadata', v_metadata
  );
END;
$$;

COMMENT ON FUNCTION public.calculate_next_best_action IS 'Calculates the single highest-ROI action for a lead based on all SmartSend subsystems';

-- ============================================================================
-- PART 4 — Function to Update Next Best Action
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_next_best_action(p_thread_id uuid, p_trigger_reason text DEFAULT 'manual')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  v_previous_action text;
  v_previous_priority text;
  v_new_action text;
  v_new_priority text;
BEGIN
  -- Get current action
  SELECT next_best_action, next_best_action_priority
  INTO v_previous_action, v_previous_priority
  FROM public.inbox_threads
  WHERE id = p_thread_id;
  
  -- Calculate new action
  v_result := public.calculate_next_best_action(p_thread_id);
  
  IF v_result->>'error' IS NOT NULL THEN
    RETURN v_result;
  END IF;
  
  v_new_action := v_result->>'action';
  v_new_priority := v_result->>'priority';
  
  -- Update thread
  UPDATE public.inbox_threads
  SET 
    next_best_action = v_new_action,
    next_best_action_priority = v_new_priority,
    next_best_action_details = v_result->'details',
    next_best_action_metadata = v_result->'metadata',
    next_best_action_calculated_at = NOW(),
    updated_at = NOW()
  WHERE id = p_thread_id;
  
  -- Record history if action changed
  IF v_previous_action IS DISTINCT FROM v_new_action OR v_previous_priority IS DISTINCT FROM v_new_priority THEN
    INSERT INTO public.next_best_action_history (
      thread_id,
      campaign_id,
      action,
      previous_action,
      priority,
      previous_priority,
      action_details,
      trigger_reason
    )
    SELECT 
      p_thread_id,
      campaign_id,
      v_new_action,
      v_previous_action,
      v_new_priority,
      v_previous_priority,
      v_result->'details',
      p_trigger_reason
    FROM public.inbox_threads
    WHERE id = p_thread_id;
  END IF;
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.update_next_best_action IS 'Updates next best action for a thread and records history if changed';

-- ============================================================================
-- PART 5 — Triggers to Auto-Update Next Best Action
-- ============================================================================

-- Trigger on install-ready score changes
CREATE OR REPLACE FUNCTION public.trg_next_best_action_on_install_ready()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF (OLD.install_ready_score IS DISTINCT FROM NEW.install_ready_score) OR
     (OLD.install_ready_status IS DISTINCT FROM NEW.install_ready_status) THEN
    PERFORM public.update_next_best_action(NEW.id, 'install_ready_score_changed');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_next_best_action_on_install_ready ON public.inbox_threads;
CREATE TRIGGER trg_next_best_action_on_install_ready
AFTER UPDATE OF install_ready_score, install_ready_status ON public.inbox_threads
FOR EACH ROW
WHEN (OLD.install_ready_score IS DISTINCT FROM NEW.install_ready_score OR OLD.install_ready_status IS DISTINCT FROM NEW.install_ready_status)
EXECUTE FUNCTION public.trg_next_best_action_on_install_ready();

-- Trigger on proposal events
CREATE OR REPLACE FUNCTION public.trg_next_best_action_on_proposal_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.update_next_best_action(NEW.thread_id, 'proposal_event');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_next_best_action_on_proposal_event ON public.proposal_events;
CREATE TRIGGER trg_next_best_action_on_proposal_event
AFTER INSERT ON public.proposal_events
FOR EACH ROW
EXECUTE FUNCTION public.trg_next_best_action_on_proposal_event();

-- Trigger on insurance status changes
CREATE OR REPLACE FUNCTION public.trg_next_best_action_on_insurance_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF OLD.insurance_claim_status IS DISTINCT FROM NEW.insurance_claim_status THEN
    PERFORM public.update_next_best_action(NEW.id, 'insurance_status_changed');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_next_best_action_on_insurance_status ON public.inbox_threads;
CREATE TRIGGER trg_next_best_action_on_insurance_status
AFTER UPDATE OF insurance_claim_status ON public.inbox_threads
FOR EACH ROW
WHEN (OLD.insurance_claim_status IS DISTINCT FROM NEW.insurance_claim_status)
EXECUTE FUNCTION public.trg_next_best_action_on_insurance_status();

-- Trigger on scope comparison updates
CREATE OR REPLACE FUNCTION public.trg_next_best_action_on_scope_comparison()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_thread_id uuid;
BEGIN
  SELECT ia.thread_id INTO v_thread_id
  FROM public.insurance_attachments ia
  WHERE ia.id = NEW.insurance_attachment_id;
  
  IF v_thread_id IS NOT NULL THEN
    PERFORM public.update_next_best_action(v_thread_id, 'scope_comparison_updated');
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_next_best_action_on_scope_comparison ON public.scope_comparisons;
CREATE TRIGGER trg_next_best_action_on_scope_comparison
AFTER INSERT OR UPDATE OF underpayment_amount ON public.scope_comparisons
FOR EACH ROW
EXECUTE FUNCTION public.trg_next_best_action_on_scope_comparison();

-- Trigger on objection detection
CREATE OR REPLACE FUNCTION public.trg_next_best_action_on_objection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.update_next_best_action(NEW.thread_id, 'objection_detected');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_next_best_action_on_objection ON public.price_objection_responses;
CREATE TRIGGER trg_next_best_action_on_objection
AFTER INSERT ON public.price_objection_responses
FOR EACH ROW
EXECUTE FUNCTION public.trg_next_best_action_on_objection();

-- Trigger on new messages
CREATE OR REPLACE FUNCTION public.trg_next_best_action_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.update_next_best_action(NEW.thread_id, 'new_message');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_next_best_action_on_message ON public.inbox_messages;
CREATE TRIGGER trg_next_best_action_on_message
AFTER INSERT ON public.inbox_messages
FOR EACH ROW
EXECUTE FUNCTION public.trg_next_best_action_on_message();

-- ============================================================================
-- PART 6 — Weekly Action Summary Function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_weekly_action_summary(p_campaign_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'leads_ready_to_call', (
      SELECT COUNT(*) FROM public.inbox_threads
      WHERE campaign_id = p_campaign_id
      AND next_best_action = 'call_now'
      AND next_best_action_priority IN ('HIGH', 'URGENT')
    ),
    'missing_approval_letters', (
      SELECT COUNT(*) FROM public.inbox_threads
      WHERE campaign_id = p_campaign_id
      AND next_best_action = 'request_approval_letter'
    ),
    'supplement_requests_needed', (
      SELECT COUNT(*) FROM public.inbox_threads
      WHERE campaign_id = p_campaign_id
      AND next_best_action = 'send_supplement_request'
    ),
    'adjuster_deadlines_coming', (
      SELECT COUNT(*) FROM public.inbox_threads
      WHERE campaign_id = p_campaign_id
      AND next_best_action = 'send_photos'
      AND next_best_action_priority = 'URGENT'
    ),
    'proposals_need_followup', (
      SELECT COUNT(*) FROM public.inbox_threads
      WHERE campaign_id = p_campaign_id
      AND next_best_action = 'follow_up_now'
    ),
    'objections_to_handle', (
      SELECT COUNT(*) FROM public.inbox_threads
      WHERE campaign_id = p_campaign_id
      AND next_best_action = 'use_objection_response'
    ),
    'leads_to_reengage', (
      SELECT COUNT(*) FROM public.inbox_threads
      WHERE campaign_id = p_campaign_id
      AND next_best_action = 'send_reengagement'
    ),
    'total_action_items', (
      SELECT COUNT(*) FROM public.inbox_threads
      WHERE campaign_id = p_campaign_id
      AND next_best_action IS NOT NULL
      AND next_best_action != 'maintain'
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_weekly_action_summary IS 'Returns weekly action summary for a campaign showing all action items';

-- ============================================================================
-- PART 7 — Comments
-- ============================================================================

COMMENT ON COLUMN public.inbox_threads.next_best_action IS 'The single highest-ROI action to take on this lead';
COMMENT ON COLUMN public.inbox_threads.next_best_action_priority IS 'Priority level: HIGH, MEDIUM, LOW, URGENT';
COMMENT ON COLUMN public.inbox_threads.next_best_action_details IS 'Detailed explanation of why this action and what context led to it';
COMMENT ON COLUMN public.inbox_threads.next_best_action_metadata IS 'Calculation metadata including timestamp, version, and evaluated conditions';
















































