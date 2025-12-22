-- Block 226 — Template Manager v1
-- Shared Team Templates, Categories, Variables, Insert-Into-Editor UI

CREATE TABLE IF NOT EXISTS public.templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  name text NOT NULL,
  category text,
  body text NOT NULL,
  shared boolean DEFAULT true,   -- if false = personal template
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_templates_workspace ON public.templates(workspace_id);
CREATE INDEX IF NOT EXISTS idx_templates_created_by ON public.templates(created_by);
CREATE INDEX IF NOT EXISTS idx_templates_shared ON public.templates(shared);
CREATE INDEX IF NOT EXISTS idx_templates_category ON public.templates(category);
CREATE INDEX IF NOT EXISTS idx_templates_created_at ON public.templates(created_at DESC);

-- Enable RLS
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view templates that are shared OR templates they created
DROP POLICY IF EXISTS "Users can view shared or own templates" ON public.templates;
CREATE POLICY "Users can view shared or own templates" ON public.templates
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = templates.workspace_id
      AND wm.user_id = auth.uid()
    )
    AND (
      templates.shared = true
      OR templates.created_by = auth.uid()
    )
  );

-- Users can create templates in their workspace
DROP POLICY IF EXISTS "Users can create templates in workspace" ON public.templates;
CREATE POLICY "Users can create templates in workspace" ON public.templates
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = templates.workspace_id
      AND wm.user_id = auth.uid()
    )
    AND templates.created_by = auth.uid()
  );

-- Users can update templates they created
DROP POLICY IF EXISTS "Users can update own templates" ON public.templates;
CREATE POLICY "Users can update own templates" ON public.templates
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = templates.workspace_id
      AND wm.user_id = auth.uid()
    )
    AND templates.created_by = auth.uid()
  );

-- Users can delete templates they created
DROP POLICY IF EXISTS "Users can delete own templates" ON public.templates;
CREATE POLICY "Users can delete own templates" ON public.templates
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = templates.workspace_id
      AND wm.user_id = auth.uid()
    )
    AND templates.created_by = auth.uid()
  );










