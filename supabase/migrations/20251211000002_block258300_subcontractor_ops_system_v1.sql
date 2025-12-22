-- ============================================================
-- Block 258300 — SmartSend Subcontractor OPS System v1
-- "Sub Onboarding, Compliance Vault, Work Orders, Pay Engine,
--  Invoice Matching, Performance Scores, Safety & Payments"
-- ============================================================
--
-- This block does NOT reinvent the subcontractor stack.
-- It sits on top of existing blocks:
--   - 252500 Subcontractor Management v1
--   - 253800 Subcontractor Management Engine v1
--   - 254600 Compliance & Legal Shield v1
--   - 252800 Safety Training Engine v1
--   - 257300 Subcontractor Management Engine v1 (views)
--
-- Goal: turn subs into a fully controlled, measurable, and
-- automatable OPS system without duplicating tables.
--
-- New schema here focuses on:
--   - Explicit sub invoices + matching engine
--   - Richer performance breakdown with 0–100 score
--   - Clean, opinionated read models for UI
-- ============================================================


-- ============================================================
-- PART 1 — sub_invoices TABLE (Invoice Matching Engine)
-- ============================================================
-- This table captures what the SUB claims so we can compare it
-- against what SmartSend calculates from work orders, aerials,
-- and material usage.
--
-- High‑level flow:
--   1) Sub submits invoice (amount + claimed quantity)
--   2) SmartSend calculates expected_amount from work order tasks
--   3) We store discrepancy + flag for PM review
--   4) Payments are only created after an approved invoice

CREATE TABLE IF NOT EXISTS public.sub_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subcontractor_id uuid NOT NULL REFERENCES public.subcontractors(id) ON DELETE CASCADE,
  work_order_id uuid NOT NULL REFERENCES public.sub_work_orders(id) ON DELETE CASCADE,

  -- What the sub is claiming
  amount numeric NOT NULL,                 -- total invoice amount submitted by sub
  claimed_quantity numeric,                -- e.g. 30.5 (squares, hours, LF, etc.)
  claimed_unit text,                       -- "sq", "hour", "lf", "job"
  notes text,

  -- What SmartSend calculates
  system_amount numeric,                   -- expected amount from work order & rate engine
  system_quantity numeric,                 -- expected quantity (e.g. from scope / measurements)
  discrepancy_amount numeric,              -- amount - system_amount
  discrepancy_percent numeric,             -- percentage difference vs system_amount
  flagged boolean DEFAULT false,           -- true when discrepancy requires PM review
  matching_breakdown jsonb DEFAULT '{}'::jsonb,  -- detailed JSON: aerial, materials, work order, photos

  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'under_review', 'approved', 'rejected', 'paid', 'cancelled')
  ),

  submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_invoices_subcontractor
  ON public.sub_invoices(subcontractor_id);

CREATE INDEX IF NOT EXISTS idx_sub_invoices_work_order
  ON public.sub_invoices(work_order_id);

CREATE INDEX IF NOT EXISTS idx_sub_invoices_status
  ON public.sub_invoices(status);

COMMENT ON TABLE public.sub_invoices IS
  'Sub invoices attached to sub_work_orders with invoice matching metadata (Block 258300)';

COMMENT ON COLUMN public.sub_invoices.amount IS
  'Total amount claimed on the invoice by the subcontractor';

COMMENT ON COLUMN public.sub_invoices.system_amount IS
  'System‑calculated expected amount from work order tasks / rate engine';

COMMENT ON COLUMN public.sub_invoices.discrepancy_amount IS
  'Difference between claimed amount and system_amount (positive = potential overcharge)';

COMMENT ON COLUMN public.sub_invoices.flagged IS
  'True when invoice discrepancy exceeds tolerance and requires PM review';


-- ============================================================
-- PART 2 — updated_at TRIGGER for sub_invoices
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_sub_invoices_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sub_invoices_updated_at ON public.sub_invoices;
CREATE TRIGGER trg_sub_invoices_updated_at
BEFORE UPDATE ON public.sub_invoices
FOR EACH ROW
EXECUTE FUNCTION public.set_sub_invoices_updated_at();


-- ============================================================
-- PART 3 — RLS for sub_invoices
-- ============================================================
-- We reuse the same company scoping pattern as Block 253800:
-- public.has_company_access(company_id) + join through subcontractors.

ALTER TABLE public.sub_invoices ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sub_invoices'
      AND policyname = 'sub_invoices_select'
  ) THEN
    CREATE POLICY "sub_invoices_select" ON public.sub_invoices
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.subcontractors s
          WHERE s.id = subcontractor_id
            AND public.has_company_access(s.company_id)
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sub_invoices'
      AND policyname = 'sub_invoices_insert'
  ) THEN
    CREATE POLICY "sub_invoices_insert" ON public.sub_invoices
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.subcontractors s
          WHERE s.id = subcontractor_id
            AND public.has_company_access(s.company_id)
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sub_invoices'
      AND policyname = 'sub_invoices_update'
  ) THEN
    CREATE POLICY "sub_invoices_update" ON public.sub_invoices
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.subcontractors s
          WHERE s.id = subcontractor_id
            AND public.has_company_access(s.company_id)
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.subcontractors s
          WHERE s.id = subcontractor_id
            AND public.has_company_access(s.company_id)
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sub_invoices'
      AND policyname = 'sub_invoices_delete'
  ) THEN
    CREATE POLICY "sub_invoices_delete" ON public.sub_invoices
      FOR DELETE
      USING (
        EXISTS (
          SELECT 1 FROM public.subcontractors s
          WHERE s.id = subcontractor_id
            AND public.has_company_access(s.company_id)
        )
      );
  END IF;
END $$;


-- ============================================================
-- PART 4 — Invoice Matching Helper Function
-- ============================================================
-- Given an invoice, compare against the work order tasks using
-- existing calculate_work_order_cost(p_work_order_id) from
-- Block 253800. Store the discrepancy + return a JSON summary.

CREATE OR REPLACE FUNCTION public.evaluate_sub_invoice(
  p_invoice_id uuid,
  p_tolerance_percent numeric DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_invoice public.sub_invoices%ROWTYPE;
  v_expected_amount numeric := 0;
  v_discrepancy numeric := 0;
  v_discrepancy_pct numeric := 0;
  v_flag boolean := false;
  v_summary jsonb;
BEGIN
  SELECT * INTO v_invoice
  FROM public.sub_invoices
  WHERE id = p_invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % not found', p_invoice_id;
  END IF;

  -- Use existing work order cost helper as system baseline
  v_expected_amount := COALESCE(
    public.calculate_work_order_cost(v_invoice.work_order_id),
    0
  );

  v_discrepancy := COALESCE(v_invoice.amount, 0) - COALESCE(v_expected_amount, 0);

  IF v_expected_amount > 0 THEN
    v_discrepancy_pct := ROUND( (v_discrepancy / v_expected_amount) * 100.0, 2 );
  ELSE
    v_discrepancy_pct := 0;
  END IF;

  v_flag := (ABS(v_discrepancy_pct) >= COALESCE(p_tolerance_percent, 0));

  v_summary := jsonb_build_object(
    'invoice_id', v_invoice.id,
    'work_order_id', v_invoice.work_order_id,
    'claimed_amount', v_invoice.amount,
    'system_amount', v_expected_amount,
    'discrepancy_amount', v_discrepancy,
    'discrepancy_percent', v_discrepancy_pct,
    'flagged', v_flag
  );

  -- Persist results back onto the invoice row
  UPDATE public.sub_invoices
  SET
    system_amount = v_expected_amount,
    discrepancy_amount = v_discrepancy,
    discrepancy_percent = v_discrepancy_pct,
    flagged = v_flag,
    matching_breakdown = COALESCE(matching_breakdown, '{}'::jsonb) || v_summary
  WHERE id = p_invoice_id;

  RETURN v_summary;
END;
$$;

COMMENT ON FUNCTION public.evaluate_sub_invoice IS
  'Compare sub invoice vs work order expected amount, store discrepancy, and return JSON summary (Block 258300)';


-- ============================================================
-- PART 5 — sub_invoice_discrepancies VIEW
-- ============================================================
-- Simple read model for PMs:
--   - shows flagged invoices with sub, job, and variance details

CREATE OR REPLACE VIEW public.sub_invoice_discrepancies AS
SELECT
  si.id AS invoice_id,
  si.subcontractor_id,
  s.name AS subcontractor_name,
  si.work_order_id,
  j.id AS job_id,
  si.amount AS claimed_amount,
  si.system_amount,
  si.discrepancy_amount,
  si.discrepancy_percent,
  si.flagged,
  si.status,
  si.created_at,
  si.reviewed_by
FROM public.sub_invoices si
JOIN public.sub_work_orders swo
  ON swo.id = si.work_order_id
JOIN public.subcontractors s
  ON s.id = si.subcontractor_id
LEFT JOIN public.jobs j
  ON j.id = swo.job_id
WHERE COALESCE(si.flagged, false) = true;

COMMENT ON VIEW public.sub_invoice_discrepancies IS
  'Flagged subcontractor invoices with discrepancy details for PM review (Block 258300)';


-- ============================================================
-- PART 6 — Enhance sub_performance_scores (Breakdown JSON)
-- ============================================================
-- The block spec calls for a simple sub_performance table:
--   (subcontractor_id, score numeric, breakdown jsonb)
--
-- We already have detailed columns. Here we add a generic
-- breakdown JSON that can capture:
--   - speed, quality, cleanup, safety
--   - callbacks, change_orders, on_time, compliance, invoice_accuracy

ALTER TABLE public.sub_performance_scores
  ADD COLUMN IF NOT EXISTS breakdown jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.sub_performance_scores.breakdown IS
  'JSON breakdown of subcontractor performance factors (speed, quality, cleanup, safety, callbacks, change_orders, compliance, invoice_accuracy, etc.) (Block 258300)';


-- ============================================================
-- END OF BLOCK 258300
-- ============================================================













