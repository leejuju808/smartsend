-- =========================================================
-- Block 19770 — Inbox ROI Engine v1
-- (Tracking Booked Revenue, Estimating Job Value, Showing Roofers the Money SmartSend Drives)
-- =========================================================
--
-- This block adds the feature that MATTERS MOST to roofing companies:
-- "How much money did SmartSend make me?"
--
-- We're wiring:
-- - Revenue tracking
-- - Job value estimation
-- - Conversion logging
-- - ROI dashboard hooks
-- - Automatic job-value suggestions
-- - Pipeline value preview
-- - A simple "Money Counter" tied to the Inbox
-- =========================================================

-- ============================================================================
-- 1. ENHANCE jobs_conversions TABLE
-- ============================================================================
-- Add fields for structured job tracking and pipeline management

-- Job type enum
CREATE TYPE IF NOT EXISTS job_type AS ENUM (
  'roof_replacement',
  'roof_repair',
  'storm_damage_claim',
  'new_construction',
  'gutter_roof_package',
  'other'
);

-- Pipeline stage enum (extends conversion_type)
CREATE TYPE IF NOT EXISTS pipeline_stage AS ENUM (
  'booked',  -- Initial booking (booked_estimate)
  'pending', -- In progress
  'won',     -- Job won (closed successfully)
  'lost'     -- Job lost
);

-- Add new columns to jobs_conversions
ALTER TABLE IF EXISTS public.jobs_conversions
  ADD COLUMN IF NOT EXISTS job_type job_type,
  ADD COLUMN IF NOT EXISTS pipeline_stage pipeline_stage DEFAULT 'booked',
  ADD COLUMN IF NOT EXISTS probability integer DEFAULT 80 CHECK (probability >= 0 AND probability <= 100),
  ADD COLUMN IF NOT EXISTS expected_close_date date,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS lost_at timestamptz;

-- Update conversion_type enum to include 'won_job' if not already present
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'conversion_type') THEN
    -- Check if 'won_job' exists
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum 
      WHERE enumlabel = 'won_job' 
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'conversion_type')
    ) THEN
      ALTER TYPE conversion_type ADD VALUE IF NOT EXISTS 'won_job';
    END IF;
  END IF;
END$$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_jobs_conversions_job_type ON public.jobs_conversions(job_type);
CREATE INDEX IF NOT EXISTS idx_jobs_conversions_pipeline_stage ON public.jobs_conversions(pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_jobs_conversions_probability ON public.jobs_conversions(probability);
CREATE INDEX IF NOT EXISTS idx_jobs_conversions_expected_close_date ON public.jobs_conversions(expected_close_date);
CREATE INDEX IF NOT EXISTS idx_jobs_conversions_closed_at ON public.jobs_conversions(closed_at);
CREATE INDEX IF NOT EXISTS idx_jobs_conversions_lost_at ON public.jobs_conversions(lost_at);

-- ============================================================================
-- 2. TRIGGER TO AUTO-UPDATE closed_at WHEN pipeline_stage = 'won'
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_closed_at_on_won()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- When pipeline stage changes to 'won', set closed_at if not already set
  IF NEW.pipeline_stage = 'won'::pipeline_stage 
     AND (OLD.pipeline_stage IS NULL OR OLD.pipeline_stage != 'won'::pipeline_stage) 
     AND NEW.closed_at IS NULL THEN
    NEW.closed_at := now();
    -- Also update conversion_type to 'won_job' if it's still 'booked_estimate'
    IF NEW.conversion_type = 'booked_estimate' THEN
      NEW.conversion_type := 'won_job';
    END IF;
  END IF;
  
  -- When pipeline stage changes to 'lost', set lost_at if not already set
  IF NEW.pipeline_stage = 'lost'::pipeline_stage 
     AND (OLD.pipeline_stage IS NULL OR OLD.pipeline_stage != 'lost'::pipeline_stage) 
     AND NEW.lost_at IS NULL THEN
    NEW.lost_at := now();
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_closed_at_on_won ON public.jobs_conversions;
CREATE TRIGGER trg_update_closed_at_on_won
  BEFORE UPDATE ON public.jobs_conversions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_closed_at_on_won();

-- ============================================================================
-- 3. COMMENTS
-- ============================================================================

COMMENT ON COLUMN public.jobs_conversions.job_type IS 'Type of roofing job: roof_replacement, roof_repair, storm_damage_claim, new_construction, gutter_roof_package, other';
COMMENT ON COLUMN public.jobs_conversions.pipeline_stage IS 'Current stage in pipeline: booked (initial), pending (in progress), won (closed successfully), lost (lost)';
COMMENT ON COLUMN public.jobs_conversions.probability IS 'Probability of closing (0-100), default 80%';
COMMENT ON COLUMN public.jobs_conversions.expected_close_date IS 'Expected date when job will close';
COMMENT ON COLUMN public.jobs_conversions.closed_at IS 'Timestamp when job was marked as won (auto-set by trigger)';
COMMENT ON COLUMN public.jobs_conversions.lost_at IS 'Timestamp when job was marked as lost (auto-set by trigger)';



















































