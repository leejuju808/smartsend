-- Domain Verification Cron Job
-- Periodically re-verifies domains (every 3 days)

-- Enable pg_cron extension if not already enabled
create extension if not exists pg_cron;

-- Remove existing job if it exists
do $$
begin
  if exists (select 1 from cron.job where jobname = 'domain-verify-batch') then
    perform cron.unschedule('domain-verify-batch');
  end if;
end $$;

-- Schedule domain verification to run daily at 2 AM UTC
-- This will check all domains that haven't been verified in the last 3 days
select cron.schedule(
  'domain-verify-batch',
  '0 2 * * *', -- Daily at 2 AM UTC
  $$
  select net.http_post(
    url := current_setting('app.supabase_url', true) || '/functions/v1/domain-verify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-ss-secret', current_setting('app.domain_secret', true)
    ),
    body := jsonb_build_object('batch', true)
  ) as request_id;
  $$
);

comment on function cron.schedule is 'Scheduled job to verify sender domains every 3 days';

