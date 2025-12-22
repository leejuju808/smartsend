-- =========================================================
-- Block 18900 — SmartSend Roof Age Verifier v1
-- (Confidence-Based Roof Age Detection Using Home Data, Photos, Neighborhood Patterns, Storm History & Homeowner Language)
-- =========================================================

-- ============================================================================
-- 1. ROOF_AGE_DATA TABLE
-- ============================================================================
-- Stores the calculated roof age estimates and confidence scores

CREATE TABLE IF NOT EXISTS public.roof_age_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Estimated Roof Age Range
  estimated_age_min integer, -- minimum age in years
  estimated_age_max integer, -- maximum age in years
  estimated_age_median numeric(5,2), -- median age in years
  
  -- Confidence Score (0-100)
  confidence_score integer NOT NULL DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 100),
  
  -- Age Band Classification
  age_band text CHECK (age_band IN ('0_7_years', '8_15_years', '16_25_years', '25_plus_years', 'unknown')) DEFAULT 'unknown',
  
  -- Replacement Probability (0-100)
  replacement_probability integer DEFAULT 0 CHECK (replacement_probability >= 0 AND replacement_probability <= 100),
  
  -- Insurance Feasibility
  insurance_feasibility text CHECK (insurance_feasibility IN ('high', 'moderate', 'low', 'unknown')) DEFAULT 'unknown',
  
  -- Material Confirmed (from photo intelligence)
  material_confirmed text, -- 'asphalt_shingle', 'metal', 'tile', etc.
  
  -- Storm Impact
  storm_impact text CHECK (storm_impact IN ('wind_hail', 'wind_only', 'hail_only', 'none', 'unknown')) DEFAULT 'unknown',
  
  -- Recommended Next Action
  recommended_action text, -- 'repair_only', 'storm_inspection', 'full_assessment', 'replacement_appointment', 'emergency_replacement'
  
  -- Reasoning Summary (JSON)
  reasoning_summary jsonb DEFAULT '{}'::jsonb,
  
  -- Last calculated timestamp
  last_calculated_at timestamptz NOT NULL DEFAULT now(),
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(contact_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_roof_age_data_workspace ON public.roof_age_data(workspace_id);
CREATE INDEX IF NOT EXISTS idx_roof_age_data_contact ON public.roof_age_data(contact_id);
CREATE INDEX IF NOT EXISTS idx_roof_age_data_age_band ON public.roof_age_data(workspace_id, age_band);
CREATE INDEX IF NOT EXISTS idx_roof_age_data_replacement_prob ON public.roof_age_data(workspace_id, replacement_probability DESC);
CREATE INDEX IF NOT EXISTS idx_roof_age_data_confidence ON public.roof_age_data(workspace_id, confidence_score DESC);

-- ============================================================================
-- 2. ROOF_AGE_SOURCES TABLE
-- ============================================================================
-- Stores individual source contributions to the roof age calculation

CREATE TABLE IF NOT EXISTS public.roof_age_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Source Type
  source_type text NOT NULL CHECK (source_type IN (
    'home_build_year',
    'sale_history',
    'neighborhood_pattern',
    'storm_history',
    'homeowner_language',
    'photo_intelligence'
  )),
  
  -- Source Data
  source_data jsonb DEFAULT '{}'::jsonb, -- stores source-specific data
  
  -- Age Estimate from this source
  age_estimate_min integer,
  age_estimate_max integer,
  age_estimate_median numeric(5,2),
  
  -- Source Weight (0-100) - how much this source contributes
  source_weight integer DEFAULT 0 CHECK (source_weight >= 0 AND source_weight <= 100),
  
  -- Source Confidence (0-100)
  source_confidence integer DEFAULT 0 CHECK (source_confidence >= 0 AND source_confidence <= 100),
  
  -- Is Active (some sources may be disabled/outdated)
  is_active boolean DEFAULT true,
  
  -- Metadata
  detected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_roof_age_sources_contact ON public.roof_age_sources(contact_id);
CREATE INDEX IF NOT EXISTS idx_roof_age_sources_workspace ON public.roof_age_sources(workspace_id);
CREATE INDEX IF NOT EXISTS idx_roof_age_sources_type ON public.roof_age_sources(contact_id, source_type);
CREATE INDEX IF NOT EXISTS idx_roof_age_sources_active ON public.roof_age_sources(contact_id, is_active) WHERE is_active = true;

-- ============================================================================
-- 3. ROOF_AGE_CALCULATION_HISTORY TABLE
-- ============================================================================
-- Tracks calculation history for debugging and improvement

CREATE TABLE IF NOT EXISTS public.roof_age_calculation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Calculation Inputs (snapshot)
  calculation_inputs jsonb DEFAULT '{}'::jsonb,
  
  -- Calculation Results
  calculated_age_min integer,
  calculated_age_max integer,
  calculated_age_median numeric(5,2),
  calculated_confidence integer,
  
  -- Source Contributions (snapshot)
  source_contributions jsonb DEFAULT '{}'::jsonb,
  
  -- Calculation Method
  calculation_method text DEFAULT 'weighted_average', -- 'weighted_average', 'ml_model', 'rule_based'
  
  -- Calculation Version
  calculation_version integer DEFAULT 1,
  
  calculated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_roof_age_calc_history_contact ON public.roof_age_calculation_history(contact_id);
CREATE INDEX IF NOT EXISTS idx_roof_age_calc_history_workspace ON public.roof_age_calculation_history(workspace_id);
CREATE INDEX IF NOT EXISTS idx_roof_age_calc_history_date ON public.roof_age_calculation_history(calculated_at DESC);

-- ============================================================================
-- 4. FUNCTIONS
-- ============================================================================

-- Function: Calculate roof age band from age
CREATE OR REPLACE FUNCTION public.get_roof_age_band(p_age_years numeric)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_age_years IS NULL THEN
    RETURN 'unknown';
  ELSIF p_age_years <= 7 THEN
    RETURN '0_7_years';
  ELSIF p_age_years <= 15 THEN
    RETURN '8_15_years';
  ELSIF p_age_years <= 25 THEN
    RETURN '16_25_years';
  ELSE
    RETURN '25_plus_years';
  END IF;
END;
$$;

-- Function: Calculate replacement probability from age
CREATE OR REPLACE FUNCTION public.get_replacement_probability(p_age_years numeric)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_age_years IS NULL THEN
    RETURN 0;
  ELSIF p_age_years <= 7 THEN
    RETURN 10; -- Low replacement potential
  ELSIF p_age_years <= 15 THEN
    RETURN 40; -- Mid replacement potential
  ELSIF p_age_years <= 25 THEN
    RETURN 85; -- HIGH replacement potential
  ELSE
    RETURN 95; -- Critical - roof expired
  END IF;
END;
$$;

-- Function: Calculate insurance feasibility from age
CREATE OR REPLACE FUNCTION public.get_insurance_feasibility(p_age_years numeric)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_age_years IS NULL THEN
    RETURN 'unknown';
  ELSIF p_age_years < 10 THEN
    RETURN 'high'; -- High coverage
  ELSIF p_age_years < 20 THEN
    RETURN 'moderate'; -- Depends on policy
  ELSE
    RETURN 'low'; -- Low coverage, but storm proof possible
  END IF;
END;
$$;

-- Function: Get recommended action from age
CREATE OR REPLACE FUNCTION public.get_recommended_action(p_age_years numeric, p_storm_impact text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_age_years IS NULL THEN
    RETURN 'full_assessment';
  ELSIF p_age_years <= 10 THEN
    RETURN CASE 
      WHEN p_storm_impact IN ('wind_hail', 'hail_only', 'wind_only') THEN 'storm_inspection'
      ELSE 'repair_only'
    END;
  ELSIF p_age_years <= 17 THEN
    RETURN 'full_assessment';
  ELSIF p_age_years <= 25 THEN
    RETURN 'replacement_appointment';
  ELSE
    RETURN 'emergency_replacement';
  END IF;
END;
$$;

-- Function: Update roof_age_data timestamp
CREATE OR REPLACE FUNCTION public.set_roof_age_data_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_roof_age_data_updated_at ON public.roof_age_data;
CREATE TRIGGER trg_set_roof_age_data_updated_at
BEFORE UPDATE ON public.roof_age_data
FOR EACH ROW
EXECUTE FUNCTION public.set_roof_age_data_updated_at();

-- Function: Update roof_age_sources timestamp
CREATE OR REPLACE FUNCTION public.set_roof_age_sources_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_roof_age_sources_updated_at ON public.roof_age_sources;
CREATE TRIGGER trg_set_roof_age_sources_updated_at
BEFORE UPDATE ON public.roof_age_sources
FOR EACH ROW
EXECUTE FUNCTION public.set_roof_age_sources_updated_at();

-- ============================================================================
-- 5. RLS POLICIES
-- ============================================================================

ALTER TABLE public.roof_age_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roof_age_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roof_age_calculation_history ENABLE ROW LEVEL SECURITY;

-- RLS for roof_age_data
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'roof_age_data'
      AND policyname = 'Roof age data scoped to workspace'
  ) THEN
    CREATE POLICY "Roof age data scoped to workspace"
    ON public.roof_age_data
    FOR ALL
    USING (
      workspace_id IN (
        SELECT workspace_id
        FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    )
    WITH CHECK (
      workspace_id IN (
        SELECT workspace_id
        FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    );
  END IF;
END;
$$;

-- RLS for roof_age_sources
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'roof_age_sources'
      AND policyname = 'Roof age sources scoped to workspace'
  ) THEN
    CREATE POLICY "Roof age sources scoped to workspace"
    ON public.roof_age_sources
    FOR ALL
    USING (
      workspace_id IN (
        SELECT workspace_id
        FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    )
    WITH CHECK (
      workspace_id IN (
        SELECT workspace_id
        FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    );
  END IF;
END;
$$;

-- RLS for roof_age_calculation_history
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'roof_age_calculation_history'
      AND policyname = 'Roof age calculation history scoped to workspace'
  ) THEN
    CREATE POLICY "Roof age calculation history scoped to workspace"
    ON public.roof_age_calculation_history
    FOR ALL
    USING (
      workspace_id IN (
        SELECT workspace_id
        FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    )
    WITH CHECK (
      workspace_id IN (
        SELECT workspace_id
        FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    );
  END IF;
END;
$$;

-- ============================================================================
-- 6. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.roof_age_data IS 'Stores calculated roof age estimates with confidence scores and recommendations';
COMMENT ON TABLE public.roof_age_sources IS 'Stores individual source contributions to roof age calculation (home build year, sale history, neighborhood, storm history, homeowner language, photos)';
COMMENT ON TABLE public.roof_age_calculation_history IS 'Tracks calculation history for debugging and model improvement';

COMMENT ON COLUMN public.roof_age_data.age_band IS 'Age band classification: 0_7_years (low replacement), 8_15_years (mid replacement), 16_25_years (high replacement), 25_plus_years (critical)';
COMMENT ON COLUMN public.roof_age_data.replacement_probability IS 'Probability (0-100) that roof needs replacement';
COMMENT ON COLUMN public.roof_age_data.insurance_feasibility IS 'Insurance coverage feasibility: high (<10 years), moderate (10-20 years), low (20+ years)';
COMMENT ON COLUMN public.roof_age_data.reasoning_summary IS 'JSON summary explaining how the age was calculated and which sources contributed';

COMMENT ON COLUMN public.roof_age_sources.source_type IS 'Type of source: home_build_year, sale_history, neighborhood_pattern, storm_history, homeowner_language, photo_intelligence';
COMMENT ON COLUMN public.roof_age_sources.source_weight IS 'Weight (0-100) indicating how much this source contributes to final calculation';
COMMENT ON COLUMN public.roof_age_sources.source_data IS 'JSON data specific to this source (e.g., sale year, storm dates, language phrases detected)';





















































