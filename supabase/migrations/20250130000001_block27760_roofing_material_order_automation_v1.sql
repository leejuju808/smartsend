-- =========================================================
-- Block 27760 — SmartSend Roofing Material Order Automation v1
-- (Auto-generate material lists • Send to suppliers • Track delivery status • Adjust when change orders hit)
-- =========================================================
-- 
-- This block turns SmartSend into the material brain for the roofing company.
-- 
-- Right now most roofers:
-- - Do math on the fly (squares × bundles)
-- - Text or call suppliers with half-baked orders
-- - Forget drip edge / vents / nails / ice & water
-- - Over-order (waste money) or under-order (waste time)
-- - Don't update orders when change orders hit (extra squares, decking, etc.)
-- 
-- SmartSend will now:
-- Take the job + squares + system type + change orders → generate a structured material order → email it to the supplier → track "ordered / scheduled / delivered / short / returned."
-- 
-- This connects directly to your profit engine and production schedule.

-- ============================================================================
-- PART 1 — CREATE roofing_suppliers TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.roofing_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_name text,
  contact_email text,
  contact_phone text,
  notes text,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roofing_suppliers_name ON public.roofing_suppliers(name);

-- ============================================================================
-- PART 2 — CREATE roofing_material_orders TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.roofing_material_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.roofing_suppliers(id),

  status text CHECK (
    status IN ('draft','sent','confirmed','delivered','partial','canceled')
  ) DEFAULT 'draft',

  delivery_date date,
  delivery_window text,          -- 'AM','PM','Any'
  drop_location text,            -- 'driveway','roof_load','back_alley', etc.

  notes text,                    -- internal notes for office/crew
  supplier_reference text,       -- PO # / order # from supplier

  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roofing_material_orders_job ON public.roofing_material_orders(job_id);
CREATE INDEX IF NOT EXISTS idx_roofing_material_orders_supplier ON public.roofing_material_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_roofing_material_orders_status ON public.roofing_material_orders(status);

-- ============================================================================
-- PART 3 — CREATE roofing_material_order_items TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.roofing_material_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.roofing_material_orders(id) ON DELETE CASCADE,

  category text,                    -- 'Shingles','Underlayment','Accessory'
  product_code text,                -- SKU or supplier code
  description text NOT NULL,

  quantity numeric NOT NULL,
  unit text,                        -- 'bundle','roll','ea','sq'

  source text,                      -- 'base_scope','change_order'
  source_ref uuid,                  -- id of estimate line or CO item

  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roofing_material_order_items_order ON public.roofing_material_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_roofing_material_order_items_source ON public.roofing_material_order_items(source);

-- ============================================================================
-- PART 4 — ADD material_status COLUMN TO roofing_jobs
-- ============================================================================

ALTER TABLE public.roofing_jobs
ADD COLUMN IF NOT EXISTS material_status text CHECK (
  material_status IN ('not_planned','draft_order','ordered','confirmed','delivered','issue')
) DEFAULT 'not_planned';

CREATE INDEX IF NOT EXISTS idx_roofing_jobs_material_status ON public.roofing_jobs(material_status) WHERE material_status IS NOT NULL;

-- ============================================================================
-- PART 5 — ROW LEVEL SECURITY POLICIES
-- ============================================================================

ALTER TABLE public.roofing_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roofing_material_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roofing_material_order_items ENABLE ROW LEVEL SECURITY;

-- Suppliers: Allow authenticated users to manage suppliers
CREATE POLICY "Users can view suppliers"
  ON public.roofing_suppliers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can manage suppliers"
  ON public.roofing_suppliers FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Material Orders: Users can view/manage orders for jobs they have access to
CREATE POLICY "Users can view material orders"
  ON public.roofing_material_orders FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_jobs rj
      JOIN public.workspace_members wm ON wm.workspace_id = rj.workspace_id
      WHERE rj.id = roofing_material_orders.job_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage material orders"
  ON public.roofing_material_orders FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_jobs rj
      JOIN public.workspace_members wm ON wm.workspace_id = rj.workspace_id
      WHERE rj.id = roofing_material_orders.job_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.roofing_jobs rj
      JOIN public.workspace_members wm ON wm.workspace_id = rj.workspace_id
      WHERE rj.id = roofing_material_orders.job_id
        AND wm.user_id = auth.uid()
    )
  );

-- Material Order Items: Inherit access from parent order
CREATE POLICY "Users can view material order items"
  ON public.roofing_material_order_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_material_orders rmo
      JOIN public.roofing_jobs rj ON rj.id = rmo.job_id
      JOIN public.workspace_members wm ON wm.workspace_id = rj.workspace_id
      WHERE rmo.id = roofing_material_order_items.order_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage material order items"
  ON public.roofing_material_order_items FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_material_orders rmo
      JOIN public.roofing_jobs rj ON rj.id = rmo.job_id
      JOIN public.workspace_members wm ON wm.workspace_id = rj.workspace_id
      WHERE rmo.id = roofing_material_order_items.order_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.roofing_material_orders rmo
      JOIN public.roofing_jobs rj ON rj.id = rmo.job_id
      JOIN public.workspace_members wm ON wm.workspace_id = rj.workspace_id
      WHERE rmo.id = roofing_material_order_items.order_id
        AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 6 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.roofing_suppliers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roofing_material_orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roofing_material_order_items TO authenticated;

-- ============================================================================
-- PART 7 — TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_roofing_material_orders_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_roofing_material_orders_updated_at
BEFORE UPDATE ON public.roofing_material_orders
FOR EACH ROW
EXECUTE FUNCTION public.update_roofing_material_orders_updated_at();

COMMENT ON TABLE public.roofing_suppliers IS 'Block 27760: Material Order Automation - Supplier contacts';
COMMENT ON TABLE public.roofing_material_orders IS 'Block 27760: Material Order Automation - Material orders per job';
COMMENT ON TABLE public.roofing_material_order_items IS 'Block 27760: Material Order Automation - Line items for each order';



































