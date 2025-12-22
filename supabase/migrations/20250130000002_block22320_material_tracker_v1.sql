-- =========================================================
-- Block 22320 — SmartSend Roofing Material Delivery & Supplier Tracker v1
-- (Are Materials Ready for the Roof?)
-- =========================================================
-- 
-- Give roofers one clean system to track:
-- - Which supplier is tied to each job
-- - What materials were ordered
-- - When they should arrive
-- - What actually got delivered
-- - What's delayed / missing
--
-- This makes SmartSend answer:
-- "Can we actually start this job on the day we scheduled, or are we going to look stupid because shingles never showed up?"

-- ============================================================================
-- PART 1 — CREATE suppliers TABLE
-- ============================================================================
-- Lets a roofer preload: ABC Supply, Beacon, Local yard, etc.

CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  name text NOT NULL,           -- "ABC Roofing Supply"
  contact_name text,
  phone text,
  email text,
  notes text,

  is_active boolean DEFAULT true,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS suppliers_workspace_idx
  ON public.suppliers (workspace_id, is_active);

-- ============================================================================
-- PART 2 — CREATE material_orders TABLE
-- ============================================================================
-- One order per job per supplier (you can have multiple orders per job later).

CREATE TABLE IF NOT EXISTS public.material_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,

  po_number text,        -- supplier's reference / PO #
  status text CHECK (status IN (
    'draft',
    'ordered',
    'confirmed',
    'on_truck',
    'delivered',
    'partial',
    'cancelled'
  )) DEFAULT 'draft',

  expected_delivery_date date,
  actual_delivery_date date,

  subtotal numeric,
  tax numeric,
  total numeric,

  notes text,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS material_orders_job_idx
  ON public.material_orders (job_id);

CREATE INDEX IF NOT EXISTS material_orders_supplier_idx
  ON public.material_orders (supplier_id);

CREATE INDEX IF NOT EXISTS material_orders_workspace_idx
  ON public.material_orders (workspace_id);

-- ============================================================================
-- PART 3 — CREATE material_order_items TABLE
-- ============================================================================
-- Line items for each order (shingles, underlayment, vents, etc.).

CREATE TABLE IF NOT EXISTS public.material_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_order_id uuid NOT NULL REFERENCES public.material_orders(id) ON DELETE CASCADE,

  description text NOT NULL,   -- "Malarkey Vista AR in Weathered Wood"
  sku text,
  quantity numeric,
  unit text,                   -- "sq", "bundle", "roll", "each"
  unit_price numeric,
  total_price numeric,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS material_order_items_order_idx
  ON public.material_order_items (material_order_id);

-- ============================================================================
-- PART 4 — CREATE material_deliveries TABLE
-- ============================================================================
-- If you want finer tracking (partial deliveries, multiple trucks, etc.).

CREATE TABLE IF NOT EXISTS public.material_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  material_order_id uuid NOT NULL REFERENCES public.material_orders(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,

  delivery_date date,
  status text CHECK (status IN ('scheduled','delivered','partial','failed','delayed')) DEFAULT 'scheduled',

  delivered_by text,        -- name of supplier driver / truck
  notes text,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS material_deliveries_job_idx 
  ON public.material_deliveries(job_id);

CREATE INDEX IF NOT EXISTS material_deliveries_order_idx 
  ON public.material_deliveries(material_order_id);

CREATE INDEX IF NOT EXISTS material_deliveries_workspace_idx 
  ON public.material_deliveries(workspace_id);

-- ============================================================================
-- PART 5 — ADD MATERIAL STATUS COLUMNS TO roofing_jobs
-- ============================================================================
-- Add simple columns to jobs so the job card can show material status at a glance

ALTER TABLE public.roofing_jobs
  ADD COLUMN IF NOT EXISTS material_status text, -- 'not_ordered','ordered','confirmed','delivered','partial','issue'
  ADD COLUMN IF NOT EXISTS material_supplier_name text,
  ADD COLUMN IF NOT EXISTS material_expected_date date;

CREATE INDEX IF NOT EXISTS roofing_jobs_material_status_idx
  ON public.roofing_jobs(material_status) 
  WHERE material_status IS NOT NULL;

-- ============================================================================
-- PART 6 — CREATE sync_job_material_status RPC FUNCTION
-- ============================================================================
-- sync_job_material_status(job_id) will:
-- - Look at latest material_orders for that job
-- - Look at material_deliveries
-- - Decide a simple status label and mirror it onto jobs.

CREATE OR REPLACE FUNCTION public.sync_job_material_status(p_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order public.material_orders%rowtype;
  v_delivery public.material_deliveries%rowtype;
  v_status text;
BEGIN
  -- Most recent non-cancelled order for the job
  SELECT *
  INTO v_order
  FROM public.material_orders
  WHERE job_id = p_job_id
    AND status != 'cancelled'
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    UPDATE public.roofing_jobs
    SET
      material_status = 'not_ordered',
      material_supplier_name = NULL,
      material_expected_date = NULL,
      updated_at = now()
    WHERE id = p_job_id;
    RETURN;
  END IF;

  -- Latest delivery record for this order, if any
  SELECT *
  INTO v_delivery
  FROM public.material_deliveries
  WHERE material_order_id = v_order.id
  ORDER BY created_at DESC
  LIMIT 1;

  -- Determine status
  IF v_delivery.id IS NOT NULL THEN
    IF v_delivery.status = 'delivered' THEN
      v_status := 'delivered';
    ELSIF v_delivery.status = 'partial' THEN
      v_status := 'partial';
    ELSIF v_delivery.status = 'delayed' THEN
      v_status := 'issue';
    ELSE
      -- scheduled or failed -> use order status
      IF v_order.status IN ('ordered','confirmed','on_truck') THEN
        v_status := v_order.status;
      ELSE
        v_status := 'ordered';
      END IF;
    END IF;
  ELSE
    -- No delivery record yet -> use order status
    IF v_order.status IN ('ordered','confirmed','on_truck') THEN
      v_status := v_order.status;
    ELSIF v_order.status = 'delivered' THEN
      v_status := 'delivered';
    ELSIF v_order.status = 'partial' THEN
      v_status := 'partial';
    ELSE
      v_status := 'ordered';
    END IF;
  END IF;

  UPDATE public.roofing_jobs
  SET
    material_status = v_status,
    material_expected_date = v_order.expected_delivery_date,
    material_supplier_name = (
      SELECT name FROM public.suppliers WHERE id = v_order.supplier_id
    ),
    updated_at = now()
  WHERE id = p_job_id;
END;
$$;

COMMENT ON FUNCTION public.sync_job_material_status IS 'Syncs material order and delivery status to roofing_jobs.material_status';

-- ============================================================================
-- PART 7 — CREATE TRIGGERS FOR AUTO-SYNC
-- ============================================================================
-- Hook sync_job_material_status to triggers on material_orders and material_deliveries

CREATE OR REPLACE FUNCTION public.material_orders_after_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.sync_job_material_status(NEW.job_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS material_orders_after_change_trigger ON public.material_orders;
CREATE TRIGGER material_orders_after_change_trigger
AFTER INSERT OR UPDATE ON public.material_orders
FOR EACH ROW
EXECUTE FUNCTION public.material_orders_after_change();

CREATE OR REPLACE FUNCTION public.material_deliveries_after_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.sync_job_material_status(NEW.job_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS material_deliveries_after_change_trigger ON public.material_deliveries;
CREATE TRIGGER material_deliveries_after_change_trigger
AFTER INSERT OR UPDATE ON public.material_deliveries
FOR EACH ROW
EXECUTE FUNCTION public.material_deliveries_after_change();

-- ============================================================================
-- PART 8 — ROW LEVEL SECURITY POLICIES
-- ============================================================================

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_deliveries ENABLE ROW LEVEL SECURITY;

-- Suppliers: Users can view/manage suppliers in their workspace
CREATE POLICY "Users can view suppliers in their workspace"
  ON public.suppliers FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create suppliers in their workspace"
  ON public.suppliers FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update suppliers in their workspace"
  ON public.suppliers FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete suppliers in their workspace"
  ON public.suppliers FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Material Orders: Users can view/manage orders in their workspace
CREATE POLICY "Users can view material orders in their workspace"
  ON public.material_orders FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create material orders in their workspace"
  ON public.material_orders FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update material orders in their workspace"
  ON public.material_orders FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete material orders in their workspace"
  ON public.material_orders FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Material Order Items: Inherit access from parent order
CREATE POLICY "Users can view material order items"
  ON public.material_order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.material_orders mo
      JOIN public.workspace_members wm ON wm.workspace_id = mo.workspace_id
      WHERE mo.id = material_order_items.material_order_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage material order items"
  ON public.material_order_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.material_orders mo
      JOIN public.workspace_members wm ON wm.workspace_id = mo.workspace_id
      WHERE mo.id = material_order_items.material_order_id
        AND wm.user_id = auth.uid()
    )
  );

-- Material Deliveries: Users can view/manage deliveries in their workspace
CREATE POLICY "Users can view material deliveries in their workspace"
  ON public.material_deliveries FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create material deliveries in their workspace"
  ON public.material_deliveries FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update material deliveries in their workspace"
  ON public.material_deliveries FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete material deliveries in their workspace"
  ON public.material_deliveries FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 9 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_order_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_deliveries TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_job_material_status(uuid) TO authenticated;








































