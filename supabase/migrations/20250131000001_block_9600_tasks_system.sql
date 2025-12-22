-- Block 9600 — Tasks & Follow-Up Queue (Global Task List + Contact-Linked Reminders)
-- Creates tasks table with RLS policies and auto-generation triggers

-- 1. Create tasks table
CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL, -- organization/workspace ID
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  reply_thread_id uuid REFERENCES public.reply_threads(id) ON DELETE SET NULL,
  assigned_to uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  notes text,
  due_at timestamptz NOT NULL,
  completed boolean DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  auto_generated boolean DEFAULT false,
  auto_type text, -- 'hot_lead', 'warm_lead', 'no_reply', 'inspection_reminder', etc.
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 2. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tasks_org_assigned_due ON public.tasks(org_id, assigned_to, due_at);
CREATE INDEX IF NOT EXISTS idx_tasks_contact ON public.tasks(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_reply_thread ON public.tasks(reply_thread_id) WHERE reply_thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_completed ON public.tasks(completed, due_at);
CREATE INDEX IF NOT EXISTS idx_tasks_auto_generated ON public.tasks(auto_generated, auto_type);
CREATE INDEX IF NOT EXISTS idx_tasks_due_at ON public.tasks(due_at) WHERE completed = false;
CREATE INDEX IF NOT EXISTS idx_tasks_org_completed ON public.tasks(org_id, completed, due_at);

-- 3. Create updated_at trigger
CREATE OR REPLACE FUNCTION public.set_tasks_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tasks_updated_at ON public.tasks;
CREATE TRIGGER trg_tasks_updated_at
BEFORE UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.set_tasks_updated_at();

-- 4. Enable RLS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
-- Users can see tasks in their org where they are assigned OR they are admins/owners
CREATE POLICY "users_see_assigned_tasks"
ON public.tasks
FOR SELECT
USING (
  org_id IN (
    SELECT org_id FROM public.org_members WHERE user_id = auth.uid()
    UNION
    SELECT org_id FROM public.org_memberships WHERE user_id = auth.uid() AND (status IS NULL OR status = 'active')
  )
  AND (
    assigned_to = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = tasks.org_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.org_memberships om
      WHERE om.org_id = tasks.org_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
      AND (om.status IS NULL OR om.status = 'active')
    )
  )
);

-- Users can insert tasks in their org
CREATE POLICY "users_insert_tasks"
ON public.tasks
FOR INSERT
WITH CHECK (
  org_id IN (
    SELECT org_id FROM public.org_members WHERE user_id = auth.uid()
    UNION
    SELECT org_id FROM public.org_memberships WHERE user_id = auth.uid() AND (status IS NULL OR status = 'active')
  )
  AND assigned_to IN (
    SELECT user_id FROM public.org_members WHERE org_id = tasks.org_id
    UNION
    SELECT user_id FROM public.org_memberships WHERE org_id = tasks.org_id AND (status IS NULL OR status = 'active')
  )
);

-- Users can update tasks assigned to them or if they are admins/owners
CREATE POLICY "users_update_tasks"
ON public.tasks
FOR UPDATE
USING (
  org_id IN (
    SELECT org_id FROM public.org_members WHERE user_id = auth.uid()
    UNION
    SELECT org_id FROM public.org_memberships WHERE user_id = auth.uid() AND (status IS NULL OR status = 'active')
  )
  AND (
    assigned_to = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = tasks.org_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.org_memberships om
      WHERE om.org_id = tasks.org_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
      AND (om.status IS NULL OR om.status = 'active')
    )
  )
);

-- Users can delete tasks assigned to them or if they are admins/owners
CREATE POLICY "users_delete_tasks"
ON public.tasks
FOR DELETE
USING (
  org_id IN (
    SELECT org_id FROM public.org_members WHERE user_id = auth.uid()
    UNION
    SELECT org_id FROM public.org_memberships WHERE user_id = auth.uid() AND (status IS NULL OR status = 'active')
  )
  AND (
    assigned_to = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = tasks.org_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.org_memberships om
      WHERE om.org_id = tasks.org_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
      AND (om.status IS NULL OR om.status = 'active')
    )
  )
);

-- Service role can insert/update tasks (for auto-generation)
CREATE POLICY "service_role_manage_tasks"
ON public.tasks
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 6. Auto-generation function: Create task from hot/warm lead intent
CREATE OR REPLACE FUNCTION public.create_task_from_intent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
  v_contact_id uuid;
  v_reply_thread_id uuid;
  v_campaign_id uuid;
  v_assigned_to uuid;
  v_title text;
  v_due_at timestamptz;
  v_auto_type text;
BEGIN
  -- Only process hot or warm intents
  IF NEW.intent NOT IN ('hot', 'warm') THEN
    RETURN NEW;
  END IF;

  -- Get message details to find contact and thread
  SELECT 
    rt.contact_id,
    rt.id as thread_id,
    rt.campaign_id,
    rt.workspace_id,
    rt.account_id
  INTO v_contact_id, v_reply_thread_id, v_campaign_id, v_org_id, v_assigned_to
  FROM public.reply_threads rt
  INNER JOIN public.inbound_messages im ON im.thread_id = rt.id
  WHERE im.id = NEW.message_id
  LIMIT 1;

  -- If org_id is workspace_id, we need to map it
  -- For now, assume workspace_id maps to org_id or use account_id
  IF v_org_id IS NULL THEN
    SELECT account_id INTO v_org_id FROM public.reply_threads WHERE id = v_reply_thread_id LIMIT 1;
  END IF;

  -- Fallback: try to get org_id from contact
  IF v_org_id IS NULL AND v_contact_id IS NOT NULL THEN
    SELECT org_id INTO v_org_id FROM public.contacts WHERE id = v_contact_id LIMIT 1;
    IF v_org_id IS NULL THEN
      SELECT workspace_id INTO v_org_id FROM public.contacts WHERE id = v_contact_id LIMIT 1;
    END IF;
  END IF;

  -- Fallback: try to get org_id from campaign
  IF v_org_id IS NULL AND v_campaign_id IS NOT NULL THEN
    SELECT org_id INTO v_org_id FROM public.campaigns WHERE id = v_campaign_id LIMIT 1;
    IF v_org_id IS NULL THEN
      SELECT workspace_id INTO v_org_id FROM public.campaigns WHERE id = v_campaign_id LIMIT 1;
    END IF;
  END IF;

  -- If still no org_id, skip task creation
  IF v_org_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Set assigned_to: use thread owner or contact owner, fallback to account_id
  IF v_assigned_to IS NULL THEN
    SELECT owner_id INTO v_assigned_to FROM public.reply_threads WHERE id = v_reply_thread_id LIMIT 1;
  END IF;

  -- If still no assigned_to, use the first org member
  IF v_assigned_to IS NULL THEN
    SELECT user_id INTO v_assigned_to 
    FROM public.org_members 
    WHERE org_id = v_org_id 
    ORDER BY created_at ASC 
    LIMIT 1;
    
    IF v_assigned_to IS NULL THEN
      SELECT user_id INTO v_assigned_to 
      FROM public.org_memberships 
      WHERE org_id = v_org_id 
      AND (status IS NULL OR status = 'active')
      ORDER BY created_at ASC 
      LIMIT 1;
    END IF;
  END IF;

  -- Build task title
  IF NEW.intent = 'hot' THEN
    v_title := 'Call homeowner about estimate';
    v_due_at := now() + interval '1 day';
    v_auto_type := 'hot_lead';
  ELSIF NEW.intent = 'warm' THEN
    v_title := 'Follow up with homeowner';
    v_due_at := now() + interval '2 days';
    v_auto_type := 'warm_lead';
  END IF;

  -- Create task
  INSERT INTO public.tasks (
    org_id,
    contact_id,
    reply_thread_id,
    assigned_to,
    title,
    due_at,
    auto_generated,
    auto_type,
    created_by
  )
  VALUES (
    v_org_id,
    v_contact_id,
    v_reply_thread_id,
    v_assigned_to,
    v_title,
    v_due_at,
    true,
    v_auto_type,
    NULL -- System-generated
  )
  ON CONFLICT DO NOTHING; -- Prevent duplicates

  RETURN NEW;
END;
$$;

-- 7. Trigger to auto-create tasks when message_intents are created
DROP TRIGGER IF EXISTS trg_create_task_from_intent ON public.message_intents;
CREATE TRIGGER trg_create_task_from_intent
AFTER INSERT ON public.message_intents
FOR EACH ROW
WHEN (NEW.intent IN ('hot', 'warm'))
EXECUTE FUNCTION public.create_task_from_intent();

-- 8. Function to create no-reply re-engagement tasks (to be called by cron)
CREATE OR REPLACE FUNCTION public.create_no_reply_tasks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact RECORD;
  v_org_id uuid;
  v_assigned_to uuid;
BEGIN
  -- Find contacts that:
  -- 1. Started a sequence more than 7 days ago
  -- 2. Have no replies
  -- 3. Don't already have an active no-reply task
  
  FOR v_contact IN
    SELECT DISTINCT
      c.id as contact_id,
      c.org_id,
      c.workspace_id,
      se.campaign_id,
      MIN(se.created_at) as sequence_started_at
    FROM public.contacts c
    INNER JOIN public.sequence_enrollments se ON se.contact_id = c.id
    LEFT JOIN public.reply_threads rt ON rt.contact_id = c.id
    LEFT JOIN public.tasks t ON t.contact_id = c.id 
      AND t.auto_type = 'no_reply' 
      AND t.completed = false
    WHERE 
      se.created_at < now() - interval '7 days'
      AND rt.id IS NULL -- No replies
      AND t.id IS NULL -- No existing no-reply task
    GROUP BY c.id, c.org_id, c.workspace_id, se.campaign_id
    HAVING MIN(se.created_at) < now() - interval '7 days'
  LOOP
    -- Determine org_id
    v_org_id := COALESCE(v_contact.org_id, v_contact.workspace_id);
    
    -- Get assigned_to (contact owner or first org member)
    SELECT user_id INTO v_assigned_to
    FROM public.org_members
    WHERE org_id = v_org_id
    ORDER BY created_at ASC
    LIMIT 1;
    
    IF v_assigned_to IS NULL THEN
      SELECT user_id INTO v_assigned_to
      FROM public.org_memberships
      WHERE org_id = v_org_id
      AND (status IS NULL OR status = 'active')
      ORDER BY created_at ASC
      LIMIT 1;
    END IF;
    
    IF v_assigned_to IS NOT NULL AND v_org_id IS NOT NULL THEN
      INSERT INTO public.tasks (
        org_id,
        contact_id,
        assigned_to,
        title,
        due_at,
        auto_generated,
        auto_type,
        notes
      )
      VALUES (
        v_org_id,
        v_contact.contact_id,
        v_assigned_to,
        'Re-engage homeowner',
        now() + interval '1 day',
        true,
        'no_reply',
        format('No reply after 7 days. Sequence started: %s', v_contact.sequence_started_at)
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

-- 9. Function to create inspection reminder tasks (to be called when inspection_date is set)
CREATE OR REPLACE FUNCTION public.create_inspection_reminder_task()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
  v_assigned_to uuid;
BEGIN
  -- Only process if inspection_date is being set and is in the future
  IF NEW.inspection_date IS NULL OR NEW.inspection_date <= now() THEN
    RETURN NEW;
  END IF;

  -- Get org_id from contact
  v_org_id := COALESCE(NEW.org_id, NEW.workspace_id);
  
  -- Get assigned_to (contact owner or first org member)
  SELECT user_id INTO v_assigned_to
  FROM public.org_members
  WHERE org_id = v_org_id
  ORDER BY created_at ASC
  LIMIT 1;
  
  IF v_assigned_to IS NULL THEN
    SELECT user_id INTO v_assigned_to
    FROM public.org_memberships
    WHERE org_id = v_org_id
    AND (status IS NULL OR status = 'active')
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;
  
  -- Create reminder task 24 hours before inspection
  IF v_assigned_to IS NOT NULL AND v_org_id IS NOT NULL THEN
    INSERT INTO public.tasks (
      org_id,
      contact_id,
      assigned_to,
      title,
      due_at,
      auto_generated,
      auto_type,
      notes
    )
    VALUES (
      v_org_id,
      NEW.id,
      v_assigned_to,
      format('Confirm tomorrow''s inspection with %s', COALESCE(NEW.first_name || ' ' || NEW.last_name, NEW.email)),
      NEW.inspection_date - interval '24 hours',
      true,
      'inspection_reminder',
      format('Inspection scheduled for %s', NEW.inspection_date)
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- 10. Trigger for inspection reminders (if contacts table has inspection_date column)
-- Note: This will only work if the contacts table has an inspection_date column
-- If not, this trigger will be created but won't fire
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'contacts' 
    AND column_name = 'inspection_date'
  ) THEN
    DROP TRIGGER IF EXISTS trg_create_inspection_reminder ON public.contacts;
    CREATE TRIGGER trg_create_inspection_reminder
    AFTER INSERT OR UPDATE OF inspection_date ON public.contacts
    FOR EACH ROW
    EXECUTE FUNCTION public.create_inspection_reminder_task();
  END IF;
END $$;

-- 11. Function to create task due notifications (to be called by cron or trigger)
CREATE OR REPLACE FUNCTION public.create_task_due_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task RECORD;
BEGIN
  -- Find tasks that are due or overdue and haven't sent notifications yet
  FOR v_task IN
    SELECT t.*
    FROM public.tasks t
    LEFT JOIN public.notifications n ON n.task_id = t.id AND n.type = 'task_due'
    WHERE 
      t.completed = false
      AND t.due_at <= now()
      AND n.id IS NULL -- No notification sent yet
  LOOP
    -- Create notification using the helper function from Block 9500
    PERFORM public.create_task_due_notification(
      v_task.org_id,
      v_task.assigned_to,
      v_task.id,
      v_task.contact_id,
      NULL -- campaign_id can be derived from reply_thread_id if needed
    );
  END LOOP;
END;
$$;

-- 12. Comments
COMMENT ON TABLE public.tasks IS 'Tasks & Follow-Up Queue - Global task list with contact-linked reminders';
COMMENT ON COLUMN public.tasks.auto_generated IS 'Whether this task was auto-generated by the system';
COMMENT ON COLUMN public.tasks.auto_type IS 'Type of auto-generation: hot_lead, warm_lead, no_reply, inspection_reminder';
COMMENT ON COLUMN public.tasks.due_at IS 'When the task is due (used for sorting and notifications)';





























































