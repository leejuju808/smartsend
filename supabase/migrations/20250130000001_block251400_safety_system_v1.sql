-- =========================================================
-- Block 251400 — SmartSend Safety System v1
-- "Toolbox Talks, Digital Sign-Offs, Safety Logs, Crew Safety Compliance"
-- =========================================================
-- 
-- This block makes SmartSend OSHA-ready and turns roofing companies 
-- into legitimate professional operations, not "jobsite chaos with ladders."
-- 
-- Roofers will straight-up say:
-- "We've NEVER had a system for safety.
-- SmartSend makes us look like a damn enterprise."
-- 
-- This is where SmartSend absolutely embarrasses every roofing CRM on the market.
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE toolbox_talks TABLE
-- ============================================================================
-- Library of safety talk topics (admin creates talks)

CREATE TABLE IF NOT EXISTS public.toolbox_talks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  content_url text, -- pdf, image, video link
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_toolbox_talks_company ON public.toolbox_talks(company_id);
CREATE INDEX IF NOT EXISTS idx_toolbox_talks_created_at ON public.toolbox_talks(company_id, created_at DESC);

COMMENT ON TABLE public.toolbox_talks IS 'Library of safety talk topics for toolbox talks (Block 251400)';

-- ============================================================================
-- PART 2 — CREATE toolbox_talk_sessions TABLE
-- ============================================================================
-- Each time a talk is delivered

CREATE TABLE IF NOT EXISTS public.toolbox_talk_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  talk_id uuid NOT NULL REFERENCES public.toolbox_talks(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  date date NOT NULL,
  location text,
  foreman_id uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_toolbox_talk_sessions_talk ON public.toolbox_talk_sessions(talk_id);
CREATE INDEX IF NOT EXISTS idx_toolbox_talk_sessions_company ON public.toolbox_talk_sessions(company_id);
CREATE INDEX IF NOT EXISTS idx_toolbox_talk_sessions_date ON public.toolbox_talk_sessions(company_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_toolbox_talk_sessions_foreman ON public.toolbox_talk_sessions(foreman_id) WHERE foreman_id IS NOT NULL;

COMMENT ON TABLE public.toolbox_talk_sessions IS 'Each time a toolbox talk is delivered to a crew (Block 251400)';

-- ============================================================================
-- PART 3 — CREATE toolbox_talk_signoffs TABLE
-- ============================================================================
-- Workers who attended and signed off

CREATE TABLE IF NOT EXISTS public.toolbox_talk_signoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.toolbox_talk_sessions(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.workforce_employees(id) ON DELETE CASCADE,
  signed_at timestamptz DEFAULT now(),
  signed_by_foreman boolean DEFAULT false, -- true if foreman signed on behalf of employee
  foreman_id uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL, -- if signed_by_foreman = true
  UNIQUE(session_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_toolbox_talk_signoffs_session ON public.toolbox_talk_signoffs(session_id);
CREATE INDEX IF NOT EXISTS idx_toolbox_talk_signoffs_employee ON public.toolbox_talk_signoffs(employee_id);
CREATE INDEX IF NOT EXISTS idx_toolbox_talk_signoffs_signed_at ON public.toolbox_talk_signoffs(employee_id, signed_at DESC);

COMMENT ON TABLE public.toolbox_talk_signoffs IS 'Workers who attended and signed off on toolbox talks (Block 251400)';
COMMENT ON COLUMN public.toolbox_talk_signoffs.signed_by_foreman IS 'True if foreman signed on behalf of employee (for workers without logins)';

-- ============================================================================
-- PART 4 — CREATE safety_incidents TABLE
-- ============================================================================
-- OSHA-style incident reporting

CREATE TABLE IF NOT EXISTS public.safety_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  date date NOT NULL,
  incident_type text CHECK (incident_type IN ('near_miss', 'injury', 'property_damage', 'equipment_failure', 'safety_violation', 'other')) NOT NULL,
  description text NOT NULL,
  severity text CHECK (severity IN ('low', 'medium', 'high', 'critical')) DEFAULT 'low',
  reported_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  photo_url text, -- optional uploaded photo
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_safety_incidents_company ON public.safety_incidents(company_id);
CREATE INDEX IF NOT EXISTS idx_safety_incidents_date ON public.safety_incidents(company_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_safety_incidents_employee ON public.safety_incidents(employee_id) WHERE employee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_safety_incidents_type ON public.safety_incidents(company_id, incident_type);
CREATE INDEX IF NOT EXISTS idx_safety_incidents_severity ON public.safety_incidents(company_id, severity);

COMMENT ON TABLE public.safety_incidents IS 'OSHA-style safety incident reporting (Block 251400)';
COMMENT ON COLUMN public.safety_incidents.incident_type IS 'Type: near_miss, injury, property_damage, equipment_failure, safety_violation, other';
COMMENT ON COLUMN public.safety_incidents.severity IS 'Severity: low, medium, high, critical';

-- ============================================================================
-- PART 5 — UPDATED_AT TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_safety_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_toolbox_talks_updated_at ON public.toolbox_talks;
CREATE TRIGGER trg_toolbox_talks_updated_at
BEFORE UPDATE ON public.toolbox_talks
FOR EACH ROW EXECUTE FUNCTION public.set_safety_updated_at();

DROP TRIGGER IF EXISTS trg_toolbox_talk_sessions_updated_at ON public.toolbox_talk_sessions;
CREATE TRIGGER trg_toolbox_talk_sessions_updated_at
BEFORE UPDATE ON public.toolbox_talk_sessions
FOR EACH ROW EXECUTE FUNCTION public.set_safety_updated_at();

DROP TRIGGER IF EXISTS trg_safety_incidents_updated_at ON public.safety_incidents;
CREATE TRIGGER trg_safety_incidents_updated_at
BEFORE UPDATE ON public.safety_incidents
FOR EACH ROW EXECUTE FUNCTION public.set_safety_updated_at();

-- ============================================================================
-- PART 6 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.toolbox_talks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.toolbox_talk_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.toolbox_talk_signoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_incidents ENABLE ROW LEVEL SECURITY;

-- Use existing can_access_roofing_company function from workforce system
-- RLS Policies for toolbox_talks
DROP POLICY IF EXISTS "toolbox_talks_select" ON public.toolbox_talks;
CREATE POLICY "toolbox_talks_select" ON public.toolbox_talks
  FOR SELECT USING (can_access_roofing_company(company_id));

DROP POLICY IF EXISTS "toolbox_talks_insert" ON public.toolbox_talks;
CREATE POLICY "toolbox_talks_insert" ON public.toolbox_talks
  FOR INSERT WITH CHECK (can_access_roofing_company(company_id));

DROP POLICY IF EXISTS "toolbox_talks_update" ON public.toolbox_talks;
CREATE POLICY "toolbox_talks_update" ON public.toolbox_talks
  FOR UPDATE USING (can_access_roofing_company(company_id))
  WITH CHECK (can_access_roofing_company(company_id));

DROP POLICY IF EXISTS "toolbox_talks_delete" ON public.toolbox_talks;
CREATE POLICY "toolbox_talks_delete" ON public.toolbox_talks
  FOR DELETE USING (can_access_roofing_company(company_id));

-- RLS Policies for toolbox_talk_sessions
DROP POLICY IF EXISTS "toolbox_talk_sessions_select" ON public.toolbox_talk_sessions;
CREATE POLICY "toolbox_talk_sessions_select" ON public.toolbox_talk_sessions
  FOR SELECT USING (can_access_roofing_company(company_id));

DROP POLICY IF EXISTS "toolbox_talk_sessions_insert" ON public.toolbox_talk_sessions;
CREATE POLICY "toolbox_talk_sessions_insert" ON public.toolbox_talk_sessions
  FOR INSERT WITH CHECK (can_access_roofing_company(company_id));

DROP POLICY IF EXISTS "toolbox_talk_sessions_update" ON public.toolbox_talk_sessions;
CREATE POLICY "toolbox_talk_sessions_update" ON public.toolbox_talk_sessions
  FOR UPDATE USING (can_access_roofing_company(company_id))
  WITH CHECK (can_access_roofing_company(company_id));

DROP POLICY IF EXISTS "toolbox_talk_sessions_delete" ON public.toolbox_talk_sessions;
CREATE POLICY "toolbox_talk_sessions_delete" ON public.toolbox_talk_sessions
  FOR DELETE USING (can_access_roofing_company(company_id));

-- RLS Policies for toolbox_talk_signoffs
DROP POLICY IF EXISTS "toolbox_talk_signoffs_select" ON public.toolbox_talk_signoffs;
CREATE POLICY "toolbox_talk_signoffs_select" ON public.toolbox_talk_signoffs
  FOR SELECT USING (
    EXISTS(
      SELECT 1 FROM public.toolbox_talk_sessions tts
      WHERE tts.id = toolbox_talk_signoffs.session_id
      AND can_access_roofing_company(tts.company_id)
    )
  );

DROP POLICY IF EXISTS "toolbox_talk_signoffs_insert" ON public.toolbox_talk_signoffs;
CREATE POLICY "toolbox_talk_signoffs_insert" ON public.toolbox_talk_signoffs
  FOR INSERT WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.toolbox_talk_sessions tts
      WHERE tts.id = toolbox_talk_signoffs.session_id
      AND can_access_roofing_company(tts.company_id)
    )
  );

DROP POLICY IF EXISTS "toolbox_talk_signoffs_update" ON public.toolbox_talk_signoffs;
CREATE POLICY "toolbox_talk_signoffs_update" ON public.toolbox_talk_signoffs
  FOR UPDATE USING (
    EXISTS(
      SELECT 1 FROM public.toolbox_talk_sessions tts
      WHERE tts.id = toolbox_talk_signoffs.session_id
      AND can_access_roofing_company(tts.company_id)
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.toolbox_talk_sessions tts
      WHERE tts.id = toolbox_talk_signoffs.session_id
      AND can_access_roofing_company(tts.company_id)
    )
  );

DROP POLICY IF EXISTS "toolbox_talk_signoffs_delete" ON public.toolbox_talk_signoffs;
CREATE POLICY "toolbox_talk_signoffs_delete" ON public.toolbox_talk_signoffs
  FOR DELETE USING (
    EXISTS(
      SELECT 1 FROM public.toolbox_talk_sessions tts
      WHERE tts.id = toolbox_talk_signoffs.session_id
      AND can_access_roofing_company(tts.company_id)
    )
  );

-- RLS Policies for safety_incidents
DROP POLICY IF EXISTS "safety_incidents_select" ON public.safety_incidents;
CREATE POLICY "safety_incidents_select" ON public.safety_incidents
  FOR SELECT USING (can_access_roofing_company(company_id));

DROP POLICY IF EXISTS "safety_incidents_insert" ON public.safety_incidents;
CREATE POLICY "safety_incidents_insert" ON public.safety_incidents
  FOR INSERT WITH CHECK (can_access_roofing_company(company_id));

DROP POLICY IF EXISTS "safety_incidents_update" ON public.safety_incidents;
CREATE POLICY "safety_incidents_update" ON public.safety_incidents
  FOR UPDATE USING (can_access_roofing_company(company_id))
  WITH CHECK (can_access_roofing_company(company_id));

DROP POLICY IF EXISTS "safety_incidents_delete" ON public.safety_incidents;
CREATE POLICY "safety_incidents_delete" ON public.safety_incidents
  FOR DELETE USING (can_access_roofing_company(company_id));

-- ============================================================================
-- PART 7 — HELPER FUNCTIONS
-- ============================================================================

-- Function to get employees missing safety sign-offs (last 7 days)
CREATE OR REPLACE FUNCTION public.get_employees_missing_signoffs(
  _company_id uuid,
  _days integer DEFAULT 7
)
RETURNS TABLE (
  employee_id uuid,
  first_name text,
  last_name text,
  role text,
  last_signoff_date date
) LANGUAGE sql STABLE AS $$
  SELECT 
    e.id as employee_id,
    e.first_name,
    e.last_name,
    e.role,
    MAX(tts.signed_at::date) as last_signoff_date
  FROM public.workforce_employees e
  LEFT JOIN public.toolbox_talk_signoffs tts ON tts.employee_id = e.id
    AND tts.signed_at > now() - (_days || ' days')::interval
  WHERE e.company_id = _company_id
    AND e.status = 'active'
  GROUP BY e.id, e.first_name, e.last_name, e.role
  HAVING MAX(tts.signed_at::date) IS NULL
     OR MAX(tts.signed_at::date) < CURRENT_DATE - (_days || ' days')::interval
  ORDER BY e.last_name, e.first_name;
$$;

COMMENT ON FUNCTION public.get_employees_missing_signoffs IS 'Get employees who have not signed off on any toolbox talk in the last N days (Block 251400)';

-- Function to calculate safety risk score
CREATE OR REPLACE FUNCTION public.calculate_safety_risk_score(
  _company_id uuid
)
RETURNS integer LANGUAGE sql STABLE AS $$
  SELECT 
    COALESCE(
      (SELECT COUNT(*) * 10 FROM public.safety_incidents 
       WHERE company_id = _company_id 
       AND date >= CURRENT_DATE - INTERVAL '30 days'), 0
    ) +
    COALESCE(
      (SELECT COUNT(*) * 5 FROM public.get_employees_missing_signoffs(_company_id, 7)), 0
    );
$$;

COMMENT ON FUNCTION public.calculate_safety_risk_score IS 'Calculate safety risk score: (incidents_last_30_days * 10) + (employees_missing_signoffs * 5). Lower = better (Block 251400)';

-- Function to get safety dashboard stats
CREATE OR REPLACE FUNCTION public.get_safety_dashboard_stats(
  _company_id uuid
)
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'talks_completed_this_week', (
      SELECT COUNT(*) FROM public.toolbox_talk_sessions
      WHERE company_id = _company_id
      AND date >= date_trunc('week', CURRENT_DATE)
    ),
    'employees_missing_signoffs', (
      SELECT COUNT(*) FROM public.get_employees_missing_signoffs(_company_id, 7)
    ),
    'recent_incidents', (
      SELECT COUNT(*) FROM public.safety_incidents
      WHERE company_id = _company_id
      AND date >= CURRENT_DATE - INTERVAL '7 days'
    ),
    'safety_risk_score', (
      SELECT public.calculate_safety_risk_score(_company_id)
    )
  );
$$;

COMMENT ON FUNCTION public.get_safety_dashboard_stats IS 'Get safety dashboard statistics (Block 251400)';
























