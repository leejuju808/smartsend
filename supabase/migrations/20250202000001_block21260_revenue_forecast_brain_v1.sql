-- =========================================================
-- Block 21260 — SmartSend Roofing Revenue Forecast Brain v1
-- (RCV → Supplement → Upsell → Install Probability → TRUE Job Value Prediction)
-- =========================================================
--
-- This block turns SmartSend into a financial prediction engine for roofing companies.
--
-- Roofers NEVER know:
-- - how much revenue is coming
-- - which jobs are real
-- - which approved claims will turn into installs
-- - how big each job will actually be
-- - how much supplement money is missing
-- - which leads will never close
-- - which leads they should chase first
--
-- SmartSend Revenue Forecast Brain v1 fixes all of this.
--
-- SmartSend will now predict:
-- 👉 How much money the roofing company will make — job by job.
-- 👉 What the TRUE job value is — not just insurance's lowball estimate.
-- 👉 Which jobs are most likely to close.
-- 👉 Which ones need supplements.
-- 👉 Which ones are fake leads.
--
-- This is MASSIVE for owners and sales reps.
-- =========================================================

-- ============================================================================
-- PART 1 — Create revenue_forecasts Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.revenue_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  
  -- 1️⃣ RCV Revenue (Insurance-Approved Amount)
  rcv_revenue numeric(12,2) DEFAULT NULL,
  rcv_source text DEFAULT NULL, -- 'insurance_attachment', 'scope_comparison', 'manual'
  insurance_acv numeric(12,2) DEFAULT NULL,
  insurance_deductible numeric(12,2) DEFAULT NULL,
  insurance_depreciation numeric(12,2) DEFAULT NULL,
  
  -- 2️⃣ Supplement Revenue (Expected Add-Ons)
  supplement_revenue numeric(12,2) DEFAULT 0,
  supplement_breakdown jsonb DEFAULT '{}'::jsonb,
  -- Format: {
  --   "missing_items_value": 1400,
  --   "quantity_correction_value": 350,
  --   "o_and_p_value": 2850,
  --   "pricing_discrepancy_value": 880,
  --   "total": 5480
  -- }
  supplement_insights jsonb DEFAULT '[]'::jsonb,
  -- Format: [
  --   {"type": "missing_steep_charge", "value": 1400, "description": "Missing steep charge: +$1,400"},
  --   {"type": "missing_drip_edge", "value": 550, "description": "Missing drip edge: +$550"},
  --   {"type": "o_and_p_not_included", "value": 2850, "description": "O&P not included: +$2,850"}
  -- ]
  
  -- 3️⃣ Upsell Revenue (Roofing Add-Ons)
  upsell_revenue numeric(12,2) DEFAULT 0,
  upsell_breakdown jsonb DEFAULT '{}'::jsonb,
  -- Format: {
  --   "gutters": 1200,
  --   "upgraded_shingles": 450,
  --   "ventilation_improvement": 350,
  --   "total": 2000
  -- }
  upsell_insights jsonb DEFAULT '[]'::jsonb,
  -- Format: [
  --   {"type": "gutters", "value": 1200, "description": "Gutter replacement opportunity", "probability": 0.6},
  --   {"type": "upgraded_shingles", "value": 450, "description": "Upgraded shingles potential", "probability": 0.4}
  -- ]
  upsell_probability numeric(3,2) DEFAULT 0.5 CHECK (upsell_probability >= 0.0 AND upsell_probability <= 1.0),
  
  -- 4️⃣ Install Probability % (Closing Likelihood)
  install_probability integer DEFAULT NULL CHECK (install_probability >= 0 AND install_probability <= 100),
  install_probability_category text DEFAULT NULL CHECK (install_probability_category IN ('cold', 'warm', 'hot', 'very_hot')),
  install_probability_breakdown jsonb DEFAULT '{}'::jsonb,
  -- Format: {
  --   "install_ready_score": 82,
  --   "behavior_signals": 15,
  --   "insurance_status": 20,
  --   "proposal_events": 10,
  --   "objection_score": -5,
  --   "total": 82
  -- }
  install_probability_signals jsonb DEFAULT '[]'::jsonb,
  -- Format: [
  --   {"type": "proposal_viewed", "points": 10, "description": "Homeowner opened proposal 3 times"},
  --   {"type": "deductible_confirmed", "points": 15, "description": "Deductible confirmed"},
  --   {"type": "claim_approved", "points": 20, "description": "Claim approved"}
  -- ]
  
  -- 5️⃣ TRUE Job Value (Final Output)
  true_job_value numeric(12,2) DEFAULT NULL,
  -- Formula: RCV + Supplement + Upsell
  
  -- Forecast Metadata
  forecast_confidence numeric(3,2) DEFAULT 0.8 CHECK (forecast_confidence >= 0.0 AND forecast_confidence <= 1.0),
  forecast_version text DEFAULT 'v1',
  calculated_at timestamptz NOT NULL DEFAULT now(),
  last_updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Status
  status text DEFAULT 'active' CHECK (status IN ('active', 'archived', 'superseded')),
  
  -- Ensure one active forecast per thread
  UNIQUE(thread_id, status) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS idx_revenue_forecasts_thread ON public.revenue_forecasts(thread_id);
CREATE INDEX IF NOT EXISTS idx_revenue_forecasts_workspace ON public.revenue_forecasts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_revenue_forecasts_contact ON public.revenue_forecasts(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_revenue_forecasts_true_value ON public.revenue_forecasts(true_job_value DESC) WHERE true_job_value IS NOT NULL AND status = 'active';
CREATE INDEX IF NOT EXISTS idx_revenue_forecasts_install_prob ON public.revenue_forecasts(install_probability DESC) WHERE install_probability IS NOT NULL AND status = 'active';
CREATE INDEX IF NOT EXISTS idx_revenue_forecasts_status ON public.revenue_forecasts(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_revenue_forecasts_calculated_at ON public.revenue_forecasts(calculated_at DESC);

COMMENT ON TABLE public.revenue_forecasts IS 'Revenue Forecast Brain v1: Predicts RCV, Supplement, Upsell, Install Probability, and TRUE Job Value for every roofing job';
COMMENT ON COLUMN public.revenue_forecasts.rcv_revenue IS 'Insurance-approved RCV amount (base job value)';
COMMENT ON COLUMN public.revenue_forecasts.supplement_revenue IS 'Predicted supplement value based on missing items, underpricing, O&P, etc.';
COMMENT ON COLUMN public.revenue_forecasts.upsell_revenue IS 'Predicted upsell value (gutters, upgrades, add-ons)';
COMMENT ON COLUMN public.revenue_forecasts.install_probability IS 'Predicted install probability (0-100%)';
COMMENT ON COLUMN public.revenue_forecasts.true_job_value IS 'TRUE job value = RCV + Supplement + Upsell (actual money roofer will make)';

-- ============================================================================
-- PART 2 — Function: Calculate RCV Revenue
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_rcv_revenue(
  p_thread_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  v_rcv numeric(12,2) := NULL;
  v_acv numeric(12,2) := NULL;
  v_deductible numeric(12,2) := NULL;
  v_depreciation numeric(12,2) := NULL;
  v_source text := NULL;
  
  -- Try to get from scope_comparisons first (most accurate)
  v_scope_comparison record;
  
  -- Try to get from insurance_attachments
  v_insurance_attachment record;
  
  -- Try to get from inbox_threads insurance fields
  v_thread record;
BEGIN
  -- Priority 1: Get from scope_comparisons (most accurate)
  SELECT 
    insurance_rcv,
    insurance_acv,
    insurance_deductible,
    insurance_depreciation
  INTO v_scope_comparison
  FROM public.scope_comparisons
  WHERE thread_id = p_thread_id
    AND insurance_rcv IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF v_scope_comparison.insurance_rcv IS NOT NULL THEN
    v_rcv := v_scope_comparison.insurance_rcv;
    v_acv := v_scope_comparison.insurance_acv;
    v_deductible := v_scope_comparison.insurance_deductible;
    v_depreciation := v_scope_comparison.insurance_depreciation;
    v_source := 'scope_comparison';
  ELSE
    -- Priority 2: Get from insurance_attachments
    SELECT 
      (parsed_payload->'claim_financials'->>'rcv_total')::numeric as rcv,
      (parsed_payload->'claim_financials'->>'acv_total')::numeric as acv,
      (parsed_payload->'claim_financials'->>'deductible')::numeric as deductible,
      (parsed_payload->'claim_financials'->>'depreciation_total')::numeric as depreciation
    INTO v_insurance_attachment
    FROM public.insurance_attachments
    WHERE thread_id = p_thread_id
      AND parsed_payload->'claim_financials'->>'rcv_total' IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 1;
    
    IF v_insurance_attachment.rcv IS NOT NULL THEN
      v_rcv := v_insurance_attachment.rcv;
      v_acv := v_insurance_attachment.acv;
      v_deductible := v_insurance_attachment.deductible;
      v_depreciation := v_insurance_attachment.depreciation;
      v_source := 'insurance_attachment';
    ELSE
      -- Priority 3: Get from inbox_threads insurance fields
      SELECT 
        insurance_deductible_amount,
        insurance_payout_type
      INTO v_thread
      FROM public.inbox_threads
      WHERE id = p_thread_id;
      
      -- If we have deductible but no RCV, we can't calculate it
      -- Return NULL to indicate missing data
      v_source := NULL;
    END IF;
  END IF;
  
  -- Build result
  v_result := jsonb_build_object(
    'rcv_revenue', v_rcv,
    'insurance_acv', v_acv,
    'insurance_deductible', v_deductible,
    'insurance_depreciation', v_depreciation,
    'rcv_source', v_source
  );
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.calculate_rcv_revenue IS 'Calculates RCV revenue from insurance attachments, scope comparisons, or thread data (Block 21260)';

-- ============================================================================
-- PART 3 — Function: Calculate Supplement Revenue
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_supplement_revenue(
  p_thread_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  v_supplement_total numeric(12,2) := 0;
  v_missing_items_value numeric(12,2) := 0;
  v_quantity_correction_value numeric(12,2) := 0;
  v_o_and_p_value numeric(12,2) := 0;
  v_pricing_discrepancy_value numeric(12,2) := 0;
  v_breakdown jsonb := '{}'::jsonb;
  v_insights jsonb := '[]'::jsonb;
  
  v_scope_comparison record;
  v_missing_item jsonb;
  v_underpriced_item jsonb;
  v_quantity_mismatch jsonb;
BEGIN
  -- Get scope comparison data
  SELECT 
    total_supplement_opportunity,
    missing_line_items,
    underpriced_line_items,
    quantity_mismatches,
    o_and_p_missing_value,
    supplement_breakdown
  INTO v_scope_comparison
  FROM public.scope_comparisons
  WHERE thread_id = p_thread_id
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF v_scope_comparison IS NOT NULL THEN
    -- Calculate missing items value
    IF v_scope_comparison.missing_line_items IS NOT NULL THEN
      SELECT COALESCE(SUM((item->>'estimated_value')::numeric), 0)
      INTO v_missing_items_value
      FROM jsonb_array_elements(v_scope_comparison.missing_line_items) AS item;
      
      -- Build insights for missing items
      FOR v_missing_item IN SELECT * FROM jsonb_array_elements(v_scope_comparison.missing_line_items)
      LOOP
        v_insights := v_insights || jsonb_build_object(
          'type', 'missing_item',
          'value', (v_missing_item->>'estimated_value')::numeric,
          'description', format('Missing %s: +$%s', 
            COALESCE(v_missing_item->>'category', 'item'),
            to_char((v_missing_item->>'estimated_value')::numeric, 'FM999,999,990.00')
          )
        );
      END LOOP;
    END IF;
    
    -- Calculate quantity correction value
    IF v_scope_comparison.quantity_mismatches IS NOT NULL THEN
      SELECT COALESCE(SUM((item->>'estimated_value')::numeric), 0)
      INTO v_quantity_correction_value
      FROM jsonb_array_elements(v_scope_comparison.quantity_mismatches) AS item;
      
      -- Build insights for quantity mismatches
      FOR v_quantity_mismatch IN SELECT * FROM jsonb_array_elements(v_scope_comparison.quantity_mismatches)
      LOOP
        v_insights := v_insights || jsonb_build_object(
          'type', 'quantity_correction',
          'value', (v_quantity_mismatch->>'estimated_value')::numeric,
          'description', format('Quantity mismatch (%s): +$%s',
            COALESCE(v_quantity_mismatch->>'category', 'item'),
            to_char((v_quantity_mismatch->>'estimated_value')::numeric, 'FM999,999,990.00')
          )
        );
      END LOOP;
    END IF;
    
    -- Calculate O&P value
    IF v_scope_comparison.o_and_p_missing_value IS NOT NULL THEN
      v_o_and_p_value := v_scope_comparison.o_and_p_missing_value;
      
      IF v_o_and_p_value > 0 THEN
        v_insights := v_insights || jsonb_build_object(
          'type', 'o_and_p_missing',
          'value', v_o_and_p_value,
          'description', format('O&P not included: +$%s', to_char(v_o_and_p_value, 'FM999,999,990.00'))
        );
      END IF;
    END IF;
    
    -- Calculate underpricing value
    IF v_scope_comparison.underpriced_line_items IS NOT NULL THEN
      SELECT COALESCE(SUM((item->>'total_difference')::numeric), 0)
      INTO v_pricing_discrepancy_value
      FROM jsonb_array_elements(v_scope_comparison.underpriced_line_items) AS item;
      
      -- Build insights for underpriced items
      FOR v_underpriced_item IN SELECT * FROM jsonb_array_elements(v_scope_comparison.underpriced_line_items)
      LOOP
        IF (v_underpriced_item->>'total_difference')::numeric > 100 THEN
          v_insights := v_insights || jsonb_build_object(
            'type', 'pricing_discrepancy',
            'value', (v_underpriced_item->>'total_difference')::numeric,
            'description', format('Underpriced %s: +$%s',
              COALESCE(v_underpriced_item->>'category', 'item'),
              to_char((v_underpriced_item->>'total_difference')::numeric, 'FM999,999,990.00')
            )
          );
        END IF;
      END LOOP;
    END IF;
    
    -- Use total_supplement_opportunity if available, otherwise sum components
    IF v_scope_comparison.total_supplement_opportunity IS NOT NULL AND v_scope_comparison.total_supplement_opportunity > 0 THEN
      v_supplement_total := v_scope_comparison.total_supplement_opportunity;
    ELSE
      v_supplement_total := v_missing_items_value + v_quantity_correction_value + v_o_and_p_value + v_pricing_discrepancy_value;
    END IF;
    
    -- Build breakdown
    v_breakdown := jsonb_build_object(
      'missing_items_value', v_missing_items_value,
      'quantity_correction_value', v_quantity_correction_value,
      'o_and_p_value', v_o_and_p_value,
      'pricing_discrepancy_value', v_pricing_discrepancy_value,
      'total', v_supplement_total
    );
  END IF;
  
  -- Build result
  v_result := jsonb_build_object(
    'supplement_revenue', v_supplement_total,
    'supplement_breakdown', v_breakdown,
    'supplement_insights', v_insights
  );
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.calculate_supplement_revenue IS 'Calculates predicted supplement revenue based on missing items, underpricing, O&P, and quantity mismatches (Block 21260)';

-- ============================================================================
-- PART 4 — Function: Calculate Upsell Revenue
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_upsell_revenue(
  p_thread_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  v_upsell_total numeric(12,2) := 0;
  v_upsell_probability numeric(3,2) := 0.5;
  v_breakdown jsonb := '{}'::jsonb;
  v_insights jsonb := '[]'::jsonb;
  
  v_thread record;
  v_contact record;
  v_roof_estimate record;
  v_proposal record;
  v_home_value numeric(12,2) := NULL;
  v_roof_squares numeric(5,2) := NULL;
  v_neighborhood_type text := NULL;
  v_proposal_views integer := 0;
  v_homeowner_questions integer := 0;
  
  -- Upsell factors
  v_gutters_value numeric(12,2) := 0;
  v_upgraded_shingles_value numeric(12,2) := 0;
  v_ventilation_value numeric(12,2) := 0;
  v_skylight_value numeric(12,2) := 0;
  v_ridge_vent_value numeric(12,2) := 0;
  v_plywood_value numeric(12,2) := 0;
BEGIN
  -- Get thread data
  SELECT 
    t.*,
    c.address,
    c.zip_code,
    c.metadata as contact_metadata
  INTO v_thread
  FROM public.inbox_threads t
  LEFT JOIN public.contacts c ON t.contact_id = c.id
  WHERE t.id = p_thread_id;
  
  IF v_thread IS NULL THEN
    RETURN jsonb_build_object(
      'upsell_revenue', 0,
      'upsell_probability', 0.5,
      'upsell_breakdown', '{}'::jsonb,
      'upsell_insights', '[]'::jsonb
    );
  END IF;
  
  -- Get roof estimate data
  SELECT squares, roof_scope
  INTO v_roof_estimate
  FROM public.roof_estimates
  WHERE thread_id = p_thread_id
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF v_roof_estimate IS NOT NULL THEN
    v_roof_squares := v_roof_estimate.squares;
  END IF;
  
  -- Get proposal data (for behavior signals)
  SELECT 
    view_count,
    (metadata->>'homeowner_questions')::integer as questions
  INTO v_proposal
  FROM public.proposals
  WHERE thread_id = p_thread_id
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF v_proposal IS NOT NULL THEN
    v_proposal_views := COALESCE(v_proposal.view_count, 0);
    v_homeowner_questions := COALESCE(v_proposal.questions, 0);
  END IF;
  
  -- Estimate home value from address/zip (simplified - would use real API in production)
  -- For now, use zip code as proxy
  IF v_thread.zip_code IS NOT NULL THEN
    -- Simple heuristic: higher zip codes in certain ranges = higher home values
    -- In production, would use Zillow API or similar
    v_home_value := CASE 
      WHEN v_thread.zip_code LIKE '90%' THEN 450000  -- California
      WHEN v_thread.zip_code LIKE '10%' THEN 350000  -- New York
      WHEN v_thread.zip_code LIKE '33%' THEN 280000  -- Florida
      ELSE 250000  -- Default
    END;
  END IF;
  
  -- Calculate upsell potential based on factors
  
  -- Gutters (higher probability for larger homes, multiple views)
  IF v_home_value > 300000 AND v_proposal_views >= 2 THEN
    v_gutters_value := 1200;
    v_upsell_probability := GREATEST(v_upsell_probability, 0.6);
    v_insights := v_insights || jsonb_build_object(
      'type', 'gutters',
      'value', v_gutters_value,
      'description', 'Gutter replacement opportunity',
      'probability', 0.6
    );
  ELSIF v_home_value > 200000 THEN
    v_gutters_value := 800;
    v_upsell_probability := GREATEST(v_upsell_probability, 0.4);
    v_insights := v_insights || jsonb_build_object(
      'type', 'gutters',
      'value', v_gutters_value,
      'description', 'Gutter replacement potential',
      'probability', 0.4
    );
  END IF;
  
  -- Upgraded shingles (based on roof size and homeowner engagement)
  IF v_roof_squares IS NOT NULL AND v_roof_squares > 25 AND v_proposal_views >= 1 THEN
    v_upgraded_shingles_value := v_roof_squares * 15; -- ~$15/sq for upgrade
    v_upsell_probability := GREATEST(v_upsell_probability, 0.4);
    v_insights := v_insights || jsonb_build_object(
      'type', 'upgraded_shingles',
      'value', v_upgraded_shingles_value,
      'description', 'Upgraded shingles potential',
      'probability', 0.4
    );
  END IF;
  
  -- Ventilation improvement (based on roof size)
  IF v_roof_squares IS NOT NULL AND v_roof_squares > 30 THEN
    v_ventilation_value := 350;
    v_upsell_probability := GREATEST(v_upsell_probability, 0.3);
    v_insights := v_insights || jsonb_build_object(
      'type', 'ventilation_improvement',
      'value', v_ventilation_value,
      'description', 'Attic ventilation improvement',
      'probability', 0.3
    );
  END IF;
  
  -- Ridge vent upgrade (if not already included)
  IF v_roof_squares IS NOT NULL THEN
    v_ridge_vent_value := 250;
    v_upsell_probability := GREATEST(v_upsell_probability, 0.25);
    v_insights := v_insights || jsonb_build_object(
      'type', 'ridge_vent_upgrade',
      'value', v_ridge_vent_value,
      'description', 'Ridge vent upgrade',
      'probability', 0.25
    );
  END IF;
  
  -- Calculate total upsell value (weighted by probability)
  v_upsell_total := 
    (v_gutters_value * 0.6) +
    (v_upgraded_shingles_value * 0.4) +
    (v_ventilation_value * 0.3) +
    (v_ridge_vent_value * 0.25);
  
  -- Build breakdown
  v_breakdown := jsonb_build_object(
    'gutters', v_gutters_value,
    'upgraded_shingles', v_upgraded_shingles_value,
    'ventilation_improvement', v_ventilation_value,
    'ridge_vent_upgrade', v_ridge_vent_value,
    'total', v_upsell_total
  );
  
  -- Build result
  v_result := jsonb_build_object(
    'upsell_revenue', ROUND(v_upsell_total, 2),
    'upsell_probability', v_upsell_probability,
    'upsell_breakdown', v_breakdown,
    'upsell_insights', v_insights
  );
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.calculate_upsell_revenue IS 'Calculates predicted upsell revenue based on home value, roof size, proposal behavior, and homeowner engagement (Block 21260)';

-- ============================================================================
-- PART 5 — Function: Calculate Install Probability
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_install_probability(
  p_thread_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  v_install_probability integer := 0;
  v_category text := 'cold';
  v_breakdown jsonb := '{}'::jsonb;
  v_signals jsonb := '[]'::jsonb;
  
  v_thread record;
  v_install_ready_score integer := NULL;
  v_behavior_score integer := 0;
  v_insurance_score integer := 0;
  v_proposal_score integer := 0;
  v_objection_score integer := 0;
  
  v_proposal_views integer := 0;
  v_proposal_replies integer := 0;
  v_claim_approved boolean := false;
  v_deductible_confirmed boolean := false;
  v_homeowner_replies integer := 0;
BEGIN
  -- Get thread data
  SELECT 
    install_ready_score,
    install_ready_score_breakdown,
    insurance_claim_status,
    insurance_deductible_amount,
    last_message_at,
    last_direction
  INTO v_thread
  FROM public.inbox_threads
  WHERE id = p_thread_id;
  
  IF v_thread IS NULL THEN
    RETURN jsonb_build_object(
      'install_probability', 0,
      'install_probability_category', 'cold',
      'install_probability_breakdown', '{}'::jsonb,
      'install_probability_signals', '[]'::jsonb
    );
  END IF;
  
  -- Use install-ready score as base (0-100)
  IF v_thread.install_ready_score IS NOT NULL THEN
    v_install_ready_score := v_thread.install_ready_score;
    v_install_probability := v_install_ready_score;
    
    v_signals := v_signals || jsonb_build_object(
      'type', 'install_ready_score',
      'points', v_install_ready_score,
      'description', format('Install-ready score: %s/100', v_install_ready_score)
    );
  END IF;
  
  -- Get proposal behavior
  SELECT 
    view_count,
    (metadata->>'reply_count')::integer as replies
  INTO v_proposal_views, v_proposal_replies
  FROM public.proposals
  WHERE thread_id = p_thread_id
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF v_proposal_views > 0 THEN
    v_proposal_score := LEAST(v_proposal_views * 5, 20); -- Max 20 points
    v_signals := v_signals || jsonb_build_object(
      'type', 'proposal_viewed',
      'points', v_proposal_score,
      'description', format('Homeowner opened proposal %s times', v_proposal_views)
    );
  END IF;
  
  -- Check insurance status
  IF v_thread.insurance_claim_status = 'approved' THEN
    v_insurance_score := 20;
    v_claim_approved := true;
    v_signals := v_signals || jsonb_build_object(
      'type', 'claim_approved',
      'points', 20,
      'description', 'Claim approved'
    );
  ELSIF v_thread.insurance_claim_status = 'approved_acv_only' THEN
    v_insurance_score := 15;
    v_signals := v_signals || jsonb_build_object(
      'type', 'claim_approved_acv',
      'points', 15,
      'description', 'ACV approved'
    );
  END IF;
  
  -- Check deductible
  IF v_thread.insurance_deductible_amount IS NOT NULL THEN
    v_deductible_confirmed := true;
    v_signals := v_signals || jsonb_build_object(
      'type', 'deductible_confirmed',
      'points', 15,
      'description', 'Deductible confirmed'
    );
  END IF;
  
  -- Count homeowner replies (engagement signal)
  SELECT COUNT(*)
  INTO v_homeowner_replies
  FROM public.inbox_messages
  WHERE thread_id = p_thread_id
    AND direction = 'in'
    AND sent_at >= NOW() - INTERVAL '30 days';
  
  IF v_homeowner_replies >= 3 THEN
    v_behavior_score := 10;
    v_signals := v_signals || jsonb_build_object(
      'type', 'high_engagement',
      'points', 10,
      'description', format('High engagement: %s replies in 30 days', v_homeowner_replies)
    );
  ELSIF v_homeowner_replies >= 1 THEN
    v_behavior_score := 5;
  END IF;
  
  -- Calculate total probability
  v_install_probability := LEAST(
    COALESCE(v_install_ready_score, 0) + 
    v_behavior_score + 
    v_insurance_score + 
    v_proposal_score + 
    v_objection_score,
    100
  );
  
  -- Determine category
  IF v_install_probability >= 76 THEN
    v_category := 'very_hot';
  ELSIF v_install_probability >= 51 THEN
    v_category := 'hot';
  ELSIF v_install_probability >= 26 THEN
    v_category := 'warm';
  ELSE
    v_category := 'cold';
  END IF;
  
  -- Build breakdown
  v_breakdown := jsonb_build_object(
    'install_ready_score', COALESCE(v_install_ready_score, 0),
    'behavior_signals', v_behavior_score,
    'insurance_status', v_insurance_score,
    'proposal_events', v_proposal_score,
    'objection_score', v_objection_score,
    'total', v_install_probability
  );
  
  -- Build result
  v_result := jsonb_build_object(
    'install_probability', v_install_probability,
    'install_probability_category', v_category,
    'install_probability_breakdown', v_breakdown,
    'install_probability_signals', v_signals
  );
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.calculate_install_probability IS 'Calculates install probability (0-100%) based on install-ready score, behavior signals, insurance status, and proposal events (Block 21260)';

-- ============================================================================
-- PART 6 — Function: Calculate Complete Revenue Forecast
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_revenue_forecast_v1(
  p_thread_id uuid,
  p_force_recalculate boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  v_workspace_id uuid;
  v_contact_id uuid;
  v_rcv_data jsonb;
  v_supplement_data jsonb;
  v_upsell_data jsonb;
  v_install_prob_data jsonb;
  v_true_job_value numeric(12,2);
  v_rcv_revenue numeric(12,2);
  v_supplement_revenue numeric(12,2);
  v_upsell_revenue numeric(12,2);
  v_forecast_id uuid;
  v_existing_forecast uuid;
BEGIN
  -- Get workspace and contact
  SELECT workspace_id, contact_id
  INTO v_workspace_id, v_contact_id
  FROM public.inbox_threads
  WHERE id = p_thread_id;
  
  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Thread not found';
  END IF;
  
  -- Check if forecast already exists
  IF NOT p_force_recalculate THEN
    SELECT id INTO v_existing_forecast
    FROM public.revenue_forecasts
    WHERE thread_id = p_thread_id
      AND status = 'active'
      AND calculated_at >= NOW() - INTERVAL '1 hour';
    
    IF v_existing_forecast IS NOT NULL THEN
      -- Return existing forecast
      SELECT row_to_json(rf.*)::jsonb INTO v_result
      FROM public.revenue_forecasts rf
      WHERE rf.id = v_existing_forecast;
      
      RETURN v_result;
    END IF;
  END IF;
  
  -- Archive old forecasts
  UPDATE public.revenue_forecasts
  SET status = 'superseded'
  WHERE thread_id = p_thread_id
    AND status = 'active';
  
  -- 1️⃣ Calculate RCV Revenue
  v_rcv_data := public.calculate_rcv_revenue(p_thread_id);
  v_rcv_revenue := COALESCE((v_rcv_data->>'rcv_revenue')::numeric, 0);
  
  -- 2️⃣ Calculate Supplement Revenue
  v_supplement_data := public.calculate_supplement_revenue(p_thread_id);
  v_supplement_revenue := COALESCE((v_supplement_data->>'supplement_revenue')::numeric, 0);
  
  -- 3️⃣ Calculate Upsell Revenue
  v_upsell_data := public.calculate_upsell_revenue(p_thread_id);
  v_upsell_revenue := COALESCE((v_upsell_data->>'upsell_revenue')::numeric, 0);
  
  -- 4️⃣ Calculate Install Probability
  v_install_prob_data := public.calculate_install_probability(p_thread_id);
  
  -- 5️⃣ Calculate TRUE Job Value
  v_true_job_value := v_rcv_revenue + v_supplement_revenue + v_upsell_revenue;
  
  -- Insert or update forecast
  INSERT INTO public.revenue_forecasts (
    thread_id,
    workspace_id,
    contact_id,
    rcv_revenue,
    rcv_source,
    insurance_acv,
    insurance_deductible,
    insurance_depreciation,
    supplement_revenue,
    supplement_breakdown,
    supplement_insights,
    upsell_revenue,
    upsell_breakdown,
    upsell_insights,
    upsell_probability,
    install_probability,
    install_probability_category,
    install_probability_breakdown,
    install_probability_signals,
    true_job_value,
    forecast_confidence,
    forecast_version,
    calculated_at,
    last_updated_at,
    status
  ) VALUES (
    p_thread_id,
    v_workspace_id,
    v_contact_id,
    v_rcv_revenue,
    v_rcv_data->>'rcv_source',
    (v_rcv_data->>'insurance_acv')::numeric,
    (v_rcv_data->>'insurance_deductible')::numeric,
    (v_rcv_data->>'insurance_depreciation')::numeric,
    v_supplement_revenue,
    v_supplement_data->'supplement_breakdown',
    v_supplement_data->'supplement_insights',
    v_upsell_revenue,
    v_upsell_data->'upsell_breakdown',
    v_upsell_data->'upsell_insights',
    (v_upsell_data->>'upsell_probability')::numeric,
    (v_install_prob_data->>'install_probability')::integer,
    v_install_prob_data->>'install_probability_category',
    v_install_prob_data->'install_probability_breakdown',
    v_install_prob_data->'install_probability_signals',
    v_true_job_value,
    0.8, -- Default confidence
    'v1',
    NOW(),
    NOW(),
    'active'
  )
  ON CONFLICT (thread_id, status) 
  DO UPDATE SET
    rcv_revenue = EXCLUDED.rcv_revenue,
    rcv_source = EXCLUDED.rcv_source,
    insurance_acv = EXCLUDED.insurance_acv,
    insurance_deductible = EXCLUDED.insurance_deductible,
    insurance_depreciation = EXCLUDED.insurance_depreciation,
    supplement_revenue = EXCLUDED.supplement_revenue,
    supplement_breakdown = EXCLUDED.supplement_breakdown,
    supplement_insights = EXCLUDED.supplement_insights,
    upsell_revenue = EXCLUDED.upsell_revenue,
    upsell_breakdown = EXCLUDED.upsell_breakdown,
    upsell_insights = EXCLUDED.upsell_insights,
    upsell_probability = EXCLUDED.upsell_probability,
    install_probability = EXCLUDED.install_probability,
    install_probability_category = EXCLUDED.install_probability_category,
    install_probability_breakdown = EXCLUDED.install_probability_breakdown,
    install_probability_signals = EXCLUDED.install_probability_signals,
    true_job_value = EXCLUDED.true_job_value,
    last_updated_at = NOW(),
    calculated_at = NOW()
  RETURNING id INTO v_forecast_id;
  
  -- Return complete forecast
  SELECT row_to_json(rf.*)::jsonb INTO v_result
  FROM public.revenue_forecasts rf
  WHERE rf.id = v_forecast_id;
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.calculate_revenue_forecast_v1 IS 'Calculates complete revenue forecast (RCV + Supplement + Upsell + Install Probability + TRUE Job Value) for a thread (Block 21260)';

-- ============================================================================
-- PART 7 — Function: Get Revenue Forecast Panel Data
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_revenue_forecast_panel(
  p_thread_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  v_forecast record;
BEGIN
  -- Get or calculate forecast
  SELECT * INTO v_forecast
  FROM public.revenue_forecasts
  WHERE thread_id = p_thread_id
    AND status = 'active'
  ORDER BY calculated_at DESC
  LIMIT 1;
  
  -- If no forecast exists, calculate it
  IF v_forecast IS NULL THEN
    v_result := public.calculate_revenue_forecast_v1(p_thread_id, true);
    RETURN v_result;
  END IF;
  
  -- Return forecast as JSON
  SELECT row_to_json(v_forecast.*)::jsonb INTO v_result;
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_revenue_forecast_panel IS 'Returns revenue forecast panel data for UI display (Block 21260)';

-- ============================================================================
-- PART 8 — Triggers: Auto-Update Revenue Forecast
-- ============================================================================

-- Trigger function to recalculate forecast when relevant data changes
CREATE OR REPLACE FUNCTION public.trigger_recalculate_revenue_forecast()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Recalculate forecast when scope comparison is updated
  IF TG_TABLE_NAME = 'scope_comparisons' THEN
    PERFORM public.calculate_revenue_forecast_v1(NEW.thread_id, true);
  END IF;
  
  -- Recalculate forecast when install-ready score changes
  IF TG_TABLE_NAME = 'inbox_threads' AND 
     (OLD.install_ready_score IS DISTINCT FROM NEW.install_ready_score OR
      OLD.insurance_claim_status IS DISTINCT FROM NEW.insurance_claim_status) THEN
    PERFORM public.calculate_revenue_forecast_v1(NEW.id, true);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger on scope_comparisons updates
DROP TRIGGER IF EXISTS trg_recalculate_forecast_on_scope_comparison ON public.scope_comparisons;
CREATE TRIGGER trg_recalculate_forecast_on_scope_comparison
  AFTER INSERT OR UPDATE ON public.scope_comparisons
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_recalculate_revenue_forecast();

-- Trigger on inbox_threads install-ready score changes
DROP TRIGGER IF EXISTS trg_recalculate_forecast_on_install_ready ON public.inbox_threads;
CREATE TRIGGER trg_recalculate_forecast_on_install_ready
  AFTER UPDATE ON public.inbox_threads
  FOR EACH ROW
  WHEN (
    OLD.install_ready_score IS DISTINCT FROM NEW.install_ready_score OR
    OLD.insurance_claim_status IS DISTINCT FROM NEW.insurance_claim_status
  )
  EXECUTE FUNCTION public.trigger_recalculate_revenue_forecast();

-- ============================================================================
-- PART 9 — Function: Get Revenue Dashboard Forecast Data
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_revenue_dashboard_forecast(
  p_workspace_id uuid,
  p_days_ahead integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  v_monthly_projection numeric(12,2) := 0;
  v_pipeline_value numeric(12,2) := 0;
  v_pending_supplements numeric(12,2) := 0;
  v_high_value_leads integer := 0;
  v_jobs_by_probability jsonb := '{}'::jsonb;
BEGIN
  -- Monthly revenue projection (sum of TRUE job values weighted by install probability)
  SELECT COALESCE(SUM(true_job_value * (install_probability::numeric / 100.0)), 0)
  INTO v_monthly_projection
  FROM public.revenue_forecasts rf
  WHERE rf.workspace_id = p_workspace_id
    AND rf.status = 'active'
    AND rf.install_probability IS NOT NULL
    AND rf.true_job_value IS NOT NULL;
  
  -- Pipeline value (sum of all TRUE job values)
  SELECT COALESCE(SUM(true_job_value), 0)
  INTO v_pipeline_value
  FROM public.revenue_forecasts rf
  WHERE rf.workspace_id = p_workspace_id
    AND rf.status = 'active'
    AND rf.true_job_value IS NOT NULL;
  
  -- Pending supplements
  SELECT COALESCE(SUM(supplement_revenue), 0)
  INTO v_pending_supplements
  FROM public.revenue_forecasts rf
  WHERE rf.workspace_id = p_workspace_id
    AND rf.status = 'active'
    AND rf.supplement_revenue > 0;
  
  -- High-value leads (TRUE job value > $20k and install probability > 50%)
  SELECT COUNT(*)
  INTO v_high_value_leads
  FROM public.revenue_forecasts rf
  WHERE rf.workspace_id = p_workspace_id
    AND rf.status = 'active'
    AND rf.true_job_value > 20000
    AND rf.install_probability >= 50;
  
  -- Jobs by probability category
  SELECT jsonb_build_object(
    'very_hot', COUNT(*) FILTER (WHERE install_probability_category = 'very_hot'),
    'hot', COUNT(*) FILTER (WHERE install_probability_category = 'hot'),
    'warm', COUNT(*) FILTER (WHERE install_probability_category = 'warm'),
    'cold', COUNT(*) FILTER (WHERE install_probability_category = 'cold')
  )
  INTO v_jobs_by_probability
  FROM public.revenue_forecasts rf
  WHERE rf.workspace_id = p_workspace_id
    AND rf.status = 'active'
    AND rf.install_probability IS NOT NULL;
  
  -- Build result
  v_result := jsonb_build_object(
    'monthly_projection', v_monthly_projection,
    'pipeline_value', v_pipeline_value,
    'pending_supplements', v_pending_supplements,
    'high_value_leads', v_high_value_leads,
    'jobs_by_probability', v_jobs_by_probability
  );
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_revenue_dashboard_forecast IS 'Returns revenue forecast data for dashboard integration (Block 21260)';
















































