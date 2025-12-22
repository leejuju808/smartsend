-- ============================================================
-- Block 83000 — SmartSend Roofing "Homeowner Portal + Live Job Updates + Media Hub" v1
-- ============================================================
-- 
-- Every job gets a clean, branded homeowner portal with live status, photos, and documents
-- No login required — just a secure token-based link
--
-- Features:
-- - One-click portal creation per job
-- - Live status banner (Scheduled, On Site, In Progress, Completed)
-- - Job timeline (events feed)
-- - Photo gallery (Before, Damage, During, After)
-- - Document center (Estimate, Contract, Warranty, Change Orders)
-- - Simple feedback + review capture
-- ============================================================

-- ============================================================
-- PART 1 — CREATE homeowner_portals TABLE
-- ============================================================
-- Homeowner Portal Links per Job
-- One portal per job, accessed via secure token

CREATE TABLE IF NOT EXISTS public.homeowner_portals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  workspace_id uuid,
  job_id uuid NOT NULL,
  portal_token text UNIQUE NOT NULL,     -- random string for secure link (e.g., "abc123xyz")
  is_active boolean DEFAULT true,
  homeowner_email text,
  homeowner_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add foreign key constraints dynamically
DO $$
BEGIN
  -- Link to roofing_jobs if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'homeowner_portals_job_id_fkey'
    ) THEN
      ALTER TABLE public.homeowner_portals
        ADD CONSTRAINT homeowner_portals_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
  
  -- Link to jobs table if it exists (alternative schema)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'homeowner_portals_job_id_jobs_fkey'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'homeowner_portals_job_id_fkey'
      ) THEN
        ALTER TABLE public.homeowner_portals
          ADD CONSTRAINT homeowner_portals_job_id_jobs_fkey
          FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
      END IF;
    END IF;
  END IF;
  
  -- Link to workspaces if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workspaces') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'homeowner_portals_workspace_id_fkey'
    ) THEN
      ALTER TABLE public.homeowner_portals
        ADD CONSTRAINT homeowner_portals_workspace_id_fkey
        FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_homeowner_portals_job ON public.homeowner_portals(job_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_portals_token ON public.homeowner_portals(portal_token);
CREATE INDEX IF NOT EXISTS idx_homeowner_portals_workspace ON public.homeowner_portals(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_homeowner_portals_active ON public.homeowner_portals(job_id, is_active) WHERE is_active = true;

-- ============================================================
-- PART 2 — CREATE homeowner_portal_events TABLE
-- ============================================================
-- Events shown in the Job Timeline
-- Auto-populated from job status changes, crew assignments, photo uploads, etc.

CREATE TABLE IF NOT EXISTS public.homeowner_portal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_id uuid REFERENCES public.homeowner_portals(id) ON DELETE CASCADE,
  job_id uuid NOT NULL,
  event_type text NOT NULL,              -- "status_update", "crew_en_route", "on_site", "photo_added", "estimate_approved", "job_completed"
  title text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

-- Add foreign key constraints dynamically
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'homeowner_portal_events_job_id_fkey'
    ) THEN
      ALTER TABLE public.homeowner_portal_events
        ADD CONSTRAINT homeowner_portal_events_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'homeowner_portal_events_job_id_jobs_fkey'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'homeowner_portal_events_job_id_fkey'
      ) THEN
        ALTER TABLE public.homeowner_portal_events
          ADD CONSTRAINT homeowner_portal_events_job_id_jobs_fkey
          FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
      END IF;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_homeowner_portal_events_portal ON public.homeowner_portal_events(portal_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_portal_events_job ON public.homeowner_portal_events(job_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_portal_events_type ON public.homeowner_portal_events(event_type);
CREATE INDEX IF NOT EXISTS idx_homeowner_portal_events_created ON public.homeowner_portal_events(job_id, created_at DESC);

-- ============================================================
-- PART 3 — CREATE homeowner_portal_files TABLE
-- ============================================================
-- Files / Documents shared in portal (estimate, contract, warranty, etc.)

CREATE TABLE IF NOT EXISTS public.homeowner_portal_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_id uuid REFERENCES public.homeowner_portals(id) ON DELETE CASCADE,
  job_id uuid NOT NULL,
  file_url text NOT NULL,
  label text NOT NULL,                   -- "Estimate", "Contract", "Warranty", "Change Order", "Scope of Work"
  file_name text,
  file_size integer,                     -- bytes
  uploaded_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Add foreign key constraints dynamically
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'homeowner_portal_files_job_id_fkey'
    ) THEN
      ALTER TABLE public.homeowner_portal_files
        ADD CONSTRAINT homeowner_portal_files_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'homeowner_portal_files_job_id_jobs_fkey'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'homeowner_portal_files_job_id_fkey'
      ) THEN
        ALTER TABLE public.homeowner_portal_files
          ADD CONSTRAINT homeowner_portal_files_job_id_jobs_fkey
          FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
      END IF;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_homeowner_portal_files_portal ON public.homeowner_portal_files(portal_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_portal_files_job ON public.homeowner_portal_files(job_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_portal_files_label ON public.homeowner_portal_files(label);

-- ============================================================
-- PART 4 — CREATE homeowner_feedback TABLE
-- ============================================================
-- Simple feedback / review capture from portal

CREATE TABLE IF NOT EXISTS public.homeowner_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_id uuid REFERENCES public.homeowner_portals(id) ON DELETE CASCADE,
  job_id uuid NOT NULL,
  rating integer CHECK (rating >= 1 AND rating <= 5),               -- 1–5
  comment text,
  willing_to_review boolean DEFAULT false,    -- okay to send Google review link later
  created_at timestamptz DEFAULT now()
);

-- Add foreign key constraints dynamically
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'homeowner_feedback_job_id_fkey'
    ) THEN
      ALTER TABLE public.homeowner_feedback
        ADD CONSTRAINT homeowner_feedback_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'homeowner_feedback_job_id_jobs_fkey'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'homeowner_feedback_job_id_fkey'
      ) THEN
        ALTER TABLE public.homeowner_feedback
          ADD CONSTRAINT homeowner_feedback_job_id_jobs_fkey
          FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
      END IF;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_homeowner_feedback_portal ON public.homeowner_feedback(portal_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_feedback_job ON public.homeowner_feedback(job_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_feedback_rating ON public.homeowner_feedback(rating);
CREATE INDEX IF NOT EXISTS idx_homeowner_feedback_review_candidate ON public.homeowner_feedback(job_id, willing_to_review, rating) WHERE willing_to_review = true AND rating >= 4;

-- ============================================================
-- PART 5 — TRIGGERS
-- ============================================================

-- Update updated_at on homeowner_portals
CREATE OR REPLACE FUNCTION update_homeowner_portals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_homeowner_portals_updated_at ON public.homeowner_portals;
CREATE TRIGGER trg_homeowner_portals_updated_at
BEFORE UPDATE ON public.homeowner_portals
FOR EACH ROW
EXECUTE FUNCTION update_homeowner_portals_updated_at();

-- ============================================================
-- PART 6 — HELPER FUNCTIONS
-- ============================================================

-- Generate a secure portal token
CREATE OR REPLACE FUNCTION generate_portal_token()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_token text;
  v_exists boolean;
BEGIN
  LOOP
    -- Generate a random 12-character alphanumeric token
    v_token := lower(substring(md5(random()::text || clock_timestamp()::text) from 1 for 12));
    
    -- Check if token already exists
    SELECT EXISTS(SELECT 1 FROM public.homeowner_portals WHERE portal_token = v_token) INTO v_exists;
    
    -- Exit loop if token is unique
    EXIT WHEN NOT v_exists;
  END LOOP;
  
  RETURN v_token;
END;
$$;

-- Auto-create portal when job status changes to "scheduled" or "won"
CREATE OR REPLACE FUNCTION auto_create_homeowner_portal()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_portal_id uuid;
  v_token text;
  v_workspace_id uuid;
  v_homeowner_email text;
  v_homeowner_name text;
BEGIN
  -- Only create portal if status is "scheduled" or "in_progress" and portal doesn't exist
  IF NEW.status IN ('scheduled', 'in_progress') AND (OLD.status IS NULL OR OLD.status NOT IN ('scheduled', 'in_progress')) THEN
    -- Check if portal already exists
    SELECT id INTO v_portal_id
    FROM public.homeowner_portals
    WHERE job_id = NEW.id AND is_active = true
    LIMIT 1;
    
    -- Only create if portal doesn't exist
    IF v_portal_id IS NULL THEN
      -- Get workspace_id from job
      v_workspace_id := NEW.workspace_id;
      
      -- Try to get homeowner info from lead or job
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'roofing_jobs' AND column_name = 'homeowner_email') THEN
        SELECT homeowner_email, homeowner_name INTO v_homeowner_email, v_homeowner_name
        FROM public.roofing_jobs
        WHERE id = NEW.id;
      END IF;
      
      -- Generate token
      v_token := generate_portal_token();
      
      -- Create portal
      INSERT INTO public.homeowner_portals (
        workspace_id,
        job_id,
        portal_token,
        homeowner_email,
        homeowner_name,
        is_active
      ) VALUES (
        v_workspace_id,
        NEW.id,
        v_token,
        v_homeowner_email,
        v_homeowner_name,
        true
      )
      RETURNING id INTO v_portal_id;
      
      -- Create initial event
      INSERT INTO public.homeowner_portal_events (
        portal_id,
        job_id,
        event_type,
        title,
        description
      ) VALUES (
        v_portal_id,
        NEW.id,
        'status_update',
        'Job Portal Created',
        'Your project portal has been created. Track your roof project here.'
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on roofing_jobs if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    DROP TRIGGER IF EXISTS trg_auto_create_homeowner_portal ON public.roofing_jobs;
    CREATE TRIGGER trg_auto_create_homeowner_portal
    AFTER INSERT OR UPDATE OF status ON public.roofing_jobs
    FOR EACH ROW
    EXECUTE FUNCTION auto_create_homeowner_portal();
  END IF;
END $$;

-- Auto-create portal event when job status changes
CREATE OR REPLACE FUNCTION auto_create_portal_event_on_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_portal_id uuid;
  v_event_title text;
  v_event_description text;
BEGIN
  -- Only create event if status changed
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    -- Get portal for this job
    SELECT id INTO v_portal_id
    FROM public.homeowner_portals
    WHERE job_id = NEW.id AND is_active = true
    LIMIT 1;
    
    -- Only create event if portal exists
    IF v_portal_id IS NOT NULL THEN
      -- Map status to event title/description
      CASE NEW.status
        WHEN 'scheduled' THEN
          v_event_title := 'Job Scheduled';
          v_event_description := 'Your roof project has been scheduled.';
        WHEN 'in_progress' THEN
          v_event_title := 'Work Started';
          v_event_description := 'Our crew has started work on your roof project.';
        WHEN 'completed' THEN
          v_event_title := 'Job Completed';
          v_event_description := 'Your roof project has been completed!';
        ELSE
          v_event_title := 'Status Updated';
          v_event_description := 'Your project status has been updated.';
      END CASE;
      
      -- Create event
      INSERT INTO public.homeowner_portal_events (
        portal_id,
        job_id,
        event_type,
        title,
        description
      ) VALUES (
        v_portal_id,
        NEW.id,
        'status_update',
        v_event_title,
        v_event_description
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on roofing_jobs status changes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    DROP TRIGGER IF EXISTS trg_auto_create_portal_event_on_status_change ON public.roofing_jobs;
    CREATE TRIGGER trg_auto_create_portal_event_on_status_change
    AFTER UPDATE OF status ON public.roofing_jobs
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION auto_create_portal_event_on_status_change();
  END IF;
END $$;

-- Helper function to add portal event from application code
CREATE OR REPLACE FUNCTION add_portal_event(
  p_job_id uuid,
  p_event_type text,
  p_title text,
  p_description text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_portal_id uuid;
  v_event_id uuid;
BEGIN
  -- Get portal for this job
  SELECT id INTO v_portal_id
  FROM public.homeowner_portals
  WHERE job_id = p_job_id AND is_active = true
  LIMIT 1;
  
  -- Only create event if portal exists
  IF v_portal_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Create event
  INSERT INTO public.homeowner_portal_events (
    portal_id,
    job_id,
    event_type,
    title,
    description
  ) VALUES (
    v_portal_id,
    p_job_id,
    p_event_type,
    p_title,
    p_description
  )
  RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$$;

-- Helper function to add portal file from application code
CREATE OR REPLACE FUNCTION add_portal_file(
  p_job_id uuid,
  p_file_url text,
  p_label text,
  p_file_name text DEFAULT NULL,
  p_file_size integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_portal_id uuid;
  v_file_id uuid;
BEGIN
  -- Get portal for this job
  SELECT id INTO v_portal_id
  FROM public.homeowner_portals
  WHERE job_id = p_job_id AND is_active = true
  LIMIT 1;
  
  -- Only create file record if portal exists
  IF v_portal_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Create file record
  INSERT INTO public.homeowner_portal_files (
    portal_id,
    job_id,
    file_url,
    label,
    file_name,
    file_size
  ) VALUES (
    v_portal_id,
    p_job_id,
    p_file_url,
    p_label,
    p_file_name,
    p_file_size
  )
  RETURNING id INTO v_file_id;
  
  RETURN v_file_id;
END;
$$;

-- ============================================================
-- PART 7 — ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.homeowner_portals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homeowner_portal_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homeowner_portal_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homeowner_feedback ENABLE ROW LEVEL SECURITY;

-- Homeowner portals: Public read via token (for homeowner access), authenticated full access
DROP POLICY IF EXISTS "homeowner_portals_public_read" ON public.homeowner_portals;
CREATE POLICY "homeowner_portals_public_read"
  ON public.homeowner_portals FOR SELECT
  USING (true); -- Token validation happens at application level

DROP POLICY IF EXISTS "homeowner_portals_authenticated_all" ON public.homeowner_portals;
CREATE POLICY "homeowner_portals_authenticated_all"
  ON public.homeowner_portals FOR ALL
  USING (true) -- Service role will handle authorization
  WITH CHECK (true);

-- Homeowner portal events: Public read, authenticated insert
DROP POLICY IF EXISTS "homeowner_portal_events_public_read" ON public.homeowner_portal_events;
CREATE POLICY "homeowner_portal_events_public_read"
  ON public.homeowner_portal_events FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "homeowner_portal_events_authenticated_insert" ON public.homeowner_portal_events;
CREATE POLICY "homeowner_portal_events_authenticated_insert"
  ON public.homeowner_portal_events FOR INSERT
  WITH CHECK (true); -- Service role will handle authorization

-- Homeowner portal files: Public read, authenticated insert
DROP POLICY IF EXISTS "homeowner_portal_files_public_read" ON public.homeowner_portal_files;
CREATE POLICY "homeowner_portal_files_public_read"
  ON public.homeowner_portal_files FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "homeowner_portal_files_authenticated_insert" ON public.homeowner_portal_files;
CREATE POLICY "homeowner_portal_files_authenticated_insert"
  ON public.homeowner_portal_files FOR INSERT
  WITH CHECK (true); -- Service role will handle authorization

-- Homeowner feedback: Public insert/read (for homeowner portal)
DROP POLICY IF EXISTS "homeowner_feedback_public_all" ON public.homeowner_feedback;
CREATE POLICY "homeowner_feedback_public_all"
  ON public.homeowner_feedback FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- PART 8 — GRANT PERMISSIONS
-- ============================================================

GRANT SELECT, INSERT, UPDATE ON public.homeowner_portals TO authenticated;
GRANT SELECT, INSERT ON public.homeowner_portal_events TO authenticated;
GRANT SELECT, INSERT ON public.homeowner_portal_files TO authenticated;
GRANT SELECT, INSERT ON public.homeowner_feedback TO authenticated;

-- Public access for homeowner portal (via token)
GRANT SELECT ON public.homeowner_portals TO anon;
GRANT SELECT ON public.homeowner_portal_events TO anon;
GRANT SELECT ON public.homeowner_portal_files TO anon;
GRANT SELECT, INSERT ON public.homeowner_feedback TO anon;

-- ============================================================
-- PART 9 — COMMENTS
-- ============================================================

COMMENT ON TABLE public.homeowner_portals IS 'Block 83000: Homeowner Portal Links per Job - secure token-based access';
COMMENT ON TABLE public.homeowner_portal_events IS 'Block 83000: Events shown in the Job Timeline';
COMMENT ON TABLE public.homeowner_portal_files IS 'Block 83000: Files / Documents shared in portal (estimate, contract, warranty, etc.)';
COMMENT ON TABLE public.homeowner_feedback IS 'Block 83000: Simple feedback / review capture from portal';
COMMENT ON FUNCTION generate_portal_token() IS 'Block 83000: Generate a secure portal token';
COMMENT ON FUNCTION auto_create_homeowner_portal() IS 'Block 83000: Auto-create portal when job status changes to scheduled/in_progress';
COMMENT ON FUNCTION auto_create_portal_event_on_status_change() IS 'Block 83000: Auto-create portal event when job status changes';
COMMENT ON FUNCTION add_portal_event(uuid, text, text, text) IS 'Block 83000: Helper function to add portal event from application code';
COMMENT ON FUNCTION add_portal_file(uuid, text, text, text, integer) IS 'Block 83000: Helper function to add portal file from application code';

-- ============================================================
-- INTEGRATION NOTES
-- ============================================================
-- 
-- To integrate with existing systems, call these functions or use the API:
--
-- 1. Crew Assignment:
--    When crew is assigned to a job, call:
--    SELECT add_portal_event(job_id, 'crew_assigned', 'Crew Assigned', 'Crew 1 has been assigned to your project');
--
-- 2. Crew Status Updates:
--    When crew status changes (en_route, on_site, completed), call:
--    SELECT add_portal_event(job_id, 'crew_en_route', 'Crew En Route', 'Your crew is on the way');
--    SELECT add_portal_event(job_id, 'on_site', 'Crew On Site', 'Your crew has arrived and started work');
--
-- 3. Photo Uploads:
--    When photos are uploaded, call:
--    SELECT add_portal_event(job_id, 'photo_added', 'New Photos Added', 'New photos have been added to your gallery');
--
-- 4. Documents:
--    When estimate/contract/warranty is sent, call:
--    SELECT add_portal_file(job_id, file_url, 'Estimate', 'estimate.pdf', file_size);
--    SELECT add_portal_event(job_id, 'estimate_sent', 'Estimate Sent', 'Your estimate has been sent');
--
-- 5. Via API (recommended):
--    POST /api/homeowner-portal/integration
--    { job_id, event_type, title, description }
--
-- Database triggers automatically handle:
-- - Portal creation when job status changes to 'scheduled' or 'in_progress'
-- - Portal events when job status changes



























