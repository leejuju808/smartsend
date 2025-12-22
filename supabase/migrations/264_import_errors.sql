-- Block 248: Lead Imports Dashboard v2 - Import Errors Table
-- Stores each failed row so we can retry them later

CREATE TABLE IF NOT EXISTS public.import_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES public.imports(id) ON DELETE CASCADE,
  row_data jsonb NOT NULL,      -- the full row data as JSON
  error_message text NOT NULL,   -- why it failed
  created_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_import_errors_import ON public.import_errors(import_id);
CREATE INDEX IF NOT EXISTS idx_import_errors_created_at ON public.import_errors(created_at DESC);

-- Enable RLS
ALTER TABLE public.import_errors ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view errors for imports in their workspace
CREATE POLICY "import_errors: select workspace errors"
  ON public.import_errors FOR SELECT
  USING (
    import_id IN (
      SELECT i.id FROM public.imports i
      WHERE i.workspace_id IN (
        SELECT workspace_id FROM public.team_members WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  );

-- RLS Policy: Users can insert errors for imports in their workspace
CREATE POLICY "import_errors: insert workspace errors"
  ON public.import_errors FOR INSERT
  WITH CHECK (
    import_id IN (
      SELECT i.id FROM public.imports i
      WHERE i.workspace_id IN (
        SELECT workspace_id FROM public.team_members WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  );

-- Grant access
GRANT SELECT, INSERT ON public.import_errors TO authenticated;









