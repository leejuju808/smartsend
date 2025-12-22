-- Block 39770 — SmartSend Roofing "AI Warranty & Service Request Engine" v1
-- Handle leaks, repairs, and warranty claims automatically
-- Route emergencies • Track service history • Schedule repair crews • Protect roofers from abuse

-- ============================================================
-- 1. SERVICE TICKETS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.service_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  issue_type text CHECK (issue_type IN (
    'leak',
    'shingle_loss',
    'vent_issue',
    'flashing',
    'gutter',
    'unknown'
  )),
  
  urgency text CHECK (urgency IN ('emergency', 'high', 'normal')) DEFAULT 'normal',
  
  description text NOT NULL,
  
  status text CHECK (status IN (
    'open',
    'scheduled',
    'in_progress',
    'resolved',
    'closed',
    'cancelled'
  )) DEFAULT 'open',
  
  covered boolean, -- Is this covered under warranty?
  warranty_determination text CHECK (warranty_determination IN (
    'warranty_covered',
    'warranty_not_covered',
    'storm_damage_insurance',
    'maintenance_issue',
    'chargeable_repair',
    'pending'
  )) DEFAULT 'pending',
  
  recommended_action text,
  estimated_labor_hours numeric(5,2),
  
  crew_assigned_id uuid, -- References crews table if exists, or just store name
  crew_assigned_name text,
  
  scheduled_at timestamptz,
  resolved_at timestamptz,
  
  abuse_flag boolean DEFAULT false,
  abuse_reason text,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_tickets_lead ON public.service_tickets(lead_id);
CREATE INDEX IF NOT EXISTS idx_service_tickets_job ON public.service_tickets(job_id);
CREATE INDEX IF NOT EXISTS idx_service_tickets_workspace ON public.service_tickets(workspace_id);
CREATE INDEX IF NOT EXISTS idx_service_tickets_status ON public.service_tickets(status);
CREATE INDEX IF NOT EXISTS idx_service_tickets_urgency ON public.service_tickets(urgency);
CREATE INDEX IF NOT EXISTS idx_service_tickets_covered ON public.service_tickets(covered);
CREATE INDEX IF NOT EXISTS idx_service_tickets_scheduled ON public.service_tickets(scheduled_at) WHERE scheduled_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_service_tickets_created ON public.service_tickets(created_at DESC);

-- ============================================================
-- 2. SERVICE PHOTOS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.service_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.service_tickets(id) ON DELETE CASCADE,
  
  photo_url text NOT NULL,
  label text, -- 'before', 'after', 'damage', 'repair', etc.
  
  ai_analysis text, -- AI analysis of the photo
  ai_suggested_cause text,
  ai_suggested_action text,
  
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_photos_ticket ON public.service_photos(ticket_id);
CREATE INDEX IF NOT EXISTS idx_service_photos_label ON public.service_photos(label);

-- ============================================================
-- 3. SERVICE EVENTS TABLE (Audit trail)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.service_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.service_tickets(id) ON DELETE CASCADE,
  
  event text NOT NULL, -- 'created', 'photo_requested', 'photo_received', 'scheduled', 'crew_assigned', 'resolved', etc.
  metadata jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_events_ticket ON public.service_events(ticket_id);
CREATE INDEX IF NOT EXISTS idx_service_events_created ON public.service_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_events_event ON public.service_events(event);

-- ============================================================
-- 4. TRIGGERS
-- ============================================================

-- Update updated_at on service_tickets
CREATE OR REPLACE FUNCTION update_service_tickets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_service_tickets_updated_at ON public.service_tickets;
CREATE TRIGGER trg_service_tickets_updated_at
BEFORE UPDATE ON public.service_tickets
FOR EACH ROW
EXECUTE FUNCTION update_service_tickets_updated_at();

-- Auto-create event when ticket is created
CREATE OR REPLACE FUNCTION log_service_ticket_event()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.service_events (ticket_id, event, metadata)
    VALUES (NEW.id, 'created', jsonb_build_object(
      'issue_type', NEW.issue_type,
      'urgency', NEW.urgency,
      'description', NEW.description
    ));
  ELSIF TG_OP = 'UPDATE' THEN
    -- Log status changes
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO public.service_events (ticket_id, event, metadata)
      VALUES (NEW.id, 'status_changed', jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status
      ));
    END IF;
    
    -- Log scheduling
    IF OLD.scheduled_at IS DISTINCT FROM NEW.scheduled_at AND NEW.scheduled_at IS NOT NULL THEN
      INSERT INTO public.service_events (ticket_id, event, metadata)
      VALUES (NEW.id, 'scheduled', jsonb_build_object(
        'scheduled_at', NEW.scheduled_at
      ));
    END IF;
    
    -- Log resolution
    IF OLD.resolved_at IS DISTINCT FROM NEW.resolved_at AND NEW.resolved_at IS NOT NULL THEN
      INSERT INTO public.service_events (ticket_id, event, metadata)
      VALUES (NEW.id, 'resolved', jsonb_build_object(
        'resolved_at', NEW.resolved_at
      ));
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_log_service_ticket_event ON public.service_tickets;
CREATE TRIGGER trg_log_service_ticket_event
AFTER INSERT OR UPDATE ON public.service_tickets
FOR EACH ROW
EXECUTE FUNCTION log_service_ticket_event();

-- ============================================================
-- 5. ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE public.service_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_events ENABLE ROW LEVEL SECURITY;

-- Service tickets: Team members can access tickets in their workspace
DROP POLICY IF EXISTS "service_tickets_workspace_member" ON public.service_tickets;
CREATE POLICY "service_tickets_workspace_member" ON public.service_tickets
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Service photos: Same workspace access
DROP POLICY IF EXISTS "service_photos_workspace_member" ON public.service_photos;
CREATE POLICY "service_photos_workspace_member" ON public.service_photos
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.service_tickets st
      WHERE st.id = service_photos.ticket_id
      AND st.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.service_tickets st
      WHERE st.id = service_photos.ticket_id
      AND st.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
    )
  );

-- Service events: Same workspace access
DROP POLICY IF EXISTS "service_events_workspace_member" ON public.service_events;
CREATE POLICY "service_events_workspace_member" ON public.service_events
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.service_tickets st
      WHERE st.id = service_events.ticket_id
      AND st.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.service_tickets st
      WHERE st.id = service_events.ticket_id
      AND st.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
    )
  );

-- Service role has full access
CREATE POLICY IF NOT EXISTS "service_tickets_service_role" ON public.service_tickets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "service_photos_service_role" ON public.service_photos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "service_events_service_role" ON public.service_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 6. HELPER FUNCTIONS
-- ============================================================

-- Function to detect warranty abuse patterns
CREATE OR REPLACE FUNCTION detect_warranty_abuse(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_abuse_score int := 0;
  v_not_covered_count int;
  v_recent_claims int;
  v_result jsonb;
BEGIN
  -- Count not-covered claims
  SELECT COUNT(*) INTO v_not_covered_count
  FROM public.service_tickets
  WHERE lead_id = p_lead_id
    AND warranty_determination = 'warranty_not_covered';
  
  -- Count recent claims (last 90 days)
  SELECT COUNT(*) INTO v_recent_claims
  FROM public.service_tickets
  WHERE lead_id = p_lead_id
    AND created_at >= now() - interval '90 days';
  
  -- Calculate abuse score
  IF v_not_covered_count >= 3 THEN
    v_abuse_score := v_abuse_score + 10;
  END IF;
  
  IF v_recent_claims >= 5 THEN
    v_abuse_score := v_abuse_score + 5;
  END IF;
  
  -- Build result
  v_result := jsonb_build_object(
    'abuse_score', v_abuse_score,
    'not_covered_count', v_not_covered_count,
    'recent_claims', v_recent_claims,
    'is_abuse', v_abuse_score >= 10
  );
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION detect_warranty_abuse IS 'Block 39770: Detects potential warranty abuse patterns for a lead';

-- Function to get service history for a job
CREATE OR REPLACE FUNCTION get_job_service_history(p_job_id uuid)
RETURNS TABLE (
  ticket_id uuid,
  issue_type text,
  urgency text,
  status text,
  covered boolean,
  created_at timestamptz,
  resolved_at timestamptz
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    st.id,
    st.issue_type,
    st.urgency,
    st.status,
    st.covered,
    st.created_at,
    st.resolved_at
  FROM public.service_tickets st
  WHERE st.job_id = p_job_id
  ORDER BY st.created_at DESC;
END;
$$;

COMMENT ON FUNCTION get_job_service_history IS 'Block 39770: Returns service ticket history for a job';

-- ============================================================
-- 7. GRANT PERMISSIONS
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_tickets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_photos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_events TO authenticated;
GRANT EXECUTE ON FUNCTION detect_warranty_abuse(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_job_service_history(uuid) TO authenticated;
































