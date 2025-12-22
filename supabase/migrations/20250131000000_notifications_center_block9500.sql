-- Block 9500 — Notifications Center (Real-Time Alerts for Replies, Hot Leads, Tasks)
-- Creates notifications table with proper schema for V1

-- 1. Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL, -- organization/workspace ID
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- who should see it

  type text NOT NULL CHECK (type IN ('reply', 'hot_lead', 'warm_lead', 'task_due', 'system')),
  title text NOT NULL,
  body text NULL,

  -- Foreign key references (nullable)
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  reply_thread_id uuid REFERENCES public.reply_threads(id) ON DELETE SET NULL,
  task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,

  url text NULL, -- direct link (optional but handy)

  read boolean NOT NULL DEFAULT false,
  read_at timestamptz NULL,

  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_org_user ON public.notifications(org_id, user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_contact ON public.notifications(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_thread ON public.notifications(reply_thread_id) WHERE reply_thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_task ON public.notifications(task_id) WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_campaign ON public.notifications(campaign_id) WHERE campaign_id IS NOT NULL;

-- 3. Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
-- Users can only see notifications where notifications.user_id = auth.uid() AND notifications.org_id matches their org
-- Handle both org_members and org_memberships table names
CREATE POLICY "users_see_own_notifications"
ON public.notifications
FOR SELECT
USING (
  user_id = auth.uid() 
  AND (
    org_id IN (
      SELECT org_id FROM public.org_members WHERE user_id = auth.uid()
    )
    OR org_id IN (
      SELECT org_id FROM public.org_memberships WHERE user_id = auth.uid() AND (status IS NULL OR status = 'active')
    )
  )
);

-- Users can update their own notifications (mark as read)
CREATE POLICY "users_update_own_notifications"
ON public.notifications
FOR UPDATE
USING (
  user_id = auth.uid() 
  AND (
    org_id IN (
      SELECT org_id FROM public.org_members WHERE user_id = auth.uid()
    )
    OR org_id IN (
      SELECT org_id FROM public.org_memberships WHERE user_id = auth.uid() AND (status IS NULL OR status = 'active')
    )
  )
);

-- Service role can insert notifications (for system events)
CREATE POLICY "service_role_insert_notifications"
ON public.notifications
FOR INSERT
TO service_role
WITH CHECK (true);

-- Allow authenticated users to insert notifications for their own org
-- This is needed for API routes that create notifications
CREATE POLICY "users_insert_own_org_notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid() 
  AND (
    org_id IN (
      SELECT org_id FROM public.org_members WHERE user_id = auth.uid()
    )
    OR org_id IN (
      SELECT org_id FROM public.org_memberships WHERE user_id = auth.uid() AND (status IS NULL OR status = 'active')
    )
  )
);

-- 5. Helper function to get contact name or email for notification title
CREATE OR REPLACE FUNCTION public.get_contact_display_name(p_contact_id uuid)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (SELECT first_name || ' ' || last_name FROM public.contacts WHERE id = p_contact_id),
    (SELECT email FROM public.contacts WHERE id = p_contact_id),
    'Contact'
  );
$$;

-- 6. Helper function to create reply notification
CREATE OR REPLACE FUNCTION public.create_reply_notification(
  p_org_id uuid,
  p_user_id uuid,
  p_contact_id uuid,
  p_reply_thread_id uuid,
  p_campaign_id uuid,
  p_message_snippet text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_contact_name text;
  v_title text;
  v_url text;
BEGIN
  -- Get contact display name
  v_contact_name := public.get_contact_display_name(p_contact_id);
  
  -- Build title
  v_title := format('💬 Reply from %s', v_contact_name);
  
  -- Build URL
  v_url := format('/inbox/replies?threadId=%s', p_reply_thread_id);
  
  -- Insert notification
  INSERT INTO public.notifications (
    org_id, user_id, type, title, body,
    contact_id, reply_thread_id, campaign_id, url
  )
  VALUES (
    p_org_id, p_user_id, 'reply', v_title, p_message_snippet,
    p_contact_id, p_reply_thread_id, p_campaign_id, v_url
  )
  RETURNING id INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$;

-- 7. Helper function to create hot/warm lead notification
CREATE OR REPLACE FUNCTION public.create_lead_intent_notification(
  p_org_id uuid,
  p_user_id uuid,
  p_contact_id uuid,
  p_reply_thread_id uuid,
  p_campaign_id uuid,
  p_intent text -- 'hot' or 'warm'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_contact_name text;
  v_title text;
  v_url text;
BEGIN
  -- Get contact display name
  v_contact_name := public.get_contact_display_name(p_contact_id);
  
  -- Build title based on intent
  IF p_intent = 'hot' THEN
    v_title := format('🔥 New HOT lead from %s', v_contact_name);
  ELSIF p_intent = 'warm' THEN
    v_title := format('🔥 New WARM lead from %s', v_contact_name);
  ELSE
    RETURN NULL;
  END IF;
  
  -- Build URL (prefer contact page, fallback to thread)
  IF p_contact_id IS NOT NULL THEN
    v_url := format('/contacts/%s', p_contact_id);
  ELSIF p_reply_thread_id IS NOT NULL THEN
    v_url := format('/inbox/replies?threadId=%s', p_reply_thread_id);
  ELSE
    v_url := NULL;
  END IF;
  
  -- Insert notification
  INSERT INTO public.notifications (
    org_id, user_id, type, title, body,
    contact_id, reply_thread_id, campaign_id, url
  )
  VALUES (
    p_org_id, p_user_id, 
    CASE WHEN p_intent = 'hot' THEN 'hot_lead' ELSE 'warm_lead' END,
    v_title, 
    format('Intent: %s · Campaign: %s', 
      UPPER(p_intent),
      COALESCE((SELECT name FROM public.campaigns WHERE id = p_campaign_id), 'Unknown')
    ),
    p_contact_id, p_reply_thread_id, p_campaign_id, v_url
  )
  RETURNING id INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$;

-- 8. Helper function to create task due notification
CREATE OR REPLACE FUNCTION public.create_task_due_notification(
  p_org_id uuid,
  p_user_id uuid,
  p_task_id uuid,
  p_contact_id uuid,
  p_campaign_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_task_title text;
  v_contact_name text;
  v_campaign_name text;
  v_url text;
BEGIN
  -- Get task title
  SELECT title INTO v_task_title FROM public.tasks WHERE id = p_task_id;
  IF v_task_title IS NULL THEN
    v_task_title := 'Task';
  END IF;
  
  -- Get contact display name
  v_contact_name := public.get_contact_display_name(p_contact_id);
  
  -- Get campaign name
  SELECT name INTO v_campaign_name FROM public.campaigns WHERE id = p_campaign_id;
  
  -- Build URL (prefer contact page with tasks anchor, fallback to tasks page)
  IF p_contact_id IS NOT NULL THEN
    v_url := format('/contacts/%s#tasks', p_contact_id);
  ELSE
    v_url := format('/tasks?taskId=%s', p_task_id);
  END IF;
  
  -- Insert notification
  INSERT INTO public.notifications (
    org_id, user_id, type, title, body,
    task_id, contact_id, campaign_id, url
  )
  VALUES (
    p_org_id, p_user_id, 'task_due',
    format('⏰ Task due: %s', v_task_title),
    format('Due now · Contact: %s · Campaign: %s',
      v_contact_name,
      COALESCE(v_campaign_name, 'Unknown')
    ),
    p_task_id, p_contact_id, p_campaign_id, v_url
  )
  RETURNING id INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$;

-- 9. Add reminder_sent column to tasks table if it doesn't exist (for task due notifications)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'tasks' 
    AND column_name = 'reminder_sent'
  ) THEN
    ALTER TABLE public.tasks ADD COLUMN reminder_sent boolean NOT NULL DEFAULT false;
    CREATE INDEX IF NOT EXISTS idx_tasks_due_reminder ON public.tasks(due_at, reminder_sent) 
      WHERE due_at IS NOT NULL AND reminder_sent = false;
  END IF;
END $$;

-- 10. Trigger: Auto-create notification when new reply thread message is inserted
-- This trigger watches for new inbound messages in reply_threads
CREATE OR REPLACE FUNCTION public.fn_notify_new_reply()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_org_id uuid;
  v_user_id uuid;
  v_contact_id uuid;
  v_campaign_id uuid;
  v_thread_id uuid;
  v_message_snippet text;
BEGIN
  -- Only process inbound messages
  IF NEW.direction != 'inbound' AND NEW.direction != 'in' THEN
    RETURN NEW;
  END IF;

  -- Get thread info from reply_threads
  SELECT 
    rt.org_id, rt.account_id, rt.owner_id, rt.lead_id, rt.campaign_id, rt.id
  INTO 
    v_org_id, v_user_id, v_contact_id, v_campaign_id, v_thread_id
  FROM public.reply_threads rt
  WHERE rt.id = NEW.thread_id
  LIMIT 1;

  -- If user_id not found, try owner_id
  IF v_user_id IS NULL THEN
    SELECT owner_id INTO v_user_id
    FROM public.reply_threads
    WHERE id = NEW.thread_id
    LIMIT 1;
  END IF;

  -- If no thread found, try inbox_threads
  IF v_thread_id IS NULL THEN
    SELECT 
      it.org_id, it.account_id, it.lead_id, it.campaign_id, it.id
    INTO 
      v_org_id, v_user_id, v_contact_id, v_campaign_id, v_thread_id
    FROM public.inbox_threads it
    WHERE it.id = NEW.thread_id
    LIMIT 1;
  END IF;

  -- If still no thread, try to get from lead_id directly
  IF v_thread_id IS NULL AND NEW.lead_id IS NOT NULL THEN
    SELECT 
      l.org_id, l.owner_id, l.id, l.campaign_id
    INTO 
      v_org_id, v_user_id, v_contact_id, v_campaign_id
    FROM public.leads l
    WHERE l.id = NEW.lead_id
    LIMIT 1;
  END IF;

  -- Fallback: get org_id from campaign
  IF v_org_id IS NULL AND v_campaign_id IS NOT NULL THEN
    SELECT org_id INTO v_org_id
    FROM public.campaigns
    WHERE id = v_campaign_id
    LIMIT 1;
  END IF;

  -- Get message snippet
  v_message_snippet := COALESCE(
    LEFT(NEW.body_text, 280),
    LEFT(NEW.body_html, 280),
    LEFT(NEW.body, 280),
    ''
  );

  -- Create notification if we have required fields
  IF v_org_id IS NOT NULL AND v_user_id IS NOT NULL AND v_contact_id IS NOT NULL AND v_thread_id IS NOT NULL THEN
    PERFORM public.create_reply_notification(
      v_org_id,
      v_user_id,
      v_contact_id,
      v_thread_id,
      v_campaign_id,
      v_message_snippet
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Apply trigger to common message tables (idempotent)
DO $$
BEGIN
  -- Trigger on inbox_messages
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'inbox_messages') THEN
    DROP TRIGGER IF EXISTS trg_notify_new_reply_inbox ON public.inbox_messages;
    CREATE TRIGGER trg_notify_new_reply_inbox
    AFTER INSERT ON public.inbox_messages
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_notify_new_reply();
  END IF;

  -- Trigger on reply_messages
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'reply_messages') THEN
    DROP TRIGGER IF EXISTS trg_notify_new_reply_reply ON public.reply_messages;
    CREATE TRIGGER trg_notify_new_reply_reply
    AFTER INSERT ON public.reply_messages
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_notify_new_reply();
  END IF;
END $$;

-- 11. Trigger: Auto-create notification when lead intent changes to hot/warm
-- This trigger watches for intent changes on leads or campaign_leads
CREATE OR REPLACE FUNCTION public.fn_notify_hot_warm_lead()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_org_id uuid;
  v_user_id uuid;
  v_contact_id uuid;
  v_campaign_id uuid;
  v_reply_thread_id uuid;
  v_intent text;
  v_old_intent text;
BEGIN
  -- Check if intent changed to hot or warm
  v_intent := NULL;
  v_old_intent := NULL;

  -- Check various intent fields
  IF TG_TABLE_NAME = 'leads' THEN
    v_intent := NEW.intent_primary;
    v_old_intent := OLD.intent_primary;
    v_contact_id := NEW.id;
    v_org_id := NEW.org_id;
    v_user_id := NEW.owner_id OR NEW.user_id;
  ELSIF TG_TABLE_NAME = 'campaign_leads' THEN
    v_intent := NEW.last_reply_intent;
    v_old_intent := OLD.last_reply_intent;
    v_campaign_id := NEW.campaign_id;
    -- Get lead info
    SELECT id, org_id, owner_id, user_id INTO v_contact_id, v_org_id, v_user_id
    FROM public.leads WHERE id = NEW.lead_id LIMIT 1;
  END IF;

  -- Only notify if intent changed to hot or warm (and wasn't already hot/warm)
  IF v_intent IN ('hot', 'warm', 'positive', 'interested') 
     AND (v_old_intent IS NULL OR v_old_intent NOT IN ('hot', 'warm', 'positive', 'interested')) THEN
    
    -- Get reply_thread_id if available
    SELECT id INTO v_reply_thread_id
    FROM public.reply_threads
    WHERE lead_id = v_contact_id 
      AND (campaign_id = v_campaign_id OR v_campaign_id IS NULL)
    ORDER BY last_message_at DESC
    LIMIT 1;

    -- Normalize intent to 'hot' or 'warm'
    IF v_intent IN ('hot', 'positive', 'interested') THEN
      v_intent := 'hot';
    ELSIF v_intent = 'warm' THEN
      v_intent := 'warm';
    ELSE
      RETURN NEW; -- Skip if not hot/warm
    END IF;

    -- Create notification if we have required fields
    IF v_org_id IS NOT NULL AND v_user_id IS NOT NULL AND v_contact_id IS NOT NULL THEN
      PERFORM public.create_lead_intent_notification(
        v_org_id,
        v_user_id,
        v_contact_id,
        v_reply_thread_id,
        v_campaign_id,
        v_intent
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Apply trigger to leads table (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'leads') THEN
    DROP TRIGGER IF EXISTS trg_notify_hot_warm_lead ON public.leads;
    CREATE TRIGGER trg_notify_hot_warm_lead
    AFTER UPDATE OF intent_primary ON public.leads
    FOR EACH ROW
    WHEN (NEW.intent_primary IS DISTINCT FROM OLD.intent_primary)
    EXECUTE FUNCTION public.fn_notify_hot_warm_lead();
  END IF;

  -- Also trigger on campaign_leads if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'campaign_leads') THEN
    DROP TRIGGER IF EXISTS trg_notify_hot_warm_campaign_lead ON public.campaign_leads;
    CREATE TRIGGER trg_notify_hot_warm_campaign_lead
    AFTER UPDATE OF last_reply_intent ON public.campaign_leads
    FOR EACH ROW
    WHEN (NEW.last_reply_intent IS DISTINCT FROM OLD.last_reply_intent)
    EXECUTE FUNCTION public.fn_notify_hot_warm_lead();
  END IF;
END $$;

-- 12. Comment on table
COMMENT ON TABLE public.notifications IS 'Notifications center for replies, hot leads, and tasks. V1 focuses on new replies, hot/warm leads, and task due/overdue alerts.';
COMMENT ON COLUMN public.notifications.type IS 'Type: reply, hot_lead, warm_lead, task_due, system';
COMMENT ON COLUMN public.notifications.url IS 'Direct link for frontend routing (e.g., /inbox/replies?threadId=...)';

