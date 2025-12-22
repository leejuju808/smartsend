-- =========================================================
-- Block 22360 — SmartSend Roofing Warranty & Service Tracking v1
-- (We Stand Behind Our Roofs: Track Workmanship & Material Warranties, Service Calls, Expiring Warranties)
-- =========================================================
-- 
-- This block makes SmartSend handle everything warranty & service:
-- - Track workmanship & material warranty for each job
-- - Know when warranties start and expire
-- - Log service calls / leaks / issues against those jobs
-- - See which jobs are still under warranty vs out of warranty
-- - Create a follow-up radar for expiring warranties & inspections
--
-- This makes SmartSend answer: "Is this roof still under our warranty? What service has been done on it?"

-- ============================================================================
-- PART 1 — WARRANTY POLICIES (Templates)
-- ============================================================================
-- Per-workspace templates like "10 Year Workmanship" or "Limited Lifetime Shingle."

CREATE TABLE IF NOT EXISTS public.warranty_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  name text NOT NULL,          -- "10-Year Workmanship"
  type text CHECK (type IN ('workmanship','material','other')) NOT NULL,
  duration_years integer,      -- e.g., 10
  description text,
  terms_url text,              -- link to PDF / web page with detailed terms

  is_active boolean DEFAULT true,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS warranty_policies_workspace_idx
  ON public.warranty_policies (workspace_id, is_active);

-- ============================================================================
-- PART 2 — JOB WARRANTIES (Per-Job Attachments)
-- ============================================================================
-- What warranties apply to THIS job?

CREATE TABLE IF NOT EXISTS public.job_warranties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  policy_id uuid REFERENCES public.warranty_policies(id) ON DELETE SET NULL,

  type text CHECK (type IN ('workmanship','material','other')) NOT NULL,

  provider_name text,      -- manufacturer, or contractor company name
  warranty_number text,    -- manufacturer registration / reference
  duration_years integer,
  start_date date,
  end_date date,

  notes text,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_warranties_job_idx
  ON public.job_warranties (job_id);

CREATE INDEX IF NOT EXISTS job_warranties_workspace_idx
  ON public.job_warranties (workspace_id, end_date);

-- ============================================================================
-- PART 3 — ADD WARRANTY MIRROR COLUMNS TO roofing_jobs
-- ============================================================================
-- Simplified Job-Level Mirrors (for fast check)
-- These mirror fields allow fast filters like:
-- "Show me all jobs still under warranty"
-- "Show me jobs with warranties expiring in next 90 days"

ALTER TABLE public.roofing_jobs
  ADD COLUMN IF NOT EXISTS workmanship_warranty_expiration date,
  ADD COLUMN IF NOT EXISTS material_warranty_expiration date,
  ADD COLUMN IF NOT EXISTS has_active_warranty boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS roofing_jobs_warranty_expiration_idx
  ON public.roofing_jobs (workmanship_warranty_expiration, material_warranty_expiration)
  WHERE has_active_warranty = true;

CREATE INDEX IF NOT EXISTS roofing_jobs_active_warranty_idx
  ON public.roofing_jobs (has_active_warranty)
  WHERE has_active_warranty = true;

-- ============================================================================
-- PART 4 — SERVICE CALLS / WARRANTY CALLS
-- ============================================================================
-- Track service tickets for jobs

CREATE TABLE IF NOT EXISTS public.job_service_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  requested_at timestamptz DEFAULT now(),
  scheduled_date date,
  completed_at timestamptz,

  issue_type text CHECK (issue_type IN (
    'leak',
    'shingle_issue',
    'vent_issue',
    'gutter',
    'inspection',
    'other'
  )) DEFAULT 'other',

  description text,
  status text CHECK (status IN ('open','scheduled','in_progress','completed','cancelled')) DEFAULT 'open',

  is_warranty boolean DEFAULT true,
  under_warranty_at_time boolean,    -- snapshot flag

  resolution_notes text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_service_calls_job_idx
  ON public.job_service_calls (job_id, status);

CREATE INDEX IF NOT EXISTS job_service_calls_workspace_idx
  ON public.job_service_calls (workspace_id, status);

CREATE INDEX IF NOT EXISTS job_service_calls_status_idx
  ON public.job_service_calls (status)
  WHERE status IN ('open','scheduled','in_progress');

-- ============================================================================
-- PART 5 — RPC FUNCTION: sync_job_warranty_summary
-- ============================================================================
-- Updates jobs anytime job_warranties changes

CREATE OR REPLACE FUNCTION public.sync_job_warranty_summary(p_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_work_exp date;
  v_mat_exp date;
  v_has_active boolean;
  v_today date := current_date;
BEGIN
  SELECT max(end_date)
  INTO v_work_exp
  FROM public.job_warranties
  WHERE job_id = p_job_id
    AND type = 'workmanship';

  SELECT max(end_date)
  INTO v_mat_exp
  FROM public.job_warranties
  WHERE job_id = p_job_id
    AND type = 'material';

  v_has_active := false;
  IF v_work_exp IS NOT NULL AND v_work_exp >= v_today THEN
    v_has_active := true;
  END IF;
  IF v_mat_exp IS NOT NULL AND v_mat_exp >= v_today THEN
    v_has_active := true;
  END IF;

  UPDATE public.roofing_jobs
  SET
    workmanship_warranty_expiration = v_work_exp,
    material_warranty_expiration = v_mat_exp,
    has_active_warranty = v_has_active,
    updated_at = now()
  WHERE id = p_job_id;
END;
$$;

COMMENT ON FUNCTION public.sync_job_warranty_summary IS 'Syncs warranty summary fields on roofing_jobs when job_warranties change';

-- ============================================================================
-- PART 6 — TRIGGER: job_warranties_after_change
-- ============================================================================
-- Auto-sync warranty summary when warranties are added/updated/deleted

CREATE OR REPLACE FUNCTION public.job_warranties_after_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.sync_job_warranty_summary(OLD.job_id);
    RETURN OLD;
  ELSE
    PERFORM public.sync_job_warranty_summary(NEW.job_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS job_warranties_after_change_trigger ON public.job_warranties;
CREATE TRIGGER job_warranties_after_change_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.job_warranties
FOR EACH ROW
EXECUTE FUNCTION public.job_warranties_after_change();

-- ============================================================================
-- PART 7 — UPDATED_AT TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_warranty_policies_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_warranty_policies_updated_at ON public.warranty_policies;
CREATE TRIGGER trg_set_warranty_policies_updated_at
BEFORE UPDATE ON public.warranty_policies
FOR EACH ROW
EXECUTE FUNCTION public.set_warranty_policies_updated_at();

CREATE OR REPLACE FUNCTION public.set_job_warranties_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_job_warranties_updated_at ON public.job_warranties;
CREATE TRIGGER trg_set_job_warranties_updated_at
BEFORE UPDATE ON public.job_warranties
FOR EACH ROW
EXECUTE FUNCTION public.set_job_warranties_updated_at();

CREATE OR REPLACE FUNCTION public.set_job_service_calls_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_job_service_calls_updated_at ON public.job_service_calls;
CREATE TRIGGER trg_set_job_service_calls_updated_at
BEFORE UPDATE ON public.job_service_calls
FOR EACH ROW
EXECUTE FUNCTION public.set_job_service_calls_updated_at();

-- ============================================================================
-- PART 8 — ROW LEVEL SECURITY
-- ============================================================================

-- Warranty Policies
ALTER TABLE public.warranty_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view warranty policies in their workspace"
  ON public.warranty_policies FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create warranty policies in their workspace"
  ON public.warranty_policies FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update warranty policies in their workspace"
  ON public.warranty_policies FOR UPDATE
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

-- Job Warranties
ALTER TABLE public.job_warranties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view job warranties in their workspace"
  ON public.job_warranties FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage job warranties in their workspace"
  ON public.job_warranties FOR ALL
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

-- Job Service Calls
ALTER TABLE public.job_service_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view service calls in their workspace"
  ON public.job_service_calls FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create service calls in their workspace"
  ON public.job_service_calls FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update service calls in their workspace"
  ON public.job_service_calls FOR UPDATE
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
-- PART 9 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.warranty_policies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_warranties TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_service_calls TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_job_warranty_summary(uuid) TO authenticated;

