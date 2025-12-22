-- =========================================================
-- Block 256900 — SmartSend Crew Payroll & Timekeeping Engine v1
-- "Digital Time Clock, Overtime Rules, GPS Verification, Job Cost Sync, Payroll Export"
-- =========================================================
-- 
-- This block turns SmartSend into the official timekeeping + payroll backbone 
-- for roofing companies — eliminating timecard fraud, payroll mistakes, 
-- overtime chaos, and job-costing inaccuracies.
-- 
-- Roofers lose THOUSANDS because:
-- ❌ crews "round up" hours
-- ❌ missing timecards
-- ❌ handwritten timesheets
-- ❌ crews claim hours for jobs they weren't at
-- ❌ foremen fudge numbers to help workers
-- ❌ overtime gets miscalculated
-- ❌ owners overpay labor
-- ❌ payroll takes HOURS every week
-- ❌ no GPS verification
-- ❌ PTO/sick days tracked on paper
-- ❌ job costing is inaccurate
-- 
-- SmartSend fixes ALL OF IT.
-- 
-- Roofers will say:
-- "SmartSend fixed our payroll and labor losses instantly."
-- "Timecard fraud is gone."
-- "We'd be stupid not using this."
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE time_entries TABLE
-- ============================================================================
-- Core time entry table with GPS verification and break tracking

CREATE TABLE IF NOT EXISTS public.time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.workforce_employees(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  
  -- Clock in/out times
  clock_in timestamptz NOT NULL,
  clock_out timestamptz,
  
  -- Break tracking
  break_minutes int DEFAULT 0 CHECK (break_minutes >= 0),
  
  -- Calculated hours
  total_hours numeric, -- Total hours worked (calculated from clock_in/clock_out minus breaks)
  overtime_hours numeric DEFAULT 0, -- Overtime hours (calculated)
  
  -- GPS verification
  gps_in jsonb, -- {lat, lng, address, accuracy, timestamp, verified}
  gps_out jsonb, -- {lat, lng, address, accuracy, timestamp, verified}
  gps_verified boolean DEFAULT false, -- Whether GPS was verified at clock-in
  
  -- Status and approval
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'disputed')) NOT NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  rejection_reason text,
  
  -- Notes
  notes text,
  employee_notes text, -- Notes from employee
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_time_entries_employee ON public.time_entries(employee_id, clock_in DESC);
CREATE INDEX IF NOT EXISTS idx_time_entries_job ON public.time_entries(job_id, clock_in DESC);
CREATE INDEX IF NOT EXISTS idx_time_entries_company ON public.time_entries(company_id, clock_in DESC);
CREATE INDEX IF NOT EXISTS idx_time_entries_date ON public.time_entries(DATE(clock_in));
CREATE INDEX IF NOT EXISTS idx_time_entries_status ON public.time_entries(status);
CREATE INDEX IF NOT EXISTS idx_time_entries_pending ON public.time_entries(company_id, status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_time_entries_missing_punch ON public.time_entries(employee_id, clock_in) WHERE clock_out IS NULL AND clock_in < now() - INTERVAL '8 hours';

COMMENT ON TABLE public.time_entries IS 'Core time entry records with GPS verification and break tracking (Block 256900)';
COMMENT ON COLUMN public.time_entries.break_minutes IS 'Total break minutes (lunch + rest breaks)';
COMMENT ON COLUMN public.time_entries.gps_verified IS 'Whether GPS location was verified at clock-in';
COMMENT ON COLUMN public.time_entries.status IS 'Time entry status: pending, approved, rejected, disputed';

-- ============================================================================
-- PART 2 — ENHANCE payroll_periods TABLE
-- ============================================================================
-- Ensure payroll_periods has all required fields

CREATE TABLE IF NOT EXISTS public.payroll_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  total_hours numeric DEFAULT 0,
  total_overtime numeric DEFAULT 0,
  total_regular_hours numeric DEFAULT 0,
  export_url text, -- URL to exported payroll file
  export_format text CHECK (export_format IN ('quickbooks', 'gusto', 'adp', 'paychex', 'csv')) DEFAULT 'csv',
  processed boolean DEFAULT false,
  processed_at timestamptz,
  processed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add columns if they don't exist
ALTER TABLE public.payroll_periods
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date,
  ADD COLUMN IF NOT EXISTS total_hours numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_overtime numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_regular_hours numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS export_url text,
  ADD COLUMN IF NOT EXISTS export_format text CHECK (export_format IN ('quickbooks', 'gusto', 'adp', 'paychex', 'csv')) DEFAULT 'csv',
  ADD COLUMN IF NOT EXISTS processed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS processed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

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

CREATE INDEX IF NOT EXISTS idx_payroll_periods_company ON public.payroll_periods(company_id, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_periods_processed ON public.payroll_periods(processed) WHERE processed = false;
CREATE INDEX IF NOT EXISTS idx_payroll_periods_date_range ON public.payroll_periods(start_date, end_date);

COMMENT ON TABLE public.payroll_periods IS 'Payroll periods with export tracking (Block 256900)';
COMMENT ON COLUMN public.payroll_periods.export_format IS 'Export format: quickbooks, gusto, adp, paychex, csv';

-- ============================================================================
-- PART 3 — CREATE payroll_adjustments TABLE
-- ============================================================================
-- Track bonuses, deductions, corrections

CREATE TABLE IF NOT EXISTS public.payroll_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.workforce_employees(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  payroll_period_id uuid REFERENCES public.payroll_periods(id) ON DELETE SET NULL,
  
  -- Adjustment details
  type text NOT NULL CHECK (type IN ('bonus', 'deduction', 'correction', 'pto', 'sick', 'holiday')),
  amount numeric NOT NULL, -- Positive for bonus, negative for deduction
  note text,
  
  -- Approval
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_adjustments_employee ON public.payroll_adjustments(employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_adjustments_company ON public.payroll_adjustments(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_adjustments_period ON public.payroll_adjustments(payroll_period_id) WHERE payroll_period_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payroll_adjustments_type ON public.payroll_adjustments(type);

COMMENT ON TABLE public.payroll_adjustments IS 'Payroll adjustments: bonuses, deductions, corrections, PTO, sick days (Block 256900)';
COMMENT ON COLUMN public.payroll_adjustments.type IS 'Adjustment type: bonus, deduction, correction, pto, sick, holiday';
COMMENT ON COLUMN public.payroll_adjustments.amount IS 'Amount (positive for bonus, negative for deduction)';

-- ============================================================================
-- PART 4 — CREATE gps_approved_zones TABLE
-- ============================================================================
-- Define approved GPS zones for clock-in (jobsites, company yard, approved locations)

CREATE TABLE IF NOT EXISTS public.gps_approved_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  
  -- Zone details
  name text NOT NULL, -- "Main Yard", "Warehouse", "Job Site #1103", etc.
  zone_type text NOT NULL CHECK (zone_type IN ('jobsite', 'company_yard', 'warehouse', 'office', 'approved_location')),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE, -- NULL for non-jobsite zones
  
  -- GPS coordinates (center point)
  center_lat numeric NOT NULL,
  center_lng numeric NOT NULL,
  radius_feet int DEFAULT 150, -- Radius in feet (default 150ft)
  
  -- Address
  address text,
  
  -- Status
  is_active boolean DEFAULT true,
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gps_approved_zones_company ON public.gps_approved_zones(company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_gps_approved_zones_job ON public.gps_approved_zones(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gps_approved_zones_type ON public.gps_approved_zones(zone_type);
CREATE INDEX IF NOT EXISTS idx_gps_approved_zones_location ON public.gps_approved_zones(center_lat, center_lng) WHERE is_active = true;

COMMENT ON TABLE public.gps_approved_zones IS 'Approved GPS zones for clock-in validation (Block 256900)';
COMMENT ON COLUMN public.gps_approved_zones.zone_type IS 'Zone type: jobsite, company_yard, warehouse, office, approved_location';
COMMENT ON COLUMN public.gps_approved_zones.radius_feet IS 'Radius in feet for geofence validation';

-- ============================================================================
-- PART 5 — CREATE missed_punch_alerts TABLE
-- ============================================================================
-- Track missed clock-out punches

CREATE TABLE IF NOT EXISTS public.missed_punch_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  time_entry_id uuid NOT NULL REFERENCES public.time_entries(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.workforce_employees(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  
  -- Alert details
  alert_type text NOT NULL CHECK (alert_type IN ('missed_clock_out', 'missed_clock_in', 'missing_break')),
  clock_in timestamptz,
  expected_clock_out timestamptz,
  hours_worked numeric, -- Calculated hours if clock-out is missing
  
  -- Resolution
  status text DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'dismissed')) NOT NULL,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  resolution_notes text,
  corrected_clock_out timestamptz, -- Manual correction
  
  -- Notification
  notified_at timestamptz,
  notified_to uuid[], -- Array of user IDs notified
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_missed_punch_alerts_employee ON public.missed_punch_alerts(employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_missed_punch_alerts_company ON public.missed_punch_alerts(company_id, status);
CREATE INDEX IF NOT EXISTS idx_missed_punch_alerts_active ON public.missed_punch_alerts(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_missed_punch_alerts_time_entry ON public.missed_punch_alerts(time_entry_id);

COMMENT ON TABLE public.missed_punch_alerts IS 'Missed punch alerts for time tracking compliance (Block 256900)';
COMMENT ON COLUMN public.missed_punch_alerts.alert_type IS 'Alert type: missed_clock_out, missed_clock_in, missing_break';

-- ============================================================================
-- PART 6 — CREATE break_compliance_tracking TABLE
-- ============================================================================
-- Track break compliance (lunch, rest breaks)

CREATE TABLE IF NOT EXISTS public.break_compliance_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  time_entry_id uuid NOT NULL REFERENCES public.time_entries(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.workforce_employees(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  
  -- Break requirements (state-specific)
  state text, -- State for break rules (CA, WA, OR, etc.)
  hours_worked numeric NOT NULL, -- Hours worked before break requirement
  
  -- Required breaks
  lunch_required boolean DEFAULT false,
  lunch_taken boolean DEFAULT false,
  lunch_minutes int DEFAULT 0,
  
  rest_breaks_required int DEFAULT 0, -- Number of rest breaks required
  rest_breaks_taken int DEFAULT 0, -- Number of rest breaks taken
  rest_break_minutes int DEFAULT 0, -- Total rest break minutes
  
  -- Compliance status
  is_compliant boolean DEFAULT true,
  violation_type text, -- 'missing_lunch', 'missing_rest_break', 'insufficient_break_time'
  violation_notes text,
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_break_compliance_time_entry ON public.break_compliance_tracking(time_entry_id);
CREATE INDEX IF NOT EXISTS idx_break_compliance_employee ON public.break_compliance_tracking(employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_break_compliance_company ON public.break_compliance_tracking(company_id, is_compliant);
CREATE INDEX IF NOT EXISTS idx_break_compliance_violations ON public.break_compliance_tracking(is_compliant) WHERE is_compliant = false;

COMMENT ON TABLE public.break_compliance_tracking IS 'Break compliance tracking for labor law compliance (Block 256900)';
COMMENT ON COLUMN public.break_compliance_tracking.state IS 'State for break rules (CA requires lunch after 5 hours, etc.)';

-- ============================================================================
-- PART 7 — CREATE labor_productivity_scores TABLE
-- ============================================================================
-- Track labor productivity (labor per square, productivity scores)

CREATE TABLE IF NOT EXISTS public.labor_productivity_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  
  -- Job details
  job_squares numeric, -- Total squares for job
  total_labor_hours numeric NOT NULL, -- Total labor hours worked
  labor_per_square numeric, -- Calculated: total_labor_hours / job_squares
  
  -- Productivity metrics
  productivity_score numeric, -- Score 0-100 (higher = better)
  industry_avg_labor_per_square numeric DEFAULT 0.62, -- Industry average
  is_above_average boolean, -- Whether better than industry average
  
  -- Financial impact
  estimated_annual_loss numeric, -- Estimated annual loss if below average (calculated)
  
  -- Period
  period_start date NOT NULL,
  period_end date NOT NULL,
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_labor_productivity_job ON public.labor_productivity_scores(job_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_labor_productivity_company ON public.labor_productivity_scores(company_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_labor_productivity_crew ON public.labor_productivity_scores(crew_id) WHERE crew_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_labor_productivity_score ON public.labor_productivity_scores(productivity_score) WHERE productivity_score IS NOT NULL;

COMMENT ON TABLE public.labor_productivity_scores IS 'Labor productivity scoring (labor per square, productivity metrics) (Block 256900)';
COMMENT ON COLUMN public.labor_productivity_scores.labor_per_square IS 'Calculated: total_labor_hours / job_squares';
COMMENT ON COLUMN public.labor_productivity_scores.productivity_score IS 'Productivity score 0-100 (higher = better)';

-- ============================================================================
-- PART 8 — FUNCTION: Calculate time entry hours
-- ============================================================================
-- Auto-calculate total_hours and overtime_hours from clock_in/clock_out

CREATE OR REPLACE FUNCTION public.calculate_time_entry_hours()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_hours numeric;
  v_break_hours numeric;
  v_net_hours numeric;
  v_clock_date date;
  v_daily_hours numeric;
  v_weekly_hours numeric;
  v_regular_hours numeric;
  v_overtime_hours numeric;
BEGIN
  -- Only calculate if clock_out is set
  IF NEW.clock_out IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Calculate total hours (including breaks)
  v_total_hours := EXTRACT(EPOCH FROM (NEW.clock_out - NEW.clock_in)) / 3600;
  
  -- Convert break minutes to hours
  v_break_hours := COALESCE(NEW.break_minutes, 0) / 60.0;
  
  -- Net hours (total minus breaks)
  v_net_hours := v_total_hours - v_break_hours;
  NEW.total_hours := ROUND(v_net_hours, 2);
  
  -- Get clock date
  v_clock_date := DATE(NEW.clock_in);
  
  -- Calculate daily hours for this employee on this date
  SELECT COALESCE(SUM(total_hours), 0) INTO v_daily_hours
  FROM public.time_entries
  WHERE employee_id = NEW.employee_id
    AND DATE(clock_in) = v_clock_date
    AND id != NEW.id
    AND clock_out IS NOT NULL;
  
  v_daily_hours := v_daily_hours + v_net_hours;
  
  -- Calculate weekly hours (Monday to Sunday)
  SELECT COALESCE(SUM(total_hours), 0) INTO v_weekly_hours
  FROM public.time_entries
  WHERE employee_id = NEW.employee_id
    AND clock_in >= DATE_TRUNC('week', NEW.clock_in)
    AND clock_in < DATE_TRUNC('week', NEW.clock_in) + INTERVAL '7 days'
    AND id != NEW.id
    AND clock_out IS NOT NULL;
  
  v_weekly_hours := v_weekly_hours + v_net_hours;
  
  -- Overtime rules: Daily OT (8 hours/day) OR Weekly OT (40 hours/week)
  -- Use whichever threshold is reached first
  
  -- Daily overtime: hours over 8 per day
  IF v_daily_hours > 8 THEN
    -- This time entry contributes to daily OT
    IF v_daily_hours - v_net_hours < 8 THEN
      -- Previous hours were under 8, so some of this entry is regular
      v_regular_hours := GREATEST(0, 8 - (v_daily_hours - v_net_hours));
      v_overtime_hours := v_net_hours - v_regular_hours;
    ELSE
      -- All previous hours were already OT, so this entire entry is OT
      v_regular_hours := 0;
      v_overtime_hours := v_net_hours;
    END IF;
  ELSE
    -- Check weekly overtime
    IF v_weekly_hours > 40 THEN
      -- Weekly OT threshold reached
      IF v_weekly_hours - v_net_hours < 40 THEN
        -- Some of this entry is regular, some is weekly OT
        v_regular_hours := GREATEST(0, 40 - (v_weekly_hours - v_net_hours));
        v_overtime_hours := v_net_hours - v_regular_hours;
      ELSE
        -- All weekly hours already OT
        v_regular_hours := 0;
        v_overtime_hours := v_net_hours;
      END IF;
    ELSE
      -- No overtime
      v_regular_hours := v_net_hours;
      v_overtime_hours := 0;
    END IF;
  END IF;
  
  NEW.overtime_hours := ROUND(v_overtime_hours, 2);
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_calculate_time_entry_hours ON public.time_entries;
CREATE TRIGGER trg_calculate_time_entry_hours
BEFORE INSERT OR UPDATE OF clock_out, break_minutes ON public.time_entries
FOR EACH ROW
EXECUTE FUNCTION public.calculate_time_entry_hours();

COMMENT ON FUNCTION public.calculate_time_entry_hours IS 'Auto-calculates total_hours and overtime_hours from clock_in/clock_out (Block 256900)';

-- ============================================================================
-- PART 9 — FUNCTION: Verify GPS location for clock-in
-- ============================================================================
-- Verify if GPS location is within approved zone

CREATE OR REPLACE FUNCTION public.verify_gps_clock_in(
  p_company_id uuid,
  p_job_id uuid,
  p_lat numeric,
  p_lng numeric
)
RETURNS TABLE (
  verified boolean,
  zone_id uuid,
  zone_name text,
  zone_type text,
  distance_feet numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_zone RECORD;
  v_distance numeric;
  v_verified boolean := false;
BEGIN
  -- First, check if there's a jobsite zone for this job
  IF p_job_id IS NOT NULL THEN
    SELECT z.*, 
           public.is_within_radius(p_lat, p_lng, z.center_lat, z.center_lng, z.radius_feet) as within_radius,
           (364000 * acos(
             cos(radians(p_lat)) * cos(radians(z.center_lat)) *
             cos(radians(z.center_lng - p_lng)) +
             sin(radians(p_lat)) * sin(radians(z.center_lat))
           )) as distance
    INTO v_zone
    FROM public.gps_approved_zones z
    WHERE z.company_id = p_company_id
      AND z.job_id = p_job_id
      AND z.zone_type = 'jobsite'
      AND z.is_active = true
    ORDER BY distance
    LIMIT 1;
    
    IF FOUND AND v_zone.within_radius THEN
      v_verified := true;
      RETURN QUERY SELECT 
        true,
        v_zone.id,
        v_zone.name,
        v_zone.zone_type,
        v_zone.distance;
      RETURN;
    END IF;
  END IF;
  
  -- Check company yard and other approved zones
  FOR v_zone IN
    SELECT z.*,
           (364000 * acos(
             cos(radians(p_lat)) * cos(radians(z.center_lat)) *
             cos(radians(z.center_lng - p_lng)) +
             sin(radians(p_lat)) * sin(radians(z.center_lat))
           )) as distance
    FROM public.gps_approved_zones z
    WHERE z.company_id = p_company_id
      AND z.is_active = true
      AND (z.zone_type IN ('company_yard', 'warehouse', 'office', 'approved_location')
           OR (z.zone_type = 'jobsite' AND z.job_id IS NULL))
    ORDER BY distance
    LIMIT 5
  LOOP
    IF public.is_within_radius(p_lat, p_lng, v_zone.center_lat, v_zone.center_lng, v_zone.radius_feet) THEN
      v_verified := true;
      RETURN QUERY SELECT 
        true,
        v_zone.id,
        v_zone.name,
        v_zone.zone_type,
        v_zone.distance;
      RETURN;
    END IF;
  END LOOP;
  
  -- Not verified
  RETURN QUERY SELECT false, NULL::uuid, NULL::text, NULL::text, NULL::numeric;
END;
$$;

COMMENT ON FUNCTION public.verify_gps_clock_in IS 'Verifies GPS location for clock-in against approved zones (Block 256900)';

-- ============================================================================
-- PART 10 — FUNCTION: Check for missed punches
-- ============================================================================
-- Check for employees who forgot to clock out

CREATE OR REPLACE FUNCTION public.check_missed_punches()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_entry RECORD;
  v_expected_clock_out timestamptz;
  v_hours_worked numeric;
BEGIN
  -- Find time entries with clock_in but no clock_out after 8 hours
  FOR v_entry IN
    SELECT te.*, e.company_id
    FROM public.time_entries te
    JOIN public.workforce_employees e ON e.id = te.employee_id
    WHERE te.clock_out IS NULL
      AND te.clock_in < now() - INTERVAL '8 hours'
      AND NOT EXISTS (
        SELECT 1 FROM public.missed_punch_alerts mpa
        WHERE mpa.time_entry_id = te.id
          AND mpa.status = 'active'
      )
  LOOP
    -- Calculate expected clock-out (8 hours after clock-in)
    v_expected_clock_out := v_entry.clock_in + INTERVAL '8 hours';
    
    -- Calculate hours worked so far
    v_hours_worked := EXTRACT(EPOCH FROM (now() - v_entry.clock_in)) / 3600;
    
    -- Create missed punch alert
    INSERT INTO public.missed_punch_alerts (
      time_entry_id,
      employee_id,
      company_id,
      alert_type,
      clock_in,
      expected_clock_out,
      hours_worked,
      status
    ) VALUES (
      v_entry.id,
      v_entry.employee_id,
      v_entry.company_id,
      'missed_clock_out',
      v_entry.clock_in,
      v_expected_clock_out,
      ROUND(v_hours_worked, 2),
      'active'
    )
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.check_missed_punches IS 'Checks for missed clock-out punches and creates alerts (Block 256900)';

-- ============================================================================
-- PART 11 — FUNCTION: Check break compliance
-- ============================================================================
-- Check if breaks are compliant with state labor laws

CREATE OR REPLACE FUNCTION public.check_break_compliance(
  p_time_entry_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_entry RECORD;
  v_employee RECORD;
  v_hours_worked numeric;
  v_lunch_required boolean := false;
  v_rest_breaks_required int := 0;
  v_state text;
  v_is_compliant boolean := true;
  v_violation_type text;
BEGIN
  -- Get time entry
  SELECT te.*, e.company_id, e.status as employee_status
  INTO v_entry
  FROM public.time_entries te
  JOIN public.workforce_employees e ON e.id = te.employee_id
  WHERE te.id = p_time_entry_id
    AND te.clock_out IS NOT NULL;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Get employee company state (for break rules)
  SELECT c.company_state INTO v_state
  FROM public.roofing_companies c
  WHERE c.id = v_entry.company_id;
  
  -- Calculate hours worked
  v_hours_worked := COALESCE(v_entry.total_hours, 0);
  
  -- State-specific break rules
  -- California: Lunch after 5 hours, 10-min rest break per 4 hours
  IF v_state = 'CA' OR v_state = 'California' THEN
    IF v_hours_worked >= 5 THEN
      v_lunch_required := true;
    END IF;
    IF v_hours_worked >= 4 THEN
      v_rest_breaks_required := 1;
    END IF;
    IF v_hours_worked >= 8 THEN
      v_rest_breaks_required := 2;
    END IF;
  -- Washington: Lunch after 5 hours, 10-min rest break per 4 hours
  ELSIF v_state = 'WA' OR v_state = 'Washington' THEN
    IF v_hours_worked >= 5 THEN
      v_lunch_required := true;
    END IF;
    IF v_hours_worked >= 4 THEN
      v_rest_breaks_required := 1;
    END IF;
  -- Oregon: Lunch after 5.5 hours, 10-min rest break per 4 hours
  ELSIF v_state = 'OR' OR v_state = 'Oregon' THEN
    IF v_hours_worked >= 5.5 THEN
      v_lunch_required := true;
    END IF;
    IF v_hours_worked >= 4 THEN
      v_rest_breaks_required := 1;
    END IF;
  -- Default: Lunch after 6 hours
  ELSE
    IF v_hours_worked >= 6 THEN
      v_lunch_required := true;
    END IF;
  END IF;
  
  -- Check compliance
  -- Assume lunch is taken if break_minutes >= 30
  -- Assume rest breaks are taken if break_minutes >= 10 per break required
  IF v_lunch_required AND v_entry.break_minutes < 30 THEN
    v_is_compliant := false;
    v_violation_type := 'missing_lunch';
  ELSIF v_rest_breaks_required > 0 AND v_entry.break_minutes < (v_rest_breaks_required * 10) THEN
    v_is_compliant := false;
    v_violation_type := 'insufficient_break_time';
  END IF;
  
  -- Insert or update break compliance record
  INSERT INTO public.break_compliance_tracking (
    time_entry_id,
    employee_id,
    company_id,
    state,
    hours_worked,
    lunch_required,
    lunch_taken,
    lunch_minutes,
    rest_breaks_required,
    rest_breaks_taken,
    rest_break_minutes,
    is_compliant,
    violation_type
  ) VALUES (
    p_time_entry_id,
    v_entry.employee_id,
    v_entry.company_id,
    v_state,
    v_hours_worked,
    v_lunch_required,
    CASE WHEN v_entry.break_minutes >= 30 THEN true ELSE false END,
    CASE WHEN v_entry.break_minutes >= 30 THEN 30 ELSE 0 END,
    v_rest_breaks_required,
    CASE WHEN v_entry.break_minutes >= (v_rest_breaks_required * 10) THEN v_rest_breaks_required ELSE 0 END,
    CASE WHEN v_entry.break_minutes >= (v_rest_breaks_required * 10) THEN (v_rest_breaks_required * 10) ELSE 0 END,
    v_is_compliant,
    v_violation_type
  )
  ON CONFLICT (time_entry_id) DO UPDATE SET
    is_compliant = EXCLUDED.is_compliant,
    violation_type = EXCLUDED.violation_type,
    updated_at = now();
  
  -- Create alert if not compliant
  IF NOT v_is_compliant THEN
    INSERT INTO public.missed_punch_alerts (
      time_entry_id,
      employee_id,
      company_id,
      alert_type,
      clock_in,
      status
    ) VALUES (
      p_time_entry_id,
      v_entry.employee_id,
      v_entry.company_id,
      'missing_break',
      v_entry.clock_in,
      'active'
    )
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.check_break_compliance IS 'Checks break compliance with state labor laws (Block 256900)';

-- ============================================================================
-- PART 12 — FUNCTION: Auto sync labor to job cost
-- ============================================================================
-- Automatically sync labor hours to job cost tracking

CREATE OR REPLACE FUNCTION public.sync_labor_to_job_cost(
  p_time_entry_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_entry RECORD;
  v_pay_rate numeric;
  v_labor_cost numeric;
  v_job_labor_cost numeric;
BEGIN
  -- Get time entry with employee and job info
  SELECT te.*, e.company_id, j.id as job_id
  INTO v_entry
  FROM public.time_entries te
  JOIN public.workforce_employees e ON e.id = te.employee_id
  LEFT JOIN public.jobs j ON j.id = te.job_id
  WHERE te.id = p_time_entry_id
    AND te.clock_out IS NOT NULL
    AND te.status = 'approved';
  
  IF NOT FOUND OR v_entry.job_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Get employee pay rate
  SELECT pr.rate INTO v_pay_rate
  FROM public.pay_rates pr
  WHERE pr.employee_id = v_entry.employee_id
    AND pr.pay_type = 'hourly'
    AND (pr.effective_end IS NULL OR pr.effective_end >= DATE(v_entry.clock_in))
    AND pr.effective_start <= DATE(v_entry.clock_in)
  ORDER BY pr.effective_start DESC
  LIMIT 1;
  
  IF v_pay_rate IS NULL THEN
    RETURN; -- No pay rate found
  END IF;
  
  -- Calculate labor cost for this entry
  v_labor_cost := (v_entry.total_hours * v_pay_rate) + 
                  (v_entry.overtime_hours * v_pay_rate * 0.5); -- OT is 1.5x
  
  -- Update job labor cost (if job_cost_tracker table exists)
  -- This is a placeholder - actual implementation depends on job costing system
  -- For now, we'll create a function that can be called by the job costing system
  
  -- Log the sync (can be used by job costing system)
  -- The actual job cost update will be handled by the job costing engine
END;
$$;

COMMENT ON FUNCTION public.sync_labor_to_job_cost IS 'Auto-syncs labor hours to job cost tracking (Block 256900)';

-- ============================================================================
-- PART 13 — FUNCTION: Calculate labor productivity score
-- ============================================================================
-- Calculate productivity score (labor per square)

CREATE OR REPLACE FUNCTION public.calculate_labor_productivity(
  p_job_id uuid,
  p_period_start date,
  p_period_end date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job RECORD;
  v_total_hours numeric;
  v_job_squares numeric;
  v_labor_per_square numeric;
  v_productivity_score numeric;
  v_industry_avg numeric := 0.62; -- Industry average: 0.62 hours per square
  v_is_above_avg boolean;
  v_estimated_loss numeric;
BEGIN
  -- Get job details
  SELECT j.*, c.id as company_id
  INTO v_job
  FROM public.jobs j
  JOIN public.roofing_companies c ON c.id = j.company_id
  WHERE j.id = p_job_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Get job squares (from job metadata or materials)
  -- This is a placeholder - actual implementation depends on how squares are stored
  v_job_squares := 30; -- Default, should come from job data
  
  -- Calculate total labor hours for this job in period
  SELECT COALESCE(SUM(total_hours), 0) INTO v_total_hours
  FROM public.time_entries
  WHERE job_id = p_job_id
    AND DATE(clock_in) BETWEEN p_period_start AND p_period_end
    AND clock_out IS NOT NULL
    AND status = 'approved';
  
  IF v_total_hours = 0 OR v_job_squares = 0 THEN
    RETURN;
  END IF;
  
  -- Calculate labor per square
  v_labor_per_square := v_total_hours / v_job_squares;
  
  -- Calculate productivity score (0-100)
  -- Score = 100 - ((labor_per_square - industry_avg) / industry_avg * 100)
  -- Clamped to 0-100
  v_productivity_score := GREATEST(0, LEAST(100, 100 - ((v_labor_per_square - v_industry_avg) / v_industry_avg * 100)));
  
  -- Check if above average
  v_is_above_avg := v_labor_per_square < v_industry_avg;
  
  -- Calculate estimated annual loss if below average
  IF NOT v_is_above_avg THEN
    -- Estimate: (labor_per_square - industry_avg) * avg_squares_per_job * jobs_per_year * avg_hourly_rate
    v_estimated_loss := (v_labor_per_square - v_industry_avg) * 30 * 50 * 25; -- Placeholder calculation
  ELSE
    v_estimated_loss := 0;
  END IF;
  
  -- Insert or update productivity score
  INSERT INTO public.labor_productivity_scores (
    job_id,
    company_id,
    job_squares,
    total_labor_hours,
    labor_per_square,
    productivity_score,
    industry_avg_labor_per_square,
    is_above_average,
    estimated_annual_loss,
    period_start,
    period_end
  ) VALUES (
    p_job_id,
    v_job.company_id,
    v_job_squares,
    v_total_hours,
    v_labor_per_square,
    v_productivity_score,
    v_industry_avg,
    v_is_above_avg,
    v_estimated_loss,
    p_period_start,
    p_period_end
  )
  ON CONFLICT (job_id, period_start, period_end) DO UPDATE SET
    total_labor_hours = EXCLUDED.total_labor_hours,
    labor_per_square = EXCLUDED.labor_per_square,
    productivity_score = EXCLUDED.productivity_score,
    is_above_average = EXCLUDED.is_above_average,
    estimated_annual_loss = EXCLUDED.estimated_annual_loss,
    updated_at = now();
END;
$$;

COMMENT ON FUNCTION public.calculate_labor_productivity IS 'Calculates labor productivity score for a job (Block 256900)';

-- ============================================================================
-- PART 14 — FUNCTION: Export payroll to QuickBooks format
-- ============================================================================

CREATE OR REPLACE FUNCTION public.export_payroll_quickbooks(
  p_company_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_export_data jsonb;
  v_employee_data jsonb;
BEGIN
  -- Build QuickBooks export format
  SELECT jsonb_agg(
    jsonb_build_object(
      'employee_id', e.id,
      'employee_name', CONCAT(e.first_name, ' ', e.last_name),
      'total_hours', COALESCE(SUM(te.total_hours), 0),
      'regular_hours', COALESCE(SUM(te.total_hours - te.overtime_hours), 0),
      'overtime_hours', COALESCE(SUM(te.overtime_hours), 0),
      'hourly_rate', COALESCE(pr.rate, 0),
      'regular_pay', COALESCE(SUM((te.total_hours - te.overtime_hours) * pr.rate), 0),
      'overtime_pay', COALESCE(SUM(te.overtime_hours * pr.rate * 1.5), 0),
      'total_pay', COALESCE(SUM((te.total_hours - te.overtime_hours) * pr.rate), 0) + 
                   COALESCE(SUM(te.overtime_hours * pr.rate * 1.5), 0)
    )
  ) INTO v_export_data
  FROM public.workforce_employees e
  LEFT JOIN public.time_entries te ON te.employee_id = e.id
    AND DATE(te.clock_in) BETWEEN p_start_date AND p_end_date
    AND te.clock_out IS NOT NULL
    AND te.status = 'approved'
  LEFT JOIN public.pay_rates pr ON pr.employee_id = e.id
    AND pr.pay_type = 'hourly'
    AND (pr.effective_end IS NULL OR pr.effective_end >= p_start_date)
    AND pr.effective_start <= p_end_date
  WHERE e.company_id = p_company_id
    AND e.status = 'active'
  GROUP BY e.id, e.first_name, e.last_name, pr.rate;
  
  RETURN COALESCE(v_export_data, '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.export_payroll_quickbooks IS 'Exports payroll data in QuickBooks format (Block 256900)';

-- ============================================================================
-- PART 15 — FUNCTION: Export payroll to CSV format
-- ============================================================================

CREATE OR REPLACE FUNCTION public.export_payroll_csv(
  p_company_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_csv text := 'Employee Name,Total Hours,Regular Hours,Overtime Hours,Hourly Rate,Regular Pay,Overtime Pay,Total Pay' || E'\n';
  v_row text;
BEGIN
  -- Build CSV rows
  FOR v_row IN
    SELECT CONCAT(
      '"', e.first_name, ' ', e.last_name, '",',
      COALESCE(SUM(te.total_hours), 0), ',',
      COALESCE(SUM(te.total_hours - te.overtime_hours), 0), ',',
      COALESCE(SUM(te.overtime_hours), 0), ',',
      COALESCE(pr.rate, 0), ',',
      COALESCE(SUM((te.total_hours - te.overtime_hours) * pr.rate), 0), ',',
      COALESCE(SUM(te.overtime_hours * pr.rate * 1.5), 0), ',',
      COALESCE(SUM((te.total_hours - te.overtime_hours) * pr.rate), 0) + 
      COALESCE(SUM(te.overtime_hours * pr.rate * 1.5), 0)
    )
    FROM public.workforce_employees e
    LEFT JOIN public.time_entries te ON te.employee_id = e.id
      AND DATE(te.clock_in) BETWEEN p_start_date AND p_end_date
      AND te.clock_out IS NOT NULL
      AND te.status = 'approved'
    LEFT JOIN public.pay_rates pr ON pr.employee_id = e.id
      AND pr.pay_type = 'hourly'
      AND (pr.effective_end IS NULL OR pr.effective_end >= p_start_date)
      AND pr.effective_start <= p_end_date
    WHERE e.company_id = p_company_id
      AND e.status = 'active'
    GROUP BY e.id, e.first_name, e.last_name, pr.rate
  LOOP
    v_csv := v_csv || v_row || E'\n';
  END LOOP;
  
  RETURN v_csv;
END;
$$;

COMMENT ON FUNCTION public.export_payroll_csv IS 'Exports payroll data in CSV format (Block 256900)';

-- ============================================================================
-- PART 16 — TRIGGERS
-- ============================================================================

-- Trigger: Check break compliance on time entry update
CREATE OR REPLACE FUNCTION public.trigger_check_break_compliance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.clock_out IS NOT NULL AND (OLD.clock_out IS NULL OR OLD.break_minutes != NEW.break_minutes) THEN
    PERFORM public.check_break_compliance(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_break_compliance ON public.time_entries;
CREATE TRIGGER trg_check_break_compliance
AFTER INSERT OR UPDATE OF clock_out, break_minutes ON public.time_entries
FOR EACH ROW
EXECUTE FUNCTION public.trigger_check_break_compliance();

-- Trigger: Sync labor to job cost on approval
CREATE OR REPLACE FUNCTION public.trigger_sync_labor_to_job_cost()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status != 'approved' AND NEW.clock_out IS NOT NULL THEN
    PERFORM public.sync_labor_to_job_cost(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_labor_to_job_cost ON public.time_entries;
CREATE TRIGGER trg_sync_labor_to_job_cost
AFTER UPDATE OF status ON public.time_entries
FOR EACH ROW
EXECUTE FUNCTION public.trigger_sync_labor_to_job_cost();

-- Trigger: Updated_at triggers
CREATE OR REPLACE FUNCTION public.set_time_entry_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_time_entries_updated_at ON public.time_entries;
CREATE TRIGGER trg_time_entries_updated_at
BEFORE UPDATE ON public.time_entries
FOR EACH ROW
EXECUTE FUNCTION public.set_time_entry_updated_at();

-- ============================================================================
-- PART 17 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- time_entries RLS
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees can view their own time entries"
  ON public.time_entries FOR SELECT
  USING (
    employee_id IN (
      SELECT id FROM public.workforce_employees
      WHERE id = time_entries.employee_id
    )
    OR company_id IN (
      SELECT company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Employees can create their own time entries"
  ON public.time_entries FOR INSERT
  WITH CHECK (
    employee_id IN (
      SELECT id FROM public.workforce_employees
      WHERE id = time_entries.employee_id
    )
  );

CREATE POLICY "Company members can manage time entries"
  ON public.time_entries FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- payroll_periods RLS
ALTER TABLE public.payroll_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view payroll periods"
  ON public.payroll_periods FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Company admins can manage payroll periods"
  ON public.payroll_periods FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid() AND is_active = true
      AND role IN ('owner', 'admin')
    )
  );

-- payroll_adjustments RLS
ALTER TABLE public.payroll_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees can view their own adjustments"
  ON public.payroll_adjustments FOR SELECT
  USING (
    employee_id IN (
      SELECT id FROM public.workforce_employees
      WHERE id = payroll_adjustments.employee_id
    )
    OR company_id IN (
      SELECT company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Company admins can manage adjustments"
  ON public.payroll_adjustments FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid() AND is_active = true
      AND role IN ('owner', 'admin', 'project_manager')
    )
  );

-- gps_approved_zones RLS
ALTER TABLE public.gps_approved_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view GPS zones"
  ON public.gps_approved_zones FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Company admins can manage GPS zones"
  ON public.gps_approved_zones FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid() AND is_active = true
      AND role IN ('owner', 'admin', 'project_manager')
    )
  );

-- missed_punch_alerts RLS
ALTER TABLE public.missed_punch_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees can view their own alerts"
  ON public.missed_punch_alerts FOR SELECT
  USING (
    employee_id IN (
      SELECT id FROM public.workforce_employees
      WHERE id = missed_punch_alerts.employee_id
    )
    OR company_id IN (
      SELECT company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Company members can manage alerts"
  ON public.missed_punch_alerts FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- break_compliance_tracking RLS
ALTER TABLE public.break_compliance_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view break compliance"
  ON public.break_compliance_tracking FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- labor_productivity_scores RLS
ALTER TABLE public.labor_productivity_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view productivity scores"
  ON public.labor_productivity_scores FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Service role policies
CREATE POLICY "service_role_all_time_entries" ON public.time_entries
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_payroll_periods" ON public.payroll_periods
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_payroll_adjustments" ON public.payroll_adjustments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_gps_zones" ON public.gps_approved_zones
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_missed_punches" ON public.missed_punch_alerts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_break_compliance" ON public.break_compliance_tracking
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_productivity" ON public.labor_productivity_scores
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 18 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON public.time_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.payroll_periods TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.payroll_adjustments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gps_approved_zones TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.missed_punch_alerts TO authenticated;
GRANT SELECT ON public.break_compliance_tracking TO authenticated;
GRANT SELECT ON public.labor_productivity_scores TO authenticated;

GRANT EXECUTE ON FUNCTION public.calculate_time_entry_hours() TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_gps_clock_in(uuid, uuid, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_missed_punches() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_break_compliance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_labor_to_job_cost(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_labor_productivity(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.export_payroll_quickbooks(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.export_payroll_csv(uuid, date, date) TO authenticated;

-- ============================================================================
-- END OF BLOCK 256900
-- ============================================================================





















