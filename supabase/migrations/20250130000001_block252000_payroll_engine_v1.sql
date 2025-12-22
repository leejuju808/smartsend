-- =========================================================
-- Block 252000 — SmartSend Workforce Hub v1
-- Payroll Export + Labor Cost Automation
-- =========================================================
-- 
-- This is a money feature — roofers HATE payroll week because:
-- 
-- - Hours are wrong
-- - Crew time is missing
-- - Overtime is miscalculated
-- - Foremen lie
-- - Jobs get overcharged
-- - Office managers spend HOURS fixing garbage
-- 
-- SmartSend fixes ALL OF THIS automatically.
-- 
-- Roofers will say:
-- "Payroll used to take 6 hours. SmartSend does it in 6 minutes."
-- 
-- This is one of the most valuable features in SmartSend's entire Workforce Hub.
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE role_pay_rates TABLE
-- ============================================================================
-- Role-based pay rates (hourly, salary, piecework future)

CREATE TABLE IF NOT EXISTS public.role_pay_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  role text NOT NULL,               -- installer, foreman, laborer
  hourly_rate numeric NOT NULL,
  overtime_multiplier numeric DEFAULT 1.5,
  doubletime_multiplier numeric DEFAULT 2.0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(company_id, role)
);

CREATE INDEX IF NOT EXISTS idx_role_pay_rates_company ON public.role_pay_rates(company_id);
CREATE INDEX IF NOT EXISTS idx_role_pay_rates_role ON public.role_pay_rates(company_id, role);

COMMENT ON TABLE public.role_pay_rates IS 'Role-based pay rates for payroll calculation (Block 252000)';
COMMENT ON COLUMN public.role_pay_rates.role IS 'Job role: installer, foreman, laborer, etc.';
COMMENT ON COLUMN public.role_pay_rates.overtime_multiplier IS 'Overtime multiplier (default 1.5 for time-and-a-half)';
COMMENT ON COLUMN public.role_pay_rates.doubletime_multiplier IS 'Double-time multiplier (default 2.0)';

-- ============================================================================
-- PART 2 — CREATE payroll_periods TABLE
-- ============================================================================
-- Weekly payroll periods with locking mechanism

CREATE TABLE IF NOT EXISTS public.payroll_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  week_end date NOT NULL,
  status text CHECK (status IN ('open', 'locked')) DEFAULT 'open',
  locked_at timestamptz,
  locked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(company_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_payroll_periods_company ON public.payroll_periods(company_id);
CREATE INDEX IF NOT EXISTS idx_payroll_periods_week ON public.payroll_periods(company_id, week_start);
CREATE INDEX IF NOT EXISTS idx_payroll_periods_status ON public.payroll_periods(company_id, status);

COMMENT ON TABLE public.payroll_periods IS 'Weekly payroll periods with locking mechanism (Block 252000)';
COMMENT ON COLUMN public.payroll_periods.status IS 'Period status: open (editable) or locked (finalized)';

-- ============================================================================
-- PART 3 — CREATE payroll_entries TABLE
-- ============================================================================
-- Finalized payroll entries per employee per period

CREATE TABLE IF NOT EXISTS public.payroll_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.workforce_employees(id) ON DELETE CASCADE,
  period_id uuid NOT NULL REFERENCES public.payroll_periods(id) ON DELETE CASCADE,
  total_hours numeric NOT NULL,
  regular_hours numeric NOT NULL,
  overtime_hours numeric DEFAULT 0,
  doubletime_hours numeric DEFAULT 0,
  total_pay numeric NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(employee_id, period_id)
);

CREATE INDEX IF NOT EXISTS idx_payroll_entries_employee ON public.payroll_entries(employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_entries_period ON public.payroll_entries(period_id);
CREATE INDEX IF NOT EXISTS idx_payroll_entries_employee_period ON public.payroll_entries(employee_id, period_id);

COMMENT ON TABLE public.payroll_entries IS 'Finalized payroll entries per employee per period (Block 252000)';

-- ============================================================================
-- PART 4 — CREATE payroll_time_expanded VIEW
-- ============================================================================
-- Combines time_clock + pay_rates for payroll calculation

CREATE OR REPLACE VIEW public.payroll_time_expanded AS
SELECT
  c.employee_id,
  c.job_id,
  c.clock_in,
  c.clock_out,
  c.duration_minutes / 60.0 as hours,
  e.role,
  e.company_id,
  COALESCE(r.hourly_rate, 0) as hourly_rate,
  COALESCE(r.overtime_multiplier, 1.5) as overtime_multiplier,
  COALESCE(r.doubletime_multiplier, 2.0) as doubletime_multiplier
FROM public.crew_time_clock c
JOIN public.workforce_employees e ON e.id = c.employee_id
LEFT JOIN public.role_pay_rates r ON r.role = e.role AND r.company_id = e.company_id
WHERE c.clock_out IS NOT NULL
  AND c.duration_minutes IS NOT NULL;

COMMENT ON VIEW public.payroll_time_expanded IS 'Time clock records expanded with pay rates for payroll calculation (Block 252000)';

-- ============================================================================
-- PART 5 — CREATE payroll_weekly_summary VIEW
-- ============================================================================
-- Weekly payroll summary per employee

CREATE OR REPLACE VIEW public.payroll_weekly_summary AS
SELECT
  employee_id,
  company_id,
  date_trunc('week', clock_in)::date as week_start,
  (date_trunc('week', clock_in) + interval '6 days')::date as week_end,
  sum(hours) as total_hours,
  sum(
    case 
      when sum(hours) over (partition by employee_id, date_trunc('week', clock_in)) > 40 
      then least(hours, 40 - coalesce(sum(hours) over (partition by employee_id, date_trunc('week', clock_in) order by clock_in rows between unbounded preceding and 1 preceding), 0))
      else hours
    end
  ) as regular_hours,
  greatest(sum(hours) - 40, 0) as overtime_hours
FROM public.payroll_time_expanded
GROUP BY employee_id, company_id, date_trunc('week', clock_in);

-- Simplified version for now (will refine overtime calculation later)
DROP VIEW IF EXISTS public.payroll_weekly_summary;

CREATE OR REPLACE VIEW public.payroll_weekly_summary AS
WITH weekly_totals AS (
  SELECT
    employee_id,
    company_id,
    date_trunc('week', clock_in)::date as week_start,
    (date_trunc('week', clock_in) + interval '6 days')::date as week_end,
    sum(hours) as total_hours
  FROM public.payroll_time_expanded
  GROUP BY employee_id, company_id, date_trunc('week', clock_in)
)
SELECT
  employee_id,
  company_id,
  week_start,
  week_end,
  total_hours,
  least(total_hours, 40) as regular_hours,
  greatest(total_hours - 40, 0) as overtime_hours
FROM weekly_totals;

COMMENT ON VIEW public.payroll_weekly_summary IS 'Weekly payroll summary per employee with regular/overtime breakdown (Block 252000)';

-- ============================================================================
-- PART 6 — CREATE job_labor_summary VIEW
-- ============================================================================
-- Job-level labor cost summary

CREATE OR REPLACE VIEW public.job_labor_summary AS
SELECT
  job_id,
  company_id,
  sum(hours * hourly_rate) as total_labor_cost,
  sum(hours) as total_hours,
  count(DISTINCT employee_id) as employee_count
FROM public.payroll_time_expanded
GROUP BY job_id, company_id;

COMMENT ON VIEW public.job_labor_summary IS 'Job-level labor cost summary for profitability tracking (Block 252000)';

-- ============================================================================
-- PART 7 — CREATE finalize_payroll RPC FUNCTION
-- ============================================================================
-- Finalizes payroll for a period and creates payroll_entries

CREATE OR REPLACE FUNCTION public.finalize_payroll(p_period_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_period record;
  v_employee record;
  v_regular_hours numeric;
  v_overtime_hours numeric;
  v_total_pay numeric;
BEGIN
  -- Get period details
  SELECT * INTO v_period
  FROM public.payroll_periods
  WHERE id = p_period_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll period not found';
  END IF;
  
  IF v_period.status = 'locked' THEN
    RAISE EXCEPTION 'Payroll period is already locked';
  END IF;
  
  -- Delete existing entries for this period (in case of re-finalization)
  DELETE FROM public.payroll_entries WHERE period_id = p_period_id;
  
  -- Create payroll entries for each employee
  FOR v_employee IN
    SELECT 
      w.employee_id,
      w.regular_hours,
      w.overtime_hours,
      r.hourly_rate,
      r.overtime_multiplier
    FROM public.payroll_weekly_summary w
    JOIN public.workforce_employees e ON e.id = w.employee_id
    LEFT JOIN public.role_pay_rates r ON r.role = e.role AND r.company_id = e.company_id
    WHERE w.company_id = v_period.company_id
      AND w.week_start = v_period.week_start
  LOOP
    -- Calculate total pay
    v_total_pay := (v_employee.regular_hours * COALESCE(v_employee.hourly_rate, 0)) +
                   (v_employee.overtime_hours * COALESCE(v_employee.hourly_rate, 0) * COALESCE(v_employee.overtime_multiplier, 1.5));
    
    -- Insert payroll entry
    INSERT INTO public.payroll_entries (
      employee_id,
      period_id,
      total_hours,
      regular_hours,
      overtime_hours,
      total_pay
    ) VALUES (
      v_employee.employee_id,
      p_period_id,
      v_employee.regular_hours + v_employee.overtime_hours,
      v_employee.regular_hours,
      v_employee.overtime_hours,
      v_total_pay
    );
  END LOOP;
  
  -- Lock the period
  UPDATE public.payroll_periods 
  SET 
    status = 'locked',
    locked_at = now(),
    locked_by = auth.uid(),
    updated_at = now()
  WHERE id = p_period_id;
END;
$$;

COMMENT ON FUNCTION public.finalize_payroll IS 'Finalizes payroll for a period and creates payroll_entries (Block 252000)';

-- ============================================================================
-- PART 7.1 — CREATE HELPER FUNCTIONS FOR DISCREPANCY CHECKS
-- ============================================================================

-- Get multiple clock-ins per day
CREATE OR REPLACE FUNCTION public.get_multiple_clock_ins(
  p_company_id uuid,
  p_week_start date,
  p_week_end date
)
RETURNS TABLE (
  employee_id uuid,
  employee_name text,
  clock_date date,
  clock_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.employee_id,
    CONCAT(e.first_name, ' ', e.last_name) as employee_name,
    DATE(c.clock_in) as clock_date,
    COUNT(*)::bigint as clock_count
  FROM public.crew_time_clock c
  JOIN public.workforce_employees e ON e.id = c.employee_id
  WHERE e.company_id = p_company_id
    AND DATE(c.clock_in) >= p_week_start
    AND DATE(c.clock_in) <= p_week_end
  GROUP BY c.employee_id, e.first_name, e.last_name, DATE(c.clock_in)
  HAVING COUNT(*) > 1
  ORDER BY clock_date DESC, employee_name;
END;
$$;

COMMENT ON FUNCTION public.get_multiple_clock_ins IS 'Returns employees with multiple clock-ins on the same day (Block 252000)';

-- Get payroll weekly summary (helper RPC)
CREATE OR REPLACE FUNCTION public.get_payroll_weekly_summary(
  p_company_id uuid,
  p_week_start date
)
RETURNS TABLE (
  employee_id uuid,
  company_id uuid,
  week_start date,
  week_end date,
  total_hours numeric,
  regular_hours numeric,
  overtime_hours numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    w.employee_id,
    w.company_id,
    w.week_start,
    w.week_end,
    w.total_hours,
    w.regular_hours,
    w.overtime_hours
  FROM public.payroll_weekly_summary w
  WHERE w.company_id = p_company_id
    AND w.week_start = p_week_start;
END;
$$;

COMMENT ON FUNCTION public.get_payroll_weekly_summary IS 'Returns weekly payroll summary for a company and week (Block 252000)';

-- ============================================================================
-- PART 8 — CREATE UPDATED_AT TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_payroll_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_role_pay_rates_updated_at ON public.role_pay_rates;
CREATE TRIGGER trg_role_pay_rates_updated_at
BEFORE UPDATE ON public.role_pay_rates
FOR EACH ROW
EXECUTE FUNCTION public.set_payroll_updated_at();

DROP TRIGGER IF EXISTS trg_payroll_periods_updated_at ON public.payroll_periods;
CREATE TRIGGER trg_payroll_periods_updated_at
BEFORE UPDATE ON public.payroll_periods
FOR EACH ROW
EXECUTE FUNCTION public.set_payroll_updated_at();

DROP TRIGGER IF EXISTS trg_payroll_entries_updated_at ON public.payroll_entries;
CREATE TRIGGER trg_payroll_entries_updated_at
BEFORE UPDATE ON public.payroll_entries
FOR EACH ROW
EXECUTE FUNCTION public.set_payroll_updated_at();

-- ============================================================================
-- PART 9 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.role_pay_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_entries ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view pay rates for their company
DROP POLICY IF EXISTS "role_pay_rates_select" ON public.role_pay_rates;
CREATE POLICY "role_pay_rates_select" ON public.role_pay_rates
  FOR SELECT
  TO authenticated
  USING (
    EXISTS(
      SELECT 1 FROM public.roofing_company_members rcm
      WHERE rcm.roofing_company_id = role_pay_rates.company_id
      AND rcm.user_id = auth.uid()
      AND rcm.is_active = true
    )
  );

-- Policy: Users can manage pay rates for their company
DROP POLICY IF EXISTS "role_pay_rates_modify" ON public.role_pay_rates;
CREATE POLICY "role_pay_rates_modify" ON public.role_pay_rates
  FOR ALL
  TO authenticated
  USING (
    EXISTS(
      SELECT 1 FROM public.roofing_company_members rcm
      WHERE rcm.roofing_company_id = role_pay_rates.company_id
      AND rcm.user_id = auth.uid()
      AND rcm.is_active = true
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.roofing_company_members rcm
      WHERE rcm.roofing_company_id = role_pay_rates.company_id
      AND rcm.user_id = auth.uid()
      AND rcm.is_active = true
    )
  );

-- Policy: Users can view payroll periods for their company
DROP POLICY IF EXISTS "payroll_periods_select" ON public.payroll_periods;
CREATE POLICY "payroll_periods_select" ON public.payroll_periods
  FOR SELECT
  TO authenticated
  USING (
    EXISTS(
      SELECT 1 FROM public.roofing_company_members rcm
      WHERE rcm.roofing_company_id = payroll_periods.company_id
      AND rcm.user_id = auth.uid()
      AND rcm.is_active = true
    )
  );

-- Policy: Users can manage payroll periods for their company
DROP POLICY IF EXISTS "payroll_periods_modify" ON public.payroll_periods;
CREATE POLICY "payroll_periods_modify" ON public.payroll_periods
  FOR ALL
  TO authenticated
  USING (
    EXISTS(
      SELECT 1 FROM public.roofing_company_members rcm
      WHERE rcm.roofing_company_id = payroll_periods.company_id
      AND rcm.user_id = auth.uid()
      AND rcm.is_active = true
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.roofing_company_members rcm
      WHERE rcm.roofing_company_id = payroll_periods.company_id
      AND rcm.user_id = auth.uid()
      AND rcm.is_active = true
    )
  );

-- Policy: Users can view payroll entries for their company
DROP POLICY IF EXISTS "payroll_entries_select" ON public.payroll_entries;
CREATE POLICY "payroll_entries_select" ON public.payroll_entries
  FOR SELECT
  TO authenticated
  USING (
    EXISTS(
      SELECT 1 FROM public.payroll_periods pp
      JOIN public.roofing_company_members rcm ON rcm.roofing_company_id = pp.company_id
      WHERE pp.id = payroll_entries.period_id
      AND rcm.user_id = auth.uid()
      AND rcm.is_active = true
    )
  );

-- Policy: Service role has full access
DROP POLICY IF EXISTS "payroll_service_role" ON public.role_pay_rates;
CREATE POLICY "payroll_service_role" ON public.role_pay_rates
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "payroll_periods_service_role" ON public.payroll_periods;
CREATE POLICY "payroll_periods_service_role" ON public.payroll_periods
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "payroll_entries_service_role" ON public.payroll_entries;
CREATE POLICY "payroll_entries_service_role" ON public.payroll_entries
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
























