-- =========================================================
-- Block 30041 — SmartSend Roofing "Storm Event Lead Surge Engine" v1
-- (Real-time storm detection • Auto-launch storm campaigns • Capture high-intent homeowners • Surge-mode pipeline + scoring boost)
-- =========================================================

-- ============================================
-- 1) Storm Events Table
-- ============================================
CREATE TABLE IF NOT EXISTS public.storm_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zip_code text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('hail', 'wind', 'rain', 'ice', 'tree_impact')),
  severity int NOT NULL CHECK (severity >= 1 AND severity <= 10),
  detected_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb, -- Store additional data like hail size, wind speed, etc.
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_storm_events_zip_code ON public.storm_events(zip_code);
CREATE INDEX IF NOT EXISTS idx_storm_events_detected_at ON public.storm_events(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_storm_events_expires_at ON public.storm_events(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_storm_events_active ON public.storm_events(detected_at, expires_at) WHERE expires_at IS NULL OR expires_at > now();

-- ============================================
-- 2) Storm Flags Table (per contractor/workspace)
-- ============================================
CREATE TABLE IF NOT EXISTS public.storm_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT false,
  last_triggered timestamptz,
  active_storm_event_ids uuid[] DEFAULT '{}'::uuid[], -- Array of active storm event IDs affecting this workspace
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_storm_flags_workspace ON public.storm_flags(workspace_id);
CREATE INDEX IF NOT EXISTS idx_storm_flags_active ON public.storm_flags(active) WHERE active = true;

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_storm_flags_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_storm_flags_updated_at
BEFORE UPDATE ON public.storm_flags
FOR EACH ROW
EXECUTE FUNCTION public.update_storm_flags_updated_at();

-- ============================================
-- 3) Storm Leads Table (Links leads to storm events)
-- ============================================
CREATE TABLE IF NOT EXISTS public.storm_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  storm_event_id uuid NOT NULL REFERENCES public.storm_events(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  urgency_score int NOT NULL DEFAULT 0 CHECK (urgency_score >= 0),
  classification text CHECK (classification IN ('storm_damage', 'insurance_claim', 'emergency_leak', 'inspection_request')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(lead_id, storm_event_id)
);

CREATE INDEX IF NOT EXISTS idx_storm_leads_lead_id ON public.storm_leads(lead_id);
CREATE INDEX IF NOT EXISTS idx_storm_leads_storm_event_id ON public.storm_leads(storm_event_id);
CREATE INDEX IF NOT EXISTS idx_storm_leads_workspace_id ON public.storm_leads(workspace_id);
CREATE INDEX IF NOT EXISTS idx_storm_leads_urgency_score ON public.storm_leads(urgency_score DESC);
CREATE INDEX IF NOT EXISTS idx_storm_leads_classification ON public.storm_leads(classification) WHERE classification IS NOT NULL;

-- ============================================
-- 4) Storm Lead Score Logs (for tracking boost signals)
-- ============================================
CREATE TABLE IF NOT EXISTS public.storm_lead_score_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  storm_event_id uuid REFERENCES public.storm_events(id) ON DELETE SET NULL,
  signal text NOT NULL, -- 'storm_urgency', 'insurance_flag', 'high_risk_weather_zone', etc.
  value int NOT NULL, -- Score boost value (e.g., 40, 20, 10)
  message_snippet text, -- Store relevant message text that triggered the signal
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_storm_lead_score_logs_lead_id ON public.storm_lead_score_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_storm_lead_score_logs_storm_event_id ON public.storm_lead_score_logs(storm_event_id);
CREATE INDEX IF NOT EXISTS idx_storm_lead_score_logs_created_at ON public.storm_lead_score_logs(created_at DESC);

-- ============================================
-- 5) Storm Campaign Templates (pre-configured storm outreach sequences)
-- ============================================
CREATE TABLE IF NOT EXISTS public.storm_campaign_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE, -- NULL = global template
  name text NOT NULL,
  description text,
  sequence_id uuid REFERENCES public.sequences(id) ON DELETE SET NULL, -- Link to a sequence for auto-launch
  is_default boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_storm_campaign_templates_workspace ON public.storm_campaign_templates(workspace_id);
CREATE INDEX IF NOT EXISTS idx_storm_campaign_templates_default ON public.storm_campaign_templates(is_default) WHERE is_default = true;

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_storm_campaign_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_storm_campaign_templates_updated_at
BEFORE UPDATE ON public.storm_campaign_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_storm_campaign_templates_updated_at();

-- ============================================
-- 6) Helper Functions
-- ============================================

-- Function: Check if a ZIP code is in a workspace's service area
CREATE OR REPLACE FUNCTION public.is_zip_in_service_area(
  p_workspace_id uuid,
  p_zip_code text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_in_territory boolean := false;
BEGIN
  -- Check if ZIP is in contractor_territory
  SELECT EXISTS (
    SELECT 1
    FROM public.contractor_territory ct
    WHERE ct.workspace_id = p_workspace_id
      AND (p_zip_code = ANY(ct.zip_codes))
  ) INTO v_in_territory;

  RETURN v_in_territory;
END;
$$;

-- Function: Get active storm events for a workspace
CREATE OR REPLACE FUNCTION public.get_active_storms_for_workspace(
  p_workspace_id uuid
)
RETURNS TABLE (
  storm_event_id uuid,
  zip_code text,
  event_type text,
  severity int,
  detected_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT se.id, se.zip_code, se.event_type, se.severity, se.detected_at
  FROM public.storm_events se
  INNER JOIN public.contractor_territory ct ON se.zip_code = ANY(ct.zip_codes)
  WHERE ct.workspace_id = p_workspace_id
    AND (se.expires_at IS NULL OR se.expires_at > now())
    AND se.detected_at > now() - INTERVAL '7 days' -- Only storms from last 7 days
  ORDER BY se.detected_at DESC;
END;
$$;

-- Function: Apply storm boost to lead score
CREATE OR REPLACE FUNCTION public.apply_storm_boost_to_lead(
  p_lead_id uuid,
  p_storm_event_id uuid,
  p_signal text,
  p_value int,
  p_message_snippet text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_score int;
  v_new_score int;
  v_workspace_id uuid;
BEGIN
  -- Get current lead score and workspace
  SELECT l.score, l.workspace_id
  INTO v_current_score, v_workspace_id
  FROM public.leads l
  WHERE l.id = p_lead_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Lead not found';
  END IF;

  -- Get current score (default to 0 if null)
  v_current_score := COALESCE(v_current_score, 0);
  
  -- Apply boost (cap at 100)
  v_new_score := LEAST(100, v_current_score + p_value);

  -- Update lead score
  UPDATE public.leads
  SET score = v_new_score,
      score_updated_at = now()
  WHERE id = p_lead_id;

  -- Log the score boost
  INSERT INTO public.storm_lead_score_logs (
    lead_id,
    storm_event_id,
    signal,
    value,
    message_snippet
  ) VALUES (
    p_lead_id,
    p_storm_event_id,
    p_signal,
    p_value,
    p_message_snippet
  );

  -- Ensure storm_leads record exists
  INSERT INTO public.storm_leads (
    lead_id,
    storm_event_id,
    workspace_id,
    urgency_score
  )
  VALUES (
    p_lead_id,
    p_storm_event_id,
    v_workspace_id,
    p_value
  )
  ON CONFLICT (lead_id, storm_event_id) DO UPDATE
  SET urgency_score = GREATEST(storm_leads.urgency_score, p_value);
END;
$$;

-- Function: Classify storm lead from message content
CREATE OR REPLACE FUNCTION public.classify_storm_lead(
  p_message_body text,
  p_current_classification text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_classification text;
  v_lower_body text;
BEGIN
  v_lower_body := LOWER(p_message_body);
  v_classification := p_current_classification;

  -- Check for emergency leak indicators
  IF v_lower_body ~ '(water coming in|hole in roof|leak|flooding|water damage|wet ceiling|wet wall)' THEN
    v_classification := 'emergency_leak';
  -- Check for insurance claim indicators
  ELSIF v_lower_body ~ '(insurance|claim|adjuster|coverage|deductible|file a claim)' THEN
    v_classification := 'insurance_claim';
  -- Check for storm damage indicators
  ELSIF v_lower_body ~ '(hail|wind damage|shingle|roof damage|storm damage|broken|missing)' THEN
    v_classification := 'storm_damage';
  -- Check for inspection request
  ELSIF v_lower_body ~ '(inspection|check|look at|assess|estimate|evaluate)' THEN
    v_classification := 'inspection_request';
  END IF;

  RETURN v_classification;
END;
$$;

-- Function: Update lead classification from message
CREATE OR REPLACE FUNCTION public.update_storm_lead_classification(
  p_lead_id uuid,
  p_message_body text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_classification text;
  v_storm_event_id uuid;
BEGIN
  -- Classify the message
  v_classification := public.classify_storm_lead(p_message_body);

  IF v_classification IS NOT NULL THEN
    -- Get the most recent storm event for this lead
    SELECT sl.storm_event_id INTO v_storm_event_id
    FROM public.storm_leads sl
    WHERE sl.lead_id = p_lead_id
    ORDER BY sl.created_at DESC
    LIMIT 1;

    -- Update classification if we have a storm lead record
    IF v_storm_event_id IS NOT NULL THEN
      UPDATE public.storm_leads
      SET classification = v_classification
      WHERE lead_id = p_lead_id
        AND storm_event_id = v_storm_event_id;
    END IF;
  END IF;
END;
$$;

-- ============================================
-- 7) RLS Policies
-- ============================================

ALTER TABLE public.storm_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storm_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storm_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storm_lead_score_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storm_campaign_templates ENABLE ROW LEVEL SECURITY;

-- Storm events: Readable by all authenticated users (storm data is public knowledge)
CREATE POLICY "storm_events_select_all" ON public.storm_events
  FOR SELECT
  TO authenticated
  USING (true);

-- Service role has full access to storm_events
CREATE POLICY "storm_events_service_role_all" ON public.storm_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Storm flags: Users can only see flags for their workspace
CREATE POLICY "storm_flags_select_workspace" ON public.storm_flags
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = storm_flags.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Service role has full access to storm_flags
CREATE POLICY "storm_flags_service_role_all" ON public.storm_flags
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Storm leads: Users can only see storm leads for leads in their workspace
CREATE POLICY "storm_leads_select_workspace" ON public.storm_leads
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.leads l
      INNER JOIN public.workspace_members wm ON wm.workspace_id = l.workspace_id
      WHERE l.id = storm_leads.lead_id
        AND wm.user_id = auth.uid()
    )
  );

-- Service role has full access to storm_leads
CREATE POLICY "storm_leads_service_role_all" ON public.storm_leads
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Storm lead score logs: Same as storm_leads
CREATE POLICY "storm_lead_score_logs_select_workspace" ON public.storm_lead_score_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.leads l
      INNER JOIN public.workspace_members wm ON wm.workspace_id = l.workspace_id
      WHERE l.id = storm_lead_score_logs.lead_id
        AND wm.user_id = auth.uid()
    )
  );

-- Service role has full access to storm_lead_score_logs
CREATE POLICY "storm_lead_score_logs_service_role_all" ON public.storm_lead_score_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Storm campaign templates: Users can see their workspace templates + global templates
CREATE POLICY "storm_campaign_templates_select" ON public.storm_campaign_templates
  FOR SELECT
  TO authenticated
  USING (
    workspace_id IS NULL OR
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = storm_campaign_templates.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Service role has full access
CREATE POLICY "storm_campaign_templates_service_role_all" ON public.storm_campaign_templates
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================
-- 8) Comments
-- ============================================

COMMENT ON TABLE public.storm_events IS 'Real-time storm events detected from NOAA API or other weather feeds';
COMMENT ON TABLE public.storm_flags IS 'Active storm flags per workspace - indicates when storm mode is active';
COMMENT ON TABLE public.storm_leads IS 'Links leads to storm events for tracking and scoring';
COMMENT ON TABLE public.storm_lead_score_logs IS 'Logs of score boosts applied to leads due to storm events';
COMMENT ON TABLE public.storm_campaign_templates IS 'Pre-configured storm outreach campaign templates';

COMMENT ON FUNCTION public.is_zip_in_service_area IS 'Checks if a ZIP code is within a workspace service area';
COMMENT ON FUNCTION public.get_active_storms_for_workspace IS 'Returns all active storm events affecting a workspace territory';
COMMENT ON FUNCTION public.apply_storm_boost_to_lead IS 'Applies a score boost to a lead and logs it';
COMMENT ON FUNCTION public.classify_storm_lead IS 'Classifies a storm lead based on message content (storm_damage, insurance_claim, emergency_leak, inspection_request)';
COMMENT ON FUNCTION public.update_storm_lead_classification IS 'Updates storm lead classification from message body';


































