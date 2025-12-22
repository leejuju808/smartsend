-- ============================================================
-- Block 254200 — SmartSend Financial Intelligence Engine v1
-- (Job Profit Brain, Real-Time Cost Overruns, Cashflow Predictions, Overhead Tracking)
-- ============================================================
-- 
-- This block turns SmartSend into the financial control center of the roofing company.
-- This is where owners stop guessing and start KNOWING:
-- - which jobs are profitable
-- - which jobs are losing money
-- - when cashflow will get tight
-- - how overhead affects margins
-- - where cost overruns are happening
-- - how much they TRULY make per job
-- - how to price better
-- - how to schedule jobs to protect cashflow
--
-- ============================================================
-- PART 1 — CREATE job_financials TABLE
-- ============================================================
-- Consolidated financial view for each job (real-time profit brain)

CREATE TABLE IF NOT EXISTS public.job_financials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.roofing_companies(id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  
  -- Revenue
  contract_price numeric(12,2) DEFAULT 0,
  
  -- Cost breakdown
  estimated_cost numeric(12,2) DEFAULT 0,
  actual_cost numeric(12,2) DEFAULT 0,
  material_cost numeric(12,2) DEFAULT 0,
  labor_cost numeric(12,2) DEFAULT 0,
  sub_cost numeric(12,2) DEFAULT 0,
  overhead_allocated numeric(12,2) DEFAULT 0,
  
  -- Profit calculations
  gross_profit numeric(12,2) GENERATED ALWAYS AS (
    contract_price - actual_cost
  ) STORED,
  
  margin numeric(5,2) GENERATED ALWAYS AS (
    CASE 
      WHEN contract_price > 0 THEN
        ROUND(((contract_price - actual_cost) / contract_price) * 100, 2)
      ELSE 0
    END
  ) STORED,
  
  -- Variance tracking
  cost_variance numeric(12,2) GENERATED ALWAYS AS (
    actual_cost - estimated_cost
  ) STORED,
  
  variance_percentage numeric(5,2) GENERATED ALWAYS AS (
    CASE 
      WHEN estimated_cost > 0 THEN
        ROUND(((actual_cost - estimated_cost) / estimated_cost) * 100, 2)
      ELSE 0
    END
  ) STORED,
  
  -- Timestamps
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  
  UNIQUE(job_id)
);

CREATE INDEX IF NOT EXISTS idx_job_financials_job ON public.job_financials(job_id);
CREATE INDEX IF NOT EXISTS idx_job_financials_company ON public.job_financials(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_financials_workspace ON public.job_financials(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_financials_margin ON public.job_financials(margin) WHERE margin < 25;
CREATE INDEX IF NOT EXISTS idx_job_financials_updated ON public.job_financials(updated_at DESC);

COMMENT ON TABLE public.job_financials IS 'Block 254200: Real-time job profitability tracking';
COMMENT ON COLUMN public.job_financials.margin IS 'Profit margin as percentage (e.g., 34.2 for 34.2%)';

-- ============================================================
-- PART 2 — CREATE cashflow_events TABLE
-- ============================================================
-- Tracks all cashflow events (inflows and outflows)

CREATE TABLE IF NOT EXISTS public.cashflow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.roofing_companies(id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  
  event_type text NOT NULL CHECK (event_type IN (
    'deposit',
    'invoice',
    'payment',
    'material_purchase',
    'subcontractor_payment',
    'labor_payment',
    'overhead_payment',
    'other_expense',
    'other_income'
  )),
  
  amount numeric(12,2) NOT NULL,
  date date NOT NULL,
  
  -- Event details
  description text,
  reference_number text, -- Invoice number, PO number, etc.
  supplier_id uuid, -- For material purchases
  subcontractor_id uuid, -- For sub payments
  crew_id uuid, -- For labor payments
  
  -- Status
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cashflow_events_job ON public.cashflow_events(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cashflow_events_company ON public.cashflow_events(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cashflow_events_workspace ON public.cashflow_events(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cashflow_events_date ON public.cashflow_events(date);
CREATE INDEX IF NOT EXISTS idx_cashflow_events_type ON public.cashflow_events(event_type);
CREATE INDEX IF NOT EXISTS idx_cashflow_events_status ON public.cashflow_events(status);

COMMENT ON TABLE public.cashflow_events IS 'Block 254200: Cashflow events for forecasting';

-- ============================================================
-- PART 3 — CREATE cost_overruns TABLE (Enhanced)
-- ============================================================
-- Tracks cost overruns with detailed variance analysis

CREATE TABLE IF NOT EXISTS public.cost_overruns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.roofing_companies(id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  
  category text NOT NULL CHECK (category IN ('labor', 'material', 'subs', 'overhead', 'other')),
  
  expected numeric(12,2) NOT NULL,
  actual numeric(12,2) NOT NULL,
  variance numeric(12,2) GENERATED ALWAYS AS (
    actual - expected
  ) STORED,
  
  variance_percentage numeric(5,2) GENERATED ALWAYS AS (
    CASE 
      WHEN expected > 0 THEN
        ROUND(((actual - expected) / expected) * 100, 2)
      ELSE 0
    END
  ) STORED,
  
  -- Alert status
  alert_sent boolean DEFAULT false,
  acknowledged boolean DEFAULT false,
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Details
  notes text,
  
  -- Timestamps
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cost_overruns_job ON public.cost_overruns(job_id);
CREATE INDEX IF NOT EXISTS idx_cost_overruns_company ON public.cost_overruns(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cost_overruns_workspace ON public.cost_overruns(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cost_overruns_category ON public.cost_overruns(category);
CREATE INDEX IF NOT EXISTS idx_cost_overruns_unacknowledged ON public.cost_overruns(workspace_id, acknowledged) WHERE acknowledged = false;

COMMENT ON TABLE public.cost_overruns IS 'Block 254200: Cost overrun tracking with variance analysis';

-- ============================================================
-- PART 4 — CREATE overhead_settings TABLE (Enhanced)
-- ============================================================
-- Company-level overhead allocation settings

CREATE TABLE IF NOT EXISTS public.overhead_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  
  monthly_overhead numeric(12,2) DEFAULT 0,
  
  allocation_method text DEFAULT 'percentage' CHECK (allocation_method IN (
    'percentage', -- Percentage of revenue
    'per_job',    -- Flat amount per job
    'per_labor_hour' -- Per labor hour (manufacturing-style)
  )),
  
  percentage_rate numeric(5,4) DEFAULT 0.10, -- 10% default (stored as 0.10)
  per_job_amount numeric(12,2), -- Used when allocation_method = 'per_job'
  per_labor_hour_rate numeric(10,2), -- Used when allocation_method = 'per_labor_hour'
  
  -- Timestamps
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  
  UNIQUE(company_id)
);

CREATE INDEX IF NOT EXISTS idx_overhead_settings_company ON public.overhead_settings(company_id);

COMMENT ON TABLE public.overhead_settings IS 'Block 254200: Overhead allocation settings per company';
COMMENT ON COLUMN public.overhead_settings.allocation_method IS 'Method: percentage (of revenue), per_job (flat), or per_labor_hour';

-- ============================================================
-- PART 5 — REAL-TIME JOB PROFIT CALCULATION FUNCTION
-- ============================================================
-- Updates job_financials with real-time profit data

CREATE OR REPLACE FUNCTION public.calculate_job_profit(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job RECORD;
  v_company_id uuid;
  v_workspace_id uuid;
  v_contract_price numeric(12,2) := 0;
  v_estimated_cost numeric(12,2) := 0;
  v_actual_cost numeric(12,2) := 0;
  v_material_cost numeric(12,2) := 0;
  v_labor_cost numeric(12,2) := 0;
  v_sub_cost numeric(12,2) := 0;
  v_overhead_allocated numeric(12,2) := 0;
  v_result jsonb;
BEGIN
  -- Get job details
  SELECT 
    j.*,
    COALESCE(j.contract_value, j.final_value, j.estimated_value, 0) as revenue,
    j.company_id,
    j.workspace_id
  INTO v_job
  FROM public.jobs j
  WHERE j.id = p_job_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Job not found');
  END IF;
  
  v_company_id := v_job.company_id;
  v_workspace_id := v_job.workspace_id;
  v_contract_price := v_job.revenue;
  
  -- Get estimated cost from job_estimates if available
  SELECT COALESCE(estimated_total_cost, 0)
  INTO v_estimated_cost
  FROM public.job_estimates
  WHERE job_id = p_job_id
  ORDER BY created_at DESC
  LIMIT 1;
  
  -- Get actual costs from job_costs or job_actual_costs
  -- Try job_actual_costs first (from Block 43000)
  SELECT 
    COALESCE(actual_material_cost, 0),
    COALESCE(actual_labor_cost, 0),
    COALESCE(actual_total_cost, 0)
  INTO 
    v_material_cost,
    v_labor_cost,
    v_actual_cost
  FROM public.job_actual_costs
  WHERE job_id = p_job_id;
  
  -- If not found, calculate from job_costs (from Block 252600)
  IF v_actual_cost = 0 THEN
    SELECT 
      COALESCE(SUM(amount) FILTER (WHERE cost_type = 'materials'), 0),
      COALESCE(SUM(amount) FILTER (WHERE cost_type = 'labor'), 0),
      COALESCE(SUM(amount) FILTER (WHERE cost_type = 'subs'), 0),
      COALESCE(SUM(amount), 0)
    INTO 
      v_material_cost,
      v_labor_cost,
      v_sub_cost,
      v_actual_cost
    FROM public.job_costs
    WHERE job_id = p_job_id
      AND is_expected = false; -- Only actual costs
  END IF;
  
  -- Calculate overhead allocation
  IF v_company_id IS NOT NULL THEN
    SELECT public.allocate_overhead_to_job(p_job_id, v_company_id, v_contract_price)
    INTO v_overhead_allocated;
  END IF;
  
  -- Add overhead to total cost
  v_actual_cost := v_actual_cost + COALESCE(v_overhead_allocated, 0);
  
  -- Upsert job_financials
  INSERT INTO public.job_financials (
    job_id,
    company_id,
    workspace_id,
    contract_price,
    estimated_cost,
    actual_cost,
    material_cost,
    labor_cost,
    sub_cost,
    overhead_allocated
  )
  VALUES (
    p_job_id,
    v_company_id,
    v_workspace_id,
    v_contract_price,
    v_estimated_cost,
    v_actual_cost,
    v_material_cost,
    v_labor_cost,
    v_sub_cost,
    v_overhead_allocated
  )
  ON CONFLICT (job_id) DO UPDATE SET
    contract_price = EXCLUDED.contract_price,
    estimated_cost = EXCLUDED.estimated_cost,
    actual_cost = EXCLUDED.actual_cost,
    material_cost = EXCLUDED.material_cost,
    labor_cost = EXCLUDED.labor_cost,
    sub_cost = EXCLUDED.sub_cost,
    overhead_allocated = EXCLUDED.overhead_allocated,
    updated_at = now();
  
  -- Check for cost overruns
  PERFORM public.detect_cost_overruns(p_job_id);
  
  -- Build result
  SELECT row_to_json(jf.*)::jsonb
  INTO v_result
  FROM public.job_financials jf
  WHERE jf.job_id = p_job_id;
  
  RETURN COALESCE(v_result, jsonb_build_object('error', 'Failed to calculate profit'));
END;
$$;

COMMENT ON FUNCTION public.calculate_job_profit IS 'Block 254200: Calculate and update real-time job profitability';

-- ============================================================
-- PART 6 — OVERHEAD ALLOCATION FUNCTION
-- ============================================================
-- Allocates overhead to a job based on company settings

CREATE OR REPLACE FUNCTION public.allocate_overhead_to_job(
  p_job_id uuid,
  p_company_id uuid,
  p_contract_price numeric
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_settings RECORD;
  v_labor_hours numeric(10,2) := 0;
  v_overhead_amount numeric(12,2) := 0;
BEGIN
  -- Get overhead settings
  SELECT *
  INTO v_settings
  FROM public.overhead_settings
  WHERE company_id = p_company_id;
  
  -- Use defaults if no settings
  IF NOT FOUND THEN
    v_settings := ROW(
      NULL, -- id
      p_company_id,
      0, -- monthly_overhead
      'percentage', -- allocation_method
      0.10, -- percentage_rate (10%)
      NULL, -- per_job_amount
      NULL, -- per_labor_hour_rate
      now(), -- updated_at
      now() -- created_at
    )::public.overhead_settings;
  END IF;
  
  -- Calculate overhead based on method
  CASE v_settings.allocation_method
    WHEN 'percentage' THEN
      v_overhead_amount := p_contract_price * COALESCE(v_settings.percentage_rate, 0.10);
    
    WHEN 'per_job' THEN
      v_overhead_amount := COALESCE(v_settings.per_job_amount, 0);
    
    WHEN 'per_labor_hour' THEN
      -- Get labor hours for this job
      SELECT COALESCE(SUM(billable_hours), 0)
      INTO v_labor_hours
      FROM public.crew_check_ins
      WHERE job_id = p_job_id AND check_out_time IS NOT NULL;
      
      IF v_labor_hours = 0 THEN
        SELECT COALESCE(SUM(total_hours), 0)
        INTO v_labor_hours
        FROM public.crew_hours
        WHERE job_id = p_job_id AND end_time IS NOT NULL;
      END IF;
      
      v_overhead_amount := v_labor_hours * COALESCE(v_settings.per_labor_hour_rate, 0);
    
    ELSE
      v_overhead_amount := p_contract_price * 0.10; -- Default 10%
  END CASE;
  
  RETURN v_overhead_amount;
END;
$$;

COMMENT ON FUNCTION public.allocate_overhead_to_job IS 'Block 254200: Allocate overhead to job based on company settings';

-- ============================================================
-- PART 7 — COST OVERRUN DETECTION FUNCTION
-- ============================================================
-- Detects and records cost overruns

CREATE OR REPLACE FUNCTION public.detect_cost_overruns(p_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_financials RECORD;
  v_threshold_pct numeric(5,2) := 10.0; -- 10% variance threshold
  v_material_expected numeric(12,2);
  v_material_actual numeric(12,2);
  v_labor_expected numeric(12,2);
  v_labor_actual numeric(12,2);
  v_sub_expected numeric(12,2);
  v_sub_actual numeric(12,2);
BEGIN
  -- Get job financials
  SELECT * INTO v_financials
  FROM public.job_financials
  WHERE job_id = p_job_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Get expected costs from estimates
  SELECT 
    COALESCE((estimated_materials->>'total')::numeric, 0),
    COALESCE(estimated_labor_hours * estimated_labor_rate * estimated_crew_size, 0),
    0 -- Sub costs (would need sub estimates table)
  INTO 
    v_material_expected,
    v_labor_expected,
    v_sub_expected
  FROM public.job_estimates
  WHERE job_id = p_job_id
  ORDER BY created_at DESC
  LIMIT 1;
  
  v_material_actual := v_financials.material_cost;
  v_labor_actual := v_financials.labor_cost;
  v_sub_actual := v_financials.sub_cost;
  
  -- Check material overrun
  IF v_material_expected > 0 AND v_material_actual > v_material_expected * (1 + v_threshold_pct / 100) THEN
    INSERT INTO public.cost_overruns (
      job_id,
      company_id,
      workspace_id,
      category,
      expected,
      actual,
      notes
    )
    VALUES (
      p_job_id,
      v_financials.company_id,
      v_financials.workspace_id,
      'material',
      v_material_expected,
      v_material_actual,
      format('Material cost exceeded estimate by %.1f%%', ((v_material_actual / v_material_expected - 1) * 100))
    )
    ON CONFLICT DO NOTHING;
  END IF;
  
  -- Check labor overrun
  IF v_labor_expected > 0 AND v_labor_actual > v_labor_expected * (1 + v_threshold_pct / 100) THEN
    INSERT INTO public.cost_overruns (
      job_id,
      company_id,
      workspace_id,
      category,
      expected,
      actual,
      notes
    )
    VALUES (
      p_job_id,
      v_financials.company_id,
      v_financials.workspace_id,
      'labor',
      v_labor_expected,
      v_labor_actual,
      format('Labor cost exceeded estimate by %.1f%%', ((v_labor_actual / v_labor_expected - 1) * 100))
    )
    ON CONFLICT DO NOTHING;
  END IF;
  
  -- Check sub overrun (if applicable)
  IF v_sub_expected > 0 AND v_sub_actual > v_sub_expected * (1 + v_threshold_pct / 100) THEN
    INSERT INTO public.cost_overruns (
      job_id,
      company_id,
      workspace_id,
      category,
      expected,
      actual,
      notes
    )
    VALUES (
      p_job_id,
      v_financials.company_id,
      v_financials.workspace_id,
      'subs',
      v_sub_expected,
      v_sub_actual,
      format('Subcontractor cost exceeded estimate by %.1f%%', ((v_sub_actual / v_sub_expected - 1) * 100))
    )
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.detect_cost_overruns IS 'Block 254200: Detect and record cost overruns';

-- ============================================================
-- PART 8 — CASHFLOW FORECAST FUNCTION
-- ============================================================
-- Forecasts cashflow for a given period

CREATE OR REPLACE FUNCTION public.forecast_cashflow(
  p_company_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_inflows numeric(12,2) := 0;
  v_outflows numeric(12,2) := 0;
  v_net numeric(12,2);
  v_result jsonb;
  v_events jsonb[];
BEGIN
  -- Calculate inflows (payments, deposits)
  SELECT COALESCE(SUM(amount), 0)
  INTO v_inflows
  FROM public.cashflow_events
  WHERE company_id = p_company_id
    AND date BETWEEN p_start_date AND p_end_date
    AND event_type IN ('payment', 'deposit', 'invoice', 'other_income')
    AND status = 'confirmed';
  
  -- Calculate outflows (purchases, payments)
  SELECT COALESCE(SUM(amount), 0)
  INTO v_outflows
  FROM public.cashflow_events
  WHERE company_id = p_company_id
    AND date BETWEEN p_start_date AND p_end_date
    AND event_type IN ('material_purchase', 'subcontractor_payment', 'labor_payment', 'overhead_payment', 'other_expense')
    AND status = 'confirmed';
  
  v_net := v_inflows - v_outflows;
  
  -- Get upcoming events
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'event_type', event_type,
      'amount', amount,
      'date', date,
      'description', description,
      'status', status
    )
  )
  INTO v_events
  FROM public.cashflow_events
  WHERE company_id = p_company_id
    AND date BETWEEN p_start_date AND p_end_date
    AND status = 'pending'
  ORDER BY date;
  
  -- Build result
  v_result := jsonb_build_object(
    'company_id', p_company_id,
    'start_date', p_start_date,
    'end_date', p_end_date,
    'inflows', v_inflows,
    'outflows', v_outflows,
    'net', v_net,
    'upcoming_events', COALESCE(v_events, '[]'::jsonb),
    'cashflow_tight', v_net < 0 OR (v_outflows > v_inflows * 0.8) -- Warning if net negative or outflows > 80% of inflows
  );
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.forecast_cashflow IS 'Block 254200: Forecast cashflow for a given period';

-- ============================================================
-- PART 9 — TRIGGERS FOR AUTO-UPDATE
-- ============================================================

-- Trigger to recalculate profit when job costs change
CREATE OR REPLACE FUNCTION public.trigger_recalculate_job_profit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.calculate_job_profit(COALESCE(NEW.job_id, OLD.job_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Trigger on job_costs changes
DROP TRIGGER IF EXISTS trg_recalculate_profit_on_costs ON public.job_costs;
CREATE TRIGGER trg_recalculate_profit_on_costs
AFTER INSERT OR UPDATE OR DELETE ON public.job_costs
FOR EACH ROW
EXECUTE FUNCTION public.trigger_recalculate_job_profit();

-- Trigger on job_actual_costs changes
DROP TRIGGER IF EXISTS trg_recalculate_profit_on_actual_costs ON public.job_actual_costs;
CREATE TRIGGER trg_recalculate_profit_on_actual_costs
AFTER INSERT OR UPDATE OR DELETE ON public.job_actual_costs
FOR EACH ROW
EXECUTE FUNCTION public.trigger_recalculate_job_profit();

-- Trigger on jobs contract_value changes
DROP TRIGGER IF EXISTS trg_recalculate_profit_on_job_update ON public.jobs;
CREATE TRIGGER trg_recalculate_profit_on_job_update
AFTER INSERT OR UPDATE OF contract_value, final_value, estimated_value ON public.jobs
FOR EACH ROW
EXECUTE FUNCTION public.trigger_recalculate_job_profit();

-- ============================================================
-- PART 10 — ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.job_financials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cashflow_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_overruns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.overhead_settings ENABLE ROW LEVEL SECURITY;

-- Job financials policies
CREATE POLICY "job_financials_select_company_members"
  ON public.job_financials FOR SELECT
  USING (
    company_id IN (
      SELECT roofing_company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid()
    )
    OR company_id IN (
      SELECT id FROM public.roofing_companies
      WHERE owner_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Cashflow events policies
CREATE POLICY "cashflow_events_select_company_members"
  ON public.cashflow_events FOR SELECT
  USING (
    company_id IN (
      SELECT roofing_company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid()
    )
    OR company_id IN (
      SELECT id FROM public.roofing_companies
      WHERE owner_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "cashflow_events_insert_company_members"
  ON public.cashflow_events FOR INSERT
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

-- Cost overruns policies
CREATE POLICY "cost_overruns_select_company_members"
  ON public.cost_overruns FOR SELECT
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

CREATE POLICY "cost_overruns_update_company_members"
  ON public.cost_overruns FOR UPDATE
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
CREATE POLICY "overhead_settings_select_company_members"
  ON public.overhead_settings FOR SELECT
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

CREATE POLICY "overhead_settings_insert_company_owners"
  ON public.overhead_settings FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT id FROM public.roofing_companies
      WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "overhead_settings_update_company_owners"
  ON public.overhead_settings FOR UPDATE
  USING (
    company_id IN (
      SELECT id FROM public.roofing_companies
      WHERE owner_id = auth.uid()
    )
  );

-- ============================================================
-- PART 11 — GRANT PERMISSIONS
-- ============================================================

GRANT SELECT, INSERT, UPDATE ON public.job_financials TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.cashflow_events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.cost_overruns TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.overhead_settings TO authenticated;

GRANT EXECUTE ON FUNCTION public.calculate_job_profit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_overhead_to_job(uuid, uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_cost_overruns(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.forecast_cashflow(uuid, date, date) TO authenticated;

-- ============================================================
-- PART 12 — PROFIT ANALYTICS VIEWS
-- ============================================================

-- Profit by Crew
CREATE OR REPLACE VIEW public.profit_by_crew AS
SELECT 
  c.id as crew_id,
  c.name as crew_name,
  COUNT(DISTINCT jf.job_id) as job_count,
  COALESCE(SUM(jf.contract_price), 0) as total_revenue,
  COALESCE(SUM(jf.actual_cost), 0) as total_costs,
  COALESCE(SUM(jf.gross_profit), 0) as total_profit,
  CASE 
    WHEN SUM(jf.contract_price) > 0 THEN
      ROUND((SUM(jf.gross_profit) / SUM(jf.contract_price)) * 100, 2)
    ELSE 0
  END as avg_margin
FROM public.crews c
LEFT JOIN public.jobs j ON j.crew_id = c.id
LEFT JOIN public.job_financials jf ON jf.job_id = j.id
GROUP BY c.id, c.name;

COMMENT ON VIEW public.profit_by_crew IS 'Block 254200: Profit analytics by crew';

-- Profit by Job Type
CREATE OR REPLACE VIEW public.profit_by_job_type AS
SELECT 
  j.job_type,
  COUNT(DISTINCT jf.job_id) as job_count,
  COALESCE(SUM(jf.contract_price), 0) as total_revenue,
  COALESCE(SUM(jf.actual_cost), 0) as total_costs,
  COALESCE(SUM(jf.gross_profit), 0) as total_profit,
  CASE 
    WHEN SUM(jf.contract_price) > 0 THEN
      ROUND((SUM(jf.gross_profit) / SUM(jf.contract_price)) * 100, 2)
    ELSE 0
  END as avg_margin
FROM public.jobs j
LEFT JOIN public.job_financials jf ON jf.job_id = j.id
WHERE j.job_type IS NOT NULL
GROUP BY j.job_type;

COMMENT ON VIEW public.profit_by_job_type IS 'Block 254200: Profit analytics by job type';

-- Profit by Supplier (via material purchases)
CREATE OR REPLACE VIEW public.profit_by_supplier AS
SELECT 
  s.id as supplier_id,
  s.name as supplier_name,
  COUNT(DISTINCT cfe.job_id) as job_count,
  COALESCE(SUM(cfe.amount), 0) as total_spent,
  COALESCE(SUM(jf.contract_price), 0) as total_revenue,
  COALESCE(SUM(jf.gross_profit), 0) as total_profit,
  COUNT(DISTINCT co.id) as overrun_count
FROM public.suppliers s
LEFT JOIN public.cashflow_events cfe ON cfe.supplier_id = s.id AND cfe.event_type = 'material_purchase'
LEFT JOIN public.job_financials jf ON jf.job_id = cfe.job_id
LEFT JOIN public.cost_overruns co ON co.job_id = cfe.job_id AND co.category = 'material'
GROUP BY s.id, s.name;

COMMENT ON VIEW public.profit_by_supplier IS 'Block 254200: Profit analytics by supplier';

-- ============================================================
-- PART 13 — FINANCIAL ALERTS FUNCTION
-- ============================================================
-- Generates financial alerts based on various conditions

CREATE OR REPLACE FUNCTION public.generate_financial_alerts(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_alerts jsonb[] := '{}';
  v_alert jsonb;
  v_job RECORD;
  v_overdue_count int;
  v_low_margin_count int;
  v_overrun_count int;
BEGIN
  -- Alert: Jobs with low margins (< 25%)
  SELECT COUNT(*)
  INTO v_low_margin_count
  FROM public.job_financials jf
  WHERE jf.company_id = p_company_id
    AND jf.margin < 25
    AND jf.margin > 0; -- Exclude negative margins (might be in progress)
  
  IF v_low_margin_count > 0 THEN
    v_alert := jsonb_build_object(
      'type', 'low_margin',
      'severity', 'high',
      'title', format('Low Margin Alert: %s jobs below 25%% margin', v_low_margin_count),
      'message', format('You have %s jobs with margins below 25%%. Review pricing or cost management.', v_low_margin_count),
      'count', v_low_margin_count
    );
    v_alerts := array_append(v_alerts, v_alert);
  END IF;
  
  -- Alert: Unacknowledged cost overruns
  SELECT COUNT(*)
  INTO v_overrun_count
  FROM public.cost_overruns co
  WHERE co.company_id = p_company_id
    AND co.acknowledged = false;
  
  IF v_overrun_count > 0 THEN
    v_alert := jsonb_build_object(
      'type', 'cost_overrun',
      'severity', 'critical',
      'title', format('Cost Overrun Alert: %s unacknowledged overruns', v_overrun_count),
      'message', format('You have %s cost overruns that need attention. Review and acknowledge them.', v_overrun_count),
      'count', v_overrun_count
    );
    v_alerts := array_append(v_alerts, v_alert);
  END IF;
  
  -- Alert: Overdue receivables (payments expected but not received)
  SELECT COUNT(*)
  INTO v_overdue_count
  FROM public.cashflow_events cfe
  WHERE cfe.company_id = p_company_id
    AND cfe.event_type IN ('invoice', 'payment')
    AND cfe.date < CURRENT_DATE - INTERVAL '7 days'
    AND cfe.status = 'pending';
  
  IF v_overdue_count > 0 THEN
    v_alert := jsonb_build_object(
      'type', 'overdue_receivables',
      'severity', 'high',
      'title', format('Overdue Receivables: %s payments overdue', v_overdue_count),
      'message', format('You have %s payments that are overdue by more than 7 days. Follow up with customers.', v_overdue_count),
      'count', v_overdue_count
    );
    v_alerts := array_append(v_alerts, v_alert);
  END IF;
  
  -- Alert: Cashflow tight (from forecast)
  DECLARE
    v_forecast jsonb;
    v_cashflow_tight boolean;
  BEGIN
    SELECT public.forecast_cashflow(p_company_id, CURRENT_DATE, CURRENT_DATE + INTERVAL '14 days')
    INTO v_forecast;
    
    v_cashflow_tight := (v_forecast->>'cashflow_tight')::boolean;
    
    IF v_cashflow_tight THEN
      v_alert := jsonb_build_object(
        'type', 'cashflow_warning',
        'severity', 'high',
        'title', 'Cashflow Tight Next Week',
        'message', 'You have material POs due before receivables arrive. Review your cashflow forecast.',
        'forecast', v_forecast
      );
      v_alerts := array_append(v_alerts, v_alert);
    END IF;
  END;
  
  -- Alert: Jobs losing money (negative profit)
  SELECT COUNT(*)
  INTO v_low_margin_count
  FROM public.job_financials jf
  WHERE jf.company_id = p_company_id
    AND jf.gross_profit < 0;
  
  IF v_low_margin_count > 0 THEN
    v_alert := jsonb_build_object(
      'type', 'losing_money',
      'severity', 'critical',
      'title', format('Losing Money Alert: %s jobs with negative profit', v_low_margin_count),
      'message', format('You have %s jobs that are losing money. Immediate action required.', v_low_margin_count),
      'count', v_low_margin_count
    );
    v_alerts := array_append(v_alerts, v_alert);
  END IF;
  
  RETURN jsonb_build_object(
    'company_id', p_company_id,
    'alerts', v_alerts,
    'alert_count', array_length(v_alerts, 1),
    'generated_at', now()
  );
END;
$$;

COMMENT ON FUNCTION public.generate_financial_alerts IS 'Block 254200: Generate financial alerts for a company';

GRANT EXECUTE ON FUNCTION public.generate_financial_alerts(uuid) TO authenticated;

-- ============================================================
-- END OF MIGRATION
-- ============================================================






















