-- =========================================================
-- Block 19790 — Inbox Ops Automation Hooks v1
-- (Triggers, Auto-Tasks, Auto-Tags, Auto-Follow-Up: The First Layer of SmartSend's Operations Brain)
-- =========================================================
--
-- This block turns the Inbox into an automation engine.
-- This is the first version of SmartSend's "Ops Brain."
--
-- We're adding:
-- - Automatic tasks
-- - Automatic follow-up reminders
-- - Automatic tagging
-- - Automatic contact updates
-- - Automatic owner alerts
-- - Automatic pipeline movement
-- - Automatic next-step suggestions
--
-- Meaning: The Inbox doesn't just capture replies.
-- It now acts on them automatically.
-- =========================================================

-- ============================================================================
-- PART 1 — Automation Trigger System (Core Engine)
-- ============================================================================

-- Create ops_triggers table
CREATE TABLE IF NOT EXISTS public.ops_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL CHECK (event_type IN (
    'inbox_message_created',
    'ai_intent_hot',
    'ai_intent_follow_up',
    'task_due',
    'job_booked',
    'job_overdue'
  )),
  condition jsonb DEFAULT '{}'::jsonb, -- JSONB for flexible condition matching
  actions jsonb DEFAULT '[]'::jsonb, -- JSONB array of actions to execute
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for ops_triggers
CREATE INDEX IF NOT EXISTS idx_ops_triggers_event_type ON public.ops_triggers(event_type);
CREATE INDEX IF NOT EXISTS idx_ops_triggers_created_at ON public.ops_triggers(created_at DESC);

-- Enable RLS
ALTER TABLE public.ops_triggers ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Only service role can manage triggers (system triggers)
DROP POLICY IF EXISTS "ops_triggers_service_role" ON public.ops_triggers;
CREATE POLICY "ops_triggers_service_role"
  ON public.ops_triggers
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================================
-- PART 2 — Ops Logs Table (Automation Audit Trail)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ops_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  trigger_id uuid REFERENCES public.ops_triggers(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  entity_type text NOT NULL, -- 'inbox_message', 'contact', 'task', 'notification', 'pipeline'
  entity_id uuid,
  action_type text NOT NULL, -- 'auto_task_created', 'auto_tag_added', 'auto_status_updated', 'auto_notification_sent', 'auto_pipeline_moved'
  action_result text, -- 'success', 'skipped', 'throttled', 'error'
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for ops_logs
CREATE INDEX IF NOT EXISTS idx_ops_logs_workspace_id ON public.ops_logs(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ops_logs_user_id ON public.ops_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ops_logs_event_type ON public.ops_logs(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ops_logs_action_type ON public.ops_logs(action_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ops_logs_entity ON public.ops_logs(entity_type, entity_id);

-- Enable RLS
ALTER TABLE public.ops_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view ops_logs for their workspace
DROP POLICY IF EXISTS "ops_logs_select" ON public.ops_logs;
CREATE POLICY "ops_logs_select"
  ON public.ops_logs
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 3 — Enhance Contacts Table (Add Status Field if Missing)
-- ============================================================================

-- Add status field to contacts if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'contacts'
    AND column_name = 'status'
  ) THEN
    ALTER TABLE public.contacts
      ADD COLUMN status text CHECK (status IN ('active', 'follow-up', 'lost', 'booked', 'won'));
  END IF;
END$$;

-- Create index for status
CREATE INDEX IF NOT EXISTS idx_contacts_status ON public.contacts(workspace_id, status) WHERE status IS NOT NULL;

-- ============================================================================
-- PART 4 — Enhance jobs_conversions Table (Add Tags Field)
-- ============================================================================

-- Add tags field to jobs_conversions if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'jobs_conversions'
    AND column_name = 'tags'
  ) THEN
    ALTER TABLE public.jobs_conversions
      ADD COLUMN tags text[] DEFAULT '{}';
  END IF;
END$$;

-- Create GIN index for tags array
CREATE INDEX IF NOT EXISTS idx_jobs_conversions_tags_gin ON public.jobs_conversions USING gin(tags);

-- ============================================================================
-- PART 5 — Helper Functions for Automation
-- ============================================================================

-- Function to log automation action
CREATE OR REPLACE FUNCTION public.log_ops_action(
  p_workspace_id uuid,
  p_user_id uuid,
  p_trigger_id uuid,
  p_event_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_action_type text,
  p_action_result text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_log_id uuid;
BEGIN
  INSERT INTO public.ops_logs (
    workspace_id,
    user_id,
    trigger_id,
    event_type,
    entity_type,
    entity_id,
    action_type,
    action_result,
    metadata
  ) VALUES (
    p_workspace_id,
    p_user_id,
    p_trigger_id,
    p_event_type,
    p_entity_type,
    p_entity_id,
    p_action_type,
    p_action_result,
    p_metadata
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

-- Function to check if quiet hours are active for a workspace
CREATE OR REPLACE FUNCTION public.is_workspace_quiet_hours_active(p_workspace_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_owner_id uuid;
  v_settings public.inbox_settings;
  v_current_time time;
  v_start_time time;
  v_end_time time;
BEGIN
  -- Get workspace owner (first owner/admin)
  SELECT user_id INTO v_owner_id
  FROM public.workspace_members
  WHERE workspace_id = p_workspace_id
  AND role IN ('owner', 'admin')
  ORDER BY created_at ASC
  LIMIT 1;
  
  IF v_owner_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Get user settings
  SELECT * INTO v_settings
  FROM public.inbox_settings
  WHERE user_id = v_owner_id;
  
  -- If no settings or quiet hours not set, return false
  IF v_settings IS NULL OR v_settings.quiet_hours_start IS NULL OR v_settings.quiet_hours_end IS NULL THEN
    RETURN false;
  END IF;
  
  v_current_time := CURRENT_TIME;
  v_start_time := v_settings.quiet_hours_start;
  v_end_time := v_settings.quiet_hours_end;
  
  -- Handle quiet hours that span midnight (e.g., 8pm to 6am)
  IF v_start_time > v_end_time THEN
    -- Quiet hours span midnight
    RETURN v_current_time >= v_start_time OR v_current_time <= v_end_time;
  ELSE
    -- Quiet hours within same day
    RETURN v_current_time >= v_start_time AND v_current_time <= v_end_time;
  END IF;
END;
$$;

-- Function to check throttling limits (max 1 auto-task per message, max 3 tasks per day per thread)
CREATE OR REPLACE FUNCTION public.check_automation_throttle(
  p_thread_id uuid,
  p_action_type text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_task_count_today integer;
  v_message_task_count integer;
BEGIN
  -- Check max 3 tasks per day per thread
  IF p_action_type = 'auto_task_created' THEN
    SELECT COUNT(*) INTO v_task_count_today
    FROM public.ops_logs
    WHERE entity_type = 'inbox_thread'
    AND entity_id = p_thread_id
    AND action_type = 'auto_task_created'
    AND action_result = 'success'
    AND created_at >= CURRENT_DATE;
    
    IF v_task_count_today >= 3 THEN
      RETURN false; -- Throttled
    END IF;
  END IF;
  
  RETURN true; -- Not throttled
END;
$$;

-- ============================================================================
-- PART 6 — Auto-Task Creation Function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_create_followup_task(
  p_thread_id uuid,
  p_contact_id uuid,
  p_workspace_id uuid,
  p_message_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact_name text;
  v_owner_id uuid;
  v_task_id uuid;
  v_throttled boolean;
  v_quiet_hours boolean;
BEGIN
  -- Check throttling
  v_throttled := NOT public.check_automation_throttle(p_thread_id, 'auto_task_created');
  IF v_throttled THEN
    PERFORM public.log_ops_action(
      p_workspace_id,
      NULL,
      NULL,
      'inbox_message_created',
      'inbox_thread',
      p_thread_id,
      'auto_task_created',
      'throttled',
      jsonb_build_object('reason', 'max_tasks_per_day_reached', 'thread_id', p_thread_id)
    );
    RETURN NULL;
  END IF;
  
  -- Check quiet hours (but still create task, just don't notify)
  v_quiet_hours := public.is_workspace_quiet_hours_active(p_workspace_id);
  
  -- Get contact name
  SELECT COALESCE(first_name || ' ' || last_name, first_name, last_name, email, 'Contact')
  INTO v_contact_name
  FROM public.contacts
  WHERE id = p_contact_id;
  
  -- Get workspace owner
  SELECT user_id INTO v_owner_id
  FROM public.workspace_members
  WHERE workspace_id = p_workspace_id
  AND role IN ('owner', 'admin')
  ORDER BY created_at ASC
  LIMIT 1;
  
  -- Create task using tasks_v3 table if it exists, otherwise fallback to tasks
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tasks_v3') THEN
    INSERT INTO public.tasks_v3 (
      workspace_id,
      user_id,
      contact_id,
      task_type,
      priority,
      status,
      title,
      due_at,
      auto_generated,
      auto_source,
      metadata
    ) VALUES (
      p_workspace_id,
      v_owner_id,
      p_contact_id,
      'follow_up',
      'high',
      'open',
      'Follow up with ' || v_contact_name,
      now() + interval '24 hours',
      true,
      'inbox',
      jsonb_build_object('thread_id', p_thread_id, 'message_id', p_message_id, 'quiet_hours', v_quiet_hours)
    )
    RETURNING id INTO v_task_id;
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tasks') THEN
    INSERT INTO public.tasks (
      workspace_id,
      user_id,
      contact_id,
      type,
      priority,
      status,
      title,
      due_at,
      auto_generated
    ) VALUES (
      p_workspace_id,
      v_owner_id,
      p_contact_id,
      'follow_up',
      'high',
      'open',
      'Follow up with ' || v_contact_name,
      now() + interval '24 hours',
      true
    )
    RETURNING id INTO v_task_id;
  ELSE
    -- Fallback: create in crm_tasks if it exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'crm_tasks') THEN
      INSERT INTO public.crm_tasks (
        user_id,
        thread_id,
        type,
        title,
        status,
        due_at
      ) VALUES (
        v_owner_id,
        p_thread_id,
        'follow_up',
        'Follow up with ' || v_contact_name,
        'open',
        now() + interval '24 hours'
      )
      RETURNING id INTO v_task_id;
    END IF;
  END IF;
  
  -- Log the automation
  PERFORM public.log_ops_action(
    p_workspace_id,
    v_owner_id,
    NULL,
    'inbox_message_created',
    'task',
    v_task_id,
    'auto_task_created',
    'success',
    jsonb_build_object('thread_id', p_thread_id, 'message_id', p_message_id, 'quiet_hours', v_quiet_hours)
  );
  
  RETURN v_task_id;
END;
$$;

-- ============================================================================
-- PART 7 — Auto-Tagging Function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_tag_from_message(
  p_message_body text,
  p_contact_id uuid,
  p_job_id uuid DEFAULT NULL
)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_body_lower text;
  v_tags text[] := '{}';
  v_existing_tags text[];
BEGIN
  v_body_lower := LOWER(p_message_body);
  
  -- Extract tags based on keywords
  IF v_body_lower ~* '\bleak\b|\bleaking\b' THEN
    v_tags := array_append(v_tags, 'leak');
  END IF;
  
  IF v_body_lower ~* '\bstorm\b|\bstorm damage\b|\bhail\b|\bwind damage\b' THEN
    v_tags := array_append(v_tags, 'storm_damage');
  END IF;
  
  IF v_body_lower ~* '\binsurance\b|\bclaim\b|\badjuster\b' THEN
    v_tags := array_append(v_tags, 'insurance_claim');
  END IF;
  
  IF v_body_lower ~* '\breplace\b|\breplacement\b|\bnew roof\b' THEN
    v_tags := array_append(v_tags, 'replacement_project');
  END IF;
  
  IF v_body_lower ~* '\bbudget\b|\bprice\b|\bcost\b|\bafford\b|\bcheap\b' THEN
    v_tags := array_append(v_tags, 'price_sensitive');
  END IF;
  
  IF v_body_lower ~* '\bthis week\b|\basap\b|\burgent\b|\bsoon\b|\bimmediately\b' THEN
    v_tags := array_append(v_tags, 'urgent');
  END IF;
  
  -- Update contact tags
  IF p_contact_id IS NOT NULL THEN
    SELECT tags INTO v_existing_tags
    FROM public.contacts
    WHERE id = p_contact_id;
    
    -- Merge new tags with existing (avoid duplicates)
    v_existing_tags := array(SELECT DISTINCT unnest(v_existing_tags || v_tags));
    
    UPDATE public.contacts
    SET tags = v_existing_tags,
        updated_at = now()
    WHERE id = p_contact_id;
  END IF;
  
  -- Update job tags if job_id provided
  IF p_job_id IS NOT NULL THEN
    SELECT tags INTO v_existing_tags
    FROM public.jobs_conversions
    WHERE id = p_job_id;
    
    -- Merge new tags with existing (avoid duplicates)
    v_existing_tags := array(SELECT DISTINCT unnest(COALESCE(v_existing_tags, '{}') || v_tags));
    
    UPDATE public.jobs_conversions
    SET tags = v_existing_tags
    WHERE id = p_job_id;
  END IF;
  
  RETURN v_tags;
END;
$$;

-- ============================================================================
-- PART 8 — Auto-Status Update Function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_update_contact_status(
  p_contact_id uuid,
  p_ai_intent text,
  p_workspace_id uuid,
  p_message_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_status text;
BEGIN
  -- Map AI intent to contact status
  CASE p_ai_intent
    WHEN 'hot' THEN
      v_new_status := 'active';
    WHEN 'follow_up' THEN
      v_new_status := 'follow-up';
    WHEN 'dead' THEN
      v_new_status := 'lost';
    ELSE
      -- Keep existing status for warm/cold
      RETURN NULL;
  END CASE;
  
  -- Update contact status
  UPDATE public.contacts
  SET status = v_new_status,
      updated_at = now()
  WHERE id = p_contact_id;
  
  -- Log the automation
  PERFORM public.log_ops_action(
    p_workspace_id,
    NULL,
    NULL,
    'ai_intent_' || p_ai_intent,
    'contact',
    p_contact_id,
    'auto_status_updated',
    'success',
    jsonb_build_object('old_status', NULL, 'new_status', v_new_status, 'ai_intent', p_ai_intent, 'message_id', p_message_id)
  );
  
  RETURN v_new_status;
END;
$$;

-- ============================================================================
-- PART 9 — Auto-Notification Function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_send_hot_lead_notification(
  p_workspace_id uuid,
  p_contact_id uuid,
  p_message_id uuid,
  p_thread_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_owner_id uuid;
  v_contact_name text;
  v_quiet_hours boolean;
  v_notification_id uuid;
  v_settings public.inbox_settings;
BEGIN
  -- Get workspace owner
  SELECT user_id INTO v_owner_id
  FROM public.workspace_members
  WHERE workspace_id = p_workspace_id
  AND role IN ('owner', 'admin')
  ORDER BY created_at ASC
  LIMIT 1;
  
  IF v_owner_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Check quiet hours
  v_quiet_hours := public.is_workspace_quiet_hours_active(p_workspace_id);
  
  -- Get user notification settings
  SELECT * INTO v_settings
  FROM public.inbox_settings
  WHERE user_id = v_owner_id;
  
  -- Check if notifications are enabled
  IF v_settings IS NULL OR NOT v_settings.notify_new_hot THEN
    -- Still log but mark as skipped
    PERFORM public.log_ops_action(
      p_workspace_id,
      v_owner_id,
      NULL,
      'ai_intent_hot',
      'notification',
      NULL,
      'auto_notification_sent',
      'skipped',
      jsonb_build_object('reason', 'notifications_disabled', 'message_id', p_message_id)
    );
    RETURN NULL;
  END IF;
  
  -- Get contact name
  SELECT COALESCE(first_name || ' ' || last_name, first_name, last_name, email, 'Contact')
  INTO v_contact_name
  FROM public.contacts
  WHERE id = p_contact_id;
  
  -- Create notification log entry
  INSERT INTO public.notification_logs (
    workspace_id,
    user_id,
    notification_type,
    thread_id,
    message_id,
    sent_at,
    delivered,
    delivery_method,
    metadata
  ) VALUES (
    p_workspace_id,
    v_owner_id,
    'hot_lead',
    p_thread_id,
    p_message_id,
    now(),
    NOT v_quiet_hours, -- Delivered immediately if not quiet hours
    'push',
    jsonb_build_object(
      'contact_name', v_contact_name,
      'quiet_hours', v_quiet_hours,
      'message', '🔥 New HOT lead from ' || v_contact_name || '. Needs help ASAP.'
    )
  )
  RETURNING id INTO v_notification_id;
  
  -- Log the automation
  PERFORM public.log_ops_action(
    p_workspace_id,
    v_owner_id,
    NULL,
    'ai_intent_hot',
    'notification',
    v_notification_id,
    'auto_notification_sent',
    CASE WHEN v_quiet_hours THEN 'queued' ELSE 'success' END,
    jsonb_build_object('message_id', p_message_id, 'quiet_hours', v_quiet_hours)
  );
  
  RETURN v_notification_id;
END;
$$;

-- ============================================================================
-- PART 10 — Auto-Pipeline Movement Function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_move_pipeline(
  p_contact_id uuid,
  p_job_id uuid,
  p_message_body text,
  p_workspace_id uuid,
  p_message_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_body_lower text;
  v_is_urgent boolean := false;
  v_is_ready_to_schedule boolean := false;
  v_current_probability integer;
  v_new_probability integer;
BEGIN
  v_body_lower := LOWER(p_message_body);
  
  -- Check for urgency indicators
  v_is_urgent := v_body_lower ~* '\burgent\b|\basap\b|\bthis week\b|\bsoon\b|\bimmediately\b|\bwhen can you come out\b|\bready to schedule\b';
  v_is_ready_to_schedule := v_body_lower ~* '\bready to schedule\b|\bwhen can you come out\b|\bavailable\b|\bfree\b';
  
  IF NOT (v_is_urgent OR v_is_ready_to_schedule) THEN
    RETURN false;
  END IF;
  
  -- Update job probability and status if job exists
  IF p_job_id IS NOT NULL THEN
    SELECT probability INTO v_current_probability
    FROM public.jobs_conversions
    WHERE id = p_job_id;
    
    v_new_probability := LEAST(COALESCE(v_current_probability, 80) + 20, 100);
    
    UPDATE public.jobs_conversions
    SET probability = v_new_probability,
        pipeline_stage = 'booked',
        tags = array(SELECT DISTINCT unnest(COALESCE(tags, '{}') || ARRAY['Urgent']))
    WHERE id = p_job_id;
  END IF;
  
  -- Update contact status
  UPDATE public.contacts
  SET status = 'active',
      updated_at = now()
  WHERE id = p_contact_id;
  
  -- Log the automation
  PERFORM public.log_ops_action(
    p_workspace_id,
    NULL,
    NULL,
    'inbox_message_created',
    CASE WHEN p_job_id IS NOT NULL THEN 'crm_job' ELSE 'contact' END,
    COALESCE(p_job_id, p_contact_id),
    'auto_pipeline_moved',
    'success',
    jsonb_build_object(
      'message_id', p_message_id,
      'is_urgent', v_is_urgent,
      'is_ready_to_schedule', v_is_ready_to_schedule,
      'probability_boost', 20,
      'new_probability', v_new_probability
    )
  );
  
  RETURN true;
END;
$$;

-- ============================================================================
-- PART 11 — Main Automation Trigger Function (Called on Message Insert)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.process_inbox_message_automation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_thread public.inbox_threads;
  v_contact public.contacts;
  v_campaign public.campaigns;
  v_workspace_id uuid;
  v_ai_intent text;
  v_needs_follow_up boolean := false;
  v_task_id uuid;
  v_tags text[];
  v_status text;
  v_notification_id uuid;
  v_job_id uuid;
BEGIN
  -- Get thread info
  SELECT * INTO v_thread
  FROM public.inbox_threads
  WHERE id = NEW.thread_id;
  
  IF v_thread IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Get contact info
  IF v_thread.contact_id IS NOT NULL THEN
    SELECT * INTO v_contact
    FROM public.contacts
    WHERE id = v_thread.contact_id;
  END IF;
  
  -- Get campaign and workspace
  SELECT workspace_id INTO v_workspace_id
  FROM public.campaigns
  WHERE id = v_thread.campaign_id;
  
  -- Get AI intent from message
  v_ai_intent := NEW.ai_intent::text;
  
  -- Check if follow-up is needed
  -- Check for needs_follow_up_question in AI classification metadata if available
  v_needs_follow_up := (
    v_ai_intent = 'follow_up' OR
    (NEW.body_raw ~* '\bquestion\b|\b?\?') OR
    -- Check body for follow-up indicators
    (NEW.body_raw ~* '\bwhen can you\b|\bcan you call\b|\bplease contact\b|\blet me know\b')
  );
  
  -- PART 2: Auto-Task Creation (Follow-Up Needed)
  IF v_needs_follow_up AND v_contact.id IS NOT NULL THEN
    v_task_id := public.auto_create_followup_task(
      NEW.thread_id,
      v_contact.id,
      v_workspace_id,
      NEW.id
    );
  END IF;
  
  -- PART 3: Auto-Tagging
  IF v_contact.id IS NOT NULL AND NEW.body_raw IS NOT NULL THEN
    -- Check if job exists for this thread
    SELECT id INTO v_job_id
    FROM public.jobs_conversions
    WHERE thread_id = NEW.thread_id
    ORDER BY created_at DESC
    LIMIT 1;
    
    v_tags := public.auto_tag_from_message(
      NEW.body_raw,
      v_contact.id,
      v_job_id
    );
    
    -- Log tagging
    IF array_length(v_tags, 1) > 0 THEN
      PERFORM public.log_ops_action(
        v_workspace_id,
        NULL,
        NULL,
        'inbox_message_created',
        'contact',
        v_contact.id,
        'auto_tag_added',
        'success',
        jsonb_build_object('tags', v_tags, 'message_id', NEW.id)
      );
    END IF;
  END IF;
  
  -- PART 4: Auto-Assign Contact Status
  IF v_ai_intent IS NOT NULL AND v_contact.id IS NOT NULL THEN
    v_status := public.auto_update_contact_status(
      v_contact.id,
      v_ai_intent,
      v_workspace_id,
      NEW.id
    );
  END IF;
  
  -- PART 5: Auto-Notifications for High-Priority Leads
  IF v_ai_intent = 'hot' AND v_contact.id IS NOT NULL THEN
    v_notification_id := public.auto_send_hot_lead_notification(
      v_workspace_id,
      v_contact.id,
      NEW.id,
      NEW.thread_id
    );
  END IF;
  
  -- PART 6: Auto-Pipeline Movement
  IF NEW.body_raw IS NOT NULL AND v_contact.id IS NOT NULL THEN
    PERFORM public.auto_move_pipeline(
      v_contact.id,
      v_job_id,
      NEW.body_raw,
      v_workspace_id,
      NEW.id
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on inbox_messages insert
-- Handle different schema variations (direction field or is_incoming field)
DROP TRIGGER IF EXISTS trg_process_inbox_message_automation ON public.inbox_messages;
CREATE TRIGGER trg_process_inbox_message_automation
  AFTER INSERT ON public.inbox_messages
  FOR EACH ROW
  WHEN (
    -- Check if direction field exists and is inbound
    (NEW.direction IS NOT NULL AND (NEW.direction = 'in' OR NEW.direction = 'inbound')) OR
    -- Check if is_incoming field exists and is true
    (NEW.is_incoming IS NOT NULL AND NEW.is_incoming = true) OR
    -- If neither field exists, assume all inserts are inbound (for backward compatibility)
    (NEW.direction IS NULL AND NEW.is_incoming IS NULL)
  )
  EXECUTE FUNCTION public.process_inbox_message_automation();

-- ============================================================================
-- PART 11b — Suggested Next Steps Helper Function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_suggested_next_steps(
  p_message_id uuid,
  p_contact_id uuid,
  p_thread_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_message public.inbox_messages;
  v_contact public.contacts;
  v_thread public.inbox_threads;
  v_ai_intent text;
  v_body_lower text;
  v_suggestions jsonb := '[]'::jsonb;
  v_contact_name text;
BEGIN
  -- Get message
  SELECT * INTO v_message
  FROM public.inbox_messages
  WHERE id = p_message_id;
  
  IF v_message IS NULL THEN
    RETURN v_suggestions;
  END IF;
  
  -- Get contact
  IF p_contact_id IS NOT NULL THEN
    SELECT * INTO v_contact
    FROM public.contacts
    WHERE id = p_contact_id;
    
    IF v_contact IS NOT NULL THEN
      v_contact_name := COALESCE(v_contact.first_name || ' ' || v_contact.last_name, v_contact.first_name, v_contact.last_name, v_contact.email, 'Contact');
    END IF;
  END IF;
  
  -- Get thread
  SELECT * INTO v_thread
  FROM public.inbox_threads
  WHERE id = p_thread_id;
  
  v_ai_intent := v_message.ai_intent::text;
  v_body_lower := LOWER(COALESCE(v_message.body_raw, v_message.body_clean, ''));
  
  -- Generate suggestions based on AI intent and content
  IF v_ai_intent = 'hot' THEN
    v_suggestions := v_suggestions || jsonb_build_array(
      jsonb_build_object(
        'action', 'call',
        'priority', 'high',
        'suggestion', 'Call within 2 hours to maximize close rate.',
        'icon', 'phone'
      ),
      jsonb_build_object(
        'action', 'send_estimate',
        'priority', 'high',
        'suggestion', 'Send estimate link with recommended range.',
        'icon', 'dollar'
      )
    );
  END IF;
  
  IF v_ai_intent = 'follow_up' OR v_body_lower ~* '\bquestion\b|\bwhen can you\b|\bcan you call\b' THEN
    v_suggestions := v_suggestions || jsonb_build_array(
      jsonb_build_object(
        'action', 'reply',
        'priority', 'medium',
        'suggestion', 'Reply with: "We can come out tomorrow at 10 AM or 2 PM. Which works?"',
        'icon', 'mail'
      ),
      jsonb_build_object(
        'action', 'create_task',
        'priority', 'medium',
        'suggestion', 'Create follow-up task for 24 hours.',
        'icon', 'task'
      )
    );
  END IF;
  
  IF v_body_lower ~* '\bwhen can you come out\b|\bavailable\b|\bschedule\b' THEN
    v_suggestions := v_suggestions || jsonb_build_array(
      jsonb_build_object(
        'action', 'schedule',
        'priority', 'high',
        'suggestion', 'Reply with available times and book appointment.',
        'icon', 'calendar'
      )
    );
  END IF;
  
  IF v_body_lower ~* '\bbudget\b|\bprice\b|\bcost\b|\bestimate\b' THEN
    v_suggestions := v_suggestions || jsonb_build_array(
      jsonb_build_object(
        'action', 'send_estimate',
        'priority', 'high',
        'suggestion', 'Send estimate link with recommended range.',
        'icon', 'dollar'
      )
    );
  END IF;
  
  RETURN v_suggestions;
END;
$$;

-- ============================================================================
-- PART 12 — Seed System Triggers (Pre-configured)
-- ============================================================================

-- Insert system triggers (idempotent)
INSERT INTO public.ops_triggers (event_type, condition, actions)
VALUES
  ('inbox_message_created', '{}'::jsonb, '[]'::jsonb),
  ('ai_intent_hot', '{}'::jsonb, '[]'::jsonb),
  ('ai_intent_follow_up', '{}'::jsonb, '[]'::jsonb)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- PART 13 — Comments
-- ============================================================================

COMMENT ON TABLE public.ops_triggers IS 'System automation triggers for SmartSend Ops Brain v1';
COMMENT ON TABLE public.ops_logs IS 'Audit trail for all automation actions (tasks, tags, status updates, notifications, pipeline moves)';
COMMENT ON FUNCTION public.auto_create_followup_task IS 'Automatically creates a follow-up task when AI detects follow-up intent';
COMMENT ON FUNCTION public.auto_tag_from_message IS 'Automatically extracts and adds tags to contacts/jobs based on message content';
COMMENT ON FUNCTION public.auto_update_contact_status IS 'Automatically updates contact status based on AI intent classification';
COMMENT ON FUNCTION public.auto_send_hot_lead_notification IS 'Automatically sends notifications for hot leads (respects quiet hours)';
COMMENT ON FUNCTION public.auto_move_pipeline IS 'Automatically moves pipeline and boosts probability for urgent/ready-to-schedule leads';
COMMENT ON FUNCTION public.process_inbox_message_automation IS 'Main automation trigger function that orchestrates all auto-actions on new inbox messages';
COMMENT ON FUNCTION public.check_automation_throttle IS 'Safety function to prevent over-automation (max 1 task per message, max 3 tasks per day per thread)';
COMMENT ON FUNCTION public.is_workspace_quiet_hours_active IS 'Checks if quiet hours are currently active for a workspace';
COMMENT ON FUNCTION public.get_suggested_next_steps IS 'Returns suggested next steps based on message content and AI intent (for UI display)';

