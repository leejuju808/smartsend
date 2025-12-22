-- =========================================================
-- Block 21867 — SmartSend Lead Ownership & Handoff Engine v1
-- (🔄 Seamless Estimator → Owner → Admin Handoffs for Full Accountability)
-- =========================================================
--
-- This block creates a bulletproof lead accountability system that tracks:
-- ✔ Who currently owns the lead
-- ✔ When ownership shifts
-- ✔ Why it shifted (reason code)
-- ✔ What triggered the handoff
-- ✔ How many handoffs occurred
-- ✔ Which estimator is overloaded
-- ✔ When owner/admin intervention is required
--
-- This connects to:
-- - Routing Brain
-- - Follow-Up Brain
-- - Coaching Engine
-- - Pipeline Board
-- - Company Scorecard
-- - Lead Timeline
--
-- ============================================================================
-- 1. ADD OWNERSHIP FIELDS TO LEADS TABLE
-- ============================================================================

-- Add ownership_mode column (tracks current ownership state)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS ownership_mode TEXT DEFAULT 'unassigned'
  CHECK (ownership_mode IN (
    'estimator_assigned',
    'unassigned',
    'auto_reassigned',
    'needs_owner_intervention',
    'closed'
  ));

-- Add ownership_history column (JSONB array tracking all handoffs)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS ownership_history JSONB DEFAULT '[]'::jsonb;

-- Add last_handoff_at timestamp
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS last_handoff_at TIMESTAMPTZ;

-- Add handoff_count (number of times this lead has been handed off)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS handoff_count INTEGER DEFAULT 0;

-- Ensure owner_id exists (should already exist from Block 443)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ============================================================================
-- 2. CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_leads_ownership_mode 
  ON public.leads(ownership_mode) 
  WHERE ownership_mode IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_owner_mode 
  ON public.leads(owner_id, ownership_mode) 
  WHERE owner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_needs_intervention 
  ON public.leads(workspace_id, ownership_mode) 
  WHERE ownership_mode = 'needs_owner_intervention';

CREATE INDEX IF NOT EXISTS idx_leads_handoff_count 
  ON public.leads(handoff_count) 
  WHERE handoff_count > 0;

CREATE INDEX IF NOT EXISTS idx_leads_last_handoff 
  ON public.leads(last_handoff_at DESC) 
  WHERE last_handoff_at IS NOT NULL;

-- ============================================================================
-- 3. HELPER FUNCTION: Get estimator with least active leads
-- ============================================================================

CREATE OR REPLACE FUNCTION public.pick_estimator_with_least_leads(
  p_workspace_id UUID,
  p_exclude_owner_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_estimator_id UUID;
BEGIN
  -- Find estimator with least active leads (excluding closed/won/lost)
  SELECT p.id INTO v_estimator_id
  FROM public.profiles p
  JOIN public.workspace_members wm ON wm.user_id = p.id
  LEFT JOIN public.leads l ON l.owner_id = p.id 
    AND l.workspace_id = p_workspace_id
    AND l.status NOT IN ('won', 'lost', 'closed')
    AND l.ownership_mode != 'closed'
  WHERE wm.workspace_id = p_workspace_id
    AND wm.role IN ('owner', 'admin', 'member')
    AND (p_exclude_owner_id IS NULL OR p.id != p_exclude_owner_id)
  GROUP BY p.id
  ORDER BY COUNT(l.id) ASC, p.id ASC
  LIMIT 1;

  RETURN v_estimator_id;
END;
$$;

-- ============================================================================
-- 4. FUNCTION: Perform Lead Handoff
-- ============================================================================

CREATE OR REPLACE FUNCTION public.perform_lead_handoff(
  p_lead_id UUID,
  p_new_owner_id UUID,
  p_reason TEXT,
  p_triggered_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead RECORD;
  v_previous_owner UUID;
  v_history_entry JSONB;
  v_new_history JSONB;
  v_new_mode TEXT;
BEGIN
  -- Fetch the lead
  SELECT 
    id,
    owner_id,
    ownership_mode,
    ownership_history,
    workspace_id
  INTO v_lead
  FROM public.leads
  WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found: %', p_lead_id;
  END IF;

  v_previous_owner := v_lead.owner_id;

  -- Build new history entry
  v_history_entry := jsonb_build_object(
    'from', v_previous_owner,
    'to', p_new_owner_id,
    'reason', p_reason,
    'at', now(),
    'triggered_by', p_triggered_by
  );

  -- Append to history
  v_new_history := COALESCE(v_lead.ownership_history, '[]'::jsonb) || v_history_entry;

  -- Determine new ownership mode
  IF p_reason = 'manual_override' THEN
    v_new_mode := 'estimator_assigned';
  ELSIF p_reason = 'needs_owner_intervention' THEN
    v_new_mode := 'needs_owner_intervention';
  ELSE
    v_new_mode := 'auto_reassigned';
  END IF;

  -- Update lead
  UPDATE public.leads
  SET
    owner_id = p_new_owner_id,
    ownership_mode = v_new_mode,
    ownership_history = v_new_history,
    last_handoff_at = now(),
    handoff_count = COALESCE(handoff_count, 0) + 1,
    updated_at = now()
  WHERE id = p_lead_id;

  -- Log event into timeline (using lead_timeline_events table)
  INSERT INTO public.lead_timeline_events (
    lead_id,
    event_type,
    event_subtype,
    message,
    metadata
  ) VALUES (
    p_lead_id,
    'lead_handoff',
    p_reason,
    format('Lead handed off from %s to %s (%s)', 
      COALESCE((SELECT email FROM public.profiles WHERE id = v_previous_owner), 'Unassigned'),
      COALESCE((SELECT email FROM public.profiles WHERE id = p_new_owner_id), 'Unknown'),
      p_reason
    ),
    v_history_entry
  );

  RETURN jsonb_build_object(
    'success', true,
    'lead_id', p_lead_id,
    'previous_owner', v_previous_owner,
    'new_owner', p_new_owner_id,
    'reason', p_reason,
    'handoff_count', (SELECT handoff_count FROM public.leads WHERE id = p_lead_id)
  );
END;
$$;

-- ============================================================================
-- 5. FUNCTION: Check if lead needs handoff (for auto-handoff engine)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_lead_handoff_conditions(
  p_lead_id UUID
)
RETURNS TABLE (
  needs_handoff BOOLEAN,
  reason TEXT,
  suggested_owner_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead RECORD;
  v_now TIMESTAMPTZ := now();
  v_hours_since_update NUMERIC;
  v_hours_since_reply NUMERIC;
  v_missed_followups INT;
  v_response_delay_seconds INT;
  v_job_value NUMERIC;
  v_probability_drop NUMERIC;
  v_workspace_id UUID;
  v_owner_id UUID;
BEGIN
  -- Fetch lead with related data
  SELECT 
    l.id,
    l.workspace_id,
    l.owner_id,
    l.ownership_mode,
    l.status,
    l.updated_at,
    l.last_reply_at,
    l.last_response_delay,
    l.estimated_job_value,
    l.job_health_score,
    l.last_intent,
    l.heat_category,
    l.pipeline_stage
  INTO v_lead
  FROM public.leads l
  WHERE l.id = p_lead_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_workspace_id := v_lead.workspace_id;

  -- Skip if already closed
  IF v_lead.status IN ('won', 'lost') OR v_lead.ownership_mode = 'closed' THEN
    RETURN;
  END IF;

  -- 1. Check for missed follow-ups (2+ missed = handoff)
  SELECT COUNT(*) INTO v_missed_followups
  FROM public.tasks t
  WHERE t.lead_id = p_lead_id
    AND t.status NOT IN ('done', 'completed')
    AND t.due_at IS NOT NULL
    AND t.due_at < v_now;

  IF v_missed_followups >= 2 THEN
    RETURN QUERY SELECT 
      TRUE::BOOLEAN,
      'missed_followups'::TEXT,
      public.pick_estimator_with_least_leads(v_workspace_id, v_lead.owner_id);
  END IF;

  -- 2. Check slow response on hot lead (>15 minutes = 900 seconds)
  IF v_lead.heat_category = 'hot' AND v_lead.last_response_delay IS NOT NULL THEN
    IF v_lead.last_response_delay > 900 THEN
      RETURN QUERY SELECT 
        TRUE::BOOLEAN,
        'slow_response_hot'::TEXT,
        public.pick_estimator_with_least_leads(v_workspace_id, v_lead.owner_id);
    END IF;
  END IF;

  -- 3. Check if stuck in pipeline (same stage > 48 hours)
  IF v_lead.updated_at IS NOT NULL THEN
    v_hours_since_update := EXTRACT(EPOCH FROM (v_now - v_lead.updated_at)) / 3600;
    
    IF v_lead.pipeline_stage = 'contacted' AND v_hours_since_update > 48 THEN
      RETURN QUERY SELECT 
        TRUE::BOOLEAN,
        'stuck_stage'::TEXT,
        public.pick_estimator_with_least_leads(v_workspace_id, v_lead.owner_id);
    END IF;
  END IF;

  -- 4. Check high-value job probability drop ($10k+ and probability drop > 20%)
  -- Note: This would require tracking previous probability, simplified here
  IF v_lead.estimated_job_value IS NOT NULL AND v_lead.estimated_job_value >= 10000 THEN
    -- Check if job_health_score dropped significantly (would need historical tracking)
    -- For now, if health score is low and value is high, escalate
    IF v_lead.job_health_score IS NOT NULL AND v_lead.job_health_score < 40 THEN
      -- Escalate to owner (workspace owner)
      SELECT user_id INTO v_owner_id
      FROM public.workspace_members
      WHERE workspace_id = v_lead.workspace_id
        AND role = 'owner'
      LIMIT 1;
      
      IF v_owner_id IS NOT NULL THEN
        RETURN QUERY SELECT 
          TRUE::BOOLEAN,
          'high_value_probability_drop'::TEXT,
          v_owner_id;
      END IF;
    END IF;
  END IF;

  -- 5. Check estimator inactivity (no response in X hours - configurable, default 24)
  -- This would require tracking last activity timestamp per estimator
  -- Simplified: if last_reply_at is old and no recent activity
  
  -- No handoff needed
  RETURN QUERY SELECT FALSE::BOOLEAN, NULL::TEXT, NULL::UUID;
END;
$$;

-- ============================================================================
-- 6. GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.pick_estimator_with_least_leads(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.perform_lead_handoff(UUID, UUID, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_lead_handoff_conditions(UUID) TO authenticated, service_role;

-- ============================================================================
-- 7. COMMENTS
-- ============================================================================

COMMENT ON COLUMN public.leads.ownership_mode IS 
  'Current ownership state: estimator_assigned, unassigned, auto_reassigned, needs_owner_intervention, closed';

COMMENT ON COLUMN public.leads.ownership_history IS 
  'JSONB array of handoff history entries: [{from, to, reason, at, triggered_by}]';

COMMENT ON COLUMN public.leads.last_handoff_at IS 
  'Timestamp of the most recent handoff';

COMMENT ON COLUMN public.leads.handoff_count IS 
  'Total number of times this lead has been handed off';

COMMENT ON FUNCTION public.perform_lead_handoff IS 
  'Performs a lead handoff, updates ownership fields, logs to timeline';

COMMENT ON FUNCTION public.check_lead_handoff_conditions IS 
  'Checks if a lead meets any handoff conditions and returns suggested action';

-- ============================================================================
-- Block 21867 Complete
-- ============================================================================

