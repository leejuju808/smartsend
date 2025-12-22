-- Block 248: Lead Imports Dashboard v2 - Imports Table
-- Tracks import history with mapping memory and error file storage

CREATE TABLE IF NOT EXISTS public.imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename text NOT NULL,
  total_rows int DEFAULT 0,
  success_rows int DEFAULT 0,
  failed_rows int DEFAULT 0,
  duplicate_rows int DEFAULT 0,
  enriched_rows int DEFAULT 0,
  ignored_rows int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  mapping jsonb,               -- stored mapping for auto-detection later
  error_file_url text          -- storage link for error CSV
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_imports_workspace ON public.imports(workspace_id);
CREATE INDEX IF NOT EXISTS idx_imports_user ON public.imports(user_id);
CREATE INDEX IF NOT EXISTS idx_imports_created_at ON public.imports(created_at DESC);

-- Enable RLS
ALTER TABLE public.imports ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view imports from their workspace
CREATE POLICY "imports: select workspace imports"
  ON public.imports FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.team_members WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- RLS Policy: Users can create imports in their workspace
CREATE POLICY "imports: insert workspace imports"
  ON public.imports FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.team_members WHERE user_id = auth.uid() AND status = 'active'
    )
    AND user_id = auth.uid()
  );

-- RLS Policy: Users can update imports in their workspace
CREATE POLICY "imports: update workspace imports"
  ON public.imports FOR UPDATE
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

-- Grant access
GRANT SELECT, INSERT, UPDATE ON public.imports TO authenticated;









