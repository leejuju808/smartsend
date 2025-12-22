-- Block 210000 — SmartSend Roofing "Crew App v1 — Checklists, Time Tracking, Material Verification, Safety Logs"
-- 
-- This block turns SmartSend into BOTH:
-- - an office system
-- - a field operations system
--
-- Crews are the backbone of roofing companies, but crews are also the MOST chaotic part:
-- - No documentation
-- - No checklists
-- - Missing materials
-- - No job start confirmations
-- - Poor photos
-- - No time tracking
-- - No safety compliance
--
-- SmartSend Crew App fixes ALL of this.

-- ============================================================
-- 1. CREW_TIME_ENTRIES TABLE
-- ============================================================
-- Time tracking for crew members (clock in/out)
CREATE TABLE IF NOT EXISTS public.crew_time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  crew_member_id uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  clock_in timestamptz NOT NULL,
  clock_out timestamptz,
  total_hours numeric(10, 2), -- Calculated: (clock_out - clock_in) in hours
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add foreign key to jobs table (works with both public.jobs and public.roofing_jobs)
DO $$
BEGIN
  -- Try to add FK to public.jobs first
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'crew_time_entries_job_id_fkey'
    ) THEN
      ALTER TABLE public.crew_time_entries
        ADD CONSTRAINT crew_time_entries_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
    END IF;
  -- Fallback to roofing_jobs if jobs doesn't exist
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'crew_time_entries_job_id_fkey'
    ) THEN
      ALTER TABLE public.crew_time_entries
        ADD CONSTRAINT crew_time_entries_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_crew_time_entries_job ON public.crew_time_entries(job_id, clock_in DESC);
CREATE INDEX IF NOT EXISTS idx_crew_time_entries_member ON public.crew_time_entries(crew_member_id);
CREATE INDEX IF NOT EXISTS idx_crew_time_entries_clock_in ON public.crew_time_entries(clock_in DESC);

-- Function to calculate total hours when clock_out is set
CREATE OR REPLACE FUNCTION calculate_time_entry_hours()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.clock_out IS NOT NULL AND NEW.clock_in IS NOT NULL THEN
    NEW.total_hours := EXTRACT(EPOCH FROM (NEW.clock_out - NEW.clock_in)) / 3600.0;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calculate_time_entry_hours
BEFORE INSERT OR UPDATE ON public.crew_time_entries
FOR EACH ROW
EXECUTE FUNCTION calculate_time_entry_hours();

-- ============================================================
-- 2. JOB_CHECKLISTS TABLE
-- ============================================================
-- Digital checklists (required before starting work)
CREATE TABLE IF NOT EXISTS public.job_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  checklist_type text NOT NULL CHECK (checklist_type IN ('pre-start', 'tear-off', 'install', 'final')),
  items jsonb NOT NULL DEFAULT '[]'::jsonb, -- Array of {text, done} objects
  completed boolean DEFAULT false,
  completed_at timestamptz,
  completed_by uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add foreign key to jobs table
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'job_checklists_job_id_fkey'
    ) THEN
      ALTER TABLE public.job_checklists
        ADD CONSTRAINT job_checklists_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
    END IF;
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'job_checklists_job_id_fkey'
    ) THEN
      ALTER TABLE public.job_checklists
        ADD CONSTRAINT job_checklists_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_job_checklists_job ON public.job_checklists(job_id, checklist_type);
CREATE INDEX IF NOT EXISTS idx_job_checklists_completed ON public.job_checklists(completed);
CREATE INDEX IF NOT EXISTS idx_job_checklists_type ON public.job_checklists(checklist_type);

-- Function to auto-set completed_at when all items are done
CREATE OR REPLACE FUNCTION check_checklist_completion()
RETURNS TRIGGER AS $$
DECLARE
  all_done boolean;
BEGIN
  -- Check if all items are done
  SELECT bool_and((item->>'done')::boolean)
  INTO all_done
  FROM jsonb_array_elements(NEW.items) AS item;
  
  IF all_done = true AND NEW.completed = false THEN
    NEW.completed := true;
    NEW.completed_at := now();
  ELSIF all_done = false AND NEW.completed = true THEN
    NEW.completed := false;
    NEW.completed_at := NULL;
  END IF;
  
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_checklist_completion
BEFORE INSERT OR UPDATE ON public.job_checklists
FOR EACH ROW
EXECUTE FUNCTION check_checklist_completion();

-- ============================================================
-- 3. SAFETY_LOGS TABLE
-- ============================================================
-- OSHA compliance and safety tracking
CREATE TABLE IF NOT EXISTS public.safety_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  crew_member_id uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  weather text,
  wind_speed text,
  hazards jsonb DEFAULT '[]'::jsonb, -- Array of hazard descriptions
  compliance jsonb DEFAULT '{}'::jsonb, -- {ppe_used: [], ladder_tie_offs: boolean, equipment_checks: []}
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Add foreign key to jobs table
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'safety_logs_job_id_fkey'
    ) THEN
      ALTER TABLE public.safety_logs
        ADD CONSTRAINT safety_logs_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
    END IF;
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'safety_logs_job_id_fkey'
    ) THEN
      ALTER TABLE public.safety_logs
        ADD CONSTRAINT safety_logs_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_safety_logs_job ON public.safety_logs(job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_safety_logs_member ON public.safety_logs(crew_member_id);

-- ============================================================
-- 4. JOB_ISSUES TABLE
-- ============================================================
-- Issue reporting from crews
CREATE TABLE IF NOT EXISTS public.job_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  crew_member_id uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  issue_type text NOT NULL, -- 'decking_rot', 'wrong_color', 'missing_materials', 'structural_issue', 'homeowner_request', 'crew_note'
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high')),
  description text NOT NULL,
  photo_url text,
  status text DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved', 'closed')),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add foreign key to jobs table
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'job_issues_job_id_fkey'
    ) THEN
      ALTER TABLE public.job_issues
        ADD CONSTRAINT job_issues_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
    END IF;
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'job_issues_job_id_fkey'
    ) THEN
      ALTER TABLE public.job_issues
        ADD CONSTRAINT job_issues_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_job_issues_job ON public.job_issues(job_id, status);
CREATE INDEX IF NOT EXISTS idx_job_issues_severity ON public.job_issues(severity);
CREATE INDEX IF NOT EXISTS idx_job_issues_status ON public.job_issues(status);
CREATE INDEX IF NOT EXISTS idx_job_issues_type ON public.job_issues(issue_type);

-- ============================================================
-- 5. MATERIAL_VERIFICATION TABLE
-- ============================================================
-- Crew confirms what materials were delivered
CREATE TABLE IF NOT EXISTS public.material_verification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  crew_member_id uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  material_name text NOT NULL,
  quantity_expected numeric(10, 2),
  quantity_received numeric(10, 2),
  unit text DEFAULT 'each', -- 'bundles', 'rolls', 'sq', 'each', etc.
  verified boolean DEFAULT false,
  missing boolean DEFAULT false,
  notes text,
  verified_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add foreign key to jobs table
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'material_verification_job_id_fkey'
    ) THEN
      ALTER TABLE public.material_verification
        ADD CONSTRAINT material_verification_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
    END IF;
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'material_verification_job_id_fkey'
    ) THEN
      ALTER TABLE public.material_verification
        ADD CONSTRAINT material_verification_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_material_verification_job ON public.material_verification(job_id, verified);
CREATE INDEX IF NOT EXISTS idx_material_verification_missing ON public.material_verification(missing) WHERE missing = true;

-- ============================================================
-- 6. ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE public.crew_time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_verification ENABLE ROW LEVEL SECURITY;

-- Crew time entries: Access via job's workspace/team
DROP POLICY IF EXISTS "crew_time_entries_workspace_member" ON public.crew_time_entries;
CREATE POLICY "crew_time_entries_workspace_member" ON public.crew_time_entries
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.crew_members cm
      JOIN public.workspace_members wm ON cm.workspace_id = wm.workspace_id
      WHERE cm.id = crew_time_entries.crew_member_id AND wm.user_id = auth.uid()
    )
    OR
    EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.workspace_members wm ON j.workspace_id = wm.workspace_id
      WHERE j.id = crew_time_entries.job_id AND wm.user_id = auth.uid()
    )
  );

-- Job checklists: Access via job's workspace/team
DROP POLICY IF EXISTS "job_checklists_workspace_member" ON public.job_checklists;
CREATE POLICY "job_checklists_workspace_member" ON public.job_checklists
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.workspace_members wm ON j.workspace_id = wm.workspace_id
      WHERE j.id = job_checklists.job_id AND wm.user_id = auth.uid()
    )
    OR
    EXISTS(
      SELECT 1 FROM public.roofing_jobs rj
      JOIN public.workspace_members wm ON rj.workspace_id = wm.workspace_id
      WHERE rj.id = job_checklists.job_id AND wm.user_id = auth.uid()
    )
  );

-- Safety logs: Access via job's workspace/team
DROP POLICY IF EXISTS "safety_logs_workspace_member" ON public.safety_logs;
CREATE POLICY "safety_logs_workspace_member" ON public.safety_logs
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.workspace_members wm ON j.workspace_id = wm.workspace_id
      WHERE j.id = safety_logs.job_id AND wm.user_id = auth.uid()
    )
    OR
    EXISTS(
      SELECT 1 FROM public.roofing_jobs rj
      JOIN public.workspace_members wm ON rj.workspace_id = wm.workspace_id
      WHERE rj.id = safety_logs.job_id AND wm.user_id = auth.uid()
    )
  );

-- Job issues: Access via job's workspace/team
DROP POLICY IF EXISTS "job_issues_workspace_member" ON public.job_issues;
CREATE POLICY "job_issues_workspace_member" ON public.job_issues
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.workspace_members wm ON j.workspace_id = wm.workspace_id
      WHERE j.id = job_issues.job_id AND wm.user_id = auth.uid()
    )
    OR
    EXISTS(
      SELECT 1 FROM public.roofing_jobs rj
      JOIN public.workspace_members wm ON rj.workspace_id = wm.workspace_id
      WHERE rj.id = job_issues.job_id AND wm.user_id = auth.uid()
    )
  );

-- Material verification: Access via job's workspace/team
DROP POLICY IF EXISTS "material_verification_workspace_member" ON public.material_verification;
CREATE POLICY "material_verification_workspace_member" ON public.material_verification
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.workspace_members wm ON j.workspace_id = wm.workspace_id
      WHERE j.id = material_verification.job_id AND wm.user_id = auth.uid()
    )
    OR
    EXISTS(
      SELECT 1 FROM public.roofing_jobs rj
      JOIN public.workspace_members wm ON rj.workspace_id = wm.workspace_id
      WHERE rj.id = material_verification.job_id AND wm.user_id = auth.uid()
    )
  );

-- ============================================================
-- 7. HELPER FUNCTIONS
-- ============================================================

-- Get today's jobs for a crew member
CREATE OR REPLACE FUNCTION get_crew_today_jobs_v2(p_crew_member_id uuid)
RETURNS TABLE (
  job_id uuid,
  job_number text,
  address text,
  job_type text,
  roof_type text,
  square_feet numeric,
  shingle_brand text,
  crew_lead_name text,
  start_time text,
  homeowner_name text,
  homeowner_phone text,
  notes text,
  pre_start_checklist_completed boolean
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    j.id as job_id,
    COALESCE(j.id::text, 'N/A') as job_number,
    COALESCE(j.address, 'No address') as address,
    j.job_type,
    j.roof_type,
    NULL::numeric as square_feet, -- Can be enhanced later
    NULL::text as shingle_brand, -- Can be enhanced later
    c.name as crew_lead_name,
    NULL::text as start_time, -- Can be enhanced later
    j.homeowner_name,
    j.homeowner_phone,
    j.notes,
    COALESCE(
      (SELECT completed FROM public.job_checklists 
       WHERE job_id = j.id AND checklist_type = 'pre-start' 
       ORDER BY created_at DESC LIMIT 1),
      false
    ) as pre_start_checklist_completed
  FROM public.jobs j
  LEFT JOIN public.crews c ON j.crew_id = c.id
  LEFT JOIN public.crew_members cm ON c.id = cm.crew_id
  WHERE cm.id = p_crew_member_id
    AND j.production_date = CURRENT_DATE
    AND j.stage IN ('scheduled', 'in_progress')
  UNION
  SELECT 
    rj.id as job_id,
    COALESCE(rj.id::text, 'N/A') as job_number,
    COALESCE(rj.address, 'No address') as address,
    rj.job_type,
    NULL::text as roof_type,
    NULL::numeric as square_feet,
    NULL::text as shingle_brand,
    rj.crew_name as crew_lead_name,
    NULL::text as start_time,
    NULL::text as homeowner_name,
    NULL::text as homeowner_phone,
    rj.notes,
    COALESCE(
      (SELECT completed FROM public.job_checklists 
       WHERE job_id = rj.id AND checklist_type = 'pre-start' 
       ORDER BY created_at DESC LIMIT 1),
      false
    ) as pre_start_checklist_completed
  FROM public.roofing_jobs rj
  LEFT JOIN public.crews c ON rj.crew_id = c.id
  LEFT JOIN public.crew_members cm ON c.id = cm.crew_id
  WHERE cm.id = p_crew_member_id
    AND rj.scheduled_start_date = CURRENT_DATE
    AND rj.status IN ('scheduled', 'in_progress')
  ORDER BY start_time NULLS LAST, address;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get active time entry for a crew member on a job
CREATE OR REPLACE FUNCTION get_active_time_entry(p_job_id uuid, p_crew_member_id uuid)
RETURNS TABLE (
  id uuid,
  clock_in timestamptz,
  clock_out timestamptz,
  total_hours numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cte.id,
    cte.clock_in,
    cte.clock_out,
    cte.total_hours
  FROM public.crew_time_entries cte
  WHERE cte.job_id = p_job_id
    AND cte.crew_member_id = p_crew_member_id
    AND cte.clock_out IS NULL
  ORDER BY cte.clock_in DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get production manager dashboard data
CREATE OR REPLACE FUNCTION get_production_crew_tracking(p_workspace_id uuid)
RETURNS TABLE (
  job_id uuid,
  job_number text,
  address text,
  crew_name text,
  crew_lead_name text,
  stage text,
  progress int,
  clocked_in_count int,
  checklist_completed boolean,
  materials_verified boolean,
  issues_count int,
  safety_logs_count int,
  last_activity timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    j.id as job_id,
    j.id::text as job_number,
    COALESCE(j.address, 'No address') as address,
    c.name as crew_name,
    NULL::text as crew_lead_name, -- Can be enhanced
    j.stage,
    j.progress,
    (SELECT COUNT(*) FROM public.crew_time_entries 
     WHERE job_id = j.id AND clock_out IS NULL)::int as clocked_in_count,
    COALESCE(
      (SELECT completed FROM public.job_checklists 
       WHERE job_id = j.id AND checklist_type = 'pre-start' 
       ORDER BY created_at DESC LIMIT 1),
      false
    ) as checklist_completed,
    COALESCE(
      (SELECT COUNT(*) = 0 FROM public.material_verification 
       WHERE job_id = j.id AND missing = true),
      true
    ) as materials_verified,
    (SELECT COUNT(*) FROM public.job_issues 
     WHERE job_id = j.id AND status = 'open')::int as issues_count,
    (SELECT COUNT(*) FROM public.safety_logs 
     WHERE job_id = j.id)::int as safety_logs_count,
    GREATEST(
      (SELECT MAX(created_at) FROM public.crew_time_entries WHERE job_id = j.id),
      (SELECT MAX(created_at) FROM public.job_checklists WHERE job_id = j.id),
      (SELECT MAX(created_at) FROM public.safety_logs WHERE job_id = j.id),
      (SELECT MAX(created_at) FROM public.job_issues WHERE job_id = j.id),
      j.updated_at
    ) as last_activity
  FROM public.jobs j
  LEFT JOIN public.crews c ON j.crew_id = c.id
  WHERE j.stage IN ('scheduled', 'in_progress')
    AND EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = p_workspace_id
        AND wm.user_id = auth.uid()
    )
  ORDER BY last_activity DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
