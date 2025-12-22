-- Block 468 — SmartLead Sync v1 Cron Job
-- Nightly enrichment refresh job via pg_cron

-- Enable pg_cron extension if not already enabled
create extension if not exists pg_cron;

-- Remove existing job if it exists
do $$
begin
  if exists (select 1 from cron.job where jobname = 'smartlead-sync-nightly') then
    perform cron.unschedule('smartlead-sync-nightly');
  end if;
exception
  when undefined_function then
    -- pg_cron not available; ignore
    null;
end;
$$;

-- Schedule SmartLead Sync to run nightly at 3 AM UTC
-- This will enrich new leads, stale leads, and high-priority leads
-- Note: The edge function will process leads from all workspaces automatically
select cron.schedule(
  'smartlead-sync-nightly',
  '0 3 * * *', -- Daily at 3 AM UTC
  $$
  select
    net.http_post(
      url := current_setting('app.supabase_url', true) || '/functions/v1/smartlead-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true)
      ),
      body := jsonb_build_object(
        'batch_size', 100,
        'priority', 'normal'
      )
    ) as request_id;
  $$
);

-- Also schedule a high-priority enrichment job every 6 hours for active sequences
select cron.schedule(
  'smartlead-sync-high-priority',
  '0 */6 * * *', -- Every 6 hours
  $$
  -- Process high-priority leads (in active sequences)
  select
    net.http_post(
      url := current_setting('app.supabase_url', true) || '/functions/v1/smartlead-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true)
      ),
      body := jsonb_build_object(
        'batch_size', 50,
        'priority', 'high'
      )
    ) as request_id;
  $$
);

comment on function cron.schedule is 'Scheduled jobs for SmartLead Sync v1 enrichment engine';

