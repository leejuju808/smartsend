-- =========================================================
-- Block 27280 — SmartSend Roofing Deposit & Payment Request Engine v1
-- (Auto-send deposit requests • Track paid/unpaid • Stripe-ready • Tie payments to jobs)
-- =========================================================
-- 
-- This block turns SmartSend into the money switch right after a job is approved.
-- 
-- Right now roofers:
-- - Forget to request deposits
-- - Lose track of who paid / who hasn't
-- - Chase money with random texts and calls
-- - Don't tie payments clearly to specific jobs
-- 
-- SmartSend will now:
-- - As soon as a proposal is accepted, automatically create a deposit request, send a payment link, and track paid/unpaid status per job.
-- 
-- This is where your "revenue system" literally starts collecting cash.

-- ============================================================================
-- PART 1 — CREATE roofing_payment_requests TABLE
-- ============================================================================
-- Tracks each payment request (deposit, progress, final) per job

CREATE TABLE IF NOT EXISTS public.roofing_payment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  request_type text CHECK (request_type IN ('deposit','progress','final')) DEFAULT 'deposit' NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  currency text DEFAULT 'usd' NOT NULL,

  status text CHECK (status IN ('pending','sent','paid','canceled','overdue')) DEFAULT 'pending' NOT NULL,

  due_date date,
  sent_at timestamptz,
  paid_at timestamptz,

  payment_link_url text,         -- Stripe payment link or Checkout URL
  processor_session_id text,     -- e.g. Stripe session/payment link id

  customer_email text,
  customer_name text,

  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_roofing_payment_requests_job_id ON public.roofing_payment_requests(job_id);
CREATE INDEX IF NOT EXISTS idx_roofing_payment_requests_workspace_id ON public.roofing_payment_requests(workspace_id);
CREATE INDEX IF NOT EXISTS idx_roofing_payment_requests_status ON public.roofing_payment_requests(status);
CREATE INDEX IF NOT EXISTS idx_roofing_payment_requests_processor_session_id ON public.roofing_payment_requests(processor_session_id) WHERE processor_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roofing_payment_requests_due_date ON public.roofing_payment_requests(due_date) WHERE due_date IS NOT NULL;

-- ============================================================================
-- PART 2 — CREATE roofing_job_payment_summary VIEW
-- ============================================================================
-- Quick money snapshot per job

CREATE OR REPLACE VIEW public.roofing_job_payment_summary AS
SELECT
  j.id as job_id,
  j.workspace_id,
  COALESCE(j.title, j.homeowner_name, 'Job') as job_name,
  COALESCE(j.job_value, j.projected_job_value, 0) as contract_amount,

  COALESCE(SUM(CASE WHEN r.status = 'paid' THEN r.amount ELSE 0 END), 0) as total_paid,
  COALESCE(SUM(CASE WHEN r.status != 'paid' AND r.status != 'canceled' THEN r.amount ELSE 0 END), 0) as total_unpaid,
  COALESCE(SUM(CASE WHEN r.status != 'canceled' THEN r.amount ELSE 0 END), 0) as total_requested,

  (COALESCE(j.job_value, j.projected_job_value, 0) - COALESCE(SUM(CASE WHEN r.status = 'paid' THEN r.amount ELSE 0 END), 0)) as remaining_balance

FROM public.roofing_jobs j
LEFT JOIN public.roofing_payment_requests r ON r.job_id = j.id
GROUP BY j.id, j.workspace_id, j.title, j.homeowner_name, j.job_value, j.projected_job_value;

COMMENT ON VIEW public.roofing_job_payment_summary IS 'Block 27280: Payment summary per job showing contract amount, paid, unpaid, and remaining balance';

-- ============================================================================
-- PART 3 — UPDATED_AT TRIGGER FOR roofing_payment_requests
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_roofing_payment_requests_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_roofing_payment_requests_updated_at ON public.roofing_payment_requests;
CREATE TRIGGER trg_set_roofing_payment_requests_updated_at
BEFORE UPDATE ON public.roofing_payment_requests
FOR EACH ROW
EXECUTE FUNCTION public.set_roofing_payment_requests_updated_at();

-- ============================================================================
-- PART 4 — ROW LEVEL SECURITY FOR roofing_payment_requests
-- ============================================================================

ALTER TABLE public.roofing_payment_requests ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view payment requests in their workspace
CREATE POLICY "Users can view payment requests in their workspace"
  ON public.roofing_payment_requests FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can create payment requests in their workspace
CREATE POLICY "Users can create payment requests in their workspace"
  ON public.roofing_payment_requests FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can update payment requests in their workspace
CREATE POLICY "Users can update payment requests in their workspace"
  ON public.roofing_payment_requests FOR UPDATE
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

-- Policy: Users can delete payment requests in their workspace
CREATE POLICY "Users can delete payment requests in their workspace"
  ON public.roofing_payment_requests FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 5 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.roofing_payment_requests TO authenticated;
GRANT SELECT ON public.roofing_job_payment_summary TO authenticated;



































