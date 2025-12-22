-- ============================================================================
-- Block 262400 — SmartSend Multi-Location, Franchise & Scale Control Engine v1
-- (Multi-Branch · Franchise-Ready · Zero-Chaos Scaling)
-- ============================================================================
--
-- This block implements the "One Brain / Many Branches" engine:
--   - Parent → Branch hierarchy per roofing company
--   - Central rules with auditable local overrides
--   - Branch-level P&L / performance and health scoring
--   - Expansion readiness signals
--   - HQ / owner scale dashboards over branches
--
-- IMPORTANT MAPPING:
--   - "company" in the spec maps to either:
--       * public.roofing_companies (if present in this project), OR
--       * public.companies        (fallback / generic company model).
--   - We follow the flexible FK pattern from Block 261400 (supplier_rebates).
--
-- This migration deliberately:
--   - Keeps the core schema small and opinionated (branches, rules, metrics)
--   - Uses JSONB for metrics so we can iterate on health / P&L formulas
--   - Exposes summary views that power:
--       * Branch-level P&L & performance
--       * Branch health scoring
--       * Expansion readiness recommendations
--       * HQ command center / owner scale dashboard
--


-- ============================================================================
-- 1. TABLE: branches (per-company locations, HQ + field branches)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Company / parent org that owns this branch.
  -- We attach the FK dynamically to either roofing_companies or companies below.
  company_id uuid,

  -- Human-facing branch name (e.g. "Dallas", "Austin North", "HQ")
  name text NOT NULL,

  -- Short code used across systems (e.g. "DAL", "AUS-N", "HQ").
  code text,

  -- Optional pointer to a parent branch to support sub-branches / territories.
  parent_branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,

  -- Branch model: company-owned vs franchise vs licensee.
  branch_model text NOT NULL DEFAULT 'owned'
    CHECK (branch_model IN ('owned', 'franchise', 'licensed')),

  -- Whether this row represents the "HQ" brain for the company.
  is_hq boolean NOT NULL DEFAULT false,

  -- High-level lifecycle state.
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'closed')),

  -- Location & territory metadata (city, state, timezone, service area, etc.)
  -- Example:
  -- {
  --   "city": "Dallas",
  --   "state": "TX",
  --   "timezone": "America/Chicago",
  --   "service_area": ["Dallas", "Plano", "Frisco"]
  -- }
  location jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Arbitrary branch-level configuration:
  --   - "shared_services": ["marketing","accounting","hr","procurement"]
  --   - "playbook_version": "2025-01"
  --   - tags, notes, etc.
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Attach company_id FK depending on which company table exists in this project.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'branches'
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name = 'branches_company_id_fkey'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'roofing_companies'
    ) THEN
      ALTER TABLE public.branches
        ADD CONSTRAINT branches_company_id_fkey
        FOREIGN KEY (company_id) REFERENCES public.roofing_companies(id) ON DELETE CASCADE;
    ELSIF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'companies'
    ) THEN
      ALTER TABLE public.branches
        ADD CONSTRAINT branches_company_id_fkey
        FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_branches_company_status
  ON public.branches (company_id, status);

CREATE INDEX IF NOT EXISTS idx_branches_parent_branch
  ON public.branches (parent_branch_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_branches_company_code
  ON public.branches (company_id, code)
  WHERE code IS NOT NULL;

COMMENT ON TABLE public.branches IS
  'Block 262400: Per-company branches (HQ + locations) with hierarchy, franchise model, and shared services metadata.';


-- ============================================================================
-- 2. TABLE: branch_rules (HQ standards + local overrides)
-- ============================================================================
-- Encodes the "one operating brain" ruleset:
--   - HQ sets master rules (pricing floors, safety, SOPs, branding, etc.)
--   - Branches can propose overrides that are approved or denied and logged.
--   - Everything is stored as JSON definitions so AI + backend can reason on it.

CREATE TABLE IF NOT EXISTS public.branch_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,

  -- High-level category for the rule.
  -- Example values: 'pricing', 'safety', 'hiring', 'branding', 'sop', 'compliance'.
  rule_type text NOT NULL,

  -- Level the rule is intended to operate at:
  --   - 'hq'     : company-wide standard (usually attached to the HQ branch)
  --   - 'branch' : branch-specific override or local rule
  level text NOT NULL DEFAULT 'branch'
    CHECK (level IN ('hq', 'branch')),

  -- JSON rule definition. Examples:
  --   - pricing floors by product/market
  --   - safety checklists
  --   - sales/inspection flows
  rule jsonb NOT NULL,

  -- If this is an override of a master/HQ rule, link back to the parent.
  override_of uuid REFERENCES public.branch_rules(id) ON DELETE SET NULL,

  -- Whether branches under this rule are allowed to propose overrides.
  override_allowed boolean NOT NULL DEFAULT false,

  -- Simple lifecycle + approval tracking.
  --   - 'draft'      : proposed, not yet reviewed
  --   - 'active'     : currently enforced
  --   - 'rejected'   : override request denied
  --   - 'superseded' : replaced by a newer rule
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'rejected', 'superseded')),

  -- Who requested / approved the rule or override (optional; for audit).
  requested_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at timestamptz,

  -- Freeform notes or reason for the override ("Austin storm pricing exception").
  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_branch_rules_branch_type_status
  ON public.branch_rules (branch_id, rule_type, status);

CREATE INDEX IF NOT EXISTS idx_branch_rules_override_of
  ON public.branch_rules (override_of)
  WHERE override_of IS NOT NULL;

COMMENT ON TABLE public.branch_rules IS
  'Block 262400: HQ standards and branch-level overrides for pricing, safety, SOPs, and other operating rules.';


-- ============================================================================
-- 3. TABLE: branch_metrics (branch-level P&L, performance & health)
-- ============================================================================
-- Stores time-bucketed metrics per branch. This powers:
--   - Branch-level P&L snapshots (revenue, EBITDA, margin, overhead allocations)
--   - Operational performance (close rate, cycle time, callbacks, safety incidents)
--   - Health scoring (single 0–100 score + issue list)
--   - Expansion readiness (capacity utilization, backlog, market coverage)
--
-- We keep the shape flexible via JSON, but add typed columns for querying.

CREATE TABLE IF NOT EXISTS public.branch_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,

  -- Metric category describes what this row represents:
  --   - 'financial' : P&L snapshots
  --   - 'operational' : production / sales KPIs
  --   - 'health' : health scores + issue lists
  --   - 'expansion' : expansion readiness signals
  metric_category text NOT NULL DEFAULT 'operational'
    CHECK (metric_category IN ('financial', 'operational', 'health', 'expansion')),

  -- Optional label within the category, e.g. 'pnl', 'capacity', 'health_score'.
  metric_label text,

  -- Time window this metric covers.
  period_start date NOT NULL,
  period_end   date,

  -- Granularity of the period (day, week, month, quarter, year, snapshot).
  granularity text NOT NULL DEFAULT 'month'
    CHECK (granularity IN ('day', 'week', 'month', 'quarter', 'year', 'snapshot')),

  -- Raw metric payload. Example for `financial` / 'pnl':
  -- {
  --   "revenue": 14200000,
  --   "ebitda": 2550000,
  --   "ebitda_margin": 18.0,
  --   "overhead_allocated": 320000
  -- }
  -- Example for `health`:
  -- {
  --   "health_score": 82,
  --   "issues": ["low_close_rate", "high_callbacks"]
  -- }
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Avoid accidental duplicates for the same branch + period + category + label.
  CONSTRAINT branch_metrics_unique_period UNIQUE (branch_id, metric_category, metric_label, period_start, COALESCE(period_end, period_start))
);

CREATE INDEX IF NOT EXISTS idx_branch_metrics_branch_category_period
  ON public.branch_metrics (branch_id, metric_category, period_start DESC);

COMMENT ON TABLE public.branch_metrics IS
  'Block 262400: Time-bucketed branch-level metrics (financial, operational, health, expansion) backing P&L and scorecards.';


-- ============================================================================
-- 4. TIMESTAMP TRIGGERS (updated_at helpers)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'update_updated_at_column'
      AND pg_function_is_visible(oid)
  ) THEN
    CREATE OR REPLACE FUNCTION public.update_updated_at_column()
    RETURNS trigger AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_branches_updated_at ON public.branches;
CREATE TRIGGER trg_branches_updated_at
BEFORE UPDATE ON public.branches
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_branch_rules_updated_at ON public.branch_rules;
CREATE TRIGGER trg_branch_rules_updated_at
BEFORE UPDATE ON public.branch_rules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_branch_metrics_updated_at ON public.branch_metrics;
CREATE TRIGGER trg_branch_metrics_updated_at
BEFORE UPDATE ON public.branch_metrics
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================================
-- 5. VIEWS: Branch health, expansion signals & HQ command center
-- ============================================================================

-- 5.1 Latest health snapshot per branch
CREATE OR REPLACE VIEW public.branch_health_scores AS
SELECT DISTINCT ON (bm.branch_id)
  bm.branch_id,
  b.company_id,
  b.name AS branch_name,
  b.code AS branch_code,
  b.is_hq,
  b.branch_model,
  b.status,
  bm.period_start,
  bm.period_end,
  bm.granularity,
  (bm.metrics->>'health_score')::numeric AS health_score,
  bm.metrics->'issues' AS issues,
  bm.created_at AS snapshot_created_at
FROM public.branch_metrics bm
JOIN public.branches b ON b.id = bm.branch_id
WHERE bm.metric_category = 'health'
ORDER BY bm.branch_id, bm.period_start DESC, bm.created_at DESC;

COMMENT ON VIEW public.branch_health_scores IS
  'Block 262400: Latest health score and issues per branch (0–100 + issue list) powering Branch Health Scoring.';


-- 5.2 Latest expansion readiness signal per branch
CREATE OR REPLACE VIEW public.branch_expansion_signals AS
SELECT DISTINCT ON (bm.branch_id)
  bm.branch_id,
  b.company_id,
  b.name AS branch_name,
  b.code AS branch_code,
  b.is_hq,
  bm.period_start,
  bm.period_end,
  bm.granularity,
  COALESCE((bm.metrics->>'expansion_ready')::boolean, false) AS expansion_ready,
  bm.metrics->>'expansion_reason' AS expansion_reason,
  bm.metrics->>'recommended_market' AS recommended_market,
  bm.metrics->>'capacity_utilization' AS capacity_utilization,
  bm.metrics->>'backlog_weeks' AS backlog_weeks,
  bm.created_at AS snapshot_created_at
FROM public.branch_metrics bm
JOIN public.branches b ON b.id = bm.branch_id
WHERE bm.metric_category = 'expansion'
ORDER BY bm.branch_id, bm.period_start DESC, bm.created_at DESC;

COMMENT ON VIEW public.branch_expansion_signals IS
  'Block 262400: Latest expansion readiness signal per branch (capacity, backlog, recommended next market).';


-- 5.3 Latest financial P&L snapshot per branch
CREATE OR REPLACE VIEW public.branch_pnl_snapshots AS
SELECT DISTINCT ON (bm.branch_id)
  bm.branch_id,
  b.company_id,
  b.name AS branch_name,
  b.code AS branch_code,
  b.is_hq,
  bm.period_start,
  bm.period_end,
  bm.granularity,
  (bm.metrics->>'revenue')::numeric        AS revenue,
  (bm.metrics->>'ebitda')::numeric         AS ebitda,
  (bm.metrics->>'ebitda_margin')::numeric  AS ebitda_margin,
  (bm.metrics->>'overhead_allocated')::numeric AS overhead_allocated,
  bm.created_at AS snapshot_created_at
FROM public.branch_metrics bm
JOIN public.branches b ON b.id = bm.branch_id
WHERE bm.metric_category = 'financial'
ORDER BY bm.branch_id, bm.period_start DESC, bm.created_at DESC;

COMMENT ON VIEW public.branch_pnl_snapshots IS
  'Block 262400: Latest branch-level P&L snapshot (revenue, EBITDA, margin, overhead) per branch.';


-- 5.4 HQ / owner command-center summary across branches
CREATE OR REPLACE VIEW public.branch_command_center_summary AS
SELECT
  b.company_id,
  b.id AS branch_id,
  b.name AS branch_name,
  b.code AS branch_code,
  b.is_hq,
  b.branch_model,
  b.status,
  b.created_at,

  -- Financial snapshot
  fp.revenue,
  fp.ebitda,
  fp.ebitda_margin,

  -- Health snapshot
  fh.health_score,
  fh.issues,

  -- Expansion readiness
  fe.expansion_ready,
  fe.expansion_reason,
  fe.recommended_market
FROM public.branches b
LEFT JOIN LATERAL (
  SELECT
    (bm.metrics->>'revenue')::numeric       AS revenue,
    (bm.metrics->>'ebitda')::numeric        AS ebitda,
    (bm.metrics->>'ebitda_margin')::numeric AS ebitda_margin
  FROM public.branch_metrics bm
  WHERE bm.branch_id = b.id
    AND bm.metric_category = 'financial'
  ORDER BY bm.period_start DESC, bm.created_at DESC
  LIMIT 1
) fp ON TRUE
LEFT JOIN LATERAL (
  SELECT
    (bm.metrics->>'health_score')::numeric AS health_score,
    bm.metrics->'issues' AS issues
  FROM public.branch_metrics bm
  WHERE bm.branch_id = b.id
    AND bm.metric_category = 'health'
  ORDER BY bm.period_start DESC, bm.created_at DESC
  LIMIT 1
) fh ON TRUE
LEFT JOIN LATERAL (
  SELECT
    COALESCE((bm.metrics->>'expansion_ready')::boolean, false) AS expansion_ready,
    bm.metrics->>'expansion_reason' AS expansion_reason,
    bm.metrics->>'recommended_market' AS recommended_market
  FROM public.branch_metrics bm
  WHERE bm.branch_id = b.id
    AND bm.metric_category = 'expansion'
  ORDER BY bm.period_start DESC, bm.created_at DESC
  LIMIT 1
) fe ON TRUE;

COMMENT ON VIEW public.branch_command_center_summary IS
  'Block 262400: HQ/owner command-center summary per branch (status, P&L, health, expansion readiness).';


GRANT SELECT ON public.branch_health_scores TO authenticated;
GRANT SELECT ON public.branch_expansion_signals TO authenticated;
GRANT SELECT ON public.branch_pnl_snapshots TO authenticated;
GRANT SELECT ON public.branch_command_center_summary TO authenticated;


-- ============================================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
-- We mirror the pattern used in other enterprise blocks:
--   - service_role: full access for backend + AI engines
--   - authenticated: read-only; writes mediated by backend

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_metrics ENABLE ROW LEVEL SECURITY;

-- service_role: full control
CREATE POLICY "branches_service_role_all" ON public.branches
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "branch_rules_service_role_all" ON public.branch_rules
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "branch_metrics_service_role_all" ON public.branch_metrics
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- authenticated: read-only
CREATE POLICY "branches_select_authenticated" ON public.branches
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "branch_rules_select_authenticated" ON public.branch_rules
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "branch_metrics_select_authenticated" ON public.branch_metrics
  FOR SELECT TO authenticated
  USING (true);


-- ============================================================================
-- 7. END Block 262400 — Multi-Location, Franchise & Scale Control Engine v1
-- ============================================================================













