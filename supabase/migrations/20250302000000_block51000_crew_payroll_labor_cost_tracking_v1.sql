-- =========================================================
-- Block 51000 — SmartSend Roofing "Crew Payroll + Labor Cost Tracking System" v1
-- (TIME TRACKING → PAYROLL OUTPUT • HOURLY + SQUARE RATE • OVERTIME RULES • CREW PAY SUMMARIES • JOB-LEVEL LABOR COSTING)
-- =========================================================
-- 
-- This block makes SmartSend the money hub for crews — tracking EXACTLY what each crew member earns,
-- what the company owes, and what labor costs per job actually are.
--
-- This is massive for roofers.
-- Most roofing companies don't track labor correctly.
-- They lose money every week because:
-- ❌ labor hours aren't logged
-- ❌ piecework (per square) isn't documented
-- ❌ overtime isn't calculated
-- ❌ pay disputes happen
-- ❌ job profitability is unknown
-- ❌ owners get surprised by labor bills
--
-- SmartSend will now manage ALL OF IT.

-- ============================================================================
-- PART 1 — CREW_PAY_SETTINGS TABLE (per-member pay type)
-- ============================================================================
-- Each crew member has their own pay settings (hourly or piecework rates)

CREATE TABLE IF NOT EXISTS public.crew_pay_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.crew_members(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Pay type configuration
  pay_type text NOT NULL CHECK (pay_type IN ('hourly', 'piecework', 'hybrid')) DEFAULT 'hourly',
  
  -- Hourly rates
  hourly_rate numeric DEFAULT 0,
  overtime_rate numeric, -- If NULL, uses 1.5x hourly_rate (time-and-a-half)
  double_time_rate numeric, -- Optional for v1.5 (2x hourly_rate)
  
  -- Piecework rates (per-square pay)
  square_rate numeric DEFAULT 0, -- Per square installed
  ridge_rate numeric DEFAULT 0, -- Per linear foot of ridge
  vent_rate numeric DEFAULT 0, -- Per vent
  plywood_rate numeric DEFAULT 0, -- Per plywood sheet
  removal_rate numeric DEFAULT 0, -- Per square tear-off/removal
  
  -- Overtime configuration
  overtime_threshold_hours numeric DEFAULT 40, -- Weekly threshold (40-hour rule)
  daily_overtime_enabled boolean DEFAULT false, -- CA law: daily overtime (over 8 hours)
  overtime_multiplier numeric DEFAULT 1.5, -- Time-and-a-half
  
  -- GPS verification settings
  require_gps_verification boolean DEFAULT true,
  job_site_radius_meters numeric DEFAULT 100, -- GPS must be within this radius
  
  -- Scheduled work hours (for GPS validation)
  scheduled_start_hour integer, -- Hour of day (0-23)
  scheduled_end_hour integer, -- Hour of day (0-23)
  
  -- Metadata
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crew_pay_settings_member ON public.crew_pay_settings(member_id, is_active);
CREATE INDEX IF NOT EXISTS idx_crew_pay_settings_workspace ON public.crew_pay_settings(workspace_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_crew_pay_settings_member_unique ON public.crew_pay_settings(member_id) WHERE is_active = true;

COMMENT ON TABLE public.crew_pay_settings IS 'Block 51000: Per-member pay type configuration (hourly vs piecework rates)';
COMMENT ON COLUMN public.crew_pay_settings.pay_type IS 'Block 51000: Pay type - hourly, piecework, or hybrid';
COMMENT ON COLUMN public.crew_pay_settings.overtime_threshold_hours IS 'Block 51000: Weekly hours threshold for overtime (default 40)';
COMMENT ON COLUMN public.crew_pay_settings.daily_overtime_enabled IS 'Block 51000: Enable daily overtime (CA law: over 8 hours per day)';

-- ============================================================================
-- PART 2 — TIMECARDS TABLE (auto-generated via crew app)
-- ============================================================================
-- Timecards track individual crew member time on jobs

CREATE TABLE IF NOT EXISTS public.timecards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.crew_members(id) ON DELETE CASCADE,
  job_id uuid NOT NULL, -- References jobs(id) or roofing_jobs(id) - flexible
  
  -- Time tracking
  clock_in timestamptz NOT NULL,
  clock_out timestamptz,
  total_hours numeric, -- Calculated total hours
  overtime_hours numeric DEFAULT 0, -- Calculated overtime hours
  
  -- GPS verification
  gps_in jsonb, -- {lat, lng, address, accuracy, timestamp}
  gps_out jsonb, -- {lat, lng, address, accuracy, timestamp}
  gps_verified boolean DEFAULT false, -- Whether GPS was within job site radius
  
  -- Pay calculation (from pay settings at time of work)
  hourly_rate numeric, -- Snapshot of rate at time of work
  regular_pay numeric DEFAULT 0, -- Regular hours pay
  overtime_pay numeric DEFAULT 0, -- Overtime hours pay
  piecework_pay numeric DEFAULT 0, -- Piecework pay (if applicable)
  total_pay numeric DEFAULT 0, -- Total pay for this timecard
  
  -- Status
  status text CHECK (status IN ('active', 'paused', 'completed', 'disputed')) DEFAULT 'active',
  
  -- Supervisor QC sign-off (for dispute prevention)
  supervisor_id uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  supervisor_sign_off_at timestamptz,
  supervisor_notes text,
  
  -- Dispute tracking
  disputed boolean DEFAULT false,
  dispute_reason text,
  dispute_resolved_at timestamptz,
  
  -- Metadata
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Flexible foreign key to jobs or roofing_jobs
DO $$
BEGIN
  -- Try to add FK to jobs table if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'timecards_job_id_fkey'
    ) THEN
      ALTER TABLE public.timecards
        ADD CONSTRAINT timecards_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
    END IF;
  -- Try roofing_jobs if jobs doesn't exist
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'timecards_job_id_roofing_fkey'
    ) THEN
      ALTER TABLE public.timecards
        ADD CONSTRAINT timecards_job_id_roofing_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_timecards_member ON public.timecards(member_id, clock_in DESC);
CREATE INDEX IF NOT EXISTS idx_timecards_job ON public.timecards(job_id, clock_in DESC);
CREATE INDEX IF NOT EXISTS idx_timecards_status ON public.timecards(status);
CREATE INDEX IF NOT EXISTS idx_timecards_clock_in ON public.timecards(clock_in DESC);
CREATE INDEX IF NOT EXISTS idx_timecards_period ON public.timecards(member_id, clock_in) WHERE clock_out IS NOT NULL;

COMMENT ON TABLE public.timecards IS 'Block 51000: Individual crew member timecards (auto-generated via crew app)';
COMMENT ON COLUMN public.timecards.gps_verified IS 'Block 51000: Whether clock-in GPS was within job site radius';
COMMENT ON COLUMN public.timecards.supervisor_sign_off_at IS 'Block 51000: Supervisor QC sign-off timestamp for dispute prevention';

-- ============================================================================
-- PART 3 — PIECEWORK_RECORDS TABLE (per job)
-- ============================================================================
-- Track piecework (per-square) work completed by crew members

CREATE TABLE IF NOT EXISTS public.piecework_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.crew_members(id) ON DELETE CASCADE,
  job_id uuid NOT NULL, -- References jobs(id) or roofing_jobs(id) - flexible
  
  -- Piecework quantities
  squares numeric DEFAULT 0, -- Squares installed
  ridge_feet numeric DEFAULT 0, -- Linear feet of ridge
  plywood_sheets numeric DEFAULT 0, -- Plywood sheets replaced
  vents_count integer DEFAULT 0, -- Number of vents
  removal_squares numeric DEFAULT 0, -- Squares torn off/removed
  
  -- Additional items (flexible JSON for future items)
  additional_items jsonb DEFAULT '{}'::jsonb, -- {chimney_flashing: 2, skylight: 1, etc.}
  
  -- Pay calculation
  square_rate numeric, -- Snapshot of rate at time of work
  ridge_rate numeric,
  plywood_rate numeric,
  vent_rate numeric,
  removal_rate numeric,
  total_pay numeric DEFAULT 0, -- Calculated total piecework pay
  
  -- Verification
  photos jsonb DEFAULT '[]'::jsonb, -- Array of photo URLs for verification
  supervisor_verified boolean DEFAULT false,
  supervisor_id uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  supervisor_verified_at timestamptz,
  
  -- Metadata
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Flexible foreign key to jobs or roofing_jobs
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'piecework_records_job_id_fkey'
    ) THEN
      ALTER TABLE public.piecework_records
        ADD CONSTRAINT piecework_records_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
    END IF;
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'piecework_records_job_id_roofing_fkey'
    ) THEN
      ALTER TABLE public.piecework_records
        ADD CONSTRAINT piecework_records_job_id_roofing_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_piecework_records_member ON public.piecework_records(member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_piecework_records_job ON public.piecework_records(job_id);
CREATE INDEX IF NOT EXISTS idx_piecework_records_verified ON public.piecework_records(supervisor_verified);

COMMENT ON TABLE public.piecework_records IS 'Block 51000: Piecework records (per-square pay) per job';
COMMENT ON COLUMN public.piecework_records.photos IS 'Block 51000: Photos can be required for verification';

-- ============================================================================
-- PART 4 — PAYROLL_RUNS TABLE (weekly or per payday)
-- ============================================================================
-- Payroll runs group timecards and piecework into pay periods

CREATE TABLE IF NOT EXISTS public.payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Pay period
  period_start date NOT NULL,
  period_end date NOT NULL,
  pay_date date, -- When payroll is actually paid
  
  -- Totals
  total_labor_cost numeric DEFAULT 0, -- Total labor cost for this period
  total_hours numeric DEFAULT 0, -- Total hours worked
  total_overtime_hours numeric DEFAULT 0, -- Total overtime hours
  total_piecework_pay numeric DEFAULT 0, -- Total piecework payments
  total_members integer DEFAULT 0, -- Number of members in this payroll run
  
  -- Status
  status text CHECK (status IN ('open', 'processing', 'processed', 'paid', 'cancelled')) DEFAULT 'open',
  
  -- Export tracking
  exported_to_csv boolean DEFAULT false,
  exported_to_quickbooks boolean DEFAULT false,
  exported_to_pdf boolean DEFAULT false,
  export_file_url text, -- URL to exported file
  
  -- Metadata
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_runs_workspace ON public.payroll_runs(workspace_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_status ON public.payroll_runs(status);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_period ON public.payroll_runs(period_start, period_end);

COMMENT ON TABLE public.payroll_runs IS 'Block 51000: Payroll runs (weekly or per payday)';
COMMENT ON COLUMN public.payroll_runs.status IS 'Block 51000: open, processed, paid, etc.';

-- ============================================================================
-- PART 5 — PAYROLL_ITEMS TABLE (per member per payroll run)
-- ============================================================================
-- Individual payroll items for each crew member in each payroll run

CREATE TABLE IF NOT EXISTS public.payroll_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_id uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.crew_members(id) ON DELETE CASCADE,
  
  -- Hours summary
  total_hours numeric DEFAULT 0,
  regular_hours numeric DEFAULT 0,
  overtime_hours numeric DEFAULT 0,
  
  -- Pay breakdown
  regular_pay numeric DEFAULT 0,
  overtime_pay numeric DEFAULT 0,
  piecework_pay numeric DEFAULT 0,
  total_pay numeric DEFAULT 0,
  
  -- Jobs worked (summary)
  jobs_worked jsonb DEFAULT '[]'::jsonb, -- Array of job IDs worked on
  
  -- Status
  status text CHECK (status IN ('pending', 'calculated', 'approved', 'paid')) DEFAULT 'pending',
  
  -- Payment tracking
  paid_at timestamptz,
  payment_reference text, -- Reference number for payment
  
  -- Metadata
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_items_payroll ON public.payroll_items(payroll_id);
CREATE INDEX IF NOT EXISTS idx_payroll_items_member ON public.payroll_items(member_id);
CREATE INDEX IF NOT EXISTS idx_payroll_items_status ON public.payroll_items(status);

COMMENT ON TABLE public.payroll_items IS 'Block 51000: Per member per payroll run items';
COMMENT ON COLUMN public.payroll_items.jobs_worked IS 'Block 51000: Array of job IDs this member worked on';

-- ============================================================================
-- PART 6 — JOB LABOR COST SUMMARY VIEW
-- ============================================================================
-- View to show job-level labor cost summary

CREATE OR REPLACE VIEW public.job_labor_cost_summary AS
SELECT 
  t.job_id,
  COUNT(DISTINCT t.member_id) as crew_members_count,
  COALESCE(SUM(t.total_hours), 0) as total_hours,
  COALESCE(SUM(t.overtime_hours), 0) as overtime_hours,
  COALESCE(SUM(t.regular_pay), 0) as regular_pay,
  COALESCE(SUM(t.overtime_pay), 0) as overtime_pay,
  COALESCE(SUM(t.piecework_pay), 0) as piecework_pay,
  COALESCE(SUM(t.total_pay), 0) as total_labor_cost,
  COALESCE(SUM(pr.total_pay), 0) as piecework_total,
  -- Variance calculation (if job has estimated labor cost)
  NULL::numeric as estimated_labor_cost, -- Will be joined from jobs table
  NULL::numeric as variance -- Will be calculated
FROM public.timecards t
LEFT JOIN public.piecework_records pr ON pr.job_id = t.job_id AND pr.member_id = t.member_id
WHERE t.clock_out IS NOT NULL -- Only completed timecards
GROUP BY t.job_id;

COMMENT ON VIEW public.job_labor_cost_summary IS 'Block 51000: Job-level labor cost summary (estimated vs actual, variance, profit impact)';

-- ============================================================================
-- PART 7 — FUNCTIONS: OVERTIME CALCULATION
-- ============================================================================

-- Function to calculate overtime hours for a timecard
CREATE OR REPLACE FUNCTION public.calculate_overtime_hours(
  p_member_id uuid,
  p_clock_in timestamptz,
  p_clock_out timestamptz,
  p_daily_overtime_enabled boolean DEFAULT false
)
RETURNS numeric
LANGUAGE plpgsql
AS $$
DECLARE
  v_total_hours numeric;
  v_regular_hours numeric;
  v_overtime_hours numeric;
  v_weekly_hours numeric;
  v_week_start date;
  v_week_end date;
BEGIN
  -- Calculate total hours for this timecard
  v_total_hours := EXTRACT(EPOCH FROM (p_clock_out - p_clock_in)) / 3600.0;
  
  -- If daily overtime is enabled (CA law), check if over 8 hours per day
  IF p_daily_overtime_enabled THEN
    IF v_total_hours > 8 THEN
      v_regular_hours := 8;
      v_overtime_hours := v_total_hours - 8;
      RETURN v_overtime_hours;
    ELSE
      RETURN 0;
    END IF;
  END IF;
  
  -- Otherwise, use weekly overtime (40-hour rule)
  -- Get week start (Monday)
  v_week_start := DATE_TRUNC('week', p_clock_in::date)::date;
  v_week_end := v_week_start + INTERVAL '6 days';
  
  -- Calculate total hours worked this week (including this timecard)
  SELECT COALESCE(SUM(total_hours), 0) + v_total_hours
  INTO v_weekly_hours
  FROM public.timecards
  WHERE member_id = p_member_id
    AND clock_in >= v_week_start
    AND clock_in <= v_week_end
    AND id != (SELECT id FROM public.timecards WHERE member_id = p_member_id AND clock_in = p_clock_in LIMIT 1); -- Exclude current if updating
  
  -- If weekly hours exceed 40, calculate overtime
  IF v_weekly_hours > 40 THEN
    v_regular_hours := 40;
    v_overtime_hours := v_weekly_hours - 40;
    -- Only return overtime portion for this timecard
    IF v_weekly_hours - v_total_hours < 40 THEN
      -- This timecard pushes over 40, calculate how much is overtime
      v_overtime_hours := v_weekly_hours - 40;
    ELSE
      -- Already over 40, all hours in this timecard are overtime
      v_overtime_hours := v_total_hours;
    END IF;
  ELSE
    v_overtime_hours := 0;
  END IF;
  
  RETURN v_overtime_hours;
END;
$$;

COMMENT ON FUNCTION public.calculate_overtime_hours IS 'Block 51000: Calculate overtime hours (40-hour weekly or daily 8-hour CA law)';

-- ============================================================================
-- PART 8 — FUNCTIONS: GPS VERIFICATION
-- ============================================================================

-- Function to verify GPS is within job site radius
CREATE OR REPLACE FUNCTION public.verify_gps_location(
  p_job_id uuid,
  p_latitude numeric,
  p_longitude numeric,
  p_radius_meters numeric DEFAULT 100
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_job_lat numeric;
  v_job_lng numeric;
  v_distance_meters numeric;
BEGIN
  -- Get job location (assuming jobs table has lat/lng or address)
  -- This is a placeholder - adjust based on your jobs table structure
  SELECT 
    (metadata->>'latitude')::numeric,
    (metadata->>'longitude')::numeric
  INTO v_job_lat, v_job_lng
  FROM (
    SELECT id, metadata FROM public.jobs WHERE id = p_job_id
    UNION ALL
    SELECT id, metadata FROM public.roofing_jobs WHERE id = p_job_id
  ) jobs
  LIMIT 1;
  
  -- If no job location found, return false (require GPS)
  IF v_job_lat IS NULL OR v_job_lng IS NULL THEN
    RETURN false;
  END IF;
  
  -- Calculate distance using Haversine formula (simplified)
  -- Distance in meters
  v_distance_meters := (
    6371000 * acos(
      cos(radians(v_job_lat)) * 
      cos(radians(p_latitude)) * 
      cos(radians(p_longitude) - radians(v_job_lng)) + 
      sin(radians(v_job_lat)) * 
      sin(radians(p_latitude))
    )
  );
  
  -- Return true if within radius
  RETURN v_distance_meters <= p_radius_meters;
END;
$$;

COMMENT ON FUNCTION public.verify_gps_location IS 'Block 51000: Verify GPS location is within job site radius';

-- ============================================================================
-- PART 9 — TRIGGERS: AUTO-CALCULATE TIMECARD PAY
-- ============================================================================

-- Function to auto-calculate timecard pay when clock_out is set
CREATE OR REPLACE FUNCTION public.calculate_timecard_pay()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_pay_settings public.crew_pay_settings%ROWTYPE;
  v_total_hours numeric;
  v_regular_hours numeric;
  v_overtime_hours numeric;
  v_regular_pay numeric;
  v_overtime_pay numeric;
BEGIN
  -- Only calculate if clock_out is set
  IF NEW.clock_out IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Get pay settings for this member
  SELECT * INTO v_pay_settings
  FROM public.crew_pay_settings
  WHERE member_id = NEW.member_id
    AND is_active = true
  LIMIT 1;
  
  -- If no pay settings, skip calculation
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  
  -- Calculate total hours
  v_total_hours := EXTRACT(EPOCH FROM (NEW.clock_out - NEW.clock_in)) / 3600.0;
  NEW.total_hours := v_total_hours;
  
  -- Calculate overtime hours
  v_overtime_hours := public.calculate_overtime_hours(
    NEW.member_id,
    NEW.clock_in,
    NEW.clock_out,
    v_pay_settings.daily_overtime_enabled
  );
  NEW.overtime_hours := v_overtime_hours;
  v_regular_hours := v_total_hours - v_overtime_hours;
  
  -- Calculate pay (only if hourly pay type)
  IF v_pay_settings.pay_type IN ('hourly', 'hybrid') AND v_pay_settings.hourly_rate > 0 THEN
    NEW.hourly_rate := v_pay_settings.hourly_rate;
    
    -- Regular pay
    v_regular_pay := v_regular_hours * v_pay_settings.hourly_rate;
    NEW.regular_pay := v_regular_pay;
    
    -- Overtime pay
    v_overtime_pay := v_overtime_hours * COALESCE(
      v_pay_settings.overtime_rate,
      v_pay_settings.hourly_rate * v_pay_settings.overtime_multiplier
    );
    NEW.overtime_pay := v_overtime_pay;
    
    -- Total pay (hourly portion)
    NEW.total_pay := v_regular_pay + v_overtime_pay;
  END IF;
  
  -- Update status
  IF NEW.clock_out IS NOT NULL THEN
    NEW.status := 'completed';
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_calculate_timecard_pay
BEFORE INSERT OR UPDATE ON public.timecards
FOR EACH ROW
EXECUTE FUNCTION public.calculate_timecard_pay();

COMMENT ON FUNCTION public.calculate_timecard_pay IS 'Block 51000: Auto-calculate timecard pay when clock_out is set';

-- ============================================================================
-- PART 10 — TRIGGERS: AUTO-CALCULATE PIECEWORK PAY
-- ============================================================================

-- Function to auto-calculate piecework pay
CREATE OR REPLACE FUNCTION public.calculate_piecework_pay()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_pay_settings public.crew_pay_settings%ROWTYPE;
  v_total_pay numeric := 0;
BEGIN
  -- Get pay settings for this member
  SELECT * INTO v_pay_settings
  FROM public.crew_pay_settings
  WHERE member_id = NEW.member_id
    AND is_active = true
  LIMIT 1;
  
  -- If no pay settings, skip calculation
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  
  -- Only calculate if piecework pay type
  IF v_pay_settings.pay_type NOT IN ('piecework', 'hybrid') THEN
    RETURN NEW;
  END IF;
  
  -- Snapshot rates
  NEW.square_rate := v_pay_settings.square_rate;
  NEW.ridge_rate := v_pay_settings.ridge_rate;
  NEW.plywood_rate := v_pay_settings.plywood_rate;
  NEW.vent_rate := v_pay_settings.vent_rate;
  NEW.removal_rate := v_pay_settings.removal_rate;
  
  -- Calculate total piecework pay
  v_total_pay := 
    (COALESCE(NEW.squares, 0) * COALESCE(v_pay_settings.square_rate, 0)) +
    (COALESCE(NEW.ridge_feet, 0) * COALESCE(v_pay_settings.ridge_rate, 0)) +
    (COALESCE(NEW.plywood_sheets, 0) * COALESCE(v_pay_settings.plywood_rate, 0)) +
    (COALESCE(NEW.vents_count, 0) * COALESCE(v_pay_settings.vent_rate, 0)) +
    (COALESCE(NEW.removal_squares, 0) * COALESCE(v_pay_settings.removal_rate, 0));
  
  NEW.total_pay := v_total_pay;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_calculate_piecework_pay
BEFORE INSERT OR UPDATE ON public.piecework_records
FOR EACH ROW
EXECUTE FUNCTION public.calculate_piecework_pay();

COMMENT ON FUNCTION public.calculate_piecework_pay IS 'Block 51000: Auto-calculate piecework pay when quantities are set';

-- ============================================================================
-- PART 11 — RLS POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.crew_pay_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timecards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.piecework_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_items ENABLE ROW LEVEL SECURITY;

-- RLS policies will be added via application-level auth
-- For now, allow service role full access
CREATE POLICY "crew_pay_settings_service_role_all" ON public.crew_pay_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "timecards_service_role_all" ON public.timecards
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "piecework_records_service_role_all" ON public.piecework_records
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "payroll_runs_service_role_all" ON public.payroll_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "payroll_items_service_role_all" ON public.payroll_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 12 — UPDATED_AT TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_crew_pay_settings_updated_at
BEFORE UPDATE ON public.crew_pay_settings
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_timecards_updated_at
BEFORE UPDATE ON public.timecards
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_piecework_records_updated_at
BEFORE UPDATE ON public.piecework_records
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_payroll_runs_updated_at
BEFORE UPDATE ON public.payroll_runs
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_payroll_items_updated_at
BEFORE UPDATE ON public.payroll_items
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- END OF BLOCK 51000
-- ============================================================================
































