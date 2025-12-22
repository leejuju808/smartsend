-- =========================================================
-- Block 41700 — SmartSend Roofing "Material Ordering + Supplier Integration Engine" v1
-- (Auto-generate material orders • Send PO to suppliers • Track delivery ETA • Prevent shortages • Sync with measurements + production)
-- =========================================================
-- 
-- THIS IS THE FEATURE THAT MAKES SMARTSEND RUN AN ENTIRE ROOFING COMPANY.
-- 
-- Material ordering is one of the biggest pain points in roofing.
-- This block fixes ALL of this by connecting measurements → material lists → supplier orders → delivery tracking → production schedule.

-- ============================================================================
-- PART 1 — CREATE/ENSURE suppliers TABLE
-- ============================================================================
-- Contractor adds favorite suppliers: Beacon, ABC, SRS, Local yards

CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  name text NOT NULL,                    -- "Beacon", "ABC Supply", "SRS Distribution"
  address text,                          -- Full address
  email text,                            -- Email for POs (delivery desk)
  phone text,                            -- Phone number
  delivery_cutoff text,                  -- Delivery cutoff times (e.g., "2PM for next day")
  delivery_instructions text,            -- Special delivery instructions
  account_number text,                   -- Roofer's account number with supplier
  notes text,                            -- Additional notes
  
  is_active boolean DEFAULT true,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- If suppliers table exists but missing columns, add them
DO $$ 
BEGIN
  -- Add workspace_id if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'workspace_id') THEN
    ALTER TABLE public.suppliers ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;
  END IF;
  
  -- Add address if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'address') THEN
    ALTER TABLE public.suppliers ADD COLUMN address text;
  END IF;
  
  -- Add delivery_cutoff if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'delivery_cutoff') THEN
    ALTER TABLE public.suppliers ADD COLUMN delivery_cutoff text;
  END IF;
  
  -- Add delivery_instructions if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'delivery_instructions') THEN
    ALTER TABLE public.suppliers ADD COLUMN delivery_instructions text;
  END IF;
  
  -- Add account_number if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'account_number') THEN
    ALTER TABLE public.suppliers ADD COLUMN account_number text;
  END IF;
  
  -- Add is_active if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'is_active') THEN
    ALTER TABLE public.suppliers ADD COLUMN is_active boolean DEFAULT true;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_suppliers_workspace ON public.suppliers(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_suppliers_active ON public.suppliers(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON public.suppliers(name);

-- ============================================================================
-- PART 2 — CREATE material_orders TABLE
-- ============================================================================
-- Material orders per job with status tracking

CREATE TABLE IF NOT EXISTS public.material_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'confirmed', 'delivered', 'delayed', 'cancelled')),
  
  -- Delivery info
  eta timestamptz,                       -- Expected delivery time
  delivered_at timestamptz,              -- Actual delivery time
  
  -- PO details
  po_pdf_url text,                       -- URL to generated PO PDF
  po_number text,                        -- PO number (internal or supplier's)
  supplier_po_number text,               -- Supplier's PO number
  
  -- Job site details
  job_site_address text,                 -- Delivery address
  delivery_date date,                    -- Requested delivery date
  delivery_instructions text,            -- Special instructions for delivery
  crew_details text,                     -- Crew contact info
  
  -- Supplier confirmation
  supplier_confirmed boolean DEFAULT false,
  supplier_confirmed_at timestamptz,
  supplier_confirmation_message text,    -- Parsed from supplier email
  
  -- Auto-rescheduling
  delivery_delayed boolean DEFAULT false,
  delay_reason text,
  auto_rescheduled boolean DEFAULT false,
  original_delivery_date date,
  
  notes text,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_material_orders_job ON public.material_orders(job_id);
CREATE INDEX IF NOT EXISTS idx_material_orders_supplier ON public.material_orders(supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_material_orders_status ON public.material_orders(status);
CREATE INDEX IF NOT EXISTS idx_material_orders_workspace ON public.material_orders(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_material_orders_delivery_date ON public.material_orders(delivery_date) WHERE delivery_date IS NOT NULL;

-- ============================================================================
-- PART 3 — CREATE material_order_items TABLE
-- ============================================================================
-- Itemized list of materials in each order

CREATE TABLE IF NOT EXISTS public.material_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_order_id uuid NOT NULL REFERENCES public.material_orders(id) ON DELETE CASCADE,
  
  item_name text NOT NULL,               -- "Shingles", "Ridge Cap", "Drip Edge", etc.
  quantity numeric NOT NULL,             -- Quantity
  unit text NOT NULL,                    -- "bundles", "rolls", "linear_feet", "pieces", "boxes"
  
  -- Optional pricing
  unit_price numeric,                    -- Price per unit
  total_price numeric,                   -- Total price for this item
  
  -- Material details
  brand text,                            -- Material brand
  model text,                            -- Material model
  color text,                            -- Material color
  
  -- Source tracking
  source text,                           -- 'auto_calculated', 'manual', 'change_order'
  source_ref uuid,                       -- Reference to measurement or change order
  
  notes text,
  
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_material_order_items_order ON public.material_order_items(material_order_id);
CREATE INDEX IF NOT EXISTS idx_material_order_items_source ON public.material_order_items(source) WHERE source IS NOT NULL;

-- ============================================================================
-- PART 4 — CREATE material_delivery_photos TABLE
-- ============================================================================
-- Photos uploaded by crew or homeowner for delivery confirmation

CREATE TABLE IF NOT EXISTS public.material_delivery_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_order_id uuid NOT NULL REFERENCES public.material_orders(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  
  photo_url text NOT NULL,               -- URL to uploaded photo
  label text,                            -- Photo label/description
  
  -- Verification
  uploaded_by text,                      -- 'crew', 'homeowner', 'ops'
  uploaded_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- AI analysis results (future enhancement)
  detected_items jsonb,                  -- AI-detected items in photo
  color_match boolean,                   -- Shingle color matches order?
  quantity_match boolean,                -- Quantities match?
  missing_items text[],                  -- Missing items detected
  mismatched_items text[],               -- Wrong items detected
  
  verified boolean DEFAULT false,
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at timestamptz,
  
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_material_delivery_photos_order ON public.material_delivery_photos(material_order_id);
CREATE INDEX IF NOT EXISTS idx_material_delivery_photos_job ON public.material_delivery_photos(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_material_delivery_photos_verified ON public.material_delivery_photos(verified) WHERE verified = false;

-- ============================================================================
-- PART 5 — CREATE FUNCTION: GENERATE MATERIAL LIST FROM MEASUREMENTS
-- ============================================================================
-- Auto-build material list using AI roof measurement data

CREATE OR REPLACE FUNCTION public.generate_material_list_from_measurements(
  p_job_id uuid
)
RETURNS TABLE (
  item_name text,
  quantity numeric,
  unit text,
  notes text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_measurement record;
  v_squares numeric;
  v_waste_factor numeric;
  v_ridge_length numeric;
  v_eaves_length numeric;
  v_valleys_length numeric;
  v_penetrations integer;
BEGIN
  -- Try to get measurement from roof_measurement_data first (older structure)
  SELECT 
    m.*,
    COALESCE(m.total_squares, 0) as squares,
    COALESCE(m.waste_factor_percent, 12.0) / 100.0 as waste,
    COALESCE(m.ridges_linear_ft, 0) as ridge,
    COALESCE(m.eaves_linear_ft, 0) as eaves,
    COALESCE(m.valleys_linear_ft, 0) as valleys,
    COALESCE(m.penetrations_count, 0) as penetrations
  INTO v_measurement
  FROM public.roof_measurement_data m
  WHERE m.job_id = p_job_id
    AND m.is_primary = true
  ORDER BY m.created_at DESC
  LIMIT 1;
  
  -- If not found, try roof_measurements table (newer structure from block 41200)
  IF NOT FOUND THEN
    SELECT 
      m.*,
      COALESCE(m.squares, 0) as squares,
      COALESCE(m.waste_factor, 0.1) as waste,
      COALESCE(m.ridge_length, 0) as ridge,
      COALESCE(m.eaves_length, 0) as eaves,
      COALESCE(m.valleys_length, 0) as valleys,
      COALESCE(jsonb_array_length(m.penetrations), 0) as penetrations
    INTO v_measurement
    FROM public.roof_measurements m
    WHERE m.job_id = p_job_id
    ORDER BY m.created_at DESC
    LIMIT 1;
  END IF;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No measurement found for job %. Please add roof measurements first.', p_job_id;
  END IF;
  
  v_squares := v_measurement.squares;
  v_waste_factor := v_measurement.waste;
  v_ridge_length := v_measurement.ridge;
  v_eaves_length := v_measurement.eaves;
  v_valleys_length := v_measurement.valleys;
  v_penetrations := v_measurement.penetrations;
  
  -- Calculate materials with waste factor
  RETURN QUERY
  SELECT 
    'Shingles'::text,
    CEIL((v_squares * (1 + v_waste_factor)) / 3)::numeric,  -- 3 bundles per square
    'bundles'::text,
    format('Based on %.2f squares with %.0f%% waste', v_squares, v_waste_factor * 100)::text
  UNION ALL
  SELECT 
    'Starter'::text,
    CEIL((v_squares * (1 + v_waste_factor)) / 10)::numeric,
    'bundles'::text,
    'Starter shingles for eaves and rakes'::text
  UNION ALL
  SELECT 
    'Ridge Cap'::text,
    CASE 
      WHEN v_ridge_length > 0 THEN CEIL(v_ridge_length / 33)::numeric  -- ~33 linear feet per bundle
      ELSE CEIL(v_squares / 20)::numeric  -- Estimate if no ridge data
    END,
    'bundles'::text,
    format('Ridge cap for %.0f linear feet', v_ridge_length)::text
  UNION ALL
  SELECT 
    'Underlayment'::text,
    CEIL((v_squares * (1 + v_waste_factor)) / 10)::numeric,  -- ~10 squares per roll
    'rolls'::text,
    'Synthetic underlayment'::text
  UNION ALL
  SELECT 
    'Ice & Water Shield'::text,
    CASE 
      WHEN v_eaves_length > 0 THEN CEIL(v_eaves_length / 36)::numeric  -- ~36 linear feet per roll
      ELSE 2::numeric  -- Default 2 rolls
    END,
    'rolls'::text,
    'Ice & water shield for eaves and valleys'::text
  UNION ALL
  SELECT 
    'Drip Edge'::text,
    CASE 
      WHEN v_eaves_length > 0 OR v_measurement.rakes_linear_ft > 0 THEN 
        CEIL((COALESCE(v_eaves_length, 0) + COALESCE(v_measurement.rakes_linear_ft, 0)) / 10)::numeric
      ELSE CEIL(v_squares * 4)::numeric  -- Estimate based on squares
    END,
    'linear_feet'::text,
    'Drip edge for eaves and rakes'::text
  UNION ALL
  SELECT 
    'Valley Metal'::text,
    CASE 
      WHEN v_valleys_length > 0 THEN CEIL(v_valleys_length / 10)::numeric
      ELSE 0::numeric
    END,
    'linear_feet'::text,
    CASE 
      WHEN v_valleys_length > 0 THEN format('Valley metal for %.0f linear feet', v_valleys_length)::text
      ELSE 'No valleys detected'::text
    END
  UNION ALL
  SELECT 
    'Step Flashing'::text,
    CASE 
      WHEN v_penetrations > 0 THEN (v_penetrations * 2)::numeric  -- 2 pieces per penetration
      ELSE 0::numeric
    END,
    'pieces'::text,
    CASE 
      WHEN v_penetrations > 0 THEN format('Step flashing for %s penetrations', v_penetrations)::text
      ELSE 'No penetrations detected'::text
    END
  UNION ALL
  SELECT 
    'Pipe Boots'::text,
    CASE 
      WHEN v_penetrations > 0 THEN v_penetrations::numeric
      ELSE 0::numeric
    END,
    'pieces'::text,
    CASE 
      WHEN v_penetrations > 0 THEN format('Pipe boots for %s penetrations', v_penetrations)::text
      ELSE 'No penetrations detected'::text
    END
  UNION ALL
  SELECT 
    'Ventilation'::text,
    CEIL(v_squares / 2)::numeric,  -- Rough estimate: 1 vent per 2 squares
    'pieces'::text,
    'Ridge vents or static vents'::text
  UNION ALL
  SELECT 
    'Roofing Nails'::text,
    1::numeric,
    'box'::text,
    '1 box (typically 5 lbs)'::text;
END;
$$;

COMMENT ON FUNCTION public.generate_material_list_from_measurements IS 'Block 41700: Auto-generates material list from roof measurements with waste factor';

-- ============================================================================
-- PART 6 — CREATE FUNCTION: AUTO-RESCHEDULE ON DELAY
-- ============================================================================
-- Automatically reschedules job when material delivery is delayed

CREATE OR REPLACE FUNCTION public.auto_reschedule_job_on_material_delay(
  p_order_id uuid,
  p_new_delivery_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order record;
  v_job record;
  v_old_date date;
  v_result jsonb;
BEGIN
  -- Get order and job
  SELECT * INTO v_order FROM public.material_orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Order not found');
  END IF;
  
  SELECT * INTO v_job FROM public.roofing_jobs WHERE id = v_order.job_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Job not found');
  END IF;
  
  v_old_date := v_order.delivery_date;
  
  -- Update order
  UPDATE public.material_orders
  SET 
    delivery_date = p_new_delivery_date,
    delivery_delayed = true,
    auto_rescheduled = true,
    original_delivery_date = COALESCE(original_delivery_date, v_old_date),
    delay_reason = COALESCE(delay_reason, 'Material delivery delayed'),
    eta = (p_new_delivery_date::timestamp + interval '1 day')::timestamptz,  -- Estimate next day delivery
    updated_at = now()
  WHERE id = p_order_id;
  
  -- Update job scheduled dates if needed
  IF v_job.scheduled_start_date IS NOT NULL AND v_job.scheduled_start_date <= p_new_delivery_date THEN
    UPDATE public.roofing_jobs
    SET 
      scheduled_start_date = p_new_delivery_date + interval '1 day',  -- Start day after delivery
      scheduled_end_date = CASE 
        WHEN scheduled_end_date IS NOT NULL THEN 
          scheduled_end_date + (p_new_delivery_date - v_old_date)  -- Shift end date by same amount
        ELSE NULL
      END,
      updated_at = now()
    WHERE id = v_job.id;
  END IF;
  
  -- Log to job timeline if function exists
  BEGIN
    PERFORM public.log_job_timeline_event(
      p_job_id => v_job.id,
      p_lead_id => v_job.lead_id,
      p_event_type => 'material_delivery_delayed',
      p_message => format('Material delivery delayed from %s to %s. Job rescheduled.', 
                         v_old_date, p_new_delivery_date),
      p_event_data => jsonb_build_object(
        'order_id', p_order_id,
        'old_delivery_date', v_old_date,
        'new_delivery_date', p_new_delivery_date,
        'auto_rescheduled', true
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- Function may not exist, ignore
    NULL;
  END;
  
  v_result := jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'job_id', v_job.id,
    'old_delivery_date', v_old_date,
    'new_delivery_date', p_new_delivery_date,
    'job_rescheduled', v_job.scheduled_start_date IS NOT NULL
  );
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.auto_reschedule_job_on_material_delay IS 'Block 41700: Auto-reschedules job when material delivery is delayed';

-- ============================================================================
-- PART 7 — CREATE FUNCTION: TRACK MATERIAL USE (POST-INSTALL)
-- ============================================================================
-- Tracks leftover materials after job completion

CREATE OR REPLACE FUNCTION public.track_material_use(
  p_order_id uuid,
  p_item_updates jsonb  -- Array of {item_name, leftover_quantity, missing_items}
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_update jsonb;
  v_item record;
  v_result jsonb := '[]'::jsonb;
BEGIN
  -- Loop through updates
  FOR v_update IN SELECT * FROM jsonb_array_elements(p_item_updates)
  LOOP
    -- Find matching item
    SELECT * INTO v_item
    FROM public.material_order_items
    WHERE material_order_id = p_order_id
      AND item_name = v_update->>'item_name'
    LIMIT 1;
    
    IF FOUND THEN
      -- Update with variance tracking (could add variance column later)
      UPDATE public.material_order_items
      SET 
        notes = COALESCE(notes, '') || format(E'\nPost-install: Leftover: %s, Missing: %s', 
                                              COALESCE(v_update->>'leftover_quantity', '0'),
                                              COALESCE(v_update->>'missing_items', 'none'))
      WHERE id = v_item.id;
      
      v_result := v_result || jsonb_build_object(
        'item_name', v_update->>'item_name',
        'updated', true
      );
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object('success', true, 'updates', v_result);
END;
$$;

COMMENT ON FUNCTION public.track_material_use IS 'Block 41700: Tracks leftover materials and missing items after job completion';

-- ============================================================================
-- PART 8 — CREATE FUNCTION: GET SUPPLIER SPENDING DASHBOARD
-- ============================================================================
-- Shows total spent per supplier, monthly costs, etc.

CREATE OR REPLACE FUNCTION public.get_supplier_spending_dashboard(
  p_workspace_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  v_total_spent numeric;
  v_supplier_stats jsonb;
BEGIN
  -- Get total spending
  SELECT COALESCE(SUM(moi.total_price), 0)
  INTO v_total_spent
  FROM public.material_order_items moi
  JOIN public.material_orders mo ON mo.id = moi.material_order_id
  WHERE mo.workspace_id = p_workspace_id
    AND mo.status IN ('confirmed', 'delivered')
    AND (p_start_date IS NULL OR mo.delivery_date >= p_start_date)
    AND (p_end_date IS NULL OR mo.delivery_date <= p_end_date);
  
  -- Get supplier breakdown
  SELECT jsonb_agg(
    jsonb_build_object(
      'supplier_id', s.id,
      'supplier_name', s.name,
      'total_orders', COUNT(DISTINCT mo.id),
      'total_spent', COALESCE(SUM(moi.total_price), 0),
      'avg_order_value', COALESCE(AVG(order_totals.order_total), 0)
    )
  )
  INTO v_supplier_stats
  FROM public.suppliers s
  LEFT JOIN public.material_orders mo ON mo.supplier_id = s.id
    AND mo.workspace_id = p_workspace_id
    AND mo.status IN ('confirmed', 'delivered')
    AND (p_start_date IS NULL OR mo.delivery_date >= p_start_date)
    AND (p_end_date IS NULL OR mo.delivery_date <= p_end_date)
  LEFT JOIN (
    SELECT 
      material_order_id,
      SUM(total_price) as order_total
    FROM public.material_order_items
    GROUP BY material_order_id
  ) order_totals ON order_totals.material_order_id = mo.id
  WHERE s.workspace_id = p_workspace_id OR s.workspace_id IS NULL
  GROUP BY s.id, s.name;
  
  v_result := jsonb_build_object(
    'workspace_id', p_workspace_id,
    'period_start', p_start_date,
    'period_end', p_end_date,
    'total_spent', v_total_spent,
    'supplier_breakdown', COALESCE(v_supplier_stats, '[]'::jsonb)
  );
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_supplier_spending_dashboard IS 'Block 41700: Returns supplier spending dashboard data';

-- ============================================================================
-- PART 9 — TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamps
CREATE OR REPLACE FUNCTION public.update_material_orders_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_material_orders_updated_at ON public.material_orders;
CREATE TRIGGER trg_update_material_orders_updated_at
BEFORE UPDATE ON public.material_orders
FOR EACH ROW
EXECUTE FUNCTION public.update_material_orders_updated_at();

CREATE OR REPLACE FUNCTION public.update_suppliers_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_suppliers_updated_at ON public.suppliers;
CREATE TRIGGER trg_update_suppliers_updated_at
BEFORE UPDATE ON public.suppliers
FOR EACH ROW
EXECUTE FUNCTION public.update_suppliers_updated_at();

-- ============================================================================
-- PART 10 — ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Suppliers
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view suppliers in workspace" ON public.suppliers;
CREATE POLICY "Users can view suppliers in workspace"
  ON public.suppliers FOR SELECT
  TO authenticated
  USING (
    workspace_id IS NULL OR
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can manage suppliers in workspace" ON public.suppliers;
CREATE POLICY "Users can manage suppliers in workspace"
  ON public.suppliers FOR ALL
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

-- Material Orders
ALTER TABLE public.material_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view material orders in workspace" ON public.material_orders;
CREATE POLICY "Users can view material orders in workspace"
  ON public.material_orders FOR SELECT
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    ) OR
    job_id IN (
      SELECT j.id FROM public.roofing_jobs j
      JOIN public.workspace_members wm ON wm.workspace_id = j.workspace_id
      WHERE wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can manage material orders in workspace" ON public.material_orders;
CREATE POLICY "Users can manage material orders in workspace"
  ON public.material_orders FOR ALL
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    ) OR
    job_id IN (
      SELECT j.id FROM public.roofing_jobs j
      JOIN public.workspace_members wm ON wm.workspace_id = j.workspace_id
      WHERE wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    ) OR
    job_id IN (
      SELECT j.id FROM public.roofing_jobs j
      JOIN public.workspace_members wm ON wm.workspace_id = j.workspace_id
      WHERE wm.user_id = auth.uid()
    )
  );

-- Material Order Items
ALTER TABLE public.material_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view material order items" ON public.material_order_items;
CREATE POLICY "Users can view material order items"
  ON public.material_order_items FOR SELECT
  TO authenticated
  USING (
    material_order_id IN (
      SELECT mo.id FROM public.material_orders mo
      JOIN public.workspace_members wm ON wm.workspace_id = mo.workspace_id
      WHERE wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can manage material order items" ON public.material_order_items;
CREATE POLICY "Users can manage material order items"
  ON public.material_order_items FOR ALL
  TO authenticated
  USING (
    material_order_id IN (
      SELECT mo.id FROM public.material_orders mo
      JOIN public.workspace_members wm ON wm.workspace_id = mo.workspace_id
      WHERE wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    material_order_id IN (
      SELECT mo.id FROM public.material_orders mo
      JOIN public.workspace_members wm ON wm.workspace_id = mo.workspace_id
      WHERE wm.user_id = auth.uid()
    )
  );

-- Material Delivery Photos
ALTER TABLE public.material_delivery_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view material delivery photos" ON public.material_delivery_photos;
CREATE POLICY "Users can view material delivery photos"
  ON public.material_delivery_photos FOR SELECT
  TO authenticated
  USING (
    material_order_id IN (
      SELECT mo.id FROM public.material_orders mo
      JOIN public.workspace_members wm ON wm.workspace_id = mo.workspace_id
      WHERE wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can manage material delivery photos" ON public.material_delivery_photos;
CREATE POLICY "Users can manage material delivery photos"
  ON public.material_delivery_photos FOR ALL
  TO authenticated
  USING (
    material_order_id IN (
      SELECT mo.id FROM public.material_orders mo
      JOIN public.workspace_members wm ON wm.workspace_id = mo.workspace_id
      WHERE wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    material_order_id IN (
      SELECT mo.id FROM public.material_orders mo
      JOIN public.workspace_members wm ON wm.workspace_id = mo.workspace_id
      WHERE wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 11 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_order_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_delivery_photos TO authenticated;

GRANT EXECUTE ON FUNCTION public.generate_material_list_from_measurements(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_reschedule_job_on_material_delay(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.track_material_use(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_supplier_spending_dashboard(uuid, date, date) TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.suppliers IS 'Block 41700: Supplier database for material ordering (Beacon, ABC, SRS, local yards)';
COMMENT ON TABLE public.material_orders IS 'Block 41700: Material orders linked to jobs with status tracking and delivery ETA';
COMMENT ON TABLE public.material_order_items IS 'Block 41700: Itemized material list for each order';
COMMENT ON TABLE public.material_delivery_photos IS 'Block 41700: Delivery confirmation photos uploaded by crew or homeowner';
