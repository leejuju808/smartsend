-- Block 275 — Smart Search v1
-- Global Search: Leads, Companies, Campaigns, Threads, Deals, Templates
-- Fast GIN trigram indexes for fuzzy matching across all entities

-- Ensure pg_trgm extension is enabled
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- A. Leads search index
-- Search across email, first_name, last_name, company
CREATE INDEX IF NOT EXISTS leads_search_idx ON public.leads
USING gin (
  (coalesce(email,'') || ' ' || coalesce(first_name,'') || ' ' || coalesce(last_name,'') || ' ' || coalesce(company,''))
  gin_trgm_ops
);

-- B. Companies search index
-- Search across name, domain, industry
CREATE INDEX IF NOT EXISTS companies_search_idx ON public.companies
USING gin (
  (coalesce(name,'') || ' ' || coalesce(domain,'') || ' ' || coalesce(industry,''))
  gin_trgm_ops
);

-- C. Campaigns search index
-- Search across name
CREATE INDEX IF NOT EXISTS campaigns_search_idx ON public.campaigns
USING gin (name gin_trgm_ops);

-- D. Deals search index
-- Search across title (name) and stage
CREATE INDEX IF NOT EXISTS deals_search_idx ON public.deals
USING gin (
  (coalesce(title,'') || ' ' || coalesce(stage,''))
  gin_trgm_ops
);

-- E. Thread messages search index
-- Search across body text in inbox_messages
CREATE INDEX IF NOT EXISTS thread_messages_search_idx ON public.inbox_messages
USING gin (body gin_trgm_ops);

-- F. Templates search index
-- Search across name (body columns vary by schema version)
CREATE INDEX IF NOT EXISTS templates_search_idx ON public.templates
USING gin (name gin_trgm_ops);

-- Additional indexes for performance on workspace_id lookups
CREATE INDEX IF NOT EXISTS idx_leads_workspace_search ON public.leads(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_companies_workspace_search ON public.companies(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_campaigns_workspace_search ON public.campaigns(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deals_workspace_search ON public.deals(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_templates_workspace_search ON public.templates(workspace_id) WHERE workspace_id IS NOT NULL;

COMMENT ON INDEX leads_search_idx IS 'GIN trigram index for fast fuzzy search on leads (email, first_name, last_name, company)';
COMMENT ON INDEX companies_search_idx IS 'GIN trigram index for fast fuzzy search on companies (name, domain, industry)';
COMMENT ON INDEX campaigns_search_idx IS 'GIN trigram index for fast fuzzy search on campaigns (name)';
COMMENT ON INDEX deals_search_idx IS 'GIN trigram index for fast fuzzy search on deals (title, stage)';
COMMENT ON INDEX thread_messages_search_idx IS 'GIN trigram index for fast fuzzy search on thread messages (body)';
COMMENT ON INDEX templates_search_idx IS 'GIN trigram index for fast fuzzy search on templates (name, body)';

-- Search Functions with Ranking Algorithm
-- Ranking: name match (+5), email match (+4), company match (+3), domain match (+3),
-- reply text match (+5), deal stage match (+2), trigram similarity (*10), recency boost (+3)

-- Search Leads Function
CREATE OR REPLACE FUNCTION public.search_leads(
  p_query text,
  p_workspace_ids uuid[],
  p_limit int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  email text,
  first_name text,
  last_name text,
  company text,
  score numeric,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_search_text text;
BEGIN
  v_search_text := lower(p_query);
  
  RETURN QUERY
  SELECT 
    l.id,
    l.email,
    l.first_name,
    l.last_name,
    l.company,
    (
      -- Name match (+5)
      CASE WHEN lower(coalesce(l.first_name || ' ' || l.last_name, '')) LIKE '%' || v_search_text || '%' THEN 5 ELSE 0 END +
      -- Email match (+4)
      CASE WHEN lower(l.email) LIKE '%' || v_search_text || '%' THEN 4 ELSE 0 END +
      -- Company match (+3)
      CASE WHEN lower(coalesce(l.company, '')) LIKE '%' || v_search_text || '%' THEN 3 ELSE 0 END +
      -- Trigram similarity (*10)
      similarity(
        lower(coalesce(l.email,'') || ' ' || coalesce(l.first_name,'') || ' ' || coalesce(l.last_name,'') || ' ' || coalesce(l.company,'')),
        v_search_text
      ) * 10 +
      -- Recency boost (+3 if updated in last 30 days)
      CASE WHEN l.updated_at > now() - interval '30 days' THEN 3 ELSE 0 END
    )::numeric AS score,
    l.updated_at
  FROM public.leads l
  WHERE l.workspace_id = ANY(p_workspace_ids)
    AND (
      l.email ILIKE '%' || p_query || '%'
      OR l.first_name ILIKE '%' || p_query || '%'
      OR l.last_name ILIKE '%' || p_query || '%'
      OR l.company ILIKE '%' || p_query || '%'
      OR (
        coalesce(l.email,'') || ' ' || coalesce(l.first_name,'') || ' ' || coalesce(l.last_name,'') || ' ' || coalesce(l.company,'')
      ) % p_query
    )
  ORDER BY score DESC, l.updated_at DESC
  LIMIT p_limit;
END;
$$;

-- Search Companies Function
CREATE OR REPLACE FUNCTION public.search_companies(
  p_query text,
  p_workspace_ids uuid[],
  p_limit int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  name text,
  domain text,
  industry text,
  size text,
  score numeric,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_search_text text;
BEGIN
  v_search_text := lower(p_query);
  
  RETURN QUERY
  SELECT 
    c.id,
    c.name,
    c.domain,
    c.industry,
    c.size,
    (
      -- Name match (+5)
      CASE WHEN lower(coalesce(c.name, '')) LIKE '%' || v_search_text || '%' THEN 5 ELSE 0 END +
      -- Domain match (+3)
      CASE WHEN lower(coalesce(c.domain, '')) LIKE '%' || v_search_text || '%' THEN 3 ELSE 0 END +
      -- Industry match (+3)
      CASE WHEN lower(coalesce(c.industry, '')) LIKE '%' || v_search_text || '%' THEN 3 ELSE 0 END +
      -- Trigram similarity (*10)
      similarity(
        lower(coalesce(c.name,'') || ' ' || coalesce(c.domain,'') || ' ' || coalesce(c.industry,'')),
        v_search_text
      ) * 10 +
      -- Recency boost (+3 if updated in last 30 days)
      CASE WHEN c.updated_at > now() - interval '30 days' THEN 3 ELSE 0 END
    )::numeric AS score,
    c.updated_at
  FROM public.companies c
  WHERE c.workspace_id = ANY(p_workspace_ids)
    AND (
      c.name ILIKE '%' || p_query || '%'
      OR c.domain ILIKE '%' || p_query || '%'
      OR c.industry ILIKE '%' || p_query || '%'
      OR (
        coalesce(c.name,'') || ' ' || coalesce(c.domain,'') || ' ' || coalesce(c.industry,'')
      ) % p_query
    )
  ORDER BY score DESC, c.updated_at DESC
  LIMIT p_limit;
END;
$$;

-- Search Campaigns Function
CREATE OR REPLACE FUNCTION public.search_campaigns(
  p_query text,
  p_workspace_ids uuid[],
  p_limit int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  name text,
  status text,
  score numeric,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_search_text text;
BEGIN
  v_search_text := lower(p_query);
  
  RETURN QUERY
  SELECT 
    c.id,
    c.name,
    c.status,
    (
      -- Name match (+5)
      CASE WHEN lower(coalesce(c.name, '')) LIKE '%' || v_search_text || '%' THEN 5 ELSE 0 END +
      -- Trigram similarity (*10)
      similarity(lower(coalesce(c.name, '')), v_search_text) * 10 +
      -- Recency boost (+3 if created in last 30 days)
      CASE WHEN c.created_at > now() - interval '30 days' THEN 3 ELSE 0 END
    )::numeric AS score,
    COALESCE(c.updated_at, c.created_at) AS updated_at
  FROM public.campaigns c
  WHERE c.workspace_id = ANY(p_workspace_ids)
    AND (
      c.name ILIKE '%' || p_query || '%'
      OR c.name % p_query
    )
  ORDER BY score DESC, c.created_at DESC
  LIMIT p_limit;
END;
$$;

-- Search Deals Function
CREATE OR REPLACE FUNCTION public.search_deals(
  p_query text,
  p_workspace_ids uuid[],
  p_limit int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  title text,
  stage text,
  value int,
  score numeric,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_search_text text;
BEGIN
  v_search_text := lower(p_query);
  
  RETURN QUERY
  SELECT 
    d.id,
    d.title,
    d.stage,
    d.value,
    (
      -- Name match (+5)
      CASE WHEN lower(coalesce(d.title, '')) LIKE '%' || v_search_text || '%' THEN 5 ELSE 0 END +
      -- Deal stage match (+2)
      CASE WHEN lower(coalesce(d.stage, '')) LIKE '%' || v_search_text || '%' THEN 2 ELSE 0 END +
      -- Trigram similarity (*10)
      similarity(
        lower(coalesce(d.title,'') || ' ' || coalesce(d.stage,'')),
        v_search_text
      ) * 10 +
      -- Recency boost (+3 if updated in last 30 days)
      CASE WHEN d.updated_at > now() - interval '30 days' THEN 3 ELSE 0 END
    )::numeric AS score,
    d.updated_at
  FROM public.deals d
  WHERE d.workspace_id = ANY(p_workspace_ids)
    AND (
      d.title ILIKE '%' || p_query || '%'
      OR d.stage ILIKE '%' || p_query || '%'
      OR (
        coalesce(d.title,'') || ' ' || coalesce(d.stage,'')
      ) % p_query
    )
  ORDER BY score DESC, d.updated_at DESC
  LIMIT p_limit;
END;
$$;

-- Search Threads Function (via messages)
CREATE OR REPLACE FUNCTION public.search_threads(
  p_query text,
  p_workspace_ids uuid[],
  p_limit int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  subject text,
  lead_email text,
  snippet text,
  score numeric,
  last_message_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_search_text text;
BEGIN
  v_search_text := lower(p_query);
  
  RETURN QUERY
  SELECT DISTINCT ON (t.id)
    t.id,
    t.subject,
    l.email AS lead_email,
    substring(
      lower(coalesce(m.body, '')),
      1,
      100
    ) AS snippet,
    (
      -- Reply text match (+5)
      CASE WHEN lower(coalesce(m.body, '')) LIKE '%' || v_search_text || '%' THEN 5 ELSE 0 END +
      -- Subject match (+5)
      CASE WHEN lower(coalesce(t.subject, '')) LIKE '%' || v_search_text || '%' THEN 5 ELSE 0 END +
      -- Trigram similarity on body (*10)
      similarity(lower(coalesce(m.body, '')), v_search_text) * 10 +
      -- Recency boost (+3 if updated in last 30 days)
      CASE WHEN t.updated_at > now() - interval '30 days' THEN 3 ELSE 0 END
    )::numeric AS score,
    t.last_message_at,
    t.updated_at
  FROM public.inbox_threads t
  JOIN public.leads l ON l.id = t.lead_id
  JOIN public.campaigns c ON c.id = t.campaign_id
  LEFT JOIN public.inbox_messages m ON m.thread_id = t.id
  WHERE c.workspace_id = ANY(p_workspace_ids)
    AND (
      t.subject ILIKE '%' || p_query || '%'
      OR m.body ILIKE '%' || p_query || '%'
      OR m.body % p_query
    )
  ORDER BY t.id, score DESC, t.updated_at DESC
  LIMIT p_limit;
END;
$$;

-- Search Templates Function
CREATE OR REPLACE FUNCTION public.search_templates(
  p_query text,
  p_workspace_ids uuid[],
  p_limit int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  name text,
  category text,
  score numeric,
  updated_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_search_text text;
  v_body_text text;
BEGIN
  v_search_text := lower(p_query);
  
  RETURN QUERY
  SELECT 
    t.id,
    t.name,
    t.category,
    (
      -- Name match (+5)
      CASE WHEN lower(coalesce(t.name, '')) LIKE '%' || v_search_text || '%' THEN 5 ELSE 0 END +
      -- Body match (+5) - handle different column names
      CASE WHEN lower(coalesce(
        COALESCE(t.body, t.html_tpl, t.base_text, ''),
        ''
      )) LIKE '%' || v_search_text || '%' THEN 5 ELSE 0 END +
      -- Trigram similarity (*10)
      similarity(
        lower(coalesce(t.name,'') || ' ' || coalesce(
          COALESCE(t.body, t.html_tpl, t.base_text, ''),
          ''
        )),
        v_search_text
      ) * 10 +
      -- Recency boost (+3 if created in last 30 days)
      CASE WHEN t.created_at > now() - interval '30 days' THEN 3 ELSE 0 END
    )::numeric AS score,
    COALESCE(t.updated_at, t.created_at) AS updated_at,
    t.created_at
  FROM public.templates t
  WHERE t.workspace_id = ANY(p_workspace_ids)
    AND (
      t.name ILIKE '%' || p_query || '%'
      OR COALESCE(t.body, t.html_tpl, t.base_text, '') ILIKE '%' || p_query || '%'
      OR (
        coalesce(t.name,'') || ' ' || coalesce(
          COALESCE(t.body, t.html_tpl, t.base_text, ''),
          ''
        )
      ) % p_query
    )
  ORDER BY score DESC, t.created_at DESC
  LIMIT p_limit;
END;
$$;

