-- Block 190000 — SmartSend Roofing "AI Roof Measurements (Aerial + Photo + AR Scanner)" v1
-- AI-powered roof measurement system with aerial, photo, and AR capabilities

-- ============================================================
-- 1. ROOF MEASUREMENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.roof_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  
  -- Measurement method
  method text NOT NULL CHECK (method IN ('aerial', 'photo', 'ar')),
  
  -- Core measurements
  squares numeric,                    -- Total squares (1 square = 100 sq ft)
  eaves_length numeric,               -- Linear feet of eave edges
  ridges_length numeric,              -- Linear feet of ridge lines
  valleys_length numeric,             -- Linear feet of valley lines
  hips_length numeric,                -- Linear feet of hip lines
  pitch text,                         -- e.g., "7/12", "6/12"
  facets int,                         -- Number of roof facets/planes
  
  -- Calculations
  waste_factor numeric DEFAULT 0.10,  -- Waste factor (default 10%)
  
  -- Materials (JSONB for flexibility)
  materials jsonb DEFAULT '{}'::jsonb,  -- Material counts: bundles, starter, ridge, etc.
  
  -- Raw AI output
  raw_output jsonb DEFAULT '{}'::jsonb, -- Complete AI response for reference
  
  -- Confidence and metadata
  confidence numeric,                 -- 0-1 confidence score
  image_urls text[],                  -- URLs of images used for measurement
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_roof_measurements_job ON public.roof_measurements(job_id);
CREATE INDEX IF NOT EXISTS idx_roof_measurements_method ON public.roof_measurements(method);
CREATE INDEX IF NOT EXISTS idx_roof_measurements_created ON public.roof_measurements(created_at DESC);

-- ============================================================
-- 2. MATERIAL CALCULATION FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION calculate_roof_materials(
  p_measurement_id uuid
)
RETURNS jsonb AS $$
DECLARE
  v_measurement RECORD;
  v_bundles numeric;
  v_starter numeric;
  v_ridge numeric;
  v_underlayment_rolls numeric;
  v_ice_water_ft numeric;
  v_drip_edge_ft numeric;
  v_nails_lbs numeric;
  v_ventilation numeric;
  v_result jsonb;
BEGIN
  -- Get measurement data
  SELECT * INTO v_measurement
  FROM public.roof_measurements
  WHERE id = p_measurement_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Measurement not found');
  END IF;
  
  -- Calculate bundles (1 bundle covers ~33 sq ft, with waste factor)
  v_bundles := CEIL((v_measurement.squares * 100) / 33.0 * (1 + COALESCE(v_measurement.waste_factor, 0.10)));
  
  -- Calculate starter (typically 1 bundle per 33 linear feet of eave)
  v_starter := CEIL(COALESCE(v_measurement.eaves_length, 0) / 33.0);
  
  -- Calculate ridge (typically 1 bundle per 33 linear feet of ridge)
  v_ridge := CEIL(COALESCE(v_measurement.ridges_length, 0) / 33.0);
  
  -- Calculate underlayment rolls (1 roll covers ~400 sq ft)
  v_underlayment_rolls := CEIL((v_measurement.squares * 100) / 400.0);
  
  -- Calculate ice & water shield (eaves + valleys, typically 36" wide)
  v_ice_water_ft := COALESCE(v_measurement.eaves_length, 0) + (COALESCE(v_measurement.valleys_length, 0) * 2);
  
  -- Calculate drip edge (perimeter of eave edges)
  v_drip_edge_ft := COALESCE(v_measurement.eaves_length, 0);
  
  -- Calculate nails (roughly 4-5 lbs per square)
  v_nails_lbs := CEIL(v_measurement.squares * 4.5);
  
  -- Calculate ventilation (ridge vents typically 1 per 40 linear feet of ridge)
  v_ventilation := CEIL(COALESCE(v_measurement.ridges_length, 0) / 40.0);
  
  -- Build materials JSON
  v_result := jsonb_build_object(
    'bundles', v_bundles,
    'starter', v_starter,
    'ridge', v_ridge,
    'underlayment_rolls', v_underlayment_rolls,
    'ice_water_ft', v_ice_water_ft,
    'drip_edge_ft', v_drip_edge_ft,
    'nails_lbs', v_nails_lbs,
    'ventilation', v_ventilation
  );
  
  -- Update measurement with materials
  UPDATE public.roof_measurements
  SET materials = v_result
  WHERE id = p_measurement_id;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 3. UPDATE TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_roof_measurements_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_roof_measurements_updated_at ON public.roof_measurements;
CREATE TRIGGER trg_roof_measurements_updated_at
BEFORE UPDATE ON public.roof_measurements
FOR EACH ROW
EXECUTE FUNCTION update_roof_measurements_updated_at();

-- ============================================================
-- 4. AUTO-CALCULATE MATERIALS TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION auto_calculate_roof_materials()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-calculate materials when measurement is created/updated with squares
  IF NEW.squares IS NOT NULL AND NEW.squares > 0 THEN
    PERFORM calculate_roof_materials(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_calculate_roof_materials ON public.roof_measurements;
CREATE TRIGGER trg_auto_calculate_roof_materials
AFTER INSERT OR UPDATE OF squares ON public.roof_measurements
FOR EACH ROW
WHEN (NEW.squares IS NOT NULL AND NEW.squares > 0)
EXECUTE FUNCTION auto_calculate_roof_materials();

-- ============================================================
-- 5. ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE public.roof_measurements ENABLE ROW LEVEL SECURITY;

-- Policy: Team members can access measurements for jobs in their teams
CREATE POLICY "roof_measurements_team_member" ON public.roof_measurements
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = roof_measurements.job_id AND tm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = roof_measurements.job_id AND tm.user_id = auth.uid()
    )
  );

-- Service role has full access
CREATE POLICY "roof_measurements_service_role" ON public.roof_measurements
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- 6. JOB INTEGRATION: Update job with measurement data
-- ============================================================
CREATE OR REPLACE FUNCTION sync_measurement_to_job()
RETURNS TRIGGER AS $$
BEGIN
  -- Update job activity feed when measurement is created
  IF TG_OP = 'INSERT' THEN
    -- Add to job activity feed
    INSERT INTO public.job_activity (
      job_id,
      action,
      message,
      metadata
    )
    VALUES (
      NEW.job_id,
      'measurement_created',
      CASE 
        WHEN NEW.method = 'aerial' THEN 'Aerial roof measurement completed'
        WHEN NEW.method = 'photo' THEN 'Photo-based roof measurement completed'
        WHEN NEW.method = 'ar' THEN 'AR scanner roof measurement completed'
        ELSE 'Roof measurement completed'
      END,
      jsonb_build_object(
        'measurement_id', NEW.id,
        'method', NEW.method,
        'squares', NEW.squares,
        'pitch', NEW.pitch,
        'confidence', NEW.confidence
      )
    );
    
    -- Update job materials if materials JSONB is populated
    IF NEW.materials IS NOT NULL AND jsonb_typeof(NEW.materials) = 'object' THEN
      -- Update or insert into auto_calculated_materials if table exists
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'auto_calculated_materials') THEN
        -- Clear existing auto materials for this job
        DELETE FROM public.auto_calculated_materials WHERE job_id = NEW.job_id;
        
        -- Insert materials from measurement
        INSERT INTO public.auto_calculated_materials (job_id, material_type, quantity, unit, is_ordered)
        SELECT 
          NEW.job_id,
          'shingles',
          (NEW.materials->>'bundles')::numeric,
          'bundles',
          false
        WHERE NEW.materials ? 'bundles' AND (NEW.materials->>'bundles')::numeric > 0
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_measurement_to_job ON public.roof_measurements;
CREATE TRIGGER trg_sync_measurement_to_job
AFTER INSERT ON public.roof_measurements
FOR EACH ROW
EXECUTE FUNCTION sync_measurement_to_job();

-- Comments for documentation
COMMENT ON TABLE public.roof_measurements IS 'AI-powered roof measurements from aerial imagery, photos, or AR scanning';
COMMENT ON COLUMN public.roof_measurements.method IS 'Measurement method: aerial (satellite), photo (uploaded images), or ar (AR scanner)';
COMMENT ON COLUMN public.roof_measurements.squares IS 'Total roof squares (1 square = 100 sq ft)';
COMMENT ON COLUMN public.roof_measurements.materials IS 'Calculated material counts (bundles, starter, ridge, etc.)';
COMMENT ON FUNCTION calculate_roof_materials(uuid) IS 'Calculates material requirements from roof measurements';


























