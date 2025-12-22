-- ============================================================
-- Block 255000 — SmartSend AI Storm Response Engine v1
-- Storm Detection, Automatic Outreach, Damage Probability Mapping, 
-- Storm-Triggered Lead Generation, Priority Routing
-- ============================================================
-- 
-- This block turns SmartSend into a lead-generating monster during storms 
-- — the EXACT moment homeowners NEED roofers the most.
-- 
-- Right now, roofing companies LOSE storm money because:
-- - they find out about storms too late
-- - they don't know WHICH neighborhoods were hit
-- - they don't know WHICH homes most likely have damage
-- - they don't message past customers
-- - they don't automatically contact prospects in storm zones
-- - they don't deploy crews fast enough
-- - they don't prioritize high-probability leads
-- - they don't have scripts ready
-- - they don't automate inspections
-- 
-- SmartSend fixes ALL OF IT.
-- ============================================================

-- ============================================================================
-- PART 1 — STORM_EVENTS TABLE
-- ============================================================================
-- Tracks detected storm events with geographic impact areas

CREATE TABLE IF NOT EXISTS public.storm_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  
  -- Storm identification
  storm_type text NOT NULL CHECK (storm_type IN ('hail', 'wind', 'tornado', 'heavy_rain', 'snow', 'ice')),
  severity text NOT NULL CHECK (severity IN ('light', 'moderate', 'severe', 'extreme')),
  
  -- Detection
  detected_at timestamptz NOT NULL DEFAULT now(),
  detected_by text DEFAULT 'auto', -- 'auto', 'manual', 'api'
  
  -- Geographic impact area (GeoJSON polygon)
  geo jsonb NOT NULL, -- GeoJSON polygon of affected area
  
  -- Storm metrics
  max_wind_speed_mph numeric(5,2),
  hail_size_inches numeric(4,2),
  rainfall_inches numeric(5,2),
  affected_radius_miles numeric(6,2),
  
  -- Affected areas (denormalized for quick queries)
  affected_zips text[],
  affected_cities text[],
  affected_states text[],
  
  -- Center point
  center_latitude numeric(10,8),
  center_longitude numeric(11,8),
  
  -- Status
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'passed', 'dissipated', 'false_alarm')),
  
  -- Metadata
  weather_api_data jsonb DEFAULT '{}'::jsonb,
  notes text,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for storm_events
CREATE INDEX IF NOT EXISTS idx_storm_events_team ON public.storm_events(team_id);
CREATE INDEX IF NOT EXISTS idx_storm_events_detected_at ON public.storm_events(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_storm_events_status ON public.storm_events(status, detected_at DESC) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_storm_events_type_severity ON public.storm_events(storm_type, severity);
CREATE INDEX IF NOT EXISTS idx_storm_events_zips ON public.storm_events USING GIN(affected_zips);
CREATE INDEX IF NOT EXISTS idx_storm_events_geo ON public.storm_events USING GIST((geo::geometry));

-- ============================================================================
-- PART 2 — STORM_DAMAGE_PREDICTIONS TABLE
-- ============================================================================
-- AI-powered damage probability predictions for each customer/property

CREATE TABLE IF NOT EXISTS public.storm_damage_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storm_id uuid NOT NULL REFERENCES public.storm_events(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  
  -- Property/Customer reference
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  lead_id uuid, -- For non-customer prospects
  property_address text,
  property_latitude numeric(10,8),
  property_longitude numeric(11,8),
  
  -- Damage probability (0-1 scale)
  probability numeric(4,3) NOT NULL CHECK (probability >= 0 AND probability <= 1),
  
  -- Predicted damage type
  predicted_damage text[], -- e.g., ['shingles', 'gutters', 'siding']
  
  -- Risk factors analyzed
  risk_factors jsonb DEFAULT '{}'::jsonb, -- {
    --   "hail_size": 1.25,
    --   "wind_speed": 65,
    --   "roof_age": 15,
    --   "roof_type": "asphalt",
    --   "roof_pitch": 6,
    --   "home_value": 350000,
    --   "siding_exposure": "high",
    --   "gutter_exposure": "high"
    -- }
  
  -- Zone classification
  zone text NOT NULL CHECK (zone IN ('red', 'yellow', 'green')), -- Red = 70-100%, Yellow = 40-69%, Green = <40%
  
  -- Status
  inspection_scheduled boolean DEFAULT false,
  inspection_scheduled_at timestamptz,
  inspection_completed boolean DEFAULT false,
  inspection_completed_at timestamptz,
  actual_damage_found boolean,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for storm_damage_predictions
CREATE INDEX IF NOT EXISTS idx_storm_damage_predictions_storm ON public.storm_damage_predictions(storm_id);
CREATE INDEX IF NOT EXISTS idx_storm_damage_predictions_team ON public.storm_damage_predictions(team_id);
CREATE INDEX IF NOT EXISTS idx_storm_damage_predictions_customer ON public.storm_damage_predictions(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_storm_damage_predictions_lead ON public.storm_damage_predictions(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_storm_damage_predictions_probability ON public.storm_damage_predictions(probability DESC);
CREATE INDEX IF NOT EXISTS idx_storm_damage_predictions_zone ON public.storm_damage_predictions(zone, probability DESC);
CREATE INDEX IF NOT EXISTS idx_storm_damage_predictions_location ON public.storm_damage_predictions(property_latitude, property_longitude) WHERE property_latitude IS NOT NULL;

-- ============================================================================
-- PART 3 — STORM_LEADS TABLE
-- ============================================================================
-- Leads generated from storm events (outbound, inbound, past customers)

CREATE TABLE IF NOT EXISTS public.storm_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storm_id uuid NOT NULL REFERENCES public.storm_events(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  
  -- Lead information
  homeowner_name text,
  address text NOT NULL,
  city text,
  state text,
  zip_code text,
  phone text,
  email text,
  
  -- Source classification
  source text NOT NULL CHECK (source IN ('outbound', 'inbound', 'past_customer', 'past_prospect', 'geo_targeted')),
  
  -- Link to existing records
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  lead_id uuid, -- Links to main leads table if converted
  damage_prediction_id uuid REFERENCES public.storm_damage_predictions(id) ON DELETE SET NULL,
  
  -- Status tracking
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'scheduled', 'inspected', 'won', 'lost')),
  
  -- Outreach tracking
  outreach_sent boolean DEFAULT false,
  outreach_sent_at timestamptz,
  outreach_method text, -- 'sms', 'email', 'call', 'all'
  response_received boolean DEFAULT false,
  response_received_at timestamptz,
  
  -- Inspection tracking
  inspection_requested boolean DEFAULT false,
  inspection_scheduled boolean DEFAULT false,
  inspection_scheduled_at timestamptz,
  inspection_completed boolean DEFAULT false,
  inspection_completed_at timestamptz,
  
  -- Job conversion
  job_created boolean DEFAULT false,
  job_id uuid, -- Links to roofing_jobs or jobs table
  estimated_value numeric(12,2),
  
  -- Metadata
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for storm_leads
CREATE INDEX IF NOT EXISTS idx_storm_leads_storm ON public.storm_leads(storm_id);
CREATE INDEX IF NOT EXISTS idx_storm_leads_team ON public.storm_leads(team_id);
CREATE INDEX IF NOT EXISTS idx_storm_leads_status ON public.storm_leads(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_storm_leads_source ON public.storm_leads(source);
CREATE INDEX IF NOT EXISTS idx_storm_leads_customer ON public.storm_leads(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_storm_leads_zip ON public.storm_leads(zip_code) WHERE zip_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_storm_leads_phone ON public.storm_leads(phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_storm_leads_email ON public.storm_leads(email) WHERE email IS NOT NULL;

-- ============================================================================
-- PART 4 — CREW_ROUTES TABLE
-- ============================================================================
-- Priority routing for field crews during storm response

CREATE TABLE IF NOT EXISTS public.crew_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storm_id uuid NOT NULL REFERENCES public.storm_events(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  
  -- Crew assignment
  crew_name text NOT NULL, -- e.g., "Crew A", "Crew C"
  crew_id uuid, -- Links to crew/team member if available
  assigned_to_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Route information
  route_name text NOT NULL, -- e.g., "North Boise", "Meridian"
  route_priority integer NOT NULL DEFAULT 1, -- Lower number = higher priority
  
  -- Geographic area
  target_area text, -- City/neighborhood name
  target_zips text[],
  route_polygon jsonb, -- GeoJSON polygon of route area
  
  -- Route metrics
  total_homes integer NOT NULL DEFAULT 0,
  high_risk_homes integer NOT NULL DEFAULT 0, -- Red zone homes
  medium_risk_homes integer NOT NULL DEFAULT 0, -- Yellow zone homes
  estimated_drive_time_minutes integer,
  estimated_inspection_time_hours numeric(4,2),
  
  -- Assigned inspections
  assigned_inspection_ids uuid[], -- Array of storm_damage_predictions IDs
  assigned_lead_ids uuid[], -- Array of storm_leads IDs
  
  -- Status
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'in_progress', 'completed', 'cancelled')),
  assigned_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  
  -- Route optimization
  optimized_route jsonb, -- Optimized waypoints/sequence
  fastest_route_data jsonb, -- From routing API (Google Maps, etc.)
  
  -- Results
  inspections_completed integer DEFAULT 0,
  jobs_created integer DEFAULT 0,
  total_estimated_value numeric(12,2) DEFAULT 0,
  
  -- Metadata
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for crew_routes
CREATE INDEX IF NOT EXISTS idx_crew_routes_storm ON public.crew_routes(storm_id);
CREATE INDEX IF NOT EXISTS idx_crew_routes_team ON public.crew_routes(team_id);
CREATE INDEX IF NOT EXISTS idx_crew_routes_status ON public.crew_routes(status, route_priority);
CREATE INDEX IF NOT EXISTS idx_crew_routes_crew ON public.crew_routes(crew_id) WHERE crew_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crew_routes_assigned_user ON public.crew_routes(assigned_to_user_id) WHERE assigned_to_user_id IS NOT NULL;

-- ============================================================================
-- PART 5 — STORM_OUTREACH_LOGS TABLE
-- ============================================================================
-- Tracks all automated outreach sent during storms

CREATE TABLE IF NOT EXISTS public.storm_outreach_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storm_id uuid NOT NULL REFERENCES public.storm_events(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  
  -- Recipient
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  storm_lead_id uuid REFERENCES public.storm_leads(id) ON DELETE SET NULL,
  recipient_name text,
  recipient_phone text,
  recipient_email text,
  
  -- Outreach details
  outreach_type text NOT NULL CHECK (outreach_type IN ('past_customer_alert', 'past_prospect_revival', 'new_storm_lead', 'inspection_reminder')),
  method text NOT NULL CHECK (method IN ('sms', 'email', 'call', 'all')),
  
  -- Message content
  message_template text,
  message_sent text,
  subject_line text, -- For emails
  
  -- Status
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'bounced', 'replied')),
  sent_at timestamptz,
  delivered_at timestamptz,
  replied_at timestamptz,
  
  -- Response tracking
  response_received boolean DEFAULT false,
  response_text text,
  action_taken text, -- 'scheduled', 'declined', 'interested', 'no_response'
  
  -- Campaign tracking
  campaign_id uuid, -- Links to campaigns table if used
  message_id uuid, -- Links to sent messages/emails
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for storm_outreach_logs
CREATE INDEX IF NOT EXISTS idx_storm_outreach_logs_storm ON public.storm_outreach_logs(storm_id);
CREATE INDEX IF NOT EXISTS idx_storm_outreach_logs_team ON public.storm_outreach_logs(team_id);
CREATE INDEX IF NOT EXISTS idx_storm_outreach_logs_customer ON public.storm_outreach_logs(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_storm_outreach_logs_lead ON public.storm_outreach_logs(storm_lead_id) WHERE storm_lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_storm_outreach_logs_status ON public.storm_outreach_logs(status, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_storm_outreach_logs_type ON public.storm_outreach_logs(outreach_type);

-- ============================================================================
-- PART 6 — STORM_DASHBOARD_STATS TABLE (Materialized View Helper)
-- ============================================================================
-- Pre-computed stats for real-time dashboard performance

CREATE TABLE IF NOT EXISTS public.storm_dashboard_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storm_id uuid NOT NULL REFERENCES public.storm_events(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  
  -- Key metrics
  homes_impacted integer DEFAULT 0,
  past_customers_count integer DEFAULT 0,
  past_prospects_count integer DEFAULT 0,
  new_storm_leads_count integer DEFAULT 0,
  predicted_damage_probability_avg numeric(4,3),
  
  -- Outreach metrics
  outreach_sent_count integer DEFAULT 0,
  outreach_response_count integer DEFAULT 0,
  outreach_response_rate numeric(5,2), -- Percentage
  
  -- Inspection metrics
  inspections_scheduled integer DEFAULT 0,
  inspections_completed integer DEFAULT 0,
  
  -- Conversion metrics
  jobs_sold integer DEFAULT 0,
  jobs_estimated_value_total numeric(12,2) DEFAULT 0,
  
  -- Zone breakdown
  red_zone_homes integer DEFAULT 0,
  yellow_zone_homes integer DEFAULT 0,
  green_zone_homes integer DEFAULT 0,
  
  -- Crew metrics
  crews_deployed integer DEFAULT 0,
  routes_assigned integer DEFAULT 0,
  routes_completed integer DEFAULT 0,
  
  -- Timestamps
  computed_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(storm_id, team_id)
);

-- Indexes for storm_dashboard_stats
CREATE INDEX IF NOT EXISTS idx_storm_dashboard_stats_storm ON public.storm_dashboard_stats(storm_id);
CREATE INDEX IF NOT EXISTS idx_storm_dashboard_stats_team ON public.storm_dashboard_stats(team_id);
CREATE INDEX IF NOT EXISTS idx_storm_dashboard_stats_computed_at ON public.storm_dashboard_stats(computed_at DESC);

-- ============================================================================
-- PART 7 — TRIGGERS & FUNCTIONS
-- ============================================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_storm_tables_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all storm tables
CREATE TRIGGER trg_storm_events_updated_at
  BEFORE UPDATE ON public.storm_events
  FOR EACH ROW
  EXECUTE FUNCTION update_storm_tables_updated_at();

CREATE TRIGGER trg_storm_damage_predictions_updated_at
  BEFORE UPDATE ON public.storm_damage_predictions
  FOR EACH ROW
  EXECUTE FUNCTION update_storm_tables_updated_at();

CREATE TRIGGER trg_storm_leads_updated_at
  BEFORE UPDATE ON public.storm_leads
  FOR EACH ROW
  EXECUTE FUNCTION update_storm_tables_updated_at();

CREATE TRIGGER trg_crew_routes_updated_at
  BEFORE UPDATE ON public.crew_routes
  FOR EACH ROW
  EXECUTE FUNCTION update_storm_tables_updated_at();

CREATE TRIGGER trg_storm_outreach_logs_updated_at
  BEFORE UPDATE ON public.storm_outreach_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_storm_tables_updated_at();

CREATE TRIGGER trg_storm_dashboard_stats_updated_at
  BEFORE UPDATE ON public.storm_dashboard_stats
  FOR EACH ROW
  EXECUTE FUNCTION update_storm_tables_updated_at();

-- Function to compute storm dashboard stats
CREATE OR REPLACE FUNCTION compute_storm_dashboard_stats(
  p_storm_id uuid,
  p_team_id uuid
)
RETURNS void AS $$
DECLARE
  v_homes_impacted integer;
  v_past_customers integer;
  v_past_prospects integer;
  v_new_leads integer;
  v_avg_probability numeric;
  v_outreach_sent integer;
  v_outreach_responses integer;
  v_inspections_scheduled integer;
  v_inspections_completed integer;
  v_jobs_sold integer;
  v_jobs_value_total numeric;
  v_red_zone integer;
  v_yellow_zone integer;
  v_green_zone integer;
  v_crews_deployed integer;
  v_routes_assigned integer;
  v_routes_completed integer;
BEGIN
  -- Count homes impacted (from damage predictions)
  SELECT COUNT(*) INTO v_homes_impacted
  FROM public.storm_damage_predictions
  WHERE storm_id = p_storm_id AND team_id = p_team_id;
  
  -- Count past customers
  SELECT COUNT(*) INTO v_past_customers
  FROM public.storm_leads
  WHERE storm_id = p_storm_id AND team_id = p_team_id AND source = 'past_customer';
  
  -- Count past prospects
  SELECT COUNT(*) INTO v_past_prospects
  FROM public.storm_leads
  WHERE storm_id = p_storm_id AND team_id = p_team_id AND source = 'past_prospect';
  
  -- Count new storm leads
  SELECT COUNT(*) INTO v_new_leads
  FROM public.storm_leads
  WHERE storm_id = p_storm_id AND team_id = p_team_id AND source IN ('outbound', 'geo_targeted');
  
  -- Average damage probability
  SELECT COALESCE(AVG(probability), 0) INTO v_avg_probability
  FROM public.storm_damage_predictions
  WHERE storm_id = p_storm_id AND team_id = p_team_id;
  
  -- Outreach metrics
  SELECT COUNT(*) INTO v_outreach_sent
  FROM public.storm_outreach_logs
  WHERE storm_id = p_storm_id AND team_id = p_team_id AND status = 'sent';
  
  SELECT COUNT(*) INTO v_outreach_responses
  FROM public.storm_outreach_logs
  WHERE storm_id = p_storm_id AND team_id = p_team_id AND response_received = true;
  
  -- Inspection metrics
  SELECT COUNT(*) INTO v_inspections_scheduled
  FROM public.storm_damage_predictions
  WHERE storm_id = p_storm_id AND team_id = p_team_id AND inspection_scheduled = true;
  
  SELECT COUNT(*) INTO v_inspections_completed
  FROM public.storm_damage_predictions
  WHERE storm_id = p_storm_id AND team_id = p_team_id AND inspection_completed = true;
  
  -- Job conversion
  SELECT COUNT(*), COALESCE(SUM(estimated_value), 0) INTO v_jobs_sold, v_jobs_value_total
  FROM public.storm_leads
  WHERE storm_id = p_storm_id AND team_id = p_team_id AND job_created = true;
  
  -- Zone breakdown
  SELECT COUNT(*) INTO v_red_zone
  FROM public.storm_damage_predictions
  WHERE storm_id = p_storm_id AND team_id = p_team_id AND zone = 'red';
  
  SELECT COUNT(*) INTO v_yellow_zone
  FROM public.storm_damage_predictions
  WHERE storm_id = p_storm_id AND team_id = p_team_id AND zone = 'yellow';
  
  SELECT COUNT(*) INTO v_green_zone
  FROM public.storm_damage_predictions
  WHERE storm_id = p_storm_id AND team_id = p_team_id AND zone = 'green';
  
  -- Crew metrics
  SELECT COUNT(DISTINCT crew_id) INTO v_crews_deployed
  FROM public.crew_routes
  WHERE storm_id = p_storm_id AND team_id = p_team_id AND crew_id IS NOT NULL;
  
  SELECT COUNT(*) INTO v_routes_assigned
  FROM public.crew_routes
  WHERE storm_id = p_storm_id AND team_id = p_team_id;
  
  SELECT COUNT(*) INTO v_routes_completed
  FROM public.crew_routes
  WHERE storm_id = p_storm_id AND team_id = p_team_id AND status = 'completed';
  
  -- Upsert stats
  INSERT INTO public.storm_dashboard_stats (
    storm_id, team_id,
    homes_impacted, past_customers_count, past_prospects_count, new_storm_leads_count,
    predicted_damage_probability_avg,
    outreach_sent_count, outreach_response_count, outreach_response_rate,
    inspections_scheduled, inspections_completed,
    jobs_sold, jobs_estimated_value_total,
    red_zone_homes, yellow_zone_homes, green_zone_homes,
    crews_deployed, routes_assigned, routes_completed,
    computed_at, updated_at
  ) VALUES (
    p_storm_id, p_team_id,
    v_homes_impacted, v_past_customers, v_past_prospects, v_new_leads,
    v_avg_probability,
    v_outreach_sent, v_outreach_responses,
    CASE WHEN v_outreach_sent > 0 THEN (v_outreach_responses::numeric / v_outreach_sent::numeric * 100) ELSE 0 END,
    v_inspections_scheduled, v_inspections_completed,
    v_jobs_sold, v_jobs_value_total,
    v_red_zone, v_yellow_zone, v_green_zone,
    v_crews_deployed, v_routes_assigned, v_routes_completed,
    now(), now()
  )
  ON CONFLICT (storm_id, team_id) DO UPDATE SET
    homes_impacted = EXCLUDED.homes_impacted,
    past_customers_count = EXCLUDED.past_customers_count,
    past_prospects_count = EXCLUDED.past_prospects_count,
    new_storm_leads_count = EXCLUDED.new_storm_leads_count,
    predicted_damage_probability_avg = EXCLUDED.predicted_damage_probability_avg,
    outreach_sent_count = EXCLUDED.outreach_sent_count,
    outreach_response_count = EXCLUDED.outreach_response_count,
    outreach_response_rate = EXCLUDED.outreach_response_rate,
    inspections_scheduled = EXCLUDED.inspections_scheduled,
    inspections_completed = EXCLUDED.inspections_completed,
    jobs_sold = EXCLUDED.jobs_sold,
    jobs_estimated_value_total = EXCLUDED.jobs_estimated_value_total,
    red_zone_homes = EXCLUDED.red_zone_homes,
    yellow_zone_homes = EXCLUDED.yellow_zone_homes,
    green_zone_homes = EXCLUDED.green_zone_homes,
    crews_deployed = EXCLUDED.crews_deployed,
    routes_assigned = EXCLUDED.routes_assigned,
    routes_completed = EXCLUDED.routes_completed,
    computed_at = now(),
    updated_at = now();
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 8 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.storm_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storm_damage_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storm_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storm_outreach_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storm_dashboard_stats ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Team-based access
-- Users can only access storm data for teams they belong to

-- Helper function to check team membership
CREATE OR REPLACE FUNCTION is_team_member(p_team_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = p_team_id AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Storm events policies
CREATE POLICY "storm_events_team_access" ON public.storm_events
  FOR ALL
  USING (is_team_member(team_id))
  WITH CHECK (is_team_member(team_id));

-- Storm damage predictions policies
CREATE POLICY "storm_damage_predictions_team_access" ON public.storm_damage_predictions
  FOR ALL
  USING (is_team_member(team_id))
  WITH CHECK (is_team_member(team_id));

-- Storm leads policies
CREATE POLICY "storm_leads_team_access" ON public.storm_leads
  FOR ALL
  USING (is_team_member(team_id))
  WITH CHECK (is_team_member(team_id));

-- Crew routes policies
CREATE POLICY "crew_routes_team_access" ON public.crew_routes
  FOR ALL
  USING (is_team_member(team_id))
  WITH CHECK (is_team_member(team_id));

-- Storm outreach logs policies
CREATE POLICY "storm_outreach_logs_team_access" ON public.storm_outreach_logs
  FOR ALL
  USING (is_team_member(team_id))
  WITH CHECK (is_team_member(team_id));

-- Storm dashboard stats policies
CREATE POLICY "storm_dashboard_stats_team_access" ON public.storm_dashboard_stats
  FOR ALL
  USING (is_team_member(team_id))
  WITH CHECK (is_team_member(team_id));

-- ============================================================================
-- PART 9 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.storm_events IS 'Tracks detected storm events with geographic impact areas';
COMMENT ON TABLE public.storm_damage_predictions IS 'AI-powered damage probability predictions for properties';
COMMENT ON TABLE public.storm_leads IS 'Leads generated from storm events (outbound, inbound, past customers)';
COMMENT ON TABLE public.crew_routes IS 'Priority routing for field crews during storm response';
COMMENT ON TABLE public.storm_outreach_logs IS 'Tracks all automated outreach sent during storms';
COMMENT ON TABLE public.storm_dashboard_stats IS 'Pre-computed stats for real-time storm dashboard performance';

COMMENT ON FUNCTION compute_storm_dashboard_stats IS 'Computes and updates dashboard statistics for a storm event';






















