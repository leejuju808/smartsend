-- ============================================================
-- Block 277000 — SmartSend Crew App Bridge v1
-- “From Sold Job to Field Execution”
-- Canonical handoff: approved estimate -> crew job card (jobs)
-- ============================================================

-- 1) Jobs table (v1 minimum)
CREATE TABLE IF NOT EXISTS public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  estimate_id uuid NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  customer_name text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  scope_summary text NOT NULL DEFAULT '',
  scheduled_date date,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One job per estimate (idempotent auto-create)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'jobs'
      AND constraint_type = 'UNIQUE'
      AND constraint_name = 'jobs_estimate_id_key'
  ) THEN
    ALTER TABLE public.jobs ADD CONSTRAINT jobs_estimate_id_key UNIQUE (estimate_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_jobs_company_id ON public.jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_scheduled_date ON public.jobs(scheduled_date) WHERE scheduled_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON public.jobs(created_at DESC);

-- 2) Locked status flow: pending -> scheduled -> completed
CREATE OR REPLACE FUNCTION public.enforce_jobs_status_flow()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Allow no-op status updates
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
      RETURN NEW;
    END IF;

    -- Enforce fixed transitions
    IF OLD.status = 'pending' AND NEW.status = 'scheduled' THEN
      RETURN NEW;
    ELSIF OLD.status = 'scheduled' AND NEW.status = 'completed' THEN
      RETURN NEW;
    ELSE
      RAISE EXCEPTION 'Invalid job status transition: % -> %', OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_jobs_status_flow ON public.jobs;
CREATE TRIGGER trg_enforce_jobs_status_flow
BEFORE UPDATE OF status ON public.jobs
FOR EACH ROW
EXECUTE FUNCTION public.enforce_jobs_status_flow();

-- 3) Auto-create job on estimate approval (locked)
-- Robust across estimate schema variants: uses to_jsonb(NEW) to safely read optional columns.
CREATE OR REPLACE FUNCTION public.create_job_on_estimate_approved()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  e jsonb;
  v_company_id uuid;
  v_homeowner_id uuid;
  v_customer_name text;
  v_address text;
  v_scope text;
  v_notes text;
  v_line_items jsonb;
  v_items text;
  v_homeowner_name text;
  v_line1 text;
  v_line2 text;
  v_line3 text;
BEGIN
  e := to_jsonb(NEW);

  -- Only run on transition to approved
  IF (NEW.status IS DISTINCT FROM 'approved') THEN
    RETURN NEW;
  END IF;

  -- Guard for updates where old was already approved (trigger condition should prevent, but double-safe)
  IF (TG_OP = 'UPDATE') AND (OLD.status = 'approved') THEN
    RETURN NEW;
  END IF;

  v_company_id := NULLIF(e->>'company_id', '')::uuid;
  v_homeowner_id := NULLIF(e->>'homeowner_id', '')::uuid;

  -- Best-effort lookups (optional columns)
  v_customer_name := NULLIF(BTRIM(COALESCE(e->>'customer_name', '')), '');
  v_address := NULLIF(BTRIM(COALESCE(e->>'address', '')), '');
  v_scope := NULLIF(BTRIM(COALESCE(e->>'scope', '')), '');
  v_notes := NULLIF(BTRIM(COALESCE(e->>'notes', '')), '');
  v_line_items := COALESCE(e->'line_items', '[]'::jsonb);

  IF v_homeowner_id IS NOT NULL THEN
    BEGIN
      SELECT h.name INTO v_homeowner_name
      FROM public.homeowners h
      WHERE h.id = v_homeowner_id;
    EXCEPTION WHEN others THEN
      v_homeowner_name := NULL;
    END;
  END IF;

  IF v_customer_name IS NULL THEN
    v_customer_name := NULLIF(BTRIM(COALESCE(v_homeowner_name, '')), '');
  END IF;

  -- Extract up to 3 line item labels
  BEGIN
    SELECT string_agg(x.label, ', ')
    INTO v_items
    FROM (
      SELECT NULLIF(BTRIM(COALESCE(li.value->>'material', li.value->>'description', '')), '') AS label
      FROM jsonb_array_elements(v_line_items) AS li(value)
      WHERE NULLIF(BTRIM(COALESCE(li.value->>'material', li.value->>'description', '')), '') IS NOT NULL
      LIMIT 3
    ) x
    WHERE x.label IS NOT NULL;
  EXCEPTION WHEN others THEN
    v_items := NULL;
  END;

  -- 3-line plain-English scope summary
  v_line1 := COALESCE(v_scope, 'Roofing work per approved estimate');
  v_line2 := CASE WHEN v_items IS NOT NULL THEN ('Includes: ' || v_items) ELSE NULL END;
  v_line3 := CASE
    WHEN v_notes IS NOT NULL THEN ('Notes: ' || LEFT(REGEXP_REPLACE(v_notes, E'[\n\r\t]+', ' ', 'g'), 140))
    ELSE NULL
  END;

  -- If we can't determine company_id, don't create a job (cannot route it).
  IF v_company_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.jobs (
    company_id,
    estimate_id,
    customer_name,
    address,
    scope_summary,
    status
  )
  VALUES (
    v_company_id,
    NEW.id,
    COALESCE(v_customer_name, 'Customer'),
    COALESCE(v_address, ''),
    array_to_string(array_remove(ARRAY[v_line1, v_line2, v_line3], NULL), E'\n'),
    'pending'
  )
  ON CONFLICT (estimate_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_job_on_estimate_approved ON public.estimates;
CREATE TRIGGER trg_create_job_on_estimate_approved
AFTER UPDATE OF status ON public.estimates
FOR EACH ROW
WHEN (NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved'))
EXECUTE FUNCTION public.create_job_on_estimate_approved();

-- 4) RLS + policies (company members)
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- SELECT
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'jobs'
      AND policyname = 'jobs_select_roofing_company_members'
  ) THEN
    EXECUTE $POL$
      CREATE POLICY "jobs_select_roofing_company_members"
      ON public.jobs
      FOR SELECT
      TO authenticated
      USING (
        company_id IS NOT NULL AND company_id IN (
          SELECT roofing_company_id
          FROM public.roofing_company_members
          WHERE user_id = auth.uid()
            AND is_active = true
        )
      )
    $POL$;
  END IF;

  -- UPDATE (schedule/status)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'jobs'
      AND policyname = 'jobs_update_roofing_company_members'
  ) THEN
    EXECUTE $POL$
      CREATE POLICY "jobs_update_roofing_company_members"
      ON public.jobs
      FOR UPDATE
      TO authenticated
      USING (
        company_id IS NOT NULL AND company_id IN (
          SELECT roofing_company_id
          FROM public.roofing_company_members
          WHERE user_id = auth.uid()
            AND is_active = true
        )
      )
      WITH CHECK (
        company_id IS NOT NULL AND company_id IN (
          SELECT roofing_company_id
          FROM public.roofing_company_members
          WHERE user_id = auth.uid()
            AND is_active = true
        )
      )
    $POL$;
  END IF;

  -- INSERT: allow service_role only (jobs are auto-created by DB trigger)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'jobs'
      AND policyname = 'jobs_service_role_all'
  ) THEN
    EXECUTE $POL$
      CREATE POLICY jobs_service_role_all
      ON public.jobs
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true)
    $POL$;
  END IF;
END $$;

GRANT SELECT, UPDATE ON public.jobs TO authenticated;
GRANT ALL ON public.jobs TO service_role;









