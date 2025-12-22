-- Customer Health Cron Jobs
-- Sets up automated tasks for customer health monitoring and engagement

-- Create cron job to refresh customer health metrics daily at midnight
select cron.schedule(
  'refresh-customer-health',
  '0 0 * * *', -- Daily at midnight
  $$
  select public.refresh_customer_health_metrics();
  $$
);

-- Create cron job to trigger AI customer agent check-ins (Friday 10 AM UTC)
-- Note: This calls the edge function which runs weekly
select cron.schedule(
  'ai-customer-checkins',
  '0 10 * * 5', -- Friday at 10 AM UTC (5 = Friday)
  $$
  select net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/ai-customer-agent',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Optional: Function to manually trigger health refresh for testing
create or replace function trigger_customer_health_refresh()
returns jsonb
language plpgsql
security definer
as $$
begin
  perform public.refresh_customer_health_metrics();
  return jsonb_build_object('ok', true, 'message', 'Health metrics refreshed');
end;
$$;

-- Grant execute permission
grant execute on function trigger_customer_health_refresh() to service_role;

-- Add index on last_check_in for efficient queries
create index if not exists idx_customer_health_last_checkin 
  on public.customer_health(last_check_in);

-- Add comment
comment on function trigger_customer_health_refresh() is 'Manually trigger customer health metrics refresh for testing';

