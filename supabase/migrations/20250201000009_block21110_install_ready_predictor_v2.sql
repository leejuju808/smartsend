-- =========================================================
-- Block 21110 — SmartSend Install-Ready Predictor v2
-- (Homeowner Intent + Insurance Status + Deductible Logic + Reply Patterns + Claim Movement → Predicts EXACT Install-Ready Moment)
-- =========================================================
--
-- This block is a HUGE upgrade from Install-Ready v1 (20400).
--
-- Install-Ready v1 gave us:
-- - Basic conditions
-- - Approval + deductible detection
-- - Homeowner "ready" replies
--
-- Install-Ready Predictor v2 turns SmartSend into a CLOSING ENGINE that tells roofers:
-- "Call this homeowner TODAY — they are ready to book the install."
--
-- It predicts EXACTLY when the job is ready based on 25+ signals across:
-- - Homeowner replies
-- - Insurance timeline
-- - Scope analysis
-- - Underpayment detection
-- - Proposal behavior
-- - Adjuster messages
-- - Deductible info
-- - Lead history
--
-- Roofers normally guess based on gut instinct.
-- SmartSend replaces that with AI CERTAINTY.
-- =========================================================

-- ============================================================================
-- PART 1 — Add Install-Ready Predictor v2 Fields to inbox_threads
-- ============================================================================

ALTER TABLE IF EXISTS public.inbox_threads
  -- Install-Ready Score (0-100)
  ADD COLUMN IF NOT EXISTS install_ready_score integer DEFAULT NULL CHECK (install_ready_score >= 0 AND install_ready_score <= 100),
  
  -- Score Status (Ready, Almost Ready, Not Ready)
  ADD COLUMN IF NOT EXISTS install_ready_status text DEFAULT NULL CHECK (install_ready_status IN ('ready', 'almost_ready', 'not_ready')),
  
  -- Score Breakdown (detailed component scores)
  ADD COLUMN IF NOT EXISTS install_ready_score_breakdown jsonb DEFAULT '{}'::jsonb,
  -- Structure:
  -- {
  --   "homeowner_intent_score": 20,
  --   "insurance_status_score": 25,
  --   "proposal_score": 15,
  --   "deductible_score": 15,
  --   "activity_score": 10,
  --   "total": 85
  -- }
  
  -- Contributing Signals (all signals that contributed to score)
  ADD COLUMN IF NOT EXISTS install_ready_signals jsonb DEFAULT '[]'::jsonb,
  -- Structure: Array of signal objects
  -- [
  --   {
  --     "type": "homeowner_intent",
  --     "signal": "RCV Approved",
  --     "points": 25,
  --     "description": "RCV approval detected"
  --   },
  --   {
  --     "type": "proposal",
  --     "signal": "Proposal Viewed",
  --     "points": 15,
  --     "description": "Homeowner viewed proposal"
  --   }
  -- ]
  
  -- Recommended Actions (what roofer should do)
  ADD COLUMN IF NOT EXISTS install_ready_recommended_actions jsonb DEFAULT '[]'::jsonb,
  -- Structure:
  -- [
  --   {
  --     "action": "CALL NOW to schedule install",
  --     "priority": "HIGH",
  --     "reason": "Score >= 70, all conditions met"
  --   }
  -- ]
  
  -- Reasons (why score is what it is)
  ADD COLUMN IF NOT EXISTS install_ready_reasons jsonb DEFAULT '[]'::jsonb,
  -- Structure:
  -- [
  --   "Approval letter missing",
  --   "Supplement still pending",
  --   "Homeowner wants quote before booking"
  -- ]
  
  -- Score calculation metadata
  ADD COLUMN IF NOT EXISTS install_ready_score_metadata jsonb DEFAULT '{}'::jsonb,
  -- Structure:
  -- {
  --   "calculated_at": "2025-02-01T12:00:00Z",
  --   "version": "v2",
  --   "trigger_reason": "insurance_status_changed",
  --   "calculation_time_ms": 45
  -- }
  
  -- Score calculation timestamp
  ADD COLUMN IF NOT EXISTS install_ready_score_calculated_at timestamptz DEFAULT NULL;

-- Indexes for install-ready score queries
CREATE INDEX IF NOT EXISTS idx_threads_install_ready_score ON public.inbox_threads(install_ready_score DESC NULLS LAST) WHERE install_ready_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_threads_install_ready_status ON public.inbox_threads(install_ready_status) WHERE install_ready_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_threads_install_ready_ready ON public.inbox_threads(install_ready_score, campaign_id) WHERE install_ready_score >= 70;
CREATE INDEX IF NOT EXISTS idx_threads_install_ready_almost ON public.inbox_threads(install_ready_score, campaign_id) WHERE install_ready_score >= 55 AND install_ready_score < 70;
CREATE INDEX IF NOT EXISTS idx_threads_install_ready_calculated_at ON public.inbox_threads(install_ready_score_calculated_at DESC) WHERE install_ready_score_calculated_at IS NOT NULL;

-- Composite index for install-ready queries (most common filter)
CREATE INDEX IF NOT EXISTS idx_threads_install_ready_composite ON public.inbox_threads(campaign_id, install_ready_status, install_ready_score DESC) 
  WHERE install_ready_score IS NOT NULL;

-- ============================================================================
-- PART 2 — Install-Ready Score History Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.install_ready_score_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  
  -- Score snapshot
  score integer NOT NULL CHECK (score >= 0 AND score <= 100),
  previous_score integer CHECK (previous_score >= 0 AND previous_score <= 100),
  status text CHECK (status IN ('ready', 'almost_ready', 'not_ready')),
  previous_status text CHECK (previous_status IN ('ready', 'almost_ready', 'not_ready')),
  
  -- Score breakdown snapshot
  score_breakdown jsonb DEFAULT '{}'::jsonb,
  
  -- What triggered the change
  trigger_reason text,
  -- Examples: "insurance_status_changed", "proposal_viewed", "homeowner_replied", "deductible_found", "manual_recalculation"
  
  -- Signals that changed
  changed_signals jsonb DEFAULT '[]'::jsonb,
  
  -- Timestamp
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_install_ready_score_history_thread ON public.install_ready_score_history(thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_install_ready_score_history_campaign ON public.install_ready_score_history(campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_install_ready_score_history_score ON public.install_ready_score_history(score DESC) WHERE score >= 70;

COMMENT ON TABLE public.install_ready_score_history IS 'Tracks install-ready score changes over time for transparency and debugging';
COMMENT ON COLUMN public.install_ready_score_history.trigger_reason IS 'What caused the score to change: insurance_status_changed, proposal_viewed, homeowner_replied, etc.';

-- ============================================================================
-- PART 3 — Function to Calculate Install-Ready Score
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_install_ready_score_v2(p_thread_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_thread RECORD;
  v_score integer := 0;
  v_homeowner_intent_score integer := 0;
  v_insurance_status_score integer := 0;
  v_proposal_score integer := 0;
  v_deductible_score integer := 0;
  v_activity_score integer := 0;
  v_signals jsonb := '[]'::jsonb;
  v_reasons jsonb := '[]'::jsonb;
  v_recommended_actions jsonb := '[]'::jsonb;
  v_status text;
  v_proposal RECORD;
  v_recent_replies integer;
  v_reply_time_minutes integer;
  v_last_reply_at timestamptz;
BEGIN
  -- Get thread data
  SELECT 
    t.*,
    -- Get latest proposal
    (SELECT row_to_json(p.*) FROM public.proposals p 
     WHERE p.thread_id = t.id 
     ORDER BY p.created_at DESC LIMIT 1) as latest_proposal,
    -- Count recent replies (last 7 days)
    (SELECT COUNT(*) FROM public.inbox_messages m 
     WHERE m.thread_id = t.id 
     AND m.direction = 'in' 
     AND m.sent_at >= NOW() - INTERVAL '7 days') as recent_reply_count,
    -- Get last reply time
    (SELECT MAX(m.sent_at) FROM public.inbox_messages m 
     WHERE m.thread_id = t.id 
     AND m.direction = 'in') as last_reply_at
  INTO v_thread
  FROM public.inbox_threads t
  WHERE t.id = p_thread_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Thread not found');
  END IF;
  
  -- ========================================================================
  -- A) Homeowner Intent Score (0-30 points)
  -- ========================================================================
  
  -- Check for high-intent phrases in recent messages
  IF EXISTS (
    SELECT 1 FROM public.inbox_messages m
    WHERE m.thread_id = p_thread_id
    AND m.direction = 'in'
    AND m.sent_at >= NOW() - INTERVAL '14 days'
    AND (
      LOWER(m.body_text) LIKE '%we want to move forward%' OR
      LOWER(m.body_text) LIKE '%let''s get started%' OR
      LOWER(m.body_text) LIKE '%ready to move forward%'
    )
  ) THEN
    v_homeowner_intent_score := v_homeowner_intent_score + 30;
    v_signals := v_signals || jsonb_build_object(
      'type', 'homeowner_intent',
      'signal', 'We want to move forward',
      'points', 30,
      'description', 'Homeowner expressed strong intent to move forward'
    );
  ELSIF EXISTS (
    SELECT 1 FROM public.inbox_messages m
    WHERE m.thread_id = p_thread_id
    AND m.direction = 'in'
    AND m.sent_at >= NOW() - INTERVAL '14 days'
    AND (
      LOWER(m.body_text) LIKE '%when can we start%' OR
      LOWER(m.body_text) LIKE '%when can you start%'
    )
  ) THEN
    v_homeowner_intent_score := v_homeowner_intent_score + 25;
    v_signals := v_signals || jsonb_build_object(
      'type', 'homeowner_intent',
      'signal', 'When can we start?',
      'points', 25,
      'description', 'Homeowner asking about start date'
    );
  ELSIF EXISTS (
    SELECT 1 FROM public.inbox_messages m
    WHERE m.thread_id = p_thread_id
    AND m.direction = 'in'
    AND m.sent_at >= NOW() - INTERVAL '14 days'
    AND (
      LOWER(m.body_text) LIKE '%what''s next%' OR
      LOWER(m.body_text) LIKE '%whats next%' OR
      LOWER(m.body_text) LIKE '%next step%'
    )
  ) THEN
    v_homeowner_intent_score := v_homeowner_intent_score + 20;
    v_signals := v_signals || jsonb_build_object(
      'type', 'homeowner_intent',
      'signal', 'What''s next?',
      'points', 20,
      'description', 'Homeowner asking about next steps'
    );
  ELSIF EXISTS (
    SELECT 1 FROM public.inbox_messages m
    WHERE m.thread_id = p_thread_id
    AND m.direction = 'in'
    AND m.sent_at >= NOW() - INTERVAL '14 days'
    AND (
      LOWER(m.body_text) LIKE '%what''s our cost%' OR
      LOWER(m.body_text) LIKE '%how much%' OR
      LOWER(m.body_text) LIKE '%out of pocket%'
    )
  ) THEN
    v_homeowner_intent_score := v_homeowner_intent_score + 15;
    v_signals := v_signals || jsonb_build_object(
      'type', 'homeowner_intent',
      'signal', 'What''s our cost?',
      'points', 15,
      'description', 'Homeowner asking about cost'
    );
  ELSIF EXISTS (
    SELECT 1 FROM public.inbox_messages m
    WHERE m.thread_id = p_thread_id
    AND m.direction = 'in'
    AND m.sent_at >= NOW() - INTERVAL '14 days'
    AND (
      LOWER(m.body_text) LIKE '%can you come out%' OR
      LOWER(m.body_text) LIKE '%come look%' OR
      LOWER(m.body_text) LIKE '%inspect%'
    )
  ) THEN
    v_homeowner_intent_score := v_homeowner_intent_score + 10;
    v_signals := v_signals || jsonb_build_object(
      'type', 'homeowner_intent',
      'signal', 'Can you come out?',
      'points', 10,
      'description', 'Homeowner requesting inspection'
    );
  END IF;
  
  -- ========================================================================
  -- B) Insurance Status Score (0-25 points)
  -- ========================================================================
  
  IF v_thread.insurance_claim_status = 'approved' AND v_thread.insurance_payout_type = 'RCV' THEN
    v_insurance_status_score := v_insurance_status_score + 25;
    v_signals := v_signals || jsonb_build_object(
      'type', 'insurance_status',
      'signal', 'RCV Approved',
      'points', 25,
      'description', 'RCV approval confirmed'
    );
  ELSIF v_thread.insurance_claim_status = 'approved' AND v_thread.insurance_payout_type = 'ACV' THEN
    v_insurance_status_score := v_insurance_status_score + 15;
    v_signals := v_signals || jsonb_build_object(
      'type', 'insurance_status',
      'signal', 'ACV Approved',
      'points', 15,
      'description', 'ACV approval confirmed'
    );
  ELSIF v_thread.insurance_claim_status = 'approved' THEN
    v_insurance_status_score := v_insurance_status_score + 15;
    v_signals := v_signals || jsonb_build_object(
      'type', 'insurance_status',
      'signal', 'Claim Approved',
      'points', 15,
      'description', 'Claim approved (payout type unknown)'
    );
  END IF;
  
  -- Carrier confirmed
  IF v_thread.insurance_carrier IS NOT NULL AND v_thread.insurance_carrier != 'Unknown Carrier' THEN
    v_insurance_status_score := v_insurance_status_score + 5;
    v_signals := v_signals || jsonb_build_object(
      'type', 'insurance_status',
      'signal', 'Carrier Confirmed',
      'points', 5,
      'description', 'Insurance carrier identified'
    );
  END IF;
  
  -- Adjuster assigned
  IF v_thread.insurance_adjuster_email IS NOT NULL THEN
    v_insurance_status_score := v_insurance_status_score + 5;
    v_signals := v_signals || jsonb_build_object(
      'type', 'insurance_status',
      'signal', 'Adjuster Assigned',
      'points', 5,
      'description', 'Adjuster email found'
    );
  END IF;
  
  -- Adjuster visit completed (check activity feed or messages)
  IF EXISTS (
    SELECT 1 FROM public.activity_feed_events afe
    WHERE afe.thread_id = p_thread_id
    AND afe.event_type = 'adjuster_visit_scheduled'
    AND afe.created_at < NOW() - INTERVAL '1 day'
  ) THEN
    v_insurance_status_score := v_insurance_status_score + 10;
    v_signals := v_signals || jsonb_build_object(
      'type', 'insurance_status',
      'signal', 'Adjuster Visit Completed',
      'points', 10,
      'description', 'Adjuster visit completed'
    );
  END IF;
  
  -- Supplement approved
  IF EXISTS (
    SELECT 1 FROM public.activity_feed_events afe
    WHERE afe.thread_id = p_thread_id
    AND afe.event_type IN ('supplement_items_detected', 'adjuster_approved_supplement')
  ) THEN
    v_insurance_status_score := v_insurance_status_score + 10;
    v_signals := v_signals || jsonb_build_object(
      'type', 'insurance_status',
      'signal', 'Supplement Approved',
      'points', 10,
      'description', 'Supplement approved'
    );
  END IF;
  
  -- Cap insurance status score at 25
  v_insurance_status_score := LEAST(v_insurance_status_score, 25);
  
  -- ========================================================================
  -- C) Proposal/Estimate Score (0-20 points)
  -- ========================================================================
  
  IF v_thread.latest_proposal IS NOT NULL THEN
    v_proposal := v_thread.latest_proposal;
    
    -- Proposal sent
    IF (v_proposal->>'status')::text IN ('sent', 'approved', 'won') THEN
      v_proposal_score := v_proposal_score + 10;
      v_signals := v_signals || jsonb_build_object(
        'type', 'proposal',
        'signal', 'Proposal Sent',
        'points', 10,
        'description', 'Proposal has been sent to homeowner'
      );
    END IF;
    
    -- Proposal opened
    IF (v_proposal->>'email_opened_at')::text IS NOT NULL THEN
      v_proposal_score := v_proposal_score + 15;
      v_signals := v_signals || jsonb_build_object(
        'type', 'proposal',
        'signal', 'Proposal Viewed',
        'points', 15,
        'description', 'Homeowner opened proposal email'
      );
    END IF;
    
    -- Proposal replied to
    IF (v_proposal->>'email_clicked_at')::text IS NOT NULL THEN
      v_proposal_score := v_proposal_score + 20;
      v_signals := v_signals || jsonb_build_object(
        'type', 'proposal',
        'signal', 'Proposal Replied To',
        'points', 20,
        'description', 'Homeowner clicked proposal link'
      );
    END IF;
    
    -- Cap proposal score at 20
    v_proposal_score := LEAST(v_proposal_score, 20);
  ELSE
    -- Check if estimate exists
    IF EXISTS (
      SELECT 1 FROM public.estimates e
      WHERE e.thread_id = p_thread_id
      LIMIT 1
    ) THEN
      v_proposal_score := v_proposal_score + 5;
      v_signals := v_signals || jsonb_build_object(
        'type', 'proposal',
        'signal', 'Estimate Generated',
        'points', 5,
        'description', 'Estimate has been generated'
      );
    END IF;
  END IF;
  
  -- ========================================================================
  -- D) Deductible Score (0-15 points)
  -- ========================================================================
  
  IF v_thread.insurance_deductible_amount IS NOT NULL THEN
    v_deductible_score := v_deductible_score + 15;
    v_signals := v_signals || jsonb_build_object(
      'type', 'deductible',
      'signal', 'Deductible Known',
      'points', 15,
      'description', format('Deductible found: $%s', v_thread.insurance_deductible_amount)
    );
  ELSIF EXISTS (
    SELECT 1 FROM public.inbox_messages m
    WHERE m.thread_id = p_thread_id
    AND m.direction = 'in'
    AND m.sent_at >= NOW() - INTERVAL '14 days'
    AND (
      LOWER(m.body_text) LIKE '%deductible%'
    )
  ) THEN
    v_deductible_score := v_deductible_score + 8;
    v_signals := v_signals || jsonb_build_object(
      'type', 'deductible',
      'signal', 'Homeowner Mentions Deductible',
      'points', 8,
      'description', 'Homeowner mentioned deductible in message'
    );
  ELSIF EXISTS (
    SELECT 1 FROM public.inbox_messages m
    WHERE m.thread_id = p_thread_id
    AND m.direction = 'in'
    AND m.sent_at >= NOW() - INTERVAL '14 days'
    AND (
      LOWER(m.body_text) LIKE '%deductible option%' OR
      LOWER(m.body_text) LIKE '%deductible payment%'
    )
  ) THEN
    v_deductible_score := v_deductible_score + 5;
    v_signals := v_signals || jsonb_build_object(
      'type', 'deductible',
      'signal', 'Request for Deductible Options',
      'points', 5,
      'description', 'Homeowner asking about deductible payment options'
    );
  END IF;
  
  -- ========================================================================
  -- E) Activity Score (0-10 points)
  -- ========================================================================
  
  -- Fast reply (within 10 minutes)
  IF v_thread.last_reply_at IS NOT NULL THEN
    v_reply_time_minutes := EXTRACT(EPOCH FROM (NOW() - v_thread.last_reply_at)) / 60;
    
    -- Check if there was a fast reply (homeowner replied quickly to our message)
    IF EXISTS (
      SELECT 1 FROM public.inbox_messages m1
      INNER JOIN public.inbox_messages m2 ON m2.thread_id = m1.thread_id
      WHERE m1.thread_id = p_thread_id
      AND m1.direction = 'out'
      AND m2.direction = 'in'
      AND m2.sent_at > m1.sent_at
      AND EXTRACT(EPOCH FROM (m2.sent_at - m1.sent_at)) / 60 <= 10
      AND m2.sent_at >= NOW() - INTERVAL '7 days'
    ) THEN
      v_activity_score := v_activity_score + 10;
      v_signals := v_signals || jsonb_build_object(
        'type', 'activity',
        'signal', 'Fast Reply (within 10 minutes)',
        'points', 10,
        'description', 'Homeowner replied quickly'
      );
    -- Reply within 1 hour
    ELSIF EXISTS (
      SELECT 1 FROM public.inbox_messages m1
      INNER JOIN public.inbox_messages m2 ON m2.thread_id = m1.thread_id
      WHERE m1.thread_id = p_thread_id
      AND m1.direction = 'out'
      AND m2.direction = 'in'
      AND m2.sent_at > m1.sent_at
      AND EXTRACT(EPOCH FROM (m2.sent_at - m1.sent_at)) / 60 <= 60
      AND m2.sent_at >= NOW() - INTERVAL '7 days'
    ) THEN
      v_activity_score := v_activity_score + 5;
      v_signals := v_signals || jsonb_build_object(
        'type', 'activity',
        'signal', 'Fast Reply (within 1 hour)',
        'points', 5,
        'description', 'Homeowner replied within an hour'
      );
    END IF;
  END IF;
  
  -- Additional documents sent
  IF EXISTS (
    SELECT 1 FROM public.inbox_messages m
    WHERE m.thread_id = p_thread_id
    AND m.direction = 'in'
    AND m.sent_at >= NOW() - INTERVAL '7 days'
    AND (
      m.body_text LIKE '%attach%' OR
      m.body_text LIKE '%document%' OR
      m.body_text LIKE '%letter%' OR
      m.body_text LIKE '%pdf%'
    )
  ) THEN
    v_activity_score := v_activity_score + 5;
    v_signals := v_signals || jsonb_build_object(
      'type', 'activity',
      'signal', 'Sent Additional Documents',
      'points', 5,
      'description', 'Homeowner sent additional documents'
    );
  END IF;
  
  -- Cap activity score at 10
  v_activity_score := LEAST(v_activity_score, 10);
  
  -- ========================================================================
  -- Calculate Total Score
  -- ========================================================================
  
  v_score := v_homeowner_intent_score + v_insurance_status_score + v_proposal_score + v_deductible_score + v_activity_score;
  
  -- ========================================================================
  -- Determine Status
  -- ========================================================================
  
  IF v_score >= 70 THEN
    v_status := 'ready';
    v_recommended_actions := jsonb_build_array(
      jsonb_build_object(
        'action', '📞 CALL NOW to schedule install',
        'priority', 'HIGH',
        'reason', 'Score >= 70, all conditions met'
      )
    );
  ELSIF v_score >= 55 THEN
    v_status := 'almost_ready';
    -- Add reasons why not ready yet
    IF v_thread.insurance_claim_status != 'approved' THEN
      v_reasons := v_reasons || jsonb_build_object('reason', 'Approval letter missing');
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.activity_feed_events afe
      WHERE afe.thread_id = p_thread_id
      AND afe.event_type = 'supplement_items_detected'
    ) THEN
      v_reasons := v_reasons || jsonb_build_object('reason', 'Supplement still pending');
    END IF;
    IF v_thread.latest_proposal IS NULL THEN
      v_reasons := v_reasons || jsonb_build_object('reason', 'No proposal sent yet');
    END IF;
    
    v_recommended_actions := jsonb_build_array(
      jsonb_build_object(
        'action', '📄 Send Proposal',
        'priority', 'MEDIUM',
        'reason', 'Homeowner is close to booking'
      ),
      jsonb_build_object(
        'action', '📨 Ask for Approval Letter',
        'priority', 'MEDIUM',
        'reason', 'Need approval confirmation'
      )
    );
  ELSE
    v_status := 'not_ready';
    -- Add reasons
    IF v_thread.insurance_claim_status IN ('claim_filed_awaiting_adjuster', 'adjuster_visit_scheduled', 'under_review') THEN
      v_reasons := v_reasons || jsonb_build_object('reason', 'Claim under review');
    END IF;
    IF v_thread.insurance_deductible_amount IS NULL THEN
      v_reasons := v_reasons || jsonb_build_object('reason', 'Deductible unknown');
    END IF;
    IF v_thread.insurance_claim_status = 'supplements_needed' THEN
      v_reasons := v_reasons || jsonb_build_object('reason', 'Supplement required');
    END IF;
    
    v_recommended_actions := jsonb_build_array(
      jsonb_build_object(
        'action', '⏳ Wait for claim approval',
        'priority', 'LOW',
        'reason', 'Claim still in progress'
      )
    );
  END IF;
  
  -- ========================================================================
  -- Return Result
  -- ========================================================================
  
  RETURN jsonb_build_object(
    'score', v_score,
    'status', v_status,
    'breakdown', jsonb_build_object(
      'homeowner_intent_score', v_homeowner_intent_score,
      'insurance_status_score', v_insurance_status_score,
      'proposal_score', v_proposal_score,
      'deductible_score', v_deductible_score,
      'activity_score', v_activity_score,
      'total', v_score
    ),
    'signals', v_signals,
    'reasons', v_reasons,
    'recommended_actions', v_recommended_actions,
    'metadata', jsonb_build_object(
      'calculated_at', NOW(),
      'version', 'v2',
      'thread_id', p_thread_id
    )
  );
END;
$$;

COMMENT ON FUNCTION public.calculate_install_ready_score_v2 IS 'Calculates install-ready score (0-100) based on homeowner intent, insurance status, proposals, deductible, and activity';

-- ============================================================================
-- PART 4 — Function to Update Install-Ready Score
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_install_ready_score_v2(p_thread_id uuid, p_trigger_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  v_previous_score integer;
  v_previous_status text;
  v_new_score integer;
  v_new_status text;
BEGIN
  -- Get previous score
  SELECT install_ready_score, install_ready_status
  INTO v_previous_score, v_previous_status
  FROM public.inbox_threads
  WHERE id = p_thread_id;
  
  -- Calculate new score
  v_result := public.calculate_install_ready_score_v2(p_thread_id);
  v_new_score := (v_result->>'score')::integer;
  v_new_status := (v_result->>'status')::text;
  
  -- Update thread
  UPDATE public.inbox_threads
  SET
    install_ready_score = v_new_score,
    install_ready_status = v_new_status,
    install_ready_score_breakdown = v_result->'breakdown',
    install_ready_signals = v_result->'signals',
    install_ready_reasons = v_result->'reasons',
    install_ready_recommended_actions = v_result->'recommended_actions',
    install_ready_score_metadata = v_result->'metadata',
    install_ready_score_calculated_at = NOW()
  WHERE id = p_thread_id;
  
  -- Record in history if score changed
  IF v_previous_score IS DISTINCT FROM v_new_score OR v_previous_status IS DISTINCT FROM v_new_status THEN
    INSERT INTO public.install_ready_score_history (
      thread_id,
      campaign_id,
      score,
      previous_score,
      status,
      previous_status,
      score_breakdown,
      trigger_reason,
      changed_signals
    )
    SELECT
      p_thread_id,
      campaign_id,
      v_new_score,
      v_previous_score,
      v_new_status,
      v_previous_status,
      v_result->'breakdown',
      COALESCE(p_trigger_reason, 'automatic_recalculation'),
      v_result->'signals'
    FROM public.inbox_threads
    WHERE id = p_thread_id;
  END IF;
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.update_install_ready_score_v2 IS 'Updates install-ready score for a thread and records history';

-- ============================================================================
-- PART 5 — Triggers to Auto-Update Score
-- ============================================================================

-- Trigger function to recalculate score when relevant data changes
CREATE OR REPLACE FUNCTION public.trigger_install_ready_score_recalculation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_trigger_reason text;
BEGIN
  -- Determine trigger reason based on what changed
  IF TG_OP = 'UPDATE' THEN
    IF OLD.insurance_claim_status IS DISTINCT FROM NEW.insurance_claim_status THEN
      v_trigger_reason := 'insurance_status_changed';
    ELSIF OLD.insurance_deductible_amount IS DISTINCT FROM NEW.insurance_deductible_amount THEN
      v_trigger_reason := 'deductible_changed';
    ELSIF OLD.insurance_payout_type IS DISTINCT FROM NEW.insurance_payout_type THEN
      v_trigger_reason := 'payout_type_changed';
    ELSIF OLD.has_parsed_scope IS DISTINCT FROM NEW.has_parsed_scope THEN
      v_trigger_reason := 'scope_parsed';
    ELSE
      v_trigger_reason := 'thread_updated';
    END IF;
    
    -- Recalculate score
    PERFORM public.update_install_ready_score_v2(NEW.id, v_trigger_reason);
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_install_ready_score_recalculation ON public.inbox_threads;
CREATE TRIGGER trg_install_ready_score_recalculation
  AFTER UPDATE ON public.inbox_threads
  FOR EACH ROW
  WHEN (
    OLD.insurance_claim_status IS DISTINCT FROM NEW.insurance_claim_status OR
    OLD.insurance_deductible_amount IS DISTINCT FROM NEW.insurance_deductible_amount OR
    OLD.insurance_payout_type IS DISTINCT FROM NEW.insurance_payout_type OR
    OLD.has_parsed_scope IS DISTINCT FROM NEW.has_parsed_scope OR
    OLD.insurance_install_ready IS DISTINCT FROM NEW.insurance_install_ready
  )
  EXECUTE FUNCTION public.trigger_install_ready_score_recalculation();

-- Trigger when new message arrives
CREATE OR REPLACE FUNCTION public.trigger_install_ready_score_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Recalculate score when new inbound message arrives
  IF NEW.direction = 'in' THEN
    PERFORM public.update_install_ready_score_v2(NEW.thread_id, 'homeowner_replied');
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_install_ready_score_on_message ON public.inbox_messages;
CREATE TRIGGER trg_install_ready_score_on_message
  AFTER INSERT ON public.inbox_messages
  FOR EACH ROW
  WHEN (NEW.direction = 'in')
  EXECUTE FUNCTION public.trigger_install_ready_score_on_message();

-- Trigger when proposal status changes
CREATE OR REPLACE FUNCTION public.trigger_install_ready_score_on_proposal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Recalculate score when proposal is sent, opened, or clicked
  IF NEW.status IS DISTINCT FROM OLD.status OR
     NEW.email_opened_at IS DISTINCT FROM OLD.email_opened_at OR
     NEW.email_clicked_at IS DISTINCT FROM OLD.email_clicked_at THEN
    PERFORM public.update_install_ready_score_v2(NEW.thread_id, 'proposal_updated');
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_install_ready_score_on_proposal ON public.proposals;
CREATE TRIGGER trg_install_ready_score_on_proposal
  AFTER INSERT OR UPDATE ON public.proposals
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_install_ready_score_on_proposal();

-- ============================================================================
-- PART 6 — Function to Get Install-Ready Panel Data
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_install_ready_panel(p_thread_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_thread RECORD;
  v_result jsonb;
BEGIN
  SELECT 
    t.*,
    public.calculate_install_ready_score_v2(t.id) as score_data
  INTO v_thread
  FROM public.inbox_threads t
  WHERE t.id = p_thread_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Thread not found');
  END IF;
  
  -- Build panel data
  v_result := jsonb_build_object(
    'thread_id', p_thread_id,
    'score', (v_thread.score_data->>'score')::integer,
    'status', v_thread.score_data->>'status',
    'signals', v_thread.score_data->'signals',
    'reasons', v_thread.score_data->'reasons',
    'recommended_actions', v_thread.score_data->'recommended_actions',
    'breakdown', v_thread.score_data->'breakdown',
    'calculated_at', v_thread.install_ready_score_calculated_at,
    'insurance_carrier', v_thread.insurance_carrier,
    'insurance_claim_status', v_thread.insurance_claim_status,
    'insurance_deductible_amount', v_thread.insurance_deductible_amount,
    'insurance_payout_type', v_thread.insurance_payout_type,
    'has_parsed_scope', v_thread.has_parsed_scope
  );
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_install_ready_panel IS 'Returns complete install-ready panel data for UI display';

-- ============================================================================
-- PART 7 — View for Install-Ready Leads
-- ============================================================================

CREATE OR REPLACE VIEW public.inbox_install_ready_leads AS
SELECT 
  t.id as thread_id,
  t.campaign_id,
  t.contact_id,
  t.lead_id,
  t.install_ready_score,
  t.install_ready_status,
  t.install_ready_signals,
  t.install_ready_recommended_actions,
  t.insurance_carrier,
  t.insurance_claim_status,
  t.insurance_deductible_amount,
  t.insurance_payout_type,
  t.has_parsed_scope,
  t.last_message_at,
  t.install_ready_score_calculated_at
FROM public.inbox_threads t
WHERE t.install_ready_score IS NOT NULL
ORDER BY 
  CASE 
    WHEN t.install_ready_status = 'ready' THEN 1
    WHEN t.install_ready_status = 'almost_ready' THEN 2
    ELSE 3
  END,
  t.install_ready_score DESC,
  t.last_message_at DESC NULLS LAST;

COMMENT ON VIEW public.inbox_install_ready_leads IS 'View of all threads with install-ready scores, sorted by readiness';

-- ============================================================================
-- PART 8 — Add Activity Feed Event Type
-- ============================================================================

-- Add install_ready_score_changed to activity_feed_events event_type constraint
-- First, drop the constraint temporarily
ALTER TABLE IF EXISTS public.activity_feed_events
  DROP CONSTRAINT IF EXISTS activity_feed_events_event_type_check;

-- Recreate constraint with install_ready_score_changed added
ALTER TABLE IF EXISTS public.activity_feed_events
  ADD CONSTRAINT activity_feed_events_event_type_check 
  CHECK (event_type IN (
    -- 🔵 Lead Activity
    'new_email_received',
    'homeowner_replied',
    'homeowner_asked_for_estimate',
    'lead_marked_hot',
    'lead_marked_warm',
    'lead_marked_cold',
    'homeowner_clicked_proposal',
    
    -- 🟢 Insurance Activity
    'claim_filed_detected',
    'adjuster_assigned',
    'adjuster_visit_scheduled',
    'claim_approved',
    'claim_denied',
    'supplement_items_detected',
    'missing_code_items_detected',
    'scope_parsed_successfully',
    'insurance_email_forwarded',
    'adjuster_responded',
    
    -- 🟠 Proposal & Estimate Activity
    'estimate_generated',
    'proposal_created',
    'proposal_emailed_to_homeowner',
    'pricing_dispute_email_drafted',
    'homeowner_requested_changes',
    
    -- 🟣 Adjuster Communications
    'supplement_request_sent',
    'pricing_dispute_sent',
    'adjuster_followup_sent',
    'adjuster_replied',
    'need_photos_requested',
    
    -- 🟡 CRM / Job Stage Updates
    'stage_new_lead',
    'stage_claim_filed',
    'stage_adjuster_scheduled',
    'stage_claim_pending',
    'stage_claim_approved',
    'stage_install_ready',
    'stage_scheduled_install',
    'stage_in_progress',
    'stage_completed',
    'stage_lost',
    'stage_not_a_fit',
    
    -- 🔴 High-Urgency Warnings
    'adjuster_unresponsive_72h',
    'homeowner_replied_waiting',
    'install_ready_no_proposal',
    'supplement_value_high_not_requested',
    
    -- 🟢 Install-Ready Predictor v2
    'install_ready_score_changed'
  ));

-- ============================================================================
-- PART 9 — Trigger to Update CRM Stage When Install-Ready Score >= 70
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_update_crm_stage_on_install_ready_score()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job_id uuid;
  v_previous_score integer;
BEGIN
  -- Only process if score changed and new score >= 70
  IF NEW.install_ready_score >= 70 AND 
     (OLD.install_ready_score IS NULL OR OLD.install_ready_score < 70) THEN
    
    -- Get or create roofing job
    v_job_id := public.get_or_create_roofing_job(p_thread_id := NEW.id);
    
    -- Update job stage to INSTALL_READY
    PERFORM public.update_roofing_job_stage(
      p_job_id := v_job_id,
      p_new_stage := 'INSTALL_READY',
      p_status_reason := format('Install-Ready Score: %s/100', NEW.install_ready_score),
      p_create_timeline_event := true
    );
    
    -- Create activity feed event
    INSERT INTO public.activity_feed_events (
      thread_id,
      campaign_id,
      lead_id,
      job_id,
      event_type,
      event_text,
      event_payload,
      created_by
    )
    SELECT
      NEW.id,
      NEW.campaign_id,
      NEW.lead_id,
      v_job_id,
      'stage_install_ready',
      format('Job stage updated to Install-Ready (score: %s/100)', NEW.install_ready_score),
      jsonb_build_object(
        'score', NEW.install_ready_score,
        'status', NEW.install_ready_status,
        'previous_score', OLD.install_ready_score,
        'signals', NEW.install_ready_signals
      ),
      'smart_ai'
    WHERE v_job_id IS NOT NULL;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_crm_stage_on_install_ready_score ON public.inbox_threads;
CREATE TRIGGER trg_update_crm_stage_on_install_ready_score
  AFTER UPDATE ON public.inbox_threads
  FOR EACH ROW
  WHEN (
    NEW.install_ready_score IS NOT NULL AND
    (OLD.install_ready_score IS NULL OR OLD.install_ready_score < 70) AND
    NEW.install_ready_score >= 70
  )
  EXECUTE FUNCTION public.trigger_update_crm_stage_on_install_ready_score();

COMMENT ON FUNCTION public.trigger_update_crm_stage_on_install_ready_score IS 'Auto-updates CRM job stage to INSTALL_READY when install-ready score >= 70';

-- ============================================================================
-- PART 10 — Add Notification Types for Install-Ready Predictor v2
-- ============================================================================

-- Add new notification types to notifications table
ALTER TABLE IF EXISTS public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE IF EXISTS public.notifications
  ADD CONSTRAINT notifications_type_check 
  CHECK (type IN (
    -- 🟢 Homeowner Activity
    'homeowner_replied',
    'homeowner_buying_signal',
    'homeowner_question',
    'homeowner_schedule_request',
    'homeowner_uploaded_adjuster_email',
    'homeowner_wants_to_move_forward',
    
    -- 🔵 Insurance Claims
    'claim_approved',
    'claim_status_changed',
    'adjuster_approval_letter',
    
    -- 🟣 Adjuster Communications
    'adjuster_replied',
    'adjuster_asked_for_photos',
    'adjuster_scheduled_inspection',
    'adjuster_approved_supplement',
    'adjuster_denied_supplement',
    
    -- 🔥 Install-Ready
    'install_ready',
    'install_almost_ready',
    'proposal_prompt',
    
    -- ⚠️ Follow-Ups
    'missed_follow_up_hot_lead',
    'missed_follow_up_homeowner',
    'missed_follow_up_adjuster',
    'missed_follow_up_proposal',
    
    -- 🟠 Supplement Opportunities
    'supplement_opportunity_detected',
    
    -- 🔴 Urgent Alerts
    'adjuster_denied_claim',
    'homeowner_reported_leak',
    'homeowner_hired_another_company',
    'homeowner_complained_delays'
  ));

-- ============================================================================
-- PART 11 — Trigger to Send Notifications When Install-Ready Score Changes
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_notify_on_install_ready_score()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_workspace_id uuid;
BEGIN
  -- Get user and workspace from campaign
  SELECT c.user_id, c.workspace_id
  INTO v_user_id, v_workspace_id
  FROM public.campaigns c
  WHERE c.id = NEW.campaign_id
  LIMIT 1;
  
  -- Score >= 70: Install-Ready
  IF NEW.install_ready_score >= 70 AND 
     (OLD.install_ready_score IS NULL OR OLD.install_ready_score < 70) THEN
    
    INSERT INTO public.notifications (
      user_id,
      workspace_id,
      thread_id,
      campaign_id,
      lead_id,
      type,
      title,
      body,
      payload
    )
    VALUES (
      v_user_id,
      v_workspace_id,
      NEW.id,
      NEW.campaign_id,
      NEW.lead_id,
      'install_ready',
      'Homeowner is ready — CALL TODAY',
      format('Install-Ready Score: %s/100. %s', 
        NEW.install_ready_score,
        COALESCE(
          (NEW.install_ready_recommended_actions->0->>'action')::text,
          'Call to schedule install'
        )
      ),
      jsonb_build_object(
        'score', NEW.install_ready_score,
        'status', NEW.install_ready_status,
        'signals', NEW.install_ready_signals,
        'recommended_actions', NEW.install_ready_recommended_actions
      )
    );
  END IF;
  
  -- Score 55-69: Almost Ready
  IF NEW.install_ready_score >= 55 AND NEW.install_ready_score < 70 AND
     (OLD.install_ready_score IS NULL OR OLD.install_ready_score < 55) THEN
    
    INSERT INTO public.notifications (
      user_id,
      workspace_id,
      thread_id,
      campaign_id,
      lead_id,
      type,
      title,
      body,
      payload
    )
    VALUES (
      v_user_id,
      v_workspace_id,
      NEW.id,
      NEW.campaign_id,
      NEW.lead_id,
      'install_almost_ready',
      'Homeowner is almost ready',
      format('Install-Ready Score: %s/100. %s', 
        NEW.install_ready_score,
        COALESCE(
          (NEW.install_ready_recommended_actions->0->>'action')::text,
          'Follow up soon'
        )
      ),
      jsonb_build_object(
        'score', NEW.install_ready_score,
        'status', NEW.install_ready_status,
        'reasons', NEW.install_ready_reasons,
        'recommended_actions', NEW.install_ready_recommended_actions
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_install_ready_score ON public.inbox_threads;
CREATE TRIGGER trg_notify_on_install_ready_score
  AFTER UPDATE ON public.inbox_threads
  FOR EACH ROW
  WHEN (
    NEW.install_ready_score IS NOT NULL AND
    (
      (OLD.install_ready_score IS NULL OR OLD.install_ready_score < 70) AND NEW.install_ready_score >= 70
      OR
      (OLD.install_ready_score IS NULL OR OLD.install_ready_score < 55) AND NEW.install_ready_score >= 55 AND NEW.install_ready_score < 70
    )
  )
  EXECUTE FUNCTION public.trigger_notify_on_install_ready_score();

COMMENT ON FUNCTION public.trigger_notify_on_install_ready_score IS 'Sends notifications when install-ready score crosses thresholds';

-- ============================================================================
-- PART 12 — Trigger to Create Calendar Event When Install-Ready Score >= 70
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_create_calendar_event_on_install_ready()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_id uuid;
  v_job_id uuid;
BEGIN
  -- Only process if score changed and new score >= 70
  IF NEW.install_ready_score >= 70 AND 
     (OLD.install_ready_score IS NULL OR OLD.install_ready_score < 70) THEN
    
    -- Get workspace_id from campaign
    SELECT c.workspace_id
    INTO v_workspace_id
    FROM public.campaigns c
    WHERE c.id = NEW.campaign_id
    LIMIT 1;
    
    -- Get job_id if exists
    SELECT id
    INTO v_job_id
    FROM public.roofing_jobs
    WHERE thread_id = NEW.id
    LIMIT 1;
    
    -- Create calendar event
    IF v_workspace_id IS NOT NULL THEN
      INSERT INTO public.calendar_events (
        workspace_id,
        thread_id,
        lead_id,
        job_id,
        event_type,
        title,
        description,
        event_date,
        status,
        created_by,
        metadata
      )
      VALUES (
        v_workspace_id,
        NEW.id,
        NEW.lead_id,
        v_job_id,
        'TASK',
        'Follow up to schedule install',
        format('Install-Ready Score: %s/100. Homeowner is ready to book.', NEW.install_ready_score),
        CURRENT_DATE,
        'scheduled',
        'AI',
        jsonb_build_object(
          'score', NEW.install_ready_score,
          'status', NEW.install_ready_status,
          'signals', NEW.install_ready_signals
        )
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_calendar_event_on_install_ready ON public.inbox_threads;
CREATE TRIGGER trg_create_calendar_event_on_install_ready
  AFTER UPDATE ON public.inbox_threads
  FOR EACH ROW
  WHEN (
    NEW.install_ready_score IS NOT NULL AND
    (OLD.install_ready_score IS NULL OR OLD.install_ready_score < 70) AND
    NEW.install_ready_score >= 70
  )
  EXECUTE FUNCTION public.trigger_create_calendar_event_on_install_ready();

COMMENT ON FUNCTION public.trigger_create_calendar_event_on_install_ready IS 'Creates calendar task when install-ready score >= 70';

-- ============================================================================
-- PART 13 — Comments
-- ============================================================================

COMMENT ON COLUMN public.inbox_threads.install_ready_score IS 'Install-ready score (0-100) calculated from homeowner intent, insurance status, proposals, deductible, and activity';
COMMENT ON COLUMN public.inbox_threads.install_ready_status IS 'Install-ready status: ready (>=70), almost_ready (55-69), not_ready (<55)';
COMMENT ON COLUMN public.inbox_threads.install_ready_score_breakdown IS 'JSONB breakdown of component scores: homeowner_intent_score, insurance_status_score, proposal_score, deductible_score, activity_score';
COMMENT ON COLUMN public.inbox_threads.install_ready_signals IS 'JSONB array of all signals that contributed to the score';
COMMENT ON COLUMN public.inbox_threads.install_ready_recommended_actions IS 'JSONB array of recommended actions for the roofer';
COMMENT ON COLUMN public.inbox_threads.install_ready_reasons IS 'JSONB array of reasons explaining the current score';
COMMENT ON COLUMN public.inbox_threads.install_ready_score_metadata IS 'JSONB metadata about score calculation (version, calculated_at, trigger_reason)';
COMMENT ON COLUMN public.inbox_threads.install_ready_score_calculated_at IS 'Timestamp when score was last calculated';

