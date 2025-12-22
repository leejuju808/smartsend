-- =========================================================
-- Block 72000 — SmartSend Roofing Service Area Mapping + Local Lead Radius Engine v1
-- =========================================================
--
-- This block gives roofers the ability to:
-- 1. Define service areas with radius-based filtering
-- 2. Track neighborhood performance by ZIP code
-- 3. Automatically filter leads outside their profitable radius
-- 4. Get smart expansion suggestions based on performance
--
-- This makes roofers feel stupid for NOT using SmartSend because:
-- - They see exactly which neighborhoods make money
-- - They stop wasting time on leads outside their radius
-- - They get data-driven expansion suggestions
-- =========================================================

-- ============================================================================
-- 1. SERVICE_AREAS TABLE
-- ============================================================================
-- Service areas per roofing company/workspace

CREATE TABLE IF NOT EXISTS public.service_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Service Area Identity
  name text NOT NULL, -- e.g. "Primary Zone", "North Expansion", "Downtown Core"
  
  -- Geographic Center
  center_lat double precision NOT NULL,
  center_lng double precision NOT NULL,
  
  -- Service Radius
  radius_miles integer NOT NULL CHECK (radius_miles > 0 AND radius_miles <= 100),
  
  -- Optional: Polygon mode (for non-circular areas)
  polygon_coordinates jsonb, -- Array of {lat, lng} points for custom shapes
  
  -- Metadata
  is_active boolean DEFAULT true,
  is_primary boolean DEFAULT false, -- Primary service area
  estimated_homeowner_count integer, -- Estimated count of homeowners in radius
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_service_areas_workspace ON public.service_areas(workspace_id);
CREATE INDEX IF NOT EXISTS idx_service_areas_active ON public.service_areas(workspace_id, is_active);
CREATE INDEX IF NOT EXISTS idx_service_areas_location ON public.service_areas(center_lat, center_lng);

-- ============================================================================
-- 2. SERVICE_AREA_STATS TABLE
-- ============================================================================
-- Neighborhood performance heatmap data by ZIP code

CREATE TABLE IF NOT EXISTS public.service_area_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  area_id uuid REFERENCES public.service_areas(id) ON DELETE SET NULL,
  
  -- Geographic Scope
  zipcode text NOT NULL,
  neighborhood_name text,
  city text,
  state text,
  
  -- Performance Metrics
  leads_sent integer DEFAULT 0,
  replies integer DEFAULT 0,
  booked_estimates integer DEFAULT 0,
  closed_jobs integer DEFAULT 0,
  estimated_job_value numeric(12,2) DEFAULT 0,
  
  -- Calculated Rates
  reply_rate_pct numeric(5,2) DEFAULT 0,
  booking_rate_pct numeric(5,2) DEFAULT 0,
  close_rate_pct numeric(5,2) DEFAULT 0,
  
  -- Heat Score (0-100, for heatmap visualization)
  performance_score integer DEFAULT 0 CHECK (performance_score >= 0 AND performance_score <= 100),
  performance_color text CHECK (performance_color IN ('green', 'yellow', 'red')) DEFAULT 'yellow',
  
  -- Metadata
  last_calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(workspace_id, zipcode, COALESCE(area_id, '00000000-0000-0000-0000-000000000000'::uuid))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_service_area_stats_workspace ON public.service_area_stats(workspace_id);
CREATE INDEX IF NOT EXISTS idx_service_area_stats_area ON public.service_area_stats(area_id);
CREATE INDEX IF NOT EXISTS idx_service_area_stats_zip ON public.service_area_stats(zipcode);
CREATE INDEX IF NOT EXISTS idx_service_area_stats_performance ON public.service_area_stats(workspace_id, performance_score DESC);

-- ============================================================================
-- 3. LEAD_LOCATIONS TABLE
-- ============================================================================
-- Geolocation data for leads (for radius filtering)

CREATE TABLE IF NOT EXISTS public.lead_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Geographic Data
  lat double precision,
  lng double precision,
  zipcode text,
  address text, -- Full address for reference
  
  -- Service Area Matching
  is_in_service_area boolean DEFAULT false,
  matched_service_area_id uuid REFERENCES public.service_areas(id) ON DELETE SET NULL,
  distance_from_center_miles numeric(8,2), -- Distance from nearest service area center
  
  -- Verification
  geocoded_at timestamptz,
  geocoding_source text, -- 'google', 'manual', 'import'
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(lead_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lead_locations_lead ON public.lead_locations(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_locations_workspace ON public.lead_locations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_lead_locations_zip ON public.lead_locations(zipcode);
CREATE INDEX IF NOT EXISTS idx_lead_locations_location ON public.lead_locations(lat, lng);
CREATE INDEX IF NOT EXISTS idx_lead_locations_service_area ON public.lead_locations(workspace_id, is_in_service_area);

-- ============================================================================
-- 4. SERVICE_AREA_SUGGESTIONS TABLE
-- ============================================================================
-- Smart expansion suggestions based on performance data

CREATE TABLE IF NOT EXISTS public.service_area_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Suggestion Details
  suggestion_type text NOT NULL CHECK (suggestion_type IN ('expand', 'reduce', 'new_zone', 'remove')),
  zipcode text NOT NULL,
  neighborhood_name text,
  city text,
  state text,
  
  -- Performance Data (why this suggestion)
  current_reply_rate_pct numeric(5,2),
  current_booking_rate_pct numeric(5,2),
  current_close_rate_pct numeric(5,2),
  comparison_to_avg text, -- e.g. "14% higher reply rate than your main radius"
  
  -- Suggested Action
  suggested_radius_miles integer,
  suggested_center_lat double precision,
  suggested_center_lng double precision,
  suggestion_reason text NOT NULL,
  
  -- Status
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'dismissed', 'implemented')),
  
  -- Metadata
  generated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_service_area_suggestions_workspace ON public.service_area_suggestions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_service_area_suggestions_status ON public.service_area_suggestions(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_service_area_suggestions_zip ON public.service_area_suggestions(zipcode);

-- ============================================================================
-- 5. FUNCTIONS
-- ============================================================================

-- Function: Calculate distance between two lat/lng points (Haversine formula)
CREATE OR REPLACE FUNCTION public.calculate_distance_miles(
  lat1 double precision,
  lng1 double precision,
  lat2 double precision,
  lng2 double precision
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  earth_radius_miles numeric := 3959.0;
  dlat numeric;
  dlng numeric;
  a numeric;
  c numeric;
BEGIN
  dlat := radians(lat2 - lat1);
  dlng := radians(lng2 - lng1);
  
  a := sin(dlat / 2) * sin(dlat / 2) +
       cos(radians(lat1)) * cos(radians(lat2)) *
       sin(dlng / 2) * sin(dlng / 2);
  
  c := 2 * atan2(sqrt(a), sqrt(1 - a));
  
  RETURN earth_radius_miles * c;
END;
$$;

COMMENT ON FUNCTION public.calculate_distance_miles IS 'Calculates distance in miles between two lat/lng coordinates using Haversine formula';

-- Function: Check if lead is within service area
CREATE OR REPLACE FUNCTION public.is_lead_in_service_area(
  p_lead_id uuid,
  p_workspace_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lead_lat double precision;
  v_lead_lng double precision;
  v_area RECORD;
  v_distance numeric;
BEGIN
  -- Get lead location
  SELECT lat, lng INTO v_lead_lat, v_lead_lng
  FROM public.lead_locations
  WHERE lead_id = p_lead_id;
  
  IF v_lead_lat IS NULL OR v_lead_lng IS NULL THEN
    RETURN false;
  END IF;
  
  -- Check against all active service areas
  FOR v_area IN
    SELECT id, center_lat, center_lng, radius_miles
    FROM public.service_areas
    WHERE workspace_id = p_workspace_id
      AND is_active = true
  LOOP
    v_distance := public.calculate_distance_miles(
      v_lead_lat,
      v_lead_lng,
      v_area.center_lat,
      v_area.center_lng
    );
    
    IF v_distance <= v_area.radius_miles THEN
      -- Update lead_locations with match
      UPDATE public.lead_locations
      SET is_in_service_area = true,
          matched_service_area_id = v_area.id,
          distance_from_center_miles = v_distance
      WHERE lead_id = p_lead_id;
      
      RETURN true;
    END IF;
  END LOOP;
  
  -- No match found
  UPDATE public.lead_locations
  SET is_in_service_area = false,
      matched_service_area_id = NULL
  WHERE lead_id = p_lead_id;
  
  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.is_lead_in_service_area IS 'Checks if a lead is within any active service area for the workspace';

-- Function: Update service area stats
CREATE OR REPLACE FUNCTION public.update_service_area_stats(
  p_workspace_id uuid,
  p_zipcode text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Calculate stats for each ZIP code
  INSERT INTO public.service_area_stats (
    workspace_id,
    zipcode,
    neighborhood_name,
    city,
    state,
    leads_sent,
    replies,
    booked_estimates,
    closed_jobs,
    estimated_job_value,
    reply_rate_pct,
    booking_rate_pct,
    close_rate_pct,
    performance_score,
    performance_color,
    last_calculated_at
  )
  SELECT
    ll.workspace_id,
    COALESCE(ll.zipcode, l.zip_code, '') as zipcode,
    NULL as neighborhood_name, -- Could be enriched later
    l.city,
    l.state,
    
    -- Count metrics
    COUNT(DISTINCT CASE WHEN el.id IS NOT NULL THEN el.id END) as leads_sent,
    COUNT(DISTINCT CASE WHEN rt.id IS NOT NULL THEN rt.id END) as replies,
    COUNT(DISTINCT CASE WHEN l.roofing_pipeline_stage IN ('inspection_set', 'quote_sent') THEN l.id END) as booked_estimates,
    COUNT(DISTINCT CASE WHEN l.roofing_pipeline_stage = 'installed' THEN l.id END) as closed_jobs,
    COALESCE(SUM(l.estimated_job_value), 0) as estimated_job_value,
    
    -- Calculate rates
    CASE 
      WHEN COUNT(DISTINCT CASE WHEN el.id IS NOT NULL THEN el.id END) > 0 
      THEN ROUND((COUNT(DISTINCT CASE WHEN rt.id IS NOT NULL THEN rt.id END)::numeric / 
                  COUNT(DISTINCT CASE WHEN el.id IS NOT NULL THEN el.id END)::numeric) * 100, 2)
      ELSE 0
    END as reply_rate_pct,
    
    CASE 
      WHEN COUNT(DISTINCT CASE WHEN el.id IS NOT NULL THEN el.id END) > 0 
      THEN ROUND((COUNT(DISTINCT CASE WHEN l.roofing_pipeline_stage IN ('inspection_set', 'quote_sent') THEN l.id END)::numeric / 
                  COUNT(DISTINCT CASE WHEN el.id IS NOT NULL THEN el.id END)::numeric) * 100, 2)
      ELSE 0
    END as booking_rate_pct,
    
    CASE 
      WHEN COUNT(DISTINCT CASE WHEN l.roofing_pipeline_stage IN ('inspection_set', 'quote_sent') THEN l.id END) > 0 
      THEN ROUND((COUNT(DISTINCT CASE WHEN l.roofing_pipeline_stage = 'installed' THEN l.id END)::numeric / 
                  COUNT(DISTINCT CASE WHEN l.roofing_pipeline_stage IN ('inspection_set', 'quote_sent') THEN l.id END)::numeric) * 100, 2)
      ELSE 0
    END as close_rate_pct,
    
    -- Performance Score (0-100)
    LEAST(100, GREATEST(0,
      (CASE WHEN COUNT(DISTINCT CASE WHEN el.id IS NOT NULL THEN el.id END) > 0 
        THEN (COUNT(DISTINCT CASE WHEN rt.id IS NOT NULL THEN rt.id END)::numeric / 
              COUNT(DISTINCT CASE WHEN el.id IS NOT NULL THEN el.id END)::numeric) * 40
        ELSE 0 END) +
      (CASE WHEN COUNT(DISTINCT CASE WHEN el.id IS NOT NULL THEN el.id END) > 0 
        THEN (COUNT(DISTINCT CASE WHEN l.roofing_pipeline_stage IN ('inspection_set', 'quote_sent') THEN l.id END)::numeric / 
              COUNT(DISTINCT CASE WHEN el.id IS NOT NULL THEN el.id END)::numeric) * 35
        ELSE 0 END) +
      (CASE WHEN COUNT(DISTINCT CASE WHEN l.roofing_pipeline_stage IN ('inspection_set', 'quote_sent') THEN l.id END) > 0 
        THEN (COUNT(DISTINCT CASE WHEN l.roofing_pipeline_stage = 'installed' THEN l.id END)::numeric / 
              COUNT(DISTINCT CASE WHEN l.roofing_pipeline_stage IN ('inspection_set', 'quote_sent') THEN l.id END)::numeric) * 25
        ELSE 0 END)
    ))::integer as performance_score,
    
    -- Performance Color
    CASE 
      WHEN LEAST(100, GREATEST(0,
        (CASE WHEN COUNT(DISTINCT CASE WHEN el.id IS NOT NULL THEN el.id END) > 0 
          THEN (COUNT(DISTINCT CASE WHEN rt.id IS NOT NULL THEN rt.id END)::numeric / 
                COUNT(DISTINCT CASE WHEN el.id IS NOT NULL THEN el.id END)::numeric) * 40
          ELSE 0 END) +
        (CASE WHEN COUNT(DISTINCT CASE WHEN el.id IS NOT NULL THEN el.id END) > 0 
          THEN (COUNT(DISTINCT CASE WHEN l.roofing_pipeline_stage IN ('inspection_set', 'quote_sent') THEN l.id END)::numeric / 
                COUNT(DISTINCT CASE WHEN el.id IS NOT NULL THEN el.id END)::numeric) * 35
          ELSE 0 END) +
        (CASE WHEN COUNT(DISTINCT CASE WHEN l.roofing_pipeline_stage IN ('inspection_set', 'quote_sent') THEN l.id END) > 0 
          THEN (COUNT(DISTINCT CASE WHEN l.roofing_pipeline_stage = 'installed' THEN l.id END)::numeric / 
                COUNT(DISTINCT CASE WHEN l.roofing_pipeline_stage IN ('inspection_set', 'quote_sent') THEN l.id END)::numeric) * 25
          ELSE 0 END)
      )) >= 70 THEN 'green'
      WHEN LEAST(100, GREATEST(0,
        (CASE WHEN COUNT(DISTINCT CASE WHEN el.id IS NOT NULL THEN el.id END) > 0 
          THEN (COUNT(DISTINCT CASE WHEN rt.id IS NOT NULL THEN rt.id END)::numeric / 
                COUNT(DISTINCT CASE WHEN el.id IS NOT NULL THEN el.id END)::numeric) * 40
          ELSE 0 END) +
        (CASE WHEN COUNT(DISTINCT CASE WHEN el.id IS NOT NULL THEN el.id END) > 0 
          THEN (COUNT(DISTINCT CASE WHEN l.roofing_pipeline_stage IN ('inspection_set', 'quote_sent') THEN l.id END)::numeric / 
                COUNT(DISTINCT CASE WHEN el.id IS NOT NULL THEN el.id END)::numeric) * 35
          ELSE 0 END) +
        (CASE WHEN COUNT(DISTINCT CASE WHEN l.roofing_pipeline_stage IN ('inspection_set', 'quote_sent') THEN l.id END) > 0 
          THEN (COUNT(DISTINCT CASE WHEN l.roofing_pipeline_stage = 'installed' THEN l.id END)::numeric / 
                COUNT(DISTINCT CASE WHEN l.roofing_pipeline_stage IN ('inspection_set', 'quote_sent') THEN l.id END)::numeric) * 25
          ELSE 0 END)
      )) >= 40 THEN 'yellow'
      ELSE 'red'
    END as performance_color,
    
    now() as last_calculated_at
    
  FROM public.lead_locations ll
  INNER JOIN public.leads l ON l.id = ll.lead_id
  LEFT JOIN public.email_logs el ON el.lead_id = l.id
  LEFT JOIN public.reply_threads rt ON rt.lead_id = l.id
  WHERE ll.workspace_id = p_workspace_id
    AND ll.is_in_service_area = true
    AND (p_zipcode IS NULL OR COALESCE(ll.zipcode, l.zip_code) = p_zipcode)
  GROUP BY 
    ll.workspace_id,
    COALESCE(ll.zipcode, l.zip_code),
    l.city,
    l.state
  ON CONFLICT (workspace_id, zipcode, COALESCE(area_id, '00000000-0000-0000-0000-000000000000'::uuid))
  DO UPDATE SET
    leads_sent = EXCLUDED.leads_sent,
    replies = EXCLUDED.replies,
    booked_estimates = EXCLUDED.booked_estimates,
    closed_jobs = EXCLUDED.closed_jobs,
    estimated_job_value = EXCLUDED.estimated_job_value,
    reply_rate_pct = EXCLUDED.reply_rate_pct,
    booking_rate_pct = EXCLUDED.booking_rate_pct,
    close_rate_pct = EXCLUDED.close_rate_pct,
    performance_score = EXCLUDED.performance_score,
    performance_color = EXCLUDED.performance_color,
    last_calculated_at = EXCLUDED.last_calculated_at,
    updated_at = now();
END;
$$;

COMMENT ON FUNCTION public.update_service_area_stats IS 'Updates service area performance stats by ZIP code (Block 72000)';

-- Function: Generate smart expansion suggestions
CREATE OR REPLACE FUNCTION public.generate_service_area_suggestions(
  p_workspace_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_avg_reply_rate numeric;
  v_suggestion RECORD;
BEGIN
  -- Calculate average reply rate for existing service areas
  SELECT AVG(reply_rate_pct) INTO v_avg_reply_rate
  FROM public.service_area_stats
  WHERE workspace_id = p_workspace_id
    AND leads_sent >= 10; -- Only areas with meaningful data
  
  -- Find ZIP codes with high performance outside current service areas
  FOR v_suggestion IN
    SELECT 
      sas.zipcode,
      sas.city,
      sas.state,
      sas.reply_rate_pct,
      sas.booking_rate_pct,
      sas.close_rate_pct,
      sas.performance_score,
      ll.lat,
      ll.lng
    FROM public.service_area_stats sas
    INNER JOIN (
      SELECT DISTINCT zipcode, lat, lng
      FROM public.lead_locations
      WHERE workspace_id = p_workspace_id
        AND is_in_service_area = false
        AND lat IS NOT NULL
        AND lng IS NOT NULL
    ) ll ON ll.zipcode = sas.zipcode
    WHERE sas.workspace_id = p_workspace_id
      AND sas.leads_sent >= 5
      AND sas.reply_rate_pct > COALESCE(v_avg_reply_rate, 0) + 5 -- At least 5% higher
      AND NOT EXISTS (
        SELECT 1 FROM public.service_area_suggestions
        WHERE workspace_id = p_workspace_id
          AND zipcode = sas.zipcode
          AND status = 'pending'
      )
    ORDER BY sas.reply_rate_pct DESC
    LIMIT 5
  LOOP
    INSERT INTO public.service_area_suggestions (
      workspace_id,
      suggestion_type,
      zipcode,
      city,
      state,
      current_reply_rate_pct,
      current_booking_rate_pct,
      current_close_rate_pct,
      comparison_to_avg,
      suggested_radius_miles,
      suggested_center_lat,
      suggested_center_lng,
      suggestion_reason,
      expires_at
    ) VALUES (
      p_workspace_id,
      'expand',
      v_suggestion.zipcode,
      v_suggestion.city,
      v_suggestion.state,
      v_suggestion.reply_rate_pct,
      v_suggestion.booking_rate_pct,
      v_suggestion.close_rate_pct,
      format('%.1f%% higher reply rate than your main radius', 
        v_suggestion.reply_rate_pct - COALESCE(v_avg_reply_rate, 0)),
      5, -- Default 5 mile radius
      v_suggestion.lat,
      v_suggestion.lng,
      format('You closed %s jobs in ZIP %s. Consider adding a 5-mile expansion here.', 
        (SELECT COUNT(*) FROM public.leads l 
         INNER JOIN public.lead_locations ll ON ll.lead_id = l.id
         WHERE ll.zipcode = v_suggestion.zipcode 
           AND l.roofing_pipeline_stage = 'installed'
           AND l.workspace_id = p_workspace_id),
        v_suggestion.zipcode),
      now() + INTERVAL '30 days'
    );
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.generate_service_area_suggestions IS 'Generates smart expansion suggestions based on performance data (Block 72000)';

-- ============================================================================
-- 6. TRIGGERS
-- ============================================================================

-- Updated_at trigger for service_areas
CREATE OR REPLACE FUNCTION public.set_service_areas_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_service_areas_updated_at
BEFORE UPDATE ON public.service_areas
FOR EACH ROW
EXECUTE FUNCTION public.set_service_areas_updated_at();

-- Updated_at trigger for lead_locations
CREATE OR REPLACE FUNCTION public.set_lead_locations_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_lead_locations_updated_at
BEFORE UPDATE ON public.lead_locations
FOR EACH ROW
EXECUTE FUNCTION public.set_lead_locations_updated_at();

-- ============================================================================
-- 7. RLS POLICIES
-- ============================================================================

ALTER TABLE public.service_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_area_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_area_suggestions ENABLE ROW LEVEL SECURITY;

-- Service areas: workspace members can read/write
CREATE POLICY "service_areas_workspace_read" ON public.service_areas
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = service_areas.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "service_areas_workspace_write" ON public.service_areas
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = service_areas.workspace_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = service_areas.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Service area stats: workspace members can read
CREATE POLICY "service_area_stats_workspace_read" ON public.service_area_stats
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = service_area_stats.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Lead locations: workspace members can read/write
CREATE POLICY "lead_locations_workspace_read" ON public.lead_locations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = lead_locations.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "lead_locations_workspace_write" ON public.lead_locations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = lead_locations.workspace_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = lead_locations.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Service area suggestions: workspace members can read/write
CREATE POLICY "service_area_suggestions_workspace_read" ON public.service_area_suggestions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = service_area_suggestions.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "service_area_suggestions_workspace_write" ON public.service_area_suggestions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = service_area_suggestions.workspace_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = service_area_suggestions.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 8. GRANTS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_areas TO authenticated;
GRANT SELECT ON public.service_area_stats TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.lead_locations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.service_area_suggestions TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_distance_miles TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_lead_in_service_area TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_service_area_stats TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_service_area_suggestions TO authenticated;



























