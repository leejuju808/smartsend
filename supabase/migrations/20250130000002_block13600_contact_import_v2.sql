-- =========================================================
-- Block 13600 — SmartSend Contact Import v2
-- (The Upgraded Importer with Field Mapping, Preview, Enrichment, Auto-Tagging & Duplicate Detection)
-- =========================================================

-- ============================================================================
-- 1. ENHANCED IMPORT LOGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.import_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- File info
  file_name text NOT NULL,
  file_type text CHECK (file_type IN ('csv', 'xlsx', 'google_sheet')) DEFAULT 'csv',
  file_size bigint,
  google_sheet_url text,
  
  -- Import configuration
  field_mapping jsonb NOT NULL DEFAULT '{}'::jsonb, -- Maps CSV columns to contact fields
  list_id uuid REFERENCES public.contact_lists(id) ON DELETE SET NULL,
  list_name text, -- Name of list to create/add to
  default_tags text[] DEFAULT '{}'::text[], -- Tags to apply to all imported contacts
  
  -- Status tracking
  status text CHECK (status IN ('pending', 'previewing', 'processing', 'completed', 'failed')) DEFAULT 'pending',
  total_rows integer DEFAULT 0,
  processed_rows integer DEFAULT 0,
  
  -- Results summary
  imported_count integer DEFAULT 0,
  merged_count integer DEFAULT 0,
  skipped_count integer DEFAULT 0,
  invalid_count integer DEFAULT 0,
  
  -- Detailed breakdown
  missing_email_count integer DEFAULT 0,
  invalid_email_count integer DEFAULT 0,
  duplicate_count integer DEFAULT 0,
  suppressed_count integer DEFAULT 0,
  
  -- Tagging stats
  tags_applied jsonb DEFAULT '{}'::jsonb, -- { "storm": 89, "insurance": 18, "neighborhood": 73 }
  
  -- Error handling
  error_message text,
  error_details jsonb,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb -- Store preview data, validation results, etc.
);

CREATE INDEX IF NOT EXISTS idx_import_logs_workspace ON public.import_logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_import_logs_user ON public.import_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_import_logs_status ON public.import_logs(status);
CREATE INDEX IF NOT EXISTS idx_import_logs_created ON public.import_logs(created_at DESC);

-- ============================================================================
-- 2. IMPORT RESULTS TABLE (Row-by-row tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.import_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_log_id uuid NOT NULL REFERENCES public.import_logs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Row data
  row_number integer NOT NULL,
  raw_data jsonb NOT NULL, -- Original CSV row data
  
  -- Mapped data
  email text,
  first_name text,
  last_name text,
  full_name text,
  address text,
  city text,
  state text,
  zip text,
  phone text,
  notes text,
  past_quote_amount numeric(12,2),
  appointment_date date,
  
  -- Validation flags
  is_valid boolean DEFAULT false,
  is_duplicate boolean DEFAULT false,
  is_suppressed boolean DEFAULT false,
  is_invalid_email boolean DEFAULT false,
  is_missing_email boolean DEFAULT false,
  
  -- Enrichment flags
  enrichment_applied boolean DEFAULT false,
  enrichment_city text,
  enrichment_zip text,
  enrichment_neighborhood text,
  
  -- Auto-tagging flags
  tags_applied text[] DEFAULT '{}'::text[],
  storm_zone_match boolean DEFAULT false,
  neighborhood_match boolean DEFAULT false,
  
  -- Result
  action text CHECK (action IN ('imported', 'merged', 'skipped')) DEFAULT 'skipped',
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL, -- If imported/merged
  merged_into_contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL, -- If merged
  
  -- Error details
  error_reason text,
  validation_errors jsonb DEFAULT '[]'::jsonb,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_import_results_import_log ON public.import_results(import_log_id);
CREATE INDEX IF NOT EXISTS idx_import_results_workspace ON public.import_results(workspace_id);
CREATE INDEX IF NOT EXISTS idx_import_results_email ON public.import_results(email);
CREATE INDEX IF NOT EXISTS idx_import_results_contact ON public.import_results(contact_id);
CREATE INDEX IF NOT EXISTS idx_import_results_action ON public.import_results(action);

-- ============================================================================
-- 3. UPDATE CONTACT_IMPORTS TABLE (if exists, add new columns)
-- ============================================================================

DO $$
BEGIN
  -- Add new columns to contact_imports if table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'contact_imports'
  ) THEN
    -- Add field_mapping column if not exists
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'contact_imports' 
      AND column_name = 'field_mapping'
    ) THEN
      ALTER TABLE public.contact_imports 
      ADD COLUMN field_mapping jsonb DEFAULT '{}'::jsonb;
    END IF;
    
    -- Add default_tags column if not exists
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'contact_imports' 
      AND column_name = 'default_tags'
    ) THEN
      ALTER TABLE public.contact_imports 
      ADD COLUMN default_tags text[] DEFAULT '{}'::text[];
    END IF;
    
    -- Add list_id column if not exists
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'contact_imports' 
      AND column_name = 'list_id'
    ) THEN
      ALTER TABLE public.contact_imports 
      ADD COLUMN list_id uuid REFERENCES public.contact_lists(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- ============================================================================
-- 4. RLS POLICIES
-- ============================================================================

ALTER TABLE public.import_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_results ENABLE ROW LEVEL SECURITY;

-- Import logs: workspace members can access
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'import_logs'
      AND policyname = 'Import logs scoped to workspace'
  ) THEN
    CREATE POLICY "Import logs scoped to workspace"
    ON public.import_logs
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
END $$;

-- Import results: workspace members can access
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'import_results'
      AND policyname = 'Import results scoped to workspace'
  ) THEN
    CREATE POLICY "Import results scoped to workspace"
    ON public.import_results
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
END $$;

-- ============================================================================
-- 5. HELPER FUNCTIONS
-- ============================================================================

-- Function: Get import summary statistics
CREATE OR REPLACE FUNCTION public.get_import_summary(p_import_log_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_summary jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_rows', il.total_rows,
    'imported_count', il.imported_count,
    'merged_count', il.merged_count,
    'skipped_count', il.skipped_count,
    'invalid_count', il.invalid_count,
    'tags_applied', il.tags_applied,
    'status', il.status,
    'created_at', il.created_at,
    'completed_at', il.completed_at
  ) INTO v_summary
  FROM public.import_logs il
  WHERE il.id = p_import_log_id;
  
  RETURN v_summary;
END;
$$;

-- Function: Update import progress
CREATE OR REPLACE FUNCTION public.update_import_progress(
  p_import_log_id uuid,
  p_processed_rows integer,
  p_imported_count integer DEFAULT NULL,
  p_merged_count integer DEFAULT NULL,
  p_skipped_count integer DEFAULT NULL,
  p_invalid_count integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.import_logs
  SET
    processed_rows = p_processed_rows,
    imported_count = COALESCE(p_imported_count, imported_count),
    merged_count = COALESCE(p_merged_count, merged_count),
    skipped_count = COALESCE(p_skipped_count, skipped_count),
    invalid_count = COALESCE(p_invalid_count, invalid_count)
  WHERE id = p_import_log_id;
END;
$$;

-- ============================================================================
-- 6. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.import_logs IS 'Tracks contact import jobs with configuration, status, and summary statistics';
COMMENT ON TABLE public.import_results IS 'Row-by-row import results with validation flags, enrichment data, and action taken';
COMMENT ON COLUMN public.import_logs.field_mapping IS 'JSON mapping of CSV columns to contact fields: {"email": "Email Address", "first_name": "First Name"}';
COMMENT ON COLUMN public.import_logs.default_tags IS 'Tags to apply to all contacts imported in this batch';
COMMENT ON COLUMN public.import_logs.tags_applied IS 'Statistics on tags applied: {"storm": 89, "insurance": 18}';
COMMENT ON COLUMN public.import_results.raw_data IS 'Original CSV row data as JSON object';
COMMENT ON COLUMN public.import_results.action IS 'What happened to this row: imported (new contact), merged (duplicate), skipped (invalid)';





















































