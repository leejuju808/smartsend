-- ============================================================
-- Block 253200 — SmartSend Job Cost Forecasting Engine v1
-- Predict Labor, Material, Sub Costs, Risk Scores, Margin Forecast Before Job Starts
-- ============================================================
-- 
-- This block takes SmartSend from "operational tool" to business intelligence weapon.
-- 
-- Roofers currently guess margins BEFORE jobs start.
-- They hope the install stays on budget.
-- They have NO SYSTEM to warn them early.
-- 
-- SmartSend will give them:
-- - predicted material cost
-- - predicted labor hours
-- - predicted subcontractor cost
-- - predicted overhead share
-- - predicted margin
-- - predicted profit
-- - predicted risks
-- 
-- BEFORE DAY 1 OF THE JOB.
-- ============================================================

-- ============================================================
-- PART 1 — CREATE job_cost_forecasts TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.job_cost_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.roofing_companies(id) ON DELETE SET NULL,
  
  -- Predicted costs
  predicted_material_cost numeric(12,2) DEFAULT 0,
  predicted_labor_cost numeric(12,2) DEFAULT 0,
  predicted_sub_cost numeric(12,2) DEFAULT 0,
  predicted_overhead_cost numeric(12,2) DEFAULT 0,
  predicted_total_cost numeric(12,2) GENERATED ALWAYS AS (
    COALESCE(predicted_material_cost, 0) + 
    COALESCE(predicted_labor_cost, 0) + 
    COALESCE(predicted_sub_cost, 0) + 
    COALESCE(predicted_overhead_cost, 0)
  ) STORED,
  
  -- Predicted profit & margin
  contract_price numeric(12,2), -- From job contract_value, final_value, or estimated_value
  predicted_profit numeric(12,2) GENERATED ALWAYS AS (
    COALESCE(contract_price, 0) - (
      COALESCE(predicted_material_cost, 0) + 
      COALESCE(predicted_labor_cost, 0) + 
      COALESCE(predicted_sub_cost, 0) + 
      COALESCE(predicted_overhead_cost, 0)
    )
  ) STORED,
  predicted_margin numeric(5,2) GENERATED ALWAYS AS (
    CASE 
      WHEN COALESCE(contract_price, 0) > 0 THEN
        ROUND(
          ((COALESCE(contract_price, 0) - (
            COALESCE(predicted_material_cost, 0) + 
            COALESCE(predicted_labor_cost, 0) + 
            COALESCE(predicted_sub_cost, 0) + 
            COALESCE(predicted_overhead_cost, 0)
          )) / COALESCE(contract_price, 1)) * 100,
          2
        )
      ELSE 0
    END
  ) STORED,
  
  -- Risk assessment
  risk_level text DEFAULT 'medium' CHECK (risk_level IN ('low', 'medium', 'high')),
  risk_score integer DEFAULT 50 CHECK (risk_score >= 0 AND risk_score <= 100),
  
  -- Confidence score (accuracy indicator)
  confidence_score integer DEFAULT 70 CHECK (confidence_score >= 0 AND confidence_score <= 100),
  
  -- Forecast inputs (for audit/recalculation)
  forecast_inputs jsonb DEFAULT '{}'::jsonb, -- {squares, roof_type, pitch, material_type, etc.}
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- One forecast per job (latest)
  CONSTRAINT unique_job_forecast UNIQUE (job_id)
);

CREATE INDEX IF NOT EXISTS idx_job_cost_forecasts_job ON public.job_cost_forecasts(job_id);
CREATE INDEX IF NOT EXISTS idx_job_cost_forecasts_company ON public.job_cost_forecasts(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_cost_forecasts_risk ON public.job_cost_forecasts(risk_level, risk_score DESC) WHERE risk_level = 'high';
CREATE INDEX IF NOT EXISTS idx_job_cost_forecasts_created ON public.job_cost_forecasts(created_at DESC);

COMMENT ON TABLE public.job_cost_forecasts IS 'Block 253200: Pre-job cost forecasts with margin and profit predictions';
COMMENT ON COLUMN public.job_cost_forecasts.confidence_score IS 'Forecast accuracy indicator (0-100) based on data completeness and historical match';
COMMENT ON COLUMN public.job_cost_forecasts.risk_score IS 'Aggregated risk score (0-100) from all risk factors';

-- ============================================================
-- PART 2 — CREATE job_risk_factors TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.job_risk_factors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  forecast_id uuid REFERENCES public.job_cost_forecasts(id) ON DELETE CASCADE,
  
  factor text NOT NULL, -- 'steep_pitch', 'complex_roof', 'bad_decking', 'weather_risk', 'crew_safety_low', 'multi_layer_tearoff', etc.
  severity integer NOT NULL CHECK (severity >= 1 AND severity <= 5), -- 1-5 scale
  description text, -- Human-readable description
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_job_risk_factors_job ON public.job_risk_factors(job_id);
CREATE INDEX IF NOT EXISTS idx_job_risk_factors_forecast ON public.job_risk_factors(forecast_id) WHERE forecast_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_risk_factors_severity ON public.job_risk_factors(severity DESC) WHERE severity >= 4;

COMMENT ON TABLE public.job_risk_factors IS 'Block 253200: Individual risk factors for jobs (steep pitch, weather, crew, etc.)';

-- ============================================================
-- PART 3 — FORECAST ENGINE FUNCTIONS
-- ============================================================

-- 3.1 Calculate Material Cost Forecast
CREATE OR REPLACE FUNCTION public.forecast_material_cost(
  p_squares numeric,
  p_roof_type text DEFAULT NULL,
  p_material_type text DEFAULT NULL,
  p_waste_factor numeric DEFAULT 0.12,
  p_company_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_base_cost_per_square numeric;
  v_accessories_cost numeric := 0;
  v_total_material_cost numeric;
BEGIN
  -- Base material cost per square (from templates or defaults)
  -- Use material templates if available, otherwise use defaults
  v_base_cost_per_square := CASE 
    WHEN p_material_type = 'asphalt' THEN
      CASE 
        WHEN p_roof_type = '3_tab' THEN 280.0
        WHEN p_roof_type = 'architectural' THEN 320.0
        WHEN p_roof_type = 'premium' THEN 380.0
        ELSE 320.0 -- Default architectural
      END
    WHEN p_material_type = 'metal' THEN 1100.0
    WHEN p_material_type = 'tile' THEN 1350.0
    WHEN p_material_type = 'flat_roof' OR p_material_type = 'tpo' OR p_material_type = 'epdm' THEN 650.0
    ELSE 320.0 -- Default to asphalt architectural
  END;
  
  -- Calculate base cost
  v_total_material_cost := v_base_cost_per_square * COALESCE(p_squares, 0);
  
  -- Add accessories (ridge cap, vents, flashing, etc.) - estimate 5% of base cost
  v_accessories_cost := v_total_material_cost * 0.05;
  
  -- Apply waste factor
  v_total_material_cost := v_total_material_cost * (1 + COALESCE(p_waste_factor, 0.12));
  
  -- Add accessories
  v_total_material_cost := v_total_material_cost + v_accessories_cost;
  
  RETURN ROUND(v_total_material_cost, 2);
END;
$$;

COMMENT ON FUNCTION public.forecast_material_cost IS 'Forecast material cost based on squares, roof type, and material type (Block 253200)';

-- 3.2 Calculate Labor Cost Forecast
CREATE OR REPLACE FUNCTION public.forecast_labor_cost(
  p_squares numeric,
  p_pitch text DEFAULT NULL,
  p_roof_type text DEFAULT NULL,
  p_material_type text DEFAULT NULL,
  p_crew_efficiency_score numeric DEFAULT 1.0,
  p_company_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_labor_hours_per_square numeric;
  v_pitch_multiplier numeric;
  v_total_labor_hours numeric;
  v_average_labor_rate numeric := 35.0; -- Default $35/hr, can be overridden
  v_total_labor_cost numeric;
BEGIN
  -- Base labor hours per square (varies by material type)
  v_labor_hours_per_square := CASE 
    WHEN p_material_type = 'asphalt' THEN 0.75
    WHEN p_material_type = 'metal' THEN 1.2
    WHEN p_material_type = 'tile' THEN 1.5
    WHEN p_material_type = 'flat_roof' OR p_material_type = 'tpo' OR p_material_type = 'epdm' THEN 0.9
    ELSE 0.75 -- Default asphalt
  END;
  
  -- Pitch multiplier (steeper = more time)
  v_pitch_multiplier := CASE 
    WHEN p_pitch = 'low' OR p_pitch = '4/12' OR p_pitch = '5/12' THEN 1.0
    WHEN p_pitch = 'medium' OR p_pitch = '6/12' OR p_pitch = '7/12' OR p_pitch = '8/12' THEN 1.1
    WHEN p_pitch = 'high' OR p_pitch = '9/12' OR p_pitch = '10/12' THEN 1.25
    WHEN p_pitch = 'steep' OR p_pitch = '11/12' OR p_pitch = '12/12' THEN 1.4
    ELSE 1.1 -- Default medium
  END;
  
  -- Calculate total labor hours
  v_total_labor_hours := COALESCE(p_squares, 0) * v_labor_hours_per_square * v_pitch_multiplier;
  
  -- Apply crew efficiency (if crew is faster, reduce hours)
  v_total_labor_hours := v_total_labor_hours / COALESCE(p_crew_efficiency_score, 1.0);
  
  -- Calculate labor cost
  v_total_labor_cost := v_total_labor_hours * v_average_labor_rate;
  
  RETURN ROUND(v_total_labor_cost, 2);
END;
$$;

COMMENT ON FUNCTION public.forecast_labor_cost IS 'Forecast labor cost based on squares, pitch, material type, and crew efficiency (Block 253200)';

-- 3.3 Calculate Subcontractor Cost Forecast
CREATE OR REPLACE FUNCTION public.forecast_sub_cost(
  p_squares numeric,
  p_company_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_avg_sub_rate_per_square numeric := 45.0; -- Default $45/sq, can be pulled from historical data
  v_total_sub_cost numeric;
BEGIN
  -- Calculate based on average sub rate per square
  v_total_sub_cost := COALESCE(p_squares, 0) * v_avg_sub_rate_per_square;
  
  RETURN ROUND(v_total_sub_cost, 2);
END;
$$;

COMMENT ON FUNCTION public.forecast_sub_cost IS 'Forecast subcontractor cost based on squares and historical averages (Block 253200)';

-- 3.4 Calculate Overhead Cost Forecast
CREATE OR REPLACE FUNCTION public.forecast_overhead_cost(
  p_contract_price numeric,
  p_company_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_overhead_rate numeric := 0.10; -- Default 10%
  v_allocation_method text := 'percent';
  v_flat_rate_amount numeric;
  v_overhead_cost numeric;
BEGIN
  -- Get overhead settings if company_id provided
  IF p_company_id IS NOT NULL THEN
    SELECT 
      COALESCE(overhead_rate, 0.10),
      COALESCE(allocation_method, 'percent'),
      flat_rate_amount
    INTO
      v_overhead_rate,
      v_allocation_method,
      v_flat_rate_amount
    FROM public.job_overhead_settings
    WHERE company_id = p_company_id
    LIMIT 1;
  END IF;
  
  -- Calculate overhead
  IF v_allocation_method = 'flat_rate' AND v_flat_rate_amount IS NOT NULL THEN
    v_overhead_cost := v_flat_rate_amount;
  ELSE
    v_overhead_cost := COALESCE(p_contract_price, 0) * v_overhead_rate;
  END IF;
  
  RETURN ROUND(v_overhead_cost, 2);
END;
$$;

COMMENT ON FUNCTION public.forecast_overhead_cost IS 'Forecast overhead cost based on contract price and company settings (Block 253200)';

-- 3.5 Calculate Risk Score
CREATE OR REPLACE FUNCTION public.calculate_job_risk_score(
  p_job_id uuid,
  p_pitch text DEFAULT NULL,
  p_roof_type text DEFAULT NULL,
  p_weather_risk_score integer DEFAULT NULL,
  p_crew_safety_score numeric DEFAULT NULL,
  p_layers_to_tear_off integer DEFAULT 1,
  p_decking_condition text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_risk_score integer := 0;
  v_pitch_risk integer := 0;
  v_complexity_risk integer := 0;
  v_weather_risk integer := 0;
  v_crew_risk integer := 0;
  v_tearoff_risk integer := 0;
  v_decking_risk integer := 0;
BEGIN
  -- Pitch risk (steep = higher risk)
  v_pitch_risk := CASE 
    WHEN p_pitch = 'steep' OR p_pitch = '11/12' OR p_pitch = '12/12' THEN 20
    WHEN p_pitch = 'high' OR p_pitch = '9/12' OR p_pitch = '10/12' THEN 12
    WHEN p_pitch = 'medium' OR p_pitch = '6/12' OR p_pitch = '7/12' OR p_pitch = '8/12' THEN 5
    ELSE 0
  END;
  
  -- Complexity risk (complex roof = higher risk)
  v_complexity_risk := CASE 
    WHEN p_roof_type IN ('tile', 'metal') THEN 10
    WHEN p_roof_type = 'flat_roof' THEN 8
    ELSE 3
  END;
  
  -- Weather risk (from weather engine if available)
  v_weather_risk := COALESCE(p_weather_risk_score, 0);
  
  -- Crew risk (low safety score = higher risk)
  v_crew_risk := CASE 
    WHEN p_crew_safety_score IS NOT NULL AND p_crew_safety_score < 70 THEN 15
    WHEN p_crew_safety_score IS NOT NULL AND p_crew_safety_score < 85 THEN 8
    ELSE 0
  END;
  
  -- Multi-layer tear-off risk
  v_tearoff_risk := CASE 
    WHEN p_layers_to_tear_off >= 3 THEN 15
    WHEN p_layers_to_tear_off = 2 THEN 8
    ELSE 0
  END;
  
  -- Decking condition risk
  v_decking_risk := CASE 
    WHEN p_decking_condition = 'bad' OR p_decking_condition = 'poor' THEN 12
    WHEN p_decking_condition = 'fair' THEN 5
    ELSE 0
  END;
  
  -- Sum all risks (max 100)
  v_risk_score := LEAST(100, v_pitch_risk + v_complexity_risk + v_weather_risk + v_crew_risk + v_tearoff_risk + v_decking_risk);
  
  RETURN v_risk_score;
END;
$$;

COMMENT ON FUNCTION public.calculate_job_risk_score IS 'Calculate aggregated risk score for a job (Block 253200)';

-- 3.6 Calculate Confidence Score
CREATE OR REPLACE FUNCTION public.calculate_forecast_confidence(
  p_squares numeric,
  p_roof_type text,
  p_pitch text,
  p_material_type text,
  p_contract_price numeric,
  p_has_historical_data boolean DEFAULT false,
  p_crew_familiarity boolean DEFAULT false
)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_confidence integer := 100;
BEGIN
  -- Reduce confidence for missing data
  IF p_squares IS NULL OR p_squares <= 0 THEN
    v_confidence := v_confidence - 20;
  END IF;
  
  IF p_roof_type IS NULL THEN
    v_confidence := v_confidence - 10;
  END IF;
  
  IF p_pitch IS NULL THEN
    v_confidence := v_confidence - 10;
  END IF;
  
  IF p_material_type IS NULL THEN
    v_confidence := v_confidence - 15;
  END IF;
  
  IF p_contract_price IS NULL OR p_contract_price <= 0 THEN
    v_confidence := v_confidence - 15;
  END IF;
  
  -- Increase confidence for historical data match
  IF p_has_historical_data THEN
    v_confidence := v_confidence + 10;
  END IF;
  
  -- Increase confidence for crew familiarity
  IF p_crew_familiarity THEN
    v_confidence := v_confidence + 5;
  END IF;
  
  -- Clamp to 0-100
  v_confidence := GREATEST(0, LEAST(100, v_confidence));
  
  RETURN v_confidence;
END;
$$;

COMMENT ON FUNCTION public.calculate_forecast_confidence IS 'Calculate forecast confidence score based on data completeness (Block 253200)';

-- 3.7 Main Forecast Generation Function
CREATE OR REPLACE FUNCTION public.generate_job_cost_forecast(
  p_job_id uuid,
  p_company_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job_record RECORD;
  v_squares numeric;
  v_roof_type text;
  v_pitch text;
  v_material_type text;
  v_contract_price numeric;
  v_forecast_id uuid;
  v_material_cost numeric;
  v_labor_cost numeric;
  v_sub_cost numeric;
  v_overhead_cost numeric;
  v_risk_score integer;
  v_confidence_score integer;
  v_risk_level text;
  v_weather_risk_score integer := 0;
  v_crew_safety_score numeric := NULL;
  v_layers_to_tear_off integer := 1;
  v_decking_condition text := NULL;
  v_forecast_inputs jsonb;
BEGIN
  -- Get job details
  SELECT 
    j.*,
    COALESCE(j.contract_value, j.final_value, j.estimated_value, 0) as revenue
  INTO v_job_record
  FROM public.jobs j
  WHERE j.id = p_job_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found: %', p_job_id;
  END IF;
  
  -- Extract job data (may need to parse from materials jsonb or other fields)
  v_squares := NULL; -- TODO: Extract from job data or estimate
  v_roof_type := v_job_record.roof_type;
  v_pitch := NULL; -- TODO: Extract from job data
  v_material_type := v_job_record.roof_type; -- Use roof_type as material_type for now
  v_contract_price := v_job_record.revenue;
  v_company_id := COALESCE(p_company_id, v_job_record.company_id);
  
  -- Get weather risk if available
  SELECT current_risk_score INTO v_weather_risk_score
  FROM public.job_weather_status
  WHERE job_id = p_job_id
  LIMIT 1;
  
  -- Get crew safety score if crew assigned
  IF v_job_record.crew_id IS NOT NULL THEN
    SELECT overall_score INTO v_crew_safety_score
    FROM public.crew_performance_scores
    WHERE crew_id = v_job_record.crew_id
    ORDER BY period_end_date DESC
    LIMIT 1;
  END IF;
  
  -- Calculate forecasts
  v_material_cost := public.forecast_material_cost(
    v_squares,
    v_roof_type,
    v_material_type,
    0.12, -- 12% waste factor
    v_company_id
  );
  
  v_labor_cost := public.forecast_labor_cost(
    v_squares,
    v_pitch,
    v_roof_type,
    v_material_type,
    CASE WHEN v_crew_safety_score IS NOT NULL THEN GREATEST(0.8, v_crew_safety_score / 100.0) ELSE 1.0 END,
    v_company_id
  );
  
  v_sub_cost := public.forecast_sub_cost(
    v_squares,
    v_company_id
  );
  
  v_overhead_cost := public.forecast_overhead_cost(
    v_contract_price,
    v_company_id
  );
  
  -- Calculate risk score
  v_risk_score := public.calculate_job_risk_score(
    p_job_id,
    v_pitch,
    v_roof_type,
    v_weather_risk_score,
    v_crew_safety_score,
    v_layers_to_tear_off,
    v_decking_condition
  );
  
  -- Determine risk level
  v_risk_level := CASE 
    WHEN v_risk_score >= 70 THEN 'high'
    WHEN v_risk_score >= 40 THEN 'medium'
    ELSE 'low'
  END;
  
  -- Calculate confidence score
  v_confidence_score := public.calculate_forecast_confidence(
    v_squares,
    v_roof_type,
    v_pitch,
    v_material_type,
    v_contract_price,
    false, -- TODO: Check for historical data
    v_crew_safety_score IS NOT NULL
  );
  
  -- Build forecast inputs
  v_forecast_inputs := jsonb_build_object(
    'squares', v_squares,
    'roof_type', v_roof_type,
    'pitch', v_pitch,
    'material_type', v_material_type,
    'layers_to_tear_off', v_layers_to_tear_off,
    'decking_condition', v_decking_condition,
    'weather_risk_score', v_weather_risk_score,
    'crew_safety_score', v_crew_safety_score
  );
  
  -- Check if forecast exists
  SELECT id INTO v_forecast_id
  FROM public.job_cost_forecasts
  WHERE job_id = p_job_id;
  
  -- Insert or update forecast
  IF v_forecast_id IS NULL THEN
    -- Insert new forecast
    INSERT INTO public.job_cost_forecasts (
      job_id,
      company_id,
      predicted_material_cost,
      predicted_labor_cost,
      predicted_sub_cost,
      predicted_overhead_cost,
      contract_price,
      risk_level,
      risk_score,
      confidence_score,
      forecast_inputs,
      created_by
    )
    VALUES (
      p_job_id,
      v_company_id,
      v_material_cost,
      v_labor_cost,
      v_sub_cost,
      v_overhead_cost,
      v_contract_price,
      v_risk_level,
      v_risk_score,
      v_confidence_score,
      v_forecast_inputs,
      auth.uid()
    )
    RETURNING id INTO v_forecast_id;
  ELSE
    -- Update existing forecast
    UPDATE public.job_cost_forecasts
    SET
      company_id = v_company_id,
      predicted_material_cost = v_material_cost,
      predicted_labor_cost = v_labor_cost,
      predicted_sub_cost = v_sub_cost,
      predicted_overhead_cost = v_overhead_cost,
      contract_price = v_contract_price,
      risk_level = v_risk_level,
      risk_score = v_risk_score,
      confidence_score = v_confidence_score,
      forecast_inputs = v_forecast_inputs,
      updated_at = now()
    WHERE id = v_forecast_id;
  END IF;
    predicted_material_cost = EXCLUDED.predicted_material_cost,
    predicted_labor_cost = EXCLUDED.predicted_labor_cost,
    predicted_sub_cost = EXCLUDED.predicted_sub_cost,
    predicted_overhead_cost = EXCLUDED.predicted_overhead_cost,
    contract_price = EXCLUDED.contract_price,
    risk_level = EXCLUDED.risk_level,
    risk_score = EXCLUDED.risk_score,
    confidence_score = EXCLUDED.confidence_score,
    forecast_inputs = EXCLUDED.forecast_inputs,
    updated_at = now()
  RETURNING id INTO v_forecast_id;
  
  -- Create risk factors
  DELETE FROM public.job_risk_factors WHERE forecast_id = v_forecast_id;
  
  -- Add pitch risk factor
  IF v_pitch IN ('steep', '11/12', '12/12') THEN
    INSERT INTO public.job_risk_factors (job_id, forecast_id, factor, severity, description)
    VALUES (p_job_id, v_forecast_id, 'steep_pitch', 4, 'Steep pitch increases labor time and safety risk');
  END IF;
  
  -- Add multi-layer tear-off risk
  IF v_layers_to_tear_off >= 2 THEN
    INSERT INTO public.job_risk_factors (job_id, forecast_id, factor, severity, description)
    VALUES (p_job_id, v_forecast_id, 'multi_layer_tearoff', v_layers_to_tear_off, 
      v_layers_to_tear_off || ' layers to tear off increases labor and disposal costs');
  END IF;
  
  -- Add decking risk
  IF v_decking_condition IN ('bad', 'poor') THEN
    INSERT INTO public.job_risk_factors (job_id, forecast_id, factor, severity, description)
    VALUES (p_job_id, v_forecast_id, 'bad_decking', 3, 'Poor decking condition may require replacement');
  END IF;
  
  -- Add weather risk
  IF v_weather_risk_score >= 50 THEN
    INSERT INTO public.job_risk_factors (job_id, forecast_id, factor, severity, description)
    VALUES (p_job_id, v_forecast_id, 'weather_risk', 
      CASE WHEN v_weather_risk_score >= 80 THEN 5 WHEN v_weather_risk_score >= 60 THEN 4 ELSE 3 END,
      'Weather conditions may cause delays or safety issues');
  END IF;
  
  -- Add crew risk
  IF v_crew_safety_score IS NOT NULL AND v_crew_safety_score < 70 THEN
    INSERT INTO public.job_risk_factors (job_id, forecast_id, factor, severity, description)
    VALUES (p_job_id, v_forecast_id, 'crew_safety_low', 3, 'Crew safety score below optimal may impact performance');
  END IF;
  
  RETURN v_forecast_id;
END;
$$;

COMMENT ON FUNCTION public.generate_job_cost_forecast IS 'Generate complete job cost forecast with all predictions (Block 253200)';

-- ============================================================
-- PART 4 — TRIGGERS
-- ============================================================

-- Update updated_at on job_cost_forecasts
CREATE OR REPLACE FUNCTION public.set_job_cost_forecasts_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_job_cost_forecasts_updated_at
BEFORE UPDATE ON public.job_cost_forecasts
FOR EACH ROW
EXECUTE FUNCTION public.set_job_cost_forecasts_updated_at();

-- Auto-generate forecast when job is created or contract value changes
CREATE OR REPLACE FUNCTION public.auto_generate_job_forecast()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only generate if contract value is set
  IF COALESCE(NEW.contract_value, NEW.final_value, NEW.estimated_value, 0) > 0 THEN
    PERFORM public.generate_job_cost_forecast(NEW.id, NEW.company_id);
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_generate_job_forecast ON public.jobs;
CREATE TRIGGER trg_auto_generate_job_forecast
AFTER INSERT OR UPDATE OF contract_value, final_value, estimated_value ON public.jobs
FOR EACH ROW
WHEN (COALESCE(NEW.contract_value, NEW.final_value, NEW.estimated_value, 0) > 0)
EXECUTE FUNCTION public.auto_generate_job_forecast();

-- ============================================================
-- PART 5 — ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.job_cost_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_risk_factors ENABLE ROW LEVEL SECURITY;

-- Job cost forecasts policies
CREATE POLICY "job_cost_forecasts_select_company_members"
  ON public.job_cost_forecasts FOR SELECT
  USING (
    company_id IN (
      SELECT roofing_company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid()
    )
    OR company_id IN (
      SELECT id FROM public.roofing_companies
      WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "job_cost_forecasts_insert_company_members"
  ON public.job_cost_forecasts FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT roofing_company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid()
    )
    OR company_id IN (
      SELECT id FROM public.roofing_companies
      WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "job_cost_forecasts_update_company_members"
  ON public.job_cost_forecasts FOR UPDATE
  USING (
    company_id IN (
      SELECT roofing_company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid()
    )
    OR company_id IN (
      SELECT id FROM public.roofing_companies
      WHERE owner_id = auth.uid()
    )
  );

-- Job risk factors policies
CREATE POLICY "job_risk_factors_select_company_members"
  ON public.job_risk_factors FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.job_cost_forecasts jcf
      WHERE jcf.id = job_risk_factors.forecast_id
      AND (
        jcf.company_id IN (
          SELECT roofing_company_id FROM public.roofing_company_members
          WHERE user_id = auth.uid()
        )
        OR jcf.company_id IN (
          SELECT id FROM public.roofing_companies
          WHERE owner_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "job_risk_factors_insert_company_members"
  ON public.job_risk_factors FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.job_cost_forecasts jcf
      WHERE jcf.id = job_risk_factors.forecast_id
      AND (
        jcf.company_id IN (
          SELECT roofing_company_id FROM public.roofing_company_members
          WHERE user_id = auth.uid()
        )
        OR jcf.company_id IN (
          SELECT id FROM public.roofing_companies
          WHERE owner_id = auth.uid()
        )
      )
    )
  );

-- ============================================================
-- PART 6 — HELPER VIEWS
-- ============================================================

-- View for forecast summary with job details
CREATE OR REPLACE VIEW public.job_forecast_summary AS
SELECT 
  jcf.*,
  j.homeowner_name,
  j.address,
  j.job_type,
  j.roof_type,
  j.production_date,
  j.status,
  COUNT(jrf.id) as risk_factor_count
FROM public.job_cost_forecasts jcf
JOIN public.jobs j ON j.id = jcf.job_id
LEFT JOIN public.job_risk_factors jrf ON jrf.forecast_id = jcf.id
GROUP BY jcf.id, j.homeowner_name, j.address, j.job_type, j.roof_type, j.production_date, j.status;

COMMENT ON VIEW public.job_forecast_summary IS 'Summary view of job forecasts with job details (Block 253200)';

-- ============================================================
-- END OF MIGRATION
-- ============================================================
























