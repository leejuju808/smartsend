-- ============================================================
-- Block 255700 — SmartSend Job Costing & Profit Engine v1
-- Material Costing, Labor Tracking, Overhead Allocation, Real-Time Profitability, Variance Alerts
-- ============================================================
-- 
-- This block turns SmartSend into the roofing company's money brain — showing EXACTLY 
-- how much profit each job makes, where money leaks, and how to fix it instantly.
--
-- Features:
-- - Material Cost Engine (Live Supplier Pricing)
-- - Labor Hour Tracking (Crew Clock-In/Out)
-- - Automatic Overhead Allocation
-- - Real-Time Job Profit Dashboard
-- - Variance Alerts (Material, Labor, Scope)
-- - Insurance Job Profit Calculator (ACV/RCV)
-- - Repair Profitability Module
-- - Company-Wide Profit Insights
--
-- This is the FINANCIAL COMMAND CENTER of SmartSend.
-- ============================================================

-- ============================================================================
-- PART 1 — CREATE job_costs TABLE
-- ============================================================================
-- Main cost aggregation table with generated profit and margin columns

CREATE TABLE IF NOT EXISTS public.job_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Cost breakdown
  materials_cost numeric(12,2) DEFAULT 0,
  labor_cost numeric(12,2) DEFAULT 0,
  overhead_allocated numeric(12,2) DEFAULT 0,
  total_cost numeric(12,2) DEFAULT 0,
  
  -- Revenue
  revenue numeric(12,2) DEFAULT 0,
  
  -- Generated columns (auto-calculated)
  profit numeric(12,2) GENERATED ALWAYS AS (revenue - total_cost) STORED,
  margin numeric(5,2) GENERATED ALWAYS AS (
    CASE 
      WHEN revenue > 0 THEN
        ROUND(((revenue - total_cost) / revenue) * 100, 2)
      ELSE 0
    END
  ) STORED,
  
  -- Timestamps
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  
  UNIQUE(job_id)
);

CREATE INDEX IF NOT EXISTS idx_job_costs_job ON public.job_costs(job_id);
CREATE INDEX IF NOT EXISTS idx_job_costs_workspace ON public.job_costs(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_costs_margin ON public.job_costs(margin) WHERE margin < 30;
CREATE INDEX IF NOT EXISTS idx_job_costs_profit ON public.job_costs(profit) WHERE profit < 0;
CREATE INDEX IF NOT EXISTS idx_job_costs_updated ON public.job_costs(updated_at DESC);

COMMENT ON TABLE public.job_costs IS 'Block 255700: Main job cost aggregation with profit and margin calculations';
COMMENT ON COLUMN public.job_costs.profit IS 'Calculated profit: revenue - total_cost';
COMMENT ON COLUMN public.job_costs.margin IS 'Profit margin as percentage (e.g., 63.4 for 63.4%)';

-- ============================================================================
-- PART 2 — ENHANCE material_usage TABLE
-- ============================================================================
-- Add expected quantity and cost tracking for variance detection

DO $$
BEGIN
  -- Add expected quantity column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'material_usage' 
    AND column_name = 'quantity_expected'
  ) THEN
    ALTER TABLE public.material_usage 
      ADD COLUMN quantity_expected numeric(10,2);
  END IF;
  
  -- Add cost_per_unit column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'material_usage' 
    AND column_name = 'cost_per_unit'
  ) THEN
    ALTER TABLE public.material_usage 
      ADD COLUMN cost_per_unit numeric(10,2) DEFAULT 0;
  END IF;
  
  -- Rename quantity to quantity_actual if needed (for clarity)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'material_usage' 
    AND column_name = 'quantity'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'material_usage' 
    AND column_name = 'quantity_actual'
  ) THEN
    ALTER TABLE public.material_usage 
      RENAME COLUMN quantity TO quantity_actual;
  END IF;
  
  -- Add quantity_actual if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'material_usage' 
    AND column_name = 'quantity_actual'
  ) THEN
    ALTER TABLE public.material_usage 
      ADD COLUMN quantity_actual numeric(10,2);
  END IF;
END $$;

-- Add indexes for material variance queries
CREATE INDEX IF NOT EXISTS idx_material_usage_variance ON public.material_usage(job_id) 
  WHERE quantity_expected IS NOT NULL AND quantity_actual IS NOT NULL;

COMMENT ON TABLE public.material_usage IS 'Block 255700: Material usage tracking with expected vs actual for variance detection';

-- ============================================================================
-- PART 3 — CREATE labor_entries TABLE
-- ============================================================================
-- Labor tracking with clock-in/out integration

CREATE TABLE IF NOT EXISTS public.labor_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  crew_member_id uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Time tracking
  clock_in timestamptz NOT NULL,
  clock_out timestamptz,
  
  -- Calculated hours
  hours_worked numeric(10,2) GENERATED ALWAYS AS (
    CASE 
      WHEN clock_out IS NOT NULL THEN
        EXTRACT(EPOCH FROM (clock_out - clock_in)) / 3600.0
      ELSE NULL
    END
  ) STORED,
  
  -- Cost calculation
  hourly_rate numeric(10,2) NOT NULL DEFAULT 0,
  cost numeric(12,2) GENERATED ALWAYS AS (
    CASE 
      WHEN clock_out IS NOT NULL AND hourly_rate > 0 THEN
        (EXTRACT(EPOCH FROM (clock_out - clock_in)) / 3600.0) * hourly_rate
      ELSE 0
    END
  ) STORED,
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_labor_entries_job ON public.labor_entries(job_id);
CREATE INDEX IF NOT EXISTS idx_labor_entries_crew_member ON public.labor_entries(crew_member_id) WHERE crew_member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_labor_entries_workspace ON public.labor_entries(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_labor_entries_clock_in ON public.labor_entries(clock_in DESC);

COMMENT ON TABLE public.labor_entries IS 'Block 255700: Labor hour tracking with automatic cost calculation';

-- ============================================================================
-- PART 4 — CREATE overhead_allocation_settings TABLE
-- ============================================================================
-- Per-workspace overhead allocation configuration

CREATE TABLE IF NOT EXISTS public.overhead_allocation_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE UNIQUE,
  
  -- Overhead categories
  office_overhead numeric(12,2) DEFAULT 0,
  vehicle_fuel numeric(12,2) DEFAULT 0,
  insurance_allocation numeric(12,2) DEFAULT 0,
  software_tools numeric(12,2) DEFAULT 0,
  other_overhead numeric(12,2) DEFAULT 0,
  
  -- Allocation method
  allocation_method text CHECK (allocation_method IN ('per_job', 'per_square', 'percentage_of_revenue')) DEFAULT 'per_job',
  allocation_percentage numeric(5,2), -- If using percentage_of_revenue
  allocation_per_square numeric(10,2), -- If using per_square
  
  -- Timestamps
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_overhead_settings_workspace ON public.overhead_allocation_settings(workspace_id);

COMMENT ON TABLE public.overhead_allocation_settings IS 'Block 255700: Overhead allocation configuration per workspace';

-- ============================================================================
-- PART 5 — CREATE job_variance_alerts TABLE
-- ============================================================================
-- Variance alerts for material, labor, and scope

CREATE TABLE IF NOT EXISTS public.job_variance_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Alert type
  alert_type text NOT NULL CHECK (alert_type IN (
    'material_variance',
    'labor_variance',
    'scope_variance',
    'cost_overrun',
    'margin_low'
  )),
  
  -- Alert details
  severity text CHECK (severity IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
  message text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb, -- Additional context
  
  -- Variance metrics
  expected_value numeric(12,2),
  actual_value numeric(12,2),
  variance_amount numeric(12,2),
  variance_percentage numeric(5,2),
  
  -- Status
  acknowledged boolean DEFAULT false,
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  
  -- Timestamps
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_variance_alerts_job ON public.job_variance_alerts(job_id);
CREATE INDEX IF NOT EXISTS idx_variance_alerts_workspace ON public.job_variance_alerts(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_variance_alerts_unacknowledged ON public.job_variance_alerts(acknowledged) WHERE acknowledged = false;
CREATE INDEX IF NOT EXISTS idx_variance_alerts_type ON public.job_variance_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_variance_alerts_severity ON public.job_variance_alerts(severity) WHERE severity IN ('high', 'critical');

COMMENT ON TABLE public.job_variance_alerts IS 'Block 255700: Variance alerts for material, labor, and scope overruns';

-- ============================================================================
-- PART 6 — CREATE insurance_job_profits TABLE
-- ============================================================================
-- Insurance job profit calculator (ACV/RCV)

CREATE TABLE IF NOT EXISTS public.insurance_job_profits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE UNIQUE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Insurance payment breakdown
  acv_paid numeric(12,2) DEFAULT 0, -- Actual Cash Value
  depreciation numeric(12,2) DEFAULT 0,
  deductible_collected numeric(12,2) DEFAULT 0,
  supplements_approved numeric(12,2) DEFAULT 0,
  total_paid numeric(12,2) DEFAULT 0,
  
  -- Cost breakdown (from job_costs)
  materials_cost numeric(12,2) DEFAULT 0,
  labor_cost numeric(12,2) DEFAULT 0,
  overhead_allocated numeric(12,2) DEFAULT 0,
  total_cost numeric(12,2) DEFAULT 0,
  
  -- Calculated profit
  profit numeric(12,2) GENERATED ALWAYS AS (total_paid - total_cost) STORED,
  margin numeric(5,2) GENERATED ALWAYS AS (
    CASE 
      WHEN total_paid > 0 THEN
        ROUND(((total_paid - total_cost) / total_paid) * 100, 2)
      ELSE 0
    END
  ) STORED,
  
  -- Timestamps
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_insurance_job_profits_job ON public.insurance_job_profits(job_id);
CREATE INDEX IF NOT EXISTS idx_insurance_job_profits_workspace ON public.insurance_job_profits(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_insurance_job_profits_margin ON public.insurance_job_profits(margin) WHERE margin < 30;

COMMENT ON TABLE public.insurance_job_profits IS 'Block 255700: Insurance job profit calculator with ACV/RCV tracking';

-- ============================================================================
-- PART 7 — CREATE repair_job_profits TABLE
-- ============================================================================
-- Repair profitability module

CREATE TABLE IF NOT EXISTS public.repair_job_profits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE UNIQUE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Revenue
  revenue numeric(12,2) DEFAULT 0,
  
  -- Cost breakdown
  materials_cost numeric(12,2) DEFAULT 0,
  labor_cost numeric(12,2) DEFAULT 0,
  overhead_allocated numeric(12,2) DEFAULT 0,
  total_cost numeric(12,2) DEFAULT 0,
  
  -- Calculated profit
  profit numeric(12,2) GENERATED ALWAYS AS (revenue - total_cost) STORED,
  margin numeric(5,2) GENERATED ALWAYS AS (
    CASE 
      WHEN revenue > 0 THEN
        ROUND(((revenue - total_cost) / revenue) * 100, 2)
      ELSE 0
    END
  ) STORED,
  
  -- Timestamps
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_repair_job_profits_job ON public.repair_job_profits(job_id);
CREATE INDEX IF NOT EXISTS idx_repair_job_profits_workspace ON public.repair_job_profits(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_repair_job_profits_margin ON public.repair_job_profits(margin);

COMMENT ON TABLE public.repair_job_profits IS 'Block 255700: Repair job profitability tracking';

-- ============================================================================
-- PART 8 — FUNCTIONS: Material Cost Engine
-- ============================================================================

-- Function: Calculate material cost from material_usage and supplier pricing
CREATE OR REPLACE FUNCTION public.calculate_material_cost(p_job_id uuid)
RETURNS numeric(12,2)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_cost numeric(12,2) := 0;
  v_material_record record;
BEGIN
  -- Sum up material costs from material_usage
  FOR v_material_record IN
    SELECT 
      mu.id,
      mu.material_name,
      COALESCE(mu.quantity_actual, mu.quantity, 0) as qty,
      COALESCE(mu.cost_per_unit, 0) as unit_cost,
      -- Try to get price from materials_catalog (Block 254800)
      COALESCE(
        mu.cost_per_unit,
        (SELECT current_price FROM public.materials_catalog 
         WHERE material_name = mu.material_name 
         ORDER BY updated_at DESC LIMIT 1),
        0
      ) as final_unit_cost
    FROM public.material_usage mu
    WHERE mu.job_id = p_job_id
  LOOP
    v_total_cost := v_total_cost + (v_material_record.qty * v_material_record.final_unit_cost);
  END LOOP;
  
  RETURN COALESCE(v_total_cost, 0);
END;
$$;

COMMENT ON FUNCTION public.calculate_material_cost(uuid) IS 'Block 255700: Calculates total material cost from usage and supplier pricing';

-- ============================================================================
-- PART 9 — FUNCTIONS: Labor Cost Calculation
-- ============================================================================

-- Function: Calculate labor cost from labor_entries
CREATE OR REPLACE FUNCTION public.calculate_labor_cost(p_job_id uuid)
RETURNS numeric(12,2)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_cost numeric(12,2) := 0;
BEGIN
  -- Sum up labor costs from labor_entries
  SELECT COALESCE(SUM(cost), 0)
  INTO v_total_cost
  FROM public.labor_entries
  WHERE job_id = p_job_id
    AND clock_out IS NOT NULL; -- Only count completed entries
  
  RETURN COALESCE(v_total_cost, 0);
END;
$$;

COMMENT ON FUNCTION public.calculate_labor_cost(uuid) IS 'Block 255700: Calculates total labor cost from clock-in/out entries';

-- ============================================================================
-- PART 10 — FUNCTIONS: Overhead Allocation
-- ============================================================================

-- Function: Calculate overhead allocation for a job
CREATE OR REPLACE FUNCTION public.calculate_overhead_allocation(p_job_id uuid)
RETURNS numeric(12,2)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job record;
  v_settings record;
  v_total_overhead numeric(12,2) := 0;
  v_allocation numeric(12,2) := 0;
BEGIN
  -- Get job details
  SELECT rj.*, rj.workspace_id
  INTO v_job
  FROM public.roofing_jobs rj
  WHERE rj.id = p_job_id;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  -- Get overhead settings for workspace
  SELECT * INTO v_settings
  FROM public.overhead_allocation_settings
  WHERE workspace_id = v_job.workspace_id;
  
  IF NOT FOUND THEN
    -- Use default allocation if no settings
    RETURN 0;
  END IF;
  
  -- Calculate total overhead
  v_total_overhead := COALESCE(v_settings.office_overhead, 0) +
                      COALESCE(v_settings.vehicle_fuel, 0) +
                      COALESCE(v_settings.insurance_allocation, 0) +
                      COALESCE(v_settings.software_tools, 0) +
                      COALESCE(v_settings.other_overhead, 0);
  
  -- Allocate based on method
  CASE v_settings.allocation_method
    WHEN 'per_job' THEN
      -- Simple per-job allocation (divide total by number of active jobs)
      SELECT COALESCE(v_total_overhead / NULLIF(COUNT(*), 0), 0)
      INTO v_allocation
      FROM public.roofing_jobs
      WHERE workspace_id = v_job.workspace_id
        AND status IN ('scheduled', 'in_progress', 'completed');
    
    WHEN 'per_square' THEN
      -- Per square allocation (if job has square footage)
      -- This would require square_footage on roofing_jobs - for now use default
      v_allocation := COALESCE(v_settings.allocation_per_square, 0);
    
    WHEN 'percentage_of_revenue' THEN
      -- Percentage of revenue
      v_allocation := COALESCE(v_job.job_value, 0) * (COALESCE(v_settings.allocation_percentage, 0) / 100.0);
    
    ELSE
      v_allocation := 0;
  END CASE;
  
  RETURN COALESCE(v_allocation, 0);
END;
$$;

COMMENT ON FUNCTION public.calculate_overhead_allocation(uuid) IS 'Block 255700: Calculates overhead allocation for a job based on workspace settings';

-- ============================================================================
-- PART 11 — FUNCTIONS: Update Job Costs
-- ============================================================================

-- Function: Update job_costs with all calculations
CREATE OR REPLACE FUNCTION public.update_job_costs(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job record;
  v_materials_cost numeric(12,2) := 0;
  v_labor_cost numeric(12,2) := 0;
  v_overhead numeric(12,2) := 0;
  v_total_cost numeric(12,2) := 0;
  v_revenue numeric(12,2) := 0;
  v_result jsonb;
BEGIN
  -- Get job details
  SELECT rj.*, rj.workspace_id
  INTO v_job
  FROM public.roofing_jobs rj
  WHERE rj.id = p_job_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Job not found');
  END IF;
  
  -- Calculate costs
  v_materials_cost := public.calculate_material_cost(p_job_id);
  v_labor_cost := public.calculate_labor_cost(p_job_id);
  v_overhead := public.calculate_overhead_allocation(p_job_id);
  v_total_cost := v_materials_cost + v_labor_cost + v_overhead;
  v_revenue := COALESCE(v_job.job_value, 0);
  
  -- Upsert job_costs
  INSERT INTO public.job_costs (
    job_id,
    workspace_id,
    materials_cost,
    labor_cost,
    overhead_allocated,
    total_cost,
    revenue
  )
  VALUES (
    p_job_id,
    v_job.workspace_id,
    v_materials_cost,
    v_labor_cost,
    v_overhead,
    v_total_cost,
    v_revenue
  )
  ON CONFLICT (job_id) DO UPDATE SET
    workspace_id = EXCLUDED.workspace_id,
    materials_cost = EXCLUDED.materials_cost,
    labor_cost = EXCLUDED.labor_cost,
    overhead_allocated = EXCLUDED.overhead_allocated,
    total_cost = EXCLUDED.total_cost,
    revenue = EXCLUDED.revenue,
    updated_at = now();
  
  -- Get calculated values
  SELECT jsonb_build_object(
    'profit', profit,
    'margin', margin,
    'total_cost', total_cost,
    'materials_cost', materials_cost,
    'labor_cost', labor_cost,
    'overhead_allocated', overhead_allocated,
    'revenue', revenue
  )
  INTO v_result
  FROM public.job_costs
  WHERE job_id = p_job_id;
  
  -- Check for variances
  PERFORM public.check_job_variances(p_job_id);
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.update_job_costs(uuid) IS 'Block 255700: Updates job costs with material, labor, and overhead calculations';

-- ============================================================================
-- PART 12 — FUNCTIONS: Variance Detection
-- ============================================================================

-- Function: Check for material, labor, and scope variances
CREATE OR REPLACE FUNCTION public.check_job_variances(p_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job record;
  v_costs record;
  v_material_record record;
  v_labor_record record;
  v_expected_hours numeric(10,2);
  v_actual_hours numeric(10,2);
  v_variance_amount numeric(12,2);
  v_variance_pct numeric(5,2);
BEGIN
  -- Get job and costs
  SELECT rj.* INTO v_job FROM public.roofing_jobs rj WHERE rj.id = p_job_id;
  SELECT * INTO v_costs FROM public.job_costs WHERE job_id = p_job_id;
  
  IF NOT FOUND OR v_costs IS NULL THEN
    RETURN;
  END IF;
  
  -- Check material variances
  FOR v_material_record IN
    SELECT 
      material_name,
      quantity_expected,
      COALESCE(quantity_actual, quantity, 0) as quantity_actual,
      cost_per_unit
    FROM public.material_usage
    WHERE job_id = p_job_id
      AND quantity_expected IS NOT NULL
  LOOP
    IF v_material_record.quantity_actual > v_material_record.quantity_expected THEN
      v_variance_amount := (v_material_record.quantity_actual - v_material_record.quantity_expected) * COALESCE(v_material_record.cost_per_unit, 0);
      v_variance_pct := ((v_material_record.quantity_actual - v_material_record.quantity_expected) / v_material_record.quantity_expected) * 100;
      
      -- Create alert if variance > 5%
      IF v_variance_pct > 5 THEN
        INSERT INTO public.job_variance_alerts (
          job_id,
          workspace_id,
          alert_type,
          severity,
          message,
          details,
          expected_value,
          actual_value,
          variance_amount,
          variance_percentage
        )
        VALUES (
          p_job_id,
          v_job.workspace_id,
          'material_variance',
          CASE 
            WHEN v_variance_pct > 20 THEN 'critical'
            WHEN v_variance_pct > 10 THEN 'high'
            ELSE 'medium'
          END,
          format('Material over-usage: %s +%.0f units (Cost Impact: $%.2f)', 
            v_material_record.material_name,
            v_material_record.quantity_actual - v_material_record.quantity_expected,
            v_variance_amount),
          jsonb_build_object(
            'material_name', v_material_record.material_name,
            'expected', v_material_record.quantity_expected,
            'actual', v_material_record.quantity_actual,
            'unit_cost', v_material_record.cost_per_unit
          ),
          v_material_record.quantity_expected,
          v_material_record.quantity_actual,
          v_variance_amount,
          v_variance_pct
        )
        ON CONFLICT DO NOTHING; -- Prevent duplicates
      END IF;
    END IF;
  END LOOP;
  
  -- Check labor variance (if expected hours are tracked)
  SELECT 
    COALESCE(SUM(hours_worked), 0)
  INTO v_actual_hours
  FROM public.labor_entries
  WHERE job_id = p_job_id
    AND clock_out IS NOT NULL;
  
  -- For now, we'll check if labor cost is unusually high
  -- This could be enhanced with expected hours from job estimates
  IF v_costs.labor_cost > 0 AND v_costs.materials_cost > 0 THEN
    -- If labor is more than 50% of material cost, flag it
    IF v_costs.labor_cost > (v_costs.materials_cost * 0.5) THEN
      INSERT INTO public.job_variance_alerts (
        job_id,
        workspace_id,
        alert_type,
        severity,
        message,
        details,
        actual_value,
        variance_amount
      )
      VALUES (
        p_job_id,
        v_job.workspace_id,
        'labor_variance',
        'medium',
        format('Labor cost is high: $%.2f (%.1f hours)', v_costs.labor_cost, v_actual_hours),
        jsonb_build_object(
          'labor_cost', v_costs.labor_cost,
          'hours_worked', v_actual_hours,
          'materials_cost', v_costs.materials_cost
        ),
        v_costs.labor_cost,
        v_costs.labor_cost
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  
  -- Check margin
  IF v_costs.margin < 30 AND v_costs.margin >= 0 THEN
    INSERT INTO public.job_variance_alerts (
      job_id,
      workspace_id,
      alert_type,
      severity,
      message,
      details,
      actual_value
    )
    VALUES (
      p_job_id,
      v_job.workspace_id,
      'margin_low',
      CASE 
        WHEN v_costs.margin < 20 THEN 'critical'
        WHEN v_costs.margin < 25 THEN 'high'
        ELSE 'medium'
      END,
      format('Profit margin is low: %.2f%%', v_costs.margin),
      jsonb_build_object(
        'margin', v_costs.margin,
        'profit', v_costs.profit,
        'revenue', v_costs.revenue,
        'total_cost', v_costs.total_cost
      ),
      v_costs.margin
    )
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.check_job_variances(uuid) IS 'Block 255700: Checks for material, labor, and margin variances and creates alerts';

-- ============================================================================
-- PART 13 — FUNCTIONS: Insurance Job Profit Calculator
-- ============================================================================

-- Function: Calculate insurance job profit (ACV/RCV)
CREATE OR REPLACE FUNCTION public.calculate_insurance_job_profit(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job record;
  v_costs record;
  v_acv_paid numeric(12,2) := 0;
  v_depreciation numeric(12,2) := 0;
  v_deductible numeric(12,2) := 0;
  v_supplements numeric(12,2) := 0;
  v_total_paid numeric(12,2) := 0;
  v_result jsonb;
BEGIN
  -- Get job details
  SELECT rj.* INTO v_job FROM public.roofing_jobs rj WHERE rj.id = p_job_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Job not found');
  END IF;
  
  -- Get costs
  SELECT * INTO v_costs FROM public.job_costs WHERE job_id = p_job_id;
  
  IF v_costs IS NULL THEN
    -- Calculate costs if not exists
    PERFORM public.update_job_costs(p_job_id);
    SELECT * INTO v_costs FROM public.job_costs WHERE job_id = p_job_id;
  END IF;
  
  -- For now, use job_value as total paid (this would come from insurance claim data)
  v_total_paid := COALESCE(v_job.job_value, 0);
  -- In a real implementation, these would come from insurance claim records
  v_acv_paid := v_total_paid * 0.6; -- Example: 60% ACV
  v_depreciation := v_total_paid * 0.4; -- Example: 40% depreciation
  v_deductible := 1000; -- Example deductible
  v_supplements := 0;
  
  -- Upsert insurance job profit
  INSERT INTO public.insurance_job_profits (
    job_id,
    workspace_id,
    acv_paid,
    depreciation,
    deductible_collected,
    supplements_approved,
    total_paid,
    materials_cost,
    labor_cost,
    overhead_allocated,
    total_cost
  )
  VALUES (
    p_job_id,
    v_job.workspace_id,
    v_acv_paid,
    v_depreciation,
    v_deductible,
    v_supplements,
    v_total_paid,
    COALESCE(v_costs.materials_cost, 0),
    COALESCE(v_costs.labor_cost, 0),
    COALESCE(v_costs.overhead_allocated, 0),
    COALESCE(v_costs.total_cost, 0)
  )
  ON CONFLICT (job_id) DO UPDATE SET
    workspace_id = EXCLUDED.workspace_id,
    acv_paid = EXCLUDED.acv_paid,
    depreciation = EXCLUDED.depreciation,
    deductible_collected = EXCLUDED.deductible_collected,
    supplements_approved = EXCLUDED.supplements_approved,
    total_paid = EXCLUDED.total_paid,
    materials_cost = EXCLUDED.materials_cost,
    labor_cost = EXCLUDED.labor_cost,
    overhead_allocated = EXCLUDED.overhead_allocated,
    total_cost = EXCLUDED.total_cost,
    updated_at = now();
  
  -- Get calculated values
  SELECT jsonb_build_object(
    'profit', profit,
    'margin', margin,
    'total_paid', total_paid,
    'acv_paid', acv_paid,
    'depreciation', depreciation,
    'deductible_collected', deductible_collected,
    'total_cost', total_cost
  )
  INTO v_result
  FROM public.insurance_job_profits
  WHERE job_id = p_job_id;
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.calculate_insurance_job_profit(uuid) IS 'Block 255700: Calculates insurance job profit with ACV/RCV breakdown';

-- ============================================================================
-- PART 14 — FUNCTIONS: Repair Job Profitability
-- ============================================================================

-- Function: Calculate repair job profit
CREATE OR REPLACE FUNCTION public.calculate_repair_job_profit(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job record;
  v_costs record;
  v_revenue numeric(12,2) := 0;
  v_result jsonb;
BEGIN
  -- Get job details
  SELECT rj.* INTO v_job FROM public.roofing_jobs rj WHERE rj.id = p_job_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Job not found');
  END IF;
  
  -- Only process if job_type is repair
  IF v_job.job_type != 'repair' THEN
    RETURN jsonb_build_object('error', 'Job is not a repair job');
  END IF;
  
  -- Get costs
  SELECT * INTO v_costs FROM public.job_costs WHERE job_id = p_job_id;
  
  IF v_costs IS NULL THEN
    PERFORM public.update_job_costs(p_job_id);
    SELECT * INTO v_costs FROM public.job_costs WHERE job_id = p_job_id;
  END IF;
  
  v_revenue := COALESCE(v_job.job_value, 0);
  
  -- Upsert repair job profit
  INSERT INTO public.repair_job_profits (
    job_id,
    workspace_id,
    revenue,
    materials_cost,
    labor_cost,
    overhead_allocated,
    total_cost
  )
  VALUES (
    p_job_id,
    v_job.workspace_id,
    v_revenue,
    COALESCE(v_costs.materials_cost, 0),
    COALESCE(v_costs.labor_cost, 0),
    COALESCE(v_costs.overhead_allocated, 0),
    COALESCE(v_costs.total_cost, 0)
  )
  ON CONFLICT (job_id) DO UPDATE SET
    workspace_id = EXCLUDED.workspace_id,
    revenue = EXCLUDED.revenue,
    materials_cost = EXCLUDED.materials_cost,
    labor_cost = EXCLUDED.labor_cost,
    overhead_allocated = EXCLUDED.overhead_allocated,
    total_cost = EXCLUDED.total_cost,
    updated_at = now();
  
  -- Get calculated values
  SELECT jsonb_build_object(
    'profit', profit,
    'margin', margin,
    'revenue', revenue,
    'total_cost', total_cost
  )
  INTO v_result
  FROM public.repair_job_profits
  WHERE job_id = p_job_id;
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.calculate_repair_job_profit(uuid) IS 'Block 255700: Calculates repair job profitability';

-- ============================================================================
-- PART 15 — FUNCTIONS: Company-Wide Profit Insights
-- ============================================================================

-- Function: Get company-wide profit insights
CREATE OR REPLACE FUNCTION public.get_company_profit_insights(
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
  v_total_revenue numeric(12,2) := 0;
  v_total_profit numeric(12,2) := 0;
  v_avg_margin numeric(5,2) := 0;
  v_most_profitable_job record;
  v_least_profitable_job record;
  v_top_crew text;
  v_worst_crew text;
  v_avg_labor_hours_per_sq numeric(10,2) := 0;
  v_material_waste_pct numeric(5,2) := 0;
BEGIN
  -- Calculate totals
  SELECT 
    COALESCE(SUM(revenue), 0),
    COALESCE(SUM(profit), 0),
    COALESCE(AVG(margin), 0)
  INTO v_total_revenue, v_total_profit, v_avg_margin
  FROM public.job_costs jc
  JOIN public.roofing_jobs rj ON jc.job_id = rj.id
  WHERE rj.workspace_id = p_workspace_id
    AND (p_start_date IS NULL OR rj.created_at::date >= p_start_date)
    AND (p_end_date IS NULL OR rj.created_at::date <= p_end_date);
  
  -- Most profitable job
  SELECT 
    rj.id,
    rj.title,
    jc.margin,
    jc.profit
  INTO v_most_profitable_job
  FROM public.job_costs jc
  JOIN public.roofing_jobs rj ON jc.job_id = rj.id
  WHERE rj.workspace_id = p_workspace_id
    AND (p_start_date IS NULL OR rj.created_at::date >= p_start_date)
    AND (p_end_date IS NULL OR rj.created_at::date <= p_end_date)
    AND jc.margin IS NOT NULL
  ORDER BY jc.margin DESC
  LIMIT 1;
  
  -- Least profitable job
  SELECT 
    rj.id,
    rj.title,
    jc.margin,
    jc.profit
  INTO v_least_profitable_job
  FROM public.job_costs jc
  JOIN public.roofing_jobs rj ON jc.job_id = rj.id
  WHERE rj.workspace_id = p_workspace_id
    AND (p_start_date IS NULL OR rj.created_at::date >= p_start_date)
    AND (p_end_date IS NULL OR rj.created_at::date <= p_end_date)
    AND jc.margin IS NOT NULL
  ORDER BY jc.margin ASC
  LIMIT 1;
  
  -- Build result
  v_result := jsonb_build_object(
    'total_revenue', v_total_revenue,
    'total_profit', v_total_profit,
    'average_margin', ROUND(v_avg_margin, 2),
    'most_profitable_job', jsonb_build_object(
      'job_id', v_most_profitable_job.id,
      'title', v_most_profitable_job.title,
      'margin', v_most_profitable_job.margin,
      'profit', v_most_profitable_job.profit
    ),
    'least_profitable_job', jsonb_build_object(
      'job_id', v_least_profitable_job.id,
      'title', v_least_profitable_job.title,
      'margin', v_least_profitable_job.margin,
      'profit', v_least_profitable_job.profit
    ),
    'average_labor_hours_per_square', v_avg_labor_hours_per_sq,
    'material_waste_percentage', v_material_waste_pct
  );
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_company_profit_insights(uuid, date, date) IS 'Block 255700: Returns company-wide profit insights and metrics';

-- ============================================================================
-- PART 16 — TRIGGERS: Auto-update job costs
-- ============================================================================

-- Trigger function to recalculate job costs
CREATE OR REPLACE FUNCTION public.trigger_update_job_costs()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.update_job_costs(COALESCE(NEW.job_id, OLD.job_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Trigger on material_usage changes
DROP TRIGGER IF EXISTS trg_update_costs_on_material_usage ON public.material_usage;
CREATE TRIGGER trg_update_costs_on_material_usage
AFTER INSERT OR UPDATE OR DELETE ON public.material_usage
FOR EACH ROW
EXECUTE FUNCTION public.trigger_update_job_costs();

-- Trigger on labor_entries changes
DROP TRIGGER IF EXISTS trg_update_costs_on_labor_entries ON public.labor_entries;
CREATE TRIGGER trg_update_costs_on_labor_entries
AFTER INSERT OR UPDATE OR DELETE ON public.labor_entries
FOR EACH ROW
EXECUTE FUNCTION public.trigger_update_job_costs();

-- Trigger on roofing_jobs job_value changes
DROP TRIGGER IF EXISTS trg_update_costs_on_job_value ON public.roofing_jobs;
CREATE TRIGGER trg_update_costs_on_job_value
AFTER UPDATE OF job_value ON public.roofing_jobs
FOR EACH ROW
WHEN (OLD.job_value IS DISTINCT FROM NEW.job_value)
EXECUTE FUNCTION public.trigger_update_job_costs();

-- ============================================================================
-- PART 20 — SYNC crew_time_logs TO labor_entries
-- ============================================================================
-- Sync existing crew_time_logs to labor_entries for Block 255700 integration

-- Function: Sync crew_time_logs to labor_entries
CREATE OR REPLACE FUNCTION public.sync_crew_time_to_labor_entries()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_job record;
  v_crew_member_id uuid;
  v_hourly_rate numeric(10,2) := 0;
BEGIN
  -- Get job workspace
  SELECT rj.workspace_id INTO v_job
  FROM public.roofing_jobs rj
  WHERE rj.id = NEW.job_id;
  
  -- Get crew member ID from user_id
  SELECT id INTO v_crew_member_id
  FROM public.crew_members
  WHERE user_id = NEW.user_id
    AND is_active = true
  LIMIT 1;
  
  -- Get hourly rate (default or from crew member settings)
  -- This could be enhanced to get from crew_members table if rate is stored there
  v_hourly_rate := 50.00; -- Default rate, should be configurable
  
  -- Only sync when clock_out is set (completed entry)
  IF NEW.clock_out_at IS NOT NULL AND (OLD.clock_out_at IS NULL OR OLD.clock_out_at IS DISTINCT FROM NEW.clock_out_at) THEN
    -- Insert or update labor entry
    INSERT INTO public.labor_entries (
      job_id,
      crew_member_id,
      workspace_id,
      clock_in,
      clock_out,
      hourly_rate
    )
    VALUES (
      NEW.job_id,
      v_crew_member_id,
      v_job.workspace_id,
      NEW.clock_in_at,
      NEW.clock_out_at,
      v_hourly_rate
    )
    ON CONFLICT DO NOTHING; -- Prevent duplicates
    
    -- Trigger job cost update
    PERFORM public.update_job_costs(NEW.job_id);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger to sync crew_time_logs to labor_entries
-- Only if crew_time_logs table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'crew_time_logs'
  ) THEN
    DROP TRIGGER IF EXISTS trg_sync_crew_time_to_labor ON public.crew_time_logs;
    CREATE TRIGGER trg_sync_crew_time_to_labor
    AFTER INSERT OR UPDATE ON public.crew_time_logs
    FOR EACH ROW
    WHEN (NEW.clock_out_at IS NOT NULL)
    EXECUTE FUNCTION public.sync_crew_time_to_labor_entries();
  END IF;
END $$;

COMMENT ON FUNCTION public.sync_crew_time_to_labor_entries() IS 'Block 255700: Syncs crew_time_logs to labor_entries for job costing';

-- ============================================================================
-- PART 17 — TRIGGERS: Update timestamps
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_job_costs_updated_at ON public.job_costs;
CREATE TRIGGER trg_job_costs_updated_at
BEFORE UPDATE ON public.job_costs
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_labor_entries_updated_at ON public.labor_entries;
CREATE TRIGGER trg_labor_entries_updated_at
BEFORE UPDATE ON public.labor_entries
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_overhead_settings_updated_at ON public.overhead_allocation_settings;
CREATE TRIGGER trg_overhead_settings_updated_at
BEFORE UPDATE ON public.overhead_allocation_settings
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_insurance_job_profits_updated_at ON public.insurance_job_profits;
CREATE TRIGGER trg_insurance_job_profits_updated_at
BEFORE UPDATE ON public.insurance_job_profits
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_repair_job_profits_updated_at ON public.repair_job_profits;
CREATE TRIGGER trg_repair_job_profits_updated_at
BEFORE UPDATE ON public.repair_job_profits
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- PART 18 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.job_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labor_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.overhead_allocation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_variance_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_job_profits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repair_job_profits ENABLE ROW LEVEL SECURITY;

-- Job costs: Workspace members can access
CREATE POLICY "job_costs_workspace_member" ON public.job_costs
  FOR ALL USING (
    workspace_id IS NOT NULL AND EXISTS(
      SELECT 1 FROM public.workspace_members 
      WHERE workspace_id = job_costs.workspace_id AND user_id = auth.uid()
    )
  );

-- Labor entries: Workspace members can access
CREATE POLICY "labor_entries_workspace_member" ON public.labor_entries
  FOR ALL USING (
    workspace_id IS NOT NULL AND EXISTS(
      SELECT 1 FROM public.workspace_members 
      WHERE workspace_id = labor_entries.workspace_id AND user_id = auth.uid()
    )
  );

-- Overhead settings: Workspace members can view, owners/admins can modify
CREATE POLICY "overhead_settings_view" ON public.overhead_allocation_settings
  FOR SELECT USING (
    workspace_id IS NOT NULL AND EXISTS(
      SELECT 1 FROM public.workspace_members 
      WHERE workspace_id = overhead_allocation_settings.workspace_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "overhead_settings_modify" ON public.overhead_allocation_settings
  FOR ALL USING (
    workspace_id IS NOT NULL AND EXISTS(
      SELECT 1 FROM public.workspace_members 
      WHERE workspace_id = overhead_allocation_settings.workspace_id 
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin', 'manager')
    )
  );

-- Variance alerts: Workspace members can access
CREATE POLICY "variance_alerts_workspace_member" ON public.job_variance_alerts
  FOR ALL USING (
    workspace_id IS NOT NULL AND EXISTS(
      SELECT 1 FROM public.workspace_members 
      WHERE workspace_id = job_variance_alerts.workspace_id AND user_id = auth.uid()
    )
  );

-- Insurance job profits: Workspace members can access
CREATE POLICY "insurance_job_profits_workspace_member" ON public.insurance_job_profits
  FOR ALL USING (
    workspace_id IS NOT NULL AND EXISTS(
      SELECT 1 FROM public.workspace_members 
      WHERE workspace_id = insurance_job_profits.workspace_id AND user_id = auth.uid()
    )
  );

-- Repair job profits: Workspace members can access
CREATE POLICY "repair_job_profits_workspace_member" ON public.repair_job_profits
  FOR ALL USING (
    workspace_id IS NOT NULL AND EXISTS(
      SELECT 1 FROM public.workspace_members 
      WHERE workspace_id = repair_job_profits.workspace_id AND user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 19 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_costs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.labor_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.overhead_allocation_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_variance_alerts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insurance_job_profits TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.repair_job_profits TO authenticated;

GRANT EXECUTE ON FUNCTION public.calculate_material_cost(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_labor_cost(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_overhead_allocation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_job_costs(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_job_variances(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_insurance_job_profit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_repair_job_profit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_company_profit_insights(uuid, date, date) TO authenticated;





















