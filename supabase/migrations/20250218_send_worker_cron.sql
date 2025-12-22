-- Cron job for send_worker (runs every 2 minutes)
-- This can also be configured via Supabase Dashboard or config.toml

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create cron job to run send_worker every 2 minutes
-- Note: Replace 'your-project-ref' with your actual Supabase project reference
DO $$
BEGIN
  -- Check if job already exists
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'send_worker'
  ) THEN
    PERFORM cron.schedule(
      'send_worker',
      '*/2 * * * *', -- Every 2 minutes
      $$
      SELECT net.http_post(
        url := current_setting('app.supabase_url', true) || '/functions/v1/send_worker',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true)
        ),
        body := '{}'::jsonb
      ) AS request_id;
      $$
    );
  END IF;
END $$;
