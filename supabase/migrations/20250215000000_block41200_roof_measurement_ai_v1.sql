-- Block 41200 — SmartSend Roofing "AI Roof Measurement + Diagram Engine" v1
-- Auto-measure roofs from photos • Generate roof diagrams • Estimate squares/pitch/edges/ridges
-- Sync measurements into proposal + production

-- ============================================================
-- 1. ROOF_MEASUREMENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.roof_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  squares numeric,
  waste_factor numeric DEFAULT 0.1,
  pitch text,
  eaves_length numeric,
  rakes_length numeric,
  hips_length numeric,
  valleys_length numeric,
  ridge_length numeric,
  penetrations jsonb DEFAULT '[]'::jsonb,
  confidence numeric CHECK (confidence >= 0 AND confidence <= 1),
  diagram_url text,
  raw_output jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for roof_measurements
CREATE INDEX IF NOT EXISTS idx_roof_measurements_job ON public.roof_measurements(job_id);
CREATE INDEX IF NOT EXISTS idx_roof_measurements_created ON public.roof_measurements(created_at DESC);

-- ============================================================
-- 2. ROOF_PHOTOS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.roof_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  angle text CHECK (angle IN ('front', 'back', 'left', 'right', 'drone', 'satellite')),
  created_at timestamptz DEFAULT now()
);

-- Indexes for roof_photos
CREATE INDEX IF NOT EXISTS idx_roof_photos_job ON public.roof_photos(job_id);
CREATE INDEX IF NOT EXISTS idx_roof_photos_angle ON public.roof_photos(angle);

-- ============================================================
-- 3. ROOF_MATERIAL_ESTIMATES TABLE (Auto-calculated from measurements)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.roof_material_estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  measurement_id uuid REFERENCES public.roof_measurements(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  material_type text NOT NULL,
  quantity numeric NOT NULL,
  unit text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for roof_material_estimates
CREATE INDEX IF NOT EXISTS idx_roof_material_estimates_measurement ON public.roof_material_estimates(measurement_id);
CREATE INDEX IF NOT EXISTS idx_roof_material_estimates_job ON public.roof_material_estimates(job_id);
CREATE INDEX IF NOT EXISTS idx_roof_material_estimates_type ON public.roof_material_estimates(material_type);

-- ============================================================
-- 4. TRIGGERS
-- ============================================================

-- Update updated_at on roof_measurements
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

-- Update updated_at on roof_material_estimates
CREATE OR REPLACE FUNCTION update_roof_material_estimates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_roof_material_estimates_updated_at ON public.roof_material_estimates;
CREATE TRIGGER trg_roof_material_estimates_updated_at
BEFORE UPDATE ON public.roof_material_estimates
FOR EACH ROW
EXECUTE FUNCTION update_roof_material_estimates_updated_at();

-- ============================================================
-- 5. FUNCTION: Auto-calculate material estimates from measurements
-- ============================================================
CREATE OR REPLACE FUNCTION calculate_roof_materials(p_measurement_id uuid)
RETURNS void AS $$
DECLARE
  v_measurement public.roof_measurements%ROWTYPE;
  v_total_squares numeric;
  v_shingle_bundles numeric;
  v_ridge_cap_linear_feet numeric;
  v_underlayment_rolls numeric;
  v_starter_strips numeric;
  v_drip_edge_linear_feet numeric;
  v_ice_water_squares numeric;
  v_nails_boxes numeric;
BEGIN
  -- Get measurement data
  SELECT * INTO v_measurement
  FROM public.roof_measurements
  WHERE id = p_measurement_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Measurement not found';
  END IF;
  
  -- Calculate total squares with waste factor
  v_total_squares := COALESCE(v_measurement.squares, 0) * (1 + COALESCE(v_measurement.waste_factor, 0.1));
  
  -- Calculate materials (standard roofing calculations)
  -- Shingles: 3 bundles per square
  v_shingle_bundles := CEIL(v_total_squares * 3);
  
  -- Ridge cap: 1 linear foot per linear foot of ridge
  v_ridge_cap_linear_feet := COALESCE(v_measurement.ridge_length, 0);
  
  -- Underlayment: 1 roll (432 sq ft) per 4 squares
  v_underlayment_rolls := CEIL(v_total_squares / 4);
  
  -- Starter strips: 1 linear foot per linear foot of eave
  v_starter_strips := COALESCE(v_measurement.eaves_length, 0);
  
  -- Drip edge: eave + rake lengths
  v_drip_edge_linear_feet := COALESCE(v_measurement.eaves_length, 0) + COALESCE(v_measurement.rakes_length, 0);
  
  -- Ice & water shield: typically 3 feet along eaves
  v_ice_water_squares := CEIL((COALESCE(v_measurement.eaves_length, 0) * 3) / 100);
  
  -- Nails: 1 box (70 lbs) per 3 squares
  v_nails_boxes := CEIL(v_total_squares / 3);
  
  -- Delete existing estimates for this measurement
  DELETE FROM public.roof_material_estimates
  WHERE measurement_id = p_measurement_id;
  
  -- Insert new estimates
  INSERT INTO public.roof_material_estimates (measurement_id, job_id, material_type, quantity, unit)
  VALUES
    (p_measurement_id, v_measurement.job_id, 'shingles', v_shingle_bundles, 'bundles'),
    (p_measurement_id, v_measurement.job_id, 'ridge_cap', v_ridge_cap_linear_feet, 'linear_feet'),
    (p_measurement_id, v_measurement.job_id, 'underlayment', v_underlayment_rolls, 'rolls'),
    (p_measurement_id, v_measurement.job_id, 'starter_strips', v_starter_strips, 'linear_feet'),
    (p_measurement_id, v_measurement.job_id, 'drip_edge', v_drip_edge_linear_feet, 'linear_feet'),
    (p_measurement_id, v_measurement.job_id, 'ice_water_shield', v_ice_water_squares, 'squares'),
    (p_measurement_id, v_measurement.job_id, 'nails', v_nails_boxes, 'boxes');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 6. ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.roof_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roof_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roof_material_estimates ENABLE ROW LEVEL SECURITY;

-- Roof measurements: Team members can access measurements for jobs in their teams
DROP POLICY IF EXISTS "roof_measurements_team_member" ON public.roof_measurements;
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

-- Roof photos: Same team access
DROP POLICY IF EXISTS "roof_photos_team_member" ON public.roof_photos;
CREATE POLICY "roof_photos_team_member" ON public.roof_photos
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = roof_photos.job_id AND tm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = roof_photos.job_id AND tm.user_id = auth.uid()
    )
  );

-- Roof material estimates: Same team access
DROP POLICY IF EXISTS "roof_material_estimates_team_member" ON public.roof_material_estimates;
CREATE POLICY "roof_material_estimates_team_member" ON public.roof_material_estimates
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = roof_material_estimates.job_id AND tm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = roof_material_estimates.job_id AND tm.user_id = auth.uid()
    )
  );

-- ============================================================
-- 7. STORAGE BUCKET FOR ROOF PHOTOS
-- ============================================================

-- Create storage bucket for roof photos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'roof-photos',
  'roof-photos',
  false, -- private bucket
  10485760, -- 10 MB limit per file
  ARRAY[
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/gif',
    'image/webp',
    'image/heic',
    'image/heif'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for roof-photos bucket
-- Policy: Team members can upload photos for jobs in their team
CREATE POLICY IF NOT EXISTS "roof_photos_team_member_upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'roof-photos'
    AND EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id::text = (storage.foldername(name))[1]
        AND tm.user_id = auth.uid()
    )
  );

-- Policy: Team members can read photos for jobs in their team
CREATE POLICY IF NOT EXISTS "roof_photos_team_member_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'roof-photos'
    AND EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id::text = (storage.foldername(name))[1]
        AND tm.user_id = auth.uid()
    )
  );

-- Policy: Team members can delete photos for jobs in their team
CREATE POLICY IF NOT EXISTS "roof_photos_team_member_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'roof-photos'
    AND EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id::text = (storage.foldername(name))[1]
        AND tm.user_id = auth.uid()
    )
  );

-- Service role can do everything
CREATE POLICY IF NOT EXISTS "roof_photos_service_role_full_access"
  ON storage.objects
  TO service_role
  FOR ALL
  USING (bucket_id = 'roof-photos')
  WITH CHECK (bucket_id = 'roof-photos');

-- ============================================================
-- 8. STORAGE BUCKET FOR ROOF DIAGRAMS
-- ============================================================

-- Create storage bucket for roof diagrams
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'roof-diagrams',
  'roof-diagrams',
  true, -- public bucket for diagrams
  5242880, -- 5 MB limit per file
  ARRAY[
    'image/svg+xml',
    'image/png',
    'image/jpeg',
    'image/jpg'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for roof-diagrams bucket (public read, authenticated write)
CREATE POLICY IF NOT EXISTS "roof_diagrams_public_read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'roof-diagrams');

CREATE POLICY IF NOT EXISTS "roof_diagrams_authenticated_write"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'roof-diagrams');

-- Service role can do everything
CREATE POLICY IF NOT EXISTS "roof_diagrams_service_role_full_access"
  ON storage.objects
  TO service_role
  FOR ALL
  USING (bucket_id = 'roof-diagrams')
  WITH CHECK (bucket_id = 'roof-diagrams');
































