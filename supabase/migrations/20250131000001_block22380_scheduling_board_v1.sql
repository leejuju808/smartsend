-- =========================================================
-- Block 22380 — SmartSend Roofing Job Scheduling Board v1
-- (Drag-and-Drop Calendar + Color-Coded Crews)
-- =========================================================
-- 
-- This block gives SmartSend a professional-grade scheduling engine:
-- - Drag-and-drop jobs onto days
-- - Drag jobs between days
-- - Drag crews onto jobs
-- - Color-coded crews
-- - Daily capacity indicators
-- - Weather risk warnings
-- - View modes (week / month / list)
-- - Auto-updates job's scheduled_start_date and crew assignment
--
-- This is the heart of SmartSend's operations UI.
-- Roofers live inside the scheduling calendar more than anywhere else.

-- ============================================================================
-- PART 1 — ADD SCHEDULING FIELDS TO roofing_jobs TABLE
-- ============================================================================
-- Add fields to support improved scheduling and multi-day jobs

ALTER TABLE IF EXISTS public.roofing_jobs
  ADD COLUMN IF NOT EXISTS scheduled_duration_days integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS scheduling_notes text;

-- Index for scheduling queries
CREATE INDEX IF NOT EXISTS idx_roofing_jobs_scheduling_status 
  ON public.roofing_jobs(status, scheduled_start_date) 
  WHERE status IN ('unscheduled', 'scheduled', 'in_progress');

COMMENT ON COLUMN public.roofing_jobs.scheduled_duration_days IS 'Block 22380: Number of days the job is scheduled to take. Defaults to 1 for single-day jobs.';
COMMENT ON COLUMN public.roofing_jobs.scheduling_notes IS 'Block 22380: Notes related to scheduling (e.g., "Need early start", "Permit pending", etc.).';

