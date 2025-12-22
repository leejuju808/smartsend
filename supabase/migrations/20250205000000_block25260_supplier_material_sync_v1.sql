-- =========================================================
-- Block 25260 — SmartSend Roofing Supplier & Material Sync v1
-- (PO Automation • Delivery Tracking • Material Shortage Alerts • Supplier Performance Tracking • Crew/Schedule Integration)
-- =========================================================
-- 
-- THE MATERIAL & SUPPLIER CONTROL SYSTEM — ZERO FLUFF.
-- 
-- This block eliminates material chaos and creates a clean, predictable, automated material flow.
-- This is the silent killer feature that makes SmartSend feel like REAL operations intelligence.
--
-- Features:
-- 1. Enhanced PO Automation (auto-create on job approval)
-- 2. Delivery Tracking Flow (ETA, driver notifications, arrival confirmation)
-- 3. Material Shortage Alerts (crew can issue from field)
-- 4. Color Confirmation System (homeowner visual confirmation)
-- 5. Supplier Performance Score (A-F grading)
-- 6. Enhanced Material Cost Tracking
-- 7. Material → Scheduling Integration (block scheduling if materials not ready)
-- 8. Material → Crew Integration (crew receives material info, uploads proof)
-- 9. Material → Homeowner Experience (delivery notifications)
-- 10. Job Timeline Material Sync (all material events logged)

-- ============================================================================
-- PART 1 — ENHANCE DELIVERY TRACKING TABLE
-- ============================================================================
-- Add comprehensive delivery tracking fields to material_deliveries

ALTER TABLE public.material_deliveries
  ADD COLUMN IF NOT EXISTS delivery_window_start time,
  ADD COLUMN IF NOT EXISTS delivery_window_end time,
  ADD COLUMN IF NOT EXISTS supplier_eta timestamptz,
  ADD COLUMN IF NOT EXISTS driver_name text,
  ADD COLUMN IF NOT EXISTS driver_phone text,
  ADD COLUMN IF NOT EXISTS driver_delay_notified boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS driver_delay_reason text,
  ADD COLUMN IF NOT EXISTS arrival_confirmed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS arrival_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS arrival_confirmed_by text, -- 'crew', 'ops', 'homeowner', 'supplier'
  ADD COLUMN IF NOT EXISTS arrival_notes text;

COMMENT ON COLUMN public.material_deliveries.delivery_window_start IS 'Block 25260: Start time of delivery window';
COMMENT ON COLUMN public.material_deliveries.delivery_window_end IS 'Block 25260: End time of delivery window';
COMMENT ON COLUMN public.material_deliveries.supplier_eta IS 'Block 25260: Supplier-provided ETA';
COMMENT ON COLUMN public.material_deliveries.driver_name IS 'Block 25260: Name of delivery driver';
COMMENT ON COLUMN public.material_deliveries.driver_phone IS 'Block 25260: Phone number of delivery driver';
COMMENT ON COLUMN public.material_deliveries.arrival_confirmed IS 'Block 25260: Whether arrival was confirmed on-site';

-- ============================================================================
-- PART 2 — CREATE COLOR CONFIRMATION SYSTEM TABLE
-- ============================================================================
-- Tracks homeowner color confirmations to prevent wrong color disasters

CREATE TABLE IF NOT EXISTS public.material_color_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  material_order_id uuid REFERENCES public.material_orders(id) ON DELETE SET NULL,
  
  -- Color details
  shingle_brand text NOT NULL,
  shingle_color text NOT NULL,
  color_swatch_url text, -- URL to color swatch image
  example_roof_photo_url text, -- URL to example roof photo
  
  -- Confirmation request
  confirmation_request_sent_at timestamptz,
  confirmation_request_email_id uuid, -- Reference to email sent
  
  -- Homeowner response
  homeowner_confirmed boolean DEFAULT false,
  homeowner_confirmed_at timestamptz,
  homeowner_response text, -- 'YES', 'NO', or custom message
  homeowner_response_email_id uuid, -- Reference to reply email
  
  -- Ops action
  ops_alerted boolean DEFAULT false,
  ops_alerted_at timestamptz,
  
  -- Status
  status text CHECK (status IN ('pending', 'confirmed', 'rejected', 'needs_review')) DEFAULT 'pending',
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS material_color_confirmations_job_idx
  ON public.material_color_confirmations(job_id);

CREATE INDEX IF NOT EXISTS material_color_confirmations_status_idx
  ON public.material_color_confirmations(status)
  WHERE status IN ('pending', 'needs_review');

CREATE INDEX IF NOT EXISTS material_color_confirmations_workspace_idx
  ON public.material_color_confirmations(workspace_id);

-- ============================================================================
-- PART 3 — ENHANCE SUPPLIER PERFORMANCE SCORING
-- ============================================================================
-- Add comprehensive supplier performance metrics and A-F grading

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS total_orders_count int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS on_time_delivery_pct numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS accuracy_pct numeric DEFAULT 100, -- % of orders with no issues
  ADD COLUMN IF NOT EXISTS shortage_frequency_pct numeric DEFAULT 0, -- % of orders with shortages
  ADD COLUMN IF NOT EXISTS price_consistency_score numeric DEFAULT 100, -- 0-100 score
  ADD COLUMN IF NOT EXISTS avg_response_time_hours numeric, -- Average response time to communications
  ADD COLUMN IF NOT EXISTS supplier_grade text CHECK (supplier_grade IN ('A', 'B', 'C', 'D', 'F')) DEFAULT 'C',
  ADD COLUMN IF NOT EXISTS last_performance_calc_at timestamptz,
  ADD COLUMN IF NOT EXISTS performance_notes text;

COMMENT ON COLUMN public.suppliers.supplier_grade IS 'Block 25260: Supplier performance grade (A=elite, B=reliable, C=risky, D=dangerous, F=avoid)';
COMMENT ON COLUMN public.suppliers.on_time_delivery_pct IS 'Block 25260: Percentage of on-time deliveries';
COMMENT ON COLUMN public.suppliers.accuracy_pct IS 'Block 25260: Percentage of orders with no issues';

-- ============================================================================
-- PART 4 — CREATE SUPPLIER PERFORMANCE HISTORY TABLE
-- ============================================================================
-- Track supplier performance over time for trend analysis

CREATE TABLE IF NOT EXISTS public.supplier_performance_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Metrics snapshot
  period_start date NOT NULL,
  period_end date NOT NULL,
  orders_count int DEFAULT 0,
  on_time_delivery_count int DEFAULT 0,
  late_delivery_count int DEFAULT 0,
  issue_count int DEFAULT 0,
  shortage_count int DEFAULT 0,
  on_time_pct numeric,
  accuracy_pct numeric,
  supplier_grade text CHECK (supplier_grade IN ('A', 'B', 'C', 'D', 'F')),
  
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS supplier_performance_history_supplier_idx
  ON public.supplier_performance_history(supplier_id, period_start DESC);

CREATE INDEX IF NOT EXISTS supplier_performance_history_workspace_idx
  ON public.supplier_performance_history(workspace_id);

-- ============================================================================
-- PART 5 — ENHANCE MATERIAL COST TRACKING
-- ============================================================================
-- Add fields to material_orders for comprehensive cost tracking

ALTER TABLE public.material_orders
  ADD COLUMN IF NOT EXISTS delivery_fee numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dumpster_fee numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supplement_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS change_order_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_with_fees numeric GENERATED ALWAYS AS (
    COALESCE(total, 0) + 
    COALESCE(delivery_fee, 0) + 
    COALESCE(dumpster_fee, 0) + 
    COALESCE(supplement_amount, 0) + 
    COALESCE(change_order_amount, 0)
  ) STORED;

COMMENT ON COLUMN public.material_orders.delivery_fee IS 'Block 25260: Delivery fee charged by supplier';
COMMENT ON COLUMN public.material_orders.dumpster_fee IS 'Block 25260: Dumpster rental/delivery fee';
COMMENT ON COLUMN public.material_orders.supplement_amount IS 'Block 25260: Insurance supplement amount';
COMMENT ON COLUMN public.material_orders.change_order_amount IS 'Block 25260: Change order amount';

-- ============================================================================
-- PART 6 — CREATE CREW MATERIAL PROOF TABLE
-- ============================================================================
-- Tracks crew uploads of material wrappers, leftover inventory, proof of proper usage

CREATE TABLE IF NOT EXISTS public.crew_material_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  material_order_id uuid REFERENCES public.material_orders(id) ON DELETE SET NULL,
  
  -- Upload details
  proof_type text CHECK (proof_type IN ('material_wrapper', 'leftover_inventory', 'proper_usage', 'installation_photo')) NOT NULL,
  photo_url text NOT NULL,
  uploaded_by text, -- Crew member name or user_id
  uploaded_at timestamptz DEFAULT now(),
  
  -- Verification
  verified_by_ops boolean DEFAULT false,
  verified_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at timestamptz,
  verification_notes text,
  
  -- Metadata
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crew_material_proofs_job_idx
  ON public.crew_material_proofs(job_id);

CREATE INDEX IF NOT EXISTS crew_material_proofs_order_idx
  ON public.crew_material_proofs(material_order_id);

CREATE INDEX IF NOT EXISTS crew_material_proofs_workspace_idx
  ON public.crew_material_proofs(workspace_id);

-- ============================================================================
-- PART 7 — CREATE HOMEOWNER MATERIAL NOTIFICATIONS TABLE
-- ============================================================================
-- Tracks notifications sent to homeowners about material deliveries

CREATE TABLE IF NOT EXISTS public.homeowner_material_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  material_order_id uuid REFERENCES public.material_orders(id) ON DELETE SET NULL,
  
  -- Notification details
  notification_type text CHECK (notification_type IN ('delivery_scheduled', 'delivery_eta', 'delivery_arrived', 'color_confirmation')) NOT NULL,
  sent_at timestamptz DEFAULT now(),
  sent_to_email text,
  sent_to_phone text,
  email_message_id uuid, -- Reference to email sent
  
  -- Content
  message_text text,
  delivery_date date,
  delivery_window_start time,
  delivery_window_end time,
  
  -- Response tracking
  homeowner_viewed boolean DEFAULT false,
  homeowner_viewed_at timestamptz,
  homeowner_responded boolean DEFAULT false,
  homeowner_response text,
  
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS homeowner_material_notifications_job_idx
  ON public.homeowner_material_notifications(job_id);

CREATE INDEX IF NOT EXISTS homeowner_material_notifications_order_idx
  ON public.homeowner_material_notifications(material_order_id);

CREATE INDEX IF NOT EXISTS homeowner_material_notifications_workspace_idx
  ON public.homeowner_material_notifications(workspace_id);

-- ============================================================================
-- PART 8 — ENHANCE MATERIAL SHORTAGE ALERTS
-- ============================================================================
-- Add fields for crew-issued alerts and automatic task creation

ALTER TABLE public.material_shortage_alerts
  ADD COLUMN IF NOT EXISTS issued_by text CHECK (issued_by IN ('crew', 'ops', 'system', 'supplier')) DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS issued_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS issued_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS ops_alerted boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS ops_alerted_at timestamptz,
  ADD COLUMN IF NOT EXISTS supplier_alerted boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS supplier_alerted_at timestamptz,
  ADD COLUMN IF NOT EXISTS task_created boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS task_id uuid REFERENCES public.roofing_tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS schedule_delayed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS job_health_score_adjusted boolean DEFAULT false;

COMMENT ON COLUMN public.material_shortage_alerts.issued_by IS 'Block 25260: Who issued the alert (crew can issue from field)';
COMMENT ON COLUMN public.material_shortage_alerts.task_created IS 'Block 25260: Whether a task was auto-created for this alert';

-- ============================================================================
-- PART 9 — ADD MATERIAL READINESS CHECK TO roofing_jobs
-- ============================================================================
-- Add fields to track material readiness for scheduling

ALTER TABLE public.roofing_jobs
  ADD COLUMN IF NOT EXISTS materials_ready_for_scheduling boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS materials_ready_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS materials_blocking_scheduling boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS materials_blocking_reason text;

COMMENT ON COLUMN public.roofing_jobs.materials_ready_for_scheduling IS 'Block 25260: Whether materials are ready and job can be scheduled';
COMMENT ON COLUMN public.roofing_jobs.materials_blocking_scheduling IS 'Block 25260: Whether materials are blocking scheduling';
COMMENT ON COLUMN public.roofing_jobs.materials_blocking_reason IS 'Block 25260: Reason why materials are blocking scheduling';

-- ============================================================================
-- PART 10 — CREATE FUNCTION: AUTO-CREATE PO DRAFT ON JOB APPROVAL
-- ============================================================================
-- Automatically creates a PO draft when a job is approved

CREATE OR REPLACE FUNCTION public.auto_create_po_draft_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_takeoff_id uuid;
  v_order_id uuid;
  v_po_id uuid;
BEGIN
  -- Only trigger when job status changes to 'scheduled' or 'in_progress' (indicating approval)
  IF (OLD.status IS NULL OR OLD.status != NEW.status) 
     AND NEW.status IN ('scheduled', 'in_progress')
     AND (OLD.status IS NULL OR OLD.status NOT IN ('scheduled', 'in_progress')) THEN
    
    -- Check if material order already exists
    IF EXISTS (
      SELECT 1 FROM public.material_orders 
      WHERE job_id = NEW.id AND status != 'cancelled'
    ) THEN
      RETURN NEW; -- Order already exists
    END IF;
    
    -- Check if takeoff exists
    SELECT id INTO v_takeoff_id
    FROM public.material_takeoffs
    WHERE job_id = NEW.id
    ORDER BY created_at DESC
    LIMIT 1;
    
    -- Create draft material order
    INSERT INTO public.material_orders (
      workspace_id,
      job_id,
      takeoff_id,
      status,
      expected_delivery_date,
      notes
    ) VALUES (
      NEW.workspace_id,
      NEW.id,
      v_takeoff_id,
      'draft',
      NEW.scheduled_start_date, -- Use scheduled start date as expected delivery
      'Auto-created PO draft on job approval'
    )
    RETURNING id INTO v_order_id;
    
    -- Generate PO draft
    IF v_order_id IS NOT NULL THEN
      SELECT public.generate_purchase_order(v_order_id) INTO v_po_id;
      
      -- Log timeline event
      PERFORM public.log_job_timeline_event(
        p_job_id => NEW.id,
        p_lead_id => NEW.lead_id,
        p_event_type => 'material_po_created',
        p_event_subtype => 'auto_draft',
        p_message => 'PO draft auto-created on job approval',
        p_event_data => jsonb_build_object(
          'material_order_id', v_order_id,
          'po_id', v_po_id
        )
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_create_po_draft_on_approval ON public.roofing_jobs;
CREATE TRIGGER trg_auto_create_po_draft_on_approval
AFTER UPDATE OF status ON public.roofing_jobs
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_po_draft_on_approval();

-- ============================================================================
-- PART 11 — CREATE FUNCTION: CALCULATE SUPPLIER PERFORMANCE SCORE
-- ============================================================================
-- Calculates supplier performance metrics and assigns A-F grade

CREATE OR REPLACE FUNCTION public.calculate_supplier_performance_score(
  p_supplier_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_orders int;
  v_on_time_count int;
  v_late_count int;
  v_issue_count int;
  v_shortage_count int;
  v_on_time_pct numeric;
  v_accuracy_pct numeric;
  v_shortage_frequency_pct numeric;
  v_grade text;
  v_avg_response_hours numeric;
BEGIN
  -- Get order counts
  SELECT 
    COUNT(*) FILTER (WHERE status NOT IN ('cancelled', 'canceled', 'draft')),
    COUNT(*) FILTER (WHERE status = 'delivered' AND actual_delivery_date <= expected_delivery_date),
    COUNT(*) FILTER (WHERE status = 'delivered' AND actual_delivery_date > expected_delivery_date),
    COUNT(*) FILTER (WHERE issue_reported = true),
    COUNT(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM public.material_shortage_alerts 
      WHERE material_order_id = material_orders.id
    ))
  INTO v_total_orders, v_on_time_count, v_late_count, v_issue_count, v_shortage_count
  FROM public.material_orders
  WHERE supplier_id = p_supplier_id;
  
  -- Calculate percentages
  IF v_total_orders > 0 THEN
    v_on_time_pct := (v_on_time_count::numeric / v_total_orders::numeric) * 100;
    v_accuracy_pct := ((v_total_orders - v_issue_count)::numeric / v_total_orders::numeric) * 100;
    v_shortage_frequency_pct := (v_shortage_count::numeric / v_total_orders::numeric) * 100;
  ELSE
    v_on_time_pct := 100;
    v_accuracy_pct := 100;
    v_shortage_frequency_pct := 0;
  END IF;
  
  -- Calculate average response time (simplified - can be enhanced)
  SELECT AVG(EXTRACT(EPOCH FROM (response_received_at - sent_at)) / 3600)
  INTO v_avg_response_hours
  FROM public.supplier_communications
  WHERE supplier_id = p_supplier_id
    AND response_received_at IS NOT NULL;
  
  -- Determine grade based on metrics
  -- A: >90% on-time, >95% accuracy, <5% shortages
  -- B: >80% on-time, >90% accuracy, <10% shortages
  -- C: >70% on-time, >80% accuracy, <15% shortages
  -- D: >60% on-time, >70% accuracy, <20% shortages
  -- F: Below D thresholds
  IF v_on_time_pct >= 90 AND v_accuracy_pct >= 95 AND v_shortage_frequency_pct < 5 THEN
    v_grade := 'A';
  ELSIF v_on_time_pct >= 80 AND v_accuracy_pct >= 90 AND v_shortage_frequency_pct < 10 THEN
    v_grade := 'B';
  ELSIF v_on_time_pct >= 70 AND v_accuracy_pct >= 80 AND v_shortage_frequency_pct < 15 THEN
    v_grade := 'C';
  ELSIF v_on_time_pct >= 60 AND v_accuracy_pct >= 70 AND v_shortage_frequency_pct < 20 THEN
    v_grade := 'D';
  ELSE
    v_grade := 'F';
  END IF;
  
  -- Update supplier record
  UPDATE public.suppliers
  SET
    total_orders_count = v_total_orders,
    on_time_delivery_count = v_on_time_count,
    late_delivery_count = v_late_count,
    on_time_delivery_pct = v_on_time_pct,
    accuracy_pct = v_accuracy_pct,
    shortage_frequency_pct = v_shortage_frequency_pct,
    avg_response_time_hours = v_avg_response_hours,
    supplier_grade = v_grade,
    last_performance_calc_at = now(),
    updated_at = now()
  WHERE id = p_supplier_id;
END;
$$;

COMMENT ON FUNCTION public.calculate_supplier_performance_score IS 'Block 25260: Calculates supplier performance metrics and assigns A-F grade';

-- ============================================================================
-- PART 12 — CREATE FUNCTION: CHECK MATERIAL READINESS FOR SCHEDULING
-- ============================================================================
-- Checks if materials are ready and blocks scheduling if not

CREATE OR REPLACE FUNCTION public.check_material_readiness_for_scheduling(
  p_job_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job record;
  v_order record;
  v_supplier record;
  v_result jsonb;
  v_ready boolean := true;
  v_reason text;
BEGIN
  -- Get job
  SELECT * INTO v_job FROM public.roofing_jobs WHERE id = p_job_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Job not found');
  END IF;
  
  -- Get latest material order
  SELECT * INTO v_order
  FROM public.material_orders
  WHERE job_id = p_job_id
    AND status NOT IN ('cancelled', 'canceled')
  ORDER BY created_at DESC
  LIMIT 1;
  
  -- Check various conditions
  IF v_order.id IS NULL THEN
    v_ready := false;
    v_reason := 'No material order created';
  ELSIF v_order.status = 'draft' THEN
    v_ready := false;
    v_reason := 'PO not sent to supplier';
  ELSIF v_order.status = 'sent_to_supplier' AND NOT v_order.supplier_confirmed THEN
    v_ready := false;
    v_reason := 'PO not confirmed by supplier';
  ELSIF EXISTS (
    SELECT 1 FROM public.material_shortage_alerts
    WHERE job_id = p_job_id AND status = 'detected'
  ) THEN
    v_ready := false;
    v_reason := 'Material shortage alert active';
  ELSIF v_order.supplier_id IS NOT NULL THEN
    -- Check supplier reliability
    SELECT * INTO v_supplier FROM public.suppliers WHERE id = v_order.supplier_id;
    IF v_supplier.supplier_grade IN ('D', 'F') THEN
      v_ready := false;
      v_reason := format('Supplier %s flagged as unreliable (Grade: %s)', v_supplier.name, v_supplier.supplier_grade);
    END IF;
  END IF;
  
  -- Update job
  UPDATE public.roofing_jobs
  SET
    materials_ready_for_scheduling = v_ready,
    materials_blocking_scheduling = NOT v_ready,
    materials_blocking_reason = CASE WHEN NOT v_ready THEN v_reason ELSE NULL END,
    materials_ready_checked_at = now(),
    updated_at = now()
  WHERE id = p_job_id;
  
  -- Return result
  v_result := jsonb_build_object(
    'ready', v_ready,
    'reason', v_reason,
    'order_status', v_order.status,
    'supplier_confirmed', v_order.supplier_confirmed
  );
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.check_material_readiness_for_scheduling IS 'Block 25260: Checks if materials are ready for scheduling and blocks if not';

-- ============================================================================
-- PART 13 — CREATE FUNCTION: HANDLE MATERIAL SHORTAGE ALERT
-- ============================================================================
-- Processes material shortage alerts: alerts ops, supplier, creates task, delays schedule

CREATE OR REPLACE FUNCTION public.handle_material_shortage_alert(
  p_alert_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_alert record;
  v_job record;
  v_order record;
  v_task_id uuid;
  v_result jsonb;
BEGIN
  -- Get alert
  SELECT * INTO v_alert FROM public.material_shortage_alerts WHERE id = p_alert_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Alert not found');
  END IF;
  
  -- Get job
  SELECT * INTO v_job FROM public.roofing_jobs WHERE id = v_alert.job_id;
  
  -- Get order
  SELECT * INTO v_order FROM public.material_orders WHERE id = v_alert.material_order_id;
  
  -- Create task for ops
  INSERT INTO public.roofing_tasks (
    workspace_id,
    job_id,
    category,
    title,
    description,
    priority,
    status,
    due_date,
    creation_source,
    auto_source_details
  ) VALUES (
    v_alert.workspace_id,
    v_alert.job_id,
    'job',
    format('Material Shortage: %s', v_alert.item_description),
    format('Shortage detected: %s. Quantity needed: %s. Source: %s', 
           v_alert.item_description, 
           COALESCE(v_alert.quantity_needed::text, 'TBD'),
           v_alert.detected_from),
    'high',
    'open',
    CURRENT_DATE + INTERVAL '1 day',
    'auto',
    jsonb_build_object('alert_id', p_alert_id)
  )
  RETURNING id INTO v_task_id;
  
  -- Update alert
  UPDATE public.material_shortage_alerts
  SET
    ops_alerted = true,
    ops_alerted_at = now(),
    task_created = true,
    task_id = v_task_id,
    updated_at = now()
  WHERE id = p_alert_id;
  
  -- If job is scheduled, consider delaying
  IF v_job.scheduled_start_date IS NOT NULL THEN
    UPDATE public.roofing_jobs
    SET
      materials_blocking_scheduling = true,
      materials_blocking_reason = format('Material shortage: %s', v_alert.item_description),
      updated_at = now()
    WHERE id = v_alert.job_id;
  END IF;
  
  -- Log timeline event
  PERFORM public.log_job_timeline_event(
    p_job_id => v_alert.job_id,
    p_lead_id => v_job.lead_id,
    p_event_type => 'material_shortage_alert',
    p_event_subtype => v_alert.shortage_type,
    p_message => format('Material shortage detected: %s', v_alert.item_description),
    p_event_data => jsonb_build_object(
      'alert_id', p_alert_id,
      'item', v_alert.item_description,
      'quantity_needed', v_alert.quantity_needed,
      'issued_by', v_alert.issued_by
    )
  );
  
  -- Update job health score (handled by trigger)
  
  v_result := jsonb_build_object(
    'success', true,
    'task_id', v_task_id,
    'ops_alerted', true
  );
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.handle_material_shortage_alert IS 'Block 25260: Processes material shortage alerts: alerts ops, creates task, delays schedule';

-- ============================================================================
-- PART 14 — CREATE TRIGGERS FOR TIMELINE SYNC
-- ============================================================================
-- Auto-log material events to job timeline

-- Trigger: Log PO creation
CREATE OR REPLACE FUNCTION public.trigger_log_po_creation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_job_id uuid;
  v_lead_id uuid;
BEGIN
  SELECT job_id INTO v_job_id FROM public.material_orders WHERE id = NEW.material_order_id;
  SELECT lead_id INTO v_lead_id FROM public.roofing_jobs WHERE id = v_job_id;
  
  PERFORM public.log_job_timeline_event(
    p_job_id => v_job_id,
    p_lead_id => v_lead_id,
    p_event_type => 'material_po_created',
    p_message => format('PO %s created', NEW.po_number),
    p_event_data => jsonb_build_object('po_id', NEW.id, 'po_number', NEW.po_number)
  );
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_po_creation ON public.purchase_orders;
CREATE TRIGGER trg_log_po_creation
AFTER INSERT ON public.purchase_orders
FOR EACH ROW
EXECUTE FUNCTION public.trigger_log_po_creation();

-- Trigger: Log PO confirmation
CREATE OR REPLACE FUNCTION public.trigger_log_po_confirmation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_job_id uuid;
  v_lead_id uuid;
BEGIN
  IF NEW.confirmed_at IS NOT NULL AND (OLD.confirmed_at IS NULL OR OLD.confirmed_at IS DISTINCT FROM NEW.confirmed_at) THEN
    SELECT job_id INTO v_job_id FROM public.material_orders WHERE id = NEW.material_order_id;
    SELECT lead_id INTO v_lead_id FROM public.roofing_jobs WHERE id = v_job_id;
    
    PERFORM public.log_job_timeline_event(
      p_job_id => v_job_id,
      p_lead_id => v_lead_id,
      p_event_type => 'supplier_confirmed',
      p_message => format('PO %s confirmed by supplier', NEW.po_number),
      p_event_data => jsonb_build_object('po_id', NEW.id, 'po_number', NEW.po_number)
    );
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_po_confirmation ON public.purchase_orders;
CREATE TRIGGER trg_log_po_confirmation
AFTER UPDATE ON public.purchase_orders
FOR EACH ROW
EXECUTE FUNCTION public.trigger_log_po_confirmation();

-- Trigger: Log delivery events
CREATE OR REPLACE FUNCTION public.trigger_log_delivery_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_job_id uuid;
  v_lead_id uuid;
  v_event_type text;
BEGIN
  v_job_id := NEW.job_id;
  SELECT lead_id INTO v_lead_id FROM public.roofing_jobs WHERE id = v_job_id;
  
  -- Determine event type
  IF NEW.status = 'scheduled' AND (OLD.status IS NULL OR OLD.status != 'scheduled') THEN
    v_event_type := 'supplier_delivery_scheduled';
    PERFORM public.log_job_timeline_event(
      p_job_id => v_job_id,
      p_lead_id => v_lead_id,
      p_event_type => v_event_type,
      p_message => format('Delivery scheduled for %s', NEW.delivery_date),
      p_event_data => jsonb_build_object('delivery_id', NEW.id, 'delivery_date', NEW.delivery_date)
    );
  ELSIF NEW.status = 'delivered' AND (OLD.status IS NULL OR OLD.status != 'delivered') THEN
    v_event_type := 'supplier_delivery_completed';
    PERFORM public.log_job_timeline_event(
      p_job_id => v_job_id,
      p_lead_id => v_lead_id,
      p_event_type => v_event_type,
      p_message => format('Materials delivered on %s', NEW.delivery_date),
      p_event_data => jsonb_build_object('delivery_id', NEW.id, 'delivery_date', NEW.delivery_date)
    );
  ELSIF NEW.arrival_confirmed = true AND (OLD.arrival_confirmed IS NULL OR OLD.arrival_confirmed = false) THEN
    PERFORM public.log_job_timeline_event(
      p_job_id => v_job_id,
      p_lead_id => v_lead_id,
      p_event_type => 'material_delivery_confirmed',
      p_message => format('Delivery arrival confirmed by %s', COALESCE(NEW.arrival_confirmed_by, 'crew')),
      p_event_data => jsonb_build_object('delivery_id', NEW.id, 'confirmed_by', NEW.arrival_confirmed_by)
    );
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_delivery_event ON public.material_deliveries;
CREATE TRIGGER trg_log_delivery_event
AFTER INSERT OR UPDATE ON public.material_deliveries
FOR EACH ROW
EXECUTE FUNCTION public.trigger_log_delivery_event();

-- Trigger: Log color confirmation
CREATE OR REPLACE FUNCTION public.trigger_log_color_confirmation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_lead_id uuid;
BEGIN
  SELECT lead_id INTO v_lead_id FROM public.roofing_jobs WHERE id = NEW.job_id;
  
  IF NEW.homeowner_confirmed = true AND (OLD.homeowner_confirmed IS NULL OR OLD.homeowner_confirmed = false) THEN
    PERFORM public.log_job_timeline_event(
      p_job_id => NEW.job_id,
      p_lead_id => v_lead_id,
      p_event_type => 'homeowner_confirmation',
      p_event_subtype => 'color_confirmation',
      p_message => format('Homeowner confirmed shingle color: %s', NEW.shingle_color),
      p_event_data => jsonb_build_object('color_confirmation_id', NEW.id, 'color', NEW.shingle_color)
    );
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_color_confirmation ON public.material_color_confirmations;
CREATE TRIGGER trg_log_color_confirmation
AFTER UPDATE ON public.material_color_confirmations
FOR EACH ROW
EXECUTE FUNCTION public.trigger_log_color_confirmation();

-- ============================================================================
-- PART 15 — CREATE TRIGGER TO UPDATE SUPPLIER PERFORMANCE ON ORDER COMPLETION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_update_supplier_performance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Recalculate supplier performance when order is delivered or issues occur
  IF NEW.status = 'delivered' OR NEW.issue_reported = true THEN
    IF NEW.supplier_id IS NOT NULL THEN
      PERFORM public.calculate_supplier_performance_score(NEW.supplier_id);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_supplier_performance ON public.material_orders;
CREATE TRIGGER trg_update_supplier_performance
AFTER UPDATE ON public.material_orders
FOR EACH ROW
WHEN (
  OLD.status IS DISTINCT FROM NEW.status 
  OR OLD.issue_reported IS DISTINCT FROM NEW.issue_reported
)
EXECUTE FUNCTION public.trigger_update_supplier_performance();

-- ============================================================================
-- PART 16 — ROW LEVEL SECURITY POLICIES
-- ============================================================================

ALTER TABLE public.material_color_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_performance_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_material_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homeowner_material_notifications ENABLE ROW LEVEL SECURITY;

-- Color Confirmations
CREATE POLICY "Users can manage color confirmations in their workspace"
  ON public.material_color_confirmations FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Supplier Performance History
CREATE POLICY "Users can view supplier performance history in their workspace"
  ON public.supplier_performance_history FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Crew Material Proofs
CREATE POLICY "Users can manage crew material proofs in their workspace"
  ON public.crew_material_proofs FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Homeowner Material Notifications
CREATE POLICY "Users can manage homeowner material notifications in their workspace"
  ON public.homeowner_material_notifications FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 17 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_color_confirmations TO authenticated;
GRANT SELECT ON public.supplier_performance_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crew_material_proofs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.homeowner_material_notifications TO authenticated;

GRANT EXECUTE ON FUNCTION public.calculate_supplier_performance_score(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_material_readiness_for_scheduling(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_material_shortage_alert(uuid) TO authenticated;

COMMENT ON TABLE public.material_color_confirmations IS 'Block 25260: Homeowner color confirmation system to prevent wrong color disasters';
COMMENT ON TABLE public.supplier_performance_history IS 'Block 25260: Historical supplier performance tracking';
COMMENT ON TABLE public.crew_material_proofs IS 'Block 25260: Crew uploads of material wrappers, leftover inventory, proof of proper usage';
COMMENT ON TABLE public.homeowner_material_notifications IS 'Block 25260: Notifications sent to homeowners about material deliveries';




































