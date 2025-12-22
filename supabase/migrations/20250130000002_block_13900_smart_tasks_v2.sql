-- =========================================================
-- Block 13900 — SmartSend Smart Tasks v2
-- (The Intelligent Task System That Auto-Creates Follow-Up Reminders Based on Lead Score, Intent & Message Content)
-- =========================================================

-- ============================================================================
-- 1. ENHANCE TASKS TABLE WITH V2 FIELDS
-- ============================================================================

-- Add priority field (high/medium/low) - upgrade from existing priority if exists
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS priority text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high'));

-- Add type field for task types
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS type text DEFAULT 'follow_up' CHECK (type IN (
    'call',
    'text',
    'email',
    'inspection',
    'follow_up',
    'send_estimate',
    're_engage',
    'answer_question',
    'review_damage',
    'insurance_support'
  ));

-- Add status field (open/completed) - sync with completed boolean
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'open' CHECK (status IN ('open', 'completed'));

-- Add due_date field (date) alongside due_at for easier date-based queries
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS due_date date;

-- Add lead_id reference (for linking to leads table)
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL;

-- Add user_id reference (workspace owner/creator)
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add workspace_id reference (alternative to org_id)
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS workspace_id uuid;

-- Add metadata jsonb for storing task-specific data
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- Make assigned_to nullable (for unassigned tasks)
ALTER TABLE public.tasks
  ALTER COLUMN assigned_to DROP NOT NULL;

-- Update existing priority values if they exist
UPDATE public.tasks
SET priority = CASE 
  WHEN priority = 'normal' THEN 'medium'
  WHEN priority = 'urgent' THEN 'high'
  ELSE COALESCE(priority, 'medium')
END
WHERE priority IS NOT NULL;

-- Sync status from completed boolean
UPDATE public.tasks
SET status = CASE WHEN completed = true THEN 'completed' ELSE 'open' END
WHERE status IS NULL;

-- Sync due_date from due_at
UPDATE public.tasks
SET due_date = due_at::date
WHERE due_date IS NULL AND due_at IS NOT NULL;

-- ============================================================================
-- 2. CREATE TASK_EVENTS TABLE FOR TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.task_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'created',
    'updated',
    'completed',
    'reopened',
    'priority_changed',
    'due_date_changed',
    'assigned',
    'unassigned'
  )),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_events_task ON public.task_events(task_id);
CREATE INDEX IF NOT EXISTS idx_task_events_type ON public.task_events(event_type);
CREATE INDEX IF NOT EXISTS idx_task_events_created ON public.task_events(created_at DESC);

ALTER TABLE public.task_events ENABLE ROW LEVEL SECURITY;

-- RLS: Users can see events for tasks they have access to
CREATE POLICY "task_events_select"
ON public.task_events
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_events.task_id
    AND (
      t.assigned_to = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.org_members om
        WHERE om.org_id = t.org_id AND om.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.org_memberships om
        WHERE om.org_id = t.org_id AND om.user_id = auth.uid() AND (om.status IS NULL OR om.status = 'active')
      )
    )
  )
);

-- ============================================================================
-- 3. CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_tasks_priority ON public.tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_type ON public.tasks(type);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON public.tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_lead_id ON public.tasks(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON public.tasks(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_workspace_id ON public.tasks(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_priority_due ON public.tasks(priority, due_date) WHERE completed = false;
CREATE INDEX IF NOT EXISTS idx_tasks_status_due ON public.tasks(status, due_date) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_tasks_auto_type ON public.tasks(auto_type) WHERE auto_generated = true;

-- ============================================================================
-- 4. CREATE SYNC FUNCTIONS FOR STATUS AND DUE_DATE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_task_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Sync due_date from due_at
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

DROP TRIGGER IF EXISTS trg_sync_task_fields ON public.tasks;
CREATE TRIGGER trg_sync_task_fields
BEFORE INSERT OR UPDATE OF due_at, completed ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.sync_task_fields();

-- ============================================================================
-- 5. CREATE TASK EVENT LOGGING FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.log_task_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_type text;
BEGIN
  -- Determine event type based on what changed
  IF TG_OP = 'INSERT' THEN
    v_event_type := 'created';
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.completed = false AND NEW.completed = true THEN
      v_event_type := 'completed';
    ELSIF OLD.completed = true AND NEW.completed = false THEN
      v_event_type := 'reopened';
    ELSIF OLD.priority IS DISTINCT FROM NEW.priority THEN
      v_event_type := 'priority_changed';
    ELSIF OLD.due_at IS DISTINCT FROM NEW.due_at THEN
      v_event_type := 'due_date_changed';
    ELSIF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
      IF NEW.assigned_to IS NULL THEN
        v_event_type := 'unassigned';
      ELSE
        v_event_type := 'assigned';
      END IF;
    ELSE
      v_event_type := 'updated';
    END IF;
  END IF;

  -- Log the event
  INSERT INTO public.task_events (
    task_id,
    event_type,
    user_id,
    metadata
  )
  VALUES (
    NEW.id,
    v_event_type,
    auth.uid(),
    jsonb_build_object(
      'old_priority', OLD.priority,
      'new_priority', NEW.priority,
      'old_due_at', OLD.due_at,
      'new_due_at', NEW.due_at,
      'old_assigned_to', OLD.assigned_to,
      'new_assigned_to', NEW.assigned_to
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_task_event ON public.tasks;
CREATE TRIGGER trg_log_task_event
AFTER INSERT OR UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.log_task_event();

-- ============================================================================
-- 6. SMART TASK AUTO-CREATION FUNCTION (v2)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_create_smart_task_v2(
  p_trigger_type text,
  p_org_id uuid,
  p_contact_id uuid DEFAULT NULL,
  p_lead_id uuid DEFAULT NULL,
  p_reply_thread_id uuid DEFAULT NULL,
  p_campaign_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_workspace_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task_id uuid;
  v_assigned_to uuid;
  v_title text;
  v_type text;
  v_priority text;
  v_due_at timestamptz;
  v_due_date date;
  v_contact_name text;
  v_lead_score int;
  v_intent text;
  v_message_snippet text;
BEGIN
  -- Get contact name if available
  IF p_contact_id IS NOT NULL THEN
    SELECT COALESCE(first_name || ' ' || last_name, email, 'Homeowner')
    INTO v_contact_name
    FROM public.contacts
    WHERE id = p_contact_id;
  ELSIF p_lead_id IS NOT NULL THEN
    SELECT COALESCE(first_name || ' ' || last_name, email, 'Homeowner')
    INTO v_contact_name
    FROM public.leads
    WHERE id = p_lead_id;
  ELSE
    v_contact_name := 'Homeowner';
  END IF;

  -- Get lead score if lead_id provided
  IF p_lead_id IS NOT NULL THEN
    SELECT score INTO v_lead_score FROM public.leads WHERE id = p_lead_id;
  END IF;

  -- Get intent from metadata or reply thread
  v_intent := COALESCE(p_metadata->>'intent', '');
  v_message_snippet := COALESCE(p_metadata->>'message_snippet', '');

  -- Determine assigned_to (use provided user_id or find first org member)
  v_assigned_to := p_user_id;
  IF v_assigned_to IS NULL THEN
    SELECT user_id INTO v_assigned_to
    FROM public.org_members
    WHERE org_id = p_org_id
    ORDER BY created_at ASC
    LIMIT 1;
    
    IF v_assigned_to IS NULL THEN
      SELECT user_id INTO v_assigned_to
      FROM public.org_memberships
      WHERE org_id = p_org_id AND (status IS NULL OR status = 'active')
      ORDER BY created_at ASC
      LIMIT 1;
    END IF;
  END IF;

  -- Set task details based on trigger type
  CASE p_trigger_type
    WHEN 'hot_lead' THEN
      -- 1. Lead Score Goes HOT (≥ 70)
      v_title := format('CALL THIS LEAD ASAP — HOT: %s', v_contact_name);
      v_type := 'call';
      v_priority := 'high';
      v_due_at := now(); -- Due today
      v_due_date := CURRENT_DATE;

    WHEN 'follow_up_intent' THEN
      -- 2. Intent = FOLLOW UP
      v_title := format('Follow up with %s — asked a question.', v_contact_name);
      v_type := 'follow_up';
      v_priority := 'medium';
      v_due_at := now() + interval '1 day'; -- Due tomorrow
      v_due_date := CURRENT_DATE + 1;

    WHEN 'direct_question' THEN
      -- 3. Homeowner Asks a Direct Question
      v_title := format('Answer homeowner''s question: %s', 
        CASE 
          WHEN length(v_message_snippet) > 50 THEN substring(v_message_snippet, 1, 50) || '...'
          ELSE v_message_snippet
        END
      );
      v_type := 'answer_question';
      v_priority := 'high';
      v_due_at := now(); -- Due same day
      v_due_date := CURRENT_DATE;

    WHEN 'repair_signals' THEN
      -- 4. Repair Signals Detected
      v_title := format('Repair interest — send quick inspection offer to %s', v_contact_name);
      v_type := 'inspection';
      v_priority := 'high';
      v_due_at := now(); -- Due today
      v_due_date := CURRENT_DATE;

    WHEN 'insurance_keywords' THEN
      -- 5. Insurance Keywords Detected
      v_title := format('Insurance job opportunity — respond quickly to %s', v_contact_name);
      v_type := 'insurance_support';
      v_priority := 'high';
      v_due_at := now(); -- Due same day
      v_due_date := CURRENT_DATE;

    WHEN 'storm_risk' THEN
      -- 6. Hot Weather / Storm Risk + Recent Reply
      v_title := format('Storm-affected homeowner — follow up with inspection offer: %s', v_contact_name);
      v_type := 'inspection';
      v_priority := 'high';
      v_due_at := now() + interval '24 hours'; -- Within 24 hours
      v_due_date := CURRENT_DATE + 1;

    WHEN 'no_reply' THEN
      -- 7. No Reply After X Days
      v_title := format('No response — follow up with %s', v_contact_name);
      v_type := 're_engage';
      v_priority := 'medium';
      v_due_at := now() + interval '1 day';
      v_due_date := CURRENT_DATE + 1;

    WHEN 'past_quote' THEN
      -- 8. Past Quote Detected
      v_title := format('Reconnect on past quote with %s', v_contact_name);
      v_type := 'follow_up';
      v_priority := 'medium';
      v_due_at := now() + interval '7 days'; -- This week
      v_due_date := CURRENT_DATE + 7;

    WHEN 'high_value' THEN
      -- 9. High Estimated Value (score >= 80 AND replacement signals)
      v_title := format('High-value job — get estimate booked: %s', v_contact_name);
      v_type := 'send_estimate';
      v_priority := 'high';
      v_due_at := now(); -- Due today
      v_due_date := CURRENT_DATE;

    ELSE
      -- Default fallback
      v_title := format('Follow up with %s', v_contact_name);
      v_type := 'follow_up';
      v_priority := 'medium';
      v_due_at := now() + interval '2 days';
      v_due_date := CURRENT_DATE + 2;
  END CASE;

  -- Create the task
  INSERT INTO public.tasks (
    org_id,
    workspace_id,
    user_id,
    contact_id,
    lead_id,
    reply_thread_id,
    campaign_id,
    assigned_to,
    title,
    type,
    priority,
    status,
    due_at,
    due_date,
    auto_generated,
    auto_type,
    metadata,
    created_by
  )
  VALUES (
    p_org_id,
    p_workspace_id,
    p_user_id,
    p_contact_id,
    p_lead_id,
    p_reply_thread_id,
    p_campaign_id,
    v_assigned_to,
    v_title,
    v_type,
    v_priority,
    'open',
    v_due_at,
    v_due_date,
    true,
    p_trigger_type,
    p_metadata,
    NULL -- System-generated
  )
  RETURNING id INTO v_task_id;

  RETURN v_task_id;
END;
$$;

-- ============================================================================
-- 7. TRIGGER: Auto-create task when lead score goes HOT (≥ 70)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_task_on_hot_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
  v_workspace_id uuid;
  v_user_id uuid;
  v_contact_id uuid;
BEGIN
  -- Only trigger if score >= 70 and wasn't already hot
  IF NEW.score >= 70 AND (OLD.score IS NULL OR OLD.score < 70) THEN
    -- Get org/workspace info
    v_org_id := COALESCE(NEW.org_id, (SELECT org_id FROM public.workspaces WHERE id = NEW.workspace_id LIMIT 1));
    v_workspace_id := NEW.workspace_id;
    v_user_id := NEW.user_id;
    
    -- Try to find contact by email
    SELECT id INTO v_contact_id
    FROM public.contacts
    WHERE email = NEW.email
    AND (workspace_id = v_workspace_id OR org_id = v_org_id)
    LIMIT 1;

    -- Create task
    PERFORM public.auto_create_smart_task_v2(
      'hot_lead',
      v_org_id,
      v_contact_id,
      NEW.id,
      NULL,
      NEW.campaign_id,
      v_user_id,
      v_workspace_id,
      jsonb_build_object('lead_score', NEW.score)
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Only create trigger if leads table has score column
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'leads' 
    AND column_name = 'score'
  ) THEN
    DROP TRIGGER IF EXISTS trg_task_on_hot_lead ON public.leads;
    CREATE TRIGGER trg_task_on_hot_lead
    AFTER UPDATE OF score ON public.leads
    FOR EACH ROW
    WHEN (NEW.score >= 70 AND (OLD.score IS NULL OR OLD.score < 70))
    EXECUTE FUNCTION public.trigger_task_on_hot_lead();
  END IF;
END $$;

-- ============================================================================
-- 8. TRIGGER: Auto-create task when intent = FOLLOW_UP
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_task_on_follow_up_intent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
  v_workspace_id uuid;
  v_user_id uuid;
  v_contact_id uuid;
  v_lead_id uuid;
  v_message_snippet text;
BEGIN
  -- Check if intent is FOLLOW_UP or FOLLOW UP
  IF NEW.intent IN ('FOLLOW_UP', 'FOLLOW UP', 'follow_up') OR 
     (NEW.intent IS NOT NULL AND LOWER(NEW.intent) LIKE '%follow%up%') THEN
    
    -- Get org/workspace from reply_thread
    SELECT 
      rt.workspace_id,
      rt.account_id,
      rt.contact_id,
      rt.campaign_id,
      rt.owner_id
    INTO v_workspace_id, v_org_id, v_contact_id, v_campaign_id, v_user_id
    FROM public.reply_threads rt
    WHERE rt.id = NEW.thread_id OR rt.id = NEW.reply_thread_id
    LIMIT 1;

    -- Get message snippet
    SELECT body INTO v_message_snippet
    FROM public.reply_messages
    WHERE thread_id = COALESCE(NEW.thread_id, (SELECT id FROM public.reply_threads WHERE contact_id = v_contact_id ORDER BY created_at DESC LIMIT 1))
    ORDER BY created_at DESC
    LIMIT 1;

    -- Try to find lead
    IF v_contact_id IS NOT NULL THEN
      SELECT id INTO v_lead_id
      FROM public.leads
      WHERE email = (SELECT email FROM public.contacts WHERE id = v_contact_id LIMIT 1)
      LIMIT 1;
    END IF;

    -- Create task
    PERFORM public.auto_create_smart_task_v2(
      'follow_up_intent',
      v_org_id,
      v_contact_id,
      v_lead_id,
      COALESCE(NEW.thread_id, NEW.reply_thread_id),
      v_campaign_id,
      v_user_id,
      v_workspace_id,
      jsonb_build_object(
        'intent', NEW.intent,
        'message_snippet', COALESCE(substring(v_message_snippet, 1, 200), '')
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger on reply_threads or message_intents if they exist
DO $$
BEGIN
  -- Try reply_threads
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'reply_threads') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'reply_threads' AND column_name = 'intent') THEN
      DROP TRIGGER IF EXISTS trg_task_on_follow_up_intent ON public.reply_threads;
      CREATE TRIGGER trg_task_on_follow_up_intent
      AFTER INSERT OR UPDATE OF intent ON public.reply_threads
      FOR EACH ROW
      WHEN (NEW.intent IN ('FOLLOW_UP', 'FOLLOW UP', 'follow_up') OR LOWER(NEW.intent) LIKE '%follow%up%')
      EXECUTE FUNCTION public.trigger_task_on_follow_up_intent();
    END IF;
  END IF;

  -- Try message_intents
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'message_intents') THEN
    DROP TRIGGER IF EXISTS trg_task_on_follow_up_intent_msg ON public.message_intents;
    CREATE TRIGGER trg_task_on_follow_up_intent_msg
    AFTER INSERT OR UPDATE OF intent ON public.message_intents
    FOR EACH ROW
    WHEN (NEW.intent IN ('FOLLOW_UP', 'FOLLOW UP', 'follow_up') OR LOWER(NEW.intent) LIKE '%follow%up%')
    EXECUTE FUNCTION public.trigger_task_on_follow_up_intent();
  END IF;
END $$;

-- ============================================================================
-- 9. FUNCTION: Detect and create tasks for direct questions
-- ============================================================================

CREATE OR REPLACE FUNCTION public.detect_and_create_question_tasks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_message RECORD;
  v_org_id uuid;
  v_workspace_id uuid;
  v_user_id uuid;
  v_contact_id uuid;
  v_lead_id uuid;
  v_question_patterns text[] := ARRAY[
    'what''s the price',
    'how much',
    'can you come',
    'how soon',
    'when can you',
    'do you',
    'are you',
    'will you'
  ];
  v_has_question boolean;
BEGIN
  -- Find recent inbound messages that might contain questions
  FOR v_message IN
    SELECT DISTINCT
      rm.id,
      rm.body,
      rm.thread_id,
      rt.workspace_id,
      rt.account_id as org_id,
      rt.contact_id,
      rt.campaign_id,
      rt.owner_id as user_id
    FROM public.reply_messages rm
    INNER JOIN public.reply_threads rt ON rt.id = rm.thread_id
    LEFT JOIN public.tasks t ON t.reply_thread_id = rt.id 
      AND t.auto_type = 'direct_question' 
      AND t.completed = false
    WHERE rm.direction = 'inbound'
      AND rm.created_at > now() - interval '24 hours'
      AND t.id IS NULL -- No existing task
    ORDER BY rm.created_at DESC
    LIMIT 100
  LOOP
    -- Check if message contains question patterns
    v_has_question := false;
    FOR i IN 1..array_length(v_question_patterns, 1) LOOP
      IF LOWER(v_message.body) LIKE '%' || v_question_patterns[i] || '%' THEN
        v_has_question := true;
        EXIT;
      END IF;
    END LOOP;

    -- Also check for question marks
    IF position('?' IN v_message.body) > 0 THEN
      v_has_question := true;
    END IF;

    IF v_has_question THEN
      -- Try to find lead
      IF v_message.contact_id IS NOT NULL THEN
        SELECT id INTO v_lead_id
        FROM public.leads
        WHERE email = (SELECT email FROM public.contacts WHERE id = v_message.contact_id LIMIT 1)
        LIMIT 1;
      END IF;

      -- Create task
      PERFORM public.auto_create_smart_task_v2(
        'direct_question',
        v_message.org_id,
        v_message.contact_id,
        v_lead_id,
        v_message.thread_id,
        v_message.campaign_id,
        v_message.user_id,
        v_message.workspace_id,
        jsonb_build_object(
          'message_snippet', substring(v_message.body, 1, 200)
        )
      );
    END IF;
  END LOOP;
END;
$$;

-- ============================================================================
-- 10. FUNCTION: Detect repair signals and create tasks
-- ============================================================================

CREATE OR REPLACE FUNCTION public.detect_and_create_repair_tasks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_message RECORD;
  v_repair_keywords text[] := ARRAY[
    'leak',
    'leaking',
    'missing shingle',
    'flashing',
    'repair',
    'fix',
    'damage',
    'broken',
    'crack'
  ];
  v_has_repair boolean;
BEGIN
  FOR v_message IN
    SELECT DISTINCT
      rm.id,
      rm.body,
      rm.thread_id,
      rt.workspace_id,
      rt.account_id as org_id,
      rt.contact_id,
      rt.campaign_id,
      rt.owner_id as user_id
    FROM public.reply_messages rm
    INNER JOIN public.reply_threads rt ON rt.id = rm.thread_id
    LEFT JOIN public.tasks t ON t.reply_thread_id = rt.id 
      AND t.auto_type = 'repair_signals' 
      AND t.completed = false
    WHERE rm.direction = 'inbound'
      AND rm.created_at > now() - interval '48 hours'
      AND t.id IS NULL
  LOOP
    v_has_repair := false;
    FOR i IN 1..array_length(v_repair_keywords, 1) LOOP
      IF LOWER(v_message.body) LIKE '%' || v_repair_keywords[i] || '%' THEN
        v_has_repair := true;
        EXIT;
      END IF;
    END LOOP;

    IF v_has_repair THEN
      PERFORM public.auto_create_smart_task_v2(
        'repair_signals',
        v_message.org_id,
        v_message.contact_id,
        NULL,
        v_message.thread_id,
        v_message.campaign_id,
        v_message.user_id,
        v_message.workspace_id,
        jsonb_build_object('detected_keywords', v_repair_keywords)
      );
    END IF;
  END LOOP;
END;
$$;

-- ============================================================================
-- 11. FUNCTION: Detect insurance keywords and create tasks
-- ============================================================================

CREATE OR REPLACE FUNCTION public.detect_and_create_insurance_tasks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_message RECORD;
  v_insurance_keywords text[] := ARRAY[
    'adjuster',
    'claim',
    'covered',
    'insurance',
    'claim number',
    'insurance company'
  ];
  v_has_insurance boolean;
BEGIN
  FOR v_message IN
    SELECT DISTINCT
      rm.id,
      rm.body,
      rm.thread_id,
      rt.workspace_id,
      rt.account_id as org_id,
      rt.contact_id,
      rt.campaign_id,
      rt.owner_id as user_id
    FROM public.reply_messages rm
    INNER JOIN public.reply_threads rt ON rt.id = rm.thread_id
    LEFT JOIN public.tasks t ON t.reply_thread_id = rt.id 
      AND t.auto_type = 'insurance_keywords' 
      AND t.completed = false
    WHERE rm.direction = 'inbound'
      AND rm.created_at > now() - interval '48 hours'
      AND t.id IS NULL
  LOOP
    v_has_insurance := false;
    FOR i IN 1..array_length(v_insurance_keywords, 1) LOOP
      IF LOWER(v_message.body) LIKE '%' || v_insurance_keywords[i] || '%' THEN
        v_has_insurance := true;
        EXIT;
      END IF;
    END LOOP;

    IF v_has_insurance THEN
      PERFORM public.auto_create_smart_task_v2(
        'insurance_keywords',
        v_message.org_id,
        v_message.contact_id,
        NULL,
        v_message.thread_id,
        v_message.campaign_id,
        v_message.user_id,
        v_message.workspace_id,
        jsonb_build_object('detected_keywords', v_insurance_keywords)
      );
    END IF;
  END LOOP;
END;
$$;

-- ============================================================================
-- 12. FUNCTION: Auto-complete tasks when conditions are met
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_complete_tasks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Complete tasks when roofer sends a reply (outbound message exists)
  UPDATE public.tasks t
  SET 
    completed = true,
    status = 'completed',
    completed_at = now()
  FROM public.reply_threads rt
  WHERE t.reply_thread_id = rt.id
    AND t.completed = false
    AND EXISTS (
      SELECT 1 FROM public.reply_messages rm
      WHERE rm.thread_id = rt.id
        AND rm.direction = 'outbound'
        AND rm.created_at > t.created_at
    );

  -- Complete tasks when lead score changes significantly (no longer hot)
  UPDATE public.tasks t
  SET 
    completed = true,
    status = 'completed',
    completed_at = now()
  FROM public.leads l
  WHERE t.lead_id = l.id
    AND t.auto_type = 'hot_lead'
    AND t.completed = false
    AND l.score < 50; -- No longer hot

  -- Complete tasks when status becomes HOT/WARM (task served its purpose)
  UPDATE public.tasks t
  SET 
    completed = true,
    status = 'completed',
    completed_at = now()
  FROM public.leads l
  WHERE t.lead_id = l.id
    AND t.auto_type IN ('no_reply', 're_engage')
    AND t.completed = false
    AND l.score >= 60; -- Lead is now warm/hot

  -- Complete insurance tasks when resolved (if we track this)
  -- This would need a status field on leads/contacts for insurance jobs
  -- For now, we'll complete if lead score is very high (likely booked)
  UPDATE public.tasks t
  SET 
    completed = true,
    status = 'completed',
    completed_at = now()
  FROM public.leads l
  WHERE t.lead_id = l.id
    AND t.auto_type = 'insurance_keywords'
    AND t.completed = false
    AND l.score >= 90; -- Very high score, likely booked
END;
$$;

-- ============================================================================
-- 13. CREATE NIGHTLY WORKER FUNCTIONS
-- ============================================================================

-- Nightly priority refresh
CREATE OR REPLACE FUNCTION public.nightly_task_priority_refresh()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update task priorities based on current lead scores
  UPDATE public.tasks t
  SET priority = CASE
    WHEN l.score >= 80 THEN 'high'
    WHEN l.score >= 60 THEN 'medium'
    ELSE 'low'
  END
  FROM public.leads l
  WHERE t.lead_id = l.id
    AND t.completed = false
    AND t.auto_generated = true
    AND (
      (t.priority = 'low' AND l.score >= 60) OR
      (t.priority = 'medium' AND l.score >= 80) OR
      (t.priority = 'high' AND l.score < 60)
    );

  -- Update due dates for overdue high-priority tasks
  UPDATE public.tasks
  SET 
    due_at = now(),
    due_date = CURRENT_DATE
  WHERE priority = 'high'
    AND completed = false
    AND due_at < now() - interval '1 day'
    AND auto_generated = true;
END;
$$;

-- Task cleanup (remove old completed tasks)
CREATE OR REPLACE FUNCTION public.cleanup_old_tasks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete completed tasks older than 90 days
  DELETE FROM public.tasks
  WHERE completed = true
    AND completed_at < now() - interval '90 days';
END;
$$;

-- ============================================================================
-- 14. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.tasks IS 'Smart Tasks v2 - Intelligent task system that auto-creates follow-up reminders based on lead score, intent, and message content';
COMMENT ON COLUMN public.tasks.priority IS 'Task priority: low (🟦), medium (⚠️), or high (🔥)';
COMMENT ON COLUMN public.tasks.type IS 'Task type: call, text, email, inspection, follow_up, send_estimate, re_engage, answer_question, review_damage, insurance_support';
COMMENT ON COLUMN public.tasks.status IS 'Task status: open or completed';
COMMENT ON COLUMN public.tasks.auto_type IS 'Type of auto-generation trigger: hot_lead, follow_up_intent, direct_question, repair_signals, insurance_keywords, storm_risk, no_reply, past_quote, high_value';
COMMENT ON TABLE public.task_events IS 'Event log for task lifecycle tracking';
COMMENT ON FUNCTION public.auto_create_smart_task_v2 IS 'Main function for auto-creating smart tasks based on various triggers';
COMMENT ON FUNCTION public.auto_complete_tasks IS 'Automatically completes tasks when conditions are met (reply sent, score changed, etc.)';
COMMENT ON FUNCTION public.nightly_task_priority_refresh IS 'Nightly worker to refresh task priorities based on current lead scores';
COMMENT ON FUNCTION public.cleanup_old_tasks IS 'Cleanup worker to remove old completed tasks';





















































