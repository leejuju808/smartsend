-- Block 261 — Lead Enrichment Engine v1
-- Set up cron job for automatic enrichment every 30 minutes

-- Create cron job to run enrichment every 30 minutes
-- This will process leads that have enriched = false
SELECT cron.schedule(
  'run-enrichment-v1',
  '*/30 * * * *', -- Every 30 minutes
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/run-enrichment-v1',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);

-- Note: If the above fails, you may need to set the settings first:
-- ALTER DATABASE postgres SET app.settings.supabase_url = 'https://your-project-ref.supabase.co';
-- ALTER DATABASE postgres SET app.settings.service_role_key = 'your-service-role-key';









