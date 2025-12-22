-- Block 262 — Email Editor v2
-- Rich text editor, variables panel, inline AI commands, snippets, undo/redo, autosave, version snapshots

-- 1) Add subject and html columns to templates table if they don't exist
ALTER TABLE public.templates 
  ADD COLUMN IF NOT EXISTS subject text,
  ADD COLUMN IF NOT EXISTS html text;

-- Migrate existing body to html if html is null
UPDATE public.templates 
SET html = body 
WHERE html IS NULL AND body IS NOT NULL;

-- 2) Create template_versions table for version snapshots
CREATE TABLE IF NOT EXISTS public.template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.templates(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL, -- Inherit from template for RLS
  html text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_template_versions_template ON public.template_versions(template_id);
CREATE INDEX IF NOT EXISTS idx_template_versions_created_at ON public.template_versions(template_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_template_versions_workspace ON public.template_versions(workspace_id);

-- Function to keep only last 5 versions per template
CREATE OR REPLACE FUNCTION public.keep_last_5_versions()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.template_versions
  WHERE template_id = NEW.template_id
  AND id NOT IN (
    SELECT id FROM public.template_versions
    WHERE template_id = NEW.template_id
    ORDER BY created_at DESC
    LIMIT 5
  );
  RETURN NEW;
END;
$$;

-- Trigger to auto-cleanup old versions
DROP TRIGGER IF EXISTS trg_keep_last_5_versions ON public.template_versions;
CREATE TRIGGER trg_keep_last_5_versions
AFTER INSERT ON public.template_versions
FOR EACH ROW EXECUTE FUNCTION public.keep_last_5_versions();

-- 3) Enable RLS on template_versions
ALTER TABLE public.template_versions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view versions for templates they have access to
CREATE POLICY "Users can view template versions" ON public.template_versions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = template_versions.workspace_id
      AND wm.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.templates t
      WHERE t.id = template_versions.template_id
      AND (
        t.shared = true
        OR t.created_by = auth.uid()
      )
    )
  );

-- RLS Policy: Users can insert versions for templates they can update
CREATE POLICY "Users can create template versions" ON public.template_versions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = template_versions.workspace_id
      AND wm.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.templates t
      WHERE t.id = template_versions.template_id
      AND t.workspace_id = template_versions.workspace_id
      AND t.created_by = auth.uid()
    )
  );

-- 4) Function to get workspace_id from template_id (helper for version creation)
CREATE OR REPLACE FUNCTION public.get_template_workspace_id(p_template_id uuid)
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT workspace_id FROM public.templates WHERE id = p_template_id;
$$;









