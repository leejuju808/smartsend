-- Block 48000 — SmartSend Roofing "Inventory + Supplier Purchase Order System" v1
-- MATERIAL TRACKING • LIVE INVENTORY • AUTO-PO CREATION • SUPPLIER DELIVERY SCHEDULING • MATERIAL SHORTAGE ALERTS
-- 
-- This block transforms SmartSend into the material engine of a roofing company
-- Protects profit, prevents delays, ensures crews never show up without supplies

-- ============================================================
-- 1. MATERIALS TABLE (Master Inventory)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  unit text, -- bundle, roll, sheet, lbs, etc
  quantity numeric DEFAULT 0,
  min_quantity numeric DEFAULT 0,
  company_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add foreign key to companies if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'companies') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'materials_company_id_fkey'
    ) THEN
      ALTER TABLE public.materials
        ADD CONSTRAINT materials_company_id_fkey
        FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_materials_company ON public.materials(company_id);
CREATE INDEX IF NOT EXISTS idx_materials_name ON public.materials(name);
CREATE INDEX IF NOT EXISTS idx_materials_low_stock ON public.materials(company_id, quantity, min_quantity) 
  WHERE quantity <= min_quantity;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_materials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_materials_updated_at ON public.materials;
CREATE TRIGGER trg_materials_updated_at
BEFORE UPDATE ON public.materials
FOR EACH ROW
EXECUTE FUNCTION update_materials_updated_at();

-- ============================================================
-- 2. PURCHASE_ORDERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid,
  supplier_name text,
  delivery_date date,
  delivery_window text, -- morning, afternoon, anytime, day_before, morning_of
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'cancelled')),
  pdf_url text,
  company_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add foreign keys if tables exist
DO $$
BEGIN
  -- Jobs table (could be jobs or roofing_jobs)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'purchase_orders_job_id_fkey'
    ) THEN
      ALTER TABLE public.purchase_orders
        ADD CONSTRAINT purchase_orders_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE SET NULL;
    END IF;
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'purchase_orders_job_id_fkey'
    ) THEN
      ALTER TABLE public.purchase_orders
        ADD CONSTRAINT purchase_orders_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE SET NULL;
    END IF;
  END IF;

  -- Companies table
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'companies') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'purchase_orders_company_id_fkey'
    ) THEN
      ALTER TABLE public.purchase_orders
        ADD CONSTRAINT purchase_orders_company_id_fkey
        FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_purchase_orders_job ON public.purchase_orders(job_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_company ON public.purchase_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON public.purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_delivery_date ON public.purchase_orders(delivery_date);

-- Updated_at trigger
DROP TRIGGER IF EXISTS trg_purchase_orders_updated_at ON public.purchase_orders;
CREATE TRIGGER trg_purchase_orders_updated_at
BEFORE UPDATE ON public.purchase_orders
FOR EACH ROW
EXECUTE FUNCTION update_materials_updated_at();

-- ============================================================
-- 3. PURCHASE_ORDER_ITEMS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  material_name text NOT NULL,
  quantity numeric NOT NULL,
  unit text,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_po_items_po ON public.purchase_order_items(po_id);
CREATE INDEX IF NOT EXISTS idx_po_items_material ON public.purchase_order_items(material_name);

-- ============================================================
-- 4. MATERIAL_ADJUSTMENTS TABLE (Track usage + returns)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.material_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid REFERENCES public.materials(id) ON DELETE SET NULL,
  job_id uuid,
  adjustment numeric NOT NULL, -- positive = add, negative = subtract
  reason text,
  created_at timestamptz DEFAULT now()
);

-- Add foreign key to jobs if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'material_adjustments_job_id_fkey'
    ) THEN
      ALTER TABLE public.material_adjustments
        ADD CONSTRAINT material_adjustments_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE SET NULL;
    END IF;
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'material_adjustments_job_id_fkey'
    ) THEN
      ALTER TABLE public.material_adjustments
        ADD CONSTRAINT material_adjustments_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_material_adjustments_material ON public.material_adjustments(material_id);
CREATE INDEX IF NOT EXISTS idx_material_adjustments_job ON public.material_adjustments(job_id);
CREATE INDEX IF NOT EXISTS idx_material_adjustments_created ON public.material_adjustments(created_at DESC);

-- ============================================================
-- 5. HELPER FUNCTIONS
-- ============================================================

-- Function to update material quantity when adjustment is made
CREATE OR REPLACE FUNCTION public.update_material_quantity_on_adjustment()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.material_id IS NOT NULL THEN
    UPDATE public.materials
    SET quantity = quantity + NEW.adjustment,
        updated_at = now()
    WHERE id = NEW.material_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-update material quantity
DROP TRIGGER IF EXISTS trg_update_material_on_adjustment ON public.material_adjustments;
CREATE TRIGGER trg_update_material_on_adjustment
AFTER INSERT ON public.material_adjustments
FOR EACH ROW
EXECUTE FUNCTION public.update_material_quantity_on_adjustment();

-- Function to check for low inventory and return materials below threshold
CREATE OR REPLACE FUNCTION public.get_low_inventory_materials(p_company_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  quantity numeric,
  min_quantity numeric,
  unit text,
  status text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.id,
    m.name,
    m.quantity,
    m.min_quantity,
    m.unit,
    CASE 
      WHEN m.quantity <= 0 THEN 'out'
      WHEN m.quantity < m.min_quantity THEN 'low'
      ELSE 'ok'
    END as status
  FROM public.materials m
  WHERE m.company_id = p_company_id
    AND (m.quantity <= 0 OR m.quantity < m.min_quantity)
  ORDER BY (m.quantity - m.min_quantity) ASC;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate material requirements for a job
CREATE OR REPLACE FUNCTION public.calculate_job_material_requirements(p_job_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_requirements jsonb := '{}'::jsonb;
BEGIN
  -- This function can be extended to calculate based on job details
  -- For now, returns empty object - will be populated by application logic
  RETURN v_requirements;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 6. ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_adjustments ENABLE ROW LEVEL SECURITY;

-- Materials: Company members can access
DROP POLICY IF EXISTS "materials_company_access" ON public.materials;
CREATE POLICY "materials_company_access" ON public.materials
  FOR ALL USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE wm.user_id = auth.uid()
    )
    OR company_id IS NULL
  );

-- Purchase Orders: Company members can access
DROP POLICY IF EXISTS "purchase_orders_company_access" ON public.purchase_orders;
CREATE POLICY "purchase_orders_company_access" ON public.purchase_orders
  FOR ALL USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE wm.user_id = auth.uid()
    )
    OR company_id IS NULL
  );

-- Purchase Order Items: Access via PO
DROP POLICY IF EXISTS "po_items_access" ON public.purchase_order_items;
CREATE POLICY "po_items_access" ON public.purchase_order_items
  FOR ALL USING (
    po_id IN (
      SELECT id FROM public.purchase_orders
      WHERE company_id IN (
        SELECT c.id FROM public.companies c
        JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
        WHERE wm.user_id = auth.uid()
      )
      OR company_id IS NULL
    )
  );

-- Material Adjustments: Company members can access
DROP POLICY IF EXISTS "material_adjustments_company_access" ON public.material_adjustments;
CREATE POLICY "material_adjustments_company_access" ON public.material_adjustments
  FOR ALL USING (
    material_id IN (
      SELECT id FROM public.materials
      WHERE company_id IN (
        SELECT c.id FROM public.companies c
        JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
        WHERE wm.user_id = auth.uid()
      )
      OR company_id IS NULL
    )
  );

-- Service role full access
DROP POLICY IF EXISTS "materials_service_role_all" ON public.materials;
CREATE POLICY "materials_service_role_all" ON public.materials
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "purchase_orders_service_role_all" ON public.purchase_orders;
CREATE POLICY "purchase_orders_service_role_all" ON public.purchase_orders
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "po_items_service_role_all" ON public.purchase_order_items;
CREATE POLICY "po_items_service_role_all" ON public.purchase_order_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "material_adjustments_service_role_all" ON public.material_adjustments;
CREATE POLICY "material_adjustments_service_role_all" ON public.material_adjustments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 7. COMMENTS
-- ============================================================
COMMENT ON TABLE public.materials IS 'Block 48000: Master inventory of roofing materials';
COMMENT ON TABLE public.purchase_orders IS 'Block 48000: Purchase orders to suppliers';
COMMENT ON TABLE public.purchase_order_items IS 'Block 48000: Line items in purchase orders';
COMMENT ON TABLE public.material_adjustments IS 'Block 48000: Tracks material usage and returns';
































