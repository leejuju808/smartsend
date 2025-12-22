-- =========================================================
-- Block 22400 — SmartSend Roofing Permit & HOA Management v1
-- (Auto-required Docs, Deadlines, Expirations, Tracking Dashboard)
-- FULL BLOCK. NO BULLSHIT. THIS IS "ARE WE LEGAL TO BUILD HERE?"
-- =========================================================
-- 
-- Make SmartSend the single place roofers track:
-- - City permits
-- - County permits
-- - HOA approvals
-- - Required documents (plans, insurance, photos)
-- - Submission dates, approval dates, expiration dates
-- - Status: Not needed / Needed / Submitted / Approved / Denied
-- 
-- So SmartSend can answer:
-- "Can we legally start this job on this date, or are we gonna get shut down and fined?"

-- ============================================================================
-- PART 1 — CREATE job_permits TABLE
-- ============================================================================
-- One job can have multiple permits (building, electrical, etc.)

CREATE TABLE IF NOT EXISTS public.job_permits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  permit_type text CHECK (permit_type IN (
    'building',
    'roofing',
    'electrical',
    'structural',
    'other'
  )) DEFAULT 'roofing',
  jurisdiction text,       -- "City of Lacey", "Thurston County"
  permit_number text,
  status text CHECK (status IN (
    'not_required',
    'required',
    'draft',
    'submitted',
    'approved',
    'denied',
    'closed'
  )) DEFAULT 'required',
  submitted_date date,
  approved_date date,
  expiration_date date,
  closed_date date,
  fee_amount numeric,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_permits_job_idx ON public.job_permits(job_id);
CREATE INDEX IF NOT EXISTS job_permits_workspace_idx ON public.job_permits(workspace_id, status);

-- ============================================================================
-- PART 2 — CREATE job_hoa_requests TABLE
-- ============================================================================
-- Track HOA approval for jobs

CREATE TABLE IF NOT EXISTS public.job_hoa_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  hoa_name text,
  contact_email text,
  contact_phone text,
  status text CHECK (status IN (
    'not_required',
    'required',
    'draft',
    'submitted',
    'approved',
    'denied'
  )) DEFAULT 'required',
  submitted_date date,
  approved_date date,
  denied_date date,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_hoa_requests_job_idx ON public.job_hoa_requests(job_id);
CREATE INDEX IF NOT EXISTS job_hoa_requests_workspace_idx ON public.job_hoa_requests(workspace_id, status);

-- ============================================================================
-- PART 3 — ADD JOB-LEVEL MIRRORS (Fast Read)
-- ============================================================================
-- Add flags to roofing_jobs so the Scheduling Board, Job page, and dashboards 
-- can show status without heavy queries

ALTER TABLE public.roofing_jobs
  ADD COLUMN IF NOT EXISTS permit_required boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS permit_status text,          -- 'not_required','required','submitted','approved','denied'
  ADD COLUMN IF NOT EXISTS permit_expiration date,
  ADD COLUMN IF NOT EXISTS hoa_required boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS hoa_status text,             -- 'not_required','required','submitted','approved','denied'
  ADD COLUMN IF NOT EXISTS hoa_name text;

-- ============================================================================
-- PART 4 — RPC: sync_job_permit_summary(job_id)
-- ============================================================================
-- Sync permit summary to job-level mirrors

CREATE OR REPLACE FUNCTION sync_job_permit_summary(p_job_id uuid)
RETURNS void AS $$
DECLARE
  v_status text := 'not_required';
  v_exp date;
BEGIN
  -- if any permit is explicitly required or above draft
  SELECT
    max(
      CASE
        WHEN status IN ('submitted','approved','denied','closed') THEN status
        WHEN status = 'required' THEN 'required'
        ELSE 'not_required'
      END
    ),
    max(expiration_date)
  INTO v_status, v_exp
  FROM job_permits
  WHERE job_id = p_job_id;

  UPDATE roofing_jobs
  SET
    permit_required = (v_status IS NOT NULL AND v_status != 'not_required'),
    permit_status = COALESCE(v_status, 'not_required'),
    permit_expiration = v_exp,
    updated_at = now()
  WHERE id = p_job_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-sync on permit changes
CREATE OR REPLACE FUNCTION job_permits_after_change()
RETURNS trigger AS $$
BEGIN
  PERFORM sync_job_permit_summary(COALESCE(NEW.job_id, OLD.job_id));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS job_permits_after_change_trigger ON public.job_permits;
CREATE TRIGGER job_permits_after_change_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.job_permits
FOR EACH ROW EXECUTE FUNCTION job_permits_after_change();

-- ============================================================================
-- PART 5 — RPC: sync_job_hoa_summary(job_id)
-- ============================================================================
-- Sync HOA summary to job-level mirrors

CREATE OR REPLACE FUNCTION sync_job_hoa_summary(p_job_id uuid)
RETURNS void AS $$
DECLARE
  v_status text := 'not_required';
  v_hoa_name text;
BEGIN
  SELECT
    max(
      CASE
        WHEN status IN ('submitted','approved','denied') THEN status
        WHEN status = 'required' THEN 'required'
        ELSE 'not_required'
      END
    ),
    max(hoa_name)
  INTO v_status, v_hoa_name
  FROM job_hoa_requests
  WHERE job_id = p_job_id;

  UPDATE roofing_jobs
  SET
    hoa_required = (v_status IS NOT NULL AND v_status != 'not_required'),
    hoa_status = COALESCE(v_status, 'not_required'),
    hoa_name = v_hoa_name,
    updated_at = now()
  WHERE id = p_job_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-sync on HOA changes
CREATE OR REPLACE FUNCTION job_hoa_after_change()
RETURNS trigger AS $$
BEGIN
  PERFORM sync_job_hoa_summary(COALESCE(NEW.job_id, OLD.job_id));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS job_hoa_after_change_trigger ON public.job_hoa_requests;
CREATE TRIGGER job_hoa_after_change_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.job_hoa_requests
FOR EACH ROW EXECUTE FUNCTION job_hoa_after_change();

-- ============================================================================
-- PART 6 — UPDATED_AT TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION set_job_permits_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_job_permits_updated_at ON public.job_permits;
CREATE TRIGGER trg_set_job_permits_updated_at
BEFORE UPDATE ON public.job_permits
FOR EACH ROW
EXECUTE FUNCTION set_job_permits_updated_at();

CREATE OR REPLACE FUNCTION set_job_hoa_requests_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_job_hoa_requests_updated_at ON public.job_hoa_requests;
CREATE TRIGGER trg_set_job_hoa_requests_updated_at
BEFORE UPDATE ON public.job_hoa_requests
FOR EACH ROW
EXECUTE FUNCTION set_job_hoa_requests_updated_at();

-- ============================================================================
-- PART 7 — ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.job_permits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_hoa_requests ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view permits/hoa in their workspace
CREATE POLICY "Users can view permits in their workspace"
  ON public.job_permits FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage permits in their workspace"
  ON public.job_permits FOR ALL
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

CREATE POLICY "Users can view hoa requests in their workspace"
  ON public.job_hoa_requests FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage hoa requests in their workspace"
  ON public.job_hoa_requests FOR ALL
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
-- PART 8 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_permits TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_hoa_requests TO authenticated;
GRANT EXECUTE ON FUNCTION sync_job_permit_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION sync_job_hoa_summary(uuid) TO authenticated;








































