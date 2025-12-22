-- Partner Payout Monthly Cron Job Setup
-- This schedules the partner-payout-runner function to run monthly on the 1st

-- Enable pg_cron extension if not already enabled
create extension if not exists pg_cron;

-- Create cron job to run partner payouts on the 1st of every month at 9 AM UTC
select cron.schedule(
  'partner-payout-monthly',
  '0 9 1 * *', -- Run on the 1st day of each month at 9:00 AM UTC
  $$
  select net.http_post(
    url := current_setting('app.supabase_url', true) || '/functions/v1/partner-payout-runner',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true)
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- Optional: Create a function to manually trigger payouts for testing
create or replace function trigger_partner_payout()
returns jsonb
language plpgsql
security definer
as $$
declare
  result jsonb;
begin
  select net.http_post(
    url := current_setting('app.supabase_url', true) || '/functions/v1/partner-payout-runner',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true)
    ),
    body := '{}'::jsonb
  ) into result;
  
  return result;
end;
$$;

-- Grant execute permission to service role
grant execute on function trigger_partner_payout() to service_role;

-- Note: This cron job will automatically process all pending partner payouts monthly
-- Partners should configure their payout preferences in their dashboard

