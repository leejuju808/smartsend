-- =========================================================
-- Block 55000 — SmartSend Roofing "Vehicle Fleet Tracking + Maintenance System" v1
-- (TRACK TRUCKS • ASSIGN VEHICLES • MILEAGE LOGS • MAINTENANCE REMINDERS • FUEL TRACKING • DAMAGE REPORTS • DISPATCH VISIBILITY)
-- =========================================================
-- 
-- This block turns SmartSend into a full operational fleet manager, eliminating one of the most 
-- expensive and chaotic areas in a roofing company: TRUCKS.
-- 
-- Roofing companies lose thousands every month from:
-- - poor truck maintenance
-- - unknown mileage
-- - late oil changes → engine damage
-- - untracked fuel expenses
-- - drivers abusing trucks
-- - accidents with no documentation
-- - missing insurance documents
-- - no assignment logs
-- 
-- This system fixes ALL OF IT.

-- ============================================================================
-- PART 1 — VEHICLES TABLE
-- ============================================================================
-- Track each vehicle: Make/model/year, plate, VIN, mileage, assigned crew, insurance, registration

CREATE TABLE IF NOT EXISTS public.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Vehicle identification
  name text NOT NULL,                    -- e.g. "Truck 1", "Dump Trailer Truck"
  make text,                             -- e.g. "Ford"
  model text,                            -- e.g. "F-350"
  year text,                             -- e.g. "2020"
  vin text,                              -- Vehicle Identification Number
  plate text,                            -- License plate number
  
  -- Current status
  current_mileage numeric DEFAULT 0,     -- Current odometer reading
  status text DEFAULT 'available' CHECK (status IN ('available', 'in_use', 'maintenance', 'out_of_service')),
  
  -- Assignment
  assigned_crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  assigned_supervisor_id uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  
  -- Insurance & registration
  insurance_info jsonb DEFAULT '{}'::jsonb,  -- {policy_number, carrier, coverage_type, expiration_date}
  registration_expiration date,
  
  -- Metadata
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicles_workspace ON public.vehicles(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_vehicles_assigned_crew ON public.vehicles(assigned_crew_id) WHERE assigned_crew_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vehicles_plate ON public.vehicles(plate);
CREATE INDEX IF NOT EXISTS idx_vehicles_vin ON public.vehicles(vin) WHERE vin IS NOT NULL;

-- ============================================================================
-- PART 2 — VEHICLE_ASSIGNMENTS TABLE
-- ============================================================================
-- Track assignment history (who had what vehicle when)

CREATE TABLE IF NOT EXISTS public.vehicle_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  crew_member_id uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  assigned_at timestamptz DEFAULT now(),
  unassigned_at timestamptz,
  
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_assignments_vehicle ON public.vehicle_assignments(vehicle_id, assigned_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_assignments_crew ON public.vehicle_assignments(crew_id) WHERE crew_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vehicle_assignments_active ON public.vehicle_assignments(vehicle_id) WHERE unassigned_at IS NULL;

-- ============================================================================
-- PART 3 — VEHICLE_MILEAGE_LOGS TABLE
-- ============================================================================
-- Crew logs mileage at start and end of day/job/week
-- SmartSend calculates: miles driven, estimated fuel use, cost per mile, maintenance timing

CREATE TABLE IF NOT EXISTS public.vehicle_mileage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  crew_member_id uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  
  -- Mileage data
  mileage numeric NOT NULL,              -- Odometer reading
  log_type text NOT NULL DEFAULT 'daily' CHECK (log_type IN ('daily', 'job_start', 'job_end', 'weekly')),
  
  -- Location (optional GPS)
  latitude numeric(10, 8),
  longitude numeric(11, 8),
  address text,
  
  notes text,
  log_time timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_mileage_logs_vehicle ON public.vehicle_mileage_logs(vehicle_id, log_time DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_mileage_logs_job ON public.vehicle_mileage_logs(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vehicle_mileage_logs_member ON public.vehicle_mileage_logs(crew_member_id) WHERE crew_member_id IS NOT NULL;

-- ============================================================================
-- PART 4 — VEHICLE_PRE_TRIP_CHECKLISTS TABLE
-- ============================================================================
-- Pre-trip safety checklist before using a truck
-- Crew must confirm: Tires, oil, lights, trailer, ladder racks, damage

CREATE TABLE IF NOT EXISTS public.vehicle_pre_trip_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  crew_member_id uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  
  -- Checklist items
  tires_inflated boolean DEFAULT false,
  oil_level_ok boolean DEFAULT false,
  no_warning_lights boolean DEFAULT false,
  trailer_lights_working boolean DEFAULT false,
  ladder_racks_secured boolean DEFAULT false,
  no_visible_damage boolean DEFAULT false,
  
  -- Overall status
  passed boolean DEFAULT false,
  issues_notes text,                     -- Any issues found
  
  -- Location
  latitude numeric(10, 8),
  longitude numeric(11, 8),
  
  completed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pre_trip_vehicle ON public.vehicle_pre_trip_checklists(vehicle_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_pre_trip_job ON public.vehicle_pre_trip_checklists(job_id) WHERE job_id IS NOT NULL;

-- ============================================================================
-- PART 5 — VEHICLE_MAINTENANCE TABLE
-- ============================================================================
-- Configurable maintenance intervals: oil, tires, brakes, transmission
-- SmartSend auto-calculates next maintenance date based on mileage/time

CREATE TABLE IF NOT EXISTS public.vehicle_maintenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  
  -- Maintenance type
  maintenance_type text NOT NULL,        -- 'oil_change', 'tire_rotation', 'brake_check', 'transmission_service', 'inspection', etc.
  
  -- Scheduling
  mileage_due numeric,                   -- Mileage threshold (e.g. 5000)
  date_due date,                         -- Date threshold
  mileage_interval numeric,              -- Recurring interval in miles
  days_interval integer,                 -- Recurring interval in days
  
  -- Status
  completed boolean DEFAULT false,
  completed_at timestamptz,
  completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_mileage numeric,             -- Mileage when completed
  
  -- Details
  notes text,
  cost numeric,                          -- Cost of maintenance
  service_provider text,                 -- Who did the work
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_maintenance_vehicle ON public.vehicle_maintenance(vehicle_id, completed, date_due);
CREATE INDEX IF NOT EXISTS idx_vehicle_maintenance_due ON public.vehicle_maintenance(date_due, completed) WHERE completed = false;
CREATE INDEX IF NOT EXISTS idx_vehicle_maintenance_type ON public.vehicle_maintenance(maintenance_type);

-- ============================================================================
-- PART 6 — VEHICLE_DAMAGE_REPORTS TABLE
-- ============================================================================
-- Crew submits damage reports: photos, description, location, severity, who was driving
-- Auto-logs incident for insurance

CREATE TABLE IF NOT EXISTS public.vehicle_damage_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  crew_member_id uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  
  -- Damage details
  description text NOT NULL,
  severity text NOT NULL DEFAULT 'minor' CHECK (severity IN ('minor', 'moderate', 'major', 'totaled')),
  
  -- Photos
  photos text[],                         -- Array of photo URLs
  
  -- Location
  latitude numeric(10, 8),
  longitude numeric(11, 8),
  address text,
  
  -- Who/what
  driver_name text,                      -- Who was driving
  other_party_info jsonb DEFAULT '{}'::jsonb,  -- If collision: other driver info
  
  -- Insurance
  insurance_claim_filed boolean DEFAULT false,
  claim_number text,
  
  -- Resolution
  repair_cost numeric,
  repaired_at timestamptz,
  repaired_by text,
  
  occurred_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_damage_vehicle ON public.vehicle_damage_reports(vehicle_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_damage_severity ON public.vehicle_damage_reports(severity);
CREATE INDEX IF NOT EXISTS idx_vehicle_damage_job ON public.vehicle_damage_reports(job_id) WHERE job_id IS NOT NULL;

-- ============================================================================
-- PART 7 — VEHICLE_FUEL_LOGS TABLE
-- ============================================================================
-- Crew logs fuel: amount, cost, receipt photo
-- SmartSend calculates: cost per mile, monthly fuel spend, driver fuel efficiency

CREATE TABLE IF NOT EXISTS public.vehicle_fuel_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  crew_member_id uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  
  -- Fuel data
  gallons numeric NOT NULL,
  cost numeric NOT NULL,
  price_per_gallon numeric GENERATED ALWAYS AS (cost / NULLIF(gallons, 0)) STORED,
  
  -- Receipt
  receipt_photo text,                    -- URL to receipt photo
  
  -- Location
  latitude numeric(10, 8),
  longitude numeric(11, 8),
  address text,
  station_name text,
  
  -- Odometer (optional, for MPG calculation)
  odometer_reading numeric,
  
  logged_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_fuel_logs_vehicle ON public.vehicle_fuel_logs(vehicle_id, logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_fuel_logs_job ON public.vehicle_fuel_logs(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vehicle_fuel_logs_member ON public.vehicle_fuel_logs(crew_member_id) WHERE crew_member_id IS NOT NULL;

-- ============================================================================
-- PART 8 — UPDATED_AT TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_vehicles_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_vehicles_updated_at ON public.vehicles;
CREATE TRIGGER trg_set_vehicles_updated_at
BEFORE UPDATE ON public.vehicles
FOR EACH ROW
EXECUTE FUNCTION public.set_vehicles_updated_at();

CREATE OR REPLACE FUNCTION public.set_vehicle_maintenance_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_vehicle_maintenance_updated_at ON public.vehicle_maintenance;
CREATE TRIGGER trg_set_vehicle_maintenance_updated_at
BEFORE UPDATE ON public.vehicle_maintenance
FOR EACH ROW
EXECUTE FUNCTION public.set_vehicle_maintenance_updated_at();

CREATE OR REPLACE FUNCTION public.set_vehicle_damage_reports_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_vehicle_damage_reports_updated_at ON public.vehicle_damage_reports;
CREATE TRIGGER trg_set_vehicle_damage_reports_updated_at
BEFORE UPDATE ON public.vehicle_damage_reports
FOR EACH ROW
EXECUTE FUNCTION public.set_vehicle_damage_reports_updated_at();

-- ============================================================================
-- PART 9 — FUNCTION: Update vehicle mileage when logged
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_vehicle_mileage()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Update vehicle's current_mileage if this log is higher
  UPDATE public.vehicles
  SET current_mileage = GREATEST(current_mileage, NEW.mileage)
  WHERE id = NEW.vehicle_id
    AND NEW.mileage > current_mileage;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_vehicle_mileage ON public.vehicle_mileage_logs;
CREATE TRIGGER trg_update_vehicle_mileage
AFTER INSERT ON public.vehicle_mileage_logs
FOR EACH ROW
EXECUTE FUNCTION public.update_vehicle_mileage();

-- ============================================================================
-- PART 10 — FUNCTION: Check maintenance due (called by cron)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_maintenance_due()
RETURNS TABLE (
  vehicle_id uuid,
  vehicle_name text,
  maintenance_id uuid,
  maintenance_type text,
  days_overdue integer,
  miles_overdue numeric,
  due_date date,
  due_mileage numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    v.id as vehicle_id,
    v.name as vehicle_name,
    vm.id as maintenance_id,
    vm.maintenance_type,
    CASE 
      WHEN vm.date_due IS NOT NULL THEN (CURRENT_DATE - vm.date_due)::integer
      ELSE NULL
    END as days_overdue,
    CASE
      WHEN vm.mileage_due IS NOT NULL THEN (v.current_mileage - vm.mileage_due)
      ELSE NULL
    END as miles_overdue,
    vm.date_due,
    vm.mileage_due as due_mileage
  FROM public.vehicle_maintenance vm
  JOIN public.vehicles v ON v.id = vm.vehicle_id
  WHERE vm.completed = false
    AND (
      (vm.date_due IS NOT NULL AND CURRENT_DATE >= vm.date_due)
      OR (vm.mileage_due IS NOT NULL AND v.current_mileage >= vm.mileage_due)
    );
END;
$$;

-- ============================================================================
-- PART 11 — FUNCTION: Calculate fuel efficiency (MPG)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_vehicle_mpg(p_vehicle_id uuid, p_days integer DEFAULT 30)
RETURNS TABLE (
  vehicle_id uuid,
  vehicle_name text,
  total_gallons numeric,
  total_cost numeric,
  miles_driven numeric,
  mpg numeric,
  cost_per_mile numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_start_mileage numeric;
  v_end_mileage numeric;
  v_total_gallons numeric;
  v_total_cost numeric;
BEGIN
  -- Get start mileage (oldest mileage log in period)
  SELECT MIN(mileage) INTO v_start_mileage
  FROM public.vehicle_mileage_logs
  WHERE vehicle_id = p_vehicle_id
    AND log_time >= CURRENT_DATE - (p_days || ' days')::interval;
  
  -- Get end mileage (newest mileage log)
  SELECT MAX(mileage) INTO v_end_mileage
  FROM public.vehicle_mileage_logs
  WHERE vehicle_id = p_vehicle_id
    AND log_time >= CURRENT_DATE - (p_days || ' days')::interval;
  
  -- Get fuel totals
  SELECT 
    COALESCE(SUM(gallons), 0),
    COALESCE(SUM(cost), 0)
  INTO v_total_gallons, v_total_cost
  FROM public.vehicle_fuel_logs
  WHERE vehicle_id = p_vehicle_id
    AND logged_at >= CURRENT_DATE - (p_days || ' days')::interval;
  
  RETURN QUERY
  SELECT 
    v.id as vehicle_id,
    v.name as vehicle_name,
    v_total_gallons as total_gallons,
    v_total_cost as total_cost,
    COALESCE(v_end_mileage - v_start_mileage, 0) as miles_driven,
    CASE
      WHEN v_total_gallons > 0 THEN (v_end_mileage - v_start_mileage) / v_total_gallons
      ELSE NULL
    END as mpg,
    CASE
      WHEN (v_end_mileage - v_start_mileage) > 0 THEN v_total_cost / (v_end_mileage - v_start_mileage)
      ELSE NULL
    END as cost_per_mile
  FROM public.vehicles v
  WHERE v.id = p_vehicle_id;
END;
$$;

-- ============================================================================
-- PART 12 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Vehicles
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view vehicles in their workspace"
  ON public.vehicles FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create vehicles in their workspace"
  ON public.vehicles FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update vehicles in their workspace"
  ON public.vehicles FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Vehicle assignments
ALTER TABLE public.vehicle_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view assignments in their workspace"
  ON public.vehicle_assignments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.vehicles v
      JOIN public.workspace_members wm ON wm.workspace_id = v.workspace_id
      WHERE v.id = vehicle_assignments.vehicle_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create assignments in their workspace"
  ON public.vehicle_assignments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vehicles v
      JOIN public.workspace_members wm ON wm.workspace_id = v.workspace_id
      WHERE v.id = vehicle_assignments.vehicle_id
        AND wm.user_id = auth.uid()
    )
  );

-- Mileage logs
ALTER TABLE public.vehicle_mileage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view mileage logs in their workspace"
  ON public.vehicle_mileage_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.vehicles v
      JOIN public.workspace_members wm ON wm.workspace_id = v.workspace_id
      WHERE v.id = vehicle_mileage_logs.vehicle_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Crew members can log mileage"
  ON public.vehicle_mileage_logs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vehicles v
      JOIN public.workspace_members wm ON wm.workspace_id = v.workspace_id
      WHERE v.id = vehicle_mileage_logs.vehicle_id
        AND wm.user_id = auth.uid()
    )
  );

-- Pre-trip checklists
ALTER TABLE public.vehicle_pre_trip_checklists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view pre-trip checklists in their workspace"
  ON public.vehicle_pre_trip_checklists FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.vehicles v
      JOIN public.workspace_members wm ON wm.workspace_id = v.workspace_id
      WHERE v.id = vehicle_pre_trip_checklists.vehicle_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Crew members can create pre-trip checklists"
  ON public.vehicle_pre_trip_checklists FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vehicles v
      JOIN public.workspace_members wm ON wm.workspace_id = v.workspace_id
      WHERE v.id = vehicle_pre_trip_checklists.vehicle_id
        AND wm.user_id = auth.uid()
    )
  );

-- Maintenance
ALTER TABLE public.vehicle_maintenance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view maintenance in their workspace"
  ON public.vehicle_maintenance FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.vehicles v
      JOIN public.workspace_members wm ON wm.workspace_id = v.workspace_id
      WHERE v.id = vehicle_maintenance.vehicle_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage maintenance in their workspace"
  ON public.vehicle_maintenance FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.vehicles v
      JOIN public.workspace_members wm ON wm.workspace_id = v.workspace_id
      WHERE v.id = vehicle_maintenance.vehicle_id
        AND wm.user_id = auth.uid()
    )
  );

-- Damage reports
ALTER TABLE public.vehicle_damage_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view damage reports in their workspace"
  ON public.vehicle_damage_reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.vehicles v
      JOIN public.workspace_members wm ON wm.workspace_id = v.workspace_id
      WHERE v.id = vehicle_damage_reports.vehicle_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Crew members can create damage reports"
  ON public.vehicle_damage_reports FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vehicles v
      JOIN public.workspace_members wm ON wm.workspace_id = v.workspace_id
      WHERE v.id = vehicle_damage_reports.vehicle_id
        AND wm.user_id = auth.uid()
    )
  );

-- Fuel logs
ALTER TABLE public.vehicle_fuel_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view fuel logs in their workspace"
  ON public.vehicle_fuel_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.vehicles v
      JOIN public.workspace_members wm ON wm.workspace_id = v.workspace_id
      WHERE v.id = vehicle_fuel_logs.vehicle_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Crew members can log fuel"
  ON public.vehicle_fuel_logs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vehicles v
      JOIN public.workspace_members wm ON wm.workspace_id = v.workspace_id
      WHERE v.id = vehicle_fuel_logs.vehicle_id
        AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 13 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.vehicle_assignments TO authenticated;
GRANT SELECT, INSERT ON public.vehicle_mileage_logs TO authenticated;
GRANT SELECT, INSERT ON public.vehicle_pre_trip_checklists TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.vehicle_maintenance TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.vehicle_damage_reports TO authenticated;
GRANT SELECT, INSERT ON public.vehicle_fuel_logs TO authenticated;

GRANT EXECUTE ON FUNCTION public.check_maintenance_due() TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_vehicle_mpg(uuid, integer) TO authenticated;

COMMENT ON TABLE public.vehicles IS 'Fleet vehicles registry - tracks all company trucks and equipment';
COMMENT ON TABLE public.vehicle_assignments IS 'Vehicle assignment history - who had which vehicle when';
COMMENT ON TABLE public.vehicle_mileage_logs IS 'Mileage tracking logs - crew logs odometer readings';
COMMENT ON TABLE public.vehicle_pre_trip_checklists IS 'Pre-trip safety checklists before using vehicles';
COMMENT ON TABLE public.vehicle_maintenance IS 'Maintenance schedules and history';
COMMENT ON TABLE public.vehicle_damage_reports IS 'Damage and accident reports with photos';
COMMENT ON TABLE public.vehicle_fuel_logs IS 'Fuel purchase logs with cost tracking';

-- ============================================================================
-- PART 14 — CRON JOB FOR MAINTENANCE SCANNING
-- ============================================================================
-- Daily cron to check for overdue maintenance and send alerts

DO $$
BEGIN
  -- Enable pg_cron if available
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove existing job if it exists
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'vehicle-maintenance-scan') THEN
      PERFORM cron.unschedule('vehicle-maintenance-scan');
    END IF;
    
    -- Schedule daily maintenance scan at 6 AM UTC
    PERFORM cron.schedule(
      'vehicle-maintenance-scan',
      '0 6 * * *', -- Daily at 6 AM UTC
      $$
      SELECT
        net.http_post(
          url := COALESCE(
            current_setting('app.supabase_url', true),
            current_setting('app.settings.supabase_url', true)
          ) || '/functions/v1/vehicles-maintenance-scan',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || COALESCE(
              current_setting('app.supabase_service_role_key', true),
              current_setting('app.settings.service_role_key', true)
            )
          ),
          body := jsonb_build_object()
        ) as request_id;
      $$
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    -- pg_cron not available or error; ignore
    NULL;
END;
$$;

