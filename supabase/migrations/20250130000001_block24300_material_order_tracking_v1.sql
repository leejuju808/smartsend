-- =========================================================
-- Block 24300 — SmartSend Roofing Material Orders & Supplier Tracking v1
-- (Material Takeoffs • Supplier Ordering • Delivery Tracking • On-Site Readiness)
-- =========================================================
-- 
-- FULL ROOFING MATERIALS ENGINE — ZERO FLUFF.
-- This turns SmartSend from a "lead machine" into a job execution system,
-- helping roofers prevent delays, shortages, and scheduling chaos.
--
-- Features:
-- 1. Material Takeoff (structured fields for shingles, underlayment, accessories, etc.)
-- 2. Supplier Order Creation (1-click PO generation)
-- 3. Email-based PO system (low-tech option for Day 1 MVP)
-- 4. Real-time Order Status Tracking
-- 5. Delivery Management
-- 6. Material Shortage Alerts (AI Intelligence)
-- 7. Cost + Job Profit Tracking
-- 8. Automated Workflows

-- ============================================================================
-- PART 1 — CREATE material_takeoffs TABLE
-- ============================================================================
-- Structured takeoff fields that roofers fill out once per job
-- This replaces free-form notes with organized, actionable data

CREATE TABLE IF NOT EXISTS public.material_takeoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  -- Shingles
  shingle_brand text,              -- "Owens Corning", "GAF", "Malarkey", etc.
  shingle_color text,              -- "Weathered Wood", "Charcoal", etc.
  shingle_bundle_count numeric,    -- Number of bundles needed

  -- Underlayment
  underlayment_type text,          -- "Synthetic", "Felt", "Ice & Water Shield"
  underlayment_rolls numeric,      -- Number of rolls needed

  -- Accessories
  ridge_cap_count numeric,        -- Linear feet or count
  drip_edge_count numeric,         -- Linear feet
  flashings_count numeric,          -- Count or linear feet
  sealant_count numeric,           -- Tubes or gallons

  -- Ventilation
  box_vents_count numeric,         -- Number of box vents
  ridge_vent_count numeric,        -- Linear feet
  exhaust_fan_count numeric,       -- Number of exhaust fans

  -- Plywood / Decking Repair
  plywood_sheets_estimate numeric,  -- Estimated sheets needed

  -- Fasteners
  nails_count numeric,             -- Boxes or pounds
  staples_count numeric,           -- Boxes or pounds

  -- Dump / Disposal
  dump_trailer boolean DEFAULT false,
  dumpster_delivery boolean DEFAULT false,

  -- Notes
  notes text,                      -- "Chimney needs special flashing", "Valley is soft — order extra plywood"

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS material_takeoffs_job_idx
  ON public.material_takeoffs(job_id);

CREATE INDEX IF NOT EXISTS material_takeoffs_workspace_idx
  ON public.material_takeoffs(workspace_id);

-- ============================================================================
-- PART 2 — ENHANCE material_orders TABLE
-- ============================================================================
-- Add fields for PO generation, email tracking, and delivery management

ALTER TABLE public.material_orders
  ADD COLUMN IF NOT EXISTS takeoff_id uuid REFERENCES public.material_takeoffs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_address text,
  ADD COLUMN IF NOT EXISTS delivery_time text,
  ADD COLUMN IF NOT EXISTS on_site_placement_instructions text,
  ADD COLUMN IF NOT EXISTS crew_confirmed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS crew_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS po_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS po_sent_to_email text,
  ADD COLUMN IF NOT EXISTS supplier_confirmed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS supplier_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS issue_reported boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS issue_description text,
  ADD COLUMN IF NOT EXISTS materials_approved_for_build boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS materials_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS labor_estimate numeric,
  ADD COLUMN IF NOT EXISTS estimated_profit numeric,
  ADD COLUMN IF NOT EXISTS estimated_profit_margin numeric;

-- Update status check constraint to include new statuses from spec
ALTER TABLE public.material_orders
  DROP CONSTRAINT IF EXISTS material_orders_status_check;

ALTER TABLE public.material_orders
  ADD CONSTRAINT material_orders_status_check CHECK (
    status IN (
      'draft',
      'sent_to_supplier',
      'confirmed',
      'scheduled_for_delivery',
      'delivered',
      'issue_reported',
      'materials_approved_for_build',
      -- Legacy statuses
      'ordered',
      'on_truck',
      'partial',
      'cancelled',
      'canceled',
      'en_route',
      'delayed'
    )
  );

-- ============================================================================
-- PART 3 — CREATE purchase_orders TABLE
-- ============================================================================
-- Stores generated PO documents and email tracking

CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_order_id uuid NOT NULL REFERENCES public.material_orders(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,

  po_number text NOT NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  
  -- Company info
  roofer_company_name text,
  roofer_contact_phone text,
  
  -- Delivery info
  delivery_address text,
  delivery_date date,
  
  -- PO content
  material_list jsonb,              -- Array of {description, quantity, unit, unit_price}
  notes text,
  
  -- Email tracking
  sent_to_email text,
  sent_at timestamptz,
  confirmed_at timestamptz,
  confirmation_email_received boolean DEFAULT false,
  
  -- PDF storage (optional - can store PDF URL or generate on-demand)
  pdf_url text,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS purchase_orders_material_order_idx
  ON public.purchase_orders(material_order_id);

CREATE INDEX IF NOT EXISTS purchase_orders_job_idx
  ON public.purchase_orders(job_id);

CREATE INDEX IF NOT EXISTS purchase_orders_workspace_idx
  ON public.purchase_orders(workspace_id);

-- ============================================================================
-- PART 4 — CREATE material_shortage_alerts TABLE
-- ============================================================================
-- AI-detected material shortages from crew notes

CREATE TABLE IF NOT EXISTS public.material_shortage_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  material_order_id uuid REFERENCES public.material_orders(id) ON DELETE SET NULL,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  detected_from text,              -- "crew_note", "delivery_report", etc.
  detected_text text,              -- Original text that triggered detection
  shortage_type text,              -- "missing_item", "wrong_color", "insufficient_quantity"
  item_description text,           -- What's missing/wrong
  quantity_needed numeric,
  
  ai_confidence numeric,           -- 0-100 confidence score
  status text CHECK (status IN ('detected', 'order_created', 'resolved', 'dismissed')) DEFAULT 'detected',
  
  supplemental_order_id uuid REFERENCES public.material_orders(id) ON DELETE SET NULL,
  
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS material_shortage_alerts_job_idx
  ON public.material_shortage_alerts(job_id);

CREATE INDEX IF NOT EXISTS material_shortage_alerts_status_idx
  ON public.material_shortage_alerts(status)
  WHERE status = 'detected';

-- ============================================================================
-- PART 5 — CREATE material_delivery_issues TABLE
-- ============================================================================
-- Track delivery problems reported by crew

CREATE TABLE IF NOT EXISTS public.material_delivery_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_order_id uuid NOT NULL REFERENCES public.material_orders(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  issue_type text CHECK (issue_type IN (
    'wrong_location',
    'blocking_access',
    'damaged_materials',
    'wrong_items',
    'missing_items',
    'late_delivery',
    'other'
  )),
  
  description text,
  reported_by text,               -- Crew member name or user_id
  reported_at timestamptz DEFAULT now(),
  
  resolved boolean DEFAULT false,
  resolved_at timestamptz,
  resolution_notes text,
  
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS material_delivery_issues_order_idx
  ON public.material_delivery_issues(material_order_id);

CREATE INDEX IF NOT EXISTS material_delivery_issues_job_idx
  ON public.material_delivery_issues(job_id);

-- ============================================================================
-- PART 6 — FUNCTION: generate_purchase_order
-- ============================================================================
-- Generates a purchase order from a material takeoff and order

CREATE OR REPLACE FUNCTION public.generate_purchase_order(
  p_material_order_id uuid,
  p_roofer_company_name text DEFAULT NULL,
  p_roofer_contact_phone text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order record;
  v_takeoff record;
  v_supplier record;
  v_job record;
  v_po_id uuid;
  v_po_number text;
  v_material_list jsonb := '[]'::jsonb;
  v_item jsonb;
BEGIN
  -- Get order details
  SELECT mo.*, rj.lead_id
  INTO v_order
  FROM public.material_orders mo
  JOIN public.roofing_jobs rj ON rj.id = mo.job_id
  WHERE mo.id = p_material_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Material order not found';
  END IF;

  -- Get supplier
  IF v_order.supplier_id IS NOT NULL THEN
    SELECT * INTO v_supplier FROM public.suppliers WHERE id = v_order.supplier_id;
  END IF;

  -- Get takeoff if exists
  IF v_order.takeoff_id IS NOT NULL THEN
    SELECT * INTO v_takeoff FROM public.material_takeoffs WHERE id = v_order.takeoff_id;
  END IF;

  -- Get job for delivery address
  SELECT * INTO v_job FROM public.roofing_jobs WHERE id = v_order.job_id;

  -- Generate PO number
  v_po_number := 'PO-' || to_char(now(), 'YYYYMMDD') || '-' || substr(v_order.id::text, 1, 8);

  -- Build material list from takeoff or order items
  IF v_takeoff IS NOT NULL THEN
    -- Build structured list from takeoff
    IF v_takeoff.shingle_bundle_count > 0 THEN
      v_item := jsonb_build_object(
        'description', COALESCE(v_takeoff.shingle_brand || ' ' || v_takeoff.shingle_color, 'Shingles'),
        'quantity', v_takeoff.shingle_bundle_count,
        'unit', 'bundles'
      );
      v_material_list := v_material_list || v_item;
    END IF;

    IF v_takeoff.underlayment_rolls > 0 THEN
      v_item := jsonb_build_object(
        'description', COALESCE(v_takeoff.underlayment_type, 'Underlayment'),
        'quantity', v_takeoff.underlayment_rolls,
        'unit', 'rolls'
      );
      v_material_list := v_material_list || v_item;
    END IF;

    -- Add other items as needed...
  ELSE
    -- Fall back to order items
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'description', description,
        'quantity', quantity,
        'unit', COALESCE(unit, 'each'),
        'unit_price', unit_price
      )
    ), '[]'::jsonb)
    INTO v_material_list
    FROM public.material_order_items
    WHERE material_order_id = p_material_order_id;
  END IF;

  -- Create PO record
  INSERT INTO public.purchase_orders (
    material_order_id,
    workspace_id,
    job_id,
    po_number,
    supplier_id,
    roofer_company_name,
    roofer_contact_phone,
    delivery_address,
    delivery_date,
    material_list,
    notes,
    sent_to_email
  ) VALUES (
    p_material_order_id,
    v_order.workspace_id,
    v_order.job_id,
    v_po_number,
    v_order.supplier_id,
    p_roofer_company_name,
    p_roofer_contact_phone,
    COALESCE(v_order.delivery_address, 'Job Site'),
    v_order.expected_delivery_date,
    v_material_list,
    v_order.notes,
    v_supplier.email
  )
  RETURNING id INTO v_po_id;

  -- Update order
  UPDATE public.material_orders
  SET
    po_sent_at = now(),
    po_sent_to_email = v_supplier.email,
    status = CASE WHEN status = 'draft' THEN 'sent_to_supplier' ELSE status END,
    updated_at = now()
  WHERE id = p_material_order_id;

  RETURN v_po_id;
END;
$$;

COMMENT ON FUNCTION public.generate_purchase_order IS 'Generates a purchase order from a material order and takeoff';

-- ============================================================================
-- PART 7 — FUNCTION: detect_material_shortage
-- ============================================================================
-- AI-powered shortage detection from crew notes

CREATE OR REPLACE FUNCTION public.detect_material_shortage(
  p_job_id uuid,
  p_text text,
  p_source text DEFAULT 'crew_note'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_alert_id uuid;
  v_shortage_type text;
  v_item_description text;
  v_confidence numeric;
  v_order_id uuid;
BEGIN
  -- Simple keyword-based detection (can be enhanced with AI/ML later)
  -- Look for common shortage indicators
  IF p_text ILIKE '%missing%' OR p_text ILIKE '%need%' OR p_text ILIKE '%short%' THEN
    v_shortage_type := 'missing_item';
    v_confidence := 70;
    
    -- Try to extract item name
    IF p_text ILIKE '%ridge cap%' OR p_text ILIKE '%ridgecap%' THEN
      v_item_description := 'Ridge Cap';
      v_confidence := 85;
    ELSIF p_text ILIKE '%plywood%' OR p_text ILIKE '%decking%' THEN
      v_item_description := 'Plywood/Decking';
      v_confidence := 85;
    ELSIF p_text ILIKE '%shingle%' THEN
      v_item_description := 'Shingles';
      v_confidence := 80;
    ELSE
      v_item_description := 'Materials';
      v_confidence := 60;
    END IF;
  ELSIF p_text ILIKE '%wrong color%' OR p_text ILIKE '%wrong color%' THEN
    v_shortage_type := 'wrong_color';
    v_item_description := 'Shingles (wrong color)';
    v_confidence := 90;
  ELSIF p_text ILIKE '%not enough%' OR p_text ILIKE '%insufficient%' THEN
    v_shortage_type := 'insufficient_quantity';
    v_item_description := 'Materials';
    v_confidence := 75;
  ELSE
    -- No clear shortage detected
    RETURN NULL;
  END IF;

  -- Get current order for this job
  SELECT id INTO v_order_id
  FROM public.material_orders
  WHERE job_id = p_job_id
    AND status NOT IN ('cancelled', 'canceled')
  ORDER BY created_at DESC
  LIMIT 1;

  -- Create alert
  INSERT INTO public.material_shortage_alerts (
    job_id,
    material_order_id,
    workspace_id,
    detected_from,
    detected_text,
    shortage_type,
    item_description,
    ai_confidence
  )
  SELECT
    p_job_id,
    v_order_id,
    rj.workspace_id,
    p_source,
    p_text,
    v_shortage_type,
    v_item_description,
    v_confidence
  FROM public.roofing_jobs rj
  WHERE rj.id = p_job_id
  RETURNING id INTO v_alert_id;

  RETURN v_alert_id;
END;
$$;

COMMENT ON FUNCTION public.detect_material_shortage IS 'Detects material shortages from crew notes using keyword matching';

-- ============================================================================
-- PART 8 — FUNCTION: calculate_job_profit
-- ============================================================================
-- Calculates estimated profit and margin for a job

CREATE OR REPLACE FUNCTION public.calculate_job_profit(p_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job record;
  v_material_cost numeric := 0;
  v_labor_cost numeric := 0;
  v_total_cost numeric := 0;
  v_revenue numeric := 0;
  v_profit numeric := 0;
  v_margin numeric := 0;
BEGIN
  -- Get job
  SELECT * INTO v_job FROM public.roofing_jobs WHERE id = p_job_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_revenue := COALESCE(v_job.job_value, 0);

  -- Sum material costs from orders
  SELECT COALESCE(SUM(total), 0)
  INTO v_material_cost
  FROM public.material_orders
  WHERE job_id = p_job_id
    AND status NOT IN ('cancelled', 'canceled');

  -- Get labor estimate (if stored in order)
  SELECT COALESCE(MAX(labor_estimate), 0)
  INTO v_labor_cost
  FROM public.material_orders
  WHERE job_id = p_job_id;

  v_total_cost := v_material_cost + v_labor_cost;
  v_profit := v_revenue - v_total_cost;
  
  IF v_revenue > 0 THEN
    v_margin := (v_profit / v_revenue) * 100;
  END IF;

  -- Update order with profit calculations
  UPDATE public.material_orders
  SET
    labor_estimate = v_labor_cost,
    estimated_profit = v_profit,
    estimated_profit_margin = v_margin,
    updated_at = now()
  WHERE job_id = p_job_id;
END;
$$;

COMMENT ON FUNCTION public.calculate_job_profit IS 'Calculates estimated profit and margin for a job based on material and labor costs';

-- ============================================================================
-- PART 9 — TRIGGERS
-- ============================================================================

-- Auto-update updated_at for material_takeoffs
CREATE OR REPLACE FUNCTION public.set_material_takeoffs_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_material_takeoffs_updated_at ON public.material_takeoffs;
CREATE TRIGGER trg_set_material_takeoffs_updated_at
BEFORE UPDATE ON public.material_takeoffs
FOR EACH ROW
EXECUTE FUNCTION public.set_material_takeoffs_updated_at();

-- Auto-update updated_at for purchase_orders
CREATE OR REPLACE FUNCTION public.set_purchase_orders_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_purchase_orders_updated_at ON public.purchase_orders;
CREATE TRIGGER trg_set_purchase_orders_updated_at
BEFORE UPDATE ON public.purchase_orders
FOR EACH ROW
EXECUTE FUNCTION public.set_purchase_orders_updated_at();

-- Auto-calculate profit when material order changes
CREATE OR REPLACE FUNCTION public.trigger_calculate_job_profit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.calculate_job_profit(NEW.job_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_calculate_job_profit ON public.material_orders;
CREATE TRIGGER trg_calculate_job_profit
AFTER INSERT OR UPDATE OF total, labor_estimate ON public.material_orders
FOR EACH ROW
EXECUTE FUNCTION public.trigger_calculate_job_profit();

-- ============================================================================
-- PART 10 — ROW LEVEL SECURITY POLICIES
-- ============================================================================

ALTER TABLE public.material_takeoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_shortage_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_delivery_issues ENABLE ROW LEVEL SECURITY;

-- Material Takeoffs
CREATE POLICY "Users can manage takeoffs in their workspace"
  ON public.material_takeoffs FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Purchase Orders
CREATE POLICY "Users can view purchase orders in their workspace"
  ON public.purchase_orders FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create purchase orders in their workspace"
  ON public.purchase_orders FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update purchase orders in their workspace"
  ON public.purchase_orders FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Material Shortage Alerts
CREATE POLICY "Users can view shortage alerts in their workspace"
  ON public.material_shortage_alerts FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage shortage alerts in their workspace"
  ON public.material_shortage_alerts FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Material Delivery Issues
CREATE POLICY "Users can manage delivery issues in their workspace"
  ON public.material_delivery_issues FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 11 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_takeoffs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_shortage_alerts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_delivery_issues TO authenticated;

GRANT EXECUTE ON FUNCTION public.generate_purchase_order(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_material_shortage(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_job_profit(uuid) TO authenticated;






































