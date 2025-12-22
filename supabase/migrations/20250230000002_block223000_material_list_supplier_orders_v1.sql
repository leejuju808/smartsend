-- ============================================================
-- Block 223000 — SmartSend Roofing "Material List Generator + Supplier Order Integration" v1
-- Full Sprint Step — No Bullshit.
-- ============================================================
-- 
-- This block turns every signed job into:
-- - A clean, editable Material List
-- - One or more Supplier Orders (ABC, Beacon, Local Yard, etc.)
-- - A Delivery Plan (date, time window, drop location)
-- - Status tracking inside SmartSend
--
-- SmartSend becomes the brain of materials + logistics, not just a CRM.
-- ============================================================

-- ============================================================
-- 1. MATERIALS TABLE (Catalog of materials used by a company)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  
  name text NOT NULL,           -- "OC Duration Driftwood"
  category text,                -- "Shingles", "Underlayment", "Flashing"
  unit text,                    -- "bundle", "roll", "sq", "each"
  sku text,                     -- internal SKU
  preferred_supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  default_cost numeric(10,2),
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_materials_company ON public.materials(company_id);
CREATE INDEX IF NOT EXISTS idx_materials_category ON public.materials(company_id, category);
CREATE INDEX IF NOT EXISTS idx_materials_supplier ON public.materials(preferred_supplier_id) WHERE preferred_supplier_id IS NOT NULL;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_materials_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_materials_updated_at ON public.materials;
CREATE TRIGGER trg_materials_updated_at
BEFORE UPDATE ON public.materials
FOR EACH ROW EXECUTE FUNCTION public.set_materials_updated_at();

-- ============================================================
-- 2. SUPPLIERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  
  name text NOT NULL,          -- "ABC Supply - Spokane"
  contact_name text,
  phone text,
  email text,
  delivery_notes text,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_company ON public.suppliers(company_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON public.suppliers(company_id, name);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_suppliers_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_suppliers_updated_at ON public.suppliers;
CREATE TRIGGER trg_suppliers_updated_at
BEFORE UPDATE ON public.suppliers
FOR EACH ROW EXECUTE FUNCTION public.set_suppliers_updated_at();

-- ============================================================
-- 3. MATERIAL_LISTS TABLE (A material list exists per job)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.material_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid, -- Will reference roofing_jobs(id) or jobs(id) - flexible
  estimate_id uuid REFERENCES public.estimates(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'finalized', 'ordered')),
  notes text,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_material_lists_job ON public.material_lists(job_id);
CREATE INDEX IF NOT EXISTS idx_material_lists_estimate ON public.material_lists(estimate_id);
CREATE INDEX IF NOT EXISTS idx_material_lists_status ON public.material_lists(status);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_material_lists_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_material_lists_updated_at ON public.material_lists;
CREATE TRIGGER trg_material_lists_updated_at
BEFORE UPDATE ON public.material_lists
FOR EACH ROW EXECUTE FUNCTION public.set_material_lists_updated_at();

-- ============================================================
-- 4. MATERIAL_LIST_ITEMS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.material_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_list_id uuid NOT NULL REFERENCES public.material_lists(id) ON DELETE CASCADE,
  material_id uuid REFERENCES public.materials(id) ON DELETE SET NULL,
  
  description text,         -- override label if needed
  quantity numeric(10,2) NOT NULL,
  unit text,
  waste_factor numeric(5,2) DEFAULT 0,     -- %, optional
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_material_list_items_list ON public.material_list_items(material_list_id);
CREATE INDEX IF NOT EXISTS idx_material_list_items_material ON public.material_list_items(material_id) WHERE material_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_material_list_items_supplier ON public.material_list_items(supplier_id) WHERE supplier_id IS NOT NULL;

-- ============================================================
-- 5. SUPPLIER_ORDERS TABLE (One material list → 1+ supplier orders)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.supplier_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  job_id uuid, -- Will reference roofing_jobs(id) or jobs(id) - flexible
  material_list_id uuid REFERENCES public.material_lists(id) ON DELETE SET NULL,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  
  po_number text,           -- internal PO
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'confirmed', 'scheduled', 'delivered')),
  requested_delivery_date date,
  requested_delivery_window text CHECK (requested_delivery_window IN ('AM', 'PM', 'Any')),
  drop_location text,       -- "Driveway front left", "Back alley"
  notes text,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_orders_company ON public.supplier_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_supplier_orders_job ON public.supplier_orders(job_id);
CREATE INDEX IF NOT EXISTS idx_supplier_orders_material_list ON public.supplier_orders(material_list_id) WHERE material_list_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_supplier_orders_supplier ON public.supplier_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_orders_status ON public.supplier_orders(status);
CREATE INDEX IF NOT EXISTS idx_supplier_orders_po ON public.supplier_orders(po_number) WHERE po_number IS NOT NULL;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_supplier_orders_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_supplier_orders_updated_at ON public.supplier_orders;
CREATE TRIGGER trg_supplier_orders_updated_at
BEFORE UPDATE ON public.supplier_orders
FOR EACH ROW EXECUTE FUNCTION public.set_supplier_orders_updated_at();

-- ============================================================
-- 6. SUPPLIER_ORDER_ITEMS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.supplier_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_order_id uuid NOT NULL REFERENCES public.supplier_orders(id) ON DELETE CASCADE,
  material_id uuid REFERENCES public.materials(id) ON DELETE SET NULL,
  
  description text,         -- override if needed
  quantity numeric(10,2) NOT NULL,
  unit text,
  
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_order_items_order ON public.supplier_order_items(supplier_order_id);
CREATE INDEX IF NOT EXISTS idx_supplier_order_items_material ON public.supplier_order_items(material_id) WHERE material_id IS NOT NULL;

-- ============================================================
-- 7. DELIVERY_EVENTS TABLE (Future-proof for API/webhook integration)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_order_id uuid NOT NULL REFERENCES public.supplier_orders(id) ON DELETE CASCADE,
  
  event_type text NOT NULL CHECK (event_type IN ('scheduled', 'in_transit', 'delivered', 'issue_reported')),
  event_time timestamptz DEFAULT now(),
  notes text,
  
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_events_order ON public.delivery_events(supplier_order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_events_type ON public.delivery_events(event_type);
CREATE INDEX IF NOT EXISTS idx_delivery_events_time ON public.delivery_events(event_time DESC);

-- ============================================================
-- 8. ROW LEVEL SECURITY POLICIES
-- ============================================================

-- Materials RLS
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "materials_select_company_members"
  ON public.materials FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_companies rc
      WHERE rc.id = materials.company_id
      AND rc.owner_id = auth.uid()
    )
  );

CREATE POLICY "materials_insert_company_members"
  ON public.materials FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.roofing_companies rc
      WHERE rc.id = materials.company_id
      AND rc.owner_id = auth.uid()
    )
  );

CREATE POLICY "materials_update_company_members"
  ON public.materials FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_companies rc
      WHERE rc.id = materials.company_id
      AND rc.owner_id = auth.uid()
    )
  );

-- Suppliers RLS
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "suppliers_select_company_members"
  ON public.suppliers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_companies rc
      WHERE rc.id = suppliers.company_id
      AND rc.owner_id = auth.uid()
    )
  );

CREATE POLICY "suppliers_insert_company_members"
  ON public.suppliers FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.roofing_companies rc
      WHERE rc.id = suppliers.company_id
      AND rc.owner_id = auth.uid()
    )
  );

CREATE POLICY "suppliers_update_company_members"
  ON public.suppliers FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_companies rc
      WHERE rc.id = suppliers.company_id
      AND rc.owner_id = auth.uid()
    )
  );

-- Material Lists RLS
ALTER TABLE public.material_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "material_lists_select_company_members"
  ON public.material_lists FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.estimates e
      JOIN public.roofing_companies rc ON rc.id = e.company_id
      WHERE e.id = material_lists.estimate_id
      AND rc.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.roofing_jobs rj
      JOIN public.roofing_companies rc ON rc.id = rj.workspace_id::uuid
      WHERE rj.id::text = material_lists.job_id::text
      AND rc.owner_id = auth.uid()
    )
  );

CREATE POLICY "material_lists_insert_company_members"
  ON public.material_lists FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.estimates e
      JOIN public.roofing_companies rc ON rc.id = e.company_id
      WHERE e.id = material_lists.estimate_id
      AND rc.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.roofing_jobs rj
      JOIN public.roofing_companies rc ON rc.id = rj.workspace_id::uuid
      WHERE rj.id::text = material_lists.job_id::text
      AND rc.owner_id = auth.uid()
    )
  );

-- Material List Items RLS (inherits from material_lists)
ALTER TABLE public.material_list_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "material_list_items_select_company_members"
  ON public.material_list_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.material_lists ml
      JOIN public.estimates e ON e.id = ml.estimate_id
      JOIN public.roofing_companies rc ON rc.id = e.company_id
      WHERE ml.id = material_list_items.material_list_id
      AND rc.owner_id = auth.uid()
    )
  );

-- Supplier Orders RLS
ALTER TABLE public.supplier_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "supplier_orders_select_company_members"
  ON public.supplier_orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_companies rc
      WHERE rc.id = supplier_orders.company_id
      AND rc.owner_id = auth.uid()
    )
  );

CREATE POLICY "supplier_orders_insert_company_members"
  ON public.supplier_orders FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.roofing_companies rc
      WHERE rc.id = supplier_orders.company_id
      AND rc.owner_id = auth.uid()
    )
  );

CREATE POLICY "supplier_orders_update_company_members"
  ON public.supplier_orders FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_companies rc
      WHERE rc.id = supplier_orders.company_id
      AND rc.owner_id = auth.uid()
    )
  );

-- Supplier Order Items RLS (inherits from supplier_orders)
ALTER TABLE public.supplier_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "supplier_order_items_select_company_members"
  ON public.supplier_order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.supplier_orders so
      JOIN public.roofing_companies rc ON rc.id = so.company_id
      WHERE so.id = supplier_order_items.supplier_order_id
      AND rc.owner_id = auth.uid()
    )
  );

-- Delivery Events RLS (inherits from supplier_orders)
ALTER TABLE public.delivery_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "delivery_events_select_company_members"
  ON public.delivery_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.supplier_orders so
      JOIN public.roofing_companies rc ON rc.id = so.company_id
      WHERE so.id = delivery_events.supplier_order_id
      AND rc.owner_id = auth.uid()
    )
  );

CREATE POLICY "delivery_events_insert_company_members"
  ON public.delivery_events FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.supplier_orders so
      JOIN public.roofing_companies rc ON rc.id = so.company_id
      WHERE so.id = delivery_events.supplier_order_id
      AND rc.owner_id = auth.uid()
    )
  );

-- ============================================================
-- 9. AUTOMATION TRIGGERS
-- ============================================================

-- Trigger: Auto-create material list when contract is signed
CREATE OR REPLACE FUNCTION public.handle_contract_signed_material_list()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_estimate_id uuid;
  v_company_id uuid;
  v_job_id uuid;
  v_material_list_id uuid;
BEGIN
  -- Only process when status changes to 'signed'
  IF NEW.status = 'signed' AND (OLD.status IS NULL OR OLD.status != 'signed') THEN
    -- Get estimate and company info
    SELECT e.id, e.company_id
    INTO v_estimate_id, v_company_id
    FROM public.estimates e
    JOIN public.estimates_proposals ep ON ep.estimate_id = e.id
    WHERE ep.id = NEW.proposal_id;
    
    -- Get job_id from job links
    SELECT ejl.job_id INTO v_job_id
    FROM public.estimates_job_links ejl
    WHERE ejl.contract_id = NEW.id
    LIMIT 1;
    
    -- Create material list if estimate exists
    IF v_estimate_id IS NOT NULL THEN
      INSERT INTO public.material_lists (job_id, estimate_id, status, created_by)
      VALUES (v_job_id::text, v_estimate_id, 'draft', auth.uid())
      RETURNING id INTO v_material_list_id;
      
      -- Note: Material list items will be generated via API call
      -- This trigger just creates the empty list
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contract_signed_material_list ON public.estimates_contracts;
CREATE TRIGGER trg_contract_signed_material_list
AFTER UPDATE ON public.estimates_contracts
FOR EACH ROW EXECUTE FUNCTION public.handle_contract_signed_material_list();

-- ============================================================
-- 10. HELPER FUNCTIONS
-- ============================================================

-- Function: Generate material list from estimate line items
-- This will be called via API, but we provide a SQL function for flexibility
CREATE OR REPLACE FUNCTION public.generate_material_list_from_estimate(
  p_estimate_id uuid,
  p_job_id text,
  p_created_by uuid
)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_material_list_id uuid;
  v_line_items jsonb;
  v_item jsonb;
  v_quantity numeric;
  v_material_name text;
BEGIN
  -- Get estimate line items
  SELECT line_items INTO v_line_items
  FROM public.estimates
  WHERE id = p_estimate_id;
  
  IF v_line_items IS NULL OR jsonb_array_length(v_line_items) = 0 THEN
    RAISE EXCEPTION 'Estimate has no line items';
  END IF;
  
  -- Create material list
  INSERT INTO public.material_lists (job_id, estimate_id, status, created_by)
  VALUES (p_job_id, p_estimate_id, 'draft', p_created_by)
  RETURNING id INTO v_material_list_id;
  
  -- Process each line item
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_line_items)
  LOOP
    v_material_name := v_item->>'material';
    v_quantity := (v_item->>'quantity')::numeric;
    
    -- Insert material list item
    -- Note: This is a simplified version - the API will handle more complex mapping
    INSERT INTO public.material_list_items (
      material_list_id,
      description,
      quantity,
      unit,
      waste_factor
    )
    VALUES (
      v_material_list_id,
      v_material_name,
      v_quantity,
      COALESCE(v_item->>'unit', 'each'),
      10.0 -- Default 10% waste factor
    );
  END LOOP;
  
  RETURN v_material_list_id;
END;
$$;

-- ============================================================
-- 11. AUTOMATION: Reminder if Materials Not Ordered
-- ============================================================
-- Function to check for jobs with signed contracts but no ordered materials
-- Call this via cron job (e.g., every 24 hours)

CREATE OR REPLACE FUNCTION public.check_materials_not_ordered_reminder()
RETURNS TABLE (
  job_id text,
  company_id uuid,
  owner_id uuid,
  contract_signed_at timestamptz,
  material_list_id uuid,
  material_list_status text
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT
    ejl.job_id::text,
    e.company_id,
    rc.owner_id,
    ec.signature_date as contract_signed_at,
    ml.id as material_list_id,
    ml.status as material_list_status
  FROM public.estimates_job_links ejl
  JOIN public.estimates_contracts ec ON ec.id = ejl.contract_id
  JOIN public.estimates_proposals ep ON ep.id = ec.proposal_id
  JOIN public.estimates e ON e.id = ep.estimate_id
  JOIN public.roofing_companies rc ON rc.id = e.company_id
  LEFT JOIN public.material_lists ml ON ml.job_id = ejl.job_id::text AND ml.estimate_id = e.id
  WHERE ec.status = 'signed'
    AND ec.signature_date IS NOT NULL
    AND ec.signature_date < now() - interval '24 hours' -- At least 24 hours since signing
    AND (
      ml.id IS NULL -- No material list created
      OR ml.status = 'draft' -- Material list not finalized
      OR (
        ml.status = 'finalized'
        AND NOT EXISTS (
          SELECT 1 FROM public.supplier_orders so
          WHERE so.material_list_id = ml.id
          AND so.status IN ('sent', 'confirmed', 'scheduled', 'delivered')
        )
      ) -- No orders sent
    )
    AND NOT EXISTS (
      -- Check if reminder already sent in last 24 hours
      SELECT 1 FROM public.material_reminders mr
      WHERE mr.job_id = ejl.job_id::text
      AND mr.sent_at > now() - interval '24 hours'
    );
END;
$$;

-- Table to track sent reminders
CREATE TABLE IF NOT EXISTS public.material_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id text NOT NULL,
  company_id uuid REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  reminder_type text DEFAULT 'materials_not_ordered' CHECK (reminder_type IN ('materials_not_ordered')),
  sent_at timestamptz DEFAULT now(),
  sent_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_material_reminders_job ON public.material_reminders(job_id);
CREATE INDEX IF NOT EXISTS idx_material_reminders_sent ON public.material_reminders(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_material_reminders_company ON public.material_reminders(company_id);

-- RLS for material_reminders
ALTER TABLE public.material_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "material_reminders_select_company_members"
  ON public.material_reminders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_companies rc
      WHERE rc.id = material_reminders.company_id
      AND rc.owner_id = auth.uid()
    )
  );

COMMENT ON TABLE public.materials IS 'Block 223000: Catalog of materials used by a company';
COMMENT ON TABLE public.suppliers IS 'Block 223000: Supplier contacts for material ordering';
COMMENT ON TABLE public.material_lists IS 'Block 223000: Material lists per job';
COMMENT ON TABLE public.material_list_items IS 'Block 223000: Items in a material list';
COMMENT ON TABLE public.supplier_orders IS 'Block 223000: Orders sent to suppliers';
COMMENT ON TABLE public.supplier_order_items IS 'Block 223000: Items in a supplier order';
COMMENT ON TABLE public.delivery_events IS 'Block 223000: Delivery tracking events';
COMMENT ON TABLE public.material_reminders IS 'Block 223000: Track material ordering reminders sent';
COMMENT ON FUNCTION public.check_materials_not_ordered_reminder() IS 'Block 223000: Check for jobs needing material ordering reminders';

























