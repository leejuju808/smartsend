-- =========================================================
-- Block 22300 — SmartSend Roofing Money Today v1 (Collections & Deposits Radar)
-- FULL BLOCK. CASH-ONLY LENS. NO BULLSHIT.
-- =========================================================
-- 
-- This block makes SmartSend answer one question:
-- "Where is my money today?"
-- 
-- Not leads. Not vanity metrics.
-- Just deposits to collect, final balances due, and cash already landed.

-- ============================================================================
-- PART 1 — CREATE job_payments TABLE
-- ============================================================================
-- Payments ledger so SmartSend can show exact cash history per job

CREATE TABLE IF NOT EXISTS public.job_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  amount numeric NOT NULL,
  payment_type text CHECK (payment_type IN ('deposit','progress','final','other')) NOT NULL,
  method text,          -- 'card', 'cash', 'check', 'transfer', 'stripe', etc.
  status text CHECK (status IN ('pending','received','failed','refunded')) DEFAULT 'received',

  received_at timestamptz DEFAULT now(),

  notes text,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_payments_job_idx ON public.job_payments(job_id);
CREATE INDEX IF NOT EXISTS job_payments_workspace_idx ON public.job_payments(workspace_id, received_at);
CREATE INDEX IF NOT EXISTS job_payments_received_at_idx ON public.job_payments(received_at DESC);

-- ============================================================================
-- PART 2 — HELPER FUNCTION — Recalculate Job Totals from Payments
-- ============================================================================
-- So the ledger is the truth; deposit_paid & balance_remaining stay in sync.

CREATE OR REPLACE FUNCTION public.recalc_job_payments(p_job_id uuid)
RETURNS void AS $$
DECLARE
  v_job public.roofing_jobs%rowtype;
  v_deposit_paid numeric;
  v_total_paid numeric;
BEGIN
  SELECT * INTO v_job FROM public.roofing_jobs WHERE id = p_job_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Sum by type
  SELECT
    COALESCE(SUM(amount) FILTER (WHERE payment_type = 'deposit' AND status = 'received'), 0),
    COALESCE(SUM(amount) FILTER (WHERE status = 'received'), 0)
  INTO v_deposit_paid, v_total_paid
  FROM public.job_payments
  WHERE job_id = p_job_id;

  UPDATE public.roofing_jobs
  SET
    deposit_paid = v_deposit_paid,
    updated_at = now()
  WHERE id = p_job_id;

  -- balance_remaining is already a generated column as (job_value - deposit_paid),
  -- so we don't need to manually update it.
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 3 — TRIGGER — Auto-populate workspace_id from job
-- ============================================================================

CREATE OR REPLACE FUNCTION public.job_payments_set_workspace_id()
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

DROP TRIGGER IF EXISTS job_payments_set_workspace_id_trigger ON public.job_payments;
CREATE TRIGGER job_payments_set_workspace_id_trigger
BEFORE INSERT ON public.job_payments
FOR EACH ROW
EXECUTE FUNCTION public.job_payments_set_workspace_id();

-- ============================================================================
-- PART 4 — TRIGGER — Auto-recalculate when payment changes
-- ============================================================================

CREATE OR REPLACE FUNCTION public.job_payments_after_change()
RETURNS trigger AS $$
BEGIN
  PERFORM public.recalc_job_payments(NEW.job_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS job_payments_after_change_trigger ON public.job_payments;
CREATE TRIGGER job_payments_after_change_trigger
AFTER INSERT OR UPDATE ON public.job_payments
FOR EACH ROW
EXECUTE FUNCTION public.job_payments_after_change();

-- ============================================================================
-- PART 5 — MONEY RADAR VIEWS
-- ============================================================================

-- 4.1 View — Deposits Due
CREATE OR REPLACE VIEW public.job_deposits_due AS
SELECT
  j.id AS job_id,
  j.workspace_id,
  j.title,
  j.job_value,
  j.deposit_required,
  j.deposit_paid,
  j.scheduled_start_date,
  j.status,
  l.first_name,
  l.last_name,
  l.city,
  l.phone
FROM public.roofing_jobs j
LEFT JOIN public.leads l ON j.lead_id = l.id
WHERE
  j.deposit_required > 0
  AND j.deposit_paid < j.deposit_required;

-- 4.2 View — Final Balances Due
CREATE OR REPLACE VIEW public.job_final_balances_due AS
SELECT
  j.id AS job_id,
  j.workspace_id,
  j.title,
  j.job_value,
  j.balance_remaining,
  j.status,
  j.scheduled_end_date,
  l.first_name,
  l.last_name,
  l.city,
  l.phone
FROM public.roofing_jobs j
LEFT JOIN public.leads l ON j.lead_id = l.id
WHERE
  j.balance_remaining > 0
  AND j.job_value > 0
  AND j.status IN ('in_progress','completed');

-- 4.3 View — Payments Recent (for weekly filtering)
CREATE OR REPLACE VIEW public.job_payments_recent AS
SELECT
  p.id,
  p.job_id,
  p.workspace_id,
  p.amount,
  p.payment_type,
  p.method,
  p.status,
  p.received_at,
  j.title,
  j.job_value,
  l.first_name,
  l.last_name,
  l.city
FROM public.job_payments p
LEFT JOIN public.roofing_jobs j ON p.job_id = j.id
LEFT JOIN public.leads l ON j.lead_id = l.id;

-- ============================================================================
-- PART 6 — ROW LEVEL SECURITY FOR job_payments
-- ============================================================================

ALTER TABLE public.job_payments ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view payments in their workspace
CREATE POLICY "Users can view payments in their workspace"
  ON public.job_payments FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can create payments in their workspace
CREATE POLICY "Users can create payments in their workspace"
  ON public.job_payments FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can update payments in their workspace
CREATE POLICY "Users can update payments in their workspace"
  ON public.job_payments FOR UPDATE
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

-- ============================================================================
-- PART 7 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON public.job_payments TO authenticated;
GRANT SELECT ON public.job_deposits_due TO authenticated;
GRANT SELECT ON public.job_final_balances_due TO authenticated;
GRANT SELECT ON public.job_payments_recent TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalc_job_payments(uuid) TO authenticated;

-- ============================================================================
-- PART 8 — UPDATED_AT TRIGGER FOR job_payments
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_job_payments_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_job_payments_updated_at ON public.job_payments;
CREATE TRIGGER trg_set_job_payments_updated_at
BEFORE UPDATE ON public.job_payments
FOR EACH ROW
EXECUTE FUNCTION public.set_job_payments_updated_at();

