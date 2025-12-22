-- =========================================================
-- Block 19980 — Smart Reminders v1 Cron Jobs
-- (Automated reminder processing and daily critical follow-ups)
-- =========================================================

-- ============================================================================
-- CRON JOB 1 — Process Reminder Queue (Every Minute)
-- ============================================================================
-- Processes pending reminders that are due

DO $$
BEGIN
  -- Check if pg_cron extension exists
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove existing job if it exists
    PERFORM cron.unschedule('smart-reminders-process-queue')
    WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'smart-reminders-process-queue'
    );
    
    -- Schedule reminder queue processor
    PERFORM cron.schedule(
      'smart-reminders-process-queue',
      '* * * * *', -- Every minute
      $$
      SELECT public.process_reminder_queue();
      $$
    );
    
    RAISE NOTICE 'Smart Reminders queue processor cron job scheduled successfully';
  ELSE
    RAISE NOTICE 'pg_cron extension not available. Use Supabase Edge Functions scheduler instead.';
  END IF;
END $$;

-- ============================================================================
-- CRON JOB 2 — Check No-Response Reminders (Every Hour)
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('smart-reminders-no-response')
    WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'smart-reminders-no-response'
    );
    
    PERFORM cron.schedule(
      'smart-reminders-no-response',
      '0 * * * *', -- Every hour at minute 0
      $$
      SELECT public.check_no_response_reminders();
      $$
    );
    
    RAISE NOTICE 'No-response reminders cron job scheduled successfully';
  END IF;
END $$;

-- ============================================================================
-- CRON JOB 3 — Check Owner Follow-Up Reminders (Every 15 Minutes)
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('smart-reminders-owner-followup')
    WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'smart-reminders-owner-followup'
    );
    
    PERFORM cron.schedule(
      'smart-reminders-owner-followup',
      '*/15 * * * *', -- Every 15 minutes
      $$
      SELECT public.check_owner_followup_reminders();
      $$
    );
    
    RAISE NOTICE 'Owner follow-up reminders cron job scheduled successfully';
  END IF;
END $$;

-- ============================================================================
-- CRON JOB 4 — Check Task Overdue Reminders (Every Hour)
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('smart-reminders-task-overdue')
    WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'smart-reminders-task-overdue'
    );
    
    PERFORM cron.schedule(
      'smart-reminders-task-overdue',
      '0 * * * *', -- Every hour at minute 0
      $$
      SELECT public.check_task_overdue_reminders();
      $$
    );
    
    RAISE NOTICE 'Task overdue reminders cron job scheduled successfully';
  END IF;
END $$;

-- ============================================================================
-- CRON JOB 5 — Check Missed Appointments (Every 30 Minutes)
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('smart-reminders-missed-appointments')
    WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'smart-reminders-missed-appointments'
    );
    
    PERFORM cron.schedule(
      'smart-reminders-missed-appointments',
      '*/30 * * * *', -- Every 30 minutes
      $$
      SELECT public.check_missed_appointments();
      $$
    );
    
    RAISE NOTICE 'Missed appointments cron job scheduled successfully';
  END IF;
END $$;

-- ============================================================================
-- CRON JOB 6 — Daily Critical Follow-Ups (8 AM Daily)
-- ============================================================================
-- Generates daily critical follow-ups list for each workspace

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('smart-reminders-daily-critical')
    WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'smart-reminders-daily-critical'
    );
    
    PERFORM cron.schedule(
      'smart-reminders-daily-critical',
      '0 8 * * *', -- Daily at 8 AM
      $$
      -- Generate critical follow-ups for all workspaces
      DO $$
      DECLARE
        v_workspace RECORD;
      BEGIN
        FOR v_workspace IN
          SELECT id FROM public.workspaces
        LOOP
          PERFORM public.generate_daily_critical_followups(v_workspace.id);
        END LOOP;
      END $$;
      $$
    );
    
    RAISE NOTICE 'Daily critical follow-ups cron job scheduled successfully';
  END IF;
END $$;

-- ============================================================================
-- ALTERNATIVE: Supabase Edge Functions Scheduler Configuration
-- ============================================================================
-- If pg_cron is not available, use Supabase Edge Functions scheduler
-- Add these to supabase/functions/_scheduled/cron.yaml:

/*
functions:
  - name: smart-reminders-process-queue
    schedule: "* * * * *"   # every minute
    verify_jwt: false
  - name: smart-reminders-no-response
    schedule: "0 * * * *"   # every hour
    verify_jwt: false
  - name: smart-reminders-owner-followup
    schedule: "*/15 * * * *"   # every 15 minutes
    verify_jwt: false
  - name: smart-reminders-task-overdue
    schedule: "0 * * * *"   # every hour
    verify_jwt: false
  - name: smart-reminders-missed-appointments
    schedule: "*/30 * * * *"   # every 30 minutes
    verify_jwt: false
  - name: smart-reminders-daily-critical
    schedule: "0 8 * * *"   # daily at 8 AM
    verify_jwt: false
*/

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION cron.schedule IS 'Scheduled jobs for Smart Reminders v1. Processes reminders, checks for no-responses, overdue tasks, and generates daily critical follow-ups.';



















































