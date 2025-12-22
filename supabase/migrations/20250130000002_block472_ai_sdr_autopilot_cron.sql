-- Block 472 — AI SDR Autopilot v1 Cron Job
-- Runs every 15 minutes to process AI SDR threads

-- Enable pg_cron extension if not already enabled
create extension if not exists pg_cron;

-- Remove existing job if it exists
do $$
begin
  if exists (select 1 from cron.job where jobname = 'ai-sdr-autopilot') then
    perform cron.unschedule('ai-sdr-autopilot');
  end if;
exception
  when undefined_function then
    -- pg_cron not available; ignore
    null;
end;
$$;

-- Schedule AI SDR Autopilot to run every 15 minutes
select cron.schedule(
  'ai-sdr-autopilot',
  '*/15 * * * *', -- Every 15 minutes
  $$
  select
    net.http_post(
      url := current_setting('app.supabase_url', true) || '/functions/v1/ai-sdr-autopilot',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true)
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);

comment on function cron.schedule is 'Scheduled job for AI SDR Autopilot v1 - runs every 15 minutes';



