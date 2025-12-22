-- =========================================================
-- Block 22340 — SmartSend Roofing Job Cost Tracker v1 (Labor, Materials, Profit Dashboard)
-- FULL BLOCK. NO FLUFF. THIS IS "DID WE ACTUALLY MAKE MONEY ON THIS ROOF?"
-- =========================================================
-- 
-- This block makes SmartSend answer, in one screen:
-- "Which roofs made us money, which roofs lost money, and why?"
-- 
-- Turn each job into a mini P&L:
-- - How much did we sell it for? (revenue)
-- - How much did we spend on materials?
-- - How much did we spend on labor?
-- - What's our profit in dollars and margin %?

-- ============================================================================
-- PART 1 — ADD FINANCIAL SUMMARY FIELDS TO roofing_jobs TABLE
-- ============================================================================
-- Estimated and actual cost fields on jobs for fast reads

ALTER TABLE public.roofing_jobs
  ADD COLUMN IF NOT EXISTS est_material_cost numeric,
  ADD COLUMN IF NOT EXISTS est_labor_cost numeric,
  ADD COLUMN IF NOT EXISTS est_other_cost numeric,
  ADD COLUMN IF NOT EXISTS est_gross_profit numeric,
  ADD COLUMN IF NOT EXISTS est_margin_pct numeric,

  ADD COLUMN IF NOT EXISTS actual_material_cost numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_labor_cost numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_other_cost numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_total_cost numeric DEFAULT 0,

  ADD COLUMN IF NOT EXISTS revenue_collected numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_gross_profit numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_margin_pct numeric DEFAULT 0;

-- ============================================================================
-- PART 2 — CREATE job_cost_entries TABLE
-- ============================================================================
-- Flexible ledger that records every cost tied to a job

CREATE TABLE IF NOT EXISTS public.job_cost_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE NOT NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,

  category text CHECK (category IN ('materials','labor','overhead','equipment','dumpster','other')) NOT NULL,

  description text,
  vendor text,              -- supplier name, rental company, crew, etc.
  reference_id uuid,        -- optional: link to material_orders, etc.
  reference_type text,      -- 'material_order','payroll','rental','other'

  cost_date date DEFAULT (current_date),
  amount numeric NOT NULL,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_cost_entries_job_idx
  ON public.job_cost_entries(job_id);

CREATE INDEX IF NOT EXISTS job_cost_entries_workspace_idx
  ON public.job_cost_entries(workspace_id, cost_date);

CREATE INDEX IF NOT EXISTS job_cost_entries_category_idx
  ON public.job_cost_entries(category);

-- ============================================================================
-- PART 3 — FUNCTION — Recalculate Job Financials
-- ============================================================================
-- Sums payments and cost entries to compute profit and margin

CREATE OR REPLACE FUNCTION public.recalc_job_financials(p_job_id uuid)
RETURNS void AS $$
DECLARE
  v_job public.roofing_jobs%rowtype;
  v_revenue numeric;
  v_mat numeric;
  v_lab numeric;
  v_other numeric;
  v_total_cost numeric;
  v_profit numeric;
  v_margin numeric;
BEGIN
  SELECT * INTO v_job FROM public.roofing_jobs WHERE id = p_job_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- revenue collected (received payments only)
  SELECT COALESCE(SUM(amount), 0)
  INTO v_revenue
  FROM public.job_payments
  WHERE job_id = p_job_id
    AND status = 'received';

  -- costs from cost entries
  SELECT
    COALESCE(SUM(amount) FILTER (WHERE category = 'materials'), 0),
    COALESCE(SUM(amount) FILTER (WHERE category = 'labor'), 0),
    COALESCE(SUM(amount) FILTER (WHERE category NOT IN ('materials','labor')), 0)
  INTO v_mat, v_lab, v_other
  FROM public.job_cost_entries
  WHERE job_id = p_job_id;

  v_total_cost := v_mat + v_lab + v_other;
  v_profit := v_revenue - v_total_cost;

  IF v_revenue > 0 THEN
    v_margin := (v_profit / v_revenue) * 100;
  ELSE
    v_margin := 0;
  END IF;

  UPDATE public.roofing_jobs
  SET
    revenue_collected = v_revenue,
    actual_material_cost = v_mat,
    actual_labor_cost = v_lab,
    actual_other_cost = v_other,
    actual_total_cost = v_total_cost,
    actual_gross_profit = v_profit,
    actual_margin_pct = v_margin,
    updated_at = now()
  WHERE id = p_job_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 4 — TRIGGER — Auto-populate workspace_id from job
-- ============================================================================

CREATE OR REPLACE FUNCTION public.job_cost_entries_set_workspace_id()
RETURNS trigger AS $$
BEGIN
  IF NEW.workspace_id IS NULL THEN
    SELECT workspace_id INTO NEW.workspace_id
    FROM public.roofing_jobs
    WHERE id = NEW.job_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS job_cost_entries_set_workspace_id_trigger ON public.job_cost_entries;
CREATE TRIGGER job_cost_entries_set_workspace_id_trigger
BEFORE INSERT ON public.job_cost_entries
FOR EACH ROW
EXECUTE FUNCTION public.job_cost_entries_set_workspace_id();

-- ============================================================================
-- PART 5 — TRIGGER — Auto-recalculate when cost entry changes
-- ============================================================================

CREATE OR REPLACE FUNCTION public.job_cost_entries_after_change()
RETURNS trigger AS $$
BEGIN
  PERFORM public.recalc_job_financials(COALESCE(NEW.job_id, OLD.job_id));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS job_cost_entries_after_change_trigger ON public.job_cost_entries;
CREATE TRIGGER job_cost_entries_after_change_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.job_cost_entries
FOR EACH ROW
EXECUTE FUNCTION public.job_cost_entries_after_change();

-- ============================================================================
-- PART 6 — TRIGGER — Auto-recalculate when payment changes (update existing)
-- ============================================================================
-- Update the existing job_payments trigger function to also call recalc_job_financials

CREATE OR REPLACE FUNCTION public.job_payments_after_change()
RETURNS trigger AS $$
DECLARE
  v_job_id uuid;
BEGIN
  v_job_id := COALESCE(NEW.job_id, OLD.job_id);
  IF v_job_id IS NOT NULL THEN
    -- Recalculate payments (existing function)
    PERFORM public.recalc_job_payments(v_job_id);
    -- Also recalculate financials (new function)
    PERFORM public.recalc_job_financials(v_job_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Update the existing trigger to also handle DELETE
DROP TRIGGER IF EXISTS job_payments_after_change_trigger ON public.job_payments;
CREATE TRIGGER job_payments_after_change_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.job_payments
FOR EACH ROW
EXECUTE FUNCTION public.job_payments_after_change();

-- ============================================================================
-- PART 7 — UPDATED_AT TRIGGER FOR job_cost_entries
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_job_cost_entries_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_job_cost_entries_updated_at ON public.job_cost_entries;
CREATE TRIGGER trg_set_job_cost_entries_updated_at
BEFORE UPDATE ON public.job_cost_entries
FOR EACH ROW
EXECUTE FUNCTION public.set_job_cost_entries_updated_at();

-- ============================================================================
-- PART 8 — ROW LEVEL SECURITY FOR job_cost_entries
-- ============================================================================

ALTER TABLE public.job_cost_entries ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view cost entries in their workspace
CREATE POLICY "Users can view cost entries in their workspace"
  ON public.job_cost_entries FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can create cost entries in their workspace
CREATE POLICY "Users can create cost entries in their workspace"
  ON public.job_cost_entries FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can update cost entries in their workspace
CREATE POLICY "Users can update cost entries in their workspace"
  ON public.job_cost_entries FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can delete cost entries in their workspace
CREATE POLICY "Users can delete cost entries in their workspace"
  ON public.job_cost_entries FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 9 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_cost_entries TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalc_job_financials(uuid) TO authenticated;

