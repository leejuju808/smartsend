-- =========================================================
-- Block 21735 — SmartSend Roofing Call Outcome Brain v1
-- (Outcome Tags → Automatic Next Steps for Roofers)
-- =========================================================
-- 
-- This is the true intelligence layer on top of the Call Queue.
-- Call Queue tells the roofer who to call.
-- Outcome Brain tells SmartSend what to do next based on what happened on the call.
--
-- This is how SmartSend stops being a call log…
-- and becomes a sales engine that moves the lead forward automatically.

-- ============================================================================
-- FUNCTION: APPLY CALL OUTCOME LOGIC
-- ============================================================================
-- This function handles automatic next steps based on call outcomes:
-- - completed (spoke & scheduled): Mark lead as hot, cancel other tasks
-- - no_answer: Create new call task in 4 hours
-- - voicemail_left: Create new call task in 24 hours
-- - bad_number: Mark lead as cold, cancel tasks
-- - do_not_call: Mark lead as cold, cancel tasks

CREATE OR REPLACE FUNCTION public.apply_call_outcome(
  p_lead_id UUID,
  p_outcome TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 1. Timeline event is already handled by API route

  -- 2. STOP LOGIC for outcomes that require no more calls
  IF p_outcome = 'do_not_call' THEN
    UPDATE leads SET status = 'cold' WHERE id = p_lead_id;

    UPDATE call_tasks
    SET status = 'cancelled'
    WHERE lead_id = p_lead_id
      AND status IN ('pending', 'in_progress');

    RETURN;
  END IF;

  IF p_outcome = 'bad_number' THEN
    UPDATE leads SET status = 'cold' WHERE id = p_lead_id;

    UPDATE call_tasks
    SET status = 'cancelled'
    WHERE lead_id = p_lead_id
      AND status IN ('pending', 'in_progress');

    RETURN;
  END IF;

  -- 3. SPOKE & SCHEDULED
  IF p_outcome = 'completed' THEN
    -- mark as hot (Confirmed interest)
    UPDATE leads SET status = 'hot' WHERE id = p_lead_id;

    -- cancel other tasks
    UPDATE call_tasks
    SET status = 'cancelled'
    WHERE lead_id = p_lead_id
      AND status IN ('pending', 'in_progress');

    -- Block 21744: Mark first contact if needed
    PERFORM mark_first_contact_if_needed(p_lead_id);

    -- Auto-create appointment (Block 21736)
    -- Default: 2 days from now at 10 AM (estimator can adjust later)
    PERFORM create_appointment(
      p_lead_id,
      now() + interval '2 days',
      'estimator_call',
      p_note
    );

    RETURN;
  END IF;

  -- 4. NO ANSWER → retry in 4 hours
  IF p_outcome = 'no_answer' THEN
    -- Block 21744: Mark first contact if needed (any call attempt counts)
    PERFORM mark_first_contact_if_needed(p_lead_id);

    INSERT INTO call_tasks (lead_id, source, status, priority, due_at, notes)
    VALUES (p_lead_id, 'no_answer_retry', 'pending', 80, now() + interval '4 hours', p_note);

    RETURN;
  END IF;

  -- 5. VOICEMAIL LEFT → retry tomorrow
  IF p_outcome = 'voicemail_left' THEN
    -- Block 21744: Mark first contact if needed (any call attempt counts)
    PERFORM mark_first_contact_if_needed(p_lead_id);

    INSERT INTO call_tasks (lead_id, source, status, priority, due_at, notes)
    VALUES (p_lead_id, 'voicemail_retry', 'pending', 60, now() + interval '24 hours', p_note);

    RETURN;
  END IF;

END;
$$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION public.apply_call_outcome IS 'Applies automatic next steps based on call outcomes. Handles lead status updates, task cancellation, and automatic retry scheduling.';

