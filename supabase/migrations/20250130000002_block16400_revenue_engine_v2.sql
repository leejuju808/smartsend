-- =========================================================
-- Block 16400 — SmartSend Revenue Engine v2
-- (Real Roofing Revenue Tracking: Quote Values, Insurance Estimates, Close Probabilities, Job Type Mapping & Forecasting)
-- =========================================================

-- ============================================================================
-- 1. ENHANCE CONTACTS TABLE WITH V2 REVENUE FIELDS
-- ============================================================================

-- Add close probability and additional revenue fields
ALTER TABLE IF EXISTS public.contacts
  ADD COLUMN IF NOT EXISTS close_probability integer CHECK (close_probability >= 0 AND close_probability <= 100),
  ADD COLUMN IF NOT EXISTS estimated_close_date date,
  ADD COLUMN IF NOT EXISTS quote_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS quote_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_quote_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS insurance_claim_value_min numeric(12,2),
  ADD COLUMN IF NOT EXISTS insurance_claim_value_max numeric(12,2),
  ADD COLUMN IF NOT EXISTS insurance_deductible numeric(12,2),
  ADD COLUMN IF NOT EXISTS insurance_claim_type text CHECK (insurance_claim_type IN ('ACV', 'RCV', 'unknown')),
  ADD COLUMN IF NOT EXISTS storm_impact_severity text CHECK (storm_impact_severity IN ('high', 'medium', 'low', 'none')),
  ADD COLUMN IF NOT EXISTS high_value_flag boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS home_value numeric(12,2),
  ADD COLUMN IF NOT EXISTS roof_size_sqft numeric(10,2),
  ADD COLUMN IF NOT EXISTS roof_age_years integer;

-- Update job_type check constraint to include all 7 revenue categories
DO $$
BEGIN
  -- Drop old constraint if exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'contacts_job_type_check'
  ) THEN
    ALTER TABLE public.contacts DROP CONSTRAINT contacts_job_type_check;
  END IF;
  
  -- Add new constraint with all 7 categories
  ALTER TABLE public.contacts
    ADD CONSTRAINT contacts_job_type_check 
    CHECK (job_type IN ('repair', 'replacement', 'insurance_claim', 'storm_damage', 'commercial', 'gutter', 'skylight', 'misc', 'unknown'));
END $$;

-- Update revenue_category check constraint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'contacts_revenue_category_check'
  ) THEN
    ALTER TABLE public.contacts DROP CONSTRAINT contacts_revenue_category_check;
  END IF;
  
  ALTER TABLE public.contacts
    ADD CONSTRAINT contacts_revenue_category_check 
    CHECK (revenue_category IN ('repair', 'replacement', 'insurance', 'storm', 'commercial', 'gutter', 'skylight', 'misc'));
END $$;

-- Indexes for new fields
CREATE INDEX IF NOT EXISTS idx_contacts_close_probability 
  ON public.contacts(workspace_id, close_probability DESC) 
  WHERE close_probability IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_quote_sent_at 
  ON public.contacts(workspace_id, quote_sent_at DESC) 
  WHERE quote_sent_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_high_value_flag 
  ON public.contacts(workspace_id, high_value_flag) 
  WHERE high_value_flag = true;

CREATE INDEX IF NOT EXISTS idx_contacts_storm_impact 
  ON public.contacts(workspace_id, storm_impact_severity) 
  WHERE storm_impact_severity IS NOT NULL;

-- ============================================================================
-- 2. ENHANCE revenue_events TABLE WITH V2 EVENT TYPES
-- ============================================================================

ALTER TABLE IF EXISTS public.revenue_events
  ADD COLUMN IF NOT EXISTS event_type text CHECK (event_type IN (
    'quote_created',
    'quote_updated',
    'requote_triggered',
    'job_type_revised',
    'insurance_activity_detected',
    'inspection_completed',
    'close_probability_update',
    'high_value_flag_applied',
    'storm_detected',
    'value_recalculated'
  )),
  ADD COLUMN IF NOT EXISTS old_close_probability integer,
  ADD COLUMN IF NOT EXISTS new_close_probability integer,
  ADD COLUMN IF NOT EXISTS quote_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS estimated_close_date date;

-- Index for event type queries
CREATE INDEX IF NOT EXISTS idx_revenue_events_event_type 
  ON public.revenue_events(event_type, created_at DESC);

-- ============================================================================
-- 3. CREATE revenue_stats TABLE (Aggregated Stats per Workspace)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.revenue_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Pipeline totals
  total_pipeline_value numeric(12,2) DEFAULT 0,
  hot_pipeline_value numeric(12,2) DEFAULT 0,
  warm_pipeline_value numeric(12,2) DEFAULT 0,
  cold_pipeline_value numeric(12,2) DEFAULT 0,
  
  -- Value by job type
  repair_revenue numeric(12,2) DEFAULT 0,
  replacement_revenue numeric(12,2) DEFAULT 0,
  insurance_revenue numeric(12,2) DEFAULT 0,
  storm_revenue numeric(12,2) DEFAULT 0,
  commercial_revenue numeric(12,2) DEFAULT 0,
  gutter_revenue numeric(12,2) DEFAULT 0,
  skylight_revenue numeric(12,2) DEFAULT 0,
  misc_revenue numeric(12,2) DEFAULT 0,
  
  -- Value by stage
  new_lead_value numeric(12,2) DEFAULT 0,
  attempting_value numeric(12,2) DEFAULT 0,
  warm_value numeric(12,2) DEFAULT 0,
  hot_value numeric(12,2) DEFAULT 0,
  qualified_value numeric(12,2) DEFAULT 0,
  booked_value numeric(12,2) DEFAULT 0,
  
  -- Insurance opportunities
  insurance_opportunity_total numeric(12,2) DEFAULT 0,
  insurance_opportunity_count integer DEFAULT 0,
  
  -- Close probability averages
  avg_close_probability numeric(5,2),
  avg_close_probability_hot numeric(5,2),
  avg_close_probability_warm numeric(5,2),
  
  -- Revenue forecast
  forecast_7_days numeric(12,2) DEFAULT 0,
  forecast_30_days numeric(12,2) DEFAULT 0,
  forecast_90_days numeric(12,2) DEFAULT 0,
  
  -- Conversion metrics
  quote_conversion_rate numeric(5,2),
  total_quotes_sent integer DEFAULT 0,
  total_jobs_won integer DEFAULT 0,
  
  -- Storm revenue
  storm_job_revenue numeric(12,2) DEFAULT 0,
  storm_job_count integer DEFAULT 0,
  
  -- Top neighborhoods (stored as JSONB)
  top_neighborhoods jsonb DEFAULT '[]'::jsonb,
  
  -- Average job value
  avg_job_value numeric(12,2),
  
  -- Calculated at
  calculated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_revenue_stats_workspace 
  ON public.revenue_stats(workspace_id);

CREATE INDEX IF NOT EXISTS idx_revenue_stats_calculated_at 
  ON public.revenue_stats(calculated_at DESC);

-- RLS for revenue_stats
ALTER TABLE public.revenue_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view revenue stats for their workspace"
  ON public.revenue_stats
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- 4. CREATE job_estimates TABLE (Detailed Job Estimates)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.job_estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Job details
  job_type text NOT NULL CHECK (job_type IN ('repair', 'replacement', 'insurance_claim', 'storm_damage', 'commercial', 'gutter', 'skylight', 'misc', 'unknown')),
  revenue_category text CHECK (revenue_category IN ('repair', 'replacement', 'insurance', 'storm', 'commercial', 'gutter', 'skylight', 'misc')),
  
  -- Value estimates
  estimated_value_min numeric(12,2),
  estimated_value_max numeric(12,2),
  estimated_value_avg numeric(12,2),
  confidence_score numeric(3,2) CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),
  
  -- Factors used in calculation
  home_value numeric(12,2),
  roof_size_sqft numeric(10,2),
  roof_age_years integer,
  zip_code text,
  neighborhood text,
  storm_severity text,
  insurance_claim_status boolean DEFAULT false,
  
  -- Calculation metadata
  calculation_factors jsonb DEFAULT '{}'::jsonb,
  calculation_version integer DEFAULT 2,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_estimates_contact 
  ON public.job_estimates(contact_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_estimates_workspace 
  ON public.job_estimates(workspace_id, job_type);

CREATE INDEX IF NOT EXISTS idx_job_estimates_revenue_category 
  ON public.job_estimates(workspace_id, revenue_category);

-- RLS for job_estimates
ALTER TABLE public.job_estimates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view job estimates for their workspace contacts"
  ON public.job_estimates
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- 5. CREATE close_probability TABLE (Close Probability Scores)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.close_probability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Score (0-100)
  score integer NOT NULL CHECK (score >= 0 AND score <= 100),
  
  -- Score breakdown
  reply_interest_score integer DEFAULT 0,
  storm_urgency_score integer DEFAULT 0,
  insurance_activity_score integer DEFAULT 0,
  homeowner_tone_score integer DEFAULT 0,
  past_interactions_score integer DEFAULT 0,
  booking_behavior_score integer DEFAULT 0,
  quote_sent_score integer DEFAULT 0,
  lead_heat_score integer DEFAULT 0,
  
  -- Score factors
  has_reply boolean DEFAULT false,
  has_insurance_interest boolean DEFAULT false,
  has_storm_damage boolean DEFAULT false,
  quote_sent boolean DEFAULT false,
  appointment_booked boolean DEFAULT false,
  days_since_last_interaction integer,
  
  -- Metadata
  calculation_factors jsonb DEFAULT '{}'::jsonb,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(contact_id)
);

CREATE INDEX IF NOT EXISTS idx_close_probability_contact 
  ON public.close_probability(contact_id);

CREATE INDEX IF NOT EXISTS idx_close_probability_workspace_score 
  ON public.close_probability(workspace_id, score DESC);

CREATE INDEX IF NOT EXISTS idx_close_probability_high_score 
  ON public.close_probability(workspace_id, score DESC) 
  WHERE score >= 80;

-- RLS for close_probability
ALTER TABLE public.close_probability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view close probability for their workspace contacts"
  ON public.close_probability
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- 6. CREATE storm_revenue_scores TABLE (Storm Revenue Tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.storm_revenue_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Storm identification
  storm_date date,
  storm_type text CHECK (storm_type IN ('hail', 'wind', 'hurricane', 'tornado', 'other')),
  affected_zips text[],
  
  -- Revenue metrics
  total_storm_homes integer DEFAULT 0,
  hot_storm_homes integer DEFAULT 0,
  insurance_interest_count integer DEFAULT 0,
  potential_storm_revenue numeric(12,2) DEFAULT 0,
  
  -- Breakdown
  storm_home_breakdown jsonb DEFAULT '{}'::jsonb,
  
  -- Recommendations
  recommended_campaigns jsonb DEFAULT '[]'::jsonb,
  ideal_followup_order jsonb DEFAULT '[]'::jsonb,
  
  calculated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_storm_revenue_workspace 
  ON public.storm_revenue_scores(workspace_id, storm_date DESC);

CREATE INDEX IF NOT EXISTS idx_storm_revenue_date 
  ON public.storm_revenue_scores(storm_date DESC);

-- RLS for storm_revenue_scores
ALTER TABLE public.storm_revenue_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view storm revenue scores for their workspace"
  ON public.storm_revenue_scores
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- 7. FUNCTION: Enhanced Job Type Detection (7 Categories)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.detect_job_type_v2(
  p_message_insights jsonb DEFAULT '[]'::jsonb,
  p_tags text[] DEFAULT '{}',
  p_enrichment jsonb DEFAULT '{}'::jsonb,
  p_property_type text DEFAULT NULL,
  p_roof_type text DEFAULT NULL,
  p_list_type text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_category text;
  v_has_insurance boolean := false;
  v_has_storm boolean := false;
  v_has_repair boolean := false;
  v_has_replacement boolean := false;
  v_has_commercial boolean := false;
  v_has_gutter boolean := false;
  v_has_skylight boolean := false;
BEGIN
  -- Check message insights categories
  FOR v_category IN SELECT jsonb_array_elements_text(p_message_insights)
  LOOP
    IF v_category IN ('insurance_interest', 'insurance_claim', 'filing_claim') THEN
      v_has_insurance := true;
    END IF;
    IF v_category IN ('storm_damage', 'hail_damage', 'wind_damage', 'hurricane') THEN
      v_has_storm := true;
    END IF;
    IF v_category IN ('leak_repair', 'repair', 'patch', 'fix') THEN
      v_has_repair := true;
    END IF;
    IF v_category IN ('replacement', 'full_roof', 'new_roof', 'roof_replacement') THEN
      v_has_replacement := true;
    END IF;
    IF v_category IN ('gutter', 'gutters', 'gutter_work', 'gutter_repair') THEN
      v_has_gutter := true;
    END IF;
    IF v_category IN ('skylight', 'skylights', 'skylight_repair') THEN
      v_has_skylight := true;
    END IF;
  END LOOP;
  
  -- Check tags
  IF 'insurance' = ANY(p_tags) OR 'insurance_claim' = ANY(p_tags) THEN
    v_has_insurance := true;
  END IF;
  IF 'storm' = ANY(p_tags) OR 'storm_damage' = ANY(p_tags) OR 'hail' = ANY(p_tags) THEN
    v_has_storm := true;
  END IF;
  IF 'repair' = ANY(p_tags) OR 'leak' = ANY(p_tags) THEN
    v_has_repair := true;
  END IF;
  IF 'replacement' = ANY(p_tags) OR 'full_roof' = ANY(p_tags) THEN
    v_has_replacement := true;
  END IF;
  IF 'commercial' = ANY(p_tags) OR 'flat_roof' = ANY(p_tags) THEN
    v_has_commercial := true;
  END IF;
  IF 'gutter' = ANY(p_tags) OR 'gutters' = ANY(p_tags) THEN
    v_has_gutter := true;
  END IF;
  IF 'skylight' = ANY(p_tags) OR 'skylights' = ANY(p_tags) THEN
    v_has_skylight := true;
  END IF;
  
  -- Check enrichment
  IF (p_enrichment->>'insurance_interest')::boolean = true THEN
    v_has_insurance := true;
  END IF;
  IF p_enrichment->>'storm_risk_level' IN ('high', 'medium', 'hail', 'wind', 'hurricane') THEN
    v_has_storm := true;
  END IF;
  
  -- Check property type for commercial
  IF p_property_type = 'commercial' THEN
    v_has_commercial := true;
  END IF;
  
  -- Check roof type for commercial (flat roofs)
  IF p_roof_type IN ('flat', 'ballast') THEN
    v_has_commercial := true;
  END IF;
  
  -- Check list type
  IF p_list_type = 'commercial_leads' THEN
    v_has_commercial := true;
  END IF;
  
  -- Determine job type priority (insurance > storm > commercial > replacement > repair > gutter > skylight)
  IF v_has_insurance THEN
    RETURN 'insurance_claim';
  ELSIF v_has_storm THEN
    RETURN 'storm_damage';
  ELSIF v_has_commercial THEN
    RETURN 'commercial';
  ELSIF v_has_replacement THEN
    RETURN 'replacement';
  ELSIF v_has_repair THEN
    RETURN 'repair';
  ELSIF v_has_gutter THEN
    RETURN 'gutter';
  ELSIF v_has_skylight THEN
    RETURN 'skylight';
  ELSE
    RETURN 'unknown';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.detect_job_type_v2 IS 'Detects job type from multiple signals including message insights, tags, enrichment, property type, roof type, and list type (Block 16400)';

-- ============================================================================
-- 8. FUNCTION: Calculate Estimated Job Value v2 (Enhanced Algorithm)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_estimated_value_v2(
  p_job_type text,
  p_home_value numeric DEFAULT NULL,
  p_roof_size_sqft numeric DEFAULT NULL,
  p_roof_age_years integer DEFAULT NULL,
  p_zip_code text DEFAULT NULL,
  p_neighborhood text DEFAULT NULL,
  p_lead_score integer DEFAULT 50,
  p_storm_severity text DEFAULT NULL,
  p_insurance_claim boolean DEFAULT false,
  p_enrichment jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_value_min numeric(12,2);
  v_value_max numeric(12,2);
  v_confidence numeric(3,2);
  v_zip_factor numeric(3,2) := 1.0;
  v_lead_score_factor numeric(3,2) := 1.0;
  v_storm_factor numeric(3,2) := 1.0;
  v_insurance_factor numeric(3,2) := 1.0;
  v_roof_size_factor numeric(3,2) := 1.0;
  v_roof_age_factor numeric(3,2) := 1.0;
  v_home_value_factor numeric(3,2) := 1.0;
  v_result jsonb;
BEGIN
  -- Base value ranges by job type (7 categories)
  CASE p_job_type
    WHEN 'repair' THEN
      v_value_min := 250;
      v_value_max := 1500;
      v_confidence := 0.70;
    WHEN 'replacement' THEN
      v_value_min := 7000;
      v_value_max := 24000;
      v_confidence := 0.75;
    WHEN 'insurance_claim' THEN
      v_value_min := 12000;
      v_value_max := 35000;
      v_confidence := 0.80;
    WHEN 'storm_damage' THEN
      v_value_min := 1000;
      v_value_max := 30000;
      v_confidence := 0.65;
    WHEN 'commercial' THEN
      v_value_min := 15000;
      v_value_max := 50000;
      v_confidence := 0.70;
    WHEN 'gutter' THEN
      v_value_min := 300;
      v_value_max := 1200;
      v_confidence := 0.75;
    WHEN 'skylight' THEN
      v_value_min := 500;
      v_value_max := 2500;
      v_confidence := 0.70;
    ELSE
      v_value_min := NULL;
      v_value_max := NULL;
      v_confidence := 0.0;
      RETURN jsonb_build_object(
        'value_min', NULL,
        'value_max', NULL,
        'confidence', 0.0
      );
  END CASE;
  
  -- Apply roof size factor (if known)
  IF p_roof_size_sqft IS NOT NULL THEN
    -- Typical roof: 1500-3000 sqft
    IF p_roof_size_sqft > 3000 THEN
      v_roof_size_factor := 1.3; -- Large roof: +30%
    ELSIF p_roof_size_sqft < 1500 THEN
      v_roof_size_factor := 0.85; -- Small roof: -15%
    END IF;
  END IF;
  
  -- Apply roof age factor
  IF p_roof_age_years IS NOT NULL THEN
    IF p_roof_age_years > 20 THEN
      v_roof_age_factor := 1.15; -- Old roof: +15% (more likely replacement)
    ELSIF p_roof_age_years < 5 THEN
      v_roof_age_factor := 0.90; -- New roof: -10% (less likely replacement)
    END IF;
  END IF;
  
  -- Apply home value factor
  IF p_home_value IS NOT NULL THEN
    IF p_home_value > 500000 THEN
      v_home_value_factor := 1.25; -- High-value home: +25%
    ELSIF p_home_value < 150000 THEN
      v_home_value_factor := 0.80; -- Low-value home: -20%
    END IF;
  END IF;
  
  -- Apply neighborhood factor
  IF p_neighborhood IS NOT NULL THEN
    IF p_neighborhood ~* '(premium|upscale|luxury|estate|hills|heights)' THEN
      v_zip_factor := 1.25;
    ELSIF p_neighborhood ~* '(low|affordable|budget|economy)' THEN
      v_zip_factor := 0.85;
    END IF;
  END IF;
  
  -- Apply storm severity factor
  IF p_storm_severity = 'high' THEN
    v_storm_factor := 1.20;
  ELSIF p_storm_severity = 'medium' THEN
    v_storm_factor := 1.10;
  END IF;
  
  -- Apply insurance claim factor
  IF p_insurance_claim THEN
    v_insurance_factor := 1.15; -- Insurance jobs typically higher value
  END IF;
  
  -- Apply lead score factor
  IF p_lead_score >= 80 THEN
    v_lead_score_factor := 1.40;
    v_confidence := LEAST(1.0, v_confidence * 1.40);
  ELSIF p_lead_score >= 40 THEN
    v_lead_score_factor := 1.0;
  ELSE
    v_lead_score_factor := 0.30;
    v_confidence := v_confidence * 0.30;
  END IF;
  
  -- Apply all factors
  v_value_min := v_value_min * v_zip_factor * v_lead_score_factor * v_storm_factor * v_insurance_factor * v_roof_size_factor * v_roof_age_factor * v_home_value_factor;
  v_value_max := v_value_max * v_zip_factor * v_lead_score_factor * v_storm_factor * v_insurance_factor * v_roof_size_factor * v_roof_age_factor * v_home_value_factor;
  
  RETURN jsonb_build_object(
    'value_min', ROUND(v_value_min, 2),
    'value_max', ROUND(v_value_max, 2),
    'value_avg', ROUND((v_value_min + v_value_max) / 2, 2),
    'confidence', ROUND(v_confidence, 2),
    'factors', jsonb_build_object(
      'zip_factor', v_zip_factor,
      'lead_score_factor', v_lead_score_factor,
      'storm_factor', v_storm_factor,
      'insurance_factor', v_insurance_factor,
      'roof_size_factor', v_roof_size_factor,
      'roof_age_factor', v_roof_age_factor,
      'home_value_factor', v_home_value_factor
    )
  );
END;
$$;

COMMENT ON FUNCTION public.calculate_estimated_value_v2 IS 'Calculates estimated job value v2 with enhanced factors including home value, roof size, roof age, storm severity, and insurance status (Block 16400)';

-- ============================================================================
-- 9. FUNCTION: Calculate Close Probability (0-100)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_close_probability(
  p_contact_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact record;
  v_score integer := 0;
  v_reply_interest integer := 0;
  v_storm_urgency integer := 0;
  v_insurance_activity integer := 0;
  v_homeowner_tone integer := 0;
  v_past_interactions integer := 0;
  v_booking_behavior integer := 0;
  v_quote_sent integer := 0;
  v_lead_heat integer := 0;
  v_has_reply boolean := false;
  v_has_insurance boolean := false;
  v_has_storm boolean := false;
  v_quote_sent_flag boolean := false;
  v_appointment_booked boolean := false;
  v_days_since_interaction integer;
  v_reply_count integer := 0;
  v_message_count integer := 0;
BEGIN
  -- Get contact data
  SELECT 
    c.*,
    ce.insurance_interest,
    ce.storm_risk_level
  INTO v_contact
  FROM public.contacts c
  LEFT JOIN public.contact_enrichment ce ON ce.contact_id = c.id
  WHERE c.id = p_contact_id;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  -- Check for replies
  SELECT COUNT(*) INTO v_reply_count
  FROM public.inbox_threads
  WHERE contact_id = p_contact_id
    AND is_reply = true;
  
  v_has_reply := v_reply_count > 0;
  
  -- Reply interest score (0-25 points)
  IF v_has_reply THEN
    v_reply_interest := 20;
    IF v_reply_count > 1 THEN
      v_reply_interest := 25;
    END IF;
  END IF;
  
  -- Storm urgency score (0-20 points)
  IF v_contact.storm_risk_level IN ('hail', 'wind', 'hurricane') OR v_contact.job_type = 'storm_damage' THEN
    v_has_storm := true;
    v_storm_urgency := 15;
    IF v_contact.storm_impact_severity = 'high' THEN
      v_storm_urgency := 20;
    ELSIF v_contact.storm_impact_severity = 'medium' THEN
      v_storm_urgency := 15;
    END IF;
  END IF;
  
  -- Insurance activity score (0-20 points)
  IF v_contact.insurance_interest OR v_contact.job_type = 'insurance_claim' OR v_contact.revenue_category = 'insurance' THEN
    v_has_insurance := true;
    v_insurance_activity := 15;
    IF v_contact.insurance_claim_type IS NOT NULL THEN
      v_insurance_activity := 20;
    END IF;
  END IF;
  
  -- Homeowner tone score (0-10 points) - based on lead_score
  IF v_contact.lead_score >= 80 THEN
    v_homeowner_tone := 10;
  ELSIF v_contact.lead_score >= 60 THEN
    v_homeowner_tone := 7;
  ELSIF v_contact.lead_score >= 40 THEN
    v_homeowner_tone := 5;
  END IF;
  
  -- Past interactions score (0-10 points)
  SELECT COUNT(*) INTO v_message_count
  FROM public.inbox_threads
  WHERE contact_id = p_contact_id;
  
  IF v_message_count > 3 THEN
    v_past_interactions := 10;
  ELSIF v_message_count > 1 THEN
    v_past_interactions := 7;
  ELSIF v_message_count = 1 THEN
    v_past_interactions := 5;
  END IF;
  
  -- Booking behavior score (0-10 points)
  IF v_contact.lead_status = 'booked' THEN
    v_appointment_booked := true;
    v_booking_behavior := 10;
  ELSIF v_contact.lead_status = 'qualified' THEN
    v_booking_behavior := 7;
  END IF;
  
  -- Quote sent score (0-15 points)
  IF v_contact.quote_sent_at IS NOT NULL THEN
    v_quote_sent_flag := true;
    v_quote_sent := 10;
    -- Bonus if quote sent recently (within 7 days)
    IF v_contact.quote_sent_at > now() - interval '7 days' THEN
      v_quote_sent := 15;
    END IF;
  END IF;
  
  -- Lead heat score (0-10 points) - based on lead_status
  CASE v_contact.lead_status
    WHEN 'hot' THEN
      v_lead_heat := 10;
    WHEN 'warm' THEN
      v_lead_heat := 7;
    WHEN 'qualified' THEN
      v_lead_heat := 8;
    WHEN 'booked' THEN
      v_lead_heat := 10;
    ELSE
      v_lead_heat := 0;
  END CASE;
  
  -- Calculate total score
  v_score := v_reply_interest + v_storm_urgency + v_insurance_activity + 
             v_homeowner_tone + v_past_interactions + v_booking_behavior + 
             v_quote_sent + v_lead_heat;
  
  -- Cap at 100
  v_score := LEAST(100, v_score);
  
  -- Calculate days since last interaction
  SELECT EXTRACT(DAY FROM (now() - MAX(created_at)))::integer INTO v_days_since_interaction
  FROM public.inbox_threads
  WHERE contact_id = p_contact_id;
  
  v_days_since_interaction := COALESCE(v_days_since_interaction, 999);
  
  -- Upsert close probability record
  INSERT INTO public.close_probability (
    contact_id,
    workspace_id,
    score,
    reply_interest_score,
    storm_urgency_score,
    insurance_activity_score,
    homeowner_tone_score,
    past_interactions_score,
    booking_behavior_score,
    quote_sent_score,
    lead_heat_score,
    has_reply,
    has_insurance_interest,
    has_storm_damage,
    quote_sent,
    appointment_booked,
    days_since_last_interaction,
    calculation_factors
  ) VALUES (
    p_contact_id,
    v_contact.workspace_id,
    v_score,
    v_reply_interest,
    v_storm_urgency,
    v_insurance_activity,
    v_homeowner_tone,
    v_past_interactions,
    v_booking_behavior,
    v_quote_sent,
    v_lead_heat,
    v_has_reply,
    v_has_insurance,
    v_has_storm,
    v_quote_sent_flag,
    v_appointment_booked,
    v_days_since_interaction,
    jsonb_build_object(
      'reply_count', v_reply_count,
      'message_count', v_message_count,
      'lead_score', v_contact.lead_score,
      'lead_status', v_contact.lead_status
    )
  )
  ON CONFLICT (contact_id) DO UPDATE SET
    score = EXCLUDED.score,
    reply_interest_score = EXCLUDED.reply_interest_score,
    storm_urgency_score = EXCLUDED.storm_urgency_score,
    insurance_activity_score = EXCLUDED.insurance_activity_score,
    homeowner_tone_score = EXCLUDED.homeowner_tone_score,
    past_interactions_score = EXCLUDED.past_interactions_score,
    booking_behavior_score = EXCLUDED.booking_behavior_score,
    quote_sent_score = EXCLUDED.quote_sent_score,
    lead_heat_score = EXCLUDED.lead_heat_score,
    has_reply = EXCLUDED.has_reply,
    has_insurance_interest = EXCLUDED.has_insurance_interest,
    has_storm_damage = EXCLUDED.has_storm_damage,
    quote_sent = EXCLUDED.quote_sent,
    appointment_booked = EXCLUDED.appointment_booked,
    days_since_last_interaction = EXCLUDED.days_since_last_interaction,
    calculation_factors = EXCLUDED.calculation_factors,
    calculated_at = now();
  
  -- Update contact with close probability
  UPDATE public.contacts
  SET close_probability = v_score
  WHERE id = p_contact_id;
  
  RETURN v_score;
END;
$$;

COMMENT ON FUNCTION public.calculate_close_probability IS 'Calculates close probability score (0-100) based on reply interest, storm urgency, insurance activity, homeowner tone, past interactions, booking behavior, quote sent status, and lead heat (Block 16400)';

-- ============================================================================
-- 10. FUNCTION: Calculate Insurance Revenue (ACV vs RCV, Deductible, Payout)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_insurance_revenue(
  p_contact_id uuid,
  p_zip_code text DEFAULT NULL,
  p_storm_severity text DEFAULT NULL,
  p_home_value numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact record;
  v_base_replacement_cost numeric(12,2);
  v_deductible numeric(12,2);
  v_acv numeric(12,2);
  v_rcv numeric(12,2);
  v_likely_payout_min numeric(12,2);
  v_likely_payout_max numeric(12,2);
  v_claim_type text := 'RCV';
  v_result jsonb;
BEGIN
  -- Get contact data
  SELECT c.*, ce.inferred_zip, ce.inferred_neighborhood
  INTO v_contact
  FROM public.contacts c
  LEFT JOIN public.contact_enrichment ce ON ce.contact_id = c.id
  WHERE c.id = p_contact_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Contact not found');
  END IF;
  
  -- Use provided zip or contact zip
  p_zip_code := COALESCE(p_zip_code, v_contact.inferred_zip, v_contact.postal_code);
  
  -- Estimate base replacement cost based on zip/neighborhood
  -- Typical range: $12,000-$35,000 for insurance claims
  v_base_replacement_cost := 18000; -- Default average
  
  -- Adjust based on home value if available
  IF p_home_value IS NOT NULL THEN
    -- Rough estimate: replacement cost is 5-8% of home value
    v_base_replacement_cost := p_home_value * 0.06;
  END IF;
  
  -- Adjust based on zip code (premium areas = higher costs)
  IF v_contact.inferred_neighborhood ~* '(premium|upscale|luxury|estate|hills|heights)' THEN
    v_base_replacement_cost := v_base_replacement_cost * 1.3;
  END IF;
  
  -- Apply storm severity factor
  IF p_storm_severity = 'high' THEN
    v_base_replacement_cost := v_base_replacement_cost * 1.2;
  ELSIF p_storm_severity = 'medium' THEN
    v_base_replacement_cost := v_base_replacement_cost * 1.1;
  END IF;
  
  -- Calculate deductible (typically 1% of home value, or $1,000-$2,500)
  IF p_home_value IS NOT NULL THEN
    v_deductible := GREATEST(1000, LEAST(2500, p_home_value * 0.01));
  ELSE
    v_deductible := 1500; -- Default
  END IF;
  
  -- RCV (Replacement Cost Value) = full replacement cost
  v_rcv := v_base_replacement_cost;
  
  -- ACV (Actual Cash Value) = RCV minus depreciation (typically 20-40% for older roofs)
  -- For insurance claims, we'll use RCV as default (most common)
  v_acv := v_rcv * 0.75; -- Assume 25% depreciation
  
  -- Likely payout range (after deductible)
  v_likely_payout_min := GREATEST(0, v_acv - v_deductible);
  v_likely_payout_max := GREATEST(0, v_rcv - v_deductible);
  
  -- Update contact with insurance claim values
  UPDATE public.contacts
  SET
    insurance_claim_value_min = v_likely_payout_min,
    insurance_claim_value_max = v_likely_payout_max,
    insurance_deductible = v_deductible,
    insurance_claim_type = v_claim_type
  WHERE id = p_contact_id;
  
  RETURN jsonb_build_object(
    'deductible', ROUND(v_deductible, 2),
    'acv', ROUND(v_acv, 2),
    'rcv', ROUND(v_rcv, 2),
    'claim_type', v_claim_type,
    'likely_payout_min', ROUND(v_likely_payout_min, 2),
    'likely_payout_max', ROUND(v_likely_payout_max, 2),
    'estimated_range', format('$%s - $%s', 
      ROUND(v_likely_payout_min, 0)::text,
      ROUND(v_likely_payout_max, 0)::text
    )
  );
END;
$$;

COMMENT ON FUNCTION public.calculate_insurance_revenue IS 'Calculates insurance claim revenue including deductible, ACV vs RCV, and likely payout range (Block 16400)';

-- ============================================================================
-- 11. FUNCTION: Calculate Revenue Forecast (7/30/90 Days)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_revenue_forecast(
  p_workspace_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_forecast_7_days numeric(12,2) := 0;
  v_forecast_30_days numeric(12,2) := 0;
  v_forecast_90_days numeric(12,2) := 0;
  v_contact record;
  v_avg_value numeric(12,2);
  v_close_prob numeric;
BEGIN
  -- Forecast based on close probability and estimated value
  FOR v_contact IN
    SELECT 
      c.id,
      c.estimated_value_min,
      c.estimated_value_max,
      c.close_probability,
      c.lead_status,
      c.quote_sent_at
    FROM public.contacts c
    WHERE c.workspace_id = p_workspace_id
      AND c.estimated_value_min IS NOT NULL
      AND c.lead_status NOT IN ('won', 'lost')
  LOOP
    v_avg_value := COALESCE(
      (v_contact.estimated_value_min + v_contact.estimated_value_max) / 2,
      v_contact.estimated_value_min,
      0
    );
    
    v_close_prob := COALESCE(v_contact.close_probability, 50);
    
    -- 7-day forecast: High probability leads (80+) or booked/qualified
    IF v_close_prob >= 80 OR v_contact.lead_status IN ('booked', 'qualified') THEN
      v_forecast_7_days := v_forecast_7_days + (v_avg_value * (v_close_prob / 100.0));
    END IF;
    
    -- 30-day forecast: Medium-high probability (50+) or warm/hot
    IF v_close_prob >= 50 OR v_contact.lead_status IN ('hot', 'warm', 'qualified', 'booked') THEN
      v_forecast_30_days := v_forecast_30_days + (v_avg_value * (v_close_prob / 100.0));
    END IF;
    
    -- 90-day forecast: All active leads
    IF v_close_prob > 0 THEN
      v_forecast_90_days := v_forecast_90_days + (v_avg_value * (v_close_prob / 100.0));
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'forecast_7_days', ROUND(v_forecast_7_days, 2),
    'forecast_30_days', ROUND(v_forecast_30_days, 2),
    'forecast_90_days', ROUND(v_forecast_90_days, 2),
    'calculated_at', now()
  );
END;
$$;

COMMENT ON FUNCTION public.calculate_revenue_forecast IS 'Calculates revenue forecast for 7, 30, and 90 days based on close probability and estimated values (Block 16400)';

-- ============================================================================
-- 12. FUNCTION: Calculate Storm Revenue Booster
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_storm_revenue(
  p_workspace_id uuid,
  p_storm_date date DEFAULT NULL,
  p_storm_type text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_storm_date date;
  v_storm_type text;
  v_total_storm_homes integer := 0;
  v_hot_storm_homes integer := 0;
  v_insurance_interest_count integer := 0;
  v_potential_revenue numeric(12,2) := 0;
  v_contact record;
  v_avg_value numeric(12,2);
  v_storm_home_breakdown jsonb := '[]'::jsonb;
  v_recommended_campaigns jsonb := '[]'::jsonb;
  v_ideal_followup jsonb := '[]'::jsonb;
  v_contact_list jsonb := '[]'::jsonb;
BEGIN
  -- Default storm date to recent (last 30 days) if not provided
  v_storm_date := COALESCE(p_storm_date, CURRENT_DATE - interval '30 days');
  v_storm_type := COALESCE(p_storm_type, 'hail');
  
  -- Find storm-affected contacts
  FOR v_contact IN
    SELECT 
      c.id,
      c.email,
      c.first_name,
      c.last_name,
      c.estimated_value_min,
      c.estimated_value_max,
      c.close_probability,
      c.lead_status,
      c.storm_impact_severity,
      c.insurance_interest,
      ce.inferred_zip
    FROM public.contacts c
    LEFT JOIN public.contact_enrichment ce ON ce.contact_id = c.id
    WHERE c.workspace_id = p_workspace_id
      AND (
        c.job_type = 'storm_damage'
        OR c.revenue_category = 'storm'
        OR c.storm_impact_severity IS NOT NULL
        OR ce.storm_risk_level IN ('hail', 'wind', 'hurricane')
      )
      AND c.lead_status NOT IN ('won', 'lost')
  LOOP
    v_total_storm_homes := v_total_storm_homes + 1;
    
    v_avg_value := COALESCE(
      (v_contact.estimated_value_min + v_contact.estimated_value_max) / 2,
      v_contact.estimated_value_min,
      0
    );
    
    -- Count hot storm homes
    IF v_contact.close_probability >= 80 OR v_contact.lead_status IN ('hot', 'booked') THEN
      v_hot_storm_homes := v_hot_storm_homes + 1;
    END IF;
    
    -- Count insurance interest
    IF v_contact.insurance_interest OR v_contact.job_type = 'insurance_claim' THEN
      v_insurance_interest_count := v_insurance_interest_count + 1;
    END IF;
    
    -- Add to potential revenue
    v_potential_revenue := v_potential_revenue + v_avg_value;
    
    -- Build contact list for follow-up order (sorted by close probability)
    v_contact_list := v_contact_list || jsonb_build_object(
      'contact_id', v_contact.id,
      'email', v_contact.email,
      'name', COALESCE(v_contact.first_name || ' ' || v_contact.last_name, v_contact.email),
      'estimated_value', v_avg_value,
      'close_probability', v_contact.close_probability,
      'lead_status', v_contact.lead_status,
      'storm_severity', v_contact.storm_impact_severity
    );
  END LOOP;
  
  -- Sort by close probability (descending) for ideal follow-up order
  SELECT jsonb_agg(elem ORDER BY (elem->>'close_probability')::integer DESC NULLS LAST)
  INTO v_ideal_followup
  FROM jsonb_array_elements(v_contact_list) elem;
  
  -- Build storm home breakdown
  v_storm_home_breakdown := jsonb_build_object(
    'total', v_total_storm_homes,
    'hot', v_hot_storm_homes,
    'warm', v_total_storm_homes - v_hot_storm_homes,
    'insurance_interest', v_insurance_interest_count
  );
  
  -- Build recommended campaigns
  v_recommended_campaigns := jsonb_build_array(
    jsonb_build_object(
      'campaign_type', 'Storm Damage Inspection Sequence',
      'priority', 'high',
      'target_count', v_hot_storm_homes
    ),
    jsonb_build_object(
      'campaign_type', 'Insurance Claim Help Sequence',
      'priority', 'high',
      'target_count', v_insurance_interest_count
    )
  );
  
  -- Upsert storm revenue score
  INSERT INTO public.storm_revenue_scores (
    workspace_id,
    storm_date,
    storm_type,
    total_storm_homes,
    hot_storm_homes,
    insurance_interest_count,
    potential_storm_revenue,
    storm_home_breakdown,
    recommended_campaigns,
    ideal_followup_order
  ) VALUES (
    p_workspace_id,
    v_storm_date,
    v_storm_type,
    v_total_storm_homes,
    v_hot_storm_homes,
    v_insurance_interest_count,
    v_potential_revenue,
    v_storm_home_breakdown,
    v_recommended_campaigns,
    v_ideal_followup
  )
  ON CONFLICT DO NOTHING;
  
  RETURN jsonb_build_object(
    'total_storm_homes', v_total_storm_homes,
    'hot_storm_homes', v_hot_storm_homes,
    'insurance_interest_count', v_insurance_interest_count,
    'potential_storm_revenue', ROUND(v_potential_revenue, 2),
    'storm_home_breakdown', v_storm_home_breakdown,
    'recommended_campaigns', v_recommended_campaigns,
    'ideal_followup_order', v_ideal_followup
  );
END;
$$;

COMMENT ON FUNCTION public.calculate_storm_revenue IS 'Calculates storm revenue potential including storm-affected homes, hot leads, insurance interest, and recommended campaigns (Block 16400)';

-- ============================================================================
-- 13. FUNCTION: Sync Quote Data (When Quote is Sent)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_quote_data(
  p_contact_id uuid,
  p_quote_amount numeric,
  p_quote_pdf_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact record;
  v_old_quote_amount numeric;
  v_new_job_value_min numeric;
  v_new_job_value_max numeric;
  v_close_prob integer;
BEGIN
  -- Get contact data
  SELECT * INTO v_contact
  FROM public.contacts
  WHERE id = p_contact_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Contact not found');
  END IF;
  
  v_old_quote_amount := v_contact.quote_amount;
  
  -- Update contact with quote data
  UPDATE public.contacts
  SET
    quote_amount = p_quote_amount,
    last_quote_amount = COALESCE(v_old_quote_amount, p_quote_amount),
    quote_sent_at = now(),
    -- Recalculate job value based on quote
    estimated_value_min = GREATEST(COALESCE(estimated_value_min, 0), p_quote_amount * 0.9),
    estimated_value_max = p_quote_amount * 1.1,
    -- Move to "Quote Sent" pipeline stage if not already won/lost
    lead_status = CASE 
      WHEN lead_status NOT IN ('won', 'lost') THEN 'qualified'
      ELSE lead_status
    END,
    updated_at = now()
  WHERE id = p_contact_id;
  
  -- Recalculate close probability (quote sent increases probability)
  v_close_prob := public.calculate_close_probability(p_contact_id);
  
  -- Log revenue event
  INSERT INTO public.revenue_events (
    contact_id,
    workspace_id,
    event_type,
    reason,
    source,
    quote_amount,
    old_value_min,
    new_value_min,
    old_value_max,
    new_value_max,
    old_close_probability,
    new_close_probability,
    metadata
  ) VALUES (
    p_contact_id,
    v_contact.workspace_id,
    'quote_created',
    'quote_sent',
    'user_input',
    p_quote_amount,
    v_contact.estimated_value_min,
    GREATEST(COALESCE(v_contact.estimated_value_min, 0), p_quote_amount * 0.9),
    v_contact.estimated_value_max,
    p_quote_amount * 1.1,
    v_contact.close_probability,
    v_close_prob,
    jsonb_build_object(
      'quote_amount', p_quote_amount,
      'quote_pdf_url', p_quote_pdf_url
    )
  );
  
  RETURN jsonb_build_object(
    'ok', true,
    'contact_id', p_contact_id,
    'quote_amount', p_quote_amount,
    'close_probability', v_close_prob,
    'updated_job_value_min', GREATEST(COALESCE(v_contact.estimated_value_min, 0), p_quote_amount * 0.9),
    'updated_job_value_max', p_quote_amount * 1.1
  );
END;
$$;

COMMENT ON FUNCTION public.sync_quote_data IS 'Syncs quote data when a quote is sent, updates job value, recalculates close probability, and logs revenue event (Block 16400)';

-- ============================================================================
-- 14. FUNCTION: Main Revenue Calculation v2 (Enhanced)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_contact_revenue_v2(
  p_contact_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact record;
  v_enrichment record;
  v_message_insights jsonb := '[]'::jsonb;
  v_categories jsonb;
  v_job_type text;
  v_revenue_category text;
  v_value_result jsonb;
  v_close_prob integer;
  v_old_value_min numeric(12,2);
  v_old_value_max numeric(12,2);
  v_old_job_type text;
  v_old_revenue_category text;
  v_old_close_prob integer;
  v_result jsonb;
BEGIN
  -- Get contact data with enrichment
  SELECT 
    c.*,
    ce.inferred_zip,
    ce.inferred_neighborhood,
    ce.storm_risk_level,
    ce.insurance_interest,
    ce.property_type,
    ce.enrichment_sources
  INTO v_contact
  FROM public.contacts c
  LEFT JOIN public.contact_enrichment ce ON ce.contact_id = c.id
  WHERE c.id = p_contact_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contact not found: %', p_contact_id;
  END IF;
  
  -- Get latest message insights
  SELECT jsonb_agg(categories)
  INTO v_categories
  FROM (
    SELECT categories
    FROM public.message_insights
    WHERE contact_id = p_contact_id
    ORDER BY created_at DESC
    LIMIT 5
  ) mi;
  
  IF v_categories IS NOT NULL THEN
    SELECT jsonb_agg(DISTINCT value)
    INTO v_message_insights
    FROM (
      SELECT jsonb_array_elements_text(categories) as value
      FROM jsonb_array_elements(v_categories)
    ) t;
  END IF;
  
  -- Build enrichment jsonb
  v_enrichment := jsonb_build_object(
    'insurance_interest', COALESCE(v_contact.insurance_interest, false),
    'storm_risk_level', COALESCE(v_contact.storm_risk_level, 'unknown'),
    'zip_code', v_contact.inferred_zip,
    'neighborhood', v_contact.inferred_neighborhood,
    'property_type', v_contact.property_type
  );
  
  -- Detect job type using v2 function
  v_job_type := public.detect_job_type_v2(
    v_message_insights,
    COALESCE(v_contact.tags, '{}'),
    v_enrichment,
    v_contact.property_type_guess,
    v_contact.roof_type_guess,
    NULL -- list_type not available here
  );
  
  -- Determine revenue category
  CASE v_job_type
    WHEN 'insurance_claim' THEN
      v_revenue_category := 'insurance';
    WHEN 'storm_damage' THEN
      v_revenue_category := 'storm';
    WHEN 'replacement' THEN
      v_revenue_category := 'replacement';
    WHEN 'repair' THEN
      v_revenue_category := 'repair';
    WHEN 'commercial' THEN
      v_revenue_category := 'commercial';
    WHEN 'gutter' THEN
      v_revenue_category := 'gutter';
    WHEN 'skylight' THEN
      v_revenue_category := 'skylight';
    ELSE
      v_revenue_category := 'misc';
  END CASE;
  
  -- Calculate estimated value using v2 function
  v_value_result := public.calculate_estimated_value_v2(
    v_job_type,
    v_contact.home_value,
    v_contact.roof_size_sqft,
    v_contact.roof_age_years,
    v_contact.inferred_zip,
    v_contact.inferred_neighborhood,
    COALESCE(v_contact.lead_score, 50),
    v_contact.storm_impact_severity,
    COALESCE(v_contact.insurance_interest, false),
    v_enrichment
  );
  
  -- Calculate close probability
  v_close_prob := public.calculate_close_probability(p_contact_id);
  
  -- Store old values for event logging
  v_old_value_min := v_contact.estimated_value_min;
  v_old_value_max := v_contact.estimated_value_max;
  v_old_job_type := v_contact.job_type;
  v_old_revenue_category := v_contact.revenue_category;
  v_old_close_prob := v_contact.close_probability;
  
  -- Update contact with new revenue estimates
  UPDATE public.contacts
  SET
    job_type = v_job_type,
    estimated_value_min = (v_value_result->>'value_min')::numeric(12,2),
    estimated_value_max = (v_value_result->>'value_max')::numeric(12,2),
    estimated_value_confidence = (v_value_result->>'confidence')::numeric(3,2),
    revenue_category = v_revenue_category,
    close_probability = v_close_prob,
    updated_at = now()
  WHERE id = p_contact_id;
  
  -- If insurance claim, calculate insurance revenue
  IF v_job_type = 'insurance_claim' THEN
    PERFORM public.calculate_insurance_revenue(
      p_contact_id,
      v_contact.inferred_zip,
      v_contact.storm_impact_severity,
      v_contact.home_value
    );
  END IF;
  
  -- Log revenue event if values changed
  IF v_old_value_min IS DISTINCT FROM (v_value_result->>'value_min')::numeric(12,2)
     OR v_old_value_max IS DISTINCT FROM (v_value_result->>'value_max')::numeric(12,2)
     OR v_old_job_type IS DISTINCT FROM v_job_type
     OR v_old_revenue_category IS DISTINCT FROM v_revenue_category
     OR v_old_close_prob IS DISTINCT FROM v_close_prob THEN
    
    INSERT INTO public.revenue_events (
      contact_id,
      workspace_id,
      event_type,
      old_value_min,
      old_value_max,
      new_value_min,
      new_value_max,
      old_job_type,
      new_job_type,
      old_revenue_category,
      new_revenue_category,
      old_close_probability,
      new_close_probability,
      reason,
      source,
      metadata
    ) VALUES (
      p_contact_id,
      v_contact.workspace_id,
      'value_recalculated',
      v_old_value_min,
      v_old_value_max,
      (v_value_result->>'value_min')::numeric(12,2),
      (v_value_result->>'value_max')::numeric(12,2),
      v_old_job_type,
      v_job_type,
      v_old_revenue_category,
      v_revenue_category,
      v_old_close_prob,
      v_close_prob,
      'auto_detection_v2',
      'revenue_engine_v2',
      jsonb_build_object(
        'message_insights', v_message_insights,
        'tags', v_contact.tags,
        'enrichment', v_enrichment,
        'lead_score', v_contact.lead_score,
        'calculation_factors', v_value_result->'factors'
      )
    );
  END IF;
  
  -- Return result
  RETURN jsonb_build_object(
    'contact_id', p_contact_id,
    'job_type', v_job_type,
    'revenue_category', v_revenue_category,
    'value_min', v_value_result->>'value_min',
    'value_max', v_value_result->>'value_max',
    'value_avg', v_value_result->>'value_avg',
    'confidence', v_value_result->>'confidence',
    'close_probability', v_close_prob
  );
END;
$$;

COMMENT ON FUNCTION public.calculate_contact_revenue_v2 IS 'Main function to calculate and update revenue estimates v2 for a contact including close probability and insurance revenue (Block 16400)';

-- ============================================================================
-- 15. FUNCTION: Calculate Workspace Revenue Stats (Aggregated Dashboard Data)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_workspace_revenue_stats(
  p_workspace_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stats record;
  v_forecast jsonb;
  v_storm_revenue jsonb;
  v_result jsonb;
BEGIN
  -- Calculate forecast
  v_forecast := public.calculate_revenue_forecast(p_workspace_id);
  
  -- Calculate storm revenue
  v_storm_revenue := public.calculate_storm_revenue(p_workspace_id);
  
  -- Aggregate stats from contacts
  SELECT
    COUNT(*) as total_contacts,
    COUNT(*) FILTER (WHERE estimated_value_min IS NOT NULL) as contacts_with_value,
    SUM(COALESCE((estimated_value_min + estimated_value_max) / 2, estimated_value_min, 0)) as total_pipeline,
    SUM(COALESCE((estimated_value_min + estimated_value_max) / 2, estimated_value_min, 0)) FILTER (WHERE lead_status = 'hot' OR close_probability >= 80) as hot_pipeline,
    SUM(COALESCE((estimated_value_min + estimated_value_max) / 2, estimated_value_min, 0)) FILTER (WHERE lead_status = 'warm' OR (close_probability >= 50 AND close_probability < 80)) as warm_pipeline,
    SUM(COALESCE((estimated_value_min + estimated_value_max) / 2, estimated_value_min, 0)) FILTER (WHERE revenue_category = 'repair') as repair_revenue,
    SUM(COALESCE((estimated_value_min + estimated_value_max) / 2, estimated_value_min, 0)) FILTER (WHERE revenue_category = 'replacement') as replacement_revenue,
    SUM(COALESCE((estimated_value_min + estimated_value_max) / 2, estimated_value_min, 0)) FILTER (WHERE revenue_category = 'insurance') as insurance_revenue,
    SUM(COALESCE((estimated_value_min + estimated_value_max) / 2, estimated_value_min, 0)) FILTER (WHERE revenue_category = 'storm') as storm_revenue,
    SUM(COALESCE((estimated_value_min + estimated_value_max) / 2, estimated_value_min, 0)) FILTER (WHERE revenue_category = 'commercial') as commercial_revenue,
    SUM(COALESCE((estimated_value_min + estimated_value_max) / 2, estimated_value_min, 0)) FILTER (WHERE revenue_category = 'gutter') as gutter_revenue,
    SUM(COALESCE((estimated_value_min + estimated_value_max) / 2, estimated_value_min, 0)) FILTER (WHERE revenue_category = 'skylight') as skylight_revenue,
    AVG(close_probability) FILTER (WHERE close_probability IS NOT NULL) as avg_close_probability,
    AVG(close_probability) FILTER (WHERE lead_status = 'hot' OR close_probability >= 80) as avg_close_probability_hot,
    COUNT(*) FILTER (WHERE quote_sent_at IS NOT NULL) as total_quotes_sent,
    COUNT(*) FILTER (WHERE lead_status = 'won') as total_jobs_won,
    AVG(COALESCE((estimated_value_min + estimated_value_max) / 2, estimated_value_min)) FILTER (WHERE estimated_value_min IS NOT NULL) as avg_job_value
  INTO v_stats
  FROM public.contacts
  WHERE workspace_id = p_workspace_id;
  
  -- Upsert revenue_stats
  INSERT INTO public.revenue_stats (
    workspace_id,
    total_pipeline_value,
    hot_pipeline_value,
    warm_pipeline_value,
    repair_revenue,
    replacement_revenue,
    insurance_revenue,
    storm_revenue,
    commercial_revenue,
    gutter_revenue,
    skylight_revenue,
    avg_close_probability,
    avg_close_probability_hot,
    forecast_7_days,
    forecast_30_days,
    forecast_90_days,
    total_quotes_sent,
    total_jobs_won,
    avg_job_value,
    calculated_at
  ) VALUES (
    p_workspace_id,
    COALESCE(v_stats.total_pipeline, 0),
    COALESCE(v_stats.hot_pipeline, 0),
    COALESCE(v_stats.warm_pipeline, 0),
    COALESCE(v_stats.repair_revenue, 0),
    COALESCE(v_stats.replacement_revenue, 0),
    COALESCE(v_stats.insurance_revenue, 0),
    COALESCE(v_stats.storm_revenue, 0),
    COALESCE(v_stats.commercial_revenue, 0),
    COALESCE(v_stats.gutter_revenue, 0),
    COALESCE(v_stats.skylight_revenue, 0),
    v_stats.avg_close_probability,
    v_stats.avg_close_probability_hot,
    (v_forecast->>'forecast_7_days')::numeric,
    (v_forecast->>'forecast_30_days')::numeric,
    (v_forecast->>'forecast_90_days')::numeric,
    v_stats.total_quotes_sent,
    v_stats.total_jobs_won,
    v_stats.avg_job_value,
    now()
  )
  ON CONFLICT (workspace_id) DO UPDATE SET
    total_pipeline_value = EXCLUDED.total_pipeline_value,
    hot_pipeline_value = EXCLUDED.hot_pipeline_value,
    warm_pipeline_value = EXCLUDED.warm_pipeline_value,
    repair_revenue = EXCLUDED.repair_revenue,
    replacement_revenue = EXCLUDED.replacement_revenue,
    insurance_revenue = EXCLUDED.insurance_revenue,
    storm_revenue = EXCLUDED.storm_revenue,
    commercial_revenue = EXCLUDED.commercial_revenue,
    gutter_revenue = EXCLUDED.gutter_revenue,
    skylight_revenue = EXCLUDED.skylight_revenue,
    avg_close_probability = EXCLUDED.avg_close_probability,
    avg_close_probability_hot = EXCLUDED.avg_close_probability_hot,
    forecast_7_days = EXCLUDED.forecast_7_days,
    forecast_30_days = EXCLUDED.forecast_30_days,
    forecast_90_days = EXCLUDED.forecast_90_days,
    total_quotes_sent = EXCLUDED.total_quotes_sent,
    total_jobs_won = EXCLUDED.total_jobs_won,
    avg_job_value = EXCLUDED.avg_job_value,
    calculated_at = now();
  
  RETURN jsonb_build_object(
    'ok', true,
    'workspace_id', p_workspace_id,
    'stats', jsonb_build_object(
      'total_pipeline', v_stats.total_pipeline,
      'hot_pipeline', v_stats.hot_pipeline,
      'warm_pipeline', v_stats.warm_pipeline,
      'forecast', v_forecast,
      'storm_revenue', v_storm_revenue
    )
  );
END;
$$;

COMMENT ON FUNCTION public.calculate_workspace_revenue_stats IS 'Calculates and stores aggregated revenue stats for a workspace including pipeline values, forecasts, and storm revenue (Block 16400)';

-- ============================================================================
-- 16. GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT ON public.revenue_stats TO authenticated;
GRANT SELECT ON public.job_estimates TO authenticated;
GRANT SELECT ON public.close_probability TO authenticated;
GRANT SELECT ON public.storm_revenue_scores TO authenticated;

GRANT EXECUTE ON FUNCTION public.detect_job_type_v2(jsonb, text[], jsonb, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_estimated_value_v2(text, numeric, numeric, integer, text, text, integer, text, boolean, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_close_probability(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.calculate_insurance_revenue(uuid, text, text, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.calculate_revenue_forecast(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_storm_revenue(uuid, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_quote_data(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_contact_revenue_v2(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.calculate_workspace_revenue_stats(uuid) TO service_role;

-- ============================================================================
-- 17. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.revenue_stats IS 'Aggregated revenue statistics per workspace (Block 16400)';
COMMENT ON TABLE public.job_estimates IS 'Detailed job estimates with calculation factors (Block 16400)';
COMMENT ON TABLE public.close_probability IS 'Close probability scores (0-100) for contacts (Block 16400)';
COMMENT ON TABLE public.storm_revenue_scores IS 'Storm revenue tracking and recommendations (Block 16400)';

COMMENT ON COLUMN public.contacts.close_probability IS 'Close probability score (0-100) based on multiple factors (Block 16400)';
COMMENT ON COLUMN public.contacts.estimated_close_date IS 'Estimated date when job is likely to close (Block 16400)';
COMMENT ON COLUMN public.contacts.quote_amount IS 'Amount of the quote sent to homeowner (Block 16400)';
COMMENT ON COLUMN public.contacts.insurance_claim_value_min IS 'Minimum estimated insurance claim payout (Block 16400)';
COMMENT ON COLUMN public.contacts.insurance_claim_value_max IS 'Maximum estimated insurance claim payout (Block 16400)';
COMMENT ON COLUMN public.contacts.storm_impact_severity IS 'Severity of storm impact (high/medium/low/none) (Block 16400)';
COMMENT ON COLUMN public.contacts.high_value_flag IS 'Flag indicating high-value opportunity (Block 16400)';





















































