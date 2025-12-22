-- =========================================================
-- Block 25500 — SmartSend Roofing Payroll & Crew Pay v1
-- (Crew Pay Tracking • Piece-Rate vs Hourly • Payroll Export • Labor Cost Forecasting • Crew Performance Incentives)
-- =========================================================
-- 
-- THE CREW PAY + PAYROLL ENGINE — ZERO FLUFF.
-- This block handles one of the BIGGEST pain points in roofing:
-- 
-- Paying crews accurately.
-- Tracking labor costs correctly.
-- Avoiding disputes.
-- Keeping crews motivated.
-- Forecasting payroll.
-- Knowing true labor cost per job.
--
-- Most roofing companies lose money because:
-- ❌ crews report hours wrong
-- ❌ no tracking of per-square pay
-- ❌ no way to compare crew efficiency
-- ❌ callbacks not tied to pay
-- ❌ crews get paid even when they damage work
-- ❌ owners can't forecast payroll
-- ❌ labor cost isn't tied to profit
-- ❌ no standardization
-- ❌ no documentation for disputes
--
-- SmartSend Roofing Payroll & Crew Pay v1 FIXES ALL OF THIS.

-- ============================================================================
-- PART 1 — ENHANCE crews TABLE WITH PAY MODEL FIELDS
-- ============================================================================
-- Add pay model configuration to crews table

ALTER TABLE IF EXISTS public.crews
  ADD COLUMN IF NOT EXISTS pay_model_type text CHECK (pay_model_type IN ('piece_rate', 'hourly', 'hybrid')) DEFAULT 'piece_rate',
  ADD COLUMN IF NOT EXISTS piece_rate_tear_off_per_square numeric DEFAULT 40.00,
  ADD COLUMN IF NOT EXISTS piece_rate_install_per_square numeric DEFAULT 60.00,
  ADD COLUMN IF NOT EXISTS piece_rate_cleanup_per_square numeric DEFAULT 10.00,
  ADD COLUMN IF NOT EXISTS hourly_rate numeric DEFAULT 28.00,
  ADD COLUMN IF NOT EXISTS overtime_rate numeric, -- If NULL, uses 1.5x hourly_rate
  ADD COLUMN IF NOT EXISTS drive_time_rate numeric, -- Rate for drive time (can be different from hourly)
  ADD COLUMN IF NOT EXISTS drive_time_policy text CHECK (drive_time_policy IN ('paid', 'unpaid', 'half_paid')) DEFAULT 'paid',
  ADD COLUMN IF NOT EXISTS break_time_minutes integer DEFAULT 30, -- Standard break time per day
  ADD COLUMN IF NOT EXISTS minimum_hours_per_day numeric DEFAULT 8.0, -- Minimum guaranteed hours
  ADD COLUMN IF NOT EXISTS bonus_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS penalty_enabled boolean DEFAULT true;

-- Index for pay model lookups
CREATE INDEX IF NOT EXISTS idx_crews_pay_model ON public.crews(pay_model_type, workspace_id);

COMMENT ON COLUMN public.crews.pay_model_type IS 'Block 25500: Pay model type - piece_rate, hourly, or hybrid';
COMMENT ON COLUMN public.crews.piece_rate_tear_off_per_square IS 'Block 25500: Piece rate per square for tear-off';
COMMENT ON COLUMN public.crews.piece_rate_install_per_square IS 'Block 25500: Piece rate per square for install';
COMMENT ON COLUMN public.crews.piece_rate_cleanup_per_square IS 'Block 25500: Piece rate per square for cleanup';
COMMENT ON COLUMN public.crews.hourly_rate IS 'Block 25500: Hourly rate for hourly pay model';
COMMENT ON COLUMN public.crews.overtime_rate IS 'Block 25500: Overtime rate (if NULL, uses 1.5x hourly_rate)';
COMMENT ON COLUMN public.crews.drive_time_rate IS 'Block 25500: Rate for drive time';
COMMENT ON COLUMN public.crews.drive_time_policy IS 'Block 25500: Drive time payment policy';
COMMENT ON COLUMN public.crews.break_time_minutes IS 'Block 25500: Standard break time per day in minutes';
COMMENT ON COLUMN public.crews.minimum_hours_per_day IS 'Block 25500: Minimum guaranteed hours per day';
COMMENT ON COLUMN public.crews.bonus_enabled IS 'Block 25500: Whether bonuses are enabled for this crew';
COMMENT ON COLUMN public.crews.penalty_enabled IS 'Block 25500: Whether penalties are enabled for this crew';

-- ============================================================================
-- PART 2 — ENHANCE roofing_jobs TABLE WITH LABOR CALCULATION FIELDS
-- ============================================================================
-- Add fields needed for labor cost calculation

ALTER TABLE IF EXISTS public.roofing_jobs
  ADD COLUMN IF NOT EXISTS roof_squares numeric, -- Total squares for piece-rate calculation
  ADD COLUMN IF NOT EXISTS roof_pitch numeric, -- Pitch multiplier (e.g., 1.2 for 6/12 pitch)
  ADD COLUMN IF NOT EXISTS cut_up_factor numeric DEFAULT 1.0, -- Complexity factor (1.0 = standard, 1.2 = complex)
  ADD COLUMN IF NOT EXISTS complexity_factor numeric DEFAULT 1.0, -- Overall complexity multiplier
  ADD COLUMN IF NOT EXISTS skylights_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS chimneys_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valleys_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS decking_replacement_squares numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ridge_height_feet numeric, -- Ridge height for complexity
  ADD COLUMN IF NOT EXISTS target_hours numeric, -- Target hours for job completion
  ADD COLUMN IF NOT EXISTS actual_hours numeric, -- Actual hours worked
  ADD COLUMN IF NOT EXISTS calculated_labor_cost numeric, -- Calculated labor cost
  ADD COLUMN IF NOT EXISTS labor_cost_calculation_method text CHECK (labor_cost_calculation_method IN ('piece_rate', 'hourly', 'hybrid', 'manual')) DEFAULT 'piece_rate';

-- Indexes for labor cost queries
CREATE INDEX IF NOT EXISTS idx_roofing_jobs_labor_cost ON public.roofing_jobs(calculated_labor_cost) WHERE calculated_labor_cost IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roofing_jobs_roof_squares ON public.roofing_jobs(roof_squares) WHERE roof_squares IS NOT NULL;

COMMENT ON COLUMN public.roofing_jobs.roof_squares IS 'Block 25500: Total roof squares for piece-rate calculation';
COMMENT ON COLUMN public.roofing_jobs.roof_pitch IS 'Block 25500: Roof pitch multiplier';
COMMENT ON COLUMN public.roofing_jobs.cut_up_factor IS 'Block 25500: Cut-up complexity factor';
COMMENT ON COLUMN public.roofing_jobs.complexity_factor IS 'Block 25500: Overall complexity multiplier';
COMMENT ON COLUMN public.roofing_jobs.target_hours IS 'Block 25500: Target hours for job completion';
COMMENT ON COLUMN public.roofing_jobs.actual_hours IS 'Block 25500: Actual hours worked';
COMMENT ON COLUMN public.roofing_jobs.calculated_labor_cost IS 'Block 25500: Calculated labor cost';
COMMENT ON COLUMN public.roofing_jobs.labor_cost_calculation_method IS 'Block 25500: Method used to calculate labor cost';

-- ============================================================================
-- PART 3 — CREATE crew_check_ins TABLE
-- ============================================================================
-- Track crew check-in and check-out times for hourly pay calculation

CREATE TABLE IF NOT EXISTS public.crew_check_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  crew_id uuid NOT NULL REFERENCES public.crews(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  crew_member_id uuid REFERENCES public.crew_members(id) ON DELETE SET NULL, -- Who checked in
  
  -- Check-in/out times
  check_in_time timestamptz NOT NULL,
  check_out_time timestamptz,
  
  -- Location tracking
  check_in_location jsonb, -- {lat, lng, address}
  check_out_location jsonb,
  
  -- Break tracking
  break_start_time timestamptz,
  break_end_time timestamptz,
  break_duration_minutes integer DEFAULT 0, -- Calculated break duration
  
  -- Drive time
  drive_time_minutes integer DEFAULT 0, -- Drive time to job site
  drive_time_from_home boolean DEFAULT false, -- Whether drive time is from home
  
  -- Photo uploads
  start_photos jsonb DEFAULT '[]'::jsonb, -- Array of photo URLs
  mid_photos jsonb DEFAULT '[]'::jsonb,
  end_photos jsonb DEFAULT '[]'::jsonb,
  
  -- Task confirmation
  tasks_completed jsonb DEFAULT '[]'::jsonb, -- Array of completed tasks
  cleanup_confirmed boolean DEFAULT false,
  cleanup_photos jsonb DEFAULT '[]'::jsonb,
  
  -- Calculated hours
  total_hours numeric, -- Total hours worked (including breaks)
  billable_hours numeric, -- Billable hours (excluding breaks)
  overtime_hours numeric DEFAULT 0, -- Hours over 8 per day
  regular_hours numeric DEFAULT 0, -- Regular hours (up to 8 per day)
  
  -- Status
  status text CHECK (status IN ('checked_in', 'on_break', 'checked_out', 'completed')) DEFAULT 'checked_in',
  
  -- Notes
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crew_check_ins_job ON public.crew_check_ins(job_id, check_in_time DESC);
CREATE INDEX IF NOT EXISTS idx_crew_check_ins_crew ON public.crew_check_ins(crew_id, check_in_time DESC);
CREATE INDEX IF NOT EXISTS idx_crew_check_ins_workspace ON public.crew_check_ins(workspace_id, check_in_time DESC);
CREATE INDEX IF NOT EXISTS idx_crew_check_ins_status ON public.crew_check_ins(status) WHERE status != 'checked_out';
CREATE INDEX IF NOT EXISTS idx_crew_check_ins_date_range ON public.crew_check_ins(check_in_time, check_out_time);

COMMENT ON TABLE public.crew_check_ins IS 'Block 25500: Track crew check-in and check-out times for hourly pay calculation';

-- ============================================================================
-- PART 4 — CREATE crew_pay_entries TABLE
-- ============================================================================
-- Main table for tracking crew pay calculations per job

CREATE TABLE IF NOT EXISTS public.crew_pay_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  crew_id uuid NOT NULL REFERENCES public.crews(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  check_in_id uuid REFERENCES public.crew_check_ins(id) ON DELETE SET NULL,
  
  -- Pay calculation method
  pay_model_type text NOT NULL CHECK (pay_model_type IN ('piece_rate', 'hourly', 'hybrid')),
  
  -- Piece-rate calculation fields
  squares_installed numeric DEFAULT 0,
  squares_tear_off numeric DEFAULT 0,
  squares_cleanup numeric DEFAULT 0,
  piece_rate_tear_off numeric,
  piece_rate_install numeric,
  piece_rate_cleanup numeric,
  piece_rate_total numeric DEFAULT 0,
  
  -- Hourly calculation fields
  hours_worked numeric DEFAULT 0,
  regular_hours numeric DEFAULT 0,
  overtime_hours numeric DEFAULT 0,
  hourly_rate numeric,
  overtime_rate numeric,
  hourly_total numeric DEFAULT 0,
  
  -- Drive time calculation
  drive_time_minutes integer DEFAULT 0,
  drive_time_rate numeric,
  drive_time_total numeric DEFAULT 0,
  
  -- Adjustments
  bonuses_total numeric DEFAULT 0, -- Sum of all bonuses
  penalties_total numeric DEFAULT 0, -- Sum of all penalties
  
  -- Final calculation
  base_pay numeric NOT NULL DEFAULT 0, -- Base pay before bonuses/penalties
  total_pay numeric NOT NULL DEFAULT 0, -- Final pay after bonuses/penalties
  
  -- Status
  status text CHECK (status IN ('pending', 'calculated', 'approved', 'paid', 'disputed')) DEFAULT 'pending',
  
  -- Approval workflow
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  paid_at timestamptz,
  payment_reference text, -- Reference number for payment
  
  -- Dispute tracking
  disputed boolean DEFAULT false,
  dispute_reason text,
  dispute_resolved_at timestamptz,
  
  -- Notes
  notes text,
  calculation_details jsonb DEFAULT '{}'::jsonb, -- Full calculation breakdown
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crew_pay_entries_job ON public.crew_pay_entries(job_id);
CREATE INDEX IF NOT EXISTS idx_crew_pay_entries_crew ON public.crew_pay_entries(crew_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crew_pay_entries_workspace ON public.crew_pay_entries(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crew_pay_entries_status ON public.crew_pay_entries(status);
CREATE INDEX IF NOT EXISTS idx_crew_pay_entries_pay_period ON public.crew_pay_entries(workspace_id, created_at) WHERE status IN ('approved', 'paid');

COMMENT ON TABLE public.crew_pay_entries IS 'Block 25500: Main table for tracking crew pay calculations per job';

-- ============================================================================
-- PART 5 — CREATE crew_bonuses TABLE
-- ============================================================================
-- Track bonuses awarded to crews

CREATE TABLE IF NOT EXISTS public.crew_bonuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_pay_entry_id uuid NOT NULL REFERENCES public.crew_pay_entries(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  crew_id uuid NOT NULL REFERENCES public.crews(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Bonus details
  bonus_type text NOT NULL CHECK (bonus_type IN ('quality', 'speed', 'safety', 'review', 'custom')),
  bonus_amount numeric NOT NULL,
  bonus_reason text NOT NULL,
  
  -- Quality bonus criteria
  photo_compliance_score numeric, -- Photo compliance score (0-100)
  cleanup_score numeric, -- Cleanup quality score (0-100)
  
  -- Speed bonus criteria
  target_hours numeric, -- Target hours for job
  actual_hours numeric, -- Actual hours worked
  hours_saved numeric, -- Hours saved vs target
  
  -- Safety bonus criteria
  safety_incidents integer DEFAULT 0, -- Number of safety incidents
  jobs_without_incidents integer DEFAULT 0, -- Consecutive jobs without incidents
  
  -- Review bonus criteria
  homeowner_rating numeric, -- Homeowner rating (1-5)
  review_text text, -- Review text
  
  -- Approval
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz DEFAULT now(),
  
  -- Notes
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crew_bonuses_pay_entry ON public.crew_bonuses(crew_pay_entry_id);
CREATE INDEX IF NOT EXISTS idx_crew_bonuses_job ON public.crew_bonuses(job_id);
CREATE INDEX IF NOT EXISTS idx_crew_bonuses_crew ON public.crew_bonuses(crew_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crew_bonuses_type ON public.crew_bonuses(bonus_type);

COMMENT ON TABLE public.crew_bonuses IS 'Block 25500: Track bonuses awarded to crews';

-- ============================================================================
-- PART 6 — CREATE crew_penalties TABLE
-- ============================================================================
-- Track penalties/deductions for crews

CREATE TABLE IF NOT EXISTS public.crew_penalties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_pay_entry_id uuid NOT NULL REFERENCES public.crew_pay_entries(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  crew_id uuid NOT NULL REFERENCES public.crews(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Penalty details
  penalty_type text NOT NULL CHECK (penalty_type IN ('cleanup_failure', 'poor_photos', 'improper_install', 'broken_items', 'wrong_materials', 'callback', 'safety_violation', 'custom')),
  penalty_amount numeric NOT NULL,
  penalty_reason text NOT NULL,
  
  -- Callback penalty details
  callback_id uuid, -- Reference to callback/job issue
  callback_cost numeric, -- Cost of callback
  
  -- Photo/documentation penalty
  missing_photos_count integer DEFAULT 0,
  poor_quality_photos_count integer DEFAULT 0,
  
  -- Cleanup penalty
  cleanup_failed boolean DEFAULT false,
  cleanup_notes text,
  
  -- Approval
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz DEFAULT now(),
  
  -- Notes
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crew_penalties_pay_entry ON public.crew_penalties(crew_pay_entry_id);
CREATE INDEX IF NOT EXISTS idx_crew_penalties_job ON public.crew_penalties(job_id);
CREATE INDEX IF NOT EXISTS idx_crew_penalties_crew ON public.crew_penalties(crew_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crew_penalties_type ON public.crew_penalties(penalty_type);

COMMENT ON TABLE public.crew_penalties IS 'Block 25500: Track penalties/deductions for crews';

-- ============================================================================
-- PART 7 — CREATE crew_performance_scores TABLE (Enhanced)
-- ============================================================================
-- Track crew performance scores for incentives and comparison

CREATE TABLE IF NOT EXISTS public.crew_performance_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id uuid NOT NULL REFERENCES public.crews(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Performance period
  period_start_date date NOT NULL,
  period_end_date date NOT NULL,
  
  -- Job metrics
  jobs_completed integer DEFAULT 0,
  jobs_on_time integer DEFAULT 0,
  on_time_percentage numeric DEFAULT 0,
  
  -- Speed metrics
  avg_hours_per_job numeric DEFAULT 0,
  avg_hours_vs_target numeric DEFAULT 0, -- Difference from target (negative = faster)
  speed_score numeric DEFAULT 0, -- 0-100
  
  -- Quality metrics
  photo_compliance_percentage numeric DEFAULT 0,
  cleanup_quality_score numeric DEFAULT 0, -- Average cleanup score
  callback_count integer DEFAULT 0,
  callback_rate numeric DEFAULT 0, -- Percentage of jobs requiring callbacks
  rework_count integer DEFAULT 0,
  rework_rate numeric DEFAULT 0,
  quality_score numeric DEFAULT 0, -- 0-100
  
  -- Homeowner satisfaction
  homeowner_feedback_count integer DEFAULT 0,
  avg_homeowner_rating numeric DEFAULT 0, -- 1-5 stars
  review_score numeric DEFAULT 0, -- 0-100
  
  -- Safety metrics
  safety_incidents integer DEFAULT 0,
  safety_score numeric DEFAULT 0, -- 0-100
  
  -- Profit impact
  avg_profit_per_job numeric DEFAULT 0,
  profit_impact_score numeric DEFAULT 0, -- 0-100
  
  -- Material waste
  material_waste_percentage numeric DEFAULT 0,
  waste_score numeric DEFAULT 0, -- 0-100
  
  -- Overall scores
  overall_score numeric DEFAULT 0, -- Weighted average of all scores (0-100)
  score_category text CHECK (score_category IN ('elite', 'reliable', 'needs_coaching', 'at_risk')) DEFAULT 'needs_coaching',
  
  -- Manual feedback
  roofer_feedback text,
  roofer_feedback_score numeric,
  roofer_feedback_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Timestamps
  calculated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crew_performance_scores_unique ON public.crew_performance_scores(crew_id, period_start_date, period_end_date);
CREATE INDEX IF NOT EXISTS idx_crew_performance_scores_crew ON public.crew_performance_scores(crew_id, period_end_date DESC);
CREATE INDEX IF NOT EXISTS idx_crew_performance_scores_workspace ON public.crew_performance_scores(workspace_id, period_end_date DESC);
CREATE INDEX IF NOT EXISTS idx_crew_performance_scores_overall ON public.crew_performance_scores(overall_score DESC);
CREATE INDEX IF NOT EXISTS idx_crew_performance_scores_category ON public.crew_performance_scores(score_category);

COMMENT ON TABLE public.crew_performance_scores IS 'Block 25500: Track crew performance scores for incentives and comparison';

-- ============================================================================
-- PART 8 — CREATE payroll_exports TABLE
-- ============================================================================
-- Track payroll exports for QuickBooks, Gusto, ADP, CSV

CREATE TABLE IF NOT EXISTS public.payroll_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Export details
  export_type text NOT NULL CHECK (export_type IN ('quickbooks', 'gusto', 'adp', 'csv', 'excel')),
  export_format text NOT NULL CHECK (export_format IN ('csv', 'xlsx', 'qbo', 'json')),
  
  -- Period
  pay_period_start date NOT NULL,
  pay_period_end date NOT NULL,
  
  -- Export data
  export_data jsonb NOT NULL, -- Full export data
  export_file_url text, -- URL to exported file (if stored)
  export_file_name text, -- Name of exported file
  
  -- Status
  status text CHECK (status IN ('pending', 'generated', 'exported', 'failed')) DEFAULT 'pending',
  
  -- Metadata
  crew_ids uuid[], -- Crews included in export
  total_crew_count integer DEFAULT 0,
  total_pay_amount numeric DEFAULT 0,
  
  -- Created by
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  exported_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_payroll_exports_workspace ON public.payroll_exports(workspace_id, pay_period_end DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_exports_type ON public.payroll_exports(export_type, status);
CREATE INDEX IF NOT EXISTS idx_payroll_exports_period ON public.payroll_exports(pay_period_start, pay_period_end);

COMMENT ON TABLE public.payroll_exports IS 'Block 25500: Track payroll exports for QuickBooks, Gusto, ADP, CSV';

-- ============================================================================
-- PART 9 — FUNCTION: Calculate Labor Cost (Piece-Rate)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_piece_rate_labor_cost(
  p_job_id uuid,
  p_crew_id uuid
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job RECORD;
  v_crew RECORD;
  v_total_squares numeric;
  v_tear_off_total numeric;
  v_install_total numeric;
  v_cleanup_total numeric;
  v_base_total numeric;
  v_complexity_multiplier numeric;
  v_final_total numeric;
BEGIN
  -- Get job details
  SELECT 
    j.*,
    c.piece_rate_tear_off_per_square,
    c.piece_rate_install_per_square,
    c.piece_rate_cleanup_per_square
  INTO v_job
  FROM public.roofing_jobs j
  JOIN public.crews c ON c.id = p_crew_id
  WHERE j.id = p_job_id;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  -- Use roof_squares or calculate from job value
  v_total_squares := COALESCE(v_job.roof_squares, 0);
  
  IF v_total_squares = 0 THEN
    -- Try to estimate from job value (rough estimate: $200-300 per square)
    v_total_squares := GREATEST(1, ROUND(v_job.job_value / 250, 0));
  END IF;
  
  -- Calculate base piece-rate totals
  v_tear_off_total := v_total_squares * COALESCE(v_job.piece_rate_tear_off_per_square, 40);
  v_install_total := v_total_squares * COALESCE(v_job.piece_rate_install_per_square, 60);
  v_cleanup_total := v_total_squares * COALESCE(v_job.piece_rate_cleanup_per_square, 10);
  
  v_base_total := v_tear_off_total + v_install_total + v_cleanup_total;
  
  -- Apply complexity multipliers
  v_complexity_multiplier := COALESCE(v_job.complexity_factor, 1.0);
  
  -- Apply pitch multiplier if available
  IF v_job.roof_pitch IS NOT NULL THEN
    v_complexity_multiplier := v_complexity_multiplier * v_job.roof_pitch;
  END IF;
  
  -- Apply cut-up factor
  IF v_job.cut_up_factor IS NOT NULL THEN
    v_complexity_multiplier := v_complexity_multiplier * v_job.cut_up_factor;
  END IF;
  
  -- Add complexity adjustments for skylights, chimneys, valleys
  IF v_job.skylights_count > 0 THEN
    v_complexity_multiplier := v_complexity_multiplier + (v_job.skylights_count * 0.05);
  END IF;
  
  IF v_job.chimneys_count > 0 THEN
    v_complexity_multiplier := v_complexity_multiplier + (v_job.chimneys_count * 0.03);
  END IF;
  
  IF v_job.valleys_count > 0 THEN
    v_complexity_multiplier := v_complexity_multiplier + (v_job.valleys_count * 0.02);
  END IF;
  
  -- Apply decking replacement adjustment
  IF v_job.decking_replacement_squares > 0 THEN
    v_base_total := v_base_total + (v_job.decking_replacement_squares * 15); -- Extra $15 per square for decking
  END IF;
  
  -- Calculate final total
  v_final_total := v_base_total * v_complexity_multiplier;
  
  RETURN ROUND(v_final_total, 2);
END;
$$;

COMMENT ON FUNCTION public.calculate_piece_rate_labor_cost IS 'Block 25500: Calculate labor cost using piece-rate model';

-- ============================================================================
-- PART 10 — FUNCTION: Calculate Labor Cost (Hourly)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_hourly_labor_cost(
  p_job_id uuid,
  p_crew_id uuid
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job RECORD;
  v_crew RECORD;
  v_check_in RECORD;
  v_total_hours numeric;
  v_regular_hours numeric;
  v_overtime_hours numeric;
  v_regular_total numeric;
  v_overtime_total numeric;
  v_drive_time_total numeric;
  v_final_total numeric;
BEGIN
  -- Get crew details
  SELECT * INTO v_crew
  FROM public.crews
  WHERE id = p_crew_id;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  -- Get check-in data
  SELECT 
    COALESCE(SUM(billable_hours), 0) as total_hours,
    COALESCE(SUM(regular_hours), 0) as regular_hours,
    COALESCE(SUM(overtime_hours), 0) as overtime_hours,
    COALESCE(SUM(drive_time_minutes), 0) as drive_time_minutes
  INTO v_check_in
  FROM public.crew_check_ins
  WHERE job_id = p_job_id
    AND crew_id = p_crew_id
    AND check_out_time IS NOT NULL;
  
  v_total_hours := COALESCE(v_check_in.total_hours, 0);
  v_regular_hours := COALESCE(v_check_in.regular_hours, 0);
  v_overtime_hours := COALESCE(v_check_in.overtime_hours, 0);
  
  -- If no check-in data, use job actual_hours if available
  IF v_total_hours = 0 THEN
    SELECT actual_hours INTO v_total_hours
    FROM public.roofing_jobs
    WHERE id = p_job_id;
    
    IF v_total_hours > 0 THEN
      -- Calculate regular vs overtime
      IF v_total_hours > 8 THEN
        v_regular_hours := 8;
        v_overtime_hours := v_total_hours - 8;
      ELSE
        v_regular_hours := v_total_hours;
        v_overtime_hours := 0;
      END IF;
    END IF;
  END IF;
  
  -- Calculate regular pay
  v_regular_total := v_regular_hours * COALESCE(v_crew.hourly_rate, 28);
  
  -- Calculate overtime pay
  v_overtime_rate := COALESCE(v_crew.overtime_rate, v_crew.hourly_rate * 1.5);
  v_overtime_total := v_overtime_hours * v_overtime_rate;
  
  -- Calculate drive time pay
  IF v_check_in.drive_time_minutes > 0 AND v_crew.drive_time_policy = 'paid' THEN
    v_drive_time_rate := COALESCE(v_crew.drive_time_rate, v_crew.hourly_rate);
    v_drive_time_total := (v_check_in.drive_time_minutes / 60.0) * v_drive_time_rate;
  ELSIF v_check_in.drive_time_minutes > 0 AND v_crew.drive_time_policy = 'half_paid' THEN
    v_drive_time_rate := COALESCE(v_crew.drive_time_rate, v_crew.hourly_rate);
    v_drive_time_total := (v_check_in.drive_time_minutes / 60.0) * v_drive_time_rate * 0.5;
  ELSE
    v_drive_time_total := 0;
  END IF;
  
  -- Calculate final total
  v_final_total := v_regular_total + v_overtime_total + v_drive_time_total;
  
  RETURN ROUND(v_final_total, 2);
END;
$$;

COMMENT ON FUNCTION public.calculate_hourly_labor_cost IS 'Block 25500: Calculate labor cost using hourly model';

-- ============================================================================
-- PART 11 — FUNCTION: Calculate Crew Pay Entry
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_crew_pay_entry(
  p_job_id uuid,
  p_crew_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job RECORD;
  v_crew RECORD;
  v_pay_entry_id uuid;
  v_piece_rate_total numeric;
  v_hourly_total numeric;
  v_base_pay numeric;
  v_bonuses_total numeric;
  v_penalties_total numeric;
  v_total_pay numeric;
  v_calculation_details jsonb;
BEGIN
  -- Get job and crew details
  SELECT j.*, c.pay_model_type, c.piece_rate_tear_off_per_square, c.piece_rate_install_per_square,
         c.piece_rate_cleanup_per_square, c.hourly_rate, c.overtime_rate, c.drive_time_rate
  INTO v_job
  FROM public.roofing_jobs j
  JOIN public.crews c ON c.id = p_crew_id
  WHERE j.id = p_job_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job or crew not found';
  END IF;
  
  -- Check if pay entry already exists
  SELECT id INTO v_pay_entry_id
  FROM public.crew_pay_entries
  WHERE job_id = p_job_id
    AND crew_id = p_crew_id
    AND status != 'paid';
  
  -- Calculate based on pay model
  IF v_job.pay_model_type = 'piece_rate' THEN
    v_piece_rate_total := public.calculate_piece_rate_labor_cost(p_job_id, p_crew_id);
    v_base_pay := v_piece_rate_total;
    v_calculation_details := jsonb_build_object(
      'method', 'piece_rate',
      'squares', COALESCE(v_job.roof_squares, 0),
      'tear_off_rate', v_job.piece_rate_tear_off_per_square,
      'install_rate', v_job.piece_rate_install_per_square,
      'cleanup_rate', v_job.piece_rate_cleanup_per_square,
      'total', v_piece_rate_total
    );
  ELSIF v_job.pay_model_type = 'hourly' THEN
    v_hourly_total := public.calculate_hourly_labor_cost(p_job_id, p_crew_id);
    v_base_pay := v_hourly_total;
    v_calculation_details := jsonb_build_object(
      'method', 'hourly',
      'hours', COALESCE(v_job.actual_hours, 0),
      'hourly_rate', v_job.hourly_rate,
      'total', v_hourly_total
    );
  ELSIF v_job.pay_model_type = 'hybrid' THEN
    v_piece_rate_total := public.calculate_piece_rate_labor_cost(p_job_id, p_crew_id);
    v_hourly_total := public.calculate_hourly_labor_cost(p_job_id, p_crew_id);
    -- Hybrid: use the higher of the two, or average (business logic)
    v_base_pay := GREATEST(v_piece_rate_total, v_hourly_total);
    v_calculation_details := jsonb_build_object(
      'method', 'hybrid',
      'piece_rate_total', v_piece_rate_total,
      'hourly_total', v_hourly_total,
      'base_pay', v_base_pay
    );
  ELSE
    RAISE EXCEPTION 'Invalid pay model type';
  END IF;
  
  -- Calculate bonuses
  SELECT COALESCE(SUM(bonus_amount), 0) INTO v_bonuses_total
  FROM public.crew_bonuses
  WHERE crew_pay_entry_id = v_pay_entry_id
    OR (job_id = p_job_id AND crew_id = p_crew_id AND crew_pay_entry_id IS NULL);
  
  -- Calculate penalties
  SELECT COALESCE(SUM(penalty_amount), 0) INTO v_penalties_total
  FROM public.crew_penalties
  WHERE crew_pay_entry_id = v_pay_entry_id
    OR (job_id = p_job_id AND crew_id = p_crew_id AND crew_pay_entry_id IS NULL);
  
  -- Calculate total pay
  v_total_pay := GREATEST(0, v_base_pay + v_bonuses_total - v_penalties_total);
  
  -- Create or update pay entry
  IF v_pay_entry_id IS NOT NULL THEN
    UPDATE public.crew_pay_entries
    SET
      base_pay = v_base_pay,
      bonuses_total = v_bonuses_total,
      penalties_total = v_penalties_total,
      total_pay = v_total_pay,
      calculation_details = v_calculation_details,
      status = 'calculated',
      updated_at = now()
    WHERE id = v_pay_entry_id;
  ELSE
    INSERT INTO public.crew_pay_entries (
      job_id,
      crew_id,
      workspace_id,
      pay_model_type,
      piece_rate_total,
      hourly_total,
      base_pay,
      bonuses_total,
      penalties_total,
      total_pay,
      calculation_details,
      status
    )
    VALUES (
      p_job_id,
      p_crew_id,
      v_job.workspace_id,
      v_job.pay_model_type,
      v_piece_rate_total,
      v_hourly_total,
      v_base_pay,
      v_bonuses_total,
      v_penalties_total,
      v_total_pay,
      v_calculation_details,
      'calculated'
    )
    RETURNING id INTO v_pay_entry_id;
  END IF;
  
  -- Update job labor cost
  UPDATE public.roofing_jobs
  SET calculated_labor_cost = v_total_pay,
      labor_cost_calculation_method = v_job.pay_model_type
  WHERE id = p_job_id;
  
  -- Recalculate job financials if function exists
  BEGIN
    PERFORM public.recalc_job_financials(p_job_id);
  EXCEPTION WHEN OTHERS THEN
    -- Function may not exist yet, ignore
    NULL;
  END;
  
  RETURN v_pay_entry_id;
END;
$$;

COMMENT ON FUNCTION public.calculate_crew_pay_entry IS 'Block 25500: Calculate crew pay entry for a job';

-- ============================================================================
-- PART 12 — FUNCTION: Calculate Crew Performance Score
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_crew_performance_score(
  p_crew_id uuid,
  p_period_start date,
  p_period_end date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_crew RECORD;
  v_score_id uuid;
  v_jobs_completed integer;
  v_jobs_on_time integer;
  v_on_time_percentage numeric;
  v_avg_hours numeric;
  v_avg_hours_vs_target numeric;
  v_speed_score numeric;
  v_photo_compliance numeric;
  v_cleanup_score numeric;
  v_callback_count integer;
  v_callback_rate numeric;
  v_rework_count integer;
  v_rework_rate numeric;
  v_quality_score numeric;
  v_avg_rating numeric;
  v_review_score numeric;
  v_safety_incidents integer;
  v_safety_score numeric;
  v_avg_profit numeric;
  v_profit_score numeric;
  v_waste_percentage numeric;
  v_waste_score numeric;
  v_overall_score numeric;
  v_score_category text;
BEGIN
  -- Get crew details
  SELECT * INTO v_crew
  FROM public.crews
  WHERE id = p_crew_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Crew not found';
  END IF;
  
  -- Calculate job metrics
  SELECT 
    COUNT(*)::integer,
    COUNT(*) FILTER (WHERE j.scheduled_start_date IS NOT NULL AND j.scheduled_start_date <= j.created_at + INTERVAL '1 day')::integer
  INTO v_jobs_completed, v_jobs_on_time
  FROM public.roofing_jobs j
  JOIN public.job_crew_assignments jca ON jca.job_id = j.id AND jca.crew_id = p_crew_id
  WHERE j.status = 'completed'
    AND j.completed_at::date BETWEEN p_period_start AND p_period_end;
  
  v_on_time_percentage := CASE WHEN v_jobs_completed > 0 THEN (v_jobs_on_time::numeric / v_jobs_completed::numeric * 100) ELSE 0 END;
  
  -- Calculate speed metrics
  SELECT 
    AVG(j.actual_hours),
    AVG(j.actual_hours - j.target_hours)
  INTO v_avg_hours, v_avg_hours_vs_target
  FROM public.roofing_jobs j
  JOIN public.job_crew_assignments jca ON jca.job_id = j.id AND jca.crew_id = p_crew_id
  WHERE j.status = 'completed'
    AND j.completed_at::date BETWEEN p_period_start AND p_period_end
    AND j.actual_hours IS NOT NULL;
  
  -- Speed score: negative hours_vs_target = faster (better)
  v_speed_score := GREATEST(0, LEAST(100, 50 + (v_avg_hours_vs_target * -2)));
  
  -- Calculate quality metrics
  SELECT 
    AVG(CASE WHEN jsonb_array_length(cci.start_photos) >= 3 AND jsonb_array_length(cci.end_photos) >= 3 THEN 100 ELSE 50 END),
    AVG(CASE WHEN cci.cleanup_confirmed THEN 100 ELSE 50 END),
    COUNT(*) FILTER (WHERE ji.issue_type = 'callback')::integer,
    COUNT(*) FILTER (WHERE ji.issue_type = 'rework')::integer
  INTO v_photo_compliance, v_cleanup_score, v_callback_count, v_rework_count
  FROM public.roofing_jobs j
  JOIN public.job_crew_assignments jca ON jca.job_id = j.id AND jca.crew_id = p_crew_id
  LEFT JOIN public.crew_check_ins cci ON cci.job_id = j.id AND cci.crew_id = p_crew_id
  LEFT JOIN public.job_issues ji ON ji.job_id = j.id
  WHERE j.status = 'completed'
    AND j.completed_at::date BETWEEN p_period_start AND p_period_end;
  
  v_callback_rate := CASE WHEN v_jobs_completed > 0 THEN (v_callback_count::numeric / v_jobs_completed::numeric * 100) ELSE 0 END;
  v_rework_rate := CASE WHEN v_jobs_completed > 0 THEN (v_rework_count::numeric / v_jobs_completed::numeric * 100) ELSE 0 END;
  
  -- Quality score: weighted average of photo compliance, cleanup, callback rate, rework rate
  v_quality_score := (
    COALESCE(v_photo_compliance, 50) * 0.3 +
    COALESCE(v_cleanup_score, 50) * 0.3 +
    GREATEST(0, 100 - v_callback_rate * 2) * 0.2 +
    GREATEST(0, 100 - v_rework_rate * 2) * 0.2
  );
  
  -- Calculate review score
  SELECT AVG(rating) INTO v_avg_rating
  FROM public.homeowner_reviews
  WHERE job_id IN (
    SELECT j.id FROM public.roofing_jobs j
    JOIN public.job_crew_assignments jca ON jca.job_id = j.id AND jca.crew_id = p_crew_id
    WHERE j.completed_at::date BETWEEN p_period_start AND p_period_end
  );
  
  v_review_score := CASE WHEN v_avg_rating IS NOT NULL THEN (v_avg_rating / 5.0 * 100) ELSE 50 END;
  
  -- Safety score (assume 100 if no incidents, decrease with incidents)
  v_safety_incidents := 0; -- TODO: Get from safety incidents table
  v_safety_score := GREATEST(0, 100 - (v_safety_incidents * 10));
  
  -- Profit impact score
  SELECT AVG(j.actual_gross_profit) INTO v_avg_profit
  FROM public.roofing_jobs j
  JOIN public.job_crew_assignments jca ON jca.job_id = j.id AND jca.crew_id = p_crew_id
  WHERE j.status = 'completed'
    AND j.completed_at::date BETWEEN p_period_start AND p_period_end
    AND j.actual_gross_profit IS NOT NULL;
  
  v_profit_score := CASE 
    WHEN v_avg_profit > 5000 THEN 100
    WHEN v_avg_profit > 3000 THEN 80
    WHEN v_avg_profit > 1000 THEN 60
    WHEN v_avg_profit > 0 THEN 40
    ELSE 20
  END;
  
  -- Waste score (assume 0% waste = 100 score)
  v_waste_percentage := 0; -- TODO: Calculate from material waste tracking
  v_waste_score := GREATEST(0, 100 - (v_waste_percentage * 2));
  
  -- Calculate overall score (weighted average)
  v_overall_score := (
    v_speed_score * 0.15 +
    v_quality_score * 0.30 +
    v_review_score * 0.20 +
    v_safety_score * 0.15 +
    v_profit_score * 0.15 +
    v_waste_score * 0.05
  );
  
  -- Determine score category
  v_score_category := CASE
    WHEN v_overall_score >= 95 THEN 'elite'
    WHEN v_overall_score >= 85 THEN 'reliable'
    WHEN v_overall_score >= 70 THEN 'needs_coaching'
    ELSE 'at_risk'
  END;
  
  -- Create or update performance score
  INSERT INTO public.crew_performance_scores (
    crew_id,
    workspace_id,
    period_start_date,
    period_end_date,
    jobs_completed,
    jobs_on_time,
    on_time_percentage,
    avg_hours_per_job,
    avg_hours_vs_target,
    speed_score,
    photo_compliance_percentage,
    cleanup_quality_score,
    callback_count,
    callback_rate,
    rework_count,
    rework_rate,
    quality_score,
    avg_homeowner_rating,
    review_score,
    safety_incidents,
    safety_score,
    avg_profit_per_job,
    profit_impact_score,
    material_waste_percentage,
    waste_score,
    overall_score,
    score_category
  )
  VALUES (
    p_crew_id,
    v_crew.workspace_id,
    p_period_start,
    p_period_end,
    v_jobs_completed,
    v_jobs_on_time,
    v_on_time_percentage,
    v_avg_hours,
    v_avg_hours_vs_target,
    v_speed_score,
    v_photo_compliance,
    v_cleanup_score,
    v_callback_count,
    v_callback_rate,
    v_rework_count,
    v_rework_rate,
    v_quality_score,
    v_avg_rating,
    v_review_score,
    v_safety_incidents,
    v_safety_score,
    v_avg_profit,
    v_profit_score,
    v_waste_percentage,
    v_waste_score,
    v_overall_score,
    v_score_category
  )
  ON CONFLICT (crew_id, period_start_date, period_end_date) DO UPDATE
  SET
    jobs_completed = EXCLUDED.jobs_completed,
    jobs_on_time = EXCLUDED.jobs_on_time,
    on_time_percentage = EXCLUDED.on_time_percentage,
    avg_hours_per_job = EXCLUDED.avg_hours_per_job,
    avg_hours_vs_target = EXCLUDED.avg_hours_vs_target,
    speed_score = EXCLUDED.speed_score,
    photo_compliance_percentage = EXCLUDED.photo_compliance_percentage,
    cleanup_quality_score = EXCLUDED.cleanup_quality_score,
    callback_count = EXCLUDED.callback_count,
    callback_rate = EXCLUDED.callback_rate,
    rework_count = EXCLUDED.rework_count,
    rework_rate = EXCLUDED.rework_rate,
    quality_score = EXCLUDED.quality_score,
    avg_homeowner_rating = EXCLUDED.avg_homeowner_rating,
    review_score = EXCLUDED.review_score,
    safety_incidents = EXCLUDED.safety_incidents,
    safety_score = EXCLUDED.safety_score,
    avg_profit_per_job = EXCLUDED.avg_profit_per_job,
    profit_impact_score = EXCLUDED.profit_impact_score,
    material_waste_percentage = EXCLUDED.material_waste_percentage,
    waste_score = EXCLUDED.waste_score,
    overall_score = EXCLUDED.overall_score,
    score_category = EXCLUDED.score_category,
    calculated_at = now(),
    updated_at = now()
  RETURNING id INTO v_score_id;
  
  RETURN v_score_id;
END;
$$;

COMMENT ON FUNCTION public.calculate_crew_performance_score IS 'Block 25500: Calculate crew performance score for a period';

-- ============================================================================
-- PART 13 — FUNCTION: Auto-calculate hours from check-in
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_calculate_check_in_hours()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_hours numeric;
  v_billable_hours numeric;
  v_break_duration numeric;
  v_regular_hours numeric;
  v_overtime_hours numeric;
BEGIN
  -- Only calculate if check-out time is set
  IF NEW.check_out_time IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Calculate break duration
  IF NEW.break_start_time IS NOT NULL AND NEW.break_end_time IS NOT NULL THEN
    v_break_duration := EXTRACT(EPOCH FROM (NEW.break_end_time - NEW.break_start_time)) / 60;
    NEW.break_duration_minutes := v_break_duration::integer;
  ELSE
    v_break_duration := COALESCE(NEW.break_duration_minutes, 0);
  END IF;
  
  -- Calculate total hours
  v_total_hours := EXTRACT(EPOCH FROM (NEW.check_out_time - NEW.check_in_time)) / 3600;
  
  -- Calculate billable hours (excluding breaks)
  v_billable_hours := v_total_hours - (v_break_duration / 60);
  
  -- Calculate regular vs overtime
  IF v_billable_hours > 8 THEN
    v_regular_hours := 8;
    v_overtime_hours := v_billable_hours - 8;
  ELSE
    v_regular_hours := v_billable_hours;
    v_overtime_hours := 0;
  END IF;
  
  -- Update fields
  NEW.total_hours := ROUND(v_total_hours, 2);
  NEW.billable_hours := ROUND(v_billable_hours, 2);
  NEW.regular_hours := ROUND(v_regular_hours, 2);
  NEW.overtime_hours := ROUND(v_overtime_hours, 2);
  
  -- Update status
  IF NEW.status = 'checked_in' THEN
    NEW.status := 'checked_out';
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_calculate_check_in_hours ON public.crew_check_ins;
CREATE TRIGGER trg_auto_calculate_check_in_hours
BEFORE INSERT OR UPDATE OF check_out_time, break_start_time, break_end_time ON public.crew_check_ins
FOR EACH ROW
EXECUTE FUNCTION public.auto_calculate_check_in_hours();

-- ============================================================================
-- PART 14 — FUNCTION: Auto-update pay entry when check-in completes
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_update_pay_on_checkout()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- If check-out just happened, recalculate pay
  IF NEW.check_out_time IS NOT NULL AND (OLD.check_out_time IS NULL OR OLD.check_out_time != NEW.check_out_time) THEN
    PERFORM public.calculate_crew_pay_entry(NEW.job_id, NEW.crew_id);
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_update_pay_on_checkout ON public.crew_check_ins;
CREATE TRIGGER trg_auto_update_pay_on_checkout
AFTER UPDATE OF check_out_time ON public.crew_check_ins
FOR EACH ROW
EXECUTE FUNCTION public.auto_update_pay_on_checkout();

-- ============================================================================
-- PART 15 — FUNCTION: Update bonuses total when bonus added
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_bonuses_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pay_entry_id uuid;
  v_bonuses_total numeric;
BEGIN
  -- Get pay entry ID
  v_pay_entry_id := COALESCE(NEW.crew_pay_entry_id, (
    SELECT id FROM public.crew_pay_entries
    WHERE job_id = NEW.job_id AND crew_id = NEW.crew_id
    LIMIT 1
  ));
  
  IF v_pay_entry_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Calculate total bonuses
  SELECT COALESCE(SUM(bonus_amount), 0) INTO v_bonuses_total
  FROM public.crew_bonuses
  WHERE crew_pay_entry_id = v_pay_entry_id;
  
  -- Update pay entry
  UPDATE public.crew_pay_entries
  SET
    bonuses_total = v_bonuses_total,
    total_pay = base_pay + bonuses_total - penalties_total,
    updated_at = now()
  WHERE id = v_pay_entry_id;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_bonuses_total ON public.crew_bonuses;
CREATE TRIGGER trg_update_bonuses_total
AFTER INSERT OR UPDATE OR DELETE ON public.crew_bonuses
FOR EACH ROW
EXECUTE FUNCTION public.update_bonuses_total();

-- ============================================================================
-- PART 16 — FUNCTION: Update penalties total when penalty added
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_penalties_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pay_entry_id uuid;
  v_penalties_total numeric;
BEGIN
  -- Get pay entry ID
  v_pay_entry_id := COALESCE(NEW.crew_pay_entry_id, (
    SELECT id FROM public.crew_pay_entries
    WHERE job_id = NEW.job_id AND crew_id = NEW.crew_id
    LIMIT 1
  ));
  
  IF v_pay_entry_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Calculate total penalties
  SELECT COALESCE(SUM(penalty_amount), 0) INTO v_penalties_total
  FROM public.crew_penalties
  WHERE crew_pay_entry_id = v_pay_entry_id;
  
  -- Update pay entry
  UPDATE public.crew_pay_entries
  SET
    penalties_total = v_penalties_total,
    total_pay = base_pay + bonuses_total - penalties_total,
    updated_at = now()
  WHERE id = v_pay_entry_id;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_penalties_total ON public.crew_penalties;
CREATE TRIGGER trg_update_penalties_total
AFTER INSERT OR UPDATE OR DELETE ON public.crew_penalties
FOR EACH ROW
EXECUTE FUNCTION public.update_penalties_total();

-- ============================================================================
-- PART 17 — CREATE VIEW: Labor Cost Forecast
-- ============================================================================

CREATE OR REPLACE VIEW public.labor_cost_forecast AS
SELECT 
  w.id as workspace_id,
  DATE_TRUNC('week', j.scheduled_start_date)::date as week_start,
  DATE_TRUNC('month', j.scheduled_start_date)::date as month_start,
  COUNT(DISTINCT j.id) as jobs_count,
  COUNT(DISTINCT jca.crew_id) as crews_count,
  COALESCE(SUM(j.calculated_labor_cost), 0) as estimated_labor_cost,
  COALESCE(AVG(j.calculated_labor_cost), 0) as avg_labor_cost_per_job,
  COALESCE(SUM(j.job_value), 0) as total_job_value,
  CASE 
    WHEN SUM(j.job_value) > 0 
    THEN (SUM(j.calculated_labor_cost) / SUM(j.job_value) * 100)
    ELSE 0
  END as labor_cost_percentage
FROM public.workspaces w
LEFT JOIN public.roofing_jobs j ON j.workspace_id = w.id
LEFT JOIN public.job_crew_assignments jca ON jca.job_id = j.id AND jca.unassigned_at IS NULL
WHERE j.scheduled_start_date >= CURRENT_DATE
  AND j.status IN ('scheduled', 'in_progress')
GROUP BY w.id, DATE_TRUNC('week', j.scheduled_start_date)::date, DATE_TRUNC('month', j.scheduled_start_date)::date;

COMMENT ON VIEW public.labor_cost_forecast IS 'Block 25500: Labor cost forecast by week and month';

-- ============================================================================
-- PART 18 — CREATE VIEW: Owner Payroll Dashboard
-- ============================================================================

CREATE OR REPLACE VIEW public.owner_payroll_dashboard AS
SELECT 
  w.id as workspace_id,
  DATE_TRUNC('week', cpe.created_at)::date as week_start,
  COUNT(DISTINCT cpe.crew_id) as crews_paid,
  COUNT(DISTINCT cpe.job_id) as jobs_paid,
  COALESCE(SUM(cpe.total_pay), 0) as total_payroll,
  COALESCE(SUM(cpe.base_pay), 0) as base_payroll,
  COALESCE(SUM(cpe.bonuses_total), 0) as total_bonuses,
  COALESCE(SUM(cpe.penalties_total), 0) as total_penalties,
  COALESCE(SUM(j.job_value), 0) as total_revenue,
  CASE 
    WHEN SUM(j.job_value) > 0 
    THEN (SUM(cpe.total_pay) / SUM(j.job_value) * 100)
    ELSE 0
  END as labor_cost_percentage,
  COALESCE(SUM(cci.billable_hours), 0) as total_hours,
  COALESCE(AVG(cpe.total_pay), 0) as avg_pay_per_crew
FROM public.workspaces w
LEFT JOIN public.crew_pay_entries cpe ON cpe.workspace_id = w.id
LEFT JOIN public.roofing_jobs j ON j.id = cpe.job_id
LEFT JOIN public.crew_check_ins cci ON cci.job_id = cpe.job_id AND cci.crew_id = cpe.crew_id
WHERE cpe.status IN ('approved', 'paid')
GROUP BY w.id, DATE_TRUNC('week', cpe.created_at)::date;

COMMENT ON VIEW public.owner_payroll_dashboard IS 'Block 25500: Owner payroll dashboard summary';

-- ============================================================================
-- PART 19 — CREATE VIEW: Crew Performance Summary
-- ============================================================================

CREATE OR REPLACE VIEW public.crew_performance_summary AS
SELECT 
  c.id as crew_id,
  c.name as crew_name,
  c.workspace_id,
  cps.overall_score,
  cps.score_category,
  cps.jobs_completed,
  cps.on_time_percentage,
  cps.callback_rate,
  cps.avg_homeowner_rating,
  cps.avg_profit_per_job,
  COALESCE(SUM(cpe.total_pay), 0) as total_earnings,
  COALESCE(COUNT(DISTINCT cpe.job_id), 0) as jobs_paid,
  COALESCE(AVG(cpe.total_pay), 0) as avg_pay_per_job
FROM public.crews c
LEFT JOIN public.crew_performance_scores cps ON cps.crew_id = c.id
LEFT JOIN public.crew_pay_entries cpe ON cpe.crew_id = c.id AND cpe.status IN ('approved', 'paid')
WHERE c.is_active = true
GROUP BY c.id, c.name, c.workspace_id, cps.overall_score, cps.score_category, 
         cps.jobs_completed, cps.on_time_percentage, cps.callback_rate, 
         cps.avg_homeowner_rating, cps.avg_profit_per_job;

COMMENT ON VIEW public.crew_performance_summary IS 'Block 25500: Crew performance summary with earnings';

-- ============================================================================
-- PART 20 — TRIGGERS FOR UPDATED_AT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_crew_check_ins_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crew_check_ins_updated_at ON public.crew_check_ins;
CREATE TRIGGER trg_crew_check_ins_updated_at
BEFORE UPDATE ON public.crew_check_ins
FOR EACH ROW
EXECUTE FUNCTION public.set_crew_check_ins_updated_at();

CREATE OR REPLACE FUNCTION public.set_crew_pay_entries_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crew_pay_entries_updated_at ON public.crew_pay_entries;
CREATE TRIGGER trg_crew_pay_entries_updated_at
BEFORE UPDATE ON public.crew_pay_entries
FOR EACH ROW
EXECUTE FUNCTION public.set_crew_pay_entries_updated_at();

CREATE OR REPLACE FUNCTION public.set_crew_performance_scores_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crew_performance_scores_updated_at ON public.crew_performance_scores;
CREATE TRIGGER trg_crew_performance_scores_updated_at
BEFORE UPDATE ON public.crew_performance_scores
FOR EACH ROW
EXECUTE FUNCTION public.set_crew_performance_scores_updated_at();

-- ============================================================================
-- PART 21 — ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- crew_check_ins RLS
ALTER TABLE public.crew_check_ins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view check-ins in their workspace"
  ON public.crew_check_ins FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Crew can create check-ins"
  ON public.crew_check_ins FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update check-ins in their workspace"
  ON public.crew_check_ins FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- crew_pay_entries RLS
ALTER TABLE public.crew_pay_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view pay entries in their workspace"
  ON public.crew_pay_entries FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage pay entries in their workspace"
  ON public.crew_pay_entries FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- crew_bonuses RLS
ALTER TABLE public.crew_bonuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view bonuses in their workspace"
  ON public.crew_bonuses FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage bonuses in their workspace"
  ON public.crew_bonuses FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- crew_penalties RLS
ALTER TABLE public.crew_penalties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view penalties in their workspace"
  ON public.crew_penalties FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage penalties in their workspace"
  ON public.crew_penalties FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- payroll_exports RLS
ALTER TABLE public.payroll_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view exports in their workspace"
  ON public.payroll_exports FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create exports in their workspace"
  ON public.payroll_exports FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- ============================================================================
-- PART 22 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON public.crew_check_ins TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crew_pay_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crew_bonuses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crew_penalties TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.payroll_exports TO authenticated;
GRANT SELECT ON public.labor_cost_forecast TO authenticated;
GRANT SELECT ON public.owner_payroll_dashboard TO authenticated;
GRANT SELECT ON public.crew_performance_summary TO authenticated;

GRANT EXECUTE ON FUNCTION public.calculate_piece_rate_labor_cost(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_hourly_labor_cost(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_crew_pay_entry(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_crew_performance_score(uuid, date, date) TO authenticated;

-- ============================================================================
-- END OF BLOCK 25500
-- ============================================================================




































