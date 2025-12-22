-- =========================================================
-- Block 160000 — SmartSend Roofing
-- "Automation Builder (Triggers → Conditions → Actions) v1"
-- =========================================================
-- 
-- This block gives SmartSend the power to:
-- - Send follow-ups automatically
-- - Notify teams based on lead heat
-- - Move leads across stages
-- - Auto-book or auto-SMS homeowners
-- - Trigger workflows when certain events happen
-- - Assign leads to sales reps
-- - Create tasks for production
-- - Send notifications based on job progress
-- 
-- This becomes SmartSend's automation engine.
-- =========================================================

-- ============================================================================
-- 1. AUTOMATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automations_company_id ON public.automations(company_id);
CREATE INDEX IF NOT EXISTS idx_automations_active ON public.automations(company_id, is_active) WHERE is_active = true;

-- ============================================================================
-- 2. AUTOMATION_TRIGGERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.automation_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  event_key text NOT NULL,  -- e.g. lead.created, lead.hot, call.missed, appointment.booked
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automation_triggers_automation_id ON public.automation_triggers(automation_id);
CREATE INDEX IF NOT EXISTS idx_automation_triggers_event_key ON public.automation_triggers(event_key);

-- ============================================================================
-- 3. AUTOMATION_CONDITIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.automation_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  field text NOT NULL,       -- e.g. heat_score, market_tag, job_type
  operator text NOT NULL,    -- '=', '!=', '>', '<', '>=', '<=', 'contains', 'not_contains'
  value text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automation_conditions_automation_id ON public.automation_conditions(automation_id);

-- ============================================================================
-- 4. AUTOMATION_ACTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.automation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  action_key text NOT NULL,  -- e.g. send_sms, send_email, assign_to_user, book_appointment
  payload jsonb DEFAULT '{}'::jsonb,
  action_order int DEFAULT 0,  -- Order of execution
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automation_actions_automation_id ON public.automation_actions(automation_id);
CREATE INDEX IF NOT EXISTS idx_automation_actions_order ON public.automation_actions(automation_id, action_order);

-- ============================================================================
-- 5. AUTOMATION_EXECUTION_LOGS TABLE (for debugging and transparency)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.automation_execution_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid REFERENCES public.automations(id) ON DELETE SET NULL,
  event_key text NOT NULL,
  event_data jsonb DEFAULT '{}'::jsonb,
  execution_status text NOT NULL CHECK (execution_status IN ('success', 'failed', 'skipped')),
  error_message text,
  executed_actions jsonb DEFAULT '[]'::jsonb,  -- Array of action results
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automation_execution_logs_automation_id ON public.automation_execution_logs(automation_id);
CREATE INDEX IF NOT EXISTS idx_automation_execution_logs_event_key ON public.automation_execution_logs(event_key);
CREATE INDEX IF NOT EXISTS idx_automation_execution_logs_created_at ON public.automation_execution_logs(created_at DESC);

-- ============================================================================
-- 6. UPDATED_AT TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION update_automations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_automations_updated_at ON public.automations;
CREATE TRIGGER trg_automations_updated_at
BEFORE UPDATE ON public.automations
FOR EACH ROW
EXECUTE FUNCTION update_automations_updated_at();

-- ============================================================================
-- 7. ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_execution_logs ENABLE ROW LEVEL SECURITY;

-- Helper function to check company access
CREATE OR REPLACE FUNCTION has_roofing_company_access(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS(
    SELECT 1
    FROM public.roofing_companies rc
    WHERE rc.id = p_company_id
      AND (
        rc.owner_id = auth.uid()
        OR EXISTS(
          SELECT 1
          FROM public.roofing_company_members rcm
          WHERE rcm.roofing_company_id = p_company_id
            AND rcm.user_id = auth.uid()
            AND rcm.is_active = true
        )
      )
  );
$$;

-- RLS Policies for automations
CREATE POLICY "automations_select" ON public.automations
  FOR SELECT
  USING (has_roofing_company_access(company_id));

CREATE POLICY "automations_insert" ON public.automations
  FOR INSERT
  WITH CHECK (has_roofing_company_access(company_id));

CREATE POLICY "automations_update" ON public.automations
  FOR UPDATE
  USING (has_roofing_company_access(company_id));

CREATE POLICY "automations_delete" ON public.automations
  FOR DELETE
  USING (has_roofing_company_access(company_id));

-- RLS Policies for automation_triggers
CREATE POLICY "automation_triggers_select" ON public.automation_triggers
  FOR SELECT
  USING (
    EXISTS(
      SELECT 1 FROM public.automations a
      WHERE a.id = automation_triggers.automation_id
        AND has_roofing_company_access(a.company_id)
    )
  );

CREATE POLICY "automation_triggers_insert" ON public.automation_triggers
  FOR INSERT
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.automations a
      WHERE a.id = automation_triggers.automation_id
        AND has_roofing_company_access(a.company_id)
    )
  );

CREATE POLICY "automation_triggers_delete" ON public.automation_triggers
  FOR DELETE
  USING (
    EXISTS(
      SELECT 1 FROM public.automations a
      WHERE a.id = automation_triggers.automation_id
        AND has_roofing_company_access(a.company_id)
    )
  );

-- RLS Policies for automation_conditions
CREATE POLICY "automation_conditions_select" ON public.automation_conditions
  FOR SELECT
  USING (
    EXISTS(
      SELECT 1 FROM public.automations a
      WHERE a.id = automation_conditions.automation_id
        AND has_roofing_company_access(a.company_id)
    )
  );

CREATE POLICY "automation_conditions_insert" ON public.automation_conditions
  FOR INSERT
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.automations a
      WHERE a.id = automation_conditions.automation_id
        AND has_roofing_company_access(a.company_id)
    )
  );

CREATE POLICY "automation_conditions_delete" ON public.automation_conditions
  FOR DELETE
  USING (
    EXISTS(
      SELECT 1 FROM public.automations a
      WHERE a.id = automation_conditions.automation_id
        AND has_roofing_company_access(a.company_id)
    )
  );

-- RLS Policies for automation_actions
CREATE POLICY "automation_actions_select" ON public.automation_actions
  FOR SELECT
  USING (
    EXISTS(
      SELECT 1 FROM public.automations a
      WHERE a.id = automation_actions.automation_id
        AND has_roofing_company_access(a.company_id)
    )
  );

CREATE POLICY "automation_actions_insert" ON public.automation_actions
  FOR INSERT
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.automations a
      WHERE a.id = automation_actions.automation_id
        AND has_roofing_company_access(a.company_id)
    )
  );

CREATE POLICY "automation_actions_delete" ON public.automation_actions
  FOR DELETE
  USING (
    EXISTS(
      SELECT 1 FROM public.automations a
      WHERE a.id = automation_actions.automation_id
        AND has_roofing_company_access(a.company_id)
    )
  );

-- RLS Policies for automation_execution_logs (read-only for company members)
CREATE POLICY "automation_execution_logs_select" ON public.automation_execution_logs
  FOR SELECT
  USING (
    automation_id IS NULL
    OR EXISTS(
      SELECT 1 FROM public.automations a
      WHERE a.id = automation_execution_logs.automation_id
        AND has_roofing_company_access(a.company_id)
    )
  );

-- Allow service role to insert logs (for edge function)
CREATE POLICY "automation_execution_logs_insert" ON public.automation_execution_logs
  FOR INSERT
  WITH CHECK (true);

COMMENT ON TABLE public.automations IS 'Automation rules for SmartSend Roofing (Block 160000)';
COMMENT ON TABLE public.automation_triggers IS 'Event triggers for automations';
COMMENT ON TABLE public.automation_conditions IS 'Conditions that must be met for automation to execute';
COMMENT ON TABLE public.automation_actions IS 'Actions to execute when automation triggers';
COMMENT ON TABLE public.automation_execution_logs IS 'Execution logs for automation debugging';


























