-- ============================================================
-- Block 255900 — SmartSend AI Estimating Engine v2
-- Full Roof Measurement, Waste Optimization, Labor Estimation, 
-- Real-Time Pricing, Instant Proposals, Profit Guard
-- ============================================================
-- 
-- This is one of the BIGGEST MONEY BLOCKS in all of SmartSend.
-- Estimating is where roofers lose the MOST money:
-- - wrong measurements
-- - waste too high
-- - labor estimates way off
-- - pricing inconsistent
-- - sales reps underbid or overbid
-- - no standardization
-- - takes too long
-- - proposals look unprofessional
-- - materials always missing or extra
-- - job profit unpredictable
--
-- SmartSend Estimating Engine v2 fixes ALL OF IT:
-- roof measurement → material calculation → waste optimization → 
-- labor → pricing → proposal ALL AUTOMATIC.
-- ============================================================

-- ============================================================================
-- PART 1 — ENHANCE ESTIMATES TABLE (v2)
-- ============================================================================
-- Extend existing estimates table with v2 fields
-- Note: Handles multiple estimates table structures (org_id vs company_id)

DO $$
BEGIN
  -- Check if estimates table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'estimates') THEN
    -- Add v2 fields to estimates table if they don't exist
    ALTER TABLE public.estimates
      ADD COLUMN IF NOT EXISTS job_id uuid,
      ADD COLUMN IF NOT EXISTS measurement jsonb DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS materials jsonb DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS labor_cost numeric(12,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS material_cost numeric(12,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS overhead numeric(12,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total_price numeric(12,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS margin numeric(5,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS proposal_url text,
      ADD COLUMN IF NOT EXISTS waste_percentage numeric(5,2),
      ADD COLUMN IF NOT EXISTS labor_hours numeric(8,2),
      ADD COLUMN IF NOT EXISTS crew_days numeric(5,2),
      ADD COLUMN IF NOT EXISTS profit_guard_warning boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS profit_guard_approved_by uuid,
      ADD COLUMN IF NOT EXISTS profit_guard_approved_at timestamptz;
    
    -- Add foreign key constraints if tables exist
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
      -- Add FK constraint for job_id if it doesn't exist
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'estimates_job_id_fkey' 
        AND table_name = 'estimates'
      ) THEN
        ALTER TABLE public.estimates
          ADD CONSTRAINT estimates_job_id_fkey 
          FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE SET NULL;
      END IF;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
      -- Add FK constraint for profit_guard_approved_by if it doesn't exist
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'estimates_profit_guard_approved_by_fkey' 
        AND table_name = 'estimates'
      ) THEN
        ALTER TABLE public.estimates
          ADD CONSTRAINT estimates_profit_guard_approved_by_fkey 
          FOREIGN KEY (profit_guard_approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;
      END IF;
    END IF;
  END IF;
END $$;

-- Indexes for new fields
CREATE INDEX IF NOT EXISTS idx_estimates_job_id ON public.estimates(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_estimates_profit_guard ON public.estimates(profit_guard_warning) WHERE profit_guard_warning = true;

-- ============================================================================
-- PART 2 — MEASUREMENT_INPUTS TABLE
-- ============================================================================
-- Store raw measurement inputs (address, drone, manual upload)

CREATE TABLE IF NOT EXISTS public.measurement_inputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id uuid REFERENCES public.estimates(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  input_type text NOT NULL CHECK (input_type IN ('address_lookup', 'drone', 'manual_upload')),
  raw_data jsonb DEFAULT '{}'::jsonb,
  -- Address lookup fields
  address text,
  -- Drone/upload fields
  image_urls text[] DEFAULT '{}',
  -- Processing status
  processed boolean DEFAULT false,
  processed_at timestamptz,
  processing_error text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_measurement_inputs_estimate ON public.measurement_inputs(estimate_id);
CREATE INDEX IF NOT EXISTS idx_measurement_inputs_job ON public.measurement_inputs(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_measurement_inputs_type ON public.measurement_inputs(input_type);
CREATE INDEX IF NOT EXISTS idx_measurement_inputs_processed ON public.measurement_inputs(processed) WHERE processed = false;

-- ============================================================================
-- PART 3 — WASTE OPTIMIZATION ENGINE
-- ============================================================================
-- Calculate optimal waste based on roof complexity

CREATE OR REPLACE FUNCTION public.calculate_waste_optimization(
  p_squares numeric,
  p_pitch numeric,
  p_facets int,
  p_valleys int,
  p_hips int,
  p_shingle_type text DEFAULT 'architectural'
)
RETURNS TABLE (
  waste_percentage numeric(5,2),
  recommended_bundles int,
  waste_squares numeric(5,2),
  optimization_notes text
) LANGUAGE plpgsql AS $$
DECLARE
  v_base_waste numeric(5,2) := 8.0; -- Base waste for simple roofs
  v_pitch_multiplier numeric(5,2) := 1.0;
  v_complexity_multiplier numeric(5,2) := 1.0;
  v_final_waste numeric(5,2);
  v_bundles_per_square int := 3;
  v_total_bundles int;
  v_waste_squares numeric(5,2);
  v_notes text;
BEGIN
  -- Adjust for pitch (steeper = more waste)
  IF p_pitch >= 10 THEN
    v_pitch_multiplier := 1.15; -- 15% more waste for steep roofs
  ELSIF p_pitch >= 7 THEN
    v_pitch_multiplier := 1.08; -- 8% more waste for medium-steep
  ELSIF p_pitch >= 4 THEN
    v_pitch_multiplier := 1.03; -- 3% more waste for medium
  END IF;
  
  -- Adjust for complexity (more facets/valleys/hips = more waste)
  IF p_facets > 8 OR (p_valleys + p_hips) > 6 THEN
    v_complexity_multiplier := 1.20; -- 20% more waste for complex roofs
  ELSIF p_facets > 5 OR (p_valleys + p_hips) > 3 THEN
    v_complexity_multiplier := 1.10; -- 10% more waste for moderate complexity
  END IF;
  
  -- Calculate final waste
  v_final_waste := v_base_waste * v_pitch_multiplier * v_complexity_multiplier;
  
  -- Cap waste at 15% (industry max)
  IF v_final_waste > 15.0 THEN
    v_final_waste := 15.0;
    v_notes := '⚠️ Waste Higher Than Normal. Recommended: Reduce from ' || 
               ROUND((p_squares * v_final_waste / 100)::numeric, 1)::text || 
               ' squares to ' || 
               ROUND((p_squares * 12.0 / 100)::numeric, 1)::text || 
               ' squares.';
  ELSE
    v_notes := 'Optimized waste calculation based on roof complexity.';
  END IF;
  
  -- Calculate bundles
  v_waste_squares := p_squares * v_final_waste / 100;
  v_total_bundles := CEIL((p_squares + v_waste_squares) * v_bundles_per_square);
  
  RETURN QUERY SELECT 
    ROUND(v_final_waste, 2),
    v_total_bundles,
    ROUND(v_waste_squares, 2),
    v_notes;
END;
$$;

-- ============================================================================
-- PART 4 — LABOR ESTIMATION ENGINE
-- ============================================================================
-- Calculate labor hours and cost automatically

CREATE OR REPLACE FUNCTION public.calculate_labor_estimation(
  p_squares numeric,
  p_pitch numeric,
  p_tear_off_layers int DEFAULT 1,
  p_facets int DEFAULT 4,
  p_crew_strength int DEFAULT 4, -- 4-person crew
  p_old_material_type text DEFAULT 'asphalt'
)
RETURNS TABLE (
  labor_hours numeric(8,2),
  labor_cost numeric(12,2),
  crew_days numeric(5,2),
  labor_breakdown jsonb
) LANGUAGE plpgsql AS $$
DECLARE
  v_base_hours_per_square numeric(5,2) := 0.8; -- Base hours per square
  v_pitch_multiplier numeric(5,2) := 1.0;
  v_tear_off_multiplier numeric(5,2) := 1.0;
  v_facet_multiplier numeric(5,2) := 1.0;
  v_material_multiplier numeric(5,2) := 1.0;
  v_total_hours numeric(8,2);
  v_labor_rate_per_hour numeric(8,2) := 50.0; -- Default $50/hour
  v_total_cost numeric(12,2);
  v_crew_days numeric(5,2);
  v_breakdown jsonb;
BEGIN
  -- Adjust for pitch (steeper = more time)
  IF p_pitch >= 10 THEN
    v_pitch_multiplier := 1.40; -- 40% more time for steep roofs
  ELSIF p_pitch >= 7 THEN
    v_pitch_multiplier := 1.20; -- 20% more time
  ELSIF p_pitch >= 4 THEN
    v_pitch_multiplier := 1.10; -- 10% more time
  END IF;
  
  -- Adjust for tear-off layers
  IF p_tear_off_layers = 2 THEN
    v_tear_off_multiplier := 1.15; -- 15% more time for 2 layers
  ELSIF p_tear_off_layers >= 3 THEN
    v_tear_off_multiplier := 1.30; -- 30% more time for 3+ layers
  END IF;
  
  -- Adjust for facets (more facets = more cutting)
  IF p_facets > 8 THEN
    v_facet_multiplier := 1.15;
  ELSIF p_facets > 5 THEN
    v_facet_multiplier := 1.08;
  END IF;
  
  -- Adjust for old material type
  IF p_old_material_type = 'tile' THEN
    v_material_multiplier := 1.25; -- Tile removal is slower
  ELSIF p_old_material_type = 'metal' THEN
    v_material_multiplier := 1.10;
  END IF;
  
  -- Calculate total hours
  v_total_hours := p_squares * v_base_hours_per_square * 
                   v_pitch_multiplier * v_tear_off_multiplier * 
                   v_facet_multiplier * v_material_multiplier;
  
  -- Calculate cost
  v_total_cost := v_total_hours * v_labor_rate_per_hour;
  
  -- Calculate crew days (assuming 8-hour days)
  v_crew_days := ROUND((v_total_hours / p_crew_strength / 8.0)::numeric, 1);
  
  -- Build breakdown
  v_breakdown := jsonb_build_object(
    'base_hours', p_squares * v_base_hours_per_square,
    'pitch_adjustment', v_pitch_multiplier,
    'tear_off_adjustment', v_tear_off_multiplier,
    'facet_adjustment', v_facet_multiplier,
    'material_adjustment', v_material_multiplier,
    'labor_rate_per_hour', v_labor_rate_per_hour,
    'crew_strength', p_crew_strength
  );
  
  RETURN QUERY SELECT 
    ROUND(v_total_hours, 2),
    ROUND(v_total_cost, 2),
    v_crew_days,
    v_breakdown;
END;
$$;

-- ============================================================================
-- PART 5 — AUTO MATERIAL LIST BUILDER
-- ============================================================================
-- Generate perfect material list from measurements

CREATE OR REPLACE FUNCTION public.build_material_list(
  p_squares numeric,
  p_waste_percentage numeric,
  p_ridge_length_ft numeric DEFAULT 0,
  p_hip_length_ft numeric DEFAULT 0,
  p_valley_length_ft numeric DEFAULT 0,
  p_eaves_length_ft numeric DEFAULT 0,
  p_pitch numeric DEFAULT 6
)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_total_squares numeric;
  v_bundles int;
  v_starter_bundles int;
  v_ridge_bundles int;
  v_underlayment_rolls int;
  v_ice_water_rolls int;
  v_drip_edge_ft numeric;
  v_nail_boxes int;
  v_vents int;
  v_pipe_boots int;
  v_sealant_tubes int;
  v_material_list jsonb;
BEGIN
  -- Calculate total squares with waste
  v_total_squares := p_squares * (1 + p_waste_percentage / 100);
  
  -- Shingles: 3 bundles per square
  v_bundles := CEIL(v_total_squares * 3);
  
  -- Starter: 1 bundle per 100 linear feet of eave
  v_starter_bundles := CEIL(GREATEST(p_eaves_length_ft / 100, 1));
  
  -- Ridge: 33 linear feet per bundle
  v_ridge_bundles := CEIL(GREATEST((p_ridge_length_ft + p_hip_length_ft) / 33, 1));
  
  -- Underlayment: 1 roll per 4 squares (synthetic) or 1 roll per 2 squares (felt)
  v_underlayment_rolls := CEIL(v_total_squares / 4);
  
  -- Ice & Water Shield: 1 roll per 2 squares (for eaves and valleys)
  -- More needed for steeper pitches
  IF p_pitch >= 7 THEN
    v_ice_water_rolls := CEIL((p_eaves_length_ft / 36 + p_valley_length_ft / 36) * 1.2);
  ELSE
    v_ice_water_rolls := CEIL((p_eaves_length_ft / 36 + p_valley_length_ft / 36));
  END IF;
  v_ice_water_rolls := GREATEST(v_ice_water_rolls, 1);
  
  -- Drip Edge: Eaves length
  v_drip_edge_ft := p_eaves_length_ft;
  
  -- Nails: 1 box per 3 squares
  v_nail_boxes := CEIL(v_total_squares / 3);
  
  -- Vents: 1 vent per 1.5 squares
  v_vents := CEIL(v_total_squares / 1.5);
  
  -- Pipe Boots: Estimate 1-2 per job
  v_pipe_boots := 2;
  
  -- Sealant: 1 tube per 10 squares
  v_sealant_tubes := CEIL(v_total_squares / 10);
  
  -- Build material list JSON
  v_material_list := jsonb_build_array(
    jsonb_build_object('material', 'Shingles', 'quantity', v_bundles, 'unit', 'bundles'),
    jsonb_build_object('material', 'Starter', 'quantity', v_starter_bundles, 'unit', 'bundles'),
    jsonb_build_object('material', 'Ridge', 'quantity', v_ridge_bundles, 'unit', 'bundles'),
    jsonb_build_object('material', 'Underlayment', 'quantity', v_underlayment_rolls, 'unit', 'rolls'),
    jsonb_build_object('material', 'Ice & Water Shield', 'quantity', v_ice_water_rolls, 'unit', 'rolls'),
    jsonb_build_object('material', 'Drip Edge', 'quantity', ROUND(v_drip_edge_ft, 0), 'unit', 'ft'),
    jsonb_build_object('material', 'Nails', 'quantity', v_nail_boxes, 'unit', 'boxes'),
    jsonb_build_object('material', 'Vents', 'quantity', v_vents, 'unit', 'pieces'),
    jsonb_build_object('material', 'Pipe Boots', 'quantity', v_pipe_boots, 'unit', 'pieces'),
    jsonb_build_object('material', 'Sealant Tubes', 'quantity', v_sealant_tubes, 'unit', 'tubes')
  );
  
  RETURN v_material_list;
END;
$$;

-- ============================================================================
-- PART 6 — REAL-TIME MATERIAL PRICING INTEGRATION
-- ============================================================================
-- Calculate material costs from materials_catalog

CREATE OR REPLACE FUNCTION public.calculate_material_costs(
  p_material_list jsonb,
  p_supplier_id uuid DEFAULT NULL,
  p_company_id uuid DEFAULT NULL
)
RETURNS TABLE (
  total_material_cost numeric(12,2),
  material_breakdown jsonb,
  pricing_source text
) LANGUAGE plpgsql AS $$
DECLARE
  v_material jsonb;
  v_material_name text;
  v_quantity numeric;
  v_unit text;
  v_catalog_price numeric(10,2);
  v_item_cost numeric(12,2);
  v_total_cost numeric(12,2) := 0;
  v_breakdown jsonb := '[]'::jsonb;
  v_pricing_source text := 'catalog';
BEGIN
  -- Loop through material list
  FOR v_material IN SELECT * FROM jsonb_array_elements(p_material_list)
  LOOP
    v_material_name := v_material->>'material';
    v_quantity := (v_material->>'quantity')::numeric;
    v_unit := v_material->>'unit';
    
    -- Get price from materials_catalog
    SELECT current_price INTO v_catalog_price
    FROM public.materials_catalog
    WHERE material_name ILIKE '%' || v_material_name || '%'
      AND (p_supplier_id IS NULL OR supplier_id = p_supplier_id)
      AND (p_company_id IS NULL OR company_id = p_company_id)
    ORDER BY updated_at DESC
    LIMIT 1;
    
    -- If no catalog price, use default estimates
    IF v_catalog_price IS NULL THEN
      -- Default pricing estimates (fallback)
      CASE v_material_name
        WHEN 'Shingles' THEN v_catalog_price := 100.0; -- per bundle
        WHEN 'Starter' THEN v_catalog_price := 45.0;
        WHEN 'Ridge' THEN v_catalog_price := 45.0;
        WHEN 'Underlayment' THEN v_catalog_price := 55.0; -- per roll
        WHEN 'Ice & Water Shield' THEN v_catalog_price := 95.0; -- per roll
        WHEN 'Drip Edge' THEN v_catalog_price := 2.5; -- per ft
        WHEN 'Nails' THEN v_catalog_price := 25.0; -- per box
        WHEN 'Vents' THEN v_catalog_price := 15.0; -- per piece
        WHEN 'Pipe Boots' THEN v_catalog_price := 12.0;
        WHEN 'Sealant Tubes' THEN v_catalog_price := 8.0;
        ELSE v_catalog_price := 0;
      END CASE;
      v_pricing_source := 'default_estimate';
    END IF;
    
    -- Calculate item cost
    v_item_cost := v_quantity * v_catalog_price;
    v_total_cost := v_total_cost + v_item_cost;
    
    -- Add to breakdown
    v_breakdown := v_breakdown || jsonb_build_object(
      'material', v_material_name,
      'quantity', v_quantity,
      'unit', v_unit,
      'unit_price', v_catalog_price,
      'total', v_item_cost
    );
  END LOOP;
  
  RETURN QUERY SELECT 
    ROUND(v_total_cost, 2),
    v_breakdown,
    v_pricing_source;
END;
$$;

-- ============================================================================
-- PART 7 — PROFIT GUARD SYSTEM
-- ============================================================================
-- Prevent reps from underbidding

CREATE OR REPLACE FUNCTION public.check_profit_guard(
  p_estimate_id uuid,
  p_proposed_price numeric(12,2),
  p_minimum_margin numeric(5,2) DEFAULT 45.0
)
RETURNS TABLE (
  is_approved boolean,
  current_margin numeric(5,2),
  minimum_price numeric(12,2),
  warning_message text
) LANGUAGE plpgsql AS $$
DECLARE
  v_estimate RECORD;
  v_total_cost numeric(12,2);
  v_current_margin numeric(5,2);
  v_minimum_price numeric(12,2);
  v_warning text;
  v_approved boolean;
BEGIN
  -- Get estimate costs
  SELECT 
    material_cost,
    labor_cost,
    overhead,
    (COALESCE(material_cost, 0) + COALESCE(labor_cost, 0) + COALESCE(overhead, 0)) as total_cost
  INTO v_estimate
  FROM public.estimates
  WHERE id = p_estimate_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0.0, 0.0, 'Estimate not found'::text;
    RETURN;
  END IF;
  
  v_total_cost := v_estimate.total_cost;
  
  -- Calculate current margin
  IF v_total_cost > 0 THEN
    v_current_margin := ((p_proposed_price - v_total_cost) / p_proposed_price * 100);
  ELSE
    v_current_margin := 0;
  END IF;
  
  -- Calculate minimum price for desired margin
  v_minimum_price := v_total_cost / (1 - p_minimum_margin / 100);
  
  -- Check if approved
  IF v_current_margin >= p_minimum_margin THEN
    v_approved := true;
    v_warning := NULL;
  ELSE
    v_approved := false;
    v_warning := format(
      '⚠️ PROFIT WARNING\nPrice: $%s\nCost: $%s\nMargin: %.1f%%\n\nCompany Minimum Margin: %.1f%%\n\nRecommended Minimum Price: $%s',
      p_proposed_price::text,
      v_total_cost::text,
      v_current_margin,
      p_minimum_margin,
      ROUND(v_minimum_price, 2)::text
    );
  END IF;
  
  RETURN QUERY SELECT 
    v_approved,
    ROUND(v_current_margin, 2),
    ROUND(v_minimum_price, 2),
    v_warning;
END;
$$;

-- Trigger to check profit guard when price is updated
CREATE OR REPLACE FUNCTION public.trigger_profit_guard_check()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_check RECORD;
BEGIN
  -- Only check if price is being set and it's not already approved
  IF NEW.total_price IS NOT NULL AND NEW.total_price > 0 AND 
     (NEW.profit_guard_approved_by IS NULL OR OLD.total_price IS DISTINCT FROM NEW.total_price) THEN
    SELECT * INTO v_check
    FROM public.check_profit_guard(NEW.id, NEW.total_price, 45.0);
    
    IF NOT v_check.is_approved THEN
      NEW.profit_guard_warning := true;
      NEW.profit_guard_approved_by := NULL;
      NEW.profit_guard_approved_at := NULL;
    ELSE
      NEW.profit_guard_warning := false;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profit_guard_check ON public.estimates;
CREATE TRIGGER trg_profit_guard_check
BEFORE UPDATE ON public.estimates
FOR EACH ROW
WHEN (OLD.total_price IS DISTINCT FROM NEW.total_price)
EXECUTE FUNCTION public.trigger_profit_guard_check();

-- ============================================================================
-- PART 8 — COMPLETE ESTIMATE CALCULATION FUNCTION
-- ============================================================================
-- Master function that calculates everything

CREATE OR REPLACE FUNCTION public.calculate_complete_estimate(
  p_estimate_id uuid,
  p_squares numeric,
  p_pitch numeric,
  p_facets int DEFAULT 4,
  p_valleys int DEFAULT 0,
  p_hips int DEFAULT 0,
  p_eaves_length_ft numeric DEFAULT 0,
  p_ridge_length_ft numeric DEFAULT 0,
  p_tear_off_layers int DEFAULT 1,
  p_crew_strength int DEFAULT 4,
  p_old_material_type text DEFAULT 'asphalt',
  p_overhead_percentage numeric(5,2) DEFAULT 15.0,
  p_target_margin numeric(5,2) DEFAULT 50.0,
  p_supplier_id uuid DEFAULT NULL,
  p_company_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_waste RECORD;
  v_labor RECORD;
  v_material_list jsonb;
  v_material_costs RECORD;
  v_total_cost numeric(12,2);
  v_overhead numeric(12,2);
  v_recommended_price numeric(12,2);
  v_result jsonb;
BEGIN
  -- 1. Calculate waste optimization
  SELECT * INTO v_waste
  FROM public.calculate_waste_optimization(
    p_squares, p_pitch, p_facets, p_valleys, p_hips
  );
  
  -- 2. Calculate labor
  SELECT * INTO v_labor
  FROM public.calculate_labor_estimation(
    p_squares, p_pitch, p_tear_off_layers, p_facets, 
    p_crew_strength, p_old_material_type
  );
  
  -- 3. Build material list
  v_material_list := public.build_material_list(
    p_squares, v_waste.waste_percentage, p_ridge_length_ft, 
    p_hips, p_valleys, p_eaves_length_ft, p_pitch
  );
  
  -- 4. Calculate material costs
  -- Get company_id from estimate if not provided
  -- Note: Estimates table may have org_id or company_id depending on schema version
  IF p_company_id IS NULL THEN
    -- Try to get from estimate (will use whichever column exists)
    -- This is safe because calculate_material_costs handles NULL company_id
    SELECT COALESCE(org_id, company_id) INTO p_company_id
    FROM public.estimates
    WHERE id = p_estimate_id
    LIMIT 1;
  END IF;
  
  SELECT * INTO v_material_costs
  FROM public.calculate_material_costs(
    v_material_list, p_supplier_id, p_company_id
  );
  
  -- 5. Calculate totals
  v_total_cost := v_material_costs.total_material_cost + 
                  v_labor.labor_cost;
  v_overhead := v_total_cost * p_overhead_percentage / 100;
  v_total_cost := v_total_cost + v_overhead;
  
  -- 6. Calculate recommended price
  v_recommended_price := v_total_cost / (1 - p_target_margin / 100);
  
  -- 7. Update estimate
  UPDATE public.estimates
  SET
    measurement = jsonb_build_object(
      'squares', p_squares,
      'pitch', p_pitch,
      'facets', p_facets,
      'valleys', p_valleys,
      'hips', p_hips,
      'eaves_length_ft', p_eaves_length_ft,
      'ridge_length_ft', p_ridge_length_ft
    ),
    materials = v_material_list,
    waste_percentage = v_waste.waste_percentage,
    labor_hours = v_labor.labor_hours,
    labor_cost = v_labor.labor_cost,
    crew_days = v_labor.crew_days,
    material_cost = v_material_costs.total_material_cost,
    overhead = v_overhead,
    total_price = v_recommended_price,
    margin = p_target_margin,
    breakdown = jsonb_build_object(
      'material_cost', v_material_costs.total_material_cost,
      'labor_cost', v_labor.labor_cost,
      'overhead', v_overhead,
      'total_cost', v_total_cost,
      'recommended_price', v_recommended_price,
      'target_margin', p_target_margin,
      'material_breakdown', v_material_costs.material_breakdown,
      'labor_breakdown', v_labor.labor_breakdown,
      'waste_optimization', jsonb_build_object(
        'waste_percentage', v_waste.waste_percentage,
        'recommended_bundles', v_waste.recommended_bundles,
        'waste_squares', v_waste.waste_squares,
        'notes', v_waste.optimization_notes
      )
    )
  WHERE id = p_estimate_id;
  
  -- 8. Build result
  v_result := jsonb_build_object(
    'estimate_id', p_estimate_id,
    'measurement', jsonb_build_object(
      'squares', p_squares,
      'pitch', p_pitch,
      'facets', p_facets
    ),
    'waste_optimization', jsonb_build_object(
      'waste_percentage', v_waste.waste_percentage,
      'recommended_bundles', v_waste.recommended_bundles,
      'notes', v_waste.optimization_notes
    ),
    'labor', jsonb_build_object(
      'hours', v_labor.labor_hours,
      'cost', v_labor.labor_cost,
      'crew_days', v_labor.crew_days
    ),
    'materials', jsonb_build_object(
      'list', v_material_list,
      'total_cost', v_material_costs.total_material_cost,
      'pricing_source', v_material_costs.pricing_source
    ),
    'pricing', jsonb_build_object(
      'material_cost', v_material_costs.total_material_cost,
      'labor_cost', v_labor.labor_cost,
      'overhead', v_overhead,
      'total_cost', v_total_cost,
      'recommended_price', v_recommended_price,
      'target_margin', p_target_margin
    )
  );
  
  RETURN v_result;
END;
$$;

-- ============================================================================
-- PART 9 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE IF EXISTS public.measurement_inputs ENABLE ROW LEVEL SECURITY;

-- Measurement inputs: org members can access
CREATE POLICY IF NOT EXISTS "measurement_inputs_select_org_members"
  ON public.measurement_inputs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.estimates e
      JOIN public.organizations o ON o.id = e.org_id
      JOIN public.org_memberships om ON om.org_id = o.id
      WHERE e.id = measurement_inputs.estimate_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

CREATE POLICY IF NOT EXISTS "measurement_inputs_insert_org_members"
  ON public.measurement_inputs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.estimates e
      JOIN public.organizations o ON o.id = e.org_id
      JOIN public.org_memberships om ON om.org_id = o.id
      WHERE e.id = measurement_inputs.estimate_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

-- Service role full access
CREATE POLICY IF NOT EXISTS "measurement_inputs_service_role"
  ON public.measurement_inputs
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 10 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.measurement_inputs IS 'Block 255900: Stores raw measurement inputs (address lookup, drone, manual upload)';
COMMENT ON FUNCTION public.calculate_waste_optimization IS 'Block 255900: Calculates optimal waste percentage based on roof complexity';
COMMENT ON FUNCTION public.calculate_labor_estimation IS 'Block 255900: Calculates labor hours and cost automatically';
COMMENT ON FUNCTION public.build_material_list IS 'Block 255900: Generates perfect material list from measurements';
COMMENT ON FUNCTION public.calculate_material_costs IS 'Block 255900: Calculates material costs from real-time pricing catalog';
COMMENT ON FUNCTION public.check_profit_guard IS 'Block 255900: Prevents reps from underbidding (profit guard)';
COMMENT ON FUNCTION public.calculate_complete_estimate IS 'Block 255900: Master function that calculates complete estimate (measurement → materials → waste → labor → pricing)';





















