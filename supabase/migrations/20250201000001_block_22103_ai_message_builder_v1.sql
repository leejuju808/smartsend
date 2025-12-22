-- ============================================================================
-- Block 22103 — SmartSend Roofing "AI Message Builder" v1
-- (💬 The Roofing-Specific, Context-Aware Message Generator That Writes PERFECT Messages for Estimators)
-- ============================================================================
-- FULL BLOCK. ZERO FLUFF.
--
-- This is the block that makes SmartSend feel alive to roofers.
-- A roofing-trained message generator that writes PERFECT messages based on:
-- - job context
-- - tone
-- - urgency
-- - lead source
-- - next best action
-- - risk state
-- - homeowner history
-- - stage of pipeline
-- ============================================================================

-- ============================================================================
-- 1. CREATE MESSAGE_PRESETS TABLE
-- ============================================================================
-- Users can optionally edit their own templated tones

CREATE TABLE IF NOT EXISTS public.message_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  message_type TEXT NOT NULL,
  template TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_message_presets_workspace_id 
  ON public.message_presets(workspace_id);

CREATE INDEX IF NOT EXISTS idx_message_presets_message_type 
  ON public.message_presets(message_type);

CREATE INDEX IF NOT EXISTS idx_message_presets_workspace_type 
  ON public.message_presets(workspace_id, message_type);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION public.update_message_presets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_message_presets_updated_at
BEFORE UPDATE ON public.message_presets
FOR EACH ROW
EXECUTE FUNCTION public.update_message_presets_updated_at();

-- Enable RLS
ALTER TABLE public.message_presets ENABLE ROW LEVEL SECURITY;

-- RLS: Workspace members can read presets for their workspace
CREATE POLICY "message_presets_select_workspace"
  ON public.message_presets
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = message_presets.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- RLS: Workspace members can insert/update/delete presets for their workspace
CREATE POLICY "message_presets_modify_workspace"
  ON public.message_presets
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = message_presets.workspace_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = message_presets.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Service role can do everything
CREATE POLICY "message_presets_service_role_all"
  ON public.message_presets
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Comments
COMMENT ON TABLE public.message_presets IS 'Block 22103: User-customizable message templates for AI Message Builder';
COMMENT ON COLUMN public.message_presets.message_type IS 'Block 22103: Type of message (followup, soft_reengagement, proposal_send, photo_request, tone_reset, job_save, insurance_question, timeline_question)';
COMMENT ON COLUMN public.message_presets.template IS 'Block 22103: Template text that can be customized by workspace';

-- ============================================================================
-- 2. CREATE VIEW: lead_full_intelligence_view (if not exists)
-- ============================================================================
-- This view is already created in Block 22094, but we ensure it exists
-- for the AI Message Builder to use

-- Note: The view is created in block_22094_ai_next_action_engine_v1.sql
-- We just ensure it's available here for reference

COMMENT ON VIEW public.lead_full_intelligence_view IS 'Block 22103: Used by AI Message Builder to access full lead intelligence for context-aware message generation';









































