-- ============================================================================
-- Block 21947 — SmartSend Roofing Lead Audit Log v1
-- (📜 Every Action, Every Automation, Every Message — FULL TRANSPARENCY FOR OWNERS)
-- ============================================================================
-- FULL BLOCK. NO CUTS. NO BS.
-- This block is essential for trust, compliance, debugging, and roofing company accountability.
-- ============================================================================

-- ============================================================================
-- PART 1 — CREATE lead_audit_logs TABLE (Immutable, Append-Only)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.lead_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  
  -- Event classification
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('system', 'user', 'homeowner')),
  actor_id UUID, -- null for system/homeowner events, user_id for user actions
  
  -- Full raw details stored as JSONB
  event_data JSONB DEFAULT '{}'::jsonb,
  
  -- Immutable timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- PART 2 — INDEXES FOR PERFORMANCE
-- ============================================================================

-- Primary lookup: get all logs for a lead, ordered by time
CREATE INDEX IF NOT EXISTS idx_lead_audit_logs_lead_id_created_at
  ON public.lead_audit_logs (lead_id, created_at DESC);

-- Fast filtering by event type
CREATE INDEX IF NOT EXISTS idx_lead_audit_logs_event_type
  ON public.lead_audit_logs (event_type);

-- Fast filtering by actor
CREATE INDEX IF NOT EXISTS idx_lead_audit_logs_actor_type
  ON public.lead_audit_logs (actor_type);

-- Fast filtering by actor_id (for user actions)
CREATE INDEX IF NOT EXISTS idx_lead_audit_logs_actor_id
  ON public.lead_audit_logs (actor_id) WHERE actor_id IS NOT NULL;

-- ============================================================================
-- PART 3 — IMMUTABILITY ENFORCEMENT (Append-Only)
-- ============================================================================

-- Prevent updates to audit logs
CREATE OR REPLACE FUNCTION public.prevent_audit_log_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs cannot be modified. This is an append-only table.';
END;
$$;

-- Trigger to prevent updates
DROP TRIGGER IF EXISTS prevent_audit_updates ON public.lead_audit_logs;
CREATE TRIGGER prevent_audit_updates
  BEFORE UPDATE ON public.lead_audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_log_updates();

-- Prevent deletes (optional but recommended for compliance)
CREATE OR REPLACE FUNCTION public.prevent_audit_log_deletes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs cannot be deleted. This is an append-only table.';
END;
$$;

DROP TRIGGER IF EXISTS prevent_audit_deletes ON public.lead_audit_logs;
CREATE TRIGGER prevent_audit_deletes
  BEFORE DELETE ON public.lead_audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_log_deletes();

-- ============================================================================
-- PART 4 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.lead_audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Service role has full access (for edge functions)
CREATE POLICY "lead_audit_logs_service_role_all"
  ON public.lead_audit_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: Authenticated users can read audit logs for leads in their workspace
CREATE POLICY "lead_audit_logs_select_authenticated"
  ON public.lead_audit_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.leads l
      JOIN public.workspace_members wm ON wm.workspace_id = l.workspace_id
      WHERE l.id = lead_audit_logs.lead_id
        AND wm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.leads l
      WHERE l.id = lead_audit_logs.lead_id
        AND l.owner_id = auth.uid()
    )
  );

-- Policy: Authenticated users can insert audit logs (for user actions)
CREATE POLICY "lead_audit_logs_insert_authenticated"
  ON public.lead_audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.leads l
      JOIN public.workspace_members wm ON wm.workspace_id = l.workspace_id
      WHERE l.id = lead_audit_logs.lead_id
        AND wm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.leads l
      WHERE l.id = lead_audit_logs.lead_id
        AND l.owner_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 5 — EVENT TYPE CONSTANTS (Documentation)
-- ============================================================================
-- These are the event types that SmartSend modules should use:
--
-- AUTOMATION ACTIONS:
--   - automation_follow_up_sent
--   - automation_resurrection_sent
--   - automation_risk_update
--   - automation_probability_update
--   - automation_routing_decision
--   - automation_handoff
--   - automation_action_created
--   - automation_settings_changed
--
-- USER ACTIONS:
--   - user_status_change
--   - user_assigned_estimator
--   - user_sent_message
--   - user_uploaded_proposal
--   - user_marked_done_action
--
-- HOMEOWNER ACTIONS:
--   - homeowner_reply
--   - homeowner_file_uploaded
--
-- AI CLASSIFICATIONS:
--   - ai_tone_classified
--   - ai_intent_classified
--   - ai_probability_explained
-- ============================================================================

COMMENT ON TABLE public.lead_audit_logs IS 'Block 21947 — SmartSend Roofing Lead Audit Log v1: Immutable, append-only audit trail of every action, automation, and message for full transparency and accountability.';
COMMENT ON COLUMN public.lead_audit_logs.event_type IS 'Type of event (e.g., automation_follow_up_sent, user_status_change, homeowner_reply)';
COMMENT ON COLUMN public.lead_audit_logs.actor_type IS 'Who/what performed the action: system, user, or homeowner';
COMMENT ON COLUMN public.lead_audit_logs.actor_id IS 'User ID if actor_type is user, null otherwise';
COMMENT ON COLUMN public.lead_audit_logs.event_data IS 'Full raw details of the event stored as JSONB (e.g., old/new values, reasons, metadata)';









































