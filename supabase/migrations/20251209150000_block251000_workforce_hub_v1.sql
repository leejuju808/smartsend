-- =========================================================
-- Block 251000 — SmartSend Workforce Hub v1
-- "Hiring, Training, Certification, Performance Tracking"
-- =========================================================
-- 
-- This block turns SmartSend into the brain of their workforce.
-- Roofing owners will straight up say:
-- "We used to guess who's good… now SmartSend shows us.
-- Our crews run tight. Other companies look sloppy."
-- 
-- This is the block that makes every roofing company feel 
-- embarrassingly outdated without SmartSend.
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE workforce_employees TABLE
-- ============================================================================
-- Tracks every worker in the company

CREATE TABLE IF NOT EXISTS public.workforce_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  phone text,
  email text,
  role text CHECK (role IN ('laborer', 'installer', 'foreman', 'project_manager', 'estimator', 'sales', 'office', 'other')),
  skill_level text CHECK (skill_level IN ('apprentice', 'mid', 'senior', 'expert')) DEFAULT 'mid',
  status text CHECK (status IN ('active', 'terminated', 'seasonal', 'on_leave')) DEFAULT 'active',
  hire_date date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workforce_employees_company ON public.workforce_employees(company_id);
CREATE INDEX IF NOT EXISTS idx_workforce_employees_status ON public.workforce_employees(company_id, status);
CREATE INDEX IF NOT EXISTS idx_workforce_employees_role ON public.workforce_employees(company_id, role);
CREATE INDEX IF NOT EXISTS idx_workforce_employees_email ON public.workforce_employees(email) WHERE email IS NOT NULL;

COMMENT ON TABLE public.workforce_employees IS 'Tracks every worker in the roofing company (Block 251000)';
COMMENT ON COLUMN public.workforce_employees.role IS 'Job role: laborer, installer, foreman, project_manager, estimator, sales, office, other';
COMMENT ON COLUMN public.workforce_employees.skill_level IS 'Skill level: apprentice, mid, senior, expert';

-- ============================================================================
-- PART 2 — CREATE workforce_applicants TABLE
-- ============================================================================
-- People applying for jobs

CREATE TABLE IF NOT EXISTS public.workforce_applicants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  phone text,
  email text,
  position_applied text NOT NULL,
  resume_url text,
  status text CHECK (status IN ('new', 'review', 'interview', 'hired', 'rejected', 'withdrawn')) DEFAULT 'new',
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workforce_applicants_company ON public.workforce_applicants(company_id);
CREATE INDEX IF NOT EXISTS idx_workforce_applicants_status ON public.workforce_applicants(company_id, status);
CREATE INDEX IF NOT EXISTS idx_workforce_applicants_email ON public.workforce_applicants(email) WHERE email IS NOT NULL;

COMMENT ON TABLE public.workforce_applicants IS 'People applying for jobs at the roofing company (Block 251000)';
COMMENT ON COLUMN public.workforce_applicants.status IS 'Application status: new, review, interview, hired, rejected, withdrawn';

-- ============================================================================
-- PART 3 — CREATE workforce_training_modules TABLE
-- ============================================================================
-- Defines the training videos / documents

CREATE TABLE IF NOT EXISTS public.workforce_training_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  content_url text NOT NULL, -- video / pdf / slides URL
  content_type text CHECK (content_type IN ('video', 'pdf', 'slides', 'document', 'link')) DEFAULT 'video',
  required_for_role text, -- installer, foreman, everyone, null = optional
  estimated_duration_minutes integer,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workforce_training_modules_company ON public.workforce_training_modules(company_id);
CREATE INDEX IF NOT EXISTS idx_workforce_training_modules_role ON public.workforce_training_modules(company_id, required_for_role) WHERE required_for_role IS NOT NULL;

COMMENT ON TABLE public.workforce_training_modules IS 'Training videos / documents for workforce (Block 251000)';
COMMENT ON COLUMN public.workforce_training_modules.required_for_role IS 'Role that must complete this: installer, foreman, everyone, or null for optional';

-- ============================================================================
-- PART 4 — CREATE workforce_training_progress TABLE
-- ============================================================================
-- Tracks employee progress through training

CREATE TABLE IF NOT EXISTS public.workforce_training_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.workforce_employees(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.workforce_training_modules(id) ON DELETE CASCADE,
  status text CHECK (status IN ('not_started', 'in_progress', 'completed', 'failed')) DEFAULT 'not_started',
  started_at timestamptz,
  completed_at timestamptz,
  score numeric, -- If module has a quiz/test
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(employee_id, module_id)
);

CREATE INDEX IF NOT EXISTS idx_workforce_training_progress_employee ON public.workforce_training_progress(employee_id);
CREATE INDEX IF NOT EXISTS idx_workforce_training_progress_module ON public.workforce_training_progress(module_id);
CREATE INDEX IF NOT EXISTS idx_workforce_training_progress_status ON public.workforce_training_progress(employee_id, status);

COMMENT ON TABLE public.workforce_training_progress IS 'Tracks employee progress through training modules (Block 251000)';

-- ============================================================================
-- PART 5 — CREATE workforce_certifications TABLE
-- ============================================================================
-- For OSHA, insurance, fall-protection, manufacturer certs

CREATE TABLE IF NOT EXISTS public.workforce_certifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.workforce_employees(id) ON DELETE CASCADE,
  cert_name text NOT NULL,
  cert_type text CHECK (cert_type IN ('osha', 'insurance', 'fall_protection', 'manufacturer', 'state_license', 'other')) DEFAULT 'other',
  issue_date date NOT NULL,
  expiry_date date,
  cert_file_url text, -- URL to uploaded certificate file
  issuing_organization text,
  cert_number text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workforce_certifications_employee ON public.workforce_certifications(employee_id);
CREATE INDEX IF NOT EXISTS idx_workforce_certifications_expiry ON public.workforce_certifications(expiry_date) WHERE expiry_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_workforce_certifications_type ON public.workforce_certifications(employee_id, cert_type);

COMMENT ON TABLE public.workforce_certifications IS 'OSHA, insurance, fall-protection, manufacturer certifications (Block 251000)';
COMMENT ON COLUMN public.workforce_certifications.cert_type IS 'Type: osha, insurance, fall_protection, manufacturer, state_license, other';

-- ============================================================================
-- PART 6 — CREATE workforce_performance_logs TABLE
-- ============================================================================
-- Performance reviews, attendance, incidents, notes

CREATE TABLE IF NOT EXISTS public.workforce_performance_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.workforce_employees(id) ON DELETE CASCADE,
  log_type text CHECK (log_type IN ('praise', 'issue', 'attendance', 'violation', 'review', 'incident', 'note')) NOT NULL,
  notes text NOT NULL,
  severity text CHECK (severity IN ('low', 'medium', 'high', 'critical')) DEFAULT 'low',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workforce_performance_logs_employee ON public.workforce_performance_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_workforce_performance_logs_type ON public.workforce_performance_logs(employee_id, log_type);
CREATE INDEX IF NOT EXISTS idx_workforce_performance_logs_created_at ON public.workforce_performance_logs(employee_id, created_at DESC);

COMMENT ON TABLE public.workforce_performance_logs IS 'Performance reviews, attendance, incidents, notes (Block 251000)';
COMMENT ON COLUMN public.workforce_performance_logs.log_type IS 'Type: praise, issue, attendance, violation, review, incident, note';

-- ============================================================================
-- PART 7 — UPDATED_AT TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_workforce_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_workforce_employees_updated_at ON public.workforce_employees;
CREATE TRIGGER trg_workforce_employees_updated_at
BEFORE UPDATE ON public.workforce_employees
FOR EACH ROW EXECUTE FUNCTION public.set_workforce_updated_at();

DROP TRIGGER IF EXISTS trg_workforce_applicants_updated_at ON public.workforce_applicants;
CREATE TRIGGER trg_workforce_applicants_updated_at
BEFORE UPDATE ON public.workforce_applicants
FOR EACH ROW EXECUTE FUNCTION public.set_workforce_updated_at();

DROP TRIGGER IF EXISTS trg_workforce_training_modules_updated_at ON public.workforce_training_modules;
CREATE TRIGGER trg_workforce_training_modules_updated_at
BEFORE UPDATE ON public.workforce_training_modules
FOR EACH ROW EXECUTE FUNCTION public.set_workforce_updated_at();

DROP TRIGGER IF EXISTS trg_workforce_training_progress_updated_at ON public.workforce_training_progress;
CREATE TRIGGER trg_workforce_training_progress_updated_at
BEFORE UPDATE ON public.workforce_training_progress
FOR EACH ROW EXECUTE FUNCTION public.set_workforce_updated_at();

DROP TRIGGER IF EXISTS trg_workforce_certifications_updated_at ON public.workforce_certifications;
CREATE TRIGGER trg_workforce_certifications_updated_at
BEFORE UPDATE ON public.workforce_certifications
FOR EACH ROW EXECUTE FUNCTION public.set_workforce_updated_at();

-- ============================================================================
-- PART 8 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.workforce_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workforce_applicants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workforce_training_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workforce_training_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workforce_certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workforce_performance_logs ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user has access to roofing company
CREATE OR REPLACE FUNCTION public.can_access_roofing_company(_company_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.roofing_companies rc
    WHERE rc.id = _company_id
    AND (
      rc.owner_id = auth.uid()
      OR EXISTS(
        SELECT 1 FROM public.roofing_company_members rcm
        WHERE rcm.roofing_company_id = _company_id
        AND rcm.user_id = auth.uid()
        AND rcm.is_active = true
      )
    )
  );
$$;

-- RLS Policies for workforce_employees
DROP POLICY IF EXISTS "workforce_employees_select" ON public.workforce_employees;
CREATE POLICY "workforce_employees_select" ON public.workforce_employees
  FOR SELECT USING (can_access_roofing_company(company_id));

DROP POLICY IF EXISTS "workforce_employees_insert" ON public.workforce_employees;
CREATE POLICY "workforce_employees_insert" ON public.workforce_employees
  FOR INSERT WITH CHECK (can_access_roofing_company(company_id));

DROP POLICY IF EXISTS "workforce_employees_update" ON public.workforce_employees;
CREATE POLICY "workforce_employees_update" ON public.workforce_employees
  FOR UPDATE USING (can_access_roofing_company(company_id))
  WITH CHECK (can_access_roofing_company(company_id));

DROP POLICY IF EXISTS "workforce_employees_delete" ON public.workforce_employees;
CREATE POLICY "workforce_employees_delete" ON public.workforce_employees
  FOR DELETE USING (can_access_roofing_company(company_id));

-- RLS Policies for workforce_applicants
DROP POLICY IF EXISTS "workforce_applicants_select" ON public.workforce_applicants;
CREATE POLICY "workforce_applicants_select" ON public.workforce_applicants
  FOR SELECT USING (can_access_roofing_company(company_id));

DROP POLICY IF EXISTS "workforce_applicants_insert" ON public.workforce_applicants;
CREATE POLICY "workforce_applicants_insert" ON public.workforce_applicants
  FOR INSERT WITH CHECK (can_access_roofing_company(company_id));

DROP POLICY IF EXISTS "workforce_applicants_update" ON public.workforce_applicants;
CREATE POLICY "workforce_applicants_update" ON public.workforce_applicants
  FOR UPDATE USING (can_access_roofing_company(company_id))
  WITH CHECK (can_access_roofing_company(company_id));

DROP POLICY IF EXISTS "workforce_applicants_delete" ON public.workforce_applicants;
CREATE POLICY "workforce_applicants_delete" ON public.workforce_applicants
  FOR DELETE USING (can_access_roofing_company(company_id));

-- RLS Policies for workforce_training_modules
DROP POLICY IF EXISTS "workforce_training_modules_select" ON public.workforce_training_modules;
CREATE POLICY "workforce_training_modules_select" ON public.workforce_training_modules
  FOR SELECT USING (can_access_roofing_company(company_id));

DROP POLICY IF EXISTS "workforce_training_modules_insert" ON public.workforce_training_modules;
CREATE POLICY "workforce_training_modules_insert" ON public.workforce_training_modules
  FOR INSERT WITH CHECK (can_access_roofing_company(company_id));

DROP POLICY IF EXISTS "workforce_training_modules_update" ON public.workforce_training_modules;
CREATE POLICY "workforce_training_modules_update" ON public.workforce_training_modules
  FOR UPDATE USING (can_access_roofing_company(company_id))
  WITH CHECK (can_access_roofing_company(company_id));

DROP POLICY IF EXISTS "workforce_training_modules_delete" ON public.workforce_training_modules;
CREATE POLICY "workforce_training_modules_delete" ON public.workforce_training_modules
  FOR DELETE USING (can_access_roofing_company(company_id));

-- RLS Policies for workforce_training_progress
DROP POLICY IF EXISTS "workforce_training_progress_select" ON public.workforce_training_progress;
CREATE POLICY "workforce_training_progress_select" ON public.workforce_training_progress
  FOR SELECT USING (
    EXISTS(
      SELECT 1 FROM public.workforce_employees we
      WHERE we.id = workforce_training_progress.employee_id
      AND can_access_roofing_company(we.company_id)
    )
  );

DROP POLICY IF EXISTS "workforce_training_progress_insert" ON public.workforce_training_progress;
CREATE POLICY "workforce_training_progress_insert" ON public.workforce_training_progress
  FOR INSERT WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.workforce_employees we
      WHERE we.id = workforce_training_progress.employee_id
      AND can_access_roofing_company(we.company_id)
    )
  );

DROP POLICY IF EXISTS "workforce_training_progress_update" ON public.workforce_training_progress;
CREATE POLICY "workforce_training_progress_update" ON public.workforce_training_progress
  FOR UPDATE USING (
    EXISTS(
      SELECT 1 FROM public.workforce_employees we
      WHERE we.id = workforce_training_progress.employee_id
      AND can_access_roofing_company(we.company_id)
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.workforce_employees we
      WHERE we.id = workforce_training_progress.employee_id
      AND can_access_roofing_company(we.company_id)
    )
  );

DROP POLICY IF EXISTS "workforce_training_progress_delete" ON public.workforce_training_progress;
CREATE POLICY "workforce_training_progress_delete" ON public.workforce_training_progress
  FOR DELETE USING (
    EXISTS(
      SELECT 1 FROM public.workforce_employees we
      WHERE we.id = workforce_training_progress.employee_id
      AND can_access_roofing_company(we.company_id)
    )
  );

-- RLS Policies for workforce_certifications
DROP POLICY IF EXISTS "workforce_certifications_select" ON public.workforce_certifications;
CREATE POLICY "workforce_certifications_select" ON public.workforce_certifications
  FOR SELECT USING (
    EXISTS(
      SELECT 1 FROM public.workforce_employees we
      WHERE we.id = workforce_certifications.employee_id
      AND can_access_roofing_company(we.company_id)
    )
  );

DROP POLICY IF EXISTS "workforce_certifications_insert" ON public.workforce_certifications;
CREATE POLICY "workforce_certifications_insert" ON public.workforce_certifications
  FOR INSERT WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.workforce_employees we
      WHERE we.id = workforce_certifications.employee_id
      AND can_access_roofing_company(we.company_id)
    )
  );

DROP POLICY IF EXISTS "workforce_certifications_update" ON public.workforce_certifications;
CREATE POLICY "workforce_certifications_update" ON public.workforce_certifications
  FOR UPDATE USING (
    EXISTS(
      SELECT 1 FROM public.workforce_employees we
      WHERE we.id = workforce_certifications.employee_id
      AND can_access_roofing_company(we.company_id)
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.workforce_employees we
      WHERE we.id = workforce_certifications.employee_id
      AND can_access_roofing_company(we.company_id)
    )
  );

DROP POLICY IF EXISTS "workforce_certifications_delete" ON public.workforce_certifications;
CREATE POLICY "workforce_certifications_delete" ON public.workforce_certifications
  FOR DELETE USING (
    EXISTS(
      SELECT 1 FROM public.workforce_employees we
      WHERE we.id = workforce_certifications.employee_id
      AND can_access_roofing_company(we.company_id)
    )
  );

-- RLS Policies for workforce_performance_logs
DROP POLICY IF EXISTS "workforce_performance_logs_select" ON public.workforce_performance_logs;
CREATE POLICY "workforce_performance_logs_select" ON public.workforce_performance_logs
  FOR SELECT USING (
    EXISTS(
      SELECT 1 FROM public.workforce_employees we
      WHERE we.id = workforce_performance_logs.employee_id
      AND can_access_roofing_company(we.company_id)
    )
  );

DROP POLICY IF EXISTS "workforce_performance_logs_insert" ON public.workforce_performance_logs;
CREATE POLICY "workforce_performance_logs_insert" ON public.workforce_performance_logs
  FOR INSERT WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.workforce_employees we
      WHERE we.id = workforce_performance_logs.employee_id
      AND can_access_roofing_company(we.company_id)
    )
  );

DROP POLICY IF EXISTS "workforce_performance_logs_update" ON public.workforce_performance_logs;
CREATE POLICY "workforce_performance_logs_update" ON public.workforce_performance_logs
  FOR UPDATE USING (
    EXISTS(
      SELECT 1 FROM public.workforce_employees we
      WHERE we.id = workforce_performance_logs.employee_id
      AND can_access_roofing_company(we.company_id)
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.workforce_employees we
      WHERE we.id = workforce_performance_logs.employee_id
      AND can_access_roofing_company(we.company_id)
    )
  );

DROP POLICY IF EXISTS "workforce_performance_logs_delete" ON public.workforce_performance_logs;
CREATE POLICY "workforce_performance_logs_delete" ON public.workforce_performance_logs
  FOR DELETE USING (
    EXISTS(
      SELECT 1 FROM public.workforce_employees we
      WHERE we.id = workforce_performance_logs.employee_id
      AND can_access_roofing_company(we.company_id)
    )
  );

-- ============================================================================
-- PART 9 — HELPER FUNCTIONS
-- ============================================================================

-- Function to get employees with expiring certifications (for alerts)
CREATE OR REPLACE FUNCTION public.get_expiring_certifications(
  _company_id uuid,
  _days_ahead integer DEFAULT 30
)
RETURNS TABLE (
  employee_id uuid,
  employee_name text,
  cert_name text,
  expiry_date date,
  days_until_expiry integer
) LANGUAGE sql STABLE AS $$
  SELECT 
    wc.employee_id,
    we.first_name || ' ' || we.last_name as employee_name,
    wc.cert_name,
    wc.expiry_date,
    wc.expiry_date - CURRENT_DATE as days_until_expiry
  FROM public.workforce_certifications wc
  JOIN public.workforce_employees we ON we.id = wc.employee_id
  WHERE we.company_id = _company_id
    AND wc.expiry_date IS NOT NULL
    AND wc.expiry_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + _days_ahead)
    AND we.status = 'active'
  ORDER BY wc.expiry_date ASC;
$$;

-- Function to get training completion stats for a company
CREATE OR REPLACE FUNCTION public.get_training_completion_stats(
  _company_id uuid
)
RETURNS TABLE (
  module_id uuid,
  module_title text,
  total_employees integer,
  completed_count integer,
  in_progress_count integer,
  not_started_count integer,
  completion_percentage numeric
) LANGUAGE sql STABLE AS $$
  SELECT 
    tm.id as module_id,
    tm.title as module_title,
    COUNT(DISTINCT we.id) FILTER (WHERE tm.required_for_role IS NULL OR we.role = tm.required_for_role OR tm.required_for_role = 'everyone') as total_employees,
    COUNT(DISTINCT tp.employee_id) FILTER (WHERE tp.status = 'completed') as completed_count,
    COUNT(DISTINCT tp.employee_id) FILTER (WHERE tp.status = 'in_progress') as in_progress_count,
    COUNT(DISTINCT we.id) FILTER (WHERE tm.required_for_role IS NULL OR we.role = tm.required_for_role OR tm.required_for_role = 'everyone') - COUNT(DISTINCT tp.employee_id) FILTER (WHERE tp.status IN ('completed', 'in_progress')) as not_started_count,
    CASE 
      WHEN COUNT(DISTINCT we.id) FILTER (WHERE tm.required_for_role IS NULL OR we.role = tm.required_for_role OR tm.required_for_role = 'everyone') > 0
      THEN ROUND(100.0 * COUNT(DISTINCT tp.employee_id) FILTER (WHERE tp.status = 'completed') / COUNT(DISTINCT we.id) FILTER (WHERE tm.required_for_role IS NULL OR we.role = tm.required_for_role OR tm.required_for_role = 'everyone'), 2)
      ELSE 0
    END as completion_percentage
  FROM public.workforce_training_modules tm
  LEFT JOIN public.workforce_employees we ON we.company_id = _company_id AND we.status = 'active'
  LEFT JOIN public.workforce_training_progress tp ON tp.module_id = tm.id AND tp.employee_id = we.id
  WHERE tm.company_id = _company_id
  GROUP BY tm.id, tm.title;
$$;

COMMENT ON FUNCTION public.get_expiring_certifications IS 'Get employees with certifications expiring within specified days (Block 251000)';
COMMENT ON FUNCTION public.get_training_completion_stats IS 'Get training completion statistics for a company (Block 251000)';
























