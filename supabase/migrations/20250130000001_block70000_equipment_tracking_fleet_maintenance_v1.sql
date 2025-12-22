-- =========================================================
-- Block 70000 — SmartSend Roofing "Equipment Tracking + Fleet Maintenance System" v1
-- (TRACK TOOLS • MANAGE FLEET • MAINTENANCE ALERTS • EQUIPMENT CHECKOUT • LOST ITEM PREVENTION • COST CONTROL)
-- =========================================================
-- 
-- This block solves a MASSIVE hidden money leak in roofing companies:
-- 👉 Lost tools, broken equipment, unmaintained trucks, and wasted fuel.
-- 
-- Every roofing company loses thousands per year because:
-- - tools disappear
-- - nobody knows who used what
-- - trucks aren't maintained
-- - compressors break mid-job
-- - nail guns jam because no one checks them
-- - ladders go missing
-- - office staff has NO visibility on equipment
-- - owners replace items unnecessarily
-- 
-- SmartSend will track EVERYTHING — tools, vehicles, maintenance schedules, and usage.
-- Full system, no fluff.

-- ============================================================================
-- PART 1 — EQUIPMENT TABLE
-- ============================================================================
-- Track all tools and equipment: ladders, nail guns, compressors, hoses, generators, safety gear, tear-off tools
-- Each item has: serial number, purchase date, condition, assigned crew, location

CREATE TABLE IF NOT EXISTS public.equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Equipment identification
  name text NOT NULL,                      -- e.g. "Nail Gun #23", "Ladder 14ft", "Compressor 5HP"
  serial_number text,                      -- Serial number if available
  type text NOT NULL,                      -- 'ladder', 'nail_gun', 'compressor', 'hose', 'generator', 'safety_gear', 'tear_off_tool', 'other'
  category text,                           -- Optional sub-category
  
  -- Purchase & value
  purchase_date date,
  purchase_cost numeric,
  current_value numeric,                   -- Estimated current value
  
  -- Current status
  condition text NOT NULL DEFAULT 'functional' CHECK (condition IN ('functional', 'minor_issues', 'damaged', 'out_of_service', 'lost')),
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'checked_out', 'in_repair', 'lost')),
  
  -- Assignment
  assigned_crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  assigned_crew_member_id uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  
  -- Location tracking
  last_known_location text,                -- Last known location (job site, warehouse, etc.)
  last_known_job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  
  -- Metadata
  notes text,
  photos text[],                           -- Array of photo URLs
  specifications jsonb DEFAULT '{}'::jsonb, -- Additional specs (brand, model, etc.)
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_equipment_workspace ON public.equipment(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_equipment_type ON public.equipment(type, condition);
CREATE INDEX IF NOT EXISTS idx_equipment_assigned_crew ON public.equipment(assigned_crew_id) WHERE assigned_crew_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_equipment_status ON public.equipment(status, condition);
CREATE INDEX IF NOT EXISTS idx_equipment_serial ON public.equipment(serial_number) WHERE serial_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_equipment_last_job ON public.equipment(last_known_job_id) WHERE last_known_job_id IS NOT NULL;

-- ============================================================================
-- PART 2 — EQUIPMENT_LOGS TABLE
-- ============================================================================
-- Track all equipment activity: checkout, return, damage reports, location changes
-- This is the audit trail for accountability

CREATE TABLE IF NOT EXISTS public.equipment_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Who/what/when
  crew_member_id uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  
  -- Action type
  action text NOT NULL CHECK (action IN ('checkout', 'return', 'damage_report', 'repair_complete', 'location_change', 'assigned', 'unassigned', 'lost', 'found')),
  
  -- Details
  notes text,
  condition_before text,                   -- Condition before action
  condition_after text,                    -- Condition after action
  
  -- Location
  location text,
  latitude numeric(10, 8),
  longitude numeric(11, 8),
  
  -- Photos (for damage reports, etc.)
  photos text[],
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,      -- Additional context
  
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_equipment_logs_equipment ON public.equipment_logs(equipment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_equipment_logs_workspace ON public.equipment_logs(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_equipment_logs_action ON public.equipment_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_equipment_logs_crew_member ON public.equipment_logs(crew_member_id) WHERE crew_member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_equipment_logs_job ON public.equipment_logs(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_equipment_logs_checkout_active ON public.equipment_logs(equipment_id, action) WHERE action = 'checkout';

-- ============================================================================
-- PART 3 — EQUIPMENT_CHECKOUTS TABLE
-- ============================================================================
-- Active checkout records (who has what equipment right now)
-- This is the "current state" view for quick lookups

CREATE TABLE IF NOT EXISTS public.equipment_checkouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Who checked it out
  crew_member_id uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  checked_out_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Where/when
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  checkout_location text,
  checkout_notes text,
  
  -- Condition tracking
  condition_at_checkout text NOT NULL DEFAULT 'functional',
  
  -- Timestamps
  checked_out_at timestamptz DEFAULT now(),
  expected_return_at timestamptz,          -- Optional expected return time
  returned_at timestamptz,                 -- NULL = still checked out
  
  -- Return details (filled when returned)
  condition_at_return text,
  return_location text,
  return_notes text,
  returned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_equipment_checkouts_equipment ON public.equipment_checkouts(equipment_id, returned_at);
CREATE INDEX IF NOT EXISTS idx_equipment_checkouts_active ON public.equipment_checkouts(equipment_id) WHERE returned_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_equipment_checkouts_workspace ON public.equipment_checkouts(workspace_id, returned_at);
CREATE INDEX IF NOT EXISTS idx_equipment_checkouts_crew_member ON public.equipment_checkouts(crew_member_id) WHERE returned_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_equipment_checkouts_job ON public.equipment_checkouts(job_id) WHERE returned_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_equipment_checkouts_expected_return ON public.equipment_checkouts(expected_return_at) WHERE returned_at IS NULL;

-- ============================================================================
-- PART 4 — EQUIPMENT_REPAIR_TICKETS TABLE
-- ============================================================================
-- Repair tickets for damaged equipment
-- Crew can log broken tools, office receives severity, cost estimate, repair vendor, downtime impact

CREATE TABLE IF NOT EXISTS public.equipment_repair_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Who reported it
  reported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  crew_member_id uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  
  -- Issue details
  issue_description text NOT NULL,
  severity text NOT NULL DEFAULT 'minor' CHECK (severity IN ('minor', 'moderate', 'major', 'critical')),
  reported_condition text NOT NULL,        -- Condition when reported
  
  -- Photos
  photos text[],
  
  -- Repair details
  cost_estimate numeric,
  repair_vendor text,
  estimated_downtime_days integer,
  
  -- Status
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'in_progress', 'completed', 'declined', 'cancelled')),
  
  -- Resolution
  actual_cost numeric,
  repair_notes text,
  completed_at timestamptz,
  completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Approval workflow
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  declined_reason text,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_equipment_repair_tickets_equipment ON public.equipment_repair_tickets(equipment_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_equipment_repair_tickets_workspace ON public.equipment_repair_tickets(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_equipment_repair_tickets_status ON public.equipment_repair_tickets(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_equipment_repair_tickets_pending ON public.equipment_repair_tickets(workspace_id) WHERE status = 'pending';

-- ============================================================================
-- PART 5 — VEHICLE_FLEET TABLE (Enhanced from block 55000)
-- ============================================================================
-- This table extends the existing vehicles table with additional maintenance tracking fields
-- If vehicles table exists, we'll add missing columns

DO $$
BEGIN
  -- Add maintenance tracking fields if they don't exist
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'vehicles') THEN
    -- Add next_service_mileage if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'vehicles' 
      AND column_name = 'next_service_mileage'
    ) THEN
      ALTER TABLE public.vehicles ADD COLUMN next_service_mileage numeric;
    END IF;
    
    -- Add last_service_date if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'vehicles' 
      AND column_name = 'last_service_date'
    ) THEN
      ALTER TABLE public.vehicles ADD COLUMN last_service_date date;
    END IF;
    
    -- Add registration_expiry if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'vehicles' 
      AND column_name = 'registration_expiry'
    ) THEN
      ALTER TABLE public.vehicles ADD COLUMN registration_expiry date;
    END IF;
  END IF;
END $$;

-- ============================================================================
-- PART 6 — MAINTENANCE_LOGS TABLE (Enhanced for both vehicles and equipment)
-- ============================================================================
-- Unified maintenance log for vehicles (from block 55000) and equipment
-- Tracks: oil changes, brake service, tire rotation, equipment servicing, etc.

CREATE TABLE IF NOT EXISTS public.maintenance_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- What is being maintained
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE CASCADE,
  equipment_id uuid REFERENCES public.equipment(id) ON DELETE CASCADE,
  
  -- Service details
  service_type text NOT NULL,              -- 'oil_change', 'tire_rotation', 'brake_service', 'transmission_service', 'equipment_service', etc.
  service_date date NOT NULL,
  service_mileage numeric,                 -- For vehicles
  
  -- Cost & vendor
  cost numeric,
  service_provider text,
  service_notes text,
  
  -- Next service
  next_service_date date,
  next_service_mileage numeric,
  
  -- Who performed/approved
  performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Receipts/docs
  receipt_photo text,
  documents jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Ensure either vehicle_id or equipment_id is set
  CONSTRAINT maintenance_logs_has_target CHECK (
    (vehicle_id IS NOT NULL AND equipment_id IS NULL) OR
    (vehicle_id IS NULL AND equipment_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_maintenance_logs_vehicle ON public.maintenance_logs(vehicle_id, service_date DESC);
CREATE INDEX IF NOT EXISTS idx_maintenance_logs_equipment ON public.maintenance_logs(equipment_id, service_date DESC);
CREATE INDEX IF NOT EXISTS idx_maintenance_logs_workspace ON public.maintenance_logs(workspace_id, service_date DESC);
CREATE INDEX IF NOT EXISTS idx_maintenance_logs_next_service ON public.maintenance_logs(next_service_date) WHERE next_service_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_maintenance_logs_service_type ON public.maintenance_logs(service_type);

-- ============================================================================
-- PART 7 — EQUIPMENT_ANALYTICS VIEW
-- ============================================================================
-- Analytics view for equipment cost tracking, replacement costs, ROI, frequently damaged items

CREATE OR REPLACE VIEW public.equipment_analytics AS
SELECT 
  e.workspace_id,
  e.type,
  COUNT(DISTINCT e.id) as total_items,
  COUNT(DISTINCT CASE WHEN e.status = 'available' THEN e.id END) as available_count,
  COUNT(DISTINCT CASE WHEN e.status = 'checked_out' THEN e.id END) as checked_out_count,
  COUNT(DISTINCT CASE WHEN e.status = 'in_repair' THEN e.id END) as in_repair_count,
  COUNT(DISTINCT CASE WHEN e.status = 'lost' THEN e.id END) as lost_count,
  COUNT(DISTINCT CASE WHEN e.condition = 'damaged' THEN e.id END) as damaged_count,
  SUM(e.purchase_cost) as total_purchase_cost,
  SUM(e.current_value) as total_current_value,
  COUNT(DISTINCT er.id) as repair_ticket_count,
  SUM(er.actual_cost) as total_repair_cost,
  COUNT(DISTINCT el.id) as total_log_entries,
  COUNT(DISTINCT CASE WHEN el.action = 'checkout' THEN el.id END) as total_checkouts,
  COUNT(DISTINCT CASE WHEN el.action = 'damage_report' THEN el.id END) as damage_reports_count
FROM public.equipment e
LEFT JOIN public.equipment_repair_tickets er ON er.equipment_id = e.id
LEFT JOIN public.equipment_logs el ON el.equipment_id = e.id
GROUP BY e.workspace_id, e.type;

-- ============================================================================
-- PART 8 — LOST_EQUIPMENT_ALERTS VIEW
-- ============================================================================
-- View to detect equipment that hasn't been returned or is missing

CREATE OR REPLACE VIEW public.lost_equipment_alerts AS
SELECT 
  e.id as equipment_id,
  e.workspace_id,
  e.name,
  e.type,
  e.serial_number,
  ec.id as checkout_id,
  ec.crew_member_id,
  ec.crew_id,
  ec.job_id,
  ec.checked_out_at,
  ec.expected_return_at,
  NOW() - ec.checked_out_at as time_checked_out,
  CASE 
    WHEN ec.expected_return_at IS NOT NULL AND NOW() > ec.expected_return_at THEN true
    ELSE false
  END as overdue,
  cm.name as crew_member_name,
  c.name as crew_name,
  rj.title as job_title
FROM public.equipment e
INNER JOIN public.equipment_checkouts ec ON ec.equipment_id = e.id AND ec.returned_at IS NULL
LEFT JOIN public.crew_members cm ON cm.id = ec.crew_member_id
LEFT JOIN public.crews c ON c.id = ec.crew_id
LEFT JOIN public.roofing_jobs rj ON rj.id = ec.job_id
WHERE e.status != 'lost'  -- Don't alert on already marked as lost
  AND (ec.expected_return_at IS NULL OR NOW() > ec.expected_return_at + INTERVAL '24 hours');

-- ============================================================================
-- PART 9 — MAINTENANCE_ALERTS VIEW
-- ============================================================================
-- View to show upcoming and overdue maintenance for vehicles and equipment

CREATE OR REPLACE VIEW public.maintenance_alerts AS
SELECT 
  ml.id,
  ml.workspace_id,
  ml.vehicle_id,
  ml.equipment_id,
  ml.service_type,
  ml.next_service_date,
  ml.next_service_mileage,
  CASE 
    WHEN ml.vehicle_id IS NOT NULL THEN v.name
    WHEN ml.equipment_id IS NOT NULL THEN e.name
    ELSE 'Unknown'
  END as item_name,
  CASE 
    WHEN ml.vehicle_id IS NOT NULL THEN 'vehicle'
    WHEN ml.equipment_id IS NOT NULL THEN 'equipment'
  END as item_type,
  CASE 
    WHEN ml.next_service_date IS NOT NULL AND ml.next_service_date < CURRENT_DATE THEN 'overdue'
    WHEN ml.next_service_date IS NOT NULL AND ml.next_service_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'due_soon'
    ELSE 'upcoming'
  END as alert_level,
  CASE 
    WHEN ml.vehicle_id IS NOT NULL THEN v.current_mileage
    ELSE NULL
  END as current_mileage,
  CASE 
    WHEN ml.vehicle_id IS NOT NULL AND ml.next_service_mileage IS NOT NULL 
      THEN ml.next_service_mileage - v.current_mileage
    ELSE NULL
  END as miles_until_service
FROM public.maintenance_logs ml
LEFT JOIN public.vehicles v ON v.id = ml.vehicle_id
LEFT JOIN public.equipment e ON e.id = ml.equipment_id
WHERE ml.next_service_date IS NOT NULL 
   OR ml.next_service_mileage IS NOT NULL;

-- ============================================================================
-- PART 10 — FUNCTIONS: Equipment Checkout
-- ============================================================================

CREATE OR REPLACE FUNCTION public.checkout_equipment(
  p_equipment_id uuid,
  p_crew_member_id uuid,
  p_job_id uuid DEFAULT NULL,
  p_checkout_notes text DEFAULT NULL,
  p_condition text DEFAULT 'functional'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_checkout_id uuid;
  v_workspace_id uuid;
  v_crew_id uuid;
BEGIN
  -- Get workspace_id and current status
  SELECT workspace_id, status, assigned_crew_id INTO v_workspace_id, v_crew_id
  FROM public.equipment
  WHERE id = p_equipment_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Equipment not found';
  END IF;
  
  -- Check if already checked out
  IF EXISTS (
    SELECT 1 FROM public.equipment_checkouts 
    WHERE equipment_id = p_equipment_id AND returned_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Equipment is already checked out';
  END IF;
  
  -- Get crew_id from crew_member if not set
  IF v_crew_id IS NULL AND p_crew_member_id IS NOT NULL THEN
    SELECT crew_id INTO v_crew_id FROM public.crew_members WHERE id = p_crew_member_id;
  END IF;
  
  -- Create checkout record
  INSERT INTO public.equipment_checkouts (
    equipment_id,
    workspace_id,
    crew_member_id,
    crew_id,
    job_id,
    checkout_notes,
    condition_at_checkout,
    checked_out_by
  ) VALUES (
    p_equipment_id,
    v_workspace_id,
    p_crew_member_id,
    v_crew_id,
    p_job_id,
    p_checkout_notes,
    p_condition,
    auth.uid()
  ) RETURNING id INTO v_checkout_id;
  
  -- Update equipment status
  UPDATE public.equipment
  SET 
    status = 'checked_out',
    assigned_crew_member_id = p_crew_member_id,
    assigned_crew_id = v_crew_id,
    last_known_job_id = p_job_id,
    updated_at = now()
  WHERE id = p_equipment_id;
  
  -- Log the checkout
  INSERT INTO public.equipment_logs (
    equipment_id,
    workspace_id,
    crew_member_id,
    crew_id,
    job_id,
    action,
    condition_before,
    condition_after,
    notes
  ) VALUES (
    p_equipment_id,
    v_workspace_id,
    p_crew_member_id,
    v_crew_id,
    p_job_id,
    'checkout',
    (SELECT condition FROM public.equipment WHERE id = p_equipment_id),
    p_condition,
    p_checkout_notes
  );
  
  RETURN v_checkout_id;
END;
$$;

-- ============================================================================
-- PART 11 — FUNCTIONS: Equipment Return
-- ============================================================================

CREATE OR REPLACE FUNCTION public.return_equipment(
  p_checkout_id uuid,
  p_condition text DEFAULT 'functional',
  p_return_notes text DEFAULT NULL,
  p_location text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_equipment_id uuid;
  v_workspace_id uuid;
  v_crew_member_id uuid;
  v_crew_id uuid;
  v_job_id uuid;
BEGIN
  -- Get checkout details
  SELECT equipment_id, workspace_id, crew_member_id, crew_id, job_id
  INTO v_equipment_id, v_workspace_id, v_crew_member_id, v_crew_id, v_job_id
  FROM public.equipment_checkouts
  WHERE id = p_checkout_id AND returned_at IS NULL;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checkout not found or already returned';
  END IF;
  
  -- Update checkout record
  UPDATE public.equipment_checkouts
  SET 
    returned_at = now(),
    condition_at_return = p_condition,
    return_notes = p_return_notes,
    return_location = p_location,
    returned_by = auth.uid(),
    updated_at = now()
  WHERE id = p_checkout_id;
  
  -- Update equipment status
  UPDATE public.equipment
  SET 
    status = 'available',
    condition = p_condition,
    last_known_location = p_location,
    updated_at = now()
  WHERE id = v_equipment_id;
  
  -- If damaged, create repair ticket
  IF p_condition IN ('damaged', 'minor_issues') THEN
    INSERT INTO public.equipment_repair_tickets (
      equipment_id,
      workspace_id,
      crew_member_id,
      job_id,
      issue_description,
      severity,
      reported_condition,
      reported_by
    ) VALUES (
      v_equipment_id,
      v_workspace_id,
      v_crew_member_id,
      v_job_id,
      COALESCE(p_return_notes, 'Damage reported on return'),
      CASE 
        WHEN p_condition = 'damaged' THEN 'moderate'
        ELSE 'minor'
      END,
      p_condition,
      auth.uid()
    );
  END IF;
  
  -- Log the return
  INSERT INTO public.equipment_logs (
    equipment_id,
    workspace_id,
    crew_member_id,
    crew_id,
    job_id,
    action,
    condition_before,
    condition_after,
    notes,
    location
  ) VALUES (
    v_equipment_id,
    v_workspace_id,
    v_crew_member_id,
    v_crew_id,
    v_job_id,
    'return',
    (SELECT condition_at_checkout FROM public.equipment_checkouts WHERE id = p_checkout_id),
    p_condition,
    p_return_notes,
    p_location
  );
  
  RETURN true;
END;
$$;

-- ============================================================================
-- PART 12 — FUNCTIONS: Detect Lost Equipment
-- ============================================================================

CREATE OR REPLACE FUNCTION public.detect_lost_equipment(
  p_workspace_id uuid,
  p_hours_threshold integer DEFAULT 24
)
RETURNS TABLE (
  equipment_id uuid,
  equipment_name text,
  checkout_id uuid,
  checked_out_at timestamptz,
  hours_checked_out numeric,
  crew_member_name text,
  job_title text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id,
    e.name,
    ec.id,
    ec.checked_out_at,
    EXTRACT(EPOCH FROM (NOW() - ec.checked_out_at)) / 3600 as hours_checked_out,
    COALESCE(cm.name, 'Unknown') as crew_member_name,
    COALESCE(rj.title, 'Unknown Job') as job_title
  FROM public.equipment e
  INNER JOIN public.equipment_checkouts ec ON ec.equipment_id = e.id AND ec.returned_at IS NULL
  LEFT JOIN public.crew_members cm ON cm.id = ec.crew_member_id
  LEFT JOIN public.roofing_jobs rj ON rj.id = ec.job_id
  WHERE e.workspace_id = p_workspace_id
    AND e.status != 'lost'
    AND EXTRACT(EPOCH FROM (NOW() - ec.checked_out_at)) / 3600 > p_hours_threshold
  ORDER BY ec.checked_out_at ASC;
END;
$$;

-- ============================================================================
-- PART 13 — FUNCTIONS: Get Maintenance Alerts
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_maintenance_alerts(
  p_workspace_id uuid,
  p_days_ahead integer DEFAULT 30
)
RETURNS TABLE (
  item_id uuid,
  item_name text,
  item_type text,
  service_type text,
  alert_level text,
  days_until_due integer,
  miles_until_due numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(ml.vehicle_id, ml.equipment_id) as item_id,
    CASE 
      WHEN ml.vehicle_id IS NOT NULL THEN v.name
      WHEN ml.equipment_id IS NOT NULL THEN e.name
    END as item_name,
    CASE 
      WHEN ml.vehicle_id IS NOT NULL THEN 'vehicle'
      WHEN ml.equipment_id IS NOT NULL THEN 'equipment'
    END as item_type,
    ml.service_type,
    CASE 
      WHEN ml.next_service_date IS NOT NULL AND ml.next_service_date < CURRENT_DATE THEN 'overdue'
      WHEN ml.next_service_date IS NOT NULL AND ml.next_service_date <= CURRENT_DATE + INTERVAL '1 day' THEN 'due_today'
      WHEN ml.next_service_date IS NOT NULL AND ml.next_service_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'due_this_week'
      WHEN ml.next_service_date IS NOT NULL AND ml.next_service_date <= CURRENT_DATE + (p_days_ahead || ' days')::interval THEN 'due_soon'
      ELSE 'upcoming'
    END as alert_level,
    CASE 
      WHEN ml.next_service_date IS NOT NULL 
        THEN ml.next_service_date - CURRENT_DATE
      ELSE NULL
    END::integer as days_until_due,
    CASE 
      WHEN ml.vehicle_id IS NOT NULL AND ml.next_service_mileage IS NOT NULL 
        THEN ml.next_service_mileage - v.current_mileage
      ELSE NULL
    END as miles_until_due
  FROM public.maintenance_logs ml
  LEFT JOIN public.vehicles v ON v.id = ml.vehicle_id
  LEFT JOIN public.equipment e ON e.id = ml.equipment_id
  WHERE ml.workspace_id = p_workspace_id
    AND (
      (ml.next_service_date IS NOT NULL AND ml.next_service_date <= CURRENT_DATE + (p_days_ahead || ' days')::interval)
      OR (ml.next_service_mileage IS NOT NULL AND ml.vehicle_id IS NOT NULL AND v.current_mileage IS NOT NULL 
          AND ml.next_service_mileage - v.current_mileage <= 500)
    )
  ORDER BY 
    CASE 
      WHEN ml.next_service_date IS NOT NULL AND ml.next_service_date < CURRENT_DATE THEN 1
      WHEN ml.next_service_date IS NOT NULL AND ml.next_service_date <= CURRENT_DATE + INTERVAL '1 day' THEN 2
      WHEN ml.next_service_date IS NOT NULL AND ml.next_service_date <= CURRENT_DATE + INTERVAL '7 days' THEN 3
      ELSE 4
    END,
    ml.next_service_date ASC;
END;
$$;

-- ============================================================================
-- PART 14 — TRIGGERS: Update equipment updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_equipment_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_equipment_updated_at ON public.equipment;
CREATE TRIGGER trg_set_equipment_updated_at
BEFORE UPDATE ON public.equipment
FOR EACH ROW
EXECUTE FUNCTION public.set_equipment_updated_at();

CREATE OR REPLACE FUNCTION public.set_equipment_checkouts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_equipment_checkouts_updated_at ON public.equipment_checkouts;
CREATE TRIGGER trg_set_equipment_checkouts_updated_at
BEFORE UPDATE ON public.equipment_checkouts
FOR EACH ROW
EXECUTE FUNCTION public.set_equipment_checkouts_updated_at();

CREATE OR REPLACE FUNCTION public.set_equipment_repair_tickets_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_equipment_repair_tickets_updated_at ON public.equipment_repair_tickets;
CREATE TRIGGER trg_set_equipment_repair_tickets_updated_at
BEFORE UPDATE ON public.equipment_repair_tickets
FOR EACH ROW
EXECUTE FUNCTION public.set_equipment_repair_tickets_updated_at();

CREATE OR REPLACE FUNCTION public.set_maintenance_logs_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_maintenance_logs_updated_at ON public.maintenance_logs;
CREATE TRIGGER trg_set_maintenance_logs_updated_at
BEFORE UPDATE ON public.maintenance_logs
FOR EACH ROW
EXECUTE FUNCTION public.set_maintenance_logs_updated_at();

-- ============================================================================
-- PART 15 — ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_checkouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_repair_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_logs ENABLE ROW LEVEL SECURITY;

-- Equipment: Workspace members can read, workspace owners/admins can modify
CREATE POLICY "equipment_select_workspace_members" ON public.equipment
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = equipment.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "equipment_insert_workspace_admins" ON public.equipment
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = equipment.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "equipment_update_workspace_admins" ON public.equipment
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = equipment.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "equipment_delete_workspace_owners" ON public.equipment
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = equipment.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'owner'
    )
  );

-- Equipment Logs: Workspace members can read, crew members can insert
CREATE POLICY "equipment_logs_select_workspace_members" ON public.equipment_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = equipment_logs.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "equipment_logs_insert_workspace_members" ON public.equipment_logs
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = equipment_logs.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Equipment Checkouts: Workspace members can read, crew members can checkout/return
CREATE POLICY "equipment_checkouts_select_workspace_members" ON public.equipment_checkouts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = equipment_checkouts.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "equipment_checkouts_insert_workspace_members" ON public.equipment_checkouts
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = equipment_checkouts.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "equipment_checkouts_update_workspace_members" ON public.equipment_checkouts
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = equipment_checkouts.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Equipment Repair Tickets: Workspace members can read, crew members can create, admins can approve
CREATE POLICY "equipment_repair_tickets_select_workspace_members" ON public.equipment_repair_tickets
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = equipment_repair_tickets.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "equipment_repair_tickets_insert_workspace_members" ON public.equipment_repair_tickets
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = equipment_repair_tickets.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "equipment_repair_tickets_update_workspace_admins" ON public.equipment_repair_tickets
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = equipment_repair_tickets.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  );

-- Maintenance Logs: Workspace members can read, admins can modify
CREATE POLICY "maintenance_logs_select_workspace_members" ON public.maintenance_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = maintenance_logs.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "maintenance_logs_insert_workspace_admins" ON public.maintenance_logs
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = maintenance_logs.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "maintenance_logs_update_workspace_admins" ON public.maintenance_logs
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = maintenance_logs.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  );

-- ============================================================================
-- PART 16 — COMMENTS (Documentation)
-- ============================================================================

COMMENT ON TABLE public.equipment IS 'Equipment inventory: tools, ladders, nail guns, compressors, safety gear, etc.';
COMMENT ON TABLE public.equipment_logs IS 'Audit trail for all equipment activity: checkout, return, damage, location changes';
COMMENT ON TABLE public.equipment_checkouts IS 'Active checkout records - who has what equipment right now';
COMMENT ON TABLE public.equipment_repair_tickets IS 'Repair tickets for damaged equipment with approval workflow';
COMMENT ON TABLE public.maintenance_logs IS 'Unified maintenance log for vehicles and equipment';
COMMENT ON VIEW public.equipment_analytics IS 'Analytics view for equipment cost tracking and ROI';
COMMENT ON VIEW public.lost_equipment_alerts IS 'View to detect equipment that hasnt been returned or is missing';
COMMENT ON VIEW public.maintenance_alerts IS 'View to show upcoming and overdue maintenance for vehicles and equipment';
COMMENT ON FUNCTION public.checkout_equipment IS 'Checkout equipment to a crew member';
COMMENT ON FUNCTION public.return_equipment IS 'Return equipment and update status, auto-create repair ticket if damaged';
COMMENT ON FUNCTION public.detect_lost_equipment IS 'Detect equipment that has been checked out longer than threshold';
COMMENT ON FUNCTION public.get_maintenance_alerts IS 'Get maintenance alerts for vehicles and equipment';
