-- Block 247000 — SmartSend Roofing Field Vision v1
-- "Field Vision v1 — Drone Uploads, AR Measurements, Roof Mapping, AI Damage Detection"
-- This block gives SmartSend SUPERPOWERS in the field.
-- This is where SmartSend stops being a CRM and becomes a tech platform roofers can't live without.

-- ============================================================================
-- PART 1 — ROOF SCANS TABLE
-- ============================================================================
-- Stores all roof scan data from drone uploads, AR measurements, and manual uploads

CREATE TABLE IF NOT EXISTS public.roof_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  
  -- Scan metadata
  type text NOT NULL CHECK (type IN ('drone', 'mobile_ar', 'manual_upload')),
  status text NOT NULL DEFAULT 'processing' CHECK (status IN (
    'processing',
    'completed',
    'failed',
    'pending_review'
  )),
  
  -- Measurement data
  total_area numeric, -- Total roof area in square feet
  total_squares numeric, -- Total squares (area / 100)
  pitch text, -- e.g., '4:12', '6:12', 'steep'
  pitch_degrees numeric, -- Pitch in degrees
  
  -- Roof structure data (JSONB for flexibility)
  facets jsonb DEFAULT '[]'::jsonb, -- Array of roof facets with area, pitch per facet
  edges jsonb DEFAULT '[]'::jsonb, -- Ridge, hip, valley, rake lengths in linear feet
  perimeter numeric, -- Total perimeter in feet
  waste_factor numeric DEFAULT 12.0, -- Recommended waste factor percentage
  
  -- Additional metadata
  notes jsonb DEFAULT '{}'::jsonb, -- Custom notes, special instructions, etc.
  processing_metadata jsonb DEFAULT '{}'::jsonb, -- AI processing details, confidence scores
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- Indexes for roof_scans
CREATE INDEX IF NOT EXISTS idx_roof_scans_job_id ON public.roof_scans(job_id);
CREATE INDEX IF NOT EXISTS idx_roof_scans_user_id ON public.roof_scans(user_id);
CREATE INDEX IF NOT EXISTS idx_roof_scans_status ON public.roof_scans(status);
CREATE INDEX IF NOT EXISTS idx_roof_scans_type ON public.roof_scans(type);
CREATE INDEX IF NOT EXISTS idx_roof_scans_created_at ON public.roof_scans(created_at DESC);

-- ============================================================================
-- PART 2 — ROOF IMAGES TABLE
-- ============================================================================
-- Stores all images associated with roof scans (drone photos, AR captures, etc.)

CREATE TABLE IF NOT EXISTS public.roof_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid NOT NULL REFERENCES public.roof_scans(id) ON DELETE CASCADE,
  
  -- Image data
  url text NOT NULL, -- Storage URL (Supabase Storage or external)
  thumbnail_url text, -- Thumbnail URL for faster loading
  image_type text CHECK (image_type IN ('top_down', 'side_elevation', 'video_flyover', 'ar_capture', 'manual_photo')),
  
  -- AI analysis
  ai_tags jsonb DEFAULT '[]'::jsonb, -- AI-detected features: chimneys, skylights, vents, etc.
  annotations jsonb DEFAULT '[]'::jsonb, -- Damage annotations, measurements, notes
  damage_detected boolean DEFAULT false, -- Quick flag for damage presence
  
  -- Image metadata
  file_size bigint, -- File size in bytes
  width integer,
  height integer,
  geolocation jsonb, -- GPS coordinates if available
  captured_at timestamptz, -- When image was captured (from EXIF or user input)
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for roof_images
CREATE INDEX IF NOT EXISTS idx_roof_images_scan_id ON public.roof_images(scan_id);
CREATE INDEX IF NOT EXISTS idx_roof_images_damage_detected ON public.roof_images(damage_detected) WHERE damage_detected = true;
CREATE INDEX IF NOT EXISTS idx_roof_images_image_type ON public.roof_images(image_type);

-- ============================================================================
-- PART 3 — DAMAGE REPORTS TABLE
-- ============================================================================
-- AI-generated damage detection reports with structured data

CREATE TABLE IF NOT EXISTS public.damage_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid NOT NULL REFERENCES public.roof_scans(id) ON DELETE CASCADE,
  
  -- Damage counts
  hail_hits int DEFAULT 0,
  wind_damage int DEFAULT 0, -- Count of lifted/creased shingles
  missing_shingles int DEFAULT 0,
  soft_spots int DEFAULT 0, -- Decking soft spots (inferred)
  nail_pops int DEFAULT 0,
  pipe_boot_cracks int DEFAULT 0,
  flashing_deterioration int DEFAULT 0,
  granule_loss_severity text CHECK (granule_loss_severity IN ('none', 'light', 'moderate', 'severe')),
  
  -- Overall assessment
  damage_severity_score numeric CHECK (damage_severity_score >= 0 AND damage_severity_score <= 100),
  repair_required boolean DEFAULT false,
  replacement_recommended boolean DEFAULT false,
  
  -- AI recommendations
  recommended_actions jsonb DEFAULT '[]'::jsonb, -- Array of repair/replacement recommendations
  insurance_claim_supporting boolean DEFAULT false, -- Whether damage supports insurance claim
  
  -- Detailed damage locations (JSONB for flexibility)
  damage_locations jsonb DEFAULT '[]'::jsonb, -- Array of {type, location, severity, image_id}
  
  -- Processing metadata
  ai_confidence numeric CHECK (ai_confidence >= 0 AND ai_confidence <= 1),
  processing_model text, -- Which AI model was used
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for damage_reports
CREATE INDEX IF NOT EXISTS idx_damage_reports_scan_id ON public.damage_reports(scan_id);
CREATE INDEX IF NOT EXISTS idx_damage_reports_severity ON public.damage_reports(damage_severity_score);
CREATE INDEX IF NOT EXISTS idx_damage_reports_repair_required ON public.damage_reports(repair_required) WHERE repair_required = true;
CREATE INDEX IF NOT EXISTS idx_damage_reports_insurance_support ON public.damage_reports(insurance_claim_supporting) WHERE insurance_claim_supporting = true;

-- ============================================================================
-- PART 4 — AUTO-SCOPE ITEMS TABLE
-- ============================================================================
-- Automatically generated scope items from roof scans

CREATE TABLE IF NOT EXISTS public.field_vision_scope_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid NOT NULL REFERENCES public.roof_scans(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  
  -- Scope item details
  item_type text NOT NULL, -- 'tear_off', 'install', 'ridge_cap', 'starter', 'underlayment', etc.
  item_name text NOT NULL,
  quantity numeric NOT NULL,
  unit text NOT NULL, -- 'squares', 'lf', 'rolls', 'each'
  
  -- Pricing (optional, can be filled from estimate builder)
  unit_price numeric,
  total_price numeric,
  
  -- Status
  status text DEFAULT 'generated' CHECK (status IN ('generated', 'added_to_estimate', 'added_to_po', 'completed')),
  added_to_estimate_id uuid, -- Links to estimate if added
  added_to_po_id uuid, -- Links to PO if added
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for field_vision_scope_items
CREATE INDEX IF NOT EXISTS idx_field_vision_scope_scan_id ON public.field_vision_scope_items(scan_id);
CREATE INDEX IF NOT EXISTS idx_field_vision_scope_job_id ON public.field_vision_scope_items(job_id);
CREATE INDEX IF NOT EXISTS idx_field_vision_scope_status ON public.field_vision_scope_items(status);
CREATE INDEX IF NOT EXISTS idx_field_vision_scope_item_type ON public.field_vision_scope_items(item_type);

-- ============================================================================
-- PART 5 — AR MEASUREMENT DATA TABLE
-- ============================================================================
-- Stores AR measurement data from mobile app

CREATE TABLE IF NOT EXISTS public.ar_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid REFERENCES public.roof_scans(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  
  -- Measurement data
  measurement_type text NOT NULL CHECK (measurement_type IN (
    'roof_edge',
    'siding',
    'gutter',
    'fascia',
    'window',
    'door',
    'chimney',
    'skylight',
    'other'
  )),
  length_feet numeric NOT NULL, -- Measured length in feet
  width_feet numeric, -- Width if applicable
  height_feet numeric, -- Height if applicable
  
  -- AR metadata
  accuracy_percent numeric, -- AR measurement accuracy (1-2% typical)
  device_type text, -- 'ios', 'android'
  ar_platform text, -- 'arkit', 'arcore'
  geolocation jsonb, -- GPS coordinates where measurement was taken
  
  -- Visual reference
  image_url text, -- Screenshot of AR measurement overlay
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for ar_measurements
CREATE INDEX IF NOT EXISTS idx_ar_measurements_scan_id ON public.ar_measurements(scan_id);
CREATE INDEX IF NOT EXISTS idx_ar_measurements_job_id ON public.ar_measurements(job_id);
CREATE INDEX IF NOT EXISTS idx_ar_measurements_user_id ON public.ar_measurements(user_id);
CREATE INDEX IF NOT EXISTS idx_ar_measurements_type ON public.ar_measurements(measurement_type);

-- ============================================================================
-- PART 6 — DATABASE FUNCTIONS
-- ============================================================================

-- Function: Generate auto-scope items from roof scan
CREATE OR REPLACE FUNCTION public.generate_auto_scope_from_scan(p_scan_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_scan record;
  v_scope_items jsonb := '[]'::jsonb;
  v_squares numeric;
  v_ridge_lf numeric;
  v_perimeter_lf numeric;
BEGIN
  -- Get scan data
  SELECT * INTO v_scan
  FROM public.roof_scans
  WHERE id = p_scan_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Scan not found');
  END IF;
  
  v_squares := COALESCE(v_scan.total_squares, v_scan.total_area / 100.0);
  
  -- Extract edge lengths from JSONB
  SELECT COALESCE((edges->>'ridge_lf')::numeric, 0) INTO v_ridge_lf
  FROM public.roof_scans
  WHERE id = p_scan_id;
  
  v_perimeter_lf := COALESCE(v_scan.perimeter, 0);
  
  -- Generate scope items
  -- Tear-off squares
  INSERT INTO public.field_vision_scope_items (scan_id, job_id, item_type, item_name, quantity, unit)
  VALUES (p_scan_id, v_scan.job_id, 'tear_off', 'Tear-off existing roof', v_squares, 'squares');
  
  -- Install squares
  INSERT INTO public.field_vision_scope_items (scan_id, job_id, item_type, item_name, quantity, unit)
  VALUES (p_scan_id, v_scan.job_id, 'install', 'Install new shingles', v_squares, 'squares');
  
  -- Ridge cap (if ridge length available)
  IF v_ridge_lf > 0 THEN
    INSERT INTO public.field_vision_scope_items (scan_id, job_id, item_type, item_name, quantity, unit)
    VALUES (p_scan_id, v_scan.job_id, 'ridge_cap', 'Ridge cap', v_ridge_lf, 'lf');
  END IF;
  
  -- Starter (perimeter)
  IF v_perimeter_lf > 0 THEN
    INSERT INTO public.field_vision_scope_items (scan_id, job_id, item_type, item_name, quantity, unit)
    VALUES (p_scan_id, v_scan.job_id, 'starter', 'Starter strip', v_perimeter_lf, 'lf');
  END IF;
  
  -- Underlayment (squares with waste factor)
  INSERT INTO public.field_vision_scope_items (scan_id, job_id, item_type, item_name, quantity, unit)
  VALUES (p_scan_id, v_scan.job_id, 'underlayment', 'Synthetic underlayment', 
          CEIL(v_squares * (1 + COALESCE(v_scan.waste_factor, 12.0) / 100.0)), 'squares');
  
  -- Ice & water shield (eaves and valleys)
  INSERT INTO public.field_vision_scope_items (scan_id, job_id, item_type, item_name, quantity, unit)
  VALUES (p_scan_id, v_scan.job_id, 'ice_water', 'Ice & water shield', 
          CEIL(v_squares * 0.15), 'squares'); -- Typical 15% coverage
  
  -- Drip edge (perimeter)
  IF v_perimeter_lf > 0 THEN
    INSERT INTO public.field_vision_scope_items (scan_id, job_id, item_type, item_name, quantity, unit)
    VALUES (p_scan_id, v_scan.job_id, 'drip_edge', 'Drip edge', v_perimeter_lf, 'lf');
  END IF;
  
  -- Return generated items
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'item_type', item_type,
      'item_name', item_name,
      'quantity', quantity,
      'unit', unit
    )
  ) INTO v_scope_items
  FROM public.field_vision_scope_items
  WHERE scan_id = p_scan_id AND status = 'generated';
  
  RETURN jsonb_build_object('success', true, 'items', v_scope_items);
END;
$$;

-- Function: Update instant estimate from roof scan
CREATE OR REPLACE FUNCTION public.update_estimate_from_scan(p_scan_id uuid, p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_scan record;
  v_estimate_id uuid;
  v_squares numeric;
BEGIN
  -- Get scan data
  SELECT * INTO v_scan
  FROM public.roof_scans
  WHERE id = p_scan_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Scan not found');
  END IF;
  
  v_squares := COALESCE(v_scan.total_squares, v_scan.total_area / 100.0);
  
  -- Find or create instant estimate
  SELECT id INTO v_estimate_id
  FROM public.instant_estimates
  WHERE lead_id = p_lead_id
  ORDER BY created_at DESC
  LIMIT 1;
  
  -- If estimate exists, update it with scan data
  IF v_estimate_id IS NOT NULL THEN
    UPDATE public.instant_estimates
    SET 
      inputs = jsonb_build_object(
        'squares', v_squares,
        'pitch', v_scan.pitch,
        'area', v_scan.total_area,
        'scan_id', p_scan_id
      ),
      updated_at = now()
    WHERE id = v_estimate_id;
    
    RETURN jsonb_build_object('success', true, 'estimate_id', v_estimate_id, 'updated', true);
  END IF;
  
  RETURN jsonb_build_object('success', true, 'estimate_id', NULL, 'updated', false);
END;
$$;

-- Function: Calculate roof measurements summary
CREATE OR REPLACE FUNCTION public.get_roof_scan_summary(p_scan_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_scan record;
  v_images_count int;
  v_damage_report record;
  v_scope_items_count int;
  v_result jsonb;
BEGIN
  -- Get scan
  SELECT * INTO v_scan
  FROM public.roof_scans
  WHERE id = p_scan_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Scan not found');
  END IF;
  
  -- Count images
  SELECT COUNT(*) INTO v_images_count
  FROM public.roof_images
  WHERE scan_id = p_scan_id;
  
  -- Get damage report
  SELECT * INTO v_damage_report
  FROM public.damage_reports
  WHERE scan_id = p_scan_id
  ORDER BY created_at DESC
  LIMIT 1;
  
  -- Count scope items
  SELECT COUNT(*) INTO v_scope_items_count
  FROM public.field_vision_scope_items
  WHERE scan_id = p_scan_id;
  
  -- Build result
  v_result := jsonb_build_object(
    'scan_id', p_scan_id,
    'status', v_scan.status,
    'total_area', v_scan.total_area,
    'total_squares', v_scan.total_squares,
    'pitch', v_scan.pitch,
    'images_count', v_images_count,
    'damage_detected', CASE WHEN v_damage_report.id IS NOT NULL THEN true ELSE false END,
    'damage_severity', COALESCE(v_damage_report.damage_severity_score, 0),
    'scope_items_count', v_scope_items_count,
    'created_at', v_scan.created_at,
    'completed_at', v_scan.completed_at
  );
  
  RETURN v_result;
END;
$$;

-- ============================================================================
-- PART 7 — TRIGGERS
-- ============================================================================

-- Trigger: Update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_roof_scans_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_roof_scans_updated_at
BEFORE UPDATE ON public.roof_scans
FOR EACH ROW
EXECUTE FUNCTION public.update_roof_scans_updated_at();

-- Trigger: Update damage_reports updated_at
CREATE OR REPLACE FUNCTION public.update_damage_reports_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_damage_reports_updated_at
BEFORE UPDATE ON public.damage_reports
FOR EACH ROW
EXECUTE FUNCTION public.update_damage_reports_updated_at();

-- Trigger: Update field_vision_scope_items updated_at
CREATE OR REPLACE FUNCTION public.update_field_vision_scope_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_field_vision_scope_updated_at
BEFORE UPDATE ON public.field_vision_scope_items
FOR EACH ROW
EXECUTE FUNCTION public.update_field_vision_scope_updated_at();

-- Trigger: Auto-generate scope items when scan completes
CREATE OR REPLACE FUNCTION public.auto_generate_scope_on_scan_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- When scan status changes to 'completed', auto-generate scope items
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    PERFORM public.generate_auto_scope_from_scan(NEW.id);
    
    -- Update completed_at timestamp
    NEW.completed_at = now();
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_generate_scope_on_complete
AFTER UPDATE OF status ON public.roof_scans
FOR EACH ROW
WHEN (NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed'))
EXECUTE FUNCTION public.auto_generate_scope_on_scan_complete();

-- ============================================================================
-- PART 8 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.roof_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roof_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.damage_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_vision_scope_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ar_measurements ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view roof_scans for jobs in their workspace
CREATE POLICY "Users can view roof_scans for their jobs"
  ON public.roof_scans
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.jobs j
      JOIN public.workspace_members wm ON wm.workspace_id = j.workspace_id
      WHERE j.id = roof_scans.job_id
        AND wm.user_id = auth.uid()
    )
    OR user_id = auth.uid()
  );

-- RLS Policy: Users can insert roof_scans for their jobs
CREATE POLICY "Users can create roof_scans for their jobs"
  ON public.roof_scans
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.jobs j
      JOIN public.workspace_members wm ON wm.workspace_id = j.workspace_id
      WHERE j.id = roof_scans.job_id
        AND wm.user_id = auth.uid()
    )
    OR user_id = auth.uid()
  );

-- RLS Policy: Users can update roof_scans they created or for their jobs
CREATE POLICY "Users can update their roof_scans"
  ON public.roof_scans
  FOR UPDATE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.jobs j
      JOIN public.workspace_members wm ON wm.workspace_id = j.workspace_id
      WHERE j.id = roof_scans.job_id
        AND wm.user_id = auth.uid()
    )
  );

-- RLS Policy: Users can view roof_images for scans they can access
CREATE POLICY "Users can view roof_images for accessible scans"
  ON public.roof_images
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.roof_scans rs
      JOIN public.jobs j ON j.id = rs.job_id
      JOIN public.workspace_members wm ON wm.workspace_id = j.workspace_id
      WHERE rs.id = roof_images.scan_id
        AND wm.user_id = auth.uid()
    )
  );

-- RLS Policy: Users can insert roof_images for scans they can access
CREATE POLICY "Users can create roof_images for accessible scans"
  ON public.roof_images
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.roof_scans rs
      JOIN public.jobs j ON j.id = rs.job_id
      JOIN public.workspace_members wm ON wm.workspace_id = j.workspace_id
      WHERE rs.id = roof_images.scan_id
        AND wm.user_id = auth.uid()
    )
  );

-- RLS Policy: Users can view damage_reports for scans they can access
CREATE POLICY "Users can view damage_reports for accessible scans"
  ON public.damage_reports
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.roof_scans rs
      JOIN public.jobs j ON j.id = rs.job_id
      JOIN public.workspace_members wm ON wm.workspace_id = j.workspace_id
      WHERE rs.id = damage_reports.scan_id
        AND wm.user_id = auth.uid()
    )
  );

-- RLS Policy: Users can insert/update damage_reports for scans they can access
CREATE POLICY "Users can manage damage_reports for accessible scans"
  ON public.damage_reports
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.roof_scans rs
      JOIN public.jobs j ON j.id = rs.job_id
      JOIN public.workspace_members wm ON wm.workspace_id = j.workspace_id
      WHERE rs.id = damage_reports.scan_id
        AND wm.user_id = auth.uid()
    )
  );

-- RLS Policy: Users can view field_vision_scope_items for scans they can access
CREATE POLICY "Users can view scope_items for accessible scans"
  ON public.field_vision_scope_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.roof_scans rs
      JOIN public.jobs j ON j.id = rs.job_id
      JOIN public.workspace_members wm ON wm.workspace_id = j.workspace_id
      WHERE rs.id = field_vision_scope_items.scan_id
        AND wm.user_id = auth.uid()
    )
  );

-- RLS Policy: Users can manage scope_items for scans they can access
CREATE POLICY "Users can manage scope_items for accessible scans"
  ON public.field_vision_scope_items
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.roof_scans rs
      JOIN public.jobs j ON j.id = rs.job_id
      JOIN public.workspace_members wm ON wm.workspace_id = j.workspace_id
      WHERE rs.id = field_vision_scope_items.scan_id
        AND wm.user_id = auth.uid()
    )
  );

-- RLS Policy: Users can view ar_measurements for jobs they can access
CREATE POLICY "Users can view ar_measurements for accessible jobs"
  ON public.ar_measurements
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.jobs j
      JOIN public.workspace_members wm ON wm.workspace_id = j.workspace_id
      WHERE j.id = ar_measurements.job_id
        AND wm.user_id = auth.uid()
    )
  );

-- RLS Policy: Users can insert ar_measurements for jobs they can access
CREATE POLICY "Users can create ar_measurements for accessible jobs"
  ON public.ar_measurements
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.jobs j
      JOIN public.workspace_members wm ON wm.workspace_id = j.workspace_id
      WHERE j.id = ar_measurements.job_id
        AND wm.user_id = auth.uid()
    )
  );

-- Service role has full access (for background processing)
CREATE POLICY "Service role has full access to roof_scans"
  ON public.roof_scans
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role has full access to roof_images"
  ON public.roof_images
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role has full access to damage_reports"
  ON public.damage_reports
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role has full access to field_vision_scope_items"
  ON public.field_vision_scope_items
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role has full access to ar_measurements"
  ON public.ar_measurements
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- PART 9 — COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE public.roof_scans IS 'Field Vision v1: Stores roof scan data from drone uploads, AR measurements, and manual uploads';
COMMENT ON TABLE public.roof_images IS 'Field Vision v1: Stores images associated with roof scans with AI analysis';
COMMENT ON TABLE public.damage_reports IS 'Field Vision v1: AI-generated damage detection reports with structured data';
COMMENT ON TABLE public.field_vision_scope_items IS 'Field Vision v1: Automatically generated scope items from roof scans';
COMMENT ON TABLE public.ar_measurements IS 'Field Vision v1: AR measurement data from mobile app';

COMMENT ON FUNCTION public.generate_auto_scope_from_scan IS 'Auto-generates scope items (tear-off, install, ridge cap, etc.) from completed roof scan';
COMMENT ON FUNCTION public.update_estimate_from_scan IS 'Updates instant estimate with roof scan measurement data';
COMMENT ON FUNCTION public.get_roof_scan_summary IS 'Returns comprehensive summary of roof scan including measurements, images, damage, and scope items';

























