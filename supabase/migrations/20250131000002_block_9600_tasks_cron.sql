-- Block 9600 — Tasks Cron Job Configuration
-- Adds cron job to run tasks maintenance (no-reply checker + task due notifications)

-- Add cron job configuration to config.toml (manual step)
-- This migration documents the required cron job setup

-- The cron job should be configured in supabase/config.toml:
-- [cron.jobs."tasks-maintenance"]
-- schedule = "0 * * * *"   # Every hour
-- endpoint = "/functions/v1/tasks-maintenance-cron"
-- verify_jwt = false

-- Alternatively, you can set it up via Supabase Dashboard:
-- 1. Go to Database → Scheduler
-- 2. Create new job:
--    - Name: tasks-maintenance
--    - Schedule: 0 * * * * (every hour)
--    - Target: Edge Function
--    - Function: tasks-maintenance-cron
--    - Method: POST

-- Note: The actual cron job setup must be done manually in Supabase Dashboard
-- or via config.toml. This migration serves as documentation.

COMMENT ON FUNCTION public.create_no_reply_tasks() IS 
  'Creates re-engagement tasks for contacts with no replies after 7 days. Should be called hourly via cron.';

COMMENT ON FUNCTION public.create_task_due_notifications() IS 
  'Creates notifications for tasks that are due or overdue. Should be called hourly via cron.';





























































