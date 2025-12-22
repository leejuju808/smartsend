-- =========================================================
-- Block 251800 — SmartSend Material Verification System v1
-- "Delivery Proof, Shortage Alerts, Wrong Material Flags, Supplier Dispute Protection"
-- =========================================================
-- 
-- This is one of the BIGGEST MONEY-SAVING features for roofing companies.
-- Material mistakes cost roofers thousands every year.
-- SmartSend fixes it.
-- 
-- Roofers will say:
-- "We finally have proof of materials delivered AND installed.
-- No more suppliers screwing us, no more crews guessing."
-- 
-- This is how SmartSend becomes the standard for production.
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE material_items TABLE
-- ============================================================================
-- Materials expected on job (created by office/estimator)

CREATE TABLE IF NOT EXISTS public.material_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  name text NOT NULL,                    -- e.g., "GAF Timberline HDZ - Black"
  quantity_expected numeric NOT NULL,
  unit text,                             -- bundles, pieces, rolls, squares, etc.
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_material_items_job ON public.material_items(job_id);
CREATE INDEX IF NOT EXISTS idx_material_items_created ON public.material_items(created_at DESC);

COMMENT ON TABLE public.material_items IS 'Materials expected on job (Block 251800)';
COMMENT ON COLUMN public.material_items.name IS 'Material name, e.g., "GAF Timberline HDZ - Black"';
COMMENT ON COLUMN public.material_items.unit IS 'Unit of measurement: bundles, pieces, rolls, squares, etc.';

-- ============================================================================
-- PART 2 — CREATE material_delivery_records TABLE
-- ============================================================================
-- Delivery proof (photos + checklists)

CREATE TABLE IF NOT EXISTS public.material_delivery_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  delivered_at timestamptz DEFAULT now(),
  supplier text,                         -- ABC, SRS, Beacon, etc.
  employee_id uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  photo_url text,                        -- delivery photo URL
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_material_delivery_records_job ON public.material_delivery_records(job_id);
CREATE INDEX IF NOT EXISTS idx_material_delivery_records_employee ON public.material_delivery_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_material_delivery_records_delivered ON public.material_delivery_records(delivered_at DESC);

COMMENT ON TABLE public.material_delivery_records IS 'Delivery proof with photos and notes (Block 251800)';
COMMENT ON COLUMN public.material_delivery_records.supplier IS 'Supplier name: ABC, SRS, Beacon, etc.';

-- ============================================================================
-- PART 3 — CREATE material_verification TABLE
-- ============================================================================
-- Crew confirms counts (during job)

CREATE TABLE IF NOT EXISTS public.material_verification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  material_item_id uuid NOT NULL REFERENCES public.material_items(id) ON DELETE CASCADE,
  quantity_found numeric,
  verified_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  verified_at timestamptz DEFAULT now(),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'matched', 'shortage', 'wrong_material', 'extra')),
  photo_url text,                        -- verification photo
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_material_verification_job ON public.material_verification(job_id);
CREATE INDEX IF NOT EXISTS idx_material_verification_item ON public.material_verification(material_item_id);
CREATE INDEX IF NOT EXISTS idx_material_verification_status ON public.material_verification(status);
CREATE INDEX IF NOT EXISTS idx_material_verification_verified_by ON public.material_verification(verified_by);

COMMENT ON TABLE public.material_verification IS 'Crew verification of materials (Block 251800)';
COMMENT ON COLUMN public.material_verification.status IS 'Status: pending, matched, shortage, wrong_material, extra';

-- ============================================================================
-- PART 4 — CREATE material_verification_approval TABLE
-- ============================================================================
-- Office-level approval workflow

CREATE TABLE IF NOT EXISTS public.material_verification_approval (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz DEFAULT now(),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'needs_reverification')),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_material_verification_approval_job ON public.material_verification_approval(job_id);
CREATE INDEX IF NOT EXISTS idx_material_verification_approval_status ON public.material_verification_approval(status);

COMMENT ON TABLE public.material_verification_approval IS 'Office-level approval workflow (Block 251800)';

-- ============================================================================
-- PART 5 — TRIGGERS
-- ============================================================================

-- Update updated_at on material_items
CREATE OR REPLACE FUNCTION update_material_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_material_items_updated_at ON public.material_items;
CREATE TRIGGER trg_material_items_updated_at
BEFORE UPDATE ON public.material_items
FOR EACH ROW
EXECUTE FUNCTION update_material_items_updated_at();

-- Update updated_at on material_delivery_records
CREATE OR REPLACE FUNCTION update_material_delivery_records_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_material_delivery_records_updated_at ON public.material_delivery_records;
CREATE TRIGGER trg_material_delivery_records_updated_at
BEFORE UPDATE ON public.material_delivery_records
FOR EACH ROW
EXECUTE FUNCTION update_material_delivery_records_updated_at();

-- Update updated_at on material_verification
CREATE OR REPLACE FUNCTION update_material_verification_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_material_verification_updated_at ON public.material_verification;
CREATE TRIGGER trg_material_verification_updated_at
BEFORE UPDATE ON public.material_verification
FOR EACH ROW
EXECUTE FUNCTION update_material_verification_updated_at();

-- Update updated_at on material_verification_approval
CREATE OR REPLACE FUNCTION update_material_verification_approval_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_material_verification_approval_updated_at ON public.material_verification_approval;
CREATE TRIGGER trg_material_verification_approval_updated_at
BEFORE UPDATE ON public.material_verification_approval
FOR EACH ROW
EXECUTE FUNCTION update_material_verification_approval_updated_at();

-- ============================================================================
-- PART 6 — AUTO-FLAG LOGIC FUNCTION
-- ============================================================================
-- Auto-evaluate material status based on expected vs found

CREATE OR REPLACE FUNCTION evaluate_material_status(
  expected numeric,
  found numeric
) RETURNS text AS $$
BEGIN
  IF found = expected THEN 
    RETURN 'matched';
  ELSIF found < expected THEN 
    RETURN 'shortage';
  ELSE 
    RETURN 'extra';
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION evaluate_material_status IS 'Auto-evaluates material status: matched, shortage, or extra (Block 251800)';

-- ============================================================================
-- PART 7 — MATERIAL STATUS VIEW
-- ============================================================================
-- Dashboard queries become trivial

CREATE OR REPLACE VIEW job_material_status AS
SELECT
  j.id as job_id,
  i.id as material_item_id,
  i.name,
  i.quantity_expected,
  i.unit,
  v.quantity_found,
  v.status,
  v.verified_at,
  v.verified_by,
  e.first_name || ' ' || e.last_name as verified_by_name,
  dr.supplier,
  dr.delivered_at,
  dr.photo_url as delivery_photo_url,
  v.photo_url as verification_photo_url
FROM public.jobs j
LEFT JOIN public.material_items i ON i.job_id = j.id
LEFT JOIN public.material_verification v ON v.material_item_id = i.id
LEFT JOIN public.workforce_employees e ON e.id = v.verified_by
LEFT JOIN public.material_delivery_records dr ON dr.job_id = j.id;

COMMENT ON VIEW job_material_status IS 'Material status view for dashboard queries (Block 251800)';

-- ============================================================================
-- PART 8 — MATERIAL RISK SCORE FUNCTION
-- ============================================================================
-- Calculate material risk score for a job

CREATE OR REPLACE FUNCTION calculate_material_risk_score(p_job_id uuid)
RETURNS numeric AS $$
DECLARE
  v_shortages int;
  v_wrong_materials int;
  v_risk_score numeric;
BEGIN
  -- Count shortages
  SELECT COUNT(*) INTO v_shortages
  FROM public.material_verification
  WHERE job_id = p_job_id AND status = 'shortage';
  
  -- Count wrong materials
  SELECT COUNT(*) INTO v_wrong_materials
  FROM public.material_verification
  WHERE job_id = p_job_id AND status = 'wrong_material';
  
  -- Calculate risk score: (# shortages * 10) + (# wrong_materials * 15)
  v_risk_score := (v_shortages * 10) + (v_wrong_materials * 15);
  
  RETURN v_risk_score;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_material_risk_score IS 'Calculates material risk score: (# shortages * 10) + (# wrong_materials * 15) (Block 251800)';

-- ============================================================================
-- PART 9 — MATERIAL HEALTH PERCENTAGE FUNCTION
-- ============================================================================
-- Calculate material health percentage for a job

CREATE OR REPLACE FUNCTION calculate_material_health_percentage(p_job_id uuid)
RETURNS numeric AS $$
DECLARE
  v_total_items int;
  v_matched_items int;
  v_health_percentage numeric;
BEGIN
  -- Count total material items
  SELECT COUNT(*) INTO v_total_items
  FROM public.material_items
  WHERE job_id = p_job_id;
  
  -- Count matched items
  SELECT COUNT(*) INTO v_matched_items
  FROM public.material_verification
  WHERE job_id = p_job_id AND status = 'matched';
  
  -- Calculate health percentage
  IF v_total_items = 0 THEN
    v_health_percentage := 100;
  ELSE
    v_health_percentage := ROUND((v_matched_items::numeric / v_total_items::numeric) * 100, 2);
  END IF;
  
  RETURN v_health_percentage;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_material_health_percentage IS 'Calculates material health percentage: (matched / total) * 100 (Block 251800)';

-- ============================================================================
-- PART 10 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.material_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_delivery_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_verification ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_verification_approval ENABLE ROW LEVEL SECURITY;

-- Material items: Team members can access items for jobs in their teams
-- Note: This assumes jobs table has team_id. Adjust based on your schema.
DROP POLICY IF EXISTS "material_items_team_member" ON public.material_items;
CREATE POLICY "material_items_team_member" ON public.material_items
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.jobs j
      LEFT JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = material_items.job_id 
        AND (tm.user_id = auth.uid() OR j.team_id IS NULL)
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.jobs j
      LEFT JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = material_items.job_id 
        AND (tm.user_id = auth.uid() OR j.team_id IS NULL)
    )
  );

-- Material delivery records: Same access
DROP POLICY IF EXISTS "material_delivery_records_team_member" ON public.material_delivery_records;
CREATE POLICY "material_delivery_records_team_member" ON public.material_delivery_records
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.jobs j
      LEFT JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = material_delivery_records.job_id 
        AND (tm.user_id = auth.uid() OR j.team_id IS NULL)
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.jobs j
      LEFT JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = material_delivery_records.job_id 
        AND (tm.user_id = auth.uid() OR j.team_id IS NULL)
    )
  );

-- Material verification: Same access
DROP POLICY IF EXISTS "material_verification_team_member" ON public.material_verification;
CREATE POLICY "material_verification_team_member" ON public.material_verification
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.jobs j
      LEFT JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = material_verification.job_id 
        AND (tm.user_id = auth.uid() OR j.team_id IS NULL)
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.jobs j
      LEFT JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = material_verification.job_id 
        AND (tm.user_id = auth.uid() OR j.team_id IS NULL)
    )
  );

-- Material verification approval: Same access
DROP POLICY IF EXISTS "material_verification_approval_team_member" ON public.material_verification_approval;
CREATE POLICY "material_verification_approval_team_member" ON public.material_verification_approval
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.jobs j
      LEFT JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = material_verification_approval.job_id 
        AND (tm.user_id = auth.uid() OR j.team_id IS NULL)
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.jobs j
      LEFT JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = material_verification_approval.job_id 
        AND (tm.user_id = auth.uid() OR j.team_id IS NULL)
    )
  );

-- Service role can do everything (for edge functions)
DROP POLICY IF EXISTS "material_items_service_role" ON public.material_items;
CREATE POLICY "material_items_service_role" ON public.material_items
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "material_delivery_records_service_role" ON public.material_delivery_records;
CREATE POLICY "material_delivery_records_service_role" ON public.material_delivery_records
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "material_verification_service_role" ON public.material_verification;
CREATE POLICY "material_verification_service_role" ON public.material_verification
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "material_verification_approval_service_role" ON public.material_verification_approval;
CREATE POLICY "material_verification_approval_service_role" ON public.material_verification_approval
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 11 — STORAGE BUCKET FOR MATERIAL PHOTOS
-- ============================================================================

-- Create storage bucket for material photos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'material-photos',
  'material-photos',
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

-- Storage policies for material-photos bucket
-- Policy: Team members can upload photos for jobs in their team
CREATE POLICY IF NOT EXISTS "material_photos_team_member_upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'material-photos'
    AND EXISTS(
      SELECT 1 FROM public.jobs j
      LEFT JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id::text = (storage.foldername(name))[1]
        AND (tm.user_id = auth.uid() OR j.team_id IS NULL)
    )
  );

-- Policy: Team members can read photos for jobs in their team
CREATE POLICY IF NOT EXISTS "material_photos_team_member_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'material-photos'
    AND EXISTS(
      SELECT 1 FROM public.jobs j
      LEFT JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id::text = (storage.foldername(name))[1]
        AND (tm.user_id = auth.uid() OR j.team_id IS NULL)
    )
  );

-- Policy: Team members can delete photos for jobs in their team
CREATE POLICY IF NOT EXISTS "material_photos_team_member_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'material-photos'
    AND EXISTS(
      SELECT 1 FROM public.jobs j
      LEFT JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id::text = (storage.foldername(name))[1]
        AND (tm.user_id = auth.uid() OR j.team_id IS NULL)
    )
  );

-- Service role can do everything
CREATE POLICY IF NOT EXISTS "material_photos_service_role_full_access"
  ON storage.objects
  TO service_role
  FOR ALL
  USING (bucket_id = 'material-photos')
  WITH CHECK (bucket_id = 'material-photos');
























