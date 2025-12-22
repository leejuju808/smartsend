-- =========================================================
-- Block 232000 — SmartSend Roofing Automation Engine v1
-- (Universal Automation Engine + Smart Rules System)
-- =========================================================
-- 
-- THE AUTOMATION ENGINE THAT CONNECTS EVERY PART OF SMARTSEND
-- 
-- This block makes SmartSend a SELF-OPERATING MACHINE.
-- 
-- Roofers can create IF → THEN rules across ANY module:
-- - Automated follow-ups
-- - Automated assignments
-- - Automated emails / SMS
-- - Automated task creation
-- - Automated tagging and workflow changes
-- - Automated customer updates
-- - Automated production logic
-- - Automated safety escalations
-- - Automated accounting triggers
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE automations TABLE
-- ============================================================================
-- The automation definition with trigger configuration

CREATE TABLE IF NOT EXISTS public.automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roofing_company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  
  -- Basic Info
  name text NOT NULL,
  description text,
  
  -- Trigger Configuration
  trigger_type text NOT NULL CHECK (trigger_type IN (
    'event',           -- Event-based (proposal_viewed, contract_signed, etc.)
    'schedule',        -- Time-based (daily, weekly, etc.)
    'condition'        -- Condition-based (payment_overdue, etc.)
  )),
  trigger_value text NOT NULL,  -- e.g., 'proposal_viewed', 'payment_overdue_3_days', 'daily_9am'
  
  -- Conditions (optional filters)
  conditions jsonb DEFAULT '{}'::jsonb,  -- e.g., {"job_value": {"operator": ">", "value": 8000}}
  
  -- Status
  active boolean DEFAULT true,
  
  -- Metadata
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automations_company ON public.automations(roofing_company_id, active);
CREATE INDEX IF NOT EXISTS idx_automations_trigger ON public.automations(trigger_type, trigger_value);
CREATE INDEX IF NOT EXISTS idx_automations_active ON public.automations(roofing_company_id, active) WHERE active = true;

COMMENT ON TABLE public.automations IS 'Automation definitions for SmartSend Roofing (Block 232000)';

-- ============================================================================
-- PART 2 — CREATE automation_actions TABLE
-- ============================================================================
-- Actions connected to automations (multiple actions per automation)

CREATE TABLE IF NOT EXISTS public.automation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  
  -- Action Configuration
  action_type text NOT NULL CHECK (action_type IN (
    'send_email',
    'send_sms',
    'add_activity_note',
    'assign_user',
    'assign_crew',
    'create_task',
    'move_pipeline_stage',
    'change_status',
    'notify_customer_portal',
    'recalculate_payment_schedule',
    'generate_document',
    'apply_tags',
    'trigger_webhook'
  )),
  action_payload jsonb NOT NULL DEFAULT '{}'::jsonb,  -- Action-specific configuration
  
  -- Execution Order
  sort_order int NOT NULL DEFAULT 0,
  
  -- Metadata
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automation_actions_automation ON public.automation_actions(automation_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_automation_actions_type ON public.automation_actions(action_type);

COMMENT ON TABLE public.automation_actions IS 'Actions for automations (Block 232000)';

-- ============================================================================
-- PART 3 — CREATE automation_logs TABLE
-- ============================================================================
-- Execution logs for debugging and auditing

CREATE TABLE IF NOT EXISTS public.automation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  
  -- Event Data
  event_payload jsonb NOT NULL DEFAULT '{}'::jsonb,  -- The event that triggered this execution
  entity_type text,  -- 'lead', 'job', 'proposal', 'contract', 'payment', 'crew', etc.
  entity_id uuid,     -- ID of the entity that triggered the automation
  
  -- Execution Results
  action_results jsonb DEFAULT '[]'::jsonb,  -- Array of action execution results
  success boolean DEFAULT false,
  error_message text,
  
  -- Metadata
  executed_at timestamptz DEFAULT now(),
  executed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL  -- null if system-triggered
);

CREATE INDEX IF NOT EXISTS idx_automation_logs_automation ON public.automation_logs(automation_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_logs_entity ON public.automation_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_automation_logs_success ON public.automation_logs(success, executed_at DESC);

COMMENT ON TABLE public.automation_logs IS 'Execution logs for automations (Block 232000)';

-- ============================================================================
-- PART 4 — TRIGGERS
-- ============================================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_automations_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_automations_updated_at ON public.automations;
CREATE TRIGGER trg_automations_updated_at
BEFORE UPDATE ON public.automations
FOR EACH ROW EXECUTE FUNCTION public.set_automations_updated_at();

-- ============================================================================
-- PART 5 — ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_logs ENABLE ROW LEVEL SECURITY;

-- Helper function to check roofing company membership
CREATE OR REPLACE FUNCTION public.is_roofing_company_member(_roofing_company_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.roofing_company_members
    WHERE roofing_company_id = _roofing_company_id
      AND user_id = auth.uid()
      AND is_active = true
  );
$$;

-- RLS Policies for automations
DROP POLICY IF EXISTS "automations_read" ON public.automations;
CREATE POLICY "automations_read" ON public.automations
  FOR SELECT USING (is_roofing_company_member(roofing_company_id));

DROP POLICY IF EXISTS "automations_write" ON public.automations;
CREATE POLICY "automations_write" ON public.automations
  FOR INSERT WITH CHECK (is_roofing_company_member(roofing_company_id));

DROP POLICY IF EXISTS "automations_update" ON public.automations;
CREATE POLICY "automations_update" ON public.automations
  FOR UPDATE USING (is_roofing_company_member(roofing_company_id));

DROP POLICY IF EXISTS "automations_delete" ON public.automations;
CREATE POLICY "automations_delete" ON public.automations
  FOR DELETE USING (is_roofing_company_member(roofing_company_id));

-- RLS Policies for automation_actions
DROP POLICY IF EXISTS "automation_actions_read" ON public.automation_actions;
CREATE POLICY "automation_actions_read" ON public.automation_actions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.automations
      WHERE automations.id = automation_actions.automation_id
        AND is_roofing_company_member(automations.roofing_company_id)
    )
  );

DROP POLICY IF EXISTS "automation_actions_write" ON public.automation_actions;
CREATE POLICY "automation_actions_write" ON public.automation_actions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.automations
      WHERE automations.id = automation_actions.automation_id
        AND is_roofing_company_member(automations.roofing_company_id)
    )
  );

DROP POLICY IF EXISTS "automation_actions_update" ON public.automation_actions;
CREATE POLICY "automation_actions_update" ON public.automation_actions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.automations
      WHERE automations.id = automation_actions.automation_id
        AND is_roofing_company_member(automations.roofing_company_id)
    )
  );

DROP POLICY IF EXISTS "automation_actions_delete" ON public.automation_actions;
CREATE POLICY "automation_actions_delete" ON public.automation_actions
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.automations
      WHERE automations.id = automation_actions.automation_id
        AND is_roofing_company_member(automations.roofing_company_id)
    )
  );

-- RLS Policies for automation_logs
DROP POLICY IF EXISTS "automation_logs_read" ON public.automation_logs;
CREATE POLICY "automation_logs_read" ON public.automation_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.automations
      WHERE automations.id = automation_logs.automation_id
        AND is_roofing_company_member(automations.roofing_company_id)
    )
  );

-- Service role can insert logs (for system-triggered executions)
DROP POLICY IF EXISTS "automation_logs_write" ON public.automation_logs;
CREATE POLICY "automation_logs_write" ON public.automation_logs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.automations
      WHERE automations.id = automation_logs.automation_id
        AND is_roofing_company_member(automations.roofing_company_id)
    )
    OR auth.role() = 'service_role'
  );

-- ============================================================================
-- PART 6 — HELPER FUNCTIONS
-- ============================================================================

-- Function to get active automations for a trigger
CREATE OR REPLACE FUNCTION public.get_active_automations_for_trigger(
  _roofing_company_id uuid,
  _trigger_type text,
  _trigger_value text
)
RETURNS TABLE (
  id uuid,
  name text,
  conditions jsonb,
  actions jsonb
) LANGUAGE sql STABLE AS $$
  SELECT 
    a.id,
    a.name,
    a.conditions,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', aa.id,
          'action_type', aa.action_type,
          'action_payload', aa.action_payload,
          'sort_order', aa.sort_order
        ) ORDER BY aa.sort_order
      ) FILTER (WHERE aa.id IS NOT NULL),
      '[]'::jsonb
    ) as actions
  FROM public.automations a
  LEFT JOIN public.automation_actions aa ON aa.automation_id = a.id
  WHERE a.roofing_company_id = _roofing_company_id
    AND a.active = true
    AND a.trigger_type = _trigger_type
    AND a.trigger_value = _trigger_value
  GROUP BY a.id, a.name, a.conditions;
$$;

COMMENT ON FUNCTION public.get_active_automations_for_trigger IS 'Get active automations matching a trigger (Block 232000)';

























