-- Block 285 — Company Merge v1
-- Safe Account-Level Merge: Domains, People, Deals, Threads, Activity, Ownership

-- Ensure pg_trgm extension for similarity matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. Merge Events & Soft Archive
CREATE TABLE IF NOT EXISTS public.company_merge_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  primary_company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  merged_company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  merged_at timestamptz DEFAULT now(),
  merged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  snapshot jsonb NOT NULL,      -- full copy of merged company + links
  undone_at timestamptz,        -- timestamp when merge was undone
  undone_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT different_companies CHECK (primary_company_id != merged_company_id)
);

-- Indexes for merge events
CREATE INDEX IF NOT EXISTS idx_company_merge_events_workspace ON public.company_merge_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_company_merge_events_primary ON public.company_merge_events(primary_company_id);
CREATE INDEX IF NOT EXISTS idx_company_merge_events_merged ON public.company_merge_events(merged_company_id);
CREATE INDEX IF NOT EXISTS idx_company_merge_events_merged_at ON public.company_merge_events(merged_at DESC);

-- 2. Add merge flags to companies table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'companies' 
    AND column_name = 'is_merged'
  ) THEN
    ALTER TABLE public.companies 
    ADD COLUMN is_merged boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'companies' 
    AND column_name = 'merged_into'
  ) THEN
    ALTER TABLE public.companies 
    ADD COLUMN merged_into uuid REFERENCES public.companies(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Indexes for merge flags
CREATE INDEX IF NOT EXISTS idx_companies_is_merged ON public.companies(is_merged) WHERE is_merged = true;
CREATE INDEX IF NOT EXISTS idx_companies_merged_into ON public.companies(merged_into) WHERE merged_into IS NOT NULL;

-- 3. Duplicate Detection Table
CREATE TABLE IF NOT EXISTS public.company_duplicates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  duplicate_company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  score int NOT NULL CHECK (score >= 0 AND score <= 100),      -- 0–100 confidence
  match_type text NOT NULL,  -- 'domain_exact', 'name_exact', 'name_similar', 'website_exact'
  created_at timestamptz DEFAULT now(),
  reviewed_at timestamptz,    -- when user reviewed/merged
  CONSTRAINT different_companies_dup CHECK (company_id != duplicate_company_id),
  CONSTRAINT unique_duplicate_pair UNIQUE (company_id, duplicate_company_id)
);

-- Indexes for duplicates
CREATE INDEX IF NOT EXISTS idx_company_duplicates_workspace ON public.company_duplicates(workspace_id);
CREATE INDEX IF NOT EXISTS idx_company_duplicates_company ON public.company_duplicates(company_id);
CREATE INDEX IF NOT EXISTS idx_company_duplicates_score ON public.company_duplicates(score DESC);
CREATE INDEX IF NOT EXISTS idx_company_duplicates_unreviewed ON public.company_duplicates(workspace_id, reviewed_at) WHERE reviewed_at IS NULL;

-- 4. Enable RLS
ALTER TABLE public.company_merge_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_duplicates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for company_merge_events
CREATE POLICY "company_merge_events: select workspace members"
  ON public.company_merge_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = company_merge_events.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "company_merge_events: insert workspace admins"
  ON public.company_merge_events FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = company_merge_events.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "company_merge_events: update workspace admins"
  ON public.company_merge_events FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = company_merge_events.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner', 'admin')
    )
  );

-- RLS Policies for company_duplicates
CREATE POLICY "company_duplicates: select workspace members"
  ON public.company_duplicates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = company_duplicates.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "company_duplicates: insert service role"
  ON public.company_duplicates FOR INSERT
  WITH CHECK (true);  -- Background job uses service role

CREATE POLICY "company_duplicates: update workspace members"
  ON public.company_duplicates FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = company_duplicates.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- 5. Duplicate Detection Function
CREATE OR REPLACE FUNCTION public.detect_company_duplicates(p_workspace_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_record RECORD;
  v_duplicate_record RECORD;
  v_score int;
  v_match_type text;
  v_normalized_name1 text;
  v_normalized_name2 text;
BEGIN
  -- Clear existing duplicates for this workspace (will be regenerated)
  DELETE FROM public.company_duplicates 
  WHERE workspace_id = p_workspace_id;

  -- Loop through all non-merged companies in workspace
  FOR v_company_record IN 
    SELECT id, name, domain, website, workspace_id
    FROM public.companies
    WHERE workspace_id = p_workspace_id
    AND (is_merged IS NULL OR is_merged = false)
  LOOP
    -- Normalize company name for comparison
    v_normalized_name1 := LOWER(TRIM(REGEXP_REPLACE(COALESCE(v_company_record.name, ''), '[^a-zA-Z0-9]', '', 'g')));

    -- Find duplicates
    FOR v_duplicate_record IN
      SELECT id, name, domain, website
      FROM public.companies
      WHERE workspace_id = p_workspace_id
      AND id != v_company_record.id
      AND (is_merged IS NULL OR is_merged = false)
      AND (
        -- Same domain (score 100)
        (v_company_record.domain IS NOT NULL AND domain = v_company_record.domain)
        OR
        -- Same normalized company name (score 90)
        (
          v_company_record.name IS NOT NULL 
          AND name IS NOT NULL
          AND LOWER(TRIM(REGEXP_REPLACE(name, '[^a-zA-Z0-9]', '', 'g'))) = v_normalized_name1
          AND v_normalized_name1 != ''
        )
        OR
        -- Similar name using trigram (score 70)
        (
          v_company_record.name IS NOT NULL
          AND name IS NOT NULL
          AND similarity(LOWER(TRIM(COALESCE(v_company_record.name, ''))), LOWER(TRIM(COALESCE(name, '')))) > 0.7
        )
        OR
        -- Same website (score 100)
        (
          v_company_record.website IS NOT NULL 
          AND website IS NOT NULL
          AND LOWER(TRIM(v_company_record.website)) = LOWER(TRIM(website))
        )
      )
    LOOP
      -- Determine score and match type
      IF v_company_record.domain IS NOT NULL AND v_duplicate_record.domain = v_company_record.domain THEN
        v_score := 100;
        v_match_type := 'domain_exact';
      ELSIF v_company_record.website IS NOT NULL 
        AND v_duplicate_record.website IS NOT NULL
        AND LOWER(TRIM(v_company_record.website)) = LOWER(TRIM(v_duplicate_record.website)) THEN
        v_score := 100;
        v_match_type := 'website_exact';
      ELSIF v_company_record.name IS NOT NULL 
        AND v_duplicate_record.name IS NOT NULL
        AND LOWER(TRIM(REGEXP_REPLACE(v_duplicate_record.name, '[^a-zA-Z0-9]', '', 'g'))) = v_normalized_name1
        AND v_normalized_name1 != '' THEN
        v_score := 90;
        v_match_type := 'name_exact';
      ELSE
        v_score := 70;
        v_match_type := 'name_similar';
      END IF;

      -- Insert duplicate record (only if company_id < duplicate_company_id to avoid duplicates)
      IF v_company_record.id < v_duplicate_record.id THEN
        INSERT INTO public.company_duplicates (
          workspace_id,
          company_id,
          duplicate_company_id,
          score,
          match_type
        ) VALUES (
          p_workspace_id,
          v_company_record.id,
          v_duplicate_record.id,
          v_score,
          v_match_type
        )
        ON CONFLICT (company_id, duplicate_company_id) DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.detect_company_duplicates IS 'Detects duplicate companies in a workspace using domain, name, and website matching';

-- 6. Merge Function
CREATE OR REPLACE FUNCTION public.merge_companies(
  p_workspace_id uuid,
  p_primary_company_id uuid,
  p_merged_company_id uuid,
  p_merged_by uuid,
  p_field_selections jsonb DEFAULT '{}'::jsonb  -- e.g., {"name": "primary", "website": "merged"}
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_merge_event_id uuid;
  v_primary_company RECORD;
  v_merged_company RECORD;
  v_snapshot jsonb;
  v_lead_ids uuid[];
  v_deal_ids uuid[];
  v_thread_ids uuid[];
  v_meeting_ids uuid[];
  v_note_ids uuid[];
  v_task_ids uuid[];
  v_activity_ids uuid[];
  v_field_name text;
  v_field_value text;
  v_primary_domains text[];
  v_merged_domains text[];
  v_combined_domains text[];
BEGIN
  -- Validate companies exist and are in same workspace
  SELECT * INTO v_primary_company
  FROM public.companies
  WHERE id = p_primary_company_id AND workspace_id = p_workspace_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Primary company not found';
  END IF;

  SELECT * INTO v_merged_company
  FROM public.companies
  WHERE id = p_merged_company_id AND workspace_id = p_workspace_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Merged company not found';
  END IF;

  IF v_merged_company.is_merged = true THEN
    RAISE EXCEPTION 'Company is already merged';
  END IF;

  -- Build snapshot of merged company
  SELECT jsonb_build_object(
    'company', row_to_json(v_merged_company),
    'leads', COALESCE((SELECT jsonb_agg(id) FROM public.leads WHERE company_id = p_merged_company_id), '[]'::jsonb),
    'deals', COALESCE((SELECT jsonb_agg(id) FROM public.deals WHERE lead_id IN (SELECT id FROM public.leads WHERE company_id = p_merged_company_id)), '[]'::jsonb),
    'threads', COALESCE((SELECT jsonb_agg(id) FROM public.reply_threads WHERE lead_id IN (SELECT id FROM public.leads WHERE company_id = p_merged_company_id)), '[]'::jsonb),
    'meetings', COALESCE((SELECT jsonb_agg(id) FROM public.meetings WHERE company_id = p_merged_company_id), '[]'::jsonb),
    'notes', COALESCE((SELECT jsonb_agg(id) FROM public.notes WHERE lead_id IN (SELECT id FROM public.leads WHERE company_id = p_merged_company_id)), '[]'::jsonb),
    'tasks', COALESCE((SELECT jsonb_agg(id) FROM public.tasks WHERE lead_id IN (SELECT id FROM public.leads WHERE company_id = p_merged_company_id)), '[]'::jsonb),
    'team_activities', COALESCE((SELECT jsonb_agg(id) FROM public.team_activity WHERE company_id = p_merged_company_id), '[]'::jsonb)
  ) INTO v_snapshot;

  -- Update all foreign keys pointing to merged company
  -- 1. Update leads
  UPDATE public.leads SET company_id = p_primary_company_id WHERE company_id = p_merged_company_id;
  
  -- 2. Update threads (if company_id column exists)
  DO $$
  BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'reply_threads' 
      AND column_name = 'company_id'
    ) THEN
      UPDATE public.reply_threads 
      SET company_id = p_primary_company_id 
      WHERE company_id = p_merged_company_id;
    END IF;
  END $$;
  
  -- 3. Update meetings
  UPDATE public.meetings SET company_id = p_primary_company_id WHERE company_id = p_merged_company_id;
  
  -- 4. Update team_activity
  UPDATE public.team_activity SET company_id = p_primary_company_id WHERE company_id = p_merged_company_id;
  
  -- Note: Deals, notes, tasks are updated automatically through leads.company_id
  
  -- Merge domains (if domain is stored as array or if we need to track multiple domains)
  -- For now, we'll keep the primary domain and add merged domain to enrichment_data if needed
  -- This is a placeholder - adjust based on your domain storage structure
  
  -- Update primary company with selected field values
  -- Default: use primary company's value unless specified in p_field_selections
  IF p_field_selections IS NOT NULL AND p_field_selections != '{}'::jsonb THEN
    FOR v_field_name, v_field_value IN SELECT * FROM jsonb_each_text(p_field_selections)
    LOOP
      IF v_field_value = 'merged' THEN
        -- Use merged company's value
        IF v_field_name IN ('enrichment_score') THEN
          -- Integer fields
          EXECUTE format('UPDATE public.companies SET %I = $1 WHERE id = $2', v_field_name)
          USING (v_merged_company::jsonb->>v_field_name)::int, p_primary_company_id;
        ELSIF v_field_name IN ('enrichment_data') THEN
          -- JSONB fields
          EXECUTE format('UPDATE public.companies SET %I = $1 WHERE id = $2', v_field_name)
          USING (v_merged_company::jsonb->>v_field_name)::jsonb, p_primary_company_id;
        ELSE
          -- Text fields
          EXECUTE format('UPDATE public.companies SET %I = $1 WHERE id = $2', v_field_name)
          USING v_merged_company::jsonb->>v_field_name, p_primary_company_id;
        END IF;
      END IF;
      -- If 'primary', keep primary company's value (no update needed)
    END LOOP;
  END IF;

  -- Mark merged company as merged
  UPDATE public.companies
  SET is_merged = true,
      merged_into = p_primary_company_id
  WHERE id = p_merged_company_id;

  -- Create merge event record
  INSERT INTO public.company_merge_events (
    workspace_id,
    primary_company_id,
    merged_company_id,
    merged_by,
    snapshot
  ) VALUES (
    p_workspace_id,
    p_primary_company_id,
    p_merged_company_id,
    p_merged_by,
    v_snapshot
  )
  RETURNING id INTO v_merge_event_id;

  -- Mark duplicates as reviewed
  UPDATE public.company_duplicates
  SET reviewed_at = now()
  WHERE workspace_id = p_workspace_id
  AND (
    (company_id = p_primary_company_id AND duplicate_company_id = p_merged_company_id)
    OR
    (company_id = p_merged_company_id AND duplicate_company_id = p_primary_company_id)
  );

  -- Log lead_activity for each lead moved
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'lead_activity') THEN
    INSERT INTO public.lead_activity (
      workspace_id,
      lead_id,
      type,
      title,
      body,
      metadata,
      occurred_at
    )
    SELECT 
      p_workspace_id,
      id,
      'company_merge',
      format('Lead moved due to Company Merge — %s → %s',
        COALESCE(v_merged_company.name, v_merged_company.domain),
        COALESCE(v_primary_company.name, v_primary_company.domain)
      ),
      format('Company changed from %s to %s due to merge',
        COALESCE(v_merged_company.name, v_merged_company.domain),
        COALESCE(v_primary_company.name, v_primary_company.domain)
      ),
      jsonb_build_object(
        'merge_event_id', v_merge_event_id,
        'merged_company_id', p_merged_company_id,
        'primary_company_id', p_primary_company_id,
        'merged_company_name', COALESCE(v_merged_company.name, v_merged_company.domain),
        'primary_company_name', COALESCE(v_primary_company.name, v_primary_company.domain)
      ),
      now()
    FROM public.leads
    WHERE company_id = p_primary_company_id
    AND id IN (SELECT jsonb_array_elements_text(v_snapshot->'leads')::uuid);
  END IF;

  -- Log team activity
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'team_activity') THEN
    INSERT INTO public.team_activity (
      workspace_id,
      user_id,
      company_id,
      type,
      title,
      body,
      metadata,
      occurred_at
    ) VALUES (
      p_workspace_id,
      p_merged_by,
      p_primary_company_id,
      'company_merged',
      format('Company Merge — %s → %s', 
        COALESCE(v_merged_company.name, v_merged_company.domain),
        COALESCE(v_primary_company.name, v_primary_company.domain)
      ),
      format('Merged company %s into %s', 
        COALESCE(v_merged_company.name, v_merged_company.domain),
        COALESCE(v_primary_company.name, v_primary_company.domain)
      ),
      jsonb_build_object(
        'merge_event_id', v_merge_event_id,
        'merged_company_id', p_merged_company_id,
        'primary_company_id', p_primary_company_id
      ),
      now()
    );
  END IF;

  -- Log company activity (if company_activity table exists)
  -- Note: This would be logged per lead moved, handled separately

  RETURN v_merge_event_id;
END;
$$;

COMMENT ON FUNCTION public.merge_companies IS 'Merges two companies, moving all related data to primary company and creating merge event record';

-- 7. Undo Merge Function
CREATE OR REPLACE FUNCTION public.undo_company_merge(
  p_merge_event_id uuid,
  p_undone_by uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event RECORD;
  v_snapshot jsonb;
  v_merged_company_data jsonb;
  v_lead_ids uuid[];
  v_deal_ids uuid[];
  v_thread_ids uuid[];
  v_meeting_ids uuid[];
  v_note_ids uuid[];
  v_task_ids uuid[];
BEGIN
  -- Get merge event
  SELECT * INTO v_event
  FROM public.company_merge_events
  WHERE id = p_merge_event_id
  AND undone_at IS NULL  -- Not already undone
  AND merged_at > now() - interval '7 days';  -- Within 7 days

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Merge event not found, already undone, or older than 7 days';
  END IF;

  v_snapshot := v_event.snapshot;
  v_merged_company_data := v_snapshot->'company';

  -- Restore merged company row
  UPDATE public.companies
  SET 
    is_merged = false,
    merged_into = NULL,
    name = v_merged_company_data->>'name',
    domain = v_merged_company_data->>'domain',
    website = v_merged_company_data->>'website',
    industry = v_merged_company_data->>'industry',
    size = v_merged_company_data->>'size',
    country = v_merged_company_data->>'country',
    state = v_merged_company_data->>'state',
    city = v_merged_company_data->>'city',
    logo_url = v_merged_company_data->>'logo_url',
    enrichment_data = COALESCE((v_merged_company_data->>'enrichment_data')::jsonb, '{}'::jsonb),
    enrichment_score = COALESCE((v_merged_company_data->>'enrichment_score')::int, 0),
    workspace_id = v_event.workspace_id
  WHERE id = v_event.merged_company_id;

  -- Move links back (only those that were originally on merged company)
  
  -- Restore leads
  IF v_snapshot->'leads' IS NOT NULL AND jsonb_array_length(v_snapshot->'leads') > 0 THEN
    UPDATE public.leads
    SET company_id = v_event.merged_company_id
    WHERE id IN (SELECT jsonb_array_elements_text(v_snapshot->'leads')::uuid)
    AND company_id = v_event.primary_company_id;  -- Only restore if currently on primary
  END IF;

  -- Restore threads (if company_id column exists)
  -- Note: Threads are also linked via leads, so they'll be restored when leads are restored
  -- But if threads have company_id directly, restore that too
  DO $$
  DECLARE
    v_thread_ids uuid[];
  BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'reply_threads' 
      AND column_name = 'company_id'
    ) AND v_snapshot->'threads' IS NOT NULL AND jsonb_array_length(v_snapshot->'threads') > 0 THEN
      SELECT ARRAY(SELECT jsonb_array_elements_text(v_snapshot->'threads')::uuid) INTO v_thread_ids;
      UPDATE public.reply_threads 
      SET company_id = v_event.merged_company_id
      WHERE id = ANY(v_thread_ids)
      AND company_id = v_event.primary_company_id;
    END IF;
  END $$;

  -- Restore meetings
  IF v_snapshot->'meetings' IS NOT NULL AND jsonb_array_length(v_snapshot->'meetings') > 0 THEN
    UPDATE public.meetings
    SET company_id = v_event.merged_company_id
    WHERE id IN (SELECT jsonb_array_elements_text(v_snapshot->'meetings')::uuid)
    AND company_id = v_event.primary_company_id;
  END IF;

  -- Restore team_activity (optional - activity history restoration)
  -- Note: We typically don't restore activity as it represents historical events
  -- But if needed, we can restore it here
  -- IF v_snapshot->'team_activities' IS NOT NULL AND jsonb_array_length(v_snapshot->'team_activities') > 0 THEN
  --   UPDATE public.team_activity
  --   SET company_id = v_event.merged_company_id
  --   WHERE id IN (SELECT jsonb_array_elements_text(v_snapshot->'team_activities')::uuid)
  --   AND company_id = v_event.primary_company_id;
  -- END IF;

  -- Note: Deals, threads, notes, tasks are linked via leads, so they'll be restored when leads are restored

  -- Mark merge event as undone
  UPDATE public.company_merge_events
  SET undone_at = now(),
      undone_by = p_undone_by
  WHERE id = p_merge_event_id;

  -- Log team activity
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'team_activity') THEN
    INSERT INTO public.team_activity (
      workspace_id,
      user_id,
      company_id,
      type,
      title,
      body,
      metadata,
      occurred_at
    ) VALUES (
      v_event.workspace_id,
      p_undone_by,
      v_event.merged_company_id,
      'company_merge_undone',
      format('Company Merge Undone — %s restored', v_event.merged_company_id),
      format('Merge undone: Company %s restored from merge with %s', 
        v_event.merged_company_id,
        v_event.primary_company_id
      ),
      jsonb_build_object(
        'merge_event_id', p_merge_event_id,
        'merged_company_id', v_event.merged_company_id,
        'primary_company_id', v_event.primary_company_id
      ),
      now()
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION public.undo_company_merge IS 'Undoes a company merge by restoring the merged company and moving links back (within 7 days)';

-- 8. Helper function to get merge preview
CREATE OR REPLACE FUNCTION public.get_company_merge_preview(
  p_primary_company_id uuid,
  p_merged_company_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_primary RECORD;
  v_merged RECORD;
BEGIN
  SELECT * INTO v_primary FROM public.companies WHERE id = p_primary_company_id;
  SELECT * INTO v_merged FROM public.companies WHERE id = p_merged_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Company not found';
  END IF;

  SELECT jsonb_build_object(
    'primary_company', row_to_json(v_primary),
    'merged_company', row_to_json(v_merged),
    'leads_count', (
      SELECT COUNT(*) FROM public.leads WHERE company_id = p_merged_company_id
    ),
    'deals_count', (
      SELECT COUNT(*) FROM public.deals 
      WHERE lead_id IN (SELECT id FROM public.leads WHERE company_id = p_merged_company_id)
    ),
    'threads_count', (
      SELECT COUNT(*) FROM public.reply_threads 
      WHERE lead_id IN (SELECT id FROM public.leads WHERE company_id = p_merged_company_id)
    ),
    'meetings_count', (
      SELECT COUNT(*) FROM public.meetings WHERE company_id = p_merged_company_id
    ),
    'notes_count', (
      SELECT COUNT(*) FROM public.notes 
      WHERE lead_id IN (SELECT id FROM public.leads WHERE company_id = p_merged_company_id)
    ),
    'tasks_count', (
      SELECT COUNT(*) FROM public.tasks 
      WHERE lead_id IN (SELECT id FROM public.leads WHERE company_id = p_merged_company_id)
    ),
    'team_activities_count', (
      SELECT COUNT(*) FROM public.team_activity WHERE company_id = p_merged_company_id
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_company_merge_preview IS 'Returns preview of what will be merged, including counts of related objects';

-- 10. Update workspace_settings default to include company merge permissions
DO $$
BEGIN
  -- Update default settings in workspace_settings table if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workspace_settings') THEN
    -- Update existing workspace_settings to add company merge permissions
    UPDATE public.workspace_settings
    SET settings = jsonb_set(
      jsonb_set(
        settings,
        '{permissions,member_can_merge_companies}',
        'false'::jsonb
      ),
      '{permissions,require_two_confirmations_for_company_merge}',
      'true'::jsonb
    )
    WHERE settings->'permissions'->>'member_can_merge_companies' IS NULL;
  END IF;
END $$;

-- 11. Schedule duplicate detection cron job (runs daily at 3 AM UTC)
DO $$
BEGIN
  -- Enable pg_cron extension if not already enabled
  CREATE EXTENSION IF NOT EXISTS pg_cron;

  -- Remove existing job if it exists
  PERFORM cron.unschedule('detect-company-duplicates') WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'detect-company-duplicates'
  );

  -- Schedule duplicate detection to run daily at 3 AM UTC
  PERFORM cron.schedule(
    'detect-company-duplicates',
    '0 3 * * *', -- Daily at 3 AM UTC
    $$
    DO $$
    DECLARE
      v_workspace RECORD;
    BEGIN
      -- Run duplicate detection for each workspace
      FOR v_workspace IN SELECT DISTINCT id FROM public.workspaces
      LOOP
        BEGIN
          PERFORM public.detect_company_duplicates(v_workspace.id);
        EXCEPTION WHEN OTHERS THEN
          -- Log error but continue with other workspaces
          RAISE WARNING 'Failed to detect company duplicates for workspace %: %', v_workspace.id, SQLERRM;
        END;
      END LOOP;
    END $$;
    $$
  );
EXCEPTION WHEN OTHERS THEN
  -- If pg_cron is not available, just log a warning
  RAISE WARNING 'pg_cron extension not available, company duplicate detection cron job not scheduled';
END $$;
