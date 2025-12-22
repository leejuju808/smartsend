-- Block 261 — Lead Enrichment Engine v1
-- Add enrichment_auto setting to workspace_settings

-- Ensure workspace_settings table exists (using key-value style if it exists)
DO $$
BEGIN
  -- Check if workspace_settings_kv exists (from block 192)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workspace_settings_kv') THEN
    -- Insert default enrichment_auto setting if not exists
    INSERT INTO public.workspace_settings_kv (workspace_id, key, value)
    SELECT id, 'enrichment_auto', 'false'::jsonb
    FROM public.workspaces
    WHERE NOT EXISTS (
      SELECT 1 FROM public.workspace_settings_kv
      WHERE workspace_id = workspaces.id AND key = 'enrichment_auto'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  -- Also check if workspace_settings table exists (from other migrations)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workspace_settings') THEN
    -- Add enrichment_auto column if table exists and column doesn't
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'workspace_settings' AND column_name = 'enrichment_auto'
    ) THEN
      ALTER TABLE public.workspace_settings ADD COLUMN enrichment_auto boolean DEFAULT false;
    END IF;
  END IF;
END $$;









