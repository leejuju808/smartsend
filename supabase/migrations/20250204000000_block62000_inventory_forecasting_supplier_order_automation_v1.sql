-- Block 62000 — SmartSend Roofing "Inventory Forecasting + Supplier Order Automation" v1
-- PREDICT MATERIAL NEEDS • AUTO-GENERATE SUPPLIER ORDERS • PREVENT SHORTAGES • REAL-TIME MATERIAL COSTING • DELIVERY SCHEDULING
--
-- This block transforms SmartSend into a material logistics machine — something 99% of roofing companies desperately need and NONE of the major CRMs provide.
--
-- Roofers lose THOUSANDS because:
-- - they over-order
-- - they under-order
-- - they forget to order
-- - delivery is late
-- - crews sit idle waiting for materials
-- - wrong color or wrong type arrives
-- - leftover materials disappear
-- - supplier pricing fluctuates
-- - nobody checks inventory before a job
--
-- SmartSend fixes ALL OF IT.

-- ============================================================
-- 1. MATERIAL_FORECASTS TABLE
-- ============================================================
-- AI-powered material forecasting based on roof specs
CREATE TABLE IF NOT EXISTS public.material_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Forecast data (JSONB for flexibility)
  forecast jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Structure: {
  --   "shingles": {"bundles": 45, "squares": 15, "color": "Moire Black"},
  --   "ridge_cap": {"bundles": 3, "linear_feet": 90},
  --   "underlayment": {"rolls": 2, "type": "synthetic"},
  --   "ice_water_shield": {"rolls": 2},
  --   "starter_strip": {"bundles": 2},
  --   "nails": {"boxes": 1},
  --   "flashing": {"linear_feet": 120},
  --   "vents": {"pieces": 8},
  --   "plywood": {"sheets": 0}
  -- }
  
  -- Input parameters used for forecast
  roof_squares numeric,
  roof_pitch numeric,
  number_of_layers integer DEFAULT 1,
  shingle_type text, -- '3_tab', 'architectural', 'premium'
  ridge_type text,
  underlayment_type text DEFAULT 'synthetic',
  decking_replacement_probability numeric DEFAULT 0, -- 0.0 to 1.0
  waste_factor numeric DEFAULT 0.12, -- 12% default waste
  
  -- Historical accuracy tracking
  historical_average_accuracy numeric, -- Percentage accuracy vs actual usage
  
  -- Cost estimates
  total_forecasted_cost numeric,
  
  -- Status
  is_approved boolean DEFAULT false,
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_material_forecasts_job ON public.material_forecasts(job_id);
CREATE INDEX IF NOT EXISTS idx_material_forecasts_workspace ON public.material_forecasts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_material_forecasts_approved ON public.material_forecasts(is_approved) WHERE is_approved = false;

-- ============================================================
-- 2. SUPPLIER_ORDERS TABLE (Enhanced from block 41700)
-- ============================================================
-- Auto-generated supplier orders from forecasts
CREATE TABLE IF NOT EXISTS public.supplier_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  forecast_id uuid REFERENCES public.material_forecasts(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  supplier_name text NOT NULL,
  
  -- Order items (JSONB for flexibility)
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Structure: [
  --   {"name": "Shingles", "quantity": 45, "unit": "bundles", "sku": "ABC-123", "color": "Moire Black", "unit_price": 45.00, "total_price": 2025.00},
  --   ...
  -- ]
  
  total_cost numeric,
  
  -- Delivery information
  delivery_date date,
  delivery_time text, -- "morning", "afternoon", "anytime"
  delivery_address text,
  delivery_instructions text,
  
  -- Status tracking
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'confirmed', 'delivered', 'cancelled', 'delayed')),
  
  -- PO details
  po_number text,
  po_pdf_url text,
  sent_at timestamptz,
  sent_via text, -- 'email', 'sms', 'api'
  
  -- Confirmation
  confirmed_at timestamptz,
  delivered_at timestamptz,
  
  -- Alerts
  is_late boolean DEFAULT false,
  shortage_detected boolean DEFAULT false,
  over_order_detected boolean DEFAULT false,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_orders_job ON public.supplier_orders(job_id);
CREATE INDEX IF NOT EXISTS idx_supplier_orders_forecast ON public.supplier_orders(forecast_id) WHERE forecast_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_supplier_orders_supplier ON public.supplier_orders(supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_supplier_orders_workspace ON public.supplier_orders(workspace_id);
CREATE INDEX IF NOT EXISTS idx_supplier_orders_status ON public.supplier_orders(status);
CREATE INDEX IF NOT EXISTS idx_supplier_orders_delivery_date ON public.supplier_orders(delivery_date) WHERE delivery_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_supplier_orders_late ON public.supplier_orders(is_late) WHERE is_late = true;
CREATE INDEX IF NOT EXISTS idx_supplier_orders_shortage ON public.supplier_orders(shortage_detected) WHERE shortage_detected = true;

-- ============================================================
-- 3. MATERIAL_COSTS TABLE
-- ============================================================
-- Live pricing updates for materials
CREATE TABLE IF NOT EXISTS public.material_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  item_name text NOT NULL, -- "Shingles", "Ridge Cap", "Underlayment", etc.
  unit text NOT NULL, -- "bundles", "rolls", "boxes", "linear_feet", "sheets"
  unit_cost numeric NOT NULL,
  
  -- Optional: Supplier-specific pricing
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  
  -- Optional: Material specifications
  brand text,
  model text,
  color text,
  sku text,
  
  -- Price history tracking
  previous_cost numeric,
  cost_change_percent numeric,
  
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  created_at timestamptz DEFAULT now(),
  
  -- Ensure unique item per workspace (or per supplier if supplier_id is set)
  UNIQUE(workspace_id, item_name, unit, COALESCE(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid))
);

CREATE INDEX IF NOT EXISTS idx_material_costs_workspace ON public.material_costs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_material_costs_supplier ON public.material_costs(supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_material_costs_item ON public.material_costs(item_name);
CREATE INDEX IF NOT EXISTS idx_material_costs_updated ON public.material_costs(updated_at DESC);

-- ============================================================
-- 4. LEFTOVER_MATERIALS TABLE
-- ============================================================
-- Track leftover materials after job completion
CREATE TABLE IF NOT EXISTS public.leftover_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  item_name text NOT NULL,
  quantity numeric NOT NULL,
  unit text NOT NULL,
  
  -- Source tracking
  supplier_order_id uuid REFERENCES public.supplier_orders(id) ON DELETE SET NULL,
  
  -- Status
  status text DEFAULT 'available' CHECK (status IN ('available', 'allocated', 'used', 'returned')),
  allocated_to_job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  
  -- Value tracking
  unit_cost numeric,
  total_value numeric,
  
  -- Notes
  notes text,
  
  -- Recorded by
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_by_crew text, -- Crew name if recorded via crew app
  
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leftover_materials_job ON public.leftover_materials(job_id);
CREATE INDEX IF NOT EXISTS idx_leftover_materials_workspace ON public.leftover_materials(workspace_id);
CREATE INDEX IF NOT EXISTS idx_leftover_materials_status ON public.leftover_materials(status) WHERE status = 'available';
CREATE INDEX IF NOT EXISTS idx_leftover_materials_item ON public.leftover_materials(item_name);

-- ============================================================
-- 5. MATERIAL_ALERTS TABLE
-- ============================================================
-- System alerts for shortages, over-orders, late deliveries, etc.
CREATE TABLE IF NOT EXISTS public.material_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  supplier_order_id uuid REFERENCES public.supplier_orders(id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  alert_type text NOT NULL CHECK (alert_type IN (
    'shortage',
    'over_order',
    'late_delivery',
    'cost_increase',
    'wrong_material',
    'missing_material',
    'delivery_confirmed'
  )),
  
  severity text DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  
  message text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  
  -- Status
  is_resolved boolean DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_material_alerts_job ON public.material_alerts(job_id);
CREATE INDEX IF NOT EXISTS idx_material_alerts_order ON public.material_alerts(supplier_order_id) WHERE supplier_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_material_alerts_workspace ON public.material_alerts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_material_alerts_type ON public.material_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_material_alerts_resolved ON public.material_alerts(is_resolved) WHERE is_resolved = false;
CREATE INDEX IF NOT EXISTS idx_material_alerts_severity ON public.material_alerts(severity) WHERE severity IN ('high', 'critical');

-- ============================================================
-- 6. HELPER FUNCTIONS
-- ============================================================

-- Function to calculate material forecast from job details
CREATE OR REPLACE FUNCTION public.calculate_material_forecast(
  p_job_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job record;
  v_forecast jsonb := '{}'::jsonb;
  v_squares numeric;
  v_pitch numeric;
  v_waste_factor numeric;
  v_shingle_bundles numeric;
  v_ridge_bundles numeric;
  v_underlayment_rolls numeric;
  v_total_cost numeric := 0;
BEGIN
  -- Get job details
  SELECT 
    rj.*,
    COALESCE(rj.roof_squares, 0) as squares,
    COALESCE(rj.roof_pitch, 6.0) as pitch,
    COALESCE(rj.decking_replacement_squares, 0) as decking_squares
  INTO v_job
  FROM public.roofing_jobs rj
  WHERE rj.id = p_job_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Job not found');
  END IF;
  
  v_squares := v_job.squares;
  v_pitch := COALESCE(v_job.pitch, 6.0);
  v_waste_factor := 0.12; -- 12% default waste
  
  -- Adjust waste factor based on pitch and complexity
  IF v_pitch > 8 THEN
    v_waste_factor := v_waste_factor + 0.03; -- Steeper roofs = more waste
  END IF;
  
  IF v_job.complexity_factor > 1.0 THEN
    v_waste_factor := v_waste_factor + 0.02; -- Complex roofs = more waste
  END IF;
  
  -- Calculate shingles (3 bundles per square, with waste)
  v_shingle_bundles := CEIL((v_squares * (1 + v_waste_factor)) * 3);
  
  -- Calculate ridge cap (estimate: 1 bundle per 5 squares, minimum 2 bundles)
  v_ridge_bundles := GREATEST(CEIL(v_squares / 5.0), 2);
  
  -- Calculate underlayment (estimate: 1 roll per 10 squares)
  v_underlayment_rolls := CEIL((v_squares * (1 + v_waste_factor)) / 10.0);
  
  -- Build forecast JSONB
  v_forecast := jsonb_build_object(
    'shingles', jsonb_build_object(
      'bundles', v_shingle_bundles,
      'squares', v_squares,
      'waste_factor', v_waste_factor
    ),
    'ridge_cap', jsonb_build_object(
      'bundles', v_ridge_bundles
    ),
    'underlayment', jsonb_build_object(
      'rolls', v_underlayment_rolls,
      'type', 'synthetic'
    ),
    'ice_water_shield', jsonb_build_object(
      'rolls', GREATEST(CEIL(v_squares / 18.0), 2)
    ),
    'starter_strip', jsonb_build_object(
      'bundles', CEIL(v_squares / 10.0)
    ),
    'nails', jsonb_build_object(
      'boxes', 1
    ),
    'flashing', jsonb_build_object(
      'linear_feet', CEIL(v_squares * 8)
    ),
    'vents', jsonb_build_object(
      'pieces', GREATEST(CEIL(v_squares / 2.0), 4)
    ),
    'plywood', jsonb_build_object(
      'sheets', CEIL(v_job.decking_squares * 3.33) -- 3.33 sheets per square
    )
  );
  
  RETURN jsonb_build_object(
    'forecast', v_forecast,
    'total_squares', v_squares,
    'waste_factor', v_waste_factor,
    'decking_replacement_squares', v_job.decking_squares
  );
END;
$$;

COMMENT ON FUNCTION public.calculate_material_forecast IS 'Block 62000: Calculates material forecast from job details';

-- Function to check for material shortages
CREATE OR REPLACE FUNCTION public.check_material_shortage(
  p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order record;
  v_forecast record;
  v_shortages jsonb := '[]'::jsonb;
  v_item jsonb;
  v_forecast_qty numeric;
  v_ordered_qty numeric;
  v_item_key text;
  v_forecast_item jsonb;
BEGIN
  -- Get order
  SELECT * INTO v_order FROM public.supplier_orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Order not found');
  END IF;
  
  -- Get forecast
  SELECT * INTO v_forecast FROM public.material_forecasts WHERE id = v_order.forecast_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Forecast not found');
  END IF;
  
  -- Compare forecast vs ordered quantities
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_order.items)
  LOOP
    -- Map item name to forecast key (lowercase, replace spaces with underscores)
    -- Forecast structure: {"shingles": {"bundles": 45}, "ridge_cap": {"bundles": 3}, ...}
    -- Item name mapping: "Shingles" -> "shingles", "Ridge Cap" -> "ridge_cap", etc.
    v_item_key := lower(replace(v_item->>'name', ' ', '_'));
    v_forecast_item := v_forecast.forecast->v_item_key;
    
    -- Extract quantity based on unit type
    IF v_item->>'unit' = 'bundles' THEN
      v_forecast_qty := COALESCE((v_forecast_item->>'bundles')::numeric, 0);
    ELSIF v_item->>'unit' = 'rolls' THEN
      v_forecast_qty := COALESCE((v_forecast_item->>'rolls')::numeric, 0);
    ELSIF v_item->>'unit' = 'boxes' THEN
      v_forecast_qty := COALESCE((v_forecast_item->>'boxes')::numeric, 0);
    ELSIF v_item->>'unit' = 'linear_feet' THEN
      v_forecast_qty := COALESCE((v_forecast_item->>'linear_feet')::numeric, 0);
    ELSIF v_item->>'unit' = 'pieces' THEN
      v_forecast_qty := COALESCE((v_forecast_item->>'pieces')::numeric, 0);
    ELSIF v_item->>'unit' = 'sheets' THEN
      v_forecast_qty := COALESCE((v_forecast_item->>'sheets')::numeric, 0);
    ELSE
      v_forecast_qty := 0;
    END IF;
    
    v_ordered_qty := (v_item->>'quantity')::numeric;
    
    -- Skip if no forecast data for this item
    IF v_forecast_qty IS NULL OR v_forecast_qty = 0 THEN
      CONTINUE;
    END IF;
    
    IF v_ordered_qty < v_forecast_qty THEN
      v_shortages := v_shortages || jsonb_build_object(
        'item_name', v_item->>'name',
        'forecasted', v_forecast_qty,
        'ordered', v_ordered_qty,
        'shortage', v_forecast_qty - v_ordered_qty,
        'unit', v_item->>'unit'
      );
      
      -- Create alert
      INSERT INTO public.material_alerts (
        job_id, supplier_order_id, workspace_id,
        alert_type, severity, message, details
      ) VALUES (
        v_order.job_id, p_order_id, v_order.workspace_id,
        'shortage', 'high',
        format('Material Shortage Detected — you need %.0f more %s of %s.',
               v_forecast_qty - v_ordered_qty,
               COALESCE(v_item->>'unit', 'units'),
               v_item->>'name'),
        jsonb_build_object(
          'item_name', v_item->>'name',
          'forecasted', v_forecast_qty,
          'ordered', v_ordered_qty,
          'shortage', v_forecast_qty - v_ordered_qty
        )
      );
      
      -- Update order
      UPDATE public.supplier_orders
      SET shortage_detected = true
      WHERE id = p_order_id;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'has_shortage', jsonb_array_length(v_shortages) > 0,
    'shortages', v_shortages
  );
END;
$$;

COMMENT ON FUNCTION public.check_material_shortage IS 'Block 62000: Checks for material shortages comparing forecast vs order';

-- Function to check for over-orders
CREATE OR REPLACE FUNCTION public.check_over_order(
  p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order record;
  v_forecast record;
  v_over_orders jsonb := '[]'::jsonb;
  v_item jsonb;
  v_forecast_qty numeric;
  v_ordered_qty numeric;
  v_excess_threshold numeric := 0.15; -- 15% excess triggers alert
  v_item_key text;
  v_forecast_item jsonb;
BEGIN
  -- Get order
  SELECT * INTO v_order FROM public.supplier_orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Order not found');
  END IF;
  
  -- Get forecast
  SELECT * INTO v_forecast FROM public.material_forecasts WHERE id = v_order.forecast_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Forecast not found');
  END IF;
  
  -- Compare forecast vs ordered quantities
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_order.items)
  LOOP
    -- Map item name to forecast key (lowercase, replace spaces with underscores)
    v_item_key := lower(replace(v_item->>'name', ' ', '_'));
    v_forecast_item := v_forecast.forecast->v_item_key;
    
    -- Extract quantity based on unit type
    IF v_item->>'unit' = 'bundles' THEN
      v_forecast_qty := COALESCE((v_forecast_item->>'bundles')::numeric, 0);
    ELSIF v_item->>'unit' = 'rolls' THEN
      v_forecast_qty := COALESCE((v_forecast_item->>'rolls')::numeric, 0);
    ELSIF v_item->>'unit' = 'boxes' THEN
      v_forecast_qty := COALESCE((v_forecast_item->>'boxes')::numeric, 0);
    ELSIF v_item->>'unit' = 'linear_feet' THEN
      v_forecast_qty := COALESCE((v_forecast_item->>'linear_feet')::numeric, 0);
    ELSIF v_item->>'unit' = 'pieces' THEN
      v_forecast_qty := COALESCE((v_forecast_item->>'pieces')::numeric, 0);
    ELSIF v_item->>'unit' = 'sheets' THEN
      v_forecast_qty := COALESCE((v_forecast_item->>'sheets')::numeric, 0);
    ELSE
      v_forecast_qty := 0;
    END IF;
    
    v_ordered_qty := (v_item->>'quantity')::numeric;
    
    -- Skip if no forecast data for this item
    IF v_forecast_qty IS NULL OR v_forecast_qty = 0 THEN
      CONTINUE;
    END IF;
    
    -- Check if ordered is significantly more than forecasted
    IF v_ordered_qty > v_forecast_qty * (1 + v_excess_threshold) THEN
      v_over_orders := v_over_orders || jsonb_build_object(
        'item_name', v_item->>'name',
        'forecasted', v_forecast_qty,
        'ordered', v_ordered_qty,
        'excess', v_ordered_qty - v_forecast_qty,
        'excess_percent', ((v_ordered_qty - v_forecast_qty) / v_forecast_qty * 100),
        'unit', v_item->>'unit'
      );
      
      -- Create alert
      INSERT INTO public.material_alerts (
        job_id, supplier_order_id, workspace_id,
        alert_type, severity, message, details
      ) VALUES (
        v_order.job_id, p_order_id, v_order.workspace_id,
        'over_order', 'medium',
        format('Over-order detected — reduce order by %.0f %s to avoid waste.',
               v_ordered_qty - v_forecast_qty,
               COALESCE(v_item->>'unit', 'units')),
        jsonb_build_object(
          'item_name', v_item->>'name',
          'forecasted', v_forecast_qty,
          'ordered', v_ordered_qty,
          'excess', v_ordered_qty - v_forecast_qty
        )
      );
      
      -- Update order
      UPDATE public.supplier_orders
      SET over_order_detected = true
      WHERE id = p_order_id;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'has_over_order', jsonb_array_length(v_over_orders) > 0,
    'over_orders', v_over_orders
  );
END;
$$;

COMMENT ON FUNCTION public.check_over_order IS 'Block 62000: Checks for over-orders comparing forecast vs order';

-- ============================================================
-- 7. TRIGGERS
-- ============================================================

-- Auto-update updated_at timestamps
CREATE OR REPLACE FUNCTION public.update_material_forecasts_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_material_forecasts_updated_at ON public.material_forecasts;
CREATE TRIGGER trg_update_material_forecasts_updated_at
BEFORE UPDATE ON public.material_forecasts
FOR EACH ROW
EXECUTE FUNCTION public.update_material_forecasts_updated_at();

CREATE OR REPLACE FUNCTION public.update_supplier_orders_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_supplier_orders_updated_at ON public.supplier_orders;
CREATE TRIGGER trg_update_supplier_orders_updated_at
BEFORE UPDATE ON public.supplier_orders
FOR EACH ROW
EXECUTE FUNCTION public.update_supplier_orders_updated_at();

-- ============================================================
-- 8. ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Material Forecasts
ALTER TABLE public.material_forecasts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "material_forecasts_workspace_access" ON public.material_forecasts;
CREATE POLICY "material_forecasts_workspace_access" ON public.material_forecasts
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Supplier Orders
ALTER TABLE public.supplier_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "supplier_orders_workspace_access" ON public.supplier_orders;
CREATE POLICY "supplier_orders_workspace_access" ON public.supplier_orders
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Material Costs
ALTER TABLE public.material_costs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "material_costs_workspace_access" ON public.material_costs;
CREATE POLICY "material_costs_workspace_access" ON public.material_costs
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Leftover Materials
ALTER TABLE public.leftover_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leftover_materials_workspace_access" ON public.leftover_materials;
CREATE POLICY "leftover_materials_workspace_access" ON public.leftover_materials
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Material Alerts
ALTER TABLE public.material_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "material_alerts_workspace_access" ON public.material_alerts;
CREATE POLICY "material_alerts_workspace_access" ON public.material_alerts
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Service role full access
DROP POLICY IF EXISTS "material_forecasts_service_role_all" ON public.material_forecasts;
CREATE POLICY "material_forecasts_service_role_all" ON public.material_forecasts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "supplier_orders_service_role_all" ON public.supplier_orders;
CREATE POLICY "supplier_orders_service_role_all" ON public.supplier_orders
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "material_costs_service_role_all" ON public.material_costs;
CREATE POLICY "material_costs_service_role_all" ON public.material_costs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "leftover_materials_service_role_all" ON public.leftover_materials;
CREATE POLICY "leftover_materials_service_role_all" ON public.leftover_materials
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "material_alerts_service_role_all" ON public.material_alerts;
CREATE POLICY "material_alerts_service_role_all" ON public.material_alerts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 9. GRANT PERMISSIONS
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_forecasts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_costs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leftover_materials TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_alerts TO authenticated;

GRANT EXECUTE ON FUNCTION public.calculate_material_forecast(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_material_shortage(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_over_order(uuid) TO authenticated;

-- ============================================================
-- 10. COMMENTS
-- ============================================================

COMMENT ON TABLE public.material_forecasts IS 'Block 62000: AI-powered material forecasting based on roof specs';
COMMENT ON TABLE public.supplier_orders IS 'Block 62000: Auto-generated supplier orders from forecasts';
COMMENT ON TABLE public.material_costs IS 'Block 62000: Live pricing updates for materials';
COMMENT ON TABLE public.leftover_materials IS 'Block 62000: Track leftover materials after job completion';
COMMENT ON TABLE public.material_alerts IS 'Block 62000: System alerts for shortages, over-orders, late deliveries';

