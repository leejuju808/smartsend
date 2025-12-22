-- Block 260: Bulk Importer v3 - Import Mapping Templates
-- Stores source-aware mapping templates (Apollo, Clay, LinkedIn, etc.)

CREATE TABLE IF NOT EXISTS public.import_mapping_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  source_name text NOT NULL,       -- "Apollo", "Clay", "LinkedIn CSV", etc.
  header_signature jsonb NOT NULL, -- e.g. ["Email", "First Name", "Last Name", "Company"] (sorted)
  mapping jsonb NOT NULL,          -- final mapping config
  created_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_import_mapping_templates_workspace ON public.import_mapping_templates(workspace_id);
CREATE INDEX IF NOT EXISTS idx_import_mapping_templates_source ON public.import_mapping_templates(workspace_id, source_name);
CREATE INDEX IF NOT EXISTS idx_import_mapping_templates_signature ON public.import_mapping_templates USING gin(header_signature);

-- Enable RLS
ALTER TABLE public.import_mapping_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view templates from their workspace
CREATE POLICY "import_mapping_templates: select workspace templates"
  ON public.import_mapping_templates FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.team_members WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- RLS Policy: Users can create templates in their workspace
CREATE POLICY "import_mapping_templates: insert workspace templates"
  ON public.import_mapping_templates FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.team_members WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- RLS Policy: Users can update templates in their workspace
CREATE POLICY "import_mapping_templates: update workspace templates"
  ON public.import_mapping_templates FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.team_members WHERE user_id = auth.uid() AND status = 'active'
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.team_members WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- RLS Policy: Users can delete templates in their workspace
CREATE POLICY "import_mapping_templates: delete workspace templates"
  ON public.import_mapping_templates FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.team_members WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Grant access
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_mapping_templates TO authenticated;









