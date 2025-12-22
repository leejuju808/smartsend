-- =========================================================
-- Block 20020 — SmartSend Inbox Smart Estimate Builder v2
-- (Photos → Full Scope, Exact Material Quantities, Waste Factor Calculation, Permit Detection, and AI Upgrade Suggestions)
-- =========================================================

-- ============================================================================
-- PART 1 — EXTEND estimates TABLE with Block 20020 fields
-- ============================================================================

ALTER TABLE IF EXISTS public.estimates
  -- Material Quantities (Part 1)
  ADD COLUMN IF NOT EXISTS material_quantities jsonb DEFAULT '{}'::jsonb, -- {shingles_bundles_min, shingles_bundles_max, underlayment_rolls, ridge_cap_ft, etc.}
  
  -- Waste Factor (Part 2)
  ADD COLUMN IF NOT EXISTS waste_factor_percent numeric(5,2) DEFAULT 12.0, -- 10%, 12-15%, 18-25%
  ADD COLUMN IF NOT EXISTS waste_factor_category text CHECK (waste_factor_category IN ('low', 'standard', 'complex')) DEFAULT 'standard',
  
  -- Labor Hours (Part 3)
  ADD COLUMN IF NOT EXISTS estimated_crew_size integer DEFAULT 4,
  ADD COLUMN IF NOT EXISTS estimated_labor_hours_min numeric(6,2),
  ADD COLUMN IF NOT EXISTS estimated_labor_hours_max numeric(6,2),
  ADD COLUMN IF NOT EXISTS estimated_job_duration_days_min numeric(4,2),
  ADD COLUMN IF NOT EXISTS estimated_job_duration_days_max numeric(4,2),
  
  -- Permit Requirements (Part 4)
  ADD COLUMN IF NOT EXISTS permit_required boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS permit_reason text,
  ADD COLUMN IF NOT EXISTS permit_cost_estimate numeric(10,2),
  
  -- Insurance Code Items (Part 5)
  ADD COLUMN IF NOT EXISTS insurance_code_items jsonb DEFAULT '[]'::jsonb, -- Array of code-required items
  
  -- Material Brands (Part 6)
  ADD COLUMN IF NOT EXISTS recommended_brands jsonb DEFAULT '[]'::jsonb, -- Array of brand recommendations
  
  -- Upsell Options (Part 7)
  ADD COLUMN IF NOT EXISTS upsell_options jsonb DEFAULT '[]'::jsonb, -- Array of optional upsells
  
  -- Customer Summary (Part 8)
  ADD COLUMN IF NOT EXISTS customer_summary text, -- Homeowner-friendly summary
  
  -- SMS Estimate (Part 10)
  ADD COLUMN IF NOT EXISTS sms_estimate_text text; -- Short SMS quote version

-- ============================================================================
-- PART 2 — CREATE estimate_material_quantities TABLE
-- ============================================================================
-- Detailed material quantity breakdowns

CREATE TABLE IF NOT EXISTS public.estimate_material_quantities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id uuid NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  
  -- Material types
  material_type text NOT NULL, -- 'shingles', 'underlayment', 'ridge_cap', 'starter', 'ice_water_shield', 'flashing', 'pipe_boots', 'nails', 'ventilation', 'drip_edge'
  
  -- Quantities
  quantity_min numeric(10,2),
  quantity_max numeric(10,2),
  quantity_avg numeric(10,2),
  unit text NOT NULL, -- 'bundles', 'rolls', 'linear_feet', 'pieces', 'pounds', 'units'
  
  -- Waste factor applied
  waste_factor_percent numeric(5,2) DEFAULT 0,
  quantity_with_waste numeric(10,2),
  
  -- Pricing
  unit_cost numeric(10,2),
  total_cost_min numeric(10,2),
  total_cost_max numeric(10,2),
  
  -- Metadata
  notes text,
  is_code_required boolean DEFAULT false, -- For insurance code items
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(estimate_id, material_type)
);

CREATE INDEX IF NOT EXISTS idx_estimate_material_quantities_estimate 
  ON public.estimate_material_quantities(estimate_id);
CREATE INDEX IF NOT EXISTS idx_estimate_material_quantities_type 
  ON public.estimate_material_quantities(material_type);

-- ============================================================================
-- PART 3 — CREATE estimate_upsells TABLE
-- ============================================================================
-- Optional upsell items that can be toggled ON/OFF

CREATE TABLE IF NOT EXISTS public.estimate_upsells (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id uuid NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  
  -- Upsell details
  upsell_type text NOT NULL CHECK (upsell_type IN (
    'ridge_vent_upgrade',
    'ice_water_full_coverage',
    'synthetic_underlayment_upgrade',
    'attic_insulation',
    'gutter_replacement',
    'skylight_upgrade',
    'algae_resistant_shingles',
    'high_wind_nailing_pattern',
    'extended_warranty',
    'solar_ready',
    'gutter_guards',
    'roof_coating',
    'chimney_cap',
    'attic_ventilation_upgrade'
  )),
  
  title text NOT NULL,
  description text,
  
  -- Pricing
  cost_min numeric(10,2),
  cost_max numeric(10,2),
  cost_avg numeric(10,2),
  
  -- Status
  is_included boolean DEFAULT false, -- Whether this upsell is included in base estimate
  is_recommended boolean DEFAULT false, -- AI recommendation flag
  
  -- Metadata
  ai_reasoning text, -- Why this upsell is recommended
  priority integer DEFAULT 0, -- Higher priority = show first
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(estimate_id, upsell_type)
);

CREATE INDEX IF NOT EXISTS idx_estimate_upsells_estimate 
  ON public.estimate_upsells(estimate_id);
CREATE INDEX IF NOT EXISTS idx_estimate_upsells_type 
  ON public.estimate_upsells(upsell_type);
CREATE INDEX IF NOT EXISTS idx_estimate_upsells_recommended 
  ON public.estimate_upsells(is_recommended) WHERE is_recommended = true;

-- ============================================================================
-- PART 4 — CREATE estimate_material_brands TABLE
-- ============================================================================
-- AI-driven material brand recommendations

CREATE TABLE IF NOT EXISTS public.estimate_material_brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id uuid NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  
  -- Brand details
  brand_name text NOT NULL, -- 'GAF Timberline HDZ', 'CertainTeed Landmark', 'Malarkey Highlander', 'Owens Corning Duration'
  brand_category text CHECK (brand_category IN ('mid_range', 'high_end', 'premium')) DEFAULT 'mid_range',
  
  -- Product details
  product_line text, -- Specific product line
  warranty_years integer,
  
  -- Pricing comparison
  price_per_square_min numeric(10,2),
  price_per_square_max numeric(10,2),
  price_difference_percent numeric(5,2), -- vs base estimate
  
  -- Recommendations
  pros text[], -- Array of pros
  cons text[], -- Array of cons
  best_for text, -- e.g., "High wind areas", "Algae-prone regions"
  
  -- AI reasoning
  ai_reasoning text,
  recommendation_score integer CHECK (recommendation_score >= 0 AND recommendation_score <= 100),
  is_recommended boolean DEFAULT false,
  
  -- Metadata
  region_suitability text[], -- Regions where this brand performs well
  weather_patterns text[], -- Weather conditions this brand handles best
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(estimate_id, brand_name)
);

CREATE INDEX IF NOT EXISTS idx_estimate_material_brands_estimate 
  ON public.estimate_material_brands(estimate_id);
CREATE INDEX IF NOT EXISTS idx_estimate_material_brands_recommended 
  ON public.estimate_material_brands(is_recommended) WHERE is_recommended = true;

-- ============================================================================
-- PART 5 — FUNCTIONS: Material Quantity Calculations
-- ============================================================================

-- Calculate exact material quantities based on roof squares, pitch, complexity, waste factor
CREATE OR REPLACE FUNCTION public.calculate_material_quantities(
  p_squares_avg numeric,
  p_pitch_category text DEFAULT 'medium',
  p_complexity_rating text DEFAULT 'medium',
  p_waste_factor_percent numeric DEFAULT 12.0,
  p_material_type text DEFAULT 'asphalt',
  p_has_dormers boolean DEFAULT false,
  p_has_valleys boolean DEFAULT false,
  p_penetrations_count integer DEFAULT 0,
  p_ridge_length_ft numeric DEFAULT NULL -- If NULL, estimate from squares
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_squares_with_waste numeric;
  v_ridge_length numeric;
  v_perimeter_ft numeric;
  v_result jsonb;
  v_shingles_bundles numeric;
  v_underlayment_rolls numeric;
  v_ridge_cap_ft numeric;
  v_starter_ft numeric;
  v_ice_water_rolls numeric;
  v_flashing_pieces numeric;
  v_pipe_boots integer;
  v_nails_pounds numeric;
  v_ventilation_pieces integer;
  v_drip_edge_ft numeric;
BEGIN
  -- Apply waste factor
  v_squares_with_waste := p_squares_avg * (1 + (p_waste_factor_percent / 100.0));
  
  -- Estimate ridge length (rough estimate: ~1.2x square root of squares * 10)
  IF p_ridge_length_ft IS NULL THEN
    v_ridge_length := SQRT(p_squares_avg * 100) * 1.2; -- Rough estimate
  ELSE
    v_ridge_length := p_ridge_length_ft;
  END IF;
  
  -- Estimate perimeter (rough estimate: ~4x square root of squares * 10)
  v_perimeter_ft := SQRT(p_squares_avg * 100) * 4;
  
  -- Calculate shingles (1 bundle covers ~33.33 sq ft, 3 bundles = 1 square)
  v_shingles_bundles := CEIL(v_squares_with_waste * 3);
  
  -- Calculate underlayment (1 roll covers ~400 sq ft = 4 squares)
  v_underlayment_rolls := CEIL(v_squares_with_waste / 4.0);
  
  -- Calculate ridge cap (linear feet along ridge + hips)
  v_ridge_cap_ft := v_ridge_length * 1.1; -- Add 10% for hips
  
  -- Calculate starter course (perimeter of roof)
  v_starter_ft := v_perimeter_ft;
  
  -- Calculate ice & water shield (typically in valleys and eaves, ~10% of perimeter)
  v_ice_water_rolls := CEIL((v_perimeter_ft * 0.1) / 50.0); -- 1 roll = ~50 linear feet
  
  -- Add extra for valleys if present
  IF p_has_valleys THEN
    v_ice_water_rolls := v_ice_water_rolls + CEIL((v_ridge_length * 0.3) / 50.0);
  END IF;
  
  -- Calculate flashing (step flashing for walls, valley flashing)
  v_flashing_pieces := GREATEST(10, p_penetrations_count * 2); -- Base + penetrations
  
  -- Calculate pipe boots (one per penetration)
  v_pipe_boots := GREATEST(1, p_penetrations_count);
  
  -- Calculate nails (roughly 4 lbs per square)
  v_nails_pounds := CEIL(v_squares_with_waste * 4);
  
  -- Calculate ventilation (1 vent per 150 sq ft, minimum 2)
  v_ventilation_pieces := GREATEST(2, CEIL((p_squares_avg * 100) / 150.0));
  
  -- Calculate drip edge (perimeter)
  v_drip_edge_ft := v_perimeter_ft;
  
  -- Build result JSON
  v_result := jsonb_build_object(
    'shingles_bundles_min', v_shingles_bundles - 2,
    'shingles_bundles_max', v_shingles_bundles + 2,
    'shingles_bundles_avg', v_shingles_bundles,
    'underlayment_rolls_min', GREATEST(1, v_underlayment_rolls - 1),
    'underlayment_rolls_max', v_underlayment_rolls + 1,
    'underlayment_rolls_avg', v_underlayment_rolls,
    'ridge_cap_ft', ROUND(v_ridge_cap_ft, 0),
    'starter_ft', ROUND(v_starter_ft, 0),
    'ice_water_shield_rolls', v_ice_water_rolls,
    'flashing_pieces', v_flashing_pieces,
    'pipe_boots', v_pipe_boots,
    'nails_pounds', v_nails_pounds,
    'ventilation_pieces', v_ventilation_pieces,
    'drip_edge_ft', ROUND(v_drip_edge_ft, 0),
    'waste_factor_applied', p_waste_factor_percent
  );
  
  RETURN v_result;
END;
$$;

-- ============================================================================
-- PART 6 — FUNCTIONS: Waste Factor Intelligence
-- ============================================================================

-- Determine waste factor based on roof complexity
CREATE OR REPLACE FUNCTION public.calculate_waste_factor(
  p_complexity_rating text DEFAULT 'medium',
  p_has_dormers boolean DEFAULT false,
  p_has_valleys boolean DEFAULT false,
  p_multi_plane_complexity boolean DEFAULT false,
  p_penetrations_count integer DEFAULT 0,
  p_steep_pitch boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_base_waste numeric;
  v_waste_factor numeric;
  v_category text;
BEGIN
  -- Base waste factor by complexity
  v_base_waste := CASE 
    WHEN p_complexity_rating = 'low' THEN 10.0
    WHEN p_complexity_rating = 'medium' THEN 13.5
    WHEN p_complexity_rating = 'high' THEN 20.0
    WHEN p_complexity_rating = 'very_high' THEN 25.0
    ELSE 12.0
  END;
  
  -- Add complexity modifiers
  IF p_has_dormers THEN v_base_waste := v_base_waste + 2.0; END IF;
  IF p_has_valleys THEN v_base_waste := v_base_waste + 1.5; END IF;
  IF p_multi_plane_complexity THEN v_base_waste := v_base_waste + 3.0; END IF;
  IF p_steep_pitch THEN v_base_waste := v_base_waste + 2.0; END IF;
  IF p_penetrations_count > 5 THEN v_base_waste := v_base_waste + 1.0; END IF;
  
  -- Cap at 25%
  v_waste_factor := LEAST(v_base_waste, 25.0);
  
  -- Categorize
  IF v_waste_factor <= 10.0 THEN
    v_category := 'low';
  ELSIF v_waste_factor <= 15.0 THEN
    v_category := 'standard';
  ELSE
    v_category := 'complex';
  END IF;
  
  RETURN jsonb_build_object(
    'waste_factor_percent', ROUND(v_waste_factor, 2),
    'waste_factor_category', v_category,
    'factors_applied', jsonb_build_object(
      'complexity', p_complexity_rating,
      'dormers', p_has_dormers,
      'valleys', p_has_valleys,
      'multi_plane', p_multi_plane_complexity,
      'steep_pitch', p_steep_pitch,
      'penetrations', p_penetrations_count
    )
  );
END;
$$;

-- ============================================================================
-- PART 7 — FUNCTIONS: Labor Hour Estimation
-- ============================================================================

-- Estimate labor hours and crew size
CREATE OR REPLACE FUNCTION public.calculate_labor_hours(
  p_squares_avg numeric,
  p_complexity_rating text DEFAULT 'medium',
  p_material_type text DEFAULT 'asphalt',
  p_pitch_category text DEFAULT 'medium',
  p_has_chimney boolean DEFAULT false,
  p_has_skylights boolean DEFAULT false,
  p_has_dormers boolean DEFAULT false,
  p_tear_off_required boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_crew_size integer;
  v_hours_per_square numeric;
  v_base_hours numeric;
  v_complexity_multiplier numeric;
  v_pitch_multiplier numeric;
  v_material_multiplier numeric;
  v_add_on_hours numeric;
  v_total_hours_min numeric;
  v_total_hours_max numeric;
  v_days_min numeric;
  v_days_max numeric;
BEGIN
  -- Determine crew size based on job size
  IF p_squares_avg <= 15 THEN
    v_crew_size := 3;
  ELSIF p_squares_avg <= 30 THEN
    v_crew_size := 4;
  ELSE
    v_crew_size := 5;
  END IF;
  
  -- Base hours per square (for 4-person crew)
  v_hours_per_square := CASE 
    WHEN p_material_type = 'asphalt' THEN 1.5
    WHEN p_material_type = 'metal' THEN 2.0
    WHEN p_material_type = 'tile' THEN 2.5
    WHEN p_material_type = 'flat_roof' THEN 1.8
    ELSE 1.5
  END;
  
  -- Add tear-off time if required
  IF p_tear_off_required THEN
    v_hours_per_square := v_hours_per_square + 0.5;
  END IF;
  
  -- Complexity multiplier
  v_complexity_multiplier := CASE 
    WHEN p_complexity_rating = 'low' THEN 0.9
    WHEN p_complexity_rating = 'medium' THEN 1.0
    WHEN p_complexity_rating = 'high' THEN 1.25
    WHEN p_complexity_rating = 'very_high' THEN 1.4
    ELSE 1.0
  END;
  
  -- Pitch multiplier
  v_pitch_multiplier := CASE 
    WHEN p_pitch_category = 'low' THEN 0.95
    WHEN p_pitch_category = 'medium' THEN 1.0
    WHEN p_pitch_category = 'high' THEN 1.15
    WHEN p_pitch_category = 'steep' THEN 1.35
    ELSE 1.0
  END;
  
  -- Material multiplier (already in hours_per_square, but add small adjustment)
  v_material_multiplier := 1.0;
  
  -- Calculate base hours
  v_base_hours := p_squares_avg * v_hours_per_square * v_complexity_multiplier * v_pitch_multiplier * v_material_multiplier;
  
  -- Adjust for crew size (larger crew = fewer hours)
  v_base_hours := v_base_hours * (4.0 / v_crew_size);
  
  -- Add-on hours for special features
  v_add_on_hours := 0;
  IF p_has_chimney THEN v_add_on_hours := v_add_on_hours + 3.0; END IF;
  IF p_has_skylights THEN v_add_on_hours := v_add_on_hours + 2.0; END IF;
  IF p_has_dormers THEN v_add_on_hours := v_add_on_hours + 4.0; END IF;
  
  -- Calculate total hours with range
  v_total_hours_min := (v_base_hours + v_add_on_hours) * 0.9;
  v_total_hours_max := (v_base_hours + v_add_on_hours) * 1.1;
  
  -- Calculate days (assuming 8-hour work days)
  v_days_min := CEIL(v_total_hours_min / 8.0);
  v_days_max := CEIL(v_total_hours_max / 8.0);
  
  RETURN jsonb_build_object(
    'crew_size', v_crew_size,
    'labor_hours_min', ROUND(v_total_hours_min, 1),
    'labor_hours_max', ROUND(v_total_hours_max, 1),
    'labor_hours_avg', ROUND((v_total_hours_min + v_total_hours_max) / 2.0, 1),
    'job_duration_days_min', v_days_min,
    'job_duration_days_max', v_days_max,
    'job_duration_days_avg', ROUND((v_days_min + v_days_max) / 2.0, 1)
  );
END;
$$;

-- ============================================================================
-- PART 8 — FUNCTIONS: Permit Requirement Detection
-- ============================================================================

-- Check if permit is required based on city/state, job type, roof size
CREATE OR REPLACE FUNCTION public.check_permit_requirements(
  p_state text,
  p_city text DEFAULT NULL,
  p_zip_code text DEFAULT NULL,
  p_job_type text DEFAULT 'roof_replacement',
  p_squares_avg numeric DEFAULT 20,
  p_tear_off_required boolean DEFAULT true,
  p_structural_concerns boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_permit_required boolean := false;
  v_reason text;
  v_cost_estimate numeric;
BEGIN
  -- General rules (can be enhanced with actual city/state permit databases)
  
  -- Most states require permits for full tear-off over certain square footage
  IF p_tear_off_required AND p_squares_avg >= 10 THEN
    v_permit_required := true;
    v_reason := 'Full tear-off replacement over 10 squares typically requires a building permit in ' || COALESCE(p_state, 'your state');
    v_cost_estimate := 150.0; -- Typical permit cost
  END IF;
  
  -- Structural concerns always require permit
  IF p_structural_concerns THEN
    v_permit_required := true;
    v_reason := 'Structural modifications require a building permit';
    v_cost_estimate := COALESCE(v_cost_estimate, 200.0);
  END IF;
  
  -- Large roofs (>30 squares) often require permits
  IF p_squares_avg > 30 THEN
    v_permit_required := true;
    v_reason := 'Large roof replacement (' || ROUND(p_squares_avg, 1) || ' squares) typically requires a permit';
    v_cost_estimate := COALESCE(v_cost_estimate, 200.0);
  END IF;
  
  -- State-specific rules (examples)
  IF p_state = 'FL' OR p_state = 'FLORIDA' THEN
    -- Florida: Permits required for most roofing work
    IF p_job_type = 'roof_replacement' THEN
      v_permit_required := true;
      v_reason := 'Florida requires permits for roof replacements';
      v_cost_estimate := 150.0;
    END IF;
  END IF;
  
  IF p_state = 'CA' OR p_state = 'CALIFORNIA' THEN
    -- California: Permits required for full replacement
    IF p_job_type = 'roof_replacement' AND p_tear_off_required THEN
      v_permit_required := true;
      v_reason := 'California requires permits for full roof replacement';
      v_cost_estimate := 200.0;
    END IF;
  END IF;
  
  -- If no permit required, set reason
  IF NOT v_permit_required THEN
    v_reason := 'No permit required for this type of work in ' || COALESCE(p_state, 'your area');
  END IF;
  
  RETURN jsonb_build_object(
    'permit_required', v_permit_required,
    'permit_reason', v_reason,
    'permit_cost_estimate', COALESCE(v_cost_estimate, 0),
    'state', p_state,
    'city', p_city,
    'zip_code', p_zip_code
  );
END;
$$;

-- ============================================================================
-- PART 9 — FUNCTIONS: Insurance Code Items Detection
-- ============================================================================

-- Generate insurance "match to code" items
CREATE OR REPLACE FUNCTION public.generate_insurance_code_items(
  p_is_insurance_job boolean DEFAULT false,
  p_state text DEFAULT NULL,
  p_squares_avg numeric DEFAULT 20,
  p_has_valleys boolean DEFAULT false,
  p_has_chimney boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_code_items jsonb := '[]'::jsonb;
  v_item jsonb;
BEGIN
  -- Only generate if this is an insurance job
  IF NOT p_is_insurance_job THEN
    RETURN jsonb_build_object('code_items', '[]'::jsonb, 'count', 0);
  END IF;
  
  -- Standard code items for insurance claims
  
  -- Drip edge (required by most building codes)
  v_item := jsonb_build_object(
    'item_type', 'drip_edge',
    'description', 'Drip edge installation (required by local building code)',
    'category', 'materials',
    'is_required', true,
    'code_reference', 'IRC R905.2.8.5'
  );
  v_code_items := v_code_items || jsonb_build_array(v_item);
  
  -- Ridge vent (required for proper ventilation)
  v_item := jsonb_build_object(
    'item_type', 'ridge_vent',
    'description', 'Ridge vent installation (required for code-compliant ventilation)',
    'category', 'materials',
    'is_required', true,
    'code_reference', 'IRC R806.2'
  );
  v_code_items := v_code_items || jsonb_build_array(v_item);
  
  -- Ice & water shield (required in certain climates)
  IF p_state IN ('MN', 'WI', 'MI', 'NY', 'MA', 'VT', 'NH', 'ME') OR p_has_valleys THEN
    v_item := jsonb_build_object(
      'item_type', 'ice_water_shield',
      'description', 'Ice and water shield in valleys and eaves (required by code in cold climates)',
      'category', 'materials',
      'is_required', true,
      'code_reference', 'IRC R905.2.8.1'
    );
    v_code_items := v_code_items || jsonb_build_array(v_item);
  END IF;
  
  -- Starter course (required for proper shingle installation)
  v_item := jsonb_build_object(
    'item_type', 'starter_course',
    'description', 'Starter course shingles (required by manufacturer and code)',
    'category', 'materials',
    'is_required', true,
    'code_reference', 'IRC R905.2.4'
  );
  v_code_items := v_code_items || jsonb_build_array(v_item);
  
  -- Synthetic underlayment (often required for insurance)
  v_item := jsonb_build_object(
    'item_type', 'synthetic_underlayment',
    'description', 'Synthetic underlayment upgrade (required by insurance for better protection)',
    'category', 'materials',
    'is_required', true,
    'code_reference', 'Insurance requirement'
  );
  v_code_items := v_code_items || jsonb_build_array(v_item);
  
  -- Chimney flashing updates (if chimney present)
  IF p_has_chimney THEN
    v_item := jsonb_build_object(
      'item_type', 'chimney_flashing',
      'description', 'Chimney flashing update to current code standards',
      'category', 'materials',
      'is_required', true,
      'code_reference', 'IRC R903.2'
    );
    v_code_items := v_code_items || jsonb_build_array(v_item);
  END IF;
  
  -- Ventilation upgrades (if needed)
  v_item := jsonb_build_object(
    'item_type', 'ventilation_upgrade',
    'description', 'Code-mandated ventilation improvements',
    'category', 'materials',
    'is_required', true,
    'code_reference', 'IRC R806.1'
  );
  v_code_items := v_code_items || jsonb_build_array(v_item);
  
  RETURN jsonb_build_object(
    'code_items', v_code_items,
    'count', jsonb_array_length(v_code_items)
  );
END;
$$;

-- ============================================================================
-- PART 10 — TRIGGERS
-- ============================================================================

CREATE TRIGGER tr_update_estimate_material_quantities_updated_at
BEFORE UPDATE ON public.estimate_material_quantities
FOR EACH ROW
EXECUTE FUNCTION public.tg_update_estimate_updated_at();

CREATE TRIGGER tr_update_estimate_upsells_updated_at
BEFORE UPDATE ON public.estimate_upsells
FOR EACH ROW
EXECUTE FUNCTION public.tg_update_estimate_updated_at();

CREATE TRIGGER tr_update_estimate_material_brands_updated_at
BEFORE UPDATE ON public.estimate_material_brands
FOR EACH ROW
EXECUTE FUNCTION public.tg_update_estimate_updated_at();

-- ============================================================================
-- PART 11 — ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.estimate_material_quantities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estimate_upsells ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estimate_material_brands ENABLE ROW LEVEL SECURITY;

-- Policies for estimate_material_quantities
CREATE POLICY "Users can view material quantities for estimates in their workspace"
  ON public.estimate_material_quantities FOR SELECT
  USING (
    estimate_id IN (
      SELECT id FROM public.estimates
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can create material quantities for estimates in their workspace"
  ON public.estimate_material_quantities FOR INSERT
  WITH CHECK (
    estimate_id IN (
      SELECT id FROM public.estimates
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update material quantities for estimates in their workspace"
  ON public.estimate_material_quantities FOR UPDATE
  USING (
    estimate_id IN (
      SELECT id FROM public.estimates
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
    )
  );

-- Policies for estimate_upsells
CREATE POLICY "Users can view upsells for estimates in their workspace"
  ON public.estimate_upsells FOR SELECT
  USING (
    estimate_id IN (
      SELECT id FROM public.estimates
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can create upsells for estimates in their workspace"
  ON public.estimate_upsells FOR INSERT
  WITH CHECK (
    estimate_id IN (
      SELECT id FROM public.estimates
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update upsells for estimates in their workspace"
  ON public.estimate_upsells FOR UPDATE
  USING (
    estimate_id IN (
      SELECT id FROM public.estimates
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
    )
  );

-- Policies for estimate_material_brands
CREATE POLICY "Users can view material brands for estimates in their workspace"
  ON public.estimate_material_brands FOR SELECT
  USING (
    estimate_id IN (
      SELECT id FROM public.estimates
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can create material brands for estimates in their workspace"
  ON public.estimate_material_brands FOR INSERT
  WITH CHECK (
    estimate_id IN (
      SELECT id FROM public.estimates
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update material brands for estimates in their workspace"
  ON public.estimate_material_brands FOR UPDATE
  USING (
    estimate_id IN (
      SELECT id FROM public.estimates
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
    )
  );

-- ============================================================================
-- PART 12 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.estimate_material_quantities IS 'Detailed material quantity breakdowns for estimates (bundles, rolls, linear feet, etc.)';
COMMENT ON TABLE public.estimate_upsells IS 'Optional upsell items that can be toggled ON/OFF in estimates';
COMMENT ON TABLE public.estimate_material_brands IS 'AI-driven material brand recommendations for estimates';
COMMENT ON FUNCTION public.calculate_material_quantities IS 'Calculate exact material quantities based on roof squares, pitch, complexity, and waste factor';
COMMENT ON FUNCTION public.calculate_waste_factor IS 'Determine waste factor percentage based on roof complexity factors';
COMMENT ON FUNCTION public.calculate_labor_hours IS 'Estimate labor hours, crew size, and job duration';
COMMENT ON FUNCTION public.check_permit_requirements IS 'Check if building permit is required based on location, job type, and roof size';
COMMENT ON FUNCTION public.generate_insurance_code_items IS 'Generate insurance "match to code" required items';



















































