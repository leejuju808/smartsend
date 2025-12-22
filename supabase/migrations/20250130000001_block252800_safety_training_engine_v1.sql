-- =========================================================
-- Block 252800 — SmartSend Safety Training Engine v1
-- "Mandatory Training, Video Modules, Digital Sign-Off, OSHA Tracking, Crew Compliance Score"
-- =========================================================
-- 
-- This block is CRITICAL for roofing companies. Safety failure = lawsuits, fines, 
-- injuries, shutdowns, worker's comp spikes, and lost jobs.
-- 
-- Roofers will say:
-- "SmartSend finally got our crews compliant.
-- We used to guess who was trained — now we KNOW."
-- 
-- If a roofing CRM does NOT help with safety, it is a toy.
-- SmartSend becomes a serious operational platform with this block.
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE safety_training_modules TABLE
-- ============================================================================
-- Training Module Library (video, PDF, quiz)
-- This extends/enhances the existing workforce_training_modules with safety-specific fields

CREATE TABLE IF NOT EXISTS public.safety_training_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  content_url text NOT NULL,          -- video or PDF link
  module_type text NOT NULL CHECK (module_type IN (
    'fall_protection', 
    'ladder_safety', 
    'ppe', 
    'heat_illness_prevention', 
    'electrical_awareness', 
    'osha_jobsite_hazard', 
    'hazard_recognition',
    'daily_safety_briefing',
    'other'
  )),
  required_for_roles text[] DEFAULT '{}', -- ["installer", "foreman"] or empty for all
  expires_after_days int DEFAULT 365,    -- Training expires after N days
  estimated_duration_minutes integer,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_safety_training_modules_company ON public.safety_training_modules(company_id);
CREATE INDEX IF NOT EXISTS idx_safety_training_modules_type ON public.safety_training_modules(company_id, module_type);
CREATE INDEX IF NOT EXISTS idx_safety_training_modules_roles ON public.safety_training_modules USING GIN(required_for_roles);

COMMENT ON TABLE public.safety_training_modules IS 'Safety training module library (Block 252800)';
COMMENT ON COLUMN public.safety_training_modules.module_type IS 'Type: fall_protection, ladder_safety, ppe, heat_illness_prevention, electrical_awareness, osha_jobsite_hazard, hazard_recognition, daily_safety_briefing, other';
COMMENT ON COLUMN public.safety_training_modules.required_for_roles IS 'Array of roles that must complete this training: ["installer", "foreman"] or empty for all roles';
COMMENT ON COLUMN public.safety_training_modules.expires_after_days IS 'Training expires after N days (default 365 for annual renewals)';

-- ============================================================================
-- PART 2 — CREATE safety_training_assignments TABLE
-- ============================================================================
-- Crew Training Assignments (by role or project)

CREATE TABLE IF NOT EXISTS public.safety_training_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES public.safety_training_modules(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.workforce_employees(id) ON DELETE CASCADE,
  assigned_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  expires_at timestamptz,              -- Calculated: assigned_at + expires_after_days
  status text DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'completed', 'expired', 'reassigned')),
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- Who assigned it
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(employee_id, module_id, status) -- Allow one active assignment per employee/module
);

CREATE INDEX IF NOT EXISTS idx_safety_training_assignments_module ON public.safety_training_assignments(module_id);
CREATE INDEX IF NOT EXISTS idx_safety_training_assignments_employee ON public.safety_training_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_safety_training_assignments_status ON public.safety_training_assignments(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_safety_training_assignments_expires ON public.safety_training_assignments(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_safety_training_assignments_company ON public.safety_training_assignments(employee_id) 
  INCLUDE (module_id, status, expires_at);

COMMENT ON TABLE public.safety_training_assignments IS 'Training assignments for employees (Block 252800)';
COMMENT ON COLUMN public.safety_training_assignments.status IS 'Status: assigned, in_progress, completed, expired, reassigned';
COMMENT ON COLUMN public.safety_training_assignments.expires_at IS 'Training expires at this timestamp (calculated from assigned_at + module expires_after_days)';

-- ============================================================================
-- PART 3 — CREATE safety_training_signoff TABLE
-- ============================================================================
-- Digital Sign-Off (crew acknowledges training)

CREATE TABLE IF NOT EXISTS public.safety_training_signoff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.safety_training_assignments(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.workforce_employees(id) ON DELETE CASCADE,
  signature_url text,                  -- URL to signature image/file
  signature_data text,                  -- Base64 signature data
  signed_name text NOT NULL,            -- Name as signed
  gps_latitude numeric(10, 8),          -- GPS location when signed
  gps_longitude numeric(11, 8),
  ip_address text,                     -- IP address for audit
  user_agent text,                     -- Browser/device info
  signed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_safety_training_signoff_assignment ON public.safety_training_signoff(assignment_id);
CREATE INDEX IF NOT EXISTS idx_safety_training_signoff_employee ON public.safety_training_signoff(employee_id);
CREATE INDEX IF NOT EXISTS idx_safety_training_signoff_signed_at ON public.safety_training_signoff(employee_id, signed_at DESC);

COMMENT ON TABLE public.safety_training_signoff IS 'Digital sign-off records for training completion (Block 252800)';
COMMENT ON COLUMN public.safety_training_signoff.signature_data IS 'Base64-encoded signature data for legal protection';

-- ============================================================================
-- PART 4 — ENHANCE safety_incidents TABLE (if exists, add job_id)
-- ============================================================================
-- Safety Violations Tracking + Corrective Actions
-- Note: safety_incidents table already exists from Block 251400, we'll enhance it

DO $$
BEGIN
  -- Add job_id if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'safety_incidents' 
    AND column_name = 'job_id'
  ) THEN
    ALTER TABLE public.safety_incidents
      ADD COLUMN job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL;
    
    CREATE INDEX IF NOT EXISTS idx_safety_incidents_job ON public.safety_incidents(job_id) WHERE job_id IS NOT NULL;
  END IF;

  -- Add corrective_action if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'safety_incidents' 
    AND column_name = 'corrective_action'
  ) THEN
    ALTER TABLE public.safety_incidents
      ADD COLUMN corrective_action text;
  END IF;

  -- Add resolved fields if they don't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'safety_incidents' 
    AND column_name = 'resolved'
  ) THEN
    ALTER TABLE public.safety_incidents
      ADD COLUMN resolved boolean DEFAULT false,
      ADD COLUMN resolved_at timestamptz;
    
    CREATE INDEX IF NOT EXISTS idx_safety_incidents_resolved ON public.safety_incidents(company_id, resolved) WHERE resolved = false;
  END IF;

  -- Update incident_type enum if needed (add more types)
  -- Note: We'll handle this via ALTER TYPE if needed, but for now we'll keep existing types
END $$;

-- ============================================================================
-- PART 5 — CREATE safety_scores TABLE
-- ============================================================================
-- Safety Score (per employee)

CREATE TABLE IF NOT EXISTS public.safety_scores (
  employee_id uuid PRIMARY KEY REFERENCES public.workforce_employees(id) ON DELETE CASCADE,
  score int DEFAULT 100 CHECK (score >= 0 AND score <= 100),  -- Dynamic safety score (0-100)
  last_updated_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  score_breakdown jsonb DEFAULT '{}'::jsonb,  -- Detailed breakdown: {violations: -10, training: +5, etc}
  notes text
);

CREATE INDEX IF NOT EXISTS idx_safety_scores_score ON public.safety_scores(score);
CREATE INDEX IF NOT EXISTS idx_safety_scores_updated_at ON public.safety_scores(last_updated_at DESC);

COMMENT ON TABLE public.safety_scores IS 'Safety score per employee (Block 252800)';
COMMENT ON COLUMN public.safety_scores.score IS 'Safety score 0-100. 90-100 = Elite, 80-89 = Safe, 70-79 = Caution, <70 = At Risk';
COMMENT ON COLUMN public.safety_scores.score_breakdown IS 'JSON breakdown of score components';

-- ============================================================================
-- PART 6 — CREATE crew_safety_scores TABLE (optional, for crew-level scores)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.crew_safety_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id uuid REFERENCES public.crews(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  score int DEFAULT 100 CHECK (score >= 0 AND score <= 100),
  calculated_at timestamptz DEFAULT now(),
  score_breakdown jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crew_safety_scores_crew ON public.crew_safety_scores(crew_id);
CREATE INDEX IF NOT EXISTS idx_crew_safety_scores_job ON public.crew_safety_scores(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crew_safety_scores_calculated ON public.crew_safety_scores(calculated_at DESC);

COMMENT ON TABLE public.crew_safety_scores IS 'Crew-level safety scores (Block 252800)';

-- ============================================================================
-- PART 7 — UPDATED_AT TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_safety_training_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_safety_training_modules_updated_at ON public.safety_training_modules;
CREATE TRIGGER trg_safety_training_modules_updated_at
BEFORE UPDATE ON public.safety_training_modules
FOR EACH ROW EXECUTE FUNCTION public.set_safety_training_updated_at();

DROP TRIGGER IF EXISTS trg_safety_training_assignments_updated_at ON public.safety_training_assignments;
CREATE TRIGGER trg_safety_training_assignments_updated_at
BEFORE UPDATE ON public.safety_training_assignments
FOR EACH ROW EXECUTE FUNCTION public.set_safety_training_updated_at();

DROP TRIGGER IF EXISTS trg_safety_scores_updated_at ON public.safety_scores;
CREATE TRIGGER trg_safety_scores_updated_at
BEFORE UPDATE ON public.safety_scores
FOR EACH ROW EXECUTE FUNCTION public.set_safety_training_updated_at();

-- ============================================================================
-- PART 8 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.safety_training_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_training_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_training_signoff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_safety_scores ENABLE ROW LEVEL SECURITY;

-- RLS Policies for safety_training_modules
DROP POLICY IF EXISTS "safety_training_modules_select" ON public.safety_training_modules;
CREATE POLICY "safety_training_modules_select" ON public.safety_training_modules
  FOR SELECT USING (can_access_roofing_company(company_id));

DROP POLICY IF EXISTS "safety_training_modules_insert" ON public.safety_training_modules;
CREATE POLICY "safety_training_modules_insert" ON public.safety_training_modules
  FOR INSERT WITH CHECK (can_access_roofing_company(company_id));

DROP POLICY IF EXISTS "safety_training_modules_update" ON public.safety_training_modules;
CREATE POLICY "safety_training_modules_update" ON public.safety_training_modules
  FOR UPDATE USING (can_access_roofing_company(company_id))
  WITH CHECK (can_access_roofing_company(company_id));

DROP POLICY IF EXISTS "safety_training_modules_delete" ON public.safety_training_modules;
CREATE POLICY "safety_training_modules_delete" ON public.safety_training_modules
  FOR DELETE USING (can_access_roofing_company(company_id));

-- RLS Policies for safety_training_assignments
DROP POLICY IF EXISTS "safety_training_assignments_select" ON public.safety_training_assignments;
CREATE POLICY "safety_training_assignments_select" ON public.safety_training_assignments
  FOR SELECT USING (
    EXISTS(
      SELECT 1 FROM public.workforce_employees we
      WHERE we.id = safety_training_assignments.employee_id
      AND can_access_roofing_company(we.company_id)
    )
  );

DROP POLICY IF EXISTS "safety_training_assignments_insert" ON public.safety_training_assignments;
CREATE POLICY "safety_training_assignments_insert" ON public.safety_training_assignments
  FOR INSERT WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.workforce_employees we
      WHERE we.id = safety_training_assignments.employee_id
      AND can_access_roofing_company(we.company_id)
    )
  );

DROP POLICY IF EXISTS "safety_training_assignments_update" ON public.safety_training_assignments;
CREATE POLICY "safety_training_assignments_update" ON public.safety_training_assignments
  FOR UPDATE USING (
    EXISTS(
      SELECT 1 FROM public.workforce_employees we
      WHERE we.id = safety_training_assignments.employee_id
      AND can_access_roofing_company(we.company_id)
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.workforce_employees we
      WHERE we.id = safety_training_assignments.employee_id
      AND can_access_roofing_company(we.company_id)
    )
  );

DROP POLICY IF EXISTS "safety_training_assignments_delete" ON public.safety_training_assignments;
CREATE POLICY "safety_training_assignments_delete" ON public.safety_training_assignments
  FOR DELETE USING (
    EXISTS(
      SELECT 1 FROM public.workforce_employees we
      WHERE we.id = safety_training_assignments.employee_id
      AND can_access_roofing_company(we.company_id)
    )
  );

-- RLS Policies for safety_training_signoff
DROP POLICY IF EXISTS "safety_training_signoff_select" ON public.safety_training_signoff;
CREATE POLICY "safety_training_signoff_select" ON public.safety_training_signoff
  FOR SELECT USING (
    EXISTS(
      SELECT 1 FROM public.workforce_employees we
      WHERE we.id = safety_training_signoff.employee_id
      AND can_access_roofing_company(we.company_id)
    )
  );

DROP POLICY IF EXISTS "safety_training_signoff_insert" ON public.safety_training_signoff;
CREATE POLICY "safety_training_signoff_insert" ON public.safety_training_signoff
  FOR INSERT WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.workforce_employees we
      WHERE we.id = safety_training_signoff.employee_id
      AND can_access_roofing_company(we.company_id)
    )
  );

-- RLS Policies for safety_scores
DROP POLICY IF EXISTS "safety_scores_select" ON public.safety_scores;
CREATE POLICY "safety_scores_select" ON public.safety_scores
  FOR SELECT USING (
    EXISTS(
      SELECT 1 FROM public.workforce_employees we
      WHERE we.id = safety_scores.employee_id
      AND can_access_roofing_company(we.company_id)
    )
  );

DROP POLICY IF EXISTS "safety_scores_insert" ON public.safety_scores;
CREATE POLICY "safety_scores_insert" ON public.safety_scores
  FOR INSERT WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.workforce_employees we
      WHERE we.id = safety_scores.employee_id
      AND can_access_roofing_company(we.company_id)
    )
  );

DROP POLICY IF EXISTS "safety_scores_update" ON public.safety_scores;
CREATE POLICY "safety_scores_update" ON public.safety_scores
  FOR UPDATE USING (
    EXISTS(
      SELECT 1 FROM public.workforce_employees we
      WHERE we.id = safety_scores.employee_id
      AND can_access_roofing_company(we.company_id)
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.workforce_employees we
      WHERE we.id = safety_scores.employee_id
      AND can_access_roofing_company(we.company_id)
    )
  );

-- RLS Policies for crew_safety_scores
DROP POLICY IF EXISTS "crew_safety_scores_select" ON public.crew_safety_scores;
CREATE POLICY "crew_safety_scores_select" ON public.crew_safety_scores
  FOR SELECT USING (
    EXISTS(
      SELECT 1 FROM public.crews c
      JOIN public.roofing_companies rc ON rc.id = c.company_id
      WHERE c.id = crew_safety_scores.crew_id
      AND can_access_roofing_company(rc.id)
    )
  );

DROP POLICY IF EXISTS "crew_safety_scores_insert" ON public.crew_safety_scores;
CREATE POLICY "crew_safety_scores_insert" ON public.crew_safety_scores
  FOR INSERT WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.crews c
      JOIN public.roofing_companies rc ON rc.id = c.company_id
      WHERE c.id = crew_safety_scores.crew_id
      AND can_access_roofing_company(rc.id)
    )
  );

-- ============================================================================
-- PART 9 — HELPER FUNCTIONS
-- ============================================================================

-- Function to auto-assign training modules to new hires based on role
CREATE OR REPLACE FUNCTION public.auto_assign_safety_training_for_role(
  _employee_id uuid,
  _role text
)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  _module_record record;
  _expires_days int;
BEGIN
  -- Find all modules required for this role (or required for all)
  FOR _module_record IN
    SELECT id, expires_after_days
    FROM public.safety_training_modules
    WHERE company_id = (SELECT company_id FROM public.workforce_employees WHERE id = _employee_id)
      AND (
        required_for_roles = '{}'::text[]  -- Required for all
        OR _role = ANY(required_for_roles)  -- Required for this specific role
      )
  LOOP
    -- Insert assignment if it doesn't exist
    INSERT INTO public.safety_training_assignments (
      module_id,
      employee_id,
      assigned_at,
      expires_at,
      status
    )
    SELECT
      _module_record.id,
      _employee_id,
      now(),
      now() + (_module_record.expires_after_days || ' days')::interval,
      'assigned'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.safety_training_assignments
      WHERE employee_id = _employee_id
        AND module_id = _module_record.id
        AND status IN ('assigned', 'in_progress', 'completed')
    )
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.auto_assign_safety_training_for_role IS 'Auto-assign safety training modules to employee based on role (Block 252800)';

-- Function to check and expire training assignments
CREATE OR REPLACE FUNCTION public.check_expired_training_assignments()
RETURNS TABLE (
  assignment_id uuid,
  employee_id uuid,
  employee_name text,
  module_title text,
  expired_at timestamptz
) LANGUAGE plpgsql AS $$
BEGIN
  -- Mark expired assignments
  UPDATE public.safety_training_assignments
  SET status = 'expired',
      updated_at = now()
  WHERE status IN ('assigned', 'in_progress')
    AND expires_at IS NOT NULL
    AND expires_at < now()
  RETURNING
    id,
    employee_id,
    (SELECT first_name || ' ' || last_name FROM public.workforce_employees WHERE id = safety_training_assignments.employee_id),
    (SELECT title FROM public.safety_training_modules WHERE id = safety_training_assignments.module_id),
    expires_at;
END;
$$;

COMMENT ON FUNCTION public.check_expired_training_assignments IS 'Check and mark expired training assignments (Block 252800)';

-- Function to calculate safety score for an employee
CREATE OR REPLACE FUNCTION public.calculate_employee_safety_score(
  _employee_id uuid
)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  _base_score int := 100;
  _violation_deduction int := 0;
  _training_bonus int := 0;
  _incident_deduction int := 0;
  _final_score int;
  _breakdown jsonb := '{}'::jsonb;
BEGIN
  -- Deduct for violations (from safety_incidents)
  SELECT COALESCE(SUM(
    CASE severity
      WHEN 'low' THEN 5
      WHEN 'medium' THEN 10
      WHEN 'high' THEN 20
      WHEN 'critical' THEN 40
      ELSE 0
    END
  ), 0) INTO _violation_deduction
  FROM public.safety_incidents
  WHERE employee_id = _employee_id
    AND date >= CURRENT_DATE - INTERVAL '90 days'  -- Last 90 days
    AND resolved = false;

  -- Bonus for completing training early (within first 7 days)
  SELECT COALESCE(COUNT(*) * 2, 0) INTO _training_bonus
  FROM public.safety_training_assignments
  WHERE employee_id = _employee_id
    AND status = 'completed'
    AND completed_at IS NOT NULL
    AND completed_at <= assigned_at + INTERVAL '7 days';

  -- Deduct for incidents causing injury
  SELECT COALESCE(SUM(
    CASE severity
      WHEN 'high' THEN 20
      WHEN 'critical' THEN 40
      ELSE 0
    END
  ), 0) INTO _incident_deduction
  FROM public.safety_incidents
  WHERE employee_id = _employee_id
    AND incident_type = 'injury'
    AND date >= CURRENT_DATE - INTERVAL '90 days';

  -- Calculate final score (clamp between 0 and 100)
  _final_score := GREATEST(0, LEAST(100, _base_score - _violation_deduction - _incident_deduction + _training_bonus));

  -- Build breakdown
  _breakdown := jsonb_build_object(
    'base_score', _base_score,
    'violation_deduction', -_violation_deduction,
    'incident_deduction', -_incident_deduction,
    'training_bonus', _training_bonus,
    'final_score', _final_score
  );

  -- Upsert safety score
  INSERT INTO public.safety_scores (employee_id, score, score_breakdown, last_updated_at, updated_at)
  VALUES (_employee_id, _final_score, _breakdown, now(), now())
  ON CONFLICT (employee_id)
  DO UPDATE SET
    score = _final_score,
    score_breakdown = _breakdown,
    last_updated_at = now(),
    updated_at = now();

  RETURN _final_score;
END;
$$;

COMMENT ON FUNCTION public.calculate_employee_safety_score IS 'Calculate safety score for employee: base 100, deduct for violations/incidents, add for early training completion (Block 252800)';

-- Function to get OSHA compliance dashboard data
CREATE OR REPLACE FUNCTION public.get_osha_compliance_dashboard(
  _company_id uuid
)
RETURNS TABLE (
  employee_id uuid,
  employee_name text,
  role text,
  fall_protection_status text,
  fall_protection_expires_at timestamptz,
  ladder_safety_status text,
  ladder_safety_expires_at timestamptz,
  ppe_status text,
  ppe_expires_at timestamptz,
  heat_safety_status text,
  heat_safety_expires_at timestamptz,
  completion_percentage numeric,
  safety_score int
) LANGUAGE sql STABLE AS $$
  SELECT
    we.id as employee_id,
    we.first_name || ' ' || we.last_name as employee_name,
    we.role,
    -- Fall Protection
    COALESCE(sta_fp.status::text, 'not_assigned') as fall_protection_status,
    sta_fp.expires_at as fall_protection_expires_at,
    -- Ladder Safety
    COALESCE(sta_ls.status::text, 'not_assigned') as ladder_safety_status,
    sta_ls.expires_at as ladder_safety_expires_at,
    -- PPE
    COALESCE(sta_ppe.status::text, 'not_assigned') as ppe_status,
    sta_ppe.expires_at as ppe_expires_at,
    -- Heat Safety
    COALESCE(sta_heat.status::text, 'not_assigned') as heat_safety_status,
    sta_heat.expires_at as heat_safety_expires_at,
    -- Completion percentage
    ROUND(
      100.0 * COUNT(DISTINCT sta_all.id) FILTER (WHERE sta_all.status = 'completed') /
      NULLIF(COUNT(DISTINCT sta_all.id), 0),
      2
    ) as completion_percentage,
    -- Safety score
    COALESCE(ss.score, 100) as safety_score
  FROM public.workforce_employees we
  LEFT JOIN public.safety_training_assignments sta_fp ON sta_fp.employee_id = we.id
    AND sta_fp.module_id IN (SELECT id FROM public.safety_training_modules WHERE module_type = 'fall_protection' AND company_id = _company_id)
    AND sta_fp.status IN ('assigned', 'in_progress', 'completed')
  LEFT JOIN public.safety_training_assignments sta_ls ON sta_ls.employee_id = we.id
    AND sta_ls.module_id IN (SELECT id FROM public.safety_training_modules WHERE module_type = 'ladder_safety' AND company_id = _company_id)
    AND sta_ls.status IN ('assigned', 'in_progress', 'completed')
  LEFT JOIN public.safety_training_assignments sta_ppe ON sta_ppe.employee_id = we.id
    AND sta_ppe.module_id IN (SELECT id FROM public.safety_training_modules WHERE module_type = 'ppe' AND company_id = _company_id)
    AND sta_ppe.status IN ('assigned', 'in_progress', 'completed')
  LEFT JOIN public.safety_training_assignments sta_heat ON sta_heat.employee_id = we.id
    AND sta_heat.module_id IN (SELECT id FROM public.safety_training_modules WHERE module_type = 'heat_illness_prevention' AND company_id = _company_id)
    AND sta_heat.status IN ('assigned', 'in_progress', 'completed')
  LEFT JOIN public.safety_training_assignments sta_all ON sta_all.employee_id = we.id
    AND sta_all.module_id IN (SELECT id FROM public.safety_training_modules WHERE company_id = _company_id)
  LEFT JOIN public.safety_scores ss ON ss.employee_id = we.id
  WHERE we.company_id = _company_id
    AND we.status = 'active'
  GROUP BY we.id, we.first_name, we.last_name, we.role, sta_fp.status, sta_fp.expires_at,
           sta_ls.status, sta_ls.expires_at, sta_ppe.status, sta_ppe.expires_at,
           sta_heat.status, sta_heat.expires_at, ss.score
  ORDER BY we.last_name, we.first_name;
$$;

COMMENT ON FUNCTION public.get_osha_compliance_dashboard IS 'Get OSHA compliance dashboard data for all employees (Block 252800)';

-- ============================================================================
-- PART 10 — TRIGGERS FOR AUTO-ASSIGNMENT
-- ============================================================================

-- Trigger to auto-assign training when employee is created or role changes
CREATE OR REPLACE FUNCTION public.trigger_auto_assign_safety_training()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Auto-assign training modules based on role
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.role IS DISTINCT FROM NEW.role) THEN
    PERFORM public.auto_assign_safety_training_for_role(NEW.id, NEW.role);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_assign_safety_training ON public.workforce_employees;
CREATE TRIGGER trg_auto_assign_safety_training
AFTER INSERT OR UPDATE OF role ON public.workforce_employees
FOR EACH ROW
WHEN (NEW.status = 'active')
EXECUTE FUNCTION public.trigger_auto_assign_safety_training();

COMMENT ON FUNCTION public.trigger_auto_assign_safety_training IS 'Auto-assign safety training when employee is created or role changes (Block 252800)';

-- ============================================================================
-- PART 11 — DEFAULT TRAINING MODULES (Seed data function)
-- ============================================================================

-- Function to create default training modules for a company
CREATE OR REPLACE FUNCTION public.create_default_safety_training_modules(
  _company_id uuid
)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- Fall Protection Basics (required for all)
  INSERT INTO public.safety_training_modules (
    company_id, title, description, content_url, module_type, required_for_roles, expires_after_days
  ) VALUES (
    _company_id,
    'Fall Protection Basics',
    'Essential fall protection training for all roofing workers',
    'https://example.com/training/fall-protection-basics',  -- Replace with actual content
    'fall_protection',
    '{}'::text[],  -- Required for all
    365
  ) ON CONFLICT DO NOTHING;

  -- Ladder Safety 101 (required for all)
  INSERT INTO public.safety_training_modules (
    company_id, title, description, content_url, module_type, required_for_roles, expires_after_days
  ) VALUES (
    _company_id,
    'Ladder Safety 101',
    'Proper ladder setup, use, and safety protocols',
    'https://example.com/training/ladder-safety-101',
    'ladder_safety',
    '{}'::text[],
    365
  ) ON CONFLICT DO NOTHING;

  -- PPE Use (required for all)
  INSERT INTO public.safety_training_modules (
    company_id, title, description, content_url, module_type, required_for_roles, expires_after_days
  ) VALUES (
    _company_id,
    'PPE Use',
    'Personal Protective Equipment requirements and proper use',
    'https://example.com/training/ppe-use',
    'ppe',
    '{}'::text[],
    365
  ) ON CONFLICT DO NOTHING;

  -- Heat Illness Prevention (required for all)
  INSERT INTO public.safety_training_modules (
    company_id, title, description, content_url, module_type, required_for_roles, expires_after_days
  ) VALUES (
    _company_id,
    'Heat Illness Prevention',
    'Recognizing and preventing heat-related illnesses on the jobsite',
    'https://example.com/training/heat-illness-prevention',
    'heat_illness_prevention',
    '{}'::text[],
    365
  ) ON CONFLICT DO NOTHING;

  -- Electrical Awareness (required for all)
  INSERT INTO public.safety_training_modules (
    company_id, title, description, content_url, module_type, required_for_roles, expires_after_days
  ) VALUES (
    _company_id,
    'Electrical Awareness',
    'Electrical hazards and safety protocols for roofing work',
    'https://example.com/training/electrical-awareness',
    'electrical_awareness',
    '{}'::text[],
    365
  ) ON CONFLICT DO NOTHING;

  -- OSHA Jobsite Hazard Training (required for all)
  INSERT INTO public.safety_training_modules (
    company_id, title, description, content_url, module_type, required_for_roles, expires_after_days
  ) VALUES (
    _company_id,
    'OSHA Jobsite Hazard Training',
    'Identifying and mitigating common jobsite hazards',
    'https://example.com/training/osha-jobsite-hazard',
    'osha_jobsite_hazard',
    '{}'::text[],
    365
  ) ON CONFLICT DO NOTHING;

  -- Hazard Recognition (required for foremen)
  INSERT INTO public.safety_training_modules (
    company_id, title, description, content_url, module_type, required_for_roles, expires_after_days
  ) VALUES (
    _company_id,
    'Hazard Recognition',
    'Advanced hazard recognition and mitigation for foremen',
    'https://example.com/training/hazard-recognition',
    'hazard_recognition',
    ARRAY['foreman']::text[],
    365
  ) ON CONFLICT DO NOTHING;

  -- Daily Safety Briefing Training (required for foremen)
  INSERT INTO public.safety_training_modules (
    company_id, title, description, content_url, module_type, required_for_roles, expires_after_days
  ) VALUES (
    _company_id,
    'Daily Safety Briefing Training',
    'How to conduct effective daily safety briefings',
    'https://example.com/training/daily-safety-briefing',
    'daily_safety_briefing',
    ARRAY['foreman']::text[],
    365
  ) ON CONFLICT DO NOTHING;
END;
$$;

COMMENT ON FUNCTION public.create_default_safety_training_modules IS 'Create default safety training modules for a company (Block 252800)';
























