-- Reply pipeline cron orchestration
create extension if not exists pg_cron;

-- Gmail poller: run every 2 minutes on even minutes
select cron.unschedule('gmail-poller');
select cron.schedule(
  'gmail-poller',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/gmail-poller',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Outlook poller: run every 2 minutes on odd minutes to stagger load
select cron.unschedule('outlook-poller');
select cron.schedule(
  'outlook-poller',
  '1-59/2 * * * *',
  $$
  select net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/outlook-poller',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Reply classifier: run every minute
select cron.unschedule('reply-classify');
select cron.schedule(
  'reply-classify',
  '* * * * *',
  $$
  select net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/reply-classify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);


