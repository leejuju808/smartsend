-- =========================================================
-- Block 251900 — SmartSend Crew Assignment Engine v1
-- "Auto-Scheduling Crews to Jobs, Capacity Matching, Daily Workload Map, Skill-Based Routing"
-- =========================================================
-- 
-- This block takes SmartSend from "better CRM" → full operational brain.
-- Roofers will say:
-- "SmartSend tells me EXACTLY who should be on what job.
-- We've never had anything like this."
-- 
-- This system eliminates scheduling chaos, reduces delays, and makes production run like a MACHINE.
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE crew_assignments TABLE
-- ============================================================================
-- A crew member assigned to a job on a given day

CREATE TABLE IF NOT EXISTS public.crew_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.workforce_employees(id) ON DELETE CASCADE,
  assigned_date date NOT NULL,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  role_on_job text,       -- installer, tear-off, foreman, etc.
  created_at timestamptz DEFAULT now(),
  
  -- Prevent duplicate assignments
  UNIQUE(job_id, employee_id, assigned_date)
);

CREATE INDEX IF NOT EXISTS idx_crew_assignments_job ON public.crew_assignments(job_id);
CREATE INDEX IF NOT EXISTS idx_crew_assignments_employee ON public.crew_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_crew_assignments_date ON public.crew_assignments(assigned_date);
CREATE INDEX IF NOT EXISTS idx_crew_assignments_employee_date ON public.crew_assignments(employee_id, assigned_date);

COMMENT ON TABLE public.crew_assignments IS 'Crew member assigned to a job on a given day (Block 251900)';
COMMENT ON COLUMN public.crew_assignments.role_on_job IS 'Role on this specific job: installer, tear-off, foreman, laborer, etc.';

-- ============================================================================
-- PART 2 — ADD CAPACITY FIELDS TO workforce_employees
-- ============================================================================

ALTER TABLE public.workforce_employees
ADD COLUMN IF NOT EXISTS daily_capacity_hours int DEFAULT 8 CHECK (daily_capacity_hours >= 0 AND daily_capacity_hours <= 24),
ADD COLUMN IF NOT EXISTS weekly_capacity_hours int DEFAULT 40 CHECK (weekly_capacity_hours >= 0 AND weekly_capacity_hours <= 168);

COMMENT ON COLUMN public.workforce_employees.daily_capacity_hours IS 'Hours per day this employee can work (default 8)';
COMMENT ON COLUMN public.workforce_employees.weekly_capacity_hours IS 'Hours per week this employee can work (default 40)';

-- ============================================================================
-- PART 3 — CREATE job_requirements TABLE
-- ============================================================================
-- Defines what roles and skills are needed for each job

CREATE TABLE IF NOT EXISTS public.job_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  required_role text NOT NULL,         -- installer, foreman, laborer
  quantity_needed int NOT NULL DEFAULT 1 CHECK (quantity_needed > 0),
  skill_level text,           -- apprentice, mid, senior, expert (null = any)
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_requirements_job ON public.job_requirements(job_id);
CREATE INDEX IF NOT EXISTS idx_job_requirements_role ON public.job_requirements(required_role);

COMMENT ON TABLE public.job_requirements IS 'Defines required roles and skills for each job (Block 251900)';
COMMENT ON COLUMN public.job_requirements.required_role IS 'Role needed: installer, foreman, laborer, tear-off, etc.';
COMMENT ON COLUMN public.job_requirements.skill_level IS 'Minimum skill level required: apprentice, mid, senior, expert (null = any)';

-- ============================================================================
-- PART 4 — AUTO-SCHEDULER RPC FUNCTION
-- ============================================================================
-- Automatically assigns employees to jobs based on availability and requirements

CREATE OR REPLACE FUNCTION public.auto_assign_crew(
  p_job_id uuid,
  p_date_in date,
  p_company_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  req record;
  emp record;
  assigned_count int := 0;
  response jsonb := '[]'::jsonb;
  v_company_id uuid;
BEGIN
  -- Get company_id from job if not provided
  IF p_company_id IS NULL THEN
    SELECT company_id INTO v_company_id
    FROM public.jobs
    WHERE id = p_job_id;
  ELSE
    v_company_id := p_company_id;
  END IF;

  -- Loop through required roles for this job
  FOR req IN
    SELECT * FROM public.job_requirements WHERE job_id = p_job_id
  LOOP
    -- For each needed role, find and assign employees
    FOR emp IN
      SELECT e.*
      FROM public.workforce_employees e
      LEFT JOIN public.crew_assignments a
        ON a.employee_id = e.id
        AND a.assigned_date = p_date_in
      WHERE e.company_id = v_company_id
        AND e.status = 'active'
        AND a.id IS NULL                           -- not already scheduled
        AND e.role = req.required_role             -- correct role
        AND (req.skill_level IS NULL
             OR e.skill_level = req.skill_level    -- matches skill level if required
             OR (req.skill_level = 'apprentice' AND e.skill_level IN ('apprentice', 'mid', 'senior', 'expert'))
             OR (req.skill_level = 'mid' AND e.skill_level IN ('mid', 'senior', 'expert'))
             OR (req.skill_level = 'senior' AND e.skill_level IN ('senior', 'expert'))
             OR (req.skill_level = 'expert' AND e.skill_level = 'expert'))
      ORDER BY 
        CASE e.skill_level
          WHEN 'expert' THEN 1
          WHEN 'senior' THEN 2
          WHEN 'mid' THEN 3
          WHEN 'apprentice' THEN 4
        END,
        e.created_at ASC
      LIMIT req.quantity_needed
    LOOP
      -- Insert assignment
      INSERT INTO public.crew_assignments (job_id, employee_id, assigned_date, role_on_job, assigned_by)
      VALUES (p_job_id, emp.id, p_date_in, req.required_role, auth.uid())
      ON CONFLICT (job_id, employee_id, assigned_date) DO NOTHING;

      -- Add to response
      response := response || jsonb_build_object(
        'employee_id', emp.id,
        'employee_name', emp.first_name || ' ' || emp.last_name,
        'role', req.required_role
      );

      assigned_count := assigned_count + 1;
    END LOOP;
  END LOOP;

  RETURN json_build_object(
    'success', true,
    'assigned_count', assigned_count,
    'assignments', response
  );
END;
$$;

COMMENT ON FUNCTION public.auto_assign_crew IS 'Automatically assigns employees to jobs based on availability, role, and skill level (Block 251900)';

-- ============================================================================
-- PART 5 — JOB STAFFING STATUS VIEW
-- ============================================================================

CREATE OR REPLACE VIEW public.job_staffing_status AS
SELECT
  j.id,
  j.company_id,
  COALESCE(j.homeowner_name, 'Unnamed Job') as customer_name,
  j.address,
  j.production_date,
  j.job_type,
  (
    SELECT COALESCE(SUM(quantity_needed), 0)
    FROM public.job_requirements r
    WHERE r.job_id = j.id
  ) as required_positions,
  (
    SELECT COUNT(DISTINCT a.id)
    FROM public.crew_assignments a
    WHERE a.job_id = j.id
  ) as assigned_positions,
  CASE
    WHEN (
      SELECT COUNT(DISTINCT a.id)
      FROM public.crew_assignments a
      WHERE a.job_id = j.id
    ) < (
      SELECT COALESCE(SUM(quantity_needed), 0)
      FROM public.job_requirements r
      WHERE r.job_id = j.id
    ) THEN 'needs_crew'
    WHEN (
      SELECT COUNT(DISTINCT a.id)
      FROM public.crew_assignments a
      WHERE a.job_id = j.id
    ) = (
      SELECT COALESCE(SUM(quantity_needed), 0)
      FROM public.job_requirements r
      WHERE r.job_id = j.id
    ) THEN 'fully_staffed'
    ELSE 'overstaffed'
  END as staffing_status
FROM public.jobs j
WHERE j.company_id IS NOT NULL;

COMMENT ON VIEW public.job_staffing_status IS 'Shows staffing status for each job: needs_crew, fully_staffed, or overstaffed (Block 251900)';

-- ============================================================================
-- PART 6 — CONFLICT DETECTION FUNCTION
-- ============================================================================
-- Finds employees assigned to multiple jobs on the same day

CREATE OR REPLACE FUNCTION public.get_crew_conflicts(
  p_company_id uuid,
  p_start_date date DEFAULT CURRENT_DATE,
  p_end_date date DEFAULT CURRENT_DATE + 7
)
RETURNS TABLE (
  employee_id uuid,
  employee_name text,
  assigned_date date,
  jobs_count bigint,
  job_ids uuid[],
  conflict_type text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT 
    ca.employee_id,
    we.first_name || ' ' || we.last_name as employee_name,
    ca.assigned_date,
    COUNT(DISTINCT ca.job_id) as jobs_count,
    ARRAY_AGG(DISTINCT ca.job_id) as job_ids,
    CASE
      WHEN COUNT(DISTINCT ca.job_id) > 1 THEN 'overbooked'
      ELSE 'ok'
    END as conflict_type
  FROM public.crew_assignments ca
  JOIN public.workforce_employees we ON we.id = ca.employee_id
  JOIN public.jobs j ON j.id = ca.job_id
  WHERE we.company_id = p_company_id
    AND ca.assigned_date BETWEEN p_start_date AND p_end_date
  GROUP BY ca.employee_id, we.first_name, we.last_name, ca.assigned_date
  HAVING COUNT(DISTINCT ca.job_id) > 1
  ORDER BY ca.assigned_date, employee_name;
$$;

COMMENT ON FUNCTION public.get_crew_conflicts IS 'Detects employees assigned to multiple jobs on the same day (Block 251900)';

-- ============================================================================
-- PART 7 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.crew_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_requirements ENABLE ROW LEVEL SECURITY;

-- RLS Policies for crew_assignments
DROP POLICY IF EXISTS "crew_assignments_select" ON public.crew_assignments;
CREATE POLICY "crew_assignments_select" ON public.crew_assignments
  FOR SELECT USING (
    EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.workforce_employees we ON we.id = crew_assignments.employee_id
      WHERE j.id = crew_assignments.job_id
        AND (we.company_id IN (
          SELECT roofing_company_id FROM public.roofing_company_members
          WHERE user_id = auth.uid() AND is_active = true
        ) OR EXISTS(
          SELECT 1 FROM public.roofing_companies rc
          WHERE rc.id = we.company_id AND rc.owner_id = auth.uid()
        ))
    )
  );

DROP POLICY IF EXISTS "crew_assignments_insert" ON public.crew_assignments;
CREATE POLICY "crew_assignments_insert" ON public.crew_assignments
  FOR INSERT WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.workforce_employees we ON we.id = crew_assignments.employee_id
      WHERE j.id = crew_assignments.job_id
        AND (we.company_id IN (
          SELECT roofing_company_id FROM public.roofing_company_members
          WHERE user_id = auth.uid() AND is_active = true
        ) OR EXISTS(
          SELECT 1 FROM public.roofing_companies rc
          WHERE rc.id = we.company_id AND rc.owner_id = auth.uid()
        ))
    )
  );

DROP POLICY IF EXISTS "crew_assignments_update" ON public.crew_assignments;
CREATE POLICY "crew_assignments_update" ON public.crew_assignments
  FOR UPDATE USING (
    EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.workforce_employees we ON we.id = crew_assignments.employee_id
      WHERE j.id = crew_assignments.job_id
        AND (we.company_id IN (
          SELECT roofing_company_id FROM public.roofing_company_members
          WHERE user_id = auth.uid() AND is_active = true
        ) OR EXISTS(
          SELECT 1 FROM public.roofing_companies rc
          WHERE rc.id = we.company_id AND rc.owner_id = auth.uid()
        ))
    )
  );

DROP POLICY IF EXISTS "crew_assignments_delete" ON public.crew_assignments;
CREATE POLICY "crew_assignments_delete" ON public.crew_assignments
  FOR DELETE USING (
    EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.workforce_employees we ON we.id = crew_assignments.employee_id
      WHERE j.id = crew_assignments.job_id
        AND (we.company_id IN (
          SELECT roofing_company_id FROM public.roofing_company_members
          WHERE user_id = auth.uid() AND is_active = true
        ) OR EXISTS(
          SELECT 1 FROM public.roofing_companies rc
          WHERE rc.id = we.company_id AND rc.owner_id = auth.uid()
        ))
    )
  );

-- RLS Policies for job_requirements
DROP POLICY IF EXISTS "job_requirements_select" ON public.job_requirements;
CREATE POLICY "job_requirements_select" ON public.job_requirements
  FOR SELECT USING (
    EXISTS(
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_requirements.job_id
        AND (j.company_id IN (
          SELECT roofing_company_id FROM public.roofing_company_members
          WHERE user_id = auth.uid() AND is_active = true
        ) OR EXISTS(
          SELECT 1 FROM public.roofing_companies rc
          WHERE rc.id = j.company_id AND rc.owner_id = auth.uid()
        ))
    )
  );

DROP POLICY IF EXISTS "job_requirements_insert" ON public.job_requirements;
CREATE POLICY "job_requirements_insert" ON public.job_requirements
  FOR INSERT WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_requirements.job_id
        AND (j.company_id IN (
          SELECT roofing_company_id FROM public.roofing_company_members
          WHERE user_id = auth.uid() AND is_active = true
        ) OR EXISTS(
          SELECT 1 FROM public.roofing_companies rc
          WHERE rc.id = j.company_id AND rc.owner_id = auth.uid()
        ))
    )
  );

DROP POLICY IF EXISTS "job_requirements_update" ON public.job_requirements;
CREATE POLICY "job_requirements_update" ON public.job_requirements
  FOR UPDATE USING (
    EXISTS(
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_requirements.job_id
        AND (j.company_id IN (
          SELECT roofing_company_id FROM public.roofing_company_members
          WHERE user_id = auth.uid() AND is_active = true
        ) OR EXISTS(
          SELECT 1 FROM public.roofing_companies rc
          WHERE rc.id = j.company_id AND rc.owner_id = auth.uid()
        ))
    )
  );

DROP POLICY IF EXISTS "job_requirements_delete" ON public.job_requirements;
CREATE POLICY "job_requirements_delete" ON public.job_requirements
  FOR DELETE USING (
    EXISTS(
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_requirements.job_id
        AND (j.company_id IN (
          SELECT roofing_company_id FROM public.roofing_company_members
          WHERE user_id = auth.uid() AND is_active = true
        ) OR EXISTS(
          SELECT 1 FROM public.roofing_companies rc
          WHERE rc.id = j.company_id AND rc.owner_id = auth.uid()
        ))
    )
  );

-- ============================================================================
-- PART 8 — HELPER FUNCTIONS
-- ============================================================================

-- Get employee workload for a date range
CREATE OR REPLACE FUNCTION public.get_employee_workload(
  p_employee_id uuid,
  p_start_date date DEFAULT CURRENT_DATE,
  p_end_date date DEFAULT CURRENT_DATE + 7
)
RETURNS TABLE (
  assigned_date date,
  jobs_count bigint,
  job_ids uuid[],
  job_names text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT 
    ca.assigned_date,
    COUNT(DISTINCT ca.job_id) as jobs_count,
    ARRAY_AGG(DISTINCT ca.job_id) as job_ids,
    ARRAY_AGG(DISTINCT COALESCE(j.homeowner_name, 'Unnamed Job')) as job_names
  FROM public.crew_assignments ca
  JOIN public.jobs j ON j.id = ca.job_id
  WHERE ca.employee_id = p_employee_id
    AND ca.assigned_date BETWEEN p_start_date AND p_end_date
  GROUP BY ca.assigned_date
  ORDER BY ca.assigned_date;
$$;

COMMENT ON FUNCTION public.get_employee_workload IS 'Get employee workload (jobs assigned) for a date range (Block 251900)';
























