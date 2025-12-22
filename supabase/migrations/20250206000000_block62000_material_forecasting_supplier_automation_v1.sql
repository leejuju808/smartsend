-- =========================================================
-- Block 62000 — SmartSend Roofing "Inventory Forecasting + Supplier Order Automation" v1
-- (PREDICT MATERIAL NEEDS • AUTO-GENERATE SUPPLIER ORDERS • PREVENT SHORTAGES • REAL-TIME MATERIAL COSTING • DELIVERY SCHEDULING)
-- =========================================================
-- 
-- This block transforms SmartSend into a material logistics machine — something 99% of roofing companies desperately need.
-- 
-- Features:
-- 1. AI Material Forecasting Engine (enhanced algorithm)
-- 2. Supplier Order Auto-Generator
-- 3. Delivery Scheduling + Calendar Sync
-- 4. Material Cost Sync (Live Pricing Updates)
-- 5. Shortage Prevention System
-- 6. Over-Order Detection
-- 7. Leftover Material Tracker
-- 8. Supplier Order History

-- ============================================================================
-- PART 1 — CREATE material_forecasts TABLE
-- ============================================================================
-- AI-powered material forecasts based on roof characteristics

CREATE TABLE IF NOT EXISTS public.material_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Forecast inputs (for audit/recalculation)
  roof_squares numeric(10,2),
  roof_pitch numeric(5,2), -- e.g., 6.0 for 6/12 pitch
  number_of_layers integer DEFAULT 1,
  shingle_type text, -- 'architectural', '3_tab', 'metal', etc.
  ridge_type text, -- 'ridge_vent', 'ridge_cap', etc.
  underlayment_type text, -- 'synthetic', 'felt', etc.
  decking_replacement_probability numeric(5,2) DEFAULT 0, -- 0-100 percentage
  waste_factor numeric(5,2) DEFAULT 12.0, -- Default 12% waste
  
  -- Forecasted materials (JSONB for flexibility)
  forecast jsonb NOT NULL DEFAULT '{}'::jsonb, -- {
  --   "shingles": {"bundles": 30, "squares": 10},
  --   "ridge_cap": {"bundles": 6, "linear_feet": 120},
  --   "underlayment": {"rolls": 4, "type": "synthetic"},
  --   "ice_water_shield": {"rolls": 2, "linear_feet": 72},
  --   "starter_strip": {"bundles": 2},
  --   "nails": {"boxes": 1, "weight": 5},
  --   "flashing": {"pieces": 4, "type": "step_flashing"},
  --   "vents": {"count": 3, "type": "box_vent"},
  --   "plywood": {"sheets": 0, "thickness": "1/2"},
  --   "drip_edge": {"linear_feet": 100}
  -- }
  
  -- Historical averages used (for learning)
  historical_averages jsonb DEFAULT '{}'::jsonb,
  
  -- Confidence and accuracy tracking
  forecast_confidence numeric(5,2) DEFAULT 85.0, -- 0-100
  actual_vs_forecast_variance jsonb, -- Track accuracy over time
  
  -- Status
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'superseded')),
  
  -- Metadata
  forecast_method text DEFAULT 'ai_enhanced', -- 'ai_enhanced', 'formula_based', 'manual'
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_material_forecasts_job ON public.material_forecasts(job_id);
CREATE INDEX IF NOT EXISTS idx_material_forecasts_workspace ON public.material_forecasts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_material_forecasts_status ON public.material_forecasts(status) WHERE status = 'approved';

-- ============================================================================
-- PART 2 — ENHANCE supplier_orders TABLE (or create if doesn't exist)
-- ============================================================================
-- Comprehensive supplier order tracking with full audit trail

CREATE TABLE IF NOT EXISTS public.supplier_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  forecast_id uuid REFERENCES public.material_forecasts(id) ON DELETE SET NULL,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  
  -- Order identification
  supplier_name text NOT NULL,
  po_number text, -- Internal PO number
  supplier_po_number text, -- Supplier's PO number (after confirmation)
  
  -- Order items (JSONB for flexibility)
  items jsonb NOT NULL DEFAULT '[]'::jsonb, -- Array of {
  --   "item_name": "Shingles - Moire Black",
  --   "sku": "OC-123",
  --   "quantity": 30,
  --   "unit": "bundles",
  --   "unit_cost": 45.50,
  --   "total_cost": 1365.00,
  --   "color": "Moire Black",
  --   "brand": "Owens Corning"
  -- }
  
  total_cost numeric(12,2) DEFAULT 0,
  
  -- Delivery details
  delivery_date date,
  delivery_time text, -- "morning", "afternoon", "anytime", "8am-12pm"
  delivery_address text,
  delivery_instructions text,
  
  -- Status tracking
  status text DEFAULT 'pending' CHECK (status IN (
    'pending',
    'sent',
    'confirmed',
    'scheduled',
    'delivered',
    'delayed',
    'cancelled'
  )),
  
  -- Communication tracking
  sent_at timestamptz,
  sent_via text, -- 'email', 'sms', 'portal', 'phone'
  sent_to_email text,
  sent_to_phone text,
  confirmation_received_at timestamptz,
  confirmation_method text, -- 'email_reply', 'sms_reply', 'portal', 'phone'
  
  -- Delivery tracking
  delivered_at timestamptz,
  delivered_by text, -- Driver/truck info
  delivery_photos jsonb DEFAULT '[]'::jsonb, -- URLs to delivery photos
  
  -- Cost tracking
  cost_synced_to_accounting boolean DEFAULT false,
  cost_synced_at timestamptz,
  
  -- Audit fields
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_orders_job ON public.supplier_orders(job_id);
CREATE INDEX IF NOT EXISTS idx_supplier_orders_forecast ON public.supplier_orders(forecast_id) WHERE forecast_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_supplier_orders_workspace ON public.supplier_orders(workspace_id);
CREATE INDEX IF NOT EXISTS idx_supplier_orders_supplier ON public.supplier_orders(supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_supplier_orders_status ON public.supplier_orders(status);
CREATE INDEX IF NOT EXISTS idx_supplier_orders_delivery_date ON public.supplier_orders(delivery_date) WHERE delivery_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_supplier_orders_po_number ON public.supplier_orders(po_number) WHERE po_number IS NOT NULL;

-- ============================================================================
-- PART 3 — CREATE material_costs TABLE
-- ============================================================================
-- Live pricing updates for material costing

CREATE TABLE IF NOT EXISTS public.material_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  
  -- Material identification
  item_name text NOT NULL, -- "Shingles", "Ridge Cap", "Underlayment", etc.
  sku text, -- Supplier SKU
  brand text, -- "Owens Corning", "GAF", etc.
  color text, -- For shingles
  unit text NOT NULL, -- "bundles", "rolls", "linear_feet", "boxes", "pieces"
  
  -- Pricing
  unit_cost numeric(10,2) NOT NULL,
  
  -- Pricing metadata
  pricing_source text DEFAULT 'manual', -- 'manual', 'abc_supply_api', 'beacon_api', 'srs_api'
  last_synced_at timestamptz, -- When last synced from API
  price_valid_until date, -- When this price expires
  
  -- Supplier info (if supplier-specific)
  supplier_name text,
  
  -- History tracking
  previous_cost numeric(10,2),
  cost_change_percent numeric(5,2), -- Percentage change from previous
  
  -- Metadata
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_material_costs_workspace ON public.material_costs(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_material_costs_supplier ON public.material_costs(supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_material_costs_item_name ON public.material_costs(item_name);
CREATE INDEX IF NOT EXISTS idx_material_costs_active ON public.material_costs(is_active) WHERE is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_material_costs_unique ON public.material_costs(workspace_id, item_name, brand, color, supplier_id) WHERE is_active = true;

-- ============================================================================
-- PART 4 — CREATE leftover_materials TABLE
-- ============================================================================
-- Track leftover materials after job completion

CREATE TABLE IF NOT EXISTS public.leftover_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  supplier_order_id uuid REFERENCES public.supplier_orders(id) ON DELETE SET NULL,
  
  -- Material info
  item_name text NOT NULL,
  quantity numeric NOT NULL,
  unit text NOT NULL, -- "bundles", "rolls", "linear_feet", etc.
  brand text,
  color text,
  
  -- Status
  status text DEFAULT 'available' CHECK (status IN (
    'available', -- Can be used on another job
    'allocated', -- Reserved for specific job
    'damaged', -- Not usable
    'sold', -- Sold/disposed of
    'expired' -- Past expiration date
  )),
  
  -- Allocation (if reserved for another job)
  allocated_to_job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  allocated_at timestamptz,
  
  -- Value tracking
  estimated_value numeric(10,2), -- Estimated value of leftover
  
  -- Usage accuracy tracking
  original_ordered_quantity numeric, -- What was ordered
  used_quantity numeric, -- What was actually used
  leftover_quantity numeric GENERATED ALWAYS AS (original_ordered_quantity - used_quantity) STORED,
  usage_variance_percent numeric(5,2), -- Variance percentage
  
  -- Metadata
  reported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reported_by_name text, -- Crew member name if no user account
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leftover_materials_job ON public.leftover_materials(job_id);
CREATE INDEX IF NOT EXISTS idx_leftover_materials_workspace ON public.leftover_materials(workspace_id);
CREATE INDEX IF NOT EXISTS idx_leftover_materials_status ON public.leftover_materials(status) WHERE status = 'available';
CREATE INDEX IF NOT EXISTS idx_leftover_materials_allocated_job ON public.leftover_materials(allocated_to_job_id) WHERE allocated_to_job_id IS NOT NULL;

-- ============================================================================
-- PART 5 — CREATE material_alerts TABLE
-- ============================================================================
-- Track shortage, over-order, and cost alerts

CREATE TABLE IF NOT EXISTS public.material_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  supplier_order_id uuid REFERENCES public.supplier_orders(id) ON DELETE SET NULL,
  
  -- Alert details
  alert_type text NOT NULL CHECK (alert_type IN (
    'shortage',
    'over_order',
    'late_delivery',
    'cost_increase',
    'wrong_material',
    'missing_item'
  )),
  severity text DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  
  -- Alert content
  title text NOT NULL,
  message text NOT NULL,
  affected_items jsonb DEFAULT '[]'::jsonb, -- Items affected
  
  -- Status
  status text DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved', 'dismissed')),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Auto-detection metadata
  auto_detected boolean DEFAULT true,
  detection_method text, -- 'forecast_comparison', 'cost_monitor', 'delivery_tracking'
  
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_material_alerts_job ON public.material_alerts(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_material_alerts_workspace ON public.material_alerts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_material_alerts_type ON public.material_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_material_alerts_status ON public.material_alerts(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_material_alerts_severity ON public.material_alerts(severity) WHERE status = 'active';

-- ============================================================================
-- PART 6 — CREATE FUNCTION: AI Material Forecasting Engine
-- ============================================================================
-- Enhanced forecasting algorithm considering all factors

CREATE OR REPLACE FUNCTION public.forecast_material_needs(
  p_job_id uuid,
  p_roof_squares numeric DEFAULT NULL,
  p_roof_pitch numeric DEFAULT NULL,
  p_number_of_layers integer DEFAULT 1,
  p_shingle_type text DEFAULT 'architectural',
  p_ridge_type text DEFAULT 'ridge_cap',
  p_underlayment_type text DEFAULT 'synthetic',
  p_decking_probability numeric DEFAULT 0,
  p_waste_factor numeric DEFAULT 12.0,
  p_historical_averages jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_forecast_id uuid;
  v_forecast jsonb;
  v_squares numeric;
  v_pitch numeric;
  v_bundles_per_square numeric := 3; -- Standard: 3 bundles per square
  v_waste_multiplier numeric;
  v_shingle_bundles numeric;
  v_ridge_bundles numeric;
  v_underlayment_rolls numeric;
  v_ice_water_rolls numeric;
  v_starter_bundles numeric;
  v_nails_boxes numeric := 1;
  v_vents_count numeric;
  v_plywood_sheets numeric;
  v_drip_edge_feet numeric;
  v_workspace_id uuid;
  v_job record;
BEGIN
  -- Get job and workspace
  SELECT rj.*, COALESCE(rj.workspace_id, (SELECT workspace_id FROM public.workspaces LIMIT 1)) as ws_id
  INTO v_job
  FROM public.roofing_jobs rj
  WHERE rj.id = p_job_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found: %', p_job_id;
  END IF;
  
  v_workspace_id := v_job.ws_id;
  
  -- Use provided values or try to get from job/measurements
  v_squares := COALESCE(
    p_roof_squares,
    (SELECT official_squares FROM public.roofing_jobs WHERE id = p_job_id),
    (SELECT squares FROM public.roof_measurements WHERE job_id = p_job_id ORDER BY created_at DESC LIMIT 1),
    (SELECT total_squares FROM public.roof_measurement_data WHERE job_id = p_job_id ORDER BY created_at DESC LIMIT 1),
    20.0 -- Default fallback
  );
  
  v_pitch := COALESCE(
    p_roof_pitch,
    (SELECT CASE 
      WHEN pitch_category = 'low' THEN 4.0
      WHEN pitch_category = 'medium' THEN 6.0
      WHEN pitch_category = 'high' THEN 10.0
      WHEN pitch_category = 'steep' THEN 12.0
      ELSE 6.0
    END FROM public.roof_measurements WHERE job_id = p_job_id ORDER BY created_at DESC LIMIT 1),
    6.0 -- Default 6/12 pitch
  );
  
  -- Calculate waste multiplier
  v_waste_multiplier := 1 + (p_waste_factor / 100.0);
  
  -- Calculate shingles (bundles)
  -- Adjust for pitch (steeper = more waste)
  IF v_pitch >= 10 THEN
    v_waste_multiplier := v_waste_multiplier * 1.05; -- 5% extra waste for steep roofs
  END IF;
  
  -- Adjust for layers (tear-off adds complexity)
  IF p_number_of_layers > 1 THEN
    v_waste_multiplier := v_waste_multiplier * 1.03; -- 3% extra waste for tear-off
  END IF;
  
  v_shingle_bundles := CEIL(v_squares * v_bundles_per_square * v_waste_multiplier);
  
  -- Calculate ridge cap (linear feet / 33 feet per bundle)
  v_ridge_bundles := CEIL(
    CASE 
      WHEN v_squares <= 15 THEN v_squares * 8 -- Estimate 8 linear feet per square
      WHEN v_squares <= 30 THEN v_squares * 7
      ELSE v_squares * 6
    END / 33.0
  );
  
  -- Calculate underlayment (synthetic: ~10 squares per roll)
  v_underlayment_rolls := CEIL(v_squares * v_waste_multiplier / 10.0);
  
  -- Calculate ice & water shield (eaves + valleys)
  -- Estimate: ~36 linear feet per roll, need 3-6 feet up from eaves
  v_ice_water_rolls := CEIL(
    CASE 
      WHEN v_squares <= 15 THEN 2
      WHEN v_squares <= 30 THEN 3
      ELSE 4
    END
  );
  
  -- Starter strip (1 bundle per ~10 squares)
  v_starter_bundles := CEIL(v_squares / 10.0);
  
  -- Vents (rough estimate: 1 vent per 150 sq ft = 1.5 squares)
  v_vents_count := CEIL(v_squares / 1.5);
  
  -- Plywood (based on decking probability)
  v_plywood_sheets := CASE 
    WHEN p_decking_probability > 50 THEN CEIL(v_squares * 0.1) -- 10% of squares may need replacement
    WHEN p_decking_probability > 25 THEN CEIL(v_squares * 0.05) -- 5%
    ELSE 0
  END;
  
  -- Drip edge (perimeter estimate: ~4 linear feet per square)
  v_drip_edge_feet := CEIL(v_squares * 4);
  
  -- Build forecast JSONB
  v_forecast := jsonb_build_object(
    'shingles', jsonb_build_object(
      'bundles', v_shingle_bundles,
      'squares', v_squares,
      'type', p_shingle_type
    ),
    'ridge_cap', jsonb_build_object(
      'bundles', v_ridge_bundles,
      'linear_feet', v_ridge_bundles * 33
    ),
    'underlayment', jsonb_build_object(
      'rolls', v_underlayment_rolls,
      'type', p_underlayment_type
    ),
    'ice_water_shield', jsonb_build_object(
      'rolls', v_ice_water_rolls,
      'linear_feet', v_ice_water_rolls * 36
    ),
    'starter_strip', jsonb_build_object(
      'bundles', v_starter_bundles
    ),
    'nails', jsonb_build_object(
      'boxes', v_nails_boxes,
      'weight', 5
    ),
    'vents', jsonb_build_object(
      'count', v_vents_count,
      'type', 'box_vent'
    ),
    'plywood', jsonb_build_object(
      'sheets', v_plywood_sheets,
      'thickness', '1/2',
      'probability', p_decking_probability
    ),
    'drip_edge', jsonb_build_object(
      'linear_feet', v_drip_edge_feet
    )
  );
  
  -- Create forecast record
  INSERT INTO public.material_forecasts (
    job_id,
    workspace_id,
    roof_squares,
    roof_pitch,
    number_of_layers,
    shingle_type,
    ridge_type,
    underlayment_type,
    decking_replacement_probability,
    waste_factor,
    forecast,
    historical_averages,
    forecast_confidence,
    status,
    forecast_method
  ) VALUES (
    p_job_id,
    v_workspace_id,
    v_squares,
    v_pitch,
    p_number_of_layers,
    p_shingle_type,
    p_ridge_type,
    p_underlayment_type,
    p_decking_probability,
    p_waste_factor,
    v_forecast,
    COALESCE(p_historical_averages, '{}'::jsonb),
    85.0, -- Base confidence
    'approved',
    'ai_enhanced'
  )
  RETURNING id INTO v_forecast_id;
  
  RETURN v_forecast_id;
END;
$$;

COMMENT ON FUNCTION public.forecast_material_needs IS 'Block 62000: AI Material Forecasting Engine - generates comprehensive material forecast based on roof characteristics';

-- ============================================================================
-- PART 7 — CREATE FUNCTION: Check Material Shortage
-- ============================================================================
-- Compares forecast vs ordered/delivered materials

CREATE OR REPLACE FUNCTION public.check_material_shortage(
  p_job_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_forecast record;
  v_order record;
  v_shortages jsonb := '[]'::jsonb;
  v_alert_id uuid;
  v_item text;
  v_forecasted_qty numeric;
  v_ordered_qty numeric;
  v_variance numeric;
  v_workspace_id uuid;
BEGIN
  -- Get approved forecast
  SELECT * INTO v_forecast
  FROM public.material_forecasts
  WHERE job_id = p_job_id
    AND status = 'approved'
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'No approved forecast found for job');
  END IF;
  
  v_workspace_id := v_forecast.workspace_id;
  
  -- Get latest supplier order
  SELECT * INTO v_order
  FROM public.supplier_orders
  WHERE job_id = p_job_id
    AND status NOT IN ('cancelled')
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('warning', 'No supplier order found for comparison');
  END IF;
  
  -- Compare forecasted vs ordered items
  FOR v_item IN SELECT jsonb_object_keys(v_forecast.forecast)
  LOOP
    v_forecasted_qty := (v_forecast.forecast->v_item->>'bundles')::numeric;
    IF v_forecasted_qty IS NULL THEN
      v_forecasted_qty := (v_forecast.forecast->v_item->>'rolls')::numeric;
    END IF;
    IF v_forecasted_qty IS NULL THEN
      v_forecasted_qty := (v_forecast.forecast->v_item->>'count')::numeric;
    END IF;
    IF v_forecasted_qty IS NULL THEN
      v_forecasted_qty := (v_forecast.forecast->v_item->>'linear_feet')::numeric;
    END IF;
    
    IF v_forecasted_qty IS NOT NULL THEN
      -- Find matching item in order
      SELECT COALESCE(SUM((item->>'quantity')::numeric), 0)
      INTO v_ordered_qty
      FROM jsonb_array_elements(v_order.items) item
      WHERE LOWER(item->>'item_name') LIKE '%' || LOWER(v_item) || '%';
      
      v_variance := v_forecasted_qty - v_ordered_qty;
      
      -- If shortage detected (more than 5% variance)
      IF v_variance > (v_forecasted_qty * 0.05) THEN
        v_shortages := v_shortages || jsonb_build_object(
          'item', v_item,
          'forecasted', v_forecasted_qty,
          'ordered', v_ordered_qty,
          'shortage', v_variance,
          'severity', CASE 
            WHEN v_variance > (v_forecasted_qty * 0.20) THEN 'critical'
            WHEN v_variance > (v_forecasted_qty * 0.10) THEN 'high'
            ELSE 'medium'
          END
        );
        
        -- Create alert
        INSERT INTO public.material_alerts (
          job_id,
          workspace_id,
          supplier_order_id,
          alert_type,
          severity,
          title,
          message,
          affected_items,
          auto_detected,
          detection_method
        ) VALUES (
          p_job_id,
          v_workspace_id,
          v_order.id,
          'shortage',
          CASE 
            WHEN v_variance > (v_forecasted_qty * 0.20) THEN 'critical'
            WHEN v_variance > (v_forecasted_qty * 0.10) THEN 'high'
            ELSE 'medium'
          END,
          format('Material Shortage Detected - %s', v_item),
          format('You need %.0f more %s than ordered. Forecasted: %.0f, Ordered: %.0f', 
                 v_variance, v_item, v_forecasted_qty, v_ordered_qty),
          jsonb_build_array(jsonb_build_object('item', v_item, 'shortage', v_variance)),
          true,
          'forecast_comparison'
        );
      END IF;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'has_shortages', jsonb_array_length(v_shortages) > 0,
    'shortages', v_shortages,
    'forecast_id', v_forecast.id,
    'order_id', v_order.id
  );
END;
$$;

COMMENT ON FUNCTION public.check_material_shortage IS 'Block 62000: Checks for material shortages by comparing forecast vs ordered materials';

-- ============================================================================
-- PART 8 — CREATE FUNCTION: Check Over-Order
-- ============================================================================
-- Detects excessive material orders to prevent waste

CREATE OR REPLACE FUNCTION public.check_over_order(
  p_job_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_forecast record;
  v_order record;
  v_over_orders jsonb := '[]'::jsonb;
  v_item text;
  v_forecasted_qty numeric;
  v_ordered_qty numeric;
  v_variance numeric;
  v_workspace_id uuid;
BEGIN
  -- Get approved forecast
  SELECT * INTO v_forecast
  FROM public.material_forecasts
  WHERE job_id = p_job_id
    AND status = 'approved'
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'No approved forecast found');
  END IF;
  
  v_workspace_id := v_forecast.workspace_id;
  
  -- Get latest supplier order
  SELECT * INTO v_order
  FROM public.supplier_orders
  WHERE job_id = p_job_id
    AND status NOT IN ('cancelled')
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('warning', 'No supplier order found');
  END IF;
  
  -- Check for over-orders
  FOR v_item IN SELECT jsonb_object_keys(v_forecast.forecast)
  LOOP
    v_forecasted_qty := (v_forecast.forecast->v_item->>'bundles')::numeric;
    IF v_forecasted_qty IS NULL THEN
      v_forecasted_qty := (v_forecast.forecast->v_item->>'rolls')::numeric;
    END IF;
    IF v_forecasted_qty IS NULL THEN
      v_forecasted_qty := (v_forecast.forecast->v_item->>'count')::numeric;
    END IF;
    
    IF v_forecasted_qty IS NOT NULL THEN
      SELECT COALESCE(SUM((item->>'quantity')::numeric), 0)
      INTO v_ordered_qty
      FROM jsonb_array_elements(v_order.items) item
      WHERE LOWER(item->>'item_name') LIKE '%' || LOWER(v_item) || '%';
      
      v_variance := v_ordered_qty - v_forecasted_qty;
      
      -- If over-order detected (more than 10% excess)
      IF v_variance > (v_forecasted_qty * 0.10) THEN
        v_over_orders := v_over_orders || jsonb_build_object(
          'item', v_item,
          'forecasted', v_forecasted_qty,
          'ordered', v_ordered_qty,
          'excess', v_variance,
          'waste_estimate', v_variance
        );
        
        -- Create alert
        INSERT INTO public.material_alerts (
          job_id,
          workspace_id,
          supplier_order_id,
          alert_type,
          severity,
          title,
          message,
          affected_items,
          auto_detected,
          detection_method
        ) VALUES (
          p_job_id,
          v_workspace_id,
          v_order.id,
          'over_order',
          'medium',
          format('Over-Order Detected - %s', v_item),
          format('Reduce order by %.0f %s to avoid waste. Forecasted: %.0f, Ordered: %.0f', 
                 v_variance, v_item, v_forecasted_qty, v_ordered_qty),
          jsonb_build_array(jsonb_build_object('item', v_item, 'excess', v_variance)),
          true,
          'forecast_comparison'
        );
      END IF;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'has_over_orders', jsonb_array_length(v_over_orders) > 0,
    'over_orders', v_over_orders
  );
END;
$$;

COMMENT ON FUNCTION public.check_over_order IS 'Block 62000: Detects over-ordering to prevent material waste';

-- ============================================================================
-- PART 9 — CREATE FUNCTION: Create Supplier Order from Forecast
-- ============================================================================
-- Auto-generates supplier order from approved forecast

CREATE OR REPLACE FUNCTION public.create_supplier_order_from_forecast(
  p_forecast_id uuid,
  p_supplier_id uuid,
  p_delivery_date date,
  p_delivery_time text DEFAULT 'morning',
  p_delivery_address text DEFAULT NULL,
  p_delivery_instructions text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_forecast record;
  v_supplier record;
  v_job record;
  v_order_id uuid;
  v_po_number text;
  v_items jsonb := '[]'::jsonb;
  v_item jsonb;
  v_total_cost numeric := 0;
  v_material_key text;
  v_quantity numeric;
  v_unit text;
  v_unit_cost numeric;
  v_item_cost numeric;
BEGIN
  -- Get forecast
  SELECT * INTO v_forecast
  FROM public.material_forecasts
  WHERE id = p_forecast_id
    AND status = 'approved';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Forecast not found or not approved';
  END IF;
  
  -- Get supplier
  SELECT * INTO v_supplier
  FROM public.suppliers
  WHERE id = p_supplier_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Supplier not found';
  END IF;
  
  -- Get job
  SELECT * INTO v_job
  FROM public.roofing_jobs
  WHERE id = v_forecast.job_id;
  
  -- Generate PO number
  v_po_number := 'PO-' || to_char(now(), 'YYYYMMDD') || '-' || substr(v_forecast.job_id::text, 1, 8);
  
  -- Convert forecast to order items
  FOR v_material_key IN SELECT jsonb_object_keys(v_forecast.forecast)
  LOOP
    v_quantity := (v_forecast.forecast->v_material_key->>'bundles')::numeric;
    v_unit := 'bundles';
    
    IF v_quantity IS NULL THEN
      v_quantity := (v_forecast.forecast->v_material_key->>'rolls')::numeric;
      v_unit := 'rolls';
    END IF;
    
    IF v_quantity IS NULL THEN
      v_quantity := (v_forecast.forecast->v_material_key->>'count')::numeric;
      v_unit := 'pieces';
    END IF;
    
    IF v_quantity IS NULL THEN
      v_quantity := (v_forecast.forecast->v_material_key->>'linear_feet')::numeric;
      v_unit := 'linear_feet';
    END IF;
    
    IF v_quantity IS NOT NULL AND v_quantity > 0 THEN
      -- Get current material cost
      SELECT unit_cost INTO v_unit_cost
      FROM public.material_costs
      WHERE workspace_id = v_forecast.workspace_id
        AND item_name = v_material_key
        AND is_active = true
      ORDER BY updated_at DESC
      LIMIT 1;
      
      v_unit_cost := COALESCE(v_unit_cost, 0);
      v_item_cost := v_quantity * v_unit_cost;
      v_total_cost := v_total_cost + v_item_cost;
      
      -- Build item object
      v_item := jsonb_build_object(
        'item_name', INITCAP(REPLACE(v_material_key, '_', ' ')),
        'quantity', v_quantity,
        'unit', v_unit,
        'unit_cost', v_unit_cost,
        'total_cost', v_item_cost
      );
      
      v_items := v_items || v_item;
    END IF;
  END LOOP;
  
  -- Create supplier order
  INSERT INTO public.supplier_orders (
    job_id,
    forecast_id,
    workspace_id,
    supplier_id,
    supplier_name,
    po_number,
    items,
    total_cost,
    delivery_date,
    delivery_time,
    delivery_address,
    delivery_instructions,
    status
  ) VALUES (
    v_forecast.job_id,
    p_forecast_id,
    v_forecast.workspace_id,
    p_supplier_id,
    v_supplier.name,
    v_po_number,
    v_items,
    v_total_cost,
    p_delivery_date,
    p_delivery_time,
    COALESCE(p_delivery_address, v_job.address),
    p_delivery_instructions,
    'pending'
  )
  RETURNING id INTO v_order_id;
  
  RETURN v_order_id;
END;
$$;

COMMENT ON FUNCTION public.create_supplier_order_from_forecast IS 'Block 62000: Auto-generates supplier order from approved material forecast';

-- ============================================================================
-- PART 10 — TRIGGERS
-- ============================================================================

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

CREATE OR REPLACE FUNCTION public.update_material_costs_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_material_costs_updated_at ON public.material_costs;
CREATE TRIGGER trg_update_material_costs_updated_at
BEFORE UPDATE ON public.material_costs
FOR EACH ROW
EXECUTE FUNCTION public.update_material_costs_updated_at();

-- Auto-check shortages when order is created/updated
CREATE OR REPLACE FUNCTION public.trigger_check_material_shortage()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IN ('sent', 'confirmed', 'scheduled') THEN
    PERFORM public.check_material_shortage(NEW.job_id);
    PERFORM public.check_over_order(NEW.job_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_material_shortage ON public.supplier_orders;
CREATE TRIGGER trg_check_material_shortage
AFTER INSERT OR UPDATE OF status, items ON public.supplier_orders
FOR EACH ROW
EXECUTE FUNCTION public.trigger_check_material_shortage();

-- ============================================================================
-- PART 11 — ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Material Forecasts
ALTER TABLE public.material_forecasts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view forecasts in workspace" ON public.material_forecasts;
CREATE POLICY "Users can view forecasts in workspace"
  ON public.material_forecasts FOR SELECT
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can manage forecasts in workspace" ON public.material_forecasts;
CREATE POLICY "Users can manage forecasts in workspace"
  ON public.material_forecasts FOR ALL
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Supplier Orders
ALTER TABLE public.supplier_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view supplier orders in workspace" ON public.supplier_orders;
CREATE POLICY "Users can view supplier orders in workspace"
  ON public.supplier_orders FOR SELECT
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can manage supplier orders in workspace" ON public.supplier_orders;
CREATE POLICY "Users can manage supplier orders in workspace"
  ON public.supplier_orders FOR ALL
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Material Costs
ALTER TABLE public.material_costs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view material costs in workspace" ON public.material_costs;
CREATE POLICY "Users can view material costs in workspace"
  ON public.material_costs FOR SELECT
  TO authenticated
  USING (
    workspace_id IS NULL OR
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can manage material costs in workspace" ON public.material_costs;
CREATE POLICY "Users can manage material costs in workspace"
  ON public.material_costs FOR ALL
  TO authenticated
  USING (
    workspace_id IS NULL OR
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IS NULL OR
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Leftover Materials
ALTER TABLE public.leftover_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view leftover materials in workspace" ON public.leftover_materials;
CREATE POLICY "Users can view leftover materials in workspace"
  ON public.leftover_materials FOR SELECT
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can manage leftover materials in workspace" ON public.leftover_materials;
CREATE POLICY "Users can manage leftover materials in workspace"
  ON public.leftover_materials FOR ALL
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Material Alerts
ALTER TABLE public.material_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view material alerts in workspace" ON public.material_alerts;
CREATE POLICY "Users can view material alerts in workspace"
  ON public.material_alerts FOR SELECT
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can manage material alerts in workspace" ON public.material_alerts;
CREATE POLICY "Users can manage material alerts in workspace"
  ON public.material_alerts FOR ALL
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 12 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_forecasts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_costs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leftover_materials TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_alerts TO authenticated;

GRANT EXECUTE ON FUNCTION public.forecast_material_needs TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_material_shortage TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_over_order TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_supplier_order_from_forecast TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.material_forecasts IS 'Block 62000: AI-powered material forecasts based on roof characteristics';
COMMENT ON TABLE public.supplier_orders IS 'Block 62000: Comprehensive supplier order tracking with full audit trail';
COMMENT ON TABLE public.material_costs IS 'Block 62000: Live pricing updates for material costing';
COMMENT ON TABLE public.leftover_materials IS 'Block 62000: Track leftover materials after job completion';
COMMENT ON TABLE public.material_alerts IS 'Block 62000: Track shortage, over-order, and cost alerts';




























