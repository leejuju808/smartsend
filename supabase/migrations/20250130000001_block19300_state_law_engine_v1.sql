-- =========================================================
-- Block 19300 — SmartSend State & Region Law Engine v1
-- (Basic Roofing + Insurance Regulations Layer: Deductible Laws, Matching Laws, Code Requirements, Storm Rules & Illegal Practices Filters)
-- =========================================================

-- ============================================================================
-- 1. CREATE state_rules TABLE (Core state-level rules)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.state_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code text NOT NULL, -- Two-letter state code (e.g., 'WA', 'TX', 'FL')
  state_name text NOT NULL,
  
  -- Licensing Requirements
  requires_roofing_license boolean DEFAULT false,
  license_type text CHECK (license_type IN ('state', 'city', 'county', 'registration_only', 'none')),
  commercial_license_separate boolean DEFAULT false,
  license_details text,
  
  -- Insurance Rules
  contractor_can_negotiate_claim boolean DEFAULT false, -- Most states prohibit this
  contractor_can_document_damage boolean DEFAULT true,
  contractor_can_interpret_policy boolean DEFAULT false, -- Usually illegal
  contractor_can_show_damage boolean DEFAULT true,
  
  -- Storm-Specific Rules
  claim_filing_deadline_days integer, -- Days after storm to file claim
  door_to_door_solicitation_allowed boolean DEFAULT true,
  same_day_solicitation_after_storm boolean DEFAULT true,
  solicitation_cooling_off_period_hours integer, -- Hours before contract can be signed
  public_adjuster_required boolean DEFAULT false,
  
  -- General Restrictions
  restricted_messaging_triggers text[], -- Keywords/phrases that trigger compliance checks
  prohibited_practices text[], -- Array of prohibited practices
  
  -- Metadata
  last_updated timestamptz DEFAULT now(),
  source text, -- Where this data came from
  notes text,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(state_code)
);

CREATE INDEX IF NOT EXISTS idx_state_rules_state_code ON public.state_rules(state_code);
CREATE INDEX IF NOT EXISTS idx_state_rules_license ON public.state_rules(requires_roofing_license, license_type);

-- ============================================================================
-- 2. CREATE state_deductible_laws TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.state_deductible_laws (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code text NOT NULL REFERENCES public.state_rules(state_code) ON DELETE CASCADE,
  
  -- Deductible Waiving Rules
  deductible_waiving_illegal boolean DEFAULT false,
  deductible_assistance_allowed boolean DEFAULT true, -- Financing, payment plans OK
  deductible_payment_rules text, -- Description of payment rules
  
  -- Consumer Protection
  consumer_protection_act_applies boolean DEFAULT false,
  cpa_details text,
  
  -- Alternative Options
  financing_allowed boolean DEFAULT true,
  payment_plans_allowed boolean DEFAULT true,
  deductible_rollover_allowed boolean DEFAULT false,
  
  -- Metadata
  last_updated timestamptz DEFAULT now(),
  source text,
  notes text,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(state_code)
);

CREATE INDEX IF NOT EXISTS idx_state_deductible_laws_state_code ON public.state_deductible_laws(state_code);

-- ============================================================================
-- 3. CREATE state_matching_laws TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.state_matching_laws (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code text NOT NULL REFERENCES public.state_rules(state_code) ON DELETE CASCADE,
  
  -- Matching Requirements
  matching_requirement_type text CHECK (matching_requirement_type IN (
    'full_replacement_required', -- If shingles don't match, must replace entire roof
    'like_kind_required', -- Must match existing shingles
    'no_matching_rule', -- No specific matching requirement
    'partial_matching' -- Only visible areas must match
  )),
  
  -- Impact on Insurance
  affects_replacement_value boolean DEFAULT false,
  affects_supplement_potential boolean DEFAULT false,
  affects_insurance_approval boolean DEFAULT false,
  
  -- Details
  matching_details text,
  percentage_threshold numeric(5,2), -- If partial matching, what percentage triggers full replacement
  
  -- Metadata
  last_updated timestamptz DEFAULT now(),
  source text,
  notes text,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(state_code)
);

CREATE INDEX IF NOT EXISTS idx_state_matching_laws_state_code ON public.state_matching_laws(state_code);
CREATE INDEX IF NOT EXISTS idx_state_matching_laws_type ON public.state_matching_laws(matching_requirement_type);

-- ============================================================================
-- 4. CREATE state_code_requirements TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.state_code_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code text NOT NULL REFERENCES public.state_rules(state_code) ON DELETE CASCADE,
  
  -- Code Upgrade Requirements
  ventilation_code_required boolean DEFAULT false,
  ventilation_code_details text,
  
  decking_code_required boolean DEFAULT false,
  decking_code_details text,
  
  ice_water_shield_code_required boolean DEFAULT false,
  ice_water_shield_code_details text,
  ice_water_shield_valleys_required boolean DEFAULT false,
  
  flashing_code_required boolean DEFAULT false,
  flashing_code_details text,
  
  underlayment_code_required boolean DEFAULT false,
  underlayment_code_details text,
  
  -- Other Code Requirements
  other_code_requirements jsonb DEFAULT '{}'::jsonb, -- Flexible storage for other codes
  
  -- Insurance Payability
  code_upgrades_payable_by_insurance boolean DEFAULT true,
  code_upgrade_supplement_guidance text,
  
  -- Metadata
  last_updated timestamptz DEFAULT now(),
  source text,
  notes text,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(state_code)
);

CREATE INDEX IF NOT EXISTS idx_state_code_requirements_state_code ON public.state_code_requirements(state_code);

-- ============================================================================
-- 5. CREATE state_restrictions TABLE (Prohibited practices & messaging filters)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.state_restrictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code text NOT NULL REFERENCES public.state_rules(state_code) ON DELETE CASCADE,
  
  -- Prohibited Practices
  policy_interpretation_prohibited boolean DEFAULT true,
  negotiation_language_prohibited boolean DEFAULT true,
  deductible_waiving_prohibited boolean DEFAULT false,
  free_roof_promises_prohibited boolean DEFAULT false,
  false_storm_claims_prohibited boolean DEFAULT true,
  misleading_insurance_guarantees_prohibited boolean DEFAULT true,
  
  -- Prohibited Phrases/Keywords
  prohibited_phrases text[], -- Phrases that must be filtered out
  prohibited_keywords text[], -- Keywords that trigger filtering
  
  -- Replacement Phrases
  compliant_alternatives jsonb DEFAULT '{}'::jsonb, -- Map of prohibited → compliant alternatives
  
  -- Example:
  -- {
  --   "We can help you negotiate with your insurance": "We can document the damage and help you understand your options",
  --   "We'll waive your deductible": "We offer financing options for your deductible"
  -- }
  
  -- Metadata
  last_updated timestamptz DEFAULT now(),
  source text,
  notes text,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(state_code)
);

CREATE INDEX IF NOT EXISTS idx_state_restrictions_state_code ON public.state_restrictions(state_code);

-- ============================================================================
-- 6. CREATE region_intelligence TABLE (County/city/region-specific rules)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.region_intelligence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code text NOT NULL REFERENCES public.state_rules(state_code) ON DELETE CASCADE,
  
  -- Region Identification
  region_type text CHECK (region_type IN ('county', 'city', 'zip', 'hoa', 'zone')),
  region_name text NOT NULL,
  region_code text, -- County code, ZIP code, etc.
  
  -- Regional Rules
  hoa_roofing_restrictions boolean DEFAULT false,
  hoa_restriction_details text,
  
  wildfire_zone boolean DEFAULT false,
  hurricane_zone boolean DEFAULT false,
  snow_load_zone boolean DEFAULT false,
  
  -- Impact on Estimates
  affects_value_estimates boolean DEFAULT false,
  affects_code_suggestions boolean DEFAULT false,
  affects_insurance_outcomes boolean DEFAULT false,
  affects_material_recommendations boolean DEFAULT false,
  
  -- Regional Metadata
  regional_rules jsonb DEFAULT '{}'::jsonb,
  
  -- Metadata
  last_updated timestamptz DEFAULT now(),
  source text,
  notes text,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_region_intelligence_state_code ON public.region_intelligence(state_code);
CREATE INDEX IF NOT EXISTS idx_region_intelligence_region ON public.region_intelligence(region_type, region_code);
CREATE INDEX IF NOT EXISTS idx_region_intelligence_zones ON public.region_intelligence(wildfire_zone, hurricane_zone, snow_load_zone);

-- ============================================================================
-- 7. CREATE contractor_state_rules_cache TABLE (Cached rules per contractor/org)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.contractor_state_rules_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  state_code text NOT NULL,
  
  -- Cached Rule Summary (for quick access)
  rules_summary jsonb DEFAULT '{}'::jsonb,
  
  -- Last fetched
  last_fetched timestamptz DEFAULT now(),
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(workspace_id, state_code)
);

CREATE INDEX IF NOT EXISTS idx_contractor_state_rules_cache_workspace ON public.contractor_state_rules_cache(workspace_id, state_code);

-- ============================================================================
-- 8. HELPER FUNCTIONS
-- ============================================================================

-- Function to get all rules for a state
CREATE OR REPLACE FUNCTION public.get_state_laws(p_state_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'state_code', sr.state_code,
    'state_name', sr.state_name,
    'rules', jsonb_build_object(
      'licensing', jsonb_build_object(
        'requires_license', sr.requires_roofing_license,
        'license_type', sr.license_type,
        'commercial_separate', sr.commercial_license_separate,
        'license_details', sr.license_details
      ),
      'insurance', jsonb_build_object(
        'can_negotiate_claim', sr.contractor_can_negotiate_claim,
        'can_document_damage', sr.contractor_can_document_damage,
        'can_interpret_policy', sr.contractor_can_interpret_policy,
        'can_show_damage', sr.contractor_can_show_damage
      ),
      'storm', jsonb_build_object(
        'claim_filing_deadline_days', sr.claim_filing_deadline_days,
        'door_to_door_allowed', sr.door_to_door_solicitation_allowed,
        'same_day_solicitation', sr.same_day_solicitation_after_storm,
        'cooling_off_period_hours', sr.solicitation_cooling_off_period_hours,
        'public_adjuster_required', sr.public_adjuster_required
      )
    ),
    'deductible', (
      SELECT jsonb_build_object(
        'waiving_illegal', sdl.deductible_waiving_illegal,
        'assistance_allowed', sdl.deductible_assistance_allowed,
        'payment_rules', sdl.deductible_payment_rules,
        'financing_allowed', sdl.financing_allowed,
        'payment_plans_allowed', sdl.payment_plans_allowed
      )
      FROM public.state_deductible_laws sdl
      WHERE sdl.state_code = p_state_code
    ),
    'matching', (
      SELECT jsonb_build_object(
        'requirement_type', sml.matching_requirement_type,
        'affects_replacement_value', sml.affects_replacement_value,
        'affects_supplement_potential', sml.affects_supplement_potential,
        'details', sml.matching_details
      )
      FROM public.state_matching_laws sml
      WHERE sml.state_code = p_state_code
    ),
    'code_requirements', (
      SELECT jsonb_build_object(
        'ventilation_required', scr.ventilation_code_required,
        'decking_required', scr.decking_code_required,
        'ice_water_shield_required', scr.ice_water_shield_code_required,
        'ice_water_shield_valleys', scr.ice_water_shield_valleys_required,
        'flashing_required', scr.flashing_code_required,
        'underlayment_required', scr.underlayment_code_required,
        'code_upgrades_payable', scr.code_upgrades_payable_by_insurance
      )
      FROM public.state_code_requirements scr
      WHERE scr.state_code = p_state_code
    ),
    'restrictions', (
      SELECT jsonb_build_object(
        'prohibited_practices', jsonb_build_object(
          'policy_interpretation', sres.policy_interpretation_prohibited,
          'negotiation_language', sres.negotiation_language_prohibited,
          'deductible_waiving', sres.deductible_waiving_prohibited,
          'free_roof_promises', sres.free_roof_promises_prohibited,
          'false_storm_claims', sres.false_storm_claims_prohibited,
          'misleading_guarantees', sres.misleading_insurance_guarantees_prohibited
        ),
        'prohibited_phrases', sres.prohibited_phrases,
        'prohibited_keywords', sres.prohibited_keywords,
        'compliant_alternatives', sres.compliant_alternatives
      )
      FROM public.state_restrictions sres
      WHERE sres.state_code = p_state_code
    )
  )
  INTO v_result
  FROM public.state_rules sr
  WHERE sr.state_code = UPPER(p_state_code);
  
  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

-- Function to check if messaging is compliant
CREATE OR REPLACE FUNCTION public.check_messaging_compliance(
  p_state_code text,
  p_message_text text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_restrictions jsonb;
  v_prohibited_phrases text[];
  v_prohibited_keywords text[];
  v_compliant_alternatives jsonb;
  v_violations text[];
  v_suggested_replacement text;
  v_message_lower text;
BEGIN
  -- Get restrictions
  SELECT 
    prohibited_phrases,
    prohibited_keywords,
    compliant_alternatives
  INTO 
    v_prohibited_phrases,
    v_prohibited_keywords,
    v_compliant_alternatives
  FROM public.state_restrictions
  WHERE state_code = UPPER(p_state_code);
  
  IF v_prohibited_phrases IS NULL THEN
    RETURN jsonb_build_object(
      'is_compliant', true,
      'violations', '[]'::jsonb,
      'suggested_replacement', p_message_text
    );
  END IF;
  
  v_message_lower := LOWER(p_message_text);
  v_violations := ARRAY[]::text[];
  v_suggested_replacement := p_message_text;
  
  -- Check for prohibited phrases
  IF v_prohibited_phrases IS NOT NULL THEN
    FOREACH v_suggested_replacement IN ARRAY v_prohibited_phrases
    LOOP
      IF v_message_lower LIKE '%' || LOWER(v_suggested_replacement) || '%' THEN
        v_violations := array_append(v_violations, v_suggested_replacement);
        -- Try to find compliant alternative
        IF v_compliant_alternatives ? v_suggested_replacement THEN
          v_suggested_replacement := REPLACE(
            v_suggested_replacement,
            v_suggested_replacement,
            v_compliant_alternatives->>v_suggested_replacement
          );
        END IF;
      END IF;
    END LOOP;
  END IF;
  
  -- Check for prohibited keywords
  IF v_prohibited_keywords IS NOT NULL THEN
    FOREACH v_suggested_replacement IN ARRAY v_prohibited_keywords
    LOOP
      IF v_message_lower LIKE '%' || LOWER(v_suggested_replacement) || '%' THEN
        v_violations := array_append(v_violations, v_suggested_replacement);
      END IF;
    END LOOP;
  END IF;
  
  RETURN jsonb_build_object(
    'is_compliant', array_length(v_violations, 1) IS NULL,
    'violations', to_jsonb(v_violations),
    'suggested_replacement', v_suggested_replacement
  );
END;
$$;

-- ============================================================================
-- 9. RLS POLICIES
-- ============================================================================

ALTER TABLE public.state_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.state_deductible_laws ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.state_matching_laws ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.state_code_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.state_restrictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.region_intelligence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_state_rules_cache ENABLE ROW LEVEL SECURITY;

-- State rules are public (read-only for all authenticated users)
CREATE POLICY "State rules are readable by authenticated users"
  ON public.state_rules FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "State deductible laws are readable by authenticated users"
  ON public.state_deductible_laws FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "State matching laws are readable by authenticated users"
  ON public.state_matching_laws FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "State code requirements are readable by authenticated users"
  ON public.state_code_requirements FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "State restrictions are readable by authenticated users"
  ON public.state_restrictions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Region intelligence is readable by authenticated users"
  ON public.region_intelligence FOR SELECT
  TO authenticated
  USING (true);

-- Contractor cache is workspace-scoped
CREATE POLICY "Contractor cache is readable by workspace members"
  ON public.contractor_state_rules_cache FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_members.workspace_id = contractor_state_rules_cache.workspace_id
      AND workspace_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Contractor cache is writable by workspace members"
  ON public.contractor_state_rules_cache FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_members.workspace_id = contractor_state_rules_cache.workspace_id
      AND workspace_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Contractor cache is updatable by workspace members"
  ON public.contractor_state_rules_cache FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_members.workspace_id = contractor_state_rules_cache.workspace_id
      AND workspace_members.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 10. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.state_rules IS 'Core state-level roofing and insurance regulations';
COMMENT ON TABLE public.state_deductible_laws IS 'State-specific deductible payment and waiving laws';
COMMENT ON TABLE public.state_matching_laws IS 'State-specific shingle matching requirements';
COMMENT ON TABLE public.state_code_requirements IS 'State-specific building code upgrade requirements';
COMMENT ON TABLE public.state_restrictions IS 'Prohibited practices and messaging filters per state';
COMMENT ON TABLE public.region_intelligence IS 'County/city/region-specific rules (HOA, zones, etc.)';
COMMENT ON TABLE public.contractor_state_rules_cache IS 'Cached state rules per contractor workspace for performance';





















































