-- =========================================================
-- Block 256800 — SmartSend Fleet & Vehicle Management Engine v1
-- "GPS Tracking, Maintenance Alerts, Fuel Logs, Vehicle Assignment, Inspection Checklists"
-- =========================================================

-- Enable extensions for GPS location queries
CREATE EXTENSION IF NOT EXISTS cube;
CREATE EXTENSION IF NOT EXISTS earthdistance;
-- 
-- This block makes SmartSend the command center for all roofing company trucks, trailers, 
-- dump trailers, vans, and equipment.
-- 
-- Roofers lose THOUSANDS every year because:
-- - trucks break down unexpectedly
-- - oil changes are forgotten
-- - tires blow out
-- - tools left in trucks go missing
-- - no mileage tracking
-- - fuel receipts lost
-- - PMs don't know where vehicles are
-- - crews claim "truck wasn't available"
-- - DOT compliance fails
-- - trailers sit unused
-- - nobody logs damage
-- - vehicle assignments lost in group chats
-- 
-- SmartSend fixes EVERY SINGLE PROBLEM.
-- 
-- Roofers will say:
-- "SmartSend tracks our whole fleet better than our PMs."
-- "We stopped losing time and money on broken trucks."
-- "We'd be stupid not using this."
-- =========================================================

-- ============================================================================
-- PART 1 — EXTEND vehicles TABLE (if exists from Block 252900)
-- ============================================================================
-- Add fields needed for comprehensive fleet management

DO $$
BEGIN
  -- Add vehicle_type if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'vehicles' 
    AND column_name = 'vehicle_type'
  ) THEN
    ALTER TABLE public.vehicles 
    ADD COLUMN vehicle_type text CHECK (vehicle_type IN ('truck', 'trailer', 'dump_trailer', 'van', 'equipment'));
  END IF;

  -- Add assigned_to (crew_member) if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'vehicles' 
    AND column_name = 'assigned_to'
  ) THEN
    ALTER TABLE public.vehicles 
    ADD COLUMN assigned_to uuid REFERENCES public.crew_members(id) ON DELETE SET NULL;
  END IF;

  -- Add mileage tracking if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'vehicles' 
    AND column_name = 'mileage'
  ) THEN
    ALTER TABLE public.vehicles 
    ADD COLUMN mileage numeric DEFAULT 0;
  END IF;

  -- Add last_service_date if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'vehicles' 
    AND column_name = 'last_service_date'
  ) THEN
    ALTER TABLE public.vehicles 
    ADD COLUMN last_service_date date;
  END IF;

  -- Add next_service_mileage if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'vehicles' 
    AND column_name = 'next_service_mileage'
  ) THEN
    ALTER TABLE public.vehicles 
    ADD COLUMN next_service_mileage numeric;
  END IF;

  -- Add health_score if it doesn't exist (may already exist from Block 252900)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'vehicles' 
    AND column_name = 'health_score'
  ) THEN
    ALTER TABLE public.vehicles 
    ADD COLUMN health_score numeric DEFAULT 100 CHECK (health_score >= 0 AND health_score <= 100);
  END IF;
END $$;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_vehicles_type ON public.vehicles(company_id, vehicle_type);
CREATE INDEX IF NOT EXISTS idx_vehicles_assigned_to ON public.vehicles(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vehicles_health_score ON public.vehicles(company_id, health_score);

-- ============================================================================
-- PART 2 — CREATE fleet_vehicles TABLE (alias/compatibility)
-- ============================================================================
-- This is an alias view or we use vehicles table directly
-- For compatibility with the spec, we'll ensure vehicles table has all needed fields

COMMENT ON TABLE public.vehicles IS 'Fleet Directory - All vehicles in the roofing company (Blocks 252900, 256800)';
COMMENT ON COLUMN public.vehicles.vehicle_type IS 'Vehicle type: truck, trailer, dump_trailer, van, equipment';
COMMENT ON COLUMN public.vehicles.assigned_to IS 'Currently assigned crew member';
COMMENT ON COLUMN public.vehicles.mileage IS 'Current odometer reading';
COMMENT ON COLUMN public.vehicles.last_service_date IS 'Last service date';
COMMENT ON COLUMN public.vehicles.next_service_mileage IS 'Mileage when next service is due';
COMMENT ON COLUMN public.vehicles.health_score IS 'Fleet health score (0-100)';

-- ============================================================================
-- PART 3 — CREATE fleet_vehicle_logs TABLE
-- ============================================================================
-- Comprehensive logging system for all vehicle activities

CREATE TABLE IF NOT EXISTS public.fleet_vehicle_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  log_type text NOT NULL CHECK (log_type IN ('maintenance', 'fuel', 'inspection', 'gps', 'damage', 'assignment', 'equipment')),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  crew_member_id uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fleet_vehicle_logs_vehicle ON public.fleet_vehicle_logs(vehicle_id, log_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fleet_vehicle_logs_type ON public.fleet_vehicle_logs(log_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fleet_vehicle_logs_crew ON public.fleet_vehicle_logs(crew_member_id) WHERE crew_member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fleet_vehicle_logs_data ON public.fleet_vehicle_logs USING GIN(data);

COMMENT ON TABLE public.fleet_vehicle_logs IS 'Comprehensive vehicle activity logs (Block 256800)';
COMMENT ON COLUMN public.fleet_vehicle_logs.log_type IS 'Type of log: maintenance, fuel, inspection, gps, damage, assignment, equipment';
COMMENT ON COLUMN public.fleet_vehicle_logs.data IS 'JSONB data specific to log type';

-- ============================================================================
-- PART 4 — CREATE fleet_assignments TABLE
-- ============================================================================
-- Vehicle assignment engine linking vehicles to crews and PMs

CREATE TABLE IF NOT EXISTS public.fleet_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  crew_member_id uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  assigned_by uuid REFERENCES public.project_managers(id) ON DELETE SET NULL,
  job_id uuid, -- Generic job reference (could be roofing_jobs, jobs, etc.)
  assigned_at timestamptz DEFAULT now(),
  returned_at timestamptz,
  notes text,
  status text DEFAULT 'active' CHECK (status IN ('active', 'returned', 'cancelled')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fleet_assignments_vehicle ON public.fleet_assignments(vehicle_id, status);
CREATE INDEX IF NOT EXISTS idx_fleet_assignments_crew ON public.fleet_assignments(crew_id) WHERE crew_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fleet_assignments_crew_member ON public.fleet_assignments(crew_member_id) WHERE crew_member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fleet_assignments_pm ON public.fleet_assignments(assigned_by) WHERE assigned_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fleet_assignments_active ON public.fleet_assignments(vehicle_id, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_fleet_assignments_job ON public.fleet_assignments(job_id) WHERE job_id IS NOT NULL;

COMMENT ON TABLE public.fleet_assignments IS 'Vehicle assignment engine - links vehicles to crews, crew members, and PMs (Block 256800)';

-- ============================================================================
-- PART 5 — CREATE vehicle_gps_tracking TABLE
-- ============================================================================
-- GPS Tracking + Live Location

CREATE TABLE IF NOT EXISTS public.vehicle_gps_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  latitude numeric NOT NULL,
  longitude numeric NOT NULL,
  heading numeric, -- Direction in degrees (0-360)
  speed numeric, -- Speed in mph
  accuracy numeric, -- GPS accuracy in meters
  location_name text, -- Human-readable location (e.g., "On route to Job #1102", "At landfill")
  job_id uuid, -- Associated job if applicable
  tracked_at timestamptz DEFAULT now(),
  device_type text CHECK (device_type IN ('gps', 'airtag', 'bluetooth', 'manual')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_gps_vehicle ON public.vehicle_gps_tracking(vehicle_id, tracked_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_gps_latest ON public.vehicle_gps_tracking(vehicle_id, tracked_at DESC) WHERE tracked_at >= NOW() - INTERVAL '24 hours';
-- Note: For spatial queries, use earthdistance functions
-- Example: SELECT * FROM vehicle_gps_tracking 
-- WHERE earth_box(ll_to_earth(lat, lon), radius_meters) @> ll_to_earth(latitude, longitude);

COMMENT ON TABLE public.vehicle_gps_tracking IS 'GPS tracking and live location for vehicles (Block 256800)';

-- ============================================================================
-- PART 6 — CREATE vehicle_inspections TABLE
-- ============================================================================
-- Daily Vehicle Inspection Checklist

CREATE TABLE IF NOT EXISTS public.vehicle_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  crew_member_id uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  inspection_date date DEFAULT CURRENT_DATE,
  
  -- Inspection checklist items
  tires_ok boolean DEFAULT false,
  lights_ok boolean DEFAULT false,
  fluids_ok boolean DEFAULT false,
  windshield_ok boolean DEFAULT false,
  ladders_secured boolean DEFAULT false,
  trailer_hitch_locked boolean DEFAULT false,
  tools_accounted_for boolean DEFAULT false,
  brakes_ok boolean DEFAULT false,
  mirrors_ok boolean DEFAULT false,
  
  -- Damage reporting
  damage_reported boolean DEFAULT false,
  damage_description text,
  damage_photos text[], -- Array of photo URLs
  damage_severity text CHECK (damage_severity IN ('low', 'medium', 'high', 'critical')),
  
  -- Overall status
  inspection_status text DEFAULT 'pending' CHECK (inspection_status IN ('pending', 'passed', 'failed', 'needs_attention')),
  pm_notified boolean DEFAULT false,
  pm_notified_at timestamptz,
  
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_inspections_vehicle ON public.vehicle_inspections(vehicle_id, inspection_date DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_inspections_crew ON public.vehicle_inspections(crew_member_id) WHERE crew_member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vehicle_inspections_status ON public.vehicle_inspections(vehicle_id, inspection_status) WHERE inspection_status IN ('failed', 'needs_attention');
CREATE INDEX IF NOT EXISTS idx_vehicle_inspections_damage ON public.vehicle_inspections(vehicle_id, damage_reported) WHERE damage_reported = true;
CREATE INDEX IF NOT EXISTS idx_vehicle_inspections_date ON public.vehicle_inspections(inspection_date DESC);

COMMENT ON TABLE public.vehicle_inspections IS 'Daily vehicle inspection checklists (Block 256800)';

-- ============================================================================
-- PART 7 — CREATE vehicle_equipment TABLE
-- ============================================================================
-- Equipment Tracking (Ladders, Tools, etc.)

CREATE TABLE IF NOT EXISTS public.vehicle_equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  equipment_type text NOT NULL CHECK (equipment_type IN ('ladder', 'nail_gun', 'air_compressor', 'blower', 'extension_cord', 'harness_kit', 'tool_box', 'other')),
  equipment_name text NOT NULL, -- e.g., "Ladder #11", "Nail Gun A"
  serial_number text,
  status text DEFAULT 'in_vehicle' CHECK (status IN ('in_vehicle', 'checked_out', 'missing', 'maintenance', 'retired')),
  last_seen_at timestamptz DEFAULT now(),
  last_seen_by uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_equipment_vehicle ON public.vehicle_equipment(vehicle_id, status);
CREATE INDEX IF NOT EXISTS idx_vehicle_equipment_type ON public.vehicle_equipment(equipment_type, status);
CREATE INDEX IF NOT EXISTS idx_vehicle_equipment_status ON public.vehicle_equipment(status) WHERE status IN ('missing', 'checked_out');
CREATE INDEX IF NOT EXISTS idx_vehicle_equipment_name ON public.vehicle_equipment(vehicle_id, equipment_name);

COMMENT ON TABLE public.vehicle_equipment IS 'Equipment tracking for tools stored in vehicles (Block 256800)';

-- ============================================================================
-- PART 8 — CREATE vehicle_incidents TABLE
-- ============================================================================
-- Damage + Incident Reports

CREATE TABLE IF NOT EXISTS public.vehicle_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  reported_by uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  incident_type text NOT NULL CHECK (incident_type IN ('damage', 'accident', 'theft', 'vandalism', 'mechanical_failure', 'other')),
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  description text NOT NULL,
  location text,
  photos text[], -- Array of photo URLs
  estimated_repair_cost numeric,
  repair_scheduled boolean DEFAULT false,
  repair_scheduled_date date,
  repair_completed boolean DEFAULT false,
  repair_completed_date date,
  actual_repair_cost numeric,
  pm_notified boolean DEFAULT false,
  pm_notified_at timestamptz,
  insurance_claim_filed boolean DEFAULT false,
  insurance_claim_number text,
  incident_date date DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_incidents_vehicle ON public.vehicle_incidents(vehicle_id, incident_date DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_incidents_type ON public.vehicle_incidents(incident_type, severity);
CREATE INDEX IF NOT EXISTS idx_vehicle_incidents_severity ON public.vehicle_incidents(vehicle_id, severity) WHERE severity IN ('high', 'critical');
CREATE INDEX IF NOT EXISTS idx_vehicle_incidents_unresolved ON public.vehicle_incidents(vehicle_id, repair_completed) WHERE repair_completed = false;

COMMENT ON TABLE public.vehicle_incidents IS 'Damage and incident reports for vehicles (Block 256800)';

-- ============================================================================
-- PART 9 — ENHANCE fuel_logs TABLE (if exists from Block 252900)
-- ============================================================================
-- Add fuel efficiency tracking

DO $$
BEGIN
  -- Add mpg calculation if it doesn't exist
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'fuel_logs'
  ) THEN
    -- Add odometer reading at fill-up if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'fuel_logs' 
      AND column_name = 'odometer_reading'
    ) THEN
      ALTER TABLE public.fuel_logs 
      ADD COLUMN odometer_reading numeric;
    END IF;

    -- Add mpg calculation if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'fuel_logs' 
      AND column_name = 'mpg'
    ) THEN
      ALTER TABLE public.fuel_logs 
      ADD COLUMN mpg numeric;
    END IF;
  END IF;
END $$;

-- ============================================================================
-- PART 10 — FLEET HEALTH SCORE FUNCTION (Enhanced)
-- ============================================================================
-- Calculate comprehensive fleet health score

CREATE OR REPLACE FUNCTION public.calculate_fleet_health_score(p_vehicle_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_score numeric := 100;
  v_overdue_maintenance int;
  v_critical_incidents int;
  v_failed_inspections int;
  v_missing_equipment int;
  v_fuel_efficiency_drop boolean;
  v_current_mileage numeric;
  v_avg_mpg numeric;
  v_recent_mpg numeric;
BEGIN
  -- Get current mileage
  SELECT COALESCE(MAX(end_miles), 0) INTO v_current_mileage
  FROM public.mileage_logs
  WHERE vehicle_id = p_vehicle_id;

  -- If vehicle has mileage tracking, use it
  IF v_current_mileage = 0 THEN
    SELECT COALESCE(mileage, 0) INTO v_current_mileage
    FROM public.vehicles
    WHERE id = p_vehicle_id;
  END IF;

  -- Deduct for overdue maintenance
  SELECT COUNT(*) INTO v_overdue_maintenance
  FROM public.vehicle_maintenance
  WHERE vehicle_id = p_vehicle_id
  AND (
    (v_current_mileage >= next_due_mileage AND next_due_mileage IS NOT NULL)
    OR (next_due_date IS NOT NULL AND next_due_date < CURRENT_DATE)
  );
  v_score := v_score - (v_overdue_maintenance * 10);

  -- Deduct for critical incidents (last 30 days)
  SELECT COUNT(*) INTO v_critical_incidents
  FROM public.vehicle_incidents
  WHERE vehicle_id = p_vehicle_id
  AND severity IN ('high', 'critical')
  AND incident_date >= CURRENT_DATE - INTERVAL '30 days';
  v_score := v_score - (v_critical_incidents * 15);

  -- Deduct for failed inspections (last 7 days)
  SELECT COUNT(*) INTO v_failed_inspections
  FROM public.vehicle_inspections
  WHERE vehicle_id = p_vehicle_id
  AND inspection_status = 'failed'
  AND inspection_date >= CURRENT_DATE - INTERVAL '7 days';
  v_score := v_score - (v_failed_inspections * 5);

  -- Deduct for missing equipment
  SELECT COUNT(*) INTO v_missing_equipment
  FROM public.vehicle_equipment
  WHERE vehicle_id = p_vehicle_id
  AND status = 'missing';
  v_score := v_score - (v_missing_equipment * 3);

  -- Check fuel efficiency drop (if fuel_logs exist)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'fuel_logs'
  ) THEN
    -- Get average MPG from last 5 fill-ups
    SELECT AVG(mpg) INTO v_avg_mpg
    FROM (
      SELECT mpg FROM public.fuel_logs
      WHERE vehicle_id = p_vehicle_id
      AND mpg IS NOT NULL
      ORDER BY filled_at DESC
      LIMIT 5
    ) recent_fills;

    -- Get most recent MPG
    SELECT mpg INTO v_recent_mpg
    FROM public.fuel_logs
    WHERE vehicle_id = p_vehicle_id
    AND mpg IS NOT NULL
    ORDER BY filled_at DESC
    LIMIT 1;

    -- If recent MPG is significantly lower than average, deduct points
    IF v_avg_mpg IS NOT NULL AND v_recent_mpg IS NOT NULL THEN
      IF v_recent_mpg < (v_avg_mpg * 0.85) THEN -- 15% drop
        v_score := v_score - 5;
      END IF;
    END IF;
  END IF;

  -- Clamp score between 0 and 100
  RETURN GREATEST(0, LEAST(100, v_score));
END;
$$;

COMMENT ON FUNCTION public.calculate_fleet_health_score(uuid) IS 'Calculate comprehensive fleet health score (0-100) (Block 256800)';

-- Update vehicles table to use new health score function
DO $$
BEGIN
  -- Drop existing generated column if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'vehicles' 
    AND column_name = 'health_score'
    AND is_generated = 'ALWAYS'
  ) THEN
    ALTER TABLE public.vehicles DROP COLUMN health_score;
  END IF;

  -- Add health_score as regular column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'vehicles' 
    AND column_name = 'health_score'
  ) THEN
    ALTER TABLE public.vehicles 
    ADD COLUMN health_score numeric DEFAULT 100 CHECK (health_score >= 0 AND health_score <= 100);
  END IF;
END $$;

-- ============================================================================
-- PART 11 — MAINTENANCE ALERT FUNCTION
-- ============================================================================
-- Alert when maintenance is due

CREATE OR REPLACE FUNCTION public.check_maintenance_alerts()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_vehicle_rec RECORD;
  v_current_mileage numeric;
  v_maintenance_rec RECORD;
BEGIN
  -- Get vehicle and current mileage
  SELECT v.id, COALESCE(v.mileage, 0) INTO v_vehicle_rec
  FROM public.vehicles v
  WHERE v.id = NEW.vehicle_id;

  -- If mileage was updated, use new value
  IF TG_OP = 'UPDATE' AND NEW.mileage IS NOT NULL THEN
    v_current_mileage := NEW.mileage;
  ELSIF TG_TABLE_NAME = 'mileage_logs' THEN
    v_current_mileage := NEW.end_miles;
  ELSE
    v_current_mileage := v_vehicle_rec.mileage;
  END IF;

  -- Check all maintenance records for this vehicle
  FOR v_maintenance_rec IN
    SELECT id, maintenance_type, next_due_mileage, next_due_date, vehicle_id
    FROM public.vehicle_maintenance
    WHERE vehicle_id = NEW.vehicle_id
    AND (
      (v_current_mileage >= next_due_mileage AND next_due_mileage IS NOT NULL)
      OR (next_due_date IS NOT NULL AND next_due_date <= CURRENT_DATE)
    )
  LOOP
    -- Log maintenance alert
    INSERT INTO public.fleet_vehicle_logs (
      vehicle_id,
      log_type,
      data,
      created_at
    ) VALUES (
      NEW.vehicle_id,
      'maintenance',
      jsonb_build_object(
        'alert_type', 'maintenance_due',
        'maintenance_type', v_maintenance_rec.maintenance_type,
        'current_mileage', v_current_mileage,
        'due_mileage', v_maintenance_rec.next_due_mileage,
        'due_date', v_maintenance_rec.next_due_date,
        'message', format('Vehicle needs %s within 300 miles or this week', v_maintenance_rec.maintenance_type)
      ),
      now()
    );
  END LOOP;

  RETURN NEW;
END;
$$;

-- Create triggers for maintenance alerts
DROP TRIGGER IF EXISTS trg_maintenance_alert_on_vehicle_update ON public.vehicles;
CREATE TRIGGER trg_maintenance_alert_on_vehicle_update
AFTER UPDATE OF mileage ON public.vehicles
FOR EACH ROW
WHEN (NEW.mileage IS DISTINCT FROM OLD.mileage)
EXECUTE FUNCTION public.check_maintenance_alerts();

DROP TRIGGER IF EXISTS trg_maintenance_alert_on_mileage_log ON public.mileage_logs;
CREATE TRIGGER trg_maintenance_alert_on_mileage_log
AFTER INSERT OR UPDATE OF end_miles ON public.mileage_logs
FOR EACH ROW
EXECUTE FUNCTION public.check_maintenance_alerts();

COMMENT ON FUNCTION public.check_maintenance_alerts() IS 'Check and alert on maintenance due dates (Block 256800)';

-- ============================================================================
-- PART 12 — FUEL EFFICIENCY TRACKING FUNCTION
-- ============================================================================
-- Calculate MPG and detect efficiency drops

CREATE OR REPLACE FUNCTION public.calculate_fuel_efficiency()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_previous_reading numeric;
  v_miles_driven numeric;
  v_mpg numeric;
BEGIN
  -- Only calculate if we have odometer reading and gallons
  IF NEW.odometer_reading IS NULL OR NEW.gallons IS NULL OR NEW.gallons = 0 THEN
    RETURN NEW;
  END IF;

  -- Get previous odometer reading
  SELECT odometer_reading INTO v_previous_reading
  FROM public.fuel_logs
  WHERE vehicle_id = NEW.vehicle_id
  AND id != NEW.id
  ORDER BY filled_at DESC
  LIMIT 1;

  -- If we have previous reading, calculate MPG
  IF v_previous_reading IS NOT NULL AND v_previous_reading < NEW.odometer_reading THEN
    v_miles_driven := NEW.odometer_reading - v_previous_reading;
    v_mpg := v_miles_driven / NEW.gallons;
    NEW.mpg := v_mpg;

    -- Check for efficiency drop and log alert
    IF EXISTS (
      SELECT 1 FROM (
        SELECT AVG(mpg) as avg_mpg
        FROM (
          SELECT mpg FROM public.fuel_logs
          WHERE vehicle_id = NEW.vehicle_id
          AND mpg IS NOT NULL
          AND id != NEW.id
          ORDER BY filled_at DESC
          LIMIT 5
        ) recent
      ) prev
      WHERE prev.avg_mpg IS NOT NULL
      AND v_mpg < (prev.avg_mpg * 0.85)
    ) THEN
      -- Log fuel efficiency alert
      INSERT INTO public.fleet_vehicle_logs (
        vehicle_id,
        log_type,
        data,
        created_at
      ) VALUES (
        NEW.vehicle_id,
        'fuel',
        jsonb_build_object(
          'alert_type', 'efficiency_drop',
          'current_mpg', v_mpg,
          'previous_avg_mpg', (
            SELECT AVG(mpg) FROM (
              SELECT mpg FROM public.fuel_logs
              WHERE vehicle_id = NEW.vehicle_id
              AND mpg IS NOT NULL
              AND id != NEW.id
              ORDER BY filled_at DESC
              LIMIT 5
            ) recent
          ),
          'message', format('Fuel efficiency drop detected: %.1f MPG (previous: %.1f MPG). Possible issue: tire pressure or engine tune-up needed.', 
            v_mpg, 
            (SELECT AVG(mpg) FROM (
              SELECT mpg FROM public.fuel_logs
              WHERE vehicle_id = NEW.vehicle_id
              AND mpg IS NOT NULL
              AND id != NEW.id
              ORDER BY filled_at DESC
              LIMIT 5
            ) recent)
          )
        ),
        now()
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger for fuel efficiency (if fuel_logs table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'fuel_logs'
  ) THEN
    DROP TRIGGER IF EXISTS trg_calculate_fuel_efficiency ON public.fuel_logs;
    CREATE TRIGGER trg_calculate_fuel_efficiency
    BEFORE INSERT OR UPDATE OF odometer_reading, gallons ON public.fuel_logs
    FOR EACH ROW
    EXECUTE FUNCTION public.calculate_fuel_efficiency();
  END IF;
END $$;

COMMENT ON FUNCTION public.calculate_fuel_efficiency() IS 'Calculate MPG and detect fuel efficiency drops (Block 256800)';

-- ============================================================================
-- PART 13 — DAMAGE REPORTING TRIGGER
-- ============================================================================
-- Auto-notify PM when damage is reported

CREATE OR REPLACE FUNCTION public.notify_pm_on_damage()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_vehicle_rec RECORD;
  v_pm_id uuid;
BEGIN
  -- Only process if damage is reported
  IF NEW.damage_reported = true AND (OLD.damage_reported IS NULL OR OLD.damage_reported = false) THEN
    -- Get vehicle info
    SELECT v.*, v.company_id INTO v_vehicle_rec
    FROM public.vehicles v
    WHERE v.id = NEW.vehicle_id;

    -- Get first active PM for the company
    SELECT id INTO v_pm_id
    FROM public.project_managers
    WHERE company_id = v_vehicle_rec.company_id
    AND is_active = true
    LIMIT 1;

    -- Log damage report
    INSERT INTO public.fleet_vehicle_logs (
      vehicle_id,
      log_type,
      data,
      crew_member_id,
      created_at
    ) VALUES (
      NEW.vehicle_id,
      'damage',
      jsonb_build_object(
        'alert_type', 'damage_reported',
        'description', NEW.damage_description,
        'severity', NEW.damage_severity,
        'photos', NEW.damage_photos,
        'pm_notified', v_pm_id IS NOT NULL,
        'message', format('⚠️ Damage Reported: %s on Vehicle. PM notified.', COALESCE(NEW.damage_description, 'Unknown damage'))
      ),
      NEW.crew_member_id,
      now()
    );

    -- Update inspection record
    UPDATE public.vehicle_inspections
    SET pm_notified = true,
        pm_notified_at = now()
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_pm_on_damage
AFTER INSERT OR UPDATE OF damage_reported ON public.vehicle_inspections
FOR EACH ROW
WHEN (NEW.damage_reported = true)
EXECUTE FUNCTION public.notify_pm_on_damage();

COMMENT ON FUNCTION public.notify_pm_on_damage() IS 'Auto-notify PM when damage is reported in inspection (Block 256800)';

-- ============================================================================
-- PART 14 — EQUIPMENT MISSING ALERT FUNCTION
-- ============================================================================
-- Alert when equipment goes missing

CREATE OR REPLACE FUNCTION public.alert_missing_equipment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- If equipment status changed to missing
  IF NEW.status = 'missing' AND (OLD.status IS NULL OR OLD.status != 'missing') THEN
    INSERT INTO public.fleet_vehicle_logs (
      vehicle_id,
      log_type,
      data,
      created_at
    ) VALUES (
      NEW.vehicle_id,
      'equipment',
      jsonb_build_object(
        'alert_type', 'equipment_missing',
        'equipment_name', NEW.equipment_name,
        'equipment_type', NEW.equipment_type,
        'message', format('Missing Equipment: %s did not return %s yesterday.', 
          (SELECT name FROM public.crews c 
           JOIN public.fleet_assignments fa ON fa.crew_id = c.id 
           WHERE fa.vehicle_id = NEW.vehicle_id 
           AND fa.status = 'active' 
           LIMIT 1),
          NEW.equipment_name)
      ),
      now()
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_alert_missing_equipment
AFTER INSERT OR UPDATE OF status ON public.vehicle_equipment
FOR EACH ROW
WHEN (NEW.status = 'missing')
EXECUTE FUNCTION public.alert_missing_equipment();

COMMENT ON FUNCTION public.alert_missing_equipment() IS 'Alert when equipment goes missing (Block 256800)';

-- ============================================================================
-- PART 15 — VEHICLE ASSIGNMENT VALIDATION
-- ============================================================================
-- Prevent assigning vehicle that's already assigned

CREATE OR REPLACE FUNCTION public.validate_vehicle_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_existing_assignment uuid;
BEGIN
  -- Check if vehicle is already assigned
  IF NEW.status = 'active' THEN
    SELECT id INTO v_existing_assignment
    FROM public.fleet_assignments
    WHERE vehicle_id = NEW.vehicle_id
    AND status = 'active'
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

    IF v_existing_assignment IS NOT NULL THEN
      RAISE EXCEPTION 'Vehicle is already assigned to another crew/member. Please return the vehicle first.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_vehicle_assignment
BEFORE INSERT OR UPDATE OF status ON public.fleet_assignments
FOR EACH ROW
EXECUTE FUNCTION public.validate_vehicle_assignment();

COMMENT ON FUNCTION public.validate_vehicle_assignment() IS 'Validate vehicle assignments to prevent double-booking (Block 256800)';

-- ============================================================================
-- PART 16 — FLEET DASHBOARD VIEWS
-- ============================================================================
-- Views for fleet health dashboard

CREATE OR REPLACE VIEW public.fleet_health_dashboard AS
SELECT 
  v.id as vehicle_id,
  v.name as vehicle_name,
  v.vehicle_type,
  v.license_plate,
  v.status,
  v.health_score,
  v.mileage as current_mileage,
  v.assigned_to,
  cm.name as assigned_to_name,
  -- Latest GPS location
  (
    SELECT location_name 
    FROM public.vehicle_gps_tracking 
    WHERE vehicle_id = v.id 
    ORDER BY tracked_at DESC 
    LIMIT 1
  ) as current_location,
  -- Maintenance alerts
  (
    SELECT COUNT(*) 
    FROM public.vehicle_maintenance vm
    WHERE vm.vehicle_id = v.id
    AND (
      (v.mileage >= vm.next_due_mileage AND vm.next_due_mileage IS NOT NULL)
      OR (vm.next_due_date IS NOT NULL AND vm.next_due_date <= CURRENT_DATE)
    )
  ) as overdue_maintenance_count,
  -- Recent incidents
  (
    SELECT COUNT(*) 
    FROM public.vehicle_incidents vi
    WHERE vi.vehicle_id = v.id
    AND vi.incident_date >= CURRENT_DATE - INTERVAL '30 days'
  ) as recent_incidents_count,
  -- Missing equipment
  (
    SELECT COUNT(*) 
    FROM public.vehicle_equipment ve
    WHERE ve.vehicle_id = v.id
    AND ve.status = 'missing'
  ) as missing_equipment_count,
  -- Last inspection date
  (
    SELECT MAX(inspection_date) 
    FROM public.vehicle_inspections 
    WHERE vehicle_id = v.id
  ) as last_inspection_date,
  -- Last inspection status
  (
    SELECT inspection_status 
    FROM public.vehicle_inspections 
    WHERE vehicle_id = v.id
    ORDER BY inspection_date DESC 
    LIMIT 1
  ) as last_inspection_status,
  v.created_at,
  v.updated_at
FROM public.vehicles v
LEFT JOIN public.crew_members cm ON cm.id = v.assigned_to
WHERE v.status != 'retired';

COMMENT ON VIEW public.fleet_health_dashboard IS 'Fleet health dashboard view (Block 256800)';

-- ============================================================================
-- PART 17 — UPDATED_AT TRIGGERS
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

CREATE TRIGGER trg_fleet_assignments_updated_at
BEFORE UPDATE ON public.fleet_assignments
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_vehicle_inspections_updated_at
BEFORE UPDATE ON public.vehicle_inspections
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_vehicle_equipment_updated_at
BEFORE UPDATE ON public.vehicle_equipment
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_vehicle_incidents_updated_at
BEFORE UPDATE ON public.vehicle_incidents
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- PART 18 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.fleet_vehicle_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_gps_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_incidents ENABLE ROW LEVEL SECURITY;

-- Helper function to check company membership (reuse from Block 252900 if exists)
CREATE OR REPLACE FUNCTION public.user_belongs_to_company(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.roofing_company_members rcm
    WHERE rcm.roofing_company_id = p_company_id
    AND rcm.user_id = auth.uid()
    AND rcm.is_active = true
  ) OR EXISTS (
    SELECT 1
    FROM public.roofing_companies rc
    WHERE rc.id = p_company_id
    AND rc.owner_id = auth.uid()
  );
$$;

-- Fleet vehicle logs: Access via company through vehicle
CREATE POLICY "fleet_vehicle_logs_select_company_members" ON public.fleet_vehicle_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = fleet_vehicle_logs.vehicle_id
      AND public.user_belongs_to_company(v.company_id)
    )
  );

CREATE POLICY "fleet_vehicle_logs_insert_company_members" ON public.fleet_vehicle_logs
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = fleet_vehicle_logs.vehicle_id
      AND public.user_belongs_to_company(v.company_id)
    )
  );

-- Fleet assignments: Access via company through vehicle
CREATE POLICY "fleet_assignments_select_company_members" ON public.fleet_assignments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = fleet_assignments.vehicle_id
      AND public.user_belongs_to_company(v.company_id)
    )
  );

CREATE POLICY "fleet_assignments_insert_company_members" ON public.fleet_assignments
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = fleet_assignments.vehicle_id
      AND public.user_belongs_to_company(v.company_id)
    )
  );

CREATE POLICY "fleet_assignments_update_company_members" ON public.fleet_assignments
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = fleet_assignments.vehicle_id
      AND public.user_belongs_to_company(v.company_id)
    )
  );

-- GPS tracking: Access via company through vehicle
CREATE POLICY "vehicle_gps_tracking_select_company_members" ON public.vehicle_gps_tracking
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = vehicle_gps_tracking.vehicle_id
      AND public.user_belongs_to_company(v.company_id)
    )
  );

CREATE POLICY "vehicle_gps_tracking_insert_company_members" ON public.vehicle_gps_tracking
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = vehicle_gps_tracking.vehicle_id
      AND public.user_belongs_to_company(v.company_id)
    )
  );

-- Vehicle inspections: Access via company through vehicle
CREATE POLICY "vehicle_inspections_select_company_members" ON public.vehicle_inspections
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = vehicle_inspections.vehicle_id
      AND public.user_belongs_to_company(v.company_id)
    )
  );

CREATE POLICY "vehicle_inspections_insert_company_members" ON public.vehicle_inspections
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = vehicle_inspections.vehicle_id
      AND public.user_belongs_to_company(v.company_id)
    )
  );

CREATE POLICY "vehicle_inspections_update_company_members" ON public.vehicle_inspections
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = vehicle_inspections.vehicle_id
      AND public.user_belongs_to_company(v.company_id)
    )
  );

-- Vehicle equipment: Access via company through vehicle
CREATE POLICY "vehicle_equipment_select_company_members" ON public.vehicle_equipment
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = vehicle_equipment.vehicle_id
      AND public.user_belongs_to_company(v.company_id)
    )
  );

CREATE POLICY "vehicle_equipment_insert_company_members" ON public.vehicle_equipment
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = vehicle_equipment.vehicle_id
      AND public.user_belongs_to_company(v.company_id)
    )
  );

CREATE POLICY "vehicle_equipment_update_company_members" ON public.vehicle_equipment
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = vehicle_equipment.vehicle_id
      AND public.user_belongs_to_company(v.company_id)
    )
  );

-- Vehicle incidents: Access via company through vehicle
CREATE POLICY "vehicle_incidents_select_company_members" ON public.vehicle_incidents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = vehicle_incidents.vehicle_id
      AND public.user_belongs_to_company(v.company_id)
    )
  );

CREATE POLICY "vehicle_incidents_insert_company_members" ON public.vehicle_incidents
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = vehicle_incidents.vehicle_id
      AND public.user_belongs_to_company(v.company_id)
    )
  );

CREATE POLICY "vehicle_incidents_update_company_members" ON public.vehicle_incidents
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = vehicle_incidents.vehicle_id
      AND public.user_belongs_to_company(v.company_id)
    )
  );

-- ============================================================================
-- END OF BLOCK 256800 — FLEET & VEHICLE MANAGEMENT ENGINE v1
-- ============================================================================





















