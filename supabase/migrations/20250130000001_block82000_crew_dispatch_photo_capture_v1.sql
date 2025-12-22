-- Block 82000 — SmartSend Roofing "Crew Dispatch + On-Site Photo Capture System" v1
-- Crew assignment, arrival tracking, and all on-site photos in one place
-- Ties jobs, crews, and photos directly into the pipeline + safety + proposals

-- ============================================================
-- 1. CREWS TABLE (per team/company)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.crews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  name text NOT NULL,              -- "Crew 1", "Tear-Off Crew", "Repair Team A"
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crews_team ON public.crews(team_id, is_active);
CREATE INDEX IF NOT EXISTS idx_crews_active ON public.crews(team_id) WHERE is_active = true;

-- ============================================================
-- 2. CREW MEMBERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.crew_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  name text NOT NULL,
  phone text,
  role text,              -- "Foreman", "Installer", "Laborer"
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crew_members_team ON public.crew_members(team_id, is_active);
CREATE INDEX IF NOT EXISTS idx_crew_members_crew ON public.crew_members(crew_id) WHERE crew_id IS NOT NULL;

-- ============================================================
-- 3. CREW ASSIGNMENTS TO JOBS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.crew_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  crew_id uuid NOT NULL REFERENCES public.crews(id) ON DELETE CASCADE,
  scheduled_date date NOT NULL,
  arrival_time_planned time,
  arrival_time_actual time,
  status text NOT NULL DEFAULT 'Scheduled' CHECK (status IN (
    'Scheduled',
    'En Route',
    'On Site',
    'Completed',
    'No Show',
    'Delayed'
  )),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crew_assignments_team ON public.crew_assignments(team_id);
CREATE INDEX IF NOT EXISTS idx_crew_assignments_job ON public.crew_assignments(job_id);
CREATE INDEX IF NOT EXISTS idx_crew_assignments_crew ON public.crew_assignments(crew_id);
CREATE INDEX IF NOT EXISTS idx_crew_assignments_date ON public.crew_assignments(scheduled_date, status);
CREATE INDEX IF NOT EXISTS idx_crew_assignments_status ON public.crew_assignments(status, scheduled_date);

-- ============================================================
-- 4. ON-SITE PHOTOS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.site_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  photo_url text NOT NULL,
  category text NOT NULL CHECK (category IN (
    'before',
    'damage',
    'during',
    'after',
    'materials',
    'safety'
  )),
  caption text,
  taken_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_site_photos_team ON public.site_photos(team_id);
CREATE INDEX IF NOT EXISTS idx_site_photos_job ON public.site_photos(job_id);
CREATE INDEX IF NOT EXISTS idx_site_photos_category ON public.site_photos(job_id, category);
CREATE INDEX IF NOT EXISTS idx_site_photos_created ON public.site_photos(job_id, created_at DESC);

-- ============================================================
-- 5. JOB CHECKLISTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.job_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  name text NOT NULL,              -- "Pre-Job Checklist", "End-of-Day Checklist"
  checklist_type text DEFAULT 'pre_job' CHECK (checklist_type IN ('pre_job', 'post_job', 'custom')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_checklists_job ON public.job_checklists(job_id);
CREATE INDEX IF NOT EXISTS idx_job_checklists_team ON public.job_checklists(team_id);

-- ============================================================
-- 6. JOB CHECKLIST ITEMS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.job_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES public.job_checklists(id) ON DELETE CASCADE,
  label text NOT NULL,
  is_completed boolean DEFAULT false,
  completed_at timestamptz,
  completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_checklist_items_checklist ON public.job_checklist_items(checklist_id);
CREATE INDEX IF NOT EXISTS idx_job_checklist_items_completed ON public.job_checklist_items(is_completed);

-- ============================================================
-- 7. UPDATED_AT TRIGGERS
-- ============================================================
CREATE OR REPLACE FUNCTION update_crews_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_crews_updated_at
BEFORE UPDATE ON public.crews
FOR EACH ROW
EXECUTE FUNCTION update_crews_updated_at();

CREATE OR REPLACE FUNCTION update_crew_members_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_crew_members_updated_at
BEFORE UPDATE ON public.crew_members
FOR EACH ROW
EXECUTE FUNCTION update_crew_members_updated_at();

CREATE OR REPLACE FUNCTION update_crew_assignments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_crew_assignments_updated_at
BEFORE UPDATE ON public.crew_assignments
FOR EACH ROW
EXECUTE FUNCTION update_crew_assignments_updated_at();

CREATE OR REPLACE FUNCTION update_job_checklists_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_job_checklists_updated_at
BEFORE UPDATE ON public.job_checklists
FOR EACH ROW
EXECUTE FUNCTION update_job_checklists_updated_at();

-- ============================================================
-- 8. AUTO-SET TEAM_ID FROM JOB
-- ============================================================
-- When creating crew_assignments, automatically set team_id from job
CREATE OR REPLACE FUNCTION auto_set_crew_assignment_team_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.team_id IS NULL THEN
    SELECT team_id INTO NEW.team_id
    FROM public.jobs
    WHERE id = NEW.job_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_set_crew_assignment_team_id
BEFORE INSERT ON public.crew_assignments
FOR EACH ROW
EXECUTE FUNCTION auto_set_crew_assignment_team_id();

-- Auto-set team_id for site_photos from job
CREATE OR REPLACE FUNCTION auto_set_site_photo_team_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.team_id IS NULL THEN
    SELECT team_id INTO NEW.team_id
    FROM public.jobs
    WHERE id = NEW.job_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_set_site_photo_team_id
BEFORE INSERT ON public.site_photos
FOR EACH ROW
EXECUTE FUNCTION auto_set_site_photo_team_id();

-- Auto-set team_id for job_checklists from job
CREATE OR REPLACE FUNCTION auto_set_job_checklist_team_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.team_id IS NULL THEN
    SELECT team_id INTO NEW.team_id
    FROM public.jobs
    WHERE id = NEW.job_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_set_job_checklist_team_id
BEFORE INSERT ON public.job_checklists
FOR EACH ROW
EXECUTE FUNCTION auto_set_job_checklist_team_id();

-- ============================================================
-- 9. ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE public.crews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_checklist_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Team members can access their team's data
-- Crews
CREATE POLICY "team_members_can_view_crews" ON public.crews
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_id = crews.team_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "team_members_can_manage_crews" ON public.crews
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_id = crews.team_id AND user_id = auth.uid()
    )
  );

-- Crew Members
CREATE POLICY "team_members_can_view_crew_members" ON public.crew_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_id = crew_members.team_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "team_members_can_manage_crew_members" ON public.crew_members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_id = crew_members.team_id AND user_id = auth.uid()
    )
  );

-- Crew Assignments
CREATE POLICY "team_members_can_view_crew_assignments" ON public.crew_assignments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_id = crew_assignments.team_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "team_members_can_manage_crew_assignments" ON public.crew_assignments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_id = crew_assignments.team_id AND user_id = auth.uid()
    )
  );

-- Site Photos
CREATE POLICY "team_members_can_view_site_photos" ON public.site_photos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_id = site_photos.team_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "team_members_can_manage_site_photos" ON public.site_photos
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_id = site_photos.team_id AND user_id = auth.uid()
    )
  );

-- Job Checklists
CREATE POLICY "team_members_can_view_job_checklists" ON public.job_checklists
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_id = job_checklists.team_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "team_members_can_manage_job_checklists" ON public.job_checklists
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_id = job_checklists.team_id AND user_id = auth.uid()
    )
  );

-- Job Checklist Items
CREATE POLICY "team_members_can_view_checklist_items" ON public.job_checklist_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.job_checklists jc
      JOIN public.team_members tm ON tm.team_id = jc.team_id
      WHERE jc.id = job_checklist_items.checklist_id AND tm.user_id = auth.uid()
    )
  );

CREATE POLICY "team_members_can_manage_checklist_items" ON public.job_checklist_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.job_checklists jc
      JOIN public.team_members tm ON tm.team_id = jc.team_id
      WHERE jc.id = job_checklist_items.checklist_id AND tm.user_id = auth.uid()
    )
  );

-- ============================================================
-- 10. HELPER FUNCTIONS
-- ============================================================

-- Get today's dispatch assignments
CREATE OR REPLACE FUNCTION get_todays_dispatch(p_team_id uuid, p_date date DEFAULT CURRENT_DATE)
RETURNS TABLE (
  assignment_id uuid,
  job_id uuid,
  job_title text,
  lead_name text,
  address text,
  crew_id uuid,
  crew_name text,
  scheduled_date date,
  arrival_time_planned time,
  arrival_time_actual time,
  status text,
  contract_value numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ca.id as assignment_id,
    j.id as job_id,
    COALESCE(j.notes, 'Job #' || j.id::text) as job_title,
    COALESCE(l.first_name || ' ' || l.last_name, 'Unknown') as lead_name,
    COALESCE(l.address, '') as address,
    c.id as crew_id,
    c.name as crew_name,
    ca.scheduled_date,
    ca.arrival_time_planned,
    ca.arrival_time_actual,
    ca.status,
    j.contract_value
  FROM public.crew_assignments ca
  JOIN public.jobs j ON j.id = ca.job_id
  LEFT JOIN public.leads l ON l.id = j.lead_id
  JOIN public.crews c ON c.id = ca.crew_id
  WHERE ca.team_id = p_team_id
    AND ca.scheduled_date = p_date
  ORDER BY ca.arrival_time_planned NULLS LAST, c.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get job photo timeline
CREATE OR REPLACE FUNCTION get_job_photo_timeline(p_job_id uuid)
RETURNS TABLE (
  photo_id uuid,
  photo_url text,
  category text,
  caption text,
  taken_at timestamptz,
  created_at timestamptz,
  uploaded_by_name text
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sp.id as photo_id,
    sp.photo_url,
    sp.category,
    sp.caption,
    sp.taken_at,
    sp.created_at,
    COALESCE(p.full_name, p.email, 'Unknown') as uploaded_by_name
  FROM public.site_photos sp
  LEFT JOIN public.profiles p ON p.id = sp.uploaded_by
  WHERE sp.job_id = p_job_id
  ORDER BY 
    CASE sp.category
      WHEN 'before' THEN 1
      WHEN 'damage' THEN 2
      WHEN 'during' THEN 3
      WHEN 'after' THEN 4
      WHEN 'materials' THEN 5
      WHEN 'safety' THEN 6
      ELSE 7
    END,
    sp.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;



























