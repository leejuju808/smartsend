-- =========================================================
-- Block 43000 — SmartSend Roofing "Job Costs + Labor & Material Budget Engine" v1
-- (REAL-TIME COST TRACKING • ESTIMATED VS ACTUAL • MARGIN PROTECTION • AUTO-FLAG OVERAGES)
-- =========================================================
-- 
-- This block protects roofer profits — the #1 reason they go out of business is margin leaks.
-- SmartSend fixes that by tracking estimated vs actual costs in real-time.
--
-- Features:
-- - Estimated job cost stored at estimate time
-- - Actual material cost from Crew App (Block 42000)
-- - Actual labor cost from start/stop logs
-- - Real-time margin snapshot
-- - Overrun alerts (material > 10%, labor > 20%, plywood without change order, etc.)
-- - Final job cost report

-- ============================================================================
-- PART 1 — CREATE job_estimates TABLE
-- ============================================================================
-- Stores estimated costs at estimate time

CREATE TABLE IF NOT EXISTS public.job_estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Estimated materials (JSONB for flexibility)
  estimated_materials jsonb DEFAULT '{}'::jsonb, -- {bundles:30, ridge:6, underlayment:4, ice_water:2, etc.}
  
  -- Estimated labor
  estimated_labor_hours numeric(10,2) DEFAULT 0,
  estimated_labor_rate numeric(10,2) DEFAULT 0, -- Hourly rate or per-square rate
  estimated_crew_size integer DEFAULT 1,
  
  -- Other estimated costs
  dumpster_cost numeric(10,2) DEFAULT 0,
  delivery_cost numeric(10,2) DEFAULT 0,
  other_costs numeric(10,2) DEFAULT 0,
  
  -- Markup and pricing
  markup_percentage numeric(5,2) DEFAULT 0,
  estimated_total_cost numeric(12,2) GENERATED ALWAYS AS (
    COALESCE((SELECT SUM(value::numeric) FROM jsonb_each_text(estimated_materials) WHERE key != 'notes'), 0) +
    COALESCE(estimated_labor_hours * estimated_labor_rate * estimated_crew_size, 0) +
    COALESCE(dumpster_cost, 0) +
    COALESCE(delivery_cost, 0) +
    COALESCE(other_costs, 0)
  ) STORED,
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_job_estimates_job ON public.job_estimates(job_id);
CREATE INDEX IF NOT EXISTS idx_job_estimates_workspace ON public.job_estimates(workspace_id);

-- ============================================================================
-- PART 2 — CREATE job_actual_costs TABLE
-- ============================================================================
-- Aggregated actual costs (updated nightly or on-demand)

CREATE TABLE IF NOT EXISTS public.job_actual_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Actual costs
  actual_material_cost numeric(12,2) DEFAULT 0,
  actual_labor_cost numeric(12,2) DEFAULT 0,
  change_order_total numeric(12,2) DEFAULT 0,
  
  -- Calculated totals
  actual_total_cost numeric(12,2) GENERATED ALWAYS AS (
    COALESCE(actual_material_cost, 0) +
    COALESCE(actual_labor_cost, 0) +
    COALESCE(change_order_total, 0)
  ) STORED,
  
  -- Profit calculation (requires job_value from roofing_jobs)
  estimated_profit numeric(12,2), -- Calculated via function
  actual_profit numeric(12,2), -- Calculated via function
  margin_loss numeric(12,2), -- Calculated via function
  
  -- Metadata
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_job_actual_costs_job_unique ON public.job_actual_costs(job_id);
CREATE INDEX IF NOT EXISTS idx_job_actual_costs_workspace ON public.job_actual_costs(workspace_id);

-- ============================================================================
-- PART 3 — CREATE job_cost_overruns TABLE
-- ============================================================================
-- Tracks cost overruns and flags them for investigation

CREATE TABLE IF NOT EXISTS public.job_cost_overruns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  category text NOT NULL CHECK (category IN (
    'material',
    'labor',
    'plywood',
    'other'
  )),
  
  amount numeric(12,2) NOT NULL,
  percentage_over numeric(5,2), -- % over estimate
  notes text,
  
  -- Alert status
  acknowledged boolean DEFAULT false,
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Metadata
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_cost_overruns_job ON public.job_cost_overruns(job_id);
CREATE INDEX IF NOT EXISTS idx_job_cost_overruns_workspace ON public.job_cost_overruns(workspace_id);
CREATE INDEX IF NOT EXISTS idx_job_cost_overruns_category ON public.job_cost_overruns(category);
CREATE INDEX IF NOT EXISTS idx_job_cost_overruns_unacknowledged ON public.job_cost_overruns(workspace_id, acknowledged) WHERE acknowledged = false;

-- ============================================================================
-- PART 4 — CREATE calculate_job_costs FUNCTION
-- ============================================================================
-- Aggregates material usage, labor hours, and calculates actual costs
-- Called nightly, on material usage updates, labor log updates, or job completion

CREATE OR REPLACE FUNCTION public.calculate_job_costs(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job public.roofing_jobs%rowtype;
  v_estimate public.job_estimates%rowtype;
  v_actual_cost public.job_actual_costs%rowtype;
  
  -- Material calculations
  v_material_usage jsonb;
  v_actual_material_cost numeric(12,2) := 0;
  v_bundles_used numeric(10,2) := 0;
  v_ridge_used numeric(10,2) := 0;
  v_underlayment_used numeric(10,2) := 0;
  v_ice_water_used numeric(10,2) := 0;
  v_plywood_used numeric(10,2) := 0;
  v_nails_used numeric(10,2) := 0;
  
  -- Labor calculations
  v_actual_labor_hours numeric(10,2) := 0;
  v_actual_labor_cost numeric(12,2) := 0;
  v_labor_rate numeric(10,2) := 0;
  
  -- Change orders
  v_change_order_total numeric(12,2) := 0;
  
  -- Unit prices (should come from workspace settings or material_orders)
  v_bundle_price numeric(10,2) := 0;
  v_ridge_price numeric(10,2) := 0;
  v_underlayment_price numeric(10,2) := 0;
  v_ice_water_price numeric(10,2) := 0;
  v_plywood_price numeric(10,2) := 0;
  v_nails_price numeric(10,2) := 0;
  
  -- Profit calculations
  v_estimated_profit numeric(12,2) := 0;
  v_actual_profit numeric(12,2) := 0;
  v_margin_loss numeric(12,2) := 0;
  
  v_result jsonb;
BEGIN
  -- Get job
  SELECT * INTO v_job FROM public.roofing_jobs WHERE id = p_job_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Job not found');
  END IF;
  
  -- Get estimate
  SELECT * INTO v_estimate FROM public.job_estimates WHERE job_id = p_job_id ORDER BY created_at DESC LIMIT 1;
  
  -- Aggregate material usage from material_usage table (Block 42000)
  -- Sum quantities by material name pattern matching
  SELECT COALESCE(SUM(quantity), 0) INTO v_bundles_used
  FROM public.material_usage
  WHERE job_id = p_job_id AND material_name ILIKE '%bundle%';
  
  SELECT COALESCE(SUM(quantity), 0) INTO v_ridge_used
  FROM public.material_usage
  WHERE job_id = p_job_id AND material_name ILIKE '%ridge%';
  
  SELECT COALESCE(SUM(quantity), 0) INTO v_underlayment_used
  FROM public.material_usage
  WHERE job_id = p_job_id AND material_name ILIKE '%underlayment%';
  
  SELECT COALESCE(SUM(quantity), 0) INTO v_ice_water_used
  FROM public.material_usage
  WHERE job_id = p_job_id AND (material_name ILIKE '%ice%' OR material_name ILIKE '%water%');
  
  SELECT COALESCE(SUM(quantity), 0) INTO v_plywood_used
  FROM public.material_usage
  WHERE job_id = p_job_id AND material_name ILIKE '%plywood%';
  
  SELECT COALESCE(SUM(quantity), 0) INTO v_nails_used
  FROM public.material_usage
  WHERE job_id = p_job_id AND material_name ILIKE '%nail%';
  
  -- Build material usage JSONB for return value
  SELECT jsonb_object_agg(
    material_name,
    SUM(quantity)
  )
  INTO v_material_usage
  FROM public.material_usage
  WHERE job_id = p_job_id
  GROUP BY material_name;
  
  -- Get unit prices from material_orders or use defaults
  -- TODO: Pull from actual material_orders for this job, or workspace settings
  v_bundle_price := 45.00; -- Default shingle bundle price
  v_ridge_price := 35.00; -- Default ridge cap price
  v_underlayment_price := 120.00; -- Default underlayment roll price
  v_ice_water_price := 95.00; -- Default ice & water shield price
  v_plywood_price := 65.00; -- Default plywood sheet price
  v_nails_price := 25.00; -- Default nails box price
  
  -- Calculate actual material cost
  v_actual_material_cost := 
    (v_bundles_used * v_bundle_price) +
    (v_ridge_used * v_ridge_price) +
    (v_underlayment_used * v_underlayment_price) +
    (v_ice_water_used * v_ice_water_price) +
    (v_plywood_used * v_plywood_price) +
    (v_nails_used * v_nails_price);
  
  -- Aggregate labor hours from crew_check_ins or crew_hours
  SELECT 
    COALESCE(SUM(billable_hours), 0),
    COALESCE(AVG(hourly_rate), 0)
  INTO v_actual_labor_hours, v_labor_rate
  FROM public.crew_check_ins
  WHERE job_id = p_job_id AND check_out_time IS NOT NULL;
  
  -- If no crew_check_ins, try crew_hours table
  IF v_actual_labor_hours = 0 THEN
    SELECT 
      COALESCE(SUM(total_hours), 0),
      COALESCE(AVG(hourly_rate), 0)
    INTO v_actual_labor_hours, v_labor_rate
    FROM public.crew_hours
    WHERE job_id = p_job_id AND end_time IS NOT NULL;
  END IF;
  
  -- If still no rate, use estimate rate or default
  IF v_labor_rate = 0 AND v_estimate IS NOT NULL THEN
    v_labor_rate := v_estimate.estimated_labor_rate;
  END IF;
  
  IF v_labor_rate = 0 THEN
    v_labor_rate := 50.00; -- Default hourly rate
  END IF;
  
  -- Calculate actual labor cost
  v_actual_labor_cost := v_actual_labor_hours * v_labor_rate;
  
  -- Get change order total
  SELECT COALESCE(SUM(amount), 0)
  INTO v_change_order_total
  FROM public.roofing_change_orders rco
  JOIN public.roofing_change_order_revenue rcor ON rcor.change_order_id = rco.id
  WHERE rco.job_id = p_job_id
    AND rco.status = 'approved'
    AND rcor.approved = true;
  
  -- Calculate profits
  IF v_job.job_value > 0 THEN
    -- Estimated profit (if estimate exists)
    IF v_estimate IS NOT NULL THEN
      v_estimated_profit := v_job.job_value - v_estimate.estimated_total_cost;
    END IF;
    
    -- Actual profit
    v_actual_profit := v_job.job_value - (v_actual_material_cost + v_actual_labor_cost + v_change_order_total);
    
    -- Margin loss
    v_margin_loss := v_actual_profit - COALESCE(v_estimated_profit, 0);
  END IF;
  
  -- Upsert job_actual_costs
  INSERT INTO public.job_actual_costs (
    job_id,
    workspace_id,
    actual_material_cost,
    actual_labor_cost,
    change_order_total,
    estimated_profit,
    actual_profit,
    margin_loss
  )
  VALUES (
    p_job_id,
    v_job.workspace_id,
    v_actual_material_cost,
    v_actual_labor_cost,
    v_change_order_total,
    v_estimated_profit,
    v_actual_profit,
    v_margin_loss
  )
  ON CONFLICT (job_id) DO UPDATE SET
    actual_material_cost = EXCLUDED.actual_material_cost,
    actual_labor_cost = EXCLUDED.actual_labor_cost,
    change_order_total = EXCLUDED.change_order_total,
    estimated_profit = EXCLUDED.estimated_profit,
    actual_profit = EXCLUDED.actual_profit,
    margin_loss = EXCLUDED.margin_loss,
    updated_at = now();
  
  -- Check for overruns
  PERFORM public.check_cost_overruns(p_job_id);
  
  -- Return result
  v_result := jsonb_build_object(
    'job_id', p_job_id,
    'actual_material_cost', v_actual_material_cost,
    'actual_labor_cost', v_actual_labor_cost,
    'change_order_total', v_change_order_total,
    'actual_total_cost', v_actual_material_cost + v_actual_labor_cost + v_change_order_total,
    'estimated_profit', v_estimated_profit,
    'actual_profit', v_actual_profit,
    'margin_loss', v_margin_loss,
    'material_usage', v_material_usage,
    'labor_hours', v_actual_labor_hours
  );
  
  RETURN v_result;
END;
$$;

-- ============================================================================
-- PART 5 — CREATE check_cost_overruns FUNCTION
-- ============================================================================
-- Detects cost overruns and creates alerts

CREATE OR REPLACE FUNCTION public.check_cost_overruns(p_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job public.roofing_jobs%rowtype;
  v_estimate public.job_estimates%rowtype;
  v_actual public.job_actual_costs%rowtype;
  
  v_material_overrun_pct numeric(5,2);
  v_labor_overrun_pct numeric(5,2);
  v_plywood_used numeric(10,2) := 0;
  v_plywood_estimated numeric(10,2) := 0;
  v_has_change_order boolean;
BEGIN
  -- Get job, estimate, and actual costs
  SELECT * INTO v_job FROM public.roofing_jobs WHERE id = p_job_id;
  SELECT * INTO v_estimate FROM public.job_estimates WHERE job_id = p_job_id ORDER BY created_at DESC LIMIT 1;
  SELECT * INTO v_actual FROM public.job_actual_costs WHERE job_id = p_job_id;
  
  IF v_estimate IS NULL OR v_actual IS NULL THEN
    RETURN; -- Can't check overruns without estimate and actual
  END IF;
  
  -- Check material overrun (> 10% over estimate)
  IF v_estimate.estimated_materials IS NOT NULL THEN
    -- Get estimated material cost from estimate
    DECLARE
      v_estimated_material_cost numeric(12,2) := 0;
    BEGIN
      -- Calculate estimated material cost from estimated_materials JSONB
      SELECT COALESCE(SUM(value::numeric), 0)
      INTO v_estimated_material_cost
      FROM jsonb_each_text(v_estimate.estimated_materials)
      WHERE key != 'notes';
      
      IF v_estimated_material_cost > 0 THEN
        v_material_overrun_pct := ((v_actual.actual_material_cost / v_estimated_material_cost) - 1) * 100;
        
        IF v_material_overrun_pct > 10 THEN
          -- Check if overrun already exists
          IF NOT EXISTS (
            SELECT 1 FROM public.job_cost_overruns
            WHERE job_id = p_job_id
              AND category = 'material'
              AND acknowledged = false
          ) THEN
            INSERT INTO public.job_cost_overruns (
              job_id,
              workspace_id,
              category,
              amount,
              percentage_over,
              notes
            )
            VALUES (
              p_job_id,
              v_job.workspace_id,
              'material',
              v_actual.actual_material_cost - v_estimated_material_cost,
              v_material_overrun_pct,
              format('Material use exceeded estimate by %.1f%%', v_material_overrun_pct)
            );
          END IF;
        END IF;
      END IF;
    END;
  END IF;
  
  -- Check labor overrun (> 20% over estimate)
  IF v_estimate.estimated_labor_hours > 0 THEN
    DECLARE
      v_actual_labor_hours numeric(10,2) := 0;
    BEGIN
      -- Get actual labor hours
      SELECT COALESCE(SUM(billable_hours), 0)
      INTO v_actual_labor_hours
      FROM public.crew_check_ins
      WHERE job_id = p_job_id AND check_out_time IS NOT NULL;
      
      IF v_actual_labor_hours = 0 THEN
        SELECT COALESCE(SUM(total_hours), 0)
        INTO v_actual_labor_hours
        FROM public.crew_hours
        WHERE job_id = p_job_id AND end_time IS NOT NULL;
      END IF;
      
      IF v_actual_labor_hours > 0 THEN
        v_labor_overrun_pct := ((v_actual_labor_hours / v_estimate.estimated_labor_hours) - 1) * 100;
        
        IF v_labor_overrun_pct > 20 THEN
          -- Check if overrun already exists
          IF NOT EXISTS (
            SELECT 1 FROM public.job_cost_overruns
            WHERE job_id = p_job_id
              AND category = 'labor'
              AND acknowledged = false
          ) THEN
            INSERT INTO public.job_cost_overruns (
              job_id,
              workspace_id,
              category,
              amount,
              percentage_over,
              notes
            )
            VALUES (
              p_job_id,
              v_job.workspace_id,
              'labor',
              (v_actual_labor_hours - v_estimate.estimated_labor_hours) * COALESCE(v_estimate.estimated_labor_rate, 50),
              v_labor_overrun_pct,
              format('Labor hours exceeded estimate by %.1f%%', v_labor_overrun_pct)
            );
          END IF;
        END IF;
      END IF;
    END;
  END IF;
  
  -- Check plywood added without change order
  SELECT COALESCE(SUM(quantity), 0)
  INTO v_plywood_used
  FROM public.material_usage
  WHERE job_id = p_job_id AND material_name ILIKE '%plywood%';
  
  IF v_estimate.estimated_materials IS NOT NULL THEN
    SELECT COALESCE((v_estimate.estimated_materials->>'plywood')::numeric, 0)
    INTO v_plywood_estimated;
  END IF;
  
  IF v_plywood_used > v_plywood_estimated AND v_plywood_estimated = 0 THEN
    -- Check if there's a change order for plywood
    SELECT EXISTS(
      SELECT 1 FROM public.roofing_change_orders rco
      JOIN public.roofing_change_order_items rcoi ON rcoi.change_order_id = rco.id
      WHERE rco.job_id = p_job_id
        AND rcoi.description ILIKE '%plywood%'
        AND rco.status = 'approved'
    ) INTO v_has_change_order;
    
    IF NOT v_has_change_order THEN
      -- Check if overrun already exists
      IF NOT EXISTS (
        SELECT 1 FROM public.job_cost_overruns
        WHERE job_id = p_job_id
          AND category = 'plywood'
          AND acknowledged = false
      ) THEN
        INSERT INTO public.job_cost_overruns (
          job_id,
          workspace_id,
          category,
          amount,
          percentage_over,
          notes
        )
        VALUES (
          p_job_id,
          v_job.workspace_id,
          'plywood',
          v_plywood_used * 65.00, -- Default plywood price
          100, -- 100% over (wasn't estimated)
          'Plywood added without change order'
        );
      END IF;
    END IF;
  END IF;
END;
$$;

-- ============================================================================
-- PART 6 — CREATE TRIGGERS
-- ============================================================================
-- Auto-calculate costs when material usage or labor logs update

CREATE OR REPLACE FUNCTION public.trigger_calculate_job_costs()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.calculate_job_costs(COALESCE(NEW.job_id, OLD.job_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Trigger on material_usage changes
DROP TRIGGER IF EXISTS trg_calculate_costs_on_material_usage ON public.material_usage;
CREATE TRIGGER trg_calculate_costs_on_material_usage
AFTER INSERT OR UPDATE OR DELETE ON public.material_usage
FOR EACH ROW
EXECUTE FUNCTION public.trigger_calculate_job_costs();

-- Trigger on crew_check_ins changes
DROP TRIGGER IF EXISTS trg_calculate_costs_on_crew_check_ins ON public.crew_check_ins;
CREATE TRIGGER trg_calculate_costs_on_crew_check_ins
AFTER INSERT OR UPDATE OR DELETE ON public.crew_check_ins
FOR EACH ROW
EXECUTE FUNCTION public.trigger_calculate_job_costs();

-- Trigger on crew_hours changes
DROP TRIGGER IF EXISTS trg_calculate_costs_on_crew_hours ON public.crew_hours;
CREATE TRIGGER trg_calculate_costs_on_crew_hours
AFTER INSERT OR UPDATE OR DELETE ON public.crew_hours
FOR EACH ROW
EXECUTE FUNCTION public.trigger_calculate_job_costs();

-- Trigger on job status change to completed
CREATE OR REPLACE FUNCTION public.trigger_calculate_costs_on_job_complete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    PERFORM public.calculate_job_costs(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_calculate_costs_on_job_complete ON public.roofing_jobs;
CREATE TRIGGER trg_calculate_costs_on_job_complete
AFTER UPDATE OF status ON public.roofing_jobs
FOR EACH ROW
EXECUTE FUNCTION public.trigger_calculate_costs_on_job_complete();

-- ============================================================================
-- PART 7 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.job_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_actual_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_cost_overruns ENABLE ROW LEVEL SECURITY;

-- Job estimates: Workspace members can access
CREATE POLICY "job_estimates_workspace_member" ON public.job_estimates
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = job_estimates.workspace_id AND user_id = auth.uid()
    )
  );

-- Job actual costs: Workspace members can access
CREATE POLICY "job_actual_costs_workspace_member" ON public.job_actual_costs
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = job_actual_costs.workspace_id AND user_id = auth.uid()
    )
  );

-- Job cost overruns: Workspace members can access
CREATE POLICY "job_cost_overruns_workspace_member" ON public.job_cost_overruns
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = job_cost_overruns.workspace_id AND user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 8 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_estimates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_actual_costs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_cost_overruns TO authenticated;

GRANT EXECUTE ON FUNCTION public.calculate_job_costs(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_cost_overruns(uuid) TO authenticated;

-- ============================================================================
-- PART 9 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.job_estimates IS 'Block 43000: Estimated job costs stored at estimate time';
COMMENT ON TABLE public.job_actual_costs IS 'Block 43000: Aggregated actual costs (updated nightly or on-demand)';
COMMENT ON TABLE public.job_cost_overruns IS 'Block 43000: Cost overruns flagged for investigation';
COMMENT ON FUNCTION public.calculate_job_costs(uuid) IS 'Block 43000: Aggregates material usage, labor hours, and calculates actual costs';
COMMENT ON FUNCTION public.check_cost_overruns(uuid) IS 'Block 43000: Detects cost overruns and creates alerts';

