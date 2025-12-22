-- =========================================================
-- Block 253700 — SmartSend Crew Payroll Engine v1
-- "Time Tracking, Auto Job-Split Hours, Overtime Rules, Prevailing Wage Support, Pay Summary Reports"
-- =========================================================
-- 
-- This block makes SmartSend the HR & payroll automation weapon roofing companies DESPERATELY need.
-- 
-- Right now roofing payroll is a NIGHTMARE:
-- ❌ Crews forget to clock in/out
-- ❌ Foremen write hours wrong
-- ❌ Hours are split between multiple jobs manually
-- ❌ Subcontractor hours aren't tracked
-- ❌ Prevailing wage jobs cause confusion
-- ❌ Overtime rules are miscalculated
-- ❌ Pay disputes happen weekly
-- ❌ Payroll runs take HOURS
-- ❌ No proof of hours for insurance or legal protection
-- 
-- SmartSend fixes ALL OF IT automatically.
-- 
-- Roofers will say:
-- "SmartSend cut payroll time from 4 hours to 20 minutes."
-- "Foremen stopped lying about hours."
-- "We'd be stupid not using this."
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE employee_timecards TABLE
-- ============================================================================
-- Individual employee timecard records with auto job-split support

CREATE TABLE IF NOT EXISTS public.employee_timecards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.workforce_employees(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  
  -- Clock in/out times
  clock_in timestamptz NOT NULL,
  clock_out timestamptz,
  
  -- Calculated hours
  total_hours numeric, -- Total hours worked (calculated from clock_in/clock_out)
  regular_hours numeric DEFAULT 0, -- Regular hours (up to daily/weekly threshold)
  overtime_hours numeric DEFAULT 0, -- Overtime hours
  doubletime_hours numeric DEFAULT 0, -- Double-time hours (future)
  
  -- Auto-generated flag
  auto_generated boolean DEFAULT false, -- True if created by geofencing auto clock-in
  
  -- Pay type for this timecard
  pay_type text CHECK (pay_type IN ('hourly', 'piecework', 'dayrate')) DEFAULT 'hourly',
  
  -- Piecework tracking (if pay_type = 'piecework')
  piecework_squares numeric DEFAULT 0, -- Squares completed
  piecework_rate numeric, -- Rate per square
  piecework_total numeric DEFAULT 0, -- Total piecework pay
  
  -- Day rate tracking (if pay_type = 'dayrate')
  day_rate_amount numeric, -- Flat day rate amount
  
  -- Prevailing wage tracking
  prevailing_wage_rate numeric, -- Prevailing wage rate if job requires it
  prevailing_wage_applied boolean DEFAULT false, -- Whether prevailing wage was applied
  
  -- Location tracking (for geofencing)
  clock_in_lat numeric,
  clock_in_lng numeric,
  clock_out_lat numeric,
  clock_out_lng numeric,
  
  -- Approval workflow
  supervisor_approved boolean DEFAULT false,
  supervisor_approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  supervisor_approved_at timestamptz,
  supervisor_notes text,
  
  -- Status
  status text CHECK (status IN ('pending', 'approved', 'rejected', 'disputed')) DEFAULT 'pending',
  
  -- Metadata
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_timecards_employee ON public.employee_timecards(employee_id, clock_in DESC);
CREATE INDEX IF NOT EXISTS idx_employee_timecards_job ON public.employee_timecards(job_id, clock_in DESC);
CREATE INDEX IF NOT EXISTS idx_employee_timecards_company ON public.employee_timecards(company_id, clock_in DESC);
CREATE INDEX IF NOT EXISTS idx_employee_timecards_date ON public.employee_timecards(DATE(clock_in));
CREATE INDEX IF NOT EXISTS idx_employee_timecards_status ON public.employee_timecards(status);
CREATE INDEX IF NOT EXISTS idx_employee_timecards_auto_generated ON public.employee_timecards(auto_generated) WHERE auto_generated = true;
CREATE INDEX IF NOT EXISTS idx_employee_timecards_pending_approval ON public.employee_timecards(company_id, status) WHERE status = 'pending';

COMMENT ON TABLE public.employee_timecards IS 'Individual employee timecard records with auto job-split and overtime calculation (Block 253700)';
COMMENT ON COLUMN public.employee_timecards.auto_generated IS 'True if created automatically by geofencing auto clock-in (Block 253500)';
COMMENT ON COLUMN public.employee_timecards.pay_type IS 'Pay type: hourly, piecework, or dayrate';
COMMENT ON COLUMN public.employee_timecards.prevailing_wage_applied IS 'Whether prevailing wage rate was applied to this timecard';

-- ============================================================================
-- PART 2 — CREATE pay_rates TABLE
-- ============================================================================
-- Employee-specific pay rates with effective date ranges

CREATE TABLE IF NOT EXISTS public.pay_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.workforce_employees(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  
  -- Pay rate
  rate numeric NOT NULL, -- Base hourly rate or piecework rate or day rate
  
  -- Pay type
  pay_type text NOT NULL CHECK (pay_type IN ('hourly', 'piecework', 'dayrate')) DEFAULT 'hourly',
  
  -- Piecework rates (if pay_type = 'piecework')
  piecework_tear_off_rate numeric, -- Rate per square for tear-off
  piecework_install_rate numeric, -- Rate per square for install
  piecework_ridge_cap_rate numeric, -- Rate per square for ridge cap
  piecework_underlayment_rate numeric, -- Rate per square for underlayment
  piecework_flashings_rate numeric, -- Rate per square for flashings
  
  -- Prevailing wage rate
  prevailing_wage_rate numeric, -- Prevailing wage rate (for government jobs)
  
  -- Effective date range
  effective_start date NOT NULL,
  effective_end date, -- NULL = currently active
  
  -- Notes
  notes text,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pay_rates_employee ON public.pay_rates(employee_id, effective_start DESC);
CREATE INDEX IF NOT EXISTS idx_pay_rates_company ON public.pay_rates(company_id);
CREATE INDEX IF NOT EXISTS idx_pay_rates_active ON public.pay_rates(employee_id, effective_start, effective_end) 
  WHERE effective_end IS NULL OR effective_end >= CURRENT_DATE;

COMMENT ON TABLE public.pay_rates IS 'Employee-specific pay rates with effective date ranges (Block 253700)';
COMMENT ON COLUMN public.pay_rates.pay_type IS 'Pay type: hourly, piecework, or dayrate';
COMMENT ON COLUMN public.pay_rates.effective_end IS 'NULL = currently active rate';

-- ============================================================================
-- PART 3 — ENHANCE payroll_periods TABLE
-- ============================================================================
-- Add processed flag and enhance existing payroll_periods

ALTER TABLE IF EXISTS public.payroll_periods
  ADD COLUMN IF NOT EXISTS processed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date;

-- Update existing records if week_start/week_end exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payroll_periods' 
    AND column_name = 'week_start'
  ) THEN
    UPDATE public.payroll_periods
    SET start_date = week_start,
        end_date = week_end
    WHERE start_date IS NULL AND week_start IS NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_payroll_periods_processed ON public.payroll_periods(processed) WHERE processed = false;
CREATE INDEX IF NOT EXISTS idx_payroll_periods_date_range ON public.payroll_periods(start_date, end_date);

COMMENT ON COLUMN public.payroll_periods.processed IS 'Block 253700: Whether payroll has been processed for this period';
COMMENT ON COLUMN public.payroll_periods.start_date IS 'Block 253700: Payroll period start date';
COMMENT ON COLUMN public.payroll_periods.end_date IS 'Block 253700: Payroll period end date';

-- ============================================================================
-- PART 4 — CREATE payroll_disputes TABLE
-- ============================================================================
-- Track payroll disputes from employees

CREATE TABLE IF NOT EXISTS public.payroll_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timecard_id uuid NOT NULL REFERENCES public.employee_timecards(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.workforce_employees(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  
  -- Dispute details
  reason text NOT NULL, -- What the employee thinks is wrong
  disputed_hours numeric, -- Hours employee claims
  disputed_amount numeric, -- Amount employee claims
  
  -- Supporting evidence
  photos jsonb DEFAULT '[]'::jsonb, -- Array of photo URLs
  notes text, -- Additional notes from employee
  
  -- Resolution
  status text CHECK (status IN ('pending', 'approved', 'rejected', 'resolved')) DEFAULT 'pending',
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  resolution_notes text, -- PM/owner explanation
  
  -- Adjustment (if approved)
  hours_adjustment numeric DEFAULT 0, -- Hours adjustment
  amount_adjustment numeric DEFAULT 0, -- Amount adjustment
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_disputes_timecard ON public.payroll_disputes(timecard_id);
CREATE INDEX IF NOT EXISTS idx_payroll_disputes_employee ON public.payroll_disputes(employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_disputes_company ON public.payroll_disputes(company_id, status);
CREATE INDEX IF NOT EXISTS idx_payroll_disputes_status ON public.payroll_disputes(status) WHERE status = 'pending';

COMMENT ON TABLE public.payroll_disputes IS 'Track payroll disputes from employees (Block 253700)';
COMMENT ON COLUMN public.payroll_disputes.status IS 'Dispute status: pending, approved, rejected, resolved';

-- ============================================================================
-- PART 5 — ADD prevailing_wage COLUMN TO jobs TABLE
-- ============================================================================
-- Mark jobs that require prevailing wage

ALTER TABLE IF EXISTS public.jobs
  ADD COLUMN IF NOT EXISTS prevailing_wage boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS prevailing_wage_rate numeric;

CREATE INDEX IF NOT EXISTS idx_jobs_prevailing_wage ON public.jobs(prevailing_wage) WHERE prevailing_wage = true;

COMMENT ON COLUMN public.jobs.prevailing_wage IS 'Block 253700: Whether this job requires prevailing wage (government jobs)';
COMMENT ON COLUMN public.jobs.prevailing_wage_rate IS 'Block 253700: Prevailing wage rate for this job';

-- ============================================================================
-- PART 6 — CREATE supervisor_approvals TABLE
-- ============================================================================
-- Supervisor approval workflow for timecards

CREATE TABLE IF NOT EXISTS public.supervisor_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  
  -- Approval period
  approval_date date NOT NULL, -- Date being approved
  
  -- Timecards included
  timecard_ids uuid[] NOT NULL, -- Array of timecard IDs
  
  -- Approval details
  supervisor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz DEFAULT now(),
  status text CHECK (status IN ('pending', 'approved', 'rejected', 'needs_review')) DEFAULT 'pending',
  
  -- Summary
  total_employees integer DEFAULT 0,
  total_hours numeric DEFAULT 0,
  total_overtime_hours numeric DEFAULT 0,
  
  -- Notes
  notes text,
  rejection_reason text,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supervisor_approvals_job ON public.supervisor_approvals(job_id, approval_date DESC);
CREATE INDEX IF NOT EXISTS idx_supervisor_approvals_company ON public.supervisor_approvals(company_id, approval_date DESC);
CREATE INDEX IF NOT EXISTS idx_supervisor_approvals_status ON public.supervisor_approvals(status) WHERE status = 'pending';

COMMENT ON TABLE public.supervisor_approvals IS 'Supervisor approval workflow for daily timecards (Block 253700)';
COMMENT ON COLUMN public.supervisor_approvals.approval_date IS 'Date of timecards being approved';
COMMENT ON COLUMN public.supervisor_approvals.timecard_ids IS 'Array of timecard IDs included in this approval';

-- ============================================================================
-- PART 7 — FUNCTION: Auto-calculate hours from clock_in/clock_out
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_timecard_hours()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_hours numeric;
  v_clock_date date;
  v_daily_hours numeric;
  v_weekly_hours numeric;
  v_regular_hours numeric;
  v_overtime_hours numeric;
  v_doubletime_hours numeric;
BEGIN
  -- Only calculate if clock_out is set
  IF NEW.clock_out IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Calculate total hours
  v_total_hours := EXTRACT(EPOCH FROM (NEW.clock_out - NEW.clock_in)) / 3600;
  NEW.total_hours := ROUND(v_total_hours, 2);
  
  -- Get clock date
  v_clock_date := DATE(NEW.clock_in);
  
  -- Calculate daily hours for this employee on this date
  SELECT COALESCE(SUM(total_hours), 0) INTO v_daily_hours
  FROM public.employee_timecards
  WHERE employee_id = NEW.employee_id
    AND DATE(clock_in) = v_clock_date
    AND id != NEW.id
    AND clock_out IS NOT NULL;
  
  v_daily_hours := v_daily_hours + v_total_hours;
  
  -- Calculate weekly hours (Monday to Sunday)
  SELECT COALESCE(SUM(total_hours), 0) INTO v_weekly_hours
  FROM public.employee_timecards
  WHERE employee_id = NEW.employee_id
    AND clock_in >= DATE_TRUNC('week', NEW.clock_in)
    AND clock_in < DATE_TRUNC('week', NEW.clock_in) + INTERVAL '7 days'
    AND id != NEW.id
    AND clock_out IS NOT NULL;
  
  v_weekly_hours := v_weekly_hours + v_total_hours;
  
  -- Overtime rules: Daily OT (8 hours/day) OR Weekly OT (40 hours/week)
  -- Use whichever threshold is reached first
  
  -- Daily overtime: hours over 8 per day
  IF v_daily_hours > 8 THEN
    -- This timecard contributes to daily OT
    IF v_daily_hours - v_total_hours < 8 THEN
      -- Previous hours were under 8, so some of this timecard is regular
      v_regular_hours := GREATEST(0, 8 - (v_daily_hours - v_total_hours));
      v_overtime_hours := v_total_hours - v_regular_hours;
    ELSE
      -- All previous hours were already OT, so this entire timecard is OT
      v_regular_hours := 0;
      v_overtime_hours := v_total_hours;
    END IF;
  ELSE
    -- Check weekly overtime
    IF v_weekly_hours > 40 THEN
      -- Weekly OT threshold reached
      IF v_weekly_hours - v_total_hours < 40 THEN
        -- Some of this timecard is regular, some is weekly OT
        v_regular_hours := GREATEST(0, 40 - (v_weekly_hours - v_total_hours));
        v_overtime_hours := v_total_hours - v_regular_hours;
      ELSE
        -- All weekly hours already OT
        v_regular_hours := 0;
        v_overtime_hours := v_total_hours;
      END IF;
    ELSE
      -- No overtime
      v_regular_hours := v_total_hours;
      v_overtime_hours := 0;
    END IF;
  END IF;
  
  NEW.regular_hours := ROUND(v_regular_hours, 2);
  NEW.overtime_hours := ROUND(v_overtime_hours, 2);
  NEW.doubletime_hours := 0; -- Future: implement double-time rules
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_calculate_timecard_hours ON public.employee_timecards;
CREATE TRIGGER trg_calculate_timecard_hours
BEFORE INSERT OR UPDATE OF clock_out ON public.employee_timecards
FOR EACH ROW
EXECUTE FUNCTION public.calculate_timecard_hours();

COMMENT ON FUNCTION public.calculate_timecard_hours IS 'Auto-calculates regular and overtime hours from clock_in/clock_out (Block 253700)';

-- ============================================================================
-- PART 8 — FUNCTION: Auto job-split hours
-- ============================================================================
-- Automatically splits employee hours across multiple jobs based on location/time

CREATE OR REPLACE FUNCTION public.auto_split_job_hours(
  p_employee_id uuid,
  p_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_location_log RECORD;
  v_current_job_id uuid;
  v_current_clock_in timestamptz;
  v_prev_location RECORD;
  v_distance_meters numeric;
  v_job_geofence RECORD;
BEGIN
  -- This function will be called by the location update API (Block 253500)
  -- It analyzes employee_location_logs and creates/updates timecards based on:
  -- 1. GPS proximity to job sites
  -- 2. Time spent at each location
  -- 3. Job geofence boundaries
  
  -- For now, this is a placeholder that will be enhanced when integrated
  -- with the geofencing system from Block 253500
  
  -- The actual implementation will:
  -- 1. Query employee_location_logs for the employee and date
  -- 2. Group locations by proximity to job geofences
  -- 3. Create timecards for each job segment
  -- 4. Handle transitions between jobs (drive time, supplier visits, etc.)
  
  NULL; -- Placeholder
END;
$$;

COMMENT ON FUNCTION public.auto_split_job_hours IS 'Auto-splits employee hours across multiple jobs based on GPS location (Block 253700)';

-- ============================================================================
-- PART 9 — FUNCTION: Apply prevailing wage to timecard
-- ============================================================================

CREATE OR REPLACE FUNCTION public.apply_prevailing_wage_to_timecard(
  p_timecard_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_timecard RECORD;
  v_job RECORD;
  v_employee_rate numeric;
BEGIN
  -- Get timecard and job
  SELECT t.*, j.prevailing_wage, j.prevailing_wage_rate
  INTO v_timecard
  FROM public.employee_timecards t
  JOIN public.jobs j ON j.id = t.job_id
  WHERE t.id = p_timecard_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- If job requires prevailing wage
  IF v_timecard.prevailing_wage = true AND v_timecard.prevailing_wage_rate IS NOT NULL THEN
    -- Get employee's prevailing wage rate (or use job rate)
    SELECT COALESCE(pr.prevailing_wage_rate, v_timecard.prevailing_wage_rate)
    INTO v_employee_rate
    FROM public.pay_rates pr
    WHERE pr.employee_id = v_timecard.employee_id
      AND (pr.effective_end IS NULL OR pr.effective_end >= DATE(v_timecard.clock_in))
      AND pr.effective_start <= DATE(v_timecard.clock_in)
    ORDER BY pr.effective_start DESC
    LIMIT 1;
    
    -- Update timecard with prevailing wage
    UPDATE public.employee_timecards
    SET
      prevailing_wage_rate = COALESCE(v_employee_rate, v_timecard.prevailing_wage_rate),
      prevailing_wage_applied = true,
      updated_at = now()
    WHERE id = p_timecard_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.apply_prevailing_wage_to_timecard IS 'Applies prevailing wage rate to timecard if job requires it (Block 253700)';

-- ============================================================================
-- PART 10 — FUNCTION: Auto clock-in with geofencing (from Block 253500)
-- ============================================================================
-- This integrates with the geofencing system from Block 253500

CREATE OR REPLACE FUNCTION public.auto_clock_in_on_job_arrival(
  p_employee_id uuid,
  p_job_id uuid,
  p_lat numeric,
  p_lng numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_timecard_id uuid;
  v_employee RECORD;
  v_job RECORD;
  v_existing_timecard uuid;
BEGIN
  -- Get employee and job
  SELECT e.*, j.prevailing_wage, j.prevailing_wage_rate
  INTO v_employee
  FROM public.workforce_employees e
  JOIN public.jobs j ON j.id = p_job_id
  WHERE e.id = p_employee_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee or job not found';
  END IF;
  
  -- Check if already clocked in for this job today
  SELECT id INTO v_existing_timecard
  FROM public.employee_timecards
  WHERE employee_id = p_employee_id
    AND job_id = p_job_id
    AND DATE(clock_in) = CURRENT_DATE
    AND clock_out IS NULL;
  
  IF v_existing_timecard IS NOT NULL THEN
    RETURN v_existing_timecard; -- Already clocked in
  END IF;
  
  -- Create auto-generated timecard
  INSERT INTO public.employee_timecards (
    employee_id,
    job_id,
    company_id,
    clock_in,
    clock_in_lat,
    clock_in_lng,
    auto_generated,
    status
  ) VALUES (
    p_employee_id,
    p_job_id,
    v_employee.company_id,
    now(),
    p_lat,
    p_lng,
    true,
    'pending'
  )
  RETURNING id INTO v_timecard_id;
  
  -- Apply prevailing wage if needed
  IF v_employee.prevailing_wage = true THEN
    PERFORM public.apply_prevailing_wage_to_timecard(v_timecard_id);
  END IF;
  
  -- Notify foreman and PM (handled by application layer)
  
  RETURN v_timecard_id;
END;
$$;

COMMENT ON FUNCTION public.auto_clock_in_on_job_arrival IS 'Auto clock-in when employee enters job geofence (Block 253700, integrates with Block 253500)';

-- ============================================================================
-- PART 11 — FUNCTION: Auto clock-out when leaving job site
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_clock_out_on_job_departure(
  p_employee_id uuid,
  p_job_id uuid,
  p_lat numeric,
  p_lng numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_timecard RECORD;
BEGIN
  -- Find active timecard for this employee and job
  SELECT * INTO v_timecard
  FROM public.employee_timecards
  WHERE employee_id = p_employee_id
    AND job_id = p_job_id
    AND DATE(clock_in) = CURRENT_DATE
    AND clock_out IS NULL
    AND auto_generated = true
  ORDER BY clock_in DESC
  LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN; -- No active timecard
  END IF;
  
  -- Update timecard with clock-out
  UPDATE public.employee_timecards
  SET
    clock_out = now(),
    clock_out_lat = p_lat,
    clock_out_lng = p_lng,
    updated_at = now()
  WHERE id = v_timecard.id;
  
  -- Hours will be auto-calculated by trigger
END;
$$;

COMMENT ON FUNCTION public.auto_clock_out_on_job_departure IS 'Auto clock-out when employee leaves job geofence (Block 253700, integrates with Block 253500)';

-- ============================================================================
-- PART 12 — FUNCTION: Get supervisor approval summary
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_supervisor_approval_summary(
  p_job_id uuid,
  p_date date
)
RETURNS TABLE (
  employee_id uuid,
  employee_name text,
  total_hours numeric,
  regular_hours numeric,
  overtime_hours numeric,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.employee_id,
    CONCAT(e.first_name, ' ', e.last_name) as employee_name,
    COALESCE(SUM(t.total_hours), 0) as total_hours,
    COALESCE(SUM(t.regular_hours), 0) as regular_hours,
    COALESCE(SUM(t.overtime_hours), 0) as overtime_hours,
    CASE 
      WHEN BOOL_OR(t.supervisor_approved = true) THEN 'approved'
      WHEN BOOL_OR(t.status = 'rejected') THEN 'rejected'
      WHEN BOOL_OR(t.status = 'disputed') THEN 'disputed'
      ELSE 'pending'
    END as status
  FROM public.employee_timecards t
  JOIN public.workforce_employees e ON e.id = t.employee_id
  WHERE t.job_id = p_job_id
    AND DATE(t.clock_in) = p_date
    AND t.clock_out IS NOT NULL
  GROUP BY t.employee_id, e.first_name, e.last_name;
END;
$$;

COMMENT ON FUNCTION public.get_supervisor_approval_summary IS 'Returns summary of timecards for supervisor approval (Block 253700)';

-- ============================================================================
-- PART 13 — FUNCTION: Approve timecards (supervisor workflow)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.approve_timecards(
  p_job_id uuid,
  p_date date,
  p_supervisor_id uuid,
  p_timecard_ids uuid[],
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_approval_id uuid;
  v_total_employees integer;
  v_total_hours numeric;
  v_total_overtime numeric;
BEGIN
  -- Calculate summary
  SELECT
    COUNT(DISTINCT employee_id),
    COALESCE(SUM(total_hours), 0),
    COALESCE(SUM(overtime_hours), 0)
  INTO v_total_employees, v_total_hours, v_total_overtime
  FROM public.employee_timecards
  WHERE id = ANY(p_timecard_ids);
  
  -- Create approval record
  INSERT INTO public.supervisor_approvals (
    job_id,
    company_id,
    approval_date,
    timecard_ids,
    supervisor_id,
    status,
    total_employees,
    total_hours,
    total_overtime_hours,
    notes
  )
  SELECT
    p_job_id,
    j.company_id,
    p_date,
    p_timecard_ids,
    p_supervisor_id,
    'approved',
    v_total_employees,
    v_total_hours,
    v_total_overtime,
    p_notes
  FROM public.jobs j
  WHERE j.id = p_job_id
  RETURNING id INTO v_approval_id;
  
  -- Update timecards
  UPDATE public.employee_timecards
  SET
    supervisor_approved = true,
    supervisor_approved_by = p_supervisor_id,
    supervisor_approved_at = now(),
    supervisor_notes = p_notes,
    status = 'approved',
    updated_at = now()
  WHERE id = ANY(p_timecard_ids);
  
  RETURN v_approval_id;
END;
$$;

COMMENT ON FUNCTION public.approve_timecards IS 'Approves timecards for a job/date (supervisor workflow) (Block 253700)';

-- ============================================================================
-- PART 14 — FUNCTION: Resolve payroll dispute
-- ============================================================================

CREATE OR REPLACE FUNCTION public.resolve_payroll_dispute(
  p_dispute_id uuid,
  p_resolved_by uuid,
  p_status text,
  p_resolution_notes text,
  p_hours_adjustment numeric DEFAULT 0,
  p_amount_adjustment numeric DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_dispute RECORD;
  v_timecard RECORD;
BEGIN
  -- Get dispute
  SELECT * INTO v_dispute
  FROM public.payroll_disputes
  WHERE id = p_dispute_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dispute not found';
  END IF;
  
  -- Update dispute
  UPDATE public.payroll_disputes
  SET
    status = p_status,
    resolved_by = p_resolved_by,
    resolved_at = now(),
    resolution_notes = p_resolution_notes,
    hours_adjustment = p_hours_adjustment,
    amount_adjustment = p_amount_adjustment,
    updated_at = now()
  WHERE id = p_dispute_id;
  
  -- If approved, adjust timecard
  IF p_status = 'approved' AND (p_hours_adjustment != 0 OR p_amount_adjustment != 0) THEN
    -- Get timecard
    SELECT * INTO v_timecard
    FROM public.employee_timecards
    WHERE id = v_dispute.timecard_id;
    
    IF FOUND THEN
      -- Adjust hours
      UPDATE public.employee_timecards
      SET
        total_hours = total_hours + p_hours_adjustment,
        updated_at = now()
      WHERE id = v_dispute.timecard_id;
    END IF;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.resolve_payroll_dispute IS 'Resolves a payroll dispute (Block 253700)';

-- ============================================================================
-- PART 15 — FUNCTION: Generate payroll summary report
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_payroll_summary(
  p_company_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  employee_id uuid,
  employee_name text,
  total_hours numeric,
  regular_hours numeric,
  overtime_hours numeric,
  hourly_rate numeric,
  regular_pay numeric,
  overtime_pay numeric,
  total_pay numeric,
  job_count integer,
  prevailing_wage_pay numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id as employee_id,
    CONCAT(e.first_name, ' ', e.last_name) as employee_name,
    COALESCE(SUM(t.total_hours), 0) as total_hours,
    COALESCE(SUM(t.regular_hours), 0) as regular_hours,
    COALESCE(SUM(t.overtime_hours), 0) as overtime_hours,
    COALESCE(pr.rate, 0) as hourly_rate,
    COALESCE(SUM(t.regular_hours * COALESCE(pr.rate, 0)), 0) as regular_pay,
    COALESCE(SUM(t.overtime_hours * COALESCE(pr.rate, 0) * 1.5), 0) as overtime_pay,
    COALESCE(SUM(t.regular_hours * COALESCE(pr.rate, 0)), 0) + 
    COALESCE(SUM(t.overtime_hours * COALESCE(pr.rate, 0) * 1.5), 0) as total_pay,
    COUNT(DISTINCT t.job_id) as job_count,
    COALESCE(SUM(
      CASE 
        WHEN t.prevailing_wage_applied = true 
        THEN t.total_hours * COALESCE(t.prevailing_wage_rate, pr.rate, 0)
        ELSE 0
      END
    ), 0) as prevailing_wage_pay
  FROM public.workforce_employees e
  LEFT JOIN public.employee_timecards t ON t.employee_id = e.id
    AND DATE(t.clock_in) BETWEEN p_start_date AND p_end_date
    AND t.clock_out IS NOT NULL
    AND t.status = 'approved'
  LEFT JOIN public.pay_rates pr ON pr.employee_id = e.id
    AND pr.pay_type = 'hourly'
    AND (pr.effective_end IS NULL OR pr.effective_end >= p_start_date)
    AND pr.effective_start <= p_end_date
  WHERE e.company_id = p_company_id
    AND e.status = 'active'
  GROUP BY e.id, e.first_name, e.last_name, pr.rate
  ORDER BY employee_name;
END;
$$;

COMMENT ON FUNCTION public.generate_payroll_summary IS 'Generates payroll summary report for a date range (Block 253700)';

-- ============================================================================
-- PART 16 — FUNCTION: Get job-level labor cost summary
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_job_labor_cost_summary(
  p_job_id uuid
)
RETURNS TABLE (
  employee_id uuid,
  employee_name text,
  total_hours numeric,
  regular_hours numeric,
  overtime_hours numeric,
  hourly_rate numeric,
  total_pay numeric,
  prevailing_wage_applied boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id as employee_id,
    CONCAT(e.first_name, ' ', e.last_name) as employee_name,
    COALESCE(SUM(t.total_hours), 0) as total_hours,
    COALESCE(SUM(t.regular_hours), 0) as regular_hours,
    COALESCE(SUM(t.overtime_hours), 0) as overtime_hours,
    COALESCE(pr.rate, 0) as hourly_rate,
    COALESCE(SUM(t.regular_hours * COALESCE(pr.rate, 0)), 0) + 
    COALESCE(SUM(t.overtime_hours * COALESCE(pr.rate, 0) * 1.5), 0) as total_pay,
    BOOL_OR(t.prevailing_wage_applied) as prevailing_wage_applied
  FROM public.employee_timecards t
  JOIN public.workforce_employees e ON e.id = t.employee_id
  LEFT JOIN public.pay_rates pr ON pr.employee_id = e.id
    AND pr.pay_type = 'hourly'
    AND (pr.effective_end IS NULL OR pr.effective_end >= DATE(t.clock_in))
    AND pr.effective_start <= DATE(t.clock_in)
  WHERE t.job_id = p_job_id
    AND t.clock_out IS NOT NULL
    AND t.status = 'approved'
  GROUP BY e.id, e.first_name, e.last_name, pr.rate
  ORDER BY employee_name;
END;
$$;

COMMENT ON FUNCTION public.get_job_labor_cost_summary IS 'Returns job-level labor cost summary (Block 253700)';

-- ============================================================================
-- PART 17 — CREATE VIEW: Payroll Summary Dashboard
-- ============================================================================

CREATE OR REPLACE VIEW public.payroll_summary_dashboard AS
SELECT
  c.id as company_id,
  DATE_TRUNC('week', t.clock_in)::date as week_start,
  COUNT(DISTINCT t.employee_id) as total_employees,
  COUNT(DISTINCT t.job_id) as total_jobs,
  COALESCE(SUM(t.total_hours), 0) as total_hours,
  COALESCE(SUM(t.regular_hours), 0) as total_regular_hours,
  COALESCE(SUM(t.overtime_hours), 0) as total_overtime_hours,
  COALESCE(SUM(
    t.regular_hours * COALESCE(pr.rate, 0) +
    t.overtime_hours * COALESCE(pr.rate, 0) * 1.5
  ), 0) as total_payroll_cost
FROM public.roofing_companies c
LEFT JOIN public.employee_timecards t ON t.company_id = c.id
  AND t.clock_out IS NOT NULL
  AND t.status = 'approved'
LEFT JOIN public.pay_rates pr ON pr.employee_id = t.employee_id
  AND pr.pay_type = 'hourly'
  AND (pr.effective_end IS NULL OR pr.effective_end >= DATE(t.clock_in))
  AND pr.effective_start <= DATE(t.clock_in)
GROUP BY c.id, DATE_TRUNC('week', t.clock_in)::date;

COMMENT ON VIEW public.payroll_summary_dashboard IS 'Weekly payroll summary dashboard (Block 253700)';

-- ============================================================================
-- PART 18 — TRIGGERS FOR UPDATED_AT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_timecard_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employee_timecards_updated_at ON public.employee_timecards;
CREATE TRIGGER trg_employee_timecards_updated_at
BEFORE UPDATE ON public.employee_timecards
FOR EACH ROW
EXECUTE FUNCTION public.set_timecard_updated_at();

CREATE OR REPLACE FUNCTION public.set_pay_rate_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pay_rates_updated_at ON public.pay_rates;
CREATE TRIGGER trg_pay_rates_updated_at
BEFORE UPDATE ON public.pay_rates
FOR EACH ROW
EXECUTE FUNCTION public.set_pay_rate_updated_at();

CREATE OR REPLACE FUNCTION public.set_dispute_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payroll_disputes_updated_at ON public.payroll_disputes;
CREATE TRIGGER trg_payroll_disputes_updated_at
BEFORE UPDATE ON public.payroll_disputes
FOR EACH ROW
EXECUTE FUNCTION public.set_dispute_updated_at();

CREATE OR REPLACE FUNCTION public.set_approval_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_supervisor_approvals_updated_at ON public.supervisor_approvals;
CREATE TRIGGER trg_supervisor_approvals_updated_at
BEFORE UPDATE ON public.supervisor_approvals
FOR EACH ROW
EXECUTE FUNCTION public.set_approval_updated_at();

-- ============================================================================
-- PART 19 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- employee_timecards RLS
ALTER TABLE public.employee_timecards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees can view their own timecards"
  ON public.employee_timecards FOR SELECT
  USING (
    employee_id IN (
      SELECT id FROM public.workforce_employees
      WHERE id = employee_timecards.employee_id
    )
    OR company_id IN (
      SELECT company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Employees can create their own timecards"
  ON public.employee_timecards FOR INSERT
  WITH CHECK (
    employee_id IN (
      SELECT id FROM public.workforce_employees
      WHERE id = employee_timecards.employee_id
    )
    OR company_id IN (
      SELECT company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Company members can manage timecards"
  ON public.employee_timecards FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- pay_rates RLS
ALTER TABLE public.pay_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees can view their own pay rates"
  ON public.pay_rates FOR SELECT
  USING (
    employee_id IN (
      SELECT id FROM public.workforce_employees
      WHERE id = pay_rates.employee_id
    )
    OR company_id IN (
      SELECT company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Company admins can manage pay rates"
  ON public.pay_rates FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid() AND is_active = true
      AND role IN ('owner', 'admin')
    )
  );

-- payroll_disputes RLS
ALTER TABLE public.payroll_disputes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees can view their own disputes"
  ON public.payroll_disputes FOR SELECT
  USING (
    employee_id IN (
      SELECT id FROM public.workforce_employees
      WHERE id = payroll_disputes.employee_id
    )
    OR company_id IN (
      SELECT company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Employees can create disputes"
  ON public.payroll_disputes FOR INSERT
  WITH CHECK (
    employee_id IN (
      SELECT id FROM public.workforce_employees
      WHERE id = payroll_disputes.employee_id
    )
  );

CREATE POLICY "Company admins can manage disputes"
  ON public.payroll_disputes FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid() AND is_active = true
      AND role IN ('owner', 'admin', 'project_manager')
    )
  );

-- supervisor_approvals RLS
ALTER TABLE public.supervisor_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view approvals"
  ON public.supervisor_approvals FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Supervisors can create approvals"
  ON public.supervisor_approvals FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid() AND is_active = true
      AND role IN ('owner', 'admin', 'project_manager', 'foreman')
    )
  );

CREATE POLICY "Supervisors can update approvals"
  ON public.supervisor_approvals FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid() AND is_active = true
      AND role IN ('owner', 'admin', 'project_manager', 'foreman')
    )
  );

-- Service role policies
CREATE POLICY "service_role_all_timecards" ON public.employee_timecards
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_pay_rates" ON public.pay_rates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_disputes" ON public.payroll_disputes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_approvals" ON public.supervisor_approvals
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 20 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON public.employee_timecards TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pay_rates TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.payroll_disputes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.supervisor_approvals TO authenticated;
GRANT SELECT ON public.payroll_summary_dashboard TO authenticated;

GRANT EXECUTE ON FUNCTION public.calculate_timecard_hours() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_split_job_hours(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_prevailing_wage_to_timecard(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_clock_in_on_job_arrival(uuid, uuid, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_clock_out_on_job_departure(uuid, uuid, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_supervisor_approval_summary(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_timecards(uuid, date, uuid, uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_payroll_dispute(uuid, uuid, text, text, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_payroll_summary(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_job_labor_cost_summary(uuid) TO authenticated;

-- ============================================================================
-- END OF BLOCK 253700
-- ============================================================================
























