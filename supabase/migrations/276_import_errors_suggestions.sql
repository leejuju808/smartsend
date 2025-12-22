-- Block 260: Bulk Importer v3 - Import Errors Suggestions
-- Extends import_errors table with repair suggestions

ALTER TABLE public.import_errors
  ADD COLUMN IF NOT EXISTS suggestion jsonb,
  ADD COLUMN IF NOT EXISTS fixed_pending boolean DEFAULT false;

-- Index for finding fixable errors
CREATE INDEX IF NOT EXISTS idx_import_errors_fixed_pending ON public.import_errors(import_id, fixed_pending) WHERE fixed_pending = true;

-- RLS Policy: Users can update errors in their workspace
CREATE POLICY "import_errors: update workspace errors"
  ON public.import_errors FOR UPDATE
  USING (
    import_id IN (
      SELECT i.id FROM public.imports i
      WHERE i.workspace_id IN (
        SELECT workspace_id FROM public.team_members WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  )
  WITH CHECK (
    import_id IN (
      SELECT i.id FROM public.imports i
      WHERE i.workspace_id IN (
        SELECT workspace_id FROM public.team_members WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  );

-- Grant update access
GRANT UPDATE ON public.import_errors TO authenticated;









