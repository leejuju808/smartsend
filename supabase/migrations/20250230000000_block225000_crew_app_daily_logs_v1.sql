-- Block 225000 — SmartSend Roofing "Crew Mobile App v1 — Daily Logs, Required Checklists, Time Tracking, Photos, Safety Compliance"
-- 
-- This is the FIELD SYSTEM that makes roofers feel stupid not using SmartSend.
-- 
-- SmartSend already dominates:
-- - Leads
-- - Estimates
-- - Contracts
-- - Payments
-- - Materials
-- - Production calendar
-- 
-- Now we take over the field operations.
-- 
-- This is the block that roofing owners have NEVER had solved properly.
-- Every roofing CRM in the world fails here.
-- SmartSend will NOT fail.

-- ============================================================
-- 1. CREW_APP_SESSIONS TABLE
-- ============================================================
-- Active sessions on devices
CREATE TABLE IF NOT EXISTS public.crew_app_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id uuid REFERENCES public.crews(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  last_active timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crew_app_sessions_crew ON public.crew_app_sessions(crew_id);
CREATE INDEX IF NOT EXISTS idx_crew_app_sessions_device ON public.crew_app_sessions(device_id);
CREATE INDEX IF NOT EXISTS idx_crew_app_sessions_active ON public.crew_app_sessions(last_active DESC);

-- ============================================================
-- 2. CREW_DAILY_LOGS TABLE
-- ============================================================
-- Every job gets a daily log
CREATE TABLE IF NOT EXISTS public.crew_daily_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed', 'paused')),
  start_time timestamptz,
  end_time timestamptz,
  notes text,
  weather_conditions text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(job_id, date)
);

-- Add foreign key to jobs table (works with both public.jobs and public.roofing_jobs)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'crew_daily_logs_job_id_fkey'
    ) THEN
      ALTER TABLE public.crew_daily_logs
        ADD CONSTRAINT crew_daily_logs_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
    END IF;
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'crew_daily_logs_job_id_fkey'
    ) THEN
      ALTER TABLE public.crew_daily_logs
        ADD CONSTRAINT crew_daily_logs_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_crew_daily_logs_job ON public.crew_daily_logs(job_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_crew_daily_logs_crew ON public.crew_daily_logs(crew_id);
CREATE INDEX IF NOT EXISTS idx_crew_daily_logs_status ON public.crew_daily_logs(status);
CREATE INDEX IF NOT EXISTS idx_crew_daily_logs_date ON public.crew_daily_logs(date DESC);

-- ============================================================
-- 3. CREW_TIME_ENTRIES TABLE (Enhanced)
-- ============================================================
-- Time tracking entries linked to daily logs
DO $$
BEGIN
  -- Add daily_log_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'crew_time_entries' 
    AND column_name = 'daily_log_id'
  ) THEN
    ALTER TABLE public.crew_time_entries 
      ADD COLUMN daily_log_id uuid REFERENCES public.crew_daily_logs(id) ON DELETE SET NULL;
  END IF;
  
  -- Add worker_name column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'crew_time_entries' 
    AND column_name = 'worker_name'
  ) THEN
    ALTER TABLE public.crew_time_entries 
      ADD COLUMN worker_name text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_crew_time_entries_daily_log ON public.crew_time_entries(daily_log_id) WHERE daily_log_id IS NOT NULL;

-- ============================================================
-- 4. CREW_CHECKLISTS TABLE
-- ============================================================
-- Checklists assigned automatically based on job type
CREATE TABLE IF NOT EXISTS public.crew_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  daily_log_id uuid REFERENCES public.crew_daily_logs(id) ON DELETE CASCADE,
  checklist_type text NOT NULL CHECK (checklist_type IN ('start_of_day', 'safety', 'midday', 'end_of_day', 'material_verification')),
  completed boolean DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add foreign key to jobs table
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'crew_checklists_job_id_fkey'
    ) THEN
      ALTER TABLE public.crew_checklists
        ADD CONSTRAINT crew_checklists_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
    END IF;
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'crew_checklists_job_id_fkey'
    ) THEN
      ALTER TABLE public.crew_checklists
        ADD CONSTRAINT crew_checklists_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_crew_checklists_job ON public.crew_checklists(job_id, checklist_type);
CREATE INDEX IF NOT EXISTS idx_crew_checklists_daily_log ON public.crew_checklists(daily_log_id);
CREATE INDEX IF NOT EXISTS idx_crew_checklists_type ON public.crew_checklists(checklist_type);
CREATE INDEX IF NOT EXISTS idx_crew_checklists_completed ON public.crew_checklists(completed);

-- ============================================================
-- 5. CREW_CHECKLIST_ITEMS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.crew_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES public.crew_checklists(id) ON DELETE CASCADE,
  label text NOT NULL,
  is_required boolean DEFAULT true,
  completed boolean DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crew_checklist_items_checklist ON public.crew_checklist_items(checklist_id);
CREATE INDEX IF NOT EXISTS idx_crew_checklist_items_completed ON public.crew_checklist_items(completed);

-- Function to auto-update checklist completion
CREATE OR REPLACE FUNCTION update_checklist_completion()
RETURNS TRIGGER AS $$
DECLARE
  all_required_done boolean;
BEGIN
  -- Check if all required items are completed
  SELECT bool_and(completed = true OR is_required = false)
  INTO all_required_done
  FROM public.crew_checklist_items
  WHERE checklist_id = COALESCE(NEW.checklist_id, OLD.checklist_id);
  
  -- Update checklist completion status
  UPDATE public.crew_checklists
  SET 
    completed = COALESCE(all_required_done, false),
    completed_at = CASE WHEN all_required_done THEN now() ELSE NULL END,
    updated_at = now()
  WHERE id = COALESCE(NEW.checklist_id, OLD.checklist_id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_checklist_completion
AFTER INSERT OR UPDATE ON public.crew_checklist_items
FOR EACH ROW
EXECUTE FUNCTION update_checklist_completion();

-- ============================================================
-- 6. CREW_PHOTOS TABLE (Enhanced)
-- ============================================================
-- Photo documentation linked to daily logs
DO $$
BEGIN
  -- Add daily_log_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'job_photos' 
    AND column_name = 'daily_log_id'
  ) THEN
    ALTER TABLE public.job_photos 
      ADD COLUMN daily_log_id uuid REFERENCES public.crew_daily_logs(id) ON DELETE SET NULL;
  END IF;
  
  -- Ensure category supports all needed values
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'job_photos' 
    AND column_name = 'category'
  ) THEN
    -- Update constraint if needed (PostgreSQL doesn't support ALTER CHECK, so we'll handle this in app logic)
    NULL;
  END IF;
END $$;

-- Create crew_photos table if job_photos doesn't exist or as an alternative
CREATE TABLE IF NOT EXISTS public.crew_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_log_id uuid REFERENCES public.crew_daily_logs(id) ON DELETE CASCADE,
  job_id uuid NOT NULL,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  photo_url text NOT NULL,
  storage_path text,
  category text NOT NULL CHECK (category IN ('before', 'during', 'after', 'issue', 'material_receipt', 'tear_off', 'underlayment', 'decking')),
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Add foreign key to jobs table
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'crew_photos_job_id_fkey'
    ) THEN
      ALTER TABLE public.crew_photos
        ADD CONSTRAINT crew_photos_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
    END IF;
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'crew_photos_job_id_fkey'
    ) THEN
      ALTER TABLE public.crew_photos
        ADD CONSTRAINT crew_photos_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_crew_photos_daily_log ON public.crew_photos(daily_log_id);
CREATE INDEX IF NOT EXISTS idx_crew_photos_job ON public.crew_photos(job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crew_photos_category ON public.crew_photos(category);
CREATE INDEX IF NOT EXISTS idx_crew_photos_crew ON public.crew_photos(crew_id);

-- ============================================================
-- 7. CREW_ISSUES TABLE
-- ============================================================
-- Critical for change orders + delays
CREATE TABLE IF NOT EXISTS public.crew_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  daily_log_id uuid REFERENCES public.crew_daily_logs(id) ON DELETE SET NULL,
  issue_type text NOT NULL CHECK (issue_type IN ('material_shortage', 'decking_rot', 'safety_issue', 'weather', 'extra_work', 'homeowner_request', 'structural_issue')),
  description text NOT NULL,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  photo_url text,
  requires_office_response boolean DEFAULT false,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved', 'closed')),
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
      WHERE constraint_name = 'crew_issues_job_id_fkey'
    ) THEN
      ALTER TABLE public.crew_issues
        ADD CONSTRAINT crew_issues_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
    END IF;
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'crew_issues_job_id_fkey'
    ) THEN
      ALTER TABLE public.crew_issues
        ADD CONSTRAINT crew_issues_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_crew_issues_job ON public.crew_issues(job_id, status);
CREATE INDEX IF NOT EXISTS idx_crew_issues_daily_log ON public.crew_issues(daily_log_id);
CREATE INDEX IF NOT EXISTS idx_crew_issues_severity ON public.crew_issues(severity);
CREATE INDEX IF NOT EXISTS idx_crew_issues_status ON public.crew_issues(status);
CREATE INDEX IF NOT EXISTS idx_crew_issues_type ON public.crew_issues(issue_type);
CREATE INDEX IF NOT EXISTS idx_crew_issues_requires_response ON public.crew_issues(requires_office_response) WHERE requires_office_response = true;

-- ============================================================
-- 8. ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE public.crew_app_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_daily_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_issues ENABLE ROW LEVEL SECURITY;

-- Crew app sessions: Access via crew's workspace
DROP POLICY IF EXISTS "crew_app_sessions_workspace_member" ON public.crew_app_sessions;
CREATE POLICY "crew_app_sessions_workspace_member" ON public.crew_app_sessions
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.crews c
      JOIN public.workspace_members wm ON c.workspace_id = wm.workspace_id
      WHERE c.id = crew_app_sessions.crew_id AND wm.user_id = auth.uid()
    )
  );

-- Crew daily logs: Access via job's workspace
DROP POLICY IF EXISTS "crew_daily_logs_workspace_member" ON public.crew_daily_logs;
CREATE POLICY "crew_daily_logs_workspace_member" ON public.crew_daily_logs
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.workspace_members wm ON j.workspace_id = wm.workspace_id
      WHERE j.id = crew_daily_logs.job_id AND wm.user_id = auth.uid()
    )
    OR
    EXISTS(
      SELECT 1 FROM public.roofing_jobs rj
      JOIN public.workspace_members wm ON rj.workspace_id = wm.workspace_id
      WHERE rj.id = crew_daily_logs.job_id AND wm.user_id = auth.uid()
    )
  );

-- Crew checklists: Access via job's workspace
DROP POLICY IF EXISTS "crew_checklists_workspace_member" ON public.crew_checklists;
CREATE POLICY "crew_checklists_workspace_member" ON public.crew_checklists
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.workspace_members wm ON j.workspace_id = wm.workspace_id
      WHERE j.id = crew_checklists.job_id AND wm.user_id = auth.uid()
    )
    OR
    EXISTS(
      SELECT 1 FROM public.roofing_jobs rj
      JOIN public.workspace_members wm ON rj.workspace_id = wm.workspace_id
      WHERE rj.id = crew_checklists.job_id AND wm.user_id = auth.uid()
    )
  );

-- Crew checklist items: Inherit from checklist
DROP POLICY IF EXISTS "crew_checklist_items_workspace_member" ON public.crew_checklist_items;
CREATE POLICY "crew_checklist_items_workspace_member" ON public.crew_checklist_items
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.crew_checklists cc
      JOIN public.jobs j ON cc.job_id = j.id
      JOIN public.workspace_members wm ON j.workspace_id = wm.workspace_id
      WHERE cc.id = crew_checklist_items.checklist_id AND wm.user_id = auth.uid()
    )
    OR
    EXISTS(
      SELECT 1 FROM public.crew_checklists cc
      JOIN public.roofing_jobs rj ON cc.job_id = rj.id
      JOIN public.workspace_members wm ON rj.workspace_id = wm.workspace_id
      WHERE cc.id = crew_checklist_items.checklist_id AND wm.user_id = auth.uid()
    )
  );

-- Crew photos: Access via job's workspace
DROP POLICY IF EXISTS "crew_photos_workspace_member" ON public.crew_photos;
CREATE POLICY "crew_photos_workspace_member" ON public.crew_photos
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.workspace_members wm ON j.workspace_id = wm.workspace_id
      WHERE j.id = crew_photos.job_id AND wm.user_id = auth.uid()
    )
    OR
    EXISTS(
      SELECT 1 FROM public.roofing_jobs rj
      JOIN public.workspace_members wm ON rj.workspace_id = wm.workspace_id
      WHERE rj.id = crew_photos.job_id AND wm.user_id = auth.uid()
    )
  );

-- Crew issues: Access via job's workspace
DROP POLICY IF EXISTS "crew_issues_workspace_member" ON public.crew_issues;
CREATE POLICY "crew_issues_workspace_member" ON public.crew_issues
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.workspace_members wm ON j.workspace_id = wm.workspace_id
      WHERE j.id = crew_issues.job_id AND wm.user_id = auth.uid()
    )
    OR
    EXISTS(
      SELECT 1 FROM public.roofing_jobs rj
      JOIN public.workspace_members wm ON rj.workspace_id = wm.workspace_id
      WHERE rj.id = crew_issues.job_id AND wm.user_id = auth.uid()
    )
  );

-- ============================================================
-- 9. HELPER FUNCTIONS
-- ============================================================

-- Get today's daily log for a job
CREATE OR REPLACE FUNCTION get_today_daily_log(p_job_id uuid)
RETURNS TABLE (
  id uuid,
  job_id uuid,
  crew_id uuid,
  date date,
  status text,
  start_time timestamptz,
  end_time timestamptz,
  notes text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cdl.id,
    cdl.job_id,
    cdl.crew_id,
    cdl.date,
    cdl.status,
    cdl.start_time,
    cdl.end_time,
    cdl.notes
  FROM public.crew_daily_logs cdl
  WHERE cdl.job_id = p_job_id
    AND cdl.date = CURRENT_DATE
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get checklist items for a checklist
CREATE OR REPLACE FUNCTION get_checklist_items(p_checklist_id uuid)
RETURNS TABLE (
  id uuid,
  label text,
  is_required boolean,
  completed boolean,
  completed_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cci.id,
    cci.label,
    cci.is_required,
    cci.completed,
    cci.completed_at
  FROM public.crew_checklist_items cci
  WHERE cci.checklist_id = p_checklist_id
  ORDER BY cci.is_required DESC, cci.created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto-create start-of-day checklist when daily log starts
CREATE OR REPLACE FUNCTION auto_create_start_checklist()
RETURNS TRIGGER AS $$
DECLARE
  v_checklist_id uuid;
BEGIN
  -- Only create checklist when status changes to 'in_progress'
  IF NEW.status = 'in_progress' AND (OLD.status IS NULL OR OLD.status != 'in_progress') THEN
    -- Create start-of-day checklist
    INSERT INTO public.crew_checklists (job_id, daily_log_id, checklist_type)
    VALUES (NEW.job_id, NEW.id, 'start_of_day')
    RETURNING id INTO v_checklist_id;
    
    -- Add default checklist items
    INSERT INTO public.crew_checklist_items (checklist_id, label, is_required)
    VALUES
      (v_checklist_id, 'Take BEFORE photos of all sides', true),
      (v_checklist_id, 'Confirm materials delivered', true),
      (v_checklist_id, 'Confirm safety harnesses & PPE', true),
      (v_checklist_id, 'Check weather conditions', true),
      (v_checklist_id, 'Verify job site access', true);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_create_start_checklist
AFTER INSERT OR UPDATE ON public.crew_daily_logs
FOR EACH ROW
EXECUTE FUNCTION auto_create_start_checklist();

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_crew_daily_logs_updated_at
BEFORE UPDATE ON public.crew_daily_logs
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_crew_checklists_updated_at
BEFORE UPDATE ON public.crew_checklists
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_crew_issues_updated_at
BEFORE UPDATE ON public.crew_issues
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

























