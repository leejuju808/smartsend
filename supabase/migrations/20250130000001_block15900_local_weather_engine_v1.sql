-- =========================================================
-- Block 15900 — SmartSend Local Weather Engine v1
-- (Real-Time Roof-Relevant Weather Alerts, Storm Mapping, Zip-Level Risk Detection & Campaign Triggers)
-- =========================================================

-- ============================================================================
-- 1. WEATHER_EVENTS TABLE
-- ============================================================================
-- Stores storm events detected at ZIP code level

CREATE TABLE IF NOT EXISTS public.weather_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Storm identification
  storm_type text NOT NULL CHECK (storm_type IN ('hail', 'wind', 'heavy_rain', 'snow_load', 'freeze_thaw', 'severe_weather', 'nws_advisory', 'nws_warning')),
  zip text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'severe', 'extreme')) DEFAULT 'medium',
  
  -- Storm timing
  storm_started_at timestamptz NOT NULL,
  storm_ended_at timestamptz,
  
  -- Storm measurements
  hail_size numeric(4,2), -- inches (e.g., 0.75, 1.25, 2.50)
  wind_speed numeric(5,2), -- mph (e.g., 50.00, 75.50)
  rain_inches numeric(5,2), -- inches (e.g., 2.00, 3.50)
  snow_load numeric(6,2), -- pounds per square foot
  freeze_thaw_cycles integer, -- number of cycles
  
  -- Storm intensity score (0-100)
  storm_intensity_score integer NOT NULL DEFAULT 0 CHECK (storm_intensity_score >= 0 AND storm_intensity_score <= 100),
  
  -- NWS data
  nws_alert_id text,
  nws_alert_type text,
  nws_headline text,
  
  -- Metadata
  data_source text DEFAULT 'noaa', -- 'noaa', 'nws', 'hailtrace', 'wind_burst', 'rainfall_mapping'
  detected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_weather_events_workspace ON public.weather_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_weather_events_zip ON public.weather_events(zip);
CREATE INDEX IF NOT EXISTS idx_weather_events_storm_type ON public.weather_events(storm_type);
CREATE INDEX IF NOT EXISTS idx_weather_events_storm_started ON public.weather_events(storm_started_at DESC);
CREATE INDEX IF NOT EXISTS idx_weather_events_severity ON public.weather_events(severity);
CREATE INDEX IF NOT EXISTS idx_weather_events_zip_time ON public.weather_events(zip, storm_started_at DESC);
CREATE INDEX IF NOT EXISTS idx_weather_events_workspace_time ON public.weather_events(workspace_id, storm_started_at DESC);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_weather_events_workspace_zip_time 
  ON public.weather_events(workspace_id, zip, storm_started_at DESC);

-- ============================================================================
-- 2. CONTACT_STORM_IMPACTS TABLE
-- ============================================================================
-- Links contacts to storm events (many-to-many relationship)

CREATE TABLE IF NOT EXISTS public.contact_storm_impacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  weather_event_id uuid NOT NULL REFERENCES public.weather_events(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Impact assessment
  storm_risk_score integer NOT NULL DEFAULT 0 CHECK (storm_risk_score >= 0 AND storm_risk_score <= 100),
  storm_risk_level text NOT NULL CHECK (storm_risk_level IN ('low', 'medium', 'high')) DEFAULT 'low',
  
  -- Impact details
  impact_type text[], -- ['recent_storm', 'hail_event', 'wind_event', 'heavy_rain']
  zip_match boolean NOT NULL DEFAULT false,
  neighborhood_match boolean NOT NULL DEFAULT false,
  
  -- Metadata
  detected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  
  -- Unique constraint: one impact record per contact per storm
  UNIQUE(contact_id, weather_event_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_contact_storm_impacts_contact ON public.contact_storm_impacts(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_storm_impacts_weather_event ON public.contact_storm_impacts(weather_event_id);
CREATE INDEX IF NOT EXISTS idx_contact_storm_impacts_workspace ON public.contact_storm_impacts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_contact_storm_impacts_risk_level ON public.contact_storm_impacts(storm_risk_level);
CREATE INDEX IF NOT EXISTS idx_contact_storm_impacts_risk_score ON public.contact_storm_impacts(storm_risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_contact_storm_impacts_detected ON public.contact_storm_impacts(detected_at DESC);

-- ============================================================================
-- 3. ADD STORM RISK FIELDS TO CONTACTS TABLE
-- ============================================================================
-- Add storm_risk_score and storm_risk_level to contacts for quick filtering

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS storm_risk_score integer DEFAULT 0 CHECK (storm_risk_score >= 0 AND storm_risk_score <= 100),
  ADD COLUMN IF NOT EXISTS storm_risk_level text CHECK (storm_risk_level IN ('low', 'medium', 'high')) DEFAULT 'low',
  ADD COLUMN IF NOT EXISTS last_storm_impact_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_storm_type text;

-- Indexes for storm risk queries
CREATE INDEX IF NOT EXISTS idx_contacts_storm_risk_score ON public.contacts(workspace_id, storm_risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_storm_risk_level ON public.contacts(workspace_id, storm_risk_level);
CREATE INDEX IF NOT EXISTS idx_contacts_last_storm_impact ON public.contacts(workspace_id, last_storm_impact_at DESC);

-- ============================================================================
-- 4. STORM_CAMPAIGN_TRIGGERS TABLE
-- ============================================================================
-- Tracks suggested campaigns based on storm events

CREATE TABLE IF NOT EXISTS public.storm_campaign_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  weather_event_id uuid NOT NULL REFERENCES public.weather_events(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  
  -- Trigger details
  status text NOT NULL CHECK (status IN ('suggested', 'reviewed', 'started', 'dismissed')) DEFAULT 'suggested',
  suggested_template_id uuid, -- Reference to template library
  suggested_template_name text,
  
  -- Impact summary
  affected_contacts_count integer NOT NULL DEFAULT 0,
  affected_zips text[],
  storm_summary text,
  
  -- Metadata
  suggested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  started_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_storm_campaign_triggers_workspace ON public.storm_campaign_triggers(workspace_id);
CREATE INDEX IF NOT EXISTS idx_storm_campaign_triggers_weather_event ON public.storm_campaign_triggers(weather_event_id);
CREATE INDEX IF NOT EXISTS idx_storm_campaign_triggers_status ON public.storm_campaign_triggers(status);
CREATE INDEX IF NOT EXISTS idx_storm_campaign_triggers_suggested ON public.storm_campaign_triggers(suggested_at DESC);

-- ============================================================================
-- 5. WORKSPACE_SERVICE_ZIPS TABLE
-- ============================================================================
-- Tracks which ZIP codes each workspace monitors (derived from service areas)

CREATE TABLE IF NOT EXISTS public.workspace_service_zips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  zip text NOT NULL,
  city text,
  state text,
  source text DEFAULT 'service_area', -- 'service_area', 'contact_import', 'manual'
  created_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(workspace_id, zip)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_workspace_service_zips_workspace ON public.workspace_service_zips(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_service_zips_zip ON public.workspace_service_zips(zip);
CREATE INDEX IF NOT EXISTS idx_workspace_service_zips_workspace_zip ON public.workspace_service_zips(workspace_id, zip);

-- ============================================================================
-- 6. FUNCTIONS FOR STORM DETECTION & IMPACT ASSESSMENT
-- ============================================================================

-- Function to calculate storm risk score based on storm event
CREATE OR REPLACE FUNCTION public.calculate_storm_risk_score(
  p_hail_size numeric DEFAULT NULL,
  p_wind_speed numeric DEFAULT NULL,
  p_rain_inches numeric DEFAULT NULL,
  p_severity text DEFAULT 'medium'
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_score integer := 0;
BEGIN
  -- Hail scoring (0-40 points)
  IF p_hail_size IS NOT NULL THEN
    IF p_hail_size >= 0.75 THEN
      v_score := v_score + LEAST(40, GREATEST(20, (p_hail_size - 0.75) * 20));
    ELSIF p_hail_size >= 0.5 THEN
      v_score := v_score + 10;
    END IF;
  END IF;
  
  -- Wind scoring (0-30 points)
  IF p_wind_speed IS NOT NULL THEN
    IF p_wind_speed >= 50 THEN
      v_score := v_score + LEAST(30, GREATEST(15, (p_wind_speed - 50) * 0.6));
    ELSIF p_wind_speed >= 40 THEN
      v_score := v_score + 10;
    END IF;
  END IF;
  
  -- Rain scoring (0-20 points)
  IF p_rain_inches IS NOT NULL THEN
    IF p_rain_inches >= 2.0 THEN
      v_score := v_score + LEAST(20, GREATEST(10, (p_rain_inches - 2.0) * 5));
    ELSIF p_rain_inches >= 1.5 THEN
      v_score := v_score + 5;
    END IF;
  END IF;
  
  -- Severity multiplier (0-10 points)
  CASE p_severity
    WHEN 'extreme' THEN v_score := v_score + 10;
    WHEN 'severe' THEN v_score := v_score + 7;
    WHEN 'high' THEN v_score := v_score + 5;
    WHEN 'medium' THEN v_score := v_score + 3;
    ELSE v_score := v_score + 1;
  END CASE;
  
  -- Cap at 100
  RETURN LEAST(100, v_score);
END;
$$;

-- Function to determine storm risk level from score
CREATE OR REPLACE FUNCTION public.get_storm_risk_level(p_score integer)
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_score >= 70 THEN
    RETURN 'high';
  ELSIF p_score >= 40 THEN
    RETURN 'medium';
  ELSE
    RETURN 'low';
  END IF;
END;
$$;

-- Function to detect and tag storm-affected contacts
CREATE OR REPLACE FUNCTION public.detect_storm_affected_contacts(
  p_weather_event_id uuid,
  p_workspace_id uuid
)
RETURNS TABLE(
  contact_id uuid,
  storm_risk_score integer,
  storm_risk_level text,
  impact_types text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_storm_record RECORD;
  v_contact_record RECORD;
  v_impact_types text[];
  v_score integer;
  v_level text;
BEGIN
  -- Get storm event details
  SELECT * INTO v_storm_record
  FROM public.weather_events
  WHERE id = p_weather_event_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Calculate storm risk score
  v_score := public.calculate_storm_risk_score(
    v_storm_record.hail_size,
    v_storm_record.wind_speed,
    v_storm_record.rain_inches,
    v_storm_record.severity
  );
  v_level := public.get_storm_risk_level(v_score);
  
  -- Build impact types array
  v_impact_types := ARRAY[]::text[];
  IF v_storm_record.hail_size IS NOT NULL AND v_storm_record.hail_size >= 0.75 THEN
    v_impact_types := array_append(v_impact_types, 'hail_event');
  END IF;
  IF v_storm_record.wind_speed IS NOT NULL AND v_storm_record.wind_speed >= 50 THEN
    v_impact_types := array_append(v_impact_types, 'wind_event');
  END IF;
  IF v_storm_record.rain_inches IS NOT NULL AND v_storm_record.rain_inches >= 2.0 THEN
    v_impact_types := array_append(v_impact_types, 'heavy_rain');
  END IF;
  IF array_length(v_impact_types, 1) > 0 THEN
    v_impact_types := array_append(v_impact_types, 'recent_storm');
  END IF;
  
  -- Find all contacts in the affected ZIP
  FOR v_contact_record IN
    SELECT c.id, c.postal_code, c.zip, c.city
    FROM public.contacts c
    WHERE c.workspace_id = p_workspace_id
      AND (
        COALESCE(c.postal_code, c.zip, '') = v_storm_record.zip
        OR c.city = (SELECT city FROM public.workspace_service_zips WHERE zip = v_storm_record.zip LIMIT 1)
      )
  LOOP
    -- Insert or update contact_storm_impacts
    INSERT INTO public.contact_storm_impacts (
      contact_id,
      weather_event_id,
      workspace_id,
      storm_risk_score,
      storm_risk_level,
      impact_type,
      zip_match,
      neighborhood_match
    )
    VALUES (
      v_contact_record.id,
      p_weather_event_id,
      p_workspace_id,
      v_score,
      v_level,
      v_impact_types,
      COALESCE(v_contact_record.postal_code, v_contact_record.zip, '') = v_storm_record.zip,
      false -- neighborhood_match would require additional data
    )
    ON CONFLICT (contact_id, weather_event_id) 
    DO UPDATE SET
      storm_risk_score = EXCLUDED.storm_risk_score,
      storm_risk_level = EXCLUDED.storm_risk_level,
      impact_type = EXCLUDED.impact_type,
      detected_at = now();
    
    -- Update contact tags and storm risk fields
    UPDATE public.contacts
    SET
      tags = CASE 
        WHEN tags IS NULL THEN v_impact_types::text[]
        ELSE array(SELECT DISTINCT unnest(tags || v_impact_types::text[]))
      END,
      storm_risk_score = GREATEST(COALESCE(storm_risk_score, 0), v_score),
      storm_risk_level = CASE 
        WHEN v_level = 'high' THEN 'high'
        WHEN v_level = 'medium' AND COALESCE(storm_risk_level, 'low') != 'high' THEN 'medium'
        ELSE COALESCE(storm_risk_level, 'low')
      END,
      last_storm_impact_at = v_storm_record.storm_started_at,
      last_storm_type = v_storm_record.storm_type,
      updated_at = now()
    WHERE id = v_contact_record.id;
    
    -- Return the contact impact
    RETURN QUERY SELECT
      v_contact_record.id,
      v_score,
      v_level,
      v_impact_types;
  END LOOP;
END;
$$;

-- ============================================================================
-- 7. RLS POLICIES
-- ============================================================================

ALTER TABLE public.weather_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_storm_impacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storm_campaign_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_service_zips ENABLE ROW LEVEL SECURITY;

-- Weather events: workspace members can read their workspace's events
CREATE POLICY "weather_events_select_workspace" ON public.weather_events
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Contact storm impacts: workspace members can read their workspace's impacts
CREATE POLICY "contact_storm_impacts_select_workspace" ON public.contact_storm_impacts
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Storm campaign triggers: workspace members can read/manage their workspace's triggers
CREATE POLICY "storm_campaign_triggers_select_workspace" ON public.storm_campaign_triggers
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "storm_campaign_triggers_update_workspace" ON public.storm_campaign_triggers
  FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Workspace service zips: workspace members can read/manage their workspace's zips
CREATE POLICY "workspace_service_zips_select_workspace" ON public.workspace_service_zips
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "workspace_service_zips_insert_workspace" ON public.workspace_service_zips
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- 8. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.weather_events IS 'Stores storm events detected at ZIP code level for weather monitoring';
COMMENT ON TABLE public.contact_storm_impacts IS 'Links contacts to storm events and tracks impact assessment';
COMMENT ON TABLE public.storm_campaign_triggers IS 'Tracks suggested campaigns based on storm events';
COMMENT ON TABLE public.workspace_service_zips IS 'Tracks which ZIP codes each workspace monitors for weather';
COMMENT ON FUNCTION public.calculate_storm_risk_score IS 'Calculates storm risk score (0-100) based on storm measurements';
COMMENT ON FUNCTION public.get_storm_risk_level IS 'Determines storm risk level (low/medium/high) from score';
COMMENT ON FUNCTION public.detect_storm_affected_contacts IS 'Detects and tags contacts affected by a storm event';





















































