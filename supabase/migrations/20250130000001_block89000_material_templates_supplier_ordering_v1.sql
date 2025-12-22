-- Block 89000 — SmartSend Roofing "Smart Materials + Supplier Ordering System" v1
-- Material Templates, Auto-Generation, Supplier Orders, Delivery Scheduling, Cost Tracking, Job Profitability
-- This transforms SmartSend from "sales + job + payment system" → "full production + materials engine"

-- ============================================================================
-- PART 1 — MATERIAL TEMPLATES (per team/company)
-- ============================================================================
-- Contractors create repeatable templates: "Architectural 30 sq", "Metal Roof 24 sq", etc.

CREATE TABLE IF NOT EXISTS public.material_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  
  name text NOT NULL,                       -- "30 sq Architectural Roof"
  manufacturer text,                        -- "GAF", "Owens Corning", "Malarkey"
  shingle_line text,                        -- "Timberline HD", "Duration", "Vista AR"
  waste_factor numeric DEFAULT 0.10,         -- percentage (10% default)
  roof_type text,                           -- "architectural", "metal", "tpo", "insurance_asphalt"
  color text,                               -- "Weathered Wood", "Charcoal", etc.
  
  notes text,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_material_templates_team ON public.material_templates(team_id);
CREATE INDEX IF NOT EXISTS idx_material_templates_roof_type ON public.material_templates(roof_type) WHERE roof_type IS NOT NULL;

-- ============================================================================
-- PART 2 — MATERIAL TEMPLATE ITEMS
-- ============================================================================
-- Each template has material items with quantities per square

CREATE TABLE IF NOT EXISTS public.material_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.material_templates(id) ON DELETE CASCADE,
  
  item_name text NOT NULL,                  -- "Shingles - Architectural", "Ridge Cap", "Starter Strip"
  unit text NOT NULL,                       -- "bundle", "roll", "piece", "linear_feet", "box"
  quantity_per_sq numeric NOT NULL,         -- quantity per square (e.g., 3 bundles/sq for shingles)
  
  -- Optional pricing (for cost tracking)
  cost_per_unit numeric,
  
  notes text,
  
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_material_template_items_template ON public.material_template_items(template_id);

-- ============================================================================
-- PART 3 — ENHANCE MATERIAL ORDERS (add fields if missing)
-- ============================================================================
-- Add fields to existing material_orders table for template-based generation

DO $$ 
BEGIN
  -- Add total_squares if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'material_orders' AND column_name = 'total_squares') THEN
    ALTER TABLE public.material_orders ADD COLUMN total_squares numeric;
  END IF;
  
  -- Add waste_factor if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'material_orders' AND column_name = 'waste_factor') THEN
    ALTER TABLE public.material_orders ADD COLUMN waste_factor numeric DEFAULT 0.10;
  END IF;
  
  -- Add template_id if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'material_orders' AND column_name = 'template_id') THEN
    ALTER TABLE public.material_orders ADD COLUMN template_id uuid REFERENCES public.material_templates(id) ON DELETE SET NULL;
  END IF;
  
  -- Add delivery_time if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'material_orders' AND column_name = 'delivery_time') THEN
    ALTER TABLE public.material_orders ADD COLUMN delivery_time text;
  END IF;
  
  -- Add total_cost if missing (for profitability tracking)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'material_orders' AND column_name = 'total_cost') THEN
    ALTER TABLE public.material_orders ADD COLUMN total_cost numeric;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_material_orders_template ON public.material_orders(template_id) WHERE template_id IS NOT NULL;

-- ============================================================================
-- PART 4 — ENHANCE MATERIAL ORDER ITEMS (add cost fields if missing)
-- ============================================================================

DO $$ 
BEGIN
  -- Ensure cost_per_unit exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'material_order_items' AND column_name = 'cost_per_unit') THEN
    ALTER TABLE public.material_order_items ADD COLUMN cost_per_unit numeric;
  END IF;
  
  -- Ensure total_cost exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'material_order_items' AND column_name = 'total_cost') THEN
    ALTER TABLE public.material_order_items ADD COLUMN total_cost numeric;
  END IF;
END $$;

-- ============================================================================
-- PART 5 — ENHANCE SUPPLIERS TABLE (if missing fields)
-- ============================================================================

DO $$ 
BEGIN
  -- Add notes field if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'notes') THEN
    ALTER TABLE public.suppliers ADD COLUMN notes text;
  END IF;
END $$;

-- ============================================================================
-- PART 6 — FUNCTION: AUTO-GENERATE MATERIAL LIST FROM TEMPLATE
-- ============================================================================
-- Takes job squares + template → generates material order items

CREATE OR REPLACE FUNCTION public.generate_material_list_from_template(
  p_job_id uuid,
  p_template_id uuid,
  p_total_squares numeric,
  p_waste_factor numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id uuid;
  v_template_waste_factor numeric;
  v_adjusted_squares numeric;
  v_item record;
  v_quantity numeric;
  v_order_total_cost numeric := 0;
BEGIN
  -- Get waste factor (use provided or template default)
  SELECT COALESCE(p_waste_factor, waste_factor, 0.10)
  INTO v_template_waste_factor
  FROM public.material_templates
  WHERE id = p_template_id;
  
  -- Calculate adjusted squares (with waste)
  v_adjusted_squares := p_total_squares * (1 + v_template_waste_factor);
  
  -- Get or create material order
  SELECT id INTO v_order_id
  FROM public.material_orders
  WHERE job_id = p_job_id
    AND status = 'draft'
  LIMIT 1;
  
  -- Create order if doesn't exist
  IF v_order_id IS NULL THEN
    INSERT INTO public.material_orders (
      job_id,
      template_id,
      total_squares,
      waste_factor,
      status
    )
    SELECT 
      p_job_id,
      p_template_id,
      p_total_squares,
      v_template_waste_factor,
      'draft'
    FROM public.jobs
    WHERE id = p_job_id
    RETURNING id INTO v_order_id;
  ELSE
    -- Update existing order
    UPDATE public.material_orders
    SET 
      template_id = p_template_id,
      total_squares = p_total_squares,
      waste_factor = v_template_waste_factor,
      updated_at = now()
    WHERE id = v_order_id;
  END IF;
  
  -- Delete existing items (we'll regenerate)
  DELETE FROM public.material_order_items
  WHERE material_order_id = v_order_id;
  
  -- Generate items from template
  FOR v_item IN
    SELECT 
      item_name,
      unit,
      quantity_per_sq,
      cost_per_unit
    FROM public.material_template_items
    WHERE template_id = p_template_id
  LOOP
    -- Calculate quantity (per square * adjusted squares)
    v_quantity := v_item.quantity_per_sq * v_adjusted_squares;
    
    -- Round up to whole units
    IF v_item.unit IN ('bundle', 'roll', 'piece', 'box') THEN
      v_quantity := CEIL(v_quantity);
    END IF;
    
    -- Calculate total cost
    DECLARE
      v_item_total_cost numeric;
    BEGIN
      v_item_total_cost := v_quantity * COALESCE(v_item.cost_per_unit, 0);
      v_order_total_cost := v_order_total_cost + v_item_total_cost;
      
      -- Insert order item
      INSERT INTO public.material_order_items (
        material_order_id,
        item_name,
        quantity,
        unit,
        cost_per_unit,
        total_cost
      )
      VALUES (
        v_order_id,
        v_item.item_name,
        v_quantity,
        v_item.unit,
        v_item.cost_per_unit,
        v_item_total_cost
      );
    END;
  END LOOP;
  
  -- Update order total cost
  UPDATE public.material_orders
  SET total_cost = v_order_total_cost
  WHERE id = v_order_id;
  
  RETURN v_order_id;
END;
$$;

-- ============================================================================
-- PART 7 — FUNCTION: CALCULATE JOB PROFITABILITY
-- ============================================================================
-- Returns revenue, material costs, profit, margin for a job

CREATE OR REPLACE FUNCTION public.calculate_job_profitability(
  p_job_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_revenue numeric;
  v_material_cost numeric;
  v_labor_cost numeric;
  v_dumpster_cost numeric;
  v_total_cost numeric;
  v_profit numeric;
  v_margin numeric;
  v_result jsonb;
BEGIN
  -- Get revenue from job contract_value
  SELECT COALESCE(contract_value, 0)
  INTO v_revenue
  FROM public.jobs
  WHERE id = p_job_id;
  
  -- Get material costs (sum of all delivered orders)
  SELECT COALESCE(SUM(total_cost), 0)
  INTO v_material_cost
  FROM public.material_orders
  WHERE job_id = p_job_id
    AND status IN ('delivered', 'confirmed', 'sent');
  
  -- Get labor cost (if stored in job or separate table)
  -- For now, default to 0 (can be enhanced later)
  v_labor_cost := 0;
  
  -- Get dumpster cost (if stored separately)
  -- For now, default to 0 (can be enhanced later)
  v_dumpster_cost := 0;
  
  -- Calculate totals
  v_total_cost := v_material_cost + v_labor_cost + v_dumpster_cost;
  v_profit := v_revenue - v_total_cost;
  
  -- Calculate margin percentage
  IF v_revenue > 0 THEN
    v_margin := (v_profit / v_revenue) * 100;
  ELSE
    v_margin := 0;
  END IF;
  
  -- Build result
  v_result := jsonb_build_object(
    'revenue', v_revenue,
    'material_cost', v_material_cost,
    'labor_cost', v_labor_cost,
    'dumpster_cost', v_dumpster_cost,
    'total_cost', v_total_cost,
    'profit', v_profit,
    'margin_percent', ROUND(v_margin, 2)
  );
  
  RETURN v_result;
END;
$$;

-- ============================================================================
-- PART 8 — TRIGGERS
-- ============================================================================

-- Update updated_at on material_templates
CREATE OR REPLACE FUNCTION update_material_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_material_templates_updated_at ON public.material_templates;
CREATE TRIGGER trg_material_templates_updated_at
BEFORE UPDATE ON public.material_templates
FOR EACH ROW
EXECUTE FUNCTION update_material_templates_updated_at();

-- ============================================================================
-- PART 9 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS
ALTER TABLE public.material_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_template_items ENABLE ROW LEVEL SECURITY;

-- Material templates: Team members can access templates in their teams
DROP POLICY IF EXISTS "material_templates_team_member" ON public.material_templates;
CREATE POLICY "material_templates_team_member" ON public.material_templates
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = material_templates.team_id
        AND tm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = material_templates.team_id
        AND tm.user_id = auth.uid()
    )
  );

-- Material template items: Same team access
DROP POLICY IF EXISTS "material_template_items_team_member" ON public.material_template_items;
CREATE POLICY "material_template_items_team_member" ON public.material_template_items
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.material_templates mt
      JOIN public.team_members tm ON mt.team_id = tm.team_id
      WHERE mt.id = material_template_items.template_id
        AND tm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.material_templates mt
      JOIN public.team_members tm ON mt.team_id = tm.team_id
      WHERE mt.id = material_template_items.template_id
        AND tm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 10 — SEED DEFAULT TEMPLATE ITEMS (Common roofing materials)
-- ============================================================================
-- This creates a helper function to add standard items to a template

CREATE OR REPLACE FUNCTION public.add_default_template_items(
  p_template_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Add common roofing materials (if not already present)
  INSERT INTO public.material_template_items (template_id, item_name, unit, quantity_per_sq)
  VALUES
    (p_template_id, 'Shingles', 'bundle', 3.0),                    -- 3 bundles per square
    (p_template_id, 'Ridge Cap', 'linear_feet', 20.0),             -- ~20 linear feet per square
    (p_template_id, 'Starter Strip', 'linear_feet', 100.0),        -- ~100 linear feet per square (perimeter)
    (p_template_id, 'Underlayment', 'roll', 0.5),                  -- 0.5 rolls per square (200 sq ft rolls)
    (p_template_id, 'Ice & Water Shield', 'roll', 0.25),           -- 0.25 rolls per square (for eaves/valleys)
    (p_template_id, 'Drip Edge', 'linear_feet', 100.0),            -- ~100 linear feet per square
    (p_template_id, 'Ventilation - Ridge Vent', 'linear_feet', 20.0), -- ~20 linear feet per square
    (p_template_id, 'Nails', 'box', 0.5),                          -- 0.5 boxes per square
    (p_template_id, 'Flashings', 'piece', 2.0),                    -- 2 pieces per square (average)
    (p_template_id, 'Dumpster', 'each', 0.1)                      -- 0.1 dumpsters per square (1 per 10 sq)
  ON CONFLICT DO NOTHING;
END;
$$;

-- ============================================================================
-- PART 11 — INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_material_orders_job_status ON public.material_orders(job_id, status);
CREATE INDEX IF NOT EXISTS idx_material_orders_delivery_date_status ON public.material_orders(delivery_date, status) WHERE delivery_date IS NOT NULL;



























