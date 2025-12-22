-- Enable pg_cron extension if not already enabled
create extension if not exists pg_cron;

-- Create cron job to poll Gmail every 3 minutes
-- This will call the gmail-poller edge function
select cron.schedule(
  'gmail-poller',
  '*/3 * * * *', -- Every 3 minutes
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

-- Optional: Create a function to manually trigger the poller for testing
create or replace function trigger_gmail_poll()
returns jsonb
language plpgsql
security definer
as $$
declare
  result jsonb;
begin
  select net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/gmail-poller',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
    ),
    body := '{}'::jsonb
  ) into result;
  
  return result;
end;
$$;

-- Grant execute permission to service role
grant execute on function trigger_gmail_poll() to service_role;