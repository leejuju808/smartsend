-- =========================================================
-- Block 36555 — SmartSend Roofing "Smart Financing Engine + Instant Pre-Qual" v1
-- (Offer homeowners financing automatically • Boost approval rates • Sync with proposals • Increase close rate 20–40% • Zero extra work for the roofer)
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE financing_status TABLE
-- ============================================================================
-- Tracks financing status for each proposal/lead

CREATE TABLE IF NOT EXISTS public.financing_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid REFERENCES public.proposals(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  
  -- Status flags
  clicked boolean DEFAULT false,
  started boolean DEFAULT false,
  prequalified boolean DEFAULT false,
  approved boolean DEFAULT false,
  declined boolean DEFAULT false,
  abandoned boolean DEFAULT false,
  
  -- Payment details
  monthly_payment numeric(12,2),
  apr numeric(5,4),
  plan_length int, -- 12, 24, 36 months
  
  -- Timestamps
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  
  -- One status record per proposal
  UNIQUE(proposal_id) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS idx_financing_status_proposal ON public.financing_status(proposal_id);
CREATE INDEX IF NOT EXISTS idx_financing_status_lead ON public.financing_status(lead_id);
CREATE INDEX IF NOT EXISTS idx_financing_status_clicked ON public.financing_status(clicked) WHERE clicked = true;
CREATE INDEX IF NOT EXISTS idx_financing_status_approved ON public.financing_status(approved) WHERE approved = true;

-- ============================================================================
-- PART 2 — CREATE financing_events TABLE
-- ============================================================================
-- Tracks all financing-related events

CREATE TABLE IF NOT EXISTS public.financing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  financing_id uuid REFERENCES public.financing_status(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'clicked',
    'started',
    'prequalified',
    'approved',
    'declined',
    'abandoned'
  )),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_financing_events_financing_id ON public.financing_events(financing_id);
CREATE INDEX IF NOT EXISTS idx_financing_events_type ON public.financing_events(event_type);
CREATE INDEX IF NOT EXISTS idx_financing_events_created ON public.financing_events(created_at DESC);

-- ============================================================================
-- PART 3 — TRIGGERS
-- ============================================================================

-- Update updated_at on financing_status
CREATE OR REPLACE FUNCTION public.tg_update_financing_status_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_update_financing_status_updated_at
BEFORE UPDATE ON public.financing_status
FOR EACH ROW
EXECUTE FUNCTION public.tg_update_financing_status_updated_at();

-- Auto-create event when financing_status changes
CREATE OR REPLACE FUNCTION public.tg_create_financing_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_event_type text;
BEGIN
  -- Determine event type based on what changed
  IF NEW.clicked = true AND (OLD.clicked IS NULL OR OLD.clicked = false) THEN
    v_event_type := 'clicked';
  ELSIF NEW.started = true AND (OLD.started IS NULL OR OLD.started = false) THEN
    v_event_type := 'started';
  ELSIF NEW.prequalified = true AND (OLD.prequalified IS NULL OR OLD.prequalified = false) THEN
    v_event_type := 'prequalified';
  ELSIF NEW.approved = true AND (OLD.approved IS NULL OR OLD.approved = false) THEN
    v_event_type := 'approved';
  ELSIF NEW.declined = true AND (OLD.declined IS NULL OR OLD.declined = false) THEN
    v_event_type := 'declined';
  ELSIF NEW.abandoned = true AND (OLD.abandoned IS NULL OR OLD.abandoned = false) THEN
    v_event_type := 'abandoned';
  ELSE
    RETURN NEW; -- No event to create
  END IF;
  
  -- Create event record
  INSERT INTO public.financing_events (financing_id, event_type, metadata)
  VALUES (
    NEW.id,
    v_event_type,
    jsonb_build_object(
      'monthly_payment', NEW.monthly_payment,
      'apr', NEW.apr,
      'plan_length', NEW.plan_length
    )
  );
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_create_financing_event
AFTER UPDATE ON public.financing_status
FOR EACH ROW
WHEN (
  (OLD.clicked IS DISTINCT FROM NEW.clicked) OR
  (OLD.started IS DISTINCT FROM NEW.started) OR
  (OLD.prequalified IS DISTINCT FROM NEW.prequalified) OR
  (OLD.approved IS DISTINCT FROM NEW.approved) OR
  (OLD.declined IS DISTINCT FROM NEW.declined) OR
  (OLD.abandoned IS DISTINCT FROM NEW.abandoned)
)
EXECUTE FUNCTION public.tg_create_financing_event();

-- ============================================================================
-- PART 4 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.financing_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financing_events ENABLE ROW LEVEL SECURITY;

-- Financing status: Workspace members can access
CREATE POLICY "financing_status_workspace_members"
  ON public.financing_status FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.proposals p
      WHERE p.id = financing_status.proposal_id
      AND p.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
    )
    OR
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = financing_status.lead_id
      AND l.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.proposals p
      WHERE p.id = financing_status.proposal_id
      AND p.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
    )
    OR
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = financing_status.lead_id
      AND l.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
    )
  );

-- Financing events: Workspace members can access
CREATE POLICY "financing_events_workspace_members"
  ON public.financing_events FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.financing_status fs
      JOIN public.proposals p ON p.id = fs.proposal_id
      WHERE fs.id = financing_events.financing_id
      AND p.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
    )
    OR
    EXISTS (
      SELECT 1 FROM public.financing_status fs
      JOIN public.leads l ON l.id = fs.lead_id
      WHERE fs.id = financing_events.financing_id
      AND l.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.financing_status fs
      JOIN public.proposals p ON p.id = fs.proposal_id
      WHERE fs.id = financing_events.financing_id
      AND p.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
    )
    OR
    EXISTS (
      SELECT 1 FROM public.financing_status fs
      JOIN public.leads l ON l.id = fs.lead_id
      WHERE fs.id = financing_events.financing_id
      AND l.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
    )
  );

-- Allow public access to financing_status for proposals (via token)
CREATE POLICY "financing_status_public_proposal_access"
  ON public.financing_status FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.proposals p
      WHERE p.id = financing_status.proposal_id
      AND p.token IS NOT NULL
    )
  );

-- ============================================================================
-- PART 5 — HELPER FUNCTIONS
-- ============================================================================

-- Get financing status for a proposal
CREATE OR REPLACE FUNCTION public.get_proposal_financing_status(p_proposal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'has_status', EXISTS(
      SELECT 1 FROM public.financing_status 
      WHERE proposal_id = p_proposal_id
    ),
    'status', (
      SELECT jsonb_build_object(
        'id', id,
        'clicked', clicked,
        'started', started,
        'prequalified', prequalified,
        'approved', approved,
        'declined', declined,
        'abandoned', abandoned,
        'monthly_payment', monthly_payment,
        'apr', apr,
        'plan_length', plan_length,
        'updated_at', updated_at
      )
      FROM public.financing_status
      WHERE proposal_id = p_proposal_id
      LIMIT 1
    ),
    'events', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'event_type', event_type,
          'created_at', created_at,
          'metadata', metadata
        )
        ORDER BY created_at DESC
      )
      FROM public.financing_events
      WHERE financing_id = (
        SELECT id FROM public.financing_status 
        WHERE proposal_id = p_proposal_id
        LIMIT 1
      )
    )
  ) INTO v_result;
  
  RETURN COALESCE(v_result, '{"has_status": false}'::jsonb);
END;
$$;

-- Get financing dashboard stats for a workspace
CREATE OR REPLACE FUNCTION public.get_financing_dashboard_stats_v2(p_workspace_id uuid, p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  v_start_date timestamptz;
BEGIN
  v_start_date := now() - (p_days || ' days')::interval;
  
  SELECT jsonb_build_object(
    'total_viewed', (
      SELECT COUNT(DISTINCT fs.proposal_id)
      FROM public.financing_status fs
      JOIN public.proposals p ON p.id = fs.proposal_id
      WHERE p.workspace_id = p_workspace_id
      AND fs.clicked = true
      AND fs.created_at >= v_start_date
    ),
    'prequal_rate', (
      SELECT 
        CASE 
          WHEN COUNT(*) FILTER (WHERE fs.clicked = true) = 0 THEN 0
          ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE fs.prequalified = true) / 
                     COUNT(*) FILTER (WHERE fs.clicked = true), 2)
        END
      FROM public.financing_status fs
      JOIN public.proposals p ON p.id = fs.proposal_id
      WHERE p.workspace_id = p_workspace_id
      AND fs.created_at >= v_start_date
    ),
    'approval_rate', (
      SELECT 
        CASE 
          WHEN COUNT(*) FILTER (WHERE fs.started = true) = 0 THEN 0
          ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE fs.approved = true) / 
                     COUNT(*) FILTER (WHERE fs.started = true), 2)
        END
      FROM public.financing_status fs
      JOIN public.proposals p ON p.id = fs.proposal_id
      WHERE p.workspace_id = p_workspace_id
      AND fs.created_at >= v_start_date
    ),
    'revenue_closed', (
      SELECT COALESCE(SUM((p.proposal_data->>'project_price')::numeric), 0)
      FROM public.financing_status fs
      JOIN public.proposals p ON p.id = fs.proposal_id
      WHERE p.workspace_id = p_workspace_id
      AND fs.approved = true
      AND fs.created_at >= v_start_date
    ),
    'abandonment_rate', (
      SELECT 
        CASE 
          WHEN COUNT(*) FILTER (WHERE fs.clicked = true) = 0 THEN 0
          ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE fs.abandoned = true) / 
                     COUNT(*) FILTER (WHERE fs.clicked = true), 2)
        END
      FROM public.financing_status fs
      JOIN public.proposals p ON p.id = fs.proposal_id
      WHERE p.workspace_id = p_workspace_id
      AND fs.created_at >= v_start_date
    ),
    'total_clicked', (
      SELECT COUNT(*)
      FROM public.financing_status fs
      JOIN public.proposals p ON p.id = fs.proposal_id
      WHERE p.workspace_id = p_workspace_id
      AND fs.clicked = true
      AND fs.created_at >= v_start_date
    ),
    'total_started', (
      SELECT COUNT(*)
      FROM public.financing_status fs
      JOIN public.proposals p ON p.id = fs.proposal_id
      WHERE p.workspace_id = p_workspace_id
      AND fs.started = true
      AND fs.created_at >= v_start_date
    ),
    'total_approved', (
      SELECT COUNT(*)
      FROM public.financing_status fs
      JOIN public.proposals p ON p.id = fs.proposal_id
      WHERE p.workspace_id = p_workspace_id
      AND fs.approved = true
      AND fs.created_at >= v_start_date
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- ============================================================================
-- PART 6 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.financing_status IS 'Financing status tracking for proposals (Block 36555)';
COMMENT ON TABLE public.financing_events IS 'Financing event history (Block 36555)';
COMMENT ON FUNCTION public.get_proposal_financing_status IS 'Get financing status for a proposal (Block 36555)';
COMMENT ON FUNCTION public.get_financing_dashboard_stats_v2 IS 'Get financing dashboard statistics for a workspace (Block 36555)';
































