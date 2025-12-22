-- =========================================================
-- Block 237000 — SmartSend Instant Estimate Engine v1
-- AI Soft Quotes + Smart Price Ranges
-- =========================================================
-- This turns SmartSend into a 24/7 automated estimator
-- Homeowners get instant price ranges, roofers get qualified leads

-- =====================================================
-- PART 1: Pricing Library
-- =====================================================
-- Company-specific pricing for materials, labor, etc.

CREATE TABLE IF NOT EXISTS public.pricing_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roofing_company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  category text NOT NULL CHECK (category IN ('shingles', 'labor', 'tear_off', 'underlayment', 'flashing', 'vents', 'gutters', 'dump_fees', 'permits', 'other')),
  unit text NOT NULL CHECK (unit IN ('sq', 'linear_ft', 'each', 'hour', 'day', 'job')),
  price_per_unit numeric NOT NULL CHECK (price_per_unit > 0),
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pricing_library_company ON public.pricing_library(roofing_company_id);
CREATE INDEX IF NOT EXISTS idx_pricing_library_category ON public.pricing_library(category);
CREATE INDEX IF NOT EXISTS idx_pricing_library_active ON public.pricing_library(roofing_company_id, is_active) WHERE is_active = true;

-- =====================================================
-- PART 2: Roof Data Inputs
-- =====================================================
-- AI-collected information from homeowner conversations

CREATE TABLE IF NOT EXISTS public.roof_data_inputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.webchat_sessions(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  roofing_company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  
  -- Core roof data
  address text,
  city text,
  state text,
  zip_code text,
  sqft numeric,
  pitch text CHECK (pitch IN ('low', 'medium', 'high', 'steep', 'unknown')),
  roof_type text CHECK (roof_type IN ('gable', 'hip', 'flat', 'mansard', 'gambrel', 'shed', 'unknown')),
  layers int CHECK (layers >= 1 AND layers <= 5),
  material_preference text CHECK (material_preference IN ('asphalt', 'metal', 'tile', 'slate', 'wood', 'tpo', 'epdm', 'no_preference')),
  urgency text CHECK (urgency IN ('immediate', 'soon', 'planning', 'exploring')),
  
  -- Additional context
  damage_description text,
  photos_urls text[],
  insurance_claim boolean DEFAULT false,
  previous_estimates jsonb DEFAULT '[]'::jsonb,
  
  -- AI predictions
  ai_predicted_sqft numeric,
  ai_predicted_pitch text,
  ai_predicted_layers int,
  ai_confidence numeric CHECK (ai_confidence >= 0 AND ai_confidence <= 1),
  
  -- Status
  status text DEFAULT 'collecting' CHECK (status IN ('collecting', 'complete', 'estimate_generated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roof_data_inputs_session ON public.roof_data_inputs(session_id);
CREATE INDEX IF NOT EXISTS idx_roof_data_inputs_lead ON public.roof_data_inputs(lead_id);
CREATE INDEX IF NOT EXISTS idx_roof_data_inputs_company ON public.roof_data_inputs(roofing_company_id);
CREATE INDEX IF NOT EXISTS idx_roof_data_inputs_status ON public.roof_data_inputs(status);
CREATE INDEX IF NOT EXISTS idx_roof_data_inputs_created ON public.roof_data_inputs(created_at DESC);

-- =====================================================
-- PART 3: Instant Estimates
-- =====================================================
-- Generated price ranges with confidence scores

CREATE TABLE IF NOT EXISTS public.instant_estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roofing_company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  roof_data_input_id uuid REFERENCES public.roof_data_inputs(id) ON DELETE SET NULL,
  
  -- Price range
  low_estimate numeric NOT NULL CHECK (low_estimate > 0),
  high_estimate numeric NOT NULL CHECK (high_estimate >= low_estimate),
  mid_estimate numeric GENERATED ALWAYS AS ((low_estimate + high_estimate) / 2) STORED,
  
  -- Confidence and metadata
  confidence numeric NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  inputs jsonb NOT NULL DEFAULT '{}'::jsonb, -- Snapshot of inputs used
  
  -- Breakdown (optional, for transparency)
  breakdown jsonb DEFAULT '{}'::jsonb, -- { materials: 5000, labor: 3000, tear_off: 1500, ... }
  
  -- Status
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'shared', 'converted', 'expired')),
  converted_to_estimate_id uuid, -- Links to full estimate if converted
  
  -- Metadata
  message text, -- AI-generated message explaining the estimate
  recommended_next_steps text[],
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz -- Estimates expire after 30 days
);

CREATE INDEX IF NOT EXISTS idx_instant_estimates_company ON public.instant_estimates(roofing_company_id);
CREATE INDEX IF NOT EXISTS idx_instant_estimates_lead ON public.instant_estimates(lead_id);
CREATE INDEX IF NOT EXISTS idx_instant_estimates_roof_data ON public.instant_estimates(roof_data_input_id);
CREATE INDEX IF NOT EXISTS idx_instant_estimates_status ON public.instant_estimates(status);
CREATE INDEX IF NOT EXISTS idx_instant_estimates_created ON public.instant_estimates(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_instant_estimates_expires ON public.instant_estimates(expires_at) WHERE expires_at IS NOT NULL;

-- =====================================================
-- PART 4: Updated_at Triggers
-- =====================================================

CREATE OR REPLACE FUNCTION public.set_pricing_library_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_roof_data_inputs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_instant_estimates_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pricing_library_updated_at ON public.pricing_library;
CREATE TRIGGER trg_pricing_library_updated_at
BEFORE UPDATE ON public.pricing_library
FOR EACH ROW EXECUTE FUNCTION public.set_pricing_library_updated_at();

DROP TRIGGER IF EXISTS trg_roof_data_inputs_updated_at ON public.roof_data_inputs;
CREATE TRIGGER trg_roof_data_inputs_updated_at
BEFORE UPDATE ON public.roof_data_inputs
FOR EACH ROW EXECUTE FUNCTION public.set_roof_data_inputs_updated_at();

DROP TRIGGER IF EXISTS trg_instant_estimates_updated_at ON public.instant_estimates;
CREATE TRIGGER trg_instant_estimates_updated_at
BEFORE UPDATE ON public.instant_estimates
FOR EACH ROW EXECUTE FUNCTION public.set_instant_estimates_updated_at();

-- =====================================================
-- PART 5: Auto-expire estimates after 30 days
-- =====================================================

CREATE OR REPLACE FUNCTION public.auto_set_estimate_expiry()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at = now() + INTERVAL '30 days';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_set_estimate_expiry ON public.instant_estimates;
CREATE TRIGGER trg_auto_set_estimate_expiry
BEFORE INSERT ON public.instant_estimates
FOR EACH ROW EXECUTE FUNCTION public.auto_set_estimate_expiry();

-- =====================================================
-- PART 6: RLS Policies
-- =====================================================

ALTER TABLE public.pricing_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roof_data_inputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instant_estimates ENABLE ROW LEVEL SECURITY;

-- Pricing Library: Company owners/admins can manage
CREATE POLICY "pricing_library: company access"
  ON public.pricing_library
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_companies rc
      WHERE rc.id = pricing_library.roofing_company_id
      AND (
        rc.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.roofing_company_members rcm
          WHERE rcm.roofing_company_id = rc.id
          AND rcm.user_id = auth.uid()
          AND rcm.role IN ('owner', 'admin', 'estimator')
        )
      )
    )
  );

-- Roof Data Inputs: Company access + public read for sessions
CREATE POLICY "roof_data_inputs: company access"
  ON public.roof_data_inputs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_companies rc
      WHERE rc.id = roof_data_inputs.roofing_company_id
      AND (
        rc.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.roofing_company_members rcm
          WHERE rcm.roofing_company_id = rc.id
          AND rcm.user_id = auth.uid()
        )
      )
    )
  );

-- Allow service role to insert (for API routes)
CREATE POLICY "roof_data_inputs: service role insert"
  ON public.roof_data_inputs
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Instant Estimates: Company access + public read for shared estimates
CREATE POLICY "instant_estimates: company access"
  ON public.instant_estimates
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_companies rc
      WHERE rc.id = instant_estimates.roofing_company_id
      AND (
        rc.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.roofing_company_members rcm
          WHERE rcm.roofing_company_id = rc.id
          AND rcm.user_id = auth.uid()
        )
      )
    )
  );

-- Allow service role to insert (for API routes)
CREATE POLICY "instant_estimates: service role insert"
  ON public.instant_estimates
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- =====================================================
-- PART 7: Helper Functions
-- =====================================================

-- Get average pricing for a category
CREATE OR REPLACE FUNCTION public.get_avg_pricing(
  p_company_id uuid,
  p_category text
)
RETURNS numeric
LANGUAGE plpgsql
AS $$
DECLARE
  v_avg_price numeric;
BEGIN
  SELECT AVG(price_per_unit) INTO v_avg_price
  FROM public.pricing_library
  WHERE roofing_company_id = p_company_id
    AND category = p_category
    AND is_active = true;
  
  RETURN COALESCE(v_avg_price, 0);
END;
$$;

-- Get company pricing or fallback to defaults
CREATE OR REPLACE FUNCTION public.get_pricing(
  p_company_id uuid,
  p_category text,
  p_item_name text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
AS $$
DECLARE
  v_price numeric;
BEGIN
  -- Try to get specific item first
  IF p_item_name IS NOT NULL THEN
    SELECT price_per_unit INTO v_price
    FROM public.pricing_library
    WHERE roofing_company_id = p_company_id
      AND category = p_category
      AND item_name = p_item_name
      AND is_active = true
    LIMIT 1;
  END IF;
  
  -- Fallback to category average
  IF v_price IS NULL THEN
    SELECT AVG(price_per_unit) INTO v_price
    FROM public.pricing_library
    WHERE roofing_company_id = p_company_id
      AND category = p_category
      AND is_active = true;
  END IF;
  
  -- Fallback to industry defaults if no company pricing
  IF v_price IS NULL THEN
    CASE p_category
      WHEN 'shingles' THEN v_price := 150.00; -- per sq
      WHEN 'labor' THEN v_price := 75.00; -- per sq
      WHEN 'tear_off' THEN v_price := 50.00; -- per sq
      WHEN 'underlayment' THEN v_price := 25.00; -- per sq
      WHEN 'dump_fees' THEN v_price := 500.00; -- per job
      ELSE v_price := 0;
    END CASE;
  END IF;
  
  RETURN COALESCE(v_price, 0);
END;
$$;

-- =====================================================
-- PART 8: Comments
-- =====================================================

COMMENT ON TABLE public.pricing_library IS 'Block 237000: Company pricing library for materials, labor, and services';
COMMENT ON TABLE public.roof_data_inputs IS 'Block 237000: AI-collected roof information from homeowner conversations';
COMMENT ON TABLE public.instant_estimates IS 'Block 237000: Instant price range estimates generated by AI';

COMMENT ON FUNCTION public.get_avg_pricing IS 'Get average pricing for a category';
COMMENT ON FUNCTION public.get_pricing IS 'Get pricing for item/category with fallbacks';

























