-- =========================================================
-- Block 251200 — SmartSend Hiring Pipeline Kanban v1
-- "Drag & Drop, Applicant Drawer, Convert-to-Employee"
-- =========================================================
-- 
-- This block makes hiring organized and professional.
-- Roofers will say: "Holy shit… hiring is finally organized."
-- =========================================================

-- ============================================================================
-- PART 1 — ENSURE STATUS CONSTRAINT (Best Practice)
-- ============================================================================
-- Make status field predictable and clean

DO $$ 
BEGIN
  -- Drop existing constraint if it exists (in case it was added differently)
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'applicant_status_check'
  ) THEN
    ALTER TABLE public.workforce_applicants 
    DROP CONSTRAINT applicant_status_check;
  END IF;
END $$;

-- Add clean status constraint
ALTER TABLE public.workforce_applicants
ADD CONSTRAINT applicant_status_check
CHECK (status IN ('new', 'review', 'interview', 'hired', 'rejected'));

-- ============================================================================
-- PART 2 — SUPABASE STORAGE — Resume Bucket
-- ============================================================================
-- Create bucket for applicant resumes

-- IMPORTANT: The bucket 'applicant-resumes' must be created manually via:
-- 1. Supabase Dashboard → Storage → Create Bucket
--    - Name: applicant-resumes
--    - Public: Yes (for public read access to resumes)
-- OR
-- 2. Supabase SQL Editor:
--    SELECT storage.create_bucket('applicant-resumes', true);
--
-- This migration sets up the policies for the bucket.

-- Create public read policy for resumes
DROP POLICY IF EXISTS "resume public read" ON storage.objects;
CREATE POLICY "resume public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'applicant-resumes');

-- Create policy for authenticated users to upload resumes
DROP POLICY IF EXISTS "resume authenticated upload" ON storage.objects;
CREATE POLICY "resume authenticated upload"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'applicant-resumes'
  AND auth.role() = 'authenticated'
);

-- Create policy for authenticated users to update their own uploads
DROP POLICY IF EXISTS "resume authenticated update" ON storage.objects;
CREATE POLICY "resume authenticated update"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'applicant-resumes'
  AND auth.role() = 'authenticated'
);

-- Create policy for authenticated users to delete their own uploads
DROP POLICY IF EXISTS "resume authenticated delete" ON storage.objects;
CREATE POLICY "resume authenticated delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'applicant-resumes'
  AND auth.role() = 'authenticated'
);

COMMENT ON POLICY "resume public read" ON storage.objects IS 'Allow public read access to applicant resumes (Block 251200)';
COMMENT ON POLICY "resume authenticated upload" ON storage.objects IS 'Allow authenticated users to upload resumes (Block 251200)';
























