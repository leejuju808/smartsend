-- =========================================================
-- Block 22330 — SmartSend Roofing Crew Day Sheet v1
-- (Daily Crew Packet Auto-Generated)
-- =========================================================
-- 
-- SmartSend automatically generates a Crew Day Sheet for each job scheduled today —
-- a simple, printable, mobile-friendly summary that gives the crew everything they need:
-- - Homeowner info
-- - Address + map link
-- - Scope of work
-- - Materials expected / delivered
-- - Dumpster notes
-- - Safety notes
-- - Before/After photo checklist
-- - Task list
-- - Weather risk
-- - Contact numbers
--
-- This eliminates the chaos of crews calling the owner 10 times a day.

-- ============================================================================
-- PART 1 — ADD CREW DAY SHEET FIELDS TO roofing_jobs TABLE
-- ============================================================================
-- Add optional fields to jobs that help generate the crew day sheet packet

ALTER TABLE IF EXISTS public.roofing_jobs
  ADD COLUMN IF NOT EXISTS scope_of_work text,
  ADD COLUMN IF NOT EXISTS shingle_color text,
  ADD COLUMN IF NOT EXISTS dumpster_required boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS dumpster_notes text,
  ADD COLUMN IF NOT EXISTS safety_notes text,
  ADD COLUMN IF NOT EXISTS homeowner_notes text;

-- Index for filtering jobs with crew day sheet data
CREATE INDEX IF NOT EXISTS idx_roofing_jobs_crew_sheet_fields
  ON public.roofing_jobs(scheduled_start_date, dumpster_required)
  WHERE scheduled_start_date IS NOT NULL;

COMMENT ON COLUMN public.roofing_jobs.scope_of_work IS 'Block 22330: Detailed scope of work for crew day sheet';
COMMENT ON COLUMN public.roofing_jobs.shingle_color IS 'Block 22330: Shingle color for crew day sheet';
COMMENT ON COLUMN public.roofing_jobs.dumpster_required IS 'Block 22330: Whether a dumpster is required for this job';
COMMENT ON COLUMN public.roofing_jobs.dumpster_notes IS 'Block 22330: Notes about dumpster placement, size, etc.';
COMMENT ON COLUMN public.roofing_jobs.safety_notes IS 'Block 22330: Safety notes and warnings for crew';
COMMENT ON COLUMN public.roofing_jobs.homeowner_notes IS 'Block 22330: Special notes from homeowner for crew';








































