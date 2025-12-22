-- ============================================================
-- Block 258500 — SmartSend Insurance Supplement Engine v1
-- Core supplement tracking schema (per job)
-- ============================================================

-- This migration adds simple, job-centric supplement tables that
-- everything else (AI detection, code checks, docs packets, profit
-- recovery) can hang off of.
--
-- Tables:
--   - public.supplements        — one record per supplement on a job
--   - public.supplement_items   — line items inside each supplement
--
-- These are intentionally slim and job-focused and sit alongside the
-- more advanced insurance scope / request tables in block 256600.

-- ============================================================
-- 1. SUPPLEMENTS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.supplements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,

  -- Financials
  original_carrier_amount numeric(12,2) DEFAULT 0, -- Original paid / scoped amount
  requested_amount numeric(12,2) DEFAULT 0,        -- Total requested on this supplement
  approved_amount numeric(12,2) DEFAULT 0,         -- Total ultimately approved

  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',      -- Identified but not yet submitted
    'submitted',    -- Sent to carrier
    'negotiating',  -- Back and forth with adjuster
    'approved',     -- Fully approved
    'denied'        -- Fully denied
  )),

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_supplements_job_id
  ON public.supplements(job_id);

CREATE INDEX IF NOT EXISTS idx_supplements_status
  ON public.supplements(status);

CREATE INDEX IF NOT EXISTS idx_supplements_created_at
  ON public.supplements(created_at DESC);


-- ============================================================
-- 2. SUPPLEMENT ITEMS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.supplement_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplement_id uuid NOT NULL REFERENCES public.supplements(id) ON DELETE CASCADE,

  -- Line item core fields
  code text,                 -- Xactimate code or custom internal code
  description text NOT NULL, -- Human-readable description

  quantity numeric(10,2) DEFAULT 1,
  price numeric(10,2) DEFAULT 0,   -- Unit price
  total_price numeric(12,2) DEFAULT 0, -- quantity * price (auto-calculated)

  reason text,               -- Why this line exists (damage, code, etc.)

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplement_items_supplement_id
  ON public.supplement_items(supplement_id);

CREATE INDEX IF NOT EXISTS idx_supplement_items_code
  ON public.supplement_items(code) WHERE code IS NOT NULL;


-- ============================================================
-- 3. TRIGGERS (UPDATED_AT + TOTAL PRICE)
-- ============================================================

-- Re-use global update_updated_at_column() from block 256600
-- to keep updated_at fresh on changes.

DROP TRIGGER IF EXISTS trg_supplements_updated_at ON public.supplements;
CREATE TRIGGER trg_supplements_updated_at
BEFORE UPDATE ON public.supplements
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_supplement_items_updated_at ON public.supplement_items;
CREATE TRIGGER trg_supplement_items_updated_at
BEFORE UPDATE ON public.supplement_items
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


-- Auto-calc total_price on supplement_items
CREATE OR REPLACE FUNCTION public.calculate_supplement_item_total()
RETURNS TRIGGER AS $$
BEGIN
  NEW.total_price := COALESCE(NEW.quantity, 1) * COALESCE(NEW.price, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calculate_supplement_item_total ON public.supplement_items;
CREATE TRIGGER trg_calculate_supplement_item_total
BEFORE INSERT OR UPDATE ON public.supplement_items
FOR EACH ROW
EXECUTE FUNCTION public.calculate_supplement_item_total();


-- ============================================================
-- 4. ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE public.supplements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplement_items ENABLE ROW LEVEL SECURITY;

-- Team members can see/update supplements for jobs in their team
DROP POLICY IF EXISTS "supplements_team_member" ON public.supplements;
CREATE POLICY "supplements_team_member" ON public.supplements
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = supplements.job_id
        AND tm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = supplements.job_id
        AND tm.user_id = auth.uid()
    )
  );

-- Items inherit access from their parent supplement/job
DROP POLICY IF EXISTS "supplement_items_team_member" ON public.supplement_items;
CREATE POLICY "supplement_items_team_member" ON public.supplement_items
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.supplements s
      JOIN public.jobs j ON j.id = s.job_id
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE s.id = supplement_items.supplement_id
        AND tm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.supplements s
      JOIN public.jobs j ON j.id = s.job_id
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE s.id = supplement_items.supplement_id
        AND tm.user_id = auth.uid()
    )
  );

-- Service role can do anything (for edge functions / backend)
DROP POLICY IF EXISTS "supplements_service_role_all" ON public.supplements;
CREATE POLICY "supplements_service_role_all" ON public.supplements
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "supplement_items_service_role_all" ON public.supplement_items;
CREATE POLICY "supplement_items_service_role_all" ON public.supplement_items
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- END OF BLOCK 258500
-- ============================================================













