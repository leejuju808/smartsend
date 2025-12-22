-- =========================================================
-- Block 25060 — SmartSend Roofing Task Manager v1
-- (Task Assignments • Daily Task List • Job-Linked Tasks • Owner Tasks • Automatic Task Creation)
-- =========================================================
-- 
-- THE ROOFING TASK SYSTEM — ZERO FLUFF.
-- 
-- SmartSend Task Manager v1 becomes the to-do system for the entire roofing operation,
-- with tasks that are automatically created, assigned, tracked, and linked to jobs.
-- 
-- This makes SmartSend not just a CRM… It becomes the daily operating system.

-- ============================================================================
-- PART 1 — CREATE TASK CATEGORY ENUM
-- ============================================================================
-- Four key task categories: Job Tasks, Lead Tasks, Owner/Manager Tasks, Automated System Tasks

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_category') THEN
    CREATE TYPE task_category AS ENUM (
      'job_task',        -- Linked to a specific job
      'lead_task',       -- Linked to a specific lead
      'owner_task',      -- High-level tasks that impact operations
      'system_task'      -- Created automatically by alerts, workflows, NLP
    );
  END IF;
END$$;

-- ============================================================================
-- PART 2 — CREATE TASK PRIORITY ENUM
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_priority_roofing') THEN
    CREATE TYPE task_priority_roofing AS ENUM (
      'high',      -- 🔴 HIGH - Impacts money or today's schedule
      'medium',    -- 🟠 MEDIUM - Important but not urgent
      'low'         -- 🟢 LOW - Convenience or long-term
    );
  END IF;
END$$;

-- ============================================================================
-- PART 3 — CREATE TASK STATUS ENUM
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_status_roofing') THEN
    CREATE TYPE task_status_roofing AS ENUM (
      'open',          -- Task is open and needs to be done
      'in_progress',   -- Task is currently being worked on
      'done',          -- Task is completed
      'overdue'        -- Task is past due date
    );
  END IF;
END$$;

-- ============================================================================
-- PART 4 — CREATE TASK CREATION SOURCE ENUM
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_creation_source') THEN
    CREATE TYPE task_creation_source AS ENUM (
      'manual',        -- Created manually by user
      'auto',          -- Created automatically by system
      'message',       -- Created from messaging hub (homeowner request, adjuster needs, etc.)
      'workflow',      -- Created from workflow/automation
      'alert',         -- Created from alert/automation
      'nlp'            -- Created from NLP understanding
    );
  END IF;
END$$;

-- ============================================================================
-- PART 5 — CREATE ROOFING_TASKS TABLE (Main Task Table)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.roofing_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Task Category (Job, Lead, Owner, System)
  category task_category NOT NULL,
  
  -- Task Linking (one of these will be set based on category)
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  
  -- Task Assignment
  assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_role text, -- 'sales', 'ops', 'crew', 'insurance_coordinator', 'admin', 'owner'
  
  -- Task Details
  title text NOT NULL,
  description text,
  priority task_priority_roofing NOT NULL DEFAULT 'medium',
  status task_status_roofing NOT NULL DEFAULT 'open',
  
  -- Scheduling
  due_date date NOT NULL,
  due_time time, -- Optional time component
  due_at timestamptz, -- Calculated from due_date + due_time
  completed_at timestamptz,
  
  -- Creation Tracking
  creation_source task_creation_source NOT NULL DEFAULT 'manual',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Auto-generation metadata
  auto_source_details jsonb DEFAULT '{}'::jsonb, -- Stores: alert_id, message_id, workflow_id, nlp_context, etc.
  
  -- Recurring Tasks
  is_recurring boolean DEFAULT false,
  recurrence_pattern text, -- 'daily', 'weekly', 'monthly', 'custom'
  recurrence_config jsonb DEFAULT '{}'::jsonb, -- Stores: interval_days, day_of_week, day_of_month, etc.
  parent_recurring_task_id uuid REFERENCES public.roofing_tasks(id) ON DELETE SET NULL,
  
  -- Task Completion Actions (what happens when task is completed)
  completion_action_type text, -- 'mark_delivery_confirmed', 'send_message', 'update_timeline', 'update_payment_log', etc.
  completion_action_config jsonb DEFAULT '{}'::jsonb, -- Stores action-specific configuration
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb, -- Flexible storage for task-specific data
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- PART 6 — CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

-- Workspace and user indexes
CREATE INDEX IF NOT EXISTS idx_roofing_tasks_workspace ON public.roofing_tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_roofing_tasks_assigned_user ON public.roofing_tasks(workspace_id, assigned_user_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_roofing_tasks_assigned_role ON public.roofing_tasks(workspace_id, assigned_role, status, due_date);

-- Category and linking indexes
CREATE INDEX IF NOT EXISTS idx_roofing_tasks_category ON public.roofing_tasks(workspace_id, category, status);
CREATE INDEX IF NOT EXISTS idx_roofing_tasks_job ON public.roofing_tasks(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roofing_tasks_lead ON public.roofing_tasks(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roofing_tasks_contact ON public.roofing_tasks(contact_id) WHERE contact_id IS NOT NULL;

-- Priority and status indexes
CREATE INDEX IF NOT EXISTS idx_roofing_tasks_priority ON public.roofing_tasks(workspace_id, priority, due_date) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_roofing_tasks_status ON public.roofing_tasks(workspace_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_roofing_tasks_overdue ON public.roofing_tasks(workspace_id, due_date) WHERE status = 'open' AND due_date < CURRENT_DATE;

-- Due date indexes
CREATE INDEX IF NOT EXISTS idx_roofing_tasks_due_date ON public.roofing_tasks(due_date) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_roofing_tasks_due_at ON public.roofing_tasks(due_at) WHERE status = 'open' AND due_at IS NOT NULL;

-- Creation source indexes
CREATE INDEX IF NOT EXISTS idx_roofing_tasks_creation_source ON public.roofing_tasks(workspace_id, creation_source) WHERE creation_source != 'manual';

-- Recurring tasks indexes
CREATE INDEX IF NOT EXISTS idx_roofing_tasks_recurring ON public.roofing_tasks(is_recurring, parent_recurring_task_id) WHERE is_recurring = true;

-- ============================================================================
-- PART 7 — CREATE TASK ASSIGNMENT HISTORY TABLE
-- ============================================================================
-- Track task assignment changes for accountability

CREATE TABLE IF NOT EXISTS public.roofing_task_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.roofing_tasks(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  role text,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  unassigned_at timestamptz,
  is_current boolean DEFAULT true -- Only one current assignment per task
);

CREATE INDEX IF NOT EXISTS idx_roofing_task_assignments_task ON public.roofing_task_assignments(task_id, is_current);
CREATE INDEX IF NOT EXISTS idx_roofing_task_assignments_user ON public.roofing_task_assignments(user_id, is_current) WHERE is_current = true;

-- ============================================================================
-- PART 8 — CREATE TASK COMPLETION LOG TABLE
-- ============================================================================
-- Track when tasks are completed and what actions were taken

CREATE TABLE IF NOT EXISTS public.roofing_task_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.roofing_tasks(id) ON DELETE CASCADE,
  completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  completion_action_type text,
  completion_result jsonb DEFAULT '{}'::jsonb, -- Stores result of completion action
  notes text
);

CREATE INDEX IF NOT EXISTS idx_roofing_task_completions_task ON public.roofing_task_completions(task_id);
CREATE INDEX IF NOT EXISTS idx_roofing_task_completions_user ON public.roofing_task_completions(completed_by, completed_at DESC);

-- ============================================================================
-- PART 9 — TRIGGERS
-- ============================================================================

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_roofing_tasks_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_roofing_tasks_updated_at ON public.roofing_tasks;
CREATE TRIGGER trg_roofing_tasks_updated_at
BEFORE UPDATE ON public.roofing_tasks
FOR EACH ROW
EXECUTE FUNCTION public.set_roofing_tasks_updated_at();

-- Sync due_at from due_date + due_time
CREATE OR REPLACE FUNCTION public.sync_roofing_tasks_due_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.due_date IS NOT NULL THEN
    IF NEW.due_time IS NOT NULL THEN
      NEW.due_at := (NEW.due_date + NEW.due_time)::timestamptz;
    ELSE
      NEW.due_at := NEW.due_date::timestamptz;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_roofing_tasks_due_at ON public.roofing_tasks;
CREATE TRIGGER trg_sync_roofing_tasks_due_at
BEFORE INSERT OR UPDATE OF due_date, due_time ON public.roofing_tasks
FOR EACH ROW
EXECUTE FUNCTION public.sync_roofing_tasks_due_at();

-- Mark overdue tasks
CREATE OR REPLACE FUNCTION public.mark_overdue_roofing_tasks()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'open' AND NEW.due_date < CURRENT_DATE THEN
    NEW.status = 'overdue';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mark_overdue_roofing_tasks ON public.roofing_tasks;
CREATE TRIGGER trg_mark_overdue_roofing_tasks
BEFORE INSERT OR UPDATE OF due_date, status ON public.roofing_tasks
FOR EACH ROW
EXECUTE FUNCTION public.mark_overdue_roofing_tasks();

-- Track assignment changes
CREATE OR REPLACE FUNCTION public.track_roofing_task_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- If assignment changed, create assignment record
  IF (OLD.assigned_user_id IS DISTINCT FROM NEW.assigned_user_id) OR 
     (OLD.assigned_role IS DISTINCT FROM NEW.assigned_role) THEN
    
    -- Mark old assignment as not current
    UPDATE public.roofing_task_assignments
    SET is_current = false, unassigned_at = now()
    WHERE task_id = NEW.id AND is_current = true;
    
    -- Create new assignment record if assigned
    IF NEW.assigned_user_id IS NOT NULL OR NEW.assigned_role IS NOT NULL THEN
      INSERT INTO public.roofing_task_assignments (
        task_id,
        user_id,
        role,
        assigned_by,
        is_current
      )
      VALUES (
        NEW.id,
        NEW.assigned_user_id,
        NEW.assigned_role,
        auth.uid(),
        true
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_track_roofing_task_assignment ON public.roofing_tasks;
CREATE TRIGGER trg_track_roofing_task_assignment
AFTER UPDATE OF assigned_user_id, assigned_role ON public.roofing_tasks
FOR EACH ROW
EXECUTE FUNCTION public.track_roofing_task_assignment();

-- Track task completion
CREATE OR REPLACE FUNCTION public.track_roofing_task_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status = 'done' AND OLD.status != 'done' THEN
    INSERT INTO public.roofing_task_completions (
      task_id,
      completed_by,
      completion_action_type,
      notes
    )
    VALUES (
      NEW.id,
      auth.uid(),
      NEW.completion_action_type,
      NEW.description
    );
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_track_roofing_task_completion ON public.roofing_tasks;
CREATE TRIGGER trg_track_roofing_task_completion
AFTER UPDATE OF status ON public.roofing_tasks
FOR EACH ROW
WHEN (NEW.status = 'done' AND OLD.status != 'done')
EXECUTE FUNCTION public.track_roofing_task_completion();

-- ============================================================================
-- PART 10 — SMART ASSIGNMENT ENGINE FUNCTIONS
-- ============================================================================

-- Function to auto-assign task based on job ownership, user role, crew, workflow rules
CREATE OR REPLACE FUNCTION public.auto_assign_roofing_task(
  p_task_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task RECORD;
  v_assigned_user_id uuid;
  v_assigned_role text;
BEGIN
  -- Get task details
  SELECT * INTO v_task
  FROM public.roofing_tasks
  WHERE id = p_task_id;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Assignment logic based on task category and context
  CASE v_task.category
    WHEN 'job_task' THEN
      -- Assign based on job ownership
      IF v_task.job_id IS NOT NULL THEN
        -- Get job owner or assigned crew
        SELECT 
          COALESCE(
            (SELECT assigned_to FROM public.roofing_jobs WHERE id = v_task.job_id),
            (SELECT owner_id FROM public.roofing_jobs WHERE id = v_task.job_id)
          ) INTO v_assigned_user_id
        FROM public.roofing_jobs
        WHERE id = v_task.job_id;
        
        -- Determine role from job context
        SELECT 
          CASE 
            WHEN EXISTS (SELECT 1 FROM public.roofing_jobs WHERE id = v_task.job_id AND crew_name IS NOT NULL) 
              THEN 'crew'
            ELSE 'ops'
          END INTO v_assigned_role;
      END IF;
      
    WHEN 'lead_task' THEN
      -- Assign to sales rep
      IF v_task.lead_id IS NOT NULL THEN
        -- Get lead owner or assigned sales rep
        SELECT 
          COALESCE(
            (SELECT assigned_to FROM public.leads WHERE id = v_task.lead_id),
            (SELECT user_id FROM public.leads WHERE id = v_task.lead_id)
          ) INTO v_assigned_user_id
        FROM public.leads
        WHERE id = v_task.lead_id;
        
        v_assigned_role := 'sales';
      END IF;
      
    WHEN 'owner_task' THEN
      -- Assign to owner
      SELECT owner_id INTO v_assigned_user_id
      FROM public.workspaces
      WHERE id = v_task.workspace_id;
      
      v_assigned_role := 'owner';
      
    WHEN 'system_task' THEN
      -- Assign based on auto_source_details
      IF v_task.auto_source_details->>'alert_type' IS NOT NULL THEN
        -- Assign based on alert type
        CASE v_task.auto_source_details->>'alert_type'
          WHEN 'overdue_invoice', 'missing_deposit' THEN
            v_assigned_role := 'ops';
          WHEN 'supplement_pending', 'insurance_documents_needed' THEN
            v_assigned_role := 'insurance_coordinator';
          WHEN 'job_at_risk', 'high_value_opportunity' THEN
            SELECT owner_id INTO v_assigned_user_id
            FROM public.workspaces
            WHERE id = v_task.workspace_id;
            v_assigned_role := 'owner';
          ELSE
            v_assigned_role := 'ops';
        END CASE;
      END IF;
  END CASE;
  
  -- Update task assignment
  UPDATE public.roofing_tasks
  SET 
    assigned_user_id = v_assigned_user_id,
    assigned_role = v_assigned_role
  WHERE id = p_task_id;
  
  RETURN v_assigned_user_id;
END;
$$;

-- ============================================================================
-- PART 11 — AUTOMATIC TASK CREATION FUNCTIONS
-- ============================================================================

-- Function to create task from messaging hub (homeowner request, adjuster needs, etc.)
CREATE OR REPLACE FUNCTION public.create_task_from_message(
  p_workspace_id uuid,
  p_message_id uuid,
  p_contact_id uuid,
  p_job_id uuid DEFAULT NULL,
  p_lead_id uuid DEFAULT NULL,
  p_message_text text,
  p_nlp_intent text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task_id uuid;
  v_category task_category;
  v_title text;
  v_due_date date;
  v_priority task_priority_roofing;
BEGIN
  -- Determine category
  IF p_job_id IS NOT NULL THEN
    v_category := 'job_task';
  ELSIF p_lead_id IS NOT NULL THEN
    v_category := 'lead_task';
  ELSE
    v_category := 'lead_task'; -- Default to lead task
  END IF;
  
  -- Determine task details from NLP intent or message text
  IF p_nlp_intent IS NOT NULL THEN
    CASE p_nlp_intent
      WHEN 'callback_request' THEN
        v_title := 'Homeowner requested callback';
        v_due_date := CURRENT_DATE; -- Due today
        v_priority := 'high';
      WHEN 'follow_up_request' THEN
        v_title := 'Follow up requested';
        v_due_date := CURRENT_DATE + interval '1 day';
        v_priority := 'medium';
      WHEN 'document_request' THEN
        v_title := 'Documents requested';
        v_due_date := CURRENT_DATE + interval '1 day';
        v_priority := 'high';
      ELSE
        v_title := 'Action needed from message';
        v_due_date := CURRENT_DATE + interval '1 day';
        v_priority := 'medium';
    END CASE;
  ELSE
    v_title := 'Action needed from message';
    v_due_date := CURRENT_DATE + interval '1 day';
    v_priority := 'medium';
  END IF;
  
  -- Create task
  INSERT INTO public.roofing_tasks (
    workspace_id,
    category,
    job_id,
    lead_id,
    contact_id,
    title,
    description,
    priority,
    due_date,
    creation_source,
    auto_source_details
  )
  VALUES (
    p_workspace_id,
    v_category,
    p_job_id,
    p_lead_id,
    p_contact_id,
    v_title,
    p_message_text,
    v_priority,
    v_due_date,
    'message',
    jsonb_build_object(
      'message_id', p_message_id,
      'nlp_intent', p_nlp_intent
    )
  )
  RETURNING id INTO v_task_id;
  
  -- Auto-assign task
  PERFORM public.auto_assign_roofing_task(v_task_id);
  
  RETURN v_task_id;
END;
$$;

-- Function to create task from alert
CREATE OR REPLACE FUNCTION public.create_task_from_alert(
  p_workspace_id uuid,
  p_alert_id uuid,
  p_alert_type text,
  p_alert_title text,
  p_alert_message text,
  p_job_id uuid DEFAULT NULL,
  p_lead_id uuid DEFAULT NULL,
  p_contact_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task_id uuid;
  v_category task_category;
  v_due_date date;
  v_priority task_priority_roofing;
BEGIN
  -- Determine category
  IF p_job_id IS NOT NULL THEN
    v_category := 'job_task';
  ELSIF p_lead_id IS NOT NULL THEN
    v_category := 'lead_task';
  ELSE
    v_category := 'system_task';
  END IF;
  
  -- Determine due date and priority based on alert type
  CASE p_alert_type
    WHEN 'overdue_invoice', 'missing_deposit' THEN
      v_due_date := CURRENT_DATE; -- Due today
      v_priority := 'high';
    WHEN 'supplement_pending' THEN
      v_due_date := CURRENT_DATE + interval '3 days';
      v_priority := 'high';
    WHEN 'delivery_issue', 'missing_delivery_confirmation' THEN
      v_due_date := CURRENT_DATE; -- Due today
      v_priority := 'high';
    WHEN 'no_documentation_uploaded' THEN
      v_due_date := CURRENT_DATE + interval '1 day';
      v_priority := 'medium';
    WHEN 'job_at_risk' THEN
      v_due_date := CURRENT_DATE; -- Due today
      v_priority := 'high';
      v_category := 'owner_task';
    ELSE
      v_due_date := CURRENT_DATE + interval '1 day';
      v_priority := 'medium';
  END CASE;
  
  -- Create task
  INSERT INTO public.roofing_tasks (
    workspace_id,
    category,
    job_id,
    lead_id,
    contact_id,
    title,
    description,
    priority,
    due_date,
    creation_source,
    auto_source_details
  )
  VALUES (
    p_workspace_id,
    v_category,
    p_job_id,
    p_lead_id,
    p_contact_id,
    p_alert_title,
    p_alert_message,
    v_priority,
    v_due_date,
    'alert',
    jsonb_build_object(
      'alert_id', p_alert_id,
      'alert_type', p_alert_type
    )
  )
  RETURNING id INTO v_task_id;
  
  -- Auto-assign task
  PERFORM public.auto_assign_roofing_task(v_task_id);
  
  RETURN v_task_id;
END;
$$;

-- Function to create task from job pipeline change
CREATE OR REPLACE FUNCTION public.create_task_from_pipeline_change(
  p_workspace_id uuid,
  p_job_id uuid,
  p_lead_id uuid,
  p_pipeline_stage text,
  p_change_type text -- 'inspection_needed', 'quote_followup', 'install_prep', etc.
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task_id uuid;
  v_title text;
  v_due_date date;
  v_priority task_priority_roofing;
BEGIN
  -- Determine task details based on pipeline change
  CASE p_change_type
    WHEN 'inspection_needed' THEN
      v_title := 'Schedule inspection';
      v_due_date := CURRENT_DATE + interval '1 day';
      v_priority := 'high';
    WHEN 'quote_followup' THEN
      v_title := 'Follow up on quote';
      v_due_date := CURRENT_DATE + interval '2 days';
      v_priority := 'medium';
    WHEN 'install_prep' THEN
      v_title := 'Prepare for installation';
      v_due_date := CURRENT_DATE + interval '3 days';
      v_priority := 'high';
    ELSE
      v_title := 'Pipeline action needed';
      v_due_date := CURRENT_DATE + interval '1 day';
      v_priority := 'medium';
  END CASE;
  
  -- Create task
  INSERT INTO public.roofing_tasks (
    workspace_id,
    category,
    job_id,
    lead_id,
    title,
    description,
    priority,
    due_date,
    creation_source,
    auto_source_details
  )
  VALUES (
    p_workspace_id,
    CASE WHEN p_job_id IS NOT NULL THEN 'job_task' ELSE 'lead_task' END,
    p_job_id,
    p_lead_id,
    v_title,
    format('Pipeline stage: %s', p_pipeline_stage),
    v_priority,
    v_due_date,
    'workflow',
    jsonb_build_object(
      'pipeline_stage', p_pipeline_stage,
      'change_type', p_change_type
    )
  )
  RETURNING id INTO v_task_id;
  
  -- Auto-assign task
  PERFORM public.auto_assign_roofing_task(v_task_id);
  
  RETURN v_task_id;
END;
$$;

-- ============================================================================
-- PART 12 — DUE DATE ENGINE FUNCTIONS
-- ============================================================================

-- Function to set automatic due date based on task type
CREATE OR REPLACE FUNCTION public.set_automatic_due_date(
  p_task_type text,
  p_created_at timestamptz DEFAULT now()
)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  CASE p_task_type
    WHEN 'homeowner_followup' THEN
      RETURN (p_created_at::date + interval '24 hours')::date;
    WHEN 'supplement_followup' THEN
      RETURN (p_created_at::date + interval '3 days')::date;
    WHEN 'overdue_invoice_reminder' THEN
      RETURN p_created_at::date; -- Daily reminders
    WHEN 'delivery_check' THEN
      RETURN (p_created_at::date + interval '1 day')::date; -- Evening before install
    WHEN 'inspection_task' THEN
      RETURN (p_created_at::date + interval '1 day')::date; -- Day after lead created
    ELSE
      RETURN (p_created_at::date + interval '1 day')::date; -- Default: tomorrow
  END CASE;
END;
$$;

-- ============================================================================
-- PART 13 — TASK COMPLETION ACTION HANDLERS
-- ============================================================================

-- Function to execute completion action when task is completed
CREATE OR REPLACE FUNCTION public.execute_task_completion_action(
  p_task_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task RECORD;
  v_result jsonb := '{}'::jsonb;
BEGIN
  -- Get task details
  SELECT * INTO v_task
  FROM public.roofing_tasks
  WHERE id = p_task_id;
  
  IF NOT FOUND OR v_task.status != 'done' THEN
    RETURN v_result;
  END IF;
  
  -- Execute action based on completion_action_type
  CASE v_task.completion_action_type
    WHEN 'mark_delivery_confirmed' THEN
      -- Update job delivery status
      IF v_task.job_id IS NOT NULL THEN
        UPDATE public.roofing_jobs
        SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('delivery_confirmed', true, 'delivery_confirmed_at', now())
        WHERE id = v_task.job_id;
        
        v_result := jsonb_build_object('action', 'mark_delivery_confirmed', 'success', true);
      END IF;
      
    WHEN 'send_message' THEN
      -- Send message (would integrate with messaging system)
      v_result := jsonb_build_object('action', 'send_message', 'success', true, 'message', 'Message sent');
      
    WHEN 'update_timeline' THEN
      -- Add event to job timeline
      IF v_task.job_id IS NOT NULL THEN
        INSERT INTO public.job_timeline (
          job_id,
          event_type,
          description,
          metadata
        )
        VALUES (
          v_task.job_id,
          'task_completed',
          format('Task completed: %s', v_task.title),
          jsonb_build_object('task_id', v_task.id)
        );
        
        v_result := jsonb_build_object('action', 'update_timeline', 'success', true);
      END IF;
      
    WHEN 'update_payment_log' THEN
      -- Update payment log (would integrate with payment system)
      v_result := jsonb_build_object('action', 'update_payment_log', 'success', true);
      
    ELSE
      -- No action or unknown action type
      v_result := jsonb_build_object('action', 'none', 'success', true);
  END CASE;
  
  -- Update completion result in task completion log
  UPDATE public.roofing_task_completions
  SET completion_result = v_result
  WHERE task_id = p_task_id
  ORDER BY completed_at DESC
  LIMIT 1;
  
  RETURN v_result;
END;
$$;

-- Trigger to execute completion action
CREATE OR REPLACE FUNCTION public.trigger_task_completion_action()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status = 'done' AND OLD.status != 'done' THEN
    PERFORM public.execute_task_completion_action(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_completion_action ON public.roofing_tasks;
CREATE TRIGGER trg_task_completion_action
AFTER UPDATE OF status ON public.roofing_tasks
FOR EACH ROW
WHEN (NEW.status = 'done' AND OLD.status != 'done')
EXECUTE FUNCTION public.trigger_task_completion_action();

-- ============================================================================
-- PART 14 — RECURRING TASKS FUNCTION
-- ============================================================================

-- Function to process recurring tasks
CREATE OR REPLACE FUNCTION public.process_recurring_roofing_tasks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_recurring_task RECORD;
  v_next_due_date date;
BEGIN
  FOR v_recurring_task IN
    SELECT *
    FROM public.roofing_tasks
    WHERE is_recurring = true
      AND status = 'done'
      AND parent_recurring_task_id IS NULL
  LOOP
    -- Calculate next occurrence
    CASE v_recurring_task.recurrence_pattern
      WHEN 'daily' THEN
        v_next_due_date := CURRENT_DATE + interval '1 day';
      WHEN 'weekly' THEN
        v_next_due_date := CURRENT_DATE + interval '1 week';
      WHEN 'monthly' THEN
        v_next_due_date := CURRENT_DATE + interval '1 month';
      ELSE
        -- Custom interval from config
        v_next_due_date := CURRENT_DATE + ((v_recurring_task.recurrence_config->>'interval_days')::int || ' days')::interval;
    END CASE;
    
    -- Create next occurrence
    INSERT INTO public.roofing_tasks (
      workspace_id,
      category,
      job_id,
      lead_id,
      contact_id,
      assigned_user_id,
      assigned_role,
      title,
      description,
      priority,
      due_date,
      creation_source,
      is_recurring,
      recurrence_pattern,
      recurrence_config,
      parent_recurring_task_id,
      completion_action_type,
      completion_action_config,
      metadata
    )
    VALUES (
      v_recurring_task.workspace_id,
      v_recurring_task.category,
      v_recurring_task.job_id,
      v_recurring_task.lead_id,
      v_recurring_task.contact_id,
      v_recurring_task.assigned_user_id,
      v_recurring_task.assigned_role,
      v_recurring_task.title,
      v_recurring_task.description,
      v_recurring_task.priority,
      v_next_due_date,
      'auto',
      true,
      v_recurring_task.recurrence_pattern,
      v_recurring_task.recurrence_config,
      v_recurring_task.id,
      v_recurring_task.completion_action_type,
      v_recurring_task.completion_action_config,
      v_recurring_task.metadata
    );
  END LOOP;
END;
$$;

-- ============================================================================
-- PART 15 — ROW LEVEL SECURITY POLICIES
-- ============================================================================

ALTER TABLE public.roofing_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roofing_task_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roofing_task_completions ENABLE ROW LEVEL SECURITY;

-- Tasks: Users can view tasks in their workspace
CREATE POLICY "roofing_tasks_select_workspace"
  ON public.roofing_tasks
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Tasks: Users can insert tasks in their workspace
CREATE POLICY "roofing_tasks_insert_workspace"
  ON public.roofing_tasks
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Tasks: Users can update tasks in their workspace
CREATE POLICY "roofing_tasks_update_workspace"
  ON public.roofing_tasks
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
CREATE POLICY "roofing_tasks_delete_workspace"
  ON public.roofing_tasks
  FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Task assignments: Same policies
CREATE POLICY "roofing_task_assignments_select_workspace"
  ON public.roofing_task_assignments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_tasks t
      WHERE t.id = roofing_task_assignments.task_id
        AND t.workspace_id IN (
          SELECT workspace_id FROM public.workspace_members
          WHERE user_id = auth.uid()
        )
    )
  );

-- Task completions: Same policies
CREATE POLICY "roofing_task_completions_select_workspace"
  ON public.roofing_task_completions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_tasks t
      WHERE t.id = roofing_task_completions.task_id
        AND t.workspace_id IN (
          SELECT workspace_id FROM public.workspace_members
          WHERE user_id = auth.uid()
        )
    )
  );

-- ============================================================================
-- PART 16 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.roofing_tasks IS 'SmartSend Roofing Task Manager v1 - The to-do system for the entire roofing operation';
COMMENT ON COLUMN public.roofing_tasks.category IS 'Task category: job_task (linked to job), lead_task (linked to lead), owner_task (high-level), system_task (auto-created)';
COMMENT ON COLUMN public.roofing_tasks.priority IS 'Priority: high (impacts money/today), medium (important but not urgent), low (convenience/long-term)';
COMMENT ON COLUMN public.roofing_tasks.creation_source IS 'How task was created: manual, auto, message, workflow, alert, nlp';
COMMENT ON COLUMN public.roofing_tasks.completion_action_type IS 'Action to execute when task is completed: mark_delivery_confirmed, send_message, update_timeline, update_payment_log, etc.';
COMMENT ON FUNCTION public.auto_assign_roofing_task IS 'Smart assignment engine: assigns tasks based on job ownership, user role, crew, workflow rules';
COMMENT ON FUNCTION public.create_task_from_message IS 'Creates task from messaging hub (homeowner request, adjuster needs, supplier confirmation)';
COMMENT ON FUNCTION public.create_task_from_alert IS 'Creates task from alerts & automations (overdue invoice, missing delivery, bad weather, etc.)';
COMMENT ON FUNCTION public.create_task_from_pipeline_change IS 'Creates task from job pipeline changes (inspection needed, quote follow-up, install prep)';
COMMENT ON FUNCTION public.execute_task_completion_action IS 'Executes completion action when task is completed (updates system state)';

-- ============================================================================
-- PART 16 — INTEGRATION WITH JOB TIMELINE
-- ============================================================================
-- Create timeline events when tasks are created or completed

CREATE OR REPLACE FUNCTION public.create_timeline_event_from_task()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job_id uuid;
  v_lead_id uuid;
BEGIN
  -- Get job_id or lead_id from task
  v_job_id := NEW.job_id;
  v_lead_id := NEW.lead_id;
  
  -- Create timeline event when task is created
  IF TG_OP = 'INSERT' THEN
    -- Try to insert into job_timeline if job_id exists
    IF v_job_id IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'job_timeline') THEN
      INSERT INTO public.job_timeline (
        job_id,
        event_type,
        description,
        metadata
      )
      VALUES (
        v_job_id,
        'task_created',
        format('Task created: %s', NEW.title),
        jsonb_build_object(
          'task_id', NEW.id,
          'task_category', NEW.category,
          'task_priority', NEW.priority,
          'due_date', NEW.due_date,
          'assigned_role', NEW.assigned_role
        )
      )
      ON CONFLICT DO NOTHING;
    END IF;
    
    -- Also insert into lead_timeline_events if lead_id exists
    IF v_lead_id IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'lead_timeline_events') THEN
      INSERT INTO public.lead_timeline_events (
        lead_id,
        event_type,
        event_subtype,
        message,
        metadata
      )
      VALUES (
        v_lead_id,
        'task_created',
        NEW.category,
        format('Task created: %s', NEW.title),
        jsonb_build_object(
          'task_id', NEW.id,
          'task_category', NEW.category,
          'task_priority', NEW.priority,
          'due_date', NEW.due_date
        )
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  
  -- Create timeline event when task is completed
  IF TG_OP = 'UPDATE' AND NEW.status = 'done' AND OLD.status != 'done' THEN
    IF v_job_id IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'job_timeline') THEN
      INSERT INTO public.job_timeline (
        job_id,
        event_type,
        description,
        metadata
      )
      VALUES (
        v_job_id,
        'task_completed',
        format('Task completed: %s', NEW.title),
        jsonb_build_object(
          'task_id', NEW.id,
          'task_category', NEW.category,
          'completed_at', NEW.completed_at
        )
      )
      ON CONFLICT DO NOTHING;
    END IF;
    
    IF v_lead_id IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'lead_timeline_events') THEN
      INSERT INTO public.lead_timeline_events (
        lead_id,
        event_type,
        event_subtype,
        message,
        metadata
      )
      VALUES (
        v_lead_id,
        'task_completed',
        NEW.category,
        format('Task completed: %s', NEW.title),
        jsonb_build_object(
          'task_id', NEW.id,
          'task_category', NEW.category,
          'completed_at', NEW.completed_at
        )
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_timeline_event_from_task ON public.roofing_tasks;
CREATE TRIGGER trg_create_timeline_event_from_task
AFTER INSERT OR UPDATE OF status ON public.roofing_tasks
FOR EACH ROW
EXECUTE FUNCTION public.create_timeline_event_from_task();

COMMENT ON FUNCTION public.create_timeline_event_from_task IS 'Creates timeline events when tasks are created or completed';

