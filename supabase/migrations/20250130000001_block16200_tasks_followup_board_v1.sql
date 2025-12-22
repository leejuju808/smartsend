-- =========================================================
-- Block 16200 — SmartSend Tasks & Follow-Up Board v1
-- The Roofing Task System: Auto-Created Tasks, Urgency Ranking, Follow-Up Cycles, Pipeline Actions & Daily Workflows
-- =========================================================

-- ============================================================================
-- 1. CREATE TASKS TABLE (Enhanced for Roofing)
-- ============================================================================

-- Create task_type enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_type') THEN
    CREATE TYPE task_type AS ENUM (
      'follow_up_needed',
      'book_inspection',
      'answer_question',
      'update_lead_info',
      'high_urgency_issue'
    );
  END IF;
END$$;

-- Create urgency_level enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'urgency_level') THEN
    CREATE TYPE urgency_level AS ENUM (
      'high',
      'normal',
      'low'
    );
  END IF;
END$$;

-- Create task_status enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_status') THEN
    CREATE TYPE task_status AS ENUM (
      'today',
      'upcoming',
      'waiting_on_homeowner',
      'completed'
    );
  END IF;
END$$;

-- Create or alter tasks table
CREATE TABLE IF NOT EXISTS public.smartsend_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- assigned user
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  
  -- Task classification
  task_type task_type NOT NULL,
  urgency urgency_level NOT NULL DEFAULT 'normal',
  status task_status NOT NULL DEFAULT 'upcoming',
  
  -- Task details
  title text NOT NULL,
  description text,
  notes text,
  
  -- Scheduling
  due_at timestamptz NOT NULL,
  completed_at timestamptz,
  
  -- Metadata (JSONB for flexible data storage)
  metadata jsonb DEFAULT '{}'::jsonb, -- stores: reply_intent, storm_risk, insurance_likelihood, last_message_snippet, etc.
  
  -- Auto-generation tracking
  auto_generated boolean DEFAULT false,
  auto_source text, -- 'inbox', 'scheduler', 'pipeline', 'weather', 'list_intelligence'
  
  -- Follow-up cycle tracking
  follow_up_cycle_id uuid, -- links to follow_up_cycles table
  follow_up_attempt_number int DEFAULT 0,
  
  -- Pipeline integration
  pipeline_stage_id uuid REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  suggested_next_stage text, -- suggested pipeline stage when task is completed
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ============================================================================
-- 2. INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_smartsend_tasks_workspace ON public.smartsend_tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_smartsend_tasks_user ON public.smartsend_tasks(workspace_id, user_id);
CREATE INDEX IF NOT EXISTS idx_smartsend_tasks_contact ON public.smartsend_tasks(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_smartsend_tasks_status ON public.smartsend_tasks(workspace_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_smartsend_tasks_urgency ON public.smartsend_tasks(workspace_id, urgency, due_at) WHERE status != 'completed';
CREATE INDEX IF NOT EXISTS idx_smartsend_tasks_due_at ON public.smartsend_tasks(due_at) WHERE status != 'completed';
CREATE INDEX IF NOT EXISTS idx_smartsend_tasks_type ON public.smartsend_tasks(workspace_id, task_type, status);
CREATE INDEX IF NOT EXISTS idx_smartsend_tasks_auto_generated ON public.smartsend_tasks(auto_generated, auto_source) WHERE auto_generated = true;
CREATE INDEX IF NOT EXISTS idx_smartsend_tasks_pipeline_stage ON public.smartsend_tasks(pipeline_stage_id) WHERE pipeline_stage_id IS NOT NULL;

-- ============================================================================
-- 3. UPDATED_AT TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_smartsend_tasks_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_smartsend_tasks_updated_at ON public.smartsend_tasks;
CREATE TRIGGER trg_smartsend_tasks_updated_at
BEFORE UPDATE ON public.smartsend_tasks
FOR EACH ROW
EXECUTE FUNCTION public.set_smartsend_tasks_updated_at();

-- ============================================================================
-- 4. FOLLOW-UP CYCLES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.follow_up_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  
  cycle_type text NOT NULL, -- 'warm', 'cold', 'old_quote', 'insurance'
  current_attempt int DEFAULT 0,
  max_attempts int NOT NULL,
  next_follow_up_at timestamptz,
  
  -- Cycle configuration (JSONB for flexible rules)
  cycle_config jsonb DEFAULT '{}'::jsonb, -- stores: interval_days, etc.
  
  status text DEFAULT 'active', -- 'active', 'completed', 'stopped'
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_follow_up_cycles_workspace ON public.follow_up_cycles(workspace_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_cycles_contact ON public.follow_up_cycles(contact_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_cycles_next_follow_up ON public.follow_up_cycles(next_follow_up_at) WHERE status = 'active';

-- ============================================================================
-- 5. ROW LEVEL SECURITY POLICIES
-- ============================================================================

ALTER TABLE public.smartsend_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_up_cycles ENABLE ROW LEVEL SECURITY;

-- Tasks: Users can view tasks in their workspace
CREATE POLICY "smartsend_tasks_select_workspace"
  ON public.smartsend_tasks
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Tasks: Users can insert tasks in their workspace
CREATE POLICY "smartsend_tasks_insert_workspace"
  ON public.smartsend_tasks
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Tasks: Users can update tasks in their workspace
CREATE POLICY "smartsend_tasks_update_workspace"
  ON public.smartsend_tasks
  FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Tasks: Users can delete tasks in their workspace
CREATE POLICY "smartsend_tasks_delete_workspace"
  ON public.smartsend_tasks
  FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Follow-up cycles: Same policies
CREATE POLICY "follow_up_cycles_select_workspace"
  ON public.follow_up_cycles
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "follow_up_cycles_insert_workspace"
  ON public.follow_up_cycles
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "follow_up_cycles_update_workspace"
  ON public.follow_up_cycles
  FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- 6. AUTO-GENERATION FUNCTIONS
-- ============================================================================

-- Function: Auto-create task from inbox reply
CREATE OR REPLACE FUNCTION public.auto_create_task_from_inbox()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_id uuid;
  v_contact_id uuid;
  v_user_id uuid;
  v_task_type task_type;
  v_urgency urgency_level;
  v_title text;
  v_due_at timestamptz;
  v_metadata jsonb;
  v_reply_intent text;
  v_has_question boolean;
  v_has_booking_intent boolean;
  v_has_urgent_damage boolean;
BEGIN
  -- Get workspace and contact from reply thread or message
  -- This assumes there's a reply_threads or similar table
  -- Adjust based on your actual schema
  
  -- For now, we'll create a placeholder that can be customized
  -- based on your actual inbox/reply structure
  
  RETURN NEW;
END;
$$;

-- Function: Calculate task urgency based on multiple factors
CREATE OR REPLACE FUNCTION public.calculate_task_urgency(
  p_storm_risk numeric DEFAULT 0,
  p_message_tone text DEFAULT 'neutral',
  p_has_urgent_language boolean DEFAULT false,
  p_insurance_timeline_days int DEFAULT NULL,
  p_missed_appointment boolean DEFAULT false,
  p_stage_sitting_days int DEFAULT NULL
)
RETURNS urgency_level
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- High urgency conditions
  IF p_has_urgent_language OR p_missed_appointment THEN
    RETURN 'high';
  END IF;
  
  IF p_storm_risk > 0.7 THEN
    RETURN 'high';
  END IF;
  
  IF p_insurance_timeline_days IS NOT NULL AND p_insurance_timeline_days < 7 THEN
    RETURN 'high';
  END IF;
  
  IF p_stage_sitting_days IS NOT NULL AND p_stage_sitting_days > 14 THEN
    RETURN 'high';
  END IF;
  
  -- Normal urgency conditions
  IF p_storm_risk > 0.4 OR p_message_tone IN ('interested', 'warm') THEN
    RETURN 'normal';
  END IF;
  
  -- Default to low
  RETURN 'low';
END;
$$;

-- Function: Create follow-up cycle
CREATE OR REPLACE FUNCTION public.create_follow_up_cycle(
  p_workspace_id uuid,
  p_contact_id uuid,
  p_cycle_type text -- 'warm', 'cold', 'old_quote', 'insurance'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cycle_id uuid;
  v_config jsonb;
  v_max_attempts int;
  v_interval_days int;
BEGIN
  -- Configure cycle based on type
  CASE p_cycle_type
    WHEN 'warm' THEN
      v_config := '{"intervals": [2, 2, 2, 4, 4, 7]}'::jsonb;
      v_max_attempts := 6;
      v_interval_days := 2;
    WHEN 'cold' THEN
      v_config := '{"intervals": [7]}'::jsonb;
      v_max_attempts := 1;
      v_interval_days := 7;
    WHEN 'old_quote' THEN
      v_config := '{"intervals": [10, 10, 10]}'::jsonb;
      v_max_attempts := 3;
      v_interval_days := 10;
    WHEN 'insurance' THEN
      v_config := '{"intervals": [3, 3, 5, 7]}'::jsonb;
      v_max_attempts := 10; -- Until claim resolved
      v_interval_days := 3;
    ELSE
      v_config := '{"intervals": [7]}'::jsonb;
      v_max_attempts := 1;
      v_interval_days := 7;
  END CASE;
  
  INSERT INTO public.follow_up_cycles (
    workspace_id,
    contact_id,
    cycle_type,
    max_attempts,
    cycle_config,
    next_follow_up_at
  )
  VALUES (
    p_workspace_id,
    p_contact_id,
    p_cycle_type,
    v_max_attempts,
    v_config,
    now() + (v_interval_days || ' days')::interval
  )
  RETURNING id INTO v_cycle_id;
  
  RETURN v_cycle_id;
END;
$$;

-- Function: Process follow-up cycle and create next task
CREATE OR REPLACE FUNCTION public.process_follow_up_cycle()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cycle RECORD;
  v_intervals int[];
  v_next_interval int;
  v_workspace_id uuid;
  v_contact_id uuid;
  v_user_id uuid;
BEGIN
  -- Find cycles that need processing
  FOR v_cycle IN
    SELECT *
    FROM public.follow_up_cycles
    WHERE status = 'active'
      AND next_follow_up_at <= now()
      AND current_attempt < max_attempts
  LOOP
    -- Get intervals from config
    v_intervals := ARRAY(
      SELECT jsonb_array_elements_text(v_cycle.cycle_config->'intervals')
    )::int[];
    
    -- Get next interval (or last one if we've exceeded)
    IF v_cycle.current_attempt + 1 <= array_length(v_intervals, 1) THEN
      v_next_interval := v_intervals[v_cycle.current_attempt + 1];
    ELSE
      v_next_interval := v_intervals[array_length(v_intervals, 1)];
    END IF;
    
    -- Get workspace and contact info
    v_workspace_id := v_cycle.workspace_id;
    v_contact_id := v_cycle.contact_id;
    
    -- Get assigned user (first workspace member or contact owner)
    SELECT user_id INTO v_user_id
    FROM public.workspace_members
    WHERE workspace_id = v_workspace_id
    ORDER BY created_at ASC
    LIMIT 1;
    
    -- Create follow-up task
    INSERT INTO public.smartsend_tasks (
      workspace_id,
      user_id,
      contact_id,
      task_type,
      urgency,
      status,
      title,
      due_at,
      auto_generated,
      auto_source,
      follow_up_cycle_id,
      follow_up_attempt_number,
      metadata
    )
    VALUES (
      v_workspace_id,
      v_user_id,
      v_contact_id,
      'follow_up_needed',
      'normal',
      'upcoming',
      format('Follow up with %s', (SELECT COALESCE(first_name || ' ' || last_name, email) FROM public.contacts WHERE id = v_contact_id)),
      now() + (v_next_interval || ' days')::interval,
      true,
      'follow_up_cycle',
      v_cycle.id,
      v_cycle.current_attempt + 1,
      jsonb_build_object(
        'cycle_type', v_cycle.cycle_type,
        'attempt_number', v_cycle.current_attempt + 1
      )
    );
    
    -- Update cycle
    UPDATE public.follow_up_cycles
    SET 
      current_attempt = current_attempt + 1,
      next_follow_up_at = CASE 
        WHEN current_attempt + 1 < max_attempts THEN now() + (v_next_interval || ' days')::interval
        ELSE NULL
      END,
      status = CASE 
        WHEN current_attempt + 1 >= max_attempts THEN 'completed'
        ELSE 'active'
      END,
      updated_at = now()
    WHERE id = v_cycle.id;
  END LOOP;
END;
$$;

-- ============================================================================
-- 7. HELPER FUNCTIONS
-- ============================================================================

-- Function: Get today's tasks count for a workspace
CREATE OR REPLACE FUNCTION public.get_todays_tasks_count(p_workspace_id uuid, p_user_id uuid DEFAULT NULL)
RETURNS int
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.smartsend_tasks
  WHERE workspace_id = p_workspace_id
    AND status != 'completed'
    AND due_at::date = CURRENT_DATE
    AND (p_user_id IS NULL OR user_id = p_user_id);
  
  RETURN v_count;
END;
$$;

-- Function: Move task to completed and suggest next pipeline stage
CREATE OR REPLACE FUNCTION public.complete_task_with_pipeline_suggestion(
  p_task_id uuid,
  p_suggested_stage text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.smartsend_tasks
  SET 
    status = 'completed',
    completed_at = now(),
    suggested_next_stage = p_suggested_stage,
    updated_at = now()
  WHERE id = p_task_id;
END;
$$;

-- ============================================================================
-- 8. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.smartsend_tasks IS 'SmartSend Tasks & Follow-Up Board - The productivity brain of SmartSend';
COMMENT ON COLUMN public.smartsend_tasks.task_type IS 'Type of task: follow_up_needed, book_inspection, answer_question, update_lead_info, high_urgency_issue';
COMMENT ON COLUMN public.smartsend_tasks.urgency IS 'Urgency level: high (storm risk, urgent damage), normal, low';
COMMENT ON COLUMN public.smartsend_tasks.status IS 'Task status: today, upcoming, waiting_on_homeowner, completed';
COMMENT ON COLUMN public.smartsend_tasks.metadata IS 'JSONB storing: reply_intent, storm_risk, insurance_likelihood, last_message_snippet, etc.';
COMMENT ON COLUMN public.smartsend_tasks.auto_source IS 'Source of auto-generation: inbox, scheduler, pipeline, weather, list_intelligence';
COMMENT ON COLUMN public.smartsend_tasks.suggested_next_stage IS 'Suggested pipeline stage when task is completed';





















































