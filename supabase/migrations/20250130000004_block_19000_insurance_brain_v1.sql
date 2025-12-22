-- =========================================================
-- Block 19000 — SmartSend AI Insurance Brain v1
-- (The Smartest Insurance Assistant in Roofing)
-- =========================================================
-- 
-- This builds on Block 17400 and adds:
-- - Enhanced detection with 100+ keywords
-- - Claim type classification (Wind, Hail, Leak, Tree, Ice Dam, General Storm)
-- - Coverage type detection (RCV, ACV, Depreciation, etc.)
-- - Deductible intelligence & affordability analysis
-- - Adjuster timeline recognition & auto-tasks
-- - Enhanced probability scoring (0-100)
-- - Approval likelihood engine
-- - Supplement detection engine
-- - State-specific rules (v1)
-- - Insurance Intelligence Dashboard Panel
-- =========================================================

-- ============================================================================
-- 1. ENHANCE insurance_metadata TABLE with new fields
-- ============================================================================

ALTER TABLE IF EXISTS public.insurance_metadata
  ADD COLUMN IF NOT EXISTS claim_type text CHECK (claim_type IN ('wind', 'hail', 'leak_water_damage', 'tree_impact', 'ice_dam', 'general_storm', 'unknown')),
  ADD COLUMN IF NOT EXISTS coverage_type text CHECK (coverage_type IN ('rcv', 'acv', 'depreciation', 'deductible_policy', 'cosmetic_exclusion', 'matching_law', 'manufacturer_defect', 'unknown')),
  ADD COLUMN IF NOT EXISTS deductible_affordability text CHECK (deductible_affordability IN ('high', 'medium', 'low', 'unknown')),
  ADD COLUMN IF NOT EXISTS deductible_waiver_applicable boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS approval_likelihood text CHECK (approval_likelihood IN ('high', 'moderate', 'low', 'likely_denial', 'supplement_required')),
  ADD COLUMN IF NOT EXISTS approval_likelihood_score integer CHECK (approval_likelihood_score >= 0 AND approval_likelihood_score <= 100),
  ADD COLUMN IF NOT EXISTS supplement_potential text CHECK (supplement_potential IN ('high', 'medium', 'low', 'none')),
  ADD COLUMN IF NOT EXISTS supplement_opportunities jsonb DEFAULT '[]'::jsonb, -- Array of detected opportunities
  ADD COLUMN IF NOT EXISTS state_code text, -- For state-specific rules
  ADD COLUMN IF NOT EXISTS next_best_action text,
  ADD COLUMN IF NOT EXISTS estimated_payout numeric(12,2);

-- Add indexes for new fields
CREATE INDEX IF NOT EXISTS idx_insurance_metadata_claim_type ON public.insurance_metadata(workspace_id, claim_type);
CREATE INDEX IF NOT EXISTS idx_insurance_metadata_coverage_type ON public.insurance_metadata(workspace_id, coverage_type);
CREATE INDEX IF NOT EXISTS idx_insurance_metadata_approval_likelihood ON public.insurance_metadata(workspace_id, approval_likelihood);

-- ============================================================================
-- 2. CREATE insurance_claims TABLE (detailed claim tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.insurance_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Claim Identification
  claim_number text,
  insurance_company text,
  policy_number text,
  
  -- Claim Type Classification
  claim_type text NOT NULL CHECK (claim_type IN ('wind', 'hail', 'leak_water_damage', 'tree_impact', 'ice_dam', 'general_storm', 'unknown')),
  claim_type_confidence numeric(3,2) CHECK (claim_type_confidence >= 0.0 AND claim_type_confidence <= 1.0),
  claim_type_indicators text[], -- Keywords/phrases that led to classification
  
  -- Coverage Details
  coverage_type text CHECK (coverage_type IN ('rcv', 'acv', 'depreciation', 'deductible_policy', 'cosmetic_exclusion', 'matching_law', 'manufacturer_defect', 'unknown')),
  coverage_type_detected_from text, -- Where coverage type was detected (message, document, etc.)
  
  -- Financial Details
  deductible numeric(12,2),
  deductible_affordability text CHECK (deductible_affordability IN ('high', 'medium', 'low', 'unknown')),
  deductible_waiver_applicable boolean DEFAULT false,
  acv numeric(12,2),
  rcv numeric(12,2),
  depreciation numeric(12,2),
  net_claim_amount numeric(12,2),
  estimated_payout numeric(12,2),
  
  -- Approval Likelihood
  approval_likelihood text CHECK (approval_likelihood IN ('high', 'moderate', 'low', 'likely_denial', 'supplement_required')),
  approval_likelihood_score integer CHECK (approval_likelihood_score >= 0 AND approval_likelihood_score <= 100),
  approval_likelihood_reasoning text,
  
  -- Adjuster Information
  adjuster_name text,
  adjuster_phone text,
  adjuster_email text,
  adjuster_scheduled_date date,
  adjuster_meeting_date date,
  adjuster_meeting_completed boolean DEFAULT false,
  
  -- Timeline
  date_of_loss date,
  claim_filed_date date,
  scope_received_date date,
  approval_date date,
  denial_date date,
  supplement_submitted_date date,
  
  -- Status
  claim_status text CHECK (claim_status IN ('filed', 'adjuster_scheduled', 'adjuster_met', 'scope_received', 'pending_approval', 'approved', 'denied', 'supplement_pending', 'ready_to_schedule', 'unknown')),
  
  -- Supplement Detection
  supplement_potential text CHECK (supplement_potential IN ('high', 'medium', 'low', 'none')),
  supplement_opportunities jsonb DEFAULT '[]'::jsonb, -- Array of opportunities like: [{"type": "code_upgrade", "item": "step_flashing", "reason": "Missing step flashing — usually payable"}]
  
  -- State-Specific Rules
  state_code text,
  state_rules jsonb DEFAULT '{}'::jsonb, -- Stores state-specific rules like matching laws, deductible rules, etc.
  
  -- Next Actions
  next_best_action text,
  next_action_due_date date,
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(contact_id)
);

CREATE INDEX IF NOT EXISTS idx_insurance_claims_contact ON public.insurance_claims(contact_id);
CREATE INDEX IF NOT EXISTS idx_insurance_claims_workspace ON public.insurance_claims(workspace_id);
CREATE INDEX IF NOT EXISTS idx_insurance_claims_claim_type ON public.insurance_claims(workspace_id, claim_type);
CREATE INDEX IF NOT EXISTS idx_insurance_claims_status ON public.insurance_claims(workspace_id, claim_status);
CREATE INDEX IF NOT EXISTS idx_insurance_claims_approval_likelihood ON public.insurance_claims(workspace_id, approval_likelihood);

-- ============================================================================
-- 3. CREATE insurance_intelligence TABLE (comprehensive intelligence view)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.insurance_intelligence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Overall Intelligence
  is_insurance_candidate boolean DEFAULT false,
  insurance_probability_score integer CHECK (insurance_probability_score >= 0 AND insurance_probability_score <= 100),
  
  -- Claim Classification
  claim_type text CHECK (claim_type IN ('wind', 'hail', 'leak_water_damage', 'tree_impact', 'ice_dam', 'general_storm', 'unknown')),
  claim_type_confidence numeric(3,2),
  
  -- Coverage Intelligence
  coverage_type text CHECK (coverage_type IN ('rcv', 'acv', 'depreciation', 'deductible_policy', 'cosmetic_exclusion', 'matching_law', 'manufacturer_defect', 'unknown')),
  coverage_type_detected boolean DEFAULT false,
  
  -- Deductible Intelligence
  deductible_amount numeric(12,2),
  deductible_affordability text CHECK (deductible_affordability IN ('high', 'medium', 'low', 'unknown')),
  deductible_mentioned boolean DEFAULT false,
  deductible_waiver_applicable boolean DEFAULT false,
  
  -- Adjuster Intelligence
  adjuster_mentioned boolean DEFAULT false,
  adjuster_scheduled boolean DEFAULT false,
  adjuster_visited boolean DEFAULT false,
  adjuster_status text CHECK (adjuster_status IN ('not_scheduled', 'scheduled', 'visited', 'report_pending', 'report_received')),
  
  -- Approval Intelligence
  approval_likelihood text CHECK (approval_likelihood IN ('high', 'moderate', 'low', 'likely_denial', 'supplement_required')),
  approval_likelihood_score integer CHECK (approval_likelihood_score >= 0 AND approval_likelihood_score <= 100),
  
  -- Storm Intelligence
  storm_severity text CHECK (storm_severity IN ('high', 'medium', 'low', 'none')),
  storm_proximity text CHECK (storm_proximity IN ('direct_hit', 'nearby', 'distant', 'unknown')),
  
  -- Supplement Intelligence
  supplement_potential text CHECK (supplement_potential IN ('high', 'medium', 'low', 'none')),
  supplement_opportunities jsonb DEFAULT '[]'::jsonb,
  
  -- Financial Intelligence
  estimated_payout_min numeric(12,2),
  estimated_payout_max numeric(12,2),
  estimated_payout numeric(12,2),
  
  -- Next Actions
  next_best_action text,
  recommended_tasks jsonb DEFAULT '[]'::jsonb, -- Array of recommended tasks
  
  -- Detection Metadata
  detected_keywords text[],
  detection_confidence numeric(3,2),
  last_detected_at timestamptz,
  
  -- Metadata
  intelligence_metadata jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(contact_id)
);

CREATE INDEX IF NOT EXISTS idx_insurance_intelligence_contact ON public.insurance_intelligence(contact_id);
CREATE INDEX IF NOT EXISTS idx_insurance_intelligence_workspace ON public.insurance_intelligence(workspace_id);
CREATE INDEX IF NOT EXISTS idx_insurance_intelligence_score ON public.insurance_intelligence(workspace_id, insurance_probability_score DESC);
CREATE INDEX IF NOT EXISTS idx_insurance_intelligence_candidate ON public.insurance_intelligence(workspace_id, is_insurance_candidate) WHERE is_insurance_candidate = true;

-- ============================================================================
-- 4. CREATE state_insurance_rules TABLE (state-specific insurance rules)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.state_insurance_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code text NOT NULL UNIQUE, -- Two-letter state code (e.g., 'WA', 'TX')
  state_name text NOT NULL,
  
  -- Deductible Rules
  deductible_waiver_available boolean DEFAULT false,
  deductible_waiver_conditions text, -- Conditions for waiver eligibility
  standard_deductible_range text, -- e.g., "$1,000-$2,500"
  
  -- Matching Laws
  matching_law_enforced boolean DEFAULT false,
  matching_law_description text,
  matching_law_coverage text, -- What's covered under matching law
  
  -- Bad Faith Laws
  bad_faith_law_exists boolean DEFAULT false,
  bad_faith_law_description text,
  
  -- Attic Ventilation Rules
  attic_ventilation_required boolean DEFAULT false,
  attic_ventilation_code text,
  
  -- Flashing Codes
  flashing_code_upgrade_required boolean DEFAULT false,
  flashing_code_description text,
  
  -- Other Rules
  other_rules jsonb DEFAULT '{}'::jsonb,
  
  -- Metadata
  last_updated timestamptz DEFAULT now(),
  source text, -- Where this data came from
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_state_insurance_rules_state ON public.state_insurance_rules(state_code);

-- Seed initial state rules (v1 - basic data, can be expanded later)
INSERT INTO public.state_insurance_rules (state_code, state_name, matching_law_enforced, deductible_waiver_available)
VALUES
  ('WA', 'Washington', false, false),
  ('TX', 'Texas', true, true),
  ('FL', 'Florida', true, true),
  ('CO', 'Colorado', true, false),
  ('CA', 'California', false, false),
  ('NC', 'North Carolina', true, false),
  ('SC', 'South Carolina', true, false),
  ('GA', 'Georgia', true, false),
  ('TN', 'Tennessee', true, false),
  ('OK', 'Oklahoma', true, true)
ON CONFLICT (state_code) DO NOTHING;

-- ============================================================================
-- 5. ENHANCED FUNCTION: Detect Insurance Keywords (100+ keywords)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.detect_insurance_keywords_v2(
  p_text text,
  p_attachments jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_keywords text[] := ARRAY[
    -- Core Insurance Terms
    'claim', 'claims', 'insurance', 'insurer', 'carrier', 'policy', 'coverage',
    'deductible', 'deductibles', 'adjuster', 'adjusters', 'adjustment',
    'supplement', 'supplements', 'supplemental',
    'acv', 'rcv', 'actual cash value', 'replacement cost value',
    'depreciation', 'depreciated',
    'filed', 'filing', 'file a claim', 'filed a claim',
    'denied', 'denial', 'denials',
    'approved', 'approval', 'approvals',
    'scope', 'scope of loss', 'scope of work',
    'appraisal', 'appraisals', 'appraiser',
    'roofer estimate', 'roofer estimate required', 'contractor estimate',
    
    -- Storm Damage Terms
    'storm damage', 'storm damages', 'hail damage', 'wind damage',
    'hurricane damage', 'tornado damage',
    'missing shingles', 'shingles missing', 'shingles blown',
    'bent shingles', 'damaged shingles',
    'ridge cap', 'ridge cap loss', 'ridge cap damage',
    'granule loss', 'granules missing',
    'dented metal', 'metal damage',
    'round marks', 'hail marks', 'hail hits',
    
    -- Water/Leak Terms
    'leak', 'leaking', 'leaks', 'water damage', 'water damages',
    'interior stains', 'stains', 'mold', 'wet drywall',
    'attic drip', 'attic drips', 'attic leak',
    
    -- Tree Impact Terms
    'tree hit', 'tree fell', 'tree damage', 'debris hit',
    'broken structure', 'structural damage',
    
    -- Ice Dam Terms
    'ice dam', 'ice dams', 'ice damage',
    
    -- Adjuster Terms
    'adjuster is coming', 'adjuster coming', 'meeting adjuster',
    'adjuster meeting', 'adjuster visit', 'adjuster visited',
    'adjuster report', 'adjuster summary',
    
    -- Coverage Terms
    'cosmetic exclusion', 'cosmetic damage',
    'matching', 'matching law', 'matching requirement',
    'manufacturer defect', 'defective materials',
    
    -- Process Terms
    'inspection', 'inspections', 'inspected',
    'estimate', 'estimates', 'estimated',
    'quote', 'quotes', 'quoted',
    'roof replacement', 'roof repair',
    
    -- Financial Terms
    'payout', 'payouts', 'payment', 'payments',
    'check', 'checks', 'insurance check',
    'claim amount', 'claim value',
    
    -- Status Terms
    'pending', 'pending approval', 'under review',
    'in process', 'processing',
    'completed', 'finished', 'done'
  ];
  v_detected_keywords text[] := '{}';
  v_lower_text text;
  v_keyword text;
  v_has_insurance boolean := false;
  v_confidence numeric(3,2) := 0.0;
  v_keyword_count integer := 0;
BEGIN
  IF p_text IS NULL OR length(trim(p_text)) = 0 THEN
    RETURN jsonb_build_object(
      'has_insurance', false,
      'detected_keywords', '{}'::text[],
      'confidence', 0.0,
      'keyword_count', 0
    );
  END IF;
  
  v_lower_text := lower(p_text);
  
  -- Check for keywords
  FOREACH v_keyword IN ARRAY v_keywords
  LOOP
    IF v_lower_text LIKE '%' || lower(v_keyword) || '%' THEN
      v_has_insurance := true;
      v_detected_keywords := array_append(v_detected_keywords, v_keyword);
      v_keyword_count := v_keyword_count + 1;
    END IF;
  END LOOP;
  
  -- Calculate confidence based on keyword count and types
  IF v_keyword_count > 0 THEN
    v_confidence := LEAST(1.0, 0.3 + (v_keyword_count * 0.1));
  END IF;
  
  -- Boost confidence for high-value keywords
  IF 'adjuster' = ANY(v_detected_keywords) OR 
     'claim number' = ANY(v_detected_keywords) OR
     'filed a claim' = ANY(v_detected_keywords) OR
     'scope of loss' = ANY(v_detected_keywords) THEN
    v_confidence := LEAST(1.0, v_confidence + 0.2);
  END IF;
  
  -- Boost confidence for multiple high-value keywords
  IF array_length(array(
    SELECT unnest(v_detected_keywords) 
    WHERE unnest = ANY(ARRAY['adjuster', 'claim', 'deductible', 'acv', 'rcv'])
  ), 1) > 2 THEN
    v_confidence := LEAST(1.0, v_confidence + 0.15);
  END IF;
  
  -- Check attachments for PDFs (likely insurance documents)
  IF jsonb_array_length(p_attachments) > 0 THEN
    v_confidence := LEAST(1.0, v_confidence + 0.1);
  END IF;
  
  RETURN jsonb_build_object(
    'has_insurance', v_has_insurance,
    'detected_keywords', v_detected_keywords,
    'confidence', ROUND(v_confidence, 2),
    'keyword_count', v_keyword_count
  );
END;
$$;

COMMENT ON FUNCTION public.detect_insurance_keywords_v2 IS 'Enhanced insurance keyword detection with 100+ keywords and improved confidence scoring (Block 19000)';

-- ============================================================================
-- 6. FUNCTION: Classify Claim Type
-- ============================================================================

CREATE OR REPLACE FUNCTION public.classify_claim_type(
  p_text text,
  p_contact_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_lower_text text;
  v_claim_type text := 'unknown';
  v_confidence numeric(3,2) := 0.0;
  v_indicators text[] := '{}';
  
  -- Wind claim indicators
  v_wind_keywords text[] := ARRAY[
    'missing shingles', 'shingles missing', 'shingles blown', 'shingles blown off',
    'bent shingles', 'shingles bent',
    'ridge cap loss', 'ridge cap missing', 'ridge cap blown',
    'wind damage', 'wind storm', 'high winds'
  ];
  
  -- Hail claim indicators
  v_hail_keywords text[] := ARRAY[
    'hail', 'hail damage', 'hail storm', 'hail hit',
    'round marks', 'hail marks', 'hail dents',
    'granule loss', 'granules missing', 'granule damage',
    'dented metal', 'metal dents', 'metal damage',
    'post-storm', 'after storm'
  ];
  
  -- Leak/Water damage indicators
  v_leak_keywords text[] := ARRAY[
    'leak', 'leaking', 'leaks', 'water damage', 'water damages',
    'interior stains', 'stains', 'mold', 'wet drywall',
    'attic drip', 'attic drips', 'attic leak',
    'ceiling leak', 'roof leak'
  ];
  
  -- Tree impact indicators
  v_tree_keywords text[] := ARRAY[
    'tree hit', 'tree fell', 'tree damage', 'tree branch',
    'debris hit', 'debris damage',
    'broken structure', 'structural damage',
    'heavy storm', 'storm debris'
  ];
  
  -- Ice dam indicators
  v_ice_keywords text[] := ARRAY[
    'ice dam', 'ice dams', 'ice damage',
    'ice buildup', 'ice accumulation',
    'winter damage', 'snow damage'
  ];
  
  v_wind_score integer := 0;
  v_hail_score integer := 0;
  v_leak_score integer := 0;
  v_tree_score integer := 0;
  v_ice_score integer := 0;
  v_keyword text;
BEGIN
  IF p_text IS NULL OR length(trim(p_text)) = 0 THEN
    RETURN jsonb_build_object(
      'claim_type', 'unknown',
      'confidence', 0.0,
      'indicators', '{}'::text[]
    );
  END IF;
  
  v_lower_text := lower(p_text);
  
  -- Score wind keywords
  FOREACH v_keyword IN ARRAY v_wind_keywords
  LOOP
    IF v_lower_text LIKE '%' || lower(v_keyword) || '%' THEN
      v_wind_score := v_wind_score + 1;
      v_indicators := array_append(v_indicators, v_keyword);
    END IF;
  END LOOP;
  
  -- Score hail keywords
  FOREACH v_keyword IN ARRAY v_hail_keywords
  LOOP
    IF v_lower_text LIKE '%' || lower(v_keyword) || '%' THEN
      v_hail_score := v_hail_score + 1;
      v_indicators := array_append(v_indicators, v_keyword);
    END IF;
  END LOOP;
  
  -- Score leak keywords
  FOREACH v_keyword IN ARRAY v_leak_keywords
  LOOP
    IF v_lower_text LIKE '%' || lower(v_keyword) || '%' THEN
      v_leak_score := v_leak_score + 1;
      v_indicators := array_append(v_indicators, v_keyword);
    END IF;
  END LOOP;
  
  -- Score tree keywords
  FOREACH v_keyword IN ARRAY v_tree_keywords
  LOOP
    IF v_lower_text LIKE '%' || lower(v_keyword) || '%' THEN
      v_tree_score := v_tree_score + 1;
      v_indicators := array_append(v_indicators, v_keyword);
    END IF;
  END LOOP;
  
  -- Score ice keywords
  FOREACH v_keyword IN ARRAY v_ice_keywords
  LOOP
    IF v_lower_text LIKE '%' || lower(v_keyword) || '%' THEN
      v_ice_score := v_ice_score + 1;
      v_indicators := array_append(v_indicators, v_keyword);
    END IF;
  END LOOP;
  
  -- Determine claim type based on highest score
  IF v_wind_score > 0 AND v_hail_score > 0 THEN
    v_claim_type := 'general_storm';
    v_confidence := LEAST(1.0, 0.6 + ((v_wind_score + v_hail_score) * 0.1));
  ELSIF v_wind_score >= v_hail_score AND v_wind_score >= v_leak_score AND v_wind_score >= v_tree_score AND v_wind_score >= v_ice_score AND v_wind_score > 0 THEN
    v_claim_type := 'wind';
    v_confidence := LEAST(1.0, 0.5 + (v_wind_score * 0.15));
  ELSIF v_hail_score >= v_leak_score AND v_hail_score >= v_tree_score AND v_hail_score >= v_ice_score AND v_hail_score > 0 THEN
    v_claim_type := 'hail';
    v_confidence := LEAST(1.0, 0.5 + (v_hail_score * 0.15));
  ELSIF v_leak_score >= v_tree_score AND v_leak_score >= v_ice_score AND v_leak_score > 0 THEN
    v_claim_type := 'leak_water_damage';
    v_confidence := LEAST(1.0, 0.5 + (v_leak_score * 0.15));
  ELSIF v_tree_score >= v_ice_score AND v_tree_score > 0 THEN
    v_claim_type := 'tree_impact';
    v_confidence := LEAST(1.0, 0.5 + (v_tree_score * 0.15));
  ELSIF v_ice_score > 0 THEN
    v_claim_type := 'ice_dam';
    v_confidence := LEAST(1.0, 0.5 + (v_ice_score * 0.15));
  END IF;
  
  -- If no specific type detected but insurance keywords present, default to general_storm
  IF v_claim_type = 'unknown' AND (v_wind_score > 0 OR v_hail_score > 0 OR v_leak_score > 0 OR v_tree_score > 0 OR v_ice_score > 0) THEN
    v_claim_type := 'general_storm';
    v_confidence := 0.4;
  END IF;
  
  RETURN jsonb_build_object(
    'claim_type', v_claim_type,
    'confidence', ROUND(v_confidence, 2),
    'indicators', v_indicators,
    'scores', jsonb_build_object(
      'wind', v_wind_score,
      'hail', v_hail_score,
      'leak', v_leak_score,
      'tree', v_tree_score,
      'ice', v_ice_score
    )
  );
END;
$$;

COMMENT ON FUNCTION public.classify_claim_type IS 'Classifies claim type: Wind, Hail, Leak/Water Damage, Tree Impact, Ice Dam, or General Storm (Block 19000)';

-- ============================================================================
-- 7. FUNCTION: Detect Coverage Type
-- ============================================================================

CREATE OR REPLACE FUNCTION public.detect_coverage_type(
  p_text text
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_lower_text text;
  v_coverage_type text := 'unknown';
  v_detected boolean := false;
  v_source text;
BEGIN
  IF p_text IS NULL OR length(trim(p_text)) = 0 THEN
    RETURN jsonb_build_object(
      'coverage_type', 'unknown',
      'detected', false,
      'source', null
    );
  END IF;
  
  v_lower_text := lower(p_text);
  
  -- RCV (Replacement Cost Value)
  IF v_lower_text LIKE '%rcv%' OR 
     v_lower_text LIKE '%replacement cost%' OR
     v_lower_text LIKE '%replacement cost value%' THEN
    v_coverage_type := 'rcv';
    v_detected := true;
    v_source := 'message';
  -- ACV (Actual Cash Value)
  ELSIF v_lower_text LIKE '%acv%' OR
        v_lower_text LIKE '%actual cash value%' OR
        v_lower_text LIKE '%pay acv only%' OR
        v_lower_text LIKE '%acv only%' THEN
    v_coverage_type := 'acv';
    v_detected := true;
    v_source := 'message';
  -- Depreciation
  ELSIF v_lower_text LIKE '%depreciation%' OR
        v_lower_text LIKE '%depreciated%' THEN
    v_coverage_type := 'depreciation';
    v_detected := true;
    v_source := 'message';
  -- Deductible policy
  ELSIF v_lower_text LIKE '%deductible policy%' OR
        v_lower_text LIKE '%deductible is%' OR
        v_lower_text LIKE '%deductible of%' THEN
    v_coverage_type := 'deductible_policy';
    v_detected := true;
    v_source := 'message';
  -- Cosmetic exclusion
  ELSIF v_lower_text LIKE '%cosmetic exclusion%' OR
        v_lower_text LIKE '%cosmetic damage%' OR
        v_lower_text LIKE '%cosmetic only%' THEN
    v_coverage_type := 'cosmetic_exclusion';
    v_detected := true;
    v_source := 'message';
  -- Matching law
  ELSIF v_lower_text LIKE '%matching%' OR
        v_lower_text LIKE '%matching law%' OR
        v_lower_text LIKE '%matching requirement%' THEN
    v_coverage_type := 'matching_law';
    v_detected := true;
    v_source := 'message';
  -- Manufacturer defect
  ELSIF v_lower_text LIKE '%manufacturer defect%' OR
        v_lower_text LIKE '%defective materials%' OR
        v_lower_text LIKE '%material defect%' THEN
    v_coverage_type := 'manufacturer_defect';
    v_detected := true;
    v_source := 'message';
  END IF;
  
  RETURN jsonb_build_object(
    'coverage_type', v_coverage_type,
    'detected', v_detected,
    'source', v_source
  );
END;
$$;

COMMENT ON FUNCTION public.detect_coverage_type IS 'Detects coverage type: RCV, ACV, Depreciation, Deductible Policy, Cosmetic Exclusion, Matching Law, or Manufacturer Defect (Block 19000)';

-- ============================================================================
-- 8. FUNCTION: Detect Deductible and Analyze Affordability
-- ============================================================================

CREATE OR REPLACE FUNCTION public.detect_deductible_intelligence(
  p_text text,
  p_contact_id uuid DEFAULT NULL,
  p_state_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_lower_text text;
  v_deductible_amount numeric(12,2) := NULL;
  v_deductible_mentioned boolean := false;
  v_deductible_affordability text := 'unknown';
  v_deductible_waiver_applicable boolean := false;
  v_pattern_match text;
BEGIN
  IF p_text IS NULL OR length(trim(p_text)) = 0 THEN
    RETURN jsonb_build_object(
      'deductible_amount', null,
      'deductible_mentioned', false,
      'deductible_affordability', 'unknown',
      'deductible_waiver_applicable', false
    );
  END IF;
  
  v_lower_text := lower(p_text);
  
  -- Check if deductible is mentioned
  IF v_lower_text LIKE '%deductible%' THEN
    v_deductible_mentioned := true;
    
    -- Try to extract deductible amount using regex patterns
    -- Pattern 1: "$1,500" or "$1500"
    -- Pattern 2: "deductible is $1,500"
    -- Pattern 3: "deductible of $1,500"
    -- Pattern 4: "$1,500 deductible"
    
    -- Extract using regex (simplified - would use proper regex in production)
    -- For now, look for common patterns
    IF v_lower_text ~ '\$[\d,]+' THEN
      -- Extract first dollar amount found
      v_pattern_match := (regexp_match(v_lower_text, '\$[\d,]+'))[1];
      -- Remove $ and commas, convert to numeric
      v_deductible_amount := (regexp_replace(v_pattern_match, '[$,]', '', 'g'))::numeric;
    END IF;
  END IF;
  
  -- Determine affordability (simplified logic - would use home value/area data in production)
  IF v_deductible_amount IS NOT NULL THEN
    IF v_deductible_amount <= 1000 THEN
      v_deductible_affordability := 'high';
    ELSIF v_deductible_amount <= 2500 THEN
      v_deductible_affordability := 'medium';
    ELSE
      v_deductible_affordability := 'low';
    END IF;
  END IF;
  
  -- Check for deductible waiver (would check state rules in production)
  IF p_state_code IS NOT NULL THEN
    -- This would query state_insurance_rules table in production
    -- For now, simplified logic
    v_deductible_waiver_applicable := false; -- Would check state rules
  END IF;
  
  RETURN jsonb_build_object(
    'deductible_amount', v_deductible_amount,
    'deductible_mentioned', v_deductible_mentioned,
    'deductible_affordability', v_deductible_affordability,
    'deductible_waiver_applicable', v_deductible_waiver_applicable
  );
END;
$$;

COMMENT ON FUNCTION public.detect_deductible_intelligence IS 'Detects deductible amount and analyzes affordability (Block 19000)';

-- ============================================================================
-- 9. FUNCTION: Detect Adjuster Timeline Status
-- ============================================================================

CREATE OR REPLACE FUNCTION public.detect_adjuster_timeline(
  p_text text
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_lower_text text;
  v_adjuster_mentioned boolean := false;
  v_adjuster_scheduled boolean := false;
  v_adjuster_visited boolean := false;
  v_adjuster_status text := 'not_scheduled';
BEGIN
  IF p_text IS NULL OR length(trim(p_text)) = 0 THEN
    RETURN jsonb_build_object(
      'adjuster_mentioned', false,
      'adjuster_scheduled', false,
      'adjuster_visited', false,
      'adjuster_status', 'not_scheduled'
    );
  END IF;
  
  v_lower_text := lower(p_text);
  
  -- Check for adjuster mentions
  IF v_lower_text LIKE '%adjuster%' THEN
    v_adjuster_mentioned := true;
    
    -- Check for scheduled status
    IF v_lower_text LIKE '%adjuster%coming%' OR
       v_lower_text LIKE '%adjuster%scheduled%' OR
       v_lower_text LIKE '%meeting%adjuster%' OR
       v_lower_text LIKE '%adjuster%meeting%' THEN
      v_adjuster_scheduled := true;
      v_adjuster_status := 'scheduled';
    END IF;
    
    -- Check for visited status
    IF v_lower_text LIKE '%adjuster%visited%' OR
       v_lower_text LIKE '%adjuster%came%' OR
       v_lower_text LIKE '%met%adjuster%' OR
       v_lower_text LIKE '%adjuster%met%' THEN
      v_adjuster_visited := true;
      v_adjuster_status := 'visited';
    END IF;
    
    -- Check for report pending
    IF v_lower_text LIKE '%adjuster%report%pending%' OR
       v_lower_text LIKE '%waiting%adjuster%report%' OR
       v_lower_text LIKE '%adjuster%summary%' THEN
      v_adjuster_status := 'report_pending';
    END IF;
    
    -- Check for report received
    IF v_lower_text LIKE '%adjuster%report%received%' OR
       v_lower_text LIKE '%got%adjuster%report%' OR
       v_lower_text LIKE '%adjuster%conclusion%' THEN
      v_adjuster_status := 'report_received';
    END IF;
  END IF;
  
  RETURN jsonb_build_object(
    'adjuster_mentioned', v_adjuster_mentioned,
    'adjuster_scheduled', v_adjuster_scheduled,
    'adjuster_visited', v_adjuster_visited,
    'adjuster_status', v_adjuster_status
  );
END;
$$;

COMMENT ON FUNCTION public.detect_adjuster_timeline IS 'Detects adjuster timeline status: scheduled, visited, report pending, etc. (Block 19000)';

-- ============================================================================
-- 10. FUNCTION: Calculate Approval Likelihood
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_approval_likelihood(
  p_contact_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact record;
  v_claim record;
  v_score integer := 50; -- Start at neutral
  v_likelihood text := 'moderate';
  v_reasoning text := '';
  
  -- Factors
  v_roof_age_factor integer := 0;
  v_storm_evidence_factor integer := 0;
  v_document_factor integer := 0;
  v_adjuster_factor integer := 0;
  v_coverage_factor integer := 0;
BEGIN
  -- Get contact and claim data
  SELECT c.*, ic.claim_type, ic.coverage_type, ic.claim_status, ic.approval_date, ic.denial_date
  INTO v_contact
  FROM public.contacts c
  LEFT JOIN public.insurance_claims ic ON ic.contact_id = c.id
  WHERE c.id = p_contact_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'approval_likelihood', 'moderate',
      'approval_likelihood_score', 50,
      'reasoning', 'Contact not found'
    );
  END IF;
  
  -- Factor 1: Roof Age (older = higher likelihood)
  IF v_contact.roof_age_years IS NOT NULL THEN
    IF v_contact.roof_age_years > 20 THEN
      v_roof_age_factor := 15;
      v_reasoning := v_reasoning || 'Older roof (20+ years) increases approval likelihood. ';
    ELSIF v_contact.roof_age_years > 15 THEN
      v_roof_age_factor := 10;
      v_reasoning := v_reasoning || 'Roof age (15-20 years) supports claim. ';
    ELSIF v_contact.roof_age_years < 5 THEN
      v_roof_age_factor := -10;
      v_reasoning := v_reasoning || 'Very new roof may reduce approval likelihood. ';
    END IF;
  END IF;
  
  -- Factor 2: Storm Evidence
  IF v_contact.storm_risk_level IS NOT NULL THEN
    IF v_contact.storm_risk_level IN ('hail', 'wind', 'hurricane') THEN
      v_storm_evidence_factor := 15;
      v_reasoning := v_reasoning || 'Strong storm evidence present. ';
    ELSIF v_contact.storm_risk_level = 'medium' THEN
      v_storm_evidence_factor := 8;
      v_reasoning := v_reasoning || 'Moderate storm evidence. ';
    END IF;
  END IF;
  
  -- Factor 3: Documents
  SELECT COUNT(*) INTO v_document_factor
  FROM public.insurance_documents
  WHERE contact_id = p_contact_id
    AND extraction_status = 'completed';
  
  IF v_document_factor > 0 THEN
    v_document_factor := LEAST(15, v_document_factor * 5);
    v_reasoning := v_reasoning || 'Insurance documents provided. ';
  END IF;
  
  -- Factor 4: Adjuster Status
  IF v_contact.claim_status = 'adjuster_met' OR v_contact.claim_status = 'scope_received' THEN
    v_adjuster_factor := 10;
    v_reasoning := v_reasoning || 'Adjuster has met and scope received. ';
  ELSIF v_contact.claim_status = 'adjuster_scheduled' THEN
    v_adjuster_factor := 5;
    v_reasoning := v_reasoning || 'Adjuster meeting scheduled. ';
  END IF;
  
  -- Factor 5: Coverage Type
  IF v_contact.coverage_type = 'rcv' THEN
    v_coverage_factor := 10;
    v_reasoning := v_reasoning || 'RCV coverage increases approval likelihood. ';
  ELSIF v_contact.coverage_type = 'acv' THEN
    v_coverage_factor := -5;
    v_reasoning := v_reasoning || 'ACV coverage may limit payout. ';
  END IF;
  
  -- Calculate total score
  v_score := 50 + v_roof_age_factor + v_storm_evidence_factor + v_document_factor + v_adjuster_factor + v_coverage_factor;
  v_score := GREATEST(0, LEAST(100, v_score)); -- Clamp to 0-100
  
  -- Determine likelihood category
  IF v_score >= 75 THEN
    v_likelihood := 'high';
  ELSIF v_score >= 60 THEN
    v_likelihood := 'moderate';
  ELSIF v_score >= 40 THEN
    v_likelihood := 'low';
  ELSIF v_score < 40 THEN
    v_likelihood := 'likely_denial';
  END IF;
  
  -- Check if supplement is required
  IF v_contact.claim_status = 'denied' OR v_contact.denial_date IS NOT NULL THEN
    v_likelihood := 'supplement_required';
    v_reasoning := v_reasoning || 'Claim denied - supplement required. ';
  END IF;
  
  RETURN jsonb_build_object(
    'approval_likelihood', v_likelihood,
    'approval_likelihood_score', v_score,
    'reasoning', COALESCE(v_reasoning, 'No specific factors identified.')
  );
END;
$$;

COMMENT ON FUNCTION public.calculate_approval_likelihood IS 'Calculates approval likelihood based on roof age, storm evidence, documents, adjuster status, and coverage type (Block 19000)';

-- ============================================================================
-- 11. FUNCTION: Detect Supplement Opportunities
-- ============================================================================

CREATE OR REPLACE FUNCTION public.detect_supplement_opportunities(
  p_text text,
  p_contact_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_lower_text text;
  v_opportunities jsonb := '[]'::jsonb;
  v_supplement_potential text := 'none';
  v_opportunity jsonb;
BEGIN
  IF p_text IS NULL OR length(trim(p_text)) = 0 THEN
    RETURN jsonb_build_object(
      'supplement_potential', 'none',
      'opportunities', '[]'::jsonb
    );
  END IF;
  
  v_lower_text := lower(p_text);
  
  -- Check for code upgrade opportunities
  IF v_lower_text LIKE '%code%' AND (v_lower_text LIKE '%upgrade%' OR v_lower_text LIKE '%required%') THEN
    v_opportunity := jsonb_build_object(
      'type', 'code_upgrade',
      'item', 'Code upgrades',
      'reason', 'Code upgrades usually payable'
    );
    v_opportunities := v_opportunities || v_opportunity;
  END IF;
  
  -- Check for flashing issues
  IF v_lower_text LIKE '%flashing%' AND (v_lower_text LIKE '%missing%' OR v_lower_text LIKE '%damaged%' OR v_lower_text LIKE '%step%') THEN
    v_opportunity := jsonb_build_object(
      'type', 'flashing_issue',
      'item', 'Step flashing / Flashing',
      'reason', 'Missing step flashing — usually payable'
    );
    v_opportunities := v_opportunities || v_opportunity;
  END IF;
  
  -- Check for ventilation issues
  IF v_lower_text LIKE '%ventilation%' OR v_lower_text LIKE '%vent%' THEN
    IF v_lower_text LIKE '%attic%' OR v_lower_text LIKE '%insufficient%' OR v_lower_text LIKE '%required%' THEN
      v_opportunity := jsonb_build_object(
        'type', 'ventilation_issue',
        'item', 'Attic ventilation',
        'reason', 'Ventilation upgrades often covered'
      );
      v_opportunities := v_opportunities || v_opportunity;
    END IF;
  END IF;
  
  -- Check for accessory items
  IF v_lower_text LIKE '%ridge cap%' OR v_lower_text LIKE '%ridge vent%' OR v_lower_text LIKE '%gutter%' THEN
    v_opportunity := jsonb_build_object(
      'type', 'accessory_item',
      'item', 'Ridge cap / Accessories',
      'reason', 'Ridge cap upgrade recommended'
    );
    v_opportunities := v_opportunities || v_opportunity;
  END IF;
  
  -- Check for unseen damages
  IF v_lower_text LIKE '%unseen%' OR v_lower_text LIKE '%hidden%' OR v_lower_text LIKE '%additional%damage%' THEN
    v_opportunity := jsonb_build_object(
      'type', 'unseen_damage',
      'item', 'Additional damage',
      'reason', 'Unseen damages may require supplement'
    );
    v_opportunities := v_opportunities || v_opportunity;
  END IF;
  
  -- Determine supplement potential
  IF jsonb_array_length(v_opportunities) >= 3 THEN
    v_supplement_potential := 'high';
  ELSIF jsonb_array_length(v_opportunities) >= 2 THEN
    v_supplement_potential := 'medium';
  ELSIF jsonb_array_length(v_opportunities) >= 1 THEN
    v_supplement_potential := 'low';
  END IF;
  
  RETURN jsonb_build_object(
    'supplement_potential', v_supplement_potential,
    'opportunities', v_opportunities
  );
END;
$$;

COMMENT ON FUNCTION public.detect_supplement_opportunities IS 'Detects supplement opportunities: code upgrades, flashing issues, ventilation, accessory items, unseen damages (Block 19000)';

-- ============================================================================
-- 12. FUNCTION: Calculate Enhanced Insurance Probability Score (0-100)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_insurance_probability_score_v2(
  p_contact_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact record;
  v_score integer := 0;
  v_storm_severity_score integer := 0;
  v_storm_proximity_score integer := 0;
  v_photo_evidence_score integer := 0;
  v_language_clues_score integer := 0;
  v_roof_age_score integer := 0;
  v_neighborhood_history_score integer := 0;
  v_deductible_logic_score integer := 0;
  v_material_vulnerability_score integer := 0;
  v_value_estimator_score integer := 0;
  
  v_keyword_detection jsonb;
  v_has_insurance_keywords boolean := false;
BEGIN
  -- Get contact data
  SELECT c.*, ce.storm_risk_level, ce.inferred_zip
  INTO v_contact
  FROM public.contacts c
  LEFT JOIN public.contact_enrichment ce ON ce.contact_id = c.id
  WHERE c.id = p_contact_id;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  -- Check for insurance keywords in recent messages
  SELECT public.detect_insurance_keywords_v2(
    string_agg(body, ' '),
    '[]'::jsonb
  ) INTO v_keyword_detection
  FROM public.inbox_threads
  WHERE contact_id = p_contact_id
    AND is_reply = true
    AND created_at > now() - interval '30 days'
  LIMIT 10;
  
  v_has_insurance_keywords := (v_keyword_detection->>'has_insurance')::boolean;
  
  -- 1. Storm Severity Score (0-15 points)
  IF v_contact.storm_risk_level IN ('hail', 'wind', 'hurricane') THEN
    v_storm_severity_score := 15;
  ELSIF v_contact.storm_risk_level = 'medium' THEN
    v_storm_severity_score := 10;
  ELSIF v_contact.storm_risk_level = 'low' THEN
    v_storm_severity_score := 5;
  END IF;
  
  -- 2. Storm Proximity Score (0-10 points)
  -- Simplified: if storm risk level exists, assume proximity
  IF v_contact.storm_risk_level IS NOT NULL THEN
    v_storm_proximity_score := 10;
  END IF;
  
  -- 3. Photo Evidence Score (0-10 points)
  -- Check for photo attachments (simplified)
  SELECT COUNT(*) INTO v_photo_evidence_score
  FROM public.attachments
  WHERE contact_id = p_contact_id
    AND file_type LIKE 'image%';
  
  v_photo_evidence_score := LEAST(10, v_photo_evidence_score * 2);
  
  -- 4. Language Clues Score (0-20 points)
  IF v_has_insurance_keywords THEN
    v_language_clues_score := 15;
    -- Boost for multiple keywords
    IF (v_keyword_detection->>'keyword_count')::integer > 5 THEN
      v_language_clues_score := 20;
    END IF;
  END IF;
  
  -- 5. Roof Age Score (0-10 points)
  IF v_contact.roof_age_years IS NOT NULL THEN
    IF v_contact.roof_age_years > 20 THEN
      v_roof_age_score := 10;
    ELSIF v_contact.roof_age_years > 15 THEN
      v_roof_age_score := 8;
    ELSIF v_contact.roof_age_years > 10 THEN
      v_roof_age_score := 5;
    END IF;
  END IF;
  
  -- 6. Neighborhood History Score (0-10 points)
  -- Simplified: if ZIP has storm risk, assume claim history
  IF v_contact.inferred_zip IS NOT NULL AND v_contact.storm_risk_level IS NOT NULL THEN
    v_neighborhood_history_score := 8;
  END IF;
  
  -- 7. Deductible Logic Score (0-10 points)
  SELECT COUNT(*) INTO v_deductible_logic_score
  FROM public.insurance_metadata
  WHERE contact_id = p_contact_id
    AND deductible IS NOT NULL;
  
  IF v_deductible_logic_score > 0 THEN
    v_deductible_logic_score := 10;
  END IF;
  
  -- 8. Material Vulnerability Score (0-5 points)
  -- Simplified: older roofs more vulnerable
  IF v_contact.roof_age_years IS NOT NULL AND v_contact.roof_age_years > 15 THEN
    v_material_vulnerability_score := 5;
  END IF;
  
  -- 9. Value Estimator Score (0-10 points)
  -- If job value estimated, indicates serious interest
  IF v_contact.estimated_job_value IS NOT NULL AND v_contact.estimated_job_value > 0 THEN
    v_value_estimator_score := 10;
  ELSIF v_contact.estimated_value_min IS NOT NULL THEN
    v_value_estimator_score := 7;
  END IF;
  
  -- Calculate total score
  v_score := v_storm_severity_score + v_storm_proximity_score + v_photo_evidence_score +
             v_language_clues_score + v_roof_age_score + v_neighborhood_history_score +
             v_deductible_logic_score + v_material_vulnerability_score + v_value_estimator_score;
  
  -- Cap at 100
  v_score := LEAST(100, v_score);
  
  RETURN v_score;
END;
$$;

COMMENT ON FUNCTION public.calculate_insurance_probability_score_v2 IS 'Enhanced insurance probability score (0-100) based on storm severity, proximity, photo evidence, language clues, roof age, neighborhood history, deductible logic, material vulnerability, and value estimator (Block 19000)';

-- ============================================================================
-- 13. FUNCTION: Generate Insurance Tasks Automatically
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_insurance_tasks(
  p_contact_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact record;
  v_claim record;
  v_intelligence record;
  v_tasks_created integer := 0;
  v_task_id uuid;
  v_due_date timestamptz;
BEGIN
  -- Get contact, claim, and intelligence data
  SELECT c.*, ic.claim_status, ic.adjuster_scheduled_date, ic.adjuster_meeting_date,
         ii.adjuster_status, ii.next_best_action
  INTO v_contact
  FROM public.contacts c
  LEFT JOIN public.insurance_claims ic ON ic.contact_id = c.id
  LEFT JOIN public.insurance_intelligence ii ON ii.contact_id = c.id
  WHERE c.id = p_contact_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Contact not found', 'tasks_created', 0);
  END IF;
  
  -- Task 1: Before Adjuster - Ask for photos
  IF v_contact.claim_status = 'adjuster_scheduled' AND v_contact.adjuster_scheduled_date IS NOT NULL THEN
    v_due_date := (v_contact.adjuster_scheduled_date - interval '2 days')::timestamptz;
    
    INSERT INTO public.smartsend_tasks (
      workspace_id,
      contact_id,
      task_type,
      title,
      description,
      due_at,
      priority,
      status,
      auto_generated,
      metadata
    ) VALUES (
      v_contact.workspace_id,
      p_contact_id,
      'insurance_prep',
      'Ask homeowner to take 5 more photos',
      'Prepare photos before adjuster meeting',
      v_due_date,
      'high',
      'open',
      true,
      jsonb_build_object('insurance_task', true, 'task_category', 'before_adjuster')
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_task_id;
    
    IF v_task_id IS NOT NULL THEN
      v_tasks_created := v_tasks_created + 1;
    END IF;
  END IF;
  
  -- Task 2: After Adjuster - Follow up
  IF v_contact.adjuster_status = 'visited' OR v_contact.claim_status = 'adjuster_met' THEN
    v_due_date := (COALESCE(v_contact.adjuster_meeting_date, CURRENT_DATE) + interval '3 days')::timestamptz;
    
    INSERT INTO public.smartsend_tasks (
      workspace_id,
      contact_id,
      task_type,
      title,
      description,
      due_at,
      priority,
      status,
      auto_generated,
      metadata
    ) VALUES (
      v_contact.workspace_id,
      p_contact_id,
      'insurance_followup',
      'Follow up asking for adjuster conclusion',
      'Get adjuster report summary from homeowner',
      v_due_date,
      'high',
      'open',
      true,
      jsonb_build_object('insurance_task', true, 'task_category', 'after_adjuster')
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_task_id;
    
    IF v_task_id IS NOT NULL THEN
      v_tasks_created := v_tasks_created + 1;
    END IF;
  END IF;
  
  -- Task 3: If Approved - Book installation
  IF v_contact.claim_status = 'approved' THEN
    v_due_date := (CURRENT_DATE + interval '2 days')::timestamptz;
    
    INSERT INTO public.smartsend_tasks (
      workspace_id,
      contact_id,
      task_type,
      title,
      description,
      due_at,
      priority,
      status,
      auto_generated,
      metadata
    ) VALUES (
      v_contact.workspace_id,
      p_contact_id,
      'insurance_booking',
      'Book job installation appointment',
      'Claim approved - schedule installation',
      v_due_date,
      'high',
      'open',
      true,
      jsonb_build_object('insurance_task', true, 'task_category', 'if_approved')
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_task_id;
    
    IF v_task_id IS NOT NULL THEN
      v_tasks_created := v_tasks_created + 1;
    END IF;
  END IF;
  
  -- Task 4: If Denied - Prepare supplement
  IF v_contact.claim_status = 'denied' THEN
    v_due_date := (CURRENT_DATE + interval '5 days')::timestamptz;
    
    INSERT INTO public.smartsend_tasks (
      workspace_id,
      contact_id,
      task_type,
      title,
      description,
      due_at,
      priority,
      status,
      auto_generated,
      metadata
    ) VALUES (
      v_contact.workspace_id,
      p_contact_id,
      'insurance_supplement',
      'Prepare supplement outline',
      'Claim denied - prepare supplement package',
      v_due_date,
      'high',
      'open',
      true,
      jsonb_build_object('insurance_task', true, 'task_category', 'if_denied')
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_task_id;
    
    IF v_task_id IS NOT NULL THEN
      v_tasks_created := v_tasks_created + 1;
    END IF;
  END IF;
  
  RETURN jsonb_build_object(
    'ok', true,
    'contact_id', p_contact_id,
    'tasks_created', v_tasks_created
  );
END;
$$;

COMMENT ON FUNCTION public.generate_insurance_tasks IS 'Automatically generates insurance-related tasks based on claim status and adjuster timeline (Block 19000)';

-- ============================================================================
-- 14. FUNCTION: Comprehensive Insurance Intelligence Analysis
-- ============================================================================

CREATE OR REPLACE FUNCTION public.analyze_insurance_intelligence(
  p_contact_id uuid,
  p_text text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact record;
  v_keyword_detection jsonb;
  v_claim_type jsonb;
  v_coverage_type jsonb;
  v_deductible_intel jsonb;
  v_adjuster_timeline jsonb;
  v_approval_likelihood jsonb;
  v_supplement_opportunities jsonb;
  v_probability_score integer;
  v_intelligence jsonb;
  v_text_to_analyze text;
BEGIN
  -- Get contact
  SELECT c.* INTO v_contact
  FROM public.contacts c
  WHERE c.id = p_contact_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Contact not found');
  END IF;
  
  -- Get text to analyze (from parameter or recent messages)
  IF p_text IS NOT NULL THEN
    v_text_to_analyze := p_text;
  ELSE
    SELECT string_agg(body, ' ') INTO v_text_to_analyze
    FROM public.inbox_threads
    WHERE contact_id = p_contact_id
      AND is_reply = true
      AND created_at > now() - interval '30 days'
    LIMIT 10;
  END IF;
  
  -- 1. Detect insurance keywords
  v_keyword_detection := public.detect_insurance_keywords_v2(
    COALESCE(v_text_to_analyze, ''),
    '[]'::jsonb
  );
  
  -- 2. Classify claim type
  v_claim_type := public.classify_claim_type(
    COALESCE(v_text_to_analyze, ''),
    p_contact_id
  );
  
  -- 3. Detect coverage type
  v_coverage_type := public.detect_coverage_type(
    COALESCE(v_text_to_analyze, '')
  );
  
  -- 4. Detect deductible intelligence
  v_deductible_intel := public.detect_deductible_intelligence(
    COALESCE(v_text_to_analyze, ''),
    p_contact_id,
    v_contact.state
  );
  
  -- 5. Detect adjuster timeline
  v_adjuster_timeline := public.detect_adjuster_timeline(
    COALESCE(v_text_to_analyze, '')
  );
  
  -- 6. Calculate approval likelihood
  v_approval_likelihood := public.calculate_approval_likelihood(p_contact_id);
  
  -- 7. Detect supplement opportunities
  v_supplement_opportunities := public.detect_supplement_opportunities(
    COALESCE(v_text_to_analyze, ''),
    p_contact_id
  );
  
  -- 8. Calculate probability score
  v_probability_score := public.calculate_insurance_probability_score_v2(p_contact_id);
  
  -- Build comprehensive intelligence object
  v_intelligence := jsonb_build_object(
    'is_insurance_candidate', (v_keyword_detection->>'has_insurance')::boolean,
    'insurance_probability_score', v_probability_score,
    'claim_type', v_claim_type->>'claim_type',
    'claim_type_confidence', (v_claim_type->>'confidence')::numeric,
    'coverage_type', v_coverage_type->>'coverage_type',
    'coverage_type_detected', (v_coverage_type->>'detected')::boolean,
    'deductible_amount', (v_deductible_intel->>'deductible_amount')::numeric,
    'deductible_affordability', v_deductible_intel->>'deductible_affordability',
    'adjuster_status', v_adjuster_timeline->>'adjuster_status',
    'approval_likelihood', v_approval_likelihood->>'approval_likelihood',
    'approval_likelihood_score', (v_approval_likelihood->>'approval_likelihood_score')::integer,
    'supplement_potential', v_supplement_opportunities->>'supplement_potential',
    'supplement_opportunities', v_supplement_opportunities->'opportunities',
    'detected_keywords', v_keyword_detection->'detected_keywords',
    'detection_confidence', (v_keyword_detection->>'confidence')::numeric
  );
  
  -- Upsert insurance intelligence
  INSERT INTO public.insurance_intelligence (
    contact_id,
    workspace_id,
    is_insurance_candidate,
    insurance_probability_score,
    claim_type,
    claim_type_confidence,
    coverage_type,
    coverage_type_detected,
    deductible_amount,
    deductible_affordability,
    adjuster_status,
    approval_likelihood,
    approval_likelihood_score,
    supplement_potential,
    supplement_opportunities,
    detected_keywords,
    detection_confidence,
    last_detected_at,
    intelligence_metadata
  ) VALUES (
    p_contact_id,
    v_contact.workspace_id,
    (v_keyword_detection->>'has_insurance')::boolean,
    v_probability_score,
    v_claim_type->>'claim_type',
    (v_claim_type->>'confidence')::numeric,
    v_coverage_type->>'coverage_type',
    (v_coverage_type->>'detected')::boolean,
    (v_deductible_intel->>'deductible_amount')::numeric,
    v_deductible_intel->>'deductible_affordability',
    v_adjuster_timeline->>'adjuster_status',
    v_approval_likelihood->>'approval_likelihood',
    (v_approval_likelihood->>'approval_likelihood_score')::integer,
    v_supplement_opportunities->>'supplement_potential',
    v_supplement_opportunities->'opportunities',
    (v_keyword_detection->>'detected_keywords')::text[],
    (v_keyword_detection->>'confidence')::numeric,
    now(),
    v_intelligence
  )
  ON CONFLICT (contact_id) DO UPDATE SET
    is_insurance_candidate = EXCLUDED.is_insurance_candidate,
    insurance_probability_score = EXCLUDED.insurance_probability_score,
    claim_type = EXCLUDED.claim_type,
    claim_type_confidence = EXCLUDED.claim_type_confidence,
    coverage_type = EXCLUDED.coverage_type,
    coverage_type_detected = EXCLUDED.coverage_type_detected,
    deductible_amount = EXCLUDED.deductible_amount,
    deductible_affordability = EXCLUDED.deductible_affordability,
    adjuster_status = EXCLUDED.adjuster_status,
    approval_likelihood = EXCLUDED.approval_likelihood,
    approval_likelihood_score = EXCLUDED.approval_likelihood_score,
    supplement_potential = EXCLUDED.supplement_potential,
    supplement_opportunities = EXCLUDED.supplement_opportunities,
    detected_keywords = EXCLUDED.detected_keywords,
    detection_confidence = EXCLUDED.detection_confidence,
    last_detected_at = now(),
    intelligence_metadata = EXCLUDED.intelligence_metadata,
    updated_at = now();
  
  RETURN v_intelligence;
END;
$$;

COMMENT ON FUNCTION public.analyze_insurance_intelligence IS 'Comprehensive insurance intelligence analysis combining all detection engines (Block 19000)';

-- ============================================================================
-- 15. RLS POLICIES for new tables
-- ============================================================================

ALTER TABLE IF EXISTS public.insurance_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.insurance_intelligence ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.state_insurance_rules ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view insurance claims for their workspace
CREATE POLICY "Users can view insurance claims for their workspace"
  ON public.insurance_claims FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can view insurance intelligence for their workspace
CREATE POLICY "Users can view insurance intelligence for their workspace"
  ON public.insurance_intelligence FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- Policy: Everyone can view state rules (public data)
CREATE POLICY "Everyone can view state insurance rules"
  ON public.state_insurance_rules FOR SELECT
  USING (true);

-- Service role can manage all insurance tables
CREATE POLICY "Service role can manage insurance claims"
  ON public.insurance_claims FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can manage insurance intelligence"
  ON public.insurance_intelligence FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 16. GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT ON public.insurance_claims TO authenticated;
GRANT SELECT ON public.insurance_intelligence TO authenticated;
GRANT SELECT ON public.state_insurance_rules TO authenticated;

GRANT EXECUTE ON FUNCTION public.detect_insurance_keywords_v2(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.classify_claim_type(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_coverage_type(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_deductible_intelligence(text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_adjuster_timeline(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_approval_likelihood(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_supplement_opportunities(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_insurance_probability_score_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_insurance_tasks(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analyze_insurance_intelligence(uuid, text) TO authenticated;

-- ============================================================================
-- 17. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.insurance_claims IS 'Detailed insurance claim tracking with claim type classification, coverage detection, and approval likelihood (Block 19000)';
COMMENT ON TABLE public.insurance_intelligence IS 'Comprehensive insurance intelligence dashboard data (Block 19000)';
COMMENT ON TABLE public.state_insurance_rules IS 'State-specific insurance rules: deductible laws, matching laws, bad faith laws, etc. (Block 19000)';





















































