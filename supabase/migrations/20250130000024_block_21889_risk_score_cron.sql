-- ============================================================================
-- Block 21889 — SmartSend Roofing Missed Opportunity Detector v1
-- Cron Job Configuration
-- ============================================================================
-- Schedule the compute-risk-score edge function to run every 10 minutes

-- Ensure pg_cron extension is enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the risk score computation to run every 10 minutes
-- This will call the edge function via HTTP
SELECT cron.schedule(
  'compute-risk-score-every-10min',
  '*/10 * * * *', -- Every 10 minutes
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/compute-risk-score',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);

-- Note: If the above doesn't work due to settings not being available,
-- you may need to configure this via Supabase Dashboard → Database → Cron Jobs
-- or use the Supabase CLI to set up the scheduled function

COMMENT ON FUNCTION cron.schedule IS 'Block 21889: Schedules risk score computation every 10 minutes';









































