-- =========================================================
-- Block 20240 — SmartSend Inbox Saved Replies & Roofing Snippets v1
-- (So roofers can fire off pro replies in 5 seconds instead of re-typing the same thing all day.)
-- =========================================================

-- ============================================================================
-- CREATE reply_templates TABLE
-- ============================================================================
-- Stores saved reply templates per account for quick one-click replies

CREATE TABLE IF NOT EXISTS public.reply_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL,
  name TEXT NOT NULL,               -- internal name like "Estimate follow-up (1 day)"
  category TEXT,                    -- 'followup', 'estimate', 'insurance', 'general', etc
  subject_template TEXT,            -- optional subject override
  body_template TEXT NOT NULL,      -- email body text, can contain {{homeowner_name}} etc.
  is_active BOOLEAN DEFAULT TRUE,
  created_by_user_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_reply_templates_account
ON public.reply_templates (account_id, is_active);

CREATE INDEX IF NOT EXISTS idx_reply_templates_category
ON public.reply_templates (category) WHERE category IS NOT NULL;

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_reply_templates_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reply_templates_updated_at ON public.reply_templates;
CREATE TRIGGER trg_reply_templates_updated_at
  BEFORE UPDATE ON public.reply_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_reply_templates_updated_at();

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.reply_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Templates visible to account members
DROP POLICY IF EXISTS "reply_templates_select" ON public.reply_templates;
CREATE POLICY "reply_templates_select"
  ON public.reply_templates
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = reply_templates.account_id
      AND user_id = auth.uid()
      AND (is_active IS NULL OR is_active = TRUE)
    )
  );

-- RLS Policy: Templates can be created/modified by account members
DROP POLICY IF EXISTS "reply_templates_modify" ON public.reply_templates;
CREATE POLICY "reply_templates_modify"
  ON public.reply_templates
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = reply_templates.account_id
      AND user_id = auth.uid()
      AND (is_active IS NULL OR is_active = TRUE)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = reply_templates.account_id
      AND user_id = auth.uid()
      AND (is_active IS NULL OR is_active = TRUE)
    )
  );

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.reply_templates IS 'Block 20240 — Saved reply templates for quick one-click replies in SmartSend inbox';
COMMENT ON COLUMN public.reply_templates.account_id IS 'Account/roofing company this template belongs to';
COMMENT ON COLUMN public.reply_templates.name IS 'Template name displayed in dropdown (e.g. "Estimate follow-up (1 day)")';
COMMENT ON COLUMN public.reply_templates.category IS 'Template category for organization (e.g. "followup", "estimate", "insurance", "general")';
COMMENT ON COLUMN public.reply_templates.subject_template IS 'Optional subject override (can contain {{homeowner_name}}, {{company_name}})';
COMMENT ON COLUMN public.reply_templates.body_template IS 'Email body template (can contain {{homeowner_name}}, {{company_name}})';
COMMENT ON COLUMN public.reply_templates.is_active IS 'Whether this template is active and visible';

















































