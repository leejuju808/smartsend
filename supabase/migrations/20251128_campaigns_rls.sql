-- =========================================================
-- Block 8590 — RLS for campaigns
-- =========================================================

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'campaigns'
      AND policyname = 'Campaigns are scoped to workspace'
  ) THEN
    CREATE POLICY "Campaigns are scoped to workspace"
    ON public.campaigns
    FOR ALL
    USING (
      workspace_id IN (
        SELECT workspace_id
        FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    )
    WITH CHECK (
      workspace_id IN (
        SELECT workspace_id
        FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    );
  END IF;
END;
$$;


























































