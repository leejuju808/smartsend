-- =========================================================
-- Block 23000 — SmartSend Roofing Automation Engine v1
-- "Triggers, Conditions, Actions — Automations for Operations + Sales."
-- =========================================================
-- 
-- This is where SmartSend becomes the Zapier-for-Roofers, inside the OS itself.
-- 
-- You've built the brain, the pipes, the money flow.
-- This block wires it all together so the system runs itself in dozens of little ways.
--
-- V1 Feature Goal:
-- - Core automation model: Trigger → Condition (optional) → Action
-- - Support a small set of high-ROI triggers + actions
-- - Automations defined per workspace
-- - Engine runs server-side whenever key events happen
-- - Event log so owners know what fired

-- ============================================================================
-- PART 1 — CREATE automations TABLE
-- ============================================================================
-- Stores automation rules that define trigger → condition → action flows

CREATE TABLE IF NOT EXISTS public.automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  name text NOT NULL, -- "Invoice Overdue Reminder"
  is_active boolean DEFAULT true,

  trigger_event text CHECK (trigger_event IN (
    'invoice_created',
    'invoice_status_changed',
    'job_progress_updated',
    'job_status_changed',
    'field_session_checked_in',
    'field_session_checked_out',
    'material_order_status_changed',
    'ai_insight_created'
  )) NOT NULL,

  -- simple JSON condition, evaluated by engine
  condition jsonb,   -- e.g. { "field": "invoice.status", "equals": "sent", "age_days_gt": 3 }

  -- list of actions to perform
  actions jsonb NOT NULL, -- e.g. [{ "type": "send_email", "template": "invoice_reminder" }]

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automations_workspace ON public.automations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_automations_trigger ON public.automations(trigger_event);
CREATE INDEX IF NOT EXISTS idx_automations_active ON public.automations(workspace_id, is_active, trigger_event) WHERE is_active = true;

-- ============================================================================
-- PART 2 — CREATE automation_logs TABLE
-- ============================================================================
-- Event log so owners know what fired

CREATE TABLE IF NOT EXISTS public.automation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  automation_id uuid REFERENCES public.automations(id) ON DELETE CASCADE,
  trigger_event text NOT NULL,
  target_type text,
  target_id uuid,
  status text CHECK (status IN ('success','error')) DEFAULT 'success',
  message text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automation_logs_workspace ON public.automation_logs(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_logs_automation ON public.automation_logs(automation_id);
CREATE INDEX IF NOT EXISTS idx_automation_logs_status ON public.automation_logs(status);

-- ============================================================================
-- PART 3 — CREATE automation_events TABLE
-- ============================================================================
-- Simple event bus: whenever something important happens, insert a row here
-- The automation engine processes these events

CREATE TABLE IF NOT EXISTS public.automation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_automation_events_workspace ON public.automation_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_automation_events_type ON public.automation_events(event_type);
CREATE INDEX IF NOT EXISTS idx_automation_events_unprocessed ON public.automation_events(workspace_id, created_at ASC) WHERE processed_at IS NULL;

-- ============================================================================
-- PART 4 — ROW LEVEL SECURITY POLICIES
-- ============================================================================

ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_events ENABLE ROW LEVEL SECURITY;

-- Automations: Users can view/manage automations in their workspace
CREATE POLICY "automations_select" ON public.automations
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "automations_insert" ON public.automations
  FOR INSERT WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "automations_update" ON public.automations
  FOR UPDATE USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "automations_delete" ON public.automations
  FOR DELETE USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Automation logs: Users can view logs for their workspace
CREATE POLICY "automation_logs_select" ON public.automation_logs
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Automation events: System can insert events (service role)
CREATE POLICY "automation_events_insert" ON public.automation_events
  FOR INSERT WITH CHECK (true);

-- ============================================================================
-- PART 5 — UPDATE TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_automations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_automations_updated_at
  BEFORE UPDATE ON public.automations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_automations_updated_at();

-- ============================================================================
-- PART 6 — HELPER FUNCTION TO INSERT AUTOMATION EVENTS
-- ============================================================================
-- Makes it easy to fire automation events from triggers or application code

CREATE OR REPLACE FUNCTION public.fire_automation_event(
  p_workspace_id uuid,
  p_event_type text,
  p_payload jsonb
)
RETURNS uuid AS $$
DECLARE
  v_event_id uuid;
BEGIN
  INSERT INTO public.automation_events (workspace_id, event_type, payload)
  VALUES (p_workspace_id, p_event_type, p_payload)
  RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 7 — DATABASE TRIGGERS TO FIRE AUTOMATION EVENTS
-- ============================================================================
-- These triggers automatically fire automation events when key events happen

-- Trigger: Invoice Created
CREATE OR REPLACE FUNCTION public.trigger_invoice_created_event()
RETURNS TRIGGER AS $$
DECLARE
  v_workspace_id uuid;
BEGIN
  -- Get workspace_id from job
  SELECT workspace_id INTO v_workspace_id
  FROM public.roofing_jobs
  WHERE id = NEW.job_id;
  
  IF v_workspace_id IS NOT NULL THEN
    PERFORM public.fire_automation_event(
      v_workspace_id,
      'invoice_created',
      jsonb_build_object(
        'target_type', 'invoice',
        'target_id', NEW.id,
        'invoice', jsonb_build_object(
          'id', NEW.id,
          'job_id', NEW.job_id,
          'type', NEW.type,
          'amount', NEW.amount,
          'status', NEW.status,
          'due_date', NEW.due_date,
          'created_at', NEW.created_at
        )
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Only create trigger if job_invoices table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'job_invoices') THEN
    DROP TRIGGER IF EXISTS trg_invoice_created_event ON public.job_invoices;
    CREATE TRIGGER trg_invoice_created_event
      AFTER INSERT ON public.job_invoices
      FOR EACH ROW
      EXECUTE FUNCTION public.trigger_invoice_created_event();
  END IF;
END $$;

-- Trigger: Invoice Status Changed
CREATE OR REPLACE FUNCTION public.trigger_invoice_status_changed_event()
RETURNS TRIGGER AS $$
DECLARE
  v_workspace_id uuid;
BEGIN
  -- Only fire if status actually changed
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;
  
  -- Get workspace_id from job
  SELECT workspace_id INTO v_workspace_id
  FROM public.roofing_jobs
  WHERE id = NEW.job_id;
  
  IF v_workspace_id IS NOT NULL THEN
    PERFORM public.fire_automation_event(
      v_workspace_id,
      'invoice_status_changed',
      jsonb_build_object(
        'target_type', 'invoice',
        'target_id', NEW.id,
        'invoice', jsonb_build_object(
          'id', NEW.id,
          'job_id', NEW.job_id,
          'status', NEW.status,
          'old_status', OLD.status,
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
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'job_invoices') THEN
    DROP TRIGGER IF EXISTS trg_invoice_status_changed_event ON public.job_invoices;
    CREATE TRIGGER trg_invoice_status_changed_event
      AFTER UPDATE OF status ON public.job_invoices
      FOR EACH ROW
      EXECUTE FUNCTION public.trigger_invoice_status_changed_event();
  END IF;
END $$;

-- Trigger: Job Status Changed
CREATE OR REPLACE FUNCTION public.trigger_job_status_changed_event()
RETURNS TRIGGER AS $$
BEGIN
  -- Only fire if status actually changed
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;
  
  PERFORM public.fire_automation_event(
    NEW.workspace_id,
    'job_status_changed',
    jsonb_build_object(
      'target_type', 'job',
      'target_id', NEW.id,
      'job', jsonb_build_object(
        'id', NEW.id,
        'status', NEW.status,
        'old_status', OLD.status,
        'created_at', NEW.created_at
      )
    )
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'roofing_jobs') THEN
    DROP TRIGGER IF EXISTS trg_job_status_changed_event ON public.roofing_jobs;
    CREATE TRIGGER trg_job_status_changed_event
      AFTER UPDATE OF status ON public.roofing_jobs
      FOR EACH ROW
      EXECUTE FUNCTION public.trigger_job_status_changed_event();
  END IF;
END $$;

-- Trigger: Job Progress Updated
CREATE OR REPLACE FUNCTION public.trigger_job_progress_updated_event()
RETURNS TRIGGER AS $$
BEGIN
  -- Only fire if progress_percent actually changed
  IF OLD.progress_percent = NEW.progress_percent THEN
    RETURN NEW;
  END IF;
  
  PERFORM public.fire_automation_event(
    NEW.workspace_id,
    'job_progress_updated',
    jsonb_build_object(
      'target_type', 'job',
      'target_id', NEW.id,
      'job', jsonb_build_object(
        'id', NEW.id,
        'progress_percent', NEW.progress_percent,
        'old_progress_percent', OLD.progress_percent,
        'created_at', NEW.created_at
      )
    )
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'roofing_jobs') THEN
    DROP TRIGGER IF EXISTS trg_job_progress_updated_event ON public.roofing_jobs;
    CREATE TRIGGER trg_job_progress_updated_event
      AFTER UPDATE OF progress_percent ON public.roofing_jobs
      FOR EACH ROW
      EXECUTE FUNCTION public.trigger_job_progress_updated_event();
  END IF;
END $$;

-- Trigger: Field Session Checked In
CREATE OR REPLACE FUNCTION public.trigger_field_session_checked_in_event()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.fire_automation_event(
    NEW.workspace_id,
    'field_session_checked_in',
    jsonb_build_object(
      'target_type', 'field_session',
      'target_id', NEW.id,
      'field_session', jsonb_build_object(
        'id', NEW.id,
        'job_id', NEW.job_id,
        'crew_id', NEW.crew_id,
        'check_in_at', NEW.check_in_at,
        'created_at', NEW.created_at
      )
    )
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'job_field_sessions') THEN
    DROP TRIGGER IF EXISTS trg_field_session_checked_in_event ON public.job_field_sessions;
    CREATE TRIGGER trg_field_session_checked_in_event
      AFTER INSERT ON public.job_field_sessions
      FOR EACH ROW
      EXECUTE FUNCTION public.trigger_field_session_checked_in_event();
  END IF;
END $$;

-- Trigger: Field Session Checked Out
CREATE OR REPLACE FUNCTION public.trigger_field_session_checked_out_event()
RETURNS TRIGGER AS $$
BEGIN
  -- Only fire if check_out_at was just set (was null, now has value)
  IF OLD.check_out_at IS NOT NULL OR NEW.check_out_at IS NULL THEN
    RETURN NEW;
  END IF;
  
  PERFORM public.fire_automation_event(
    NEW.workspace_id,
    'field_session_checked_out',
    jsonb_build_object(
      'target_type', 'field_session',
      'target_id', NEW.id,
      'field_session', jsonb_build_object(
        'id', NEW.id,
        'job_id', NEW.job_id,
        'crew_id', NEW.crew_id,
        'check_out_at', NEW.check_out_at,
        'progress_percent', NEW.progress_percent,
        'created_at', NEW.created_at
      )
    )
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'job_field_sessions') THEN
    DROP TRIGGER IF EXISTS trg_field_session_checked_out_event ON public.job_field_sessions;
    CREATE TRIGGER trg_field_session_checked_out_event
      AFTER UPDATE OF check_out_at ON public.job_field_sessions
      FOR EACH ROW
      EXECUTE FUNCTION public.trigger_field_session_checked_out_event();
  END IF;
END $$;

-- Trigger: Material Order Status Changed
CREATE OR REPLACE FUNCTION public.trigger_material_order_status_changed_event()
RETURNS TRIGGER AS $$
BEGIN
  -- Only fire if status actually changed
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;
  
  PERFORM public.fire_automation_event(
    NEW.workspace_id,
    'material_order_status_changed',
    jsonb_build_object(
      'target_type', 'material_order',
      'target_id', NEW.id,
      'material_order', jsonb_build_object(
        'id', NEW.id,
        'job_id', NEW.job_id,
        'status', NEW.status,
        'old_status', OLD.status,
        'expected_delivery_date', NEW.expected_delivery_date,
        'created_at', NEW.created_at
      )
    )
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'material_orders') THEN
    DROP TRIGGER IF EXISTS trg_material_order_status_changed_event ON public.material_orders;
    CREATE TRIGGER trg_material_order_status_changed_event
      AFTER UPDATE OF status ON public.material_orders
      FOR EACH ROW
      EXECUTE FUNCTION public.trigger_material_order_status_changed_event();
  END IF;
END $$;

-- Trigger: AI Insight Created
CREATE OR REPLACE FUNCTION public.trigger_ai_insight_created_event()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.fire_automation_event(
    NEW.workspace_id,
    'ai_insight_created',
    jsonb_build_object(
      'target_type', 'ai_insight',
      'target_id', NEW.id,
      'ai_insight', jsonb_build_object(
        'id', NEW.id,
        'job_id', NEW.job_id,
        'category', NEW.category,
        'severity', NEW.severity,
        'message', NEW.message,
        'created_at', NEW.created_at
      )
    )
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_insights') THEN
    DROP TRIGGER IF EXISTS trg_ai_insight_created_event ON public.ai_insights;
    CREATE TRIGGER trg_ai_insight_created_event
      AFTER INSERT ON public.ai_insights
      FOR EACH ROW
      EXECUTE FUNCTION public.trigger_ai_insight_created_event();
  END IF;
END $$;

-- ============================================================================
-- PART 8 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.automations IS 'Block 23000: Automation rules that define trigger → condition → action flows';
COMMENT ON TABLE public.automation_logs IS 'Block 23000: Event log showing which automations fired and their results';
COMMENT ON TABLE public.automation_events IS 'Block 23000: Event bus for automation triggers';
COMMENT ON FUNCTION public.fire_automation_event(uuid, text, jsonb) IS 'Block 23000: Helper function to fire automation events';

