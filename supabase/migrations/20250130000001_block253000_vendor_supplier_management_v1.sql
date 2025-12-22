-- =========================================================
-- Block 253000 — SmartSend Vendor & Supplier Management System v1
-- "Material Purchase Orders, Delivery Tracking, Vendor Ratings, Invoice Reconciliation"
-- =========================================================
-- 
-- This block is CRITICAL because roofing companies LOSE THOUSANDS every year due to supplier mistakes:
-- - wrong shingles delivered
-- - shorted materials
-- - damaged bundles
-- - invoice mismatches
-- - late deliveries
-- - delivery to wrong address
-- - price changes not communicated
-- - credit terms confusion
-- - missing PO numbers = accounting chaos
--
-- SmartSend fixes ALL of this with a full vendor/supplier engine.
-- =========================================================

-- ============================================================================
-- PART 1 — ENSURE SUPPLIERS TABLE EXISTS (may exist from block 241000)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid, -- References roofing_companies(id) or companies(id)
  name text NOT NULL,
  contact_name text,
  phone text,
  email text,
  credit_terms text,           -- NET30, NET60, COD
  address text,
  status text DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add company_id FK if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'suppliers_company_id_fkey'
  ) THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_companies') THEN
      ALTER TABLE public.suppliers
        ADD CONSTRAINT suppliers_company_id_fkey
        FOREIGN KEY (company_id) REFERENCES public.roofing_companies(id) ON DELETE CASCADE;
    ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'companies') THEN
      ALTER TABLE public.suppliers
        ADD CONSTRAINT suppliers_company_id_fkey
        FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- Add missing columns if they don't exist
DO $$
BEGIN
  ALTER TABLE IF EXISTS public.suppliers
    ADD COLUMN IF NOT EXISTS credit_terms text,
    ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
END $$;

CREATE INDEX IF NOT EXISTS idx_suppliers_company ON public.suppliers(company_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_status ON public.suppliers(status) WHERE status = 'active';

-- ============================================================================
-- PART 2 — ENSURE PURCHASE_ORDERS TABLE EXISTS (may exist from block 241000)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  company_id uuid, -- References roofing_companies(id) or companies(id)
  po_number text,
  status text DEFAULT 'draft' CHECK (status IN (
    'draft', 'sent', 'confirmed', 'delivered', 'invoiced', 'disputed', 'closed'
  )),
  total_estimated numeric(12,2) DEFAULT 0,
  total_invoiced numeric(12,2),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add company_id FK if needed
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'purchase_orders_company_id_fkey'
  ) THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_companies') THEN
      ALTER TABLE public.purchase_orders
        ADD CONSTRAINT purchase_orders_company_id_fkey
        FOREIGN KEY (company_id) REFERENCES public.roofing_companies(id) ON DELETE CASCADE;
    ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'companies') THEN
      ALTER TABLE public.purchase_orders
        ADD CONSTRAINT purchase_orders_company_id_fkey
        FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- Update status enum if needed (extend existing)
DO $$
BEGIN
  -- Check if status column exists and update constraint
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'purchase_orders' 
    AND column_name = 'status'
  ) THEN
    -- Drop old constraint if it exists
    ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check;
    -- Add new constraint with all statuses
    ALTER TABLE public.purchase_orders 
      ADD CONSTRAINT purchase_orders_status_check 
      CHECK (status IN ('draft', 'sent', 'confirmed', 'delivered', 'invoiced', 'disputed', 'closed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_job ON public.purchase_orders(job_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON public.purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON public.purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_po_number ON public.purchase_orders(po_number);

-- ============================================================================
-- PART 3 — CREATE purchase_order_items TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  material_name text NOT NULL,
  quantity numeric(10,2) NOT NULL,
  unit_cost numeric(10,2) DEFAULT 0,
  total_cost numeric(12,2) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_order_items_po ON public.purchase_order_items(po_id);

-- ============================================================================
-- PART 4 — ENSURE supplier_invoices TABLE EXISTS (may exist from block 241000)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.supplier_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  invoice_number text,
  amount numeric(12,2) NOT NULL,
  invoice_url text,
  received_at timestamptz DEFAULT now(),
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_supplier_invoices_po ON public.supplier_invoices(po_id);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_invoice_number ON public.supplier_invoices(invoice_number);

-- ============================================================================
-- PART 5 — CREATE supplier_delivery_records TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.supplier_delivery_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  delivered_at timestamptz DEFAULT now(),
  photo_url text,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_supplier_delivery_records_po ON public.supplier_delivery_records(po_id);
CREATE INDEX IF NOT EXISTS idx_supplier_delivery_records_delivered ON public.supplier_delivery_records(delivered_at DESC);

-- ============================================================================
-- PART 6 — CREATE vendor_ratings TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.vendor_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  rating_accuracy int CHECK (rating_accuracy >= 1 AND rating_accuracy <= 5),
  rating_timeliness int CHECK (rating_timeliness >= 1 AND rating_timeliness <= 5),
  rating_quality int CHECK (rating_quality >= 1 AND rating_quality <= 5),
  notes text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_vendor_ratings_supplier ON public.vendor_ratings(supplier_id);
CREATE INDEX IF NOT EXISTS idx_vendor_ratings_job ON public.vendor_ratings(job_id);
CREATE INDEX IF NOT EXISTS idx_vendor_ratings_created ON public.vendor_ratings(created_at DESC);

-- ============================================================================
-- PART 7 — CREATE supplier_credit_statements TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.supplier_credit_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  company_id uuid, -- References roofing_companies(id) or companies(id)
  statement_date date NOT NULL,
  balance_due numeric(12,2) DEFAULT 0,
  credit_limit numeric(12,2),
  terms text, -- NET30, NET60, COD
  due_date date,
  paid boolean DEFAULT false,
  paid_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_credit_statements_supplier ON public.supplier_credit_statements(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_credit_statements_company ON public.supplier_credit_statements(company_id);
CREATE INDEX IF NOT EXISTS idx_supplier_credit_statements_paid ON public.supplier_credit_statements(paid) WHERE paid = false;
CREATE INDEX IF NOT EXISTS idx_supplier_credit_statements_due_date ON public.supplier_credit_statements(due_date);

-- ============================================================================
-- PART 8 — TRIGGERS
-- ============================================================================

-- Auto-generate PO number (SS-PO-YYYY-XXX format)
CREATE OR REPLACE FUNCTION generate_smartsend_po_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_year text;
  v_count int;
  v_po_number text;
BEGIN
  IF NEW.po_number IS NULL OR NEW.po_number = '' THEN
    v_year := TO_CHAR(NOW(), 'YYYY');
    
    SELECT COUNT(*) + 1 INTO v_count
    FROM public.purchase_orders
    WHERE company_id = NEW.company_id
    AND po_number LIKE 'SS-PO-' || v_year || '-%';
    
    v_po_number := 'SS-PO-' || v_year || '-' || LPAD(v_count::text, 4, '0');
    NEW.po_number := v_po_number;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_smartsend_po_number ON public.purchase_orders;
CREATE TRIGGER trg_generate_smartsend_po_number
BEFORE INSERT ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION generate_smartsend_po_number();

-- Update PO total_estimated when items change
CREATE OR REPLACE FUNCTION update_po_total_estimated()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_total numeric(12,2);
BEGIN
  SELECT COALESCE(SUM(total_cost), 0) INTO v_total
  FROM public.purchase_order_items
  WHERE po_id = COALESCE(NEW.po_id, OLD.po_id);
  
  UPDATE public.purchase_orders
  SET total_estimated = v_total
  WHERE id = COALESCE(NEW.po_id, OLD.po_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_update_po_total_on_item_insert ON public.purchase_order_items;
CREATE TRIGGER trg_update_po_total_on_item_insert
AFTER INSERT ON public.purchase_order_items
FOR EACH ROW EXECUTE FUNCTION update_po_total_estimated();

DROP TRIGGER IF EXISTS trg_update_po_total_on_item_update ON public.purchase_order_items;
CREATE TRIGGER trg_update_po_total_on_item_update
AFTER UPDATE ON public.purchase_order_items
FOR EACH ROW EXECUTE FUNCTION update_po_total_estimated();

DROP TRIGGER IF EXISTS trg_update_po_total_on_item_delete ON public.purchase_order_items;
CREATE TRIGGER trg_update_po_total_on_item_delete
AFTER DELETE ON public.purchase_order_items
FOR EACH ROW EXECUTE FUNCTION update_po_total_estimated();

-- Auto-update PO status when invoice is uploaded
CREATE OR REPLACE FUNCTION update_po_status_on_invoice()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.purchase_orders
  SET status = 'invoiced',
      total_invoiced = NEW.amount
  WHERE id = NEW.po_id
  AND status != 'closed';
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_po_status_on_invoice ON public.supplier_invoices;
CREATE TRIGGER trg_update_po_status_on_invoice
AFTER INSERT ON public.supplier_invoices
FOR EACH ROW EXECUTE FUNCTION update_po_status_on_invoice();

-- Auto-update PO status when delivery is recorded
CREATE OR REPLACE FUNCTION update_po_status_on_delivery()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.delivered_at IS NOT NULL THEN
    UPDATE public.purchase_orders
    SET status = 'delivered'
    WHERE id = NEW.po_id
    AND status NOT IN ('invoiced', 'disputed', 'closed');
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_po_status_on_delivery ON public.supplier_delivery_records;
CREATE TRIGGER trg_update_po_status_on_delivery
AFTER INSERT OR UPDATE ON public.supplier_delivery_records
FOR EACH ROW EXECUTE FUNCTION update_po_status_on_delivery();

-- Updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_suppliers_updated_at ON public.suppliers;
CREATE TRIGGER trg_suppliers_updated_at
BEFORE UPDATE ON public.suppliers
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_purchase_orders_updated_at ON public.purchase_orders;
CREATE TRIGGER trg_purchase_orders_updated_at
BEFORE UPDATE ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_supplier_credit_statements_updated_at ON public.supplier_credit_statements;
CREATE TRIGGER trg_supplier_credit_statements_updated_at
BEFORE UPDATE ON public.supplier_credit_statements
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- PART 9 — INVOICE RECONCILIATION FUNCTIONS
-- ============================================================================

-- Calculate invoice variance
CREATE OR REPLACE FUNCTION calculate_invoice_variance(p_po_id uuid)
RETURNS TABLE (
  po_total numeric(12,2),
  invoice_total numeric(12,2),
  variance numeric(12,2),
  variance_percent numeric(5,2),
  status text
) LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_po_total numeric(12,2);
  v_invoice_total numeric(12,2);
  v_variance numeric(12,2);
  v_variance_pct numeric(5,2);
  v_status text;
BEGIN
  -- Get PO total
  SELECT COALESCE(total_estimated, 0) INTO v_po_total
  FROM public.purchase_orders
  WHERE id = p_po_id;
  
  -- Get invoice total
  SELECT COALESCE(SUM(amount), 0) INTO v_invoice_total
  FROM public.supplier_invoices
  WHERE po_id = p_po_id;
  
  -- Calculate variance
  v_variance := v_invoice_total - v_po_total;
  
  -- Calculate variance percentage
  IF v_po_total > 0 THEN
    v_variance_pct := (v_variance / v_po_total) * 100;
  ELSE
    v_variance_pct := 0;
  END IF;
  
  -- Determine status
  IF ABS(v_variance_pct) <= 5 THEN
    v_status := 'ok';
  ELSIF ABS(v_variance_pct) <= 10 THEN
    v_status := 'warning';
  ELSE
    v_status := 'discrepancy';
  END IF;
  
  RETURN QUERY SELECT v_po_total, v_invoice_total, v_variance, v_variance_pct, v_status;
END;
$$;

-- Auto-flag PO as disputed if variance > 10%
CREATE OR REPLACE FUNCTION check_invoice_variance()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_variance_pct numeric(5,2);
BEGIN
  SELECT variance_percent INTO v_variance_pct
  FROM calculate_invoice_variance(NEW.po_id);
  
  IF ABS(v_variance_pct) > 10 THEN
    UPDATE public.purchase_orders
    SET status = 'disputed'
    WHERE id = NEW.po_id
    AND status != 'closed';
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_invoice_variance ON public.supplier_invoices;
CREATE TRIGGER trg_check_invoice_variance
AFTER INSERT OR UPDATE ON public.supplier_invoices
FOR EACH ROW EXECUTE FUNCTION check_invoice_variance();

-- ============================================================================
-- PART 10 — VENDOR PERFORMANCE SCORING FUNCTIONS
-- ============================================================================

-- Calculate vendor performance score
CREATE OR REPLACE FUNCTION calculate_vendor_score(p_supplier_id uuid)
RETURNS TABLE (
  accuracy_score numeric(5,2),
  timeliness_score numeric(5,2),
  quality_score numeric(5,2),
  vendor_score numeric(5,2),
  category text
) LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_accuracy numeric(5,2);
  v_timeliness numeric(5,2);
  v_quality numeric(5,2);
  v_total numeric(5,2);
  v_category text;
BEGIN
  SELECT 
    AVG(rating_accuracy::numeric) * 20,
    AVG(rating_timeliness::numeric) * 20,
    AVG(rating_quality::numeric) * 20
  INTO v_accuracy, v_timeliness, v_quality
  FROM public.vendor_ratings
  WHERE supplier_id = p_supplier_id;
  
  v_total := COALESCE((v_accuracy + v_timeliness + v_quality) / 3, 0);
  
  -- Categorize
  IF v_total >= 90 THEN
    v_category := 'Elite Vendor';
  ELSIF v_total >= 80 THEN
    v_category := 'Reliable';
  ELSIF v_total >= 60 THEN
    v_category := 'Needs Improvement';
  ELSE
    v_category := 'Risk Vendor';
  END IF;
  
  RETURN QUERY SELECT 
    COALESCE(v_accuracy, 0),
    COALESCE(v_timeliness, 0),
    COALESCE(v_quality, 0),
    COALESCE(v_total, 0),
    v_category;
END;
$$;

-- ============================================================================
-- PART 11 — CREDIT TERMS TRACKING FUNCTIONS
-- ============================================================================

-- Get supplier outstanding balance
CREATE OR REPLACE FUNCTION get_supplier_balance(p_supplier_id uuid, p_company_id uuid)
RETURNS numeric(12,2) LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_balance numeric(12,2);
BEGIN
  SELECT COALESCE(SUM(balance_due), 0) INTO v_balance
  FROM public.supplier_credit_statements
  WHERE supplier_id = p_supplier_id
  AND company_id = p_company_id
  AND paid = false;
  
  RETURN COALESCE(v_balance, 0);
END;
$$;

-- ============================================================================
-- PART 12 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_delivery_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_credit_statements ENABLE ROW LEVEL SECURITY;

-- Suppliers: Company members can access
DROP POLICY IF EXISTS "suppliers_company_members" ON public.suppliers;
CREATE POLICY "suppliers_company_members" ON public.suppliers
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.roofing_companies rc
      WHERE rc.id = suppliers.company_id
      AND rc.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.companies c
      JOIN public.workspaces w ON w.id = c.workspace_id
      JOIN public.workspace_members wm ON wm.workspace_id = w.id
      WHERE c.id = suppliers.company_id
      AND wm.user_id = auth.uid()
    )
  );

-- Purchase Orders: Company members can access
DROP POLICY IF EXISTS "purchase_orders_company_members" ON public.purchase_orders;
CREATE POLICY "purchase_orders_company_members" ON public.purchase_orders
  FOR ALL USING (
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

-- PO Items: Inherit from purchase_orders
DROP POLICY IF EXISTS "purchase_order_items_company_members" ON public.purchase_order_items;
CREATE POLICY "purchase_order_items_company_members" ON public.purchase_order_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      JOIN public.roofing_companies rc ON rc.id = po.company_id
      WHERE po.id = purchase_order_items.po_id
      AND rc.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      JOIN public.companies c ON c.id = po.company_id
      JOIN public.workspaces w ON w.id = c.workspace_id
      JOIN public.workspace_members wm ON wm.workspace_id = w.id
      WHERE po.id = purchase_order_items.po_id
      AND wm.user_id = auth.uid()
    )
  );

-- Supplier Invoices: Inherit from purchase_orders
DROP POLICY IF EXISTS "supplier_invoices_company_members" ON public.supplier_invoices;
CREATE POLICY "supplier_invoices_company_members" ON public.supplier_invoices
  FOR ALL USING (
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

-- Delivery Records: Inherit from purchase_orders
DROP POLICY IF EXISTS "supplier_delivery_records_company_members" ON public.supplier_delivery_records;
CREATE POLICY "supplier_delivery_records_company_members" ON public.supplier_delivery_records
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      JOIN public.roofing_companies rc ON rc.id = po.company_id
      WHERE po.id = supplier_delivery_records.po_id
      AND (rc.owner_id = auth.uid() OR supplier_delivery_records.created_by = auth.uid())
    )
    OR
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      JOIN public.companies c ON c.id = po.company_id
      JOIN public.workspaces w ON w.id = c.workspace_id
      JOIN public.workspace_members wm ON wm.workspace_id = w.id
      WHERE po.id = supplier_delivery_records.po_id
      AND (wm.user_id = auth.uid() OR supplier_delivery_records.created_by = auth.uid())
    )
  );

-- Vendor Ratings: Company members can access
DROP POLICY IF EXISTS "vendor_ratings_company_members" ON public.vendor_ratings;
CREATE POLICY "vendor_ratings_company_members" ON public.vendor_ratings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.suppliers s
      JOIN public.roofing_companies rc ON rc.id = s.company_id
      WHERE s.id = vendor_ratings.supplier_id
      AND rc.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.suppliers s
      JOIN public.companies c ON c.id = s.company_id
      JOIN public.workspaces w ON w.id = c.workspace_id
      JOIN public.workspace_members wm ON wm.workspace_id = w.id
      WHERE s.id = vendor_ratings.supplier_id
      AND wm.user_id = auth.uid()
    )
  );

-- Credit Statements: Company members can access
DROP POLICY IF EXISTS "supplier_credit_statements_company_members" ON public.supplier_credit_statements;
CREATE POLICY "supplier_credit_statements_company_members" ON public.supplier_credit_statements
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.roofing_companies rc
      WHERE rc.id = supplier_credit_statements.company_id
      AND rc.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.companies c
      JOIN public.workspaces w ON w.id = c.workspace_id
      JOIN public.workspace_members wm ON wm.workspace_id = w.id
      WHERE c.id = supplier_credit_statements.company_id
      AND wm.user_id = auth.uid()
    )
  );

-- Service role full access
DROP POLICY IF EXISTS "suppliers_service_role" ON public.suppliers;
CREATE POLICY "suppliers_service_role" ON public.suppliers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "purchase_orders_service_role" ON public.purchase_orders;
CREATE POLICY "purchase_orders_service_role" ON public.purchase_orders
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "purchase_order_items_service_role" ON public.purchase_order_items;
CREATE POLICY "purchase_order_items_service_role" ON public.purchase_order_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "supplier_invoices_service_role" ON public.supplier_invoices;
CREATE POLICY "supplier_invoices_service_role" ON public.supplier_invoices
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "supplier_delivery_records_service_role" ON public.supplier_delivery_records;
CREATE POLICY "supplier_delivery_records_service_role" ON public.supplier_delivery_records
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "vendor_ratings_service_role" ON public.vendor_ratings;
CREATE POLICY "vendor_ratings_service_role" ON public.vendor_ratings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "supplier_credit_statements_service_role" ON public.supplier_credit_statements;
CREATE POLICY "supplier_credit_statements_service_role" ON public.supplier_credit_statements
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 13 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.suppliers IS 'Block 253000: Supplier directory with contact info and credit terms';
COMMENT ON TABLE public.purchase_orders IS 'Block 253000: Material purchase orders with status workflow';
COMMENT ON TABLE public.purchase_order_items IS 'Block 253000: Line items on purchase orders';
COMMENT ON TABLE public.supplier_invoices IS 'Block 253000: Supplier invoices for reconciliation';
COMMENT ON TABLE public.supplier_delivery_records IS 'Block 253000: Delivery tracking with photos';
COMMENT ON TABLE public.vendor_ratings IS 'Block 253000: Vendor performance ratings (accuracy, timeliness, quality)';
COMMENT ON TABLE public.supplier_credit_statements IS 'Block 253000: Credit terms and statement tracking';
COMMENT ON FUNCTION calculate_invoice_variance IS 'Block 253000: Calculates invoice variance and flags discrepancies';
COMMENT ON FUNCTION calculate_vendor_score IS 'Block 253000: Calculates vendor performance score and category';
COMMENT ON FUNCTION get_supplier_balance IS 'Block 253000: Gets outstanding balance for a supplier';
























