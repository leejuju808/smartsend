-- =========================================================
-- Block 22073 — SmartSend Roofing Job Save Engine v1
-- (Automatic Job Recovery System — Saves Dying Leads Before They're Lost)
-- =========================================================
-- 
-- This is one of the most important systems in SmartSend.
-- 
-- The Job Save Engine listens to 12 danger signals from other modules:
-- - Risk Engine (risk = high or critical, risk jumps suddenly)
-- - Job Health Score (drops below 50 = at-risk, below 30 = critical, declines >15 points in 24h)
-- - Momentum Score (stuck below 30, declining trend)
-- - Experience Score (homeowner frustration, negative tone events, ghosting detected)
-- - Estimator Behavior (missed follow-ups, proposal delay, slow replies)
-- - Pipeline Behavior (job stuck in stage too long)
--
-- When ANY trigger condition is met, the Job Save Engine:
-- 1. Creates a Job Save Event
-- 2. Auto-creates critical tasks in Action Queue
-- 3. AI generates a suggested recovery message
-- 4. Surfaces job in Action Queue
-- 5. Makes job glow red in Pipeline view
-- 6. Optionally alerts owner
--
-- This creates MASSIVE retention and real revenue for roofers.
-- =========================================================

-- ============================================================================
-- 1. CREATE job_save_events TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.job_save_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  event_type TEXT NOT NULL CHECK (event_type IN (
    'momentum_drop',
    'health_drop',
    'ghosting',
    'risk_spike',
    'proposal_delay',
    'missed_followup',
    'negative_tone',
    'experience_drop',
    'probability_drop',
    'stuck_in_stage',
    'no_reply_48h',
    'frustration_detected'
  )),
  
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  reason TEXT,
  
  -- Snapshot of lead state at time of trigger
  lead_snapshot JSONB DEFAULT '{}'::jsonb,
  
  -- Recovery action taken
  recovery_action TEXT,
  recovery_message_draft TEXT,
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'dismissed')),
  resolved_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 2. CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_job_save_events_lead_id 
  ON public.job_save_events(lead_id);

CREATE INDEX IF NOT EXISTS idx_job_save_events_workspace_status 
  ON public.job_save_events(workspace_id, status) 
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_job_save_events_severity 
  ON public.job_save_events(severity, created_at DESC) 
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_job_save_events_event_type 
  ON public.job_save_events(event_type);

CREATE INDEX IF NOT EXISTS idx_job_save_events_created_at 
  ON public.job_save_events(created_at DESC);

-- ============================================================================
-- 3. ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.job_save_events ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view events in their workspace
CREATE POLICY "Users can view job save events in their workspace"
  ON public.job_save_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = job_save_events.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Policy: Service role has full access
CREATE POLICY "Service role has full access to job save events"
  ON public.job_save_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 4. ADD job_save TASK TYPE TO action_queue_tasks
-- ============================================================================
-- Note: We need to drop and recreate the CHECK constraint to add the new task type

-- First, drop the existing constraint
ALTER TABLE public.action_queue_tasks
  DROP CONSTRAINT IF EXISTS action_queue_tasks_task_type_check;

-- Recreate with job_save included
ALTER TABLE public.action_queue_tasks
  ADD CONSTRAINT action_queue_tasks_task_type_check 
  CHECK (task_type IN (
    'call_homeowner',
    'send_proposal',
    'follow_up_hot',
    'follow_up_warm',
    'save_critical_risk_job',
    'job_save',
    'reply_to_angry_homeowner',
    'book_estimate',
    'review_stuck_job',
    'owner_review_high_value',
    'resurrection_follow_up'
  ));

-- ============================================================================
-- 5. CREATE FUNCTION TO CHECK TRIGGER CONDITIONS
-- ============================================================================
-- This function checks if a lead meets any Job Save trigger conditions
-- Can be called from edge functions or triggers

CREATE OR REPLACE FUNCTION public.check_job_save_triggers(p_lead_id UUID)
RETURNS TABLE (
  should_trigger BOOLEAN,
  trigger_type TEXT,
  severity TEXT,
  reason TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_lead RECORD;
  v_health_score INTEGER;
  v_momentum_score NUMERIC;
  v_experience_score NUMERIC;
  v_risk_category TEXT;
  v_job_probability NUMERIC;
  v_last_reply_at TIMESTAMPTZ;
  v_proposal_due_at TIMESTAMPTZ;
  v_stage_entered_at TIMESTAMPTZ;
  v_homeowner_tone TEXT;
BEGIN
  -- Fetch lead data
  SELECT 
    l.id,
    l.workspace_id,
    l.job_health_score,
    l.momentum_score,
    l.homeowner_experience_score,
    l.risk_category,
    l.job_probability,
    l.proposal_due_at,
    l.stage_entered_at,
    l.last_reply_at
  INTO v_lead
  FROM public.leads l
  WHERE l.id = p_lead_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;
  
  v_health_score := COALESCE(v_lead.job_health_score, 50);
  v_momentum_score := COALESCE(v_lead.momentum_score, 50);
  v_experience_score := COALESCE(v_lead.homeowner_experience_score, 50);
  v_risk_category := COALESCE(v_lead.risk_category, 'low');
  v_job_probability := COALESCE(v_lead.job_probability, 0);
  v_last_reply_at := v_lead.last_reply_at;
  v_proposal_due_at := v_lead.proposal_due_at;
  v_stage_entered_at := v_lead.stage_entered_at;
  
  -- Get most recent homeowner tone
  SELECT homeowner_tone INTO v_homeowner_tone
  FROM public.lead_activities
  WHERE lead_id = p_lead_id
    AND kind = 'message_in'
    AND homeowner_tone IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 1;
  
  -- Check trigger conditions (in order of severity)
  
  -- CRITICAL: Health score < 30
  IF v_health_score < 30 THEN
    RETURN QUERY SELECT TRUE, 'health_drop'::TEXT, 'critical'::TEXT, 
      format('Job health score dropped to %s (critical threshold: <30)', v_health_score);
    RETURN;
  END IF;
  
  -- CRITICAL: Risk category is critical
  IF v_risk_category = 'critical' THEN
    RETURN QUERY SELECT TRUE, 'risk_spike'::TEXT, 'critical'::TEXT,
      'Risk category escalated to critical';
    RETURN;
  END IF;
  
  -- CRITICAL: Ghosting detected (no reply > 48 hours)
  IF v_last_reply_at IS NOT NULL AND v_last_reply_at < NOW() - INTERVAL '48 hours' THEN
    RETURN QUERY SELECT TRUE, 'ghosting'::TEXT, 'critical'::TEXT,
      format('No reply from homeowner for %s hours', EXTRACT(EPOCH FROM (NOW() - v_last_reply_at)) / 3600);
    RETURN;
  END IF;
  
  -- HIGH: Health score < 50
  IF v_health_score < 50 THEN
    RETURN QUERY SELECT TRUE, 'health_drop'::TEXT, 'high'::TEXT,
      format('Job health score dropped to %s (at-risk threshold: <50)', v_health_score);
    RETURN;
  END IF;
  
  -- HIGH: Risk category is high
  IF v_risk_category = 'high' THEN
    RETURN QUERY SELECT TRUE, 'risk_spike'::TEXT, 'high'::TEXT,
      'Risk category escalated to high';
    RETURN;
  END IF;
  
  -- HIGH: Negative tone detected
  IF v_homeowner_tone IN ('angry', 'frustrated', 'impatient') THEN
    RETURN QUERY SELECT TRUE, 'negative_tone'::TEXT, 'high'::TEXT,
      format('Homeowner tone detected as: %s', v_homeowner_tone);
    RETURN;
  END IF;
  
  -- MEDIUM: Momentum score < 30
  IF v_momentum_score < 30 THEN
    RETURN QUERY SELECT TRUE, 'momentum_drop'::TEXT, 'medium'::TEXT,
      format('Momentum score dropped to %s (threshold: <30)', v_momentum_score);
    RETURN;
  END IF;
  
  -- MEDIUM: Experience score < 35
  IF v_experience_score < 35 THEN
    RETURN QUERY SELECT TRUE, 'experience_drop'::TEXT, 'medium'::TEXT,
      format('Homeowner experience score dropped to %s (threshold: <35)', v_experience_score);
    RETURN;
  END IF;
  
  -- MEDIUM: Proposal delay > 24 hours
  IF v_proposal_due_at IS NOT NULL AND v_proposal_due_at < NOW() THEN
    RETURN QUERY SELECT TRUE, 'proposal_delay'::TEXT, 'medium'::TEXT,
      format('Proposal overdue by %s hours', EXTRACT(EPOCH FROM (NOW() - v_proposal_due_at)) / 3600);
    RETURN;
  END IF;
  
  -- MEDIUM: Probability drop > 20%
  -- Note: This would require historical tracking, simplified here
  IF v_job_probability < 30 THEN
    RETURN QUERY SELECT TRUE, 'probability_drop'::TEXT, 'medium'::TEXT,
      format('Job probability dropped to %s%%', v_job_probability);
    RETURN;
  END IF;
  
  -- No triggers met
  RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::TEXT, NULL::TEXT;
END;
$$;

COMMENT ON FUNCTION public.check_job_save_triggers IS 'Block 22073: Checks if a lead meets Job Save Engine trigger conditions and returns trigger details';

-- ============================================================================
-- 6. COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE public.job_save_events IS 'Block 22073: Job Save Engine events - tracks when jobs enter save mode and recovery actions taken';
COMMENT ON COLUMN public.job_save_events.event_type IS 'Block 22073: Type of danger signal that triggered the save event';
COMMENT ON COLUMN public.job_save_events.severity IS 'Block 22073: Severity level: low, medium, high, critical';
COMMENT ON COLUMN public.job_save_events.lead_snapshot IS 'Block 22073: JSON snapshot of lead state at time of trigger (scores, risk, etc.)';
COMMENT ON COLUMN public.job_save_events.recovery_message_draft IS 'Block 22073: AI-generated recovery message suggestion';









































