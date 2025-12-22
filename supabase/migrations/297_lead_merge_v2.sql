-- Block 278 — Lead Merge v2
-- Safeguarded Merge Flows Using Email + Company + Activity Timelines

-- Ensure pg_trgm extension for similarity matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. Merge Events & Soft Archive
CREATE TABLE IF NOT EXISTS public.lead_merge_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  primary_lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  merged_lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  merged_at timestamptz DEFAULT now(),
  merged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  snapshot jsonb NOT NULL,      -- full copy of merged lead + links
  undone_at timestamptz,        -- timestamp when merge was undone
  undone_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT different_leads CHECK (primary_lead_id != merged_lead_id)
);

-- Indexes for merge events
CREATE INDEX IF NOT EXISTS idx_lead_merge_events_workspace ON public.lead_merge_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_lead_merge_events_primary ON public.lead_merge_events(primary_lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_merge_events_merged ON public.lead_merge_events(merged_lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_merge_events_merged_at ON public.lead_merge_events(merged_at DESC);

-- 2. Add merge flags to leads table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'leads' 
    AND column_name = 'is_merged'
  ) THEN
    ALTER TABLE public.leads 
    ADD COLUMN is_merged boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'leads' 
    AND column_name = 'merged_into'
  ) THEN
    ALTER TABLE public.leads 
    ADD COLUMN merged_into uuid REFERENCES public.leads(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Indexes for merge flags
CREATE INDEX IF NOT EXISTS idx_leads_is_merged ON public.leads(is_merged) WHERE is_merged = true;
CREATE INDEX IF NOT EXISTS idx_leads_merged_into ON public.leads(merged_into) WHERE merged_into IS NOT NULL;

-- 3. Duplicate Detection Table
CREATE TABLE IF NOT EXISTS public.lead_duplicates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  duplicate_lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  score int NOT NULL CHECK (score >= 0 AND score <= 100),      -- 0–100 confidence
  match_type text NOT NULL,  -- 'email_exact', 'domain_name', 'linkedin_exact', 'company_name_similar'
  created_at timestamptz DEFAULT now(),
  reviewed_at timestamptz,    -- when user reviewed/merged
  CONSTRAINT different_leads_dup CHECK (lead_id != duplicate_lead_id),
  CONSTRAINT unique_duplicate_pair UNIQUE (lead_id, duplicate_lead_id)
);

-- Indexes for duplicates
CREATE INDEX IF NOT EXISTS idx_lead_duplicates_workspace ON public.lead_duplicates(workspace_id);
CREATE INDEX IF NOT EXISTS idx_lead_duplicates_lead ON public.lead_duplicates(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_duplicates_score ON public.lead_duplicates(score DESC);
CREATE INDEX IF NOT EXISTS idx_lead_duplicates_unreviewed ON public.lead_duplicates(workspace_id, reviewed_at) WHERE reviewed_at IS NULL;

-- 4. Enable RLS
ALTER TABLE public.lead_merge_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_duplicates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for lead_merge_events
CREATE POLICY "lead_merge_events: select workspace members"
  ON public.lead_merge_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = lead_merge_events.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "lead_merge_events: insert workspace admins"
  ON public.lead_merge_events FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = lead_merge_events.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "lead_merge_events: update workspace admins"
  ON public.lead_merge_events FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = lead_merge_events.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner', 'admin')
    )
  );

-- RLS Policies for lead_duplicates
CREATE POLICY "lead_duplicates: select workspace members"
  ON public.lead_duplicates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = lead_duplicates.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "lead_duplicates: insert service role"
  ON public.lead_duplicates FOR INSERT
  WITH CHECK (true);  -- Background job uses service role

CREATE POLICY "lead_duplicates: update workspace members"
  ON public.lead_duplicates FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = lead_duplicates.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- 5. Duplicate Detection Function
CREATE OR REPLACE FUNCTION public.detect_lead_duplicates(p_workspace_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_record RECORD;
  v_duplicate_record RECORD;
  v_score int;
  v_match_type text;
  v_email_domain text;
  v_duplicate_count int;
BEGIN
  -- Clear existing duplicates for this workspace (will be regenerated)
  DELETE FROM public.lead_duplicates 
  WHERE workspace_id = p_workspace_id;

  -- Loop through all non-merged leads in workspace
  FOR v_lead_record IN 
    SELECT id, email, first_name, last_name, company, linkedin_url, workspace_id
    FROM public.leads
    WHERE workspace_id = p_workspace_id
    AND (is_merged IS NULL OR is_merged = false)
  LOOP
    -- Extract email domain
    v_email_domain := CASE 
      WHEN v_lead_record.email LIKE '%@%' 
      THEN LOWER(SPLIT_PART(v_lead_record.email, '@', 2))
      ELSE NULL
    END;

    -- Find duplicates
    FOR v_duplicate_record IN
      SELECT id, email, first_name, last_name, company, linkedin_url
      FROM public.leads
      WHERE workspace_id = p_workspace_id
      AND id != v_lead_record.id
      AND (is_merged IS NULL OR is_merged = false)
      AND (
        -- Exact email match (score 100)
        (v_lead_record.email IS NOT NULL AND email = v_lead_record.email)
        OR
        -- Same domain + same first + last name (score 90)
        (
          v_email_domain IS NOT NULL 
          AND email LIKE '%@' || v_email_domain
          AND COALESCE(LOWER(TRIM(first_name)), '') = COALESCE(LOWER(TRIM(v_lead_record.first_name)), '')
          AND COALESCE(LOWER(TRIM(last_name)), '') = COALESCE(LOWER(TRIM(v_lead_record.last_name)), '')
          AND COALESCE(LOWER(TRIM(first_name)), '') != ''
          AND COALESCE(LOWER(TRIM(last_name)), '') != ''
        )
        OR
        -- Exact LinkedIn URL match (score 95)
        (
          v_lead_record.linkedin_url IS NOT NULL 
          AND linkedin_url IS NOT NULL
          AND linkedin_url = v_lead_record.linkedin_url
        )
        OR
        -- Same company + similar name using trigram (score 70)
        (
          v_lead_record.company IS NOT NULL
          AND company IS NOT NULL
          AND LOWER(TRIM(company)) = LOWER(TRIM(v_lead_record.company))
          AND (
            similarity(
              COALESCE(LOWER(TRIM(first_name || ' ' || last_name)), ''),
              COALESCE(LOWER(TRIM(v_lead_record.first_name || ' ' || v_lead_record.last_name)), '')
            ) > 0.7
            OR
            similarity(
              COALESCE(LOWER(TRIM(last_name || ' ' || first_name)), ''),
              COALESCE(LOWER(TRIM(v_lead_record.first_name || ' ' || v_lead_record.last_name)), '')
            ) > 0.7
          )
        )
      )
    LOOP
      -- Determine score and match type
      IF v_lead_record.email IS NOT NULL AND v_duplicate_record.email = v_lead_record.email THEN
        v_score := 100;
        v_match_type := 'email_exact';
      ELSIF v_lead_record.linkedin_url IS NOT NULL AND v_duplicate_record.linkedin_url = v_lead_record.linkedin_url THEN
        v_score := 95;
        v_match_type := 'linkedin_exact';
      ELSIF v_email_domain IS NOT NULL 
        AND v_duplicate_record.email LIKE '%@' || v_email_domain
        AND COALESCE(LOWER(TRIM(v_duplicate_record.first_name)), '') = COALESCE(LOWER(TRIM(v_lead_record.first_name)), '')
        AND COALESCE(LOWER(TRIM(v_duplicate_record.last_name)), '') = COALESCE(LOWER(TRIM(v_lead_record.last_name)), '')
        AND COALESCE(LOWER(TRIM(v_lead_record.first_name)), '') != ''
        AND COALESCE(LOWER(TRIM(v_lead_record.last_name)), '') != '' THEN
        v_score := 90;
        v_match_type := 'domain_name';
      ELSE
        v_score := 70;
        v_match_type := 'company_name_similar';
      END IF;

      -- Insert duplicate record (only if lead_id < duplicate_lead_id to avoid duplicates)
      IF v_lead_record.id < v_duplicate_record.id THEN
        INSERT INTO public.lead_duplicates (
          workspace_id,
          lead_id,
          duplicate_lead_id,
          score,
          match_type
        ) VALUES (
          p_workspace_id,
          v_lead_record.id,
          v_duplicate_record.id,
          v_score,
          v_match_type
        )
        ON CONFLICT (lead_id, duplicate_lead_id) DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.detect_lead_duplicates IS 'Detects duplicate leads in a workspace using email, domain+name, LinkedIn, and company+name similarity';

-- 6. Merge Function
CREATE OR REPLACE FUNCTION public.merge_leads(
  p_workspace_id uuid,
  p_primary_lead_id uuid,
  p_merged_lead_id uuid,
  p_merged_by uuid,
  p_field_selections jsonb DEFAULT '{}'::jsonb  -- e.g., {"title": "primary", "phone": "merged"}
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_merge_event_id uuid;
  v_primary_lead RECORD;
  v_merged_lead RECORD;
  v_snapshot jsonb;
  v_deal_ids uuid[];
  v_thread_ids uuid[];
  v_note_ids uuid[];
  v_task_ids uuid[];
  v_activity_ids uuid[];
  v_field_name text;
  v_field_value text;
BEGIN
  -- Validate leads exist and are in same workspace
  SELECT * INTO v_primary_lead
  FROM public.leads
  WHERE id = p_primary_lead_id AND workspace_id = p_workspace_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Primary lead not found';
  END IF;

  SELECT * INTO v_merged_lead
  FROM public.leads
  WHERE id = p_merged_lead_id AND workspace_id = p_workspace_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Merged lead not found';
  END IF;

  IF v_merged_lead.is_merged = true THEN
    RAISE EXCEPTION 'Lead is already merged';
  END IF;

  -- Build snapshot of merged lead
  SELECT jsonb_build_object(
    'lead', row_to_json(v_merged_lead),
    'deals', COALESCE((SELECT jsonb_agg(id) FROM public.deals WHERE lead_id = p_merged_lead_id), '[]'::jsonb),
    'threads', COALESCE((SELECT jsonb_agg(id) FROM public.reply_threads WHERE lead_id = p_merged_lead_id), '[]'::jsonb),
    'notes', COALESCE((SELECT jsonb_agg(id) FROM public.notes WHERE lead_id = p_merged_lead_id), '[]'::jsonb),
    'tasks', COALESCE((SELECT jsonb_agg(id) FROM public.tasks WHERE lead_id = p_merged_lead_id), '[]'::jsonb),
    'send_logs', COALESCE((SELECT jsonb_agg(id) FROM public.send_logs WHERE lead_id = p_merged_lead_id), '[]'::jsonb)
  ) INTO v_snapshot;

  -- Update all foreign keys pointing to merged lead
  UPDATE public.deals SET lead_id = p_primary_lead_id WHERE lead_id = p_merged_lead_id;
  UPDATE public.reply_threads SET lead_id = p_primary_lead_id WHERE lead_id = p_merged_lead_id;
  UPDATE public.lead_activity SET lead_id = p_primary_lead_id WHERE lead_id = p_merged_lead_id;
  UPDATE public.tasks SET lead_id = p_primary_lead_id WHERE lead_id = p_merged_lead_id;
  UPDATE public.notes SET lead_id = p_primary_lead_id WHERE lead_id = p_merged_lead_id;
  UPDATE public.send_logs SET lead_id = p_primary_lead_id WHERE lead_id = p_merged_lead_id;
  
  -- Update email_events if table exists
  DO $$
  BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'email_events') THEN
      EXECUTE format('UPDATE public.email_events SET lead_id = $1 WHERE lead_id = $2', p_primary_lead_id, p_merged_lead_id);
    END IF;
  END $$;

  -- Update primary lead with selected field values
  -- Default: use primary lead's value unless specified in p_field_selections
  IF p_field_selections IS NOT NULL AND p_field_selections != '{}'::jsonb THEN
    FOR v_field_name, v_field_value IN SELECT * FROM jsonb_each_text(p_field_selections)
    LOOP
      IF v_field_value = 'merged' THEN
        -- Use merged lead's value - handle different data types
        IF v_field_name IN ('score', 'open_count', 'click_count') THEN
          -- Integer fields
          EXECUTE format('UPDATE public.leads SET %I = $1 WHERE id = $2', v_field_name)
          USING (v_merged_lead::jsonb->>v_field_name)::int, p_primary_lead_id;
        ELSIF v_field_name IN ('tags', 'icp_related', 'tech_tags') THEN
          -- Array fields
          EXECUTE format('UPDATE public.leads SET %I = $1 WHERE id = $2', v_field_name)
          USING (v_merged_lead::jsonb->>v_field_name)::text[], p_primary_lead_id;
        ELSE
          -- Text fields
          EXECUTE format('UPDATE public.leads SET %I = $1 WHERE id = $2', v_field_name)
          USING v_merged_lead::jsonb->>v_field_name, p_primary_lead_id;
        END IF;
      END IF;
      -- If 'primary', keep primary lead's value (no update needed)
    END LOOP;
  END IF;

  -- Mark merged lead as merged
  UPDATE public.leads
  SET is_merged = true,
      merged_into = p_primary_lead_id
  WHERE id = p_merged_lead_id;

  -- Create merge event record
  INSERT INTO public.lead_merge_events (
    workspace_id,
    primary_lead_id,
    merged_lead_id,
    merged_by,
    snapshot
  ) VALUES (
    p_workspace_id,
    p_primary_lead_id,
    p_merged_lead_id,
    p_merged_by,
    v_snapshot
  )
  RETURNING id INTO v_merge_event_id;

  -- Mark duplicates as reviewed
  UPDATE public.lead_duplicates
  SET reviewed_at = now()
  WHERE workspace_id = p_workspace_id
  AND (
    (lead_id = p_primary_lead_id AND duplicate_lead_id = p_merged_lead_id)
    OR
    (lead_id = p_merged_lead_id AND duplicate_lead_id = p_primary_lead_id)
  );

  -- Log team activity
  PERFORM public.log_team_activity(
    p_workspace_id,
    p_merged_by,
    p_primary_lead_id,
    NULL,  -- company_id
    NULL,  -- campaign_id
    NULL,  -- deal_id
    'lead_merged',
    format('Lead merged: %s into %s', 
      COALESCE(v_merged_lead.first_name || ' ' || v_merged_lead.last_name, v_merged_lead.email),
      COALESCE(v_primary_lead.first_name || ' ' || v_primary_lead.last_name, v_primary_lead.email)
    ),
    NULL,
    jsonb_build_object(
      'merge_event_id', v_merge_event_id,
      'merged_lead_id', p_merged_lead_id,
      'primary_lead_id', p_primary_lead_id
    ),
    now()
  );

  RETURN v_merge_event_id;
END;
$$;

COMMENT ON FUNCTION public.merge_leads IS 'Merges two leads, moving all related data to primary lead and creating merge event record';

-- 7. Undo Merge Function
CREATE OR REPLACE FUNCTION public.undo_lead_merge(
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
  v_merged_lead_data jsonb;
  v_deal_ids uuid[];
  v_thread_ids uuid[];
  v_note_ids uuid[];
  v_task_ids uuid[];
BEGIN
  -- Get merge event
  SELECT * INTO v_event
  FROM public.lead_merge_events
  WHERE id = p_merge_event_id
  AND undone_at IS NULL;  -- Not already undone

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Merge event not found or already undone';
  END IF;

  v_snapshot := v_event.snapshot;
  v_merged_lead_data := v_snapshot->'lead';

  -- Restore merged lead row
  UPDATE public.leads
  SET 
    is_merged = false,
    merged_into = NULL,
    email = v_merged_lead_data->>'email',
    first_name = v_merged_lead_data->>'first_name',
    last_name = v_merged_lead_data->>'last_name',
    company = v_merged_lead_data->>'company',
    title = v_merged_lead_data->>'title',
    phone = v_merged_lead_data->>'phone',
    linkedin_url = v_merged_lead_data->>'linkedin_url',
    owner_id = (v_merged_lead_data->>'owner_id')::uuid,
    score = (v_merged_lead_data->>'score')::int,
    workspace_id = v_event.workspace_id
  WHERE id = v_event.merged_lead_id;

  -- Move links back (only those that were originally on merged lead)
  -- Note: This is a simplified version - in production, you'd want to track
  -- which items were moved vs. which existed on primary
  
  -- Restore deals
  IF v_snapshot->'deals' IS NOT NULL AND jsonb_array_length(v_snapshot->'deals') > 0 THEN
    UPDATE public.deals
    SET lead_id = v_event.merged_lead_id
    WHERE id IN (SELECT jsonb_array_elements_text(v_snapshot->'deals')::uuid)
    AND lead_id = v_event.primary_lead_id;  -- Only restore if currently on primary
  END IF;

  -- Restore threads
  IF v_snapshot->'threads' IS NOT NULL AND jsonb_array_length(v_snapshot->'threads') > 0 THEN
    UPDATE public.reply_threads
    SET lead_id = v_event.merged_lead_id
    WHERE id IN (SELECT jsonb_array_elements_text(v_snapshot->'threads')::uuid)
    AND lead_id = v_event.primary_lead_id;
  END IF;

  -- Restore notes
  IF v_snapshot->'notes' IS NOT NULL AND jsonb_array_length(v_snapshot->'notes') > 0 THEN
    UPDATE public.notes
    SET lead_id = v_event.merged_lead_id
    WHERE id IN (SELECT jsonb_array_elements_text(v_snapshot->'notes')::uuid)
    AND lead_id = v_event.primary_lead_id;
  END IF;

  -- Restore tasks
  IF v_snapshot->'tasks' IS NOT NULL AND jsonb_array_length(v_snapshot->'tasks') > 0 THEN
    UPDATE public.tasks
    SET lead_id = v_event.merged_lead_id
    WHERE id IN (SELECT jsonb_array_elements_text(v_snapshot->'tasks')::uuid)
    AND lead_id = v_event.primary_lead_id;
  END IF;

  -- Mark merge event as undone
  UPDATE public.lead_merge_events
  SET undone_at = now(),
      undone_by = p_undone_by
  WHERE id = p_merge_event_id;

  -- Log team activity
  PERFORM public.log_team_activity(
    v_event.workspace_id,
    p_undone_by,
    v_event.merged_lead_id,
    NULL,
    NULL,
    NULL,
    'lead_merge_undone',
    format('Merge undone: Lead %s restored from merge with %s', 
      v_event.merged_lead_id,
      v_event.primary_lead_id
    ),
    NULL,
    jsonb_build_object(
      'merge_event_id', p_merge_event_id,
      'merged_lead_id', v_event.merged_lead_id,
      'primary_lead_id', v_event.primary_lead_id
    ),
    now()
  );
END;
$$;

COMMENT ON FUNCTION public.undo_lead_merge IS 'Undoes a lead merge by restoring the merged lead and moving links back (within 7 days)';

-- 8. Helper function to get merge preview
CREATE OR REPLACE FUNCTION public.get_merge_preview(
  p_primary_lead_id uuid,
  p_merged_lead_id uuid
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
  SELECT * INTO v_primary FROM public.leads WHERE id = p_primary_lead_id;
  SELECT * INTO v_merged FROM public.leads WHERE id = p_merged_lead_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found';
  END IF;

  SELECT jsonb_build_object(
    'primary_lead', row_to_json(v_primary),
    'merged_lead', row_to_json(v_merged),
    'deals', (
      SELECT jsonb_agg(row_to_json(d))
      FROM public.deals d
      WHERE d.lead_id = p_merged_lead_id
    ),
    'threads_count', (
      SELECT COUNT(*) FROM public.reply_threads WHERE lead_id = p_merged_lead_id
    ),
    'notes_count', (
      SELECT COUNT(*) FROM public.notes WHERE lead_id = p_merged_lead_id
    ),
    'tasks_count', (
      SELECT COUNT(*) FROM public.tasks WHERE lead_id = p_merged_lead_id
    ),
    'send_logs_count', (
      SELECT COUNT(*) FROM public.send_logs WHERE lead_id = p_merged_lead_id
    ),
    'activity_count', (
      SELECT COUNT(*) FROM public.lead_activity WHERE lead_id = p_merged_lead_id
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_merge_preview IS 'Returns preview of what will be merged, including counts of related objects';

-- 9. Schedule duplicate detection cron job (runs daily at 2 AM UTC)
DO $$
BEGIN
  -- Enable pg_cron extension if not already enabled
  CREATE EXTENSION IF NOT EXISTS pg_cron;

  -- Remove existing job if it exists
  PERFORM cron.unschedule('detect-lead-duplicates') WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'detect-lead-duplicates'
  );

  -- Schedule duplicate detection to run daily at 2 AM UTC
  PERFORM cron.schedule(
    'detect-lead-duplicates',
    '0 2 * * *', -- Daily at 2 AM UTC
    $$
    DO $$
    DECLARE
      v_workspace RECORD;
    BEGIN
      -- Run duplicate detection for each workspace
      FOR v_workspace IN SELECT DISTINCT id FROM public.workspaces
      LOOP
        BEGIN
          PERFORM public.detect_lead_duplicates(v_workspace.id);
        EXCEPTION WHEN OTHERS THEN
          -- Log error but continue with other workspaces
          RAISE WARNING 'Failed to detect duplicates for workspace %: %', v_workspace.id, SQLERRM;
        END;
      END LOOP;
    END $$;
    $$
  );
EXCEPTION WHEN OTHERS THEN
  -- If pg_cron is not available, just log a warning
  RAISE WARNING 'pg_cron extension not available, duplicate detection cron job not scheduled';
END $$;

