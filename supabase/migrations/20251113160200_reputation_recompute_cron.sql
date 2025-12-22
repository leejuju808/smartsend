-- Block 181: Schedule reputation recomputation to run hourly
-- This cron job recalculates reputation scores based on bounce rates, unsubscribe surges, and send volume

-- Create cron job for reputation recomputation (runs hourly)
-- Note: This uses pg_cron extension. Make sure it's enabled in your Supabase project.

-- Check if pg_cron extension is enabled
create extension if not exists pg_cron;

-- Schedule the reputation recomputation function to run hourly
-- This will call the edge function via HTTP
select cron.schedule(
  'reputation-recompute-hourly',
  '0 * * * *', -- Every hour at minute 0
  $$
  select
    net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/reputation-recompute',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);

-- Also schedule the 24h counter reset to run daily at midnight
select cron.schedule(
  'reset-24h-counters',
  '0 0 * * *', -- Daily at midnight UTC
  $$
  select public.reset_24h_counters();
  $$
);












