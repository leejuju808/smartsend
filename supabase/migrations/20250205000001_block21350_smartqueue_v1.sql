-- =========================================================
-- Block 21350 — SmartSend SmartQueue v1
-- (Prioritized Work Queue • Unified Tasks • Calls • Follow-Ups • Adjuster Actions • Insurance Tasks • Highest-ROI Ordering)
-- =========================================================
--
-- THIS BLOCK IS A MONSTER.
--
-- This is where SmartSend stops being "software"
-- →
-- and becomes a daily operating system for roofing companies.
--
-- SmartQueue v1 gives the user ONE LIST that tells them:
--
-- 👉 What to do first
-- 👉 What to do next
-- 👉 What not to waste time on
-- 👉 What will make them the most money TODAY
--
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE SMARTQUEUE TABLE (Unified Task Queue)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.smartqueue_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- assigned user (NULL = unassigned)
  
  -- Source tracking (where this task came from)
  source_type text NOT NULL CHECK (source_type IN (
    'next_best_action',
    'calendar_scheduler',
    'proposal_followup',
    'insurance_timeline',
    'file_memory',
    'reply_classification',
    'install_ready_predictor',
    'scope_underpayment',
    'crm_pipeline',
    'task_v3',
    'adjuster_request',
    'revenue_forecast'
  )),
  source_id uuid, -- ID of the source (task_id, proposal_id, thread_id, etc.)
  
  -- Task classification
  task_category text NOT NULL CHECK (task_category IN ('high_roi', 'medium_roi', 'low_roi')),
  task_type text NOT NULL, -- e.g., 'install_ready_call', 'supplement_request', 'proposal_followup'
  
  -- Task details
  title text NOT NULL,
  description text,
  reason text, -- Why this task is important (e.g., "Proposal viewed 3x, claim approved")
  
  -- Links to related entities
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE SET NULL,
  proposal_id uuid REFERENCES public.proposals(id) ON DELETE SET NULL,
  
  -- Priority scoring (0-100)
  priority_score numeric(5,2) DEFAULT 0 CHECK (priority_score >= 0 AND priority_score <= 100),
  
  -- Scoring breakdown (for transparency)
  score_breakdown jsonb DEFAULT '{}'::jsonb,
  -- Structure:
  -- {
  --   "install_ready_weight": 15,
  --   "homeowner_intent_weight": 12,
  --   "insurance_status_weight": 10,
  --   "proposal_behavior_weight": 8,
  --   "reply_urgency_weight": 10,
  --   "underpayment_weight": 15,
  --   "revenue_value_weight": 20,
  --   "adjuster_deadline_weight": 5,
  --   "lead_age_penalty": -5
  -- }
  
  -- Action buttons (for UI)
  action_buttons jsonb DEFAULT '[]'::jsonb,
  -- Structure:
  -- [
  --   { "label": "Call Script", "action": "call", "url": "/api/calls/script" },
  --   { "label": "Mark Done", "action": "complete", "url": "/api/smartqueue/complete" },
  --   { "label": "Generate Email", "action": "email", "url": "/api/emails/generate" }
  -- ]
  
  -- Scheduling
  due_at timestamptz NOT NULL,
  due_date date,
  
  -- Status
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'dismissed', 'snoozed')),
  completed_at timestamptz,
  dismissed_at timestamptz,
  snoozed_until timestamptz,
  
  -- Metadata (flexible storage)
  metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_refreshed_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for SmartQueue
CREATE INDEX IF NOT EXISTS idx_smartqueue_workspace ON public.smartqueue_items(workspace_id, status, priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_smartqueue_user ON public.smartqueue_items(workspace_id, user_id, status) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_smartqueue_category ON public.smartqueue_items(workspace_id, task_category, priority_score DESC) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_smartqueue_priority_score ON public.smartqueue_items(priority_score DESC) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_smartqueue_due_at ON public.smartqueue_items(due_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_smartqueue_source ON public.smartqueue_items(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_smartqueue_contact ON public.smartqueue_items(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_smartqueue_thread ON public.smartqueue_items(thread_id) WHERE thread_id IS NOT NULL;

-- ============================================================================
-- PART 2 — SMARTQUEUE PRIORITY SCORING FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_smartqueue_priority_score(
  p_item_id uuid
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item RECORD;
  v_thread RECORD;
  v_contact RECORD;
  v_proposal RECORD;
  v_scope_comparison RECORD;
  
  -- Score components
  v_install_ready_weight numeric := 0;
  v_homeowner_intent_weight numeric := 0;
  v_insurance_status_weight numeric := 0;
  v_proposal_behavior_weight numeric := 0;
  v_reply_urgency_weight numeric := 0;
  v_underpayment_weight numeric := 0;
  v_revenue_value_weight numeric := 0;
  v_adjuster_deadline_weight numeric := 0;
  v_lead_age_penalty numeric := 0;
  
  v_total_score numeric := 0;
  v_score_breakdown jsonb;
BEGIN
  -- Get SmartQueue item
  SELECT * INTO v_item
  FROM public.smartqueue_items
  WHERE id = p_item_id;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  -- Get thread data if available
  IF v_item.thread_id IS NOT NULL THEN
    SELECT * INTO v_thread
    FROM public.inbox_threads
    WHERE id = v_item.thread_id;
  END IF;
  
  -- Get contact data if available
  IF v_item.contact_id IS NOT NULL THEN
    SELECT * INTO v_contact
    FROM public.contacts
    WHERE id = v_item.contact_id;
  END IF;
  
  -- Get proposal data if available
  IF v_item.proposal_id IS NOT NULL THEN
    SELECT * INTO v_proposal
    FROM public.proposals
    WHERE id = v_item.proposal_id;
  END IF;
  
  -- ========================================================================
  -- 1. INSTALL-READY WEIGHT (0-15 points)
  -- ========================================================================
  IF v_thread.install_ready_score IS NOT NULL THEN
    v_install_ready_weight := LEAST(15, (v_thread.install_ready_score::numeric / 100) * 15);
  ELSIF v_item.metadata->>'install_ready_score' IS NOT NULL THEN
    v_install_ready_weight := LEAST(15, ((v_item.metadata->>'install_ready_score')::numeric / 100) * 15);
  END IF;
  
  -- ========================================================================
  -- 2. HOMEOWNER INTENT WEIGHT (0-12 points)
  -- ========================================================================
  IF v_thread.next_best_action IS NOT NULL THEN
    CASE (v_thread.next_best_action->>'primary_action')::text
      WHEN 'send_followup' THEN v_homeowner_intent_weight := 8;
      WHEN 'push_meeting' THEN v_homeowner_intent_weight := 12;
      WHEN 'close_won' THEN v_homeowner_intent_weight := 10;
      ELSE v_homeowner_intent_weight := 5;
    END CASE;
  END IF;
  
  -- Check reply classifications for intent
  IF v_thread.id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_homeowner_intent_weight
    FROM public.reply_classifications rc
    JOIN public.inbox_messages m ON m.id = rc.message_id
    WHERE m.thread_id = v_thread.id
      AND m.direction = 'in'
      AND rc.classification_category IN ('booking_intent', 'price_request', 'urgency')
      AND m.sent_at > NOW() - INTERVAL '7 days';
    
    v_homeowner_intent_weight := LEAST(12, v_homeowner_intent_weight * 4);
  END IF;
  
  -- ========================================================================
  -- 3. INSURANCE STATUS WEIGHT (0-10 points)
  -- ========================================================================
  IF v_thread.insurance_claim_status IS NOT NULL THEN
    CASE v_thread.insurance_claim_status
      WHEN 'approved' THEN v_insurance_status_weight := 10;
      WHEN 'pending_approval' THEN v_insurance_status_weight := 7;
      WHEN 'adjuster_scheduled' THEN v_insurance_status_weight := 5;
      WHEN 'claim_filed' THEN v_insurance_status_weight := 3;
      ELSE v_insurance_status_weight := 0;
    END CASE;
  END IF;
  
  -- ========================================================================
  -- 4. PROPOSAL BEHAVIOR WEIGHT (0-8 points)
  -- ========================================================================
  IF v_proposal.id IS NOT NULL THEN
    -- Check proposal analytics
    IF v_proposal.proposal_analytics->>'view_count' IS NOT NULL THEN
      v_proposal_behavior_weight := LEAST(8, ((v_proposal.proposal_analytics->>'view_count')::numeric / 3) * 4);
    END IF;
    
    -- Check if proposal was forwarded
    IF (v_proposal.proposal_analytics->>'forwarded_to_spouse')::boolean = true THEN
      v_proposal_behavior_weight := v_proposal_behavior_weight + 2;
    END IF;
  END IF;
  
  -- ========================================================================
  -- 5. REPLY URGENCY WEIGHT (0-10 points)
  -- ========================================================================
  IF v_thread.last_message_at IS NOT NULL THEN
    -- Recent inbound message = urgent
    IF v_thread.last_direction = 'in' AND v_thread.last_message_at > NOW() - INTERVAL '1 hour' THEN
      v_reply_urgency_weight := 10;
    ELSIF v_thread.last_direction = 'in' AND v_thread.last_message_at > NOW() - INTERVAL '24 hours' THEN
      v_reply_urgency_weight := 7;
    ELSIF v_thread.last_direction = 'in' AND v_thread.last_message_at > NOW() - INTERVAL '48 hours' THEN
      v_reply_urgency_weight := 5;
    END IF;
  END IF;
  
  -- ========================================================================
  -- 6. UNDERPAYMENT WEIGHT (0-15 points)
  -- ========================================================================
  IF v_item.thread_id IS NOT NULL THEN
    SELECT 
      total_supplement_opportunity,
      o_and_p_missing_value
    INTO v_scope_comparison
    FROM public.scope_comparisons
    WHERE thread_id = v_item.thread_id
    ORDER BY created_at DESC
    LIMIT 1;
    
    IF v_scope_comparison.total_supplement_opportunity IS NOT NULL THEN
      v_underpayment_weight := LEAST(15, (v_scope_comparison.total_supplement_opportunity / 5000) * 15);
    END IF;
  END IF;
  
  -- ========================================================================
  -- 7. REVENUE VALUE WEIGHT (0-20 points)
  -- ========================================================================
  IF v_thread.thread_estimated_value IS NOT NULL THEN
    v_revenue_value_weight := LEAST(20, (v_thread.thread_estimated_value / 50000) * 20);
  ELSIF v_contact.job_value IS NOT NULL THEN
    v_revenue_value_weight := LEAST(20, (v_contact.job_value / 50000) * 20);
  END IF;
  
  -- ========================================================================
  -- 8. ADJUSTER DEADLINE WEIGHT (0-5 points)
  -- ========================================================================
  IF v_item.metadata->>'adjuster_meeting_date' IS NOT NULL THEN
    DECLARE
      v_meeting_date timestamptz;
      v_hours_until_meeting numeric;
    BEGIN
      v_meeting_date := (v_item.metadata->>'adjuster_meeting_date')::timestamptz;
      v_hours_until_meeting := EXTRACT(EPOCH FROM (v_meeting_date - NOW())) / 3600;
      
      IF v_hours_until_meeting <= 24 THEN
        v_adjuster_deadline_weight := 5;
      ELSIF v_hours_until_meeting <= 48 THEN
        v_adjuster_deadline_weight := 3;
      END IF;
    END;
  END IF;
  
  -- ========================================================================
  -- 9. LEAD AGE PENALTY (0 to -5 points)
  -- ========================================================================
  IF v_thread.created_at IS NOT NULL THEN
    DECLARE
      v_days_old numeric;
    BEGIN
      v_days_old := EXTRACT(EPOCH FROM (NOW() - v_thread.created_at)) / 86400;
      
      IF v_days_old > 90 THEN
        v_lead_age_penalty := -5;
      ELSIF v_days_old > 60 THEN
        v_lead_age_penalty := -3;
      ELSIF v_days_old > 30 THEN
        v_lead_age_penalty := -1;
      END IF;
    END;
  END IF;
  
  -- ========================================================================
  -- CALCULATE TOTAL SCORE
  -- ========================================================================
  v_total_score := 
    v_install_ready_weight +
    v_homeowner_intent_weight +
    v_insurance_status_weight +
    v_proposal_behavior_weight +
    v_reply_urgency_weight +
    v_underpayment_weight +
    v_revenue_value_weight +
    v_adjuster_deadline_weight +
    v_lead_age_penalty;
  
  -- Ensure score is between 0-100
  v_total_score := GREATEST(0, LEAST(100, v_total_score));
  
  -- Build score breakdown
  v_score_breakdown := jsonb_build_object(
    'install_ready_weight', v_install_ready_weight,
    'homeowner_intent_weight', v_homeowner_intent_weight,
    'insurance_status_weight', v_insurance_status_weight,
    'proposal_behavior_weight', v_proposal_behavior_weight,
    'reply_urgency_weight', v_reply_urgency_weight,
    'underpayment_weight', v_underpayment_weight,
    'revenue_value_weight', v_revenue_value_weight,
    'adjuster_deadline_weight', v_adjuster_deadline_weight,
    'lead_age_penalty', v_lead_age_penalty,
    'total', v_total_score
  );
  
  -- Update SmartQueue item
  UPDATE public.smartqueue_items
  SET 
    priority_score = v_total_score,
    score_breakdown = v_score_breakdown,
    task_category = CASE
      WHEN v_total_score >= 70 THEN 'high_roi'
      WHEN v_total_score >= 40 THEN 'medium_roi'
      ELSE 'low_roi'
    END,
    last_refreshed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_item_id;
  
  RETURN v_total_score;
END;
$$;

-- ============================================================================
-- PART 3 — SMARTQUEUE AGGREGATION FUNCTION (Pulls from all sources)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.refresh_smartqueue(
  p_workspace_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task RECORD;
  v_proposal_followup RECORD;
  v_calendar_event RECORD;
  v_insurance_timeline RECORD;
  v_scope_comparison RECORD;
  v_next_best_action RECORD;
BEGIN
  -- Clear existing active items for this workspace/user
  DELETE FROM public.smartqueue_items
  WHERE workspace_id = p_workspace_id
    AND (p_user_id IS NULL OR user_id = p_user_id)
    AND status = 'active';
  
  -- ========================================================================
  -- 1. NEXT BEST ACTION ENGINE
  -- ========================================================================
  FOR v_next_best_action IN
    SELECT DISTINCT ON (t.id)
      t.id as thread_id,
      t.workspace_id,
      t.contact_id,
      t.lead_id,
      t.next_best_action,
      t.install_ready_score,
      t.thread_estimated_value,
      t.insurance_claim_status,
      c.user_id as assigned_user_id
    FROM public.inbox_threads t
    LEFT JOIN public.contacts c ON c.id = t.contact_id
    WHERE t.workspace_id = p_workspace_id
      AND t.next_best_action IS NOT NULL
      AND (p_user_id IS NULL OR c.user_id = p_user_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.smartqueue_items sq
        WHERE sq.thread_id = t.id
          AND sq.source_type = 'next_best_action'
          AND sq.status = 'active'
      )
    ORDER BY t.id, t.updated_at DESC
  LOOP
    INSERT INTO public.smartqueue_items (
      workspace_id,
      user_id,
      source_type,
      source_id,
      task_category,
      task_type,
      title,
      description,
      reason,
      contact_id,
      lead_id,
      thread_id,
      due_at,
      due_date,
      metadata,
      action_buttons
    )
    VALUES (
      v_next_best_action.workspace_id,
      v_next_best_action.assigned_user_id,
      'next_best_action',
      v_next_best_action.thread_id,
      'high_roi', -- Will be recalculated
      COALESCE((v_next_best_action.next_best_action->>'primary_action')::text, 'follow_up'),
      COALESCE((v_next_best_action.next_best_action->>'primary_label')::text, 'Follow up with homeowner'),
      NULL,
      COALESCE((v_next_best_action.next_best_action->>'primary_reason')::text, 'Next best action recommended'),
      v_next_best_action.contact_id,
      v_next_best_action.lead_id,
      v_next_best_action.thread_id,
      NOW(),
      CURRENT_DATE,
      jsonb_build_object(
        'install_ready_score', v_next_best_action.install_ready_score,
        'estimated_value', v_next_best_action.thread_estimated_value
      ),
      jsonb_build_array(
        jsonb_build_object('label', 'Call Script', 'action', 'call', 'url', '/api/calls/script'),
        jsonb_build_object('label', 'Mark Done', 'action', 'complete', 'url', '/api/smartqueue/complete')
      )
    );
  END LOOP;
  
  -- ========================================================================
  -- 2. INSTALL-READY CALLS (Score >= 70)
  -- ========================================================================
  FOR v_task IN
    SELECT DISTINCT ON (t.id)
      t.id as thread_id,
      t.workspace_id,
      t.contact_id,
      t.lead_id,
      t.install_ready_score,
      t.install_ready_status,
      t.thread_estimated_value,
      c.first_name || ' ' || c.last_name as contact_name,
      c.user_id as assigned_user_id
    FROM public.inbox_threads t
    LEFT JOIN public.contacts c ON c.id = t.contact_id
    WHERE t.workspace_id = p_workspace_id
      AND t.install_ready_score >= 70
      AND t.install_ready_status = 'ready'
      AND (p_user_id IS NULL OR c.user_id = p_user_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.smartqueue_items sq
        WHERE sq.thread_id = t.id
          AND sq.source_type = 'install_ready_predictor'
          AND sq.status = 'active'
      )
  LOOP
    INSERT INTO public.smartqueue_items (
      workspace_id,
      user_id,
      source_type,
      source_id,
      task_category,
      task_type,
      title,
      description,
      reason,
      contact_id,
      lead_id,
      thread_id,
      due_at,
      due_date,
      metadata,
      action_buttons
    )
    VALUES (
      v_task.workspace_id,
      v_task.assigned_user_id,
      'install_ready_predictor',
      v_task.thread_id,
      'high_roi',
      'install_ready_call',
      format('Call %s — Install Ready', v_task.contact_name),
      NULL,
      format('Install-ready score: %s, Estimated value: $%s', 
        v_task.install_ready_score,
        COALESCE(v_task.thread_estimated_value::text, 'N/A')),
      v_task.contact_id,
      v_task.lead_id,
      v_task.thread_id,
      NOW(),
      CURRENT_DATE,
      jsonb_build_object(
        'install_ready_score', v_task.install_ready_score,
        'install_ready_status', v_task.install_ready_status
      ),
      jsonb_build_array(
        jsonb_build_object('label', 'Call Script', 'action', 'call', 'url', '/api/calls/script'),
        jsonb_build_object('label', 'Mark Done', 'action', 'complete', 'url', '/api/smartqueue/complete')
      )
    );
  END LOOP;
  
  -- ========================================================================
  -- 3. PROPOSAL FOLLOW-UPS
  -- ========================================================================
  FOR v_proposal_followup IN
    SELECT DISTINCT ON (pf.id)
      pf.id as followup_id,
      pf.proposal_id,
      pf.thread_id,
      pf.workspace_id,
      pf.contact_id,
      p.contact_id as lead_contact_id,
      pf.scheduled_at,
      pf.followup_type,
      p.proposal_analytics,
      c.first_name || ' ' || c.last_name as contact_name,
      c.user_id as assigned_user_id
    FROM public.proposal_followups pf
    JOIN public.proposals p ON p.id = pf.proposal_id
    LEFT JOIN public.contacts c ON c.id = pf.contact_id
    WHERE pf.workspace_id = p_workspace_id
      AND pf.status = 'scheduled'
      AND pf.scheduled_at <= NOW() + INTERVAL '1 day'
      AND (p_user_id IS NULL OR c.user_id = p_user_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.smartqueue_items sq
        WHERE sq.proposal_id = pf.proposal_id
          AND sq.source_type = 'proposal_followup'
          AND sq.status = 'active'
      )
  LOOP
    INSERT INTO public.smartqueue_items (
      workspace_id,
      user_id,
      source_type,
      source_id,
      task_category,
      task_type,
      title,
      description,
      reason,
      contact_id,
      thread_id,
      proposal_id,
      due_at,
      due_date,
      metadata,
      action_buttons
    )
    VALUES (
      v_proposal_followup.workspace_id,
      v_proposal_followup.assigned_user_id,
      'proposal_followup',
      v_proposal_followup.followup_id,
      'high_roi',
      'proposal_followup',
      format('Follow Up With %s — Proposal Viewed %sx', 
        v_proposal_followup.contact_name,
        COALESCE((v_proposal_followup.proposal_analytics->>'view_count')::text, '0')),
      NULL,
      format('Proposal viewed %s times, follow-up type: %s',
        COALESCE((v_proposal_followup.proposal_analytics->>'view_count')::text, '0'),
        v_proposal_followup.followup_type),
      v_proposal_followup.contact_id,
      v_proposal_followup.thread_id,
      v_proposal_followup.proposal_id,
      v_proposal_followup.scheduled_at,
      v_proposal_followup.scheduled_at::date,
      jsonb_build_object(
        'followup_type', v_proposal_followup.followup_type,
        'view_count', v_proposal_followup.proposal_analytics->>'view_count'
      ),
      jsonb_build_array(
        jsonb_build_object('label', 'Follow-Up Message', 'action', 'email', 'url', '/api/proposals/followup'),
        jsonb_build_object('label', 'Call Script', 'action', 'call', 'url', '/api/calls/script')
      )
    );
  END LOOP;
  
  -- ========================================================================
  -- 4. SUPPLEMENT REQUESTS (Scope Underpayment)
  -- ========================================================================
  FOR v_scope_comparison IN
    SELECT DISTINCT ON (sc.thread_id)
      sc.id as comparison_id,
      sc.thread_id,
      t.workspace_id,
      t.contact_id,
      t.lead_id,
      sc.total_supplement_opportunity,
      sc.missing_line_items,
      c.first_name || ' ' || c.last_name as contact_name,
      c.user_id as assigned_user_id,
      t.insurance_carrier
    FROM public.scope_comparisons sc
    JOIN public.inbox_threads t ON t.id = sc.thread_id
    LEFT JOIN public.contacts c ON c.id = t.contact_id
    WHERE t.workspace_id = p_workspace_id
      AND sc.total_supplement_opportunity > 1000 -- Only significant supplements
      AND (p_user_id IS NULL OR c.user_id = p_user_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.smartqueue_items sq
        WHERE sq.thread_id = sc.thread_id
          AND sq.source_type = 'scope_underpayment'
          AND sq.status = 'active'
      )
  LOOP
    INSERT INTO public.smartqueue_items (
      workspace_id,
      user_id,
      source_type,
      source_id,
      task_category,
      task_type,
      title,
      description,
      reason,
      contact_id,
      lead_id,
      thread_id,
      due_at,
      due_date,
      metadata,
      action_buttons
    )
    VALUES (
      v_scope_comparison.workspace_id,
      v_scope_comparison.assigned_user_id,
      'scope_underpayment',
      v_scope_comparison.comparison_id,
      'high_roi',
      'supplement_request',
      format('Send Supplement Request to %s', COALESCE(v_scope_comparison.insurance_carrier, 'Insurance')),
      NULL,
      format('Missing items + underpayment: $%s', v_scope_comparison.total_supplement_opportunity::text),
      v_scope_comparison.contact_id,
      v_scope_comparison.lead_id,
      v_scope_comparison.thread_id,
      NOW(),
      CURRENT_DATE,
      jsonb_build_object(
        'supplement_amount', v_scope_comparison.total_supplement_opportunity,
        'missing_items', v_scope_comparison.missing_line_items
      ),
      jsonb_build_array(
        jsonb_build_object('label', 'Generate Email', 'action', 'email', 'url', '/api/adjuster/supplement'),
        jsonb_build_object('label', 'View Scope', 'action', 'view', 'url', '/api/scope/comparison')
      )
    );
  END LOOP;
  
  -- ========================================================================
  -- 5. INSURANCE TIMELINE TASKS
  -- ========================================================================
  FOR v_insurance_timeline IN
    SELECT DISTINCT ON (it.contact_id)
      it.id as timeline_id,
      it.contact_id,
      it.workspace_id,
      it.stage,
      it.next_action,
      it.next_action_due_date,
      c.first_name || ' ' || c.last_name as contact_name,
      c.user_id as assigned_user_id,
      t.id as thread_id
    FROM public.insurance_timeline it
    JOIN public.contacts c ON c.id = it.contact_id
    LEFT JOIN public.inbox_threads t ON t.contact_id = c.id
    WHERE it.workspace_id = p_workspace_id
      AND it.is_current_stage = true
      AND it.next_action IS NOT NULL
      AND it.next_action_due_date <= CURRENT_DATE + INTERVAL '3 days'
      AND (p_user_id IS NULL OR c.user_id = p_user_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.smartqueue_items sq
        WHERE sq.contact_id = it.contact_id
          AND sq.source_type = 'insurance_timeline'
          AND sq.status = 'active'
      )
  LOOP
    INSERT INTO public.smartqueue_items (
      workspace_id,
      user_id,
      source_type,
      source_id,
      task_category,
      task_type,
      title,
      description,
      reason,
      contact_id,
      thread_id,
      due_at,
      due_date,
      metadata,
      action_buttons
    )
    VALUES (
      v_insurance_timeline.workspace_id,
      v_insurance_timeline.assigned_user_id,
      'insurance_timeline',
      v_insurance_timeline.timeline_id,
      CASE 
        WHEN v_insurance_timeline.stage IN ('approved', 'supplement_review') THEN 'high_roi'
        ELSE 'medium_roi'
      END,
      'insurance_timeline_action',
      format('%s — %s', v_insurance_timeline.contact_name, v_insurance_timeline.next_action),
      NULL,
      format('Insurance stage: %s', v_insurance_timeline.stage),
      v_insurance_timeline.contact_id,
      v_insurance_timeline.thread_id,
      COALESCE(v_insurance_timeline.next_action_due_date::timestamptz, NOW()),
      v_insurance_timeline.next_action_due_date,
      jsonb_build_object(
        'stage', v_insurance_timeline.stage,
        'next_action', v_insurance_timeline.next_action
      ),
      jsonb_build_array(
        jsonb_build_object('label', 'View Timeline', 'action', 'view', 'url', '/api/insurance/timeline'),
        jsonb_build_object('label', 'Mark Done', 'action', 'complete', 'url', '/api/smartqueue/complete')
      )
    );
  END LOOP;
  
  -- ========================================================================
  -- 6. CALENDAR EVENTS (Due Today/Upcoming)
  -- ========================================================================
  FOR v_calendar_event IN
    SELECT DISTINCT ON (ce.id)
      ce.id as event_id,
      ce.workspace_id,
      ce.contact_id,
      ce.title,
      ce.start_time,
      ce.end_time,
      ce.event_type,
      c.first_name || ' ' || c.last_name as contact_name,
      c.user_id as assigned_user_id,
      t.id as thread_id
    FROM public.calendar_events ce
    LEFT JOIN public.contacts c ON c.id = ce.contact_id
    LEFT JOIN public.inbox_threads t ON t.contact_id = c.id
    WHERE ce.workspace_id = p_workspace_id
      AND ce.start_time::date <= CURRENT_DATE + INTERVAL '1 day'
      AND ce.status != 'cancelled'
      AND (p_user_id IS NULL OR ce.assigned_to = p_user_id OR c.user_id = p_user_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.smartqueue_items sq
        WHERE sq.source_type = 'calendar_scheduler'
          AND sq.source_id = ce.id
          AND sq.status = 'active'
      )
  LOOP
    INSERT INTO public.smartqueue_items (
      workspace_id,
      user_id,
      source_type,
      source_id,
      task_category,
      task_type,
      title,
      description,
      reason,
      contact_id,
      thread_id,
      due_at,
      due_date,
      metadata,
      action_buttons
    )
    VALUES (
      v_calendar_event.workspace_id,
      v_calendar_event.assigned_user_id,
      'calendar_scheduler',
      v_calendar_event.event_id,
      CASE 
        WHEN v_calendar_event.event_type IN ('inspection', 'adjuster_meeting') THEN 'high_roi'
        ELSE 'medium_roi'
      END,
      'calendar_event',
      format('%s — %s', v_calendar_event.contact_name, v_calendar_event.title),
      NULL,
      format('Event scheduled for %s', v_calendar_event.start_time::text),
      v_calendar_event.contact_id,
      v_calendar_event.thread_id,
      v_calendar_event.start_time,
      v_calendar_event.start_time::date,
      jsonb_build_object(
        'event_type', v_calendar_event.event_type,
        'start_time', v_calendar_event.start_time,
        'end_time', v_calendar_event.end_time
      ),
      jsonb_build_array(
        jsonb_build_object('label', 'View Calendar', 'action', 'view', 'url', '/api/calendar/events'),
        jsonb_build_object('label', 'Mark Done', 'action', 'complete', 'url', '/api/smartqueue/complete')
      )
    );
  END LOOP;
  
  -- ========================================================================
  -- 7. TASKS_V3 (High Priority Tasks)
  -- ========================================================================
  FOR v_task IN
    SELECT DISTINCT ON (t.id)
      t.id as task_id,
      t.workspace_id,
      t.user_id,
      t.contact_id,
      t.lead_id,
      t.title,
      t.description,
      t.task_type,
      t.priority,
      t.priority_score,
      t.due_at,
      c.first_name || ' ' || c.last_name as contact_name
    FROM public.tasks_v3 t
    LEFT JOIN public.contacts c ON c.id = t.contact_id
    WHERE t.workspace_id = p_workspace_id
      AND t.status = 'open'
      AND t.priority IN ('critical', 'high')
      AND (p_user_id IS NULL OR t.user_id = p_user_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.smartqueue_items sq
        WHERE sq.source_type = 'task_v3'
          AND sq.source_id = t.id
          AND sq.status = 'active'
      )
  LOOP
    INSERT INTO public.smartqueue_items (
      workspace_id,
      user_id,
      source_type,
      source_id,
      task_category,
      task_type,
      title,
      description,
      reason,
      contact_id,
      lead_id,
      due_at,
      due_date,
      metadata,
      action_buttons
    )
    VALUES (
      v_task.workspace_id,
      v_task.user_id,
      'task_v3',
      v_task.task_id,
      CASE 
        WHEN v_task.priority = 'critical' THEN 'high_roi'
        WHEN v_task.priority = 'high' THEN 'high_roi'
        ELSE 'medium_roi'
      END,
      v_task.task_type::text,
      COALESCE(format('%s — %s', v_task.contact_name, v_task.title), v_task.title),
      v_task.description,
      format('Priority: %s, Score: %s', v_task.priority, COALESCE(v_task.priority_score::text, 'N/A')),
      v_task.contact_id,
      v_task.lead_id,
      v_task.due_at,
      v_task.due_at::date,
      jsonb_build_object(
        'task_type', v_task.task_type,
        'priority', v_task.priority,
        'priority_score', v_task.priority_score
      ),
      jsonb_build_array(
        jsonb_build_object('label', 'View Task', 'action', 'view', 'url', '/api/tasks/v3/' || v_task.task_id),
        jsonb_build_object('label', 'Mark Done', 'action', 'complete', 'url', '/api/smartqueue/complete')
      )
    );
  END LOOP;
  
  -- Recalculate priority scores for all new items
  PERFORM public.calculate_smartqueue_priority_score(id)
  FROM public.smartqueue_items
  WHERE workspace_id = p_workspace_id
    AND (p_user_id IS NULL OR user_id = p_user_id)
    AND status = 'active';
END;
$$;

-- ============================================================================
-- PART 4 — GET SMARTQUEUE FUNCTION (Role-Based Views)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_smartqueue(
  p_workspace_id uuid,
  p_user_id uuid DEFAULT NULL,
  p_role text DEFAULT NULL,
  p_money_mode boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  workspace_id uuid,
  user_id uuid,
  source_type text,
  source_id uuid,
  task_category text,
  task_type text,
  title text,
  description text,
  reason text,
  contact_id uuid,
  lead_id uuid,
  thread_id uuid,
  proposal_id uuid,
  priority_score numeric,
  score_breakdown jsonb,
  action_buttons jsonb,
  due_at timestamptz,
  due_date date,
  status text,
  metadata jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sq.id,
    sq.workspace_id,
    sq.user_id,
    sq.source_type,
    sq.source_id,
    sq.task_category,
    sq.task_type,
    sq.title,
    sq.description,
    sq.reason,
    sq.contact_id,
    sq.lead_id,
    sq.thread_id,
    sq.proposal_id,
    sq.priority_score,
    sq.score_breakdown,
    sq.action_buttons,
    sq.due_at,
    sq.due_date,
    sq.status,
    sq.metadata,
    sq.created_at,
    sq.updated_at
  FROM public.smartqueue_items sq
  WHERE sq.workspace_id = p_workspace_id
    AND sq.status = 'active'
    AND (p_user_id IS NULL OR sq.user_id = p_user_id)
    AND (
      -- Role-based filtering
      CASE p_role
        WHEN 'owner' THEN
          -- Owner: highest ROI tasks, scheduling, revenue-critical
          sq.task_category = 'high_roi'
          OR sq.task_type IN ('install_ready_call', 'supplement_request', 'proposal_followup', 'calendar_event')
        WHEN 'sales_rep' THEN
          -- Sales Rep: follow-ups, closing tasks, homeowner calls
          sq.task_type IN ('proposal_followup', 'install_ready_call', 'next_best_action', 'lead_follow_up')
        WHEN 'office_staff' THEN
          -- Office Staff: document requests, scheduling, invoice handling
          sq.task_type IN ('calendar_event', 'insurance_timeline_action', 'file_memory', 'admin')
        WHEN 'adjuster_helper' THEN
          -- Adjuster Helper: supplement reviews, adjuster communication, scope comparison
          sq.task_type IN ('supplement_request', 'adjuster_request', 'scope_comparison')
        ELSE
          -- Default: show all
          true
      END
    )
    AND (
      -- Money Mode filter
      CASE 
        WHEN p_money_mode = true THEN
          sq.task_category = 'high_roi'
          AND sq.task_type IN ('install_ready_call', 'supplement_request', 'proposal_followup')
        ELSE
          true
      END
    )
  ORDER BY 
    sq.priority_score DESC NULLS LAST,
    sq.due_at ASC NULLS LAST;
END;
$$;

-- ============================================================================
-- PART 5 — TRIGGERS FOR AUTO-REFRESH
-- ============================================================================

-- Trigger: Refresh SmartQueue when new email arrives
CREATE OR REPLACE FUNCTION public.trigger_refresh_smartqueue_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Refresh SmartQueue for the workspace
  PERFORM public.refresh_smartqueue(
    (SELECT workspace_id FROM public.inbox_threads WHERE id = NEW.thread_id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_smartqueue_on_message ON public.inbox_messages;
CREATE TRIGGER trg_refresh_smartqueue_on_message
AFTER INSERT ON public.inbox_messages
FOR EACH ROW
WHEN (NEW.direction = 'in')
EXECUTE FUNCTION public.trigger_refresh_smartqueue_on_message();

-- Trigger: Refresh SmartQueue when file is uploaded
CREATE OR REPLACE FUNCTION public.trigger_refresh_smartqueue_on_file()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Refresh SmartQueue for the workspace
  PERFORM public.refresh_smartqueue(
    (SELECT workspace_id FROM public.contacts WHERE id = NEW.contact_id)
  );
  RETURN NEW;
END;
$$;

-- Trigger: Refresh SmartQueue when proposal is viewed
CREATE OR REPLACE FUNCTION public.trigger_refresh_smartqueue_on_proposal_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Refresh SmartQueue for the workspace
  PERFORM public.refresh_smartqueue(
    (SELECT workspace_id FROM public.proposals WHERE id = NEW.proposal_id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_smartqueue_on_proposal_event ON public.proposal_events;
CREATE TRIGGER trg_refresh_smartqueue_on_proposal_event
AFTER INSERT ON public.proposal_events
FOR EACH ROW
EXECUTE FUNCTION public.trigger_refresh_smartqueue_on_proposal_event();

-- Trigger: Refresh SmartQueue when install-ready score changes
CREATE OR REPLACE FUNCTION public.trigger_refresh_smartqueue_on_install_ready()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF OLD.install_ready_score IS DISTINCT FROM NEW.install_ready_score THEN
    PERFORM public.refresh_smartqueue(NEW.workspace_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_smartqueue_on_install_ready ON public.inbox_threads;
CREATE TRIGGER trg_refresh_smartqueue_on_install_ready
AFTER UPDATE OF install_ready_score ON public.inbox_threads
FOR EACH ROW
EXECUTE FUNCTION public.trigger_refresh_smartqueue_on_install_ready();

-- Trigger: Refresh SmartQueue when supplement is detected
CREATE OR REPLACE FUNCTION public.trigger_refresh_smartqueue_on_supplement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.refresh_smartqueue(
    (SELECT workspace_id FROM public.inbox_threads WHERE id = NEW.thread_id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_smartqueue_on_supplement ON public.scope_comparisons;
CREATE TRIGGER trg_refresh_smartqueue_on_supplement
AFTER INSERT ON public.scope_comparisons
FOR EACH ROW
WHEN (NEW.total_supplement_opportunity > 1000)
EXECUTE FUNCTION public.trigger_refresh_smartqueue_on_supplement();

-- ============================================================================
-- PART 6 — UPDATED_AT TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_smartqueue_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_smartqueue_updated_at ON public.smartqueue_items;
CREATE TRIGGER trg_smartqueue_updated_at
BEFORE UPDATE ON public.smartqueue_items
FOR EACH ROW
EXECUTE FUNCTION public.set_smartqueue_updated_at();

-- ============================================================================
-- PART 7 — SYNC DUE_DATE FROM DUE_AT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_smartqueue_due_date()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.due_at IS NOT NULL THEN
    NEW.due_date := NEW.due_at::date;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_smartqueue_due_date ON public.smartqueue_items;
CREATE TRIGGER trg_sync_smartqueue_due_date
BEFORE INSERT OR UPDATE OF due_at ON public.smartqueue_items
FOR EACH ROW
EXECUTE FUNCTION public.sync_smartqueue_due_date();

-- ============================================================================
-- PART 8 — ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.smartqueue_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "smartqueue_select_workspace"
  ON public.smartqueue_items
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "smartqueue_insert_workspace"
  ON public.smartqueue_items
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "smartqueue_update_workspace"
  ON public.smartqueue_items
  FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "smartqueue_delete_workspace"
  ON public.smartqueue_items
  FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 9 — NOTIFICATION INTEGRATION
-- ============================================================================

-- Function to create notification when high-priority SmartQueue item is added
CREATE OR REPLACE FUNCTION public.notify_smartqueue_item_added()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_title text;
  v_notification_body text;
BEGIN
  -- Only notify for high ROI items
  IF NEW.task_category = 'high_roi' AND NEW.status = 'active' THEN
    v_notification_title := format('New HIGH PRIORITY task: %s', NEW.title);
    v_notification_body := COALESCE(NEW.reason, NEW.description, 'High ROI action added to SmartQueue');
    
    -- Create notification if user is assigned
    IF NEW.user_id IS NOT NULL THEN
      -- Try to insert with category if column exists, otherwise without
      BEGIN
        INSERT INTO public.notifications (
          workspace_id,
          user_id,
          type,
          category,
          title,
          body,
          link,
          read,
          entity_type,
          entity_id
        )
        VALUES (
          NEW.workspace_id,
          NEW.user_id,
          'task_assigned',
          'task',
          v_notification_title,
          v_notification_body,
          format('/smartqueue?item_id=%s', NEW.id),
          false,
          'smartqueue_item',
          NEW.id
        );
      EXCEPTION WHEN undefined_column THEN
        -- Fallback if category column doesn't exist
        INSERT INTO public.notifications (
          workspace_id,
          user_id,
          type,
          title,
          body,
          link,
          read
        )
        VALUES (
          NEW.workspace_id,
          NEW.user_id,
          'task_assigned',
          v_notification_title,
          v_notification_body,
          format('/smartqueue?item_id=%s', NEW.id),
          false
        );
      END;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_smartqueue_item_added ON public.smartqueue_items;
CREATE TRIGGER trg_notify_smartqueue_item_added
AFTER INSERT ON public.smartqueue_items
FOR EACH ROW
WHEN (NEW.task_category = 'high_roi' AND NEW.status = 'active')
EXECUTE FUNCTION public.notify_smartqueue_item_added();

-- Function to notify when proposal is viewed (triggers SmartQueue update)
CREATE OR REPLACE FUNCTION public.notify_proposal_viewed_smartqueue()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_proposal RECORD;
  v_thread RECORD;
  v_user_id uuid;
BEGIN
  -- Get proposal and thread info
  SELECT p.*, t.user_id INTO v_proposal, v_thread
  FROM public.proposals p
  JOIN public.inbox_threads t ON t.id = p.thread_id
  WHERE p.id = NEW.proposal_id;
  
  IF v_thread.user_id IS NOT NULL AND NEW.event_type IN ('opened', 'reopened') THEN
    -- Check if proposal was viewed multiple times (hot behavior)
    DECLARE
      v_view_count integer;
    BEGIN
      SELECT COUNT(*) INTO v_view_count
      FROM public.proposal_events
      WHERE proposal_id = NEW.proposal_id
        AND event_type IN ('opened', 'reopened')
        AND event_timestamp > NOW() - INTERVAL '1 hour';
      
      IF v_view_count >= 2 THEN
        -- Try to insert with category if column exists
        BEGIN
          INSERT INTO public.notifications (
            workspace_id,
            user_id,
            type,
            category,
            title,
            body,
            link,
            read,
            entity_type,
            entity_id
          )
          VALUES (
            v_proposal.workspace_id,
            v_thread.user_id,
            'hot_lead',
            'lead',
            format('Proposal viewed %sx — moved to top of SmartQueue', v_view_count),
            'Homeowner is showing strong interest. Check SmartQueue for follow-up action.',
            format('/smartqueue?proposal_id=%s', NEW.proposal_id),
            false,
            'proposal',
            NEW.proposal_id
          );
        EXCEPTION WHEN undefined_column THEN
          -- Fallback if category/entity columns don't exist
          INSERT INTO public.notifications (
            workspace_id,
            user_id,
            type,
            title,
            body,
            link,
            read
          )
          VALUES (
            v_proposal.workspace_id,
            v_thread.user_id,
            'hot_lead',
            format('Proposal viewed %sx — moved to top of SmartQueue', v_view_count),
            'Homeowner is showing strong interest. Check SmartQueue for follow-up action.',
            format('/smartqueue?proposal_id=%s', NEW.proposal_id),
            false
          );
        END;
      END IF;
    END;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_proposal_viewed_smartqueue ON public.proposal_events;
CREATE TRIGGER trg_notify_proposal_viewed_smartqueue
AFTER INSERT ON public.proposal_events
FOR EACH ROW
WHEN (NEW.event_type IN ('opened', 'reopened'))
EXECUTE FUNCTION public.notify_proposal_viewed_smartqueue();

-- ============================================================================
-- PART 10 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.smartqueue_items IS 'SmartQueue v1 — Unified prioritized work queue that aggregates tasks from all SmartSend engines';
COMMENT ON COLUMN public.smartqueue_items.source_type IS 'Source of the task: next_best_action, calendar_scheduler, proposal_followup, insurance_timeline, file_memory, reply_classification, install_ready_predictor, scope_underpayment, crm_pipeline, task_v3, adjuster_request, revenue_forecast';
COMMENT ON COLUMN public.smartqueue_items.task_category IS 'ROI category: high_roi (score >= 70), medium_roi (score 40-69), low_roi (score < 40)';
COMMENT ON COLUMN public.smartqueue_items.priority_score IS 'Calculated priority score (0-100) based on install-ready, homeowner intent, insurance status, proposal behavior, reply urgency, underpayment, revenue value, adjuster deadline, and lead age';
COMMENT ON FUNCTION public.calculate_smartqueue_priority_score IS 'Calculates SmartQueue priority score (0-100) based on 9 factors';
COMMENT ON FUNCTION public.refresh_smartqueue IS 'Refreshes SmartQueue by aggregating tasks from all sources (Next Best Action, Install-Ready, Proposal Follow-Ups, Supplements, Insurance Timeline, Calendar, Tasks v3)';
COMMENT ON FUNCTION public.get_smartqueue IS 'Returns SmartQueue items filtered by role (owner, sales_rep, office_staff, adjuster_helper) and optionally filtered by Money Mode (high ROI only)';
COMMENT ON FUNCTION public.notify_smartqueue_item_added IS 'Creates notification when high-priority SmartQueue item is added';
COMMENT ON FUNCTION public.notify_proposal_viewed_smartqueue IS 'Creates notification when proposal is viewed multiple times (hot behavior)';

