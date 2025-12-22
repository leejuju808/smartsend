-- =========================================================
-- Block 19960 — SmartSend Inbox Storm Watch v1
-- (Real-Time Weather Alerts, Hail/Wind Event Detection, Automatic Lead Prioritization, and Storm-Triggered Outreach)
-- =========================================================

-- ============================================================================
-- PART 1 — Storm Event Feed (Zip Code–Based)
-- ============================================================================
-- Stores weather alerts from external APIs (NOAA, hail maps, wind alerts)

CREATE TABLE IF NOT EXISTS public.storm_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Event Type & Details
  event_type text NOT NULL CHECK (event_type IN ('hail', 'wind', 'heavy_rain', 'severe_weather', 'tornado_warning')),
  intensity text CHECK (intensity IN ('light', 'medium', 'heavy', 'severe', 'extreme')),
  
  -- Hail Specific
  hail_size_inches numeric(4,2), -- Hail size in inches (e.g., 1.5 for golf ball size)
  hail_size_category text CHECK (hail_size_category IN ('pea', 'marble', 'penny', 'nickel', 'quarter', 'half_dollar', 'walnut', 'golf_ball', 'tennis_ball', 'baseball', 'softball')),
  
  -- Wind Specific
  wind_speed_mph integer, -- Wind speed in MPH
  wind_gust_mph integer, -- Wind gust speed in MPH
  
  -- Rain Specific
  rainfall_inches numeric(5,2), -- Rainfall in inches
  
  -- Location
  affected_zip text NOT NULL,
  affected_city text,
  affected_state text,
  affected_county text,
  
  -- Event Timing
  event_started_at timestamptz NOT NULL,
  event_ended_at timestamptz,
  detected_at timestamptz NOT NULL DEFAULT now(),
  
  -- Source & Metadata
  source text DEFAULT 'noaa', -- 'noaa', 'hail_map', 'wind_alert', 'manual'
  source_id text, -- External ID from source API
  metadata jsonb DEFAULT '{}'::jsonb, -- Additional data from source
  
  -- Processing Status
  processed boolean DEFAULT false,
  processed_at timestamptz,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(workspace_id, source, source_id, affected_zip, event_started_at)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_storm_events_workspace ON public.storm_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_storm_events_zip ON public.storm_events(affected_zip);
CREATE INDEX IF NOT EXISTS idx_storm_events_type ON public.storm_events(event_type);
CREATE INDEX IF NOT EXISTS idx_storm_events_date ON public.storm_events(event_started_at DESC);
CREATE INDEX IF NOT EXISTS idx_storm_events_processed ON public.storm_events(workspace_id, processed, event_started_at DESC);
CREATE INDEX IF NOT EXISTS idx_storm_events_workspace_zip_date ON public.storm_events(workspace_id, affected_zip, event_started_at DESC);

-- ============================================================================
-- PART 2 — Storm-Tagged Leads in Inbox
-- ============================================================================
-- Add storm-related fields to inbox_threads

ALTER TABLE IF EXISTS public.inbox_threads
  -- Storm Detection Flags
  ADD COLUMN IF NOT EXISTS storm_hit boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS storm_tag text, -- 'Storm-Damage Likely', 'Storm Opportunity', etc.
  ADD COLUMN IF NOT EXISTS storm_severity text CHECK (storm_severity IN ('light', 'medium', 'heavy', 'severe')),
  ADD COLUMN IF NOT EXISTS last_storm_event_id uuid REFERENCES public.storm_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS storm_boosted_at timestamptz, -- When storm boost was applied
  
  -- Storm Metadata
  ADD COLUMN IF NOT EXISTS storm_metadata jsonb DEFAULT '{}'::jsonb; -- Stores storm event details, boost factors, etc.

-- Indexes for storm filtering
CREATE INDEX IF NOT EXISTS idx_threads_storm_hit ON public.inbox_threads(campaign_id, storm_hit) WHERE storm_hit = true;
CREATE INDEX IF NOT EXISTS idx_threads_storm_severity ON public.inbox_threads(campaign_id, storm_severity) WHERE storm_hit = true;
CREATE INDEX IF NOT EXISTS idx_threads_storm_boosted ON public.inbox_threads(campaign_id, storm_boosted_at DESC) WHERE storm_hit = true;

-- ============================================================================
-- PART 3 — Storm Lead Matches Table
-- ============================================================================
-- Tracks which leads are affected by which storm events

CREATE TABLE IF NOT EXISTS public.storm_lead_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storm_event_id uuid NOT NULL REFERENCES public.storm_events(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE SET NULL,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Match Details
  lead_zip text NOT NULL,
  match_type text DEFAULT 'zip_match', -- 'zip_match', 'radius_match', 'manual'
  distance_miles numeric(5,2), -- Distance from storm center (if available)
  
  -- Boost Applied
  insurance_probability_before integer, -- Before storm boost
  insurance_probability_after integer, -- After storm boost
  job_type_before text,
  job_type_after text,
  value_estimate_before numeric(12,2),
  value_estimate_after numeric(12,2),
  
  -- Outreach Status
  outreach_sent boolean DEFAULT false,
  outreach_sent_at timestamptz,
  outreach_method text CHECK (outreach_method IN ('sms', 'email', 'both')),
  
  -- Follow-up Status
  follow_up_task_created boolean DEFAULT false,
  follow_up_task_id uuid, -- Reference to tasks table if exists
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(storm_event_id, lead_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_storm_lead_matches_storm ON public.storm_lead_matches(storm_event_id);
CREATE INDEX IF NOT EXISTS idx_storm_lead_matches_lead ON public.storm_lead_matches(lead_id);
CREATE INDEX IF NOT EXISTS idx_storm_lead_matches_thread ON public.storm_lead_matches(thread_id);
CREATE INDEX IF NOT EXISTS idx_storm_lead_matches_workspace ON public.storm_lead_matches(workspace_id);
CREATE INDEX IF NOT EXISTS idx_storm_lead_matches_outreach ON public.storm_lead_matches(workspace_id, outreach_sent, created_at DESC);

-- ============================================================================
-- PART 4 — Storm AI Scripts Table
-- ============================================================================
-- Stores AI-generated outreach scripts for different storm types

CREATE TABLE IF NOT EXISTS public.storm_outreach_scripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Script Details
  event_type text NOT NULL CHECK (event_type IN ('hail', 'wind', 'heavy_rain', 'severe_weather')),
  intensity text CHECK (intensity IN ('light', 'medium', 'heavy', 'severe')),
  
  -- Script Content
  script_name text NOT NULL,
  sms_template text,
  email_subject text,
  email_body text,
  
  -- AI Generation Metadata
  ai_generated boolean DEFAULT true,
  generation_prompt text,
  customizations jsonb DEFAULT '{}'::jsonb,
  
  -- Usage Stats
  times_used integer DEFAULT 0,
  last_used_at timestamptz,
  
  -- Default/Workspace Custom
  is_default boolean DEFAULT false,
  is_active boolean DEFAULT true,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_storm_scripts_workspace ON public.storm_outreach_scripts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_storm_scripts_type ON public.storm_outreach_scripts(event_type, intensity);
CREATE INDEX IF NOT EXISTS idx_storm_scripts_default ON public.storm_outreach_scripts(is_default, event_type, intensity) WHERE is_default = true;

-- Insert default scripts
INSERT INTO public.storm_outreach_scripts (event_type, intensity, script_name, sms_template, email_subject, email_body, is_default)
VALUES
  ('hail', 'medium', 'Hail Storm - Free Inspection', 
   'There was hail in your area today — want a free roof check?', 
   'Hail in Your Area Today - Free Roof Inspection',
   'Hi {{first_name}},\n\nWe noticed there was hail in your area today. We''re offering free roof inspections this week to check for any damage.\n\nWould you like us to swing by?',
   true),
  ('wind', 'heavy', 'Wind Storm - Shingle Check',
   'Strong winds hit your neighborhood last night. We can check for lifted shingles today.',
   'Wind Damage Check Available',
   'Hi {{first_name}},\n\nStrong winds hit your neighborhood last night. We can check for lifted shingles or other wind damage today.\n\nWant us to come out?',
   true),
  ('heavy_rain', 'medium', 'Heavy Rain - Leak Check',
   'If you saw any leaks after today''s rain, we can come out ASAP.',
   'Leak After Today''s Rain?',
   'Hi {{first_name}},\n\nIf you noticed any leaks after today''s heavy rain, we can come out ASAP to assess the damage.\n\nLet us know!',
   true)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- PART 5 — Functions: Detect Affected Leads
-- ============================================================================

-- Function to find leads affected by a storm event
CREATE OR REPLACE FUNCTION public.find_storm_affected_leads(
  p_storm_event_id uuid,
  p_workspace_id uuid
)
RETURNS TABLE (
  lead_id uuid,
  thread_id uuid,
  lead_zip text,
  match_type text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_storm_event public.storm_events%ROWTYPE;
  v_zip text;
BEGIN
  -- Get storm event details
  SELECT * INTO v_storm_event
  FROM public.storm_events
  WHERE id = p_storm_event_id
    AND workspace_id = p_workspace_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Storm event not found';
  END IF;
  
  v_zip := v_storm_event.affected_zip;
  
  -- Find leads in the affected ZIP code
  -- Match leads that have threads in campaigns for this workspace
  RETURN QUERY
  SELECT DISTINCT
    l.id as lead_id,
    it.id as thread_id,
    COALESCE(l.zip, '') as lead_zip,
    'zip_match'::text as match_type
  FROM public.leads l
  INNER JOIN public.inbox_threads it ON it.lead_id = l.id
  INNER JOIN public.campaigns c ON c.id = it.campaign_id
  WHERE l.zip = v_zip
    AND c.workspace_id = p_workspace_id
    AND NOT EXISTS (
      SELECT 1 FROM public.storm_lead_matches slm
      WHERE slm.storm_event_id = p_storm_event_id
        AND slm.lead_id = l.id
    );
END;
$$;

-- ============================================================================
-- PART 6 — Functions: Apply Storm Boost to Leads
-- ============================================================================

-- Function to calculate insurance probability boost based on storm
CREATE OR REPLACE FUNCTION public.calculate_storm_insurance_boost(
  p_event_type text,
  p_intensity text,
  p_hail_size numeric DEFAULT NULL,
  p_wind_speed integer DEFAULT NULL,
  p_current_probability integer DEFAULT 0
)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_boost integer := 0;
BEGIN
  -- Base boost by event type
  CASE p_event_type
    WHEN 'hail' THEN
      v_boost := CASE p_intensity
        WHEN 'light' THEN 15
        WHEN 'medium' THEN 30
        WHEN 'heavy' THEN 50
        WHEN 'severe' THEN 65
        WHEN 'extreme' THEN 80
        ELSE 20
      END;
      -- Additional boost for larger hail
      IF p_hail_size IS NOT NULL THEN
        IF p_hail_size >= 1.0 THEN v_boost := v_boost + 20; -- Golf ball+
        ELSIF p_hail_size >= 0.75 THEN v_boost := v_boost + 15; -- Quarter+
        ELSIF p_hail_size >= 0.5 THEN v_boost := v_boost + 10; -- Half dollar+
        END IF;
      END IF;
    
    WHEN 'wind' THEN
      v_boost := CASE p_intensity
        WHEN 'light' THEN 10
        WHEN 'medium' THEN 25
        WHEN 'heavy' THEN 45
        WHEN 'severe' THEN 60
        WHEN 'extreme' THEN 75
        ELSE 15
      END;
      -- Additional boost for high wind speeds
      IF p_wind_speed IS NOT NULL THEN
        IF p_wind_speed >= 70 THEN v_boost := v_boost + 20; -- Hurricane force
        ELSIF p_wind_speed >= 58 THEN v_boost := v_boost + 15; -- Storm force
        ELSIF p_wind_speed >= 50 THEN v_boost := v_boost + 10; -- Strong wind
        END IF;
      END IF;
    
    WHEN 'heavy_rain' THEN
      v_boost := CASE p_intensity
        WHEN 'light' THEN 5
        WHEN 'medium' THEN 15
        WHEN 'heavy' THEN 30
        WHEN 'severe' THEN 45
        ELSE 10
      END;
    
    WHEN 'severe_weather' THEN
      v_boost := 40;
    
    WHEN 'tornado_warning' THEN
      v_boost := 70;
    
    ELSE
      v_boost := 10;
  END CASE;
  
  -- Cap boost based on current probability (don't over-boost already high probabilities)
  -- Maximum boost is higher for lower current probabilities
  IF p_current_probability < 20 THEN
    v_boost := LEAST(v_boost, 80); -- Can boost up to 80 points
  ELSIF p_current_probability < 50 THEN
    v_boost := LEAST(v_boost, 50); -- Can boost up to 50 points
  ELSE
    v_boost := LEAST(v_boost, 30); -- Can boost up to 30 points
  END IF;
  
  -- Return new probability (capped at 95)
  RETURN LEAST(p_current_probability + v_boost, 95);
END;
$$;

-- Function to determine job type boost
CREATE OR REPLACE FUNCTION public.calculate_storm_job_type(
  p_event_type text,
  p_intensity text,
  p_current_job_type text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- If already replacement, keep it
  IF p_current_job_type = 'replacement' THEN
    RETURN 'replacement';
  END IF;
  
  -- Determine new job type based on storm
  CASE p_event_type
    WHEN 'hail' THEN
      RETURN CASE p_intensity
        WHEN 'severe', 'extreme' THEN 'replacement'
        WHEN 'heavy' THEN COALESCE(p_current_job_type, 'replacement')
        ELSE COALESCE(p_current_job_type, 'repair')
      END;
    
    WHEN 'wind' THEN
      RETURN CASE p_intensity
        WHEN 'severe', 'extreme' THEN 'replacement'
        WHEN 'heavy' THEN COALESCE(p_current_job_type, 'repair')
        ELSE COALESCE(p_current_job_type, 'repair')
      END;
    
    WHEN 'heavy_rain' THEN
      RETURN COALESCE(p_current_job_type, 'repair');
    
    WHEN 'severe_weather', 'tornado_warning' THEN
      RETURN 'replacement';
    
    ELSE
      RETURN COALESCE(p_current_job_type, 'repair');
  END CASE;
END;
$$;

-- Function to calculate value estimate boost
CREATE OR REPLACE FUNCTION public.calculate_storm_value_boost(
  p_event_type text,
  p_intensity text,
  p_current_value numeric DEFAULT NULL,
  p_hail_size numeric DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_multiplier numeric := 1.0;
  v_base_value numeric;
BEGIN
  -- Use current value or default
  v_base_value := COALESCE(p_current_value, 5000);
  
  -- Calculate multiplier based on storm
  CASE p_event_type
    WHEN 'hail' THEN
      v_multiplier := CASE p_intensity
        WHEN 'light' THEN 1.2
        WHEN 'medium' THEN 1.5
        WHEN 'heavy' THEN 2.0
        WHEN 'severe' THEN 2.5
        WHEN 'extreme' THEN 3.0
        ELSE 1.3
      END;
      -- Additional multiplier for large hail
      IF p_hail_size IS NOT NULL AND p_hail_size >= 1.0 THEN
        v_multiplier := v_multiplier * 1.3;
      END IF;
    
    WHEN 'wind' THEN
      v_multiplier := CASE p_intensity
        WHEN 'light' THEN 1.1
        WHEN 'medium' THEN 1.4
        WHEN 'heavy' THEN 1.8
        WHEN 'severe' THEN 2.2
        WHEN 'extreme' THEN 2.8
        ELSE 1.2
      END;
    
    WHEN 'heavy_rain' THEN
      v_multiplier := CASE p_intensity
        WHEN 'light' THEN 1.05
        WHEN 'medium' THEN 1.2
        WHEN 'heavy' THEN 1.5
        WHEN 'severe' THEN 1.8
        ELSE 1.1
      END;
    
    WHEN 'severe_weather' THEN
      v_multiplier := 2.0;
    
    WHEN 'tornado_warning' THEN
      v_multiplier := 3.0;
    
    ELSE
      v_multiplier := 1.2;
  END CASE;
  
  RETURN ROUND(v_base_value * v_multiplier, 2);
END;
$$;

-- ============================================================================
-- PART 7 — Function: Process Storm Event and Tag Leads
-- ============================================================================

CREATE OR REPLACE FUNCTION public.process_storm_event(
  p_storm_event_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_storm_event public.storm_events%ROWTYPE;
  v_lead_record RECORD;
  v_thread_record RECORD;
  v_affected_count integer := 0;
  v_boosted_count integer := 0;
  v_before_prob integer;
  v_after_prob integer;
  v_before_value numeric;
  v_after_value numeric;
  v_before_job_type text;
  v_after_job_type text;
BEGIN
  -- Get storm event
  SELECT * INTO v_storm_event
  FROM public.storm_events
  WHERE id = p_storm_event_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Storm event not found');
  END IF;
  
  -- Find affected leads
  FOR v_lead_record IN
    SELECT * FROM public.find_storm_affected_leads(p_storm_event_id, v_storm_event.workspace_id)
  LOOP
    v_affected_count := v_affected_count + 1;
    
    -- Get thread if exists
    SELECT * INTO v_thread_record
    FROM public.inbox_threads
    WHERE id = v_lead_record.thread_id;
    
    -- Get current values
    v_before_prob := COALESCE((v_thread_record.revenue_metadata->>'insurance_probability')::integer, 
                               v_thread_record.close_probability_score, 0);
    v_before_value := COALESCE(v_thread_record.thread_estimated_value, 5000);
    v_before_job_type := COALESCE(v_thread_record.revenue_metadata->>'job_type', 'repair');
    
    -- Calculate boosts
    v_after_prob := public.calculate_storm_insurance_boost(
      v_storm_event.event_type,
      v_storm_event.intensity,
      v_storm_event.hail_size_inches,
      v_storm_event.wind_speed_mph,
      v_before_prob
    );
    
    v_after_value := public.calculate_storm_value_boost(
      v_storm_event.event_type,
      v_storm_event.intensity,
      v_before_value,
      v_storm_event.hail_size_inches
    );
    
    v_after_job_type := public.calculate_storm_job_type(
      v_storm_event.event_type,
      v_storm_event.intensity,
      v_before_job_type
    );
    
    -- Update thread with storm boost
    IF v_thread_record.id IS NOT NULL THEN
      UPDATE public.inbox_threads
      SET
        storm_hit = true,
        storm_tag = 'Storm-Damage Likely',
        storm_severity = CASE v_storm_event.intensity
          WHEN 'light' THEN 'light'
          WHEN 'medium' THEN 'medium'
          WHEN 'heavy', 'severe' THEN 'heavy'
          WHEN 'extreme' THEN 'severe'
          ELSE 'medium'
        END,
        last_storm_event_id = p_storm_event_id,
        storm_boosted_at = now(),
        thread_estimated_value = v_after_value,
        close_probability_score = GREATEST(COALESCE(close_probability_score, 0), v_after_prob),
        revenue_metadata = COALESCE(revenue_metadata, '{}'::jsonb) || jsonb_build_object(
          'insurance_probability', v_after_prob,
          'job_type', v_after_job_type,
          'storm_boosted', true,
          'storm_event_id', p_storm_event_id::text,
          'storm_type', v_storm_event.event_type,
          'storm_intensity', v_storm_event.intensity
        ),
        updated_at = now()
      WHERE id = v_thread_record.id;
      
      v_boosted_count := v_boosted_count + 1;
    END IF;
    
    -- Create storm lead match record
    INSERT INTO public.storm_lead_matches (
      storm_event_id,
      lead_id,
      thread_id,
      workspace_id,
      lead_zip,
      match_type,
      insurance_probability_before,
      insurance_probability_after,
      job_type_before,
      job_type_after,
      value_estimate_before,
      value_estimate_after
    ) VALUES (
      p_storm_event_id,
      v_lead_record.lead_id,
      v_lead_record.thread_id,
      v_storm_event.workspace_id,
      v_lead_record.lead_zip,
      v_lead_record.match_type,
      v_before_prob,
      v_after_prob,
      v_before_job_type,
      v_after_job_type,
      v_before_value,
      v_after_value
    )
    ON CONFLICT (storm_event_id, lead_id) DO NOTHING;
  END LOOP;
  
  -- Mark storm event as processed
  UPDATE public.storm_events
  SET processed = true, processed_at = now()
  WHERE id = p_storm_event_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'storm_event_id', p_storm_event_id,
    'affected_leads', v_affected_count,
    'boosted_threads', v_boosted_count
  );
END;
$$;

-- ============================================================================
-- PART 8 — Storm Priority Queue View
-- ============================================================================

CREATE OR REPLACE VIEW public.storm_opportunities_queue AS
SELECT 
  it.id as thread_id,
  it.campaign_id,
  it.lead_id,
  c.workspace_id,
  it.storm_hit,
  it.storm_severity,
  it.storm_tag,
  it.thread_estimated_value,
  it.close_probability_score,
  it.pipeline_stage,
  it.last_contacted_at,
  it.last_message_at,
  it.storm_boosted_at,
  se.event_type,
  se.intensity,
  se.event_started_at,
  l.zip as lead_zip,
  l.first_name,
  l.last_name,
  l.email,
  c.name as campaign_name
FROM public.inbox_threads it
INNER JOIN public.storm_events se ON se.id = it.last_storm_event_id
INNER JOIN public.leads l ON l.id = it.lead_id
INNER JOIN public.campaigns c ON c.id = it.campaign_id
WHERE it.storm_hit = true
  AND it.pipeline_stage NOT IN ('won', 'lost');

-- ============================================================================
-- PART 9 — Storm Analytics Views
-- ============================================================================

-- Storm-Driven Revenue View
CREATE OR REPLACE VIEW public.storm_driven_revenue AS
SELECT 
  c.workspace_id,
  DATE_TRUNC('day', it.storm_boosted_at) as storm_date,
  COUNT(DISTINCT it.id) FILTER (WHERE it.pipeline_stage = 'won') as replacements_closed,
  COUNT(DISTINCT it.id) FILTER (WHERE it.pipeline_stage IN ('estimate_scheduled', 'estimate_completed')) as estimates_booked,
  COUNT(DISTINCT it.id) FILTER (WHERE it.pipeline_stage = 'pending_decision') as emergency_repairs,
  COALESCE(SUM(it.thread_estimated_value) FILTER (WHERE it.pipeline_stage = 'won'), 0) as revenue_closed,
  COALESCE(SUM(it.thread_estimated_value) FILTER (WHERE it.pipeline_stage NOT IN ('won', 'lost')), 0) as pipeline_value,
  COUNT(DISTINCT it.id) FILTER (WHERE it.storm_hit = true) as total_storm_leads
FROM public.inbox_threads it
INNER JOIN public.campaigns c ON c.id = it.campaign_id
WHERE it.storm_hit = true
  AND it.storm_boosted_at >= NOW() - INTERVAL '30 days'
GROUP BY c.workspace_id, DATE_TRUNC('day', it.storm_boosted_at);

-- Top ZIP Codes Hit View
CREATE OR REPLACE VIEW public.storm_top_zip_codes AS
SELECT 
  se.workspace_id,
  se.affected_zip,
  se.affected_city,
  se.affected_state,
  COUNT(DISTINCT se.id) as storm_count,
  COUNT(DISTINCT slm.lead_id) as affected_leads,
  COUNT(DISTINCT slm.thread_id) FILTER (WHERE slm.outreach_sent = true) as outreach_sent,
  MAX(se.hail_size_inches) as max_hail_size,
  MAX(se.wind_speed_mph) as max_wind_speed,
  MAX(se.event_started_at) as last_storm_date
FROM public.storm_events se
LEFT JOIN public.storm_lead_matches slm ON slm.storm_event_id = se.id
WHERE se.event_started_at >= NOW() - INTERVAL '30 days'
GROUP BY se.workspace_id, se.affected_zip, se.affected_city, se.affected_state
ORDER BY storm_count DESC, affected_leads DESC;

-- ============================================================================
-- PART 10 — Triggers
-- ============================================================================

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_storm_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_storm_events_updated_at ON public.storm_events;
CREATE TRIGGER trg_storm_events_updated_at
  BEFORE UPDATE ON public.storm_events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_storm_updated_at();

DROP TRIGGER IF EXISTS trg_storm_lead_matches_updated_at ON public.storm_lead_matches;
CREATE TRIGGER trg_storm_lead_matches_updated_at
  BEFORE UPDATE ON public.storm_lead_matches
  FOR EACH ROW
  EXECUTE FUNCTION public.update_storm_updated_at();

DROP TRIGGER IF EXISTS trg_storm_outreach_scripts_updated_at ON public.storm_outreach_scripts;
CREATE TRIGGER trg_storm_outreach_scripts_updated_at
  BEFORE UPDATE ON public.storm_outreach_scripts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_storm_updated_at();

-- ============================================================================
-- PART 11 — RLS Policies
-- ============================================================================

ALTER TABLE public.storm_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storm_lead_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storm_outreach_scripts ENABLE ROW LEVEL SECURITY;

-- Storm events: visible to workspace members
DROP POLICY IF EXISTS "storm_events_select" ON public.storm_events;
CREATE POLICY "storm_events_select"
  ON public.storm_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = storm_events.workspace_id
        AND user_id = auth.uid()
    )
  );

-- Storm lead matches: visible to workspace members
DROP POLICY IF EXISTS "storm_lead_matches_select" ON public.storm_lead_matches;
CREATE POLICY "storm_lead_matches_select"
  ON public.storm_lead_matches
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = storm_lead_matches.workspace_id
        AND user_id = auth.uid()
    )
  );

-- Storm scripts: visible to workspace members or default scripts
DROP POLICY IF EXISTS "storm_outreach_scripts_select" ON public.storm_outreach_scripts;
CREATE POLICY "storm_outreach_scripts_select"
  ON public.storm_outreach_scripts
  FOR SELECT
  USING (
    is_default = true
    OR EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = storm_outreach_scripts.workspace_id
        AND user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 12 — Comments
-- ============================================================================

COMMENT ON TABLE public.storm_events IS 'Stores weather alerts from external APIs (NOAA, hail maps, wind alerts). Foundation for storm detection system.';
COMMENT ON TABLE public.storm_lead_matches IS 'Tracks which leads are affected by which storm events. Links storms to leads and threads.';
COMMENT ON TABLE public.storm_outreach_scripts IS 'AI-generated outreach scripts for different storm types and intensities.';

COMMENT ON COLUMN public.inbox_threads.storm_hit IS 'True if this lead''s area was hit by a storm';
COMMENT ON COLUMN public.inbox_threads.storm_tag IS 'Tag displayed in inbox (e.g., "Storm-Damage Likely", "Storm Opportunity")';
COMMENT ON COLUMN public.inbox_threads.storm_severity IS 'Severity level: light, medium, heavy, severe';
COMMENT ON COLUMN public.inbox_threads.storm_boosted_at IS 'Timestamp when storm boost was applied to insurance probability and value';

COMMENT ON FUNCTION public.process_storm_event IS 'Processes a storm event: finds affected leads, applies boosts, tags threads';
COMMENT ON FUNCTION public.calculate_storm_insurance_boost IS 'Calculates insurance probability boost based on storm type and intensity';
COMMENT ON FUNCTION public.calculate_storm_job_type IS 'Determines job type (repair vs replacement) based on storm';
COMMENT ON FUNCTION public.calculate_storm_value_boost IS 'Calculates value estimate multiplier based on storm severity';

