-- Enable pg_cron extension if not already enabled
create extension if not exists pg_cron;

-- Create cron job to detect replies every 5 minutes
-- This will call the detect-replies edge function
select cron.schedule(
  'detect-replies-autonomous',
  '*/5 * * * *', -- Every 5 minutes
  $$
  select net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/detect-replies',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Add comment for documentation
comment on function cron.schedule is 
  'Scheduled job to detect replies from leads via Gmail API';

