-- =========================================================
-- Block 75000 — SmartSend Roofing
-- "Full Automation Rules Engine (If Lead → Then Action)" v1
-- =========================================================
-- 
-- This is the moment SmartSend stops being "A CRM tool"
-- and becomes "A 24/7 operations assistant that runs their business while they sleep."
-- 
-- Roofers will see:
-- - Jobs they forgot now being saved automatically
-- - Leads being followed up automatically
-- - Estimates being sent faster
-- - Crews being notified without calling/texting
-- - Pipeline updating without effort
-- - Production team always knowing the next step
-- - Safety issues instantly flagged
--
-- This feature makes SmartSend the killer advantage.
-- =========================================================

-- ============================================================================
-- 1. AUTOMATION_RULES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID, -- References roofing_companies or companies
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Rule Identity
  name TEXT NOT NULL,
  description TEXT,
  
  -- Trigger Configuration
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'lead_reply',
    'new_lead',
    'estimate_uploaded',
    'estimate_sent',
    'pipeline_stage_changed',
    'job_created',
    'job_completed',
    'safety_flag'
  )),
  
  -- Conditions (JSONB for flexible filtering)
  -- Example: {"intent": "Hot", "pipeline_stage": "New Lead", "urgency": "High"}
  conditions JSONB DEFAULT '{}'::jsonb,
  
  -- Action Configuration
  action_type TEXT NOT NULL CHECK (action_type IN (
    'send_email',
    'send_sms',
    'move_pipeline_stage',
    'create_followup',
    'assign_team_member',
    'create_job',
    'send_owner_alert',
    'update_job_status'
  )),
  
  -- Action Payload (JSONB for action-specific data)
  -- Example: {"stage_name": "Estimate Needed", "email_template_id": "xxx", "delay_minutes": 60}
  action_payload JSONB DEFAULT '{}'::jsonb,
  
  -- Rule Status
  enabled BOOLEAN DEFAULT true,
  
  -- Metadata
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_automation_rules_company_id ON public.automation_rules(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_automation_rules_workspace_id ON public.automation_rules(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_automation_rules_trigger_type ON public.automation_rules(trigger_type) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_automation_rules_enabled ON public.automation_rules(enabled, trigger_type) WHERE enabled = true;

-- ============================================================================
-- 2. AUTOMATION_LOGS TABLE (for debugging and transparency)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.automation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID REFERENCES public.automation_rules(id) ON DELETE SET NULL,
  company_id UUID,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Trigger Information
  trigger_type TEXT NOT NULL,
  trigger_entity_id UUID, -- lead_id, job_id, estimate_id, etc.
  trigger_entity_type TEXT, -- 'lead', 'job', 'estimate', etc.
  
  -- Execution Outcome
  outcome TEXT NOT NULL CHECK (outcome IN ('executed', 'skipped', 'failed')),
  
  -- Details (JSONB for flexible logging)
  -- Example: {"reason": "Condition not met", "error": "Stage not found", "execution_time_ms": 45}
  details JSONB DEFAULT '{}'::jsonb,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_automation_logs_rule_id ON public.automation_logs(rule_id) WHERE rule_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_automation_logs_company_id ON public.automation_logs(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_automation_logs_workspace_id ON public.automation_logs(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_automation_logs_trigger ON public.automation_logs(trigger_type, trigger_entity_id);
CREATE INDEX IF NOT EXISTS idx_automation_logs_outcome ON public.automation_logs(outcome, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_logs_created_at ON public.automation_logs(created_at DESC);

-- ============================================================================
-- 3. UPDATED_AT TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION update_automation_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_automation_rules_updated_at ON public.automation_rules;
CREATE TRIGGER trg_automation_rules_updated_at
BEFORE UPDATE ON public.automation_rules
FOR EACH ROW
EXECUTE FUNCTION update_automation_rules_updated_at();

-- ============================================================================
-- 4. ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_logs ENABLE ROW LEVEL SECURITY;

-- Helper function to check workspace access
CREATE OR REPLACE FUNCTION has_workspace_access(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS(
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id
      AND wm.user_id = auth.uid()
  );
$$;

-- Helper function to check company access (for roofing_companies)
CREATE OR REPLACE FUNCTION has_roofing_company_access(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS(
    SELECT 1
    FROM public.roofing_company_members rcm
    WHERE rcm.roofing_company_id = p_company_id
      AND rcm.user_id = auth.uid()
      AND rcm.is_active = true
  );
$$;

-- RLS Policies for automation_rules
DROP POLICY IF EXISTS "automation_rules_select" ON public.automation_rules;
CREATE POLICY "automation_rules_select" ON public.automation_rules
  FOR SELECT
  USING (
    (workspace_id IS NOT NULL AND has_workspace_access(workspace_id))
    OR (company_id IS NOT NULL AND has_roofing_company_access(company_id))
  );

DROP POLICY IF EXISTS "automation_rules_insert" ON public.automation_rules;
CREATE POLICY "automation_rules_insert" ON public.automation_rules
  FOR INSERT
  WITH CHECK (
    (workspace_id IS NOT NULL AND has_workspace_access(workspace_id))
    OR (company_id IS NOT NULL AND has_roofing_company_access(company_id))
  );

DROP POLICY IF EXISTS "automation_rules_update" ON public.automation_rules;
CREATE POLICY "automation_rules_update" ON public.automation_rules
  FOR UPDATE
  USING (
    (workspace_id IS NOT NULL AND has_workspace_access(workspace_id))
    OR (company_id IS NOT NULL AND has_roofing_company_access(company_id))
  );

DROP POLICY IF EXISTS "automation_rules_delete" ON public.automation_rules;
CREATE POLICY "automation_rules_delete" ON public.automation_rules
  FOR DELETE
  USING (
    (workspace_id IS NOT NULL AND has_workspace_access(workspace_id))
    OR (company_id IS NOT NULL AND has_roofing_company_access(company_id))
  );

-- RLS Policies for automation_logs
DROP POLICY IF EXISTS "automation_logs_select" ON public.automation_logs;
CREATE POLICY "automation_logs_select" ON public.automation_logs
  FOR SELECT
  USING (
    (workspace_id IS NOT NULL AND has_workspace_access(workspace_id))
    OR (company_id IS NOT NULL AND has_roofing_company_access(company_id))
  );

DROP POLICY IF EXISTS "automation_logs_insert" ON public.automation_logs;
CREATE POLICY "automation_logs_insert" ON public.automation_logs
  FOR INSERT
  WITH CHECK (
    (workspace_id IS NOT NULL AND has_workspace_access(workspace_id))
    OR (company_id IS NOT NULL AND has_roofing_company_access(company_id))
  );

-- ============================================================================
-- 5. FUNCTION: Execute Automation Rule
-- ============================================================================

CREATE OR REPLACE FUNCTION execute_automation_rule(
  p_rule_id UUID,
  p_trigger_entity_id UUID,
  p_trigger_entity_type TEXT DEFAULT 'lead'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rule RECORD;
  v_outcome TEXT;
  v_details JSONB;
  v_condition_met BOOLEAN := true;
  v_action_result JSONB;
BEGIN
  -- Get the rule
  SELECT * INTO v_rule
  FROM public.automation_rules
  WHERE id = p_rule_id
    AND enabled = true;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Rule not found or disabled'
    );
  END IF;
  
  -- Check conditions (simplified - can be expanded)
  -- For now, we'll log the execution and let the application layer handle condition checking
  v_condition_met := true;
  
  -- Execute action based on action_type
  -- Note: This is a placeholder - actual action execution should be done in application layer
  -- This function primarily logs the execution attempt
  v_action_result := jsonb_build_object(
    'action_type', v_rule.action_type,
    'status', 'pending_application_execution'
  );
  
  v_outcome := 'executed';
  v_details := jsonb_build_object(
    'action_result', v_action_result,
    'conditions_met', v_condition_met
  );
  
  -- Log the execution
  INSERT INTO public.automation_logs (
    rule_id,
    company_id,
    workspace_id,
    trigger_type,
    trigger_entity_id,
    trigger_entity_type,
    outcome,
    details
  )
  VALUES (
    p_rule_id,
    v_rule.company_id,
    v_rule.workspace_id,
    v_rule.trigger_type,
    p_trigger_entity_id,
    p_trigger_entity_type,
    v_outcome,
    v_details
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'outcome', v_outcome,
    'details', v_details
  );
END;
$$;

-- ============================================================================
-- 6. FUNCTION: Get Rules for Trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION get_automation_rules_for_trigger(
  p_trigger_type TEXT,
  p_company_id UUID DEFAULT NULL,
  p_workspace_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  trigger_type TEXT,
  action_type TEXT,
  conditions JSONB,
  action_payload JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT 
    ar.id,
    ar.name,
    ar.trigger_type,
    ar.action_type,
    ar.conditions,
    ar.action_payload
  FROM public.automation_rules ar
  WHERE ar.enabled = true
    AND ar.trigger_type = p_trigger_type
    AND (
      (p_company_id IS NOT NULL AND ar.company_id = p_company_id)
      OR (p_workspace_id IS NOT NULL AND ar.workspace_id = p_workspace_id)
      OR (p_company_id IS NULL AND p_workspace_id IS NULL)
    )
  ORDER BY ar.created_at;
$$;

-- ============================================================================
-- 7. PRE-BUILT TEMPLATE INSERTION FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION create_default_automation_templates(
  p_company_id UUID DEFAULT NULL,
  p_workspace_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Template 1: AUTO-HOT LEAD RESPONSE
  INSERT INTO public.automation_rules (
    company_id,
    workspace_id,
    name,
    description,
    trigger_type,
    conditions,
    action_type,
    action_payload,
    enabled
  )
  VALUES (
    p_company_id,
    p_workspace_id,
    'Auto-Hot Lead Response',
    'Automatically moves hot leads to Estimate Needed stage and alerts owner',
    'lead_reply',
    '{"intent": "Hot"}'::jsonb,
    'move_pipeline_stage',
    '{"stage_name": "Estimate Needed", "send_owner_alert": true}'::jsonb,
    false -- Disabled by default, user can enable
  )
  ON CONFLICT DO NOTHING;
  
  -- Template 2: AUTO-WARM LEAD NURTURE
  INSERT INTO public.automation_rules (
    company_id,
    workspace_id,
    name,
    description,
    trigger_type,
    conditions,
    action_type,
    action_payload,
    enabled
  )
  VALUES (
    p_company_id,
    p_workspace_id,
    'Auto-Warm Lead Nurture',
    'Sends educational email to warm leads and moves to Follow-Up stage',
    'lead_reply',
    '{"intent": "Warm"}'::jsonb,
    'send_email',
    '{"template_type": "educational", "move_stage": "Follow-Up"}'::jsonb,
    false
  )
  ON CONFLICT DO NOTHING;
  
  -- Template 3: AUTO-ESTIMATE FOLLOW-UP
  INSERT INTO public.automation_rules (
    company_id,
    workspace_id,
    name,
    description,
    trigger_type,
    conditions,
    action_type,
    action_payload,
    enabled
  )
  VALUES (
    p_company_id,
    p_workspace_id,
    'Auto-Estimate Follow-Up',
    'Creates follow-up tasks at 1, 3, and 7 days after estimate sent',
    'estimate_sent',
    '{}'::jsonb,
    'create_followup',
    '{"followup_days": [1, 3, 7]}'::jsonb,
    false
  )
  ON CONFLICT DO NOTHING;
  
  -- Template 4: AUTO-JOB CREATION
  INSERT INTO public.automation_rules (
    company_id,
    workspace_id,
    name,
    description,
    trigger_type,
    conditions,
    action_type,
    action_payload,
    enabled
  )
  VALUES (
    p_company_id,
    p_workspace_id,
    'Auto-Job Creation',
    'Creates job when lead intent is "Ready to book" and moves to Won stage',
    'lead_reply',
    '{"intent": "Ready to book"}'::jsonb,
    'create_job',
    '{"move_stage": "Won", "notify_production": true}'::jsonb,
    false
  )
  ON CONFLICT DO NOTHING;
  
  -- Template 5: SAFETY VIOLATION ALERT
  INSERT INTO public.automation_rules (
    company_id,
    workspace_id,
    name,
    description,
    trigger_type,
    conditions,
    action_type,
    action_payload,
    enabled
  )
  VALUES (
    p_company_id,
    p_workspace_id,
    'Safety Violation Alert',
    'Sends emergency alert to owner when PPE check fails or incident severity is high',
    'safety_flag',
    '{"severity": "high"}'::jsonb,
    'send_owner_alert',
    '{"alert_type": "emergency", "flag_job": true, "require_followup": true}'::jsonb,
    false
  )
  ON CONFLICT DO NOTHING;
END;
$$;



























