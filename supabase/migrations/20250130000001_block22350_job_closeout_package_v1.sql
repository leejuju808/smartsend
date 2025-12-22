-- =========================================================
-- Block 22350 — SmartSend Roofing Job Closeout Package v1
-- (Homeowner Completion Report Auto-Generated)
-- =========================================================
-- 
-- At job completion, SmartSend automatically generates a Homeowner Closeout Package:
-- - Before & after photos
-- - Summary of work completed
-- - Materials used
-- - Warranty info
-- - Final invoice
-- - Payment status
-- - Crew notes
-- - Permit information
-- - Insurance documentation (if applicable)
-- 
-- This becomes the roofer's professional handoff and instantly boosts reputation, referrals, and 5-star reviews.

-- ============================================================================
-- PART 1 — ADD CLOSEOUT FIELDS TO roofing_jobs TABLE
-- ============================================================================

ALTER TABLE public.roofing_jobs
  ADD COLUMN IF NOT EXISTS closeout_generated boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS closeout_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS closeout_url text,
  ADD COLUMN IF NOT EXISTS homeowner_review_link text,
  ADD COLUMN IF NOT EXISTS closeout_token text;

-- Index for looking up jobs by closeout token
CREATE INDEX IF NOT EXISTS idx_roofing_jobs_closeout_token 
  ON public.roofing_jobs(closeout_token) 
  WHERE closeout_token IS NOT NULL;

-- Index for filtering jobs with closeout packages
CREATE INDEX IF NOT EXISTS idx_roofing_jobs_closeout_generated 
  ON public.roofing_jobs(closeout_generated) 
  WHERE closeout_generated = true;

-- ============================================================================
-- PART 2 — TRIGGER FUNCTION — Generate Closeout Token on Job Completion
-- ============================================================================
-- When a job status changes to 'completed', automatically generate a unique token
-- for the public closeout page

CREATE OR REPLACE FUNCTION public.job_generate_closeout_token()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only generate token when status changes from non-completed to completed
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    -- Generate a unique hex token (32 characters)
    NEW.closeout_token := encode(gen_random_bytes(16), 'hex');
    -- Reset generation flags (will be set when package is actually generated)
    NEW.closeout_generated := false;
    NEW.closeout_generated_at := NULL;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop trigger if it exists and recreate
DROP TRIGGER IF EXISTS job_closeout_token_trigger ON public.roofing_jobs;
CREATE TRIGGER job_closeout_token_trigger
  BEFORE UPDATE ON public.roofing_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.job_generate_closeout_token();

-- ============================================================================
-- PART 3 — COMMENTS
-- ============================================================================

COMMENT ON COLUMN public.roofing_jobs.closeout_generated IS 'Block 22350: Whether the closeout package has been generated';
COMMENT ON COLUMN public.roofing_jobs.closeout_generated_at IS 'Block 22350: Timestamp when closeout package was generated';
COMMENT ON COLUMN public.roofing_jobs.closeout_url IS 'Block 22350: Public URL to the closeout package page';
COMMENT ON COLUMN public.roofing_jobs.homeowner_review_link IS 'Block 22350: Optional Google review link customized for this job';
COMMENT ON COLUMN public.roofing_jobs.closeout_token IS 'Block 22350: Unique token for public closeout page access';








































