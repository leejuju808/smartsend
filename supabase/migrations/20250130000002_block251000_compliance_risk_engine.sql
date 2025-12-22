-- =========================================================
-- Block 251000 — Compliance Risk Engine
-- "Certs + Training Alerts"
-- =========================================================
-- 
-- This block makes owners say:
-- "We used to get blindsided by OSHA / insurance.
-- Now SmartSend tells us BEFORE it's a problem."
-- 
-- Calculates certification risk for every employee
-- Calculates training risk
-- Exposes via SQL views for easy querying
-- Powers daily Edge Function digest
-- Powers Certifications Monitor UI and Workforce Overview cards
-- =========================================================

-- ============================================================================
-- PART 1 — CERTIFICATION RISK VIEW
-- ============================================================================
-- Turns raw cert rows into simple risk signals

CREATE OR REPLACE VIEW public.workforce_certification_status AS
SELECT
  e.id AS employee_id,
  e.company_id,
  e.first_name,
  e.last_name,
  e.role,
  c.id AS certification_id,
  c.cert_name,
  c.cert_type,
  c.issue_date,
  c.expiry_date,
  CASE
    WHEN c.expiry_date IS NULL THEN 'unknown'
    WHEN c.expiry_date < CURRENT_DATE THEN 'expired'
    WHEN c.expiry_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'expiring_7'
    WHEN c.expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'expiring_30'
    ELSE 'valid'
  END AS status
FROM public.workforce_employees e
LEFT JOIN public.workforce_certifications c
  ON c.employee_id = e.id
WHERE e.status = 'active';

COMMENT ON VIEW public.workforce_certification_status IS 'Certification risk status for all active employees (Block 251000)';

-- ============================================================================
-- PART 2 — TRAINING RISK VIEWS
-- ============================================================================
-- Shows per-employee: total required modules, completed, % completion

CREATE OR REPLACE VIEW public.workforce_training_status AS
WITH required_modules AS (
  SELECT
    m.id AS module_id,
    m.company_id,
    m.title,
    m.required_for_role
  FROM public.workforce_training_modules m
  WHERE m.required_for_role IS NOT NULL
)
SELECT
  e.id AS employee_id,
  e.company_id,
  e.first_name,
  e.last_name,
  e.role,
  COUNT(DISTINCT rm.module_id) AS total_required,
  COALESCE(
    COUNT(DISTINCT CASE WHEN p.status = 'completed' THEN rm.module_id END),
    0
  ) AS completed_required,
  CASE
    WHEN COUNT(DISTINCT rm.module_id) = 0 THEN 100
    ELSE ROUND(
      100.0 * COALESCE(
        COUNT(DISTINCT CASE WHEN p.status = 'completed' THEN rm.module_id END),
        0
      ) / COUNT(DISTINCT rm.module_id)
    )::INT
  END AS completion_percent
FROM public.workforce_employees e
LEFT JOIN required_modules rm
  ON rm.company_id = e.company_id
  AND (
    rm.required_for_role = 'everyone'
    OR rm.required_for_role = e.role
  )
LEFT JOIN public.workforce_training_progress p
  ON p.employee_id = e.id
  AND p.module_id = rm.module_id
WHERE e.status = 'active'
GROUP BY e.id, e.company_id, e.first_name, e.last_name, e.role;

COMMENT ON VIEW public.workforce_training_status IS 'Training completion status per employee (Block 251000)';

-- Add risk band to training status
CREATE OR REPLACE VIEW public.workforce_training_risk AS
SELECT
  ts.*,
  CASE
    WHEN ts.total_required = 0 THEN 'none_required'
    WHEN ts.completion_percent >= 90 THEN 'low'
    WHEN ts.completion_percent >= 60 THEN 'medium'
    ELSE 'high'
  END AS risk_level
FROM public.workforce_training_status ts;

COMMENT ON VIEW public.workforce_training_risk IS 'Training risk levels per employee (Block 251000)';

-- ============================================================================
-- PART 3 — RLS POLICIES FOR VIEWS
-- ============================================================================
-- Views inherit RLS from underlying tables, but we need to ensure they're accessible

-- The views will automatically respect RLS from the underlying tables
-- since they're just SELECT queries on those tables

-- ============================================================================
-- PART 4 — INDEXES FOR PERFORMANCE (if needed)
-- ============================================================================
-- The underlying tables already have indexes, but we can add composite indexes
-- if query patterns require them

CREATE INDEX IF NOT EXISTS idx_workforce_certifications_employee_expiry 
ON public.workforce_certifications(employee_id, expiry_date) 
WHERE expiry_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workforce_training_progress_employee_status 
ON public.workforce_training_progress(employee_id, status);

-- ============================================================================
-- PART 5 — HELPER FUNCTIONS FOR COMPLIANCE QUERIES
-- ============================================================================

-- Get compliance summary for a company
CREATE OR REPLACE FUNCTION public.get_compliance_summary(
  _company_id uuid
)
RETURNS TABLE (
  expired_certs_count bigint,
  expiring_30_certs_count bigint,
  expiring_7_certs_count bigint,
  valid_certs_count bigint,
  high_risk_training_count bigint,
  medium_risk_training_count bigint,
  low_risk_training_count bigint
) 
LANGUAGE sql STABLE AS $$
  SELECT
    (SELECT COUNT(*) FROM public.workforce_certification_status 
     WHERE company_id = _company_id AND status = 'expired') AS expired_certs_count,
    (SELECT COUNT(*) FROM public.workforce_certification_status 
     WHERE company_id = _company_id AND status = 'expiring_30') AS expiring_30_certs_count,
    (SELECT COUNT(*) FROM public.workforce_certification_status 
     WHERE company_id = _company_id AND status = 'expiring_7') AS expiring_7_certs_count,
    (SELECT COUNT(*) FROM public.workforce_certification_status 
     WHERE company_id = _company_id AND status = 'valid') AS valid_certs_count,
    (SELECT COUNT(*) FROM public.workforce_training_risk 
     WHERE company_id = _company_id AND risk_level = 'high') AS high_risk_training_count,
    (SELECT COUNT(*) FROM public.workforce_training_risk 
     WHERE company_id = _company_id AND risk_level = 'medium') AS medium_risk_training_count,
    (SELECT COUNT(*) FROM public.workforce_training_risk 
     WHERE company_id = _company_id AND risk_level = 'low') AS low_risk_training_count;
$$;

COMMENT ON FUNCTION public.get_compliance_summary IS 'Get compliance summary counts for a company (Block 251000)';
























