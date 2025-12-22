-- =========================================================
-- Block 22510 — SmartSend Roofing Material Cost History & Price Spike Alerts v1
-- (Catch price hikes BEFORE they eat the job profit.)
-- =========================================================
-- 
-- This block turns SmartSend into a price-protection system.
-- Roofers get:
-- - History of material costs by supplier + product
-- - See which supplier is slowly creeping prices up
-- - Auto alerts when a supplier suddenly raises price
-- - Easier negotiations with historical data
-- - Protection for job margins when markets get weird

-- ============================================================================
-- PART 1 — EXTEND material_order_items TABLE
-- ============================================================================
-- Add workspace_id and category for better price tracking and RLS

ALTER TABLE public.material_order_items
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS category text; -- e.g. "shingles", "underlayment", "flashing"

-- Backfill workspace_id from parent order
UPDATE public.material_order_items moi
SET workspace_id = mo.workspace_id
FROM public.material_orders mo
WHERE moi.material_order_id = mo.id
  AND moi.workspace_id IS NULL;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS material_order_items_workspace_idx
  ON public.material_order_items (workspace_id);

CREATE INDEX IF NOT EXISTS material_order_items_category_idx
  ON public.material_order_items (category)
  WHERE category IS NOT NULL;

CREATE INDEX IF NOT EXISTS material_order_items_created_at_idx
  ON public.material_order_items (created_at);

-- Add trigger to auto-populate workspace_id on insert
CREATE OR REPLACE FUNCTION public.set_material_order_items_workspace_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.workspace_id IS NULL THEN
    SELECT workspace_id INTO NEW.workspace_id
    FROM public.material_orders
    WHERE id = NEW.material_order_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_material_order_items_workspace_id ON public.material_order_items;
CREATE TRIGGER trg_set_material_order_items_workspace_id
BEFORE INSERT OR UPDATE ON public.material_order_items
FOR EACH ROW
EXECUTE FUNCTION public.set_material_order_items_workspace_id();

-- ============================================================================
-- PART 2 — CREATE material_price_alerts TABLE
-- ============================================================================
-- Store spike events detected by the edge function

CREATE TABLE IF NOT EXISTS public.material_price_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  item_name text NOT NULL, -- Uses description from material_order_items
  item_sku text,
  category text,
  previous_avg_unit_price numeric(10,2),
  recent_avg_unit_price numeric(10,2),
  percent_change numeric(6,2), -- e.g. 18.50 (%)
  threshold_percent numeric(6,2) DEFAULT 15.00,
  status text CHECK (status IN ('open','acknowledged','dismissed')) DEFAULT 'open',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS material_price_alerts_workspace_idx
  ON public.material_price_alerts (workspace_id);

CREATE INDEX IF NOT EXISTS material_price_alerts_status_idx
  ON public.material_price_alerts (workspace_id, status);

CREATE INDEX IF NOT EXISTS material_price_alerts_supplier_idx
  ON public.material_price_alerts (supplier_id)
  WHERE supplier_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS material_price_alerts_created_at_idx
  ON public.material_price_alerts (created_at DESC);

-- ============================================================================
-- PART 3 — CREATE material_price_history VIEW
-- ============================================================================
-- Monthly price history aggregated by supplier + item for charting

CREATE OR REPLACE VIEW public.material_price_history AS
SELECT
  moi.workspace_id,
  mo.supplier_id,
  moi.description as item_name,
  moi.sku as item_sku,
  moi.category,
  date_trunc('month', moi.created_at) as month,
  avg(moi.unit_price) as avg_unit_price,
  min(moi.unit_price) as min_unit_price,
  max(moi.unit_price) as max_unit_price,
  count(*) as order_count,
  sum(moi.quantity) as total_quantity
FROM public.material_order_items moi
JOIN public.material_orders mo ON mo.id = moi.material_order_id
WHERE moi.unit_price IS NOT NULL
  AND moi.unit_price > 0
GROUP BY
  moi.workspace_id,
  mo.supplier_id,
  moi.description,
  moi.sku,
  moi.category,
  date_trunc('month', moi.created_at);

-- ============================================================================
-- PART 4 — ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Material Order Items: Update RLS to use workspace_id directly
DROP POLICY IF EXISTS "Users can view material order items" ON public.material_order_items;
DROP POLICY IF EXISTS "Users can manage material order items" ON public.material_order_items;

CREATE POLICY "Users can view material order items"
  ON public.material_order_items FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage material order items"
  ON public.material_order_items FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Material Price Alerts: Users can view/manage alerts in their workspace
ALTER TABLE public.material_price_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view material price alerts in their workspace"
  ON public.material_price_alerts FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create material price alerts in their workspace"
  ON public.material_price_alerts FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update material price alerts in their workspace"
  ON public.material_price_alerts FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Material Price History View: Inherit RLS from underlying tables
-- (No explicit policy needed, uses RLS from material_order_items)

-- ============================================================================
-- PART 5 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT ON public.material_price_history TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.material_price_alerts TO authenticated;

COMMENT ON TABLE public.material_price_alerts IS 'Stores price spike alerts detected by comparing baseline vs recent material prices';
COMMENT ON VIEW public.material_price_history IS 'Monthly aggregated price history by supplier and material item for trend analysis';







































