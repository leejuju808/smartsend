-- Cron job for task due notifications
-- This creates a pg_cron job that runs every 5 minutes to check for due tasks

-- Note: pg_cron extension must be enabled in Supabase
-- Run: CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule job to check for due tasks every 5 minutes
-- This calls the Edge Function via HTTP
SELECT cron.schedule(
  'check-task-due-notifications',
  '*/5 * * * *', -- Every 5 minutes
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/check-task-due',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

-- Alternative: Direct SQL approach (if pg_cron is not available)
-- Create a function that can be called by external scheduler
CREATE OR REPLACE FUNCTION public.check_and_notify_due_tasks()
RETURNS TABLE(processed int, errors int)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task RECORD;
  v_org_id uuid;
  v_notification_id uuid;
  v_processed int := 0;
  v_errors int := 0;
BEGIN
  -- Find tasks that are due and haven't had a notification sent
  FOR v_task IN
    SELECT 
      t.id,
      t.workspace_id,
      t.user_id,
      t.lead_id,
      t.campaign_id,
      t.title,
      t.due_at
    FROM public.tasks t
    WHERE t.due_at <= now()
      AND t.reminder_sent = false
      AND t.due_at IS NOT NULL
    LIMIT 100
  LOOP
    BEGIN
      -- Get org_id
      v_org_id := NULL;
      
      -- Try workspace_id first
      IF v_task.workspace_id IS NOT NULL THEN
        SELECT org_id INTO v_org_id
        FROM public.workspaces
        WHERE id = v_task.workspace_id
        LIMIT 1;
      END IF;
      
      -- Fallback to campaign_id
      IF v_org_id IS NULL AND v_task.campaign_id IS NOT NULL THEN
        SELECT org_id INTO v_org_id
        FROM public.campaigns
        WHERE id = v_task.campaign_id
        LIMIT 1;
      END IF;
      
      -- Skip if no org_id or user_id
      IF v_org_id IS NULL OR v_task.user_id IS NULL THEN
        CONTINUE;
      END IF;
      
      -- Create notification
      SELECT public.create_task_due_notification(
        v_org_id,
        v_task.user_id,
        v_task.id,
        v_task.lead_id,
        v_task.campaign_id
      ) INTO v_notification_id;
      
      -- Mark reminder as sent
      UPDATE public.tasks
      SET reminder_sent = true
      WHERE id = v_task.id;
      
      v_processed := v_processed + 1;
    EXCEPTION
      WHEN OTHERS THEN
        v_errors := v_errors + 1;
        -- Log error but continue processing
        RAISE WARNING 'Error processing task %: %', v_task.id, SQLERRM;
    END;
  END LOOP;
  
  RETURN QUERY SELECT v_processed, v_errors;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.check_and_notify_due_tasks() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_notify_due_tasks() TO service_role;

-- Comment
COMMENT ON FUNCTION public.check_and_notify_due_tasks() IS 'Checks for tasks that are due and creates notifications. Can be called by cron job or external scheduler.';





























































