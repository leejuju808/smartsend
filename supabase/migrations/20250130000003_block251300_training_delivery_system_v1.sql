-- =========================================================
-- Block 251300 — SmartSend Training Delivery System v1
-- "Video Player, PDF Viewer, Auto-Assignment, Progress Tracking"
-- =========================================================
-- 
-- This block delivers:
-- - Training module player (video, PDF, images)
-- - Role-based auto assignment
-- - Training progress auto-tracking
-- - Required module completion rules
-- - Training library UI upgrades
-- - Employee-side course viewer
-- - Office-side analytics dashboard
-- 
-- This is a full e-learning engine tailored for roofing crews.
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE STORAGE BUCKETS
-- ============================================================================

-- Create training-videos bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'training-videos',
  'training-videos',
  false,
  524288000, -- 500MB limit
  ARRAY['video/mp4', 'video/mov', 'video/quicktime', 'video/x-msvideo']
)
ON CONFLICT (id) DO NOTHING;

-- Create training-docs bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'training-docs',
  'training-docs',
  false,
  104857600, -- 100MB limit
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/jpg']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- PART 2 — STORAGE POLICIES
-- ============================================================================

-- Policy: Allow read-only for logged-in users (training videos)
DROP POLICY IF EXISTS "training videos read" ON storage.objects;
CREATE POLICY "training videos read"
ON storage.objects FOR SELECT
USING (bucket_id = 'training-videos' AND auth.role() = 'authenticated');

-- Policy: Allow read-only for logged-in users (training docs)
DROP POLICY IF EXISTS "training docs read" ON storage.objects;
CREATE POLICY "training docs read"
ON storage.objects FOR SELECT
USING (bucket_id = 'training-docs' AND auth.role() = 'authenticated');

-- Policy: Allow authenticated users to upload to training-videos (company admins)
DROP POLICY IF EXISTS "training videos upload" ON storage.objects;
CREATE POLICY "training videos upload"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'training-videos' 
  AND auth.role() = 'authenticated'
);

-- Policy: Allow authenticated users to upload to training-docs (company admins)
DROP POLICY IF EXISTS "training docs upload" ON storage.objects;
CREATE POLICY "training docs upload"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'training-docs' 
  AND auth.role() = 'authenticated'
);

-- ============================================================================
-- PART 3 — UPDATE workforce_training_modules TABLE
-- ============================================================================

-- Add new fields to training modules table
ALTER TABLE public.workforce_training_modules
ADD COLUMN IF NOT EXISTS duration_seconds integer;

ALTER TABLE public.workforce_training_modules
ADD COLUMN IF NOT EXISTS position_order integer DEFAULT 0;

-- Update content_type to include 'image' and 'url' options
ALTER TABLE public.workforce_training_modules
DROP CONSTRAINT IF EXISTS workforce_training_modules_content_type_check;

ALTER TABLE public.workforce_training_modules
ADD CONSTRAINT workforce_training_modules_content_type_check
CHECK (content_type IN ('video', 'pdf', 'slides', 'document', 'link', 'image', 'url'));

-- Add index for ordering
CREATE INDEX IF NOT EXISTS idx_workforce_training_modules_order 
ON public.workforce_training_modules(company_id, position_order);

COMMENT ON COLUMN public.workforce_training_modules.duration_seconds IS 'Duration in seconds for progress tracking (Block 251300)';
COMMENT ON COLUMN public.workforce_training_modules.position_order IS 'Ordering position for module display (Block 251300)';

-- ============================================================================
-- PART 4 — AUTO-ASSIGNMENT FUNCTION
-- ============================================================================

-- Function to auto-assign training modules for new employees
CREATE OR REPLACE FUNCTION public.auto_assign_training(
  employee_role text,
  employee_id uuid,
  company_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.workforce_training_progress (employee_id, module_id, status, company_id)
  SELECT 
    employee_id,
    m.id,
    'not_started',
    company_id
  FROM public.workforce_training_modules m
  WHERE m.company_id = auto_assign_training.company_id
    AND (
      m.required_for_role = 'everyone'
      OR m.required_for_role = employee_role
    )
  ON CONFLICT (employee_id, module_id) DO NOTHING;
END;
$$;

COMMENT ON FUNCTION public.auto_assign_training IS 'Auto-assigns required training modules to new employees based on role (Block 251300)';

-- ============================================================================
-- PART 5 — TRIGGER FOR AUTO-ASSIGNMENT
-- ============================================================================

-- Trigger function to auto-assign training when employee is created
CREATE OR REPLACE FUNCTION public.on_employee_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Auto-assign training modules based on role
  PERFORM public.auto_assign_training(NEW.role, NEW.id, NEW.company_id);
  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS employee_auto_assign_training ON public.workforce_employees;

-- Create trigger
CREATE TRIGGER employee_auto_assign_training
AFTER INSERT ON public.workforce_employees
FOR EACH ROW
EXECUTE FUNCTION public.on_employee_insert();

COMMENT ON TRIGGER employee_auto_assign_training ON public.workforce_employees IS 'Auto-assigns training modules when new employee is created (Block 251300)';

-- ============================================================================
-- PART 6 — ADD company_id TO workforce_training_progress
-- ============================================================================
-- Note: This might already exist, but we'll add it if it doesn't

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'workforce_training_progress' 
    AND column_name = 'company_id'
  ) THEN
    ALTER TABLE public.workforce_training_progress
    ADD COLUMN company_id uuid REFERENCES public.roofing_companies(id) ON DELETE CASCADE;
    
    -- Populate existing rows
    UPDATE public.workforce_training_progress tp
    SET company_id = e.company_id
    FROM public.workforce_employees e
    WHERE tp.employee_id = e.id;
    
    -- Add index
    CREATE INDEX IF NOT EXISTS idx_workforce_training_progress_company 
    ON public.workforce_training_progress(company_id);
  END IF;
END $$;

-- ============================================================================
-- PART 7 — HELPER FUNCTION FOR TRAINING ANALYTICS
-- ============================================================================

-- Function to get employees missing modules (for analytics)
CREATE OR REPLACE FUNCTION public.get_employees_missing_training(
  _company_id uuid,
  _limit integer DEFAULT 10
)
RETURNS TABLE (
  employee_id uuid,
  first_name text,
  last_name text,
  role text,
  completion_percent integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT 
    ts.employee_id,
    ts.first_name,
    ts.last_name,
    ts.role,
    ts.completion_percent
  FROM public.workforce_training_risk ts
  WHERE ts.company_id = _company_id
  ORDER BY ts.completion_percent ASC
  LIMIT _limit;
$$;

COMMENT ON FUNCTION public.get_employees_missing_training IS 'Get employees with lowest training completion (Block 251300)';

-- Function to get training completion by role
CREATE OR REPLACE FUNCTION public.get_training_completion_by_role(
  _company_id uuid
)
RETURNS TABLE (
  role text,
  total_employees integer,
  avg_completion_percent numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT 
    ts.role,
    COUNT(DISTINCT ts.employee_id) as total_employees,
    ROUND(AVG(ts.completion_percent), 1) as avg_completion_percent
  FROM public.workforce_training_risk ts
  WHERE ts.company_id = _company_id
  GROUP BY ts.role
  ORDER BY ts.role;
$$;

COMMENT ON FUNCTION public.get_training_completion_by_role IS 'Get training completion statistics by role (Block 251300)';

-- Function to get company-wide completion percentage
CREATE OR REPLACE FUNCTION public.get_company_training_completion(
  _company_id uuid
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT 
    CASE 
      WHEN COUNT(*) = 0 THEN 0
      ELSE ROUND(AVG(completion_percent), 1)
    END
  FROM public.workforce_training_risk
  WHERE company_id = _company_id;
$$;

COMMENT ON FUNCTION public.get_company_training_completion IS 'Get overall company training completion percentage (Block 251300)';
























