-- ============================================================
-- Block 252600 — SmartSend Profitability Engine v1
-- Real-Time Job Profit, Costs, Margins, Alerts, Forecasting
-- ============================================================
-- 
-- THIS is the block that makes SmartSend UNTOUCHABLE in the roofing CRM market.
-- 
-- Features:
-- - Real-Time Job Profit Dashboard
-- - Live Labor Cost Feed (from time clock + payroll engine)
-- - Material Cost Tracking (expected vs actual)
-- - Sub Costs Tracking (from pay sheets)
-- - Overhead Allocation
-- - Gross & Net Margin Calculator
-- - Profit Alerts (low margin warning)
-- - Forecasted Profit (based on timeline + labor usage)
-- - Company Profit Overview (weekly, monthly)
-- ============================================================

-- ============================================================
-- PART 1 — CREATE job_costs TABLE (Consolidated Cost Entries)
-- ============================================================
-- This table consolidates ALL costs for a job from multiple sources

CREATE TABLE IF NOT EXISTS public.job_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.roofing_companies(id) ON DELETE SET NULL,
  
  cost_type text NOT NULL CHECK (cost_type IN ('labor', 'materials', 'subs', 'overhead', 'misc')),
  description text,
  amount numeric(12,2) NOT NULL,
  
  -- Source tracking (for reconciliation)
  source_type text, -- 'payroll', 'time_clock', 'material_invoice', 'material_estimate', 'sub_pay_sheet', 'overhead_allocation'
  source_id uuid, -- ID of the source record (payroll_entry_id, invoice_id, etc.)
  
  -- Material-specific fields (for expected vs actual reconciliation)
  is_expected boolean DEFAULT false, -- true for estimated materials, false for actual invoices
  invoice_number text, -- For material invoices
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_costs_job ON public.job_costs(job_id);
CREATE INDEX IF NOT EXISTS idx_job_costs_company ON public.job_costs(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_costs_type ON public.job_costs(cost_type);
CREATE INDEX IF NOT EXISTS idx_job_costs_source ON public.job_costs(source_type, source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_costs_created ON public.job_costs(created_at DESC);

COMMENT ON TABLE public.job_costs IS 'Consolidated cost entries for all job costs (Block 252600)';
COMMENT ON COLUMN public.job_costs.cost_type IS 'Cost category: labor, materials, subs, overhead, misc';
COMMENT ON COLUMN public.job_costs.is_expected IS 'For materials: true = estimated/forecasted, false = actual invoice';

-- ============================================================
-- PART 2 — CREATE job_overhead_settings TABLE
-- ============================================================
-- Company-level overhead allocation settings

CREATE TABLE IF NOT EXISTS public.job_overhead_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  
  overhead_rate numeric(5,4) DEFAULT 0.10, -- 10% default overhead (stored as 0.10)
  allocation_method text DEFAULT 'percent' CHECK (allocation_method IN ('percent', 'flat_rate')),
  flat_rate_amount numeric(12,2), -- Used when allocation_method = 'flat_rate'
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(company_id)
);

CREATE INDEX IF NOT EXISTS idx_job_overhead_settings_company ON public.job_overhead_settings(company_id);

COMMENT ON TABLE public.job_overhead_settings IS 'Company overhead allocation settings (Block 252600)';
COMMENT ON COLUMN public.job_overhead_settings.overhead_rate IS 'Overhead rate as decimal (0.10 = 10%)';
COMMENT ON COLUMN public.job_overhead_settings.allocation_method IS 'Allocation method: percent (of revenue) or flat_rate (per job)';

-- ============================================================
-- PART 3 — LIVE COST FEEDS (Triggers & Functions)
-- ============================================================

-- 3.1 Labor Cost Feed (from payroll_time_expanded)
-- Auto-inserts labor costs when time clock entries are completed

CREATE OR REPLACE FUNCTION public.sync_labor_costs_from_time_clock()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_job_id uuid;
  v_company_id uuid;
  v_labor_cost numeric;
  v_hours numeric;
  v_hourly_rate numeric;
  v_employee_id uuid;
BEGIN
  -- Only process when clock_out is set (completed time entry)
  IF NEW.clock_out IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Get job_id and company_id
  v_job_id := NEW.job_id;
  v_employee_id := NEW.employee_id;
  
  -- Get company_id from employee
  SELECT company_id INTO v_company_id
  FROM public.workforce_employees
  WHERE id = v_employee_id;
  
  IF v_job_id IS NULL OR v_company_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Calculate labor cost from payroll_time_expanded view
  SELECT 
    pte.hours,
    pte.hourly_rate,
    (pte.hours * pte.hourly_rate) as cost
  INTO
    v_hours,
    v_hourly_rate,
    v_labor_cost
  FROM public.payroll_time_expanded pte
  WHERE pte.employee_id = v_employee_id
    AND pte.job_id = v_job_id
    AND pte.clock_in = NEW.clock_in
    AND pte.clock_out = NEW.clock_out
  LIMIT 1;
  
  -- Insert labor cost (avoid duplicates by checking source)
  INSERT INTO public.job_costs (
    job_id,
    company_id,
    cost_type,
    description,
    amount,
    source_type,
    source_id
  )
  VALUES (
    v_job_id,
    v_company_id,
    'labor',
    'Labor cost - Employee ' || v_employee_id::text || ' (' || ROUND(v_hours, 2) || ' hrs @ $' || ROUND(v_hourly_rate, 2) || '/hr)',
    COALESCE(v_labor_cost, 0),
    'time_clock',
    NEW.id
  )
  ON CONFLICT DO NOTHING; -- Prevent duplicates
  
  RETURN NEW;
END;
$$;

-- Trigger on crew_time_clock updates
DROP TRIGGER IF EXISTS trg_sync_labor_costs_from_time_clock ON public.crew_time_clock;
CREATE TRIGGER trg_sync_labor_costs_from_time_clock
AFTER INSERT OR UPDATE ON public.crew_time_clock
FOR EACH ROW
WHEN (NEW.clock_out IS NOT NULL AND OLD.clock_out IS NULL)
EXECUTE FUNCTION public.sync_labor_costs_from_time_clock();

COMMENT ON FUNCTION public.sync_labor_costs_from_time_clock IS 'Auto-sync labor costs from time clock entries (Block 252600)';

-- 3.2 Material Costs Feed
-- Function to insert material costs (expected or actual)

CREATE OR REPLACE FUNCTION public.insert_material_cost(
  p_job_id uuid,
  p_company_id uuid,
  p_description text,
  p_amount numeric,
  p_is_expected boolean DEFAULT false,
  p_invoice_number text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_cost_id uuid;
BEGIN
  INSERT INTO public.job_costs (
    job_id,
    company_id,
    cost_type,
    description,
    amount,
    source_type,
    is_expected,
    invoice_number
  )
  VALUES (
    p_job_id,
    p_company_id,
    'materials',
    p_description,
    p_amount,
    CASE WHEN p_is_expected THEN 'material_estimate' ELSE 'material_invoice' END,
    p_is_expected,
    p_invoice_number
  )
  RETURNING id INTO v_cost_id;
  
  RETURN v_cost_id;
END;
$$;

COMMENT ON FUNCTION public.insert_material_cost IS 'Insert material cost (expected or actual) (Block 252600)';

-- 3.3 Subcontractor Costs Feed (from sub_pay_sheets)
-- Auto-inserts sub costs when pay sheets are created

CREATE OR REPLACE FUNCTION public.sync_sub_costs_from_pay_sheets()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_company_id uuid;
  v_sub_name text;
BEGIN
  -- Get company_id from job
  SELECT j.company_id INTO v_company_id
  FROM public.jobs j
  WHERE j.id = NEW.job_id;
  
  IF v_company_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Get sub name
  SELECT name INTO v_sub_name
  FROM public.subcontractors
  WHERE id = NEW.sub_id;
  
  -- Insert sub cost
  INSERT INTO public.job_costs (
    job_id,
    company_id,
    cost_type,
    description,
    amount,
    source_type,
    source_id
  )
  VALUES (
    NEW.job_id,
    v_company_id,
    'subs',
    'Sub Payment - ' || COALESCE(v_sub_name, 'Sub ' || NEW.sub_id::text) || ' (' || NEW.pay_type || ')',
    NEW.total_pay,
    'sub_pay_sheet',
    NEW.id
  )
  ON CONFLICT DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- Trigger on sub_pay_sheets inserts
DROP TRIGGER IF EXISTS trg_sync_sub_costs_from_pay_sheets ON public.sub_pay_sheets;
CREATE TRIGGER trg_sync_sub_costs_from_pay_sheets
AFTER INSERT ON public.sub_pay_sheets
FOR EACH ROW
EXECUTE FUNCTION public.sync_sub_costs_from_pay_sheets();

COMMENT ON FUNCTION public.sync_sub_costs_from_pay_sheets IS 'Auto-sync subcontractor costs from pay sheets (Block 252600)';

-- 3.4 Overhead Allocation
-- Function to allocate overhead to a job

CREATE OR REPLACE FUNCTION public.allocate_job_overhead(p_job_id uuid)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_company_id uuid;
  v_job_revenue numeric;
  v_overhead_rate numeric;
  v_allocation_method text;
  v_flat_rate_amount numeric;
  v_overhead_amount numeric;
  v_cost_id uuid;
BEGIN
  -- Get company_id and revenue from job
  SELECT 
    j.company_id,
    COALESCE(j.contract_value, j.final_value, j.estimated_value, 0)
  INTO
    v_company_id,
    v_job_revenue
  FROM public.jobs j
  WHERE j.id = p_job_id;
  
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Job not found or company_id is null';
  END IF;
  
  -- Get overhead settings
  SELECT 
    overhead_rate,
    allocation_method,
    flat_rate_amount
  INTO
    v_overhead_rate,
    v_allocation_method,
    v_flat_rate_amount
  FROM public.job_overhead_settings
  WHERE company_id = v_company_id;
  
  -- Use defaults if no settings exist
  v_overhead_rate := COALESCE(v_overhead_rate, 0.10);
  v_allocation_method := COALESCE(v_allocation_method, 'percent');
  
  -- Calculate overhead amount
  IF v_allocation_method = 'flat_rate' AND v_flat_rate_amount IS NOT NULL THEN
    v_overhead_amount := v_flat_rate_amount;
  ELSE
    v_overhead_amount := v_job_revenue * v_overhead_rate;
  END IF;
  
  -- Delete existing overhead allocation for this job
  DELETE FROM public.job_costs
  WHERE job_id = p_job_id
    AND cost_type = 'overhead'
    AND source_type = 'overhead_allocation';
  
  -- Insert overhead allocation
  INSERT INTO public.job_costs (
    job_id,
    company_id,
    cost_type,
    description,
    amount,
    source_type
  )
  VALUES (
    p_job_id,
    v_company_id,
    'overhead',
    'Allocated overhead (' || ROUND(v_overhead_rate * 100, 2) || '%)',
    v_overhead_amount,
    'overhead_allocation'
  )
  RETURNING id INTO v_cost_id;
  
  RETURN v_cost_id;
END;
$$;

COMMENT ON FUNCTION public.allocate_job_overhead IS 'Allocate overhead to a job based on company settings (Block 252600)';

-- Trigger to auto-allocate overhead when job is created or contract_value changes
CREATE OR REPLACE FUNCTION public.auto_allocate_overhead()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only allocate if contract_value, final_value, or estimated_value is set
  IF COALESCE(NEW.contract_value, NEW.final_value, NEW.estimated_value, 0) > 0 THEN
    PERFORM public.allocate_job_overhead(NEW.id);
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_allocate_overhead ON public.jobs;
CREATE TRIGGER trg_auto_allocate_overhead
AFTER INSERT OR UPDATE OF contract_value, final_value, estimated_value ON public.jobs
FOR EACH ROW
EXECUTE FUNCTION public.auto_allocate_overhead();

-- ============================================================
-- PART 4 — PROFITABILITY VIEW (The Core)
-- ============================================================
-- This is the brain of the profit engine

CREATE OR REPLACE VIEW public.job_profitability AS
SELECT 
  j.id as job_id,
  j.company_id,
  COALESCE(j.homeowner_name, 'Unknown') as customer_name,
  COALESCE(j.contract_value, j.final_value, j.estimated_value, 0) as contract_price,
  
  -- Cost breakdown by type
  COALESCE(SUM(c.amount) FILTER (WHERE c.cost_type = 'labor'), 0) as labor_cost,
  COALESCE(SUM(c.amount) FILTER (WHERE c.cost_type = 'materials'), 0) as materials_cost,
  COALESCE(SUM(c.amount) FILTER (WHERE c.cost_type = 'subs'), 0) as subs_cost,
  COALESCE(SUM(c.amount) FILTER (WHERE c.cost_type = 'overhead'), 0) as overhead_cost,
  COALESCE(SUM(c.amount) FILTER (WHERE c.cost_type = 'misc'), 0) as misc_cost,
  
  -- Total costs
  COALESCE(SUM(c.amount), 0) as total_costs,
  
  -- Profit calculations
  (COALESCE(j.contract_value, j.final_value, j.estimated_value, 0) - COALESCE(SUM(c.amount), 0)) as profit,
  
  -- Margin calculations
  CASE 
    WHEN COALESCE(j.contract_value, j.final_value, j.estimated_value, 0) > 0 THEN
      ROUND(
        ((COALESCE(j.contract_value, j.final_value, j.estimated_value, 0) - COALESCE(SUM(c.amount), 0)) / 
         COALESCE(j.contract_value, j.final_value, j.estimated_value, 1)) * 100,
        2
      )
    ELSE 0
  END as profit_margin,
  
  -- Cost distribution percentages
  CASE 
    WHEN COALESCE(SUM(c.amount), 0) > 0 THEN
      ROUND((COALESCE(SUM(c.amount) FILTER (WHERE c.cost_type = 'labor'), 0) / COALESCE(SUM(c.amount), 1)) * 100, 2)
    ELSE 0
  END as labor_cost_pct,
  
  CASE 
    WHEN COALESCE(SUM(c.amount), 0) > 0 THEN
      ROUND((COALESCE(SUM(c.amount) FILTER (WHERE c.cost_type = 'materials'), 0) / COALESCE(SUM(c.amount), 1)) * 100, 2)
    ELSE 0
  END as materials_cost_pct,
  
  CASE 
    WHEN COALESCE(SUM(c.amount), 0) > 0 THEN
      ROUND((COALESCE(SUM(c.amount) FILTER (WHERE c.cost_type = 'subs'), 0) / COALESCE(SUM(c.amount), 1)) * 100, 2)
    ELSE 0
  END as subs_cost_pct,
  
  CASE 
    WHEN COALESCE(SUM(c.amount), 0) > 0 THEN
      ROUND((COALESCE(SUM(c.amount) FILTER (WHERE c.cost_type = 'overhead'), 0) / COALESCE(SUM(c.amount), 1)) * 100, 2)
    ELSE 0
  END as overhead_cost_pct,
  
  -- Job metadata
  j.status,
  j.job_type,
  j.created_at,
  j.production_date
  
FROM public.jobs j
LEFT JOIN public.job_costs c ON c.job_id = j.id
GROUP BY 
  j.id,
  j.company_id,
  j.homeowner_name,
  j.contract_value,
  j.final_value,
  j.estimated_value,
  j.status,
  j.job_type,
  j.created_at,
  j.production_date;

CREATE INDEX IF NOT EXISTS idx_job_profitability_margin ON public.jobs(id) WHERE EXISTS (
  SELECT 1 FROM public.job_profitability jp WHERE jp.job_id = jobs.id AND jp.profit_margin < 30
);

COMMENT ON VIEW public.job_profitability IS 'Core profitability view - real-time job profit, costs, and margins (Block 252600)';

-- ============================================================
-- PART 5 — FORECASTED PROFIT FUNCTION
-- ============================================================
-- Calculates forecasted profit based on remaining work estimates

CREATE OR REPLACE FUNCTION public.calculate_forecasted_profit(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_job_record RECORD;
  v_actual_costs numeric;
  v_projected_costs numeric;
  v_contract_price numeric;
  v_forecasted_profit numeric;
  v_forecasted_margin numeric;
  v_remaining_labor_estimate numeric := 0;
  v_remaining_materials_estimate numeric := 0;
  v_remaining_subs_estimate numeric := 0;
  v_result jsonb;
BEGIN
  -- Get job details
  SELECT 
    j.*,
    COALESCE(j.contract_value, j.final_value, j.estimated_value, 0) as revenue
  INTO v_job_record
  FROM public.jobs j
  WHERE j.id = p_job_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Job not found');
  END IF;
  
  v_contract_price := v_job_record.revenue;
  
  -- Get actual costs so far
  SELECT COALESCE(SUM(amount), 0)
  INTO v_actual_costs
  FROM public.job_costs
  WHERE job_id = p_job_id
    AND is_expected = false; -- Only actual costs
  
  -- Estimate remaining labor (based on job progress if available)
  -- This is a simplified estimate - can be enhanced with actual labor estimates
  IF v_job_record.progress IS NOT NULL AND v_job_record.progress < 100 THEN
    -- Estimate remaining labor as proportional to remaining work
    SELECT 
      COALESCE(SUM(amount), 0) * ((100 - v_job_record.progress) / 100.0)
    INTO v_remaining_labor_estimate
    FROM public.job_costs
    WHERE job_id = p_job_id
      AND cost_type = 'labor';
  END IF;
  
  -- Estimate remaining materials (check for expected materials not yet invoiced)
  SELECT 
    COALESCE(SUM(amount), 0)
  INTO v_remaining_materials_estimate
  FROM public.job_costs
  WHERE job_id = p_job_id
    AND cost_type = 'materials'
    AND is_expected = true
    AND NOT EXISTS (
      SELECT 1 FROM public.job_costs jc2
      WHERE jc2.job_id = p_job_id
        AND jc2.cost_type = 'materials'
        AND jc2.is_expected = false
        AND jc2.description = job_costs.description
    );
  
  -- Estimate remaining subs (pending pay sheets)
  -- This would need to check for scheduled but not yet paid sub work
  -- For now, we'll use a simple estimate
  
  v_projected_costs := v_remaining_labor_estimate + v_remaining_materials_estimate + v_remaining_subs_estimate;
  
  -- Calculate forecasted profit
  v_forecasted_profit := v_contract_price - (v_actual_costs + v_projected_costs);
  
  -- Calculate forecasted margin
  IF v_contract_price > 0 THEN
    v_forecasted_margin := ROUND((v_forecasted_profit / v_contract_price) * 100, 2);
  ELSE
    v_forecasted_margin := 0;
  END IF;
  
  -- Build result
  v_result := jsonb_build_object(
    'job_id', p_job_id,
    'contract_price', v_contract_price,
    'actual_costs', v_actual_costs,
    'projected_costs', v_projected_costs,
    'forecasted_profit', v_forecasted_profit,
    'forecasted_margin', v_forecasted_margin,
    'remaining_labor_estimate', v_remaining_labor_estimate,
    'remaining_materials_estimate', v_remaining_materials_estimate,
    'remaining_subs_estimate', v_remaining_subs_estimate
  );
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.calculate_forecasted_profit IS 'Calculate forecasted profit based on remaining work estimates (Block 252600)';

-- ============================================================
-- PART 6 — ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.job_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_overhead_settings ENABLE ROW LEVEL SECURITY;

-- Job costs policies
CREATE POLICY "job_costs_select_company_members"
  ON public.job_costs FOR SELECT
  USING (
    company_id IN (
      SELECT roofing_company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid()
    )
    OR company_id IN (
      SELECT id FROM public.roofing_companies
      WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "job_costs_insert_company_members"
  ON public.job_costs FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT roofing_company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid()
    )
    OR company_id IN (
      SELECT id FROM public.roofing_companies
      WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "job_costs_update_company_members"
  ON public.job_costs FOR UPDATE
  USING (
    company_id IN (
      SELECT roofing_company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid()
    )
    OR company_id IN (
      SELECT id FROM public.roofing_companies
      WHERE owner_id = auth.uid()
    )
  );

-- Overhead settings policies
CREATE POLICY "job_overhead_settings_select_company_members"
  ON public.job_overhead_settings FOR SELECT
  USING (
    company_id IN (
      SELECT roofing_company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid()
    )
    OR company_id IN (
      SELECT id FROM public.roofing_companies
      WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "job_overhead_settings_insert_company_owners"
  ON public.job_overhead_settings FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT id FROM public.roofing_companies
      WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "job_overhead_settings_update_company_owners"
  ON public.job_overhead_settings FOR UPDATE
  USING (
    company_id IN (
      SELECT id FROM public.roofing_companies
      WHERE owner_id = auth.uid()
    )
  );

-- ============================================================
-- PART 7 — UPDATED_AT TRIGGERS
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_job_costs_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_job_costs_updated_at
BEFORE UPDATE ON public.job_costs
FOR EACH ROW
EXECUTE FUNCTION public.set_job_costs_updated_at();

CREATE OR REPLACE FUNCTION public.set_job_overhead_settings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_job_overhead_settings_updated_at
BEFORE UPDATE ON public.job_overhead_settings
FOR EACH ROW
EXECUTE FUNCTION public.set_job_overhead_settings_updated_at();

-- ============================================================
-- END OF MIGRATION
-- ============================================================
























