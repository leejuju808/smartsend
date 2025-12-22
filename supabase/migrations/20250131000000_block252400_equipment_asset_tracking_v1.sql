-- =========================================================
-- Block 252400 — SmartSend Equipment & Asset Tracking System v1
-- "Tools, Ladders, Vehicles, Assignments, Damage Reports, Maintenance Reminders"
-- =========================================================
-- 
-- This is the feature that FINALLY solves one of the WORST problems in roofing companies:
-- 
-- - Lost ladders
-- - Missing tools
-- - Unreported damage
-- - Trucks not maintained
-- - Crews stealing equipment
-- - No idea who used what
-- - $1,000s/month in lost gear
-- 
-- SmartSend fixes ALL of this with a professional asset tracking system.
-- 
-- Roofers will say:
-- "We stopped losing tools when we started using SmartSend."
-- "The system pays for itself off equipment savings ALONE."
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE assets TABLE (Master Equipment Registry)
-- ============================================================================
-- Tracks every piece of equipment: tools, ladders, harnesses, trucks, trailers

CREATE TABLE IF NOT EXISTS public.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('ladder', 'truck', 'trailer', 'blower', 'harness', 'nail_gun', 'compressor', 'saw', 'tool', 'vehicle', 'other')),
  serial_number text,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'assigned', 'maintenance', 'lost', 'retired')),
  photo_url text,
  purchase_date date,
  purchase_price numeric(10,2),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assets_company ON public.assets(company_id);
CREATE INDEX IF NOT EXISTS idx_assets_status ON public.assets(company_id, status);
CREATE INDEX IF NOT EXISTS idx_assets_category ON public.assets(company_id, category);
CREATE INDEX IF NOT EXISTS idx_assets_serial ON public.assets(serial_number) WHERE serial_number IS NOT NULL;

COMMENT ON TABLE public.assets IS 'Master equipment registry - all tools, ladders, vehicles, etc. (Block 252400)';
COMMENT ON COLUMN public.assets.category IS 'Equipment category: ladder, truck, trailer, blower, harness, nail_gun, compressor, saw, tool, vehicle, other';
COMMENT ON COLUMN public.assets.status IS 'Current status: available, assigned, maintenance, lost, retired';

-- ============================================================================
-- PART 2 — CREATE asset_assignments TABLE (Who Has What + When)
-- ============================================================================
-- Tracks equipment assignments to employees and jobs

CREATE TABLE IF NOT EXISTS public.asset_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  assigned_at timestamptz DEFAULT now(),
  returned_at timestamptz,
  assigned_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asset_assignments_asset ON public.asset_assignments(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_assignments_employee ON public.asset_assignments(employee_id) WHERE employee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_asset_assignments_job ON public.asset_assignments(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_asset_assignments_active ON public.asset_assignments(asset_id, returned_at) WHERE returned_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_asset_assignments_assigned_at ON public.asset_assignments(assigned_at DESC);

COMMENT ON TABLE public.asset_assignments IS 'Equipment assignment log - who has what and when (Block 252400)';
COMMENT ON COLUMN public.asset_assignments.returned_at IS 'NULL = currently assigned, timestamp = when returned';

-- ============================================================================
-- PART 3 — CREATE asset_damage_reports TABLE
-- ============================================================================
-- Damage reports from crew with photos and severity

CREATE TABLE IF NOT EXISTS public.asset_damage_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  description text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('minor', 'moderate', 'critical')),
  photo_url text,
  reported_at timestamptz DEFAULT now(),
  reported_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved boolean DEFAULT false,
  resolved_at timestamptz,
  resolved_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asset_damage_reports_asset ON public.asset_damage_reports(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_damage_reports_employee ON public.asset_damage_reports(employee_id) WHERE employee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_asset_damage_reports_job ON public.asset_damage_reports(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_asset_damage_reports_resolved ON public.asset_damage_reports(asset_id, resolved) WHERE resolved = false;
CREATE INDEX IF NOT EXISTS idx_asset_damage_reports_severity ON public.asset_damage_reports(severity);
CREATE INDEX IF NOT EXISTS idx_asset_damage_reports_reported_at ON public.asset_damage_reports(reported_at DESC);

COMMENT ON TABLE public.asset_damage_reports IS 'Damage reports for equipment with photos and severity (Block 252400)';
COMMENT ON COLUMN public.asset_damage_reports.severity IS 'Damage severity: minor, moderate, critical';

-- ============================================================================
-- PART 4 — CREATE asset_maintenance TABLE (Maintenance Schedule)
-- ============================================================================
-- Maintenance tracking with intervals and due dates

CREATE TABLE IF NOT EXISTS public.asset_maintenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  maintenance_type text NOT NULL, -- 'oil_change', 'inspection', 'service', 'repair', 'calibration', etc.
  interval_days int NOT NULL CHECK (interval_days > 0),
  last_completed date,
  next_due date NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asset_maintenance_asset ON public.asset_maintenance(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_maintenance_next_due ON public.asset_maintenance(next_due) WHERE next_due IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_asset_maintenance_overdue ON public.asset_maintenance(asset_id, next_due) WHERE next_due < CURRENT_DATE;

COMMENT ON TABLE public.asset_maintenance IS 'Maintenance schedule with intervals and due dates (Block 252400)';
COMMENT ON COLUMN public.asset_maintenance.interval_days IS 'Days between maintenance (e.g., 90 for oil change, 365 for inspection)';
COMMENT ON COLUMN public.asset_maintenance.next_due IS 'Next maintenance due date (auto-calculated)';

-- ============================================================================
-- PART 5 — CREATE asset_history VIEW
-- ============================================================================
-- View for tracking equipment usage history

CREATE OR REPLACE VIEW public.asset_history AS
SELECT
  a.id AS asset_id,
  a.name AS asset_name,
  a.category,
  a.company_id,
  aa.employee_id,
  we.first_name || ' ' || we.last_name AS employee_name,
  aa.job_id,
  j.stage AS job_stage,
  aa.assigned_at,
  aa.returned_at,
  CASE 
    WHEN aa.returned_at IS NULL THEN 'assigned'
    ELSE 'returned'
  END AS assignment_status,
  EXTRACT(EPOCH FROM (COALESCE(aa.returned_at, now()) - aa.assigned_at)) / 86400 AS days_assigned
FROM public.asset_assignments aa
JOIN public.assets a ON a.id = aa.asset_id
LEFT JOIN public.workforce_employees we ON we.id = aa.employee_id
LEFT JOIN public.jobs j ON j.id = aa.job_id
ORDER BY aa.assigned_at DESC;

COMMENT ON VIEW public.asset_history IS 'Equipment usage history - who used what and when (Block 252400)';

-- ============================================================================
-- PART 6 — TRIGGERS
-- ============================================================================

-- Update assets.updated_at
CREATE OR REPLACE FUNCTION update_assets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assets_updated_at ON public.assets;
CREATE TRIGGER trg_assets_updated_at
BEFORE UPDATE ON public.assets
FOR EACH ROW
EXECUTE FUNCTION update_assets_updated_at();

-- Update asset_maintenance.updated_at
CREATE OR REPLACE FUNCTION update_asset_maintenance_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_asset_maintenance_updated_at ON public.asset_maintenance;
CREATE TRIGGER trg_asset_maintenance_updated_at
BEFORE UPDATE ON public.asset_maintenance
FOR EACH ROW
EXECUTE FUNCTION update_asset_maintenance_updated_at();

-- Auto-update asset status when assigned/returned
CREATE OR REPLACE FUNCTION update_asset_status_on_assignment()
RETURNS TRIGGER AS $$
BEGIN
  -- When assignment is created (returned_at is NULL), set status to 'assigned'
  IF NEW.returned_at IS NULL THEN
    UPDATE public.assets
    SET status = 'assigned'
    WHERE id = NEW.asset_id;
  END IF;
  
  -- When assignment is returned (returned_at is set), set status to 'available'
  IF NEW.returned_at IS NOT NULL AND (OLD.returned_at IS NULL OR OLD.returned_at IS DISTINCT FROM NEW.returned_at) THEN
    UPDATE public.assets
    SET status = 'available'
    WHERE id = NEW.asset_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_asset_status_on_assignment ON public.asset_assignments;
CREATE TRIGGER trg_update_asset_status_on_assignment
AFTER INSERT OR UPDATE ON public.asset_assignments
FOR EACH ROW
EXECUTE FUNCTION update_asset_status_on_assignment();

-- Auto-update asset status when damage is reported
CREATE OR REPLACE FUNCTION update_asset_status_on_damage()
RETURNS TRIGGER AS $$
BEGIN
  -- When damage is reported, set status to 'maintenance' if severity is moderate or critical
  IF NEW.severity IN ('moderate', 'critical') AND NEW.resolved = false THEN
    UPDATE public.assets
    SET status = 'maintenance'
    WHERE id = NEW.asset_id;
  END IF;
  
  -- When damage is resolved, set status back to 'available' if no active assignments
  IF NEW.resolved = true AND OLD.resolved = false THEN
    UPDATE public.assets
    SET status = CASE 
      WHEN EXISTS (
        SELECT 1 FROM public.asset_assignments 
        WHERE asset_id = NEW.asset_id AND returned_at IS NULL
      ) THEN 'assigned'
      ELSE 'available'
    END
    WHERE id = NEW.asset_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_asset_status_on_damage ON public.asset_damage_reports;
CREATE TRIGGER trg_update_asset_status_on_damage
AFTER INSERT OR UPDATE ON public.asset_damage_reports
FOR EACH ROW
EXECUTE FUNCTION update_asset_status_on_damage();

-- Auto-calculate next_due date when maintenance is completed
CREATE OR REPLACE FUNCTION calculate_next_maintenance_due()
RETURNS TRIGGER AS $$
BEGIN
  -- When last_completed is updated, calculate next_due
  IF NEW.last_completed IS NOT NULL AND (OLD.last_completed IS NULL OR OLD.last_completed IS DISTINCT FROM NEW.last_completed) THEN
    NEW.next_due = NEW.last_completed + (NEW.interval_days || ' days')::interval;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calculate_next_maintenance_due ON public.asset_maintenance;
CREATE TRIGGER trg_calculate_next_maintenance_due
BEFORE INSERT OR UPDATE ON public.asset_maintenance
FOR EACH ROW
EXECUTE FUNCTION calculate_next_maintenance_due();

-- ============================================================================
-- PART 7 — HELPER FUNCTIONS
-- ============================================================================

-- Get assets due for maintenance within X days
CREATE OR REPLACE FUNCTION get_assets_due_for_maintenance(
  p_company_id uuid,
  p_days_ahead int DEFAULT 7
)
RETURNS TABLE (
  asset_id uuid,
  asset_name text,
  category text,
  maintenance_type text,
  next_due date,
  days_until_due int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    a.id AS asset_id,
    a.name AS asset_name,
    a.category,
    am.maintenance_type,
    am.next_due,
    (am.next_due - CURRENT_DATE)::int AS days_until_due
  FROM public.asset_maintenance am
  JOIN public.assets a ON a.id = am.asset_id
  WHERE a.company_id = p_company_id
    AND am.next_due IS NOT NULL
    AND am.next_due <= (CURRENT_DATE + (p_days_ahead || ' days')::interval)
    AND am.next_due >= CURRENT_DATE
  ORDER BY am.next_due ASC;
$$;

-- Get lost assets
CREATE OR REPLACE FUNCTION get_lost_assets(p_company_id uuid)
RETURNS TABLE (
  asset_id uuid,
  asset_name text,
  category text,
  last_assigned_to text,
  last_assigned_at timestamptz,
  days_lost int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    a.id AS asset_id,
    a.name AS asset_name,
    a.category,
    COALESCE(we.first_name || ' ' || we.last_name, 'Unknown') AS last_assigned_to,
    MAX(aa.assigned_at) AS last_assigned_at,
    (CURRENT_DATE - MAX(aa.assigned_at)::date)::int AS days_lost
  FROM public.assets a
  LEFT JOIN public.asset_assignments aa ON aa.asset_id = a.id
  LEFT JOIN public.workforce_employees we ON we.id = aa.employee_id
  WHERE a.company_id = p_company_id
    AND a.status = 'lost'
  GROUP BY a.id, a.name, a.category, we.first_name, we.last_name
  ORDER BY MAX(aa.assigned_at) DESC;
$$;

-- Get asset assignment summary
CREATE OR REPLACE FUNCTION get_asset_assignment_summary(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_assets', (SELECT COUNT(*) FROM public.assets WHERE company_id = p_company_id),
    'available', (SELECT COUNT(*) FROM public.assets WHERE company_id = p_company_id AND status = 'available'),
    'assigned', (SELECT COUNT(*) FROM public.assets WHERE company_id = p_company_id AND status = 'assigned'),
    'in_maintenance', (SELECT COUNT(*) FROM public.assets WHERE company_id = p_company_id AND status = 'maintenance'),
    'lost', (SELECT COUNT(*) FROM public.assets WHERE company_id = p_company_id AND status = 'lost'),
    'damaged_open_reports', (
      SELECT COUNT(DISTINCT asset_id) 
      FROM public.asset_damage_reports adr
      JOIN public.assets a ON a.id = adr.asset_id
      WHERE a.company_id = p_company_id AND adr.resolved = false
    ),
    'overdue_maintenance', (
      SELECT COUNT(DISTINCT am.asset_id)
      FROM public.asset_maintenance am
      JOIN public.assets a ON a.id = am.asset_id
      WHERE a.company_id = p_company_id AND am.next_due < CURRENT_DATE
    )
  ) INTO result;
  
  RETURN result;
END;
$$;

-- ============================================================================
-- PART 8 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_damage_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_maintenance ENABLE ROW LEVEL SECURITY;

-- Helper function to check company access
CREATE OR REPLACE FUNCTION has_asset_company_access(check_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.roofing_company_members
    WHERE roofing_company_id = check_company_id 
      AND user_id = auth.uid() 
      AND is_active = true
  );
$$;

-- RLS Policies for assets
CREATE POLICY "Users can view assets in their companies"
  ON public.assets FOR SELECT
  USING (has_asset_company_access(company_id));

CREATE POLICY "Company members can create assets"
  ON public.assets FOR INSERT
  WITH CHECK (has_asset_company_access(company_id));

CREATE POLICY "Company members can update assets"
  ON public.assets FOR UPDATE
  USING (has_asset_company_access(company_id))
  WITH CHECK (has_asset_company_access(company_id));

CREATE POLICY "Company admins can delete assets"
  ON public.assets FOR DELETE
  USING (
    has_asset_company_access(company_id) AND
    EXISTS (
      SELECT 1 FROM public.roofing_company_members
      WHERE roofing_company_id = assets.company_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin')
        AND is_active = true
    )
  );

-- RLS Policies for asset_assignments
CREATE POLICY "Users can view assignments in their companies"
  ON public.asset_assignments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.assets a
      WHERE a.id = asset_assignments.asset_id
        AND has_asset_company_access(a.company_id)
    )
  );

CREATE POLICY "Company members can create assignments"
  ON public.asset_assignments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assets a
      WHERE a.id = asset_assignments.asset_id
        AND has_asset_company_access(a.company_id)
    )
  );

CREATE POLICY "Company members can update assignments"
  ON public.asset_assignments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.assets a
      WHERE a.id = asset_assignments.asset_id
        AND has_asset_company_access(a.company_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assets a
      WHERE a.id = asset_assignments.asset_id
        AND has_asset_company_access(a.company_id)
    )
  );

-- RLS Policies for asset_damage_reports
CREATE POLICY "Users can view damage reports in their companies"
  ON public.asset_damage_reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.assets a
      WHERE a.id = asset_damage_reports.asset_id
        AND has_asset_company_access(a.company_id)
    )
  );

CREATE POLICY "Company members can create damage reports"
  ON public.asset_damage_reports FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assets a
      WHERE a.id = asset_damage_reports.asset_id
        AND has_asset_company_access(a.company_id)
    )
  );

CREATE POLICY "Company members can update damage reports"
  ON public.asset_damage_reports FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.assets a
      WHERE a.id = asset_damage_reports.asset_id
        AND has_asset_company_access(a.company_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assets a
      WHERE a.id = asset_damage_reports.asset_id
        AND has_asset_company_access(a.company_id)
    )
  );

-- RLS Policies for asset_maintenance
CREATE POLICY "Users can view maintenance in their companies"
  ON public.asset_maintenance FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.assets a
      WHERE a.id = asset_maintenance.asset_id
        AND has_asset_company_access(a.company_id)
    )
  );

CREATE POLICY "Company members can manage maintenance"
  ON public.asset_maintenance FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.assets a
      WHERE a.id = asset_maintenance.asset_id
        AND has_asset_company_access(a.company_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assets a
      WHERE a.id = asset_maintenance.asset_id
        AND has_asset_company_access(a.company_id)
    )
  );

-- Grant permissions
GRANT SELECT ON public.asset_history TO authenticated;
GRANT EXECUTE ON FUNCTION get_assets_due_for_maintenance(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION get_lost_assets(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_asset_assignment_summary(uuid) TO authenticated;

-- ============================================================================
-- PART 9 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.assets IS 'Master equipment registry - all tools, ladders, vehicles, etc. (Block 252400)';
COMMENT ON TABLE public.asset_assignments IS 'Equipment assignment log - who has what and when (Block 252400)';
COMMENT ON TABLE public.asset_damage_reports IS 'Damage reports for equipment with photos and severity (Block 252400)';
COMMENT ON TABLE public.asset_maintenance IS 'Maintenance schedule with intervals and due dates (Block 252400)';
COMMENT ON VIEW public.asset_history IS 'Equipment usage history - who used what and when (Block 252400)';
























