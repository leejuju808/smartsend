-- =========================================================
-- Block 25900 — SmartSend Roof Measurement Integrations v1
-- (EagleView • HOVER • Drone Uploads • Blueprint Uploads • Auto-Square Calculation)
-- =========================================================
-- 
-- THE MEASUREMENT ENGINE — ZERO FLUFF.
-- 
-- This block is where SmartSend becomes a true estimating and production powerhouse
-- by integrating with the tools roofers already use to measure roofs.
--
-- Features:
-- 1. EagleView Integration (API import, PDF upload auto-parsing, Email-to-job attachment sync)
-- 2. HOVER Integration (sync reports, extract dimensions)
-- 3. Drone Photo + Video Uploads (Pro Feature)
-- 4. Blueprint Uploads (Commercial + Large Residential)
-- 5. Auto-Square Calculation Engine
-- 6. Automatic Material List Generation
-- 7. Measurement → Quote Engine Integration
-- 8. Measurement → Crew Planning Integration
-- 9. Measurement → Insurance Support Integration
-- 10. Roof Measurement Storage

-- ============================================================================
-- PART 1 — CREATE measurement_sources TABLE
-- ============================================================================
-- Tracks all measurement sources (EagleView, HOVER, Drone, Blueprint, Manual)

CREATE TABLE IF NOT EXISTS public.measurement_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE SET NULL,
  
  -- Source identification
  source_type text NOT NULL CHECK (source_type IN (
    'eagleview',
    'hover',
    'drone',
    'blueprint',
    'manual',
    'ai_photo_analysis'
  )),
  
  -- Source metadata
  source_name text, -- e.g., "EagleView Report #12345", "HOVER Project ABC", "Drone Flight 2024-01-15"
  source_id text, -- External ID from source system (e.g., EagleView report ID)
  source_url text, -- Link to original source if available
  
  -- File storage
  file_url text, -- Storage path to uploaded file (PDF, image, etc.)
  file_type text, -- 'pdf', 'image', 'video', '3d_model'
  file_size_bytes bigint,
  
  -- Processing status
  processing_status text DEFAULT 'pending' CHECK (processing_status IN (
    'pending',
    'processing',
    'completed',
    'failed',
    'requires_review'
  )),
  processing_error text,
  processed_at timestamptz,
  
  -- Import metadata
  imported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  imported_at timestamptz DEFAULT now(),
  import_method text CHECK (import_method IN ('api', 'pdf_upload', 'email_attachment', 'manual_upload')),
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_measurement_sources_workspace ON public.measurement_sources(workspace_id);
CREATE INDEX IF NOT EXISTS idx_measurement_sources_job ON public.measurement_sources(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_measurement_sources_lead ON public.measurement_sources(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_measurement_sources_type ON public.measurement_sources(source_type);
CREATE INDEX IF NOT EXISTS idx_measurement_sources_status ON public.measurement_sources(processing_status);
CREATE INDEX IF NOT EXISTS idx_measurement_sources_source_id ON public.measurement_sources(source_id) WHERE source_id IS NOT NULL;

-- ============================================================================
-- PART 2 — CREATE roof_measurement_data TABLE
-- ============================================================================
-- Stores parsed measurement data from all sources

CREATE TABLE IF NOT EXISTS public.roof_measurement_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  measurement_source_id uuid NOT NULL REFERENCES public.measurement_sources(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  
  -- Official square count (consolidated from all sources)
  total_squares numeric(10,2) NOT NULL,
  squares_min numeric(10,2),
  squares_max numeric(10,2),
  
  -- Pitch values
  pitch_value text, -- e.g., '4/12', '6/12', '8/12', '10/12'
  pitch_category text CHECK (pitch_category IN ('low', 'medium', 'high', 'steep', 'flat')) DEFAULT 'medium',
  pitch_degrees numeric(5,2), -- Converted to degrees
  
  -- Roof features
  facets_count integer DEFAULT 0,
  ridges_linear_ft numeric(10,2),
  valleys_linear_ft numeric(10,2),
  rakes_linear_ft numeric(10,2),
  eaves_linear_ft numeric(10,2),
  
  -- Waste factor
  waste_factor_percent numeric(5,2) DEFAULT 12.0,
  waste_factor_category text CHECK (waste_factor_category IN ('low', 'standard', 'complex')) DEFAULT 'standard',
  
  -- Complexity
  complexity_rating text CHECK (complexity_rating IN ('low', 'medium', 'high', 'very_high')) DEFAULT 'medium',
  has_dormers boolean DEFAULT false,
  has_chimneys boolean DEFAULT false,
  has_skylights boolean DEFAULT false,
  has_valleys boolean DEFAULT false,
  penetrations_count integer DEFAULT 0,
  
  -- Material type
  material_type text CHECK (material_type IN ('asphalt', 'metal', 'tile', 'flat_roof', 'slate', 'wood')) DEFAULT 'asphalt',
  
  -- Additional measurements (for HOVER, Blueprints)
  roof_area_sqft numeric(12,2),
  siding_area_sqft numeric(12,2),
  window_count integer DEFAULT 0,
  elevations_count integer DEFAULT 0,
  
  -- 3D model data (HOVER)
  has_3d_model boolean DEFAULT false,
  model_url text,
  
  -- Blueprint-specific
  building_type text, -- 'residential', 'commercial', 'multi_family', 'apartment'
  stories_count integer DEFAULT 1,
  parapet_walls_linear_ft numeric(10,2),
  
  -- Drone-specific
  drone_flight_date date,
  drone_flight_type text CHECK (drone_flight_type IN ('before', 'during', 'after', 'inspection')) DEFAULT 'inspection',
  
  -- Data quality
  confidence_score integer CHECK (confidence_score >= 0 AND confidence_score <= 100) DEFAULT 80,
  data_completeness_score integer CHECK (data_completeness_score >= 0 AND data_completeness_score <= 100) DEFAULT 80,
  
  -- Status
  is_primary boolean DEFAULT false, -- Primary measurement for job
  is_verified boolean DEFAULT false, -- Manually verified by roofer
  
  -- Metadata
  raw_data jsonb DEFAULT '{}'::jsonb, -- Store original parsed data
  notes text,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Ensure one primary measurement per job
  UNIQUE(job_id) WHERE is_primary = true
);

CREATE INDEX IF NOT EXISTS idx_roof_measurement_data_source ON public.roof_measurement_data(measurement_source_id);
CREATE INDEX IF NOT EXISTS idx_roof_measurement_data_workspace ON public.roof_measurement_data(workspace_id);
CREATE INDEX IF NOT EXISTS idx_roof_measurement_data_job ON public.roof_measurement_data(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roof_measurement_data_lead ON public.roof_measurement_data(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roof_measurement_data_primary ON public.roof_measurement_data(is_primary) WHERE is_primary = true;
CREATE INDEX IF NOT EXISTS idx_roof_measurement_data_squares ON public.roof_measurement_data(total_squares);

-- ============================================================================
-- PART 3 — CREATE auto_calculated_materials TABLE
-- ============================================================================
-- Auto-generated material lists based on measurements

CREATE TABLE IF NOT EXISTS public.auto_calculated_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  measurement_data_id uuid NOT NULL REFERENCES public.roof_measurement_data(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  
  -- Material type
  material_type text NOT NULL CHECK (material_type IN (
    'shingles',
    'starter',
    'ridge_cap',
    'underlayment',
    'ice_water_shield',
    'drip_edge',
    'ventilation',
    'step_flashing',
    'pipe_boots',
    'nails',
    'caulk',
    'roof_cement'
  )),
  
  -- Quantities
  quantity numeric(10,2) NOT NULL,
  unit text NOT NULL, -- 'bundles', 'rolls', 'linear_feet', 'pieces', 'pounds', 'units', 'squares'
  quantity_min numeric(10,2),
  quantity_max numeric(10,2),
  
  -- Waste factor applied
  waste_factor_percent numeric(5,2) DEFAULT 0,
  quantity_with_waste numeric(10,2),
  
  -- Pricing (optional)
  unit_cost numeric(10,2),
  total_cost numeric(10,2),
  
  -- Material details
  material_brand text,
  material_model text,
  material_color text,
  
  -- Status
  is_ordered boolean DEFAULT false,
  is_code_required boolean DEFAULT false, -- For insurance code items
  
  -- Metadata
  notes text,
  calculation_metadata jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(measurement_data_id, material_type)
);

CREATE INDEX IF NOT EXISTS idx_auto_calculated_materials_measurement ON public.auto_calculated_materials(measurement_data_id);
CREATE INDEX IF NOT EXISTS idx_auto_calculated_materials_workspace ON public.auto_calculated_materials(workspace_id);
CREATE INDEX IF NOT EXISTS idx_auto_calculated_materials_job ON public.auto_calculated_materials(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_auto_calculated_materials_type ON public.auto_calculated_materials(material_type);
CREATE INDEX IF NOT EXISTS idx_auto_calculated_materials_ordered ON public.auto_calculated_materials(is_ordered) WHERE is_ordered = false;

-- ============================================================================
-- PART 4 — EXTEND roofing_jobs TABLE with measurement fields
-- ============================================================================

ALTER TABLE IF EXISTS public.roofing_jobs
  ADD COLUMN IF NOT EXISTS primary_measurement_id uuid REFERENCES public.roof_measurement_data(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS official_squares numeric(10,2),
  ADD COLUMN IF NOT EXISTS official_pitch_category text,
  ADD COLUMN IF NOT EXISTS measurement_source text CHECK (measurement_source IN ('eagleview', 'hover', 'drone', 'blueprint', 'manual', 'ai_photo_analysis'));

CREATE INDEX IF NOT EXISTS idx_roofing_jobs_primary_measurement ON public.roofing_jobs(primary_measurement_id) WHERE primary_measurement_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roofing_jobs_official_squares ON public.roofing_jobs(official_squares) WHERE official_squares IS NOT NULL;

-- ============================================================================
-- PART 5 — FUNCTION: Auto-Square Calculation Engine
-- ============================================================================
-- Consolidates measurements from multiple sources into one official square count

CREATE OR REPLACE FUNCTION public.calculate_official_squares(
  p_job_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_eagleview_squares numeric;
  v_hover_squares numeric;
  v_drone_squares numeric;
  v_blueprint_squares numeric;
  v_ai_squares numeric;
  v_official_squares numeric;
  v_source_priority text[];
  v_result jsonb;
BEGIN
  -- Priority order: EagleView > HOVER > Blueprint > Drone > AI Photo Analysis
  v_source_priority := ARRAY['eagleview', 'hover', 'blueprint', 'drone', 'ai_photo_analysis'];
  
  -- Get measurements from all sources, ordered by priority
  SELECT 
    COALESCE(
      MAX(CASE WHEN ms.source_type = 'eagleview' THEN rmd.total_squares END),
      MAX(CASE WHEN ms.source_type = 'hover' THEN rmd.total_squares END),
      MAX(CASE WHEN ms.source_type = 'blueprint' THEN rmd.total_squares END),
      MAX(CASE WHEN ms.source_type = 'drone' THEN rmd.total_squares END),
      MAX(CASE WHEN ms.source_type = 'ai_photo_analysis' THEN rmd.total_squares END)
    )
  INTO v_official_squares
  FROM public.roof_measurement_data rmd
  JOIN public.measurement_sources ms ON ms.id = rmd.measurement_source_id
  WHERE rmd.job_id = p_job_id
    AND rmd.is_verified = true OR rmd.is_primary = true;
  
  -- If no verified measurements, use any available
  IF v_official_squares IS NULL THEN
    SELECT 
      COALESCE(
        MAX(CASE WHEN ms.source_type = 'eagleview' THEN rmd.total_squares END),
        MAX(CASE WHEN ms.source_type = 'hover' THEN rmd.total_squares END),
        MAX(CASE WHEN ms.source_type = 'blueprint' THEN rmd.total_squares END),
        MAX(CASE WHEN ms.source_type = 'drone' THEN rmd.total_squares END),
        MAX(CASE WHEN ms.source_type = 'ai_photo_analysis' THEN rmd.total_squares END)
      )
    INTO v_official_squares
    FROM public.roof_measurement_data rmd
    JOIN public.measurement_sources ms ON ms.id = rmd.measurement_source_id
    WHERE rmd.job_id = p_job_id;
  END IF;
  
  -- Update job with official squares
  IF v_official_squares IS NOT NULL THEN
    UPDATE public.roofing_jobs
    SET official_squares = v_official_squares,
        updated_at = now()
    WHERE id = p_job_id;
  END IF;
  
  RETURN jsonb_build_object(
    'official_squares', v_official_squares,
    'eagleview_squares', v_eagleview_squares,
    'hover_squares', v_hover_squares,
    'drone_squares', v_drone_squares,
    'blueprint_squares', v_blueprint_squares,
    'ai_squares', v_ai_squares
  );
END;
$$;

-- ============================================================================
-- PART 6 — FUNCTION: Automatic Material List Generation
-- ============================================================================
-- Generates complete material list based on roof measurements

CREATE OR REPLACE FUNCTION public.generate_material_list(
  p_measurement_data_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_squares numeric;
  v_pitch_category text;
  v_complexity text;
  v_waste_factor numeric;
  v_ridges_ft numeric;
  v_valleys_ft numeric;
  v_eaves_ft numeric;
  v_penetrations integer;
  v_material_type text;
  v_shingles_bundles numeric;
  v_starter_ft numeric;
  v_ridge_cap_ft numeric;
  v_underlayment_rolls numeric;
  v_ice_water_rolls numeric;
  v_drip_edge_ft numeric;
  v_ventilation_pieces integer;
  v_step_flashing_pieces integer;
  v_pipe_boots integer;
  v_nails_pounds numeric;
  v_result jsonb;
BEGIN
  -- Get measurement data
  SELECT 
    total_squares,
    pitch_category,
    complexity_rating,
    waste_factor_percent,
    ridges_linear_ft,
    valleys_linear_ft,
    eaves_linear_ft,
    penetrations_count,
    material_type
  INTO 
    v_squares,
    v_pitch_category,
    v_complexity,
    v_waste_factor,
    v_ridges_ft,
    v_valleys_ft,
    v_eaves_ft,
    v_penetrations,
    v_material_type
  FROM public.roof_measurement_data
  WHERE id = p_measurement_data_id;
  
  IF v_squares IS NULL THEN
    RETURN jsonb_build_object('error', 'Measurement data not found');
  END IF;
  
  -- Calculate materials with waste factor
  v_squares := v_squares * (1 + (v_waste_factor / 100.0));
  
  -- Shingles (3 bundles per square)
  v_shingles_bundles := CEIL(v_squares * 3);
  
  -- Starter (eaves linear feet)
  v_starter_ft := COALESCE(v_eaves_ft, v_squares * 10); -- Estimate 10 ft per square if not measured
  
  -- Ridge cap (ridges linear feet)
  v_ridge_cap_ft := COALESCE(v_ridges_ft, v_squares * 2); -- Estimate 2 ft per square if not measured
  
  -- Underlayment (1 roll per 4 squares, rounded up)
  v_underlayment_rolls := CEIL(v_squares / 4.0);
  
  -- Ice & water shield (eaves + valleys, 1 roll per 33 linear feet)
  v_ice_water_rolls := CEIL((COALESCE(v_eaves_ft, 0) + COALESCE(v_valleys_ft, 0)) / 33.0);
  IF v_ice_water_rolls = 0 THEN
    v_ice_water_rolls := 1; -- Minimum 1 roll
  END IF;
  
  -- Drip edge (eaves + rakes, estimate if not measured)
  v_drip_edge_ft := COALESCE(v_eaves_ft, v_squares * 10) + (v_squares * 8); -- Estimate rakes
  
  -- Ventilation (1 vent per 150 sq ft, minimum 2)
  v_ventilation_pieces := GREATEST(CEIL(v_squares * 100 / 150.0), 2);
  
  -- Step flashing (estimate based on penetrations and valleys)
  v_step_flashing_pieces := COALESCE(v_penetrations, 0) * 4 + COALESCE(CEIL(v_valleys_ft / 2.0), 0);
  
  -- Pipe boots (1 per penetration)
  v_pipe_boots := COALESCE(v_penetrations, 0);
  
  -- Nails (1.5 pounds per square)
  v_nails_pounds := v_squares * 1.5;
  
  -- Insert/update material records
  INSERT INTO public.auto_calculated_materials (
    measurement_data_id,
    workspace_id,
    job_id,
    material_type,
    quantity,
    unit,
    quantity_with_waste,
    waste_factor_percent
  ) VALUES
    ((SELECT workspace_id FROM public.roof_measurement_data WHERE id = p_measurement_data_id), p_measurement_data_id, (SELECT job_id FROM public.roof_measurement_data WHERE id = p_measurement_data_id), 'shingles', v_shingles_bundles, 'bundles', v_shingles_bundles, v_waste_factor),
    ((SELECT workspace_id FROM public.roof_measurement_data WHERE id = p_measurement_data_id), p_measurement_data_id, (SELECT job_id FROM public.roof_measurement_data WHERE id = p_measurement_data_id), 'starter', v_starter_ft, 'linear_feet', v_starter_ft, 0),
    ((SELECT workspace_id FROM public.roof_measurement_data WHERE id = p_measurement_data_id), p_measurement_data_id, (SELECT job_id FROM public.roof_measurement_data WHERE id = p_measurement_data_id), 'ridge_cap', v_ridge_cap_ft, 'linear_feet', v_ridge_cap_ft, 0),
    ((SELECT workspace_id FROM public.roof_measurement_data WHERE id = p_measurement_data_id), p_measurement_data_id, (SELECT job_id FROM public.roof_measurement_data WHERE id = p_measurement_data_id), 'underlayment', v_underlayment_rolls, 'rolls', v_underlayment_rolls, 0),
    ((SELECT workspace_id FROM public.roof_measurement_data WHERE id = p_measurement_data_id), p_measurement_data_id, (SELECT job_id FROM public.roof_measurement_data WHERE id = p_measurement_data_id), 'ice_water_shield', v_ice_water_rolls, 'rolls', v_ice_water_rolls, 0),
    ((SELECT workspace_id FROM public.roof_measurement_data WHERE id = p_measurement_data_id), p_measurement_data_id, (SELECT job_id FROM public.roof_measurement_data WHERE id = p_measurement_data_id), 'drip_edge', v_drip_edge_ft, 'linear_feet', v_drip_edge_ft, 0),
    ((SELECT workspace_id FROM public.roof_measurement_data WHERE id = p_measurement_data_id), p_measurement_data_id, (SELECT job_id FROM public.roof_measurement_data WHERE id = p_measurement_data_id), 'ventilation', v_ventilation_pieces, 'pieces', v_ventilation_pieces, 0),
    ((SELECT workspace_id FROM public.roof_measurement_data WHERE id = p_measurement_data_id), p_measurement_data_id, (SELECT job_id FROM public.roof_measurement_data WHERE id = p_measurement_data_id), 'step_flashing', v_step_flashing_pieces, 'pieces', v_step_flashing_pieces, 0),
    ((SELECT workspace_id FROM public.roof_measurement_data WHERE id = p_measurement_data_id), p_measurement_data_id, (SELECT job_id FROM public.roof_measurement_data WHERE id = p_measurement_data_id), 'pipe_boots', v_pipe_boots, 'pieces', v_pipe_boots, 0),
    ((SELECT workspace_id FROM public.roof_measurement_data WHERE id = p_measurement_data_id), p_measurement_data_id, (SELECT job_id FROM public.roof_measurement_data WHERE id = p_measurement_data_id), 'nails', v_nails_pounds, 'pounds', v_nails_pounds, 0)
  ON CONFLICT (measurement_data_id, material_type) 
  DO UPDATE SET
    quantity = EXCLUDED.quantity,
    quantity_with_waste = EXCLUDED.quantity_with_waste,
    waste_factor_percent = EXCLUDED.waste_factor_percent,
    updated_at = now();
  
  RETURN jsonb_build_object(
    'shingles_bundles', v_shingles_bundles,
    'starter_ft', v_starter_ft,
    'ridge_cap_ft', v_ridge_cap_ft,
    'underlayment_rolls', v_underlayment_rolls,
    'ice_water_rolls', v_ice_water_rolls,
    'drip_edge_ft', v_drip_edge_ft,
    'ventilation_pieces', v_ventilation_pieces,
    'step_flashing_pieces', v_step_flashing_pieces,
    'pipe_boots', v_pipe_boots,
    'nails_pounds', v_nails_pounds
  );
END;
$$;

-- ============================================================================
-- PART 7 — FUNCTION: Measurement → Quote Engine Integration
-- ============================================================================
-- Auto-fills quote data from measurements

CREATE OR REPLACE FUNCTION public.apply_measurements_to_quote(
  p_quote_id uuid,
  p_measurement_data_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_squares numeric;
  v_pitch_category text;
  v_material_type text;
  v_complexity text;
  v_result jsonb;
BEGIN
  -- Get measurement data
  SELECT 
    total_squares,
    pitch_category,
    material_type,
    complexity_rating
  INTO 
    v_squares,
    v_pitch_category,
    v_material_type,
    v_complexity
  FROM public.roof_measurement_data
  WHERE id = p_measurement_data_id;
  
  IF v_squares IS NULL THEN
    RETURN jsonb_build_object('error', 'Measurement data not found');
  END IF;
  
  -- Update quote with measurement data
  UPDATE public.quotes
  SET 
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'squares', v_squares,
      'pitch_category', v_pitch_category,
      'material_type', v_material_type,
      'complexity_rating', v_complexity,
      'measurement_data_id', p_measurement_data_id
    ),
    updated_at = now()
  WHERE id = p_quote_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'squares', v_squares,
    'pitch_category', v_pitch_category,
    'material_type', v_material_type
  );
END;
$$;

-- ============================================================================
-- PART 8 — FUNCTION: Measurement → Crew Planning Integration
-- ============================================================================
-- Converts measurements into crew planning estimates

CREATE OR REPLACE FUNCTION public.calculate_crew_planning_from_measurements(
  p_measurement_data_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_squares numeric;
  v_pitch_category text;
  v_complexity text;
  v_material_type text;
  v_expected_hours numeric;
  v_crew_size integer;
  v_duration_days numeric;
BEGIN
  -- Get measurement data
  SELECT 
    total_squares,
    pitch_category,
    complexity_rating,
    material_type
  INTO 
    v_squares,
    v_pitch_category,
    v_complexity,
    v_material_type
  FROM public.roof_measurement_data
  WHERE id = p_measurement_data_id;
  
  IF v_squares IS NULL THEN
    RETURN jsonb_build_object('error', 'Measurement data not found');
  END IF;
  
  -- Determine crew size
  IF v_squares <= 15 THEN
    v_crew_size := 3;
  ELSIF v_squares <= 30 THEN
    v_crew_size := 4;
  ELSE
    v_crew_size := 5;
  END IF;
  
  -- Base hours per square
  v_expected_hours := v_squares * 1.5; -- Base 1.5 hours per square
  
  -- Apply multipliers
  IF v_pitch_category = 'high' THEN
    v_expected_hours := v_expected_hours * 1.15;
  ELSIF v_pitch_category = 'steep' THEN
    v_expected_hours := v_expected_hours * 1.35;
  END IF;
  
  IF v_complexity = 'high' THEN
    v_expected_hours := v_expected_hours * 1.25;
  ELSIF v_complexity = 'very_high' THEN
    v_expected_hours := v_expected_hours * 1.4;
  END IF;
  
  -- Adjust for crew size
  v_expected_hours := v_expected_hours * (4.0 / v_crew_size);
  
  -- Calculate duration (8 hour work day)
  v_duration_days := CEIL(v_expected_hours / 8.0);
  
  RETURN jsonb_build_object(
    'expected_labor_hours', ROUND(v_expected_hours, 2),
    'expected_crew_size', v_crew_size,
    'expected_duration_days', v_duration_days,
    'complexity_rating', v_complexity
  );
END;
$$;

-- ============================================================================
-- PART 9 — FUNCTION: Measurement → Insurance Support Integration
-- ============================================================================
-- Auto-fills insurance forms with measurement data

CREATE OR REPLACE FUNCTION public.get_insurance_measurement_data(
  p_measurement_data_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'roof_area_sqft', total_squares * 100,
    'roof_squares', total_squares,
    'ridge_linear_ft', ridges_linear_ft,
    'valley_linear_ft', valleys_linear_ft,
    'pitch_value', pitch_value,
    'pitch_category', pitch_category,
    'waste_factor_percent', waste_factor_percent,
    'material_type', material_type,
    'complexity_rating', complexity_rating,
    'has_dormers', has_dormers,
    'has_chimneys', has_chimneys,
    'has_skylights', has_skylights,
    'penetrations_count', penetrations_count
  )
  INTO v_result
  FROM public.roof_measurement_data
  WHERE id = p_measurement_data_id;
  
  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

-- ============================================================================
-- PART 10 — TRIGGERS
-- ============================================================================

-- Auto-update job when primary measurement is set
CREATE OR REPLACE FUNCTION public.tg_update_job_from_measurement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.is_primary = true AND NEW.job_id IS NOT NULL THEN
    UPDATE public.roofing_jobs
    SET 
      primary_measurement_id = NEW.id,
      official_squares = NEW.total_squares,
      official_pitch_category = NEW.pitch_category,
      updated_at = now()
    WHERE id = NEW.job_id;
    
    -- Auto-generate material list
    PERFORM public.generate_material_list(NEW.id);
    
    -- Auto-calculate official squares
    PERFORM public.calculate_official_squares(NEW.job_id);
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_update_job_from_measurement ON public.roof_measurement_data;
CREATE TRIGGER tr_update_job_from_measurement
AFTER INSERT OR UPDATE ON public.roof_measurement_data
FOR EACH ROW
WHEN (NEW.is_primary = true)
EXECUTE FUNCTION public.tg_update_job_from_measurement();

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION public.tg_update_measurement_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_update_measurement_sources_timestamp ON public.measurement_sources;
CREATE TRIGGER tr_update_measurement_sources_timestamp
BEFORE UPDATE ON public.measurement_sources
FOR EACH ROW
EXECUTE FUNCTION public.tg_update_measurement_timestamp();

DROP TRIGGER IF EXISTS tr_update_measurement_data_timestamp ON public.roof_measurement_data;
CREATE TRIGGER tr_update_measurement_data_timestamp
BEFORE UPDATE ON public.roof_measurement_data
FOR EACH ROW
EXECUTE FUNCTION public.tg_update_measurement_timestamp();

DROP TRIGGER IF EXISTS tr_update_materials_timestamp ON public.auto_calculated_materials;
CREATE TRIGGER tr_update_materials_timestamp
BEFORE UPDATE ON public.auto_calculated_materials
FOR EACH ROW
EXECUTE FUNCTION public.tg_update_measurement_timestamp();

-- ============================================================================
-- PART 11 — ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.measurement_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roof_measurement_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_calculated_materials ENABLE ROW LEVEL SECURITY;

-- Measurement sources policies
CREATE POLICY "Users can view measurement sources in their workspace"
  ON public.measurement_sources FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert measurement sources in their workspace"
  ON public.measurement_sources FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update measurement sources in their workspace"
  ON public.measurement_sources FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- Measurement data policies
CREATE POLICY "Users can view measurement data in their workspace"
  ON public.roof_measurement_data FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert measurement data in their workspace"
  ON public.roof_measurement_data FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update measurement data in their workspace"
  ON public.roof_measurement_data FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- Material list policies
CREATE POLICY "Users can view materials in their workspace"
  ON public.auto_calculated_materials FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert materials in their workspace"
  ON public.auto_calculated_materials FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update materials in their workspace"
  ON public.auto_calculated_materials FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 12 — EXTEND job_documents TABLE with measurement document types
-- ============================================================================

-- Add measurement document types to job_documents
ALTER TABLE IF EXISTS public.job_documents
  DROP CONSTRAINT IF EXISTS job_documents_doc_type_check;

ALTER TABLE IF EXISTS public.job_documents
  ADD CONSTRAINT job_documents_doc_type_check CHECK (doc_type IN (
    'photo_before',
    'photo_after',
    'contract',
    'invoice',
    'insurance',
    'permit',
    'receipt',
    'material_list',
    'eagleview_report',
    'hover_report',
    'drone_photo',
    'drone_video',
    'blueprint',
    'measurement_report',
    'other'
  ));

-- Link job_documents to measurement_sources
ALTER TABLE IF EXISTS public.job_documents
  ADD COLUMN IF NOT EXISTS measurement_source_id uuid REFERENCES public.measurement_sources(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_job_documents_measurement_source ON public.job_documents(measurement_source_id) WHERE measurement_source_id IS NOT NULL;

-- ============================================================================
-- PART 13 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.measurement_sources IS 'Tracks all measurement sources (EagleView, HOVER, Drone, Blueprint, Manual) for roofing jobs';
COMMENT ON TABLE public.roof_measurement_data IS 'Stores parsed measurement data from all sources - squares, pitch, features, waste factor, complexity';
COMMENT ON TABLE public.auto_calculated_materials IS 'Auto-generated material lists based on roof measurements - eliminates manual entry';
COMMENT ON FUNCTION public.calculate_official_squares IS 'Consolidates measurements from multiple sources into one official square count';
COMMENT ON FUNCTION public.generate_material_list IS 'Generates complete material list based on roof measurements';
COMMENT ON FUNCTION public.apply_measurements_to_quote IS 'Auto-fills quote data from measurements';
COMMENT ON FUNCTION public.calculate_crew_planning_from_measurements IS 'Converts measurements into crew planning estimates';
COMMENT ON FUNCTION public.get_insurance_measurement_data IS 'Auto-fills insurance forms with measurement data';




































