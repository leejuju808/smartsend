-- =========================================================
-- Block 18100 — SmartSend Task System v3
-- Full Roofing Task Engine: Auto-Tasks, Priority Tasks, Insurance Tasks, Storm Tasks, Booking Tasks, Pipeline Tasks & Daily Workflows
-- =========================================================

-- ============================================================================
-- 1. EXPAND TASK TYPE ENUM (8 Categories)
-- ============================================================================

-- Drop and recreate task_type enum with v3 categories
DO $$
BEGIN
  -- Drop existing enum if it exists and recreate with all v3 types
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_type_v3') THEN
    DROP TYPE task_type_v3 CASCADE;
  END IF;
  
  CREATE TYPE task_type_v3 AS ENUM (
    -- 1. Lead Follow-Up Tasks
    'lead_follow_up',
    'lead_reply_needed',
    'lead_question_asked',
    'lead_clarification_needed',
    'lead_no_reply',
    'lead_unread_messages',
    'lead_booking_intent',
    
    -- 2. Appointment Tasks
    'appointment_booked',
    'appointment_reminder',
    'appointment_missed',
    'appointment_reschedule',
    'appointment_confirmation',
    
    -- 3. Insurance Tasks
    'insurance_claim_filed',
    'insurance_adjuster_scheduled',
    'insurance_scope_received',
    'insurance_deductible_mentioned',
    'insurance_documents_uploaded',
    'insurance_supplement_needed',
    
    -- 4. Storm Tasks
    'storm_hail_event',
    'storm_wind_event',
    'storm_leak_detected',
    'storm_zone_activated',
    'storm_zip_affected',
    
    -- 5. Pipeline Tasks
    'pipeline_warm_followup',
    'pipeline_hot_booking',
    'pipeline_quote_checkin',
    'pipeline_insurance_timeline',
    
    -- 6. Quote Tasks
    'quote_sent',
    'quote_stale',
    'quote_updated',
    'quote_viewed',
    
    -- 7. Task Chaining Tasks (created by completed tasks)
    'task_chain_next',
    
    -- 8. Office/Admin Tasks
    'admin_domain_issue',
    'admin_billing_issue',
    'admin_upload_missing_info',
    'admin_cleanup_duplicates',
    'admin_add_missing_phone',
    'admin_address_mismatch',
    'admin_bad_lead_cleanup'
  );
END$$;

-- ============================================================================
-- 2. CREATE PRIORITY LEVEL ENUM (v3)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_priority_level') THEN
    CREATE TYPE task_priority_level AS ENUM (
      'critical',  -- 🔥 Critical
      'high',      -- 🔥 High
      'medium',    -- 🟡 Medium
      'low'        -- ⚪ Low
    );
  END IF;
END$$;

-- ============================================================================
-- 3. CREATE TASKS_V3 TABLE (Enhanced)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tasks_v3 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- assigned user
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  
  -- Task classification (v3)
  task_type task_type_v3 NOT NULL,
  priority task_priority_level NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed', 'overdue', 'cancelled')),
  
  -- Task details
  title text NOT NULL,
  description text,
  notes text,
  
  -- Scheduling
  due_at timestamptz NOT NULL,
  due_date date,
  completed_at timestamptz,
  
  -- Priority scoring (calculated)
  priority_score numeric(5,2) DEFAULT 0, -- 0-100 score
  
  -- Metadata (JSONB for flexible data storage)
  metadata jsonb DEFAULT '{}'::jsonb, -- stores: lead_heat, insurance_value, storm_risk, booking_importance, revenue_score, age_of_activity, etc.
  
  -- Auto-generation tracking
  auto_generated boolean DEFAULT false,
  auto_source text, -- 'inbox', 'scheduler', 'pipeline', 'weather', 'list_intelligence', 'task_chain', 'recurrent'
  
  -- Task chaining (v3)
  parent_task_id uuid REFERENCES public.tasks_v3(id) ON DELETE SET NULL,
  next_task_id uuid REFERENCES public.tasks_v3(id) ON DELETE SET NULL,
  chain_position int DEFAULT 0,
  
  -- Recurrent tasks (v3)
  is_recurrent boolean DEFAULT false,
  recurrence_pattern text, -- 'daily', 'weekly', 'monthly', 'custom'
  recurrence_config jsonb DEFAULT '{}'::jsonb, -- stores: interval_days, day_of_week, day_of_month, etc.
  next_recurrence_at timestamptz,
  
  -- Pipeline integration
  pipeline_stage_id uuid REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  suggested_next_stage text,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ============================================================================
-- 4. CREATE TASK_ASSIGNMENTS TABLE (Team Assignment)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.task_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks_v3(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_primary boolean DEFAULT true, -- primary assignee vs collaborator
  UNIQUE(task_id, user_id, is_primary) WHERE is_primary = true
);

-- ============================================================================
-- 5. CREATE TASK_PRIORITY TABLE (Priority Calculation Cache)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.task_priority (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL UNIQUE REFERENCES public.tasks_v3(id) ON DELETE CASCADE,
  lead_heat_score numeric(5,2) DEFAULT 0,
  insurance_value_score numeric(5,2) DEFAULT 0,
  storm_risk_score numeric(5,2) DEFAULT 0,
  booking_importance_score numeric(5,2) DEFAULT 0,
  revenue_score numeric(5,2) DEFAULT 0,
  age_of_activity_score numeric(5,2) DEFAULT 0,
  task_deadline_score numeric(5,2) DEFAULT 0,
  category_importance_score numeric(5,2) DEFAULT 0,
  total_priority_score numeric(5,2) DEFAULT 0,
  calculated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- 6. CREATE TASK_EVENTS TABLE (Enhanced for v3)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.task_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks_v3(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'created',
    'updated',
    'completed',
    'reopened',
    'priority_changed',
    'due_date_changed',
    'assigned',
    'unassigned',
    'reassigned',
    'overdue',
    'auto_completed',
    'chain_created',
    'recurrence_created'
  )),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- ============================================================================
-- 7. CREATE TASK_CHAINS TABLE (Task Flow Management)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.task_chains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  chain_config jsonb DEFAULT '{}'::jsonb, -- stores: sequence of task types, conditions, delays
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- 8. INDEXES FOR PERFORMANCE
-- ============================================================================

-- Tasks v3 indexes
CREATE INDEX IF NOT EXISTS idx_tasks_v3_workspace ON public.tasks_v3(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tasks_v3_user ON public.tasks_v3(workspace_id, user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_v3_contact ON public.tasks_v3(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_v3_status ON public.tasks_v3(workspace_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_tasks_v3_priority ON public.tasks_v3(workspace_id, priority, due_at) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_tasks_v3_priority_score ON public.tasks_v3(priority_score DESC) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_tasks_v3_due_at ON public.tasks_v3(due_at) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_tasks_v3_type ON public.tasks_v3(workspace_id, task_type, status);
CREATE INDEX IF NOT EXISTS idx_tasks_v3_auto_generated ON public.tasks_v3(auto_generated, auto_source) WHERE auto_generated = true;
CREATE INDEX IF NOT EXISTS idx_tasks_v3_pipeline_stage ON public.tasks_v3(pipeline_stage_id) WHERE pipeline_stage_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_v3_parent_task ON public.tasks_v3(parent_task_id) WHERE parent_task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_v3_recurrent ON public.tasks_v3(is_recurrent, next_recurrence_at) WHERE is_recurrent = true;
CREATE INDEX IF NOT EXISTS idx_tasks_v3_overdue ON public.tasks_v3(workspace_id, due_at) WHERE status = 'open' AND due_at < now();

-- Task assignments indexes
CREATE INDEX IF NOT EXISTS idx_task_assignments_task ON public.task_assignments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_assignments_user ON public.task_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_task_assignments_primary ON public.task_assignments(task_id, is_primary) WHERE is_primary = true;

-- Task priority indexes
CREATE INDEX IF NOT EXISTS idx_task_priority_task ON public.task_priority(task_id);
CREATE INDEX IF NOT EXISTS idx_task_priority_total_score ON public.task_priority(total_priority_score DESC);

-- Task events indexes
CREATE INDEX IF NOT EXISTS idx_task_events_task ON public.task_events(task_id);
CREATE INDEX IF NOT EXISTS idx_task_events_type ON public.task_events(event_type);
CREATE INDEX IF NOT EXISTS idx_task_events_created ON public.task_events(created_at DESC);

-- Task chains indexes
CREATE INDEX IF NOT EXISTS idx_task_chains_workspace ON public.task_chains(workspace_id);
CREATE INDEX IF NOT EXISTS idx_task_chains_active ON public.task_chains(workspace_id, is_active) WHERE is_active = true;

-- ============================================================================
-- 9. UPDATED_AT TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_tasks_v3_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tasks_v3_updated_at ON public.tasks_v3;
CREATE TRIGGER trg_tasks_v3_updated_at
BEFORE UPDATE ON public.tasks_v3
FOR EACH ROW
EXECUTE FUNCTION public.set_tasks_v3_updated_at();

CREATE OR REPLACE FUNCTION public.set_task_chains_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_chains_updated_at ON public.task_chains;
CREATE TRIGGER trg_task_chains_updated_at
BEFORE UPDATE ON public.task_chains
FOR EACH ROW
EXECUTE FUNCTION public.set_task_chains_updated_at();

-- ============================================================================
-- 10. SYNC DUE_DATE FROM DUE_AT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_tasks_v3_due_date()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.due_at IS NOT NULL THEN
    NEW.due_date := NEW.due_at::date;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_tasks_v3_due_date ON public.tasks_v3;
CREATE TRIGGER trg_sync_tasks_v3_due_date
BEFORE INSERT OR UPDATE OF due_at ON public.tasks_v3
FOR EACH ROW
EXECUTE FUNCTION public.sync_tasks_v3_due_date();

-- ============================================================================
-- 11. TASK EVENT LOGGING FUNCTION (v3 Enhanced)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.log_task_event_v3()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_type text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event_type := 'created';
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'open' AND NEW.status = 'completed' THEN
      v_event_type := 'completed';
    ELSIF OLD.status = 'completed' AND NEW.status = 'open' THEN
      v_event_type := 'reopened';
    ELSIF OLD.priority IS DISTINCT FROM NEW.priority THEN
      v_event_type := 'priority_changed';
    ELSIF OLD.due_at IS DISTINCT FROM NEW.due_at THEN
      v_event_type := 'due_date_changed';
    ELSIF OLD.user_id IS DISTINCT FROM NEW.user_id THEN
      IF NEW.user_id IS NULL THEN
        v_event_type := 'unassigned';
      ELSIF OLD.user_id IS NULL THEN
        v_event_type := 'assigned';
      ELSE
        v_event_type := 'reassigned';
      END IF;
    ELSIF OLD.status = 'open' AND NEW.status = 'overdue' THEN
      v_event_type := 'overdue';
    ELSE
      v_event_type := 'updated';
    END IF;
  END IF;

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
      'old_user_id', OLD.user_id,
      'new_user_id', NEW.user_id,
      'old_status', OLD.status,
      'new_status', NEW.status
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_task_event_v3 ON public.tasks_v3;
CREATE TRIGGER trg_log_task_event_v3
AFTER INSERT OR UPDATE ON public.tasks_v3
FOR EACH ROW
EXECUTE FUNCTION public.log_task_event_v3();

-- ============================================================================
-- 12. PRIORITY SCORE CALCULATION FUNCTION (v3)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_task_priority_score(
  p_task_id uuid
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task RECORD;
  v_contact RECORD;
  v_lead RECORD;
  v_lead_heat_score numeric := 0;
  v_insurance_value_score numeric := 0;
  v_storm_risk_score numeric := 0;
  v_booking_importance_score numeric := 0;
  v_revenue_score numeric := 0;
  v_age_of_activity_score numeric := 0;
  v_task_deadline_score numeric := 0;
  v_category_importance_score numeric := 0;
  v_total_score numeric := 0;
  v_days_overdue int;
  v_hours_until_due numeric;
BEGIN
  -- Get task details
  SELECT * INTO v_task
  FROM public.tasks_v3
  WHERE id = p_task_id;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  -- Get contact/lead info
  IF v_task.contact_id IS NOT NULL THEN
    SELECT * INTO v_contact
    FROM public.contacts
    WHERE id = v_task.contact_id;
  END IF;
  
  IF v_task.lead_id IS NOT NULL THEN
    SELECT * INTO v_lead
    FROM public.leads
    WHERE id = v_task.lead_id;
  END IF;
  
  -- 1. Lead Heat Score (0-20 points)
  IF v_lead IS NOT NULL AND v_lead.score IS NOT NULL THEN
    v_lead_heat_score := LEAST(20, (v_lead.score::numeric / 100) * 20);
  ELSIF v_contact IS NOT NULL THEN
    -- Check lead_status
    IF v_contact.lead_status = 'hot' THEN
      v_lead_heat_score := 20;
    ELSIF v_contact.lead_status = 'warm' THEN
      v_lead_heat_score := 12;
    ELSIF v_contact.lead_status = 'qualified' THEN
      v_lead_heat_score := 15;
    END IF;
  END IF;
  
  -- 2. Insurance Value Score (0-20 points)
  IF v_task.metadata->>'insurance_value' IS NOT NULL THEN
    v_insurance_value_score := LEAST(20, (v_task.metadata->>'insurance_value')::numeric / 10000 * 20);
  END IF;
  
  -- 3. Storm Risk Score (0-15 points)
  IF v_task.metadata->>'storm_risk' IS NOT NULL THEN
    v_storm_risk_score := LEAST(15, (v_task.metadata->>'storm_risk')::numeric * 15);
  END IF;
  
  -- 4. Booking Importance Score (0-15 points)
  IF v_task.task_type IN ('appointment_booked', 'appointment_reminder', 'appointment_missed', 'lead_booking_intent') THEN
    v_booking_importance_score := 15;
  ELSIF v_task.task_type IN ('pipeline_hot_booking') THEN
    v_booking_importance_score := 12;
  END IF;
  
  -- 5. Revenue Score (0-15 points)
  IF v_task.metadata->>'revenue_score' IS NOT NULL THEN
    v_revenue_score := LEAST(15, (v_task.metadata->>'revenue_score')::numeric / 50000 * 15);
  ELSIF v_contact IS NOT NULL AND v_contact.job_value IS NOT NULL THEN
    v_revenue_score := LEAST(15, (v_contact.job_value / 50000) * 15);
  END IF;
  
  -- 6. Age of Activity Score (0-10 points) - older = higher priority
  IF v_task.metadata->>'last_activity_days' IS NOT NULL THEN
    v_age_of_activity_score := LEAST(10, (v_task.metadata->>'last_activity_days')::numeric / 30 * 10);
  END IF;
  
  -- 7. Task Deadline Score (0-15 points) - overdue or due soon = higher priority
  IF v_task.due_at < now() THEN
    v_days_overdue := EXTRACT(EPOCH FROM (now() - v_task.due_at)) / 86400;
    v_task_deadline_score := LEAST(15, 10 + (v_days_overdue * 0.5));
  ELSE
    v_hours_until_due := EXTRACT(EPOCH FROM (v_task.due_at - now())) / 3600;
    IF v_hours_until_due <= 24 THEN
      v_task_deadline_score := 15;
    ELSIF v_hours_until_due <= 48 THEN
      v_task_deadline_score := 10;
    ELSIF v_hours_until_due <= 72 THEN
      v_task_deadline_score := 5;
    END IF;
  END IF;
  
  -- 8. Category Importance Score (0-10 points)
  CASE v_task.task_type
    WHEN 'insurance_claim_filed', 'insurance_adjuster_scheduled', 'insurance_supplement_needed' THEN
      v_category_importance_score := 10;
    WHEN 'storm_hail_event', 'storm_wind_event', 'storm_leak_detected' THEN
      v_category_importance_score := 9;
    WHEN 'appointment_missed', 'appointment_booked' THEN
      v_category_importance_score := 8;
    WHEN 'lead_booking_intent', 'pipeline_hot_booking' THEN
      v_category_importance_score := 7;
    WHEN 'quote_stale', 'quote_viewed' THEN
      v_category_importance_score := 6;
    WHEN 'admin_domain_issue', 'admin_billing_issue' THEN
      v_category_importance_score := 5;
    ELSE
      v_category_importance_score := 3;
  END CASE;
  
  -- Calculate total score (0-100)
  v_total_score := 
    v_lead_heat_score +
    v_insurance_value_score +
    v_storm_risk_score +
    v_booking_importance_score +
    v_revenue_score +
    v_age_of_activity_score +
    v_task_deadline_score +
    v_category_importance_score;
  
  -- Update task priority based on score
  UPDATE public.tasks_v3
  SET 
    priority = CASE
      WHEN v_total_score >= 80 THEN 'critical'
      WHEN v_total_score >= 60 THEN 'high'
      WHEN v_total_score >= 40 THEN 'medium'
      ELSE 'low'
    END,
    priority_score = v_total_score
  WHERE id = p_task_id;
  
  -- Store in priority cache table
  INSERT INTO public.task_priority (
    task_id,
    lead_heat_score,
    insurance_value_score,
    storm_risk_score,
    booking_importance_score,
    revenue_score,
    age_of_activity_score,
    task_deadline_score,
    category_importance_score,
    total_priority_score,
    calculated_at
  )
  VALUES (
    p_task_id,
    v_lead_heat_score,
    v_insurance_value_score,
    v_storm_risk_score,
    v_booking_importance_score,
    v_revenue_score,
    v_age_of_activity_score,
    v_task_deadline_score,
    v_category_importance_score,
    v_total_score,
    now()
  )
  ON CONFLICT (task_id) DO UPDATE SET
    lead_heat_score = EXCLUDED.lead_heat_score,
    insurance_value_score = EXCLUDED.insurance_value_score,
    storm_risk_score = EXCLUDED.storm_risk_score,
    booking_importance_score = EXCLUDED.booking_importance_score,
    revenue_score = EXCLUDED.revenue_score,
    age_of_activity_score = EXCLUDED.age_of_activity_score,
    task_deadline_score = EXCLUDED.task_deadline_score,
    category_importance_score = EXCLUDED.category_importance_score,
    total_priority_score = EXCLUDED.total_priority_score,
    calculated_at = now();
  
  RETURN v_total_score;
END;
$$;

-- ============================================================================
-- 13. AUTO-COMPLETE TASKS FUNCTION (v3)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_complete_tasks_v3()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Complete tasks when homeowner books appointment
  UPDATE public.tasks_v3 t
  SET 
    status = 'completed',
    completed_at = now()
  FROM public.contacts c
  WHERE t.contact_id = c.id
    AND t.status = 'open'
    AND t.task_type IN ('appointment_booked', 'lead_booking_intent', 'pipeline_hot_booking')
    AND c.inspection_at IS NOT NULL
    AND c.inspection_at > t.created_at;
  
  -- Complete tasks when schedule is confirmed
  UPDATE public.tasks_v3 t
  SET 
    status = 'completed',
    completed_at = now()
  FROM public.contacts c
  WHERE t.contact_id = c.id
    AND t.status = 'open'
    AND t.task_type = 'appointment_confirmation'
    AND c.inspection_at IS NOT NULL;
  
  -- Complete tasks when quote is viewed
  UPDATE public.tasks_v3 t
  SET 
    status = 'completed',
    completed_at = now()
  WHERE t.status = 'open'
    AND t.task_type = 'quote_viewed'
    AND EXISTS (
      SELECT 1 FROM public.task_events te
      WHERE te.task_id = t.id
        AND te.event_type = 'updated'
        AND te.metadata->>'quote_viewed' = 'true'
    );
  
  -- Complete tasks when claim is filed
  UPDATE public.tasks_v3 t
  SET 
    status = 'completed',
    completed_at = now()
  WHERE t.status = 'open'
    AND t.task_type = 'insurance_claim_filed'
    AND EXISTS (
      SELECT 1 FROM public.contacts c
      WHERE c.id = t.contact_id
        AND c.metadata->>'insurance_claim_number' IS NOT NULL
    );
  
  -- Complete tasks when reply is sent
  UPDATE public.tasks_v3 t
  SET 
    status = 'completed',
    completed_at = now()
  FROM public.reply_threads rt
  WHERE t.contact_id = rt.contact_id
    AND t.status = 'open'
    AND t.task_type IN ('lead_reply_needed', 'lead_follow_up', 'lead_question_asked')
    AND EXISTS (
      SELECT 1 FROM public.reply_messages rm
      WHERE rm.thread_id = rt.id
        AND rm.direction = 'outbound'
        AND rm.created_at > t.created_at
    );
  
  -- Complete tasks when appointment is completed
  UPDATE public.tasks_v3 t
  SET 
    status = 'completed',
    completed_at = now()
  FROM public.contacts c
  WHERE t.contact_id = c.id
    AND t.status = 'open'
    AND t.task_type IN ('appointment_booked', 'appointment_reminder')
    AND c.inspection_at IS NOT NULL
    AND c.inspection_at < now();
END;
$$;

-- ============================================================================
-- 14. OVERDUE TASK RECOVERY FUNCTION (v3)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_overdue_tasks_v3()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_overdue_task RECORD;
BEGIN
  -- Mark tasks as overdue
  UPDATE public.tasks_v3
  SET status = 'overdue'
  WHERE status = 'open'
    AND due_at < now();
  
  -- Create recovery tasks for critical overdue tasks
  FOR v_overdue_task IN
    SELECT t.*
    FROM public.tasks_v3 t
    WHERE t.status = 'overdue'
      AND t.priority IN ('critical', 'high')
      AND NOT EXISTS (
        SELECT 1 FROM public.tasks_v3 t2
        WHERE t2.parent_task_id = t.id
          AND t2.task_type = 'task_chain_next'
          AND t2.status = 'open'
      )
  LOOP
    -- Create recovery task
    INSERT INTO public.tasks_v3 (
      workspace_id,
      user_id,
      contact_id,
      lead_id,
      task_type,
      priority,
      status,
      title,
      description,
      due_at,
      auto_generated,
      auto_source,
      parent_task_id,
      metadata
    )
    VALUES (
      v_overdue_task.workspace_id,
      v_overdue_task.user_id,
      v_overdue_task.contact_id,
      v_overdue_task.lead_id,
      'task_chain_next',
      CASE 
        WHEN v_overdue_task.priority = 'critical' THEN 'critical'
        ELSE 'high'
      END,
      'open',
      format('URGENT: Overdue task recovery - %s', v_overdue_task.title),
      format('Original task was overdue. This is a recovery action. Original due: %s', v_overdue_task.due_at),
      now(),
      true,
      'overdue_recovery',
      v_overdue_task.id,
      jsonb_build_object(
        'original_task_id', v_overdue_task.id,
        'days_overdue', EXTRACT(EPOCH FROM (now() - v_overdue_task.due_at)) / 86400,
        'recovery_type', 'overdue'
      )
    );
  END LOOP;
END;
$$;

-- ============================================================================
-- 15. TASK CHAINING FUNCTION (v3)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_task_chain_next(
  p_completed_task_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_completed_task RECORD;
  v_next_task_id uuid;
  v_next_task_type task_type_v3;
  v_next_task_title text;
  v_next_task_due_at timestamptz;
BEGIN
  -- Get completed task details
  SELECT * INTO v_completed_task
  FROM public.tasks_v3
  WHERE id = p_completed_task_id
    AND status = 'completed';
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Determine next task based on completed task type
  CASE v_completed_task.task_type
    WHEN 'lead_reply_needed', 'lead_follow_up' THEN
      v_next_task_type := 'lead_booking_intent';
      v_next_task_title := format('Offer booking times to %s', 
        COALESCE((SELECT first_name || ' ' || last_name FROM public.contacts WHERE id = v_completed_task.contact_id), 'homeowner'));
      v_next_task_due_at := now() + interval '1 day';
    
    WHEN 'lead_question_asked' THEN
      v_next_task_type := 'lead_follow_up';
      v_next_task_title := format('Follow up on answered question for %s',
        COALESCE((SELECT first_name || ' ' || last_name FROM public.contacts WHERE id = v_completed_task.contact_id), 'homeowner'));
      v_next_task_due_at := now() + interval '2 days';
    
    WHEN 'appointment_booked' THEN
      v_next_task_type := 'appointment_reminder';
      v_next_task_title := format('Send appointment reminder for %s',
        COALESCE((SELECT first_name || ' ' || last_name FROM public.contacts WHERE id = v_completed_task.contact_id), 'homeowner'));
      v_next_task_due_at := (SELECT inspection_at - interval '1 hour' FROM public.contacts WHERE id = v_completed_task.contact_id);
    
    WHEN 'insurance_claim_filed' THEN
      v_next_task_type := 'insurance_adjuster_scheduled';
      v_next_task_title := format('Prepare for adjuster meeting with %s',
        COALESCE((SELECT first_name || ' ' || last_name FROM public.contacts WHERE id = v_completed_task.contact_id), 'homeowner'));
      v_next_task_due_at := now() + interval '3 days';
    
    WHEN 'pipeline_warm_followup' THEN
      v_next_task_type := 'pipeline_hot_booking';
      v_next_task_title := format('Convert warm lead to booking: %s',
        COALESCE((SELECT first_name || ' ' || last_name FROM public.contacts WHERE id = v_completed_task.contact_id), 'homeowner'));
      v_next_task_due_at := now() + interval '2 days';
    
    ELSE
      -- No chain for this task type
      RETURN NULL;
  END CASE;
  
  -- Create next task
  INSERT INTO public.tasks_v3 (
    workspace_id,
    user_id,
    contact_id,
    lead_id,
    task_type,
    priority,
    status,
    title,
    description,
    due_at,
    auto_generated,
    auto_source,
    parent_task_id,
    chain_position,
    metadata
  )
  VALUES (
    v_completed_task.workspace_id,
    v_completed_task.user_id,
    v_completed_task.contact_id,
    v_completed_task.lead_id,
    v_next_task_type,
    CASE 
      WHEN v_completed_task.priority = 'critical' THEN 'high'
      ELSE v_completed_task.priority
    END,
    'open',
    v_next_task_title,
    format('Created automatically after completing: %s', v_completed_task.title),
    v_next_task_due_at,
    true,
    'task_chain',
    v_completed_task.id,
    v_completed_task.chain_position + 1,
    jsonb_build_object('parent_task_id', v_completed_task.id)
  )
  RETURNING id INTO v_next_task_id;
  
  -- Update completed task with next_task_id
  UPDATE public.tasks_v3
  SET next_task_id = v_next_task_id
  WHERE id = p_completed_task_id;
  
  RETURN v_next_task_id;
END;
$$;

-- Trigger to auto-create chain task when task is completed
CREATE OR REPLACE FUNCTION public.trigger_task_chain_on_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    PERFORM public.create_task_chain_next(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_chain_on_complete ON public.tasks_v3;
CREATE TRIGGER trg_task_chain_on_complete
AFTER UPDATE OF status ON public.tasks_v3
FOR EACH ROW
WHEN (NEW.status = 'completed' AND OLD.status != 'completed')
EXECUTE FUNCTION public.trigger_task_chain_on_complete();

-- ============================================================================
-- 16. RECURRENT TASKS FUNCTION (v3)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.process_recurrent_tasks_v3()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_recurrent_task RECORD;
  v_next_due_at timestamptz;
BEGIN
  FOR v_recurrent_task IN
    SELECT *
    FROM public.tasks_v3
    WHERE is_recurrent = true
      AND status = 'completed'
      AND next_recurrence_at IS NOT NULL
      AND next_recurrence_at <= now()
  LOOP
    -- Calculate next recurrence
    CASE v_recurrent_task.recurrence_pattern
      WHEN 'daily' THEN
        v_next_due_at := now() + interval '1 day';
      WHEN 'weekly' THEN
        v_next_due_at := now() + interval '1 week';
      WHEN 'monthly' THEN
        v_next_due_at := now() + interval '1 month';
      ELSE
        -- Custom interval from config
        v_next_due_at := now() + ((v_recurrent_task.recurrence_config->>'interval_days')::int || ' days')::interval;
    END CASE;
    
    -- Create next occurrence
    INSERT INTO public.tasks_v3 (
      workspace_id,
      user_id,
      contact_id,
      lead_id,
      task_type,
      priority,
      status,
      title,
      description,
      due_at,
      auto_generated,
      auto_source,
      is_recurrent,
      recurrence_pattern,
      recurrence_config,
      next_recurrence_at,
      metadata
    )
    VALUES (
      v_recurrent_task.workspace_id,
      v_recurrent_task.user_id,
      v_recurrent_task.contact_id,
      v_recurrent_task.lead_id,
      v_recurrent_task.task_type,
      v_recurrent_task.priority,
      'open',
      v_recurrent_task.title,
      v_recurrent_task.description,
      v_next_due_at,
      true,
      'recurrent',
      true,
      v_recurrent_task.recurrence_pattern,
      v_recurrent_task.recurrence_config,
      v_next_due_at + ((v_recurrent_task.recurrence_config->>'interval_days')::int || ' days')::interval,
      v_recurrent_task.metadata
    );
    
    -- Update next_recurrence_at for original task
    UPDATE public.tasks_v3
    SET next_recurrence_at = v_next_due_at + ((v_recurrent_task.recurrence_config->>'interval_days')::int || ' days')::interval
    WHERE id = v_recurrent_task.id;
  END LOOP;
END;
$$;

-- ============================================================================
-- 17. DAILY WORKFLOW FUNCTION (v3)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_daily_workflow_tasks(
  p_workspace_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  priority_level task_priority_level,
  task_count bigint,
  tasks jsonb
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.priority,
    COUNT(*)::bigint as task_count,
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'title', t.title,
        'description', t.description,
        'due_at', t.due_at,
        'contact_id', t.contact_id,
        'contact_name', c.first_name || ' ' || c.last_name,
        'task_type', t.task_type,
        'priority_score', t.priority_score
      )
      ORDER BY t.priority_score DESC NULLS LAST, t.due_at ASC
    ) as tasks
  FROM public.tasks_v3 t
  LEFT JOIN public.contacts c ON c.id = t.contact_id
  WHERE t.workspace_id = p_workspace_id
    AND t.status = 'open'
    AND t.due_at::date <= CURRENT_DATE + 1
    AND (p_user_id IS NULL OR t.user_id = p_user_id)
  GROUP BY t.priority
  ORDER BY 
    CASE t.priority
      WHEN 'critical' THEN 1
      WHEN 'high' THEN 2
      WHEN 'medium' THEN 3
      WHEN 'low' THEN 4
    END;
END;
$$;

-- ============================================================================
-- 18. ROW LEVEL SECURITY POLICIES
-- ============================================================================

ALTER TABLE public.tasks_v3 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_priority ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_chains ENABLE ROW LEVEL SECURITY;

-- Tasks v3: Users can view tasks in their workspace
CREATE POLICY "tasks_v3_select_workspace"
  ON public.tasks_v3
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Tasks v3: Users can insert tasks in their workspace
CREATE POLICY "tasks_v3_insert_workspace"
  ON public.tasks_v3
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Tasks v3: Users can update tasks in their workspace
CREATE POLICY "tasks_v3_update_workspace"
  ON public.tasks_v3
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

-- Tasks v3: Users can delete tasks in their workspace
CREATE POLICY "tasks_v3_delete_workspace"
  ON public.tasks_v3
  FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Task assignments: Same policies
CREATE POLICY "task_assignments_select_workspace"
  ON public.task_assignments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks_v3 t
      WHERE t.id = task_assignments.task_id
        AND t.workspace_id IN (
          SELECT workspace_id FROM public.workspace_members
          WHERE user_id = auth.uid()
        )
    )
  );

CREATE POLICY "task_assignments_insert_workspace"
  ON public.task_assignments
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tasks_v3 t
      WHERE t.id = task_assignments.task_id
        AND t.workspace_id IN (
          SELECT workspace_id FROM public.workspace_members
          WHERE user_id = auth.uid()
        )
    )
  );

-- Task priority: Same policies
CREATE POLICY "task_priority_select_workspace"
  ON public.task_priority
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks_v3 t
      WHERE t.id = task_priority.task_id
        AND t.workspace_id IN (
          SELECT workspace_id FROM public.workspace_members
          WHERE user_id = auth.uid()
        )
    )
  );

-- Task events: Same policies
CREATE POLICY "task_events_select_workspace"
  ON public.task_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks_v3 t
      WHERE t.id = task_events.task_id
        AND t.workspace_id IN (
          SELECT workspace_id FROM public.workspace_members
          WHERE user_id = auth.uid()
        )
    )
  );

-- Task chains: Same policies
CREATE POLICY "task_chains_select_workspace"
  ON public.task_chains
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "task_chains_insert_workspace"
  ON public.task_chains
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- 19. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.tasks_v3 IS 'SmartSend Task System v3 - Full Roofing Task Engine with 8 task categories, priority scoring, task chaining, and recurrent tasks';
COMMENT ON COLUMN public.tasks_v3.task_type IS 'Task type from 8 categories: Lead Follow-Up, Appointment, Insurance, Storm, Pipeline, Quote, Task Chaining, Office/Admin';
COMMENT ON COLUMN public.tasks_v3.priority IS 'Priority level: critical (🔥), high (🔥), medium (🟡), low (⚪)';
COMMENT ON COLUMN public.tasks_v3.priority_score IS 'Calculated priority score (0-100) based on lead heat, insurance value, storm risk, booking importance, revenue, age, deadline, category';
COMMENT ON COLUMN public.tasks_v3.parent_task_id IS 'Parent task ID for task chaining - when this task completes, it may create a next task';
COMMENT ON COLUMN public.tasks_v3.is_recurrent IS 'Whether this task repeats on a schedule';
COMMENT ON COLUMN public.tasks_v3.recurrence_pattern IS 'Recurrence pattern: daily, weekly, monthly, custom';
COMMENT ON TABLE public.task_assignments IS 'Team task assignments - supports multiple assignees per task';
COMMENT ON TABLE public.task_priority IS 'Priority calculation cache - stores detailed scoring breakdown';
COMMENT ON TABLE public.task_chains IS 'Task chain templates - defines sequences of tasks';
COMMENT ON FUNCTION public.calculate_task_priority_score IS 'Calculates priority score (0-100) based on 8 factors: lead heat, insurance value, storm risk, booking importance, revenue, age of activity, deadline, category importance';
COMMENT ON FUNCTION public.auto_complete_tasks_v3 IS 'Automatically completes tasks when conditions are met (booking, quote viewed, claim filed, reply sent, appointment completed)';
COMMENT ON FUNCTION public.check_overdue_tasks_v3 IS 'Marks overdue tasks and creates recovery tasks for critical/high priority overdue items';
COMMENT ON FUNCTION public.create_task_chain_next IS 'Creates next task in chain when a task is completed';
COMMENT ON FUNCTION public.process_recurrent_tasks_v3 IS 'Processes recurrent tasks and creates next occurrence';
COMMENT ON FUNCTION public.get_daily_workflow_tasks IS 'Returns daily workflow tasks grouped by priority level for dashboard';





















































