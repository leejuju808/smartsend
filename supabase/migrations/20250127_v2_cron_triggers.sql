-- SmartSend V2: Cron Triggers Migration
-- Sets up scheduled jobs for follow-up scheduler and template analyzer

-- Enable pg_cron extension if not already enabled
create extension if not exists pg_cron;

-- ============================================================================
-- 1. FOLLOW-UP SCHEDULER (Every 10 minutes)
-- ============================================================================
-- Remove existing job if it exists
select cron.unschedule('followup-scheduler') where exists (
  select 1 from cron.job where jobname = 'followup-scheduler'
);

-- Schedule follow-up worker to run every 10 minutes
select cron.schedule(
  'followup-scheduler',
  '*/10 * * * *', -- Every 10 minutes
  $$
  select
    net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/schedule_followups',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key'),
        'x-cron-token', current_setting('app.cron_secret', true) || ''
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);

-- ============================================================================
-- 2. TEMPLATE ANALYZER (Nightly at 2 AM UTC)
-- ============================================================================
-- Remove existing job if it exists
select cron.unschedule('template-analyzer') where exists (
  select 1 from cron.job where jobname = 'template-analyzer'
);

-- Schedule template optimizer to run nightly at 2 AM UTC
select cron.schedule(
  'template-analyzer',
  '0 2 * * *', -- Daily at 2 AM UTC
  $$
  select
    net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/template-optimizer',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key'),
        'x-cron-token', current_setting('app.cron_secret', true) || ''
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);

-- ============================================================================
-- 3. AUTO-REPLY PROCESSOR (Every 5 minutes)
-- ============================================================================
-- Schedule auto-reply agent to check for new replies and generate responses
select cron.unschedule('auto-reply-processor') where exists (
  select 1 from cron.job where jobname = 'auto-reply-processor'
);

select cron.schedule(
  'auto-reply-processor',
  '*/5 * * * *', -- Every 5 minutes
  $$
  select
    net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/auto_reply',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key'),
        'x-cron-token', current_setting('app.cron_secret', true) || ''
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);

-- ============================================================================
-- HELPER: View all scheduled jobs
-- ============================================================================
-- Run this to see all cron jobs:
-- SELECT * FROM cron.job ORDER BY jobname;

