-- =========================================================
-- Block 261100 — SmartSend Owner Inbox, Command Bar & Zero-Click Control v1
-- (Unified Owner Inbox · Command Bar · Zero-Click Operations)
-- =========================================================
--
-- This block adds the audit backbone for the Owner Command Center:
-- - Command logs for all owner-initiated actions
-- - Workspace-scoped, user-scoped, legally-safe history
-- - Foundation for unified owner inbox + zero-click execution

-- ============================================================================
-- PART 1 — command_logs TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.command_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Raw command text as issued by the owner ("approve job 1204", "raise pricing 4%", etc.)
  command text NOT NULL,
  
  -- Who executed this command (null for system-level automations)
  executed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Human-readable outcome summary ("approved", "rejected", "failed: insufficient permissions", etc.)
  outcome text,
  
  -- Structured context for legal/audit: targets, rule_ids, reasons, diffs, etc.
  context jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_command_logs_workspace_created
  ON public.command_logs(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_command_logs_executed_by
  ON public.command_logs(executed_by, created_at DESC);


-- ============================================================================
-- PART 2 — ROW LEVEL SECURITY POLICIES
-- ============================================================================

ALTER TABLE public.command_logs ENABLE ROW LEVEL SECURITY;

-- Workspace members can see command history for their workspace
DROP POLICY IF EXISTS "command_logs_read_workspace" ON public.command_logs;
CREATE POLICY "command_logs_read_workspace" ON public.command_logs
  FOR SELECT
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Service role (edge functions, backend) can fully manage logs
DROP POLICY IF EXISTS "command_logs_service_all" ON public.command_logs;
CREATE POLICY "command_logs_service_all" ON public.command_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- ============================================================================
-- PART 3 — Helper function: log_owner_command
-- ============================================================================

CREATE OR REPLACE FUNCTION public.log_owner_command(
  p_workspace_id uuid,
  p_executed_by uuid,
  p_command text,
  p_outcome text DEFAULT NULL,
  p_context jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.command_logs (
    workspace_id,
    executed_by,
    command,
    outcome,
    context
  ) VALUES (
    p_workspace_id,
    p_executed_by,
    p_command,
    p_outcome,
    COALESCE(p_context, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;


-- ============================================================================
-- PART 4 — Grants & comments
-- ============================================================================

GRANT SELECT ON public.command_logs TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.command_logs TO service_role;
GRANT EXECUTE ON FUNCTION public.log_owner_command TO authenticated;

COMMENT ON TABLE public.command_logs IS 'Block 261100: Audit log of owner commands from Command Bar / Voice / Zero-Click actions.';
COMMENT ON COLUMN public.command_logs.context IS 'Structured metadata for audit (targets, rules, reasons, results).';
COMMENT ON FUNCTION public.log_owner_command IS 'Block 261100: Helper to write audit-safe command log entries.';












