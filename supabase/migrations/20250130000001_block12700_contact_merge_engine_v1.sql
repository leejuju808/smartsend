-- =========================================================
-- Block 12700 — SmartSend Roofing Contact Merge v1
-- (The Auto-Merge System That Deletes Duplicates & Keeps Roofer Lists Clean)
-- =========================================================

-- ============================================================================
-- 1. CONTACT_MERGE_EVENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.contact_merge_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  primary_contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  merged_contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  reason text NOT NULL, -- 'exact_email', 'name_street', 'email_domain_name', 'phone', 'manual'
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_merge_events_workspace 
  ON public.contact_merge_events(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contact_merge_events_primary 
  ON public.contact_merge_events(primary_contact_id);

CREATE INDEX IF NOT EXISTS idx_contact_merge_events_merged 
  ON public.contact_merge_events(merged_contact_id);

-- RLS Policies
ALTER TABLE public.contact_merge_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contact_merge_events_select_workspace"
  ON public.contact_merge_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.id = auth.uid() AND p.workspace_id = contact_merge_events.workspace_id
    )
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.user_id = auth.uid() AND wm.workspace_id = contact_merge_events.workspace_id
    )
  );

COMMENT ON TABLE public.contact_merge_events IS 'Audit log of all contact merges (automatic and manual)';

-- ============================================================================
-- 2. ENHANCED DUPLICATE DETECTION FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.detect_contact_duplicates_v2(
  p_workspace_id uuid
)
RETURNS TABLE (
  group_id text,
  contact_id uuid,
  name text,
  email text,
  phone text,
  street text,
  city text,
  zip text,
  tags jsonb,
  match_type text,
  match_score integer,
  match_reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Rule 1: Exact Email Match (100% confidence)
  RETURN QUERY
  SELECT 
    'email_' || lower(c1.email) as group_id,
    c1.id as contact_id,
    coalesce(c1.first_name || ' ' || c1.last_name, '') as name,
    c1.email,
    c1.phone,
    coalesce(c1.address, c1.street, '') as street,
    c1.city,
    coalesce(c1.zip, c1.postal_code, '') as zip,
    coalesce(
      CASE WHEN jsonb_typeof(c1.tags::jsonb) = 'array' THEN c1.tags::jsonb ELSE '[]'::jsonb END,
      CASE WHEN c1.tags IS NULL THEN '[]'::jsonb ELSE to_jsonb(c1.tags) END,
      '[]'::jsonb
    ) as tags,
    'exact_email' as match_type,
    100 as match_score,
    'Exact email match' as match_reason
  FROM public.contacts c1
  WHERE c1.workspace_id = p_workspace_id
    AND c1.merged_into IS NULL
    AND EXISTS (
      SELECT 1 FROM public.contacts c2
      WHERE c2.workspace_id = p_workspace_id
        AND c2.id != c1.id
        AND c2.merged_into IS NULL
        AND lower(c2.email) = lower(c1.email)
    );

  -- Rule 2: Same Name + Same Street (High confidence)
  RETURN QUERY
  SELECT 
    'name_street_' || lower(coalesce(c1.first_name || ' ' || c1.last_name, '')) || '_' || 
      lower(regexp_replace(coalesce(c1.address, c1.street, ''), '[^a-z0-9]', '', 'gi')) as group_id,
    c1.id as contact_id,
    coalesce(c1.first_name || ' ' || c1.last_name, '') as name,
    c1.email,
    c1.phone,
    coalesce(c1.address, c1.street, '') as street,
    c1.city,
    coalesce(c1.zip, c1.postal_code, '') as zip,
    coalesce(
      CASE WHEN jsonb_typeof(c1.tags::jsonb) = 'array' THEN c1.tags::jsonb ELSE '[]'::jsonb END,
      CASE WHEN c1.tags IS NULL THEN '[]'::jsonb ELSE to_jsonb(c1.tags) END,
      '[]'::jsonb
    ) as tags,
    'name_street' as match_type,
    90 as match_score,
    'Same name + same street address' as match_reason
  FROM public.contacts c1
  WHERE c1.workspace_id = p_workspace_id
    AND c1.merged_into IS NULL
    AND coalesce(c1.first_name || ' ' || c1.last_name, '') != ''
    AND (c1.address IS NOT NULL OR c1.street IS NOT NULL)
    AND trim(coalesce(c1.address, c1.street, '')) != ''
    AND EXISTS (
      SELECT 1 FROM public.contacts c2
      WHERE c2.workspace_id = p_workspace_id
        AND c2.id != c1.id
        AND c2.merged_into IS NULL
        AND lower(coalesce(c2.first_name || ' ' || c2.last_name, '')) = lower(coalesce(c1.first_name || ' ' || c1.last_name, ''))
        AND lower(regexp_replace(coalesce(c2.address, c2.street, ''), '[^a-z0-9]', '', 'gi')) = 
            lower(regexp_replace(coalesce(c1.address, c1.street, ''), '[^a-z0-9]', '', 'gi'))
    );

  -- Rule 3: Same Email Domain + Partial Name Match
  RETURN QUERY
  SELECT DISTINCT ON (c1.id)
    'domain_name_' || split_part(c1.email, '@', 2) || '_' || 
      lower(substring(coalesce(c1.first_name, ''), 1, 3)) as group_id,
    c1.id as contact_id,
    coalesce(c1.first_name || ' ' || c1.last_name, '') as name,
    c1.email,
    c1.phone,
    coalesce(c1.address, c1.street, '') as street,
    c1.city,
    coalesce(c1.zip, c1.postal_code, '') as zip,
    coalesce(
      CASE WHEN jsonb_typeof(c1.tags::jsonb) = 'array' THEN c1.tags::jsonb ELSE '[]'::jsonb END,
      CASE WHEN c1.tags IS NULL THEN '[]'::jsonb ELSE to_jsonb(c1.tags) END,
      '[]'::jsonb
    ) as tags,
    'email_domain_name' as match_type,
    70 as match_score,
    'Same email domain + partial name match' as match_reason
  FROM public.contacts c1
  WHERE c1.workspace_id = p_workspace_id
    AND c1.merged_into IS NULL
    AND c1.email LIKE '%@%'
    AND c1.first_name IS NOT NULL
    AND length(c1.first_name) >= 3
    AND EXISTS (
      SELECT 1 FROM public.contacts c2
      WHERE c2.workspace_id = p_workspace_id
        AND c2.id != c1.id
        AND c2.merged_into IS NULL
        AND split_part(c2.email, '@', 2) = split_part(c1.email, '@', 2)
        AND (
          lower(substring(c2.first_name, 1, 3)) = lower(substring(c1.first_name, 1, 3))
          OR (c1.last_name IS NOT NULL AND c2.last_name IS NOT NULL 
              AND lower(c2.last_name) = lower(c1.last_name)
              AND similarity(c2.first_name, c1.first_name) > 0.6)
        )
    );

  -- Rule 4: Same Phone (v2 - planned now)
  RETURN QUERY
  SELECT 
    'phone_' || regexp_replace(coalesce(c1.phone, ''), '[^0-9]', '', 'g') as group_id,
    c1.id as contact_id,
    coalesce(c1.first_name || ' ' || c1.last_name, '') as name,
    c1.email,
    c1.phone,
    coalesce(c1.address, c1.street, '') as street,
    c1.city,
    coalesce(c1.zip, c1.postal_code, '') as zip,
    coalesce(
      CASE WHEN jsonb_typeof(c1.tags::jsonb) = 'array' THEN c1.tags::jsonb ELSE '[]'::jsonb END,
      CASE WHEN c1.tags IS NULL THEN '[]'::jsonb ELSE to_jsonb(c1.tags) END,
      '[]'::jsonb
    ) as tags,
    'phone' as match_type,
    85 as match_score,
    'Same phone number' as match_reason
  FROM public.contacts c1
  WHERE c1.workspace_id = p_workspace_id
    AND c1.merged_into IS NULL
    AND c1.phone IS NOT NULL
    AND trim(c1.phone) != ''
    AND length(regexp_replace(coalesce(c1.phone, ''), '[^0-9]', '', 'g')) >= 10
    AND EXISTS (
      SELECT 1 FROM public.contacts c2
      WHERE c2.workspace_id = p_workspace_id
        AND c2.id != c1.id
        AND c2.merged_into IS NULL
        AND c2.phone IS NOT NULL
        AND trim(c2.phone) != ''
        AND regexp_replace(coalesce(c2.phone, ''), '[^0-9]', '', 'g') = 
            regexp_replace(coalesce(c1.phone, ''), '[^0-9]', '', 'g')
    );
END;
$$;

COMMENT ON FUNCTION public.detect_contact_duplicates_v2 IS 'Enhanced duplicate detection with name+street, email domain+name, and phone matching';

-- ============================================================================
-- 3. ENHANCED MERGE FUNCTION WITH STATUS PRIORITY & DATA PRESERVATION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.merge_contacts_v2(
  p_workspace_id uuid,
  p_primary_contact_id uuid,
  p_duplicate_contact_id uuid,
  p_reason text DEFAULT 'manual',
  p_merged_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_primary_contact record;
  v_duplicate_contact record;
  v_final_email text;
  v_final_first_name text;
  v_final_last_name text;
  v_final_phone text;
  v_final_address text;
  v_final_city text;
  v_final_state text;
  v_final_zip text;
  v_final_company text;
  v_final_title text;
  v_final_tags jsonb;
  v_final_status text;
  v_final_lead_status text;
  v_tag text;
  v_status_priority jsonb := '{"Hot": 5, "Warm": 4, "Customer": 3, "Attempting": 2, "New": 1, "Not Interested": 0}'::jsonb;
  v_lead_status_priority jsonb := '{"won": 7, "booked": 6, "qualified": 5, "hot": 4, "warm": 3, "attempting": 2, "new": 1, "lost": 0}'::jsonb;
  v_primary_status_score integer;
  v_duplicate_status_score integer;
  v_primary_lead_status_score integer;
  v_duplicate_lead_status_score integer;
BEGIN
  -- Validate both contacts exist and belong to workspace
  SELECT * INTO v_primary_contact
  FROM public.contacts
  WHERE id = p_primary_contact_id
    AND workspace_id = p_workspace_id
    AND merged_into IS NULL;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Primary contact not found or already merged';
  END IF;
  
  SELECT * INTO v_duplicate_contact
  FROM public.contacts
  WHERE id = p_duplicate_contact_id
    AND workspace_id = p_workspace_id
    AND merged_into IS NULL;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Duplicate contact not found or already merged';
  END IF;
  
  -- Merge fields: keep most complete data
  v_final_email := COALESCE(v_primary_contact.email, v_duplicate_contact.email);
  v_final_first_name := COALESCE(NULLIF(trim(v_primary_contact.first_name), ''), NULLIF(trim(v_duplicate_contact.first_name), ''));
  v_final_last_name := COALESCE(NULLIF(trim(v_primary_contact.last_name), ''), NULLIF(trim(v_duplicate_contact.last_name), ''));
  v_final_phone := COALESCE(NULLIF(trim(v_primary_contact.phone), ''), NULLIF(trim(v_duplicate_contact.phone), ''));
  v_final_address := COALESCE(
    NULLIF(trim(COALESCE(v_primary_contact.address, v_primary_contact.street)), ''),
    NULLIF(trim(COALESCE(v_duplicate_contact.address, v_duplicate_contact.street)), '')
  );
  v_final_city := COALESCE(NULLIF(trim(v_primary_contact.city), ''), NULLIF(trim(v_duplicate_contact.city), ''));
  v_final_state := COALESCE(NULLIF(trim(v_primary_contact.state), ''), NULLIF(trim(v_duplicate_contact.state), ''));
  v_final_zip := COALESCE(
    NULLIF(trim(COALESCE(v_primary_contact.zip, v_primary_contact.postal_code)), ''),
    NULLIF(trim(COALESCE(v_duplicate_contact.zip, v_duplicate_contact.postal_code)), '')
  );
  v_final_company := COALESCE(NULLIF(trim(v_primary_contact.company), ''), NULLIF(trim(v_duplicate_contact.company), ''));
  v_final_title := COALESCE(NULLIF(trim(v_primary_contact.title), ''), NULLIF(trim(v_duplicate_contact.title), ''));
  
  -- Rule 1: Status Priority (HOT > WARM > NEW)
  v_primary_status_score := COALESCE((v_status_priority->>COALESCE(v_primary_contact.status, 'New'))::integer, 0);
  v_duplicate_status_score := COALESCE((v_status_priority->>COALESCE(v_duplicate_contact.status, 'New'))::integer, 0);
  
  IF v_duplicate_status_score > v_primary_status_score THEN
    v_final_status := v_duplicate_contact.status;
  ELSE
    v_final_status := COALESCE(v_primary_contact.status, 'New');
  END IF;
  
  -- Lead status priority
  v_primary_lead_status_score := COALESCE((v_lead_status_priority->>COALESCE(v_primary_contact.lead_status, 'new'))::integer, 0);
  v_duplicate_lead_status_score := COALESCE((v_lead_status_priority->>COALESCE(v_duplicate_contact.lead_status, 'new'))::integer, 0);
  
  IF v_duplicate_lead_status_score > v_primary_lead_status_score THEN
    v_final_lead_status := v_duplicate_contact.lead_status;
  ELSE
    v_final_lead_status := COALESCE(v_primary_contact.lead_status, 'new');
  END IF;
  
  -- Rule 2: Tag Union (combine all tags, remove duplicates)
  v_final_tags := COALESCE(
    CASE 
      WHEN jsonb_typeof(v_primary_contact.tags::jsonb) = 'array' THEN v_primary_contact.tags::jsonb
      WHEN v_primary_contact.tags IS NOT NULL THEN to_jsonb(ARRAY[v_primary_contact.tags::text])
      ELSE '[]'::jsonb
    END,
    '[]'::jsonb
  );
  
  -- Add tags from duplicate contact
  IF v_duplicate_contact.tags IS NOT NULL THEN
    IF jsonb_typeof(v_duplicate_contact.tags::jsonb) = 'array' THEN
      FOR v_tag IN SELECT jsonb_array_elements_text(v_duplicate_contact.tags::jsonb)
      LOOP
        IF NOT (v_final_tags ? v_tag) THEN
          v_final_tags := v_final_tags || to_jsonb(ARRAY[v_tag]);
        END IF;
      END LOOP;
    ELSIF v_duplicate_contact.tags IS NOT NULL THEN
      v_tag := v_duplicate_contact.tags::text;
      IF NOT (v_final_tags ? v_tag) THEN
        v_final_tags := v_final_tags || to_jsonb(ARRAY[v_tag]);
      END IF;
    END IF;
  END IF;
  
  -- Update primary contact with merged data
  UPDATE public.contacts
  SET
    email = v_final_email,
    first_name = v_final_first_name,
    last_name = v_final_last_name,
    phone = v_final_phone,
    address = COALESCE(v_final_address, address),
    street = COALESCE(v_final_address, street),
    city = v_final_city,
    state = v_final_state,
    zip = COALESCE(v_final_zip, zip),
    postal_code = COALESCE(v_final_zip, postal_code),
    company = v_final_company,
    title = v_final_title,
    tags = CASE 
      WHEN jsonb_typeof(v_final_tags) = 'array' THEN v_final_tags
      ELSE v_final_tags
    END,
    status = v_final_status,
    lead_status = v_final_lead_status,
    updated_at = now()
  WHERE id = p_primary_contact_id;
  
  -- Merge notes: update contact_id to primary
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'contact_notes'
  ) THEN
    UPDATE public.contact_notes
    SET contact_id = p_primary_contact_id
    WHERE contact_id = p_duplicate_contact_id;
  END IF;
  
  -- Merge timeline events: update contact_id to primary
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'activity_events'
  ) THEN
    UPDATE public.activity_events
    SET contact_id = p_primary_contact_id
    WHERE contact_id = p_duplicate_contact_id;
  END IF;
  
  -- Merge tasks: update contact_id to primary
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'tasks'
  ) THEN
    UPDATE public.tasks
    SET contact_id = p_primary_contact_id
    WHERE contact_id = p_duplicate_contact_id;
  END IF;
  
  -- Merge campaign enrollment: update contact_id to primary
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'campaign_contacts'
  ) THEN
    UPDATE public.campaign_contacts
    SET contact_id = p_primary_contact_id
    WHERE contact_id = p_duplicate_contact_id
    ON CONFLICT DO NOTHING;
  END IF;
  
  -- Merge leads (if leads table exists)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'leads'
      AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'contact_id'
      )
  ) THEN
    UPDATE public.leads
    SET contact_id = p_primary_contact_id
    WHERE contact_id = p_duplicate_contact_id;
  END IF;
  
  -- Mark duplicate as merged
  UPDATE public.contacts
  SET merged_into = p_primary_contact_id
  WHERE id = p_duplicate_contact_id;
  
  -- Log merge event
  INSERT INTO public.contact_merge_events (
    workspace_id,
    user_id,
    primary_contact_id,
    merged_contact_id,
    reason
  ) VALUES (
    p_workspace_id,
    p_merged_by,
    p_primary_contact_id,
    p_duplicate_contact_id,
    p_reason
  );
  
  -- Create activity event (handle both org_id and workspace_id columns)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'activity_events'
  ) THEN
    -- Check if table has org_id or workspace_id column
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'activity_events' AND column_name = 'org_id'
    ) THEN
      INSERT INTO public.activity_events (
        org_id,
        user_id,
        type,
        title,
        description,
        contact_id,
        metadata
      ) VALUES (
        p_workspace_id,
        p_merged_by,
        'contact_merged',
        'Contact merged',
        COALESCE(v_primary_contact.first_name || ' ' || v_primary_contact.last_name, v_primary_contact.email) || 
          ' merged with ' || 
          COALESCE(v_duplicate_contact.first_name || ' ' || v_duplicate_contact.last_name, v_duplicate_contact.email),
        p_primary_contact_id,
        jsonb_build_object(
          'merged_contact_id', p_duplicate_contact_id,
          'merged_contact_email', v_duplicate_contact.email,
          'reason', p_reason
        )
      );
    ELSIF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'activity_events' AND column_name = 'workspace_id'
    ) THEN
      INSERT INTO public.activity_events (
        workspace_id,
        user_id,
        type,
        title,
        description,
        contact_id,
        metadata
      ) VALUES (
        p_workspace_id,
        p_merged_by,
        'contact_merged',
        'Contact merged',
        COALESCE(v_primary_contact.first_name || ' ' || v_primary_contact.last_name, v_primary_contact.email) || 
          ' merged with ' || 
          COALESCE(v_duplicate_contact.first_name || ' ' || v_duplicate_contact.last_name, v_duplicate_contact.email),
        p_primary_contact_id,
        jsonb_build_object(
          'merged_contact_id', p_duplicate_contact_id,
          'merged_contact_email', v_duplicate_contact.email,
          'reason', p_reason
        )
      );
    END IF;
  END IF;
  
  RETURN p_primary_contact_id;
END;
$$;

COMMENT ON FUNCTION public.merge_contacts_v2 IS 'Enhanced merge function with status priority, tag union, and complete data preservation';

-- ============================================================================
-- 4. AUTO-MERGE ENGINE (Hourly Worker)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_merge_contacts_hourly(
  p_workspace_id uuid DEFAULT NULL
)
RETURNS TABLE (
  workspace_id uuid,
  merged_count integer,
  merge_details jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace record;
  v_merged_count integer;
  v_merge_details jsonb := '[]'::jsonb;
  v_contact record;
  v_duplicate record;
  v_primary_id uuid;
  v_merge_detail jsonb;
BEGIN
  -- If workspace_id provided, process only that workspace
  -- Otherwise, process all workspaces
  FOR v_workspace IN
    SELECT DISTINCT workspace_id 
    FROM public.contacts
    WHERE (p_workspace_id IS NULL OR workspace_id = p_workspace_id)
      AND merged_into IS NULL
  LOOP
    v_merged_count := 0;
    v_merge_details := '[]'::jsonb;
    
    -- Auto-merge exact email matches
    FOR v_contact IN
      SELECT DISTINCT ON (lower(email)) c1.*
      FROM public.contacts c1
      WHERE c1.workspace_id = v_workspace.workspace_id
        AND c1.merged_into IS NULL
        AND EXISTS (
          SELECT 1 FROM public.contacts c2
          WHERE c2.workspace_id = v_workspace.workspace_id
            AND c2.id != c1.id
            AND c2.merged_into IS NULL
            AND lower(c2.email) = lower(c1.email)
        )
      ORDER BY lower(c1.email), c1.created_at ASC
    LOOP
      -- Find the earliest contact with this email (primary)
      SELECT id INTO v_primary_id
      FROM public.contacts
      WHERE workspace_id = v_workspace.workspace_id
        AND lower(email) = lower(v_contact.email)
        AND merged_into IS NULL
      ORDER BY created_at ASC
      LIMIT 1;
      
      -- Merge all other contacts with same email into primary
      FOR v_duplicate IN
        SELECT id, email, first_name, last_name
        FROM public.contacts
        WHERE workspace_id = v_workspace.workspace_id
          AND lower(email) = lower(v_contact.email)
          AND merged_into IS NULL
          AND id != v_primary_id
      LOOP
        PERFORM public.merge_contacts_v2(
          v_workspace.workspace_id,
          v_primary_id,
          v_duplicate.id,
          'exact_email',
          NULL -- system merge
        );
        v_merged_count := v_merged_count + 1;
        
        v_merge_detail := jsonb_build_object(
          'primary_email', (SELECT email FROM public.contacts WHERE id = v_primary_id),
          'merged_email', v_duplicate.email,
          'reason', 'exact_email'
        );
        v_merge_details := v_merge_details || v_merge_detail;
      END LOOP;
    END LOOP;
    
    -- Auto-merge name + street matches
    FOR v_contact IN
      SELECT DISTINCT ON (
        lower(coalesce(first_name || ' ' || last_name, '')),
        lower(regexp_replace(coalesce(address, street, ''), '[^a-z0-9]', '', 'gi'))
      ) c1.*
      FROM public.contacts c1
      WHERE c1.workspace_id = v_workspace.workspace_id
        AND c1.merged_into IS NULL
        AND coalesce(c1.first_name || ' ' || c1.last_name, '') != ''
        AND (c1.address IS NOT NULL OR c1.street IS NOT NULL)
        AND trim(coalesce(c1.address, c1.street, '')) != ''
        AND EXISTS (
          SELECT 1 FROM public.contacts c2
          WHERE c2.workspace_id = v_workspace.workspace_id
            AND c2.id != c1.id
            AND c2.merged_into IS NULL
            AND lower(coalesce(c2.first_name || ' ' || c2.last_name, '')) = 
                lower(coalesce(c1.first_name || ' ' || c1.last_name, ''))
            AND lower(regexp_replace(coalesce(c2.address, c2.street, ''), '[^a-z0-9]', '', 'gi')) = 
                lower(regexp_replace(coalesce(c1.address, c1.street, ''), '[^a-z0-9]', '', 'gi'))
        )
      ORDER BY 
        lower(coalesce(c1.first_name || ' ' || c1.last_name, '')),
        lower(regexp_replace(coalesce(c1.address, c1.street, ''), '[^a-z0-9]', '', 'gi')),
        c1.created_at ASC
    LOOP
      -- Find the earliest contact with this name+street (primary)
      SELECT id INTO v_primary_id
      FROM public.contacts
      WHERE workspace_id = v_workspace.workspace_id
        AND lower(coalesce(first_name || ' ' || last_name, '')) = 
            lower(coalesce(v_contact.first_name || ' ' || v_contact.last_name, ''))
        AND lower(regexp_replace(coalesce(address, street, ''), '[^a-z0-9]', '', 'gi')) = 
            lower(regexp_replace(coalesce(v_contact.address, v_contact.street, ''), '[^a-z0-9]', '', 'gi'))
        AND merged_into IS NULL
      ORDER BY created_at ASC
      LIMIT 1;
      
      -- Merge all other contacts with same name+street into primary
      FOR v_duplicate IN
        SELECT id, email, first_name, last_name
        FROM public.contacts
        WHERE workspace_id = v_workspace.workspace_id
          AND lower(coalesce(first_name || ' ' || last_name, '')) = 
              lower(coalesce(v_contact.first_name || ' ' || v_contact.last_name, ''))
          AND lower(regexp_replace(coalesce(address, street, ''), '[^a-z0-9]', '', 'gi')) = 
              lower(regexp_replace(coalesce(v_contact.address, v_contact.street, ''), '[^a-z0-9]', '', 'gi'))
          AND merged_into IS NULL
          AND id != v_primary_id
      LOOP
        PERFORM public.merge_contacts_v2(
          v_workspace.workspace_id,
          v_primary_id,
          v_duplicate.id,
          'name_street',
          NULL -- system merge
        );
        v_merged_count := v_merged_count + 1;
        
        v_merge_detail := jsonb_build_object(
          'primary_name', coalesce((SELECT first_name || ' ' || last_name FROM public.contacts WHERE id = v_primary_id), 
                                   (SELECT email FROM public.contacts WHERE id = v_primary_id)),
          'merged_email', v_duplicate.email,
          'reason', 'name_street'
        );
        v_merge_details := v_merge_details || v_merge_detail;
      END LOOP;
    END LOOP;
    
    -- Return result for this workspace
    workspace_id := v_workspace.workspace_id;
    merged_count := v_merged_count;
    merge_details := v_merge_details;
    RETURN NEXT;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.auto_merge_contacts_hourly IS 'Hourly auto-merge engine that processes all workspaces and merges duplicates';

-- ============================================================================
-- 5. FUNCTION TO GET DUPLICATE COUNT FOR UI
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_contact_duplicate_count(
  p_workspace_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(DISTINCT group_id) INTO v_count
  FROM public.detect_contact_duplicates_v2(p_workspace_id);
  
  RETURN COALESCE(v_count, 0);
END;
$$;

COMMENT ON FUNCTION public.get_contact_duplicate_count IS 'Returns count of duplicate groups for UI badges';

-- ============================================================================
-- 6. FUNCTION TO GET RECENT MERGE COUNT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_recent_merge_count(
  p_workspace_id uuid,
  p_hours integer DEFAULT 24
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.contact_merge_events
  WHERE workspace_id = p_workspace_id
    AND created_at >= now() - (p_hours || ' hours')::interval;
  
  RETURN COALESCE(v_count, 0);
END;
$$;

COMMENT ON FUNCTION public.get_recent_merge_count IS 'Returns count of merges in last N hours for dashboard notifications';

-- ============================================================================
-- 7. GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.detect_contact_duplicates_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_contacts_v2(uuid, uuid, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_merge_contacts_hourly(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_contact_duplicate_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_recent_merge_count(uuid, integer) TO authenticated;

