-- =========================================================
-- Block 21080 — SmartSend Scope Comparison Engine v2
-- (Insurance Scope vs SmartSend AI Estimate vs Real Market Pricing • Underpayment Engine • Carrier Bias Detection)
-- =========================================================
--
-- This block transforms SmartSend into something INSURANCE ADJUSTERS fear and roofing companies love.
--
-- Features:
-- 1. Three-Way Price Comparison (Insurance vs SmartSend vs Market)
-- 2. Per-Line-Item Price Comparison
-- 3. Underpayment Engine (Detailed Breakdown)
-- 4. Carrier Bias Detection (Pattern Recognition)
-- 5. Human-Friendly Output Generation
-- =========================================================

-- ============================================================================
-- PART 1 — Extend scope_comparisons with Market Pricing Fields
-- ============================================================================

ALTER TABLE IF EXISTS public.scope_comparisons
  -- Market Pricing Summary
  ADD COLUMN IF NOT EXISTS market_price_total numeric(12,2),
  ADD COLUMN IF NOT EXISTS market_rcv numeric(12,2),
  
  -- Three-Way Comparison Totals
  ADD COLUMN IF NOT EXISTS difference_insurance_vs_smartsend numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS difference_insurance_vs_market numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS difference_smartsend_vs_market numeric(12,2) DEFAULT 0,
  
  -- Underpayment Breakdown (Detailed)
  ADD COLUMN IF NOT EXISTS missing_items_total numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS underpriced_items_total numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quantity_errors_total numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS o_and_p_missing_total numeric(12,2) DEFAULT 0,
  
  -- Three-Way Line Item Comparison (JSONB)
  ADD COLUMN IF NOT EXISTS line_item_comparisons jsonb DEFAULT '[]'::jsonb,
  -- Format: [
  --   {
  --     "normalized_category": "steep_charge",
  --     "description": "Steep charge",
  --     "insurance_price": 0,
  --     "smartsend_price": 1400,
  --     "market_price": 1250,
  --     "difference_insurance_vs_smartsend": 1400,
  --     "difference_insurance_vs_market": 1250,
  --     "difference_smartsend_vs_market": 150,
  --     "qty": 32,
  --     "unit": "SQ",
  --     "underpayment": 1400
  --   }
  -- ]
  
  -- Human-Friendly Summary (JSONB)
  ADD COLUMN IF NOT EXISTS human_friendly_summary jsonb DEFAULT '{}'::jsonb,
  -- Format: {
  --   "insurance_rcv": 18200,
  --   "smartsend_estimate": 22680,
  --   "market_value": 21950,
  --   "insurance_underpayment": 4480,
  --   "supplement_opportunity": 7590,
  --   "where_insurance_missed": [
  --     "Missing steep charge",
  --     "Missing drip edge",
  --     "Missing ice & water shield",
  --     "Underpriced ridge cap",
  --     "Underpriced shingle install labor",
  --     "O&P not included",
  --     "Wrong LF measurement for ridge"
  --   ]
  -- }
  
  -- Carrier Bias Detection Results (JSONB)
  ADD COLUMN IF NOT EXISTS carrier_bias_detected jsonb DEFAULT '{}'::jsonb;
  -- Format: {
  --   "carrier_name": "State Farm",
  --   "average_underpayment": 4850,
  --   "bias_patterns": [
  --     {
  --       "line_item": "steep_charge",
  --       "omission_rate": 0.82,
  --       "description": "Steep charges omitted in 82% of claims"
  --     },
  --     {
  --       "line_item": "drip_edge",
  --       "omission_rate": 0.65,
  --       "description": "Drip edge omitted in 65% of claims"
  --     }
  --   ]
  -- }

CREATE INDEX IF NOT EXISTS idx_scope_comparisons_market_price ON public.scope_comparisons(market_price_total) WHERE market_price_total IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scope_comparisons_line_items ON public.scope_comparisons USING GIN(line_item_comparisons);
CREATE INDEX IF NOT EXISTS idx_scope_comparisons_carrier_bias ON public.scope_comparisons USING GIN(carrier_bias_detected);

COMMENT ON COLUMN public.scope_comparisons.market_price_total IS 'Total market value based on market_pricing_dataset';
COMMENT ON COLUMN public.scope_comparisons.line_item_comparisons IS 'Three-way price comparison per normalized line item';
COMMENT ON COLUMN public.scope_comparisons.human_friendly_summary IS 'Human-readable summary for roofers showing where insurance missed money';

-- ============================================================================
-- PART 2 — Carrier Bias Detection Table
-- ============================================================================
-- Tracks patterns of underpayment by carrier and line item

CREATE TABLE IF NOT EXISTS public.carrier_bias_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_name text NOT NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Line Item Bias
  normalized_category text NOT NULL, -- e.g., "steep_charge", "drip_edge", "ice_water"
  
  -- Statistics
  total_claims_analyzed integer DEFAULT 0,
  times_item_missing integer DEFAULT 0,
  times_item_underpriced integer DEFAULT 0,
  times_item_correct integer DEFAULT 0,
  
  -- Rates (0.0 to 1.0)
  omission_rate numeric(5,4) DEFAULT 0.0, -- times_item_missing / total_claims_analyzed
  underpricing_rate numeric(5,4) DEFAULT 0.0, -- times_item_underpriced / total_claims_analyzed
  
  -- Average Underpayment
  avg_underpayment_when_missing numeric(12,2) DEFAULT 0,
  avg_underpayment_when_underpriced numeric(12,2) DEFAULT 0,
  
  -- Regional Bias (optional)
  region text, -- e.g., "TX", "FL", "CO"
  zip_code_prefix text, -- First 3 digits for regional analysis
  
  -- Metadata
  last_analyzed_at timestamptz DEFAULT now(),
  is_active boolean DEFAULT true,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(carrier_name, normalized_category, workspace_id, COALESCE(region, ''))
);

CREATE INDEX IF NOT EXISTS idx_carrier_bias_carrier ON public.carrier_bias_patterns(carrier_name, is_active);
CREATE INDEX IF NOT EXISTS idx_carrier_bias_category ON public.carrier_bias_patterns(normalized_category);
CREATE INDEX IF NOT EXISTS idx_carrier_bias_workspace ON public.carrier_bias_patterns(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_carrier_bias_omission_rate ON public.carrier_bias_patterns(omission_rate DESC) WHERE omission_rate > 0.5;

COMMENT ON TABLE public.carrier_bias_patterns IS 'Tracks carrier-specific patterns of underpayment by line item';
COMMENT ON COLUMN public.carrier_bias_patterns.omission_rate IS 'Rate at which carrier omits this line item (0.0 to 1.0)';

-- ============================================================================
-- PART 3 — Function: Perform Three-Way Line Item Comparison
-- ============================================================================

CREATE OR REPLACE FUNCTION public.compare_line_items_three_way(
  p_insurance_line_items jsonb,
  p_smartsend_line_items jsonb,
  p_market_pricing jsonb,
  p_roof_scope jsonb,
  p_carrier_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_result jsonb := '[]'::jsonb;
  v_item jsonb;
  v_normalized_category text;
  v_insurance_item jsonb;
  v_smartsend_item jsonb;
  v_market_price numeric;
  v_insurance_price numeric := 0;
  v_smartsend_price numeric := 0;
  v_qty numeric;
  v_unit text;
  v_comparison jsonb;
  v_squares numeric;
BEGIN
  -- Get roof squares for calculations
  v_squares := COALESCE((p_roof_scope->>'total_squares')::numeric, 0);
  
  -- Normalize insurance line items using carrier mappings
  -- This is simplified - in production would use normalize_line_items function
  
  -- Compare each normalized category
  FOR v_normalized_category IN SELECT DISTINCT unnest(ARRAY[
    'steep_charge',
    'drip_edge',
    'ice_water',
    'ridge_vent',
    'ridge_cap',
    'starter_course',
    'shingle_labor',
    'tear_off',
    'decking',
    'underlayment'
  ])
  LOOP
    -- Find insurance item for this category
    v_insurance_item := NULL;
    v_smartsend_item := NULL;
    
    -- Search insurance items (simplified - would use proper normalization)
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_insurance_line_items)
    LOOP
      -- Check if item matches category (simplified matching)
      IF LOWER(COALESCE(v_item->>'description', '')) LIKE '%' || LOWER(v_normalized_category) || '%' THEN
        v_insurance_item := v_item;
        EXIT;
      END IF;
    END LOOP;
    
    -- Search SmartSend items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_smartsend_line_items)
    LOOP
      IF LOWER(COALESCE(v_item->>'category', '')) = LOWER(v_normalized_category) THEN
        v_smartsend_item := v_item;
        EXIT;
      END IF;
    END LOOP;
    
    -- Get market price for this category
    v_market_price := CASE v_normalized_category
      WHEN 'steep_charge' THEN (p_market_pricing->>'steep_charge_per_sq_avg')::numeric * v_squares
      WHEN 'drip_edge' THEN (p_market_pricing->>'drip_edge_per_ft')::numeric * COALESCE((p_roof_scope->>'perimeter_ft')::numeric, SQRT(v_squares * 100) * 4)
      WHEN 'ice_water' THEN (p_market_pricing->>'ice_and_water_shield_per_sq')::numeric * COALESCE((p_roof_scope->>'ice_water_squares')::numeric, 3.0)
      WHEN 'ridge_vent' THEN (p_market_pricing->>'ridge_vent_per_ft_avg')::numeric * COALESCE((p_roof_scope->>'ridge_length_ft')::numeric, SQRT(v_squares * 100) * 1.2)
      WHEN 'starter_course' THEN (p_market_pricing->>'starter_per_ft')::numeric * COALESCE((p_roof_scope->>'perimeter_ft')::numeric, SQRT(v_squares * 100) * 4)
      WHEN 'shingle_labor' THEN (p_market_pricing->>'asphalt_shingle_install_avg')::numeric * v_squares
      ELSE 0
    END;
    
    -- Extract prices
    IF v_insurance_item IS NOT NULL THEN
      v_insurance_price := COALESCE((v_insurance_item->>'total')::numeric, (v_insurance_item->>'unit_price')::numeric * COALESCE((v_insurance_item->>'qty')::numeric, 1), 0);
    END IF;
    
    IF v_smartsend_item IS NOT NULL THEN
      v_smartsend_price := COALESCE((v_smartsend_item->>'total_cost')::numeric, (v_smartsend_item->>'unit_cost')::numeric * COALESCE((v_smartsend_item->>'quantity')::numeric, 1), 0);
    END IF;
    
    -- Build comparison object
    v_comparison := jsonb_build_object(
      'normalized_category', v_normalized_category,
      'description', COALESCE(v_insurance_item->>'description', v_smartsend_item->>'description', v_normalized_category),
      'insurance_price', v_insurance_price,
      'smartsend_price', v_smartsend_price,
      'market_price', v_market_price,
      'difference_insurance_vs_smartsend', v_smartsend_price - v_insurance_price,
      'difference_insurance_vs_market', v_market_price - v_insurance_price,
      'difference_smartsend_vs_market', v_smartsend_price - v_market_price,
      'qty', COALESCE((v_insurance_item->>'qty')::numeric, (v_smartsend_item->>'quantity')::numeric, 0),
      'unit', COALESCE(v_insurance_item->>'unit', v_smartsend_item->>'unit', 'each'),
      'underpayment', GREATEST(v_smartsend_price - v_insurance_price, v_market_price - v_insurance_price, 0)
    );
    
    -- Only add if there's a meaningful comparison
    IF v_insurance_price > 0 OR v_smartsend_price > 0 OR v_market_price > 0 THEN
      v_result := v_result || jsonb_build_array(v_comparison);
    END IF;
  END LOOP;
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.compare_line_items_three_way IS 'Performs three-way price comparison per normalized line item (Insurance vs SmartSend vs Market)';

-- ============================================================================
-- PART 4 — Function: Calculate Underpayment Breakdown
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_underpayment_breakdown(
  p_line_item_comparisons jsonb,
  p_o_and_p_missing_value numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_result jsonb;
  v_missing_items_total numeric := 0;
  v_underpriced_items_total numeric := 0;
  v_quantity_errors_total numeric := 0;
  v_item jsonb;
  v_insurance_price numeric;
  v_smartsend_price numeric;
  v_market_price numeric;
BEGIN
  -- Calculate totals from line item comparisons
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_line_item_comparisons)
  LOOP
    v_insurance_price := COALESCE((v_item->>'insurance_price')::numeric, 0);
    v_smartsend_price := COALESCE((v_item->>'smartsend_price')::numeric, 0);
    v_market_price := COALESCE((v_item->>'market_price')::numeric, 0);
    
    -- Missing items (insurance price is 0 but SmartSend/Market has value)
    IF v_insurance_price = 0 AND (v_smartsend_price > 0 OR v_market_price > 0) THEN
      v_missing_items_total := v_missing_items_total + GREATEST(v_smartsend_price, v_market_price);
    END IF;
    
    -- Underpriced items (insurance price > 0 but significantly lower)
    IF v_insurance_price > 0 AND v_insurance_price < GREATEST(v_smartsend_price, v_market_price) * 0.9 THEN
      v_underpriced_items_total := v_underpriced_items_total + (GREATEST(v_smartsend_price, v_market_price) - v_insurance_price);
    END IF;
    
    -- Quantity errors (would need more sophisticated detection)
    -- For now, estimate based on price differences
    IF v_insurance_price > 0 AND v_smartsend_price > 0 AND ABS(v_smartsend_price - v_insurance_price) > v_insurance_price * 0.15 THEN
      v_quantity_errors_total := v_quantity_errors_total + ABS(v_smartsend_price - v_insurance_price) * 0.3; -- Estimate 30% is quantity error
    END IF;
  END LOOP;
  
  v_result := jsonb_build_object(
    'missing_items_total', v_missing_items_total,
    'underpriced_items_total', v_underpriced_items_total,
    'quantity_errors_total', v_quantity_errors_total,
    'o_and_p_missing_total', p_o_and_p_missing_value,
    'total_underpayment', v_missing_items_total + v_underpriced_items_total + v_quantity_errors_total + p_o_and_p_missing_value
  );
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.calculate_underpayment_breakdown IS 'Calculates detailed underpayment breakdown: missing items, underpricing, quantity errors, O&P';

-- ============================================================================
-- PART 5 — Function: Detect Carrier Bias Patterns
-- ============================================================================

CREATE OR REPLACE FUNCTION public.detect_carrier_bias(
  p_carrier_name text,
  p_line_item_comparisons jsonb,
  p_workspace_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  v_bias_patterns jsonb := '[]'::jsonb;
  v_item jsonb;
  v_normalized_category text;
  v_omission_rate numeric;
  v_avg_underpayment numeric;
  v_pattern jsonb;
  v_bias_record record;
BEGIN
  IF p_carrier_name IS NULL THEN
    RETURN jsonb_build_object('carrier_name', NULL, 'bias_patterns', '[]'::jsonb);
  END IF;
  
  -- Analyze each line item for bias patterns
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_line_item_comparisons)
  LOOP
    v_normalized_category := v_item->>'normalized_category';
    v_omission_rate := NULL;
    v_avg_underpayment := COALESCE((v_item->>'underpayment')::numeric, 0);
    
    -- Check existing bias patterns for this carrier and category
    SELECT 
      omission_rate,
      avg_underpayment_when_missing
    INTO v_bias_record
    FROM public.carrier_bias_patterns
    WHERE carrier_name = p_carrier_name
      AND normalized_category = v_normalized_category
      AND (workspace_id = p_workspace_id OR workspace_id IS NULL)
      AND is_active = true
    ORDER BY workspace_id NULLS LAST
    LIMIT 1;
    
    -- If pattern exists, use it; otherwise estimate from current comparison
    IF v_bias_record IS NOT NULL THEN
      v_omission_rate := v_bias_record.omission_rate;
      IF v_avg_underpayment = 0 THEN
        v_avg_underpayment := COALESCE(v_bias_record.avg_underpayment_when_missing, 0);
      END IF;
    ELSE
      -- Estimate omission rate from current comparison (insurance price = 0)
      IF COALESCE((v_item->>'insurance_price')::numeric, 0) = 0 THEN
        v_omission_rate := 1.0; -- This claim omits it
      ELSE
        v_omission_rate := 0.0; -- This claim includes it
      END IF;
    END IF;
    
    -- Only add pattern if there's significant bias (omission rate > 0.5 or underpayment > 0)
    IF (v_omission_rate IS NOT NULL AND v_omission_rate > 0.5) OR v_avg_underpayment > 0 THEN
      v_pattern := jsonb_build_object(
        'line_item', v_normalized_category,
        'omission_rate', COALESCE(v_omission_rate, 0),
        'avg_underpayment', v_avg_underpayment,
        'description', format('%s %s in %.0f%% of claims', 
          v_normalized_category,
          CASE WHEN v_omission_rate > 0.5 THEN 'omitted' ELSE 'underpriced' END,
          COALESCE(v_omission_rate, 0) * 100
        )
      );
      v_bias_patterns := v_bias_patterns || jsonb_build_array(v_pattern);
    END IF;
  END LOOP;
  
  -- Calculate average underpayment
  SELECT COALESCE(AVG(underpayment_amount), 0)
  INTO v_avg_underpayment
  FROM public.scope_comparisons sc
  JOIN public.inbox_threads t ON t.id = sc.thread_id
  WHERE t.insurance_carrier = p_carrier_name
    AND sc.underpayment_amount > 0
    AND (p_workspace_id IS NULL OR t.workspace_id = p_workspace_id);
  
  v_result := jsonb_build_object(
    'carrier_name', p_carrier_name,
    'average_underpayment', v_avg_underpayment,
    'bias_patterns', v_bias_patterns
  );
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.detect_carrier_bias IS 'Detects carrier-specific bias patterns from line item comparisons';

-- ============================================================================
-- PART 6 — Function: Update Carrier Bias Patterns (Called after each comparison)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_carrier_bias_patterns(
  p_carrier_name text,
  p_line_item_comparisons jsonb,
  p_workspace_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item jsonb;
  v_normalized_category text;
  v_insurance_price numeric;
  v_underpayment numeric;
  v_is_missing boolean;
  v_is_underpriced boolean;
  v_existing record;
BEGIN
  IF p_carrier_name IS NULL THEN
    RETURN;
  END IF;
  
  -- Update bias patterns for each line item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_line_item_comparisons)
  LOOP
    v_normalized_category := v_item->>'normalized_category';
    v_insurance_price := COALESCE((v_item->>'insurance_price')::numeric, 0);
    v_underpayment := COALESCE((v_item->>'underpayment')::numeric, 0);
    v_is_missing := v_insurance_price = 0 AND v_underpayment > 0;
    v_is_underpriced := v_insurance_price > 0 AND v_underpayment > 0;
    
    -- Get or create bias pattern record
    SELECT * INTO v_existing
    FROM public.carrier_bias_patterns
    WHERE carrier_name = p_carrier_name
      AND normalized_category = v_normalized_category
      AND (workspace_id = p_workspace_id OR (workspace_id IS NULL AND p_workspace_id IS NULL))
      AND (region IS NULL)
    LIMIT 1;
    
    IF v_existing IS NULL THEN
      -- Create new pattern
      INSERT INTO public.carrier_bias_patterns (
        carrier_name,
        workspace_id,
        normalized_category,
        total_claims_analyzed,
        times_item_missing,
        times_item_underpriced,
        times_item_correct,
        omission_rate,
        underpricing_rate,
        avg_underpayment_when_missing,
        avg_underpayment_when_underpriced
      ) VALUES (
        p_carrier_name,
        p_workspace_id,
        v_normalized_category,
        1,
        CASE WHEN v_is_missing THEN 1 ELSE 0 END,
        CASE WHEN v_is_underpriced THEN 1 ELSE 0 END,
        CASE WHEN NOT v_is_missing AND NOT v_is_underpriced THEN 1 ELSE 0 END,
        CASE WHEN v_is_missing THEN 1.0 ELSE 0.0 END,
        CASE WHEN v_is_underpriced THEN 1.0 ELSE 0.0 END,
        CASE WHEN v_is_missing THEN v_underpayment ELSE 0 END,
        CASE WHEN v_is_underpriced THEN v_underpayment ELSE 0 END
      );
    ELSE
      -- Update existing pattern
      UPDATE public.carrier_bias_patterns
      SET
        total_claims_analyzed = total_claims_analyzed + 1,
        times_item_missing = times_item_missing + CASE WHEN v_is_missing THEN 1 ELSE 0 END,
        times_item_underpriced = times_item_underpriced + CASE WHEN v_is_underpriced THEN 1 ELSE 0 END,
        times_item_correct = times_item_correct + CASE WHEN NOT v_is_missing AND NOT v_is_underpriced THEN 1 ELSE 0 END,
        omission_rate = (times_item_missing + CASE WHEN v_is_missing THEN 1 ELSE 0 END)::numeric / (total_claims_analyzed + 1),
        underpricing_rate = (times_item_underpriced + CASE WHEN v_is_underpriced THEN 1 ELSE 0 END)::numeric / (total_claims_analyzed + 1),
        avg_underpayment_when_missing = CASE 
          WHEN v_is_missing THEN 
            (avg_underpayment_when_missing * times_item_missing + v_underpayment) / (times_item_missing + 1)
          ELSE avg_underpayment_when_missing
        END,
        avg_underpayment_when_underpriced = CASE
          WHEN v_is_underpriced THEN
            (avg_underpayment_when_underpriced * times_item_underpriced + v_underpayment) / (times_item_underpriced + 1)
          ELSE avg_underpayment_when_underpriced
        END,
        last_analyzed_at = now(),
        updated_at = now()
      WHERE id = v_existing.id;
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.update_carrier_bias_patterns IS 'Updates carrier bias pattern statistics after each scope comparison';

-- ============================================================================
-- PART 7 — Function: Generate Human-Friendly Summary
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_human_friendly_summary(
  p_insurance_rcv numeric,
  p_smartsend_estimate numeric,
  p_market_value numeric,
  p_line_item_comparisons jsonb,
  p_o_and_p_missing_value numeric DEFAULT 0,
  p_missing_items_total numeric DEFAULT 0,
  p_underpriced_items_total numeric DEFAULT 0,
  p_quantity_errors_total numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_result jsonb;
  v_where_missed text[] := '{}'::text[];
  v_item jsonb;
  v_total_underpayment numeric;
  v_total_supplement numeric;
BEGIN
  -- Calculate totals
  v_total_underpayment := p_smartsend_estimate - COALESCE(p_insurance_rcv, 0);
  v_total_supplement := p_missing_items_total + p_underpriced_items_total + p_quantity_errors_total + p_o_and_p_missing_value;
  
  -- Build "where insurance missed money" list
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_line_item_comparisons)
  LOOP
    IF COALESCE((v_item->>'insurance_price')::numeric, 0) = 0 AND COALESCE((v_item->>'underpayment')::numeric, 0) > 0 THEN
      v_where_missed := v_where_missed || format('Missing %s', v_item->>'normalized_category');
    ELSIF COALESCE((v_item->>'difference_insurance_vs_smartsend')::numeric, 0) > COALESCE((v_item->>'insurance_price')::numeric, 0) * 0.1 THEN
      v_where_missed := v_where_missed || format('Underpriced %s', v_item->>'normalized_category');
    END IF;
  END LOOP;
  
  -- Add O&P if missing
  IF p_o_and_p_missing_value > 0 THEN
    v_where_missed := v_where_missed || 'O&P not included';
  END IF;
  
  v_result := jsonb_build_object(
    'insurance_rcv', p_insurance_rcv,
    'smartsend_estimate', p_smartsend_estimate,
    'market_value', p_market_value,
    'insurance_underpayment', v_total_underpayment,
    'supplement_opportunity', v_total_supplement,
    'where_insurance_missed', v_where_missed
  );
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.generate_human_friendly_summary IS 'Generates human-readable summary showing where insurance missed money';

-- ============================================================================
-- PART 8 — Enhanced Comparison Function (Main Engine)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.compare_insurance_vs_smartsend_vs_market_v2(
  p_thread_id uuid,
  p_insurance_attachment_id uuid,
  p_roof_estimate_id uuid DEFAULT NULL,
  p_carrier_name text DEFAULT NULL,
  p_zip_code text DEFAULT NULL,
  p_workspace_id uuid DEFAULT NULL
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
  v_market_pricing jsonb;
  v_market_price_total numeric;
  v_line_item_comparisons jsonb;
  v_underpayment_breakdown jsonb;
  v_carrier_bias jsonb;
  v_human_summary jsonb;
  v_insurance_line_items jsonb;
  v_smartsend_line_items jsonb;
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
  v_insurance_line_items := COALESCE(v_insurance_scope->'line_items', '[]'::jsonb);
  
  -- Get SmartSend estimate
  IF p_roof_estimate_id IS NOT NULL THEN
    SELECT final_bid_price, line_items INTO v_smartsend_estimate_total, v_smartsend_line_items
    FROM public.roof_estimates re
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object(
        'category', category,
        'description', description,
        'quantity', quantity,
        'unit', unit,
        'unit_cost', unit_cost,
        'total_cost', total_cost
      )) as line_items
      FROM public.roof_estimate_line_items
      WHERE roof_estimate_id = re.id
    ) li ON true
    WHERE re.id = p_roof_estimate_id;
  ELSE
    v_smartsend_estimate_total := COALESCE(v_insurance_rcv * 1.15, 0);
    v_smartsend_line_items := '[]'::jsonb;
  END IF;
  
  -- Get market pricing
  v_market_pricing := public.get_market_pricing(p_zip_code, p_workspace_id);
  
  -- Calculate market price total (simplified - would use full scope)
  v_market_price_total := COALESCE(
    (v_market_pricing->>'asphalt_shingle_install_avg')::numeric * COALESCE((v_insurance_scope->>'total_squares')::numeric, 0),
    0
  );
  
  -- Perform three-way line item comparison
  v_line_item_comparisons := public.compare_line_items_three_way(
    v_insurance_line_items,
    v_smartsend_line_items,
    v_market_pricing,
    v_insurance_scope,
    p_carrier_name
  );
  
  -- Calculate underpayment breakdown
  v_underpayment_breakdown := public.calculate_underpayment_breakdown(
    v_line_item_comparisons,
    COALESCE((v_insurance_financials->>'o_and_p_missing_value')::numeric, 0)
  );
  
  -- Detect carrier bias
  v_carrier_bias := public.detect_carrier_bias(
    p_carrier_name,
    v_line_item_comparisons,
    p_workspace_id
  );
  
  -- Generate human-friendly summary
  v_human_summary := public.generate_human_friendly_summary(
    v_insurance_rcv,
    v_smartsend_estimate_total,
    v_market_price_total,
    v_line_item_comparisons,
    (v_underpayment_breakdown->>'o_and_p_missing_total')::numeric,
    (v_underpayment_breakdown->>'missing_items_total')::numeric,
    (v_underpayment_breakdown->>'underpriced_items_total')::numeric,
    (v_underpayment_breakdown->>'quantity_errors_total')::numeric
  );
  
  -- Update or insert comparison record
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
    market_price_total,
    market_rcv,
    rcv_difference,
    difference_insurance_vs_smartsend,
    difference_insurance_vs_market,
    difference_smartsend_vs_market,
    underpayment_amount,
    missing_items_total,
    underpriced_items_total,
    quantity_errors_total,
    o_and_p_missing_total,
    line_item_comparisons,
    human_friendly_summary,
    carrier_bias_detected,
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
    v_market_price_total,
    v_market_price_total,
    v_smartsend_estimate_total - COALESCE(v_insurance_rcv, 0),
    v_smartsend_estimate_total - COALESCE(v_insurance_rcv, 0),
    v_market_price_total - COALESCE(v_insurance_rcv, 0),
    v_smartsend_estimate_total - v_market_price_total,
    (v_underpayment_breakdown->>'total_underpayment')::numeric,
    (v_underpayment_breakdown->>'missing_items_total')::numeric,
    (v_underpayment_breakdown->>'underpriced_items_total')::numeric,
    (v_underpayment_breakdown->>'quantity_errors_total')::numeric,
    (v_underpayment_breakdown->>'o_and_p_missing_total')::numeric,
    v_line_item_comparisons,
    v_human_summary,
    v_carrier_bias,
    'completed'
  )
  ON CONFLICT (thread_id, insurance_attachment_id)
  DO UPDATE SET
    market_price_total = EXCLUDED.market_price_total,
    market_rcv = EXCLUDED.market_rcv,
    difference_insurance_vs_smartsend = EXCLUDED.difference_insurance_vs_smartsend,
    difference_insurance_vs_market = EXCLUDED.difference_insurance_vs_market,
    difference_smartsend_vs_market = EXCLUDED.difference_smartsend_vs_market,
    missing_items_total = EXCLUDED.missing_items_total,
    underpriced_items_total = EXCLUDED.underpriced_items_total,
    quantity_errors_total = EXCLUDED.quantity_errors_total,
    o_and_p_missing_total = EXCLUDED.o_and_p_missing_total,
    line_item_comparisons = EXCLUDED.line_item_comparisons,
    human_friendly_summary = EXCLUDED.human_friendly_summary,
    carrier_bias_detected = EXCLUDED.carrier_bias_detected,
    updated_at = now()
  RETURNING id INTO v_comparison_id;
  
  -- Update carrier bias patterns
  PERFORM public.update_carrier_bias_patterns(
    p_carrier_name,
    v_line_item_comparisons,
    p_workspace_id
  );
  
  RETURN v_comparison_id;
END;
$$;

COMMENT ON FUNCTION public.compare_insurance_vs_smartsend_vs_market_v2 IS 'Block 21080: Enhanced comparison engine with three-way pricing and carrier bias detection';

-- ============================================================================
-- PART 9 — RLS Policies for Carrier Bias Patterns
-- ============================================================================

ALTER TABLE public.carrier_bias_patterns ENABLE ROW LEVEL SECURITY;

-- Users can view bias patterns in their workspace
CREATE POLICY "Users can view carrier bias patterns in their workspace"
  ON public.carrier_bias_patterns FOR SELECT
  USING (
    workspace_id IN (
      SELECT campaign_id FROM public.campaigns WHERE owner_id = auth.uid()
    )
    OR workspace_id IS NULL -- Global patterns
  );

-- Service role full access
CREATE POLICY "Service role full access carrier bias"
  ON public.carrier_bias_patterns
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- PART 10 — Comments
-- ============================================================================

COMMENT ON TABLE public.carrier_bias_patterns IS 'Block 21080: Tracks carrier-specific patterns of underpayment by line item';
COMMENT ON FUNCTION public.compare_insurance_vs_smartsend_vs_market_v2 IS 'Block 21080: Main comparison engine with three-way pricing (Insurance vs SmartSend vs Market)';
















































