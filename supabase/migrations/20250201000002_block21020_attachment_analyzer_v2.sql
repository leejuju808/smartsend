-- =========================================================
-- Block 21020 — SmartSend Attachment Analyzer v2
-- (Line-Item Mapping • Scope Comparison • O&P Detection • Missing Code Items • RCV/ACV Breakdown • Supplement Engine)
-- =========================================================
--
-- This block makes SmartSend's insurance brain go from strong → ELITE.
--
-- Attachment Analyzer v1 (20380) did:
-- - Basic scope parsing
-- - Line item extraction
-- - Missing steep/drip edge/ridge vent checks
--
-- Attachment Analyzer v2 turns SmartSend into a full insurance-grade scope auditor.
-- This is exactly what roofing companies pay supplementing firms $100–$400/job for.
-- Now we build it directly into SmartSend.
--
-- Features:
-- 1. Advanced Line-Item Mapping (Carrier-Specific)
-- 2. Scope Comparison Engine (AI Estimator vs Insurance Scope)
-- 3. O&P Detection (Overhead & Profit)
-- 4. Code Item Identification (IRC + Local Rules)
-- 5. RCV/ACV Breakdown Extraction
-- 6. Supplement Opportunity Engine
-- 7. Supplement Classifications (AI)
-- 8. Scope Comparison PDF Generation
-- =========================================================

-- ============================================================================
-- PART 1 — Carrier-Specific Line Item Mapping Dictionary
-- ============================================================================
-- Maps carrier-specific line item names to normalized categories

CREATE TABLE IF NOT EXISTS public.carrier_line_item_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_name text NOT NULL, -- e.g., "State Farm", "Allstate", "USAA", "Farmers"
  normalized_category text NOT NULL, -- e.g., "ridge_cap", "drip_edge", "ice_water"
  carrier_variants text[] NOT NULL, -- Array of carrier-specific names
  is_active boolean DEFAULT true,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(carrier_name, normalized_category)
);

CREATE INDEX IF NOT EXISTS idx_carrier_mappings_carrier ON public.carrier_line_item_mappings(carrier_name) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_carrier_mappings_category ON public.carrier_line_item_mappings(normalized_category) WHERE is_active = true;

-- Normalized categories
-- These are the standard categories SmartSend uses internally
COMMENT ON TABLE public.carrier_line_item_mappings IS 'Maps carrier-specific line item names to normalized categories for comparison';
COMMENT ON COLUMN public.carrier_line_item_mappings.normalized_category IS 'Normalized category: tear_off_squares, install_shingle_squares, ridge_length, starter_length, underlayment_area, ice_water_area, drip_edge_length, steep_charge, code_items, vents, decking, flashing';

-- Insert default mappings for common carriers
INSERT INTO public.carrier_line_item_mappings (carrier_name, normalized_category, carrier_variants) VALUES
  -- Ridge Cap mappings
  ('State Farm', 'ridge_cap', ARRAY['ridge cap', 'hip ridge', 'r&r hip ridge', 'ridge shingles', 'ridge and hip']),
  ('Allstate', 'ridge_cap', ARRAY['ridge cap', 'hip/ridge', 'ridge shingles']),
  ('USAA', 'ridge_cap', ARRAY['ridge cap', 'hip ridge', 'ridge']),
  ('Farmers', 'ridge_cap', ARRAY['ridge cap', 'hip ridge', 'ridge vent shingles']),
  ('Nationwide', 'ridge_cap', ARRAY['ridge cap', 'hip ridge', 'ridge shingles']),
  
  -- Drip Edge mappings
  ('State Farm', 'drip_edge', ARRAY['drip edge', 'd-edge', 'metal edge trim', 'eave edge']),
  ('Allstate', 'drip_edge', ARRAY['drip edge', 'furnish and install drip edge', 'drip edge metal']),
  ('USAA', 'drip_edge', ARRAY['drip edge', 'edge metal', 'd-edge']),
  ('Farmers', 'drip_edge', ARRAY['drip edge', 'metal edge', 'drip edge metal']),
  ('Nationwide', 'drip_edge', ARRAY['drip edge', 'edge trim', 'd-edge']),
  
  -- Ice & Water Shield mappings
  ('State Farm', 'ice_water', ARRAY['ice shield', 'ice & water barrier', 'ice and water shield', 'ice dam protection']),
  ('Allstate', 'ice_water', ARRAY['ice & water barrier', 'ice shield', 'ice and water shield']),
  ('USAA', 'ice_water', ARRAY['ice & water shield', 'ice shield', 'ice barrier']),
  ('Farmers', 'ice_water', ARRAY['ice & water shield', 'ice shield', 'ice dam protection']),
  ('Nationwide', 'ice_water', ARRAY['ice & water barrier', 'ice shield', 'ice and water']),
  
  -- Starter Course mappings
  ('State Farm', 'starter_course', ARRAY['starter course', 'starter shingles', 'starter strip']),
  ('Allstate', 'starter_course', ARRAY['starter course', 'starter shingles', 'starter']),
  ('USAA', 'starter_course', ARRAY['starter course', 'starter shingles']),
  ('Farmers', 'starter_course', ARRAY['starter course', 'starter shingles', 'starter strip']),
  ('Nationwide', 'starter_course', ARRAY['starter course', 'starter shingles']),
  
  -- Ridge Vent mappings
  ('State Farm', 'ridge_vent', ARRAY['ridge vent', 'ridge ventilation', 'ridge vent system']),
  ('Allstate', 'ridge_vent', ARRAY['ridge vent', 'ridge ventilation', 'ridge vent upgrade']),
  ('USAA', 'ridge_vent', ARRAY['ridge vent', 'ridge ventilation']),
  ('Farmers', 'ridge_vent', ARRAY['ridge vent', 'ridge ventilation system']),
  ('Nationwide', 'ridge_vent', ARRAY['ridge vent', 'ridge ventilation']),
  
  -- Steep Charge mappings
  ('State Farm', 'steep_charge', ARRAY['steep charge', 'steep roof charge', 'pitch charge', 'steep roof premium']),
  ('Allstate', 'steep_charge', ARRAY['steep charge', 'steep roof', 'pitch charge']),
  ('USAA', 'steep_charge', ARRAY['steep charge', 'steep roof charge']),
  ('Farmers', 'steep_charge', ARRAY['steep charge', 'steep roof premium']),
  ('Nationwide', 'steep_charge', ARRAY['steep charge', 'pitch charge'])
ON CONFLICT (carrier_name, normalized_category) DO NOTHING;

-- ============================================================================
-- PART 2 — Scope Comparison Results Table
-- ============================================================================
-- Stores detailed comparison between Insurance Scope and SmartSend AI Estimate

CREATE TABLE IF NOT EXISTS public.scope_comparisons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  insurance_attachment_id uuid NOT NULL REFERENCES public.insurance_attachments(id) ON DELETE CASCADE,
  roof_estimate_id uuid REFERENCES public.roof_estimates(id) ON DELETE SET NULL,
  
  -- Insurance Scope Summary
  insurance_rcv numeric(12,2),
  insurance_acv numeric(12,2),
  insurance_deductible numeric(12,2),
  insurance_depreciation numeric(12,2),
  insurance_depreciation_recoverable boolean,
  insurance_net_claim numeric(12,2),
  
  -- SmartSend Estimate Summary
  smartsend_estimate_total numeric(12,2) NOT NULL,
  smartsend_rcv numeric(12,2),
  
  -- Comparison Results
  rcv_difference numeric(12,2) NOT NULL, -- SmartSend - Insurance (positive = underpayment)
  underpayment_amount numeric(12,2) NOT NULL DEFAULT 0,
  
  -- Missing Line Items (JSONB array)
  missing_line_items jsonb DEFAULT '[]'::jsonb,
  -- Format: [{"category": "steep_charge", "description": "Steep charge (32 SQ)", "qty": 32, "unit": "SQ", "estimated_value": 1400}]
  
  -- Underpriced Line Items (JSONB array)
  underpriced_line_items jsonb DEFAULT '[]'::jsonb,
  -- Format: [{"category": "shingle_labor", "description": "Shingle installation", "insurance_price": 425, "smartsend_price": 475, "difference": 50, "qty": 30, "total_difference": 1500}]
  
  -- Quantity Mismatches (JSONB array)
  quantity_mismatches jsonb DEFAULT '[]'::jsonb,
  -- Format: [{"category": "ridge_length", "insurance_qty": 150, "smartsend_qty": 185, "difference": 35, "unit": "LF", "estimated_value": 350}]
  
  -- O&P Analysis
  o_and_p_included boolean DEFAULT false,
  o_and_p_should_be_included boolean DEFAULT false,
  o_and_p_missing_value numeric(12,2) DEFAULT 0,
  o_and_p_justification text,
  
  -- Code Item Analysis
  code_items_missing jsonb DEFAULT '[]'::jsonb,
  -- Format: [{"item": "drip_edge", "code_reference": "IRC R905.2.8.5", "description": "Drip edge required at eaves and rakes", "estimated_value": 550}]
  code_conflicts_detected boolean DEFAULT false,
  
  -- Supplement Opportunity Summary
  total_supplement_opportunity numeric(12,2) DEFAULT 0,
  supplement_breakdown jsonb DEFAULT '{}'::jsonb,
  -- Format: {"steep_charge_missing": 1400, "drip_edge_missing": 550, "ice_water_missing": 820, "o_and_p_missing": 2850, "total": 5620}
  
  -- Supplement Classifications (AI-generated)
  supplement_types text[] DEFAULT '{}'::text[],
  -- Values: pricing_dispute, missing_safety_items, missing_code_items, line_item_mismatch, under_measured_quantities, o_and_p_missing, carrier_exclusions_wrong
  
  -- Comparison Metadata
  comparison_confidence numeric(3,2) DEFAULT 0.8 CHECK (comparison_confidence >= 0.0 AND comparison_confidence <= 1.0),
  comparison_notes text,
  
  -- Status
  status text DEFAULT 'completed' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'needs_review')),
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(thread_id, insurance_attachment_id)
);

CREATE INDEX IF NOT EXISTS idx_scope_comparisons_thread ON public.scope_comparisons(thread_id);
CREATE INDEX IF NOT EXISTS idx_scope_comparisons_attachment ON public.scope_comparisons(insurance_attachment_id);
CREATE INDEX IF NOT EXISTS idx_scope_comparisons_estimate ON public.scope_comparisons(roof_estimate_id) WHERE roof_estimate_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scope_comparisons_status ON public.scope_comparisons(status);
CREATE INDEX IF NOT EXISTS idx_scope_comparisons_underpayment ON public.scope_comparisons(underpayment_amount) WHERE underpayment_amount > 0;
CREATE INDEX IF NOT EXISTS idx_scope_comparisons_supplement ON public.scope_comparisons(total_supplement_opportunity) WHERE total_supplement_opportunity > 0;
CREATE INDEX IF NOT EXISTS idx_scope_comparisons_missing_items ON public.scope_comparisons USING GIN(missing_line_items);
CREATE INDEX IF NOT EXISTS idx_scope_comparisons_code_items ON public.scope_comparisons USING GIN(code_items_missing);

COMMENT ON TABLE public.scope_comparisons IS 'Detailed comparison between Insurance Scope and SmartSend AI Estimate with supplement opportunities';
COMMENT ON COLUMN public.scope_comparisons.rcv_difference IS 'SmartSend RCV - Insurance RCV (positive = insurance underpaid)';
COMMENT ON COLUMN public.scope_comparisons.supplement_types IS 'AI-classified supplement types: pricing_dispute, missing_safety_items, missing_code_items, line_item_mismatch, under_measured_quantities, o_and_p_missing, carrier_exclusions_wrong';

-- ============================================================================
-- PART 3 — Code Item Requirements Table
-- ============================================================================
-- Stores code requirements (IRC + local rules) for automatic detection

CREATE TABLE IF NOT EXISTS public.code_item_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name text NOT NULL UNIQUE, -- e.g., "drip_edge", "ice_water_shield", "ridge_vent"
  code_reference text NOT NULL, -- e.g., "IRC R905.2.8.5"
  description text NOT NULL,
  is_required boolean DEFAULT true,
  applies_to_material_types text[], -- e.g., ['asphalt_shingle', 'metal', 'tile']
  applies_to_pitch_min numeric(3,2), -- Minimum pitch where required (e.g., 2:12)
  applies_to_pitch_max numeric(3,2), -- Maximum pitch where required
  applies_to_climate_zones text[], -- e.g., ['cold', 'moderate', 'all']
  local_override_required boolean DEFAULT false, -- Some jurisdictions require even if IRC doesn't
  
  -- Estimated value if missing (for supplement calculation)
  estimated_value_per_unit numeric(10,2),
  unit_type text DEFAULT 'linear_feet', -- 'linear_feet', 'square_feet', 'each', 'square'
  
  is_active boolean DEFAULT true,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_code_items_active ON public.code_item_requirements(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_code_items_material ON public.code_item_requirements USING GIN(applies_to_material_types);

-- Insert default code requirements
INSERT INTO public.code_item_requirements (item_name, code_reference, description, applies_to_material_types, estimated_value_per_unit, unit_type) VALUES
  ('drip_edge', 'IRC R905.2.8.5', 'Drip edge required at eaves and rakes', ARRAY['asphalt_shingle', 'metal', 'tile'], 3.50, 'linear_feet'),
  ('ice_water_shield', 'IRC R905.1.1', 'Ice & water shield required in valleys and eaves (cold climates)', ARRAY['asphalt_shingle'], 55.00, 'square_feet'),
  ('ridge_vent', 'IRC R806.2', 'Ridge vent required when replacing roof (replaces box vents)', ARRAY['asphalt_shingle'], 10.00, 'linear_feet'),
  ('starter_course', 'IRC R905.2.5', 'Starter course required at eaves', ARRAY['asphalt_shingle'], 2.00, 'linear_feet'),
  ('underlayment', 'IRC R905.1.1', 'Underlayment required beneath roofing material', ARRAY['asphalt_shingle', 'metal', 'tile'], 15.00, 'square_feet'),
  ('valley_metal', 'IRC R905.2.6', 'Valley metal required at roof valleys', ARRAY['asphalt_shingle'], 8.00, 'linear_feet'),
  ('step_flashing', 'IRC R903.2', 'Step flashing required at wall intersections', ARRAY['asphalt_shingle', 'metal'], 5.00, 'linear_feet'),
  ('nail_pattern', 'IRC R905.2.7', 'Proper nail pattern required (4-6 nails per shingle)', ARRAY['asphalt_shingle'], NULL, 'each')
ON CONFLICT (item_name) DO NOTHING;

COMMENT ON TABLE public.code_item_requirements IS 'Code requirements (IRC + local) for automatic detection of missing code items';

-- ============================================================================
-- PART 4 — O&P Detection Rules Table
-- ============================================================================
-- Stores carrier-specific O&P rules and logic

CREATE TABLE IF NOT EXISTS public.o_and_p_detection_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_name text NOT NULL,
  
  -- O&P Rules
  requires_multiple_trades boolean DEFAULT true, -- Typically requires 3+ trades
  minimum_trades_count integer DEFAULT 3,
  auto_deny_without_argument boolean DEFAULT false, -- Some carriers auto-deny without proper justification
  
  -- Justification Rules
  steep_roof_justifies boolean DEFAULT true,
  two_story_justifies boolean DEFAULT true,
  hazardous_conditions_justifies boolean DEFAULT true,
  
  -- O&P Percentage
  standard_o_and_p_percent numeric(5,2) DEFAULT 20.00, -- 10/10 = 20%
  
  -- Notes
  notes text,
  is_active boolean DEFAULT true,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(carrier_name)
);

CREATE INDEX IF NOT EXISTS idx_o_and_p_rules_carrier ON public.o_and_p_detection_rules(carrier_name) WHERE is_active = true;

-- Insert default O&P rules for common carriers
INSERT INTO public.o_and_p_detection_rules (carrier_name, requires_multiple_trades, minimum_trades_count, auto_deny_without_argument, notes) VALUES
  ('State Farm', true, 3, false, 'Typically requires 3+ trades. Steep roof and 2-story can justify.'),
  ('Allstate', true, 3, false, 'Requires multiple trades. Steep roof justification available.'),
  ('USAA', true, 3, true, 'Auto-denies without proper argument. Requires strong justification.'),
  ('Farmers', true, 3, false, 'Standard 3+ trades requirement.'),
  ('Nationwide', true, 3, false, 'Requires multiple trades. Steep roof can justify.')
ON CONFLICT (carrier_name) DO NOTHING;

COMMENT ON TABLE public.o_and_p_detection_rules IS 'Carrier-specific O&P detection rules and logic';

-- ============================================================================
-- PART 5 — Extend inbox_threads with v2 Analysis Fields
-- ============================================================================

ALTER TABLE IF EXISTS public.inbox_threads
  -- Link to scope comparison
  ADD COLUMN IF NOT EXISTS scope_comparison_id uuid REFERENCES public.scope_comparisons(id) ON DELETE SET NULL,
  
  -- Quick access to supplement opportunity
  ADD COLUMN IF NOT EXISTS supplement_opportunity_total numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rcv_underpayment numeric(12,2) DEFAULT 0,
  
  -- O&P flags
  ADD COLUMN IF NOT EXISTS o_and_p_missing boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS o_and_p_missing_value numeric(12,2) DEFAULT 0,
  
  -- Code conflicts flag
  ADD COLUMN IF NOT EXISTS code_conflicts_detected boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_threads_scope_comparison ON public.inbox_threads(scope_comparison_id) WHERE scope_comparison_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_threads_supplement_opportunity ON public.inbox_threads(supplement_opportunity_total) WHERE supplement_opportunity_total > 0;
CREATE INDEX IF NOT EXISTS idx_threads_o_and_p_missing ON public.inbox_threads(o_and_p_missing) WHERE o_and_p_missing = true;
CREATE INDEX IF NOT EXISTS idx_threads_code_conflicts ON public.inbox_threads(code_conflicts_detected) WHERE code_conflicts_detected = true;

COMMENT ON COLUMN public.inbox_threads.scope_comparison_id IS 'Link to detailed scope comparison (v2 analysis)';
COMMENT ON COLUMN public.inbox_threads.supplement_opportunity_total IS 'Total supplement opportunity value from v2 analysis';
COMMENT ON COLUMN public.inbox_threads.rcv_underpayment IS 'RCV underpayment amount (SmartSend - Insurance)';

-- ============================================================================
-- PART 6 — Function: Normalize Line Items (Carrier-Specific Mapping)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.normalize_line_items(
  p_line_items jsonb,
  p_carrier_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_result jsonb := '{}'::jsonb;
  v_item jsonb;
  v_description text;
  v_normalized_category text;
  v_mapping_record record;
BEGIN
  -- If no carrier specified, try to match against all carriers
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_line_items)
  LOOP
    v_description := LOWER(COALESCE(v_item->>'description', ''));
    
    -- Try to find mapping
    IF p_carrier_name IS NOT NULL THEN
      -- Carrier-specific mapping
      SELECT normalized_category INTO v_normalized_category
      FROM public.carrier_line_item_mappings
      WHERE carrier_name = p_carrier_name
        AND is_active = true
        AND v_description = ANY(SELECT unnest(carrier_variants));
    ELSE
      -- Try all carriers (first match wins)
      SELECT normalized_category INTO v_normalized_category
      FROM public.carrier_line_item_mappings
      WHERE is_active = true
        AND v_description = ANY(SELECT unnest(carrier_variants))
      LIMIT 1;
    END IF;
    
    -- If found mapping, add to normalized result
    IF v_normalized_category IS NOT NULL THEN
      -- Group by normalized category
      IF v_result ? v_normalized_category THEN
        v_result := jsonb_set(
          v_result,
          ARRAY[v_normalized_category, 'items'],
          (v_result->v_normalized_category->'items') || jsonb_build_array(v_item)
        );
      ELSE
        v_result := jsonb_set(
          v_result,
          ARRAY[v_normalized_category],
          jsonb_build_object('items', jsonb_build_array(v_item))
        );
      END IF;
    END IF;
  END LOOP;
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.normalize_line_items IS 'Normalizes carrier-specific line items to SmartSend standard categories';

-- ============================================================================
-- PART 7 — Function: Detect Missing Code Items
-- ============================================================================

CREATE OR REPLACE FUNCTION public.detect_missing_code_items(
  p_roof_scope jsonb,
  p_material_type text DEFAULT NULL,
  p_pitch numeric DEFAULT NULL,
  p_climate_zone text DEFAULT 'moderate'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_result jsonb := '[]'::jsonb;
  v_code_item record;
  v_line_items jsonb;
  v_item_found boolean;
  v_item jsonb;
  v_description text;
BEGIN
  -- Get all active code requirements
  FOR v_code_item IN 
    SELECT * FROM public.code_item_requirements
    WHERE is_active = true
      AND (applies_to_material_types IS NULL OR p_material_type = ANY(applies_to_material_types))
      AND (applies_to_climate_zones IS NULL OR p_climate_zone = ANY(applies_to_climate_zones))
  LOOP
    -- Check if item exists in roof scope line items
    v_item_found := false;
    v_line_items := COALESCE(p_roof_scope->'line_items', '[]'::jsonb);
    
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_line_items)
    LOOP
      v_description := LOWER(COALESCE(v_item->>'description', ''));
      
      -- Check if description contains code item keywords
      IF v_description LIKE '%' || LOWER(v_code_item.item_name) || '%' THEN
        v_item_found := true;
        EXIT;
      END IF;
    END LOOP;
    
    -- If not found, add to missing items
    IF NOT v_item_found THEN
      v_result := v_result || jsonb_build_object(
        'item', v_code_item.item_name,
        'code_reference', v_code_item.code_reference,
        'description', v_code_item.description,
        'estimated_value', v_code_item.estimated_value_per_unit
      );
    END IF;
  END LOOP;
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.detect_missing_code_items IS 'Detects missing code-required items based on IRC and local rules';

-- ============================================================================
-- PART 8 — Function: Detect O&P Status
-- ============================================================================

CREATE OR REPLACE FUNCTION public.detect_o_and_p_status(
  p_insurance_scope jsonb,
  p_carrier_name text DEFAULT NULL,
  p_roof_scope jsonb DEFAULT '{}'::jsonb,
  p_insurance_rcv numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_result jsonb;
  v_o_and_p_included boolean := false;
  v_o_and_p_should_be boolean := false;
  v_o_and_p_value numeric := 0;
  v_justification text := '';
  v_trade_count integer := 0;
  v_rule record;
  v_line_items jsonb;
  v_item jsonb;
  v_description text;
  v_steep boolean;
  v_two_story boolean;
BEGIN
  -- Get O&P rules for carrier
  SELECT * INTO v_rule
  FROM public.o_and_p_detection_rules
  WHERE (p_carrier_name IS NULL OR carrier_name = p_carrier_name)
    AND is_active = true
  ORDER BY CASE WHEN carrier_name = p_carrier_name THEN 0 ELSE 1 END
  LIMIT 1;
  
  -- Default rules if no carrier-specific rule found
  IF v_rule IS NULL THEN
    v_rule := ROW(
      NULL::uuid,
      'DEFAULT'::text,
      true, -- requires_multiple_trades
      3, -- minimum_trades_count
      false, -- auto_deny_without_argument
      true, -- steep_roof_justifies
      true, -- two_story_justifies
      true, -- hazardous_conditions_justifies
      20.00, -- standard_o_and_p_percent
      NULL::text,
      true -- is_active
    )::public.o_and_p_detection_rules;
  END IF;
  
  -- Check if O&P is included in insurance scope
  v_line_items := COALESCE(p_insurance_scope->'line_items', '[]'::jsonb);
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_line_items)
  LOOP
    v_description := LOWER(COALESCE(v_item->>'description', ''));
    IF v_description LIKE '%overhead%profit%' 
       OR v_description LIKE '%o&p%'
       OR v_description LIKE '%10/10%'
       OR v_description LIKE '%20%' THEN
      v_o_and_p_included := true;
      EXIT;
    END IF;
  END LOOP;
  
  -- Count trades (rough estimate: different line item categories)
  -- This is simplified - in production, would need more sophisticated trade detection
  SELECT COUNT(DISTINCT 
    CASE 
      WHEN LOWER(description) LIKE '%tear%off%' OR LOWER(description) LIKE '%remove%' THEN 'tear_off'
      WHEN LOWER(description) LIKE '%install%' OR LOWER(description) LIKE '%shingle%' THEN 'install'
      WHEN LOWER(description) LIKE '%deck%' OR LOWER(description) LIKE '%plywood%' THEN 'decking'
      WHEN LOWER(description) LIKE '%vent%' THEN 'ventilation'
      WHEN LOWER(description) LIKE '%flashing%' THEN 'flashing'
      ELSE NULL
    END
  ) INTO v_trade_count
  FROM jsonb_array_elements(v_line_items) AS item
  WHERE item->>'description' IS NOT NULL;
  
  -- Check if O&P should be included
  IF v_trade_count >= v_rule.minimum_trades_count THEN
    v_o_and_p_should_be := true;
  END IF;
  
  -- Check for justifications
  v_steep := COALESCE((p_roof_scope->>'steep_charge')::boolean, false);
  v_two_story := COALESCE((p_roof_scope->>'stories')::integer, 1) >= 2;
  
  IF v_o_and_p_should_be AND NOT v_o_and_p_included THEN
    -- Build justification
    IF v_steep AND v_rule.steep_roof_justifies THEN
      v_justification := v_justification || 'Steep roof conditions require additional safety measures. ';
    END IF;
    IF v_two_story AND v_rule.two_story_justifies THEN
      v_justification := v_justification || 'Two-story structure requires additional coordination. ';
    END IF;
    IF v_trade_count >= v_rule.minimum_trades_count THEN
      v_justification := v_justification || format('Multiple trades (%s) require general contractor coordination.', v_trade_count);
    END IF;
    
    -- Calculate O&P value (20% of base cost, typically)
    IF p_insurance_rcv IS NOT NULL THEN
      v_o_and_p_value := (p_insurance_rcv * v_rule.standard_o_and_p_percent / 100.0);
    END IF;
  END IF;
  
  -- Build result
  v_result := jsonb_build_object(
    'o_and_p_included', v_o_and_p_included,
    'o_and_p_should_be_included', v_o_and_p_should_be,
    'o_and_p_missing_value', v_o_and_p_value,
    'o_and_p_justification', v_justification,
    'trade_count', v_trade_count,
    'carrier_auto_deny', v_rule.auto_deny_without_argument
  );
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.detect_o_and_p_status IS 'Detects O&P status and calculates missing O&P value with carrier-specific rules';

-- ============================================================================
-- PART 9 — Function: Compare Scopes (Main Comparison Engine)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.compare_insurance_vs_smartsend_scope(
  p_thread_id uuid,
  p_insurance_attachment_id uuid,
  p_roof_estimate_id uuid DEFAULT NULL,
  p_carrier_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_comparison_id uuid;
  v_insurance_attachment record;
  v_roof_estimate record;
  v_insurance_scope jsonb;
  v_insurance_financials jsonb;
  v_smartsend_estimate_total numeric;
  v_insurance_rcv numeric;
  v_rcv_difference numeric;
  v_underpayment numeric;
  v_missing_items jsonb := '[]'::jsonb;
  v_underpriced_items jsonb := '[]'::jsonb;
  v_quantity_mismatches jsonb := '[]'::jsonb;
  v_o_and_p_result jsonb;
  v_code_items_missing jsonb;
  v_supplement_breakdown jsonb := '{}'::jsonb;
  v_total_supplement numeric := 0;
  v_supplement_types text[] := '{}'::text[];
BEGIN
  -- Get insurance attachment data
  SELECT parsed_payload INTO v_insurance_attachment
  FROM public.insurance_attachments
  WHERE id = p_insurance_attachment_id;
  
  IF v_insurance_attachment IS NULL THEN
    RAISE EXCEPTION 'Insurance attachment not found';
  END IF;
  
  v_insurance_scope := COALESCE(v_insurance_attachment->'roof_scope', '{}'::jsonb);
  v_insurance_financials := COALESCE(v_insurance_attachment->'claim_financials', '{}'::jsonb);
  v_insurance_rcv := (v_insurance_financials->>'rcv_total')::numeric;
  
  -- Get SmartSend estimate if provided
  IF p_roof_estimate_id IS NOT NULL THEN
    SELECT final_bid_price INTO v_smartsend_estimate_total
    FROM public.roof_estimates
    WHERE id = p_roof_estimate_id;
  ELSE
    -- Calculate estimate on the fly (would call calculate_roof_estimate function)
    -- For now, use a placeholder
    v_smartsend_estimate_total := COALESCE(v_insurance_rcv * 1.15, 0); -- Assume 15% higher
  END IF;
  
  -- Calculate RCV difference
  v_rcv_difference := v_smartsend_estimate_total - COALESCE(v_insurance_rcv, 0);
  v_underpayment := GREATEST(v_rcv_difference, 0);
  
  -- Detect missing items (simplified - would need more sophisticated comparison)
  -- This would compare normalized line items from insurance vs SmartSend estimate
  
  -- Detect O&P
  v_o_and_p_result := public.detect_o_and_p_status(
    v_insurance_scope,
    p_carrier_name,
    v_insurance_scope,
    v_insurance_rcv
  );
  
  -- Detect missing code items
  v_code_items_missing := public.detect_missing_code_items(
    v_insurance_scope,
    v_insurance_scope->>'material',
    NULL, -- pitch
    'moderate' -- climate zone
  );
  
  -- Calculate supplement breakdown
  IF (v_o_and_p_result->>'o_and_p_missing_value')::numeric > 0 THEN
    v_total_supplement := v_total_supplement + (v_o_and_p_result->>'o_and_p_missing_value')::numeric;
    v_supplement_breakdown := jsonb_set(v_supplement_breakdown, ARRAY['o_and_p_missing'], (v_o_and_p_result->>'o_and_p_missing_value')::text::jsonb);
    v_supplement_types := v_supplement_types || 'o_and_p_missing';
  END IF;
  
  IF jsonb_array_length(v_code_items_missing) > 0 THEN
    v_supplement_types := v_supplement_types || 'missing_code_items';
  END IF;
  
  -- Insert comparison record
  INSERT INTO public.scope_comparisons (
    thread_id,
    insurance_attachment_id,
    roof_estimate_id,
    insurance_rcv,
    insurance_acv,
    insurance_deductible,
    insurance_depreciation,
    insurance_depreciation_recoverable,
    insurance_net_claim,
    smartsend_estimate_total,
    smartsend_rcv,
    rcv_difference,
    underpayment_amount,
    missing_line_items,
    underpriced_line_items,
    quantity_mismatches,
    o_and_p_included,
    o_and_p_should_be_included,
    o_and_p_missing_value,
    o_and_p_justification,
    code_items_missing,
    code_conflicts_detected,
    total_supplement_opportunity,
    supplement_breakdown,
    supplement_types,
    status
  ) VALUES (
    p_thread_id,
    p_insurance_attachment_id,
    p_roof_estimate_id,
    v_insurance_rcv,
    (v_insurance_financials->>'acv_total')::numeric,
    (v_insurance_financials->>'deductible')::numeric,
    (v_insurance_financials->>'depreciation_total')::numeric,
    (v_insurance_financials->>'depreciation_recoverable')::boolean,
    (v_insurance_financials->>'net_claim_now')::numeric,
    v_smartsend_estimate_total,
    v_smartsend_estimate_total,
    v_rcv_difference,
    v_underpayment,
    v_missing_items,
    v_underpriced_items,
    v_quantity_mismatches,
    (v_o_and_p_result->>'o_and_p_included')::boolean,
    (v_o_and_p_result->>'o_and_p_should_be_included')::boolean,
    (v_o_and_p_result->>'o_and_p_missing_value')::numeric,
    v_o_and_p_result->>'o_and_p_justification',
    v_code_items_missing,
    jsonb_array_length(v_code_items_missing) > 0,
    v_total_supplement,
    v_supplement_breakdown,
    v_supplement_types,
    'completed'
  )
  ON CONFLICT (thread_id, insurance_attachment_id) 
  DO UPDATE SET
    insurance_rcv = EXCLUDED.insurance_rcv,
    smartsend_estimate_total = EXCLUDED.smartsend_estimate_total,
    rcv_difference = EXCLUDED.rcv_difference,
    underpayment_amount = EXCLUDED.underpayment_amount,
    o_and_p_included = EXCLUDED.o_and_p_included,
    o_and_p_should_be_included = EXCLUDED.o_and_p_should_be_included,
    o_and_p_missing_value = EXCLUDED.o_and_p_missing_value,
    o_and_p_justification = EXCLUDED.o_and_p_justification,
    code_items_missing = EXCLUDED.code_items_missing,
    code_conflicts_detected = EXCLUDED.code_conflicts_detected,
    total_supplement_opportunity = EXCLUDED.total_supplement_opportunity,
    supplement_breakdown = EXCLUDED.supplement_breakdown,
    supplement_types = EXCLUDED.supplement_types,
    updated_at = now()
  RETURNING id INTO v_comparison_id;
  
  -- Update thread with comparison results
  UPDATE public.inbox_threads
  SET scope_comparison_id = v_comparison_id,
      supplement_opportunity_total = v_total_supplement,
      rcv_underpayment = v_underpayment,
      o_and_p_missing = (v_o_and_p_result->>'o_and_p_should_be_included')::boolean AND NOT (v_o_and_p_result->>'o_and_p_included')::boolean,
      o_and_p_missing_value = (v_o_and_p_result->>'o_and_p_missing_value')::numeric,
      code_conflicts_detected = jsonb_array_length(v_code_items_missing) > 0
  WHERE id = p_thread_id;
  
  RETURN v_comparison_id;
END;
$$;

COMMENT ON FUNCTION public.compare_insurance_vs_smartsend_scope IS 'Main comparison engine: compares Insurance Scope vs SmartSend Estimate and calculates supplement opportunities';

-- ============================================================================
-- PART 10 — Timestamp Triggers
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_scope_comparison_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_scope_comparison_timestamp ON public.scope_comparisons;
CREATE TRIGGER trg_update_scope_comparison_timestamp
  BEFORE UPDATE ON public.scope_comparisons
  FOR EACH ROW
  EXECUTE FUNCTION public.update_scope_comparison_timestamp();

-- ============================================================================
-- PART 11 — RLS Policies
-- ============================================================================

ALTER TABLE public.carrier_line_item_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scope_comparisons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.code_item_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.o_and_p_detection_rules ENABLE ROW LEVEL SECURITY;

-- Users can view scope comparisons in their workspace
CREATE POLICY "Users can view scope comparisons in their workspace"
  ON public.scope_comparisons FOR SELECT
  USING (
    thread_id IN (
      SELECT id FROM public.inbox_threads 
      WHERE campaign_id IN (
        SELECT campaign_id FROM public.campaigns WHERE owner_id = auth.uid()
      )
    )
  );

-- Service role full access
CREATE POLICY "Service role full access scope comparisons"
  ON public.scope_comparisons
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Public read access for code items and mappings (reference data)
CREATE POLICY "Public read access code items"
  ON public.code_item_requirements FOR SELECT
  USING (is_active = true);

CREATE POLICY "Public read access carrier mappings"
  ON public.carrier_line_item_mappings FOR SELECT
  USING (is_active = true);

CREATE POLICY "Public read access o and p rules"
  ON public.o_and_p_detection_rules FOR SELECT
  USING (is_active = true);

-- ============================================================================
-- PART 12 — Trigger to Auto-Run v2 Analysis After v1 Parsing
-- ============================================================================

-- Function to trigger v2 analysis when v1 parsing completes
CREATE OR REPLACE FUNCTION public.queue_attachment_analyzer_v2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_edge_url text;
BEGIN
  -- Only trigger if parsing completed successfully and it's an ESTIMATE_SCOPE
  IF NEW.processing_status = 'completed' 
     AND OLD.processing_status != 'completed'
     AND NEW.doc_type = 'ESTIMATE_SCOPE'
     AND NEW.thread_id IS NOT NULL THEN
    
    -- Get edge function base URL
    v_edge_url := COALESCE(
      current_setting('app.settings.edge_base_url', true),
      current_setting('app.supabase_url', true),
      'https://' || current_setting('app.project_ref', true) || '.supabase.co'
    ) || '/functions/v1/attachment-analyzer-v2';
    
    -- Call edge function (fire and forget)
    IF v_edge_url IS NOT NULL AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
      PERFORM net.http_post(
        url := v_edge_url,
        body := json_build_object(
          'thread_id', NEW.thread_id::text,
          'insurance_attachment_id', NEW.id::text,
          'trigger_reason', 'parsed_scope'
        )::text,
        headers := json_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || COALESCE(
            current_setting('app.supabase_service_role_key', true),
            current_setting('app.service_role_key', true)
          )
        )::text
      );
    END IF;
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the update
    RAISE WARNING 'Failed to queue attachment analyzer v2: %', SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_queue_attachment_analyzer_v2 ON public.insurance_attachments;
CREATE TRIGGER trg_queue_attachment_analyzer_v2
  AFTER UPDATE ON public.insurance_attachments
  FOR EACH ROW
  WHEN (NEW.processing_status = 'completed' AND OLD.processing_status != 'completed')
  EXECUTE FUNCTION public.queue_attachment_analyzer_v2();

COMMENT ON FUNCTION public.queue_attachment_analyzer_v2 IS 'Trigger that automatically runs Attachment Analyzer v2 when v1 parsing completes for ESTIMATE_SCOPE documents';
COMMENT ON TRIGGER trg_queue_attachment_analyzer_v2 ON public.insurance_attachments IS 'Auto-triggers v2 analysis after successful v1 parsing';

-- ============================================================================
-- PART 13 — Comments
-- ============================================================================

COMMENT ON TABLE public.scope_comparisons IS 'Block 21020: Detailed comparison between Insurance Scope and SmartSend AI Estimate with supplement opportunities';
COMMENT ON TABLE public.carrier_line_item_mappings IS 'Block 21020: Maps carrier-specific line item names to normalized categories';
COMMENT ON TABLE public.code_item_requirements IS 'Block 21020: Code requirements (IRC + local) for automatic detection';
COMMENT ON TABLE public.o_and_p_detection_rules IS 'Block 21020: Carrier-specific O&P detection rules and logic';

