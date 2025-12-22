-- =========================================================
-- Block 12400 — SmartSend Lead Search & Filtering v1
-- (The Instant Search Bar That Lets Roofers Find Any Homeowner in Seconds)
-- =========================================================

-- 1. ADD SEARCH VECTOR COLUMNS TO TABLES
-- =========================================================

-- Contacts table: Add search_vector column
ALTER TABLE IF EXISTS public.contacts
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Leads table: Add search_vector column (if leads table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'leads') THEN
    ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS search_vector tsvector;
  END IF;
END $$;

-- Notes table: Add search_vector column
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'lead_notes') THEN
    ALTER TABLE public.lead_notes ADD COLUMN IF NOT EXISTS search_vector tsvector;
  END IF;
END $$;

-- Replies table: Add search_vector column
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'replies') THEN
    ALTER TABLE public.replies ADD COLUMN IF NOT EXISTS search_vector tsvector;
  END IF;
END $$;

-- Campaigns table: Add search_vector column
ALTER TABLE IF EXISTS public.campaigns
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- 2. CREATE FUNCTIONS TO UPDATE SEARCH VECTORS
-- =========================================================

-- Function to update contacts search_vector
CREATE OR REPLACE FUNCTION public.update_contacts_search_vector()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector :=
    to_tsvector('english',
      coalesce(NEW.first_name, '') || ' ' ||
      coalesce(NEW.last_name, '') || ' ' ||
      coalesce(NEW.email, '') || ' ' ||
      coalesce(NEW.city, '') || ' ' ||
      coalesce(NEW.state, '') || ' ' ||
      coalesce(NEW.postal_code, '') || ' ' ||
      coalesce(NEW.phone, '') || ' ' ||
      coalesce(array_to_string(NEW.tags, ' '), '')
    );
  RETURN NEW;
END;
$$;

-- Function to update leads search_vector
CREATE OR REPLACE FUNCTION public.update_leads_search_vector()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector :=
    to_tsvector('english',
      coalesce(NEW.first_name, '') || ' ' ||
      coalesce(NEW.last_name, '') || ' ' ||
      coalesce(NEW.email, '') || ' ' ||
      coalesce(NEW.company, '') || ' ' ||
      coalesce(NEW.phone, '')
    );
  RETURN NEW;
END;
$$;

-- Function to update lead_notes search_vector
CREATE OR REPLACE FUNCTION public.update_lead_notes_search_vector()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', coalesce(NEW.body, ''));
  RETURN NEW;
END;
$$;

-- Function to update replies search_vector
CREATE OR REPLACE FUNCTION public.update_replies_search_vector()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector :=
    to_tsvector('english',
      coalesce(NEW.body, '') || ' ' ||
      coalesce(NEW.body_text, '') || ' ' ||
      coalesce(NEW.subject, '')
    );
  RETURN NEW;
END;
$$;

-- Function to update campaigns search_vector
CREATE OR REPLACE FUNCTION public.update_campaigns_search_vector()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector :=
    to_tsvector('english',
      coalesce(NEW.name, '') || ' ' ||
      coalesce(NEW.title, '') || ' ' ||
      coalesce(NEW.subject, '')
    );
  RETURN NEW;
END;
$$;

-- 3. CREATE TRIGGERS TO AUTO-UPDATE SEARCH VECTORS
-- =========================================================

-- Contacts triggers
DROP TRIGGER IF EXISTS trg_update_contacts_search_vector ON public.contacts;
CREATE TRIGGER trg_update_contacts_search_vector
  BEFORE INSERT OR UPDATE ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_contacts_search_vector();

-- Leads triggers
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'leads') THEN
    DROP TRIGGER IF EXISTS trg_update_leads_search_vector ON public.leads;
    CREATE TRIGGER trg_update_leads_search_vector
      BEFORE INSERT OR UPDATE ON public.leads
      FOR EACH ROW
      EXECUTE FUNCTION public.update_leads_search_vector();
  END IF;
END $$;

-- Lead notes triggers
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'lead_notes') THEN
    DROP TRIGGER IF EXISTS trg_update_lead_notes_search_vector ON public.lead_notes;
    CREATE TRIGGER trg_update_lead_notes_search_vector
      BEFORE INSERT OR UPDATE ON public.lead_notes
      FOR EACH ROW
      EXECUTE FUNCTION public.update_lead_notes_search_vector();
  END IF;
END $$;

-- Replies triggers
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'replies') THEN
    DROP TRIGGER IF EXISTS trg_update_replies_search_vector ON public.replies;
    CREATE TRIGGER trg_update_replies_search_vector
      BEFORE INSERT OR UPDATE ON public.replies
      FOR EACH ROW
      EXECUTE FUNCTION public.update_replies_search_vector();
  END IF;
END $$;

-- Campaigns triggers
DROP TRIGGER IF EXISTS trg_update_campaigns_search_vector ON public.campaigns;
CREATE TRIGGER trg_update_campaigns_search_vector
  BEFORE INSERT OR UPDATE ON public.campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.update_campaigns_search_vector();

-- 4. CREATE GIN INDEXES FOR FAST SEARCH
-- =========================================================

-- Contacts search index
CREATE INDEX IF NOT EXISTS idx_contacts_search_vector 
  ON public.contacts USING gin(search_vector);

-- Leads search index
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'leads') THEN
    CREATE INDEX IF NOT EXISTS idx_leads_search_vector 
      ON public.leads USING gin(search_vector);
  END IF;
END $$;

-- Lead notes search index
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'lead_notes') THEN
    CREATE INDEX IF NOT EXISTS idx_lead_notes_search_vector 
      ON public.lead_notes USING gin(search_vector);
  END IF;
END $$;

-- Replies search index
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'replies') THEN
    CREATE INDEX IF NOT EXISTS idx_replies_search_vector 
      ON public.replies USING gin(search_vector);
  END IF;
END $$;

-- Campaigns search index
CREATE INDEX IF NOT EXISTS idx_campaigns_search_vector 
  ON public.campaigns USING gin(search_vector);

-- 5. BACKFILL EXISTING DATA
-- =========================================================

-- Backfill contacts
UPDATE public.contacts
SET search_vector = to_tsvector('english',
  coalesce(first_name, '') || ' ' ||
  coalesce(last_name, '') || ' ' ||
  coalesce(email, '') || ' ' ||
  coalesce(city, '') || ' ' ||
  coalesce(state, '') || ' ' ||
  coalesce(postal_code, '') || ' ' ||
  coalesce(phone, '') || ' ' ||
  coalesce(array_to_string(tags, ' '), '')
)
WHERE search_vector IS NULL;

-- Backfill leads
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'leads') THEN
    EXECUTE format('
      UPDATE public.leads
      SET search_vector = to_tsvector(''english'',
        coalesce(first_name, '''') || '' '' ||
        coalesce(last_name, '''') || '' '' ||
        coalesce(email, '''') || '' '' ||
        coalesce(company, '''') || '' '' ||
        coalesce(phone, '''')
      )
      WHERE search_vector IS NULL
    ');
  END IF;
END $$;

-- Backfill lead_notes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'lead_notes') THEN
    EXECUTE format('
      UPDATE public.lead_notes
      SET search_vector = to_tsvector(''english'', coalesce(body, ''''))
      WHERE search_vector IS NULL
    ');
  END IF;
END $$;

-- Backfill replies
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'replies') THEN
    EXECUTE format('
      UPDATE public.replies
      SET search_vector = to_tsvector(''english'',
        coalesce(body, '''') || '' '' ||
        coalesce(body_text, '''') || '' '' ||
        coalesce(subject, '''')
      )
      WHERE search_vector IS NULL
    ');
  END IF;
END $$;

-- Backfill campaigns
UPDATE public.campaigns
SET search_vector = to_tsvector('english',
  coalesce(name, '') || ' ' ||
  coalesce(title, '') || ' ' ||
  coalesce(subject, '')
)
WHERE search_vector IS NULL;

-- 6. CREATE SEARCH FUNCTION (RPC)
-- =========================================================

CREATE OR REPLACE FUNCTION public.search_all(
  p_query text,
  p_workspace_id uuid,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  type text,
  id uuid,
  title text,
  subtitle text,
  metadata jsonb,
  relevance real
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_query tsquery;
BEGIN
  -- Convert query to tsquery
  v_query := plainto_tsquery('english', p_query);
  
  -- If query is empty or invalid, return empty
  IF v_query IS NULL OR p_query IS NULL OR length(trim(p_query)) = 0 THEN
    RETURN;
  END IF;

  -- Search contacts
  RETURN QUERY
  SELECT 
    'contact'::text as type,
    c.id,
    COALESCE(c.first_name || ' ' || c.last_name, c.email, 'Unknown') as title,
    c.email as subtitle,
    jsonb_build_object(
      'email', c.email,
      'city', c.city,
      'tags', c.tags,
      'lead_status', NULL
    ) as metadata,
    ts_rank(c.search_vector, v_query) as relevance
  FROM public.contacts c
  WHERE c.workspace_id = p_workspace_id
    AND c.search_vector @@ v_query
  ORDER BY relevance DESC
  LIMIT p_limit;

  -- Search leads (if table exists)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'leads') THEN
    RETURN QUERY
    SELECT 
      'lead'::text as type,
      l.id,
      COALESCE(l.first_name || ' ' || l.last_name, l.email, 'Unknown') as title,
      l.email as subtitle,
      jsonb_build_object(
        'email', l.email,
        'status', l.status,
        'campaign_id', l.campaign_id
      ) as metadata,
      ts_rank(l.search_vector, v_query) as relevance
    FROM public.leads l
    WHERE l.search_vector @@ v_query
      AND EXISTS (
        SELECT 1 FROM public.workspace_members wm
        WHERE wm.workspace_id = p_workspace_id
          AND wm.user_id = l.user_id
      )
    ORDER BY relevance DESC
    LIMIT p_limit;
  END IF;

  -- Search notes
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'lead_notes') THEN
    RETURN QUERY
    SELECT 
      'note'::text as type,
      ln.id,
      LEFT(ln.body, 100) as title,
      'Note' as subtitle,
      jsonb_build_object(
        'lead_id', ln.lead_id,
        'body', LEFT(ln.body, 200)
      ) as metadata,
      ts_rank(ln.search_vector, v_query) as relevance
    FROM public.lead_notes ln
    WHERE ln.search_vector @@ v_query
      AND (
        -- Check if lead_id references a contact
        EXISTS (
          SELECT 1 FROM public.contacts c
          WHERE c.id = ln.lead_id
            AND c.workspace_id = p_workspace_id
        )
        OR
        -- Check if lead_id references a lead (if leads table exists)
        (EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'leads')
         AND EXISTS (
           SELECT 1 FROM public.leads l
           JOIN public.workspace_members wm ON wm.user_id = l.user_id
           WHERE l.id = ln.lead_id
             AND wm.workspace_id = p_workspace_id
         ))
        OR
        -- Check workspace_id directly if column exists
        (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'lead_notes' AND column_name = 'workspace_id')
         AND ln.workspace_id = p_workspace_id)
      )
    ORDER BY relevance DESC
    LIMIT p_limit;
  END IF;

  -- Search replies
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'replies') THEN
    RETURN QUERY
    SELECT 
      'reply'::text as type,
      r.id,
      COALESCE(r.subject, 'Reply') as title,
      r.from_email as subtitle,
      jsonb_build_object(
        'lead_id', r.lead_id,
        'from_email', r.from_email,
        'body', LEFT(COALESCE(r.body, r.body_text, ''), 200)
      ) as metadata,
      ts_rank(r.search_vector, v_query) as relevance
    FROM public.replies r
    WHERE r.search_vector @@ v_query
      AND (
        -- Check if lead_id references a contact
        EXISTS (
          SELECT 1 FROM public.contacts c
          WHERE c.id = r.lead_id
            AND c.workspace_id = p_workspace_id
        )
        OR
        -- Check if lead_id references a lead (if leads table exists)
        (EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'leads')
         AND EXISTS (
           SELECT 1 FROM public.leads l
           JOIN public.workspace_members wm ON wm.user_id = l.user_id
           WHERE l.id = r.lead_id
             AND wm.workspace_id = p_workspace_id
         ))
        OR
        -- Check by from_email matching contacts
        EXISTS (
          SELECT 1 FROM public.contacts c
          WHERE lower(c.email) = lower(r.from_email)
            AND c.workspace_id = p_workspace_id
        )
      )
    ORDER BY relevance DESC
    LIMIT p_limit;
  END IF;

  -- Search campaigns
  RETURN QUERY
  SELECT 
    'campaign'::text as type,
    c.id,
    COALESCE(c.name, c.title, 'Untitled Campaign') as title,
    COALESCE(c.subject, 'Campaign') as subtitle,
    jsonb_build_object(
      'status', c.status,
      'workspace_id', c.workspace_id
    ) as metadata,
    ts_rank(c.search_vector, v_query) as relevance
  FROM public.campaigns c
  WHERE c.workspace_id = p_workspace_id
    AND c.search_vector @@ v_query
  ORDER BY relevance DESC
  LIMIT p_limit;

END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.search_all(text, uuid, integer) TO authenticated;

-- Comments
COMMENT ON FUNCTION public.search_all IS 'Global search function that searches across contacts, leads, notes, replies, and campaigns using full-text search';

