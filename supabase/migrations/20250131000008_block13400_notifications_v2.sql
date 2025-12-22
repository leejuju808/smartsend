-- Block 13400 — Notifications v2 (Real-Time Socket Alerts + Multi-Channel Alerts)
-- Upgrades Block 9500 notifications to support categories, entity tracking, and all notification types

-- ============================================================================
-- 1. UPGRADE NOTIFICATIONS TABLE SCHEMA
-- ============================================================================

-- Add category column (lead, task, call, campaign, billing)
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS category text CHECK (category IN ('lead', 'task', 'call', 'campaign', 'billing'));

-- Add entity_type and entity_id for flexible entity references
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS entity_type text CHECK (entity_type IN ('contact', 'reply_thread', 'task', 'campaign', 'call_log')),
  ADD COLUMN IF NOT EXISTS entity_id uuid;

-- Add is_archived column (for future archive functionality)
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

-- Rename 'read' to 'is_read' for consistency (keeping 'read' for backward compatibility)
-- We'll use both columns for now to maintain compatibility
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'notifications' 
    AND column_name = 'read'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'notifications' 
    AND column_name = 'is_read'
  ) THEN
    ALTER TABLE public.notifications ADD COLUMN is_read boolean NOT NULL DEFAULT false;
    -- Sync existing data
    UPDATE public.notifications SET is_read = read WHERE is_read IS NULL;
  END IF;
END $$;

-- Update type CHECK constraint to include all new notification types
DO $$
BEGIN
  -- Drop old constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'notifications_type_check' 
    AND conrelid = 'public.notifications'::regclass
  ) THEN
    ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
  END IF;
  
  -- Add new constraint with all notification types
  ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_type_check 
    CHECK (type IN (
      -- Lead & Inbox Alerts
      'reply', 'hot_lead', 'warm_lead', 'sms_received', 'thread_resurfaced',
      -- Tasks & Follow-Ups
      'task_assigned', 'task_due', 'task_overdue', 'task_completed',
      -- Calls
      'missed_call', 'call_followup_due',
      -- Campaign & System
      'campaign_paused', 'campaign_limit_reached', 'deliverability_issue', 'warmup_warning',
      -- Billing
      'billing_issue', 'plan_limit_reached', 'subscription_past_due',
      -- System (general)
      'system'
    ));
END $$;

-- ============================================================================
-- 2. CREATE INDEXES FOR NEW COLUMNS
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_notifications_category ON public.notifications(category);
CREATE INDEX IF NOT EXISTS idx_notifications_entity ON public.notifications(entity_type, entity_id) WHERE entity_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_org_category ON public.notifications(org_id, category);

-- ============================================================================
-- 3. HELPER FUNCTION: CREATE NOTIFICATION (Unified)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_notification_v2(
  p_org_id uuid,
  p_user_id uuid,
  p_category text, -- 'lead', 'task', 'call', 'campaign', 'billing'
  p_type text, -- specific type like 'hot_lead', 'task_due', etc.
  p_title text,
  p_body text DEFAULT NULL,
  p_entity_type text DEFAULT NULL, -- 'contact', 'reply_thread', 'task', 'campaign', 'call_log'
  p_entity_id uuid DEFAULT NULL,
  p_url text DEFAULT NULL,
  p_contact_id uuid DEFAULT NULL,
  p_reply_thread_id uuid DEFAULT NULL,
  p_task_id uuid DEFAULT NULL,
  p_campaign_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
BEGIN
  -- Insert notification
  INSERT INTO public.notifications (
    org_id, user_id, category, type, title, body,
    entity_type, entity_id, url,
    contact_id, reply_thread_id, task_id, campaign_id,
    read, is_read, created_at
  )
  VALUES (
    p_org_id, p_user_id, p_category, p_type, p_title, p_body,
    p_entity_type, p_entity_id, p_url,
    p_contact_id, p_reply_thread_id, p_task_id, p_campaign_id,
    false, false, now()
  )
  RETURNING id INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$;

-- ============================================================================
-- 4. NOTIFICATION FUNCTIONS FOR SPECIFIC TYPES
-- ============================================================================

-- A. Task Notifications

CREATE OR REPLACE FUNCTION public.create_task_assigned_notification(
  p_org_id uuid,
  p_user_id uuid,
  p_task_id uuid
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
  -- Get task details
  SELECT 
    t.title,
    public.get_contact_display_name(t.contact_id)
  INTO v_task_title, v_contact_name
  FROM public.tasks t
  WHERE t.id = p_task_id;
  
  IF v_task_title IS NULL THEN
    v_task_title := 'Task';
  END IF;
  
  -- Build URL
  IF EXISTS (SELECT 1 FROM public.tasks WHERE id = p_task_id AND contact_id IS NOT NULL) THEN
    SELECT contact_id INTO v_url FROM public.tasks WHERE id = p_task_id;
    v_url := format('/contacts/%s#tasks', v_url);
  ELSE
    v_url := format('/tasks?taskId=%s', p_task_id);
  END IF;
  
  -- Create notification
  SELECT public.create_notification_v2(
    p_org_id := p_org_id,
    p_user_id := p_user_id,
    p_category := 'task',
    p_type := 'task_assigned',
    p_title := format('✅ Task assigned: %s', v_task_title),
    p_body := format('Assigned to you%s', 
      CASE WHEN v_contact_name IS NOT NULL THEN format(' · Contact: %s', v_contact_name) ELSE '' END
    ),
    p_entity_type := 'task',
    p_entity_id := p_task_id,
    p_url := v_url,
    p_task_id := p_task_id
  ) INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_task_due_notification_v2(
  p_org_id uuid,
  p_user_id uuid,
  p_task_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_task_title text;
  v_due_at timestamptz;
  v_contact_name text;
  v_url text;
BEGIN
  -- Get task details
  SELECT 
    t.title,
    t.due_at,
    public.get_contact_display_name(t.contact_id)
  INTO v_task_title, v_due_at, v_contact_name
  FROM public.tasks t
  WHERE t.id = p_task_id;
  
  IF v_task_title IS NULL THEN
    v_task_title := 'Task';
  END IF;
  
  -- Build URL
  IF EXISTS (SELECT 1 FROM public.tasks WHERE id = p_task_id AND contact_id IS NOT NULL) THEN
    SELECT contact_id INTO v_url FROM public.tasks WHERE id = p_task_id;
    v_url := format('/contacts/%s#tasks', v_url);
  ELSE
    v_url := format('/tasks?taskId=%s', p_task_id);
  END IF;
  
  -- Create notification
  SELECT public.create_notification_v2(
    p_org_id := p_org_id,
    p_user_id := p_user_id,
    p_category := 'task',
    p_type := 'task_due',
    p_title := format('⏰ Task due: %s', v_task_title),
    p_body := format('Due %s%s',
      CASE 
        WHEN v_due_at::date = CURRENT_DATE THEN 'today'
        WHEN v_due_at::date = CURRENT_DATE + INTERVAL '1 day' THEN 'tomorrow'
        ELSE format('on %s', to_char(v_due_at, 'Mon DD'))
      END,
      CASE WHEN v_contact_name IS NOT NULL THEN format(' · Contact: %s', v_contact_name) ELSE '' END
    ),
    p_entity_type := 'task',
    p_entity_id := p_task_id,
    p_url := v_url,
    p_task_id := p_task_id
  ) INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_task_overdue_notification(
  p_org_id uuid,
  p_user_id uuid,
  p_task_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_task_title text;
  v_due_at timestamptz;
  v_contact_name text;
  v_url text;
BEGIN
  -- Get task details
  SELECT 
    t.title,
    t.due_at,
    public.get_contact_display_name(t.contact_id)
  INTO v_task_title, v_due_at, v_contact_name
  FROM public.tasks t
  WHERE t.id = p_task_id;
  
  IF v_task_title IS NULL THEN
    v_task_title := 'Task';
  END IF;
  
  -- Build URL
  IF EXISTS (SELECT 1 FROM public.tasks WHERE id = p_task_id AND contact_id IS NOT NULL) THEN
    SELECT contact_id INTO v_url FROM public.tasks WHERE id = p_task_id;
    v_url := format('/contacts/%s#tasks', v_url);
  ELSE
    v_url := format('/tasks?taskId=%s', p_task_id);
  END IF;
  
  -- Create notification
  SELECT public.create_notification_v2(
    p_org_id := p_org_id,
    p_user_id := p_user_id,
    p_category := 'task',
    p_type := 'task_overdue',
    p_title := format('⚠️ Task overdue: %s', v_task_title),
    p_body := format('Was due %s%s',
      to_char(v_due_at, 'Mon DD'),
      CASE WHEN v_contact_name IS NOT NULL THEN format(' · Contact: %s', v_contact_name) ELSE '' END
    ),
    p_entity_type := 'task',
    p_entity_id := p_task_id,
    p_url := v_url,
    p_task_id := p_task_id
  ) INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$;

-- B. Call Notifications

CREATE OR REPLACE FUNCTION public.create_missed_call_notification_v2(
  p_org_id uuid,
  p_user_id uuid,
  p_call_log_id uuid,
  p_contact_id uuid DEFAULT NULL,
  p_phone text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_contact_name text;
  v_display_phone text;
  v_url text;
BEGIN
  -- Get contact name if available
  IF p_contact_id IS NOT NULL THEN
    v_contact_name := public.get_contact_display_name(p_contact_id);
  END IF;
  
  v_display_phone := COALESCE(p_phone, 'Unknown number');
  
  -- Build URL
  IF p_contact_id IS NOT NULL THEN
    v_url := format('/contacts/%s', p_contact_id);
  ELSE
    v_url := '/contacts';
  END IF;
  
  -- Create notification
  SELECT public.create_notification_v2(
    p_org_id := p_org_id,
    p_user_id := p_user_id,
    p_category := 'call',
    p_type := 'missed_call',
    p_title := format('📞 Missed call from %s', COALESCE(v_contact_name, v_display_phone)),
    p_body := format('Missed call from %s · Follow-up recommended', COALESCE(v_contact_name, v_display_phone)),
    p_entity_type := 'call_log',
    p_entity_id := p_call_log_id,
    p_url := v_url,
    p_contact_id := p_contact_id
  ) INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$;

-- C. Snoozed Thread Resurfacing

CREATE OR REPLACE FUNCTION public.create_thread_resurfaced_notification(
  p_org_id uuid,
  p_user_id uuid,
  p_reply_thread_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_contact_name text;
  v_campaign_name text;
  v_url text;
BEGIN
  -- Get thread info
  SELECT 
    public.get_contact_display_name(rt.contact_id),
    c.name
  INTO v_contact_name, v_campaign_name
  FROM public.reply_threads rt
  LEFT JOIN public.campaigns c ON c.id = rt.campaign_id
  WHERE rt.id = p_reply_thread_id;
  
  -- Build URL
  v_url := format('/inbox/replies?threadId=%s', p_reply_thread_id);
  
  -- Create notification
  SELECT public.create_notification_v2(
    p_org_id := p_org_id,
    p_user_id := p_user_id,
    p_category := 'lead',
    p_type := 'thread_resurfaced',
    p_title := format('🔔 Thread resurfaced: %s', COALESCE(v_contact_name, 'Contact')),
    p_body := format('Snooze period ended · Ready for follow-up%s',
      CASE WHEN v_campaign_name IS NOT NULL THEN format(' · Campaign: %s', v_campaign_name) ELSE '' END
    ),
    p_entity_type := 'reply_thread',
    p_entity_id := p_reply_thread_id,
    p_url := v_url,
    p_reply_thread_id := p_reply_thread_id
  ) INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$;

-- D. Campaign Notifications

CREATE OR REPLACE FUNCTION public.create_campaign_paused_notification(
  p_org_id uuid,
  p_user_id uuid,
  p_campaign_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_campaign_name text;
  v_url text;
BEGIN
  -- Get campaign name
  SELECT name INTO v_campaign_name FROM public.campaigns WHERE id = p_campaign_id;
  IF v_campaign_name IS NULL THEN
    v_campaign_name := 'Campaign';
  END IF;
  
  v_url := format('/campaigns/%s', p_campaign_id);
  
  -- Create notification
  SELECT public.create_notification_v2(
    p_org_id := p_org_id,
    p_user_id := p_user_id,
    p_category := 'campaign',
    p_type := 'campaign_paused',
    p_title := format('⏸️ Campaign paused: %s', v_campaign_name),
    p_body := format('Campaign auto-paused%s · Review and clean your list before resuming',
      CASE WHEN p_reason IS NOT NULL THEN format(': %s', p_reason) ELSE '' END
    ),
    p_entity_type := 'campaign',
    p_entity_id := p_campaign_id,
    p_url := v_url,
    p_campaign_id := p_campaign_id
  ) INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_deliverability_issue_notification(
  p_org_id uuid,
  p_user_id uuid,
  p_campaign_id uuid DEFAULT NULL,
  p_issue_type text DEFAULT NULL,
  p_details text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_campaign_name text;
  v_url text;
BEGIN
  IF p_campaign_id IS NOT NULL THEN
    SELECT name INTO v_campaign_name FROM public.campaigns WHERE id = p_campaign_id;
    v_url := format('/campaigns/%s', p_campaign_id);
  ELSE
    v_campaign_name := NULL;
    v_url := '/campaigns';
  END IF;
  
  -- Create notification
  SELECT public.create_notification_v2(
    p_org_id := p_org_id,
    p_user_id := p_user_id,
    p_category := 'campaign',
    p_type := 'deliverability_issue',
    p_title := format('⚠️ Deliverability issue%s', 
      CASE WHEN v_campaign_name IS NOT NULL THEN format(': %s', v_campaign_name) ELSE '' END
    ),
    p_body := COALESCE(p_details, 'High bounce rate or reputation issue detected · Review your sending practices'),
    p_entity_type := CASE WHEN p_campaign_id IS NOT NULL THEN 'campaign' ELSE NULL END,
    p_entity_id := p_campaign_id,
    p_url := v_url,
    p_campaign_id := p_campaign_id
  ) INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_plan_limit_notification(
  p_org_id uuid,
  p_user_id uuid,
  p_limit_type text, -- 'emails', 'sms', 'campaigns', 'storage'
  p_current_usage bigint DEFAULT NULL,
  p_limit_value bigint DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_title text;
  v_body text;
BEGIN
  v_title := format('📊 Plan limit reached: %s', INITCAP(p_limit_type));
  v_body := format('You have reached your %s limit', INITCAP(p_limit_type));
  
  IF p_current_usage IS NOT NULL AND p_limit_value IS NOT NULL THEN
    v_body := format('%s (%s / %s)', v_body, p_current_usage, p_limit_value);
  END IF;
  
  v_body := v_body || ' · Upgrade your plan to continue';
  
  -- Create notification
  SELECT public.create_notification_v2(
    p_org_id := p_org_id,
    p_user_id := p_user_id,
    p_category := 'billing',
    p_type := 'plan_limit_reached',
    p_title := v_title,
    p_body := v_body,
    p_url := '/settings/billing'
  ) INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_billing_issue_notification(
  p_org_id uuid,
  p_user_id uuid,
  p_issue_type text DEFAULT NULL -- 'payment_failed', 'subscription_past_due', etc.
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_title text;
  v_body text;
BEGIN
  v_title := '💳 Billing issue';
  v_body := 'Payment issue detected';
  
  IF p_issue_type = 'payment_failed' THEN
    v_title := '💳 Payment failed';
    v_body := 'Your payment method failed · Update your billing information to continue service';
  ELSIF p_issue_type = 'subscription_past_due' THEN
    v_title := '💳 Subscription past due';
    v_body := 'Your subscription payment is overdue · Update your payment method';
  END IF;
  
  -- Create notification
  SELECT public.create_notification_v2(
    p_org_id := p_org_id,
    p_user_id := p_user_id,
    p_category := 'billing',
    p_type := 'billing_issue',
    p_title := v_title,
    p_body := v_body,
    p_url := '/settings/billing'
  ) INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$;

-- ============================================================================
-- 5. TRIGGERS FOR TASK EVENTS
-- ============================================================================

-- Trigger: Task assigned
CREATE OR REPLACE FUNCTION public.fn_notify_task_assigned()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only notify if assigned_to changed and is not null
  IF NEW.assigned_to IS NOT NULL 
     AND (OLD.assigned_to IS NULL OR NEW.assigned_to != OLD.assigned_to)
     AND NEW.status != 'completed' THEN
    PERFORM public.create_task_assigned_notification(
      NEW.org_id,
      NEW.assigned_to,
      NEW.id
    );
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_task_assigned ON public.tasks;
CREATE TRIGGER trg_notify_task_assigned
AFTER INSERT OR UPDATE OF assigned_to ON public.tasks
FOR EACH ROW
WHEN (NEW.assigned_to IS NOT NULL AND NEW.status != 'completed')
EXECUTE FUNCTION public.fn_notify_task_assigned();

-- Trigger: Task due today (called by cron)
-- Note: This will be called by a cron job, not a trigger
-- We'll create a function that can be called periodically

CREATE OR REPLACE FUNCTION public.check_and_notify_due_tasks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task RECORD;
BEGIN
  -- Find tasks due today that haven't been notified yet
  FOR v_task IN
    SELECT t.id, t.org_id, t.assigned_to, t.due_at, t.reminder_sent
    FROM public.tasks t
    WHERE t.completed = false
      AND t.status != 'completed'
      AND t.due_at IS NOT NULL
      AND t.due_at::date = CURRENT_DATE
      AND (t.reminder_sent = false OR t.reminder_sent IS NULL)
      AND t.assigned_to IS NOT NULL
  LOOP
    PERFORM public.create_task_due_notification_v2(
      v_task.org_id,
      v_task.assigned_to,
      v_task.id
    );
    
    -- Mark reminder as sent
    UPDATE public.tasks
    SET reminder_sent = true
    WHERE id = v_task.id;
  END LOOP;
END;
$$;

-- Trigger: Task overdue
CREATE OR REPLACE FUNCTION public.check_and_notify_overdue_tasks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task RECORD;
BEGIN
  -- Find overdue tasks (due before today, not completed, not already notified today)
  FOR v_task IN
    SELECT DISTINCT ON (t.id) t.id, t.org_id, t.assigned_to, t.due_at
    FROM public.tasks t
    WHERE t.completed = false
      AND t.status != 'completed'
      AND t.due_at IS NOT NULL
      AND t.due_at < now()
      AND t.assigned_to IS NOT NULL
      -- Only notify once per day
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.task_id = t.id
          AND n.type = 'task_overdue'
          AND n.created_at::date = CURRENT_DATE
      )
  LOOP
    PERFORM public.create_task_overdue_notification(
      v_task.org_id,
      v_task.assigned_to,
      v_task.id
    );
  END LOOP;
END;
$$;

-- ============================================================================
-- 6. UPDATE MISSED CALL TRIGGER
-- ============================================================================

-- Update existing missed call notification function to use V2
CREATE OR REPLACE FUNCTION public.fn_notify_missed_call_v2()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only process missed calls
  IF NEW.outcome != 'missed' THEN
    RETURN NEW;
  END IF;
  
  -- Create notification using V2 function
  PERFORM public.create_missed_call_notification_v2(
    NEW.org_id,
    NEW.user_id,
    NEW.id,
    NEW.contact_id,
    NEW.phone
  );
  
  RETURN NEW;
END;
$$;

-- Update trigger (drop old if exists, create new)
DROP TRIGGER IF EXISTS trg_create_missed_call_notification ON public.call_logs;
DROP TRIGGER IF EXISTS trg_notify_missed_call_v2 ON public.call_logs;
CREATE TRIGGER trg_notify_missed_call_v2
AFTER INSERT ON public.call_logs
FOR EACH ROW
WHEN (NEW.outcome = 'missed')
EXECUTE FUNCTION public.fn_notify_missed_call_v2();

-- ============================================================================
-- 7. TRIGGER FOR SNOOZED THREAD RESURFACING
-- ============================================================================

-- Update auto_unsnooze_threads function to create notifications
CREATE OR REPLACE FUNCTION public.auto_unsnooze_threads_with_notifications()
RETURNS TABLE(
  thread_id uuid,
  account_id uuid,
  owner_id uuid,
  lead_id uuid,
  campaign_id uuid,
  org_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_thread RECORD;
BEGIN
  -- Find threads that should be unsnoozed
  FOR v_thread IN
    SELECT 
      t.id,
      t.account_id,
      t.owner_id,
      t.lead_id,
      t.campaign_id,
      t.org_id,
      t.snoozed_until
    FROM public.reply_threads t
    WHERE t.snoozed_until IS NOT NULL
      AND t.snoozed_until <= now()
      AND t.status = 'snoozed'
  LOOP
    -- Update thread to unsnoozed
    UPDATE public.reply_threads
    SET 
      status = 'open',
      snoozed_until = NULL,
      updated_at = now()
    WHERE id = v_thread.id;
    
    -- Create notification if user is assigned
    IF v_thread.owner_id IS NOT NULL AND v_thread.org_id IS NOT NULL THEN
      PERFORM public.create_thread_resurfaced_notification(
        v_thread.org_id,
        v_thread.owner_id,
        v_thread.id
      );
    END IF;
    
    -- Return thread info
    thread_id := v_thread.id;
    account_id := v_thread.account_id;
    owner_id := v_thread.owner_id;
    lead_id := v_thread.lead_id;
    campaign_id := v_thread.campaign_id;
    org_id := v_thread.org_id;
    
    RETURN NEXT;
  END LOOP;
  
  RETURN;
END;
$$;

-- ============================================================================
-- 8. UPDATE EXISTING NOTIFICATION FUNCTIONS TO USE V2 SCHEMA
-- ============================================================================

-- Update create_reply_notification to set category
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
  v_contact_name := public.get_contact_display_name(p_contact_id);
  v_title := format('💬 Reply from %s', v_contact_name);
  v_url := format('/inbox/replies?threadId=%s', p_reply_thread_id);
  
  -- Use V2 function
  SELECT public.create_notification_v2(
    p_org_id := p_org_id,
    p_user_id := p_user_id,
    p_category := 'lead',
    p_type := 'reply',
    p_title := v_title,
    p_body := p_message_snippet,
    p_entity_type := 'reply_thread',
    p_entity_id := p_reply_thread_id,
    p_url := v_url,
    p_contact_id := p_contact_id,
    p_reply_thread_id := p_reply_thread_id,
    p_campaign_id := p_campaign_id
  ) INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$;

-- Update create_lead_intent_notification to set category
CREATE OR REPLACE FUNCTION public.create_lead_intent_notification(
  p_org_id uuid,
  p_user_id uuid,
  p_contact_id uuid,
  p_reply_thread_id uuid,
  p_campaign_id uuid,
  p_intent text
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
  v_type text;
BEGIN
  v_contact_name := public.get_contact_display_name(p_contact_id);
  
  IF p_intent = 'hot' THEN
    v_title := format('🔥 New HOT lead from %s', v_contact_name);
    v_type := 'hot_lead';
  ELSIF p_intent = 'warm' THEN
    v_title := format('🔥 New WARM lead from %s', v_contact_name);
    v_type := 'warm_lead';
  ELSE
    RETURN NULL;
  END IF;
  
  IF p_contact_id IS NOT NULL THEN
    v_url := format('/contacts/%s', p_contact_id);
  ELSIF p_reply_thread_id IS NOT NULL THEN
    v_url := format('/inbox/replies?threadId=%s', p_reply_thread_id);
  ELSE
    v_url := NULL;
  END IF;
  
  -- Use V2 function
  SELECT public.create_notification_v2(
    p_org_id := p_org_id,
    p_user_id := p_user_id,
    p_category := 'lead',
    p_type := v_type,
    p_title := v_title,
    p_body := format('Intent: %s · Campaign: %s', 
      UPPER(p_intent),
      COALESCE((SELECT name FROM public.campaigns WHERE id = p_campaign_id), 'Unknown')
    ),
    p_entity_type := 'reply_thread',
    p_entity_id := p_reply_thread_id,
    p_url := v_url,
    p_contact_id := p_contact_id,
    p_reply_thread_id := p_reply_thread_id,
    p_campaign_id := p_campaign_id
  ) INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$;

-- ============================================================================
-- 9. ENABLE REALTIME FOR NOTIFICATIONS TABLE
-- ============================================================================

-- Enable Realtime publication for notifications table
-- Note: This may need to be run manually in Supabase Dashboard if not already enabled
DO $$
BEGIN
  -- Add table to realtime publication if not already added
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    -- Check if table is already in publication
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND tablename = 'notifications'
    ) THEN
      -- Note: This requires superuser privileges, so we'll just document it
      -- Run manually: ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
      RAISE NOTICE 'Realtime publication exists. Ensure notifications table is added to supabase_realtime publication.';
    END IF;
  END IF;
END $$;

-- ============================================================================
-- 10. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.notifications IS 'Notifications v2: Real-time alerts for replies, hot leads, tasks, calls, campaigns, and billing. Supports categories and entity tracking.';
COMMENT ON COLUMN public.notifications.category IS 'Category: lead, task, call, campaign, billing';
COMMENT ON COLUMN public.notifications.entity_type IS 'Entity type: contact, reply_thread, task, campaign, call_log';
COMMENT ON COLUMN public.notifications.entity_id IS 'ID of the referenced entity';
COMMENT ON COLUMN public.notifications.is_read IS 'Whether notification has been read (V2 field)';
COMMENT ON COLUMN public.notifications.is_archived IS 'Whether notification has been archived';



























































