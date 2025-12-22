-- =========================================================
-- Block 22290 — SmartSend Roofing Job Daily Ops View v1
-- (The "What Matters Today?" Screen - Morning Command Center)
-- =========================================================
-- 
-- This block gives roofers one page that answers:
-- - What roofs are we on today?
-- - Where is weather a risk today?
-- - Who still owes a deposit before we start?
-- - Which homeowners are HOT and need a call right now?
--
-- This is the morning command center: owner opens SmartSend → knows exactly what to do.

-- ============================================================================
-- PART 1 — ADD WEATHER RISK FIELDS TO roofing_jobs TABLE
-- ============================================================================
-- Add lightweight weather signal on jobs so we can store risk per day
-- v1: you can set this manually or through a separate Edge Function that calls a weather API.
-- For now we just support reading/displaying it.

ALTER TABLE IF EXISTS public.roofing_jobs
  ADD COLUMN IF NOT EXISTS weather_risk_score numeric CHECK (weather_risk_score >= 0.0 AND weather_risk_score <= 1.0), -- 0.0 - 1.0
  ADD COLUMN IF NOT EXISTS weather_risk_label text CHECK (weather_risk_label IN ('low', 'medium', 'high')); -- 'low','medium','high' or null

-- Index for filtering by weather risk
CREATE INDEX IF NOT EXISTS idx_roofing_jobs_weather_risk 
  ON public.roofing_jobs(weather_risk_label, scheduled_start_date) 
  WHERE weather_risk_label IS NOT NULL;

-- Index for today's jobs queries
CREATE INDEX IF NOT EXISTS idx_roofing_jobs_scheduled_dates 
  ON public.roofing_jobs(scheduled_start_date, scheduled_end_date, status) 
  WHERE scheduled_start_date IS NOT NULL;

COMMENT ON COLUMN public.roofing_jobs.weather_risk_score IS 'Block 22290: Weather risk score (0.0-1.0) for daily ops view. Weather risk assessment per job. Can be set manually or via Edge Function.';
COMMENT ON COLUMN public.roofing_jobs.weather_risk_label IS 'Block 22290: Weather risk label (low/medium/high) for daily ops view.';








































