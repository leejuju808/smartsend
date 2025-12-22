-- Block 11500 — Global Tasks System v2
-- Upgrades tasks table with priority, status, and enhanced features for contractor CRM

-- 1. Add priority field (low/normal/high)
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS priority text DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high'));

-- 2. Add status field (open/completed) - keeping completed boolean for backward compatibility
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'open' CHECK (status IN ('open', 'completed'));

-- 3. Add due_date field (date) alongside due_at (timestamptz) for easier date-based queries
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS due_date date;

-- 4. Make assigned_to nullable (for unassigned tasks)
ALTER TABLE public.tasks
  ALTER COLUMN assigned_to DROP NOT NULL;

-- 5. Create function to sync due_date from due_at
CREATE OR REPLACE FUNCTION public.sync_task_due_date()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Sync due_date from due_at when due_at changes
  IF NEW.due_at IS NOT NULL THEN
    NEW.due_date := NEW.due_at::date;
  END IF;
  
  -- Sync status from completed boolean
  IF NEW.completed = true THEN
    NEW.status := 'completed';
  ELSIF NEW.completed = false THEN
    NEW.status := 'open';
  END IF;
  
  RETURN NEW;
END;
$$;

-- 6. Create trigger to sync due_date and status
DROP TRIGGER IF EXISTS trg_sync_task_due_date ON public.tasks;
CREATE TRIGGER trg_sync_task_due_date
BEFORE INSERT OR UPDATE OF due_at, completed ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.sync_task_due_date();

-- 7. Backfill due_date for existing tasks
UPDATE public.tasks
SET due_date = due_at::date
WHERE due_date IS NULL AND due_at IS NOT NULL;

-- 8. Backfill status for existing tasks
UPDATE public.tasks
SET status = CASE WHEN completed = true THEN 'completed' ELSE 'open' END
WHERE status IS NULL;

-- 9. Create indexes for new fields
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON public.tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON public.tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_priority_due ON public.tasks(priority, due_date) WHERE completed = false;
CREATE INDEX IF NOT EXISTS idx_tasks_status_due ON public.tasks(status, due_date) WHERE status = 'open';

-- 10. Add campaign_id reference (for filtering by campaign)
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_campaign ON public.tasks(campaign_id) WHERE campaign_id IS NOT NULL;

-- 11. Notification helper functions for task events
CREATE OR REPLACE FUNCTION public.create_task_assigned_notification(
  p_org_id uuid,
  p_user_id uuid,
  p_task_id uuid,
  p_contact_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_task_title text;
  v_contact_name text;
  v_url text;
BEGIN
  -- Get task title
  SELECT title INTO v_task_title
  FROM public.tasks
  WHERE id = p_task_id;

  -- Get contact name
  SELECT COALESCE(
    first_name || ' ' || last_name,
    email,
    'Contact'
  ) INTO v_contact_name
  FROM public.contacts
  WHERE id = p_contact_id;

  -- Build URL
  IF p_contact_id IS NOT NULL THEN
    v_url := format('/contacts/%s#tasks', p_contact_id);
  ELSE
    v_url := format('/tasks?taskId=%s', p_task_id);
  END IF;

  -- Insert notification
  INSERT INTO public.notifications (
    org_id, user_id, type, title, body,
    task_id, contact_id, url
  )
  VALUES (
    p_org_id, p_user_id, 'task_due',
    format('Task assigned: %s', v_task_title),
    format('Assigned to you: %s', COALESCE(v_contact_name, 'Task')),
    p_task_id, p_contact_id, v_url
  )
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_task_completed_notification(
  p_org_id uuid,
  p_user_id uuid,
  p_task_id uuid,
  p_contact_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_task_title text;
  v_contact_name text;
  v_url text;
BEGIN
  -- Get task title
  SELECT title INTO v_task_title
  FROM public.tasks
  WHERE id = p_task_id;

  -- Get contact name
  SELECT COALESCE(
    first_name || ' ' || last_name,
    email,
    'Contact'
  ) INTO v_contact_name
  FROM public.contacts
  WHERE id = p_contact_id;

  -- Build URL
  IF p_contact_id IS NOT NULL THEN
    v_url := format('/contacts/%s#tasks', p_contact_id);
  ELSE
    v_url := format('/tasks?taskId=%s', p_task_id);
  END IF;

  -- Insert notification
  INSERT INTO public.notifications (
    org_id, user_id, type, title, body,
    task_id, contact_id, url
  )
  VALUES (
    p_org_id, p_user_id, 'task_due',
    format('Task completed: %s', v_task_title),
    format('Completed: %s', COALESCE(v_contact_name, 'Task')),
    p_task_id, p_contact_id, v_url
  )
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$;

-- 12. Update notification type to include task_assigned and task_completed
-- Note: This will fail if notifications table doesn't exist, but that's okay
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') THEN
    ALTER TABLE public.notifications
      DROP CONSTRAINT IF EXISTS notifications_type_check;

    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_type_check
      CHECK (type IN ('reply', 'hot_lead', 'warm_lead', 'task_due', 'task_assigned', 'task_completed', 'system'));
  END IF;
END $$;

-- 13. Comments
COMMENT ON COLUMN public.tasks.priority IS 'Task priority: low, normal, or high';
COMMENT ON COLUMN public.tasks.status IS 'Task status: open or completed';
COMMENT ON COLUMN public.tasks.due_date IS 'Date component of due_at for easier date-based queries';
COMMENT ON COLUMN public.tasks.campaign_id IS 'Optional campaign reference for filtering';

