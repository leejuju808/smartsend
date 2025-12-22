-- =========================================================
-- Block 258800 — SmartSend Multi-Office & Franchise System v1
-- (Branches • Territories • P&L per Office • Enterprise Rollups)
-- =========================================================
--
-- This block hardens the existing multi-company + multi-branch engine into a
-- true multi-office + franchise system:
-- - Normalized branch territories (ZIP / county / radius-friendly)
-- - Branch-level financial snapshots (P&L per office)
-- - Cleaner branch assignments surface
-- - Lead routing that respects explicit territory maps first
-- - Owner / HQ views that can rank branches by profit and margin
--
-- It builds on:
-- - Block 25820  — Multi-Company Support (roofing_companies / markets)
-- - Block 249000 — Enterprise Mode
-- - Block 254500 — Enterprise Command Center (branches v1)
-- - Block 255600 — Multi-Office & Franchise Engine v1 (branches v2, HQ views)
-- - Block 257100 — Accounting & Billing Engine v1 (invoices, job_costs, AR)
--
-- ============================================================
-- 1. BRANCH ASSIGNMENTS SURFACE (VIEW ON TOP OF branch_users)
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.views
    WHERE table_schema = 'public'
      AND table_name = 'branch_assignments'
  ) THEN
    -- Simple surface that matches the "branch_assignments" mental model:
    -- one row per (user, branch, role), created_at = when assigned.
    CREATE VIEW public.branch_assignments AS
    SELECT
      bu.id,
      bu.user_id,
      bu.branch_id,
      bu.role,
      bu.assigned_at AS created_at
    FROM public.branch_users bu
    WHERE bu.is_active = true;
  END IF;
END $$;

COMMENT ON VIEW public.branch_assignments IS
  'Logical view of branch → user assignments (id, user_id, branch_id, role, created_at) backed by branch_users (Block 258800)';

-- ============================================================
-- 2. BRANCH_TERRITORIES (ZIP / COUNTY / RADIUS-FRIENDLY)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.branch_territories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,

  -- Territory unit (normalized, one row per ZIP / county / region)
  zip_code text,
  city text,
  county text,
  state text,

  -- Optional radius-based service definition (for future geo work)
  service_radius_miles numeric,
  center_latitude numeric,
  center_longitude numeric,

  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_branch_territories_branch
  ON public.branch_territories(branch_id, zip_code);

CREATE INDEX IF NOT EXISTS idx_branch_territories_zip
  ON public.branch_territories(zip_code);

CREATE INDEX IF NOT EXISTS idx_branch_territories_city_state
  ON public.branch_territories(city, state);

CREATE INDEX IF NOT EXISTS idx_branch_territories_county_state
  ON public.branch_territories(county, state);

-- Enforce one row per (branch, zip) when zip_code is present
CREATE UNIQUE INDEX IF NOT EXISTS uq_branch_territories_branch_zip
  ON public.branch_territories(branch_id, zip_code)
  WHERE zip_code IS NOT NULL;

COMMENT ON TABLE public.branch_territories IS
  'Normalized branch territories (ZIP / county / radius-friendly) for lead routing and territory maps (Block 258800)';

-- Optional backfill from existing branches.territory_zip_codes so existing
-- customers get immediate benefit without any manual work.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'branches'
      AND column_name = 'territory_zip_codes'
  ) THEN
    INSERT INTO public.branch_territories (branch_id, zip_code, created_at)
    SELECT
      b.id,
      zip,
      now()
    FROM public.branches b,
      LATERAL unnest(COALESCE(b.territory_zip_codes, ARRAY[]::text[])) AS zip
    ON CONFLICT (branch_id, zip_code) DO NOTHING;
  END IF;
END $$;

-- ============================================================
-- 3. BRANCH_FINANCIALS (PER-OFFICE P&L SNAPSHOTS)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.branch_financials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,

  -- Period this snapshot covers (inclusive start, inclusive end)
  period_start date NOT NULL,
  period_end date NOT NULL,

  -- Core P&L numbers
  revenue numeric(14,2) DEFAULT 0,   -- Recognized revenue in this period
  cost numeric(14,2) DEFAULT 0,      -- Direct job costs in this period

  -- Derived metrics (computed so dashboards stay fast and simple)
  profit numeric(14,2)
    GENERATED ALWAYS AS (revenue - cost) STORED,
  margin numeric(5,2)
    GENERATED ALWAYS AS (
      CASE
        WHEN revenue > 0 THEN ROUND(((revenue - cost) / revenue) * 100::numeric, 2)
        ELSE 0
      END
    ) STORED,

  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),

  CONSTRAINT uq_branch_financials_period UNIQUE (branch_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_branch_financials_branch_period
  ON public.branch_financials(branch_id, period_start DESC, period_end DESC);

COMMENT ON TABLE public.branch_financials IS
  'Branch-level P&L snapshots (revenue, cost, profit, margin) per period (Block 258800)';

-- ============================================================
-- 4. HELPER FUNCTION: CALCULATE BRANCH P&L FOR A PERIOD
-- ============================================================

-- This function rolls up:
-- - Revenue from invoices attached to jobs in a branch
-- - Cost from job_costs attached to jobs in a branch
--
-- It is intentionally simple and opinionated:
-- - Revenue: sum of invoice.total_amount, status != cancelled, invoice_date in range
-- - Cost:   sum of job_costs.total_cost, job.created_at::date in range
--
-- Edge functions / cron can call this nightly to keep branch_financials hot.

CREATE OR REPLACE FUNCTION public.calculate_branch_financials(
  p_branch_id uuid,
  p_period_start date,
  p_period_end date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_revenue numeric(14,2) := 0;
  v_cost numeric(14,2) := 0;
  v_financial_id uuid;
BEGIN
  -- Guard: invalid range
  IF p_period_end < p_period_start THEN
    RAISE EXCEPTION 'period_end (%) must be >= period_start (%)', p_period_end, p_period_start;
  END IF;

  -- Revenue from invoices linked to jobs in this branch
  -- invoices.job_id -> jobs.id -> jobs.branch_id
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'invoices'
  ) THEN
    SELECT
      COALESCE(SUM(i.total_amount), 0)
    INTO v_revenue
    FROM public.invoices i
    JOIN public.jobs j ON j.id = i.job_id
    WHERE j.branch_id = p_branch_id
      AND i.status <> 'cancelled'
      AND i.invoice_date >= p_period_start
      AND i.invoice_date <= p_period_end;
  END IF;

  -- Cost from job_costs for jobs in this branch
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'job_costs'
  ) THEN
    SELECT
      COALESCE(SUM(jc.total_cost), 0)
    INTO v_cost
    FROM public.job_costs jc
    JOIN public.jobs j ON j.id = jc.job_id
    WHERE j.branch_id = p_branch_id
      AND j.created_at::date >= p_period_start
      AND j.created_at::date <= p_period_end;
  END IF;

  -- Upsert into branch_financials
  INSERT INTO public.branch_financials (
    branch_id,
    period_start,
    period_end,
    revenue,
    cost,
    metadata
  )
  VALUES (
    p_branch_id,
    p_period_start,
    p_period_end,
    COALESCE(v_revenue, 0),
    COALESCE(v_cost, 0),
    jsonb_build_object(
      'source', 'calculate_branch_financials',
      'calculated_at', now()
    )
  )
  ON CONFLICT (branch_id, period_start, period_end)
  DO UPDATE SET
    revenue = EXCLUDED.revenue,
    cost = EXCLUDED.cost,
    metadata = EXCLUDED.metadata,
    created_at = now()
  RETURNING id INTO v_financial_id;

  RETURN v_financial_id;
END;
$$;

COMMENT ON FUNCTION public.calculate_branch_financials(uuid, date, date) IS
  'Calculates and upserts a branch_financials P&L snapshot for a given branch + period (Block 258800)';

-- ============================================================
-- 5. VIEW: BRANCH FINANCIAL DASHBOARD (PER BRANCH / PERIOD)
-- ============================================================

CREATE OR REPLACE VIEW public.v_branch_financials_dashboard AS
SELECT
  b.id AS branch_id,
  b.name AS branch_name,
  b.city,
  b.state,
  COALESCE(b.roofing_company_id, b.company_id) AS company_id,
  bf.period_start,
  bf.period_end,
  bf.revenue,
  bf.cost,
  bf.profit,
  bf.margin,
  -- Simple health flags
  (bf.margin < 20)::boolean AS margin_at_risk,
  (bf.revenue = 0 AND bf.cost > 0)::boolean AS negative_pnl_flag
FROM public.branch_financials bf
JOIN public.branches b ON b.id = bf.branch_id;

COMMENT ON VIEW public.v_branch_financials_dashboard IS
  'Branch-level P&L dashboard combining branches + branch_financials (Block 258800)';

-- ============================================================
-- 6. ENFORCE CREW ↔ JOB BRANCH CONSISTENCY
-- ============================================================

-- Crews assigned to one branch should not be scheduled on jobs for another
-- branch. This trigger:
-- - Auto-fills roofing_jobs.branch_id from the crew's branch when missing
-- - Throws a hard error if someone tries to assign a crew to a job in a
--   different branch (prevents Dallas crew on Fort Worth job)

CREATE OR REPLACE FUNCTION public.enforce_roofing_job_branch_consistency()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_crew_branch_id uuid;
BEGIN
  -- Only care when a crew is attached
  IF NEW.crew_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT branch_id
  INTO v_crew_branch_id
  FROM public.crews
  WHERE id = NEW.crew_id;

  -- No branch on crew → nothing to enforce
  IF v_crew_branch_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- If job has no branch yet, inherit from crew
  IF NEW.branch_id IS NULL THEN
    NEW.branch_id := v_crew_branch_id;
    RETURN NEW;
  END IF;

  -- If branches conflict, block the assignment
  IF NEW.branch_id IS DISTINCT FROM v_crew_branch_id THEN
    RAISE EXCEPTION
      'Crew % belongs to branch %, but job is in branch % — cross-branch assignment is not allowed',
      NEW.crew_id, v_crew_branch_id, NEW.branch_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'roofing_jobs'
  ) THEN
    DROP TRIGGER IF EXISTS trg_enforce_roofing_job_branch_consistency ON public.roofing_jobs;
    CREATE TRIGGER trg_enforce_roofing_job_branch_consistency
      BEFORE INSERT OR UPDATE OF crew_id, branch_id
      ON public.roofing_jobs
      FOR EACH ROW
      EXECUTE FUNCTION public.enforce_roofing_job_branch_consistency();
  END IF;
END $$;

-- Also ensure invoices understand branch_ids via their jobs so AR / P&L
-- segmentation is clean and queryable.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'invoices'
  ) THEN
    ALTER TABLE public.invoices
      ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;

    CREATE INDEX IF NOT EXISTS idx_invoices_branch
      ON public.invoices(branch_id) WHERE branch_id IS NOT NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sync_invoice_branch_from_job()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_job_branch_id uuid;
BEGIN
  IF NEW.job_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT branch_id
  INTO v_job_branch_id
  FROM public.jobs
  WHERE id = NEW.job_id;

  IF v_job_branch_id IS NOT NULL THEN
    NEW.branch_id := v_job_branch_id;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'invoices'
  ) THEN
    DROP TRIGGER IF EXISTS trg_sync_invoice_branch_from_job ON public.invoices;
    CREATE TRIGGER trg_sync_invoice_branch_from_job
      BEFORE INSERT OR UPDATE OF job_id
      ON public.invoices
      FOR EACH ROW
      EXECUTE FUNCTION public.sync_invoice_branch_from_job();
  END IF;
END $$;

-- ============================================================
-- 7. UPGRADE LEAD ROUTING TO USE BRANCH_TERRITORIES FIRST
-- ============================================================

-- Existing function from Block 255600:
--   route_lead_to_branch_v2(p_company_id, p_zip_code, p_county, p_city, p_state, p_latitude, p_longitude)
-- We extend it so that:
--   1) Exact ZIP matches in branch_territories win first
--   2) Then existing branches.territory_zip_codes / counties logic kicks in

CREATE OR REPLACE FUNCTION public.route_lead_to_branch_v2(
  p_company_id uuid,
  p_zip_code text DEFAULT NULL,
  p_county text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_state text DEFAULT NULL,
  p_latitude numeric DEFAULT NULL,
  p_longitude numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_branch_id uuid;
  v_branch_record record;
  v_best_branch_id uuid;
BEGIN
  -- 1) Exact ZIP match in branch_territories (normalized map)
  IF p_zip_code IS NOT NULL THEN
    SELECT bt.branch_id
    INTO v_branch_id
    FROM public.branch_territories bt
    JOIN public.branches b ON b.id = bt.branch_id
    WHERE (b.roofing_company_id = p_company_id OR b.company_id = p_company_id)
      AND b.is_active = true
      AND bt.zip_code = p_zip_code
    ORDER BY b.created_at
    LIMIT 1;

    IF v_branch_id IS NOT NULL THEN
      RETURN v_branch_id;
    END IF;
  END IF;

  -- 2) ZIP code matching via branches.territory_zip_codes (existing behavior)
  IF p_zip_code IS NOT NULL THEN
    SELECT b.id
    INTO v_branch_id
    FROM public.branches b
    WHERE (b.roofing_company_id = p_company_id OR b.company_id = p_company_id)
      AND b.is_active = true
      AND (
        (b.territory_zip_codes IS NOT NULL AND p_zip_code = ANY(b.territory_zip_codes))
        OR b.territory_zip_codes IS NULL
      )
    ORDER BY
      CASE WHEN b.territory_zip_codes IS NOT NULL AND p_zip_code = ANY(b.territory_zip_codes) THEN 0 ELSE 1 END,
      b.created_at
    LIMIT 1;

    IF v_branch_id IS NOT NULL THEN
      RETURN v_branch_id;
    END IF;
  END IF;

  -- 3) County matching (branches.territory_counties)
  IF p_county IS NOT NULL THEN
    SELECT b.id
    INTO v_branch_id
    FROM public.branches b
    WHERE (b.roofing_company_id = p_company_id OR b.company_id = p_company_id)
      AND b.is_active = true
      AND (
        (b.territory_counties IS NOT NULL AND p_county = ANY(b.territory_counties))
        OR b.territory_counties IS NULL
      )
    ORDER BY
      CASE WHEN b.territory_counties IS NOT NULL AND p_county = ANY(b.territory_counties) THEN 0 ELSE 1 END,
      b.created_at
    LIMIT 1;

    IF v_branch_id IS NOT NULL THEN
      RETURN v_branch_id;
    END IF;
  END IF;

  -- 4) Simple city/state fallbacks (same as previous logic)
  IF p_city IS NOT NULL AND p_state IS NOT NULL THEN
    SELECT b.id
    INTO v_branch_id
    FROM public.branches b
    WHERE (b.roofing_company_id = p_company_id OR b.company_id = p_company_id)
      AND b.is_active = true
      AND b.city = p_city
      AND b.state = p_state
    ORDER BY b.created_at
    LIMIT 1;

    IF v_branch_id IS NOT NULL THEN
      RETURN v_branch_id;
    END IF;
  END IF;

  -- 5) Final fallback: first active branch for company
  SELECT b.id
  INTO v_branch_id
  FROM public.branches b
  WHERE (b.roofing_company_id = p_company_id OR b.company_id = p_company_id)
    AND b.is_active = true
  ORDER BY b.created_at
  LIMIT 1;

  RETURN v_branch_id;
END;
$$;

COMMENT ON FUNCTION public.route_lead_to_branch_v2(uuid, text, text, text, text, numeric, numeric) IS
  'Routes leads to branches by normalized territories (branch_territories ZIP first, then branches.territory_* fallbacks) (Block 258800 upgrade)';

-- ============================================================
-- 8. ROW LEVEL SECURITY FOR NEW TABLES
-- ============================================================

-- We reuse has_branch_access_v2 from Block 255600 so that:
-- - Branch members see only their own territories and P&L
-- - HQ owners can see all branches in their company

ALTER TABLE public.branch_territories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_financials ENABLE ROW LEVEL SECURITY;

-- Branch territories: anyone with branch access can read / write
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'branch_territories'
      AND policyname = 'branch_territories_select'
  ) THEN
    CREATE POLICY "branch_territories_select"
      ON public.branch_territories
      FOR SELECT
      USING (public.has_branch_access_v2(branch_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'branch_territories'
      AND policyname = 'branch_territories_all'
  ) THEN
    CREATE POLICY "branch_territories_all"
      ON public.branch_territories
      FOR ALL
      USING (public.has_branch_access_v2(branch_id))
      WITH CHECK (public.has_branch_access_v2(branch_id));
  END IF;
END $$;

-- Branch financials: readable by branch members; writes are system-driven
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'branch_financials'
      AND policyname = 'branch_financials_select'
  ) THEN
    CREATE POLICY "branch_financials_select"
      ON public.branch_financials
      FOR SELECT
      USING (public.has_branch_access_v2(branch_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'branch_financials'
      AND policyname = 'branch_financials_all_service'
  ) THEN
    -- Allow service_role (and internal jobs) to upsert financials freely.
    CREATE POLICY "branch_financials_all_service"
      ON public.branch_financials
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- ============================================================
-- 9. GRANTS
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.branch_territories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branch_financials TO authenticated;

GRANT SELECT ON public.v_branch_financials_dashboard TO authenticated;
GRANT SELECT ON public.branch_assignments TO authenticated;

GRANT EXECUTE ON FUNCTION public.calculate_branch_financials(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.route_lead_to_branch_v2(uuid, text, text, text, text, numeric, numeric) TO authenticated;














