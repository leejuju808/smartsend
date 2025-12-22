-- =========================================================
-- Block 16200 — SmartSend Tasks & Follow-Up Board v1
-- The Roofing Task System: Auto-Created Tasks, Urgency Ranking, Follow-Up Cycles, Pipeline Actions & Daily Workflows
-- =========================================================

-- ============================================================================
-- 1. ENHANCE TASKS TABLE WITH ROOFING-SPECIFIC FIELDS
-- ============================================================================

-- Add task_type enum for the 5 types of SmartSend tasks
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_type') THEN
    CREATE TYPE task_type AS ENUM (
      'follow_up_needed',    -- Warm replies, unanswered questions, non-booking replies, partial interest, pipeline movement
      'book_inspection',      -- Hot replies, booking intent, insurance intent, storm damage language, strong interest
      'answer_question',      -- Question extraction system, pricing queries, availability questions, insurance coverage
      'update_lead_info',    -- New info from homeowner, new storm data, new property enrichment, insurance claim ID, photos
      'high_urgency_issue'    -- Leak mentions, water damage, "urgent" language, storm-related emergencies, weather engine risk
    );
  END IF;
END$$;

-- Add urgency enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_urgency') THEN
    CREATE TYPE task_urgency AS ENUM ('high', 'normal', 'low');
  END IF;
END$$;

-- Add task_status enum for Kanban columns
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_status') THEN
    CREATE TYPE task_status AS ENUM ('today', 'upcoming', 'waiting_on_homeowner', 'completed');
  END IF;
END$$;

-- Add columns to tasks table if they don't exist
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS task_type task_type,
  ADD COLUMN IF NOT EXISTS urgency task_urgency DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS status task_status DEFAULT 'today',
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- For backwards compatibility
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE, -- Add workspace_id support
  ADD COLUMN IF NOT EXISTS description text, -- Task description/details
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb, -- Store reply intent, storm risk, insurance likelihood, etc.
  ADD COLUMN IF NOT EXISTS next_step_suggestion text, -- AI-suggested next step
  ADD COLUMN IF NOT EXISTS follow_up_cycle_count int DEFAULT 0, -- Track follow-up cycle number
  ADD COLUMN IF NOT EXISTS follow_up_cycle_type text, -- 'warm', 'cold', 'old_quote', 'insurance'
  ADD COLUMN IF NOT EXISTS last_message_snippet text, -- Last message snippet for quick reference
  ADD COLUMN IF NOT EXISTS priority text CHECK (priority IN ('high', 'medium', 'low')) DEFAULT 'medium'; -- For backwards compatibility

-- Update workspace_id from org_id if workspace_id is null
-- This is a best-effort migration - workspace_id should be set going forward
DO $$
BEGIN
  -- Try to set workspace_id from contacts if task has contact_id
  UPDATE public.tasks t
  SET workspace_id = c.workspace_id
  FROM public.contacts c
  WHERE t.contact_id = c.id
  AND t.workspace_id IS NULL
  AND c.workspace_id IS NOT NULL;

  -- Try to set workspace_id from campaigns if task has campaign_id
  UPDATE public.tasks t
  SET workspace_id = c.workspace_id
  FROM public.campaigns c
  WHERE t.campaign_id = c.id
  AND t.workspace_id IS NULL
  AND c.workspace_id IS NOT NULL;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tasks_task_type ON public.tasks(task_type) WHERE task_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_urgency ON public.tasks(urgency);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_workspace_status ON public.tasks(workspace_id, status, due_at) WHERE completed = false;
CREATE INDEX IF NOT EXISTS idx_tasks_workspace_urgency ON public.tasks(workspace_id, urgency, due_at) WHERE completed = false;
CREATE INDEX IF NOT EXISTS idx_tasks_company ON public.tasks(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_campaign ON public.tasks(campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_lead ON public.tasks(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_follow_up_cycle ON public.tasks(follow_up_cycle_type, follow_up_cycle_count) WHERE completed = false;
CREATE INDEX IF NOT EXISTS idx_tasks_metadata_gin ON public.tasks USING gin(metadata);

-- ============================================================================
-- 2. AUTO-GENERATION FUNCTIONS FOR TASKS
-- ============================================================================

-- Function: Auto-create tasks from inbox replies
CREATE OR REPLACE FUNCTION public.auto_create_task_from_inbox()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_id uuid;
  v_contact_id uuid;
  v_company_id uuid;
  v_user_id uuid;
  v_task_type task_type;
  v_urgency task_urgency;
  v_title text;
  v_due_at timestamptz;
  v_metadata jsonb;
  v_message_snippet text;
BEGIN
  -- Get workspace and contact info from reply thread
  SELECT 
    rt.workspace_id,
    rt.contact_id,
    rt.account_id,
    c.company_id,
    LEFT(im.body, 200) as snippet
  INTO v_workspace_id, v_contact_id, v_user_id, v_company_id, v_message_snippet
  FROM public.reply_threads rt
  LEFT JOIN public.contacts c ON c.id = rt.contact_id
  LEFT JOIN public.inbound_messages im ON im.thread_id = rt.id
  WHERE rt.id = NEW.thread_id
  ORDER BY im.created_at DESC
  LIMIT 1;

  -- Fallback: try to get workspace_id from org_id
  IF v_workspace_id IS NULL THEN
    SELECT workspace_id INTO v_workspace_id
    FROM public.workspaces
    WHERE id IN (
      SELECT workspace_id FROM public.workspace_members wm
      WHERE wm.user_id IN (
        SELECT user_id FROM public.org_memberships WHERE org_id = NEW.org_id LIMIT 1
      )
      LIMIT 1
    )
    LIMIT 1;
  END IF;

  IF v_workspace_id IS NULL OR v_contact_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Determine task type and urgency based on reply intent
  IF NEW.intent = 'hot' THEN
    v_task_type := 'book_inspection';
    v_urgency := 'high';
    v_title := 'Book inspection - Hot lead';
    v_due_at := now() + interval '1 day';
  ELSIF NEW.intent = 'warm' THEN
    v_task_type := 'follow_up_needed';
    v_urgency := 'normal';
    v_title := 'Follow up with homeowner';
    v_due_at := now() + interval '2 days';
  ELSIF NEW.intent = 'question' THEN
    v_task_type := 'answer_question';
    v_urgency := 'normal';
    v_title := 'Answer homeowner question';
    v_due_at := now() + interval '1 day';
  ELSE
    v_task_type := 'follow_up_needed';
    v_urgency := 'low';
    v_title := 'Follow up needed';
    v_due_at := now() + interval '3 days';
  END IF;

  -- Build metadata
  v_metadata := jsonb_build_object(
    'reply_intent', NEW.intent,
    'message_id', NEW.message_id,
    'thread_id', NEW.thread_id,
    'confidence', NEW.confidence
  );

  -- Check for urgent keywords
  IF v_message_snippet ~* '(leak|water damage|urgent|emergency|storm damage)' THEN
    v_task_type := 'high_urgency_issue';
    v_urgency := 'high';
    v_title := 'URGENT: ' || v_title;
    v_due_at := now() + interval '4 hours';
  END IF;

  -- Create task (prevent duplicates)
  INSERT INTO public.tasks (
    workspace_id,
    org_id,
    contact_id,
    company_id,
    reply_thread_id,
    assigned_to,
    user_id,
    task_type,
    urgency,
    status,
    title,
    description,
    due_at,
    last_message_snippet,
    metadata,
    auto_generated,
    auto_type,
    created_by
  )
  VALUES (
    v_workspace_id,
    NEW.org_id,
    v_contact_id,
    v_company_id,
    NEW.thread_id,
    COALESCE(v_user_id, (SELECT user_id FROM public.workspace_members WHERE workspace_id = v_workspace_id ORDER BY created_at ASC LIMIT 1)),
    COALESCE(v_user_id, (SELECT user_id FROM public.workspace_members WHERE workspace_id = v_workspace_id ORDER BY created_at ASC LIMIT 1)),
    v_task_type,
    v_urgency,
    'today',
    v_title,
    v_message_snippet,
    v_due_at,
    v_message_snippet,
    v_metadata,
    true,
    'inbox_reply',
    NULL
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

-- Trigger: Auto-create tasks when message intents are created
DROP TRIGGER IF EXISTS trg_auto_create_task_from_inbox ON public.message_intents;
CREATE TRIGGER trg_auto_create_task_from_inbox
AFTER INSERT ON public.message_intents
FOR EACH ROW
WHEN (NEW.intent IN ('hot', 'warm', 'question', 'neutral'))
EXECUTE FUNCTION public.auto_create_task_from_inbox();

-- Function: Auto-create tasks from scheduler (appointment booked/missed)
CREATE OR REPLACE FUNCTION public.auto_create_task_from_scheduler()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_id uuid;
  v_contact_id uuid;
  v_user_id uuid;
BEGIN
  -- Get workspace and contact info
  SELECT 
    c.workspace_id,
    c.id,
    c.user_id
  INTO v_workspace_id, v_contact_id, v_user_id
  FROM public.contacts c
  WHERE c.id = NEW.contact_id;

  IF v_workspace_id IS NULL OR v_contact_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- If appointment is booked, create follow-up reminder
  IF NEW.status = 'confirmed' AND NEW.appointment_date IS NOT NULL THEN
    INSERT INTO public.tasks (
      workspace_id,
      contact_id,
      assigned_to,
      user_id,
      task_type,
      urgency,
      status,
      title,
      description,
      due_at,
      auto_generated,
      auto_type,
      metadata
    )
    VALUES (
      v_workspace_id,
      v_contact_id,
      COALESCE(v_user_id, (SELECT user_id FROM public.workspace_members WHERE workspace_id = v_workspace_id ORDER BY created_at ASC LIMIT 1)),
      COALESCE(v_user_id, (SELECT user_id FROM public.workspace_members WHERE workspace_id = v_workspace_id ORDER BY created_at ASC LIMIT 1)),
      'book_inspection',
      'normal',
      'upcoming',
      format('Follow up after inspection on %s', NEW.appointment_date::date),
      format('Appointment scheduled for %s', NEW.appointment_date),
      NEW.appointment_date + interval '1 day',
      true,
      'appointment_booked',
      jsonb_build_object('appointment_id', NEW.id, 'appointment_date', NEW.appointment_date)
    )
    ON CONFLICT DO NOTHING;
  END IF;

  -- If appointment is missed, create recovery task
  IF NEW.status = 'missed' OR (NEW.appointment_date < now() AND NEW.status != 'completed') THEN
    INSERT INTO public.tasks (
      workspace_id,
      contact_id,
      assigned_to,
      user_id,
      task_type,
      urgency,
      status,
      title,
      description,
      due_at,
      auto_generated,
      auto_type,
      metadata
    )
    VALUES (
      v_workspace_id,
      v_contact_id,
      COALESCE(v_user_id, (SELECT user_id FROM public.workspace_members WHERE workspace_id = v_workspace_id ORDER BY created_at ASC LIMIT 1)),
      COALESCE(v_user_id, (SELECT user_id FROM public.workspace_members WHERE workspace_id = v_workspace_id ORDER BY created_at ASC LIMIT 1)),
      'follow_up_needed',
      'high',
      'today',
      'URGENT: Missed appointment - reschedule needed',
      format('Appointment was scheduled for %s but was missed', NEW.appointment_date),
      now(),
      true,
      'appointment_missed',
      jsonb_build_object('appointment_id', NEW.id, 'appointment_date', NEW.appointment_date)
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Note: This trigger will only work if appointments table exists
-- Adjust table/column names based on your actual scheduler schema
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'appointments'
  ) THEN
    DROP TRIGGER IF EXISTS trg_auto_create_task_from_scheduler ON public.appointments;
    CREATE TRIGGER trg_auto_create_task_from_scheduler
    AFTER INSERT OR UPDATE OF status, appointment_date ON public.appointments
    FOR EACH ROW
    EXECUTE FUNCTION public.auto_create_task_from_scheduler();
  END IF;
END $$;

-- Function: Auto-create tasks from pipeline movement
CREATE OR REPLACE FUNCTION public.auto_create_task_from_pipeline()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_id uuid;
  v_contact_id uuid;
  v_user_id uuid;
BEGIN
  -- Get workspace and contact info
  SELECT 
    c.workspace_id,
    c.id,
    c.user_id
  INTO v_workspace_id, v_contact_id, v_user_id
  FROM public.contacts c
  WHERE c.id = NEW.contact_id;

  IF v_workspace_id IS NULL OR v_contact_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- If lead moved to HOT stage, create schedule task
  IF NEW.pipeline_stage = 'hot' AND (OLD.pipeline_stage IS NULL OR OLD.pipeline_stage != 'hot') THEN
    INSERT INTO public.tasks (
      workspace_id,
      contact_id,
      assigned_to,
      user_id,
      task_type,
      urgency,
      status,
      title,
      description,
      due_at,
      auto_generated,
      auto_type,
      metadata
    )
    VALUES (
      v_workspace_id,
      v_contact_id,
      COALESCE(v_user_id, (SELECT user_id FROM public.workspace_members WHERE workspace_id = v_workspace_id ORDER BY created_at ASC LIMIT 1)),
      COALESCE(v_user_id, (SELECT user_id FROM public.workspace_members WHERE workspace_id = v_workspace_id ORDER BY created_at ASC LIMIT 1)),
      'book_inspection',
      'high',
      'today',
      'Schedule inspection - Lead moved to HOT',
      'Lead status changed to HOT, schedule inspection immediately',
      now() + interval '1 day',
      true,
      'pipeline_hot',
      jsonb_build_object('old_stage', OLD.pipeline_stage, 'new_stage', NEW.pipeline_stage)
    )
    ON CONFLICT DO NOTHING;
  END IF;

  -- If lead stuck for 7 days, create follow-up task
  IF NEW.pipeline_stage IS NOT NULL AND NEW.pipeline_stage = OLD.pipeline_stage THEN
    -- Check if lead has been in this stage for 7+ days
    IF EXISTS (
      SELECT 1 FROM public.contact_pipeline cp
      WHERE cp.contact_id = NEW.contact_id
      AND cp.stage_id = NEW.pipeline_stage_id
      AND cp.updated_at < now() - interval '7 days'
    ) THEN
      INSERT INTO public.tasks (
        workspace_id,
        contact_id,
        assigned_to,
        user_id,
        task_type,
        urgency,
        status,
        title,
        description,
        due_at,
        auto_generated,
        auto_type,
        metadata
      )
      VALUES (
        v_workspace_id,
        v_contact_id,
        COALESCE(v_user_id, (SELECT user_id FROM public.workspace_members WHERE workspace_id = v_workspace_id ORDER BY created_at ASC LIMIT 1)),
        COALESCE(v_user_id, (SELECT user_id FROM public.workspace_members WHERE workspace_id = v_workspace_id ORDER BY created_at ASC LIMIT 1)),
        'follow_up_needed',
        'normal',
        'today',
        'Follow up - Lead stuck in pipeline',
        format('Lead has been in %s stage for 7+ days', NEW.pipeline_stage),
        now(),
        true,
        'pipeline_stuck',
        jsonb_build_object('pipeline_stage', NEW.pipeline_stage, 'days_stuck', 7)
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Note: Adjust trigger based on your actual pipeline schema
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'contact_pipeline'
  ) THEN
    DROP TRIGGER IF EXISTS trg_auto_create_task_from_pipeline ON public.contact_pipeline;
    CREATE TRIGGER trg_auto_create_task_from_pipeline
    AFTER INSERT OR UPDATE OF stage_id ON public.contact_pipeline
    FOR EACH ROW
    EXECUTE FUNCTION public.auto_create_task_from_pipeline();
  END IF;
END $$;

-- ============================================================================
-- 3. FOLLOW-UP CYCLE FUNCTIONS
-- ============================================================================

-- Function: Update follow-up cycles for tasks
CREATE OR REPLACE FUNCTION public.update_follow_up_cycles()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task RECORD;
  v_new_due_at timestamptz;
  v_new_cycle_count int;
BEGIN
  -- Process warm leads: follow up every 2 days × 3, then every 4 days × 2, then weekly
  FOR v_task IN
    SELECT * FROM public.tasks
    WHERE completed = false
    AND follow_up_cycle_type = 'warm'
    AND due_at <= now()
    AND follow_up_cycle_count < 5
  LOOP
    v_new_cycle_count := v_task.follow_up_cycle_count + 1;
    
    IF v_new_cycle_count <= 3 THEN
      v_new_due_at := now() + interval '2 days';
    ELSIF v_new_cycle_count <= 5 THEN
      v_new_due_at := now() + interval '4 days';
    ELSE
      v_new_due_at := now() + interval '7 days';
    END IF;

    UPDATE public.tasks
    SET 
      due_at = v_new_due_at,
      follow_up_cycle_count = v_new_cycle_count,
      status = CASE 
        WHEN v_new_due_at::date = CURRENT_DATE THEN 'today'
        WHEN v_new_due_at::date <= CURRENT_DATE + interval '7 days' THEN 'upcoming'
        ELSE 'waiting_on_homeowner'
      END
    WHERE id = v_task.id;
  END LOOP;

  -- Process cold leads: follow up in 7 days, then stop
  FOR v_task IN
    SELECT * FROM public.tasks
    WHERE completed = false
    AND follow_up_cycle_type = 'cold'
    AND due_at <= now()
    AND follow_up_cycle_count = 0
  LOOP
    UPDATE public.tasks
    SET 
      completed = true,
      completed_at = now(),
      status = 'completed',
      notes = COALESCE(notes, '') || E'\n' || 'Cold lead follow-up cycle completed'
    WHERE id = v_task.id;
  END LOOP;

  -- Process old quotes: follow up every 10 days × 3
  FOR v_task IN
    SELECT * FROM public.tasks
    WHERE completed = false
    AND follow_up_cycle_type = 'old_quote'
    AND due_at <= now()
    AND follow_up_cycle_count < 3
  LOOP
    v_new_cycle_count := v_task.follow_up_cycle_count + 1;
    v_new_due_at := now() + interval '10 days';

    UPDATE public.tasks
    SET 
      due_at = v_new_due_at,
      follow_up_cycle_count = v_new_cycle_count,
      status = CASE 
        WHEN v_new_due_at::date = CURRENT_DATE THEN 'today'
        WHEN v_new_due_at::date <= CURRENT_DATE + interval '7 days' THEN 'upcoming'
        ELSE 'waiting_on_homeowner'
      END
    WHERE id = v_task.id;
  END LOOP;

  -- Process insurance: follow-up until claim resolved
  -- (This is handled by manual updates when claim status changes)
END;
$$;

-- ============================================================================
-- 4. URGENCY UPDATE FUNCTION
-- ============================================================================

-- Function: Update task urgency based on storm risk, message tone, etc.
CREATE OR REPLACE FUNCTION public.update_task_urgency()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task RECORD;
  v_new_urgency task_urgency;
BEGIN
  FOR v_task IN
    SELECT t.*, c.metadata as contact_metadata
    FROM public.tasks t
    LEFT JOIN public.contacts c ON c.id = t.contact_id
    WHERE t.completed = false
  LOOP
    v_new_urgency := v_task.urgency;

    -- Check metadata for storm risk
    IF v_task.metadata->>'storm_risk' = 'high' THEN
      v_new_urgency := 'high';
    END IF;

    -- Check for urgent keywords in last message
    IF v_task.last_message_snippet ~* '(leak|water damage|urgent|emergency|storm damage|flood)' THEN
      v_new_urgency := 'high';
    END IF;

    -- Check insurance timeline
    IF v_task.metadata->>'insurance_claim' = 'true' AND v_task.metadata->>'insurance_timeline' = 'urgent' THEN
      v_new_urgency := 'high';
    END IF;

    -- Check if task is overdue
    IF v_task.due_at < now() THEN
      v_new_urgency := 'high';
    END IF;

    -- Update if urgency changed
    IF v_new_urgency != v_task.urgency THEN
      UPDATE public.tasks
      SET urgency = v_new_urgency
      WHERE id = v_task.id;
    END IF;
  END LOOP;
END;
$$;

-- ============================================================================
-- 5. HELPER FUNCTIONS
-- ============================================================================

-- Function: Get today's tasks count
CREATE OR REPLACE FUNCTION public.get_today_tasks_count(p_workspace_id uuid, p_user_id uuid DEFAULT NULL)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.tasks
  WHERE workspace_id = p_workspace_id
  AND completed = false
  AND due_at::date = CURRENT_DATE
  AND (p_user_id IS NULL OR assigned_to = p_user_id);
  
  RETURN v_count;
END;
$$;

-- Function: Bulk complete tasks
CREATE OR REPLACE FUNCTION public.bulk_complete_tasks(p_task_ids uuid[], p_user_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE public.tasks
  SET 
    completed = true,
    completed_at = now(),
    status = 'completed'
  WHERE id = ANY(p_task_ids)
  AND assigned_to = p_user_id
  AND completed = false;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ============================================================================
-- 6. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.tasks IS 'SmartSend Tasks & Follow-Up Board - The productivity brain that tells roofers exactly WHAT to do, WHO needs attention, and WHEN to follow up';
COMMENT ON COLUMN public.tasks.task_type IS 'Type of task: follow_up_needed, book_inspection, answer_question, update_lead_info, high_urgency_issue';
COMMENT ON COLUMN public.tasks.urgency IS 'Urgency level: high (🔥), normal (🟡), low (🟦)';
COMMENT ON COLUMN public.tasks.status IS 'Kanban column status: today, upcoming, waiting_on_homeowner, completed';
COMMENT ON COLUMN public.tasks.metadata IS 'JSON metadata storing reply intent, storm risk, insurance likelihood, etc.';
COMMENT ON COLUMN public.tasks.follow_up_cycle_count IS 'Current cycle number in follow-up sequence';
COMMENT ON COLUMN public.tasks.follow_up_cycle_type IS 'Type of follow-up cycle: warm, cold, old_quote, insurance';

