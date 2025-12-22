-- =========================================================
-- Block 251700 — SmartSend Crew Issue Reporting System v1
-- "Material Shortages, Safety Alerts, Damage Reports, Customer Complaints, Approval Workflow"
-- =========================================================
-- 
-- This is the system that stops crews from hiding problems,
-- stops jobs from falling apart, and stops roofers from losing
-- thousands because "nobody reported it."
-- 
-- Roofers will literally say:
-- "SmartSend fixed our chaos. Now issues get reported instantly — not days later."
-- 
-- This is how SmartSend turns field operations from reactive to proactive.
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE crew_issues TABLE
-- ============================================================================
-- Main issue reporting table

CREATE TABLE IF NOT EXISTS public.crew_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  employee_id uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  issue_type text NOT NULL CHECK (issue_type IN ('material', 'safety', 'damage', 'customer', 'weather', 'other')),
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  title text NOT NULL,
  description text,
  photo_url text,
  location_lat numeric(10, 8),
  location_lng numeric(11, 8),
  reported_at timestamptz DEFAULT now(),
  status text DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'dismissed')),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crew_issues_job ON public.crew_issues(job_id);
CREATE INDEX IF NOT EXISTS idx_crew_issues_employee ON public.crew_issues(employee_id);
CREATE INDEX IF NOT EXISTS idx_crew_issues_status ON public.crew_issues(status);
CREATE INDEX IF NOT EXISTS idx_crew_issues_severity ON public.crew_issues(severity);
CREATE INDEX IF NOT EXISTS idx_crew_issues_type ON public.crew_issues(issue_type);
CREATE INDEX IF NOT EXISTS idx_crew_issues_reported_at ON public.crew_issues(reported_at DESC);
CREATE INDEX IF NOT EXISTS idx_crew_issues_job_status ON public.crew_issues(job_id, status);

COMMENT ON TABLE public.crew_issues IS 'Crew issue reports: material shortages, safety alerts, damage, customer complaints (Block 251700)';
COMMENT ON COLUMN public.crew_issues.issue_type IS 'Type: material, safety, damage, customer, weather, other';
COMMENT ON COLUMN public.crew_issues.severity IS 'Severity: low, medium, high, critical';
COMMENT ON COLUMN public.crew_issues.status IS 'Status: open, in_progress, resolved, dismissed';

-- ============================================================================
-- PART 2 — CREATE crew_issue_comments TABLE
-- ============================================================================
-- Internal communication on issues

CREATE TABLE IF NOT EXISTS public.crew_issue_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES public.crew_issues(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- office admin
  comment text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crew_issue_comments_issue ON public.crew_issue_comments(issue_id);
CREATE INDEX IF NOT EXISTS idx_crew_issue_comments_created ON public.crew_issue_comments(created_at DESC);

COMMENT ON TABLE public.crew_issue_comments IS 'Internal comments on crew issues (Block 251700)';

-- ============================================================================
-- PART 3 — CREATE STORAGE BUCKET FOR ISSUE PHOTOS
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'issue-photos',
  'issue-photos',
  false, -- private bucket
  10485760, -- 10 MB limit per file
  ARRAY[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for issue-photos bucket
-- Policy: Authenticated users can upload issue photos
CREATE POLICY IF NOT EXISTS "issue_photos_upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'issue-photos'
  );

-- Policy: Authenticated users can read issue photos
CREATE POLICY IF NOT EXISTS "issue_photos_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'issue-photos'
  );

-- Policy: Service role has full access
CREATE POLICY IF NOT EXISTS "issue_photos_service_role"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'issue-photos')
  WITH CHECK (bucket_id = 'issue-photos');

-- ============================================================================
-- PART 4 — CREATE VIEW: employee_issue_stats
-- ============================================================================
-- Track employee issue statistics for risk flagging

CREATE OR REPLACE VIEW public.employee_issue_stats AS
SELECT 
  employee_id,
  COUNT(*) AS total_issues,
  SUM(CASE WHEN severity = 'high' OR severity = 'critical' THEN 1 ELSE 0 END) AS severe_issues,
  SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) AS critical_issues,
  SUM(CASE WHEN severity = 'high' THEN 1 ELSE 0 END) AS high_issues,
  SUM(CASE WHEN severity = 'medium' THEN 1 ELSE 0 END) AS medium_issues,
  SUM(CASE WHEN severity = 'low' THEN 1 ELSE 0 END) AS low_issues,
  MAX(reported_at) AS last_issue_reported_at
FROM public.crew_issues
WHERE employee_id IS NOT NULL
GROUP BY employee_id;

COMMENT ON VIEW public.employee_issue_stats IS 'Employee issue statistics for risk assessment (Block 251700)';

-- ============================================================================
-- PART 5 — CREATE FUNCTION: calculate_job_risk_score
-- ============================================================================
-- Calculate risk score for a job based on issues

CREATE OR REPLACE FUNCTION public.calculate_job_risk_score(p_job_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_score integer := 0;
BEGIN
  SELECT 
    COALESCE(SUM(
      CASE severity
        WHEN 'critical' THEN 20
        WHEN 'high' THEN 10
        WHEN 'medium' THEN 5
        WHEN 'low' THEN 1
        ELSE 0
      END
    ), 0)
  INTO v_score
  FROM public.crew_issues
  WHERE job_id = p_job_id
    AND status IN ('open', 'in_progress');
  
  RETURN v_score;
END;
$$;

COMMENT ON FUNCTION public.calculate_job_risk_score IS 'Calculate job risk score based on open issues (Block 251700)';

-- ============================================================================
-- PART 6 — CREATE FUNCTION: get_job_risk_level
-- ============================================================================
-- Get risk level label from score

CREATE OR REPLACE FUNCTION public.get_job_risk_level(p_score integer)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN CASE
    WHEN p_score >= 50 THEN 'CRITICAL'
    WHEN p_score >= 30 THEN 'HIGH'
    WHEN p_score >= 15 THEN 'MODERATE'
    WHEN p_score >= 5 THEN 'LOW'
    ELSE 'NONE'
  END;
END;
$$;

COMMENT ON FUNCTION public.get_job_risk_level IS 'Get risk level label from score (Block 251700)';

-- ============================================================================
-- PART 7 — CREATE TRIGGER: update_crew_issues_updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_crew_issues_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_crew_issues_updated_at
  BEFORE UPDATE ON public.crew_issues
  FOR EACH ROW
  EXECUTE FUNCTION public.update_crew_issues_updated_at();

-- ============================================================================
-- PART 8 — CREATE TRIGGER: auto_set_resolved_at
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_set_resolved_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'resolved' AND OLD.status != 'resolved' THEN
    NEW.resolved_at = now();
  ELSIF NEW.status != 'resolved' THEN
    NEW.resolved_at = NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_auto_set_resolved_at
  BEFORE UPDATE ON public.crew_issues
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_resolved_at();

-- ============================================================================
-- PART 9 — ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE public.crew_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_issue_comments ENABLE ROW LEVEL SECURITY;

-- Policy: Employees can view issues for their jobs
CREATE POLICY "crew_issues_employee_select"
  ON public.crew_issues FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workforce_employees we
      WHERE we.id = crew_issues.employee_id
        AND we.company_id IN (
          SELECT roofing_company_id FROM public.roofing_company_members
          WHERE user_id = auth.uid() AND is_active = true
        )
    )
    OR
    EXISTS (
      SELECT 1 FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = crew_issues.job_id
        AND tm.user_id = auth.uid()
    )
  );

-- Policy: Employees can insert their own issues
CREATE POLICY "crew_issues_employee_insert"
  ON public.crew_issues FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workforce_employees we
      WHERE we.id = crew_issues.employee_id
        AND we.company_id IN (
          SELECT roofing_company_id FROM public.roofing_company_members
          WHERE user_id = auth.uid() AND is_active = true
        )
    )
  );

-- Policy: Office users can view all issues for their company
CREATE POLICY "crew_issues_office_select"
  ON public.crew_issues FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workforce_employees we
      WHERE we.company_id IN (
        SELECT roofing_company_id FROM public.roofing_company_members
        WHERE user_id = auth.uid() AND is_active = true
      )
      AND (
        we.id = crew_issues.employee_id
        OR EXISTS (
          SELECT 1 FROM public.jobs j
          WHERE j.id = crew_issues.job_id
            AND j.team_id IN (
              SELECT team_id FROM public.team_members
              WHERE user_id = auth.uid()
            )
        )
      )
    )
  );

-- Policy: Office users can update issues
CREATE POLICY "crew_issues_office_update"
  ON public.crew_issues FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workforce_employees we
      WHERE we.company_id IN (
        SELECT roofing_company_id FROM public.roofing_company_members
        WHERE user_id = auth.uid() AND is_active = true
      )
      AND (
        we.id = crew_issues.employee_id
        OR EXISTS (
          SELECT 1 FROM public.jobs j
          WHERE j.id = crew_issues.job_id
            AND j.team_id IN (
              SELECT team_id FROM public.team_members
              WHERE user_id = auth.uid()
            )
        )
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workforce_employees we
      WHERE we.company_id IN (
        SELECT roofing_company_id FROM public.roofing_company_members
        WHERE user_id = auth.uid() AND is_active = true
      )
      AND (
        we.id = crew_issues.employee_id
        OR EXISTS (
          SELECT 1 FROM public.jobs j
          WHERE j.id = crew_issues.job_id
            AND j.team_id IN (
              SELECT team_id FROM public.team_members
              WHERE user_id = auth.uid()
            )
        )
      )
    )
  );

-- Policy: Comments - employees can view comments on their issues
CREATE POLICY "crew_issue_comments_select"
  ON public.crew_issue_comments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.crew_issues ci
      WHERE ci.id = crew_issue_comments.issue_id
        AND (
          EXISTS (
            SELECT 1 FROM public.workforce_employees we
            WHERE we.id = ci.employee_id
              AND we.company_id IN (
                SELECT roofing_company_id FROM public.roofing_company_members
                WHERE user_id = auth.uid() AND is_active = true
              )
          )
          OR
          EXISTS (
            SELECT 1 FROM public.jobs j
            JOIN public.team_members tm ON j.team_id = tm.team_id
            WHERE j.id = ci.job_id
              AND tm.user_id = auth.uid()
          )
        )
    )
  );

-- Policy: Comments - employees and office can insert comments
CREATE POLICY "crew_issue_comments_insert"
  ON public.crew_issue_comments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.crew_issues ci
      WHERE ci.id = crew_issue_comments.issue_id
        AND (
          EXISTS (
            SELECT 1 FROM public.workforce_employees we
            WHERE we.id = ci.employee_id
              AND we.company_id IN (
                SELECT roofing_company_id FROM public.roofing_company_members
                WHERE user_id = auth.uid() AND is_active = true
              )
          )
          OR
          EXISTS (
            SELECT 1 FROM public.jobs j
            JOIN public.team_members tm ON j.team_id = tm.team_id
            WHERE j.id = ci.job_id
              AND tm.user_id = auth.uid()
          )
        )
    )
  );

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
























