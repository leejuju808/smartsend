-- =========================================================
-- Block 19810 — Task Reminders & Automation
-- (SmartSend Notifies You + Auto-Task Management)
-- =========================================================

-- ============================================================================
-- PART 1: TASK REMINDERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.task_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reminder_type text NOT NULL CHECK (reminder_type IN (
    '1_hour_before',
    'at_due_time',
    '2_hours_overdue',
    'daily_digest',
    'weekly_summary'
  )),
  scheduled_at timestamptz NOT NULL,
  sent_at timestamptz,
  notification_type text NOT NULL CHECK (notification_type IN (
    'push',
    'email',
    'activity_feed',
    'inbox_highlight'
  )),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_reminders_task ON public.task_reminders(task_id);
CREATE INDEX IF NOT EXISTS idx_task_reminders_scheduled ON public.task_reminders(scheduled_at) WHERE sent_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_task_reminders_workspace ON public.task_reminders(workspace_id, scheduled_at);

-- Enable RLS
ALTER TABLE public.task_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_reminders_select_workspace_member"
  ON public.task_reminders
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = task_reminders.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 2: FUNCTION TO CREATE REMINDERS FOR A TASK
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_task_reminders(p_task_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task RECORD;
  v_due_at timestamptz;
  v_workspace_id uuid;
  v_user_id uuid;
BEGIN
  -- Get task details
  SELECT t.*, t.workspace_id, t.assigned_to
  INTO v_task
  FROM public.tasks t
  WHERE t.id = p_task_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_due_at := v_task.due_at;
  v_workspace_id := v_task.workspace_id;
  v_user_id := v_task.assigned_to;

  -- Only create reminders for open/in_progress tasks with due dates
  IF v_task.status NOT IN ('open', 'in_progress') OR v_due_at IS NULL THEN
    RETURN;
  END IF;

  -- Delete existing reminders for this task first
  DELETE FROM public.task_reminders
  WHERE task_id = p_task_id
  AND sent_at IS NULL;

  -- 1 hour before due
  INSERT INTO public.task_reminders (
    task_id,
    workspace_id,
    user_id,
    reminder_type,
    scheduled_at,
    notification_type
  ) VALUES (
    p_task_id,
    v_workspace_id,
    v_user_id,
    '1_hour_before',
    v_due_at - INTERVAL '1 hour',
    'push'
  );

  -- At due time
  INSERT INTO public.task_reminders (
    task_id,
    workspace_id,
    user_id,
    reminder_type,
    scheduled_at,
    notification_type
  ) VALUES (
    p_task_id,
    v_workspace_id,
    v_user_id,
    'at_due_time',
    v_due_at,
    'push'
  );

  -- 2 hours overdue
  INSERT INTO public.task_reminders (
    task_id,
    workspace_id,
    user_id,
    reminder_type,
    scheduled_at,
    notification_type
  ) VALUES (
    p_task_id,
    v_workspace_id,
    v_user_id,
    '2_hours_overdue',
    v_due_at + INTERVAL '2 hours',
    'inbox_highlight'
  );

END;
$$;

-- ============================================================================
-- PART 3: TRIGGER TO AUTO-CREATE REMINDERS WHEN TASK IS CREATED/UPDATED
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_create_task_reminders()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Create reminders when task is created or due_at changes
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.due_at IS DISTINCT FROM NEW.due_at) THEN
    PERFORM public.create_task_reminders(NEW.id);
  END IF;

  -- Delete pending reminders if task is completed/cancelled
  IF TG_OP = 'UPDATE' AND NEW.status IN ('completed', 'cancelled') AND OLD.status NOT IN ('completed', 'cancelled') THEN
    DELETE FROM public.task_reminders
    WHERE task_id = NEW.id
    AND sent_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_create_task_reminders ON public.tasks;
CREATE TRIGGER trg_auto_create_task_reminders
  AFTER INSERT OR UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_task_reminders();

-- ============================================================================
-- PART 4: TASK AUTOMATION FUNCTIONS
-- ============================================================================

-- Function: Mark tasks as in_progress when homeowner replies
CREATE OR REPLACE FUNCTION public.auto_update_tasks_on_reply(
  p_thread_id uuid,
  p_contact_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Mark open tasks related to this thread/contact as in_progress
  UPDATE public.tasks
  SET status = 'in_progress',
      updated_at = now()
  WHERE (thread_id = p_thread_id OR contact_id = p_contact_id)
    AND status = 'open'
    AND metadata->>'auto_source' = 'follow_up_needed';
END;
$$;

-- Function: Mark follow-up task as completed when owner calls
CREATE OR REPLACE FUNCTION public.auto_complete_task_on_call(
  p_contact_id uuid,
  p_thread_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Mark call-related tasks as completed
  UPDATE public.tasks
  SET status = 'completed',
      completed_at = now(),
      updated_at = now()
  WHERE (contact_id = p_contact_id OR thread_id = p_thread_id)
    AND status IN ('open', 'in_progress')
    AND (
      title ILIKE '%call%' OR
      description ILIKE '%call%' OR
      metadata->>'task_type' = 'callback'
    );
END;
$$;

-- Function: Close/cancel tasks when job is booked
CREATE OR REPLACE FUNCTION public.auto_close_tasks_on_job_booked(
  p_contact_id uuid,
  p_job_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Close follow-up tasks
  UPDATE public.tasks
  SET status = 'completed',
      completed_at = now(),
      updated_at = now()
  WHERE contact_id = p_contact_id
    AND status IN ('open', 'in_progress')
    AND (
      metadata->>'auto_source' = 'follow_up_needed' OR
      title ILIKE '%follow%' OR
      title ILIKE '%quote%'
    );

  -- Cancel inspection/appointment tasks if job is already booked
  UPDATE public.tasks
  SET status = 'cancelled',
      updated_at = now()
  WHERE contact_id = p_contact_id
    AND status IN ('open', 'in_progress')
    AND (
      title ILIKE '%inspection%' OR
      title ILIKE '%appointment%' OR
      metadata->>'task_type' IN ('inspection', 'appointment')
    );
END;
$$;

-- Function: Cancel tasks when thread is dead
CREATE OR REPLACE FUNCTION public.auto_cancel_tasks_on_thread_dead(
  p_thread_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_last_message_at timestamptz;
  v_days_since_last_message int;
BEGIN
  -- Get last message time
  SELECT last_message_at INTO v_last_message_at
  FROM public.reply_threads
  WHERE id = p_thread_id;

  IF v_last_message_at IS NULL THEN
    RETURN;
  END IF;

  v_days_since_last_message := EXTRACT(EPOCH FROM (now() - v_last_message_at)) / 86400;

  -- Cancel tasks if thread is dead (no activity for 30+ days)
  IF v_days_since_last_message >= 30 THEN
    UPDATE public.tasks
    SET status = 'cancelled',
        updated_at = now(),
        metadata = jsonb_set(
          COALESCE(metadata, '{}'::jsonb),
          '{cancelled_reason}',
          '"thread_dead"'
        )
    WHERE thread_id = p_thread_id
      AND status IN ('open', 'in_progress');
  END IF;
END;
$$;

-- ============================================================================
-- PART 5: COMMENTS
-- ============================================================================

COMMENT ON TABLE public.task_reminders IS 'Scheduled reminders for tasks (1hr before, at due time, 2hrs overdue, daily/weekly digests)';
COMMENT ON FUNCTION public.create_task_reminders IS 'Creates reminder entries for a task';
COMMENT ON FUNCTION public.auto_update_tasks_on_reply IS 'Marks tasks as in_progress when homeowner replies';
COMMENT ON FUNCTION public.auto_complete_task_on_call IS 'Marks call tasks as completed when owner makes a call';
COMMENT ON FUNCTION public.auto_close_tasks_on_job_booked IS 'Closes/cancels tasks when job is booked';
COMMENT ON FUNCTION public.auto_cancel_tasks_on_thread_dead IS 'Cancels tasks when thread has been inactive for 30+ days';

