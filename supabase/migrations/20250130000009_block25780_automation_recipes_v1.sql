-- =========================================================
-- Block 25780 — SmartSend Roofing Automation Recipes v1
-- "If-This → Then-That Workflows • Roofing Automation Templates • Prebuilt Recipes • Behavior-Based Triggers"
-- =========================================================
-- 
-- THE ROOFING AUTOMATION ENGINE — ZERO FLUFF.
-- 
-- This block turns SmartSend into a self-operating roofing machine.
-- 
-- Most roofing companies fail because EVERYTHING depends on humans:
-- ❌ humans forget
-- ❌ humans skip follow-ups
-- ❌ humans miscommunicate
-- ❌ humans lose notes
-- ❌ humans miss documents
-- ❌ humans forget to update status
-- ❌ humans forget to schedule installs
-- ❌ humans forget insurance tasks
-- 
-- SmartSend Automation Recipes v1 makes the roofing company run itself.
-- 
-- V1 Feature Goal:
-- - Prebuilt automation recipe packs (one-click activation)
-- - Extended trigger events for entire roofing pipeline
-- - Extended action types (notify, assign, create task, send email, etc.)
-- - Recipe library with 6 core packs
-- - Behavior-based triggers (quote views, lead replies, etc.)

-- ============================================================================
-- PART 1 — CREATE automation_recipes TABLE FIRST (needed for FK)
-- ============================================================================
-- Stores prebuilt automation recipe packs that can be activated with one click

CREATE TABLE IF NOT EXISTS public.automation_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Recipe Identity
  name text NOT NULL, -- e.g. "Lead Response Mastery"
  slug text NOT NULL UNIQUE, -- e.g. "lead-response-mastery"
  description text NOT NULL,
  category text CHECK (category IN (
    'lead', 'sales', 'inspection', 'quote', 'install', 'crew', 
    'material', 'weather', 'payment', 'insurance', 'warranty', 'review_referral', 'pack'
  )) NOT NULL,
  
  -- Recipe Metadata
  pack_number integer, -- For ordering packs (1-6)
  is_system_recipe boolean DEFAULT true, -- System recipes vs custom
  icon text, -- Icon identifier for UI
  
  -- Recipe Content
  automations jsonb NOT NULL, -- Array of automation definitions that get created when activated
  -- Format: [{ "name": "...", "trigger_event": "...", "condition": {...}, "actions": [...] }]
  
  -- Usage Stats
  activation_count integer DEFAULT 0,
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automation_recipes_category ON public.automation_recipes(category);
CREATE INDEX IF NOT EXISTS idx_automation_recipes_pack_number ON public.automation_recipes(pack_number);
CREATE INDEX IF NOT EXISTS idx_automation_recipes_slug ON public.automation_recipes(slug);

-- ============================================================================
-- PART 2 — EXTEND automations TABLE WITH RECIPE SUPPORT
-- ============================================================================

-- Add recipe_id to link automations to recipe packs
ALTER TABLE public.automations
  ADD COLUMN IF NOT EXISTS recipe_id uuid REFERENCES public.automation_recipes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category text CHECK (category IN (
    'lead', 'sales', 'inspection', 'quote', 'install', 'crew', 
    'material', 'weather', 'payment', 'insurance', 'warranty', 'review_referral'
  )),
  ADD COLUMN IF NOT EXISTS description text;

CREATE INDEX IF NOT EXISTS idx_automations_recipe ON public.automations(recipe_id);
CREATE INDEX IF NOT EXISTS idx_automations_category ON public.automations(workspace_id, category);

-- ============================================================================
-- PART 3 — EXTEND trigger_event CHECK CONSTRAINT
-- ============================================================================
-- Add all new trigger events for roofing pipeline

-- Drop and recreate the constraint with extended events
ALTER TABLE public.automations DROP CONSTRAINT IF EXISTS automations_trigger_event_check;

ALTER TABLE public.automations
  ADD CONSTRAINT automations_trigger_event_check CHECK (trigger_event IN (
    -- Existing events
    'invoice_created',
    'invoice_status_changed',
    'job_progress_updated',
    'job_status_changed',
    'field_session_checked_in',
    'field_session_checked_out',
    'material_order_status_changed',
    'ai_insight_created',
    -- Lead Automation
    'lead_created',
    'lead_not_contacted',
    'lead_replied',
    'lead_goes_cold',
    -- Sales Automation
    'quote_viewed',
    'quote_not_viewed',
    'quote_not_approved',
    'quote_question_clicked',
    'quote_viewed_multiple',
    'quote_approved',
    -- Inspection Automation
    'inspection_booked',
    'inspection_completed',
    'inspection_photos_missing',
    'estimate_overdue',
    -- Quote Automation
    'quote_sent',
    'quote_financing_requested',
    -- Install Automation
    'job_approved',
    'po_confirmed',
    'materials_delivered',
    'weather_risk_high',
    'crew_checked_in',
    'crew_checklist_completed',
    -- Crew Automation
    'crew_photos_missing',
    'crew_shortage_reported',
    'crew_behind_schedule',
    -- Material Automation
    'material_delivery_delayed',
    'supplier_cost_higher',
    'material_list_missing',
    -- Weather Automation
    'weather_risk_tomorrow',
    'storm_forecasted',
    'rain_starting',
    'extreme_heat',
    -- Payment Automation
    'final_invoice_sent',
    'payment_received',
    'insurance_acv_missing',
    'depreciation_overdue',
    -- Insurance Automation
    'supplement_approved',
    'supplement_denied',
    'insurance_docs_missing',
    'mortgage_company_required',
    -- Warranty Automation
    'final_payment_received',
    'warranty_generated',
    'warranty_not_delivered',
    -- Review + Referral Automation
    'job_completed',
    'rating_received',
    'review_received'
  ));

-- ============================================================================
-- PART 4 — CREATE workspace_recipe_activations TABLE
-- ============================================================================
-- Tracks which recipes are activated per workspace

CREATE TABLE IF NOT EXISTS public.workspace_recipe_activations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  recipe_id uuid NOT NULL REFERENCES public.automation_recipes(id) ON DELETE CASCADE,
  
  -- Activation Metadata
  activated_at timestamptz DEFAULT now(),
  activated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Status
  is_active boolean DEFAULT true,
  
  UNIQUE(workspace_id, recipe_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_recipe_activations_workspace ON public.workspace_recipe_activations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_recipe_activations_recipe ON public.workspace_recipe_activations(recipe_id);

-- ============================================================================
-- PART 5 — ROW LEVEL SECURITY POLICIES
-- ============================================================================

ALTER TABLE public.automation_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_recipe_activations ENABLE ROW LEVEL SECURITY;

-- Recipes: Everyone can read system recipes, workspace members can read their activations
CREATE POLICY "automation_recipes_select" ON public.automation_recipes
  FOR SELECT USING (true); -- System recipes are public

CREATE POLICY "workspace_recipe_activations_select" ON public.workspace_recipe_activations
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "workspace_recipe_activations_insert" ON public.workspace_recipe_activations
  FOR INSERT WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "workspace_recipe_activations_update" ON public.workspace_recipe_activations
  FOR UPDATE USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "workspace_recipe_activations_delete" ON public.workspace_recipe_activations
  FOR DELETE USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 7 — HELPER FUNCTION TO ACTIVATE RECIPE
-- ============================================================================
-- Creates all automations from a recipe for a workspace

CREATE OR REPLACE FUNCTION public.activate_automation_recipe(
  p_workspace_id uuid,
  p_recipe_id uuid,
  p_activated_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_recipe public.automation_recipes;
  v_automation_def jsonb;
  v_automation_id uuid;
  v_created_count integer := 0;
  v_activation_id uuid;
BEGIN
  -- Get recipe
  SELECT * INTO v_recipe
  FROM public.automation_recipes
  WHERE id = p_recipe_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recipe not found';
  END IF;
  
  -- Check if already activated
  SELECT id INTO v_activation_id
  FROM public.workspace_recipe_activations
  WHERE workspace_id = p_workspace_id AND recipe_id = p_recipe_id;
  
  IF v_activation_id IS NOT NULL THEN
    -- Reactivate if inactive
    UPDATE public.workspace_recipe_activations
    SET is_active = true, activated_at = now(), activated_by = p_activated_by
    WHERE id = v_activation_id;
  ELSE
    -- Create activation record
    INSERT INTO public.workspace_recipe_activations (workspace_id, recipe_id, activated_by)
    VALUES (p_workspace_id, p_recipe_id, p_activated_by)
    RETURNING id INTO v_activation_id;
    
    -- Increment activation count
    UPDATE public.automation_recipes
    SET activation_count = activation_count + 1
    WHERE id = p_recipe_id;
  END IF;
  
  -- Create automations from recipe
  FOR v_automation_def IN SELECT * FROM jsonb_array_elements(v_recipe.automations)
  LOOP
    INSERT INTO public.automations (
      workspace_id,
      recipe_id,
      name,
      category,
      description,
      is_active,
      trigger_event,
      condition,
      actions
    )
    VALUES (
      p_workspace_id,
      p_recipe_id,
      v_automation_def->>'name',
      v_automation_def->>'category',
      v_automation_def->>'description',
      COALESCE((v_automation_def->>'is_active')::boolean, true),
      v_automation_def->>'trigger_event',
      v_automation_def->'condition',
      v_automation_def->'actions'
    )
    RETURNING id INTO v_automation_id;
    
    v_created_count := v_created_count + 1;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'activation_id', v_activation_id,
    'automations_created', v_created_count,
    'recipe_name', v_recipe.name
  );
END;
$$;

-- ============================================================================
-- PART 7 — HELPER FUNCTION TO DEACTIVATE RECIPE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.deactivate_automation_recipe(
  p_workspace_id uuid,
  p_recipe_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deactivated_count integer;
BEGIN
  -- Deactivate activation record
  UPDATE public.workspace_recipe_activations
  SET is_active = false
  WHERE workspace_id = p_workspace_id AND recipe_id = p_recipe_id;
  
  -- Deactivate all automations from this recipe
  UPDATE public.automations
  SET is_active = false
  WHERE workspace_id = p_workspace_id AND recipe_id = p_recipe_id;
  
  GET DIAGNOSTICS v_deactivated_count = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'success', true,
    'automations_deactivated', v_deactivated_count
  );
END;
$$;

-- ============================================================================
-- PART 9 — DATABASE TRIGGERS FOR NEW EVENTS
-- ============================================================================

-- Trigger: Lead Created
CREATE OR REPLACE FUNCTION public.trigger_lead_created_event()
RETURNS TRIGGER AS $$
DECLARE
  v_workspace_id uuid;
BEGIN
  v_workspace_id := NEW.workspace_id;
  
  IF v_workspace_id IS NOT NULL THEN
    PERFORM public.fire_automation_event(
      v_workspace_id,
      'lead_created',
      jsonb_build_object(
        'target_type', 'lead',
        'target_id', NEW.id,
        'lead', jsonb_build_object(
          'id', NEW.id,
          'email', NEW.email,
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
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'leads' AND table_schema = 'public') THEN
    DROP TRIGGER IF EXISTS trg_lead_created_event ON public.leads;
    CREATE TRIGGER trg_lead_created_event
      AFTER INSERT ON public.leads
      FOR EACH ROW
      EXECUTE FUNCTION public.trigger_lead_created_event();
  END IF;
END $$;

-- Trigger: Lead Replied
CREATE OR REPLACE FUNCTION public.trigger_lead_replied_event()
RETURNS TRIGGER AS $$
DECLARE
  v_workspace_id uuid;
BEGIN
  -- Only fire if reply_detected changed from false to true
  IF OLD.reply_detected = NEW.reply_detected OR NEW.reply_detected IS NOT TRUE THEN
    RETURN NEW;
  END IF;
  
  v_workspace_id := NEW.workspace_id;
  
  IF v_workspace_id IS NOT NULL THEN
    PERFORM public.fire_automation_event(
      v_workspace_id,
      'lead_replied',
      jsonb_build_object(
        'target_type', 'lead',
        'target_id', NEW.id,
        'lead', jsonb_build_object(
          'id', NEW.id,
          'email', NEW.email,
          'reply_summary', NEW.reply_summary,
          'updated_at', NEW.updated_at
        )
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'leads' AND table_schema = 'public') THEN
    DROP TRIGGER IF EXISTS trg_lead_replied_event ON public.leads;
    CREATE TRIGGER trg_lead_replied_event
      AFTER UPDATE OF reply_detected ON public.leads
      FOR EACH ROW
      EXECUTE FUNCTION public.trigger_lead_replied_event();
  END IF;
END $$;

-- Trigger: Quote Viewed
CREATE OR REPLACE FUNCTION public.trigger_quote_viewed_event()
RETURNS TRIGGER AS $$
DECLARE
  v_workspace_id uuid;
  v_lead_id uuid;
BEGIN
  -- Only fire if viewed_at was just set (was null, now has value)
  IF OLD.viewed_at IS NOT NULL OR NEW.viewed_at IS NULL THEN
    RETURN NEW;
  END IF;
  
  v_lead_id := NEW.lead_id;
  
  -- Get workspace_id from lead
  SELECT workspace_id INTO v_workspace_id
  FROM public.leads
  WHERE id = v_lead_id;
  
  IF v_workspace_id IS NOT NULL THEN
    PERFORM public.fire_automation_event(
      v_workspace_id,
      'quote_viewed',
      jsonb_build_object(
        'target_type', 'quote',
        'target_id', NEW.id,
        'quote', jsonb_build_object(
          'id', NEW.id,
          'lead_id', NEW.lead_id,
          'status', NEW.status,
          'viewed_at', NEW.viewed_at
        )
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'quotes' AND table_schema = 'public') THEN
    DROP TRIGGER IF EXISTS trg_quote_viewed_event ON public.quotes;
    CREATE TRIGGER trg_quote_viewed_event
      AFTER UPDATE OF viewed_at ON public.quotes
      FOR EACH ROW
      EXECUTE FUNCTION public.trigger_quote_viewed_event();
  END IF;
END $$;

-- Trigger: Quote Status Changed (for approved/rejected)
CREATE OR REPLACE FUNCTION public.trigger_quote_status_changed_event()
RETURNS TRIGGER AS $$
DECLARE
  v_workspace_id uuid;
  v_lead_id uuid;
BEGIN
  -- Only fire if status changed to approved
  IF OLD.status = NEW.status OR NEW.status != 'accepted' THEN
    RETURN NEW;
  END IF;
  
  v_lead_id := NEW.lead_id;
  
  SELECT workspace_id INTO v_workspace_id
  FROM public.leads
  WHERE id = v_lead_id;
  
  IF v_workspace_id IS NOT NULL THEN
    PERFORM public.fire_automation_event(
      v_workspace_id,
      'quote_approved',
      jsonb_build_object(
        'target_type', 'quote',
        'target_id', NEW.id,
        'quote', jsonb_build_object(
          'id', NEW.id,
          'lead_id', NEW.lead_id,
          'status', NEW.status,
          'total', NEW.total,
          'decided_at', NEW.decided_at
        )
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'quotes' AND table_schema = 'public') THEN
    DROP TRIGGER IF EXISTS trg_quote_status_changed_event ON public.quotes;
    CREATE TRIGGER trg_quote_status_changed_event
      AFTER UPDATE OF status ON public.quotes
      FOR EACH ROW
      EXECUTE FUNCTION public.trigger_quote_status_changed_event();
  END IF;
END $$;

-- Trigger: Quote Sent
CREATE OR REPLACE FUNCTION public.trigger_quote_sent_event()
RETURNS TRIGGER AS $$
DECLARE
  v_workspace_id uuid;
  v_lead_id uuid;
BEGIN
  -- Only fire if sent_at was just set (was null, now has value)
  IF OLD.sent_at IS NOT NULL OR NEW.sent_at IS NULL THEN
    RETURN NEW;
  END IF;
  
  v_lead_id := NEW.lead_id;
  
  SELECT workspace_id INTO v_workspace_id
  FROM public.leads
  WHERE id = v_lead_id;
  
  IF v_workspace_id IS NOT NULL THEN
    PERFORM public.fire_automation_event(
      v_workspace_id,
      'quote_sent',
      jsonb_build_object(
        'target_type', 'quote',
        'target_id', NEW.id,
        'quote', jsonb_build_object(
          'id', NEW.id,
          'lead_id', NEW.lead_id,
          'status', NEW.status,
          'sent_at', NEW.sent_at,
          'total', NEW.total
        )
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'quotes' AND table_schema = 'public') THEN
    DROP TRIGGER IF EXISTS trg_quote_sent_event ON public.quotes;
    CREATE TRIGGER trg_quote_sent_event
      AFTER UPDATE OF sent_at ON public.quotes
      FOR EACH ROW
      EXECUTE FUNCTION public.trigger_quote_sent_event();
  END IF;
END $$;

-- Trigger: Job Status Changed (for job_approved)
CREATE OR REPLACE FUNCTION public.trigger_job_approved_event()
RETURNS TRIGGER AS $$
BEGIN
  -- Only fire if status changed to scheduled or in_progress (job approved)
  IF OLD.status = NEW.status OR (NEW.status NOT IN ('scheduled', 'in_progress')) THEN
    RETURN NEW;
  END IF;
  
  IF OLD.status = 'unscheduled' THEN
    PERFORM public.fire_automation_event(
      NEW.workspace_id,
      'job_approved',
      jsonb_build_object(
        'target_type', 'job',
        'target_id', NEW.id,
        'job', jsonb_build_object(
          'id', NEW.id,
          'status', NEW.status,
          'job_value', NEW.job_value,
          'scheduled_start_date', NEW.scheduled_start_date
        )
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'roofing_jobs' AND table_schema = 'public') THEN
    DROP TRIGGER IF EXISTS trg_job_approved_event ON public.roofing_jobs;
    CREATE TRIGGER trg_job_approved_event
      AFTER UPDATE OF status ON public.roofing_jobs
      FOR EACH ROW
      EXECUTE FUNCTION public.trigger_job_approved_event();
  END IF;
END $$;

-- Trigger: Job Completed
CREATE OR REPLACE FUNCTION public.trigger_job_completed_event()
RETURNS TRIGGER AS $$
BEGIN
  -- Only fire if status changed to completed
  IF OLD.status = NEW.status OR NEW.status != 'completed' THEN
    RETURN NEW;
  END IF;
  
  PERFORM public.fire_automation_event(
    NEW.workspace_id,
    'job_completed',
    jsonb_build_object(
      'target_type', 'job',
      'target_id', NEW.id,
      'job', jsonb_build_object(
        'id', NEW.id,
        'status', NEW.status,
        'job_value', NEW.job_value,
        'updated_at', NEW.updated_at
      )
    )
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'roofing_jobs' AND table_schema = 'public') THEN
    DROP TRIGGER IF EXISTS trg_job_completed_event ON public.roofing_jobs;
    CREATE TRIGGER trg_job_completed_event
      AFTER UPDATE OF status ON public.roofing_jobs
      FOR EACH ROW
      EXECUTE FUNCTION public.trigger_job_completed_event();
  END IF;
END $$;

-- Trigger: Payment Received
CREATE OR REPLACE FUNCTION public.trigger_payment_received_event()
RETURNS TRIGGER AS $$
DECLARE
  v_workspace_id uuid;
BEGIN
  -- Only fire if status changed to paid
  IF OLD.status = NEW.status OR NEW.status != 'paid' THEN
    RETURN NEW;
  END IF;
  
  -- Get workspace_id from job
  SELECT workspace_id INTO v_workspace_id
  FROM public.roofing_jobs
  WHERE id = NEW.job_id;
  
  IF v_workspace_id IS NOT NULL THEN
    PERFORM public.fire_automation_event(
      v_workspace_id,
      'payment_received',
      jsonb_build_object(
        'target_type', 'invoice',
        'target_id', NEW.id,
        'invoice', jsonb_build_object(
          'id', NEW.id,
          'job_id', NEW.job_id,
          'amount', NEW.amount,
          'status', NEW.status,
          'type', NEW.type
        )
      )
    );
    
    -- Also fire final_payment_received if this is a final invoice
    IF NEW.type = 'final' THEN
      PERFORM public.fire_automation_event(
        v_workspace_id,
        'final_payment_received',
        jsonb_build_object(
          'target_type', 'invoice',
          'target_id', NEW.id,
          'invoice', jsonb_build_object(
            'id', NEW.id,
            'job_id', NEW.job_id,
            'amount', NEW.amount,
            'status', NEW.status,
            'type', NEW.type
          )
        )
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'job_invoices' AND table_schema = 'public') THEN
    DROP TRIGGER IF EXISTS trg_payment_received_event ON public.job_invoices;
    CREATE TRIGGER trg_payment_received_event
      AFTER UPDATE OF status ON public.job_invoices
      FOR EACH ROW
      EXECUTE FUNCTION public.trigger_payment_received_event();
  END IF;
END $$;

-- Trigger: Final Invoice Sent
CREATE OR REPLACE FUNCTION public.trigger_final_invoice_sent_event()
RETURNS TRIGGER AS $$
DECLARE
  v_workspace_id uuid;
BEGIN
  -- Only fire if this is a final invoice and status changed to sent
  IF OLD.status = NEW.status OR NEW.status != 'sent' OR NEW.type != 'final' THEN
    RETURN NEW;
  END IF;
  
  -- Get workspace_id from job
  SELECT workspace_id INTO v_workspace_id
  FROM public.roofing_jobs
  WHERE id = NEW.job_id;
  
  IF v_workspace_id IS NOT NULL THEN
    PERFORM public.fire_automation_event(
      v_workspace_id,
      'final_invoice_sent',
      jsonb_build_object(
        'target_type', 'invoice',
        'target_id', NEW.id,
        'invoice', jsonb_build_object(
          'id', NEW.id,
          'job_id', NEW.job_id,
          'amount', NEW.amount,
          'status', NEW.status,
          'type', NEW.type,
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
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'job_invoices' AND table_schema = 'public') THEN
    DROP TRIGGER IF EXISTS trg_final_invoice_sent_event ON public.job_invoices;
    CREATE TRIGGER trg_final_invoice_sent_event
      AFTER UPDATE OF status ON public.job_invoices
      FOR EACH ROW
      EXECUTE FUNCTION public.trigger_final_invoice_sent_event();
  END IF;
END $$;

-- Trigger: Crew Photos Missing (from crew_check_ins)
CREATE OR REPLACE FUNCTION public.trigger_crew_photos_missing_event()
RETURNS TRIGGER AS $$
BEGIN
  -- Fire when crew checks out but required photos are missing
  IF NEW.check_out_time IS NOT NULL AND OLD.check_out_time IS NULL THEN
    -- Check if required photos are missing
    IF (NEW.end_photos IS NULL OR jsonb_array_length(COALESCE(NEW.end_photos, '[]'::jsonb)) = 0) THEN
      PERFORM public.fire_automation_event(
        NEW.workspace_id,
        'crew_photos_missing',
        jsonb_build_object(
          'target_type', 'crew_check_in',
          'target_id', NEW.id,
          'crew_check_in', jsonb_build_object(
            'id', NEW.id,
            'job_id', NEW.job_id,
            'crew_id', NEW.crew_id,
            'check_out_time', NEW.check_out_time
          )
        )
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'crew_check_ins' AND table_schema = 'public') THEN
    DROP TRIGGER IF EXISTS trg_crew_photos_missing_event ON public.crew_check_ins;
    CREATE TRIGGER trg_crew_photos_missing_event
      AFTER UPDATE OF check_out_time ON public.crew_check_ins
      FOR EACH ROW
      EXECUTE FUNCTION public.trigger_crew_photos_missing_event();
  END IF;
END $$;

-- Trigger: Crew Checklist Completed
CREATE OR REPLACE FUNCTION public.trigger_crew_checklist_completed_event()
RETURNS TRIGGER AS $$
BEGIN
  -- Fire when cleanup is confirmed (checklist completed)
  IF NEW.cleanup_confirmed = true AND (OLD.cleanup_confirmed IS NULL OR OLD.cleanup_confirmed = false) THEN
    PERFORM public.fire_automation_event(
      NEW.workspace_id,
      'crew_checklist_completed',
      jsonb_build_object(
        'target_type', 'crew_check_in',
        'target_id', NEW.id,
        'crew_check_in', jsonb_build_object(
          'id', NEW.id,
          'job_id', NEW.job_id,
          'crew_id', NEW.crew_id,
          'cleanup_confirmed', NEW.cleanup_confirmed,
          'tasks_completed', NEW.tasks_completed
        )
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'crew_check_ins' AND table_schema = 'public') THEN
    DROP TRIGGER IF EXISTS trg_crew_checklist_completed_event ON public.crew_check_ins;
    CREATE TRIGGER trg_crew_checklist_completed_event
      AFTER UPDATE OF cleanup_confirmed ON public.crew_check_ins
      FOR EACH ROW
      EXECUTE FUNCTION public.trigger_crew_checklist_completed_event();
  END IF;
END $$;

-- Trigger: Material Delivery Delayed
CREATE OR REPLACE FUNCTION public.trigger_material_delivery_delayed_event()
RETURNS TRIGGER AS $$
BEGIN
  -- Fire if expected_delivery_date has passed and status is not delivered
  IF NEW.expected_delivery_date < CURRENT_DATE AND NEW.status NOT IN ('delivered', 'completed') THEN
    PERFORM public.fire_automation_event(
      NEW.workspace_id,
      'material_delivery_delayed',
      jsonb_build_object(
        'target_type', 'material_order',
        'target_id', NEW.id,
        'material_order', jsonb_build_object(
          'id', NEW.id,
          'job_id', NEW.job_id,
          'status', NEW.status,
          'expected_delivery_date', NEW.expected_delivery_date,
          'days_late', CURRENT_DATE - NEW.expected_delivery_date
        )
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'material_orders' AND table_schema = 'public') THEN
    DROP TRIGGER IF EXISTS trg_material_delivery_delayed_event ON public.material_orders;
    CREATE TRIGGER trg_material_delivery_delayed_event
      AFTER INSERT OR UPDATE ON public.material_orders
      FOR EACH ROW
      EXECUTE FUNCTION public.trigger_material_delivery_delayed_event();
  END IF;
END $$;

-- ============================================================================
-- PART 9 — SEED PREBUILT RECIPE PACKS
-- ============================================================================

-- Pack 1: Lead Response Mastery
INSERT INTO public.automation_recipes (
  id, name, slug, description, category, pack_number, icon, automations
) VALUES (
  gen_random_uuid(),
  'Lead Response Mastery',
  'lead-response-mastery',
  'Everything to maximize speed-to-lead. Automatically contacts new leads, assigns to sales reps, and alerts when leads go cold.',
  'pack',
  1,
  'bolt',
  '[
    {
      "name": "New Lead Thank You + Assignment",
      "category": "lead",
      "description": "Send thank you message and assign to sales rep when new lead is created",
      "trigger_event": "lead_created",
      "condition": null,
      "actions": [
        {"type": "send_email", "template": "lead_thank_you", "delay_minutes": 0},
        {"type": "assign_to_sales_rep", "round_robin": true},
        {"type": "update_lead_status", "status": "contacted"}
      ],
      "is_active": true
    },
    {
      "name": "Alert: Lead Not Contacted in 10 Minutes",
      "category": "lead",
      "description": "Alert sales rep and owner if lead is not contacted within 10 minutes",
      "trigger_event": "lead_not_contacted",
      "condition": {"field": "lead.created_at", "age_minutes_gt": 10},
      "actions": [
        {"type": "notify", "recipients": ["sales_rep", "owner"], "message": "Lead not contacted in 10 minutes"},
        {"type": "create_task", "assignee": "sales_rep", "title": "Contact lead immediately"}
      ],
      "is_active": true
    },
    {
      "name": "Auto-Update Lead Status on Reply",
      "category": "lead",
      "description": "Automatically update lead status when they reply",
      "trigger_event": "lead_replied",
      "condition": null,
      "actions": [
        {"type": "update_lead_status", "status": "replied"},
        {"type": "notify", "recipients": ["sales_rep"], "message": "Lead replied"}
      ],
      "is_active": true
    },
    {
      "name": "Enroll Cold Leads in Nurture Sequence",
      "category": "lead",
      "description": "Automatically enroll leads that go cold into nurture sequence",
      "trigger_event": "lead_goes_cold",
      "condition": {"field": "lead.last_contacted_at", "age_days_gt": 7},
      "actions": [
        {"type": "enroll_in_sequence", "sequence": "cold_lead_nurture"},
        {"type": "add_tag", "tag": "cold_lead"}
      ],
      "is_active": true
    }
  ]'::jsonb
) ON CONFLICT (slug) DO NOTHING;

-- Pack 2: Sales Follow-Up Engine
INSERT INTO public.automation_recipes (
  id, name, slug, description, category, pack_number, icon, automations
) VALUES (
  gen_random_uuid(),
  'Sales Follow-Up Engine',
  'sales-follow-up-engine',
  'All follow-up sequences activated. Tracks quote views, sends reminders, and marks hot leads.',
  'pack',
  2,
  'trending-up',
  '[
    {
      "name": "Notify Sales Rep When Quote Viewed",
      "category": "sales",
      "description": "Alert sales rep immediately when homeowner views quote",
      "trigger_event": "quote_viewed",
      "condition": null,
      "actions": [
        {"type": "notify", "recipients": ["sales_rep"], "message": "Homeowner viewed quote"},
        {"type": "send_email", "template": "quote_viewed_followup", "delay_minutes": 120}
      ],
      "is_active": true
    },
    {
      "name": "Reminder: Quote Not Viewed in 24 Hours",
      "category": "sales",
      "description": "Send reminder if quote not viewed within 24 hours",
      "trigger_event": "quote_not_viewed",
      "condition": {"field": "quote.sent_at", "age_hours_gt": 24},
      "actions": [
        {"type": "send_email", "template": "quote_reminder_1", "delay_minutes": 0}
      ],
      "is_active": true
    },
    {
      "name": "Follow-Up: Quote Not Approved in 3 Days",
      "category": "sales",
      "description": "Send follow-up email if quote not approved after 3 days",
      "trigger_event": "quote_not_approved",
      "condition": {"field": "quote.sent_at", "age_days_gt": 3},
      "actions": [
        {"type": "send_email", "template": "quote_followup_2", "delay_minutes": 0},
        {"type": "create_task", "assignee": "sales_rep", "title": "Follow up on quote approval"}
      ],
      "is_active": true
    },
    {
      "name": "Alert: Homeowner Has Questions",
      "category": "sales",
      "description": "Immediate alert when homeowner clicks I have questions",
      "trigger_event": "quote_question_clicked",
      "condition": null,
      "actions": [
        {"type": "notify", "recipients": ["sales_rep", "owner"], "priority": "high", "message": "Homeowner has questions about quote"},
        {"type": "create_task", "assignee": "sales_rep", "title": "Answer homeowner questions", "priority": "high"}
      ],
      "is_active": true
    },
    {
      "name": "Mark Lead HOT: Quote Viewed 3+ Times",
      "category": "sales",
      "description": "Mark lead as HOT when quote viewed multiple times",
      "trigger_event": "quote_viewed_multiple",
      "condition": {"field": "quote.view_count", "gte": 3},
      "actions": [
        {"type": "add_tag", "tag": "hot_lead"},
        {"type": "update_lead_status", "status": "hot"},
        {"type": "notify", "recipients": ["sales_rep"], "message": "Lead is HOT - quote viewed 3+ times"}
      ],
      "is_active": true
    }
  ]'::jsonb
) ON CONFLICT (slug) DO NOTHING;

-- Pack 3: Insurance Job Flow
INSERT INTO public.automation_recipes (
  id, name, slug, description, category, pack_number, icon, automations
) VALUES (
  gen_random_uuid(),
  'Insurance Job Flow',
  'insurance-job-flow',
  'Tracking ACV, depreciation, supplements. Automates insurance claim workflows.',
  'pack',
  3,
  'shield',
  '[
    {
      "name": "Update Revenue on Supplement Approval",
      "category": "insurance",
      "description": "Update job revenue and notify owner when supplement is approved",
      "trigger_event": "supplement_approved",
      "condition": null,
      "actions": [
        {"type": "update_job_revenue", "include_supplement": true},
        {"type": "notify", "recipients": ["owner", "insurance_specialist"], "message": "Supplement approved"},
        {"type": "update_insurance_status", "status": "supplement_approved"}
      ],
      "is_active": true
    },
    {
      "name": "Alert: Supplement Denied",
      "category": "insurance",
      "description": "Notify insurance team when supplement is denied",
      "trigger_event": "supplement_denied",
      "condition": null,
      "actions": [
        {"type": "notify", "recipients": ["insurance_team"], "priority": "high", "message": "Supplement denied"},
        {"type": "create_task", "assignee": "insurance_specialist", "title": "Review supplement denial reason"},
        {"type": "attach_reason", "field": "denial_reason"}
      ],
      "is_active": true
    },
    {
      "name": "Remind: Missing Insurance Documents",
      "category": "insurance",
      "description": "Remind insurance specialist when documents are missing",
      "trigger_event": "insurance_docs_missing",
      "condition": null,
      "actions": [
        {"type": "notify", "recipients": ["insurance_specialist"], "message": "Missing insurance documents"},
        {"type": "create_task", "assignee": "insurance_specialist", "title": "Collect missing insurance documents"}
      ],
      "is_active": true
    },
    {
      "name": "Alert: Insurance ACV Missing",
      "category": "insurance",
      "description": "Alert insurance specialist when ACV is missing",
      "trigger_event": "insurance_acv_missing",
      "condition": null,
      "actions": [
        {"type": "notify", "recipients": ["insurance_specialist"], "message": "Insurance ACV missing"},
        {"type": "create_task", "assignee": "insurance_specialist", "title": "Get ACV from adjuster"}
      ],
      "is_active": true
    },
    {
      "name": "Notify Homeowner: Mortgage Company Required",
      "category": "insurance",
      "description": "Notify homeowner with instructions when mortgage company is required",
      "trigger_event": "mortgage_company_required",
      "condition": null,
      "actions": [
        {"type": "send_email", "template": "mortgage_company_instructions", "delay_minutes": 0},
        {"type": "notify", "recipients": ["homeowner"], "message": "Mortgage company involvement required"}
      ],
      "is_active": true
    },
    {
      "name": "Follow-Up: Depreciation Overdue",
      "category": "insurance",
      "description": "Generate homeowner follow-up message when depreciation is overdue",
      "trigger_event": "depreciation_overdue",
      "condition": {"field": "claim.depreciation_due_date", "age_days_gt": 0},
      "actions": [
        {"type": "send_email", "template": "depreciation_followup", "delay_minutes": 0},
        {"type": "create_task", "assignee": "insurance_specialist", "title": "Follow up on depreciation"}
      ],
      "is_active": true
    }
  ]'::jsonb
) ON CONFLICT (slug) DO NOTHING;

-- Pack 4: Perfect Install Day Flow
INSERT INTO public.automation_recipes (
  id, name, slug, description, category, pack_number, icon, automations
) VALUES (
  gen_random_uuid(),
  'Perfect Install Day Flow',
  'perfect-install-day-flow',
  'Crew check-in → cleanup → homeowner updates. Ensures smooth install days.',
  'pack',
  4,
  'calendar',
  '[
    {
      "name": "Auto-Schedule Material Delivery on PO Confirmation",
      "category": "install",
      "description": "Automatically schedule material delivery date when PO is confirmed",
      "trigger_event": "po_confirmed",
      "condition": null,
      "actions": [
        {"type": "schedule_material_delivery", "days_before_install": 2},
        {"type": "notify", "recipients": ["ops"], "message": "PO confirmed, material delivery scheduled"}
      ],
      "is_active": true
    },
    {
      "name": "Notify Ops + Crew When Materials Delivered",
      "category": "install",
      "description": "Notify operations and crew when materials are delivered",
      "trigger_event": "materials_delivered",
      "condition": null,
      "actions": [
        {"type": "notify", "recipients": ["ops", "crew"], "message": "Materials delivered to job site"},
        {"type": "update_job_status", "status": "ready_for_install"}
      ],
      "is_active": true
    },
    {
      "name": "Alert: Weather Risk > 70%",
      "category": "install",
      "description": "Alert ops and suggest reschedule when weather risk is high",
      "trigger_event": "weather_risk_high",
      "condition": {"field": "weather.risk_score", "gt": 70},
      "actions": [
        {"type": "notify", "recipients": ["ops", "owner"], "priority": "high", "message": "High weather risk - consider rescheduling"},
        {"type": "suggest_reschedule", "reason": "weather_risk"}
      ],
      "is_active": true
    },
    {
      "name": "Update Job Timeline on Crew Check-In",
      "category": "install",
      "description": "Automatically update job timeline when crew checks in",
      "trigger_event": "crew_checked_in",
      "condition": null,
      "actions": [
        {"type": "update_job_timeline", "event": "crew_arrived"},
        {"type": "notify", "recipients": ["ops"], "message": "Crew checked in at job site"}
      ],
      "is_active": true
    },
    {
      "name": "Send Cleanup Confirmation to Homeowner",
      "category": "install",
      "description": "Send cleanup confirmation to homeowner when crew completes checklist",
      "trigger_event": "crew_checklist_completed",
      "condition": null,
      "actions": [
        {"type": "send_email", "template": "cleanup_confirmation", "delay_minutes": 0},
        {"type": "notify", "recipients": ["homeowner"], "message": "Installation complete and cleanup confirmed"}
      ],
      "is_active": true
    }
  ]'::jsonb
) ON CONFLICT (slug) DO NOTHING;

-- Pack 5: Review & Referral Pack
INSERT INTO public.automation_recipes (
  id, name, slug, description, category, pack_number, icon, automations
) VALUES (
  gen_random_uuid(),
  'Review & Referral Pack',
  'review-referral-pack',
  'Auto-review + referral engine. Automatically requests reviews and referrals after job completion.',
  'pack',
  5,
  'star',
  '[
    {
      "name": "Send Satisfaction Survey After Job Completion",
      "category": "review_referral",
      "description": "Send satisfaction survey when job is completed",
      "trigger_event": "job_completed",
      "condition": null,
      "actions": [
        {"type": "send_email", "template": "satisfaction_survey", "delay_hours": 24}
      ],
      "is_active": true
    },
    {
      "name": "Request Review: Rating > 4",
      "category": "review_referral",
      "description": "Trigger review request when rating is greater than 4",
      "trigger_event": "rating_received",
      "condition": {"field": "rating.value", "gt": 4},
      "actions": [
        {"type": "send_email", "template": "review_request", "delay_hours": 0},
        {"type": "add_tag", "tag": "happy_customer"}
      ],
      "is_active": true
    },
    {
      "name": "Notify Owner: Rating < 4 (No Review Request)",
      "category": "review_referral",
      "description": "Notify owner when rating is less than 4 (do not request review)",
      "trigger_event": "rating_received",
      "condition": {"field": "rating.value", "lt": 4},
      "actions": [
        {"type": "notify", "recipients": ["owner"], "priority": "high", "message": "Low rating received - no review request sent"},
        {"type": "create_task", "assignee": "owner", "title": "Follow up with unhappy customer"}
      ],
      "is_active": true
    },
    {
      "name": "Send Referral Ask After Review Received",
      "category": "review_referral",
      "description": "Send referral request after review is received",
      "trigger_event": "review_received",
      "condition": null,
      "actions": [
        {"type": "send_email", "template": "referral_request", "delay_days": 3},
        {"type": "add_tag", "tag": "reviewed"}
      ],
      "is_active": true
    }
  ]'::jsonb
) ON CONFLICT (slug) DO NOTHING;

-- Pack 6: Weather-Protected Scheduling
INSERT INTO public.automation_recipes (
  id, name, slug, description, category, pack_number, icon, automations
) VALUES (
  gen_random_uuid(),
  'Weather-Protected Scheduling',
  'weather-protected-scheduling',
  'Blocks bad weather days automatically. Alerts ops and suggests reschedules.',
  'pack',
  6,
  'cloud-rain',
  '[
    {
      "name": "Alert: Tomorrow Weather Risk > 60%",
      "category": "weather",
      "description": "Alert ops when tomorrow weather risk is high",
      "trigger_event": "weather_risk_tomorrow",
      "condition": {"field": "weather.risk_score", "gt": 60},
      "actions": [
        {"type": "notify", "recipients": ["ops"], "message": "High weather risk tomorrow - review scheduled jobs"},
        {"type": "create_task", "assignee": "ops", "title": "Review weather risk for tomorrow"}
      ],
      "is_active": true
    },
    {
      "name": "Launch Storm Outreach Campaign",
      "category": "weather",
      "description": "Launch storm outreach campaign when storm is forecasted in ZIP",
      "trigger_event": "storm_forecasted",
      "condition": null,
      "actions": [
        {"type": "launch_campaign", "campaign_type": "storm_outreach", "target_zip": "{{weather.zip}}"},
        {"type": "notify", "recipients": ["owner"], "message": "Storm outreach campaign launched"}
      ],
      "is_active": true
    },
    {
      "name": "Notify Crew: Rain Starting Today",
      "category": "weather",
      "description": "Notify crew mid-install if rain is starting today",
      "trigger_event": "rain_starting",
      "condition": null,
      "actions": [
        {"type": "notify", "recipients": ["crew"], "priority": "high", "message": "Rain starting today - secure job site"},
        {"type": "create_task", "assignee": "crew", "title": "Secure job site for rain"}
      ],
      "is_active": true
    },
    {
      "name": "Warn Crew: Extreme Heat",
      "category": "weather",
      "description": "Warn crew to avoid afternoon installs during extreme heat",
      "trigger_event": "extreme_heat",
      "condition": {"field": "weather.temperature", "gt": 95},
      "actions": [
        {"type": "notify", "recipients": ["crew"], "message": "Extreme heat warning - avoid afternoon installs"},
        {"type": "suggest_reschedule", "reason": "extreme_heat", "preferred_time": "morning"}
      ],
      "is_active": true
    }
  ]'::jsonb
) ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- PART 11 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.automation_recipes IS 'Block 25780: Prebuilt automation recipe packs for roofing workflows';
COMMENT ON TABLE public.workspace_recipe_activations IS 'Block 25780: Tracks which recipes are activated per workspace';
COMMENT ON FUNCTION public.activate_automation_recipe(uuid, uuid, uuid) IS 'Block 25780: Activates a recipe by creating all its automations for a workspace';
COMMENT ON FUNCTION public.deactivate_automation_recipe(uuid, uuid) IS 'Block 25780: Deactivates a recipe and all its automations for a workspace';




































