-- Block 30041 — SmartSend Roofing "Storm Event Lead Surge Engine" v1
-- Cron Job Setup for Storm Detection
-- Runs storm detection every 1-6 hours (configurable) and applies boosts to leads

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ============================================================================
-- 1. STORM DETECTION CRON JOB (Every 2 hours - recommended)
-- ============================================================================
-- Remove existing job if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'storm-detect') THEN
    PERFORM cron.unschedule('storm-detect');
  END IF;
END $$;

-- Schedule storm detection to run every 2 hours
-- Adjust schedule as needed:
-- '0 */2 * * *' = Every 2 hours
-- '0 */1 * * *' = Every hour
-- '0 */6 * * *' = Every 6 hours
SELECT cron.schedule(
  'storm-detect',
  '0 */2 * * *', -- Every 2 hours
  $$
  SELECT
    net.http_post(
      url := current_setting('app.supabase_url', true) || '/functions/v1/storm-detect',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true)
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);

-- ============================================================================
-- 2. STORM BOOST CRON JOB (Every 30 minutes during active storms)
-- ============================================================================
-- This runs more frequently to catch new leads coming in during active storms
-- Remove existing job if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'storm-boost') THEN
    PERFORM cron.unschedule('storm-boost');
  END IF;
END $$;

-- Schedule storm boost to run every 30 minutes
SELECT cron.schedule(
  'storm-boost',
  '*/30 * * * *', -- Every 30 minutes
  $$
  SELECT
    net.http_post(
      url := current_setting('app.supabase_url', true) || '/functions/v1/storm-boost',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true)
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);

-- ============================================================================
-- 3. COMMENTS
-- ============================================================================
COMMENT ON FUNCTION cron.schedule IS 
  'Storm detection cron jobs:
   - storm-detect: Runs every 2 hours to detect new storms from NOAA API
   - storm-boost: Runs every 30 minutes to apply score boosts to leads in storm-affected areas';

-- ============================================================================
-- 4. VERIFICATION QUERIES
-- ============================================================================
-- To verify cron jobs are set up:
-- SELECT * FROM cron.job WHERE jobname IN ('storm-detect', 'storm-boost');
--
-- To check recent executions:
-- SELECT * FROM cron.job_run_details 
-- WHERE jobname IN ('storm-detect', 'storm-boost')
-- ORDER BY start_time DESC LIMIT 20;
--
-- To manually unschedule if needed:
-- SELECT cron.unschedule('storm-detect');
-- SELECT cron.unschedule('storm-boost');

-- ============================================================================
-- 5. ALTERNATIVE: SUPABASE DASHBOARD CONFIGURATION
-- ============================================================================
-- If you prefer using Supabase Dashboard instead:
--
-- Go to Database → Scheduler → New Job
--
-- Job 1: Storm Detection
-- - Name: storm-detect
-- - Schedule: 0 */2 * * * (every 2 hours)
-- - Target: Edge Function
-- - Function: storm-detect
-- - Method: POST
-- - Headers: {"Content-Type": "application/json", "Authorization": "Bearer <service_role_key>"}
-- - Body: {}
--
-- Job 2: Storm Boost
-- - Name: storm-boost
-- - Schedule: */30 * * * * (every 30 minutes)
-- - Target: Edge Function
-- - Function: storm-boost
-- - Method: POST
-- - Headers: {"Content-Type": "application/json", "Authorization": "Bearer <service_role_key>"}
-- - Body: {}


































