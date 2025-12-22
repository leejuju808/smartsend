-- Block 281 — Meetings Engine v1
-- Meeting Objects, Calendar Extraction, Thread Sync, Deal Sync, Upcoming Meeting Views

-- Create meetings table
CREATE TABLE IF NOT EXISTS public.meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  thread_id uuid REFERENCES public.reply_threads(id) ON DELETE SET NULL,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title text,
  start_time timestamptz,
  end_time timestamptz,
  timezone text,
  confidence int DEFAULT 100 CHECK (confidence >= 0 AND confidence <= 100),
  source text DEFAULT 'email' CHECK (source IN ('email', 'manual', 'calendar')),
  raw_text text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS meetings_workspace_idx 
  ON public.meetings (workspace_id, start_time DESC);

CREATE INDEX IF NOT EXISTS meetings_lead_idx 
  ON public.meetings (lead_id);

CREATE INDEX IF NOT EXISTS meetings_company_idx 
  ON public.meetings (company_id) WHERE company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS meetings_deal_idx 
  ON public.meetings (deal_id) WHERE deal_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS meetings_thread_idx 
  ON public.meetings (thread_id) WHERE thread_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS meetings_owner_idx 
  ON public.meetings (owner_id) WHERE owner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS meetings_start_time_idx 
  ON public.meetings (start_time) WHERE start_time IS NOT NULL;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_meetings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_meetings_updated_at ON public.meetings;
CREATE TRIGGER trg_meetings_updated_at
BEFORE UPDATE ON public.meetings
FOR EACH ROW EXECUTE FUNCTION public.set_meetings_updated_at();

-- Enable RLS
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

-- RLS policies for meetings
-- Users can view meetings in their workspace
DROP POLICY IF EXISTS "meetings: select workspace members" ON public.meetings;
CREATE POLICY "meetings: select workspace members" ON public.meetings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = meetings.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- Users can insert meetings in their workspace
DROP POLICY IF EXISTS "meetings: insert workspace members" ON public.meetings;
CREATE POLICY "meetings: insert workspace members" ON public.meetings
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = meetings.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- Users can update meetings in their workspace
DROP POLICY IF EXISTS "meetings: update workspace members" ON public.meetings;
CREATE POLICY "meetings: update workspace members" ON public.meetings
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = meetings.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- Users can delete meetings in their workspace (admins/owners only)
DROP POLICY IF EXISTS "meetings: delete workspace admins" ON public.meetings;
CREATE POLICY "meetings: delete workspace admins" ON public.meetings
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = meetings.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner', 'admin')
    )
  );

-- Function to create meeting from reply intent
CREATE OR REPLACE FUNCTION public.create_meeting_from_intent(
  p_workspace_id uuid,
  p_lead_id uuid,
  p_thread_id uuid,
  p_owner_id uuid DEFAULT NULL,
  p_start_time timestamptz DEFAULT NULL,
  p_end_time timestamptz DEFAULT NULL,
  p_timezone text DEFAULT NULL,
  p_confidence int DEFAULT 100,
  p_raw_text text DEFAULT NULL,
  p_title text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting_id uuid;
  v_company_id uuid;
  v_deal_id uuid;
  v_lead_first_name text;
  v_lead_last_name text;
  v_lead_company text;
  v_final_title text;
BEGIN
  -- Get lead info
  SELECT company_id, first_name, last_name, company
  INTO v_company_id, v_lead_first_name, v_lead_last_name, v_lead_company
  FROM public.leads
  WHERE id = p_lead_id;

  -- Get existing deal for this lead (if any)
  SELECT id INTO v_deal_id
  FROM public.deals
  WHERE lead_id = p_lead_id
  ORDER BY created_at DESC
  LIMIT 1;

  -- Generate title if not provided
  v_final_title := COALESCE(
    p_title,
    format('Meeting with %s', COALESCE(
      TRIM(v_lead_first_name || ' ' || v_lead_last_name),
      v_lead_company,
      'Lead'
    ))
  );

  -- Insert meeting
  INSERT INTO public.meetings (
    workspace_id,
    lead_id,
    company_id,
    deal_id,
    thread_id,
    owner_id,
    title,
    start_time,
    end_time,
    timezone,
    confidence,
    source,
    raw_text
  )
  VALUES (
    p_workspace_id,
    p_lead_id,
    v_company_id,
    v_deal_id,
    p_thread_id,
    p_owner_id,
    v_final_title,
    p_start_time,
    p_end_time,
    p_timezone,
    p_confidence,
    'email',
    p_raw_text
  )
  RETURNING id INTO v_meeting_id;

  -- Log to lead_activity
  INSERT INTO public.lead_activity (
    workspace_id,
    lead_id,
    type,
    title,
    body,
    metadata,
    occurred_at
  )
  VALUES (
    p_workspace_id,
    p_lead_id,
    'meeting_scheduled',
    'Meeting scheduled',
    format('Meeting scheduled — %s', 
      CASE 
        WHEN p_start_time IS NOT NULL THEN to_char(p_start_time AT TIME ZONE COALESCE(p_timezone, 'UTC'), 'Mon DD, YYYY HH24:MI TZ')
        ELSE 'Time TBD'
      END
    ),
    jsonb_build_object(
      'meeting_id', v_meeting_id,
      'start_time', p_start_time,
      'timezone', p_timezone,
      'confidence', p_confidence
    ),
    COALESCE(p_start_time, now())
  );

  -- Log to team_activity
  INSERT INTO public.team_activity (
    workspace_id,
    user_id,
    lead_id,
    company_id,
    deal_id,
    type,
    title,
    body,
    metadata,
    occurred_at
  )
  VALUES (
    p_workspace_id,
    p_owner_id,
    p_lead_id,
    v_company_id,
    v_deal_id,
    'meeting_scheduled',
    format('Meeting scheduled with %s', COALESCE(
      TRIM(v_lead_first_name || ' ' || v_lead_last_name),
      v_lead_company,
      'Lead'
    )),
    format('Meeting scheduled — %s', 
      CASE 
        WHEN p_start_time IS NOT NULL THEN to_char(p_start_time AT TIME ZONE COALESCE(p_timezone, 'UTC'), 'Mon DD, YYYY HH24:MI TZ')
        ELSE 'Time TBD'
      END
    ),
    jsonb_build_object(
      'meeting_id', v_meeting_id,
      'start_time', p_start_time,
      'timezone', p_timezone,
      'confidence', p_confidence
    ),
    COALESCE(p_start_time, now())
  );

  -- Update deal stage if deal exists and not already in meeting stage
  IF v_deal_id IS NOT NULL THEN
    UPDATE public.deals
    SET stage = 'meeting',
        probability = GREATEST(probability, 50),
        updated_at = now()
    WHERE id = v_deal_id
      AND stage != 'meeting';

    -- Log deal activity if stage changed
    IF FOUND THEN
      INSERT INTO public.deal_activity (deal_id, type, body, metadata)
      VALUES (
        v_deal_id,
        'stage_change',
        'Deal moved to meeting stage (auto-updated from meeting creation)',
        jsonb_build_object('meeting_id', v_meeting_id, 'old_stage', (SELECT stage FROM public.deals WHERE id = v_deal_id), 'new_stage', 'meeting')
      );
    END IF;
  END IF;

  RETURN v_meeting_id;
END;
$$;

COMMENT ON FUNCTION public.create_meeting_from_intent IS 'Creates a meeting record from reply intent, logs to activity feeds, and updates deal stage if applicable. Returns meeting_id.';

COMMENT ON TABLE public.meetings IS 'Meeting objects extracted from email replies or created manually. Links to leads, companies, deals, and threads.';

-- Block 281: Add meetings to Smart Search (Block 275 integration)
-- Search index for meetings
CREATE INDEX IF NOT EXISTS meetings_search_idx ON public.meetings
USING gin (
  (coalesce(title,'') || ' ' || coalesce(raw_text,''))
  gin_trgm_ops
);

-- Search Meetings Function
CREATE OR REPLACE FUNCTION public.search_meetings(
  p_query text,
  p_workspace_ids uuid[],
  p_limit int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  title text,
  start_time timestamptz,
  lead_name text,
  company_name text,
  score numeric,
  created_at timestamptz
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
    m.id,
    m.title,
    m.start_time,
    COALESCE(l.first_name || ' ' || l.last_name, l.email, 'Lead') AS lead_name,
    COALESCE(c.name, '') AS company_name,
    (
      -- Title match (+5)
      CASE WHEN lower(coalesce(m.title, '')) LIKE '%' || v_search_text || '%' THEN 5 ELSE 0 END +
      -- Raw text match (+3)
      CASE WHEN lower(coalesce(m.raw_text, '')) LIKE '%' || v_search_text || '%' THEN 3 ELSE 0 END +
      -- Date match (if query looks like a date)
      CASE WHEN v_search_text ~ '\d{1,2}[/-]\d{1,2}' AND m.start_time::text LIKE '%' || v_search_text || '%' THEN 4 ELSE 0 END +
      -- Time match (if query looks like a time)
      CASE WHEN v_search_text ~ '\d{1,2}:\d{2}' AND m.start_time::text LIKE '%' || v_search_text || '%' THEN 3 ELSE 0 END +
      -- Trigram similarity (*10)
      similarity(
        lower(coalesce(m.title,'') || ' ' || coalesce(m.raw_text,'')),
        v_search_text
      ) * 10 +
      -- Recency boost (+3 if created in last 30 days)
      CASE WHEN m.created_at > now() - interval '30 days' THEN 3 ELSE 0 END
    )::numeric AS score,
    m.created_at
  FROM public.meetings m
  LEFT JOIN public.leads l ON l.id = m.lead_id
  LEFT JOIN public.companies c ON c.id = m.company_id
  WHERE m.workspace_id = ANY(p_workspace_ids)
    AND (
      m.title ILIKE '%' || p_query || '%'
      OR m.raw_text ILIKE '%' || p_query || '%'
      OR m.start_time::text ILIKE '%' || p_query || '%'
      OR (
        coalesce(m.title,'') || ' ' || coalesce(m.raw_text,'')
      ) % p_query
    )
  ORDER BY score DESC, m.created_at DESC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION public.search_meetings IS 'Search meetings by title, raw text, date, and time. Returns ranked results with relevance scoring.';

