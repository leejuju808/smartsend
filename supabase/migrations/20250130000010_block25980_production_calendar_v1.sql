-- =========================================================
-- Block 25980 — SmartSend Roofing Production Calendar v1
-- (Job Calendar • Crew Schedule • Material Delivery Calendar • Weather Risk Layer • Color-Coded Production Heatmap)
-- =========================================================
-- 
-- THE PRODUCTION CALENDAR — ZERO FLUFF.
-- This is where SmartSend becomes the operational brain of every roofing company.
--
-- Roofers today deal with:
-- ❌ jobs stacked on wrong days
-- ❌ crews double-booked
-- ❌ materials arriving late
-- ❌ last-minute weather delays
-- ❌ angry homeowners
-- ❌ no visibility across markets
-- ❌ chaotic whiteboards & Google Calendars
-- ❌ ops manager drowning in texts
-- ❌ no forecasting of install capacity
--
-- SmartSend Production Calendar v1 fixes ALL OF THIS.
-- This is the calendar that roofing companies SHOULD have been using the last 10 years.
-- =========================================================

-- ============================================================================
-- PART 1 — ENHANCE crews TABLE WITH CAPACITY AND SKILL TAGS
-- ============================================================================
-- Add crew capacity tracking and skill tags for job matching

ALTER TABLE IF EXISTS public.crews
  ADD COLUMN IF NOT EXISTS capacity_squares_per_day numeric DEFAULT 30.0, -- Default crew capacity in squares/day
  ADD COLUMN IF NOT EXISTS skill_tags text[], -- Array of skill tags: ['steep_pitch', 'metal_roofing', 'commercial', 'high_rise']
  ADD COLUMN IF NOT EXISTS market_id uuid REFERENCES public.roofing_markets(id) ON DELETE SET NULL, -- Market assignment
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS blocked_dates date[], -- Array of blocked dates (holidays, time off, etc.)
  ADD COLUMN IF NOT EXISTS travel_time_buffer_minutes integer DEFAULT 30; -- Buffer time between jobs

CREATE INDEX IF NOT EXISTS idx_crews_market ON public.crews(market_id) WHERE market_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crews_active ON public.crews(workspace_id, is_active) WHERE is_active = true;

COMMENT ON COLUMN public.crews.capacity_squares_per_day IS 'Block 25980: Crew capacity in squares per day';
COMMENT ON COLUMN public.crews.skill_tags IS 'Block 25980: Array of skill tags for crew matching';
COMMENT ON COLUMN public.crews.market_id IS 'Block 25980: Market assignment for multi-market support';
COMMENT ON COLUMN public.crews.blocked_dates IS 'Block 25980: Dates when crew is unavailable';

-- ============================================================================
-- PART 2 — ENHANCE job_production_slots WITH WEATHER RISK AND CONFLICTS
-- ============================================================================
-- Add weather risk, conflict detection, and readiness tracking

ALTER TABLE IF EXISTS public.job_production_slots
  ADD COLUMN IF NOT EXISTS weather_risk_score integer CHECK (weather_risk_score >= 0 AND weather_risk_score <= 100),
  ADD COLUMN IF NOT EXISTS weather_risk_category text CHECK (weather_risk_category IN ('safe', 'mild_caution', 'moderate_risk', 'high_risk', 'severe_dangerous', 'unknown')),
  ADD COLUMN IF NOT EXISTS conflicts jsonb DEFAULT '[]'::jsonb, -- Array of conflict objects: [{'type': 'double_booked_crew', 'message': '...'}]
  ADD COLUMN IF NOT EXISTS has_conflicts boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS job_readiness_score integer CHECK (job_readiness_score >= 0 AND job_readiness_score <= 100), -- 0-100 readiness score
  ADD COLUMN IF NOT EXISTS is_job_ready boolean DEFAULT false, -- Auto-calculated from readiness checklist
  ADD COLUMN IF NOT EXISTS estimated_duration_hours numeric, -- Estimated install duration
  ADD COLUMN IF NOT EXISTS travel_distance_miles numeric, -- Distance from previous job
  ADD COLUMN IF NOT EXISTS color_code text; -- Color code for calendar display

CREATE INDEX IF NOT EXISTS idx_production_slots_conflicts ON public.job_production_slots(has_conflicts) WHERE has_conflicts = true;
CREATE INDEX IF NOT EXISTS idx_production_slots_weather_risk ON public.job_production_slots(weather_risk_category, start_date);
CREATE INDEX IF NOT EXISTS idx_production_slots_readiness ON public.job_production_slots(is_job_ready, start_date) WHERE is_job_ready = false;

COMMENT ON COLUMN public.job_production_slots.weather_risk_score IS 'Block 25980: Weather risk score (0-100)';
COMMENT ON COLUMN public.job_production_slots.conflicts IS 'Block 25980: Array of detected conflicts';
COMMENT ON COLUMN public.job_production_slots.job_readiness_score IS 'Block 25980: Job readiness score (0-100)';
COMMENT ON COLUMN public.job_production_slots.is_job_ready IS 'Block 25980: Whether job passes readiness checklist';

-- ============================================================================
-- PART 3 — CREATE job_readiness_checklist TABLE
-- ============================================================================
-- Tracks job readiness requirements before scheduling

CREATE TABLE IF NOT EXISTS public.job_readiness_checklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  
  -- Checklist items
  inspection_completed boolean DEFAULT false,
  quote_approved boolean DEFAULT false,
  contract_signed boolean DEFAULT false,
  deposit_received boolean DEFAULT false,
  materials_ordered boolean DEFAULT false,
  insurance_docs_uploaded boolean DEFAULT false,
  hoa_approval_received boolean DEFAULT false, -- Optional, can be null
  hoa_approval_required boolean DEFAULT false, -- Whether HOA approval is required
  
  -- Readiness calculation
  readiness_score integer CHECK (readiness_score >= 0 AND readiness_score <= 100) DEFAULT 0,
  is_ready boolean DEFAULT false,
  missing_items text[], -- Array of missing item names
  
  -- Metadata
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- One checklist per job
  UNIQUE(job_id)
);

CREATE INDEX IF NOT EXISTS idx_job_readiness_job ON public.job_readiness_checklist(job_id);
CREATE INDEX IF NOT EXISTS idx_job_readiness_ready ON public.job_readiness_checklist(workspace_id, is_ready) WHERE is_ready = false;
CREATE INDEX IF NOT EXISTS idx_job_readiness_workspace ON public.job_readiness_checklist(workspace_id);

COMMENT ON TABLE public.job_readiness_checklist IS 'Block 25980: Job readiness checklist - prevents scheduling unready jobs';

-- ============================================================================
-- PART 4 — CREATE production_calendar_conflicts TABLE
-- ============================================================================
-- Stores detected conflicts for production calendar

CREATE TABLE IF NOT EXISTS public.production_calendar_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  production_slot_id uuid REFERENCES public.job_production_slots(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  
  -- Conflict details
  conflict_type text NOT NULL CHECK (conflict_type IN (
    'double_booked_crew',
    'conflicting_material_delivery',
    'weather_dangerous',
    'job_not_ready_missing_docs',
    'job_not_ready_missing_payment',
    'overlapping_major_jobs',
    'crew_over_capacity',
    'material_shortage',
    'crew_blocked_date',
    'travel_time_conflict'
  )),
  conflict_message text NOT NULL,
  conflict_severity text CHECK (conflict_severity IN ('warning', 'error', 'critical')) DEFAULT 'error',
  is_resolved boolean DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_notes text,
  
  -- Conflict data
  conflict_data jsonb DEFAULT '{}'::jsonb, -- Additional conflict details
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_conflicts_slot ON public.production_calendar_conflicts(production_slot_id);
CREATE INDEX IF NOT EXISTS idx_calendar_conflicts_job ON public.production_calendar_conflicts(job_id);
CREATE INDEX IF NOT EXISTS idx_calendar_conflicts_crew ON public.production_calendar_conflicts(crew_id);
CREATE INDEX IF NOT EXISTS idx_calendar_conflicts_resolved ON public.production_calendar_conflicts(workspace_id, is_resolved) WHERE is_resolved = false;
CREATE INDEX IF NOT EXISTS idx_calendar_conflicts_type ON public.production_calendar_conflicts(conflict_type, created_at DESC);

COMMENT ON TABLE public.production_calendar_conflicts IS 'Block 25980: Detected conflicts in production calendar';

-- ============================================================================
-- PART 5 — CREATE production_heatmap_data TABLE
-- ============================================================================
-- Stores production heatmap data for visualization

CREATE TABLE IF NOT EXISTS public.production_heatmap_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  market_id uuid REFERENCES public.roofing_markets(id) ON DELETE SET NULL,
  
  -- Date and metrics
  calendar_date date NOT NULL,
  total_jobs_scheduled integer DEFAULT 0,
  total_squares_scheduled numeric DEFAULT 0,
  total_crews_assigned integer DEFAULT 0,
  weather_cancelled_jobs integer DEFAULT 0,
  
  -- Heatmap intensity (0-100)
  production_intensity integer CHECK (production_intensity >= 0 AND production_intensity <= 100) DEFAULT 0,
  intensity_category text CHECK (intensity_category IN ('heavy', 'moderate', 'light', 'open', 'weather_cancelled')) DEFAULT 'open',
  
  -- Capacity metrics
  available_crew_capacity_squares numeric DEFAULT 0,
  scheduled_squares numeric DEFAULT 0,
  capacity_utilization_pct numeric DEFAULT 0, -- Percentage of capacity used
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- One record per date per workspace/market
  UNIQUE(workspace_id, market_id, calendar_date)
);

CREATE INDEX IF NOT EXISTS idx_heatmap_date ON public.production_heatmap_data(calendar_date DESC);
CREATE INDEX IF NOT EXISTS idx_heatmap_workspace ON public.production_heatmap_data(workspace_id, calendar_date DESC);
CREATE INDEX IF NOT EXISTS idx_heatmap_market ON public.production_heatmap_data(market_id, calendar_date DESC) WHERE market_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_heatmap_intensity ON public.production_heatmap_data(intensity_category, calendar_date DESC);

COMMENT ON TABLE public.production_heatmap_data IS 'Block 25980: Production heatmap data for calendar visualization';

-- ============================================================================
-- PART 6 — ENHANCE material_deliveries WITH CALENDAR INTEGRATION
-- ============================================================================
-- Add fields for calendar display and conflict detection

ALTER TABLE IF EXISTS public.material_deliveries
  ADD COLUMN IF NOT EXISTS delivery_window_start timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_window_end timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_type text CHECK (delivery_type IN ('drop_off', 'rooftop_load', 'curbside')) DEFAULT 'drop_off',
  ADD COLUMN IF NOT EXISTS supplier_name text, -- Denormalized for quick access
  ADD COLUMN IF NOT EXISTS po_status text, -- PO status from material_orders
  ADD COLUMN IF NOT EXISTS delivery_confirmed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_conflicts boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS conflict_message text;

CREATE INDEX IF NOT EXISTS idx_material_deliveries_window ON public.material_deliveries(delivery_window_start, delivery_window_end);
CREATE INDEX IF NOT EXISTS idx_material_deliveries_conflicts ON public.material_deliveries(has_conflicts) WHERE has_conflicts = true;
CREATE INDEX IF NOT EXISTS idx_material_deliveries_date ON public.material_deliveries(delivery_date, status);

COMMENT ON COLUMN public.material_deliveries.delivery_window_start IS 'Block 25980: Start of delivery window';
COMMENT ON COLUMN public.material_deliveries.delivery_window_end IS 'Block 25980: End of delivery window';
COMMENT ON COLUMN public.material_deliveries.delivery_type IS 'Block 25980: Type of delivery';

-- ============================================================================
-- PART 7 — CREATE crew_calendar_view TABLE
-- ============================================================================
-- Pre-computed crew calendar view for fast access

CREATE TABLE IF NOT EXISTS public.crew_calendar_view (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  crew_id uuid NOT NULL REFERENCES public.crews(id) ON DELETE CASCADE,
  market_id uuid REFERENCES public.roofing_markets(id) ON DELETE SET NULL,
  
  -- Date range
  view_date date NOT NULL,
  
  -- Daily metrics
  jobs_assigned_count integer DEFAULT 0,
  total_squares_assigned numeric DEFAULT 0,
  capacity_utilization_pct numeric DEFAULT 0,
  travel_distance_total_miles numeric DEFAULT 0,
  estimated_hours_total numeric DEFAULT 0,
  
  -- Status
  is_over_capacity boolean DEFAULT false,
  has_conflicts boolean DEFAULT false,
  conflicts_count integer DEFAULT 0,
  
  -- Upcoming availability
  next_available_date date,
  upcoming_availability_dates date[],
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- One record per crew per date
  UNIQUE(crew_id, view_date)
);

CREATE INDEX IF NOT EXISTS idx_crew_calendar_crew ON public.crew_calendar_view(crew_id, view_date DESC);
CREATE INDEX IF NOT EXISTS idx_crew_calendar_workspace ON public.crew_calendar_view(workspace_id, view_date DESC);
CREATE INDEX IF NOT EXISTS idx_crew_calendar_market ON public.crew_calendar_view(market_id, view_date DESC) WHERE market_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crew_calendar_over_capacity ON public.crew_calendar_view(is_over_capacity, view_date) WHERE is_over_capacity = true;

COMMENT ON TABLE public.crew_calendar_view IS 'Block 25980: Pre-computed crew calendar view for fast access';

-- ============================================================================
-- PART 8 — CREATE production_calendar_reschedule_log TABLE
-- ============================================================================
-- Tracks rescheduling events for audit trail

CREATE TABLE IF NOT EXISTS public.production_calendar_reschedule_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  production_slot_id uuid NOT NULL REFERENCES public.job_production_slots(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  
  -- Reschedule details
  old_start_date date NOT NULL,
  old_end_date date NOT NULL,
  new_start_date date NOT NULL,
  new_end_date date NOT NULL,
  old_crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  new_crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  
  -- Reason
  reschedule_reason text,
  reschedule_type text CHECK (reschedule_type IN ('manual', 'weather', 'conflict', 'material_delay', 'homeowner_request', 'auto_optimization')) DEFAULT 'manual',
  
  -- Who/what triggered
  rescheduled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  triggered_by text, -- 'user', 'weather_system', 'conflict_detection', 'automation'
  
  -- Notifications sent
  homeowner_notified boolean DEFAULT false,
  crew_notified boolean DEFAULT false,
  supplier_notified boolean DEFAULT false,
  
  -- Timestamps
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reschedule_log_job ON public.production_calendar_reschedule_log(job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reschedule_log_slot ON public.production_calendar_reschedule_log(production_slot_id);
CREATE INDEX IF NOT EXISTS idx_reschedule_log_workspace ON public.production_calendar_reschedule_log(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reschedule_log_type ON public.production_calendar_reschedule_log(reschedule_type, created_at DESC);

COMMENT ON TABLE public.production_calendar_reschedule_log IS 'Block 25980: Audit log for production calendar rescheduling';

-- ============================================================================
-- PART 9 — CREATE VIEWS FOR CALENDAR DATA
-- ============================================================================

-- View: Job Calendar (all jobs with details)
CREATE OR REPLACE VIEW public.v_job_calendar AS
SELECT 
  jps.id as slot_id,
  jps.workspace_id,
  jps.job_id,
  jps.crew_id,
  jps.start_date,
  jps.end_date,
  jps.status as slot_status,
  jps.weather_risk_score,
  jps.weather_risk_category,
  jps.has_conflicts,
  jps.is_job_ready,
  jps.job_readiness_score,
  jps.estimated_duration_hours,
  jps.travel_distance_miles,
  jps.color_code,
  
  -- Job details
  rj.title as job_title,
  rj.homeowner_name,
  rj.address as job_address,
  rj.roof_squares,
  rj.roof_pitch,
  rj.complexity_factor,
  rj.job_type,
  rj.status as job_status,
  rj.material_status,
  rj.material_expected_date,
  
  -- Crew details
  c.name as crew_name,
  c.foreman_name,
  c.foreman_phone,
  c.capacity_squares_per_day,
  c.skill_tags as crew_skill_tags,
  
  -- Market details
  c.market_id,
  rm.name as market_name,
  
  -- Readiness checklist summary
  jrc.is_ready as readiness_is_ready,
  jrc.readiness_score as readiness_score,
  jrc.missing_items as readiness_missing_items,
  
  -- Weather risk from weather_risk_scores table
  wrs.risk_score as latest_weather_risk_score,
  wrs.risk_category as latest_weather_risk_category,
  wrs.recommendation as weather_recommendation
  
FROM public.job_production_slots jps
LEFT JOIN public.roofing_jobs rj ON jps.job_id = rj.id
LEFT JOIN public.crews c ON jps.crew_id = c.id
LEFT JOIN public.roofing_markets rm ON c.market_id = rm.id
LEFT JOIN public.job_readiness_checklist jrc ON jps.job_id = jrc.job_id
LEFT JOIN LATERAL (
  SELECT risk_score, risk_category, recommendation
  FROM public.weather_risk_scores
  WHERE job_id = jps.job_id
    AND forecast_date = jps.start_date
  ORDER BY forecast_hour ASC
  LIMIT 1
) wrs ON true;

COMMENT ON VIEW public.v_job_calendar IS 'Block 25980: Job calendar view with all job, crew, and weather details';

-- View: Crew Calendar (all crew assignments)
CREATE OR REPLACE VIEW public.v_crew_calendar AS
SELECT 
  c.id as crew_id,
  c.workspace_id,
  c.name as crew_name,
  c.market_id,
  rm.name as market_name,
  c.capacity_squares_per_day,
  c.skill_tags,
  c.is_active,
  
  jps.id as slot_id,
  jps.job_id,
  jps.start_date,
  jps.end_date,
  jps.status,
  jps.estimated_duration_hours,
  jps.travel_distance_miles,
  jps.has_conflicts,
  
  rj.title as job_title,
  rj.homeowner_name,
  rj.address as job_address,
  rj.roof_squares,
  
  -- Daily aggregation (for date range queries)
  COUNT(*) OVER (PARTITION BY c.id, jps.start_date) as jobs_on_date,
  SUM(rj.roof_squares) OVER (PARTITION BY c.id, jps.start_date) as total_squares_on_date,
  SUM(jps.estimated_duration_hours) OVER (PARTITION BY c.id, jps.start_date) as total_hours_on_date
  
FROM public.crews c
LEFT JOIN public.roofing_markets rm ON c.market_id = rm.id
LEFT JOIN public.job_production_slots jps ON c.id = jps.crew_id
LEFT JOIN public.roofing_jobs rj ON jps.job_id = rj.id
WHERE c.is_active = true;

COMMENT ON VIEW public.v_crew_calendar IS 'Block 25980: Crew calendar view with all crew assignments';

-- View: Material Delivery Calendar
CREATE OR REPLACE VIEW public.v_material_delivery_calendar AS
SELECT 
  md.id as delivery_id,
  md.workspace_id,
  md.job_id,
  md.material_order_id,
  md.delivery_date,
  md.delivery_window_start,
  md.delivery_window_end,
  md.delivery_type,
  md.status as delivery_status,
  md.supplier_name,
  md.po_status,
  md.delivery_confirmed,
  md.has_conflicts,
  md.conflict_message,
  
  -- Job details
  rj.title as job_title,
  rj.homeowner_name,
  rj.address as job_address,
  rj.scheduled_start_date,
  
  -- Material order details
  mo.po_number,
  mo.supplier_id,
  s.name as supplier_full_name,
  s.phone as supplier_phone,
  s.email as supplier_email,
  
  -- Material order items summary
  (
    SELECT jsonb_agg(
      jsonb_build_object(
        'description', moi.description,
        'quantity', moi.quantity,
        'unit', moi.unit
      )
    )
    FROM public.material_order_items moi
    WHERE moi.material_order_id = mo.id
  ) as material_items
  
FROM public.material_deliveries md
LEFT JOIN public.roofing_jobs rj ON md.job_id = rj.id
LEFT JOIN public.material_orders mo ON md.material_order_id = mo.id
LEFT JOIN public.suppliers s ON mo.supplier_id = s.id;

COMMENT ON VIEW public.v_material_delivery_calendar IS 'Block 25980: Material delivery calendar view';

-- ============================================================================
-- PART 10 — FUNCTIONS FOR CONFLICT DETECTION
-- ============================================================================

-- Function: Detect conflicts for a production slot
CREATE OR REPLACE FUNCTION public.detect_production_slot_conflicts(
  p_slot_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_slot public.job_production_slots%ROWTYPE;
  v_conflicts jsonb := '[]'::jsonb;
  v_has_conflicts boolean := false;
  v_conflict_count integer := 0;
BEGIN
  -- Get slot details
  SELECT * INTO v_slot
  FROM public.job_production_slots
  WHERE id = p_slot_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Clear existing conflicts for this slot
  DELETE FROM public.production_calendar_conflicts
  WHERE production_slot_id = p_slot_id AND is_resolved = false;
  
  -- 1. Check for double-booked crew
  IF v_slot.crew_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.job_production_slots
      WHERE crew_id = v_slot.crew_id
        AND id != p_slot_id
        AND status != 'canceled'
        AND (
          (start_date <= v_slot.end_date AND end_date >= v_slot.start_date)
        )
    ) THEN
      INSERT INTO public.production_calendar_conflicts (
        workspace_id, production_slot_id, job_id, crew_id,
        conflict_type, conflict_message, conflict_severity
      ) VALUES (
        v_slot.workspace_id, p_slot_id, v_slot.job_id, v_slot.crew_id,
        'double_booked_crew',
        'Crew is double-booked on this date range',
        'error'
      );
      v_conflicts := v_conflicts || jsonb_build_object(
        'type', 'double_booked_crew',
        'message', 'Crew is double-booked on this date range'
      );
      v_has_conflicts := true;
      v_conflict_count := v_conflict_count + 1;
    END IF;
  END IF;
  
  -- 2. Check for weather danger
  IF v_slot.weather_risk_category IN ('high_risk', 'severe_dangerous') THEN
    INSERT INTO public.production_calendar_conflicts (
      workspace_id, production_slot_id, job_id, crew_id,
      conflict_type, conflict_message, conflict_severity
    ) VALUES (
      v_slot.workspace_id, p_slot_id, v_slot.job_id, v_slot.crew_id,
      'weather_dangerous',
      'Weather risk is too high for safe installation',
      'critical'
    );
    v_conflicts := v_conflicts || jsonb_build_object(
      'type', 'weather_dangerous',
      'message', 'Weather risk is too high for safe installation'
    );
    v_has_conflicts := true;
    v_conflict_count := v_conflict_count + 1;
  END IF;
  
  -- 3. Check job readiness
  IF NOT v_slot.is_job_ready THEN
    INSERT INTO public.production_calendar_conflicts (
      workspace_id, production_slot_id, job_id, crew_id,
      conflict_type, conflict_message, conflict_severity
    ) VALUES (
      v_slot.workspace_id, p_slot_id, v_slot.job_id, v_slot.crew_id,
      'job_not_ready_missing_docs',
      'Job does not meet readiness requirements',
      'error'
    );
    v_conflicts := v_conflicts || jsonb_build_object(
      'type', 'job_not_ready_missing_docs',
      'message', 'Job does not meet readiness requirements'
    );
    v_has_conflicts := true;
    v_conflict_count := v_conflict_count + 1;
  END IF;
  
  -- 4. Check crew capacity
  IF v_slot.crew_id IS NOT NULL THEN
    DECLARE
      v_crew_capacity numeric;
      v_daily_squares numeric;
    BEGIN
      SELECT capacity_squares_per_day INTO v_crew_capacity
      FROM public.crews
      WHERE id = v_slot.crew_id;
      
      SELECT COALESCE(SUM(rj.roof_squares), 0) INTO v_daily_squares
      FROM public.job_production_slots jps
      JOIN public.roofing_jobs rj ON jps.job_id = rj.id
      WHERE jps.crew_id = v_slot.crew_id
        AND jps.start_date = v_slot.start_date
        AND jps.status != 'canceled';
      
      IF v_daily_squares > v_crew_capacity THEN
        INSERT INTO public.production_calendar_conflicts (
          workspace_id, production_slot_id, job_id, crew_id,
          conflict_type, conflict_message, conflict_severity,
          conflict_data
        ) VALUES (
          v_slot.workspace_id, p_slot_id, v_slot.job_id, v_slot.crew_id,
          'crew_over_capacity',
          format('Crew capacity exceeded: %.1f squares scheduled, %.1f capacity', v_daily_squares, v_crew_capacity),
          'warning',
          jsonb_build_object('scheduled_squares', v_daily_squares, 'capacity', v_crew_capacity)
        );
        v_conflicts := v_conflicts || jsonb_build_object(
          'type', 'crew_over_capacity',
          'message', format('Crew capacity exceeded: %.1f squares scheduled, %.1f capacity', v_daily_squares, v_crew_capacity)
        );
        v_has_conflicts := true;
        v_conflict_count := v_conflict_count + 1;
      END IF;
    END;
  END IF;
  
  -- Update slot with conflicts
  UPDATE public.job_production_slots
  SET 
    conflicts = v_conflicts,
    has_conflicts = v_has_conflicts,
    updated_at = now()
  WHERE id = p_slot_id;
END;
$$;

COMMENT ON FUNCTION public.detect_production_slot_conflicts IS 'Block 25980: Detect and record conflicts for a production slot';

-- Function: Calculate job readiness score
CREATE OR REPLACE FUNCTION public.calculate_job_readiness_score(
  p_job_id uuid
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_score integer := 0;
  v_total_items integer := 0;
  v_completed_items integer := 0;
  v_checklist public.job_readiness_checklist%ROWTYPE;
BEGIN
  -- Get or create checklist
  SELECT * INTO v_checklist
  FROM public.job_readiness_checklist
  WHERE job_id = p_job_id;
  
  IF NOT FOUND THEN
    -- Create default checklist
    INSERT INTO public.job_readiness_checklist (workspace_id, job_id)
    SELECT workspace_id, id
    FROM public.roofing_jobs
    WHERE id = p_job_id
    RETURNING * INTO v_checklist;
  END IF;
  
  -- Count required items (HOA approval is optional)
  v_total_items := 6; -- inspection, quote, contract, deposit, materials, insurance
  
  -- Count completed items
  IF v_checklist.inspection_completed THEN v_completed_items := v_completed_items + 1; END IF;
  IF v_checklist.quote_approved THEN v_completed_items := v_completed_items + 1; END IF;
  IF v_checklist.contract_signed THEN v_completed_items := v_completed_items + 1; END IF;
  IF v_checklist.deposit_received THEN v_completed_items := v_completed_items + 1; END IF;
  IF v_checklist.materials_ordered THEN v_completed_items := v_completed_items + 1; END IF;
  IF v_checklist.insurance_docs_uploaded THEN v_completed_items := v_completed_items + 1; END IF;
  
  -- Calculate score (0-100)
  v_score := ROUND((v_completed_items::numeric / v_total_items::numeric) * 100);
  
  -- Build missing items array
  DECLARE
    v_missing_items text[] := ARRAY[]::text[];
  BEGIN
    IF NOT v_checklist.inspection_completed THEN v_missing_items := array_append(v_missing_items, 'inspection'); END IF;
    IF NOT v_checklist.quote_approved THEN v_missing_items := array_append(v_missing_items, 'quote_approved'); END IF;
    IF NOT v_checklist.contract_signed THEN v_missing_items := array_append(v_missing_items, 'contract_signed'); END IF;
    IF NOT v_checklist.deposit_received THEN v_missing_items := array_append(v_missing_items, 'deposit_received'); END IF;
    IF NOT v_checklist.materials_ordered THEN v_missing_items := array_append(v_missing_items, 'materials_ordered'); END IF;
    IF NOT v_checklist.insurance_docs_uploaded THEN v_missing_items := array_append(v_missing_items, 'insurance_docs'); END IF;
    IF v_checklist.hoa_approval_required AND NOT v_checklist.hoa_approval_received THEN
      v_missing_items := array_append(v_missing_items, 'hoa_approval');
    END IF;
    
    -- Update checklist
    UPDATE public.job_readiness_checklist
    SET 
      readiness_score = v_score,
      is_ready = (v_score = 100),
      missing_items = v_missing_items,
      updated_at = now()
    WHERE id = v_checklist.id;
  END;
  
  RETURN v_score;
END;
$$;

COMMENT ON FUNCTION public.calculate_job_readiness_score IS 'Block 25980: Calculate job readiness score based on checklist';

-- Function: Update production heatmap data
CREATE OR REPLACE FUNCTION public.update_production_heatmap_data(
  p_workspace_id uuid,
  p_market_id uuid DEFAULT NULL,
  p_start_date date DEFAULT CURRENT_DATE,
  p_end_date date DEFAULT CURRENT_DATE + INTERVAL '30 days'
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_date date;
  v_jobs_count integer;
  v_squares_total numeric;
  v_crews_count integer;
  v_weather_cancelled integer;
  v_intensity integer;
  v_category text;
  v_capacity numeric;
  v_scheduled numeric;
  v_utilization numeric;
BEGIN
  -- Loop through date range
  FOR v_date IN SELECT generate_series(p_start_date, p_end_date, '1 day'::interval)::date
  LOOP
    -- Count jobs scheduled
    SELECT COUNT(DISTINCT jps.job_id) INTO v_jobs_count
    FROM public.job_production_slots jps
    JOIN public.roofing_jobs rj ON jps.job_id = rj.id
    LEFT JOIN public.crews c ON jps.crew_id = c.id
    WHERE jps.workspace_id = p_workspace_id
      AND (p_market_id IS NULL OR c.market_id = p_market_id)
      AND v_date BETWEEN jps.start_date AND jps.end_date
      AND jps.status != 'canceled';
    
    -- Sum squares scheduled
    SELECT COALESCE(SUM(rj.roof_squares), 0) INTO v_squares_total
    FROM public.job_production_slots jps
    JOIN public.roofing_jobs rj ON jps.job_id = rj.id
    LEFT JOIN public.crews c ON jps.crew_id = c.id
    WHERE jps.workspace_id = p_workspace_id
      AND (p_market_id IS NULL OR c.market_id = p_market_id)
      AND v_date BETWEEN jps.start_date AND jps.end_date
      AND jps.status != 'canceled';
    
    -- Count crews assigned
    SELECT COUNT(DISTINCT jps.crew_id) INTO v_crews_count
    FROM public.job_production_slots jps
    LEFT JOIN public.crews c ON jps.crew_id = c.id
    WHERE jps.workspace_id = p_workspace_id
      AND (p_market_id IS NULL OR c.market_id = p_market_id)
      AND v_date BETWEEN jps.start_date AND jps.end_date
      AND jps.status != 'canceled'
      AND jps.crew_id IS NOT NULL;
    
    -- Count weather cancelled
    SELECT COUNT(*) INTO v_weather_cancelled
    FROM public.job_production_slots jps
    LEFT JOIN public.crews c ON jps.crew_id = c.id
    WHERE jps.workspace_id = p_workspace_id
      AND (p_market_id IS NULL OR c.market_id = p_market_id)
      AND v_date BETWEEN jps.start_date AND jps.end_date
      AND jps.weather_risk_category IN ('high_risk', 'severe_dangerous');
    
    -- Calculate available capacity
    SELECT COALESCE(SUM(c.capacity_squares_per_day), 0) INTO v_capacity
    FROM public.crews c
    WHERE c.workspace_id = p_workspace_id
      AND (p_market_id IS NULL OR c.market_id = p_market_id)
      AND c.is_active = true
      AND (c.blocked_dates IS NULL OR NOT (v_date = ANY(c.blocked_dates)));
    
    v_scheduled := v_squares_total;
    v_utilization := CASE 
      WHEN v_capacity > 0 THEN ROUND((v_scheduled / v_capacity) * 100, 2)
      ELSE 0
    END;
    
    -- Calculate intensity (0-100)
    v_intensity := LEAST(100, GREATEST(0, ROUND(v_utilization)));
    
    -- Determine category
    IF v_weather_cancelled > 0 THEN
      v_category := 'weather_cancelled';
    ELSIF v_intensity >= 80 THEN
      v_category := 'heavy';
    ELSIF v_intensity >= 50 THEN
      v_category := 'moderate';
    ELSIF v_intensity >= 20 THEN
      v_category := 'light';
    ELSE
      v_category := 'open';
    END IF;
    
    -- Upsert heatmap data
    INSERT INTO public.production_heatmap_data (
      workspace_id, market_id, calendar_date,
      total_jobs_scheduled, total_squares_scheduled, total_crews_assigned,
      weather_cancelled_jobs, production_intensity, intensity_category,
      available_crew_capacity_squares, scheduled_squares, capacity_utilization_pct
    ) VALUES (
      p_workspace_id, p_market_id, v_date,
      v_jobs_count, v_squares_total, v_crews_count,
      v_weather_cancelled, v_intensity, v_category,
      v_capacity, v_scheduled, v_utilization
    )
    ON CONFLICT (workspace_id, market_id, calendar_date)
    DO UPDATE SET
      total_jobs_scheduled = EXCLUDED.total_jobs_scheduled,
      total_squares_scheduled = EXCLUDED.total_squares_scheduled,
      total_crews_assigned = EXCLUDED.total_crews_assigned,
      weather_cancelled_jobs = EXCLUDED.weather_cancelled_jobs,
      production_intensity = EXCLUDED.production_intensity,
      intensity_category = EXCLUDED.intensity_category,
      available_crew_capacity_squares = EXCLUDED.available_crew_capacity_squares,
      scheduled_squares = EXCLUDED.scheduled_squares,
      capacity_utilization_pct = EXCLUDED.capacity_utilization_pct,
      updated_at = now();
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.update_production_heatmap_data IS 'Block 25980: Update production heatmap data for date range';

-- ============================================================================
-- PART 11 — TRIGGERS
-- ============================================================================

-- Trigger: Auto-detect conflicts when production slot changes
CREATE OR REPLACE FUNCTION public.trg_detect_production_conflicts()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Detect conflicts for the updated slot
  PERFORM public.detect_production_slot_conflicts(NEW.id);
  
  -- Also check for conflicts with other slots (crew double-booking)
  IF NEW.crew_id IS NOT NULL AND (OLD.crew_id IS DISTINCT FROM NEW.crew_id OR OLD.start_date IS DISTINCT FROM NEW.start_date OR OLD.end_date IS DISTINCT FROM NEW.end_date) THEN
    PERFORM public.detect_production_slot_conflicts(slot_id)
    FROM public.job_production_slots
    WHERE crew_id = NEW.crew_id
      AND id != NEW.id
      AND status != 'canceled'
      AND (
        (start_date <= NEW.end_date AND end_date >= NEW.start_date)
      );
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_detect_production_conflicts ON public.job_production_slots;
CREATE TRIGGER trg_detect_production_conflicts
  AFTER INSERT OR UPDATE ON public.job_production_slots
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_detect_production_conflicts();

-- Trigger: Update job readiness when checklist changes
CREATE OR REPLACE FUNCTION public.trg_update_job_readiness()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_score integer;
BEGIN
  v_score := public.calculate_job_readiness_score(NEW.job_id);
  
  -- Update production slots with readiness info
  UPDATE public.job_production_slots
  SET 
    job_readiness_score = v_score,
    is_job_ready = NEW.is_ready,
    updated_at = now()
  WHERE job_id = NEW.job_id;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_job_readiness ON public.job_readiness_checklist;
CREATE TRIGGER trg_update_job_readiness
  AFTER INSERT OR UPDATE ON public.job_readiness_checklist
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_update_job_readiness();

-- Trigger: Log reschedule events
CREATE OR REPLACE FUNCTION public.trg_log_production_reschedule()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only log if dates or crew changed
  IF (OLD.start_date IS DISTINCT FROM NEW.start_date) OR 
     (OLD.end_date IS DISTINCT FROM NEW.end_date) OR
     (OLD.crew_id IS DISTINCT FROM NEW.crew_id) THEN
    
    INSERT INTO public.production_calendar_reschedule_log (
      workspace_id, production_slot_id, job_id,
      old_start_date, old_end_date, new_start_date, new_end_date,
      old_crew_id, new_crew_id,
      reschedule_type, triggered_by
    ) VALUES (
      NEW.workspace_id, NEW.id, NEW.job_id,
      OLD.start_date, OLD.end_date, NEW.start_date, NEW.end_date,
      OLD.crew_id, NEW.crew_id,
      'manual', 'user'
    );
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_production_reschedule ON public.job_production_slots;
CREATE TRIGGER trg_log_production_reschedule
  AFTER UPDATE ON public.job_production_slots
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_log_production_reschedule();

-- ============================================================================
-- PART 12 — ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.job_readiness_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_calendar_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_heatmap_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_calendar_view ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_calendar_reschedule_log ENABLE ROW LEVEL SECURITY;

-- Job Readiness Checklist policies
CREATE POLICY "Users can view readiness checklist in their workspace"
  ON public.job_readiness_checklist FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage readiness checklist in their workspace"
  ON public.job_readiness_checklist FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Production Calendar Conflicts policies
CREATE POLICY "Users can view conflicts in their workspace"
  ON public.production_calendar_conflicts FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage conflicts in their workspace"
  ON public.production_calendar_conflicts FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Production Heatmap Data policies
CREATE POLICY "Users can view heatmap data in their workspace"
  ON public.production_heatmap_data FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage heatmap data"
  ON public.production_heatmap_data FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Crew Calendar View policies
CREATE POLICY "Users can view crew calendar in their workspace"
  ON public.crew_calendar_view FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage crew calendar view"
  ON public.crew_calendar_view FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Reschedule Log policies
CREATE POLICY "Users can view reschedule log in their workspace"
  ON public.production_calendar_reschedule_log FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 13 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_readiness_checklist TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_calendar_conflicts TO authenticated;
GRANT SELECT ON public.production_heatmap_data TO authenticated;
GRANT SELECT ON public.crew_calendar_view TO authenticated;
GRANT SELECT ON public.production_calendar_reschedule_log TO authenticated;

GRANT SELECT ON public.v_job_calendar TO authenticated;
GRANT SELECT ON public.v_crew_calendar TO authenticated;
GRANT SELECT ON public.v_material_delivery_calendar TO authenticated;

-- ============================================================================
-- PART 14 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.job_readiness_checklist IS 'Block 25980: Job readiness checklist - prevents scheduling unready jobs';
COMMENT ON TABLE public.production_calendar_conflicts IS 'Block 25980: Detected conflicts in production calendar';
COMMENT ON TABLE public.production_heatmap_data IS 'Block 25980: Production heatmap data for calendar visualization';
COMMENT ON TABLE public.crew_calendar_view IS 'Block 25980: Pre-computed crew calendar view for fast access';
COMMENT ON TABLE public.production_calendar_reschedule_log IS 'Block 25980: Audit log for production calendar rescheduling';




































