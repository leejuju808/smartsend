-- =========================================================
-- Block 24340 — SmartSend Roofing Supplier Communication Engine v1
-- (Auto-Messages to Suppliers • Confirmations • Delivery Reminders • Issue Resolution)
-- =========================================================
-- 
-- This engine turns SmartSend into the middleman roofers always wanted between
-- their jobs and their suppliers — automatically handling confirmations, reminders,
-- and problems without roofers needing to babysit anything.

-- ============================================================================
-- PART 1 — CREATE supplier_communications TABLE
-- ============================================================================
-- Tracks all automated messages sent to suppliers (POs, reminders, issue resolution)

CREATE TABLE IF NOT EXISTS public.supplier_communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  material_order_id uuid NOT NULL REFERENCES public.material_orders(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,

  communication_type text NOT NULL CHECK (communication_type IN (
    'po_sent',
    'confirmation_request',
    'delivery_reminder',
    'delivery_coordination',
    'issue_resolution',
    'eta_update_request'
  )),

  subject text NOT NULL,
  body text NOT NULL,
  recipient_email text NOT NULL,
  
  status text DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'failed', 'bounced')),
  sent_at timestamptz DEFAULT now(),
  
  -- Response tracking
  response_received_at timestamptz,
  response_parsed boolean DEFAULT false,
  response_summary text, -- AI-parsed summary of supplier response
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb, -- Store email message IDs, thread IDs, etc.

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS supplier_communications_order_idx
  ON public.supplier_communications(material_order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS supplier_communications_supplier_idx
  ON public.supplier_communications(supplier_id);

CREATE INDEX IF NOT EXISTS supplier_communications_job_idx
  ON public.supplier_communications(job_id);

CREATE INDEX IF NOT EXISTS supplier_communications_type_idx
  ON public.supplier_communications(communication_type);

CREATE INDEX IF NOT EXISTS supplier_communications_status_idx
  ON public.supplier_communications(status);

CREATE INDEX IF NOT EXISTS supplier_communications_workspace_idx
  ON public.supplier_communications(workspace_id);

-- ============================================================================
-- PART 2 — CREATE supplier_issues TABLE
-- ============================================================================
-- Tracks issues detected with deliveries (wrong color, missing items, etc.)

CREATE TABLE IF NOT EXISTS public.supplier_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  material_order_id uuid NOT NULL REFERENCES public.material_orders(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,

  issue_type text NOT NULL CHECK (issue_type IN (
    'wrong_color',
    'missing_item',
    'short_quantity',
    'wrong_item',
    'damaged',
    'late_delivery',
    'wrong_address',
    'other'
  )),

  description text NOT NULL,
  detected_by text DEFAULT 'system' CHECK (detected_by IN ('system', 'roofer', 'crew')),
  detected_at timestamptz DEFAULT now(),

  -- Resolution tracking
  status text DEFAULT 'open' CHECK (status IN ('open', 'reported', 'acknowledged', 'resolved', 'closed')),
  reported_at timestamptz,
  resolved_at timestamptz,
  
  -- Communication tracking
  communication_id uuid REFERENCES public.supplier_communications(id),
  supplier_response text,
  resolution_notes text,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS supplier_issues_order_idx
  ON public.supplier_issues(material_order_id);

CREATE INDEX IF NOT EXISTS supplier_issues_status_idx
  ON public.supplier_issues(status);

CREATE INDEX IF NOT EXISTS supplier_issues_workspace_idx
  ON public.supplier_issues(workspace_id);

CREATE INDEX IF NOT EXISTS supplier_issues_job_idx
  ON public.supplier_issues(job_id);

-- ============================================================================
-- PART 3 — CREATE supplier_delivery_reminders TABLE
-- ============================================================================
-- Tracks scheduled delivery reminders (24 hours before delivery)

CREATE TABLE IF NOT EXISTS public.supplier_delivery_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_order_id uuid NOT NULL REFERENCES public.material_orders(id) ON DELETE CASCADE,
  expected_delivery_date date NOT NULL,
  
  reminder_sent_at timestamptz,
  communication_id uuid REFERENCES public.supplier_communications(id),
  
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'skipped')),
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS supplier_delivery_reminders_order_idx
  ON public.supplier_delivery_reminders(material_order_id);

CREATE INDEX IF NOT EXISTS supplier_delivery_reminders_status_idx
  ON public.supplier_delivery_reminders(status, expected_delivery_date);

-- ============================================================================
-- PART 4 — ENHANCE suppliers TABLE
-- ============================================================================
-- Add fields for supplier performance tracking

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS typical_delivery_time_hours int,
  ADD COLUMN IF NOT EXISTS on_time_delivery_count int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS late_delivery_count int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS issue_count int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_delivery_date date,
  ADD COLUMN IF NOT EXISTS preferred_contact_method text CHECK (preferred_contact_method IN ('email', 'phone', 'both'));

COMMENT ON COLUMN public.suppliers.typical_delivery_time_hours IS 'Typical delivery time in hours from order to delivery';
COMMENT ON COLUMN public.suppliers.on_time_delivery_count IS 'Count of on-time deliveries';
COMMENT ON COLUMN public.suppliers.late_delivery_count IS 'Count of late deliveries';
COMMENT ON COLUMN public.suppliers.issue_count IS 'Count of issues reported with this supplier';

-- ============================================================================
-- PART 5 — CREATE FUNCTION TO SEND PO TO SUPPLIER
-- ============================================================================
-- This function generates and sends a PO email to the supplier

CREATE OR REPLACE FUNCTION public.send_po_to_supplier(
  p_material_order_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order public.material_orders%rowtype;
  v_supplier public.suppliers%rowtype;
  v_job public.roofing_jobs%rowtype;
  v_workspace public.workspaces%rowtype;
  v_comm_id uuid;
  v_subject text;
  v_body text;
BEGIN
  -- Get order details
  SELECT * INTO v_order
  FROM public.material_orders
  WHERE id = p_material_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Material order not found: %', p_material_order_id;
  END IF;

  -- Get supplier details
  SELECT * INTO v_supplier
  FROM public.suppliers
  WHERE id = v_order.supplier_id;

  IF NOT FOUND OR v_supplier.email IS NULL THEN
    RAISE EXCEPTION 'Supplier not found or email missing';
  END IF;

  -- Get job details
  SELECT * INTO v_job
  FROM public.roofing_jobs
  WHERE id = v_order.job_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found';
  END IF;

  -- Get workspace
  SELECT * INTO v_workspace
  FROM public.workspaces
  WHERE id = v_order.workspace_id;

  -- Build email subject and body
  v_subject := 'Purchase Order — ' || COALESCE(v_job.title, 'Roofing Job');
  
  v_body := 'Hello ' || COALESCE(v_supplier.contact_name, v_supplier.name) || ',

We are placing a material order for the following job:

Job Name: ' || COALESCE(v_job.title, 'N/A') || '
Site Address: ' || COALESCE(v_job.address || ', ' || v_job.city || ', ' || v_job.state || ' ' || v_job.zip, 'N/A') || '
Requested Delivery Date: ' || COALESCE(v_order.expected_delivery_date::text, 'TBD') || '

Materials:
' || COALESCE(v_order.notes, 'See attached order details') || '

' || CASE WHEN v_order.po_number IS NOT NULL THEN 'PO Number: ' || v_order.po_number || E'\n' ELSE '' END || '

Please confirm receipt and provide an estimated delivery time.

Thank you,
SmartSend Automated System';

  -- Create communication record
  INSERT INTO public.supplier_communications (
    workspace_id,
    material_order_id,
    supplier_id,
    job_id,
    communication_type,
    subject,
    body,
    recipient_email,
    status,
    sent_at
  ) VALUES (
    v_order.workspace_id,
    p_material_order_id,
    v_supplier.id,
    v_job.id,
    'po_sent',
    v_subject,
    v_body,
    v_supplier.email,
    'sent',
    now()
  ) RETURNING id INTO v_comm_id;

  -- Note: Actual email sending will be handled by Edge Function or API route
  -- This function just creates the record

  RETURN v_comm_id;
END;
$$;

COMMENT ON FUNCTION public.send_po_to_supplier IS 'Creates a PO communication record for sending to supplier';

-- ============================================================================
-- PART 6 — CREATE FUNCTION TO SCHEDULE DELIVERY REMINDER
-- ============================================================================
-- Schedules a reminder 24 hours before expected delivery

CREATE OR REPLACE FUNCTION public.schedule_delivery_reminder(
  p_material_order_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order public.material_orders%rowtype;
  v_reminder_id uuid;
BEGIN
  -- Get order details
  SELECT * INTO v_order
  FROM public.material_orders
  WHERE id = p_material_order_id;

  IF NOT FOUND OR v_order.expected_delivery_date IS NULL THEN
    RAISE EXCEPTION 'Material order not found or no delivery date set';
  END IF;

  -- Check if reminder already exists
  SELECT id INTO v_reminder_id
  FROM public.supplier_delivery_reminders
  WHERE material_order_id = p_material_order_id
    AND status = 'pending';

  IF v_reminder_id IS NOT NULL THEN
    RETURN v_reminder_id; -- Already scheduled
  END IF;

  -- Create reminder record
  INSERT INTO public.supplier_delivery_reminders (
    material_order_id,
    expected_delivery_date,
    status
  ) VALUES (
    p_material_order_id,
    v_order.expected_delivery_date,
    'pending'
  ) RETURNING id INTO v_reminder_id;

  RETURN v_reminder_id;
END;
$$;

COMMENT ON FUNCTION public.schedule_delivery_reminder IS 'Schedules a delivery reminder for 24 hours before expected delivery';

-- ============================================================================
-- PART 7 — CREATE FUNCTION TO PARSE SUPPLIER RESPONSE
-- ============================================================================
-- Parses supplier email responses to extract confirmations, ETAs, issues

CREATE OR REPLACE FUNCTION public.parse_supplier_response(
  p_communication_id uuid,
  p_response_text text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_comm public.supplier_communications%rowtype;
  v_order public.material_orders%rowtype;
  v_result jsonb;
BEGIN
  -- Get communication record
  SELECT * INTO v_comm
  FROM public.supplier_communications
  WHERE id = p_communication_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Communication not found';
  END IF;

  -- Get order
  SELECT * INTO v_order
  FROM public.material_orders
  WHERE id = v_comm.material_order_id;

  -- Update communication with response
  UPDATE public.supplier_communications
  SET
    response_received_at = now(),
    response_summary = p_response_text,
    updated_at = now()
  WHERE id = p_communication_id;

  -- Note: Actual AI parsing will be done by Edge Function
  -- This function just stores the response
  -- The parsing logic will extract:
  -- - Confirmation status
  -- - ETA updates
  -- - Issues mentioned
  -- - Delivery details

  v_result := jsonb_build_object(
    'communication_id', p_communication_id,
    'response_received', true,
    'parsed', false -- Will be updated by AI parsing function
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.parse_supplier_response IS 'Stores supplier response and triggers parsing';

-- ============================================================================
-- PART 8 — CREATE FUNCTION TO DETECT AND REPORT ISSUE
-- ============================================================================
-- Detects issues from responses or manual reports

CREATE OR REPLACE FUNCTION public.report_supplier_issue(
  p_material_order_id uuid,
  p_issue_type text,
  p_description text,
  p_detected_by text DEFAULT 'system'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order public.material_orders%rowtype;
  v_issue_id uuid;
  v_comm_id uuid;
BEGIN
  -- Get order details
  SELECT * INTO v_order
  FROM public.material_orders
  WHERE id = p_material_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Material order not found';
  END IF;

  -- Create issue record
  INSERT INTO public.supplier_issues (
    workspace_id,
    material_order_id,
    supplier_id,
    job_id,
    issue_type,
    description,
    detected_by,
    status,
    reported_at
  ) VALUES (
    v_order.workspace_id,
    p_material_order_id,
    v_order.supplier_id,
    v_order.job_id,
    p_issue_type,
    p_description,
    p_detected_by,
    'reported',
    now()
  ) RETURNING id INTO v_issue_id;

  -- Increment supplier issue count
  UPDATE public.suppliers
  SET issue_count = COALESCE(issue_count, 0) + 1
  WHERE id = v_order.supplier_id;

  -- Note: Issue resolution email will be sent by Edge Function
  -- This function just creates the issue record

  RETURN v_issue_id;
END;
$$;

COMMENT ON FUNCTION public.report_supplier_issue IS 'Creates a supplier issue record and triggers resolution communication';

-- ============================================================================
-- PART 9 — CREATE TRIGGER TO AUTO-SEND PO WHEN ORDER CREATED
-- ============================================================================
-- Automatically sends PO when material order status changes to 'ordered'

CREATE OR REPLACE FUNCTION public.auto_send_po_on_order()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_comm_id uuid;
BEGIN
  -- If order status changed to 'ordered' and supplier has email
  IF NEW.status = 'ordered' AND OLD.status != 'ordered' AND NEW.supplier_id IS NOT NULL THEN
    -- Check if supplier has email
    IF EXISTS (
      SELECT 1 FROM public.suppliers 
      WHERE id = NEW.supplier_id AND email IS NOT NULL
    ) THEN
      -- Send PO (creates communication record)
      SELECT public.send_po_to_supplier(NEW.id) INTO v_comm_id;
      
      -- Schedule delivery reminder
      IF NEW.expected_delivery_date IS NOT NULL THEN
        PERFORM public.schedule_delivery_reminder(NEW.id);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_send_po_on_order ON public.material_orders;
CREATE TRIGGER trg_auto_send_po_on_order
AFTER INSERT OR UPDATE ON public.material_orders
FOR EACH ROW
WHEN (NEW.status = 'ordered' AND (OLD.status IS NULL OR OLD.status != 'ordered'))
EXECUTE FUNCTION public.auto_send_po_on_order();

-- ============================================================================
-- PART 10 — ROW LEVEL SECURITY POLICIES
-- ============================================================================

ALTER TABLE public.supplier_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_delivery_reminders ENABLE ROW LEVEL SECURITY;

-- Supplier Communications: Users can view/manage communications in their workspace
CREATE POLICY "Users can view supplier communications in their workspace"
  ON public.supplier_communications FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create supplier communications in their workspace"
  ON public.supplier_communications FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update supplier communications in their workspace"
  ON public.supplier_communications FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Supplier Issues: Users can view/manage issues in their workspace
CREATE POLICY "Users can view supplier issues in their workspace"
  ON public.supplier_issues FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create supplier issues in their workspace"
  ON public.supplier_issues FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update supplier issues in their workspace"
  ON public.supplier_issues FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Delivery Reminders: Users can view reminders for orders in their workspace
CREATE POLICY "Users can view delivery reminders"
  ON public.supplier_delivery_reminders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.material_orders mo
      JOIN public.workspace_members wm ON wm.workspace_id = mo.workspace_id
      WHERE mo.id = supplier_delivery_reminders.material_order_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "System can manage delivery reminders"
  ON public.supplier_delivery_reminders FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- PART 11 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON public.supplier_communications TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.supplier_issues TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.supplier_delivery_reminders TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_po_to_supplier(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_delivery_reminder(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.parse_supplier_response(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_supplier_issue(uuid, text, text, text) TO authenticated;






































