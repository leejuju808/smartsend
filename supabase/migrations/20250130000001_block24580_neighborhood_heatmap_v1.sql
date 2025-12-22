-- =========================================================
-- Block 24580 — SmartSend Roofing Neighborhood Heatmap v1
-- (Response Heatmap • High-ROI Neighborhoods • Open/Reply/Booking Mapping • Storm Impact Zones • Build Roofing Targeting Intelligence)
-- =========================================================
--
-- This block gives SmartSend real geographic intelligence, letting roofers SEE where the money is coming from.
-- Three layers: Engagement Heatmap, Job Pipeline Heatmap, Storm Impact Layer
-- =========================================================

-- ============================================================================
-- 1. NEIGHBORHOOD_HEATMAP_DATA TABLE
-- ============================================================================
-- Aggregated heatmap data by neighborhood/ZIP for visualization

CREATE TABLE IF NOT EXISTS public.neighborhood_heatmap_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Geographic Scope
  zip text NOT NULL,
  neighborhood_name text,
  city text,
  state text,
  
  -- Geographic Coordinates (for map rendering)
  center_lat numeric(10,7),
  center_lon numeric(10,7),
  
  -- LAYER A: Engagement Metrics
  total_sent integer DEFAULT 0,
  total_opens integer DEFAULT 0,
  total_clicks integer DEFAULT 0,
  total_replies integer DEFAULT 0,
  total_bookings integer DEFAULT 0,
  
  open_rate_pct numeric(5,2) DEFAULT 0,
  reply_rate_pct numeric(5,2) DEFAULT 0,
  booking_rate_pct numeric(5,2) DEFAULT 0,
  
  -- Engagement Heat Score (0-100, Green/Yellow/Red)
  engagement_heat_score integer DEFAULT 0 CHECK (engagement_heat_score >= 0 AND engagement_heat_score <= 100),
  engagement_heat_color text CHECK (engagement_heat_color IN ('green', 'yellow', 'red')) DEFAULT 'yellow',
  
  -- LAYER B: Job Pipeline Metrics
  leads_in_lead_in integer DEFAULT 0,
  leads_in_inspection_set integer DEFAULT 0,
  leads_in_quote_sent integer DEFAULT 0,
  leads_in_approved integer DEFAULT 0,
  leads_in_scheduled integer DEFAULT 0,
  leads_in_installed integer DEFAULT 0,
  
  total_active_jobs integer DEFAULT 0,
  total_revenue numeric(12,2) DEFAULT 0,
  avg_job_value numeric(12,2) DEFAULT 0,
  
  -- Pipeline Heat Score
  pipeline_heat_score integer DEFAULT 0 CHECK (pipeline_heat_score >= 0 AND pipeline_heat_score <= 100),
  
  -- LAYER C: Storm Impact Metrics
  storm_severity_score integer DEFAULT 0 CHECK (storm_severity_score >= 0 AND storm_severity_score <= 100),
  last_storm_date timestamptz,
  storm_risk_level text CHECK (storm_risk_level IN ('low', 'medium', 'high')) DEFAULT 'low',
  affected_homes_estimate integer DEFAULT 0,
  
  -- Composite Opportunity Score (0-100)
  opportunity_score integer DEFAULT 0 CHECK (opportunity_score >= 0 AND opportunity_score <= 100),
  
  -- Metadata
  last_calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(workspace_id, zip, COALESCE(neighborhood_name, ''))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_neighborhood_heatmap_workspace ON public.neighborhood_heatmap_data(workspace_id);
CREATE INDEX IF NOT EXISTS idx_neighborhood_heatmap_zip ON public.neighborhood_heatmap_data(zip);
CREATE INDEX IF NOT EXISTS idx_neighborhood_heatmap_neighborhood ON public.neighborhood_heatmap_data(workspace_id, neighborhood_name);
CREATE INDEX IF NOT EXISTS idx_neighborhood_heatmap_engagement_score ON public.neighborhood_heatmap_data(workspace_id, engagement_heat_score DESC);
CREATE INDEX IF NOT EXISTS idx_neighborhood_heatmap_opportunity_score ON public.neighborhood_heatmap_data(workspace_id, opportunity_score DESC);
CREATE INDEX IF NOT EXISTS idx_neighborhood_heatmap_storm_score ON public.neighborhood_heatmap_data(workspace_id, storm_severity_score DESC);

-- ============================================================================
-- 2. NEIGHBORHOOD_PROFILES TABLE
-- ============================================================================
-- Detailed neighborhood profile cards with all intelligence

CREATE TABLE IF NOT EXISTS public.neighborhood_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Geographic Scope
  zip text NOT NULL,
  neighborhood_name text,
  city text,
  state text,
  
  -- Property Intelligence
  avg_home_age numeric(5,2), -- years
  avg_roof_size_sqft integer, -- estimated
  avg_home_value numeric(12,2),
  median_home_value numeric(12,2),
  
  -- Engagement Metrics
  reply_rate_pct numeric(5,2) DEFAULT 0,
  booked_inspections_count integer DEFAULT 0,
  jobs_won_count integer DEFAULT 0,
  avg_job_value numeric(12,2) DEFAULT 0,
  
  -- Storm Intelligence
  storm_risk text CHECK (storm_risk IN ('low', 'medium', 'high')) DEFAULT 'low',
  storm_history_count integer DEFAULT 0,
  last_storm_date timestamptz,
  
  -- Demographics (from census/public data)
  avg_income numeric(10,2),
  median_income numeric(10,2),
  income_band text CHECK (income_band IN ('low', 'medium', 'high', 'luxury')) DEFAULT 'medium',
  
  -- Trending Interest
  trending_interest_score integer DEFAULT 0 CHECK (trending_interest_score >= 0 AND trending_interest_score <= 100),
  interest_trend text CHECK (interest_trend IN ('rising', 'stable', 'declining')) DEFAULT 'stable',
  
  -- Opportunity Score (0-10)
  opportunity_score integer DEFAULT 0 CHECK (opportunity_score >= 0 AND opportunity_score <= 10),
  
  -- Metadata
  last_updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(workspace_id, zip, COALESCE(neighborhood_name, ''))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_neighborhood_profiles_workspace ON public.neighborhood_profiles(workspace_id);
CREATE INDEX IF NOT EXISTS idx_neighborhood_profiles_zip ON public.neighborhood_profiles(zip);
CREATE INDEX IF NOT EXISTS idx_neighborhood_profiles_opportunity ON public.neighborhood_profiles(workspace_id, opportunity_score DESC);

-- ============================================================================
-- 3. HEATMAP_INSIGHTS TABLE
-- ============================================================================
-- AI-generated insights for heatmap actions

CREATE TABLE IF NOT EXISTS public.heatmap_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Insight Scope
  zip text,
  neighborhood_name text,
  insight_type text NOT NULL CHECK (insight_type IN ('engagement', 'pipeline', 'storm', 'opportunity', 'campaign_suggestion')),
  
  -- Insight Content
  insight_text text NOT NULL,
  insight_color text CHECK (insight_color IN ('green', 'yellow', 'blue', 'red')) DEFAULT 'blue',
  priority integer DEFAULT 0 CHECK (priority >= 0 AND priority <= 100),
  
  -- Action Suggestions
  suggested_action text,
  action_type text CHECK (action_type IN ('send_campaign', 'run_storm_campaign', 'book_inspections', 'door_knock', 'stop_campaign')),
  
  -- Metadata
  generated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_heatmap_insights_workspace ON public.heatmap_insights(workspace_id);
CREATE INDEX IF NOT EXISTS idx_heatmap_insights_zip ON public.heatmap_insights(zip);
CREATE INDEX IF NOT EXISTS idx_heatmap_insights_type ON public.heatmap_insights(workspace_id, insight_type);
CREATE INDEX IF NOT EXISTS idx_heatmap_insights_priority ON public.heatmap_insights(workspace_id, priority DESC);

-- ============================================================================
-- 4. FUNCTION: Calculate Neighborhood Heatmap Data
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_neighborhood_heatmap(
  p_workspace_id uuid,
  p_zip text DEFAULT NULL,
  p_neighborhood_name text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_zip_filter text;
  v_neighborhood_filter text;
BEGIN
  -- Build filters
  IF p_zip IS NOT NULL THEN
    v_zip_filter := format('AND zip = %L', p_zip);
  ELSE
    v_zip_filter := '';
  END IF;
  
  IF p_neighborhood_name IS NOT NULL THEN
    v_neighborhood_filter := format('AND neighborhood_name = %L', p_neighborhood_name);
  ELSE
    v_neighborhood_filter := '';
  END IF;
  
  -- Calculate heatmap data for each neighborhood/ZIP combination
  INSERT INTO public.neighborhood_heatmap_data (
    workspace_id,
    zip,
    neighborhood_name,
    city,
    state,
    total_sent,
    total_opens,
    total_clicks,
    total_replies,
    total_bookings,
    open_rate_pct,
    reply_rate_pct,
    booking_rate_pct,
    engagement_heat_score,
    engagement_heat_color,
    leads_in_lead_in,
    leads_in_inspection_set,
    leads_in_quote_sent,
    leads_in_approved,
    leads_in_scheduled,
    leads_in_installed,
    total_active_jobs,
    total_revenue,
    avg_job_value,
    pipeline_heat_score,
    storm_severity_score,
    last_storm_date,
    storm_risk_level,
    opportunity_score,
    last_calculated_at
  )
  SELECT
    l.workspace_id,
    COALESCE(l.zip_code, l.zip, '') as zip,
    l.neighborhood_name,
    l.city,
    l.state,
    
    -- Engagement Metrics
    COUNT(DISTINCT CASE WHEN el.id IS NOT NULL THEN el.id END) as total_sent,
    COUNT(DISTINCT CASE WHEN ee.event_type = 'open' THEN ee.id END) as total_opens,
    COUNT(DISTINCT CASE WHEN ee.event_type = 'click' THEN ee.id END) as total_clicks,
    COUNT(DISTINCT CASE WHEN rt.id IS NOT NULL THEN rt.id END) as total_replies,
    COUNT(DISTINCT CASE WHEN l.roofing_pipeline_stage IN ('inspection_set', 'quote_sent', 'approved', 'scheduled', 'installed') THEN l.id END) as total_bookings,
    
    -- Calculate rates
    CASE 
      WHEN COUNT(DISTINCT el.id) > 0 
      THEN ROUND((COUNT(DISTINCT CASE WHEN ee.event_type = 'open' THEN ee.id END)::numeric / COUNT(DISTINCT el.id)::numeric) * 100, 2)
      ELSE 0
    END as open_rate_pct,
    
    CASE 
      WHEN COUNT(DISTINCT el.id) > 0 
      THEN ROUND((COUNT(DISTINCT CASE WHEN rt.id IS NOT NULL THEN rt.id END)::numeric / COUNT(DISTINCT el.id)::numeric) * 100, 2)
      ELSE 0
    END as reply_rate_pct,
    
    CASE 
      WHEN COUNT(DISTINCT el.id) > 0 
      THEN ROUND((COUNT(DISTINCT CASE WHEN l.roofing_pipeline_stage IN ('inspection_set', 'quote_sent', 'approved', 'scheduled', 'installed') THEN l.id END)::numeric / COUNT(DISTINCT el.id)::numeric) * 100, 2)
      ELSE 0
    END as booking_rate_pct,
    
    -- Engagement Heat Score (0-100)
    LEAST(100, GREATEST(0,
      (CASE WHEN COUNT(DISTINCT el.id) > 0 
        THEN (COUNT(DISTINCT CASE WHEN ee.event_type = 'open' THEN ee.id END)::numeric / COUNT(DISTINCT el.id)::numeric) * 30
        ELSE 0 END) +
      (CASE WHEN COUNT(DISTINCT el.id) > 0 
        THEN (COUNT(DISTINCT CASE WHEN rt.id IS NOT NULL THEN rt.id END)::numeric / COUNT(DISTINCT el.id)::numeric) * 50
        ELSE 0 END) +
      (CASE WHEN COUNT(DISTINCT el.id) > 0 
        THEN (COUNT(DISTINCT CASE WHEN l.roofing_pipeline_stage IN ('inspection_set', 'quote_sent', 'approved', 'scheduled', 'installed') THEN l.id END)::numeric / COUNT(DISTINCT el.id)::numeric) * 20
        ELSE 0 END)
    ))::integer as engagement_heat_score,
    
    -- Engagement Heat Color
    CASE 
      WHEN LEAST(100, GREATEST(0,
        (CASE WHEN COUNT(DISTINCT el.id) > 0 
          THEN (COUNT(DISTINCT CASE WHEN ee.event_type = 'open' THEN ee.id END)::numeric / COUNT(DISTINCT el.id)::numeric) * 30
          ELSE 0 END) +
        (CASE WHEN COUNT(DISTINCT el.id) > 0 
          THEN (COUNT(DISTINCT CASE WHEN rt.id IS NOT NULL THEN rt.id END)::numeric / COUNT(DISTINCT el.id)::numeric) * 50
          ELSE 0 END) +
        (CASE WHEN COUNT(DISTINCT el.id) > 0 
          THEN (COUNT(DISTINCT CASE WHEN l.roofing_pipeline_stage IN ('inspection_set', 'quote_sent', 'approved', 'scheduled', 'installed') THEN l.id END)::numeric / COUNT(DISTINCT el.id)::numeric) * 20
          ELSE 0 END)
      )) >= 70 THEN 'green'
      WHEN LEAST(100, GREATEST(0,
        (CASE WHEN COUNT(DISTINCT el.id) > 0 
          THEN (COUNT(DISTINCT CASE WHEN ee.event_type = 'open' THEN ee.id END)::numeric / COUNT(DISTINCT el.id)::numeric) * 30
          ELSE 0 END) +
        (CASE WHEN COUNT(DISTINCT el.id) > 0 
          THEN (COUNT(DISTINCT CASE WHEN rt.id IS NOT NULL THEN rt.id END)::numeric / COUNT(DISTINCT el.id)::numeric) * 50
          ELSE 0 END) +
        (CASE WHEN COUNT(DISTINCT el.id) > 0 
          THEN (COUNT(DISTINCT CASE WHEN l.roofing_pipeline_stage IN ('inspection_set', 'quote_sent', 'approved', 'scheduled', 'installed') THEN l.id END)::numeric / COUNT(DISTINCT el.id)::numeric) * 20
          ELSE 0 END)
      )) >= 40 THEN 'yellow'
      ELSE 'red'
    END as engagement_heat_color,
    
    -- Pipeline Metrics
    COUNT(DISTINCT CASE WHEN l.roofing_pipeline_stage = 'lead_in' THEN l.id END) as leads_in_lead_in,
    COUNT(DISTINCT CASE WHEN l.roofing_pipeline_stage = 'inspection_set' THEN l.id END) as leads_in_inspection_set,
    COUNT(DISTINCT CASE WHEN l.roofing_pipeline_stage = 'quote_sent' THEN l.id END) as leads_in_quote_sent,
    COUNT(DISTINCT CASE WHEN l.roofing_pipeline_stage = 'approved' THEN l.id END) as leads_in_approved,
    COUNT(DISTINCT CASE WHEN l.roofing_pipeline_stage = 'scheduled' THEN l.id END) as leads_in_scheduled,
    COUNT(DISTINCT CASE WHEN l.roofing_pipeline_stage = 'installed' THEN l.id END) as leads_in_installed,
    
    COUNT(DISTINCT CASE WHEN l.roofing_pipeline_stage IN ('inspection_set', 'quote_sent', 'approved', 'scheduled', 'installed') THEN l.id END) as total_active_jobs,
    COALESCE(SUM(l.estimated_job_value), 0) as total_revenue,
    CASE 
      WHEN COUNT(DISTINCT CASE WHEN l.estimated_job_value IS NOT NULL THEN l.id END) > 0
      THEN ROUND(AVG(l.estimated_job_value), 2)
      ELSE 0
    END as avg_job_value,
    
    -- Pipeline Heat Score (based on active jobs and revenue)
    LEAST(100, GREATEST(0,
      (COUNT(DISTINCT CASE WHEN l.roofing_pipeline_stage IN ('inspection_set', 'quote_sent', 'approved', 'scheduled', 'installed') THEN l.id END) * 2) +
      (CASE WHEN COALESCE(SUM(l.estimated_job_value), 0) > 0 THEN LEAST(50, (COALESCE(SUM(l.estimated_job_value), 0) / 100000) * 10) ELSE 0 END)
    ))::integer as pipeline_heat_score,
    
    -- Storm Metrics (from geo_zip_data or geo_storm_zones)
    COALESCE(gzd.storm_severity_score, 0) as storm_severity_score,
    gzd.last_storm_date,
    COALESCE(gzd.storm_risk, 'low') as storm_risk_level,
    
    -- Opportunity Score (composite)
    LEAST(100, GREATEST(0,
      (LEAST(100, GREATEST(0,
        (CASE WHEN COUNT(DISTINCT el.id) > 0 
          THEN (COUNT(DISTINCT CASE WHEN ee.event_type = 'open' THEN ee.id END)::numeric / COUNT(DISTINCT el.id)::numeric) * 30
          ELSE 0 END) +
        (CASE WHEN COUNT(DISTINCT el.id) > 0 
          THEN (COUNT(DISTINCT CASE WHEN rt.id IS NOT NULL THEN rt.id END)::numeric / COUNT(DISTINCT el.id)::numeric) * 50
          ELSE 0 END) +
        (CASE WHEN COUNT(DISTINCT el.id) > 0 
          THEN (COUNT(DISTINCT CASE WHEN l.roofing_pipeline_stage IN ('inspection_set', 'quote_sent', 'approved', 'scheduled', 'installed') THEN l.id END)::numeric / COUNT(DISTINCT el.id)::numeric) * 20
          ELSE 0 END)
      )) * 0.4) +
      ((LEAST(100, GREATEST(0,
        (COUNT(DISTINCT CASE WHEN l.roofing_pipeline_stage IN ('inspection_set', 'quote_sent', 'approved', 'scheduled', 'installed') THEN l.id END) * 2) +
        (CASE WHEN COALESCE(SUM(l.estimated_job_value), 0) > 0 THEN LEAST(50, (COALESCE(SUM(l.estimated_job_value), 0) / 100000) * 10) ELSE 0 END)
      ))) * 0.3) +
      (COALESCE(gzd.storm_severity_score, 0) * 0.3)
    ))::integer as opportunity_score,
    
    now() as last_calculated_at
    
  FROM public.leads l
  LEFT JOIN public.email_logs el ON el.lead_id = l.id
  LEFT JOIN public.email_events ee ON ee.lead_id = l.id
  LEFT JOIN public.reply_threads rt ON rt.lead_id = l.id
  LEFT JOIN public.geo_zip_data gzd ON gzd.workspace_id = l.workspace_id AND gzd.zip = COALESCE(l.zip_code, l.zip)
  WHERE l.workspace_id = p_workspace_id
    AND (p_zip IS NULL OR COALESCE(l.zip_code, l.zip) = p_zip)
    AND (p_neighborhood_name IS NULL OR l.neighborhood_name = p_neighborhood_name)
  GROUP BY 
    l.workspace_id,
    COALESCE(l.zip_code, l.zip),
    l.neighborhood_name,
    l.city,
    l.state,
    gzd.storm_severity_score,
    gzd.last_storm_date,
    gzd.storm_risk
  ON CONFLICT (workspace_id, zip, COALESCE(neighborhood_name, ''))
  DO UPDATE SET
    total_sent = EXCLUDED.total_sent,
    total_opens = EXCLUDED.total_opens,
    total_clicks = EXCLUDED.total_clicks,
    total_replies = EXCLUDED.total_replies,
    total_bookings = EXCLUDED.total_bookings,
    open_rate_pct = EXCLUDED.open_rate_pct,
    reply_rate_pct = EXCLUDED.reply_rate_pct,
    booking_rate_pct = EXCLUDED.booking_rate_pct,
    engagement_heat_score = EXCLUDED.engagement_heat_score,
    engagement_heat_color = EXCLUDED.engagement_heat_color,
    leads_in_lead_in = EXCLUDED.leads_in_lead_in,
    leads_in_inspection_set = EXCLUDED.leads_in_inspection_set,
    leads_in_quote_sent = EXCLUDED.leads_in_quote_sent,
    leads_in_approved = EXCLUDED.leads_in_approved,
    leads_in_scheduled = EXCLUDED.leads_in_scheduled,
    leads_in_installed = EXCLUDED.leads_in_installed,
    total_active_jobs = EXCLUDED.total_active_jobs,
    total_revenue = EXCLUDED.total_revenue,
    avg_job_value = EXCLUDED.avg_job_value,
    pipeline_heat_score = EXCLUDED.pipeline_heat_score,
    storm_severity_score = EXCLUDED.storm_severity_score,
    last_storm_date = EXCLUDED.last_storm_date,
    storm_risk_level = EXCLUDED.storm_risk_level,
    opportunity_score = EXCLUDED.opportunity_score,
    last_calculated_at = EXCLUDED.last_calculated_at,
    updated_at = now();
END;
$$;

COMMENT ON FUNCTION public.calculate_neighborhood_heatmap IS 'Calculates and updates neighborhood heatmap data for engagement, pipeline, and storm layers (Block 24580)';

-- ============================================================================
-- 5. FUNCTION: Generate Heatmap Insights
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_heatmap_insights(
  p_workspace_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_insight RECORD;
BEGIN
  -- Clear old insights
  DELETE FROM public.heatmap_insights 
  WHERE workspace_id = p_workspace_id 
    AND (expires_at IS NULL OR expires_at < now());
  
  -- Generate engagement insights
  FOR v_insight IN
    SELECT 
      zip,
      neighborhood_name,
      reply_rate_pct,
      open_rate_pct,
      booking_rate_pct,
      engagement_heat_color
    FROM public.neighborhood_heatmap_data
    WHERE workspace_id = p_workspace_id
      AND total_sent >= 10 -- Only neighborhoods with meaningful data
    ORDER BY reply_rate_pct DESC NULLS LAST
    LIMIT 10
  LOOP
    IF v_insight.reply_rate_pct > 30 THEN
      INSERT INTO public.heatmap_insights (
        workspace_id,
        zip,
        neighborhood_name,
        insight_type,
        insight_text,
        insight_color,
        priority,
        suggested_action,
        action_type
      ) VALUES (
        p_workspace_id,
        v_insight.zip,
        v_insight.neighborhood_name,
        'engagement',
        format('%s has %.1f%% reply rate — send more campaigns here.', 
          COALESCE(v_insight.neighborhood_name, v_insight.zip), 
          v_insight.reply_rate_pct),
        'green',
        90,
        'Send revival campaign to hot zones',
        'send_campaign'
      );
    ELSIF v_insight.open_rate_pct > 50 AND v_insight.reply_rate_pct < 10 THEN
      INSERT INTO public.heatmap_insights (
        workspace_id,
        zip,
        neighborhood_name,
        insight_type,
        insight_text,
        insight_color,
        priority,
        suggested_action,
        action_type
      ) VALUES (
        p_workspace_id,
        v_insight.zip,
        v_insight.neighborhood_name,
        'engagement',
        format('%s opens well but rarely books — adjust messaging.', 
          COALESCE(v_insight.neighborhood_name, v_insight.zip)),
        'yellow',
        60,
        'Adjust campaign messaging',
        'send_campaign'
      );
    ELSIF v_insight.engagement_heat_color = 'red' AND v_insight.total_sent > 20 THEN
      INSERT INTO public.heatmap_insights (
        workspace_id,
        zip,
        neighborhood_name,
        insight_type,
        insight_text,
        insight_color,
        priority,
        suggested_action,
        action_type
      ) VALUES (
        p_workspace_id,
        v_insight.zip,
        v_insight.neighborhood_name,
        'engagement',
        format('%s is cold — stop sending campaigns to avoid domain damage.', 
          COALESCE(v_insight.neighborhood_name, v_insight.zip)),
        'red',
        40,
        'Stop sending campaigns',
        'stop_campaign'
      );
    END IF;
  END LOOP;
  
  -- Generate storm insights
  FOR v_insight IN
    SELECT 
      zip,
      neighborhood_name,
      storm_severity_score,
      storm_risk_level,
      last_storm_date
    FROM public.neighborhood_heatmap_data
    WHERE workspace_id = p_workspace_id
      AND storm_severity_score >= 50
      AND last_storm_date > now() - INTERVAL '30 days'
    ORDER BY storm_severity_score DESC
    LIMIT 5
  LOOP
    INSERT INTO public.heatmap_insights (
      workspace_id,
      zip,
      neighborhood_name,
      insight_type,
      insight_text,
      insight_color,
      priority,
      suggested_action,
      action_type
    ) VALUES (
      p_workspace_id,
      v_insight.zip,
      v_insight.neighborhood_name,
      'storm',
      format('Storm zone detected in %s — run storm outreach now.', 
        COALESCE(v_insight.neighborhood_name, v_insight.zip)),
      'blue',
      95,
      'Run storm campaign for affected neighborhoods',
      'run_storm_campaign'
    );
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.generate_heatmap_insights IS 'Generates AI insights for heatmap actions (Block 24580)';

-- ============================================================================
-- 6. FUNCTION: Update Neighborhood Profile
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_neighborhood_profile(
  p_workspace_id uuid,
  p_zip text,
  p_neighborhood_name text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.neighborhood_profiles (
    workspace_id,
    zip,
    neighborhood_name,
    city,
    state,
    avg_home_age,
    avg_roof_size_sqft,
    avg_home_value,
    median_home_value,
    reply_rate_pct,
    booked_inspections_count,
    jobs_won_count,
    avg_job_value,
    storm_risk,
    storm_history_count,
    last_storm_date,
    avg_income,
    median_income,
    income_band,
    opportunity_score,
    last_updated_at
  )
  SELECT
    nhd.workspace_id,
    nhd.zip,
    nhd.neighborhood_name,
    nhd.city,
    nhd.state,
    
    -- Property Intelligence (from geo_zip_data or leads)
    COALESCE(gzd.avg_roof_age, 0) as avg_home_age,
    NULL as avg_roof_size_sqft, -- Would need property data
    COALESCE(gzd.avg_home_value, 0) as avg_home_value,
    COALESCE(gzd.median_home_value, 0) as median_home_value,
    
    -- Engagement Metrics
    nhd.reply_rate_pct,
    nhd.total_bookings as booked_inspections_count,
    nhd.leads_in_installed as jobs_won_count,
    nhd.avg_job_value,
    
    -- Storm Intelligence
    nhd.storm_risk_level as storm_risk,
    COALESCE(gzd.storm_frequency_90d, 0) as storm_history_count,
    nhd.last_storm_date,
    
    -- Demographics
    COALESCE(gzd.avg_income, 0) as avg_income,
    COALESCE(gzd.median_income, 0) as median_income,
    CASE 
      WHEN COALESCE(gzd.avg_income, 0) >= 150000 THEN 'luxury'
      WHEN COALESCE(gzd.avg_income, 0) >= 100000 THEN 'high'
      WHEN COALESCE(gzd.avg_income, 0) >= 50000 THEN 'medium'
      ELSE 'low'
    END as income_band,
    
    -- Opportunity Score (0-10)
    CASE 
      WHEN nhd.opportunity_score >= 80 THEN 10
      WHEN nhd.opportunity_score >= 60 THEN 8
      WHEN nhd.opportunity_score >= 40 THEN 6
      WHEN nhd.opportunity_score >= 20 THEN 4
      ELSE 2
    END as opportunity_score,
    
    now() as last_updated_at
    
  FROM public.neighborhood_heatmap_data nhd
  LEFT JOIN public.geo_zip_data gzd ON gzd.workspace_id = nhd.workspace_id AND gzd.zip = nhd.zip
  WHERE nhd.workspace_id = p_workspace_id
    AND nhd.zip = p_zip
    AND (p_neighborhood_name IS NULL OR nhd.neighborhood_name = p_neighborhood_name)
  LIMIT 1
  ON CONFLICT (workspace_id, zip, COALESCE(neighborhood_name, ''))
  DO UPDATE SET
    avg_home_age = EXCLUDED.avg_home_age,
    avg_home_value = EXCLUDED.avg_home_value,
    median_home_value = EXCLUDED.median_home_value,
    reply_rate_pct = EXCLUDED.reply_rate_pct,
    booked_inspections_count = EXCLUDED.booked_inspections_count,
    jobs_won_count = EXCLUDED.jobs_won_count,
    avg_job_value = EXCLUDED.avg_job_value,
    storm_risk = EXCLUDED.storm_risk,
    storm_history_count = EXCLUDED.storm_history_count,
    last_storm_date = EXCLUDED.last_storm_date,
    avg_income = EXCLUDED.avg_income,
    median_income = EXCLUDED.median_income,
    income_band = EXCLUDED.income_band,
    opportunity_score = EXCLUDED.opportunity_score,
    last_updated_at = now();
END;
$$;

COMMENT ON FUNCTION public.update_neighborhood_profile IS 'Updates neighborhood profile with comprehensive intelligence (Block 24580)';

-- ============================================================================
-- 7. RLS POLICIES
-- ============================================================================

ALTER TABLE public.neighborhood_heatmap_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.neighborhood_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.heatmap_insights ENABLE ROW LEVEL SECURITY;

-- Heatmap data: workspace members can read
CREATE POLICY "heatmap_data_workspace_read" ON public.neighborhood_heatmap_data
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = neighborhood_heatmap_data.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Neighborhood profiles: workspace members can read
CREATE POLICY "neighborhood_profiles_workspace_read" ON public.neighborhood_profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = neighborhood_profiles.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Heatmap insights: workspace members can read
CREATE POLICY "heatmap_insights_workspace_read" ON public.heatmap_insights
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = heatmap_insights.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 8. GRANTS
-- ============================================================================

GRANT SELECT ON public.neighborhood_heatmap_data TO authenticated;
GRANT SELECT ON public.neighborhood_profiles TO authenticated;
GRANT SELECT ON public.heatmap_insights TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_neighborhood_heatmap TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_heatmap_insights TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_neighborhood_profile TO authenticated;






































