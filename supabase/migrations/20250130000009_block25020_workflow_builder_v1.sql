-- =========================================================
-- Block 25020 — SmartSend Roofing Workflow Builder v1
-- (If-This-Then-That Logic • Trigger→Action Automation • Lead Routing • Job Automation • Roofing-Specific Workflow Library)
-- =========================================================
-- 
-- THE AUTOMATION ENGINE FOR ROOFING COMPANIES — ZERO FLUFF.
-- This is where SmartSend becomes self-running.
--
-- Workflow Builder v1 is the IF THIS HAPPENS → DO THIS engine.
-- This is how SmartSend becomes a true operations automation system for roofing companies.

-- ============================================================================
-- PART 1 — CREATE workflows TABLE (Enhanced Automation System)
-- ============================================================================
-- Stores workflow rules: Trigger → Condition → Action
-- Extends the existing automations table with more roofing-specific features

CREATE TABLE IF NOT EXISTS public.workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Workflow metadata
  name text NOT NULL, -- "Deposit Protection Workflow"
  description text,
  is_active boolean DEFAULT true,
  is_template boolean DEFAULT false, -- true if this is a template workflow
  
  -- Trigger configuration
  trigger_type text NOT NULL CHECK (trigger_type IN (
    -- Lead triggers
    'new_lead_created',
    'lead_status_changed',
    'lead_replied',
    'lead_unopened_48h',
    
    -- Proposal/Quote triggers
    'quote_sent',
    'proposal_sent',
    'proposal_viewed',
    'proposal_approved',
    'proposal_declined',
    
    -- Contract triggers
    'contract_signed',
    'contract_sent',
    
    -- Payment triggers
    'deposit_paid',
    'deposit_overdue',
    'payment_received',
    'payment_overdue',
    'invoice_created',
    'invoice_overdue',
    
    -- Job triggers
    'job_created',
    'job_approved',
    'job_status_changed',
    'job_moved_to_scheduled',
    'job_moved_to_in_progress',
    'job_moved_to_installed',
    'job_moved_to_completed',
    
    -- Material triggers
    'material_delivery_confirmed',
    'material_delivery_delayed',
    
    -- Crew triggers
    'crew_checked_in',
    'crew_checked_out',
    'crew_finished_job',
    
    -- Insurance triggers
    'supplement_submitted',
    'supplement_approved',
    'supplement_pending_3d',
    
    -- Communication triggers
    'homeowner_replied',
    'homeowner_no_reply',
    'homeowner_unhappy',
    
    -- Weather triggers
    'weather_alert_triggered',
    'rain_forecasted',
    
    -- Schedule triggers
    'install_scheduled_tomorrow',
    'inspection_scheduled',
    
    -- AI/NLP triggers
    'nlp_detects_urgency',
    'nlp_detects_anger',
    'nlp_detects_uncertainty',
    
    -- Behavior triggers
    'multiple_opens',
    'clicked_quote',
    'visited_scheduling_link'
  )),
  
  -- Condition configuration (JSONB for flexibility)
  conditions jsonb DEFAULT '[]'::jsonb,
  -- Example structure:
  -- [
  --   { "field": "homeowner.zip", "operator": "equals", "value": "12345" },
  --   { "field": "job.value", "operator": "greater_than", "value": 10000 },
  --   { "field": "insurance.carrier", "operator": "equals", "State Farm" },
  --   { "field": "lead.source", "operator": "equals", "storm_campaign" },
  --   { "field": "crew.score", "operator": "less_than", "value": 70 },
  --   { "field": "job.health", "operator": "less_than", "value": 60 },
  --   { "field": "material.type", "operator": "equals", "shingles_only" },
  --   { "field": "weekday", "operator": "in", "value": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] },
  --   { "field": "payment.status", "operator": "equals", "unpaid" },
  --   { "field": "supplement.status", "operator": "equals", "pending" }
  -- ]
  
  -- Actions configuration (JSONB array)
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Example structure:
  -- [
  --   { "type": "send_message", "template": "deposit_reminder", "channel": "email" },
  --   { "type": "assign_owner", "user_id": "..." },
  --   { "type": "assign_sales_rep", "user_id": "..." },
  --   { "type": "schedule_inspection", "delay_days": 0 },
  --   { "type": "notify_crew", "message": "..." },
  --   { "type": "create_task", "title": "...", "assignee": "..." },
  --   { "type": "change_job_stage", "stage": "approved" },
  --   { "type": "trigger_sequence", "sequence_id": "..." },
  --   { "type": "block_scheduling", "reason": "..." },
  --   { "type": "escalate_to_owner", "priority": "high" },
  --   { "type": "update_health_score", "score": 75 },
  --   { "type": "log_timeline_event", "event_type": "...", "message": "..." }
  -- ]
  
  -- Execution settings
  execution_delay_seconds integer DEFAULT 0, -- Delay before executing actions
  max_executions_per_day integer DEFAULT NULL, -- Rate limiting
  
  -- Metadata
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflows_workspace ON public.workflows(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workflows_trigger ON public.workflows(trigger_type);
CREATE INDEX IF NOT EXISTS idx_workflows_active ON public.workflows(workspace_id, is_active, trigger_type) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_workflows_template ON public.workflows(is_template) WHERE is_template = true;

-- ============================================================================
-- PART 2 — CREATE workflow_templates TABLE
-- ============================================================================
-- Pre-built workflow templates that roofers can install with one click

CREATE TABLE IF NOT EXISTS public.workflow_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Template metadata
  name text NOT NULL, -- "Deposit Protection"
  description text NOT NULL,
  category text CHECK (category IN (
    'deposits',
    'insurance',
    'materials',
    'leads',
    'crew',
    'reviews',
    'weather',
    'payments',
    'scheduling',
    'communication'
  )),
  
  -- Template configuration (same structure as workflows)
  trigger_type text NOT NULL,
  conditions jsonb DEFAULT '[]'::jsonb,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  execution_delay_seconds integer DEFAULT 0,
  
  -- Template metadata
  is_featured boolean DEFAULT false,
  install_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_templates_category ON public.workflow_templates(category);
CREATE INDEX IF NOT EXISTS idx_workflow_templates_featured ON public.workflow_templates(is_featured) WHERE is_featured = true;

-- ============================================================================
-- PART 3 — CREATE workflow_executions TABLE
-- ============================================================================
-- Execution log for workflows (tracks when workflows fire and their results)

CREATE TABLE IF NOT EXISTS public.workflow_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  workflow_id uuid NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  
  -- Trigger context
  trigger_type text NOT NULL,
  trigger_resource_type text, -- 'lead', 'job', 'proposal', 'payment', etc.
  trigger_resource_id uuid,
  
  -- Execution status
  status text CHECK (status IN ('pending', 'running', 'success', 'error', 'skipped')) DEFAULT 'pending',
  error_message text,
  
  -- Condition evaluation
  conditions_passed boolean DEFAULT false,
  condition_details jsonb DEFAULT '{}'::jsonb,
  
  -- Action execution
  actions_executed jsonb DEFAULT '[]'::jsonb, -- Array of action results
  actions_failed jsonb DEFAULT '[]'::jsonb,
  
  -- Timing
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_executions_workspace ON public.workflow_executions(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow ON public.workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_status ON public.workflow_executions(status);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_resource ON public.workflow_executions(trigger_resource_type, trigger_resource_id);

-- ============================================================================
-- PART 4 — CREATE workflow_events TABLE (Event Bus)
-- ============================================================================
-- Event bus for workflow triggers (similar to automation_events but workflow-specific)

CREATE TABLE IF NOT EXISTS public.workflow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  resource_type text NOT NULL, -- 'lead', 'job', 'proposal', 'payment', etc.
  resource_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_workflow_events_workspace ON public.workflow_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workflow_events_type ON public.workflow_events(event_type);
CREATE INDEX IF NOT EXISTS idx_workflow_events_resource ON public.workflow_events(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_workflow_events_unprocessed ON public.workflow_events(workspace_id, created_at ASC) WHERE processed_at IS NULL;

-- ============================================================================
-- PART 5 — ROW LEVEL SECURITY POLICIES
-- ============================================================================

ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_events ENABLE ROW LEVEL SECURITY;

-- Workflows: Users can view/manage workflows in their workspace
CREATE POLICY "workflows_select" ON public.workflows
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "workflows_insert" ON public.workflows
  FOR INSERT WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "workflows_update" ON public.workflows
  FOR UPDATE USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "workflows_delete" ON public.workflows
  FOR DELETE USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Workflow templates: Public read access
CREATE POLICY "workflow_templates_select" ON public.workflow_templates
  FOR SELECT USING (true);

-- Workflow executions: Users can view executions for their workspace
CREATE POLICY "workflow_executions_select" ON public.workflow_executions
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Workflow events: System can insert events (service role)
CREATE POLICY "workflow_events_insert" ON public.workflow_events
  FOR INSERT WITH CHECK (true);

-- ============================================================================
-- PART 6 — UPDATE TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_workflows_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_workflows_updated_at
  BEFORE UPDATE ON public.workflows
  FOR EACH ROW
  EXECUTE FUNCTION public.update_workflows_updated_at();

-- ============================================================================
-- PART 7 — HELPER FUNCTION: Fire Workflow Event
-- ============================================================================
-- Makes it easy to fire workflow events from triggers or application code

CREATE OR REPLACE FUNCTION public.fire_workflow_event(
  p_workspace_id uuid,
  p_event_type text,
  p_resource_type text,
  p_resource_id uuid,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid AS $$
DECLARE
  v_event_id uuid;
BEGIN
  INSERT INTO public.workflow_events (workspace_id, event_type, resource_type, resource_id, payload)
  VALUES (p_workspace_id, p_event_type, p_resource_type, p_resource_id, p_payload)
  RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 8 — CONDITION EVALUATOR FUNCTION
-- ============================================================================
-- Evaluates workflow conditions against event payload

CREATE OR REPLACE FUNCTION public.evaluate_workflow_conditions(
  p_conditions jsonb,
  p_payload jsonb
)
RETURNS boolean AS $$
DECLARE
  v_condition jsonb;
  v_field text;
  v_operator text;
  v_value jsonb;
  v_field_value jsonb;
  v_result boolean;
BEGIN
  -- If no conditions, return true
  IF p_conditions IS NULL OR jsonb_array_length(p_conditions) = 0 THEN
    RETURN true;
  END IF;
  
  -- Evaluate each condition (AND logic - all must pass)
  FOR v_condition IN SELECT * FROM jsonb_array_elements(p_conditions)
  LOOP
    v_field := v_condition->>'field';
    v_operator := v_condition->>'operator';
    v_value := v_condition->'value';
    
    -- Extract field value from payload (supports nested paths like "homeowner.zip")
    v_field_value := p_payload;
    FOR v_field IN SELECT * FROM string_to_array(v_field, '.')
    LOOP
      v_field_value := v_field_value->v_field;
    END LOOP;
    
    -- Evaluate based on operator
    CASE v_operator
      WHEN 'equals' THEN
        v_result := v_field_value = v_value;
      WHEN 'not_equals' THEN
        v_result := v_field_value <> v_value;
      WHEN 'greater_than' THEN
        v_result := (v_field_value::numeric) > (v_value::numeric);
      WHEN 'less_than' THEN
        v_result := (v_field_value::numeric) < (v_value::numeric);
      WHEN 'greater_than_or_equal' THEN
        v_result := (v_field_value::numeric) >= (v_value::numeric);
      WHEN 'less_than_or_equal' THEN
        v_result := (v_field_value::numeric) <= (v_value::numeric);
      WHEN 'in' THEN
        v_result := v_field_value = ANY(SELECT jsonb_array_elements_text(v_value));
      WHEN 'not_in' THEN
        v_result := NOT (v_field_value = ANY(SELECT jsonb_array_elements_text(v_value)));
      WHEN 'contains' THEN
        v_result := v_field_value::text LIKE '%' || (v_value::text) || '%';
      WHEN 'is_null' THEN
        v_result := v_field_value IS NULL;
      WHEN 'is_not_null' THEN
        v_result := v_field_value IS NOT NULL;
      ELSE
        v_result := false;
    END CASE;
    
    -- If any condition fails, return false
    IF NOT v_result THEN
      RETURN false;
    END IF;
  END LOOP;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- PART 9 — DATABASE TRIGGERS TO FIRE WORKFLOW EVENTS
-- ============================================================================
-- These triggers automatically fire workflow events when key events happen

-- Trigger: New Lead Created
CREATE OR REPLACE FUNCTION public.trigger_new_lead_created_workflow()
RETURNS TRIGGER AS $$
DECLARE
  v_workspace_id uuid;
BEGIN
  -- Get workspace_id from lead
  SELECT workspace_id INTO v_workspace_id
  FROM public.leads
  WHERE id = NEW.id;
  
  IF v_workspace_id IS NOT NULL THEN
    PERFORM public.fire_workflow_event(
      v_workspace_id,
      'new_lead_created',
      'lead',
      NEW.id,
      jsonb_build_object(
        'lead', jsonb_build_object(
          'id', NEW.id,
          'email', NEW.email,
          'first_name', NEW.first_name,
          'last_name', NEW.last_name,
          'city', NEW.city,
          'state', NEW.state,
          'zip', NEW.zip,
          'phone', NEW.phone,
          'source', NEW.source,
          'status', NEW.status,
          'created_at', NEW.created_at
        )
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'leads') THEN
    DROP TRIGGER IF EXISTS trg_new_lead_created_workflow ON public.leads;
    CREATE TRIGGER trg_new_lead_created_workflow
      AFTER INSERT ON public.leads
      FOR EACH ROW
      EXECUTE FUNCTION public.trigger_new_lead_created_workflow();
  END IF;
END $$;

-- Trigger: Lead Status Changed
CREATE OR REPLACE FUNCTION public.trigger_lead_status_changed_workflow()
RETURNS TRIGGER AS $$
DECLARE
  v_workspace_id uuid;
BEGIN
  -- Only fire if status actually changed
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;
  
  -- Get workspace_id from lead
  SELECT workspace_id INTO v_workspace_id
  FROM public.leads
  WHERE id = NEW.id;
  
  IF v_workspace_id IS NOT NULL THEN
    PERFORM public.fire_workflow_event(
      v_workspace_id,
      'lead_status_changed',
      'lead',
      NEW.id,
      jsonb_build_object(
        'lead', jsonb_build_object(
          'id', NEW.id,
          'status', NEW.status,
          'old_status', OLD.status
        )
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'leads') THEN
    DROP TRIGGER IF EXISTS trg_lead_status_changed_workflow ON public.leads;
    CREATE TRIGGER trg_lead_status_changed_workflow
      AFTER UPDATE OF status ON public.leads
      FOR EACH ROW
      EXECUTE FUNCTION public.trigger_lead_status_changed_workflow();
  END IF;
END $$;

-- Trigger: Quote Sent
CREATE OR REPLACE FUNCTION public.trigger_quote_sent_workflow()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'sent' AND (OLD.status IS NULL OR OLD.status <> 'sent') THEN
    PERFORM public.fire_workflow_event(
      NEW.workspace_id,
      'quote_sent',
      'proposal',
      NEW.id,
      jsonb_build_object(
        'proposal', jsonb_build_object(
          'id', NEW.id,
          'lead_id', NEW.lead_id,
          'amount', NEW.amount,
          'status', NEW.status,
          'sent_at', NEW.sent_at
        )
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'proposals') THEN
    DROP TRIGGER IF EXISTS trg_quote_sent_workflow ON public.proposals;
    CREATE TRIGGER trg_quote_sent_workflow
      AFTER INSERT OR UPDATE OF status ON public.proposals
      FOR EACH ROW
      EXECUTE FUNCTION public.trigger_quote_sent_workflow();
  END IF;
END $$;

-- Trigger: Proposal Approved
CREATE OR REPLACE FUNCTION public.trigger_proposal_approved_workflow()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status <> 'approved') THEN
    PERFORM public.fire_workflow_event(
      NEW.workspace_id,
      'proposal_approved',
      'proposal',
      NEW.id,
      jsonb_build_object(
        'proposal', jsonb_build_object(
          'id', NEW.id,
          'lead_id', NEW.lead_id,
          'amount', NEW.amount,
          'status', NEW.status
        )
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'proposals') THEN
    DROP TRIGGER IF EXISTS trg_proposal_approved_workflow ON public.proposals;
    CREATE TRIGGER trg_proposal_approved_workflow
      AFTER UPDATE OF status ON public.proposals
      FOR EACH ROW
      EXECUTE FUNCTION public.trigger_proposal_approved_workflow();
  END IF;
END $$;

-- Trigger: Job Status Changed (to specific stages)
CREATE OR REPLACE FUNCTION public.trigger_job_status_changed_workflow()
RETURNS TRIGGER AS $$
BEGIN
  -- Only fire if status actually changed
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;
  
  -- Fire generic status changed event
  PERFORM public.fire_workflow_event(
    NEW.workspace_id,
    'job_status_changed',
    'job',
    NEW.id,
    jsonb_build_object(
      'job', jsonb_build_object(
        'id', NEW.id,
        'status', NEW.status,
        'old_status', OLD.status,
        'job_value', NEW.job_value,
        'deposit_paid', NEW.deposit_paid
      )
    )
  );
  
  -- Fire specific stage events
  IF NEW.status = 'scheduled' THEN
    PERFORM public.fire_workflow_event(
      NEW.workspace_id,
      'job_moved_to_scheduled',
      'job',
      NEW.id,
      jsonb_build_object('job', jsonb_build_object('id', NEW.id, 'status', NEW.status))
    );
  END IF;
  
  IF NEW.status = 'in_progress' THEN
    PERFORM public.fire_workflow_event(
      NEW.workspace_id,
      'job_moved_to_in_progress',
      'job',
      NEW.id,
      jsonb_build_object('job', jsonb_build_object('id', NEW.id, 'status', NEW.status))
    );
  END IF;
  
  IF NEW.status = 'completed' THEN
    PERFORM public.fire_workflow_event(
      NEW.workspace_id,
      'job_moved_to_installed',
      'job',
      NEW.id,
      jsonb_build_object('job', jsonb_build_object('id', NEW.id, 'status', NEW.status))
    );
    
    PERFORM public.fire_workflow_event(
      NEW.workspace_id,
      'job_moved_to_completed',
      'job',
      NEW.id,
      jsonb_build_object('job', jsonb_build_object('id', NEW.id, 'status', NEW.status))
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'roofing_jobs') THEN
    DROP TRIGGER IF EXISTS trg_job_status_changed_workflow ON public.roofing_jobs;
    CREATE TRIGGER trg_job_status_changed_workflow
      AFTER UPDATE OF status ON public.roofing_jobs
      FOR EACH ROW
      EXECUTE FUNCTION public.trigger_job_status_changed_workflow();
  END IF;
END $$;

-- Trigger: Job Created
CREATE OR REPLACE FUNCTION public.trigger_job_created_workflow()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.fire_workflow_event(
    NEW.workspace_id,
    'job_created',
    'job',
    NEW.id,
    jsonb_build_object(
      'job', jsonb_build_object(
        'id', NEW.id,
        'lead_id', NEW.lead_id,
        'proposal_id', NEW.proposal_id,
        'status', NEW.status,
        'job_value', NEW.job_value,
        'deposit_required', NEW.deposit_required
      )
    )
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'roofing_jobs') THEN
    DROP TRIGGER IF EXISTS trg_job_created_workflow ON public.roofing_jobs;
    CREATE TRIGGER trg_job_created_workflow
      AFTER INSERT ON public.roofing_jobs
      FOR EACH ROW
      EXECUTE FUNCTION public.trigger_job_created_workflow();
  END IF;
END $$;

-- Trigger: Payment Received
CREATE OR REPLACE FUNCTION public.trigger_payment_received_workflow()
RETURNS TRIGGER AS $$
DECLARE
  v_workspace_id uuid;
BEGIN
  -- Only fire if payment was just received (status changed to 'received')
  IF NEW.status = 'received' AND (OLD.status IS NULL OR OLD.status <> 'received') THEN
    -- Get workspace_id from job
    SELECT workspace_id INTO v_workspace_id
    FROM public.roofing_jobs
    WHERE id = NEW.job_id;
    
    IF v_workspace_id IS NOT NULL THEN
      PERFORM public.fire_workflow_event(
        v_workspace_id,
        'payment_received',
        'payment',
        NEW.id,
        jsonb_build_object(
          'payment', jsonb_build_object(
            'id', NEW.id,
            'job_id', NEW.job_id,
            'amount', NEW.amount,
            'payment_type', NEW.payment_type,
            'status', NEW.status
          )
        )
      );
      
      -- If it's a deposit, fire deposit_paid event
      IF NEW.payment_type = 'deposit' THEN
        PERFORM public.fire_workflow_event(
          v_workspace_id,
          'deposit_paid',
          'payment',
          NEW.id,
          jsonb_build_object(
            'payment', jsonb_build_object(
              'id', NEW.id,
              'job_id', NEW.job_id,
              'amount', NEW.amount
            )
          )
        );
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'job_payments') THEN
    DROP TRIGGER IF EXISTS trg_payment_received_workflow ON public.job_payments;
    CREATE TRIGGER trg_payment_received_workflow
      AFTER INSERT OR UPDATE OF status ON public.job_payments
      FOR EACH ROW
      EXECUTE FUNCTION public.trigger_payment_received_workflow();
  END IF;
END $$;

-- Trigger: Invoice Created
CREATE OR REPLACE FUNCTION public.trigger_invoice_created_workflow()
RETURNS TRIGGER AS $$
DECLARE
  v_workspace_id uuid;
BEGIN
  -- Get workspace_id from job
  SELECT workspace_id INTO v_workspace_id
  FROM public.roofing_jobs
  WHERE id = NEW.job_id;
  
  IF v_workspace_id IS NOT NULL THEN
    PERFORM public.fire_workflow_event(
      v_workspace_id,
      'invoice_created',
      'invoice',
      NEW.id,
      jsonb_build_object(
        'invoice', jsonb_build_object(
          'id', NEW.id,
          'job_id', NEW.job_id,
          'type', NEW.type,
          'amount', NEW.amount,
          'status', NEW.status,
          'due_date', NEW.due_date
        )
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'job_invoices') THEN
    DROP TRIGGER IF EXISTS trg_invoice_created_workflow ON public.job_invoices;
    CREATE TRIGGER trg_invoice_created_workflow
      AFTER INSERT ON public.job_invoices
      FOR EACH ROW
      EXECUTE FUNCTION public.trigger_invoice_created_workflow();
  END IF;
END $$;

-- ============================================================================
-- PART 10 — SEED PRE-BUILT WORKFLOW TEMPLATES
-- ============================================================================
-- 10 roofing-specific workflow templates ready to install

INSERT INTO public.workflow_templates (name, description, category, trigger_type, conditions, actions, execution_delay_seconds, is_featured) VALUES

-- Workflow 1 — Deposit Protection
('Deposit Protection', 'Automatically send deposit invoice and reminders when a job is approved but deposit is unpaid. Blocks scheduling until deposit is collected.', 'deposits', 'job_approved',
'[{"field": "job.deposit_paid", "operator": "equals", "value": 0}]'::jsonb,
'[
  {"type": "send_message", "template": "deposit_reminder", "channel": "email"},
  {"type": "create_task", "title": "Collect deposit for job", "priority": "high"},
  {"type": "block_scheduling", "reason": "Deposit not collected"},
  {"type": "notify_owner", "message": "Job approved but deposit not collected"}
]'::jsonb,
0, true),

-- Workflow 2 — Insurance Supplement Follow-Up
('Insurance Supplement Follow-Up', 'Automatically follow up with adjuster 3 days after submitting a supplement if no update received.', 'insurance', 'supplement_submitted',
'[]'::jsonb,
'[
  {"type": "create_task", "title": "Follow up on supplement", "delay_days": 3},
  {"type": "send_message", "template": "supplement_followup", "channel": "email", "delay_days": 3},
  {"type": "notify_insurance_coordinator", "message": "Supplement submitted - follow up in 3 days"}
]'::jsonb,
259200, true), -- 3 days delay

-- Workflow 3 — Material Delivery Verification
('Material Delivery Verification', 'Verify material delivery confirmation before scheduled installation date.', 'materials', 'install_scheduled_tomorrow',
'[{"field": "material.delivery_confirmed", "operator": "equals", "value": false}]'::jsonb,
'[
  {"type": "send_message", "template": "material_confirmation_request", "channel": "email"},
  {"type": "notify_ops", "message": "Material delivery not confirmed for tomorrow install"},
  {"type": "create_task", "title": "Confirm material delivery", "priority": "urgent"}
]'::jsonb,
0, true),

-- Workflow 4 — Hot Lead Acceleration
('Hot Lead Acceleration', 'Automatically prioritize and assign hot leads detected by NLP urgency keywords.', 'leads', 'nlp_detects_urgency',
'[]'::jsonb,
'[
  {"type": "send_message", "template": "hot_lead_response", "channel": "email"},
  {"type": "notify_owner", "message": "Hot lead detected - urgent response needed"},
  {"type": "assign_sales_rep", "priority": "high"},
  {"type": "update_health_score", "score": 90}
]'::jsonb,
0, true),

-- Workflow 5 — Crew Documentation Enforcement
('Crew Documentation Enforcement', 'Remind crew to upload photos when job is finished but no photos uploaded.', 'crew', 'crew_finished_job',
'[{"field": "job.photos_uploaded", "operator": "equals", "value": false}]'::jsonb,
'[
  {"type": "send_message", "template": "crew_photo_reminder", "channel": "sms"},
  {"type": "block_job_completion", "reason": "Photos not uploaded"},
  {"type": "alert_crew_lead", "message": "Job finished but photos missing"}
]'::jsonb,
0, true),

-- Workflow 6 — Review Request Booster
('Review Request Booster', 'Automatically send review request sequence when job is marked installed and homeowner satisfaction is positive.', 'reviews', 'job_moved_to_installed',
'[{"field": "homeowner.satisfaction", "operator": "equals", "value": "positive"}]'::jsonb,
'[
  {"type": "send_message", "template": "review_request", "channel": "email"},
  {"type": "trigger_sequence", "sequence_id": "review_request_sequence"}
]'::jsonb,
86400, true), -- 1 day delay

-- Workflow 7 — Weather Risk Rescheduler
('Weather Risk Rescheduler', 'Notify roofer and prompt reschedule when rain is forecasted for scheduled installation day.', 'weather', 'rain_forecasted',
'[{"field": "weather.probability", "operator": "greater_than", "value": 50}]'::jsonb,
'[
  {"type": "notify_roofer", "message": "Rain forecasted for scheduled day - consider rescheduling"},
  {"type": "send_message", "template": "weather_update", "channel": "email"},
  {"type": "create_task", "title": "Reschedule due to weather", "priority": "high"}
]'::jsonb,
0, true),

-- Workflow 8 — Payment Overdue Alert
('Payment Overdue Alert', 'Send gentle reminder when invoice is 3 days overdue, escalate at 7 days.', 'payments', 'invoice_overdue',
'[{"field": "invoice.days_overdue", "operator": "greater_than_or_equal", "value": 3}]'::jsonb,
'[
  {"type": "send_message", "template": "payment_reminder", "channel": "email"},
  {"type": "notify_operations", "message": "Invoice overdue"},
  {"type": "escalate_to_owner", "priority": "high", "condition": {"field": "invoice.days_overdue", "operator": "greater_than_or_equal", "value": 7}}
]'::jsonb,
0, true),

-- Workflow 9 — Adjuster Appointment Sync
('Adjuster Appointment Sync', 'Automatically create calendar event and notify team when adjuster visit is scheduled.', 'scheduling', 'inspection_scheduled',
'[{"field": "inspection.type", "operator": "equals", "value": "adjuster"}]'::jsonb,
'[
  {"type": "create_calendar_event", "title": "Adjuster Visit"},
  {"type": "notify_sales_rep", "message": "Adjuster visit scheduled"},
  {"type": "send_message", "template": "adjuster_prep", "channel": "email"}
]'::jsonb,
0, true),

-- Workflow 10 — Lead Revival
('Lead Revival', 'Send curiosity bump message when lead email hasn''t been opened in 48 hours.', 'communication', 'lead_unopened_48h',
'[{"field": "lead.has_email", "operator": "equals", "value": true}]'::jsonb,
'[
  {"type": "send_message", "template": "curiosity_bump", "channel": "email"}
]'::jsonb,
172800, true) -- 48 hours delay

ON CONFLICT DO NOTHING;

-- ============================================================================
-- PART 11 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.workflows IS 'Block 25020: Workflow Builder v1 - If-This-Then-That automation engine for roofing companies';
COMMENT ON TABLE public.workflow_templates IS 'Block 25020: Pre-built workflow templates that roofers can install with one click';
COMMENT ON TABLE public.workflow_executions IS 'Block 25020: Execution log for workflows showing when workflows fire and their results';
COMMENT ON TABLE public.workflow_events IS 'Block 25020: Event bus for workflow triggers';
COMMENT ON FUNCTION public.fire_workflow_event(uuid, text, text, uuid, jsonb) IS 'Block 25020: Helper function to fire workflow events';
COMMENT ON FUNCTION public.evaluate_workflow_conditions(jsonb, jsonb) IS 'Block 25020: Evaluates workflow conditions against event payload';






































