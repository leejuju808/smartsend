-- =========================================================
-- Block 71000 — SmartSend Roofing "Safety Compliance + Incident Prevention System" v1
-- (OSHA COMPLIANCE • TOOLBOX TALKS • PPE CHECKS • INCIDENT REPORTS • CERTIFICATION TRACKING)
-- =========================================================
-- 
-- THIS is the block that protects roofers from:
-- - OSHA fines ($5,000–$15,000 easily)
-- - Missing safety documentation
-- - Zero incident logs
-- - No proof of safety for insurance jobs
-- - Crew members not certified
-- - No morning toolbox talk tracking
--
-- SmartSend makes them look professional + protects them from lawsuits.

-- ============================================================================
-- PART 1 — CREATE safety_roles TABLE
-- ============================================================================
-- Track safety roles for users (Foreman, Safety Manager, Crew Member)

CREATE TABLE IF NOT EXISTS public.safety_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('Foreman', 'Safety Manager', 'Crew Member', 'Owner')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- One role per user per workspace
  UNIQUE(user_id, workspace_id, role)
);

CREATE INDEX IF NOT EXISTS idx_safety_roles_user ON public.safety_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_safety_roles_workspace ON public.safety_roles(workspace_id);
CREATE INDEX IF NOT EXISTS idx_safety_roles_role ON public.safety_roles(role);

COMMENT ON TABLE public.safety_roles IS 'Block 71000: Safety roles for users (Foreman, Safety Manager, Crew Member)';

-- ============================================================================
-- PART 2 — CREATE toolbox_talks TABLE
-- ============================================================================
-- Daily safety meetings (toolbox talks) for jobs

CREATE TABLE IF NOT EXISTS public.toolbox_talks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  date date NOT NULL,
  topic text NOT NULL, -- e.g., "Fall Protection", "Ladder Safety", "Heat Exhaustion"
  notes text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_toolbox_talks_workspace ON public.toolbox_talks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_toolbox_talks_job ON public.toolbox_talks(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_toolbox_talks_date ON public.toolbox_talks(date DESC);
CREATE INDEX IF NOT EXISTS idx_toolbox_talks_workspace_date ON public.toolbox_talks(workspace_id, date DESC);

COMMENT ON TABLE public.toolbox_talks IS 'Block 71000: Daily toolbox talks (safety meetings) for jobs';

-- ============================================================================
-- PART 3 — CREATE toolbox_attendance TABLE
-- ============================================================================
-- Track crew member attendance and signatures for toolbox talks

CREATE TABLE IF NOT EXISTS public.toolbox_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  talk_id uuid NOT NULL REFERENCES public.toolbox_talks(id) ON DELETE CASCADE,
  crew_member_name text NOT NULL,
  signature_url text, -- URL to stored signature image
  signed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_toolbox_attendance_talk ON public.toolbox_attendance(talk_id);
CREATE INDEX IF NOT EXISTS idx_toolbox_attendance_signed_at ON public.toolbox_attendance(signed_at DESC);

COMMENT ON TABLE public.toolbox_attendance IS 'Block 71000: Crew member attendance and signatures for toolbox talks';

-- ============================================================================
-- PART 4 — CREATE incident_reports TABLE
-- ============================================================================
-- Track safety incidents (injuries, property damage, near misses)

CREATE TABLE IF NOT EXISTS public.incident_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  reported_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  date date NOT NULL,
  type text NOT NULL CHECK (type IN ('Injury', 'Property Damage', 'Near Miss')),
  description text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('Low', 'Medium', 'High', 'Critical')),
  immediate_action text,
  follow_up_required boolean NOT NULL DEFAULT false,
  follow_up_notes text,
  images jsonb DEFAULT '[]'::jsonb, -- Array of image URLs
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incident_reports_workspace ON public.incident_reports(workspace_id);
CREATE INDEX IF NOT EXISTS idx_incident_reports_job ON public.incident_reports(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_incident_reports_date ON public.incident_reports(date DESC);
CREATE INDEX IF NOT EXISTS idx_incident_reports_severity ON public.incident_reports(severity);
CREATE INDEX IF NOT EXISTS idx_incident_reports_type ON public.incident_reports(type);
CREATE INDEX IF NOT EXISTS idx_incident_reports_follow_up ON public.incident_reports(follow_up_required) WHERE follow_up_required = true;

COMMENT ON TABLE public.incident_reports IS 'Block 71000: Safety incident reports (injuries, property damage, near misses)';

-- ============================================================================
-- PART 5 — CREATE ppe_checks TABLE
-- ============================================================================
-- PPE (Personal Protective Equipment) compliance checks

CREATE TABLE IF NOT EXISTS public.ppe_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  date date NOT NULL,
  hard_hat boolean NOT NULL DEFAULT false,
  harness boolean NOT NULL DEFAULT false,
  boots boolean NOT NULL DEFAULT false,
  vest boolean NOT NULL DEFAULT false,
  goggles boolean NOT NULL DEFAULT false,
  gloves boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ppe_checks_workspace ON public.ppe_checks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ppe_checks_job ON public.ppe_checks(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ppe_checks_user ON public.ppe_checks(user_id);
CREATE INDEX IF NOT EXISTS idx_ppe_checks_date ON public.ppe_checks(date DESC);
CREATE INDEX IF NOT EXISTS idx_ppe_checks_workspace_date ON public.ppe_checks(workspace_id, date DESC);

COMMENT ON TABLE public.ppe_checks IS 'Block 71000: PPE (Personal Protective Equipment) compliance checks';

-- ============================================================================
-- PART 6 — CREATE certifications TABLE
-- ============================================================================
-- Track crew member certifications (Fall Protection, First Aid, Ladder Safety, etc.)

CREATE TABLE IF NOT EXISTS public.certifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  type text NOT NULL, -- e.g., "Fall Protection", "First Aid", "Ladder Safety"
  issued_date date NOT NULL,
  expiration_date date NOT NULL,
  file_url text, -- URL to certification document
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_certifications_user ON public.certifications(user_id);
CREATE INDEX IF NOT EXISTS idx_certifications_workspace ON public.certifications(workspace_id);
CREATE INDEX IF NOT EXISTS idx_certifications_expiration ON public.certifications(expiration_date);
CREATE INDEX IF NOT EXISTS idx_certifications_type ON public.certifications(type);
CREATE INDEX IF NOT EXISTS idx_certifications_expiring_soon ON public.certifications(expiration_date) WHERE expiration_date >= CURRENT_DATE;

COMMENT ON TABLE public.certifications IS 'Block 71000: Crew member certifications tracking';

-- ============================================================================
-- PART 7 — ENABLE ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.safety_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.toolbox_talks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.toolbox_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ppe_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for safety_roles
CREATE POLICY "safety_roles_select_own_workspace" ON public.safety_roles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = safety_roles.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "safety_roles_insert_own_workspace" ON public.safety_roles
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = safety_roles.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "safety_roles_update_own_workspace" ON public.safety_roles
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = safety_roles.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- RLS Policies for toolbox_talks
CREATE POLICY "toolbox_talks_select_own_workspace" ON public.toolbox_talks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = toolbox_talks.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "toolbox_talks_insert_own_workspace" ON public.toolbox_talks
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = toolbox_talks.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "toolbox_talks_update_own_workspace" ON public.toolbox_talks
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = toolbox_talks.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- RLS Policies for toolbox_attendance
CREATE POLICY "toolbox_attendance_select_own_talk" ON public.toolbox_attendance
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.toolbox_talks tt
      JOIN public.workspace_members wm ON wm.workspace_id = tt.workspace_id
      WHERE tt.id = toolbox_attendance.talk_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "toolbox_attendance_insert_own_talk" ON public.toolbox_attendance
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.toolbox_talks tt
      JOIN public.workspace_members wm ON wm.workspace_id = tt.workspace_id
      WHERE tt.id = toolbox_attendance.talk_id
      AND wm.user_id = auth.uid()
    )
  );

-- RLS Policies for incident_reports
CREATE POLICY "incident_reports_select_own_workspace" ON public.incident_reports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = incident_reports.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "incident_reports_insert_own_workspace" ON public.incident_reports
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = incident_reports.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "incident_reports_update_own_workspace" ON public.incident_reports
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = incident_reports.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- RLS Policies for ppe_checks
CREATE POLICY "ppe_checks_select_own_workspace" ON public.ppe_checks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = ppe_checks.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "ppe_checks_insert_own_workspace" ON public.ppe_checks
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = ppe_checks.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "ppe_checks_update_own_workspace" ON public.ppe_checks
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = ppe_checks.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- RLS Policies for certifications
CREATE POLICY "certifications_select_own_workspace" ON public.certifications
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = certifications.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "certifications_insert_own_workspace" ON public.certifications
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = certifications.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "certifications_update_own_workspace" ON public.certifications
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = certifications.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 8 — CREATE TRIGGERS FOR UPDATED_AT
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_safety_roles_updated_at
  BEFORE UPDATE ON public.safety_roles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_toolbox_talks_updated_at
  BEFORE UPDATE ON public.toolbox_talks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_incident_reports_updated_at
  BEFORE UPDATE ON public.incident_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ppe_checks_updated_at
  BEFORE UPDATE ON public.ppe_checks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_certifications_updated_at
  BEFORE UPDATE ON public.certifications
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 9 — CREATE FUNCTION FOR INCIDENT SEVERITY ALERTS
-- ============================================================================
-- Auto-trigger alerts for high/critical incidents

CREATE OR REPLACE FUNCTION notify_incident_severity()
RETURNS TRIGGER AS $$
BEGIN
  -- If severity is High or Critical, we'll handle alerts in application code
  -- This function is a placeholder for future database-level notifications
  IF NEW.severity IN ('High', 'Critical') THEN
    -- Mark job as safety flagged (if job_id exists)
    IF NEW.job_id IS NOT NULL THEN
      -- Update job metadata to flag safety issue
      UPDATE public.roofing_jobs
      SET updated_at = now()
      WHERE id = NEW.job_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_incident_severity_check
  AFTER INSERT OR UPDATE ON public.incident_reports
  FOR EACH ROW
  WHEN (NEW.severity IN ('High', 'Critical'))
  EXECUTE FUNCTION notify_incident_severity();

-- ============================================================================
-- PART 10 — CREATE FUNCTION FOR CERTIFICATION EXPIRATION TRACKING
-- ============================================================================
-- Helper function to get expiring certifications

CREATE OR REPLACE FUNCTION get_expiring_certifications(
  p_workspace_id uuid,
  p_days_ahead int DEFAULT 30
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  type text,
  expiration_date date,
  days_until_expiration int
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.user_id,
    c.type,
    c.expiration_date,
    (c.expiration_date - CURRENT_DATE)::int as days_until_expiration
  FROM public.certifications c
  WHERE c.workspace_id = p_workspace_id
    AND c.expiration_date >= CURRENT_DATE
    AND c.expiration_date <= CURRENT_DATE + (p_days_ahead || ' days')::interval
  ORDER BY c.expiration_date ASC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_expiring_certifications IS 'Block 71000: Get certifications expiring within specified days';



























