-- ============================================================================
-- Block 260800 — SmartSend Compliance, Legal Defense & Risk Shield v1
-- Contracts, disputes, documentation, lawsuit prevention, audit trails
-- ============================================================================
--
-- This block turns SmartSend into the legal bodycam for roofing jobs:
-- - Enforces signed contracts before work starts
-- - Creates job-level legal audit trails
-- - Centralizes OSHA / safety evidence
-- - Tracks customer disputes & claims
-- - Generates insurance defense packs
-- - Surfaces crew / sub compliance issues
-- - Computes legal risk scores and early warning alerts
--
-- NOTE ON SCOPING:
-- - "company" in the spec maps to public.roofing_companies (Block 25820).
-- - Jobs here refer to public.jobs (Job Pipeline / Production Tracking).
-- - Access is company- and team-scoped via existing membership helpers.
-- ============================================================================


-- ============================================================================
-- 1. CONTRACTS TABLE (Job-Level Contracts & Agreements)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,

  contract_type text NOT NULL
    CHECK (contract_type IN ('retail', 'insurance', 'commercial', 'supplement', 'other'))
    DEFAULT 'retail',

  status text NOT NULL
    CHECK (status IN ('draft', 'sent', 'signed', 'cancelled'))
    DEFAULT 'draft',

  signed_by text,
  signed_at timestamptz,

  document_url text,         -- final PDF / HTML contract URL
  source_contract_document_id uuid, -- optional link to contract_documents.id (Block 32711)

  version int NOT NULL DEFAULT 1,   -- version locking

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contracts_company_job
  ON public.contracts(company_id, job_id);

CREATE INDEX IF NOT EXISTS idx_contracts_job
  ON public.contracts(job_id);

CREATE INDEX IF NOT EXISTS idx_contracts_status
  ON public.contracts(status);

COMMENT ON TABLE public.contracts IS
  'Block 260800: Job-level contracts and agreements (retail / insurance / commercial) with version locking and signed document URLs.';


-- updated_at trigger (reuses shared helper from Block 259800 if present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_contracts_updated_at'
  ) THEN
    CREATE TRIGGER trg_contracts_updated_at
    BEFORE UPDATE ON public.contracts
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END;
$$;


-- ============================================================================
-- 2. LEGAL EVENTS TABLE (Disputes, Claims, Injuries, Lawsuits)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.legal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.roofing_companies(id) ON DELETE SET NULL,

  event_type text NOT NULL
    CHECK (event_type IN ('dispute', 'injury', 'claim', 'lawsuit', 'oshaaudit', 'other')),

  severity text NOT NULL
    CHECK (severity IN ('low', 'medium', 'high', 'critical'))
    DEFAULT 'medium',

  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legal_events_job_created_at
  ON public.legal_events(job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_legal_events_company
  ON public.legal_events(company_id);

CREATE INDEX IF NOT EXISTS idx_legal_events_type_severity
  ON public.legal_events(event_type, severity);

COMMENT ON TABLE public.legal_events IS
  'Block 260800: Job-level legal events (disputes, claims, injuries, lawsuits, OSHA audits) with severity and metadata.';


-- ============================================================================
-- 3. AUDIT TRAILS TABLE (Immutable Job Legal Audit Trail)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.audit_trails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.roofing_companies(id) ON DELETE SET NULL,

  action text NOT NULL,                     -- human-readable action label
  performed_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb, -- store IDs, URLs, device info, IP, etc.

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_trails_job_created_at
  ON public.audit_trails(job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_trails_performed_by
  ON public.audit_trails(performed_by_user_id);

COMMENT ON TABLE public.audit_trails IS
  'Block 260800: Immutable job-level legal audit trail (contract events, approvals, safety evidence, change orders, disputes).';


-- ============================================================================
-- 4. OSHA & SAFETY EVIDENCE VAULT
-- ============================================================================
-- Central index of OSHA-relevant evidence tied to jobs, pointing to:
-- - safety photos
-- - safety_events (Block 258200)
-- - compliance_checklists (Block 257200)
-- - training records (via training_academy, etc.)
-- This does NOT duplicate blobs; it references source rows.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.osha_evidence_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.roofing_companies(id) ON DELETE SET NULL,

  evidence_type text NOT NULL
    CHECK (evidence_type IN (
      'ppe_photo',
      'ladder_photo',
      'harness_photo',
      'safety_checklist',
      'incident_report',
      'training_record',
      'other'
    )),

  -- Optional pointer back to source table/row (job_photos, safety_events, compliance_checklists, etc.)
  source_table text,
  source_id uuid,

  file_url text,                 -- direct evidence URL when applicable
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_osha_evidence_job_type
  ON public.osha_evidence_items(job_id, evidence_type);

CREATE INDEX IF NOT EXISTS idx_osha_evidence_company
  ON public.osha_evidence_items(company_id);

COMMENT ON TABLE public.osha_evidence_items IS
  'Block 260800: Central OSHA/safety evidence index (photos, checklists, incident reports, training records) per job.';


-- ============================================================================
-- 5. CUSTOMER DISPUTE & CLAIM MANAGER
-- ============================================================================
-- Tracks homeowner complaints, warranty claims, damage accusations, refunds.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.customer_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.roofing_companies(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,

  dispute_type text NOT NULL
    CHECK (dispute_type IN ('complaint', 'warranty_claim', 'damage', 'refund_request', 'other'))
    DEFAULT 'complaint',

  status text NOT NULL
    CHECK (status IN ('open', 'in_review', 'resolved', 'escalated', 'closed_unresolved'))
    DEFAULT 'open',

  title text,
  description text,
  requested_resolution text,

  resolution_notes text,
  resolved_at timestamptz,
  resolved_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_disputes_job_created_at
  ON public.customer_disputes(job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_disputes_company_status
  ON public.customer_disputes(company_id, status);

CREATE INDEX IF NOT EXISTS idx_customer_disputes_type_status
  ON public.customer_disputes(dispute_type, status);

COMMENT ON TABLE public.customer_disputes IS
  'Block 260800: Customer dispute & claim manager (complaints, warranty claims, damage accusations, refund requests).';


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_customer_disputes_updated_at'
  ) THEN
    CREATE TRIGGER trg_customer_disputes_updated_at
    BEFORE UPDATE ON public.customer_disputes
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END;
$$;


-- ============================================================================
-- 6. INSURANCE DEFENSE PACK GENERATOR (Export Logs)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.insurance_defense_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.roofing_companies(id) ON DELETE SET NULL,

  carrier_name text,

  status text NOT NULL
    CHECK (status IN ('pending', 'generated', 'sent', 'downloaded', 'archived'))
    DEFAULT 'generated',

  pack_url text,                 -- URL to zipped/exported defense pack

  generated_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_insurance_defense_packs_job_created_at
  ON public.insurance_defense_packs(job_id, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_insurance_defense_packs_company_status
  ON public.insurance_defense_packs(company_id, status);

COMMENT ON TABLE public.insurance_defense_packs IS
  'Block 260800: Logs of generated insurance defense packs per job (photos, scope, contracts, change orders, crew logs).';


-- ============================================================================
-- 7. LEGAL RISK SCORES (Per Job / Company)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.legal_risk_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.roofing_companies(id) ON DELETE CASCADE,

  score numeric(5,2) NOT NULL CHECK (score >= 0 AND score <= 100),

  risk_level text NOT NULL
    CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),

  drivers jsonb NOT NULL DEFAULT '{}'::jsonb, -- breakdown: missing_photos, unsigned_change_orders, disputes_open, etc.

  calculated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legal_risk_scores_company_job
  ON public.legal_risk_scores(company_id, job_id, calculated_at DESC);

CREATE INDEX IF NOT EXISTS idx_legal_risk_scores_level
  ON public.legal_risk_scores(risk_level, calculated_at DESC);

COMMENT ON TABLE public.legal_risk_scores IS
  'Block 260800: Legal risk scores per job/company with JSON breakdown of risk drivers.';


-- ============================================================================
-- 8. PRE-LAWSUIT PREVENTION ALERTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.legal_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.roofing_companies(id) ON DELETE CASCADE,

  alert_type text NOT NULL,      -- e.g. angry_homeowner_messages, missing_contract, safety_gap, docs_missing

  severity text NOT NULL
    CHECK (severity IN ('low', 'medium', 'high', 'critical'))
    DEFAULT 'high',

  message text NOT NULL,         -- short human-readable summary
  recommendation text,           -- recommended next action

  resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  resolved_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legal_alerts_company_resolved
  ON public.legal_alerts(company_id, resolved, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_legal_alerts_job_created_at
  ON public.legal_alerts(job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_legal_alerts_type_severity
  ON public.legal_alerts(alert_type, severity);

COMMENT ON TABLE public.legal_alerts IS
  'Block 260800: Pre-lawsuit prevention alerts with recommendations (early warning system for at-risk jobs).';


-- ============================================================================
-- 9. ROW LEVEL SECURITY (RLS) & POLICIES
-- ============================================================================

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_trails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.osha_evidence_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_defense_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_risk_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_alerts ENABLE ROW LEVEL SECURITY;


-- Helper pattern:
-- Company-scoped tables: use roofing_company_members / has_company_access
-- Job-scoped tables: additionally respect team membership when job.team_id is set.

-- CONTRACTS: company-scoped access
CREATE POLICY "contracts_company_members_select"
  ON public.contracts
  FOR SELECT
  USING (
    company_id IN (
      SELECT roofing_company_id
      FROM public.roofing_company_members
      WHERE user_id = auth.uid()
        AND is_active = true
    )
    OR company_id IN (
      SELECT id
      FROM public.roofing_companies
      WHERE owner_id = auth.uid()
        AND is_active = true
    )
  );

CREATE POLICY "contracts_company_members_write"
  ON public.contracts
  FOR INSERT, UPDATE, DELETE
  USING (
    company_id IN (
      SELECT roofing_company_id
      FROM public.roofing_company_members
      WHERE user_id = auth.uid()
        AND is_active = true
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT roofing_company_id
      FROM public.roofing_company_members
      WHERE user_id = auth.uid()
        AND is_active = true
    )
  );


-- LEGAL EVENTS: company-scoped
CREATE POLICY "legal_events_company_members_all"
  ON public.legal_events
  FOR ALL
  USING (
    company_id IN (
      SELECT roofing_company_id
      FROM public.roofing_company_members
      WHERE user_id = auth.uid()
        AND is_active = true
    )
    OR company_id IN (
      SELECT id
      FROM public.roofing_companies
      WHERE owner_id = auth.uid()
        AND is_active = true
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT roofing_company_id
      FROM public.roofing_company_members
      WHERE user_id = auth.uid()
        AND is_active = true
    )
    OR company_id IN (
      SELECT id
      FROM public.roofing_companies
      WHERE owner_id = auth.uid()
        AND is_active = true
    )
  );


-- AUDIT TRAILS: job + team scoped (mirror job_stage_events policy style)
CREATE POLICY "audit_trails_team_member_all"
  ON public.audit_trails
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = audit_trails.job_id
        AND tm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = audit_trails.job_id
        AND tm.user_id = auth.uid()
    )
  );


-- OSHA EVIDENCE: company-scoped
CREATE POLICY "osha_evidence_company_members_all"
  ON public.osha_evidence_items
  FOR ALL
  USING (
    company_id IN (
      SELECT roofing_company_id
      FROM public.roofing_company_members
      WHERE user_id = auth.uid()
        AND is_active = true
    )
    OR company_id IN (
      SELECT id
      FROM public.roofing_companies
      WHERE owner_id = auth.uid()
        AND is_active = true
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT roofing_company_id
      FROM public.roofing_company_members
      WHERE user_id = auth.uid()
        AND is_active = true
    )
    OR company_id IN (
      SELECT id
      FROM public.roofing_companies
      WHERE owner_id = auth.uid()
        AND is_active = true
    )
  );


-- CUSTOMER DISPUTES: company-scoped
CREATE POLICY "customer_disputes_company_members_all"
  ON public.customer_disputes
  FOR ALL
  USING (
    company_id IN (
      SELECT roofing_company_id
      FROM public.roofing_company_members
      WHERE user_id = auth.uid()
        AND is_active = true
    )
    OR company_id IN (
      SELECT id
      FROM public.roofing_companies
      WHERE owner_id = auth.uid()
        AND is_active = true
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT roofing_company_id
      FROM public.roofing_company_members
      WHERE user_id = auth.uid()
        AND is_active = true
    )
    OR company_id IN (
      SELECT id
      FROM public.roofing_companies
      WHERE owner_id = auth.uid()
        AND is_active = true
    )
  );


-- INSURANCE DEFENSE PACKS: company-scoped
CREATE POLICY "insurance_defense_packs_company_members_all"
  ON public.insurance_defense_packs
  FOR ALL
  USING (
    company_id IN (
      SELECT roofing_company_id
      FROM public.roofing_company_members
      WHERE user_id = auth.uid()
        AND is_active = true
    )
    OR company_id IN (
      SELECT id
      FROM public.roofing_companies
      WHERE owner_id = auth.uid()
        AND is_active = true
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT roofing_company_id
      FROM public.roofing_company_members
      WHERE user_id = auth.uid()
        AND is_active = true
    )
    OR company_id IN (
      SELECT id
      FROM public.roofing_companies
      WHERE owner_id = auth.uid()
        AND is_active = true
    )
  );


-- LEGAL RISK SCORES: company-scoped, read-heavy
CREATE POLICY "legal_risk_scores_company_members_select"
  ON public.legal_risk_scores
  FOR SELECT
  USING (
    company_id IN (
      SELECT roofing_company_id
      FROM public.roofing_company_members
      WHERE user_id = auth.uid()
        AND is_active = true
    )
    OR company_id IN (
      SELECT id
      FROM public.roofing_companies
      WHERE owner_id = auth.uid()
        AND is_active = true
    )
  );

CREATE POLICY "legal_risk_scores_company_members_write"
  ON public.legal_risk_scores
  FOR INSERT, UPDATE, DELETE
  USING (
    company_id IN (
      SELECT roofing_company_id
      FROM public.roofing_company_members
      WHERE user_id = auth.uid()
        AND is_active = true
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT roofing_company_id
      FROM public.roofing_company_members
      WHERE user_id = auth.uid()
        AND is_active = true
    )
  );


-- LEGAL ALERTS: company-scoped
CREATE POLICY "legal_alerts_company_members_all"
  ON public.legal_alerts
  FOR ALL
  USING (
    company_id IN (
      SELECT roofing_company_id
      FROM public.roofing_company_members
      WHERE user_id = auth.uid()
        AND is_active = true
    )
    OR company_id IN (
      SELECT id
      FROM public.roofing_companies
      WHERE owner_id = auth.uid()
        AND is_active = true
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT roofing_company_id
      FROM public.roofing_company_members
      WHERE user_id = auth.uid()
        AND is_active = true
    )
    OR company_id IN (
      SELECT id
      FROM public.roofing_companies
      WHERE owner_id = auth.uid()
        AND is_active = true
    )
  );


-- ============================================================================
-- 10. GRANTS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contracts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.legal_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_trails TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.osha_evidence_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_disputes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insurance_defense_packs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.legal_risk_scores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.legal_alerts TO authenticated;


-- ============================================================================
-- END Block 260800 — Compliance, Legal Defense & Risk Shield v1
-- ============================================================================













