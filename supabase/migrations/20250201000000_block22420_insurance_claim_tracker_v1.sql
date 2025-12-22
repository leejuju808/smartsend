-- =========================================================
-- Block 22420 — SmartSend Roofing Insurance Claim Tracker v1
-- (ACV / RCV / Depreciation / Supplements / Carrier Workflow Engine)
-- =========================================================
-- 
-- This block makes SmartSend a weapon for roofing companies who do insurance jobs.
-- Tracks ACV payments, RCV final checks, depreciation, supplements, and carrier communication.

-- ============================================================================
-- PART 1 — CREATE job_insurance_claims TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.job_insurance_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  -- Carrier & Claim Info
  carrier_name text,
  claim_number text,
  adjuster_name text,
  adjuster_email text,
  adjuster_phone text,

  -- Financial Breakdown
  deductible numeric DEFAULT 0,
  acv_amount numeric DEFAULT 0,
  rcv_amount numeric DEFAULT 0,
  depreciation_amount numeric DEFAULT 0,

  -- Payments Received
  acv_paid numeric DEFAULT 0,
  rcv_paid numeric DEFAULT 0,

  -- Supplements
  supplement_requested numeric DEFAULT 0,
  supplement_approved numeric DEFAULT 0,
  supplement_denied numeric DEFAULT 0,

  -- Status
  claim_status text CHECK (claim_status IN (
    'not_started',
    'in_progress',
    'awaiting_acv',
    'awaiting_rcv',
    'awaiting_supplement',
    'complete',
    'denied'
  )) DEFAULT 'not_started',

  notes text,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_insurance_claims_job_idx 
  ON public.job_insurance_claims(job_id);

CREATE INDEX IF NOT EXISTS job_insurance_claims_workspace_idx 
  ON public.job_insurance_claims(workspace_id);

CREATE INDEX IF NOT EXISTS job_insurance_claims_status_idx 
  ON public.job_insurance_claims(claim_status);

-- ============================================================================
-- PART 2 — ADD INSURANCE COLUMNS TO roofing_jobs TABLE
-- ============================================================================
-- Job-level mirrors for fast dashboard display

ALTER TABLE public.roofing_jobs
  ADD COLUMN IF NOT EXISTS insurance_job boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS insurance_claim_status text,
  ADD COLUMN IF NOT EXISTS insurance_balance_remaining numeric DEFAULT 0;

CREATE INDEX IF NOT EXISTS roofing_jobs_insurance_job_idx 
  ON public.roofing_jobs(insurance_job) 
  WHERE insurance_job = true;

CREATE INDEX IF NOT EXISTS roofing_jobs_insurance_status_idx 
  ON public.roofing_jobs(insurance_claim_status) 
  WHERE insurance_claim_status IS NOT NULL;

-- ============================================================================
-- PART 3 — RPC FUNCTION: sync_insurance_summary
-- ============================================================================
-- Keeps job mirrors updated automatically

CREATE OR REPLACE FUNCTION public.sync_insurance_summary(p_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_remaining numeric := 0;
  v_status text := 'not_started';
  v_has_claim boolean := false;
BEGIN
  SELECT
    (rcv_amount + supplement_approved - rcv_paid - acv_paid - deductible),
    claim_status,
    true
  INTO v_remaining, v_status, v_has_claim
  FROM public.job_insurance_claims
  WHERE job_id = p_job_id
  LIMIT 1;

  UPDATE public.roofing_jobs
  SET
    insurance_job = COALESCE(v_has_claim, false),
    insurance_claim_status = CASE WHEN v_has_claim THEN COALESCE(v_status, 'not_started') ELSE NULL END,
    insurance_balance_remaining = COALESCE(v_remaining, 0),
    updated_at = now()
  WHERE id = p_job_id;
END;
$$;

-- ============================================================================
-- PART 4 — TRIGGER: Auto-sync insurance summary
-- ============================================================================

CREATE OR REPLACE FUNCTION public.insurance_claims_after_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.sync_insurance_summary(COALESCE(NEW.job_id, OLD.job_id));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS insurance_claims_after_change_trigger ON public.job_insurance_claims;
CREATE TRIGGER insurance_claims_after_change_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.job_insurance_claims
FOR EACH ROW
EXECUTE FUNCTION public.insurance_claims_after_change();

-- ============================================================================
-- PART 5 — ROW LEVEL SECURITY FOR job_insurance_claims
-- ============================================================================

ALTER TABLE public.job_insurance_claims ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view insurance claims in their workspace
CREATE POLICY "Users can view insurance claims in their workspace"
  ON public.job_insurance_claims FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can create insurance claims in their workspace
CREATE POLICY "Users can create insurance claims in their workspace"
  ON public.job_insurance_claims FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can update insurance claims in their workspace
CREATE POLICY "Users can update insurance claims in their workspace"
  ON public.job_insurance_claims FOR UPDATE
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

-- Policy: Users can delete insurance claims in their workspace
CREATE POLICY "Users can delete insurance claims in their workspace"
  ON public.job_insurance_claims FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 6 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_insurance_claims TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_insurance_summary(uuid) TO authenticated;

COMMENT ON TABLE public.job_insurance_claims IS 'Tracks insurance claim details for roofing jobs including ACV, RCV, depreciation, and supplements';
COMMENT ON FUNCTION public.sync_insurance_summary IS 'Syncs insurance claim summary to job mirrors for fast dashboard queries';

