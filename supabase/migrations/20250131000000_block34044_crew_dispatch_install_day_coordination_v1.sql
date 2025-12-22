-- =========================================================
-- Block 34044 — SmartSend Roofing "AI Crew Dispatch + Install Day Coordination Engine" v1
-- Assign crews automatically • Send install-day instructions • Track arrival times • Handle delays • Send homeowner updates during installation
-- =========================================================

-- ============================================================================
-- PART 1 — ENHANCE crews TABLE WITH CREW PROFILES
-- ============================================================================
-- Add fields needed for smart crew assignment and install day coordination

ALTER TABLE public.crews
  ADD COLUMN IF NOT EXISTS leader_phone text,
  ADD COLUMN IF NOT EXISTS skills text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS max_jobs_per_day int DEFAULT 1,
  ADD COLUMN IF NOT EXISTS typical_install_speed numeric(10,2), -- squares per day
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Update existing crews: set leader_phone from foreman_phone if not set
UPDATE public.crews
SET leader_phone = foreman_phone
WHERE leader_phone IS NULL AND foreman_phone IS NOT NULL;

-- Indexes for crew queries
CREATE INDEX IF NOT EXISTS idx_crews_active ON public.crews(workspace_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_crews_skills ON public.crews USING GIN(skills);

-- ============================================================================
-- PART 2 — CREATE job_crews TABLE (Many-to-Many: Jobs ↔ Crews)
-- ============================================================================
-- Links jobs to assigned crews with assignment metadata

CREATE TABLE IF NOT EXISTS public.job_crews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  crew_id uuid NOT NULL REFERENCES public.crews(id) ON DELETE CASCADE,
  assigned_at timestamptz DEFAULT now(),
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_primary boolean DEFAULT true, -- primary crew vs backup
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_crews_job ON public.job_crews(job_id);
CREATE INDEX IF NOT EXISTS idx_job_crews_crew ON public.job_crews(crew_id);
CREATE INDEX IF NOT EXISTS idx_job_crews_primary ON public.job_crews(job_id, is_primary) WHERE is_primary = true;

-- Unique constraint: one primary crew per job
CREATE UNIQUE INDEX IF NOT EXISTS uq_job_crews_primary ON public.job_crews(job_id) WHERE is_primary = true;

-- ============================================================================
-- PART 3 — CREATE crew_checkins TABLE
-- ============================================================================
-- Tracks crew check-ins throughout install day

CREATE TABLE IF NOT EXISTS public.crew_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  crew_id uuid NOT NULL REFERENCES public.crews(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN (
    'on_the_way',
    'arrived',
    'in_progress',
    'lunch',
    'completed'
  )),
  checked_in_at timestamptz DEFAULT now(),
  notes text,
  location_lat numeric(10, 8), -- optional GPS
  location_lng numeric(11, 8),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crew_checkins_job ON public.crew_checkins(job_id);
CREATE INDEX IF NOT EXISTS idx_crew_checkins_crew ON public.crew_checkins(crew_id);
CREATE INDEX IF NOT EXISTS idx_crew_checkins_status ON public.crew_checkins(status);
CREATE INDEX IF NOT EXISTS idx_crew_checkins_job_date ON public.crew_checkins(job_id, checked_in_at DESC);

-- ============================================================================
-- PART 4 — CREATE job_progress_photos TABLE
-- ============================================================================
-- Stores progress photos uploaded by crews during installation

CREATE TABLE IF NOT EXISTS public.job_progress_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  photo_url text NOT NULL,
  category text NOT NULL CHECK (category IN (
    'before',
    'during',
    'after',
    'issue',
    'material',
    'access'
  )),
  description text,
  uploaded_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_progress_photos_job ON public.job_progress_photos(job_id);
CREATE INDEX IF NOT EXISTS idx_job_progress_photos_crew ON public.job_progress_photos(crew_id);
CREATE INDEX IF NOT EXISTS idx_job_progress_photos_category ON public.job_progress_photos(category);
CREATE INDEX IF NOT EXISTS idx_job_progress_photos_job_date ON public.job_progress_photos(job_id, uploaded_at DESC);

-- ============================================================================
-- PART 5 — CREATE install_day_timeline TABLE
-- ============================================================================
-- Tracks install day milestones and progress stages

CREATE TABLE IF NOT EXISTS public.install_day_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  milestone text NOT NULL CHECK (milestone IN (
    'crew_arrival',
    'tear_off_start',
    'tear_off_complete',
    'underlayment_start',
    'underlayment_complete',
    'shingling_start',
    'shingling_complete',
    'cleanup_start',
    'cleanup_complete',
    'job_complete'
  )),
  milestone_at timestamptz DEFAULT now(),
  notes text,
  progress_percent int CHECK (progress_percent >= 0 AND progress_percent <= 100),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_install_day_timeline_job ON public.install_day_timeline(job_id);
CREATE INDEX IF NOT EXISTS idx_install_day_timeline_crew ON public.install_day_timeline(crew_id);
CREATE INDEX IF NOT EXISTS idx_install_day_timeline_milestone ON public.install_day_timeline(milestone);
CREATE INDEX IF NOT EXISTS idx_install_day_timeline_job_date ON public.install_day_timeline(job_id, milestone_at DESC);

-- ============================================================================
-- PART 6 — CREATE material_verification TABLE
-- ============================================================================
-- Tracks material delivery verification and access issues

CREATE TABLE IF NOT EXISTS public.material_verification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  material_arrived boolean DEFAULT false,
  material_arrived_at timestamptz,
  bundle_count int,
  access_issues text[], -- e.g., ['driveway_too_narrow', 'dog_loose', 'no_backyard_access']
  verification_photo_url text,
  notes text,
  verified_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_material_verification_job ON public.material_verification(job_id);
CREATE INDEX IF NOT EXISTS idx_material_verification_crew ON public.material_verification(crew_id);

-- ============================================================================
-- PART 7 — CREATE homeowner_updates TABLE
-- ============================================================================
-- Tracks automated homeowner update messages sent during install day

CREATE TABLE IF NOT EXISTS public.homeowner_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  update_type text NOT NULL CHECK (update_type IN (
    'install_scheduled',
    'crew_arrived',
    'tear_off_started',
    'underlayment_installing',
    'shingling_underway',
    'cleanup_in_progress',
    'installation_complete',
    'delay_notification'
  )),
  message_sent text NOT NULL,
  sent_via text CHECK (sent_via IN ('sms', 'email', 'both')) DEFAULT 'sms',
  sent_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_homeowner_updates_job ON public.homeowner_updates(job_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_updates_type ON public.homeowner_updates(update_type);
CREATE INDEX IF NOT EXISTS idx_homeowner_updates_sent_at ON public.homeowner_updates(sent_at DESC);

-- ============================================================================
-- PART 8 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.job_crews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_progress_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.install_day_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_verification ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homeowner_updates ENABLE ROW LEVEL SECURITY;

-- Job crews: Team members can access crews for jobs in their teams
DROP POLICY IF EXISTS "job_crews_team_member" ON public.job_crews;
CREATE POLICY "job_crews_team_member" ON public.job_crews
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = job_crews.job_id AND tm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = job_crews.job_id AND tm.user_id = auth.uid()
    )
  );

-- Crew checkins: Same team access
DROP POLICY IF EXISTS "crew_checkins_team_member" ON public.crew_checkins;
CREATE POLICY "crew_checkins_team_member" ON public.crew_checkins
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = crew_checkins.job_id AND tm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = crew_checkins.job_id AND tm.user_id = auth.uid()
    )
  );

-- Job progress photos: Same team access
DROP POLICY IF EXISTS "job_progress_photos_team_member" ON public.job_progress_photos;
CREATE POLICY "job_progress_photos_team_member" ON public.job_progress_photos
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = job_progress_photos.job_id AND tm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = job_progress_photos.job_id AND tm.user_id = auth.uid()
    )
  );

-- Install day timeline: Same team access
DROP POLICY IF EXISTS "install_day_timeline_team_member" ON public.install_day_timeline;
CREATE POLICY "install_day_timeline_team_member" ON public.install_day_timeline
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = install_day_timeline.job_id AND tm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = install_day_timeline.job_id AND tm.user_id = auth.uid()
    )
  );

-- Material verification: Same team access
DROP POLICY IF EXISTS "material_verification_team_member" ON public.material_verification;
CREATE POLICY "material_verification_team_member" ON public.material_verification
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = material_verification.job_id AND tm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = material_verification.job_id AND tm.user_id = auth.uid()
    )
  );

-- Homeowner updates: Same team access
DROP POLICY IF EXISTS "homeowner_updates_team_member" ON public.homeowner_updates;
CREATE POLICY "homeowner_updates_team_member" ON public.homeowner_updates
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = homeowner_updates.job_id AND tm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = homeowner_updates.job_id AND tm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 9 — TRIGGERS
-- ============================================================================

-- Trigger: Auto-create timeline entry when crew checks in as "arrived"
CREATE OR REPLACE FUNCTION trg_crew_arrival_timeline()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'arrived' THEN
    -- Check if this is the first "arrived" check-in for this job today
    IF NOT EXISTS (
      SELECT 1 FROM public.install_day_timeline
      WHERE job_id = NEW.job_id
      AND milestone = 'crew_arrival'
      AND DATE(milestone_at) = CURRENT_DATE
    ) THEN
      INSERT INTO public.install_day_timeline (job_id, crew_id, milestone, progress_percent)
      VALUES (NEW.job_id, NEW.crew_id, 'crew_arrival', 5);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crew_arrival_timeline ON public.crew_checkins;
CREATE TRIGGER trg_crew_arrival_timeline
AFTER INSERT ON public.crew_checkins
FOR EACH ROW
WHEN (NEW.status = 'arrived')
EXECUTE FUNCTION trg_crew_arrival_timeline();

-- Trigger: Auto-update job progress when timeline milestones are reached
CREATE OR REPLACE FUNCTION trg_update_job_progress()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Update job_schedule or job metadata with progress
  -- This can be extended to update a progress_percent field on jobs table if it exists
  RETURN NEW;
END;
$$;

-- ============================================================================
-- PART 10 — HELPER FUNCTIONS
-- ============================================================================

-- Function: Get available crews for a job based on skills and availability
CREATE OR REPLACE FUNCTION get_available_crews(
  p_workspace_id uuid,
  p_job_date date,
  p_required_skills text[] DEFAULT '{}'::text[]
)
RETURNS TABLE (
  crew_id uuid,
  crew_name text,
  leader_phone text,
  skills text[],
  current_jobs_today int,
  max_jobs_per_day int,
  is_available boolean,
  skill_match_score int
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id as crew_id,
    c.name as crew_name,
    COALESCE(c.leader_phone, c.foreman_phone) as leader_phone,
    c.skills,
    COALESCE(COUNT(jc.id), 0)::int as current_jobs_today,
    c.max_jobs_per_day,
    (COALESCE(COUNT(jc.id), 0) < c.max_jobs_per_day) as is_available,
    -- Calculate skill match score (0-100)
    CASE 
      WHEN array_length(p_required_skills, 1) IS NULL THEN 100
      WHEN array_length(c.skills, 1) IS NULL THEN 0
      ELSE (
        SELECT COUNT(*) * 100 / GREATEST(array_length(p_required_skills, 1), 1)
        FROM unnest(p_required_skills) skill
        WHERE skill = ANY(c.skills)
      )
    END as skill_match_score
  FROM public.crews c
  LEFT JOIN public.job_crews jc ON jc.crew_id = c.id
  LEFT JOIN public.jobs j ON j.id = jc.job_id
  LEFT JOIN public.job_schedule js ON js.job_id = j.id
  WHERE c.workspace_id = p_workspace_id
    AND c.is_active = true
    AND (js.start_date = p_job_date OR js.start_date IS NULL)
  GROUP BY c.id, c.name, c.leader_phone, c.foreman_phone, c.skills, c.max_jobs_per_day
  HAVING COALESCE(COUNT(jc.id), 0) < c.max_jobs_per_day
  ORDER BY skill_match_score DESC, current_jobs_today ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Get install day status for a job
CREATE OR REPLACE FUNCTION get_install_day_status(p_job_id uuid)
RETURNS jsonb AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'job_id', p_job_id,
    'assigned_crew', (
      SELECT jsonb_build_object(
        'crew_id', c.id,
        'crew_name', c.name,
        'leader_phone', COALESCE(c.leader_phone, c.foreman_phone)
      )
      FROM public.job_crews jc
      JOIN public.crews c ON c.id = jc.crew_id
      WHERE jc.job_id = p_job_id AND jc.is_primary = true
      LIMIT 1
    ),
    'latest_checkin', (
      SELECT jsonb_build_object(
        'status', cc.status,
        'checked_in_at', cc.checked_in_at,
        'notes', cc.notes
      )
      FROM public.crew_checkins cc
      WHERE cc.job_id = p_job_id
      ORDER BY cc.checked_in_at DESC
      LIMIT 1
    ),
    'timeline', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'milestone', idt.milestone,
          'milestone_at', idt.milestone_at,
          'progress_percent', idt.progress_percent
        ) ORDER BY idt.milestone_at
      )
      FROM public.install_day_timeline idt
      WHERE idt.job_id = p_job_id
    ),
    'photos_count', (
      SELECT COUNT(*) FROM public.job_progress_photos
      WHERE job_id = p_job_id
    ),
    'material_verified', (
      SELECT material_arrived FROM public.material_verification
      WHERE job_id = p_job_id
      ORDER BY verified_at DESC
      LIMIT 1
    ),
    'homeowner_updates_sent', (
      SELECT COUNT(*) FROM public.homeowner_updates
      WHERE job_id = p_job_id
    )
  ) INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 11 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.job_crews IS 'Links jobs to assigned crews. One primary crew per job.';
COMMENT ON TABLE public.crew_checkins IS 'Tracks crew check-ins throughout install day (on_the_way, arrived, in_progress, lunch, completed)';
COMMENT ON TABLE public.job_progress_photos IS 'Progress photos uploaded by crews during installation (before, during, after, issue, material, access)';
COMMENT ON TABLE public.install_day_timeline IS 'Tracks install day milestones and progress stages for documentation and homeowner updates';
COMMENT ON TABLE public.material_verification IS 'Tracks material delivery verification and access issues reported by crews';
COMMENT ON TABLE public.homeowner_updates IS 'Tracks automated homeowner update messages sent during install day';

































