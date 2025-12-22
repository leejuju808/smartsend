-- =========================================================
-- Block 19810 — Inbox → Task System Deep Integration v1
-- (Full Task Engine, Due Dates, Statuses, Subtasks, Reminders, and Assignment — True Follow-Up Infrastructure)
-- =========================================================

-- ============================================================================
-- PART 1: UPGRADE TASKS TABLE TO V2 OPERATIONAL MODEL
-- ============================================================================

-- Add new columns to existing tasks table (idempotent)
ALTER TABLE IF EXISTS public.tasks
  -- Priority levels
  ADD COLUMN IF NOT EXISTS priority text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  
  -- Status (upgrade from old status values)
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
  
  -- Due date/time (upgrade from due_date)
  ADD COLUMN IF NOT EXISTS due_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  
  -- Contact and job references
  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS job_id uuid, -- nullable, can reference jobs_conversions or other job tables
  
  -- Metadata for flexible storage
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- Migrate old status values to new status values
UPDATE public.tasks
SET status = CASE
  WHEN status = 'todo' THEN 'open'
  WHEN status = 'in_progress' THEN 'in_progress'
  WHEN status = 'done' THEN 'completed'
  ELSE 'open'
END
WHERE status IN ('todo', 'in_progress', 'done');

-- Migrate due_date to due_at if due_at is null
UPDATE public.tasks
SET due_at = due_date::timestamptz
WHERE due_at IS NULL AND due_date IS NOT NULL;

-- Drop old status constraint if it exists and create new one
DO $$
BEGIN
  -- Drop old constraint if exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'tasks_status_check' 
    AND conrelid = 'public.tasks'::regclass
  ) THEN
    ALTER TABLE public.tasks DROP CONSTRAINT tasks_status_check;
  END IF;
END $$;

-- Ensure new constraint exists
ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_status_check,
  ADD CONSTRAINT tasks_status_check CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled'));

-- Create new indexes for performance
CREATE INDEX IF NOT EXISTS idx_tasks_contact ON public.tasks(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_job ON public.tasks(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_due_at ON public.tasks(due_at) WHERE due_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_status_priority ON public.tasks(status, priority);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_due ON public.tasks(assigned_to, due_at) WHERE assigned_to IS NOT NULL AND due_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_overdue ON public.tasks(workspace_id, status, due_at) 
  WHERE status IN ('open', 'in_progress') AND due_at < now();

-- ============================================================================
-- PART 2: TASK ACTIVITY LOG TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tasks_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('created', 'updated', 'status_changed', 'assigned', 'completed', 'cancelled', 'reopened')),
  old_status text,
  new_status text,
  old_priority text,
  new_priority text,
  old_assigned_to uuid,
  new_assigned_to uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_activity_task ON public.tasks_activity(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_activity_workspace ON public.tasks_activity(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_activity_user ON public.tasks_activity(user_id, created_at DESC) WHERE user_id IS NOT NULL;

-- Enable RLS
ALTER TABLE public.tasks_activity ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view activity for tasks in their workspace
CREATE POLICY "tasks_activity_select_workspace_member"
  ON public.tasks_activity
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = tasks_activity.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 3: AUTOMATIC TASK ASSIGNMENT FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_assign_task(
  p_workspace_id uuid,
  p_thread_id uuid DEFAULT NULL,
  p_contact_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_assigned_user_id uuid;
  v_thread_owner_id uuid;
  v_workspace_owner_id uuid;
  v_default_rep_id uuid;
  v_member_count int;
BEGIN
  -- Get thread owner if thread_id provided
  IF p_thread_id IS NOT NULL THEN
    SELECT owner_id INTO v_thread_owner_id
    FROM public.reply_threads
    WHERE id = p_thread_id;
  END IF;

  -- Get workspace owner
  SELECT owner_id INTO v_workspace_owner_id
  FROM public.workspaces
  WHERE id = p_workspace_id;

  -- Count workspace members
  SELECT COUNT(*) INTO v_member_count
  FROM public.workspace_members
  WHERE workspace_id = p_workspace_id
  AND role IN ('owner', 'admin', 'member');

  -- Assignment logic:
  -- 1. If sole workspace user → assign to them
  IF v_member_count <= 1 THEN
    RETURN v_workspace_owner_id;
  END IF;

  -- 2. If thread has owner → assign to thread owner
  IF v_thread_owner_id IS NOT NULL THEN
    -- Verify user is still a workspace member
    IF EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = p_workspace_id
      AND user_id = v_thread_owner_id
    ) THEN
      RETURN v_thread_owner_id;
    END IF;
  END IF;

  -- 3. Try to find default pipeline rep (first active member)
  SELECT user_id INTO v_default_rep_id
  FROM public.workspace_members
  WHERE workspace_id = p_workspace_id
  AND role IN ('owner', 'admin', 'member')
  ORDER BY 
    CASE role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END,
    created_at ASC
  LIMIT 1;

  -- 4. Fallback to workspace owner
  IF v_default_rep_id IS NOT NULL THEN
    RETURN v_default_rep_id;
  END IF;

  RETURN v_workspace_owner_id;
END;
$$;

-- ============================================================================
-- PART 4: AI-ASSISTED PRIORITY DETERMINATION FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.determine_task_priority(
  p_thread_id uuid DEFAULT NULL,
  p_contact_id uuid DEFAULT NULL,
  p_title text DEFAULT NULL,
  p_description text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_priority text := 'medium';
  v_lead_score numeric;
  v_intent text;
  v_value numeric;
  v_keywords text;
  v_has_urgent_keywords boolean := false;
BEGIN
  -- Combine title and description for keyword checking
  v_keywords := COALESCE(LOWER(p_title || ' ' || COALESCE(p_description, '')), '');

  -- Check for urgent keywords
  IF v_keywords ~* '(leak|urgent|asap|emergency|immediate|now|today|broken|damage)' THEN
    v_has_urgent_keywords := true;
  END IF;

  -- Get lead score if contact_id provided
  IF p_contact_id IS NOT NULL THEN
    SELECT 
      COALESCE(lead_score, 50),
      COALESCE(ai_intent, 'neutral')
    INTO v_lead_score, v_intent
    FROM public.contacts
    WHERE id = p_contact_id;
  END IF;

  -- Get value if thread_id provided (from jobs_conversions or contact)
  IF p_thread_id IS NOT NULL THEN
    SELECT COALESCE(estimate_amount, job_value, 0)
    INTO v_value
    FROM public.contacts c
    LEFT JOIN public.reply_threads rt ON rt.contact_id = c.id
    WHERE rt.id = p_thread_id
    LIMIT 1;
  ELSIF p_contact_id IS NOT NULL THEN
    SELECT COALESCE(estimate_amount, job_value, 0)
    INTO v_value
    FROM public.contacts
    WHERE id = p_contact_id;
  END IF;

  -- Priority determination logic:
  -- High: Hot lead + urgent keywords + high value
  IF (v_lead_score >= 70 OR v_intent = 'hot') AND v_has_urgent_keywords AND v_value >= 5000 THEN
    v_priority := 'high';
  -- High: Urgent keywords + high value
  ELSIF v_has_urgent_keywords AND v_value >= 10000 THEN
    v_priority := 'high';
  -- High: Hot lead + urgent keywords
  ELSIF (v_lead_score >= 70 OR v_intent = 'hot') AND v_has_urgent_keywords THEN
    v_priority := 'high';
  -- Medium: Warm lead + potential value
  ELSIF (v_lead_score >= 50 OR v_intent IN ('warm', 'meeting')) AND v_value >= 3000 THEN
    v_priority := 'medium';
  -- Medium: Has value or warm intent
  ELSIF v_value >= 5000 OR v_intent IN ('warm', 'meeting') THEN
    v_priority := 'medium';
  -- Low: Price shopper or low intent
  ELSIF v_intent IN ('price_shopper', 'not_interested', 'oos') THEN
    v_priority := 'low';
  -- Low: Low value and no urgency
  ELSIF v_value < 2000 AND NOT v_has_urgent_keywords THEN
    v_priority := 'low';
  ELSE
    v_priority := 'medium';
  END IF;

  RETURN v_priority;
END;
$$;

-- ============================================================================
-- PART 5: TASK STATUS CHANGE TRIGGER (Logs Activity)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.log_task_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_action text;
BEGIN
  -- Determine action type
  IF TG_OP = 'INSERT' THEN
    v_action := 'created';
  ELSIF TG_OP = 'UPDATE' THEN
    -- Check what changed
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      v_action := 'status_changed';
    ELSIF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
      v_action := 'assigned';
    ELSIF OLD.priority IS DISTINCT FROM NEW.priority THEN
      v_action := 'updated';
    ELSE
      v_action := 'updated';
    END IF;
  END IF;

  -- Log activity
  INSERT INTO public.tasks_activity (
    task_id,
    workspace_id,
    user_id,
    action,
    old_status,
    new_status,
    old_priority,
    new_priority,
    old_assigned_to,
    new_assigned_to,
    metadata
  ) VALUES (
    NEW.id,
    NEW.workspace_id,
    auth.uid(),
    v_action,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
    NEW.status,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.priority ELSE NULL END,
    NEW.priority,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.assigned_to ELSE NULL END,
    NEW.assigned_to,
    jsonb_build_object(
      'title', NEW.title,
      'due_at', NEW.due_at,
      'thread_id', NEW.thread_id,
      'contact_id', NEW.contact_id
    )
  );

  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trg_log_task_activity ON public.tasks;
CREATE TRIGGER trg_log_task_activity
  AFTER INSERT OR UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.log_task_activity();

-- ============================================================================
-- PART 6: HELPER FUNCTION TO GET OVERDUE TASKS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_overdue_tasks(p_workspace_id uuid)
RETURNS TABLE (
  task_id uuid,
  title text,
  due_at timestamptz,
  assigned_to uuid,
  contact_id uuid,
  thread_id uuid,
  hours_overdue numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT 
    t.id,
    t.title,
    t.due_at,
    t.assigned_to,
    t.contact_id,
    t.thread_id,
    EXTRACT(EPOCH FROM (now() - t.due_at)) / 3600.0 as hours_overdue
  FROM public.tasks t
  WHERE t.workspace_id = p_workspace_id
    AND t.status IN ('open', 'in_progress')
    AND t.due_at < now()
  ORDER BY t.due_at ASC;
$$;

-- ============================================================================
-- PART 7: COMMENTS
-- ============================================================================

COMMENT ON COLUMN public.tasks.priority IS 'Task priority: low, medium, high (AI-assisted determination)';
COMMENT ON COLUMN public.tasks.status IS 'Task status: open (default), in_progress, completed, cancelled';
COMMENT ON COLUMN public.tasks.due_at IS 'Due date and time for the task';
COMMENT ON COLUMN public.tasks.completed_at IS 'Timestamp when task was completed';
COMMENT ON COLUMN public.tasks.contact_id IS 'Related contact (homeowner)';
COMMENT ON COLUMN public.tasks.job_id IS 'Related job/conversion ID';
COMMENT ON COLUMN public.tasks.metadata IS 'Flexible JSONB storage for task-specific data';
COMMENT ON TABLE public.tasks_activity IS 'Activity log for all task changes (status, assignment, priority, etc.)';
COMMENT ON FUNCTION public.auto_assign_task IS 'Automatically assigns task based on thread ownership and workspace members';
COMMENT ON FUNCTION public.determine_task_priority IS 'AI-assisted priority determination based on lead score, intent, value, and keywords';



















































