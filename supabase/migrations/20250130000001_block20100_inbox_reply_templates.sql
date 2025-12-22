-- =========================================================
-- Block 20100 — SmartSend Inbox Reply Templates v1
-- (Saved Reply Templates for Inbox - Roofing-specific one-click replies)
-- =========================================================

-- ============================================================================
-- CREATE inbox_reply_templates TABLE
-- ============================================================================
-- Stores saved reply templates for quick one-click replies in the inbox

CREATE TABLE IF NOT EXISTS public.inbox_reply_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,                        -- e.g. "Schedule Inspection"
  body TEXT NOT NULL,                         -- email body
  category TEXT,                              -- e.g. "follow_up", "scheduling", "insurance"
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_inbox_reply_templates_workspace
ON public.inbox_reply_templates (workspace_id);

CREATE INDEX IF NOT EXISTS idx_inbox_reply_templates_category
ON public.inbox_reply_templates (category) WHERE category IS NOT NULL;

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_inbox_reply_templates_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inbox_reply_templates_updated_at ON public.inbox_reply_templates;
CREATE TRIGGER trg_inbox_reply_templates_updated_at
  BEFORE UPDATE ON public.inbox_reply_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_inbox_reply_templates_updated_at();

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.inbox_reply_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Templates visible to workspace members
DROP POLICY IF EXISTS "inbox_reply_templates_select" ON public.inbox_reply_templates;
CREATE POLICY "inbox_reply_templates_select"
  ON public.inbox_reply_templates
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = inbox_reply_templates.workspace_id
      AND user_id = auth.uid()
    )
  );

-- RLS Policy: Templates can be created/modified by workspace members
DROP POLICY IF EXISTS "inbox_reply_templates_modify" ON public.inbox_reply_templates;
CREATE POLICY "inbox_reply_templates_modify"
  ON public.inbox_reply_templates
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = inbox_reply_templates.workspace_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin', 'member')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = inbox_reply_templates.workspace_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin', 'member')
    )
  );

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.inbox_reply_templates IS 'Stores saved reply templates for quick one-click replies in SmartSend inbox';
COMMENT ON COLUMN public.inbox_reply_templates.workspace_id IS 'Workspace/roofing company this template belongs to';
COMMENT ON COLUMN public.inbox_reply_templates.title IS 'Template title displayed as button text (e.g. "Schedule Inspection")';
COMMENT ON COLUMN public.inbox_reply_templates.body IS 'Email body template (can include placeholders like {homeowner_name})';
COMMENT ON COLUMN public.inbox_reply_templates.category IS 'Template category for organization (e.g. "follow_up", "scheduling", "insurance")';
COMMENT ON COLUMN public.inbox_reply_templates.is_default IS 'Whether this is a default template (shown to all workspaces)';

















































