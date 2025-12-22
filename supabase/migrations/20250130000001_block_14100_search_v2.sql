-- =========================================================
-- Block 14100 — SmartSend Search v2
-- (The Advanced Search + Filter Engine That Lets Roofers Find ANY Homeowner Instantly)
-- =========================================================

-- ============================================================================
-- 1. SAVED SEARCHES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.saved_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  
  -- Search query
  query text, -- Free text search query
  
  -- Filter configuration (stored as JSONB for flexibility)
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- filters structure:
  -- {
  --   "status": ["HOT", "WARM"],
  --   "lead_score_min": 70,
  --   "lead_score_max": 100,
  --   "tags": ["storm_hail", "insurance_interest"],
  --   "cities": ["Spokane"],
  --   "neighborhoods": ["South Hill"],
  --   "list_ids": ["uuid1", "uuid2"],
  --   "storm_exposure": ["hail", "wind"],
  --   "email_status": ["opened", "not_opened"],
  --   "task_status": "has_tasks",
  --   "pipeline_stage": ["HOT", "WARM"]
  -- }
  
  -- Metadata
  is_shared boolean DEFAULT false, -- Share with workspace members
  usage_count integer DEFAULT 0, -- Track how often it's used
  last_used_at timestamptz,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_saved_searches_workspace ON public.saved_searches(workspace_id);
CREATE INDEX IF NOT EXISTS idx_saved_searches_user ON public.saved_searches(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_searches_workspace_user ON public.saved_searches(workspace_id, user_id);
CREATE INDEX IF NOT EXISTS idx_saved_searches_last_used ON public.saved_searches(last_used_at DESC);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_saved_searches_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_saved_searches_updated_at ON public.saved_searches;
CREATE TRIGGER trg_saved_searches_updated_at
BEFORE UPDATE ON public.saved_searches
FOR EACH ROW
EXECUTE FUNCTION public.set_saved_searches_updated_at();

-- RLS
ALTER TABLE public.saved_searches ENABLE ROW LEVEL SECURITY;

-- Users can view their own saved searches + shared ones in their workspace
CREATE POLICY "saved_searches_select_own_and_shared"
  ON public.saved_searches FOR SELECT
  USING (
    user_id = auth.uid() OR
    (is_shared = true AND workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    ))
  );

-- Users can insert their own saved searches
CREATE POLICY "saved_searches_insert_own"
  ON public.saved_searches FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can update their own saved searches
CREATE POLICY "saved_searches_update_own"
  ON public.saved_searches FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Users can delete their own saved searches
CREATE POLICY "saved_searches_delete_own"
  ON public.saved_searches FOR DELETE
  USING (user_id = auth.uid());

-- ============================================================================
-- 2. ENHANCE CONTACTS TABLE FOR SEARCH (if needed)
-- ============================================================================

-- Ensure contacts table has all necessary columns for search
DO $$
BEGIN
  -- Add lead_score if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'contacts' 
    AND column_name = 'lead_score'
  ) THEN
    ALTER TABLE public.contacts ADD COLUMN lead_score integer DEFAULT 0 CHECK (lead_score >= 0 AND lead_score <= 100);
  END IF;

  -- Add pipeline_stage if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'contacts' 
    AND column_name = 'pipeline_stage'
  ) THEN
    ALTER TABLE public.contacts ADD COLUMN pipeline_stage text CHECK (
      pipeline_stage IN ('HOT', 'WARM', 'FOLLOW-UP', 'COLD', 'NOT INTERESTED', 'new', 'contacted', 'scheduled', 'proposal', 'won', 'lost')
    );
  END IF;

  -- Add lead_status if not exists (alternative to pipeline_stage)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'contacts' 
    AND column_name = 'lead_status'
  ) THEN
    ALTER TABLE public.contacts ADD COLUMN lead_status text CHECK (
      lead_status IN ('new', 'attempting', 'warm', 'hot', 'qualified', 'booked', 'won', 'lost')
    );
  END IF;

  -- Add notes column if not exists (for search)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'contacts' 
    AND column_name = 'notes'
  ) THEN
    ALTER TABLE public.contacts ADD COLUMN notes text;
  END IF;
END $$;

-- ============================================================================
-- 3. CREATE INDEXES FOR FAST SEARCH FILTERING
-- ============================================================================

-- Lead score index
CREATE INDEX IF NOT EXISTS idx_contacts_lead_score ON public.contacts(lead_score) WHERE lead_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_workspace_lead_score ON public.contacts(workspace_id, lead_score) WHERE lead_score IS NOT NULL;

-- Pipeline stage index
CREATE INDEX IF NOT EXISTS idx_contacts_pipeline_stage ON public.contacts(pipeline_stage) WHERE pipeline_stage IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_workspace_pipeline_stage ON public.contacts(workspace_id, pipeline_stage) WHERE pipeline_stage IS NOT NULL;

-- Lead status index
CREATE INDEX IF NOT EXISTS idx_contacts_lead_status ON public.contacts(lead_status) WHERE lead_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_workspace_lead_status ON public.contacts(workspace_id, lead_status) WHERE lead_status IS NOT NULL;

-- City and neighborhood indexes (for location filtering)
CREATE INDEX IF NOT EXISTS idx_contacts_city ON public.contacts(city) WHERE city IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_workspace_city ON public.contacts(workspace_id, city) WHERE city IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_postal_code ON public.contacts(postal_code) WHERE postal_code IS NOT NULL;

-- Tags index (GIN index for array searches)
CREATE INDEX IF NOT EXISTS idx_contacts_tags_gin ON public.contacts USING gin(tags) WHERE tags IS NOT NULL AND array_length(tags, 1) > 0;

-- ============================================================================
-- 4. CREATE VIEW FOR CONTACT SEARCH WITH ENRICHMENT DATA
-- ============================================================================

CREATE OR REPLACE VIEW public.contact_search_view AS
SELECT 
  c.id,
  c.workspace_id,
  c.email,
  c.first_name,
  c.last_name,
  c.company,
  c.city,
  c.state,
  c.postal_code,
  c.phone,
  c.tags,
  c.lead_score,
  c.pipeline_stage,
  c.lead_status,
  c.notes,
  c.created_at,
  c.updated_at,
  
  -- Enrichment data
  ce.inferred_neighborhood as neighborhood,
  ce.storm_risk_level,
  ce.insurance_interest,
  ce.property_type,
  
  -- Aggregate task counts
  COALESCE(task_counts.has_tasks, false) as has_tasks,
  COALESCE(task_counts.overdue_tasks, false) as has_overdue_tasks,
  COALESCE(task_counts.task_count, 0) as task_count,
  
  -- Aggregate list membership
  COALESCE(list_ids.list_ids, ARRAY[]::uuid[]) as list_ids,
  
  -- Email activity (from email_logs or similar)
  COALESCE(email_stats.has_opened, false) as has_opened,
  COALESCE(email_stats.has_bounced, false) as has_bounced,
  COALESCE(email_stats.has_unsubscribed, false) as has_unsubscribed,
  COALESCE(email_stats.has_complained, false) as has_complained
  
FROM public.contacts c
LEFT JOIN public.contact_enrichment ce ON ce.contact_id = c.id
LEFT JOIN (
  SELECT 
    contact_id,
    COUNT(*) > 0 as has_tasks,
    COUNT(*) FILTER (WHERE due_at < now() AND completed = false) > 0 as overdue_tasks,
    COUNT(*)::integer as task_count
  FROM public.tasks
  WHERE contact_id IS NOT NULL
  GROUP BY contact_id
) task_counts ON task_counts.contact_id = c.id
LEFT JOIN (
  SELECT 
    contact_id,
    ARRAY_AGG(DISTINCT list_id) as list_ids
  FROM public.contact_list_members
  GROUP BY contact_id
) list_ids ON list_ids.contact_id = c.id
LEFT JOIN (
  SELECT 
    contact_id,
    MAX(CASE WHEN event_type = 'opened' THEN true ELSE false END) as has_opened,
    MAX(CASE WHEN event_type IN ('bounced', 'hard_bounced', 'soft_bounced') THEN true ELSE false END) as has_bounced,
    MAX(CASE WHEN event_type = 'unsubscribed' THEN true ELSE false END) as has_unsubscribed,
    MAX(CASE WHEN event_type = 'complained' THEN true ELSE false END) as has_complained
  FROM (
    SELECT contact_id, event_type
    FROM public.email_logs el
    JOIN public.campaign_contacts cc ON cc.id = el.campaign_contact_id
    WHERE el.event_type IN ('opened', 'bounced', 'hard_bounced', 'soft_bounced', 'unsubscribed', 'complained')
    UNION ALL
    SELECT contact_id, event_type
    FROM public.email_events ee
    JOIN public.contacts c ON c.email = ee.to_email
    WHERE ee.event_type IN ('opened', 'bounced', 'unsubscribed', 'complained')
  ) email_activity
  GROUP BY contact_id
) email_stats ON email_stats.contact_id = c.id;

-- Grant access
GRANT SELECT ON public.contact_search_view TO authenticated;

-- ============================================================================
-- 5. CREATE SEARCH FUNCTION (RPC) FOR ADVANCED FILTERING
-- ============================================================================

CREATE OR REPLACE FUNCTION public.search_contacts_v2(
  p_workspace_id uuid,
  p_query text DEFAULT NULL,
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  email text,
  first_name text,
  last_name text,
  company text,
  city text,
  state text,
  postal_code text,
  phone text,
  tags text[],
  lead_score integer,
  pipeline_stage text,
  lead_status text,
  neighborhood text,
  storm_risk_level text,
  insurance_interest boolean,
  has_tasks boolean,
  has_overdue_tasks boolean,
  task_count integer,
  list_ids uuid[],
  has_opened boolean,
  has_bounced boolean,
  has_unsubscribed boolean,
  has_complained boolean,
  created_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sql text;
  v_where_clauses text[] := ARRAY[]::text[];
  v_count_sql text;
  v_total_count bigint;
BEGIN
  -- Base WHERE clause: workspace_id
  v_where_clauses := ARRAY_APPEND(v_where_clauses, format('c.workspace_id = %L', p_workspace_id));

  -- Text search query
  IF p_query IS NOT NULL AND trim(p_query) != '' THEN
    v_where_clauses := ARRAY_APPEND(v_where_clauses, format(
      '(c.email ILIKE %L OR c.first_name ILIKE %L OR c.last_name ILIKE %L OR c.city ILIKE %L OR c.postal_code ILIKE %L OR c.notes ILIKE %L OR EXISTS (SELECT 1 FROM unnest(c.tags) tag WHERE tag ILIKE %L))',
      '%' || p_query || '%',
      '%' || p_query || '%',
      '%' || p_query || '%',
      '%' || p_query || '%',
      '%' || p_query || '%',
      '%' || p_query || '%',
      '%' || p_query || '%'
    ));
  END IF;

  -- Filter: Status (pipeline_stage or lead_status)
  IF p_filters ? 'status' AND jsonb_array_length(p_filters->'status') > 0 THEN
    v_where_clauses := ARRAY_APPEND(v_where_clauses, format(
      '(c.pipeline_stage = ANY(%L::text[]) OR c.lead_status = ANY(%L::text[]))',
      p_filters->'status',
      p_filters->'status'
    ));
  END IF;

  -- Filter: Lead Score Range
  IF p_filters ? 'lead_score_min' THEN
    v_where_clauses := ARRAY_APPEND(v_where_clauses, format('c.lead_score >= %s', (p_filters->>'lead_score_min')::integer));
  END IF;
  IF p_filters ? 'lead_score_max' THEN
    v_where_clauses := ARRAY_APPEND(v_where_clauses, format('c.lead_score <= %s', (p_filters->>'lead_score_max')::integer));
  END IF;

  -- Filter: Tags
  IF p_filters ? 'tags' AND jsonb_array_length(p_filters->'tags') > 0 THEN
    v_where_clauses := ARRAY_APPEND(v_where_clauses, format(
      'c.tags && %L::text[]',
      p_filters->'tags'
    ));
  END IF;

  -- Filter: Cities
  IF p_filters ? 'cities' AND jsonb_array_length(p_filters->'cities') > 0 THEN
    v_where_clauses := ARRAY_APPEND(v_where_clauses, format(
      'c.city = ANY(%L::text[])',
      p_filters->'cities'
    ));
  END IF;

  -- Filter: Neighborhoods (from enrichment)
  IF p_filters ? 'neighborhoods' AND jsonb_array_length(p_filters->'neighborhoods') > 0 THEN
    v_where_clauses := ARRAY_APPEND(v_where_clauses, format(
      'EXISTS (SELECT 1 FROM public.contact_enrichment ce WHERE ce.contact_id = c.id AND ce.inferred_neighborhood = ANY(%L::text[]))',
      p_filters->'neighborhoods'
    ));
  END IF;

  -- Filter: Lists
  IF p_filters ? 'list_ids' AND jsonb_array_length(p_filters->'list_ids') > 0 THEN
    v_where_clauses := ARRAY_APPEND(v_where_clauses, format(
      'EXISTS (SELECT 1 FROM public.contact_list_members clm WHERE clm.contact_id = c.id AND clm.list_id = ANY(%L::uuid[]))',
      p_filters->'list_ids'
    ));
  END IF;

  -- Filter: Storm Exposure
  IF p_filters ? 'storm_exposure' AND jsonb_array_length(p_filters->'storm_exposure') > 0 THEN
    v_where_clauses := ARRAY_APPEND(v_where_clauses, format(
      'EXISTS (SELECT 1 FROM public.contact_enrichment ce WHERE ce.contact_id = c.id AND ce.storm_risk_level = ANY(%L::text[]))',
      p_filters->'storm_exposure'
    ));
  END IF;

  -- Filter: Email Activity
  IF p_filters ? 'email_status' THEN
    CASE p_filters->>'email_status'
      WHEN 'opened' THEN
        v_where_clauses := ARRAY_APPEND(v_where_clauses, 'EXISTS (SELECT 1 FROM public.email_logs el JOIN public.campaign_contacts cc ON cc.id = el.campaign_contact_id WHERE cc.contact_id = c.id AND el.event_type = ''opened'')');
      WHEN 'not_opened' THEN
        v_where_clauses := ARRAY_APPEND(v_where_clauses, 'NOT EXISTS (SELECT 1 FROM public.email_logs el JOIN public.campaign_contacts cc ON cc.id = el.campaign_contact_id WHERE cc.contact_id = c.id AND el.event_type = ''opened'')');
      WHEN 'hard_bounced' THEN
        v_where_clauses := ARRAY_APPEND(v_where_clauses, 'EXISTS (SELECT 1 FROM public.email_logs el JOIN public.campaign_contacts cc ON cc.id = el.campaign_contact_id WHERE cc.contact_id = c.id AND el.event_type = ''hard_bounced'')');
      WHEN 'soft_bounced' THEN
        v_where_clauses := ARRAY_APPEND(v_where_clauses, 'EXISTS (SELECT 1 FROM public.email_logs el JOIN public.campaign_contacts cc ON cc.id = el.campaign_contact_id WHERE cc.contact_id = c.id AND el.event_type = ''soft_bounced'')');
      WHEN 'unsubscribed' THEN
        v_where_clauses := ARRAY_APPEND(v_where_clauses, 'EXISTS (SELECT 1 FROM public.email_logs el JOIN public.campaign_contacts cc ON cc.id = el.campaign_contact_id WHERE cc.contact_id = c.id AND el.event_type = ''unsubscribed'')');
      WHEN 'complaint' THEN
        v_where_clauses := ARRAY_APPEND(v_where_clauses, 'EXISTS (SELECT 1 FROM public.email_logs el JOIN public.campaign_contacts cc ON cc.id = el.campaign_contact_id WHERE cc.contact_id = c.id AND el.event_type = ''complained'')');
    END CASE;
  END IF;

  -- Filter: Task Status
  IF p_filters ? 'task_status' THEN
    CASE p_filters->>'task_status'
      WHEN 'has_tasks' THEN
        v_where_clauses := ARRAY_APPEND(v_where_clauses, 'EXISTS (SELECT 1 FROM public.tasks t WHERE t.contact_id = c.id)');
      WHEN 'overdue_tasks' THEN
        v_where_clauses := ARRAY_APPEND(v_where_clauses, 'EXISTS (SELECT 1 FROM public.tasks t WHERE t.contact_id = c.id AND t.due_at < now() AND t.completed = false)');
      WHEN 'completed_tasks' THEN
        v_where_clauses := ARRAY_APPEND(v_where_clauses, 'EXISTS (SELECT 1 FROM public.tasks t WHERE t.contact_id = c.id AND t.completed = true)');
      WHEN 'no_tasks' THEN
        v_where_clauses := ARRAY_APPEND(v_where_clauses, 'NOT EXISTS (SELECT 1 FROM public.tasks t WHERE t.contact_id = c.id)');
    END CASE;
  END IF;

  -- Build the main query
  v_sql := format('
    SELECT 
      c.id,
      c.email,
      c.first_name,
      c.last_name,
      c.company,
      c.city,
      c.state,
      c.postal_code,
      c.phone,
      c.tags,
      c.lead_score,
      c.pipeline_stage,
      c.lead_status,
      ce.inferred_neighborhood as neighborhood,
      ce.storm_risk_level,
      ce.insurance_interest,
      COALESCE(task_counts.has_tasks, false) as has_tasks,
      COALESCE(task_counts.overdue_tasks, false) as has_overdue_tasks,
      COALESCE(task_counts.task_count, 0) as task_count,
      COALESCE(list_ids.list_ids, ARRAY[]::uuid[]) as list_ids,
      COALESCE(email_stats.has_opened, false) as has_opened,
      COALESCE(email_stats.has_bounced, false) as has_bounced,
      COALESCE(email_stats.has_unsubscribed, false) as has_unsubscribed,
      COALESCE(email_stats.has_complained, false) as has_complained,
      c.created_at,
      c.updated_at,
      COUNT(*) OVER() as total_count
    FROM public.contacts c
    LEFT JOIN public.contact_enrichment ce ON ce.contact_id = c.id
    LEFT JOIN (
      SELECT 
        contact_id,
        COUNT(*) > 0 as has_tasks,
        COUNT(*) FILTER (WHERE due_at < now() AND completed = false) > 0 as overdue_tasks,
        COUNT(*)::integer as task_count
      FROM public.tasks
      WHERE contact_id IS NOT NULL
      GROUP BY contact_id
    ) task_counts ON task_counts.contact_id = c.id
    LEFT JOIN (
      SELECT 
        contact_id,
        ARRAY_AGG(DISTINCT list_id) as list_ids
      FROM public.contact_list_members
      GROUP BY contact_id
    ) list_ids ON list_ids.contact_id = c.id
    LEFT JOIN (
      SELECT 
        contact_id,
        MAX(CASE WHEN event_type = ''opened'' THEN true ELSE false END) as has_opened,
        MAX(CASE WHEN event_type IN (''bounced'', ''hard_bounced'', ''soft_bounced'') THEN true ELSE false END) as has_bounced,
        MAX(CASE WHEN event_type = ''unsubscribed'' THEN true ELSE false END) as has_unsubscribed,
        MAX(CASE WHEN event_type = ''complained'' THEN true ELSE false END) as has_complained
      FROM (
        SELECT cc.contact_id, el.event_type
        FROM public.email_logs el
        JOIN public.campaign_contacts cc ON cc.id = el.campaign_contact_id
        WHERE el.event_type IN (''opened'', ''bounced'', ''hard_bounced'', ''soft_bounced'', ''unsubscribed'', ''complained'')
      ) email_activity
      GROUP BY contact_id
    ) email_stats ON email_stats.contact_id = c.id
    WHERE %s
    ORDER BY c.lead_score DESC NULLS LAST, c.created_at DESC
    LIMIT %s OFFSET %s
  ', array_to_string(v_where_clauses, ' AND '), p_limit, p_offset);

  -- Execute and return
  RETURN QUERY EXECUTE v_sql;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.search_contacts_v2(uuid, text, jsonb, integer, integer) TO authenticated;

-- ============================================================================
-- 6. HELPER FUNCTION FOR USAGE TRACKING
-- ============================================================================

CREATE OR REPLACE FUNCTION public.increment_saved_search_usage(p_search_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.saved_searches
  SET 
    usage_count = usage_count + 1,
    last_used_at = now()
  WHERE id = p_search_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_saved_search_usage(uuid) TO authenticated;

-- Comments
COMMENT ON TABLE public.saved_searches IS 'Saved search presets for SmartSend Search v2';
COMMENT ON FUNCTION public.search_contacts_v2 IS 'Advanced contact search with filtering by status, score, tags, location, lists, storm exposure, email activity, and tasks';
COMMENT ON FUNCTION public.increment_saved_search_usage IS 'Increment usage count and update last_used_at for a saved search';

