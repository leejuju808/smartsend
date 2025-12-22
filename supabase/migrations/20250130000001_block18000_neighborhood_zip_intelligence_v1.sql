-- =========================================================
-- Block 18000 — SmartSend Neighborhood & ZIP Intelligence v1
-- (Local Roofing Targeting Engine: ZIP Ranking, Neighborhood Mapping, 
--  Home Value Signals, Roof Age Estimates & Storm Opportunity Zones)
-- =========================================================

-- ============================================================================
-- 1. GEO_ZIP_DATA TABLE
-- ============================================================================
-- Stores comprehensive ZIP code intelligence for each workspace

CREATE TABLE IF NOT EXISTS public.geo_zip_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  zip text NOT NULL,
  city text,
  state text,
  
  -- Storm Intelligence
  storm_severity_score integer DEFAULT 0 CHECK (storm_severity_score >= 0 AND storm_severity_score <= 100),
  last_storm_date timestamptz,
  storm_frequency_30d integer DEFAULT 0,
  storm_frequency_90d integer DEFAULT 0,
  
  -- Home Value Intelligence
  avg_home_value numeric(12,2),
  median_home_value numeric(12,2),
  high_value_home_pct numeric(5,2), -- % of homes > $500K
  
  -- Roof Age Intelligence
  avg_roof_age numeric(5,2), -- years
  median_roof_age numeric(5,2),
  old_roof_pct numeric(5,2), -- % of roofs > 15 years
  
  -- Replacement & Repair Intelligence
  historical_replacement_rate numeric(5,2), -- % per year
  historical_repair_rate numeric(5,2), -- % per year
  
  -- Income & Demographics
  avg_income numeric(10,2),
  median_income numeric(10,2),
  homeownership_density numeric(5,2), -- % owner-occupied
  
  -- Insurance Intelligence
  insurance_claim_rate numeric(5,2), -- % of homes with claims
  insurance_rich_score integer DEFAULT 0 CHECK (insurance_rich_score >= 0 AND insurance_rich_score <= 100),
  
  -- Performance Metrics (from campaigns)
  total_leads integer DEFAULT 0,
  total_sent integer DEFAULT 0,
  total_opens integer DEFAULT 0,
  total_clicks integer DEFAULT 0,
  total_replies integer DEFAULT 0,
  total_bookings integer DEFAULT 0,
  total_revenue numeric(12,2) DEFAULT 0,
  
  open_rate_pct numeric(5,2) DEFAULT 0,
  reply_rate_pct numeric(5,2) DEFAULT 0,
  booking_rate_pct numeric(5,2) DEFAULT 0,
  
  -- ZIP Ranking Score (composite)
  zip_rank_score numeric(8,2) DEFAULT 0,
  zip_rank integer, -- 1 = best, NULL = unranked
  
  -- Metadata
  last_updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(workspace_id, zip)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_geo_zip_data_workspace ON public.geo_zip_data(workspace_id);
CREATE INDEX IF NOT EXISTS idx_geo_zip_data_zip ON public.geo_zip_data(zip);
CREATE INDEX IF NOT EXISTS idx_geo_zip_data_rank_score ON public.geo_zip_data(workspace_id, zip_rank_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_geo_zip_data_rank ON public.geo_zip_data(workspace_id, zip_rank);
CREATE INDEX IF NOT EXISTS idx_geo_zip_data_storm_severity ON public.geo_zip_data(workspace_id, storm_severity_score DESC);
CREATE INDEX IF NOT EXISTS idx_geo_zip_data_home_value ON public.geo_zip_data(workspace_id, avg_home_value DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_geo_zip_data_roof_age ON public.geo_zip_data(workspace_id, avg_roof_age DESC NULLS LAST);

-- ============================================================================
-- 2. GEO_NEIGHBORHOOD_DATA TABLE
-- ============================================================================
-- Stores neighborhood-level intelligence

CREATE TABLE IF NOT EXISTS public.geo_neighborhood_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  neighborhood_name text NOT NULL,
  zip text NOT NULL,
  city text,
  state text,
  
  -- Roof Intelligence
  avg_roof_age numeric(5,2),
  median_roof_age numeric(5,2),
  old_roof_pct numeric(5,2),
  
  -- Home Value Intelligence
  avg_home_value numeric(12,2),
  median_home_value numeric(12,2),
  high_value_home_pct numeric(5,2),
  
  -- Storm Intelligence
  storm_risk text CHECK (storm_risk IN ('low', 'medium', 'high')) DEFAULT 'low',
  storm_risk_score integer DEFAULT 0 CHECK (storm_risk_score >= 0 AND storm_risk_score <= 100),
  last_storm_date timestamptz,
  
  -- Insurance Intelligence
  insurance_probability numeric(5,2), -- % likelihood of insurance coverage
  insurance_rich_score integer DEFAULT 0 CHECK (insurance_rich_score >= 0 AND insurance_rich_score <= 100),
  
  -- Replacement & Repair Probabilities
  replacement_probability numeric(5,2), -- % likelihood of replacement need
  repair_probability numeric(5,2), -- % likelihood of repair need
  
  -- Performance Metrics
  total_leads integer DEFAULT 0,
  total_replies integer DEFAULT 0,
  total_bookings integer DEFAULT 0,
  reply_rate_pct numeric(5,2) DEFAULT 0,
  booking_rate_pct numeric(5,2) DEFAULT 0,
  
  -- Neighborhood Ranking
  neighborhood_score numeric(8,2) DEFAULT 0,
  neighborhood_rank integer,
  
  -- Metadata
  last_updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(workspace_id, neighborhood_name, zip)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_geo_neighborhood_data_workspace ON public.geo_neighborhood_data(workspace_id);
CREATE INDEX IF NOT EXISTS idx_geo_neighborhood_data_zip ON public.geo_neighborhood_data(zip);
CREATE INDEX IF NOT EXISTS idx_geo_neighborhood_data_neighborhood ON public.geo_neighborhood_data(workspace_id, neighborhood_name);
CREATE INDEX IF NOT EXISTS idx_geo_neighborhood_data_score ON public.geo_neighborhood_data(workspace_id, neighborhood_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_geo_neighborhood_data_rank ON public.geo_neighborhood_data(workspace_id, neighborhood_rank);

-- ============================================================================
-- 3. GEO_STORM_ZONES TABLE
-- ============================================================================
-- Color-coded storm opportunity zones (Red, Orange, Yellow, Green)

CREATE TABLE IF NOT EXISTS public.geo_storm_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  zip text NOT NULL,
  zone_color text NOT NULL CHECK (zone_color IN ('red', 'orange', 'yellow', 'green')),
  
  -- Storm Event Reference
  weather_event_id uuid REFERENCES public.weather_events(id) ON DELETE SET NULL,
  
  -- Zone Criteria
  hail_size numeric(4,2), -- inches
  wind_speed numeric(5,2), -- mph
  claim_probability numeric(5,2), -- % likelihood of insurance claim
  
  -- Zone Summary
  affected_homes_estimate integer,
  priority_level integer DEFAULT 0 CHECK (priority_level >= 0 AND priority_level <= 100),
  
  -- Zone Timing
  storm_started_at timestamptz NOT NULL,
  zone_created_at timestamptz NOT NULL DEFAULT now(),
  zone_expires_at timestamptz, -- When zone should be re-evaluated
  
  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(workspace_id, zip, weather_event_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_geo_storm_zones_workspace ON public.geo_storm_zones(workspace_id);
CREATE INDEX IF NOT EXISTS idx_geo_storm_zones_zip ON public.geo_storm_zones(zip);
CREATE INDEX IF NOT EXISTS idx_geo_storm_zones_color ON public.geo_storm_zones(workspace_id, zone_color);
CREATE INDEX IF NOT EXISTS idx_geo_storm_zones_priority ON public.geo_storm_zones(workspace_id, priority_level DESC);
CREATE INDEX IF NOT EXISTS idx_geo_storm_zones_storm_date ON public.geo_storm_zones(workspace_id, storm_started_at DESC);

-- ============================================================================
-- 4. GEO_CLUSTERS TABLE
-- ============================================================================
-- Geographic lead clusters (storm clusters, insurance clusters, etc.)

CREATE TABLE IF NOT EXISTS public.geo_clusters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  cluster_type text NOT NULL CHECK (cluster_type IN ('storm', 'insurance', 'active_leads', 'high_value', 'recent_replies', 'old_roofs')),
  
  -- Cluster Location
  zip text,
  neighborhood_name text,
  city text,
  state text,
  
  -- Cluster Bounds (for mapping)
  center_lat numeric(10,7),
  center_lon numeric(10,7),
  radius_miles numeric(5,2),
  
  -- Cluster Summary
  lead_count integer DEFAULT 0,
  contact_count integer DEFAULT 0,
  cluster_score numeric(8,2) DEFAULT 0,
  cluster_priority integer DEFAULT 0 CHECK (cluster_priority >= 0 AND cluster_priority <= 100),
  
  -- Cluster Metadata
  cluster_tags text[], -- Additional tags for filtering
  cluster_notes text,
  
  -- Cluster Timing
  cluster_started_at timestamptz,
  cluster_detected_at timestamptz NOT NULL DEFAULT now(),
  cluster_expires_at timestamptz,
  
  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_geo_clusters_workspace ON public.geo_clusters(workspace_id);
CREATE INDEX IF NOT EXISTS idx_geo_clusters_type ON public.geo_clusters(workspace_id, cluster_type);
CREATE INDEX IF NOT EXISTS idx_geo_clusters_zip ON public.geo_clusters(zip);
CREATE INDEX IF NOT EXISTS idx_geo_clusters_priority ON public.geo_clusters(workspace_id, cluster_priority DESC);
CREATE INDEX IF NOT EXISTS idx_geo_clusters_score ON public.geo_clusters(workspace_id, cluster_score DESC);

-- ============================================================================
-- 5. GEO_SCORES TABLE
-- ============================================================================
-- Performance scoring by ZIP and neighborhood

CREATE TABLE IF NOT EXISTS public.geo_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Geographic Scope
  zip text,
  neighborhood_name text,
  
  -- Scoring Period
  score_period_start timestamptz NOT NULL,
  score_period_end timestamptz NOT NULL,
  
  -- Performance Metrics
  total_sent integer DEFAULT 0,
  total_opens integer DEFAULT 0,
  total_clicks integer DEFAULT 0,
  total_replies integer DEFAULT 0,
  total_bookings integer DEFAULT 0,
  total_revenue numeric(12,2) DEFAULT 0,
  
  -- Rates
  open_rate_pct numeric(5,2) DEFAULT 0,
  click_rate_pct numeric(5,2) DEFAULT 0,
  reply_rate_pct numeric(5,2) DEFAULT 0,
  booking_rate_pct numeric(5,2) DEFAULT 0,
  revenue_per_lead numeric(10,2) DEFAULT 0,
  
  -- Insurance Metrics
  insurance_rate_pct numeric(5,2) DEFAULT 0, -- % of leads with insurance interest
  
  -- Composite Score
  performance_score numeric(8,2) DEFAULT 0,
  
  -- Ranking
  rank_in_period integer,
  
  -- Metadata
  calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  
  -- Ensure one score per period per location
  UNIQUE(workspace_id, zip, neighborhood_name, score_period_start)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_geo_scores_workspace ON public.geo_scores(workspace_id);
CREATE INDEX IF NOT EXISTS idx_geo_scores_zip ON public.geo_scores(zip);
CREATE INDEX IF NOT EXISTS idx_geo_scores_period ON public.geo_scores(workspace_id, score_period_start DESC);
CREATE INDEX IF NOT EXISTS idx_geo_scores_performance ON public.geo_scores(workspace_id, performance_score DESC);

-- ============================================================================
-- 6. ADD GEO INTELLIGENCE COLUMNS TO CONTACTS TABLE
-- ============================================================================
-- Enrich contacts with home value and roof age estimates

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS home_value_estimate numeric(12,2),
  ADD COLUMN IF NOT EXISTS property_type text CHECK (property_type IN ('single_family', 'multi_family', 'commercial', 'condo', 'townhouse', 'unknown')),
  ADD COLUMN IF NOT EXISTS structure_size_sqft integer,
  ADD COLUMN IF NOT EXISTS year_built integer,
  ADD COLUMN IF NOT EXISTS roof_age_estimate numeric(5,2), -- years
  ADD COLUMN IF NOT EXISTS roof_age_category text CHECK (roof_age_category IN ('new', 'medium', 'old')) DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS neighborhood_name text,
  ADD COLUMN IF NOT EXISTS neighborhood_wealth_level text CHECK (neighborhood_wealth_level IN ('low', 'medium', 'high', 'luxury')) DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS geo_enriched_at timestamptz;

-- Indexes for geo enrichment
CREATE INDEX IF NOT EXISTS idx_contacts_home_value ON public.contacts(workspace_id, home_value_estimate DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_contacts_roof_age ON public.contacts(workspace_id, roof_age_estimate DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_contacts_neighborhood ON public.contacts(workspace_id, neighborhood_name);
CREATE INDEX IF NOT EXISTS idx_contacts_roof_age_category ON public.contacts(workspace_id, roof_age_category);

-- ============================================================================
-- 7. ADD GEO INTELLIGENCE COLUMNS TO LEADS TABLE
-- ============================================================================
-- Enrich leads with home value and roof age estimates

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS home_value_estimate numeric(12,2),
  ADD COLUMN IF NOT EXISTS property_type text CHECK (property_type IN ('single_family', 'multi_family', 'commercial', 'condo', 'townhouse', 'unknown')),
  ADD COLUMN IF NOT EXISTS structure_size_sqft integer,
  ADD COLUMN IF NOT EXISTS year_built integer,
  ADD COLUMN IF NOT EXISTS roof_age_estimate numeric(5,2), -- years
  ADD COLUMN IF NOT EXISTS roof_age_category text CHECK (roof_age_category IN ('new', 'medium', 'old')) DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS neighborhood_name text,
  ADD COLUMN IF NOT EXISTS neighborhood_wealth_level text CHECK (neighborhood_wealth_level IN ('low', 'medium', 'high', 'luxury')) DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS geo_enriched_at timestamptz;

-- ============================================================================
-- 8. FUNCTIONS FOR ZIP RANKING
-- ============================================================================

-- Function to calculate ZIP rank score
CREATE OR REPLACE FUNCTION public.calculate_zip_rank_score(
  p_workspace_id uuid,
  p_zip text
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_score numeric := 0;
  v_zip_data RECORD;
BEGIN
  -- Get ZIP data
  SELECT * INTO v_zip_data
  FROM public.geo_zip_data
  WHERE workspace_id = p_workspace_id
    AND zip = p_zip
  LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  -- Storm severity (0-30 points)
  v_score := v_score + (COALESCE(v_zip_data.storm_severity_score, 0) * 0.30);
  
  -- Home value (0-20 points)
  IF v_zip_data.avg_home_value IS NOT NULL THEN
    IF v_zip_data.avg_home_value >= 500000 THEN
      v_score := v_score + 20;
    ELSIF v_zip_data.avg_home_value >= 300000 THEN
      v_score := v_score + 15;
    ELSIF v_zip_data.avg_home_value >= 200000 THEN
      v_score := v_score + 10;
    ELSE
      v_score := v_score + 5;
    END IF;
  END IF;
  
  -- Roof age (0-20 points)
  IF v_zip_data.avg_roof_age IS NOT NULL THEN
    IF v_zip_data.avg_roof_age >= 16 THEN
      v_score := v_score + 20;
    ELSIF v_zip_data.avg_roof_age >= 10 THEN
      v_score := v_score + 15;
    ELSIF v_zip_data.avg_roof_age >= 6 THEN
      v_score := v_score + 10;
    ELSE
      v_score := v_score + 5;
    END IF;
  END IF;
  
  -- Replacement rate (0-15 points)
  IF v_zip_data.historical_replacement_rate IS NOT NULL THEN
    v_score := v_score + LEAST(15, v_zip_data.historical_replacement_rate * 3);
  END IF;
  
  -- Income level (0-10 points)
  IF v_zip_data.avg_income IS NOT NULL THEN
    IF v_zip_data.avg_income >= 100000 THEN
      v_score := v_score + 10;
    ELSIF v_zip_data.avg_income >= 75000 THEN
      v_score := v_score + 7;
    ELSIF v_zip_data.avg_income >= 50000 THEN
      v_score := v_score + 5;
    ELSE
      v_score := v_score + 2;
    END IF;
  END IF;
  
  -- Homeownership density (0-5 points)
  IF v_zip_data.homeownership_density IS NOT NULL THEN
    v_score := v_score + (v_zip_data.homeownership_density * 0.05);
  END IF;
  
  -- Performance bonus (0-10 points)
  IF v_zip_data.reply_rate_pct IS NOT NULL AND v_zip_data.reply_rate_pct > 0 THEN
    v_score := v_score + LEAST(10, v_zip_data.reply_rate_pct * 2);
  END IF;
  
  -- Insurance rich bonus (0-10 points)
  v_score := v_score + (COALESCE(v_zip_data.insurance_rich_score, 0) * 0.10);
  
  RETURN v_score;
END;
$$;

-- Function to update ZIP rankings
CREATE OR REPLACE FUNCTION public.update_zip_rankings(
  p_workspace_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_zip_record RECORD;
  v_rank integer := 1;
BEGIN
  -- Update scores first
  UPDATE public.geo_zip_data
  SET zip_rank_score = public.calculate_zip_rank_score(workspace_id, zip)
  WHERE workspace_id = p_workspace_id;
  
  -- Then assign ranks
  FOR v_zip_record IN
    SELECT zip
    FROM public.geo_zip_data
    WHERE workspace_id = p_workspace_id
      AND zip_rank_score > 0
    ORDER BY zip_rank_score DESC
  LOOP
    UPDATE public.geo_zip_data
    SET zip_rank = v_rank
    WHERE workspace_id = p_workspace_id
      AND zip = v_zip_record.zip;
    
    v_rank := v_rank + 1;
  END LOOP;
END;
$$;

-- ============================================================================
-- 9. FUNCTIONS FOR STORM ZONE CALCULATION
-- ============================================================================

-- Function to determine storm zone color
CREATE OR REPLACE FUNCTION public.calculate_storm_zone(
  p_hail_size numeric DEFAULT NULL,
  p_wind_speed numeric DEFAULT NULL,
  p_claim_probability numeric DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  -- Red Zone: Heavy Damage
  IF (p_hail_size IS NOT NULL AND p_hail_size >= 1.25) OR
     (p_wind_speed IS NOT NULL AND p_wind_speed >= 50) OR
     (p_claim_probability IS NOT NULL AND p_claim_probability >= 70) THEN
    RETURN 'red';
  END IF;
  
  -- Orange Zone: Moderate Damage
  IF (p_hail_size IS NOT NULL AND p_hail_size >= 0.75) OR
     (p_wind_speed IS NOT NULL AND p_wind_speed >= 40) OR
     (p_claim_probability IS NOT NULL AND p_claim_probability >= 50) THEN
    RETURN 'orange';
  END IF;
  
  -- Yellow Zone: Light Damage
  IF (p_hail_size IS NOT NULL AND p_hail_size >= 0.5) OR
     (p_wind_speed IS NOT NULL AND p_wind_speed >= 30) OR
     (p_claim_probability IS NOT NULL AND p_claim_probability >= 30) THEN
    RETURN 'yellow';
  END IF;
  
  -- Green Zone: Untouched
  RETURN 'green';
END;
$$;

-- Function to create/update storm zones from weather events
CREATE OR REPLACE FUNCTION public.update_storm_zones_from_weather(
  p_workspace_id uuid,
  p_weather_event_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_weather_event RECORD;
  v_zone_color text;
  v_claim_probability numeric;
BEGIN
  -- Get weather event
  SELECT * INTO v_weather_event
  FROM public.weather_events
  WHERE id = p_weather_event_id
    AND workspace_id = p_workspace_id
  LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Calculate claim probability based on storm intensity
  v_claim_probability := public.calculate_storm_risk_score(
    v_weather_event.hail_size,
    v_weather_event.wind_speed,
    v_weather_event.rain_inches,
    v_weather_event.severity
  );
  
  -- Determine zone color
  v_zone_color := public.calculate_storm_zone(
    v_weather_event.hail_size,
    v_weather_event.wind_speed,
    v_claim_probability
  );
  
  -- Insert or update storm zone
  INSERT INTO public.geo_storm_zones (
    workspace_id,
    zip,
    zone_color,
    weather_event_id,
    hail_size,
    wind_speed,
    claim_probability,
    priority_level,
    storm_started_at,
    zone_expires_at
  )
  VALUES (
    p_workspace_id,
    v_weather_event.zip,
    v_zone_color,
    p_weather_event_id,
    v_weather_event.hail_size,
    v_weather_event.wind_speed,
    v_claim_probability,
    CASE v_zone_color
      WHEN 'red' THEN 100
      WHEN 'orange' THEN 75
      WHEN 'yellow' THEN 50
      ELSE 25
    END,
    v_weather_event.storm_started_at,
    v_weather_event.storm_started_at + INTERVAL '30 days'
  )
  ON CONFLICT (workspace_id, zip, weather_event_id)
  DO UPDATE SET
    zone_color = EXCLUDED.zone_color,
    claim_probability = EXCLUDED.claim_probability,
    priority_level = EXCLUDED.priority_level,
    updated_at = now();
END;
$$;

-- ============================================================================
-- 10. FUNCTIONS FOR GEO PERFORMANCE SCORING
-- ============================================================================

-- Function to calculate performance scores by ZIP
CREATE OR REPLACE FUNCTION public.calculate_geo_performance_scores(
  p_workspace_id uuid,
  p_period_start timestamptz DEFAULT (now() - INTERVAL '30 days'),
  p_period_end timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_zip_record RECORD;
  v_performance_score numeric;
BEGIN
  -- Calculate scores for each ZIP
  FOR v_zip_record IN
    SELECT DISTINCT COALESCE(c.postal_code, c.zip, l.zip) as zip_code
    FROM public.contacts c
    FULL OUTER JOIN public.leads l ON l.id = c.id
    WHERE (c.workspace_id = p_workspace_id OR l.user_id IN (
      SELECT user_id FROM public.workspace_members WHERE workspace_id = p_workspace_id
    ))
    AND COALESCE(c.postal_code, c.zip, l.zip) IS NOT NULL
  LOOP
    -- Calculate performance metrics
    WITH zip_metrics AS (
      SELECT
        COUNT(DISTINCT CASE WHEN el.id IS NOT NULL THEN el.id END) as total_sent,
        COUNT(DISTINCT CASE WHEN el.opened_at IS NOT NULL THEN el.id END) as total_opens,
        COUNT(DISTINCT CASE WHEN el.clicked_at IS NOT NULL THEN el.id END) as total_clicks,
        COUNT(DISTINCT CASE WHEN im.id IS NOT NULL THEN im.id END) as total_replies,
        COUNT(DISTINCT CASE WHEN l.outcome = 'won' THEN l.id END) as total_bookings,
        COALESCE(SUM(CASE WHEN l.outcome = 'won' THEN l.won_value ELSE 0 END), 0) as total_revenue
      FROM public.contacts c
      LEFT JOIN public.campaign_contacts cc ON cc.contact_id = c.id
      LEFT JOIN public.email_logs el ON el.campaign_id = cc.campaign_id AND el.recipient_email = c.email
      LEFT JOIN public.inbound_messages im ON im.from_email = c.email
      LEFT JOIN public.leads l ON l.email = c.email
      WHERE c.workspace_id = p_workspace_id
        AND COALESCE(c.postal_code, c.zip) = v_zip_record.zip_code
        AND el.created_at BETWEEN p_period_start AND p_period_end
    )
    INSERT INTO public.geo_scores (
      workspace_id,
      zip,
      score_period_start,
      score_period_end,
      total_sent,
      total_opens,
      total_clicks,
      total_replies,
      total_bookings,
      total_revenue,
      open_rate_pct,
      click_rate_pct,
      reply_rate_pct,
      booking_rate_pct,
      revenue_per_lead,
      performance_score
    )
    SELECT
      p_workspace_id,
      v_zip_record.zip_code,
      p_period_start,
      p_period_end,
      COALESCE(zm.total_sent, 0),
      COALESCE(zm.total_opens, 0),
      COALESCE(zm.total_clicks, 0),
      COALESCE(zm.total_replies, 0),
      COALESCE(zm.total_bookings, 0),
      COALESCE(zm.total_revenue, 0),
      CASE WHEN zm.total_sent > 0 THEN (zm.total_opens::numeric / zm.total_sent::numeric) * 100 ELSE 0 END,
      CASE WHEN zm.total_sent > 0 THEN (zm.total_clicks::numeric / zm.total_sent::numeric) * 100 ELSE 0 END,
      CASE WHEN zm.total_sent > 0 THEN (zm.total_replies::numeric / zm.total_sent::numeric) * 100 ELSE 0 END,
      CASE WHEN zm.total_sent > 0 THEN (zm.total_bookings::numeric / zm.total_sent::numeric) * 100 ELSE 0 END,
      CASE WHEN zm.total_replies > 0 THEN (zm.total_revenue / zm.total_replies) ELSE 0 END,
      -- Performance score: weighted combination
      (COALESCE(zm.total_replies, 0) * 2) + 
      (COALESCE(zm.total_bookings, 0) * 5) + 
      (COALESCE(zm.total_revenue, 0) / 1000)
    FROM zip_metrics zm
    ON CONFLICT (workspace_id, zip, neighborhood_name, score_period_start)
    DO UPDATE SET
      total_sent = EXCLUDED.total_sent,
      total_opens = EXCLUDED.total_opens,
      total_clicks = EXCLUDED.total_clicks,
      total_replies = EXCLUDED.total_replies,
      total_bookings = EXCLUDED.total_bookings,
      total_revenue = EXCLUDED.total_revenue,
      open_rate_pct = EXCLUDED.open_rate_pct,
      click_rate_pct = EXCLUDED.click_rate_pct,
      reply_rate_pct = EXCLUDED.reply_rate_pct,
      booking_rate_pct = EXCLUDED.booking_rate_pct,
      revenue_per_lead = EXCLUDED.revenue_per_lead,
      performance_score = EXCLUDED.performance_score,
      calculated_at = now();
  END LOOP;
END;
$$;

-- ============================================================================
-- 11. FUNCTIONS FOR CLUSTER GENERATION
-- ============================================================================

-- Function to generate geographic clusters
CREATE OR REPLACE FUNCTION public.generate_geo_clusters(
  p_workspace_id uuid,
  p_cluster_type text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cluster_type text;
BEGIN
  -- Generate storm clusters
  IF p_cluster_type IS NULL OR p_cluster_type = 'storm' THEN
    INSERT INTO public.geo_clusters (
      workspace_id,
      cluster_type,
      zip,
      lead_count,
      contact_count,
      cluster_score,
      cluster_priority,
      cluster_started_at,
      cluster_detected_at
    )
    SELECT
      gsz.workspace_id,
      'storm',
      gsz.zip,
      COUNT(DISTINCT c.id),
      COUNT(DISTINCT c.id),
      gsz.priority_level,
      gsz.priority_level,
      gsz.storm_started_at,
      now()
    FROM public.geo_storm_zones gsz
    LEFT JOIN public.contacts c ON 
      (c.postal_code = gsz.zip OR c.zip = gsz.zip)
      AND c.workspace_id = gsz.workspace_id
    WHERE gsz.workspace_id = p_workspace_id
      AND gsz.zone_color IN ('red', 'orange')
      AND gsz.zone_expires_at > now()
    GROUP BY gsz.workspace_id, gsz.zip, gsz.priority_level, gsz.storm_started_at
    ON CONFLICT DO NOTHING;
  END IF;
  
  -- Generate high-value clusters
  IF p_cluster_type IS NULL OR p_cluster_type = 'high_value' THEN
    INSERT INTO public.geo_clusters (
      workspace_id,
      cluster_type,
      zip,
      lead_count,
      contact_count,
      cluster_score,
      cluster_priority
    )
    SELECT
      c.workspace_id,
      'high_value',
      COALESCE(c.postal_code, c.zip),
      COUNT(DISTINCT c.id),
      COUNT(DISTINCT c.id),
      AVG(COALESCE(c.home_value_estimate, 0)),
      CASE 
        WHEN AVG(COALESCE(c.home_value_estimate, 0)) >= 500000 THEN 100
        WHEN AVG(COALESCE(c.home_value_estimate, 0)) >= 300000 THEN 75
        ELSE 50
      END
    FROM public.contacts c
    WHERE c.workspace_id = p_workspace_id
      AND c.home_value_estimate >= 300000
      AND COALESCE(c.postal_code, c.zip) IS NOT NULL
    GROUP BY c.workspace_id, COALESCE(c.postal_code, c.zip)
    HAVING COUNT(DISTINCT c.id) >= 5
    ON CONFLICT DO NOTHING;
  END IF;
  
  -- Generate recent replies clusters
  IF p_cluster_type IS NULL OR p_cluster_type = 'recent_replies' THEN
    INSERT INTO public.geo_clusters (
      workspace_id,
      cluster_type,
      zip,
      lead_count,
      contact_count,
      cluster_score,
      cluster_priority,
      cluster_started_at
    )
    SELECT
      c.workspace_id,
      'recent_replies',
      COALESCE(c.postal_code, c.zip),
      COUNT(DISTINCT c.id),
      COUNT(DISTINCT c.id),
      COUNT(DISTINCT c.id) * 10,
      90,
      MAX(im.created_at)
    FROM public.contacts c
    INNER JOIN public.inbound_messages im ON im.from_email = c.email
    WHERE c.workspace_id = p_workspace_id
      AND im.created_at >= now() - INTERVAL '7 days'
      AND COALESCE(c.postal_code, c.zip) IS NOT NULL
    GROUP BY c.workspace_id, COALESCE(c.postal_code, c.zip)
    HAVING COUNT(DISTINCT c.id) >= 3
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

-- ============================================================================
-- 12. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.geo_zip_data IS 'ZIP code intelligence: storm severity, home values, roof ages, performance metrics, and rankings';
COMMENT ON TABLE public.geo_neighborhood_data IS 'Neighborhood-level intelligence: roof ages, home values, storm risk, insurance probability';
COMMENT ON TABLE public.geo_storm_zones IS 'Color-coded storm opportunity zones (Red=Heavy, Orange=Moderate, Yellow=Light, Green=Untouched)';
COMMENT ON TABLE public.geo_clusters IS 'Geographic lead clusters for targeted campaigns and door-knocking suggestions';
COMMENT ON TABLE public.geo_scores IS 'Performance scoring by ZIP and neighborhood over time periods';

COMMENT ON FUNCTION public.calculate_zip_rank_score IS 'Calculates composite ZIP rank score based on storm, home value, roof age, and performance';
COMMENT ON FUNCTION public.update_zip_rankings IS 'Updates ZIP rankings for a workspace based on calculated scores';
COMMENT ON FUNCTION public.calculate_storm_zone IS 'Determines storm zone color (red/orange/yellow/green) based on hail, wind, and claim probability';
COMMENT ON FUNCTION public.update_storm_zones_from_weather IS 'Creates/updates storm zones from weather events';
COMMENT ON FUNCTION public.calculate_geo_performance_scores IS 'Calculates performance scores by ZIP for a given time period';
COMMENT ON FUNCTION public.generate_geo_clusters IS 'Generates geographic clusters (storm, high-value, recent-replies, etc.)';





















































