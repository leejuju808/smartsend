-- ============================================================
-- Block 257200 — SmartSend Permit & Compliance Engine v1
-- (Permit Pulling, City Requirements, Auto Reminders, Inspection Scheduling, Compliance Checklists, Document Storage)
-- ============================================================
-- 
-- This block extends the existing Job Documentation + Permit system
-- (Block 253100) and Roofing Permit & HOA Management (Block 22400)
-- to make SmartSend the compliance brain for roofing companies.
--
-- Core goals:
-- - City/County requirement engine (what's required, fees, inspections, rules)
-- - Structured permit + inspection scheduling on the jobs table
-- - Compliance checklists (pre-install, install, post-install) tied to jobs
-- - Stronger permit expiration semantics (already present) + job-ready checks
--
-- NOTE:
-- - This block builds on the existing:
--   - public.jobs (Block 99000 — Revenue Dashboard / Job Value Prediction)
--   - public.permits (Block 253100 — Job Documentation Engine)
--   - public.inspection_reports (Block 253100 — Job Documentation Engine)
--   - public.job_documents (Block 253100 — Job Documentation Engine)
-- - We DO NOT create a second permits table; we enhance and wire it up.
-- ============================================================

-- ============================================================
-- PART 1 — City / County Permit Requirement Engine
-- ============================================================
-- Stores per-city rules so PMs stop guessing.
-- Example:
--   City: Tacoma, WA
--   Permit Required: true
--   Base Fee: 128.00
--   Turnaround: 2–3 business days
--   Inspection Requirements: ["final"]
--   Rules: "No roofovers"

CREATE TABLE IF NOT EXISTS public.city_permit_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Optional company scope: NULL = global defaults SmartSend can ship,
  -- non-null = company-specific overrides.
  company_id uuid REFERENCES public.roofing_companies(id) ON DELETE CASCADE,

  city text NOT NULL,
  state text NOT NULL,
  jurisdiction text, -- "City of Tacoma", "Pierce County", etc.

  permit_type text NOT NULL, -- 'roofing','building','electrical','structural','other'
  permit_required boolean DEFAULT true,

  base_fee numeric(12,2),
  turnaround_days integer, -- calendar days estimate

  -- JSONB payload describing inspection expectations, e.g.:
  -- [
  --   { "type": "decking", "required": true },
  --   { "type": "mid_roof", "required": false },
  --   { "type": "final", "required": true }
  -- ]
  inspection_requirements jsonb,

  -- Free-form guidance and rules:
  -- - "No roofovers"
  -- - "Ice & water shield required at all eaves"
  rules text,

  -- Special conditions:
  -- - HOA approvals
  -- - Wildfire zones
  -- - Coastal / hurricane requirements
  special_conditions text,

  notes text,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_city_permit_requirements_city_state_type
  ON public.city_permit_requirements(city, state, permit_type);

CREATE INDEX IF NOT EXISTS idx_city_permit_requirements_company
  ON public.city_permit_requirements(company_id) WHERE company_id IS NOT NULL;

COMMENT ON TABLE public.city_permit_requirements IS
  'City/County permit requirements per permit_type (Block 257200)';

COMMENT ON COLUMN public.city_permit_requirements.inspection_requirements IS
  'JSONB list of inspection requirements per jurisdiction/permit_type';

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_city_permit_requirements_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_city_permit_requirements_updated_at ON public.city_permit_requirements;

CREATE TRIGGER trg_city_permit_requirements_updated_at
BEFORE UPDATE ON public.city_permit_requirements
FOR EACH ROW
EXECUTE FUNCTION public.set_city_permit_requirements_updated_at();

-- RLS: company-scoped + global defaults
ALTER TABLE public.city_permit_requirements ENABLE ROW LEVEL SECURITY;

-- SELECT: users can read global rows (company_id IS NULL)
-- and rows for companies they belong to.
CREATE POLICY IF NOT EXISTS "city_permit_requirements_select_company_members"
  ON public.city_permit_requirements
  FOR SELECT
  USING (
    company_id IS NULL
    OR company_id IN (
      SELECT roofing_company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid()
    )
    OR company_id IN (
      SELECT id FROM public.roofing_companies
      WHERE owner_id = auth.uid()
    )
  );

-- INSERT: users can create requirements only for companies they belong to.
CREATE POLICY IF NOT EXISTS "city_permit_requirements_insert_company_members"
  ON public.city_permit_requirements
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT roofing_company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid()
    )
    OR company_id IN (
      SELECT id FROM public.roofing_companies
      WHERE owner_id = auth.uid()
    )
  );

-- UPDATE / DELETE: users can manage rows for companies they belong to.
CREATE POLICY IF NOT EXISTS "city_permit_requirements_update_company_members"
  ON public.city_permit_requirements
  FOR UPDATE
  USING (
    company_id IN (
      SELECT roofing_company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid()
    )
    OR company_id IN (
      SELECT id FROM public.roofing_companies
      WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT roofing_company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid()
    )
    OR company_id IN (
      SELECT id FROM public.roofing_companies
      WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY IF NOT EXISTS "city_permit_requirements_delete_company_members"
  ON public.city_permit_requirements
  FOR DELETE
  USING (
    company_id IN (
      SELECT roofing_company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid()
    )
    OR company_id IN (
      SELECT id FROM public.roofing_companies
      WHERE owner_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.city_permit_requirements TO authenticated;


-- ============================================================
-- PART 2 — Compliance Checklists (Pre / During / Post Install)
-- ============================================================
-- Simple JSONB-based checklists tied to jobs, with phases:
-- - pre_install: permit posted, HOA approval, materials match permit
-- - install: drip edge, ice & water, underlayment, ventilation
-- - post_install: inspection card uploaded, homeowner signoff, etc.

CREATE TABLE IF NOT EXISTS public.compliance_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.roofing_companies(id) ON DELETE SET NULL,

  phase text NOT NULL CHECK (phase IN ('pre_install', 'install', 'post_install')),

  -- Arbitrary checklist payload, e.g.:
  -- [
  --   { "key": "permit_posted", "label": "Permit posted on site", "required": true, "completed": false },
  --   { "key": "hoa_approval", "label": "HOA approval (if required)", "required": false, "completed": true }
  -- ]
  checklist jsonb NOT NULL,

  completed boolean DEFAULT false,
  completed_at timestamptz,

  created_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compliance_checklists_job_phase
  ON public.compliance_checklists(job_id, phase);

CREATE INDEX IF NOT EXISTS idx_compliance_checklists_company
  ON public.compliance_checklists(company_id) WHERE company_id IS NOT NULL;

COMMENT ON TABLE public.compliance_checklists IS
  'Job-level compliance checklists (pre/install/post) for permit + code + OSHA checks (Block 257200)';

CREATE OR REPLACE FUNCTION public.set_compliance_checklists_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_compliance_checklists_updated_at ON public.compliance_checklists;

CREATE TRIGGER trg_compliance_checklists_updated_at
BEFORE UPDATE ON public.compliance_checklists
FOR EACH ROW
EXECUTE FUNCTION public.set_compliance_checklists_updated_at();

ALTER TABLE public.compliance_checklists ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "compliance_checklists_select_company_members"
  ON public.compliance_checklists
  FOR SELECT
  USING (
    company_id IN (
      SELECT roofing_company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid()
    )
    OR company_id IN (
      SELECT id FROM public.roofing_companies
      WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY IF NOT EXISTS "compliance_checklists_insert_company_members"
  ON public.compliance_checklists
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT roofing_company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid()
    )
    OR company_id IN (
      SELECT id FROM public.roofing_companies
      WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY IF NOT EXISTS "compliance_checklists_update_company_members"
  ON public.compliance_checklists
  FOR UPDATE
  USING (
    company_id IN (
      SELECT roofing_company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid()
    )
    OR company_id IN (
      SELECT id FROM public.roofing_companies
      WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT roofing_company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid()
    )
    OR company_id IN (
      SELECT id FROM public.roofing_companies
      WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY IF NOT EXISTS "compliance_checklists_delete_company_members"
  ON public.compliance_checklists
  FOR DELETE
  USING (
    company_id IN (
      SELECT roofing_company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid()
    )
    OR company_id IN (
      SELECT id FROM public.roofing_companies
      WHERE owner_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_checklists TO authenticated;


-- ============================================================
-- PART 3 — Enhance permits table for "submitted" status
-- ============================================================
-- Existing permits table (Block 253100) already handles:
-- - pending / approved / rejected / expired
-- - applied_date, issued_date, expires_on
--
-- To better represent the lifecycle described in Block 257200:
--   - pending   = draft / preparing application
--   - submitted = application sent to the city/county
--   - approved  = permit approved
--   - rejected  = permit denied
--   - expired   = approved but past expires_on (already enforced by trigger)

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_type = 'CHECK'
      AND table_schema = 'public'
      AND table_name = 'permits'
      AND constraint_name = 'permits_status_check'
  ) THEN
    ALTER TABLE public.permits DROP CONSTRAINT permits_status_check;
  END IF;
END $$;

ALTER TABLE public.permits
  ADD CONSTRAINT permits_status_check
  CHECK (status IN ('pending', 'submitted', 'approved', 'rejected', 'expired'));

COMMENT ON COLUMN public.permits.status IS
  'Status: pending (draft), submitted (filed with city), approved, rejected, expired';


-- ============================================================
-- PART 4 — Enhance inspection_reports for scheduling & types
-- ============================================================
-- We already have inspection_reports for documents + outcomes.
-- Here we add:
-- - inspection_type: decking / mid_roof / final / other
-- - scheduled_for: when inspection is scheduled (timestamptz)

ALTER TABLE public.inspection_reports
  ADD COLUMN IF NOT EXISTS inspection_type text, -- decking, mid_roof, final, other
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz;

COMMENT ON COLUMN public.inspection_reports.inspection_type IS
  'Inspection type: decking, mid_roof, final, other (Block 257200)';

COMMENT ON COLUMN public.inspection_reports.scheduled_for IS
  'Scheduled inspection datetime for city / internal inspections (Block 257200)';


-- ============================================================
-- PART 5 — View: Jobs blocked by missing permits
-- ============================================================
-- This view powers the "Job Delay Prevention System":
-- - Shows jobs where permit is REQUIRED but not approved yet.
-- - Jobs with no permit row at all count as "not_started".
--
-- NOTE:
-- - This is jobs-table (Block 99000) centric. 
-- - Roofing_jobs already has its own permit mirrors via job_permits (Block 22400).

CREATE OR REPLACE VIEW public.jobs_permit_readiness AS
SELECT
  j.id AS job_id,
  j.workspace_id,
  j.homeowner_name,
  j.address,
  j.job_type,
  j.status AS job_status,
  -- Aggregate permit info
  COALESCE(
    MAX(
      CASE 
        WHEN p.status = 'approved' THEN 3
        WHEN p.status = 'submitted' THEN 2
        WHEN p.status = 'pending' THEN 1
        WHEN p.status = 'rejected' THEN -1
        WHEN p.status = 'expired' THEN -2
        ELSE 0
      END
    ), 
    0
  ) AS permit_state_score,
  CASE
    WHEN COUNT(p.id) = 0 THEN 'not_started'
    WHEN BOOL_OR(p.status = 'approved') THEN 'approved'
    WHEN BOOL_OR(p.status = 'submitted') THEN 'submitted'
    WHEN BOOL_OR(p.status = 'pending') THEN 'pending'
    WHEN BOOL_OR(p.status = 'expired') THEN 'expired'
    WHEN BOOL_OR(p.status = 'rejected') THEN 'rejected'
    ELSE 'unknown'
  END AS permit_summary_status,
  MIN(p.applied_date) AS first_applied_date,
  MAX(p.issued_date) AS last_issued_date,
  MIN(p.expires_on) FILTER (WHERE p.status = 'approved') AS earliest_expiration
FROM public.jobs j
LEFT JOIN public.permits p ON p.job_id = j.id
GROUP BY j.id, j.workspace_id, j.homeowner_name, j.address, j.job_type, j.status;

COMMENT ON VIEW public.jobs_permit_readiness IS
  'Jobs + aggregated permit status for scheduling guardrails (Block 257200)';

-- ============================================================
-- END OF BLOCK 257200
-- ============================================================















