-- =========================================================
-- Block 251500 — SmartSend Crew Photo Verification System v1
-- "Before / During / After Job Proof, Required Photo Templates, Auto-Flagging Missing Photos"
-- =========================================================
-- 
-- This is the feature that makes roofers DROOL because it eliminates:
-- - sloppy crews
-- - missing photos
-- - insurance disputes
-- - warranty denials
-- - "he said / she said" jobsite problems
-- - callbacks costing thousands
-- 
-- Roofers will say:
-- "SmartSend makes my crews WAY more accountable.
-- We never miss required photos now."
-- 
-- This is how we embarrass every roofing CRM that forces manual uploads with no structure.
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE required_photo_templates TABLE
-- ============================================================================
-- Admin sets what photos are REQUIRED per job type and stage

CREATE TABLE IF NOT EXISTS public.required_photo_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  job_type text NOT NULL,       -- "roof_replacement", "repair", "inspection", etc.
  stage text NOT NULL CHECK (stage IN ('before', 'during', 'after')),
  label text NOT NULL,          -- "Front elevation", "Shingle close-up", etc.
  description text,
  is_required boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Ensure unique label per company/job_type/stage combination
  CONSTRAINT unique_template_per_company_job_stage UNIQUE (company_id, job_type, stage, label)
);

CREATE INDEX IF NOT EXISTS idx_required_photo_templates_company ON public.required_photo_templates(company_id);
CREATE INDEX IF NOT EXISTS idx_required_photo_templates_job_type ON public.required_photo_templates(company_id, job_type);
CREATE INDEX IF NOT EXISTS idx_required_photo_templates_stage ON public.required_photo_templates(company_id, job_type, stage);

COMMENT ON TABLE public.required_photo_templates IS 'Admin-defined required photos per job type and stage (Block 251500)';
COMMENT ON COLUMN public.required_photo_templates.stage IS 'Stage: before, during, after';
COMMENT ON COLUMN public.required_photo_templates.job_type IS 'Job type: roof_replacement, repair, inspection, etc.';

-- ============================================================================
-- PART 2 — CREATE job_photo_entries TABLE
-- ============================================================================
-- Stores actual photos uploaded by crews

CREATE TABLE IF NOT EXISTS public.job_photo_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  stage text NOT NULL CHECK (stage IN ('before', 'during', 'after')),
  label text,                   -- matched label from template
  url text NOT NULL,             -- Storage URL
  file_path text NOT NULL,       -- Storage path for deletion
  metadata jsonb DEFAULT '{}'::jsonb, -- GPS, timestamp, device info, etc.
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_job_photo_entries_job ON public.job_photo_entries(job_id);
CREATE INDEX IF NOT EXISTS idx_job_photo_entries_employee ON public.job_photo_entries(employee_id);
CREATE INDEX IF NOT EXISTS idx_job_photo_entries_stage ON public.job_photo_entries(job_id, stage);
CREATE INDEX IF NOT EXISTS idx_job_photo_entries_label ON public.job_photo_entries(job_id, stage, label);
CREATE INDEX IF NOT EXISTS idx_job_photo_entries_created ON public.job_photo_entries(job_id, created_at DESC);

COMMENT ON TABLE public.job_photo_entries IS 'Actual photos uploaded by crews (Block 251500)';
COMMENT ON COLUMN public.job_photo_entries.stage IS 'Stage: before, during, after';

-- ============================================================================
-- PART 3 — CREATE job_photo_status TABLE
-- ============================================================================
-- Auto-calculated status tracking for each job/stage

CREATE TABLE IF NOT EXISTS public.job_photo_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN ('before', 'during', 'after')),
  total_required int DEFAULT 0,
  total_completed int DEFAULT 0,
  missing int DEFAULT 0,
  is_complete boolean DEFAULT false,
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(job_id, stage)
);

CREATE INDEX IF NOT EXISTS idx_job_photo_status_job ON public.job_photo_status(job_id);
CREATE INDEX IF NOT EXISTS idx_job_photo_status_stage ON public.job_photo_status(job_id, stage);
CREATE INDEX IF NOT EXISTS idx_job_photo_status_complete ON public.job_photo_status(job_id, is_complete);

COMMENT ON TABLE public.job_photo_status IS 'Auto-calculated photo status per job/stage (Block 251500)';

-- ============================================================================
-- PART 4 — CREATE VIEW: job_photo_missing
-- ============================================================================
-- Shows which required photos are missing for each job

CREATE OR REPLACE VIEW public.job_photo_missing AS
SELECT
  j.id as job_id,
  j.company_id,
  j.job_type,
  t.stage,
  t.label,
  t.description,
  CASE
    WHEN e.id IS NULL THEN true
    ELSE false
  END as is_missing,
  e.id as photo_entry_id,
  e.url as photo_url,
  e.created_at as photo_uploaded_at
FROM public.jobs j
CROSS JOIN public.required_photo_templates t
LEFT JOIN public.job_photo_entries e
  ON e.job_id = j.id
  AND e.stage = t.stage
  AND e.label = t.label
WHERE j.company_id = t.company_id
  AND j.job_type = t.job_type
  AND t.is_required = true;

COMMENT ON VIEW public.job_photo_missing IS 'Shows missing required photos per job (Block 251500)';

-- ============================================================================
-- PART 5 — FUNCTION: update_job_photo_status
-- ============================================================================
-- Updates job_photo_status after every photo upload

CREATE OR REPLACE FUNCTION public.update_job_photo_status(
  job_uuid uuid,
  stage_in text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  job_type_val text;
  company_id_val uuid;
  required_count int;
  completed_count int;
  missing_count int;
BEGIN
  -- Get job type and company_id
  SELECT j.job_type, j.company_id INTO job_type_val, company_id_val
  FROM public.jobs j
  WHERE j.id = job_uuid;
  
  IF job_type_val IS NULL OR company_id_val IS NULL THEN
    RETURN;
  END IF;
  
  -- Count required photos for this job type and stage
  SELECT COUNT(*) INTO required_count
  FROM public.required_photo_templates
  WHERE company_id = company_id_val
    AND job_type = job_type_val
    AND stage = stage_in
    AND is_required = true;
  
  -- Count completed photos
  SELECT COUNT(DISTINCT label) INTO completed_count
  FROM public.job_photo_entries
  WHERE job_id = job_uuid
    AND stage = stage_in;
  
  -- Count missing photos
  SELECT COUNT(*) INTO missing_count
  FROM public.required_photo_templates t
  WHERE t.company_id = company_id_val
    AND t.job_type = job_type_val
    AND t.stage = stage_in
    AND t.is_required = true
    AND NOT EXISTS (
      SELECT 1 FROM public.job_photo_entries e
      WHERE e.job_id = job_uuid
        AND e.stage = stage_in
        AND e.label = t.label
    );
  
  -- Upsert status
  INSERT INTO public.job_photo_status (job_id, stage, total_required, total_completed, missing, is_complete, updated_at)
  VALUES (
    job_uuid,
    stage_in,
    required_count,
    completed_count,
    missing_count,
    (missing_count = 0 AND required_count > 0),
    now()
  )
  ON CONFLICT (job_id, stage)
  DO UPDATE SET
    total_required = EXCLUDED.total_required,
    total_completed = EXCLUDED.total_completed,
    missing = EXCLUDED.missing,
    is_complete = EXCLUDED.is_complete,
    updated_at = EXCLUDED.updated_at;
END;
$$;

COMMENT ON FUNCTION public.update_job_photo_status IS 'Updates photo status after upload (Block 251500)';

-- ============================================================================
-- PART 6 — TRIGGER: refresh_photo_status
-- ============================================================================
-- Auto-update status after photo insert/update/delete

CREATE OR REPLACE FUNCTION public.trigger_update_job_photo_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    PERFORM public.update_job_photo_status(NEW.job_id, NEW.stage);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.update_job_photo_status(OLD.job_id, OLD.stage);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS refresh_photo_status_insert ON public.job_photo_entries;
CREATE TRIGGER refresh_photo_status_insert
AFTER INSERT ON public.job_photo_entries
FOR EACH ROW
EXECUTE FUNCTION public.trigger_update_job_photo_status();

DROP TRIGGER IF EXISTS refresh_photo_status_update ON public.job_photo_entries;
CREATE TRIGGER refresh_photo_status_update
AFTER UPDATE ON public.job_photo_entries
FOR EACH ROW
WHEN (OLD.stage IS DISTINCT FROM NEW.stage OR OLD.label IS DISTINCT FROM NEW.label)
EXECUTE FUNCTION public.trigger_update_job_photo_status();

DROP TRIGGER IF EXISTS refresh_photo_status_delete ON public.job_photo_entries;
CREATE TRIGGER refresh_photo_status_delete
AFTER DELETE ON public.job_photo_entries
FOR EACH ROW
EXECUTE FUNCTION public.trigger_update_job_photo_status();

-- ============================================================================
-- PART 7 — FUNCTION: get_job_photo_compliance_score
-- ============================================================================
-- Calculate compliance score for a job (0-100)

CREATE OR REPLACE FUNCTION public.get_job_photo_compliance_score(job_uuid uuid)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT 
    CASE 
      WHEN SUM(total_required) = 0 THEN 100::numeric
      ELSE ROUND(100.0 * SUM(total_completed) / NULLIF(SUM(total_required), 0), 2)
    END
  FROM public.job_photo_status
  WHERE job_id = job_uuid;
$$;

COMMENT ON FUNCTION public.get_job_photo_compliance_score IS 'Calculate photo compliance score for a job (0-100) (Block 251500)';

-- ============================================================================
-- PART 8 — FUNCTION: get_employee_photo_compliance_score
-- ============================================================================
-- Calculate average compliance score for an employee across all their jobs

CREATE OR REPLACE FUNCTION public.get_employee_photo_compliance_score(
  employee_uuid uuid,
  start_date date DEFAULT NULL,
  end_date date DEFAULT NULL
)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  WITH employee_jobs AS (
    SELECT DISTINCT j.id as job_id
    FROM public.jobs j
    JOIN public.job_photo_entries e ON e.job_id = j.id
    WHERE e.employee_id = employee_uuid
      AND (start_date IS NULL OR j.created_at >= start_date)
      AND (end_date IS NULL OR j.created_at <= end_date)
  )
  SELECT 
    CASE 
      WHEN COUNT(*) = 0 THEN 0::numeric
      ELSE ROUND(AVG(public.get_job_photo_compliance_score(job_id)), 2)
    END
  FROM employee_jobs;
$$;

COMMENT ON FUNCTION public.get_employee_photo_compliance_score IS 'Calculate average photo compliance score for an employee (Block 251500)';

-- ============================================================================
-- PART 9 — UPDATED_AT TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_photo_template_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_required_photo_templates_updated_at ON public.required_photo_templates;
CREATE TRIGGER trg_required_photo_templates_updated_at
BEFORE UPDATE ON public.required_photo_templates
FOR EACH ROW EXECUTE FUNCTION public.set_photo_template_updated_at();

-- ============================================================================
-- PART 10 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.required_photo_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_photo_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_photo_status ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user has access to roofing company
-- (Reusing the function from workforce hub if it exists, otherwise create it)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'can_access_roofing_company'
  ) THEN
    CREATE OR REPLACE FUNCTION public.can_access_roofing_company(_company_id uuid)
    RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
      SELECT EXISTS(
        SELECT 1 FROM public.roofing_companies rc
        WHERE rc.id = _company_id
        AND (
          rc.owner_id = auth.uid()
          OR EXISTS(
            SELECT 1 FROM public.roofing_company_members rcm
            WHERE rcm.roofing_company_id = _company_id
            AND rcm.user_id = auth.uid()
            AND rcm.is_active = true
          )
        )
      );
    $$;
  END IF;
END $$;

-- RLS Policies for required_photo_templates
DROP POLICY IF EXISTS "required_photo_templates_select" ON public.required_photo_templates;
CREATE POLICY "required_photo_templates_select" ON public.required_photo_templates
  FOR SELECT USING (can_access_roofing_company(company_id));

DROP POLICY IF EXISTS "required_photo_templates_insert" ON public.required_photo_templates;
CREATE POLICY "required_photo_templates_insert" ON public.required_photo_templates
  FOR INSERT WITH CHECK (can_access_roofing_company(company_id));

DROP POLICY IF EXISTS "required_photo_templates_update" ON public.required_photo_templates;
CREATE POLICY "required_photo_templates_update" ON public.required_photo_templates
  FOR UPDATE USING (can_access_roofing_company(company_id))
  WITH CHECK (can_access_roofing_company(company_id));

DROP POLICY IF EXISTS "required_photo_templates_delete" ON public.required_photo_templates;
CREATE POLICY "required_photo_templates_delete" ON public.required_photo_templates
  FOR DELETE USING (can_access_roofing_company(company_id));

-- RLS Policies for job_photo_entries
-- Employees can insert their own photos, office can view all
DROP POLICY IF EXISTS "job_photo_entries_select" ON public.job_photo_entries;
CREATE POLICY "job_photo_entries_select" ON public.job_photo_entries
  FOR SELECT USING (
    EXISTS(
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_photo_entries.job_id
      AND can_access_roofing_company(j.company_id)
    )
    OR EXISTS(
      SELECT 1 FROM public.workforce_employees we
      WHERE we.id = job_photo_entries.employee_id
      AND we.id IN (
        SELECT id FROM public.workforce_employees
        WHERE user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "job_photo_entries_insert" ON public.job_photo_entries;
CREATE POLICY "job_photo_entries_insert" ON public.job_photo_entries
  FOR INSERT WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_photo_entries.job_id
      AND can_access_roofing_company(j.company_id)
    )
    OR EXISTS(
      SELECT 1 FROM public.workforce_employees we
      WHERE we.id = job_photo_entries.employee_id
      AND we.id IN (
        SELECT id FROM public.workforce_employees
        WHERE user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "job_photo_entries_update" ON public.job_photo_entries;
CREATE POLICY "job_photo_entries_update" ON public.job_photo_entries
  FOR UPDATE USING (
    EXISTS(
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_photo_entries.job_id
      AND can_access_roofing_company(j.company_id)
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_photo_entries.job_id
      AND can_access_roofing_company(j.company_id)
    )
  );

DROP POLICY IF EXISTS "job_photo_entries_delete" ON public.job_photo_entries;
CREATE POLICY "job_photo_entries_delete" ON public.job_photo_entries
  FOR DELETE USING (
    EXISTS(
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_photo_entries.job_id
      AND can_access_roofing_company(j.company_id)
    )
  );

-- RLS Policies for job_photo_status (read-only for most users)
DROP POLICY IF EXISTS "job_photo_status_select" ON public.job_photo_status;
CREATE POLICY "job_photo_status_select" ON public.job_photo_status
  FOR SELECT USING (
    EXISTS(
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_photo_status.job_id
      AND can_access_roofing_company(j.company_id)
    )
  );

-- Service role can do everything
DROP POLICY IF EXISTS "photo_templates_service_role" ON public.required_photo_templates;
CREATE POLICY "photo_templates_service_role" ON public.required_photo_templates
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "job_photo_entries_service_role" ON public.job_photo_entries;
CREATE POLICY "job_photo_entries_service_role" ON public.job_photo_entries
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "job_photo_status_service_role" ON public.job_photo_status;
CREATE POLICY "job_photo_status_service_role" ON public.job_photo_status
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
























