-- ============================================================
-- Block 53000 — SmartSend Roofing "Storm Response + Emergency Dispatch System" v1
-- (STORM DETECTION • AUTO HOMEOWNER ALERTS • EMERGENCY INSPECTION REQUESTS • RAPID DISPATCH • PRIORITIZED TICKETING • INSURANCE-PROOF PHOTO REPORTS)
-- ============================================================
-- 
-- This block turns SmartSend into a revenue multiplier for roofing companies during storms — 
-- the #1 moment roofers can explode their growth if they react FAST and ORGANIZED.
--
-- Features:
-- - Live Storm Detection (Hail + Wind Events)
-- - Auto Homeowner Alerts (Email, SMS, Portal)
-- - Emergency Inspection Request Capture
-- - Rapid Crew Dispatch
-- - Photo-Backed Inspection Reports
-- - Storm Dashboard (Command Center)
-- ============================================================

-- ============================================================
-- 1. STORM_EVENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.storm_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  storm_type text NOT NULL CHECK (storm_type IN ('hail', 'wind', 'rain', 'ice', 'tree_impact')),
  event_date date NOT NULL,
  affected_zips text[] NOT NULL,
  severity jsonb DEFAULT '{}'::jsonb, -- { "hail_size": 1.5, "wind_speed": 60, "rating": 7 }
  detected_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_storm_events_workspace ON public.storm_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_storm_events_date ON public.storm_events(event_date DESC);
CREATE INDEX IF NOT EXISTS idx_storm_events_active ON public.storm_events(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_storm_events_zips ON public.storm_events USING GIN(affected_zips);

-- ============================================================
-- 2. STORM_NOTIFICATIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.storm_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storm_id uuid NOT NULL REFERENCES public.storm_events(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  homeowner_id uuid REFERENCES public.homeowners(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  email text,
  phone text,
  zip_code text,
  notified_via text[], -- ['email', 'sms', 'portal']
  notified_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_storm_notifications_storm ON public.storm_notifications(storm_id);
CREATE INDEX IF NOT EXISTS idx_storm_notifications_workspace ON public.storm_notifications(workspace_id);
CREATE INDEX IF NOT EXISTS idx_storm_notifications_homeowner ON public.storm_notifications(homeowner_id) WHERE homeowner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_storm_notifications_lead ON public.storm_notifications(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_storm_notifications_zip ON public.storm_notifications(zip_code);

-- ============================================================
-- 3. STORM_INSPECTION_REQUESTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.storm_inspection_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storm_id uuid NOT NULL REFERENCES public.storm_events(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  homeowner_id uuid REFERENCES public.homeowners(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  notification_id uuid REFERENCES public.storm_notifications(id) ON DELETE SET NULL,
  
  -- Request Details
  name text NOT NULL,
  address text NOT NULL,
  phone text,
  email text,
  zip_code text NOT NULL,
  description text,
  photos text[], -- Array of photo URLs
  severity_rating numeric CHECK (severity_rating >= 1 AND severity_rating <= 10),
  
  -- Assignment & Status
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'assigned', 'in_progress', 'completed', 'cancelled')),
  technician_id uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  assigned_at timestamptz,
  completed_at timestamptz,
  
  -- Metadata
  source text DEFAULT 'storm_landing', -- 'storm_landing', 'homeowner_portal', 'phone', 'email'
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_storm_inspection_requests_storm ON public.storm_inspection_requests(storm_id);
CREATE INDEX IF NOT EXISTS idx_storm_inspection_requests_workspace ON public.storm_inspection_requests(workspace_id);
CREATE INDEX IF NOT EXISTS idx_storm_inspection_requests_status ON public.storm_inspection_requests(status);
CREATE INDEX IF NOT EXISTS idx_storm_inspection_requests_tech ON public.storm_inspection_requests(technician_id) WHERE technician_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_storm_inspection_requests_zip ON public.storm_inspection_requests(zip_code);
CREATE INDEX IF NOT EXISTS idx_storm_inspection_requests_job ON public.storm_inspection_requests(job_id) WHERE job_id IS NOT NULL;

-- ============================================================
-- 4. STORM_INSPECTION_REPORTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.storm_inspection_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.storm_inspection_requests(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Inspection Findings
  findings jsonb NOT NULL DEFAULT '{}'::jsonb, -- { "shingle_bruising": true, "soft_metal_damage": true, "ridge_dents": 3, "downspout_dents": 2, "flashing_damage": false, "granule_loss": "moderate" }
  damage_classification text CHECK (damage_classification IN ('minor', 'moderate', 'severe', 'none')),
  severity_score numeric CHECK (severity_score >= 0 AND severity_score <= 10),
  
  -- Recommendations
  recommendation text CHECK (recommendation IN ('repair', 'replacement', 'monitor', 'none')),
  recommendation_details text,
  estimated_repair_cost numeric,
  estimated_replacement_cost numeric,
  
  -- Report Generation
  pdf_url text,
  photos text[], -- Array of inspection photo URLs
  inspection_date date,
  inspected_by uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_storm_inspection_reports_request ON public.storm_inspection_reports(request_id);
CREATE INDEX IF NOT EXISTS idx_storm_inspection_reports_workspace ON public.storm_inspection_reports(workspace_id);
CREATE INDEX IF NOT EXISTS idx_storm_inspection_reports_classification ON public.storm_inspection_reports(damage_classification);
CREATE INDEX IF NOT EXISTS idx_storm_inspection_reports_recommendation ON public.storm_inspection_reports(recommendation);

-- ============================================================
-- 5. TRIGGERS
-- ============================================================

-- Auto-update updated_at for storm_events
CREATE OR REPLACE FUNCTION update_storm_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_storm_events_updated_at
BEFORE UPDATE ON public.storm_events
FOR EACH ROW
EXECUTE FUNCTION update_storm_events_updated_at();

-- Auto-update updated_at for storm_inspection_requests
CREATE OR REPLACE FUNCTION update_storm_inspection_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_storm_inspection_requests_updated_at
BEFORE UPDATE ON public.storm_inspection_requests
FOR EACH ROW
EXECUTE FUNCTION update_storm_inspection_requests_updated_at();

-- Auto-update updated_at for storm_inspection_reports
CREATE OR REPLACE FUNCTION update_storm_inspection_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_storm_inspection_reports_updated_at
BEFORE UPDATE ON public.storm_inspection_reports
FOR EACH ROW
EXECUTE FUNCTION update_storm_inspection_reports_updated_at();

-- ============================================================
-- 6. HELPER FUNCTIONS
-- ============================================================

-- Function to get homeowners in affected zip codes
CREATE OR REPLACE FUNCTION get_homeowners_in_zips(
  p_workspace_id uuid,
  p_zip_codes text[]
)
RETURNS TABLE (
  homeowner_id uuid,
  email text,
  name text,
  zip_code text,
  lead_id uuid,
  contact_id uuid
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT
    h.id as homeowner_id,
    h.email,
    h.name,
    COALESCE(l.zip_code, c.zip_code, '') as zip_code,
    l.id as lead_id,
    c.id as contact_id
  FROM public.homeowners h
  LEFT JOIN public.roofing_jobs j ON j.id = h.job_id
  LEFT JOIN public.leads l ON l.id = j.lead_id
  LEFT JOIN public.contacts c ON c.email = h.email AND c.workspace_id = p_workspace_id
  WHERE j.workspace_id = p_workspace_id
    AND (
      l.zip_code = ANY(p_zip_codes)
      OR c.zip_code = ANY(p_zip_codes)
    );
END;
$$ LANGUAGE plpgsql;

-- Function to calculate storm revenue potential
CREATE OR REPLACE FUNCTION calculate_storm_revenue_potential(
  p_storm_id uuid
)
RETURNS jsonb AS $$
DECLARE
  v_total_requests int;
  v_completed_inspections int;
  v_replacement_opportunities int;
  v_repair_opportunities int;
  v_avg_replacement_value numeric := 15000;
  v_avg_repair_value numeric := 2500;
  v_revenue_potential numeric;
BEGIN
  -- Count total inspection requests
  SELECT COUNT(*) INTO v_total_requests
  FROM public.storm_inspection_requests
  WHERE storm_id = p_storm_id;

  -- Count completed inspections
  SELECT COUNT(*) INTO v_completed_inspections
  FROM public.storm_inspection_requests
  WHERE storm_id = p_storm_id AND status = 'completed';

  -- Count replacement opportunities
  SELECT COUNT(*) INTO v_replacement_opportunities
  FROM public.storm_inspection_reports sir
  JOIN public.storm_inspection_requests sir2 ON sir.request_id = sir2.id
  WHERE sir2.storm_id = p_storm_id
    AND sir.recommendation = 'replacement';

  -- Count repair opportunities
  SELECT COUNT(*) INTO v_repair_opportunities
  FROM public.storm_inspection_reports sir
  JOIN public.storm_inspection_requests sir2 ON sir.request_id = sir2.id
  WHERE sir2.storm_id = p_storm_id
    AND sir.recommendation = 'repair';

  -- Calculate revenue potential
  v_revenue_potential := (v_replacement_opportunities * v_avg_replacement_value) + 
                         (v_repair_opportunities * v_avg_repair_value);

  RETURN jsonb_build_object(
    'total_requests', v_total_requests,
    'completed_inspections', v_completed_inspections,
    'replacement_opportunities', v_replacement_opportunities,
    'repair_opportunities', v_repair_opportunities,
    'revenue_potential', v_revenue_potential
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 7. ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE public.storm_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storm_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storm_inspection_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storm_inspection_reports ENABLE ROW LEVEL SECURITY;

-- Storm Events: Users can view/manage storms in their workspace
CREATE POLICY "storm_events_workspace_access"
  ON public.storm_events
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Storm Notifications: Users can view notifications in their workspace
CREATE POLICY "storm_notifications_workspace_access"
  ON public.storm_notifications
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Storm Inspection Requests: Users can view/manage requests in their workspace
CREATE POLICY "storm_inspection_requests_workspace_access"
  ON public.storm_inspection_requests
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Storm Inspection Reports: Users can view reports in their workspace
CREATE POLICY "storm_inspection_reports_workspace_access"
  ON public.storm_inspection_reports
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Service role has full access
CREATE POLICY "storm_events_service_role_all"
  ON public.storm_events
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "storm_notifications_service_role_all"
  ON public.storm_notifications
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "storm_inspection_requests_service_role_all"
  ON public.storm_inspection_requests
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "storm_inspection_reports_service_role_all"
  ON public.storm_inspection_reports
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);
































