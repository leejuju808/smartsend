-- ============================================================
-- Block 241000 — SmartSend Roofing Supplier Hub v1
-- Full Sprint Step — No Bullshit.
-- ============================================================
-- 
-- "Supplier Hub v1 — Material Orders, Delivery Tracking, Vendor Sync, Cost Control"
--
-- This block connects SmartSend to the SUPPLY CHAIN.
-- 
-- Features:
-- - Digital Purchase Orders (POs)
-- - Supplier Profiles (enhanced)
-- - Material Order Templates
-- - Delivery Scheduling & Tracking
-- - Delivery Confirmation (crew capture)
-- - Cost Reconciliation
-- - Supplier Invoice Upload
-- - Material Variance Detection
-- - SMS/Email supplier notifications
-- - Future API sync (ABC, Beacon, SRS)
--
-- This turns SmartSend into a production & cost powerhouse.
-- ============================================================

-- ============================================================
-- 1. ENHANCE SUPPLIERS TABLE
-- ============================================================
-- Extend existing suppliers table with Supplier Hub fields

DO $$
BEGIN
  -- Add columns if they don't exist (suppliers table may already exist from block 223000)
  ALTER TABLE IF EXISTS public.suppliers
    ADD COLUMN IF NOT EXISTS address text,
    ADD COLUMN IF NOT EXISTS delivery_hours text,
    ADD COLUMN IF NOT EXISTS lead_time_days int DEFAULT 2,
    ADD COLUMN IF NOT EXISTS rating numeric(3,1) DEFAULT 5.0 CHECK (rating >= 0 AND rating <= 5),
    ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
    
  -- Ensure company_id exists (may be from block 223000 which uses roofing_companies)
  -- We'll support both companies and roofing_companies via flexible FK
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'suppliers' 
    AND column_name = 'company_id'
  ) THEN
    -- Try roofing_companies first (most common in roofing context)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_companies') THEN
      ALTER TABLE public.suppliers
        ADD COLUMN company_id uuid REFERENCES public.roofing_companies(id) ON DELETE CASCADE;
    ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'companies') THEN
      ALTER TABLE public.suppliers
        ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_suppliers_company_active ON public.suppliers(company_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_suppliers_rating ON public.suppliers(company_id, rating DESC);

-- ============================================================
-- 2. PURCHASE_ORDERS TABLE
-- ============================================================
-- Digital Purchase Orders - formal PO system

CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid, -- References roofing_companies or companies (flexible)
  job_id uuid, -- References jobs table (flexible - could be text or uuid)
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  
  po_number text NOT NULL, -- Internal PO number (e.g., "PO-2024-001")
  total_cost numeric(12,2) DEFAULT 0,
  delivery_date date,
  delivery_window text CHECK (delivery_window IN ('AM', 'PM', 'Any')) DEFAULT 'Any',
  
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',    -- Draft PO, not sent
    'sent',       -- Sent to supplier (email/SMS)
    'confirmed',  -- Supplier confirmed delivery
    'delivered',  -- Delivery completed
    'verified',   -- Crew verified materials
    'cancelled'   -- PO cancelled
  )),
  
  pdf_url text, -- URL to generated PO PDF
  notes text,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  sent_at timestamptz, -- When PO was sent to supplier
  confirmed_at timestamptz, -- When supplier confirmed
  
  -- Ensure unique PO numbers per company
  CONSTRAINT unique_po_number_per_company UNIQUE (company_id, po_number)
);

-- Indexes for purchase_orders
CREATE INDEX IF NOT EXISTS idx_po_company ON public.purchase_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_po_job ON public.purchase_orders(job_id);
CREATE INDEX IF NOT EXISTS idx_po_supplier ON public.purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_po_status ON public.purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_po_delivery_date ON public.purchase_orders(delivery_date);
CREATE INDEX IF NOT EXISTS idx_po_created ON public.purchase_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_po_number ON public.purchase_orders(po_number);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_purchase_orders_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_orders_updated_at ON public.purchase_orders;
CREATE TRIGGER trg_purchase_orders_updated_at
BEFORE UPDATE ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.set_purchase_orders_updated_at();

-- ============================================================
-- 3. PO_ITEMS TABLE
-- ============================================================
-- Items on a purchase order

CREATE TABLE IF NOT EXISTS public.po_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  
  material_name text NOT NULL, -- "OC Duration Driftwood", "Ice & Water Shield", etc.
  qty numeric(10,2) NOT NULL,
  unit text NOT NULL, -- 'bundles', 'squares', 'rolls', 'pieces', 'sqft', 'linear_ft'
  price numeric(10,2) DEFAULT 0,
  total_price numeric(12,2) GENERATED ALWAYS AS (qty * price) STORED,
  
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Indexes for po_items
CREATE INDEX IF NOT EXISTS idx_po_items_po ON public.po_items(po_id);
CREATE INDEX IF NOT EXISTS idx_po_items_material ON public.po_items(material_name);

-- ============================================================
-- 4. DELIVERIES TABLE
-- ============================================================
-- Delivery tracking and confirmation

CREATE TABLE IF NOT EXISTS public.deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  
  delivered_at timestamptz,
  delivered_by text, -- Driver name or supplier contact
  delivery_photos jsonb DEFAULT '[]'::jsonb, -- Array of photo URLs
  drop_location text, -- Where materials were dropped
  notes text,
  
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL -- Who logged the delivery
);

-- Indexes for deliveries
CREATE INDEX IF NOT EXISTS idx_deliveries_po ON public.deliveries(po_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_delivered_at ON public.deliveries(delivered_at DESC);

-- ============================================================
-- 5. MATERIAL_VERIFICATION TABLE
-- ============================================================
-- Crew verification step - crew confirms what was received

CREATE TABLE IF NOT EXISTS public.material_verification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  
  verified boolean DEFAULT false,
  verified_at timestamptz,
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  discrepancies jsonb DEFAULT '[]'::jsonb, -- Array of {item: string, expected: number, received: number, notes: string}
  verification_photos jsonb DEFAULT '[]'::jsonb, -- Photos taken during verification
  notes text,
  
  created_at timestamptz DEFAULT now()
);

-- Indexes for material_verification
CREATE INDEX IF NOT EXISTS idx_material_verification_po ON public.material_verification(po_id);
CREATE INDEX IF NOT EXISTS idx_material_verification_crew ON public.material_verification(crew_id);
CREATE INDEX IF NOT EXISTS idx_material_verification_verified ON public.material_verification(verified);

-- ============================================================
-- 6. SUPPLIER_INVOICES TABLE
-- ============================================================
-- Supplier invoices uploaded for reconciliation

CREATE TABLE IF NOT EXISTS public.supplier_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  
  invoice_number text,
  invoice_url text, -- URL to uploaded invoice PDF/image
  amount numeric(12,2) NOT NULL,
  
  uploaded_at timestamptz DEFAULT now(),
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Reconciliation fields
  po_amount numeric(12,2), -- Amount from PO (for comparison)
  variance numeric(12,2) GENERATED ALWAYS AS (amount - COALESCE(po_amount, 0)) STORED,
  variance_percent numeric(5,2) GENERATED ALWAYS AS (
    CASE 
      WHEN COALESCE(po_amount, 0) > 0 
      THEN ((amount - COALESCE(po_amount, 0)) / po_amount * 100)
      ELSE 0
    END
  ) STORED,
  
  reconciled boolean DEFAULT false,
  reconciled_at timestamptz,
  reconciled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  notes text
);

-- Indexes for supplier_invoices
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_po ON public.supplier_invoices(po_id);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_invoice_number ON public.supplier_invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_reconciled ON public.supplier_invoices(reconciled);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_variance ON public.supplier_invoices(variance);

-- ============================================================
-- 7. MATERIAL_ORDER_TEMPLATES TABLE
-- ============================================================
-- Reusable material order templates for common job types

CREATE TABLE IF NOT EXISTS public.material_order_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid, -- References roofing_companies or companies
  name text NOT NULL, -- "Standard Shingle Reroof", "Metal Roof", etc.
  description text,
  
  items jsonb DEFAULT '[]'::jsonb, -- Array of {material_name, qty, unit, price}
  
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for templates
CREATE INDEX IF NOT EXISTS idx_material_templates_company ON public.material_order_templates(company_id);
CREATE INDEX IF NOT EXISTS idx_material_templates_active ON public.material_order_templates(company_id, is_active) WHERE is_active = true;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_material_templates_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_material_templates_updated_at ON public.material_order_templates;
CREATE TRIGGER trg_material_templates_updated_at
BEFORE UPDATE ON public.material_order_templates
FOR EACH ROW EXECUTE FUNCTION public.set_material_templates_updated_at();

-- ============================================================
-- 8. ROW LEVEL SECURITY POLICIES
-- ============================================================

-- Purchase Orders RLS
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "purchase_orders_select_company_members"
  ON public.purchase_orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_companies rc
      WHERE rc.id = purchase_orders.company_id
      AND rc.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.companies c
      JOIN public.workspaces w ON w.id = c.workspace_id
      JOIN public.workspace_members wm ON wm.workspace_id = w.id
      WHERE c.id = purchase_orders.company_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "purchase_orders_insert_company_members"
  ON public.purchase_orders FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.roofing_companies rc
      WHERE rc.id = purchase_orders.company_id
      AND rc.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.companies c
      JOIN public.workspaces w ON w.id = c.workspace_id
      JOIN public.workspace_members wm ON wm.workspace_id = w.id
      WHERE c.id = purchase_orders.company_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "purchase_orders_update_company_members"
  ON public.purchase_orders FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_companies rc
      WHERE rc.id = purchase_orders.company_id
      AND rc.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.companies c
      JOIN public.workspaces w ON w.id = c.workspace_id
      JOIN public.workspace_members wm ON wm.workspace_id = w.id
      WHERE c.id = purchase_orders.company_id
      AND wm.user_id = auth.uid()
    )
  );

-- PO Items RLS (inherits from purchase_orders)
ALTER TABLE public.po_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "po_items_select_company_members"
  ON public.po_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      JOIN public.roofing_companies rc ON rc.id = po.company_id
      WHERE po.id = po_items.po_id
      AND rc.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      JOIN public.companies c ON c.id = po.company_id
      JOIN public.workspaces w ON w.id = c.workspace_id
      JOIN public.workspace_members wm ON wm.workspace_id = w.id
      WHERE po.id = po_items.po_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "po_items_insert_company_members"
  ON public.po_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      JOIN public.roofing_companies rc ON rc.id = po.company_id
      WHERE po.id = po_items.po_id
      AND rc.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      JOIN public.companies c ON c.id = po.company_id
      JOIN public.workspaces w ON w.id = c.workspace_id
      JOIN public.workspace_members wm ON wm.workspace_id = w.id
      WHERE po.id = po_items.po_id
      AND wm.user_id = auth.uid()
    )
  );

-- Deliveries RLS (inherits from purchase_orders)
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deliveries_select_company_members"
  ON public.deliveries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      JOIN public.roofing_companies rc ON rc.id = po.company_id
      WHERE po.id = deliveries.po_id
      AND rc.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      JOIN public.companies c ON c.id = po.company_id
      JOIN public.workspaces w ON w.id = c.workspace_id
      JOIN public.workspace_members wm ON wm.workspace_id = w.id
      WHERE po.id = deliveries.po_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "deliveries_insert_company_members"
  ON public.deliveries FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      JOIN public.roofing_companies rc ON rc.id = po.company_id
      WHERE po.id = deliveries.po_id
      AND (rc.owner_id = auth.uid() OR deliveries.created_by = auth.uid())
    )
    OR
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      JOIN public.companies c ON c.id = po.company_id
      JOIN public.workspaces w ON w.id = c.workspace_id
      JOIN public.workspace_members wm ON wm.workspace_id = w.id
      WHERE po.id = deliveries.po_id
      AND (wm.user_id = auth.uid() OR deliveries.created_by = auth.uid())
    )
  );

-- Material Verification RLS (inherits from purchase_orders)
ALTER TABLE public.material_verification ENABLE ROW LEVEL SECURITY;

CREATE POLICY "material_verification_select_company_members"
  ON public.material_verification FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      JOIN public.roofing_companies rc ON rc.id = po.company_id
      WHERE po.id = material_verification.po_id
      AND (rc.owner_id = auth.uid() OR material_verification.verified_by = auth.uid())
    )
    OR
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      JOIN public.companies c ON c.id = po.company_id
      JOIN public.workspaces w ON w.id = c.workspace_id
      JOIN public.workspace_members wm ON wm.workspace_id = w.id
      WHERE po.id = material_verification.po_id
      AND (wm.user_id = auth.uid() OR material_verification.verified_by = auth.uid())
    )
  );

CREATE POLICY "material_verification_insert_company_members"
  ON public.material_verification FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      JOIN public.roofing_companies rc ON rc.id = po.company_id
      WHERE po.id = material_verification.po_id
      AND (rc.owner_id = auth.uid() OR material_verification.verified_by = auth.uid())
    )
    OR
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      JOIN public.companies c ON c.id = po.company_id
      JOIN public.workspaces w ON w.id = c.workspace_id
      JOIN public.workspace_members wm ON wm.workspace_id = w.id
      WHERE po.id = material_verification.po_id
      AND (wm.user_id = auth.uid() OR material_verification.verified_by = auth.uid())
    )
  );

CREATE POLICY "material_verification_update_company_members"
  ON public.material_verification FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      JOIN public.roofing_companies rc ON rc.id = po.company_id
      WHERE po.id = material_verification.po_id
      AND (rc.owner_id = auth.uid() OR material_verification.verified_by = auth.uid())
    )
    OR
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      JOIN public.companies c ON c.id = po.company_id
      JOIN public.workspaces w ON w.id = c.workspace_id
      JOIN public.workspace_members wm ON wm.workspace_id = w.id
      WHERE po.id = material_verification.po_id
      AND (wm.user_id = auth.uid() OR material_verification.verified_by = auth.uid())
    )
  );

-- Supplier Invoices RLS (inherits from purchase_orders)
ALTER TABLE public.supplier_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "supplier_invoices_select_company_members"
  ON public.supplier_invoices FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      JOIN public.roofing_companies rc ON rc.id = po.company_id
      WHERE po.id = supplier_invoices.po_id
      AND rc.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      JOIN public.companies c ON c.id = po.company_id
      JOIN public.workspaces w ON w.id = c.workspace_id
      JOIN public.workspace_members wm ON wm.workspace_id = w.id
      WHERE po.id = supplier_invoices.po_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "supplier_invoices_insert_company_members"
  ON public.supplier_invoices FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      JOIN public.roofing_companies rc ON rc.id = po.company_id
      WHERE po.id = supplier_invoices.po_id
      AND rc.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      JOIN public.companies c ON c.id = po.company_id
      JOIN public.workspaces w ON w.id = c.workspace_id
      JOIN public.workspace_members wm ON wm.workspace_id = w.id
      WHERE po.id = supplier_invoices.po_id
      AND wm.user_id = auth.uid()
    )
  );

-- Material Templates RLS
ALTER TABLE public.material_order_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "material_templates_select_company_members"
  ON public.material_order_templates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_companies rc
      WHERE rc.id = material_order_templates.company_id
      AND rc.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.companies c
      JOIN public.workspaces w ON w.id = c.workspace_id
      JOIN public.workspace_members wm ON wm.workspace_id = w.id
      WHERE c.id = material_order_templates.company_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "material_templates_insert_company_members"
  ON public.material_order_templates FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.roofing_companies rc
      WHERE rc.id = material_order_templates.company_id
      AND rc.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.companies c
      JOIN public.workspaces w ON w.id = c.workspace_id
      JOIN public.workspace_members wm ON wm.workspace_id = w.id
      WHERE c.id = material_order_templates.company_id
      AND wm.user_id = auth.uid()
    )
  );

-- ============================================================
-- 9. AUTOMATION TRIGGERS
-- ============================================================

-- Trigger: Auto-generate PO number when PO is created
CREATE OR REPLACE FUNCTION public.generate_po_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_year text;
  v_count int;
  v_po_number text;
BEGIN
  -- Generate PO number if not provided: PO-YYYY-XXX
  IF NEW.po_number IS NULL OR NEW.po_number = '' THEN
    v_year := TO_CHAR(NOW(), 'YYYY');
    
    -- Get count of POs for this company this year
    SELECT COUNT(*) + 1 INTO v_count
    FROM public.purchase_orders
    WHERE company_id = NEW.company_id
    AND po_number LIKE 'PO-' || v_year || '-%';
    
    v_po_number := 'PO-' || v_year || '-' || LPAD(v_count::text, 4, '0');
    NEW.po_number := v_po_number;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_po_number ON public.purchase_orders;
CREATE TRIGGER trg_generate_po_number
BEFORE INSERT ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.generate_po_number();

-- Trigger: Update PO total_cost when items are added/updated
CREATE OR REPLACE FUNCTION public.update_po_total_cost()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_total numeric(12,2);
BEGIN
  -- Recalculate total from all items
  SELECT COALESCE(SUM(total_price), 0) INTO v_total
  FROM public.po_items
  WHERE po_id = COALESCE(NEW.po_id, OLD.po_id);
  
  -- Update PO total
  UPDATE public.purchase_orders
  SET total_cost = v_total
  WHERE id = COALESCE(NEW.po_id, OLD.po_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_update_po_total_on_item_insert ON public.po_items;
CREATE TRIGGER trg_update_po_total_on_item_insert
AFTER INSERT ON public.po_items
FOR EACH ROW EXECUTE FUNCTION public.update_po_total_cost();

DROP TRIGGER IF EXISTS trg_update_po_total_on_item_update ON public.po_items;
CREATE TRIGGER trg_update_po_total_on_item_update
AFTER UPDATE ON public.po_items
FOR EACH ROW EXECUTE FUNCTION public.update_po_total_cost();

DROP TRIGGER IF EXISTS trg_update_po_total_on_item_delete ON public.po_items;
CREATE TRIGGER trg_update_po_total_on_item_delete
AFTER DELETE ON public.po_items
FOR EACH ROW EXECUTE FUNCTION public.update_po_total_cost();

-- Trigger: Auto-update PO status when delivery is confirmed
CREATE OR REPLACE FUNCTION public.update_po_status_on_delivery()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- When delivery is logged, update PO status
  IF NEW.delivered_at IS NOT NULL THEN
    UPDATE public.purchase_orders
    SET status = 'delivered'
    WHERE id = NEW.po_id
    AND status != 'cancelled';
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_po_status_on_delivery ON public.deliveries;
CREATE TRIGGER trg_update_po_status_on_delivery
AFTER INSERT OR UPDATE ON public.deliveries
FOR EACH ROW EXECUTE FUNCTION public.update_po_status_on_delivery();

-- Trigger: Update supplier invoice PO amount when invoice is created
CREATE OR REPLACE FUNCTION public.update_invoice_po_amount()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_po_amount numeric(12,2);
BEGIN
  -- Get PO total cost
  SELECT total_cost INTO v_po_amount
  FROM public.purchase_orders
  WHERE id = NEW.po_id;
  
  NEW.po_amount := v_po_amount;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_invoice_po_amount ON public.supplier_invoices;
CREATE TRIGGER trg_update_invoice_po_amount
BEFORE INSERT ON public.supplier_invoices
FOR EACH ROW EXECUTE FUNCTION public.update_invoice_po_amount();

-- ============================================================
-- 10. HELPER FUNCTIONS
-- ============================================================

-- Function: Get PO count per supplier (for supplier list)
CREATE OR REPLACE FUNCTION public.get_supplier_po_count(p_supplier_id uuid)
RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT COUNT(*) FROM public.purchase_orders
  WHERE supplier_id = p_supplier_id;
$$;

-- Function: Get delivery confirmation rate for supplier
CREATE OR REPLACE FUNCTION public.get_supplier_delivery_rate(p_supplier_id uuid)
RETURNS numeric(5,2) LANGUAGE sql STABLE AS $$
  SELECT 
    CASE 
      WHEN COUNT(*) = 0 THEN 0
      ELSE ROUND((COUNT(*) FILTER (WHERE status = 'delivered' OR status = 'verified'))::numeric / COUNT(*)::numeric * 100, 2)
    END
  FROM public.purchase_orders
  WHERE supplier_id = p_supplier_id
  AND status != 'pending';
$$;

-- Function: Get cost reconciliation summary for a job
CREATE OR REPLACE FUNCTION public.get_job_cost_reconciliation(p_job_id uuid)
RETURNS TABLE (
  estimated_cost numeric(12,2),
  po_total_cost numeric(12,2),
  invoice_total numeric(12,2),
  variance numeric(12,2),
  variance_percent numeric(5,2)
) LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_estimated numeric(12,2);
  v_po_total numeric(12,2);
  v_invoice_total numeric(12,2);
  v_variance numeric(12,2);
  v_variance_pct numeric(5,2);
BEGIN
  -- Get estimated cost from job (if available in materials field or separate table)
  SELECT COALESCE((materials->>'total_cost')::numeric, 0) INTO v_estimated
  FROM public.jobs
  WHERE id = p_job_id;
  
  -- Get PO total
  SELECT COALESCE(SUM(total_cost), 0) INTO v_po_total
  FROM public.purchase_orders
  WHERE job_id = p_job_id;
  
  -- Get invoice total
  SELECT COALESCE(SUM(amount), 0) INTO v_invoice_total
  FROM public.supplier_invoices si
  JOIN public.purchase_orders po ON po.id = si.po_id
  WHERE po.job_id = p_job_id;
  
  -- Calculate variance
  v_variance := v_invoice_total - COALESCE(v_po_total, v_estimated);
  v_variance_pct := CASE 
    WHEN COALESCE(v_po_total, v_estimated) > 0 
    THEN (v_variance / COALESCE(v_po_total, v_estimated) * 100)
    ELSE 0
  END;
  
  RETURN QUERY SELECT v_estimated, v_po_total, v_invoice_total, v_variance, v_variance_pct;
END;
$$;

-- ============================================================
-- 11. COMMENTS
-- ============================================================

COMMENT ON TABLE public.purchase_orders IS 'Block 241000: Digital Purchase Orders for material ordering';
COMMENT ON TABLE public.po_items IS 'Block 241000: Items on a purchase order';
COMMENT ON TABLE public.deliveries IS 'Block 241000: Delivery tracking and confirmation';
COMMENT ON TABLE public.material_verification IS 'Block 241000: Crew verification of delivered materials';
COMMENT ON TABLE public.supplier_invoices IS 'Block 241000: Supplier invoices for cost reconciliation';
COMMENT ON TABLE public.material_order_templates IS 'Block 241000: Reusable material order templates';

























