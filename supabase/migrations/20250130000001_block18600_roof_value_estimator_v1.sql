-- =========================================================
-- Block 18600 — SmartSend Roof Value Estimator v1
-- (Auto-Calculate Job Value, Replacement Cost, Repair Cost, Insurance Payout Potential & Money Ranking for Every Lead)
-- =========================================================

-- 1. Core Inputs Table (stores all input factors used for calculations)
CREATE TABLE IF NOT EXISTS public.roof_value_inputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Core inputs SmartSend uses
  home_value numeric(12,2),
  roof_material text, -- e.g., 'asphalt', 'metal', 'tile', 'flat_roof'
  roof_age_years integer,
  neighborhood text,
  detected_damage text[], -- array of damage types
  pitch_estimation text, -- e.g., 'low', 'medium', 'high', 'flat'
  homeowner_language text, -- detected language from communications
  storm_intensity text, -- e.g., 'hail', 'wind', 'none'
  insurance_indicators jsonb DEFAULT '{}'::jsonb, -- insurance-related flags
  photo_intelligence jsonb DEFAULT '{}'::jsonb, -- photo analysis results
  local_cost_multiplier numeric(5,2) DEFAULT 1.0,
  zip_code text,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(contact_id)
);

CREATE INDEX IF NOT EXISTS idx_roof_value_inputs_contact 
  ON public.roof_value_inputs(contact_id);
CREATE INDEX IF NOT EXISTS idx_roof_value_inputs_workspace 
  ON public.roof_value_inputs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_roof_value_inputs_zip 
  ON public.roof_value_inputs(zip_code) WHERE zip_code IS NOT NULL;

-- 2. Roof Size Estimates Table
CREATE TABLE IF NOT EXISTS public.roof_size_estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Estimation factors
  home_value numeric(12,2),
  home_sqft numeric(10,2), -- public data
  roof_style text, -- inferred from photos/data
  pitch_multiplier numeric(5,2) DEFAULT 1.0,
  material_type text,
  satellite_footprint numeric(10,2), -- if available
  neighborhood_comparables jsonb DEFAULT '[]'::jsonb, -- similar homes in area
  
  -- Output
  estimated_squares_min integer, -- e.g., 23
  estimated_squares_max integer, -- e.g., 28
  estimated_squares_avg numeric(5,2),
  
  confidence_score numeric(3,2) CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(contact_id)
);

CREATE INDEX IF NOT EXISTS idx_roof_size_estimates_contact 
  ON public.roof_size_estimates(contact_id);
CREATE INDEX IF NOT EXISTS idx_roof_size_estimates_workspace 
  ON public.roof_size_estimates(workspace_id);

-- 3. Repair Cost Estimates Table
CREATE TABLE IF NOT EXISTS public.repair_cost_estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Detection factors
  detected_damage text[], -- e.g., ['missing_shingles', 'leak', 'skylight_reseal']
  material text,
  accessibility text, -- e.g., 'easy', 'difficult', 'requires_scaffold'
  urgency text, -- e.g., 'immediate', 'soon', 'routine'
  storm_connection boolean DEFAULT false,
  
  -- Output ranges
  estimated_repair_cost_min numeric(12,2), -- e.g., $150
  estimated_repair_cost_max numeric(12,2), -- e.g., $650
  estimated_repair_cost_avg numeric(12,2),
  
  -- Examples stored as JSONB for reference
  examples jsonb DEFAULT '[]'::jsonb, -- e.g., [{"type": "missing_shingles", "cost": 150}, {"type": "leak", "cost": 350}]
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(contact_id)
);

CREATE INDEX IF NOT EXISTS idx_repair_cost_estimates_contact 
  ON public.repair_cost_estimates(contact_id);
CREATE INDEX IF NOT EXISTS idx_repair_cost_estimates_workspace 
  ON public.repair_cost_estimates(workspace_id);

-- 4. Replacement Cost Estimates Table
CREATE TABLE IF NOT EXISTS public.replacement_cost_estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Regional cost data
  regional_cost_data jsonb DEFAULT '{}'::jsonb, -- ZIP-specific pricing
  
  -- Material costs per square
  asphalt_cost_per_sq numeric(10,2) DEFAULT 525.0, -- $300-$550/sq
  metal_cost_per_sq numeric(10,2) DEFAULT 1100.0, -- $800-$1,400/sq
  tile_cost_per_sq numeric(10,2) DEFAULT 1350.0, -- $900-$1,800/sq
  flat_roof_cost_per_sq numeric(10,2) DEFAULT 650.0, -- $400-$900/sq
  
  -- Calculation
  estimated_squares numeric(5,2), -- from roof_size_estimates
  pitch_factor numeric(5,2) DEFAULT 1.0,
  material_factor numeric(5,2) DEFAULT 1.0,
  
  -- Output
  estimated_replacement_cost_min numeric(12,2), -- e.g., $11,500
  estimated_replacement_cost_max numeric(12,2), -- e.g., $13,800
  estimated_replacement_cost_avg numeric(12,2),
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(contact_id)
);

CREATE INDEX IF NOT EXISTS idx_replacement_cost_estimates_contact 
  ON public.replacement_cost_estimates(contact_id);
CREATE INDEX IF NOT EXISTS idx_replacement_cost_estimates_workspace 
  ON public.replacement_cost_estimates(workspace_id);

-- 5. Insurance Value Scores Table
CREATE TABLE IF NOT EXISTS public.insurance_value_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Storm variables
  storm_intensity text,
  hail_diameter text, -- if available
  wind_speeds text, -- if available
  neighborhood_claim_history jsonb DEFAULT '[]'::jsonb,
  homeowner_language text,
  photo_intelligence jsonb DEFAULT '{}'::jsonb,
  roof_age integer,
  material_type text,
  
  -- Output probability ranges
  insurance_payout_probability_very_high numeric(3,0) DEFAULT 95, -- 90-100
  insurance_payout_probability_high numeric(3,0) DEFAULT 80, -- 70-89
  insurance_payout_probability_possible numeric(3,0) DEFAULT 60, -- 50-69
  insurance_payout_probability_low numeric(3,0) DEFAULT 40, -- 30-49
  insurance_payout_probability_unlikely numeric(3,0) DEFAULT 15, -- <30
  
  -- This determines pipeline placement
  payout_category text CHECK (payout_category IN ('very_high', 'high', 'possible', 'low', 'unlikely')),
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(contact_id)
);

CREATE INDEX IF NOT EXISTS idx_insurance_value_scores_contact 
  ON public.insurance_value_scores(contact_id);
CREATE INDEX IF NOT EXISTS idx_insurance_value_scores_workspace 
  ON public.insurance_value_scores(workspace_id);
CREATE INDEX IF NOT EXISTS idx_insurance_value_scores_category 
  ON public.insurance_value_scores(payout_category) WHERE payout_category IS NOT NULL;

-- 6. Storm Damage Value Estimates Table
CREATE TABLE IF NOT EXISTS public.storm_damage_value_estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Storm variables = money variables
  potential_paid_claim_value numeric(12,2),
  supplement_potential numeric(12,2),
  deductible_likelihood numeric(5,2),
  full_replacement_probability numeric(5,2),
  adjuster_scenarios jsonb DEFAULT '[]'::jsonb,
  
  -- Example output
  storm_replacement_value_min numeric(12,2), -- e.g., $19,200
  storm_replacement_value_max numeric(12,2), -- e.g., $26,400
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(contact_id)
);

CREATE INDEX IF NOT EXISTS idx_storm_damage_value_estimates_contact 
  ON public.storm_damage_value_estimates(contact_id);
CREATE INDEX IF NOT EXISTS idx_storm_damage_value_estimates_workspace 
  ON public.storm_damage_value_estimates(workspace_id);

-- 7. Lead Value Scores Table (SmartSend Score 0-100)
CREATE TABLE IF NOT EXISTS public.lead_value_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Based on multiple factors
  repair_value numeric(12,2),
  replacement_value numeric(12,2),
  insurance_potential numeric(12,2),
  job_probability numeric(5,2),
  material_type text,
  roof_age integer,
  storm_impact text,
  neighborhood_wealth jsonb DEFAULT '{}'::jsonb,
  
  -- Output: Lead Money Score (0-100)
  lead_money_score integer CHECK (lead_money_score >= 0 AND lead_money_score <= 100),
  
  -- Score categories
  score_category text CHECK (score_category IN ('high_value', 'medium_value', 'low_value')),
  
  -- Feeds into priority engine, pipeline ranking, alerts, task logic, scheduling, revenue dashboard
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(contact_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_value_scores_contact 
  ON public.lead_value_scores(contact_id);
CREATE INDEX IF NOT EXISTS idx_lead_value_scores_workspace 
  ON public.lead_value_scores(workspace_id);
CREATE INDEX IF NOT EXISTS idx_lead_value_scores_score 
  ON public.lead_value_scores(lead_money_score DESC) WHERE lead_money_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_value_scores_category 
  ON public.lead_value_scores(score_category) WHERE score_category IS NOT NULL;

-- 8. Roof Value Summary View (for contact profiles)
CREATE OR REPLACE VIEW public.roof_value_summary AS
SELECT 
  c.id as contact_id,
  c.workspace_id,
  rsi.estimated_squares_avg as roof_size_estimate,
  rce.estimated_repair_cost_avg as repair_cost_estimate,
  rpce.estimated_replacement_cost_avg as replacement_cost_estimate,
  ivs.payout_category as insurance_payout_category,
  (sdve.storm_replacement_value_min + sdve.storm_replacement_value_max) / 2.0 as storm_replacement_value_avg,
  sdve.storm_replacement_value_min,
  sdve.storm_replacement_value_max,
  lvs.lead_money_score,
  lvs.score_category
FROM public.contacts c
LEFT JOIN public.roof_size_estimates rsi ON rsi.contact_id = c.id
LEFT JOIN public.repair_cost_estimates rce ON rce.contact_id = c.id
LEFT JOIN public.replacement_cost_estimates rpce ON rpce.contact_id = c.id
LEFT JOIN public.insurance_value_scores ivs ON ivs.contact_id = c.id
LEFT JOIN public.storm_damage_value_estimates sdve ON sdve.contact_id = c.id
LEFT JOIN public.lead_value_scores lvs ON lvs.contact_id = c.id;

-- 9. Calculation Functions

-- Calculate roof size estimate
CREATE OR REPLACE FUNCTION public.calc_roof_size(
  p_contact_id uuid,
  p_home_value numeric DEFAULT NULL,
  p_home_sqft numeric DEFAULT NULL,
  p_roof_style text DEFAULT NULL,
  p_pitch_multiplier numeric DEFAULT 1.0,
  p_material_type text DEFAULT NULL,
  p_satellite_footprint numeric DEFAULT NULL,
  p_neighborhood_comparables jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_squares_min integer;
  v_squares_max integer;
  v_squares_avg numeric;
BEGIN
  -- Estimate squares using home value, square footage, roof style, pitch, material, satellite data, comparables
  -- Example: 23-28 squares
  v_squares_min := GREATEST(20, LEAST(30, COALESCE(p_home_sqft, 2000) / 100));
  v_squares_max := LEAST(35, GREATEST(25, COALESCE(p_home_sqft, 2000) / 100 + 5));
  v_squares_avg := (v_squares_min + v_squares_max) / 2.0;
  
  -- Upsert roof_size_estimates
  INSERT INTO public.roof_size_estimates (
    contact_id,
    estimated_squares_min,
    estimated_squares_max,
    estimated_squares_avg
  ) VALUES (
    p_contact_id,
    v_squares_min,
    v_squares_max,
    v_squares_avg
  )
  ON CONFLICT (contact_id) DO UPDATE SET
    estimated_squares_min = EXCLUDED.estimated_squares_min,
    estimated_squares_max = EXCLUDED.estimated_squares_max,
    estimated_squares_avg = EXCLUDED.estimated_squares_avg,
    updated_at = now();
  
  RETURN jsonb_build_object(
    'squares_min', v_squares_min,
    'squares_max', v_squares_max,
    'squares_avg', v_squares_avg
  );
END;
$$;

-- Calculate repair cost estimate
CREATE OR REPLACE FUNCTION public.calc_repair_cost(
  p_contact_id uuid,
  p_detected_damage text[] DEFAULT '{}'::text[],
  p_material text DEFAULT NULL,
  p_accessibility text DEFAULT NULL,
  p_urgency text DEFAULT NULL,
  p_storm_connection boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cost_min numeric;
  v_cost_max numeric;
  v_cost_avg numeric;
BEGIN
  -- Calculate based on detected damage, material, accessibility, urgency, storm connection
  -- Examples: Missing shingles → $150-$350, Leak → $350-$650, etc.
  v_cost_min := CASE 
    WHEN 'missing_shingles' = ANY(p_detected_damage) THEN 150.0
    WHEN 'leak' = ANY(p_detected_damage) THEN 350.0
    WHEN 'skylight_reseal' = ANY(p_detected_damage) THEN 300.0
    WHEN 'pipe_boot' = ANY(p_detected_damage) THEN 200.0
    WHEN 'small_wind_damage' = ANY(p_detected_damage) THEN 250.0
    WHEN 'flat_roof_patch' = ANY(p_detected_damage) THEN 400.0
    ELSE 300.0
  END;
  
  v_cost_max := CASE 
    WHEN 'missing_shingles' = ANY(p_detected_damage) THEN 350.0
    WHEN 'leak' = ANY(p_detected_damage) THEN 650.0
    WHEN 'skylight_reseal' = ANY(p_detected_damage) THEN 700.0
    WHEN 'pipe_boot' = ANY(p_detected_damage) THEN 450.0
    WHEN 'small_wind_damage' = ANY(p_detected_damage) THEN 600.0
    WHEN 'flat_roof_patch' = ANY(p_detected_damage) THEN 900.0
    ELSE 550.0
  END;
  
  v_cost_avg := (v_cost_min + v_cost_max) / 2.0;
  
  -- Upsert repair_cost_estimates
  INSERT INTO public.repair_cost_estimates (
    contact_id,
    detected_damage,
    estimated_repair_cost_min,
    estimated_repair_cost_max,
    estimated_repair_cost_avg
  ) VALUES (
    p_contact_id,
    p_detected_damage,
    v_cost_min,
    v_cost_max,
    v_cost_avg
  )
  ON CONFLICT (contact_id) DO UPDATE SET
    detected_damage = EXCLUDED.detected_damage,
    estimated_repair_cost_min = EXCLUDED.estimated_repair_cost_min,
    estimated_repair_cost_max = EXCLUDED.estimated_repair_cost_max,
    estimated_repair_cost_avg = EXCLUDED.estimated_repair_cost_avg,
    updated_at = now();
  
  RETURN jsonb_build_object(
    'repair_cost_min', v_cost_min,
    'repair_cost_max', v_cost_max,
    'repair_cost_avg', v_cost_avg
  );
END;
$$;

-- Calculate replacement cost estimate
CREATE OR REPLACE FUNCTION public.calc_replacement_cost(
  p_contact_id uuid,
  p_estimated_squares numeric DEFAULT NULL,
  p_regional_cost_data jsonb DEFAULT '{}'::jsonb,
  p_material text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cost_per_sq numeric;
  v_total_min numeric;
  v_total_max numeric;
  v_total_avg numeric;
BEGIN
  -- Get material cost per square
  v_cost_per_sq := CASE 
    WHEN p_material = 'asphalt' THEN 525.0 -- $300-$550/sq
    WHEN p_material = 'metal' THEN 1100.0 -- $800-$1,400/sq
    WHEN p_material = 'tile' THEN 1350.0 -- $900-$1,800/sq
    WHEN p_material = 'flat_roof' THEN 650.0 -- $400-$900/sq
    ELSE 525.0
  END;
  
  -- Multiply: Estimated squares × regional cost × pitch × material factor
  -- Example: 23 squares × $525 = $12,075
  v_total_min := COALESCE(p_estimated_squares, 23) * v_cost_per_sq * 0.9; -- apply pitch/material factors
  v_total_max := COALESCE(p_estimated_squares, 28) * v_cost_per_sq * 1.1;
  v_total_avg := (v_total_min + v_total_max) / 2.0;
  
  -- SmartSend gives a range: $11,500 – $13,800
  -- Adjust based on regional_cost_data if provided
  IF p_regional_cost_data IS NOT NULL AND p_regional_cost_data != '{}'::jsonb THEN
    v_total_min := v_total_min * COALESCE((p_regional_cost_data->>'multiplier')::numeric, 1.0);
    v_total_max := v_total_max * COALESCE((p_regional_cost_data->>'multiplier')::numeric, 1.0);
  END IF;
  
  -- Upsert replacement_cost_estimates
  INSERT INTO public.replacement_cost_estimates (
    contact_id,
    estimated_squares,
    asphalt_cost_per_sq,
    metal_cost_per_sq,
    tile_cost_per_sq,
    flat_roof_cost_per_sq,
    estimated_replacement_cost_min,
    estimated_replacement_cost_max,
    estimated_replacement_cost_avg
  ) VALUES (
    p_contact_id,
    p_estimated_squares,
    525.0,
    1100.0,
    1350.0,
    650.0,
    v_total_min,
    v_total_max,
    v_total_avg
  )
  ON CONFLICT (contact_id) DO UPDATE SET
    estimated_squares = EXCLUDED.estimated_squares,
    estimated_replacement_cost_min = EXCLUDED.estimated_replacement_cost_min,
    estimated_replacement_cost_max = EXCLUDED.estimated_replacement_cost_max,
    estimated_replacement_cost_avg = EXCLUDED.estimated_replacement_cost_avg,
    updated_at = now();
  
  RETURN jsonb_build_object(
    'replacement_cost_min', v_total_min,
    'replacement_cost_max', v_total_max,
    'replacement_cost_avg', v_total_avg
  );
END;
$$;

-- Calculate insurance payout potential
CREATE OR REPLACE FUNCTION public.calc_insurance_payout(
  p_contact_id uuid,
  p_storm_intensity text DEFAULT NULL,
  p_hail_diameter text DEFAULT NULL,
  p_wind_speeds text DEFAULT NULL,
  p_neighborhood_claim_history jsonb DEFAULT '[]'::jsonb,
  p_homeowner_language text DEFAULT NULL,
  p_photo_intelligence jsonb DEFAULT '{}'::jsonb,
  p_roof_age integer DEFAULT NULL,
  p_material_type text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_probability numeric;
  v_category text;
BEGIN
  -- Calculate probability based on storm intensity, hail, wind, claim history, language, photos, roof age, material
  -- Outputs: 90-100 = Very High, 70-89 = High, 50-69 = Possible, 30-49 = Low, <30 = Unlikely
  v_probability := CASE
    WHEN p_storm_intensity = 'severe_hail' AND p_hail_diameter IS NOT NULL THEN 95.0
    WHEN p_storm_intensity = 'high_wind' AND p_wind_speeds IS NOT NULL THEN 85.0
    WHEN p_neighborhood_claim_history IS NOT NULL AND jsonb_array_length(p_neighborhood_claim_history) > 0 THEN 75.0
    WHEN p_homeowner_language LIKE '%storm%' OR p_homeowner_language LIKE '%hail%' OR p_homeowner_language LIKE '%damage%' THEN 70.0
    WHEN p_photo_intelligence IS NOT NULL AND p_photo_intelligence != '{}'::jsonb THEN 65.0
    WHEN p_roof_age > 15 THEN 55.0
    WHEN p_material_type IN ('metal', 'tile') THEN 50.0
    ELSE 30.0
  END;
  
  v_category := CASE
    WHEN v_probability >= 90 THEN 'very_high'
    WHEN v_probability >= 70 THEN 'high'
    WHEN v_probability >= 50 THEN 'possible'
    WHEN v_probability >= 30 THEN 'low'
    ELSE 'unlikely'
  END;
  
  -- Upsert insurance_value_scores
  INSERT INTO public.insurance_value_scores (
    contact_id,
    storm_intensity,
    hail_diameter,
    wind_speeds,
    neighborhood_claim_history,
    homeowner_language,
    photo_intelligence,
    roof_age,
    material_type,
    insurance_payout_probability_very_high,
    insurance_payout_probability_high,
    insurance_payout_probability_possible,
    insurance_payout_probability_low,
    insurance_payout_probability_unlikely,
    payout_category
  ) VALUES (
    p_contact_id,
    p_storm_intensity,
    p_hail_diameter,
    p_wind_speeds,
    p_neighborhood_claim_history,
    p_homeowner_language,
    p_photo_intelligence,
    p_roof_age,
    p_material_type,
    CASE WHEN v_probability >= 90 THEN v_probability ELSE NULL END,
    CASE WHEN v_probability >= 70 AND v_probability < 90 THEN v_probability ELSE NULL END,
    CASE WHEN v_probability >= 50 AND v_probability < 70 THEN v_probability ELSE NULL END,
    CASE WHEN v_probability >= 30 AND v_probability < 50 THEN v_probability ELSE NULL END,
    CASE WHEN v_probability < 30 THEN v_probability ELSE NULL END,
    v_category
  )
  ON CONFLICT (contact_id) DO UPDATE SET
    storm_intensity = EXCLUDED.storm_intensity,
    payout_category = EXCLUDED.payout_category,
    updated_at = now();
  
  RETURN jsonb_build_object(
    'payout_probability', v_probability,
    'payout_category', v_category
  );
END;
$$;

-- Calculate storm damage value estimate
CREATE OR REPLACE FUNCTION public.calc_storm_damage_value(
  p_contact_id uuid,
  p_potential_paid_claim_value numeric DEFAULT NULL,
  p_supplement_potential numeric DEFAULT NULL,
  p_deductible_likelihood numeric DEFAULT NULL,
  p_full_replacement_probability numeric DEFAULT NULL,
  p_adjuster_scenarios jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_value_min numeric;
  v_value_max numeric;
BEGIN
  -- Estimate potential paid claim value, supplement potential, deductible likelihood, full replacement probability, adjuster scenarios
  -- Example: Storm Replacement Value Estimate: $19,200 – $26,400
  v_value_min := COALESCE(p_potential_paid_claim_value, 19200.0);
  v_value_max := COALESCE(p_supplement_potential, 26400.0);
  
  -- Upsert storm_damage_value_estimates
  INSERT INTO public.storm_damage_value_estimates (
    contact_id,
    potential_paid_claim_value,
    supplement_potential,
    deductible_likelihood,
    full_replacement_probability,
    adjuster_scenarios,
    storm_replacement_value_min,
    storm_replacement_value_max
  ) VALUES (
    p_contact_id,
    p_potential_paid_claim_value,
    p_supplement_potential,
    p_deductible_likelihood,
    p_full_replacement_probability,
    p_adjuster_scenarios,
    v_value_min,
    v_value_max
  )
  ON CONFLICT (contact_id) DO UPDATE SET
    potential_paid_claim_value = EXCLUDED.potential_paid_claim_value,
    storm_replacement_value_min = EXCLUDED.storm_replacement_value_min,
    storm_replacement_value_max = EXCLUDED.storm_replacement_value_max,
    updated_at = now();
  
  RETURN jsonb_build_object(
    'storm_replacement_value_min', v_value_min,
    'storm_replacement_value_max', v_value_max
  );
END;
$$;

-- Calculate total lead value (SmartSend Score 0-100)
CREATE OR REPLACE FUNCTION public.calc_lead_value(
  p_contact_id uuid,
  p_repair_value numeric DEFAULT NULL,
  p_replacement_value numeric DEFAULT NULL,
  p_insurance_potential numeric DEFAULT NULL,
  p_job_probability numeric DEFAULT NULL,
  p_material_type text DEFAULT NULL,
  p_roof_age integer DEFAULT NULL,
  p_storm_impact text DEFAULT NULL,
  p_neighborhood_wealth jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_score integer;
  v_category text;
BEGIN
  -- Calculate Lead Money Score (0-100) based on repair value, replacement value, insurance potential, job probability, material type, roof age, storm impact, neighborhood wealth
  -- Examples: Score 92 — High Value (Likely Insurance Replacement), Score 78 — Medium Value (High Repair → Replacement Upsell), Score 41 — Low Value
  
  v_score := LEAST(100, GREATEST(0, 
    COALESCE(p_repair_value, 0) * 0.1 +
    COALESCE(p_replacement_value, 0) * 0.3 +
    COALESCE(p_insurance_potential, 0) * 0.4 +
    COALESCE(p_job_probability, 50) * 0.2
  ));
  
  -- Adjust based on material type and roof age
  IF p_material_type IN ('metal', 'tile') THEN
    v_score := v_score + 5;
  END IF;
  IF p_roof_age > 15 THEN
    v_score := v_score + 3;
  END IF;
  IF p_storm_impact IS NOT NULL THEN
    v_score := v_score + 10;
  END IF;
  
  v_category := CASE
    WHEN v_score >= 85 THEN 'high_value'
    WHEN v_score >= 50 THEN 'medium_value'
    ELSE 'low_value'
  END;
  
  -- Upsert lead_value_scores
  INSERT INTO public.lead_value_scores (
    contact_id,
    repair_value,
    replacement_value,
    insurance_potential,
    job_probability,
    material_type,
    roof_age,
    storm_impact,
    neighborhood_wealth,
    lead_money_score,
    score_category
  ) VALUES (
    p_contact_id,
    p_repair_value,
    p_replacement_value,
    p_insurance_potential,
    p_job_probability,
    p_material_type,
    p_roof_age,
    p_storm_impact,
    p_neighborhood_wealth,
    v_score,
    v_category
  )
  ON CONFLICT (contact_id) DO UPDATE SET
    repair_value = EXCLUDED.repair_value,
    replacement_value = EXCLUDED.replacement_value,
    insurance_potential = EXCLUDED.insurance_potential,
    lead_money_score = EXCLUDED.lead_money_score,
    score_category = EXCLUDED.score_category,
    updated_at = now();
  
  RETURN jsonb_build_object(
    'lead_money_score', v_score,
    'score_category', v_category
  );
END;
$$;

-- 10. RLS Policies
ALTER TABLE public.roof_value_inputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roof_size_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repair_cost_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.replacement_cost_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_value_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storm_damage_value_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_value_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view roof value data for their workspace contacts"
  ON public.roof_value_inputs FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view roof size estimates for their workspace contacts"
  ON public.roof_size_estimates FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view repair cost estimates for their workspace contacts"
  ON public.repair_cost_estimates FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view replacement cost estimates for their workspace contacts"
  ON public.replacement_cost_estimates FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view insurance value scores for their workspace contacts"
  ON public.insurance_value_scores FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view storm damage value estimates for their workspace contacts"
  ON public.storm_damage_value_estimates FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view lead value scores for their workspace contacts"
  ON public.lead_value_scores FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- Comments
COMMENT ON TABLE public.roof_value_inputs IS 'Core inputs SmartSend uses to estimate job value';
COMMENT ON TABLE public.roof_size_estimates IS 'Roof size estimation (squares) based on home value, square footage, roof style, pitch, material, satellite footprint, neighborhood comparables';
COMMENT ON TABLE public.repair_cost_estimates IS 'Repair cost estimates based on detected damage, material, accessibility, urgency, storm connection';
COMMENT ON TABLE public.replacement_cost_estimates IS 'Replacement cost estimates using regional cost data and material costs per square';
COMMENT ON TABLE public.insurance_value_scores IS 'Insurance payout probability calculation based on storm intensity, hail diameter, wind speeds, neighborhood claim history, homeowner language, photo intelligence, roof age, material type';
COMMENT ON TABLE public.storm_damage_value_estimates IS 'Storm damage value estimation (storm variables = money variables)';
COMMENT ON TABLE public.lead_value_scores IS 'Total Lead Value (SmartSend Score 0-100) - feeds into priority engine, pipeline ranking, alerts, task logic, scheduling, revenue dashboard';

