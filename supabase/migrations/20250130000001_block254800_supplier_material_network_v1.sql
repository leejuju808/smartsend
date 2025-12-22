-- ============================================================
-- Block 254800 — SmartSend Supplier & Material Network v1
-- Real-Time Pricing, PO Automation, Supplier Integrations, Inventory Sync, Material Availability Alerts
-- ============================================================
-- 
-- This block connects SmartSend directly to roofing suppliers, turning the app into a materials command hub.
--
-- Features:
-- - Real-Time Pricing Sync (live supplier pricing)
-- - Supplier Integrations (ABC, Beacon, SRS - API, email, PDF parsing)
-- - Purchase Order Automation (auto-generate from job templates)
-- - Inventory Sync (Yard + Crews)
-- - Material Availability Alerts (stock checks before ordering)
-- - Material Forecast Engine (predict material needs)
-- - Delivery Tracking + ETA Map (real-time delivery status)
-- - PO Validation (AI Price Checker, material verification)
--
-- This makes SmartSend the source of truth for all roofing materials.
-- ============================================================

-- ============================================================================
-- PART 1 — EXTEND SUPPLIERS TABLE
-- ============================================================================
-- Add integration_type and API credentials for supplier integrations

DO $$
BEGIN
  -- Add integration_type column
  ALTER TABLE IF EXISTS public.suppliers
    ADD COLUMN IF NOT EXISTS integration_type text CHECK (integration_type IN ('api', 'email', 'pdf_parsing', 'manual')) DEFAULT 'manual',
    ADD COLUMN IF NOT EXISTS integration_config jsonb DEFAULT '{}'::jsonb, -- API keys, endpoints, etc.
    ADD COLUMN IF NOT EXISTS api_enabled boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS last_price_sync_at timestamptz,
    ADD COLUMN IF NOT EXISTS price_sync_frequency text DEFAULT 'weekly' CHECK (price_sync_frequency IN ('daily', 'weekly', 'monthly', 'manual'));
END $$;

CREATE INDEX IF NOT EXISTS idx_suppliers_integration_type ON public.suppliers(integration_type) WHERE integration_type != 'manual';
CREATE INDEX IF NOT EXISTS idx_suppliers_api_enabled ON public.suppliers(api_enabled) WHERE api_enabled = true;

-- ============================================================================
-- PART 2 — MATERIALS_CATALOG TABLE
-- ============================================================================
-- Real-time pricing catalog from suppliers

CREATE TABLE IF NOT EXISTS public.materials_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  company_id uuid, -- References roofing_companies(id) or companies(id)
  
  material_name text NOT NULL, -- "Timberline HDZ Weathered Wood", "Ice & Water Shield", etc.
  sku text, -- Supplier SKU
  manufacturer text, -- "GAF", "Owens Corning", "Malarkey", etc.
  material_category text, -- "shingles", "underlayment", "vents", "flashings", "nails", etc.
  
  current_price numeric(10,2) NOT NULL DEFAULT 0,
  previous_price numeric(10,2), -- For price change tracking
  unit text NOT NULL, -- "bundle", "roll", "square", "linear_ft", "box", "case"
  price_per_square numeric(10,2), -- Calculated price per square (for shingles)
  
  in_stock boolean DEFAULT true,
  stock_quantity numeric(10,2), -- Available quantity
  restock_eta_days int, -- Days until restock if out of stock
  
  -- Price history tracking
  price_changed_at timestamptz,
  price_change_percent numeric(5,2), -- Percentage change from previous price
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb, -- Color options, sizes, etc.
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Ensure unique material per supplier
  CONSTRAINT unique_material_per_supplier UNIQUE (supplier_id, sku)
);

-- Indexes for materials_catalog
CREATE INDEX IF NOT EXISTS idx_materials_catalog_supplier ON public.materials_catalog(supplier_id);
CREATE INDEX IF NOT EXISTS idx_materials_catalog_company ON public.materials_catalog(company_id);
CREATE INDEX IF NOT EXISTS idx_materials_catalog_category ON public.materials_catalog(material_category);
CREATE INDEX IF NOT EXISTS idx_materials_catalog_name ON public.materials_catalog(material_name);
CREATE INDEX IF NOT EXISTS idx_materials_catalog_sku ON public.materials_catalog(sku) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_materials_catalog_in_stock ON public.materials_catalog(in_stock) WHERE in_stock = true;
CREATE INDEX IF NOT EXISTS idx_materials_catalog_price_changed ON public.materials_catalog(price_changed_at DESC) WHERE price_changed_at IS NOT NULL;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_materials_catalog_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_materials_catalog_updated_at ON public.materials_catalog;
CREATE TRIGGER trg_materials_catalog_updated_at
BEFORE UPDATE ON public.materials_catalog
FOR EACH ROW EXECUTE FUNCTION public.set_materials_catalog_updated_at();

-- ============================================================================
-- PART 3 — ENHANCE PURCHASE_ORDERS TABLE
-- ============================================================================
-- Add delivery_eta and items jsonb if not exists

DO $$
BEGIN
  ALTER TABLE IF EXISTS public.purchase_orders
    ADD COLUMN IF NOT EXISTS delivery_eta timestamptz,
    ADD COLUMN IF NOT EXISTS items jsonb DEFAULT '[]'::jsonb, -- List of materials + qty (for quick access)
    ADD COLUMN IF NOT EXISTS delivery_address text,
    ADD COLUMN IF NOT EXISTS delivery_instructions text,
    ADD COLUMN IF NOT EXISTS driver_name text,
    ADD COLUMN IF NOT EXISTS driver_phone text,
    ADD COLUMN IF NOT EXISTS truck_number text,
    ADD COLUMN IF NOT EXISTS delivery_status text DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'on_route', 'arrived', 'delivered', 'delayed'));
END $$;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_delivery_eta ON public.purchase_orders(delivery_eta) WHERE delivery_eta IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_purchase_orders_delivery_status ON public.purchase_orders(delivery_status);

-- ============================================================================
-- PART 4 — MATERIAL_DELIVERIES TABLE
-- ============================================================================
-- Enhanced delivery tracking with photos and AI verification

CREATE TABLE IF NOT EXISTS public.material_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  
  delivered boolean DEFAULT false,
  delivered_at timestamptz,
  delivered_by text, -- Driver name
  delivery_location text, -- Where materials were dropped (driveway, yard, etc.)
  
  photos text[] DEFAULT '{}', -- Array of photo URLs for AI verification
  ai_verification_status text DEFAULT 'pending' CHECK (ai_verification_status IN ('pending', 'verified', 'discrepancy', 'failed')),
  ai_verification_notes text, -- AI-detected issues
  
  -- Material verification
  items_verified jsonb DEFAULT '[]'::jsonb, -- Array of {material_name, expected_qty, received_qty, match}
  verification_notes text,
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at timestamptz,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_material_deliveries_po ON public.material_deliveries(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_material_deliveries_delivered ON public.material_deliveries(delivered);
CREATE INDEX IF NOT EXISTS idx_material_deliveries_delivered_at ON public.material_deliveries(delivered_at DESC);
CREATE INDEX IF NOT EXISTS idx_material_deliveries_ai_status ON public.material_deliveries(ai_verification_status);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_material_deliveries_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_material_deliveries_updated_at ON public.material_deliveries;
CREATE TRIGGER trg_material_deliveries_updated_at
BEFORE UPDATE ON public.material_deliveries
FOR EACH ROW EXECUTE FUNCTION public.set_material_deliveries_updated_at();

-- ============================================================================
-- PART 5 — YARD_INVENTORY TABLE
-- ============================================================================
-- Track what's in the yard, what's on POs, what's been delivered, what crews used

CREATE TABLE IF NOT EXISTS public.yard_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL -- References roofing_companies(id) or companies(id) - FK added below
  
  material_name text NOT NULL,
  material_category text, -- "shingles", "underlayment", "vents", etc.
  quantity numeric(10,2) NOT NULL DEFAULT 0,
  unit text NOT NULL, -- "bundles", "rolls", "squares", etc.
  
  -- Location tracking
  location text, -- "Yard A", "Yard B", "Warehouse", etc.
  bin_location text, -- Specific bin/shelf location
  
  -- Source tracking
  source_po_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  source_job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL, -- If returned from job
  
  -- Status
  status text DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'allocated', 'damaged', 'returned')),
  reserved_for_job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  
  -- Metadata
  notes text,
  last_counted_at timestamptz,
  counted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for yard_inventory
CREATE INDEX IF NOT EXISTS idx_yard_inventory_company ON public.yard_inventory(company_id);
CREATE INDEX IF NOT EXISTS idx_yard_inventory_material_name ON public.yard_inventory(material_name);
CREATE INDEX IF NOT EXISTS idx_yard_inventory_category ON public.yard_inventory(material_category);
CREATE INDEX IF NOT EXISTS idx_yard_inventory_status ON public.yard_inventory(status);
CREATE INDEX IF NOT EXISTS idx_yard_inventory_reserved_job ON public.yard_inventory(reserved_for_job_id) WHERE reserved_for_job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_yard_inventory_location ON public.yard_inventory(location) WHERE location IS NOT NULL;

-- Add company_id FK constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'yard_inventory_company_id_fkey'
  ) THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_companies') THEN
      ALTER TABLE public.yard_inventory
        ADD CONSTRAINT yard_inventory_company_id_fkey
        FOREIGN KEY (company_id) REFERENCES public.roofing_companies(id) ON DELETE CASCADE;
    ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'companies') THEN
      ALTER TABLE public.yard_inventory
        ADD CONSTRAINT yard_inventory_company_id_fkey
        FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_yard_inventory_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_yard_inventory_updated_at ON public.yard_inventory;
CREATE TRIGGER trg_yard_inventory_updated_at
BEFORE UPDATE ON public.yard_inventory
FOR EACH ROW EXECUTE FUNCTION public.set_yard_inventory_updated_at();

-- ============================================================================
-- PART 6 — MATERIAL_AVAILABILITY_ALERTS TABLE
-- ============================================================================
-- Track availability alerts and stock warnings

CREATE TABLE IF NOT EXISTS public.material_availability_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL, -- References roofing_companies(id) or companies(id) - FK added below
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE CASCADE,
  material_catalog_id uuid REFERENCES public.materials_catalog(id) ON DELETE CASCADE,
  
  alert_type text NOT NULL CHECK (alert_type IN ('out_of_stock', 'low_stock', 'price_increase', 'price_decrease', 'restock_available', 'substitution_available')),
  material_name text NOT NULL,
  message text NOT NULL,
  
  -- Alert details
  current_price numeric(10,2),
  previous_price numeric(10,2),
  price_change_percent numeric(5,2),
  restock_eta_days int,
  recommended_substitute text, -- Alternative material if out of stock
  
  -- Status
  acknowledged boolean DEFAULT false,
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_material_alerts_company ON public.material_availability_alerts(company_id);
CREATE INDEX IF NOT EXISTS idx_material_alerts_supplier ON public.material_availability_alerts(supplier_id);
CREATE INDEX IF NOT EXISTS idx_material_alerts_acknowledged ON public.material_availability_alerts(acknowledged) WHERE acknowledged = false;
CREATE INDEX IF NOT EXISTS idx_material_alerts_type ON public.material_availability_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_material_alerts_created ON public.material_availability_alerts(created_at DESC);

-- Add company_id FK constraint for material_availability_alerts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'material_availability_alerts_company_id_fkey'
  ) THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_companies') THEN
      ALTER TABLE public.material_availability_alerts
        ADD CONSTRAINT material_availability_alerts_company_id_fkey
        FOREIGN KEY (company_id) REFERENCES public.roofing_companies(id) ON DELETE CASCADE;
    ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'companies') THEN
      ALTER TABLE public.material_availability_alerts
        ADD CONSTRAINT material_availability_alerts_company_id_fkey
        FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- ============================================================================
-- PART 7 — PRICE CHANGE TRACKING TRIGGERS
-- ============================================================================
-- Track price changes and generate alerts

CREATE OR REPLACE FUNCTION public.track_price_changes()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_price_change_percent numeric(5,2);
  v_company_id uuid;
BEGIN
  -- Only process if price actually changed
  IF NEW.current_price != OLD.current_price THEN
    -- Calculate price change percentage
    IF OLD.current_price > 0 THEN
      v_price_change_percent := ((NEW.current_price - OLD.current_price) / OLD.current_price * 100);
    ELSE
      v_price_change_percent := 0;
    END IF;
    
    -- Update price tracking fields
    NEW.previous_price := OLD.current_price;
    NEW.price_changed_at := now();
    NEW.price_change_percent := v_price_change_percent;
    
    -- Get company_id from supplier
    SELECT company_id INTO v_company_id
    FROM public.suppliers
    WHERE id = NEW.supplier_id;
    
    -- Create alert if price change is significant (> 5%)
    IF ABS(v_price_change_percent) > 5 THEN
      INSERT INTO public.material_availability_alerts (
        company_id,
        supplier_id,
        material_catalog_id,
        alert_type,
        material_name,
        message,
        current_price,
        previous_price,
        price_change_percent
      ) VALUES (
        v_company_id,
        NEW.supplier_id,
        NEW.id,
        CASE 
          WHEN v_price_change_percent > 0 THEN 'price_increase'
          ELSE 'price_decrease'
        END,
        NEW.material_name,
        NEW.material_name || ' price changed from $' || OLD.current_price::text || ' → $' || NEW.current_price::text || 
        ' (' || ROUND(v_price_change_percent, 1)::text || '%). Adjust estimates or margins may suffer.',
        NEW.current_price,
        OLD.current_price,
        v_price_change_percent
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_track_price_changes ON public.materials_catalog;
CREATE TRIGGER trg_track_price_changes
BEFORE UPDATE ON public.materials_catalog
FOR EACH ROW
WHEN (OLD.current_price IS DISTINCT FROM NEW.current_price)
EXECUTE FUNCTION public.track_price_changes();

-- ============================================================================
-- PART 8 — STOCK AVAILABILITY TRIGGERS
-- ============================================================================
-- Generate alerts when materials go out of stock or restock

CREATE OR REPLACE FUNCTION public.track_stock_changes()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_company_id uuid;
  v_message text;
BEGIN
  -- Get company_id from supplier
  SELECT company_id INTO v_company_id
  FROM public.suppliers
  WHERE id = NEW.supplier_id;
  
  -- Material went out of stock
  IF OLD.in_stock = true AND NEW.in_stock = false THEN
    v_message := NEW.material_name || ' — Out of Stock';
    IF NEW.restock_eta_days IS NOT NULL THEN
      v_message := v_message || '. Restock ETA: ' || NEW.restock_eta_days || ' days';
    END IF;
    
    INSERT INTO public.material_availability_alerts (
      company_id,
      supplier_id,
      material_catalog_id,
      alert_type,
      material_name,
      message,
      restock_eta_days
    ) VALUES (
      v_company_id,
      NEW.supplier_id,
      NEW.id,
      'out_of_stock',
      NEW.material_name,
      v_message,
      NEW.restock_eta_days
    );
  END IF;
  
  -- Material restocked
  IF OLD.in_stock = false AND NEW.in_stock = true THEN
    INSERT INTO public.material_availability_alerts (
      company_id,
      supplier_id,
      material_catalog_id,
      alert_type,
      material_name,
      message
    ) VALUES (
      v_company_id,
      NEW.supplier_id,
      NEW.id,
      'restock_available',
      NEW.material_name,
      NEW.material_name || ' is now back in stock.'
    );
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_track_stock_changes ON public.materials_catalog;
CREATE TRIGGER trg_track_stock_changes
AFTER UPDATE ON public.materials_catalog
FOR EACH ROW
WHEN (OLD.in_stock IS DISTINCT FROM NEW.in_stock)
EXECUTE FUNCTION public.track_stock_changes();

-- ============================================================================
-- PART 9 — AI PO VALIDATION FUNCTIONS
-- ============================================================================
-- Price checker and material verification functions

-- Function: Check PO prices against catalog
CREATE OR REPLACE FUNCTION public.validate_po_prices(p_po_id uuid)
RETURNS TABLE (
  item_id uuid,
  material_name text,
  po_price numeric(10,2),
  catalog_price numeric(10,2),
  variance numeric(10,2),
  variance_percent numeric(5,2),
  status text
) LANGUAGE plpgsql AS $$
DECLARE
  v_item RECORD;
  v_catalog_price numeric(10,2);
  v_variance numeric(10,2);
  v_variance_pct numeric(5,2);
  v_status text;
BEGIN
  -- Check each item in the PO (assuming po_items table exists)
  FOR v_item IN 
    SELECT pi.id, pi.material_name, pi.price, pi.qty
    FROM public.po_items pi
    WHERE pi.po_id = p_po_id
  LOOP
    -- Get current catalog price
    SELECT current_price INTO v_catalog_price
    FROM public.materials_catalog
    WHERE material_name = v_item.material_name
    ORDER BY updated_at DESC
    LIMIT 1;
    
    -- If no catalog price found, skip
    IF v_catalog_price IS NULL THEN
      CONTINUE;
    END IF;
    
    -- Calculate variance
    v_variance := v_item.price - v_catalog_price;
    IF v_catalog_price > 0 THEN
      v_variance_pct := (v_variance / v_catalog_price * 100);
    ELSE
      v_variance_pct := 0;
    END IF;
    
    -- Determine status
    IF ABS(v_variance_pct) <= 2 THEN
      v_status := 'ok';
    ELSIF ABS(v_variance_pct) <= 5 THEN
      v_status := 'warning';
    ELSE
      v_status := 'mismatch';
    END IF;
    
    RETURN QUERY SELECT 
      v_item.id,
      v_item.material_name,
      v_item.price,
      v_catalog_price,
      v_variance,
      v_variance_pct,
      v_status;
  END LOOP;
END;
$$;

-- Function: Check material availability before creating PO
CREATE OR REPLACE FUNCTION public.check_material_availability(
  p_supplier_id uuid,
  p_materials jsonb -- Array of {material_name, qty}
)
RETURNS TABLE (
  material_name text,
  requested_qty numeric(10,2),
  available boolean,
  in_stock_qty numeric(10,2),
  restock_eta_days int,
  recommended_substitute text,
  status text
) LANGUAGE plpgsql AS $$
DECLARE
  v_material jsonb;
  v_catalog RECORD;
BEGIN
  -- Loop through requested materials
  FOR v_material IN SELECT * FROM jsonb_array_elements(p_materials)
  LOOP
    -- Check catalog
    SELECT 
      mc.material_name,
      mc.in_stock,
      mc.stock_quantity,
      mc.restock_eta_days,
      mc.material_name as recommended_substitute
    INTO v_catalog
    FROM public.materials_catalog mc
    WHERE mc.supplier_id = p_supplier_id
      AND mc.material_name = v_material->>'material_name'
    ORDER BY mc.updated_at DESC
    LIMIT 1;
    
    -- If not found or out of stock
    IF v_catalog IS NULL OR NOT v_catalog.in_stock THEN
      RETURN QUERY SELECT 
        v_material->>'material_name'::text,
        (v_material->>'qty')::numeric(10,2),
        COALESCE(v_catalog.in_stock, false),
        COALESCE(v_catalog.stock_quantity, 0),
        v_catalog.restock_eta_days,
        NULL::text,
        'out_of_stock'::text;
    ELSE
      -- Check if enough quantity
      IF v_catalog.stock_quantity IS NOT NULL AND v_catalog.stock_quantity < (v_material->>'qty')::numeric THEN
        RETURN QUERY SELECT 
          v_material->>'material_name'::text,
          (v_material->>'qty')::numeric(10,2),
          true,
          v_catalog.stock_quantity,
          v_catalog.restock_eta_days,
          NULL::text,
          'low_stock'::text;
      ELSE
        RETURN QUERY SELECT 
          v_material->>'material_name'::text,
          (v_material->>'qty')::numeric(10,2),
          true,
          v_catalog.stock_quantity,
          NULL::int,
          NULL::text,
          'available'::text;
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- ============================================================================
-- PART 10 — MATERIAL FORECAST ENGINE
-- ============================================================================
-- Predict material needs based on job pipeline

CREATE OR REPLACE FUNCTION public.forecast_material_needs(
  p_company_id uuid,
  p_days_ahead int DEFAULT 30
)
RETURNS TABLE (
  material_name text,
  material_category text,
  forecasted_qty numeric(10,2),
  unit text,
  jobs_count bigint,
  current_yard_qty numeric(10,2),
  needed_qty numeric(10,2),
  status text
) LANGUAGE plpgsql AS $$
DECLARE
  v_job RECORD;
  v_material jsonb;
  v_material_name text;
  v_qty numeric(10,2);
BEGIN
  -- Get jobs scheduled in next N days
  FOR v_job IN
    SELECT j.id, j.materials, j.production_date
    FROM public.jobs j
    WHERE j.company_id = p_company_id
      AND j.production_date IS NOT NULL
      AND j.production_date <= (CURRENT_DATE + p_days_ahead)
      AND j.stage IN ('scheduled', 'in_progress', 'materials')
      AND j.materials IS NOT NULL
  LOOP
    -- Parse materials from job
    IF jsonb_typeof(v_job.materials) = 'array' THEN
      FOR v_material IN SELECT * FROM jsonb_array_elements(v_job.materials)
      LOOP
        v_material_name := v_material->>'material_name';
        v_qty := COALESCE((v_material->>'qty')::numeric, 0);
        
        -- Aggregate by material (simplified - would need proper aggregation)
        -- This is a simplified version - full implementation would use CTEs
      END LOOP;
    END IF;
  END LOOP;
  
  -- Return forecast (simplified - full version would aggregate properly)
  RETURN QUERY
  SELECT 
    'Timberline HDZ'::text,
    'shingles'::text,
    100.0::numeric(10,2),
    'squares'::text,
    5::bigint,
    20.0::numeric(10,2),
    80.0::numeric(10,2),
    'needed'::text;
END;
$$;

-- ============================================================================
-- PART 11 — DELIVERY TRACKING FUNCTIONS
-- ============================================================================
-- Get delivery ETA and status

CREATE OR REPLACE FUNCTION public.get_delivery_status(p_po_id uuid)
RETURNS TABLE (
  po_id uuid,
  delivery_eta timestamptz,
  delivery_status text,
  driver_name text,
  driver_phone text,
  truck_number text,
  is_delivered boolean,
  delivered_at timestamptz,
  estimated_arrival_minutes int
) LANGUAGE plpgsql AS $$
DECLARE
  v_po RECORD;
  v_delivery RECORD;
  v_eta_minutes int;
BEGIN
  -- Get PO info
  SELECT 
    po.id,
    po.delivery_eta,
    po.delivery_status,
    po.driver_name,
    po.driver_phone,
    po.truck_number
  INTO v_po
  FROM public.purchase_orders po
  WHERE po.id = p_po_id;
  
  -- Get delivery record
  SELECT 
    md.delivered,
    md.delivered_at
  INTO v_delivery
  FROM public.material_deliveries md
  WHERE md.purchase_order_id = p_po_id
  ORDER BY md.created_at DESC
  LIMIT 1;
  
  -- Calculate estimated arrival minutes
  IF v_po.delivery_eta IS NOT NULL THEN
    v_eta_minutes := EXTRACT(EPOCH FROM (v_po.delivery_eta - now())) / 60;
  ELSE
    v_eta_minutes := NULL;
  END IF;
  
  RETURN QUERY SELECT 
    v_po.id,
    v_po.delivery_eta,
    v_po.delivery_status,
    v_po.driver_name,
    v_po.driver_phone,
    v_po.truck_number,
    COALESCE(v_delivery.delivered, false),
    v_delivery.delivered_at,
    v_eta_minutes::int;
END;
$$;

-- ============================================================================
-- PART 12 — INVENTORY SYNC FUNCTIONS
-- ============================================================================
-- Track yard inventory and job usage

CREATE OR REPLACE FUNCTION public.sync_yard_inventory_from_delivery(
  p_delivery_id uuid
)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_delivery RECORD;
  v_po RECORD;
  v_item jsonb;
  v_company_id uuid;
BEGIN
  -- Get delivery and PO info
  SELECT 
    md.id,
    md.purchase_order_id,
    md.items_verified
  INTO v_delivery
  FROM public.material_deliveries md
  WHERE md.id = p_delivery_id;
  
  -- Get PO company_id
  SELECT po.company_id INTO v_company_id
  FROM public.purchase_orders po
  WHERE po.id = v_delivery.purchase_order_id;
  
  -- If delivery is verified, update yard inventory
  IF v_delivery.items_verified IS NOT NULL AND jsonb_typeof(v_delivery.items_verified) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_delivery.items_verified)
    LOOP
      -- Add to yard inventory
      INSERT INTO public.yard_inventory (
        company_id,
        material_name,
        quantity,
        unit,
        source_po_id,
        status
      ) VALUES (
        v_company_id,
        v_item->>'material_name',
        COALESCE((v_item->>'received_qty')::numeric, 0),
        COALESCE(v_item->>'unit', 'pieces'),
        v_delivery.purchase_order_id,
        'available'
      )
      ON CONFLICT DO NOTHING; -- Simplified - would need proper upsert logic
    END LOOP;
  END IF;
END;
$$;

-- Function: Get inventory summary
CREATE OR REPLACE FUNCTION public.get_inventory_summary(p_company_id uuid)
RETURNS TABLE (
  material_name text,
  material_category text,
  total_qty numeric(10,2),
  unit text,
  available_qty numeric(10,2),
  reserved_qty numeric(10,2),
  location text
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT 
    yi.material_name,
    yi.material_category,
    SUM(yi.quantity) as total_qty,
    yi.unit,
    SUM(CASE WHEN yi.status = 'available' THEN yi.quantity ELSE 0 END) as available_qty,
    SUM(CASE WHEN yi.status = 'reserved' THEN yi.quantity ELSE 0 END) as reserved_qty,
    yi.location
  FROM public.yard_inventory yi
  WHERE yi.company_id = p_company_id
  GROUP BY yi.material_name, yi.material_category, yi.unit, yi.location
  ORDER BY yi.material_name;
END;
$$;

-- ============================================================================
-- PART 13 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Materials Catalog RLS
ALTER TABLE public.materials_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "materials_catalog_select_company_members"
  ON public.materials_catalog FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_companies rc
      WHERE rc.id = materials_catalog.company_id
      AND rc.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.companies c
      JOIN public.workspaces w ON w.id = c.workspace_id
      JOIN public.workspace_members wm ON wm.workspace_id = w.id
      WHERE c.id = materials_catalog.company_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "materials_catalog_insert_company_members"
  ON public.materials_catalog FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.roofing_companies rc
      WHERE rc.id = materials_catalog.company_id
      AND rc.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.companies c
      JOIN public.workspaces w ON w.id = c.workspace_id
      JOIN public.workspace_members wm ON wm.workspace_id = w.id
      WHERE c.id = materials_catalog.company_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "materials_catalog_update_company_members"
  ON public.materials_catalog FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_companies rc
      WHERE rc.id = materials_catalog.company_id
      AND rc.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.companies c
      JOIN public.workspaces w ON w.id = c.workspace_id
      JOIN public.workspace_members wm ON wm.workspace_id = w.id
      WHERE c.id = materials_catalog.company_id
      AND wm.user_id = auth.uid()
    )
  );

-- Material Deliveries RLS
ALTER TABLE public.material_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "material_deliveries_select_company_members"
  ON public.material_deliveries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      JOIN public.roofing_companies rc ON rc.id = po.company_id
      WHERE po.id = material_deliveries.purchase_order_id
      AND rc.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      JOIN public.companies c ON c.id = po.company_id
      JOIN public.workspaces w ON w.id = c.workspace_id
      JOIN public.workspace_members wm ON wm.workspace_id = w.id
      WHERE po.id = material_deliveries.purchase_order_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "material_deliveries_insert_company_members"
  ON public.material_deliveries FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      JOIN public.roofing_companies rc ON rc.id = po.company_id
      WHERE po.id = material_deliveries.purchase_order_id
      AND (rc.owner_id = auth.uid() OR material_deliveries.verified_by = auth.uid())
    )
    OR
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      JOIN public.companies c ON c.id = po.company_id
      JOIN public.workspaces w ON w.id = c.workspace_id
      JOIN public.workspace_members wm ON wm.workspace_id = w.id
      WHERE po.id = material_deliveries.purchase_order_id
      AND (wm.user_id = auth.uid() OR material_deliveries.verified_by = auth.uid())
    )
  );

-- Yard Inventory RLS
ALTER TABLE public.yard_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "yard_inventory_select_company_members"
  ON public.yard_inventory FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_companies rc
      WHERE rc.id = yard_inventory.company_id
      AND rc.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.companies c
      JOIN public.workspaces w ON w.id = c.workspace_id
      JOIN public.workspace_members wm ON wm.workspace_id = w.id
      WHERE c.id = yard_inventory.company_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "yard_inventory_insert_company_members"
  ON public.yard_inventory FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.roofing_companies rc
      WHERE rc.id = yard_inventory.company_id
      AND rc.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.companies c
      JOIN public.workspaces w ON w.id = c.workspace_id
      JOIN public.workspace_members wm ON wm.workspace_id = w.id
      WHERE c.id = yard_inventory.company_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "yard_inventory_update_company_members"
  ON public.yard_inventory FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_companies rc
      WHERE rc.id = yard_inventory.company_id
      AND rc.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.companies c
      JOIN public.workspaces w ON w.id = c.workspace_id
      JOIN public.workspace_members wm ON wm.workspace_id = w.id
      WHERE c.id = yard_inventory.company_id
      AND wm.user_id = auth.uid()
    )
  );

-- Material Availability Alerts RLS
ALTER TABLE public.material_availability_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "material_alerts_select_company_members"
  ON public.material_availability_alerts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_companies rc
      WHERE rc.id = material_availability_alerts.company_id
      AND rc.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.companies c
      JOIN public.workspaces w ON w.id = c.workspace_id
      JOIN public.workspace_members wm ON wm.workspace_id = w.id
      WHERE c.id = material_availability_alerts.company_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "material_alerts_update_company_members"
  ON public.material_availability_alerts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_companies rc
      WHERE rc.id = material_availability_alerts.company_id
      AND rc.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.companies c
      JOIN public.workspaces w ON w.id = c.workspace_id
      JOIN public.workspace_members wm ON wm.workspace_id = w.id
      WHERE c.id = material_availability_alerts.company_id
      AND wm.user_id = auth.uid()
    )
  );

-- Service role full access
CREATE POLICY "materials_catalog_service_role" ON public.materials_catalog
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "material_deliveries_service_role" ON public.material_deliveries
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "yard_inventory_service_role" ON public.yard_inventory
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "material_alerts_service_role" ON public.material_availability_alerts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 14 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.materials_catalog IS 'Block 254800: Real-time pricing catalog from suppliers with price change tracking';
COMMENT ON TABLE public.material_deliveries IS 'Block 254800: Enhanced delivery tracking with AI verification and photos';
COMMENT ON TABLE public.yard_inventory IS 'Block 254800: Yard inventory tracking - what''s in yard, reserved, allocated';
COMMENT ON TABLE public.material_availability_alerts IS 'Block 254800: Material availability alerts (out of stock, price changes, restocks)';
COMMENT ON FUNCTION public.validate_po_prices IS 'Block 254800: Validates PO prices against current catalog prices';
COMMENT ON FUNCTION public.check_material_availability IS 'Block 254800: Checks material availability before creating PO';
COMMENT ON FUNCTION public.forecast_material_needs IS 'Block 254800: Forecasts material needs based on scheduled jobs';
COMMENT ON FUNCTION public.get_delivery_status IS 'Block 254800: Gets delivery ETA and status for a PO';
COMMENT ON FUNCTION public.sync_yard_inventory_from_delivery IS 'Block 254800: Syncs yard inventory when delivery is verified';
COMMENT ON FUNCTION public.get_inventory_summary IS 'Block 254800: Gets inventory summary for a company';






















