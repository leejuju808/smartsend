-- Block 31440 — SmartSend Roofing "Job Pipeline + Production Tracking Engine" v1
-- Track every job from estimate → signed → production → completion
-- Auto-update customers • Keep roofers organized • Prevent job delays

-- ============================================================
-- 1. JOBS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  stage text NOT NULL DEFAULT 'estimate' CHECK (stage IN (
    'estimate',
    'approved',
    'insurance',
    'materials',
    'scheduled',
    'in_progress',
    'completed'
  )),
  contract_value numeric,
  insurance boolean DEFAULT false,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for jobs
CREATE INDEX IF NOT EXISTS idx_jobs_lead ON public.jobs(lead_id);
CREATE INDEX IF NOT EXISTS idx_jobs_team ON public.jobs(team_id);
CREATE INDEX IF NOT EXISTS idx_jobs_stage ON public.jobs(stage);
CREATE INDEX IF NOT EXISTS idx_jobs_created ON public.jobs(created_at DESC);

-- ============================================================
-- 2. JOB STAGE EVENTS TABLE (Audit trail)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.job_stage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  stage text NOT NULL,
  changed_at timestamptz DEFAULT now(),
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_job_stage_events_job ON public.job_stage_events(job_id);
CREATE INDEX IF NOT EXISTS idx_job_stage_events_changed ON public.job_stage_events(changed_at DESC);

-- ============================================================
-- 3. JOB MATERIALS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.job_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  supplier text,
  material_type text,
  ordered_at date,
  eta date,
  delivered boolean DEFAULT false,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_materials_job ON public.job_materials(job_id);
CREATE INDEX IF NOT EXISTS idx_job_materials_delivered ON public.job_materials(delivered);

-- ============================================================
-- 4. JOB SCHEDULE TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.job_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  crew_name text,
  start_date date,
  duration_days int,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_schedule_job ON public.job_schedule(job_id);
CREATE INDEX IF NOT EXISTS idx_job_schedule_start ON public.job_schedule(start_date);

-- ============================================================
-- 5. JOB PHOTOS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.job_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  label text CHECK (label IN ('before', 'during', 'after')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_photos_job ON public.job_photos(job_id);
CREATE INDEX IF NOT EXISTS idx_job_photos_label ON public.job_photos(label);

-- ============================================================
-- 6. JOB TASKS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.job_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  description text NOT NULL,
  due_at timestamptz,
  completed boolean DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_tasks_job ON public.job_tasks(job_id);
CREATE INDEX IF NOT EXISTS idx_job_tasks_completed ON public.job_tasks(completed);
CREATE INDEX IF NOT EXISTS idx_job_tasks_due ON public.job_tasks(due_at);

-- ============================================================
-- 7. TRIGGERS
-- ============================================================

-- Update updated_at on jobs
CREATE OR REPLACE FUNCTION update_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_jobs_updated_at ON public.jobs;
CREATE TRIGGER trg_jobs_updated_at
BEFORE UPDATE ON public.jobs
FOR EACH ROW
EXECUTE FUNCTION update_jobs_updated_at();

-- Update updated_at on job_materials
CREATE OR REPLACE FUNCTION update_job_materials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_job_materials_updated_at ON public.job_materials;
CREATE TRIGGER trg_job_materials_updated_at
BEFORE UPDATE ON public.job_materials
FOR EACH ROW
EXECUTE FUNCTION update_job_materials_updated_at();

-- Update updated_at on job_schedule
CREATE OR REPLACE FUNCTION update_job_schedule_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_job_schedule_updated_at ON public.job_schedule;
CREATE TRIGGER trg_job_schedule_updated_at
BEFORE UPDATE ON public.job_schedule
FOR EACH ROW
EXECUTE FUNCTION update_job_schedule_updated_at();

-- ============================================================
-- 8. JOB STAGE CHANGE TRIGGER (Logs events + Notifies)
-- ============================================================
CREATE OR REPLACE FUNCTION job_stage_changed()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log if stage actually changed
  IF OLD.stage IS DISTINCT FROM NEW.stage THEN
    -- Insert stage event
    INSERT INTO public.job_stage_events (job_id, stage, changed_by)
    VALUES (NEW.id, NEW.stage, auth.uid());
    
    -- Notify via pg_notify (edge function will listen)
    PERFORM pg_notify('job_stage_changed', json_build_object(
      'job_id', NEW.id,
      'stage', NEW.stage,
      'lead_id', NEW.lead_id
    )::text);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS job_stage_trigger ON public.jobs;
CREATE TRIGGER job_stage_trigger
AFTER UPDATE ON public.jobs
FOR EACH ROW
WHEN (OLD.stage IS DISTINCT FROM NEW.stage)
EXECUTE FUNCTION job_stage_changed();

-- ============================================================
-- 9. AUTO-CREATE TASKS FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION auto_create_job_tasks()
RETURNS TRIGGER AS $$
BEGIN
  -- When job moves to 'materials' stage, create "Order materials" task if not exists
  IF NEW.stage = 'materials' THEN
    INSERT INTO public.job_tasks (job_id, description, due_at)
    SELECT NEW.id, 'Order materials', now() + interval '1 day'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.job_tasks 
      WHERE job_id = NEW.id 
      AND description = 'Order materials' 
      AND completed = false
    );
  END IF;
  
  -- When job moves to 'scheduled' stage, create "Confirm delivery" task
  IF NEW.stage = 'scheduled' THEN
    INSERT INTO public.job_tasks (job_id, description, due_at)
    SELECT NEW.id, 'Confirm material delivery', now() + interval '2 days'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.job_tasks 
      WHERE job_id = NEW.id 
      AND description = 'Confirm material delivery' 
      AND completed = false
    );
    
    INSERT INTO public.job_tasks (job_id, description, due_at)
    SELECT NEW.id, 'Call homeowner about schedule', now() + interval '1 day'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.job_tasks 
      WHERE job_id = NEW.id 
      AND description = 'Call homeowner about schedule' 
      AND completed = false
    );
  END IF;
  
  -- When job moves to 'completed' stage, create "Collect final payment" task
  IF NEW.stage = 'completed' THEN
    INSERT INTO public.job_tasks (job_id, description, due_at)
    SELECT NEW.id, 'Collect final payment', now() + interval '3 days'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.job_tasks 
      WHERE job_id = NEW.id 
      AND description = 'Collect final payment' 
      AND completed = false
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_create_job_tasks_trigger ON public.jobs;
CREATE TRIGGER auto_create_job_tasks_trigger
AFTER UPDATE ON public.jobs
FOR EACH ROW
WHEN (OLD.stage IS DISTINCT FROM NEW.stage)
EXECUTE FUNCTION auto_create_job_tasks();

-- ============================================================
-- 10. ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_stage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_tasks ENABLE ROW LEVEL SECURITY;

-- Jobs: Team members can access jobs in their teams
DROP POLICY IF EXISTS "jobs_team_member" ON public.jobs;
CREATE POLICY "jobs_team_member" ON public.jobs
  FOR ALL USING (
    team_id IS NOT NULL AND EXISTS(
      SELECT 1 FROM public.team_members 
      WHERE team_id = jobs.team_id AND user_id = auth.uid()
    )
  )
  WITH CHECK (
    team_id IS NOT NULL AND EXISTS(
      SELECT 1 FROM public.team_members 
      WHERE team_id = jobs.team_id AND user_id = auth.uid()
    )
  );

-- Job stage events: Same team access
DROP POLICY IF EXISTS "job_stage_events_team_member" ON public.job_stage_events;
CREATE POLICY "job_stage_events_team_member" ON public.job_stage_events
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = job_stage_events.job_id AND tm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = job_stage_events.job_id AND tm.user_id = auth.uid()
    )
  );

-- Job materials: Same team access
DROP POLICY IF EXISTS "job_materials_team_member" ON public.job_materials;
CREATE POLICY "job_materials_team_member" ON public.job_materials
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = job_materials.job_id AND tm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = job_materials.job_id AND tm.user_id = auth.uid()
    )
  );

-- Job schedule: Same team access
DROP POLICY IF EXISTS "job_schedule_team_member" ON public.job_schedule;
CREATE POLICY "job_schedule_team_member" ON public.job_schedule
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = job_schedule.job_id AND tm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = job_schedule.job_id AND tm.user_id = auth.uid()
    )
  );

-- Job photos: Same team access
DROP POLICY IF EXISTS "job_photos_team_member" ON public.job_photos;
CREATE POLICY "job_photos_team_member" ON public.job_photos
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = job_photos.job_id AND tm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = job_photos.job_id AND tm.user_id = auth.uid()
    )
  );

-- Job tasks: Same team access
DROP POLICY IF EXISTS "job_tasks_team_member" ON public.job_tasks;
CREATE POLICY "job_tasks_team_member" ON public.job_tasks
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = job_tasks.job_id AND tm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = job_tasks.job_id AND tm.user_id = auth.uid()
    )
  );

-- ============================================================
-- 11. HELPER FUNCTIONS
-- ============================================================

-- Get jobs by stage for a team
CREATE OR REPLACE FUNCTION get_jobs_by_stage(p_team_id uuid, p_stage text)
RETURNS TABLE (
  id uuid,
  lead_id uuid,
  stage text,
  contract_value numeric,
  insurance boolean,
  notes text,
  created_at timestamptz,
  lead_name text,
  lead_email text,
  lead_phone text,
  materials_status text,
  crew_name text,
  start_date date
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    j.id,
    j.lead_id,
    j.stage,
    j.contract_value,
    j.insurance,
    j.notes,
    j.created_at,
    CONCAT(l.first_name, ' ', l.last_name) as lead_name,
    l.email as lead_email,
    l.phone as lead_phone,
    CASE 
      WHEN EXISTS(SELECT 1 FROM public.job_materials jm WHERE jm.job_id = j.id AND jm.delivered = false) 
      THEN 'pending'
      WHEN EXISTS(SELECT 1 FROM public.job_materials jm WHERE jm.job_id = j.id AND jm.delivered = true) 
      THEN 'delivered'
      ELSE 'none'
    END as materials_status,
    js.crew_name,
    js.start_date
  FROM public.jobs j
  LEFT JOIN public.leads l ON j.lead_id = l.id
  LEFT JOIN public.job_schedule js ON js.job_id = j.id
  WHERE j.team_id = p_team_id
    AND j.stage = p_stage
  ORDER BY j.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get production dashboard metrics
CREATE OR REPLACE FUNCTION get_production_dashboard(p_team_id uuid)
RETURNS jsonb AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'jobs_this_week', (
      SELECT COUNT(*) FROM public.jobs j
      WHERE j.team_id = p_team_id
      AND j.created_at >= date_trunc('week', now())
    ),
    'jobs_behind_schedule', (
      SELECT COUNT(*) FROM public.jobs j
      JOIN public.job_schedule js ON js.job_id = j.id
      WHERE j.team_id = p_team_id
      AND js.start_date < CURRENT_DATE
      AND j.stage NOT IN ('completed')
    ),
    'jobs_awaiting_materials', (
      SELECT COUNT(*) FROM public.jobs j
      JOIN public.job_materials jm ON jm.job_id = j.id
      WHERE j.team_id = p_team_id
      AND jm.delivered = false
      AND j.stage IN ('materials', 'scheduled', 'in_progress')
    ),
    'jobs_ready_for_payment', (
      SELECT COUNT(*) FROM public.jobs j
      WHERE j.team_id = p_team_id
      AND j.stage = 'completed'
      AND EXISTS(
        SELECT 1 FROM public.job_tasks jt
        WHERE jt.job_id = j.id
        AND jt.description = 'Collect final payment'
        AND jt.completed = false
      )
    ),
    'completion_rate', (
      SELECT 
        CASE 
          WHEN COUNT(*) = 0 THEN 0
          ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE stage = 'completed') / COUNT(*), 2)
        END
      FROM public.jobs
      WHERE team_id = p_team_id
    )
  ) INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 12. STORAGE BUCKET FOR JOB PHOTOS
-- ============================================================

-- Create storage bucket for job photos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'job-photos',
  'job-photos',
  false, -- private bucket
  10485760, -- 10 MB limit per file
  ARRAY[
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/gif',
    'image/webp',
    'image/heic',
    'image/heif'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for job-photos bucket
-- Policy: Team members can upload photos for jobs in their team
CREATE POLICY IF NOT EXISTS "job_photos_team_member_upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'job-photos'
    AND EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id::text = (storage.foldername(name))[1]
        AND tm.user_id = auth.uid()
    )
  );

-- Policy: Team members can read photos for jobs in their team
CREATE POLICY IF NOT EXISTS "job_photos_team_member_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'job-photos'
    AND EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id::text = (storage.foldername(name))[1]
        AND tm.user_id = auth.uid()
    )
  );

-- Policy: Team members can delete photos for jobs in their team
CREATE POLICY IF NOT EXISTS "job_photos_team_member_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'job-photos'
    AND EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id::text = (storage.foldername(name))[1]
        AND tm.user_id = auth.uid()
    )
  );

-- Service role can do everything
CREATE POLICY IF NOT EXISTS "job_photos_service_role_full_access"
  ON storage.objects
  TO service_role
  FOR ALL
  USING (bucket_id = 'job-photos')
  WITH CHECK (bucket_id = 'job-photos');

