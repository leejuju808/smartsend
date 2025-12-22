-- =========================================================
-- Block 40210 — SmartSend Roofing "Storm Response + Rapid Deployment Engine" v1
-- (Storm lead intake • Automated storm campaigns • Priority routing • Damage classification • Temporary repairs scheduling • Turn chaos into controlled profit)
-- =========================================================

-- ============================================
-- 1) EXTEND storm_leads TABLE with Block 40210 fields
-- ============================================
ALTER TABLE IF EXISTS public.storm_leads
  ADD COLUMN IF NOT EXISTS damage_type text CHECK (damage_type IN ('hail', 'wind', 'missing_shingles', 'leak', 'tree', 'unknown')),
  ADD COLUMN IF NOT EXISTS urgency text CHECK (urgency IN ('emergency', 'urgent', 'routine')),
  ADD COLUMN IF NOT EXISTS photos jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'new' CHECK (status IN ('new', 'triaged', 'scheduled', 'completed', 'cancelled')),
  ADD COLUMN IF NOT EXISTS insurance_ready boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS insurance_docs jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS coordinates jsonb, -- {lat, lng} for mapping
  ADD COLUMN IF NOT EXISTS zip_code text,
  ADD COLUMN IF NOT EXISTS address text;

-- Indexes for new fields
CREATE INDEX IF NOT EXISTS idx_storm_leads_damage_type ON public.storm_leads(damage_type) WHERE damage_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_storm_leads_urgency ON public.storm_leads(urgency) WHERE urgency IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_storm_leads_status ON public.storm_leads(status);
CREATE INDEX IF NOT EXISTS idx_storm_leads_zip_code ON public.storm_leads(zip_code) WHERE zip_code IS NOT NULL;

-- ============================================
-- 2) EXTEND storm_events TABLE with geo data
-- ============================================
ALTER TABLE IF EXISTS public.storm_events
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS geo jsonb DEFAULT '{}'::jsonb, -- Store affected areas, polygons, etc.
  ADD COLUMN IF NOT EXISTS start_at timestamptz,
  ADD COLUMN IF NOT EXISTS end_at timestamptz,
  ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;

-- Index for active storms
CREATE INDEX IF NOT EXISTS idx_storm_events_active ON public.storm_events(active) WHERE active = true;

-- ============================================
-- 3) EMERGENCY REPAIRS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.emergency_repairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storm_lead_id uuid NOT NULL REFERENCES public.storm_leads(id) ON DELETE CASCADE,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  repair_type text NOT NULL CHECK (repair_type IN ('blue_tarp', 'leak_mitigation', 'emergency_patch', 'temporary_seal')),
  eta timestamptz,
  scheduled_at timestamptz,
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'en_route', 'on_site', 'completed', 'cancelled')),
  notes text,
  photos jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emergency_repairs_storm_lead ON public.emergency_repairs(storm_lead_id);
CREATE INDEX IF NOT EXISTS idx_emergency_repairs_crew ON public.emergency_repairs(crew_id) WHERE crew_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_emergency_repairs_workspace ON public.emergency_repairs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_emergency_repairs_status ON public.emergency_repairs(status);
CREATE INDEX IF NOT EXISTS idx_emergency_repairs_eta ON public.emergency_repairs(eta) WHERE eta IS NOT NULL;

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_emergency_repairs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_emergency_repairs_updated_at ON public.emergency_repairs;
CREATE TRIGGER trg_emergency_repairs_updated_at
BEFORE UPDATE ON public.emergency_repairs
FOR EACH ROW
EXECUTE FUNCTION public.update_emergency_repairs_updated_at();

-- ============================================
-- 4) CREW STATUS TRACKING TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.crew_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id uuid NOT NULL REFERENCES public.crews(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'traveling', 'working', 'unavailable')),
  current_job_id uuid, -- References emergency_repairs or jobs
  location jsonb, -- {lat, lng} for real-time tracking
  last_updated timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(crew_id)
);

CREATE INDEX IF NOT EXISTS idx_crew_status_crew ON public.crew_status(crew_id);
CREATE INDEX IF NOT EXISTS idx_crew_status_workspace ON public.crew_status(workspace_id);
CREATE INDEX IF NOT EXISTS idx_crew_status_status ON public.crew_status(status);
CREATE INDEX IF NOT EXISTS idx_crew_status_last_updated ON public.crew_status(last_updated DESC);

-- ============================================
-- 5) STORM MODE SETTINGS (per workspace)
-- ============================================
ALTER TABLE IF EXISTS public.storm_flags
  ADD COLUMN IF NOT EXISTS auto_respond_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_classify_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_schedule_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS storm_outreach_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_off_threshold_hours int DEFAULT 72; -- Auto-disable after X hours of inactivity

-- ============================================
-- 6) STORM OUTREACH CAMPAIGNS LOG
-- ============================================
CREATE TABLE IF NOT EXISTS public.storm_outreach_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  storm_event_id uuid NOT NULL REFERENCES public.storm_events(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  leads_targeted int DEFAULT 0,
  messages_sent int DEFAULT 0,
  responses_received int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_storm_outreach_logs_workspace ON public.storm_outreach_logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_storm_outreach_logs_storm_event ON public.storm_outreach_logs(storm_event_id);

-- ============================================
-- 7) HELPER FUNCTIONS
-- ============================================

-- Function: Get storm leads by urgency for dashboard
CREATE OR REPLACE FUNCTION public.get_storm_leads_by_urgency(
  p_workspace_id uuid,
  p_urgency text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  lead_id uuid,
  storm_event_id uuid,
  damage_type text,
  urgency text,
  status text,
  created_at timestamptz,
  lead_name text,
  lead_email text,
  lead_phone text,
  address text,
  zip_code text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sl.id,
    sl.lead_id,
    sl.storm_event_id,
    sl.damage_type,
    sl.urgency,
    sl.status,
    sl.created_at,
    l.name as lead_name,
    l.email as lead_email,
    l.phone as lead_phone,
    sl.address,
    sl.zip_code
  FROM public.storm_leads sl
  INNER JOIN public.leads l ON l.id = sl.lead_id
  WHERE sl.workspace_id = p_workspace_id
    AND (p_urgency IS NULL OR sl.urgency = p_urgency)
    AND sl.status != 'completed'
    AND sl.status != 'cancelled'
  ORDER BY 
    CASE sl.urgency
      WHEN 'emergency' THEN 1
      WHEN 'urgent' THEN 2
      WHEN 'routine' THEN 3
      ELSE 4
    END,
    sl.created_at DESC;
END;
$$;

-- Function: Get available crews for emergency assignment
CREATE OR REPLACE FUNCTION public.get_available_crews(
  p_workspace_id uuid,
  p_specialty text DEFAULT NULL
)
RETURNS TABLE (
  crew_id uuid,
  crew_name text,
  status text,
  current_job_id uuid,
  specialties text[],
  phone_number text,
  email text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id as crew_id,
    c.name as crew_name,
    COALESCE(cs.status, 'available') as status,
    cs.current_job_id,
    c.specialties,
    c.phone_number,
    c.email
  FROM public.crews c
  LEFT JOIN public.crew_status cs ON cs.crew_id = c.id
  WHERE c.workspace_id = p_workspace_id
    AND (p_specialty IS NULL OR p_specialty = ANY(c.specialties))
    AND (cs.status IS NULL OR cs.status IN ('available', 'traveling'))
  ORDER BY 
    CASE COALESCE(cs.status, 'available')
      WHEN 'available' THEN 1
      WHEN 'traveling' THEN 2
      ELSE 3
    END;
END;
$$;

-- Function: Assign crew to emergency repair
CREATE OR REPLACE FUNCTION public.assign_crew_to_repair(
  p_repair_id uuid,
  p_crew_id uuid,
  p_eta timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_default_eta timestamptz;
BEGIN
  -- Default ETA: 1 hour from now if not provided
  v_default_eta := COALESCE(p_eta, now() + INTERVAL '1 hour');

  -- Update emergency repair
  UPDATE public.emergency_repairs
  SET 
    crew_id = p_crew_id,
    eta = v_default_eta,
    status = 'assigned',
    scheduled_at = now()
  WHERE id = p_repair_id;

  -- Update crew status
  INSERT INTO public.crew_status (crew_id, workspace_id, status, current_job_id, last_updated)
  SELECT 
    p_crew_id,
    er.workspace_id,
    'traveling',
    p_repair_id,
    now()
  FROM public.emergency_repairs er
  WHERE er.id = p_repair_id
  ON CONFLICT (crew_id) DO UPDATE
  SET 
    status = 'traveling',
    current_job_id = p_repair_id,
    last_updated = now();
END;
$$;

-- Function: Complete emergency repair
CREATE OR REPLACE FUNCTION public.complete_emergency_repair(
  p_repair_id uuid,
  p_notes text DEFAULT NULL,
  p_photos jsonb DEFAULT '[]'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_crew_id uuid;
  v_workspace_id uuid;
BEGIN
  -- Get crew and workspace
  SELECT er.crew_id, er.workspace_id
  INTO v_crew_id, v_workspace_id
  FROM public.emergency_repairs er
  WHERE er.id = p_repair_id;

  -- Update repair
  UPDATE public.emergency_repairs
  SET 
    status = 'completed',
    completed_at = now(),
    notes = COALESCE(p_notes, notes),
    photos = CASE WHEN jsonb_array_length(p_photos) > 0 THEN p_photos ELSE photos END
  WHERE id = p_repair_id;

  -- Update storm lead status
  UPDATE public.storm_leads
  SET status = 'completed'
  WHERE id = (SELECT storm_lead_id FROM public.emergency_repairs WHERE id = p_repair_id);

  -- Free up crew
  IF v_crew_id IS NOT NULL THEN
    UPDATE public.crew_status
    SET 
      status = 'available',
      current_job_id = NULL,
      last_updated = now()
    WHERE crew_id = v_crew_id;
  END IF;
END;
$$;

-- Function: Prepare insurance documentation
CREATE OR REPLACE FUNCTION public.prepare_insurance_docs(
  p_storm_lead_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_docs jsonb;
  v_lead record;
  v_storm_event record;
BEGIN
  -- Get lead and storm event data
  SELECT 
    sl.*,
    l.name as lead_name,
    l.email as lead_email,
    l.phone as lead_phone,
    se.event_type,
    se.severity,
    se.detected_at,
    se.metadata
  INTO v_lead
  FROM public.storm_leads sl
  INNER JOIN public.leads l ON l.id = sl.lead_id
  INNER JOIN public.storm_events se ON se.id = sl.storm_event_id
  WHERE sl.id = p_storm_lead_id;

  IF v_lead IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  -- Build insurance documentation
  v_docs := jsonb_build_object(
    'lead_info', jsonb_build_object(
      'name', v_lead.lead_name,
      'email', v_lead.lead_email,
      'phone', v_lead.lead_phone,
      'address', v_lead.address,
      'zip_code', v_lead.zip_code
    ),
    'damage_info', jsonb_build_object(
      'damage_type', v_lead.damage_type,
      'urgency', v_lead.urgency,
      'description', v_lead.description,
      'photos', v_lead.photos
    ),
    'storm_info', jsonb_build_object(
      'event_type', v_lead.event_type,
      'severity', v_lead.severity,
      'detected_at', v_lead.detected_at,
      'weather_event_code', v_lead.event_type || '_' || v_lead.severity,
      'storm_category', v_lead.event_type
    ),
    'recommended_repairs', jsonb_build_object(
      'immediate', CASE WHEN v_lead.urgency = 'emergency' THEN true ELSE false END,
      'temporary_repair', CASE WHEN v_lead.damage_type = 'leak' THEN 'blue_tarp' ELSE 'inspection_needed' END,
      'full_inspection_required', true
    ),
    'coordinates', v_lead.coordinates,
    'prepared_at', now()
  );

  -- Update storm lead with insurance docs
  UPDATE public.storm_leads
  SET 
    insurance_docs = v_docs,
    insurance_ready = true
  WHERE id = p_storm_lead_id;

  RETURN v_docs;
END;
$$;

-- ============================================
-- 8) RLS POLICIES
-- ============================================

ALTER TABLE IF EXISTS public.emergency_repairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.crew_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.storm_outreach_logs ENABLE ROW LEVEL SECURITY;

-- Emergency repairs: Workspace members can access
CREATE POLICY "emergency_repairs_workspace_access" ON public.emergency_repairs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = emergency_repairs.workspace_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = emergency_repairs.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Service role full access
CREATE POLICY "emergency_repairs_service_role_all" ON public.emergency_repairs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Crew status: Workspace members can access
CREATE POLICY "crew_status_workspace_access" ON public.crew_status
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = crew_status.workspace_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = crew_status.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Service role full access
CREATE POLICY "crew_status_service_role_all" ON public.crew_status
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Storm outreach logs: Workspace members can access
CREATE POLICY "storm_outreach_logs_workspace_access" ON public.storm_outreach_logs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = storm_outreach_logs.workspace_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = storm_outreach_logs.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Service role full access
CREATE POLICY "storm_outreach_logs_service_role_all" ON public.storm_outreach_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================
-- 9) COMMENTS
-- ============================================

COMMENT ON TABLE public.emergency_repairs IS 'Tracks emergency repair assignments for storm leads with active leaks or urgent damage';
COMMENT ON TABLE public.crew_status IS 'Real-time status tracking for crews (available, traveling, working, unavailable)';
COMMENT ON TABLE public.storm_outreach_logs IS 'Logs of automated storm outreach campaigns sent to past leads and customers';

COMMENT ON FUNCTION public.get_storm_leads_by_urgency IS 'Returns storm leads grouped by urgency level for dashboard display';
COMMENT ON FUNCTION public.get_available_crews IS 'Returns available crews for emergency assignment, optionally filtered by specialty';
COMMENT ON FUNCTION public.assign_crew_to_repair IS 'Assigns a crew to an emergency repair and updates crew status';
COMMENT ON FUNCTION public.complete_emergency_repair IS 'Marks an emergency repair as completed and frees up the crew';
COMMENT ON FUNCTION public.prepare_insurance_docs IS 'Generates insurance-ready documentation for a storm lead';
































