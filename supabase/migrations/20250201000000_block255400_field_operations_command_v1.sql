-- =========================================================
-- Block 255400 — SmartSend Roofing "Field Operations Command v1"
-- Live Crew GPS, Jobsite Timeline, Punchlist Automation, PM Live Control Dashboard, Workflow Enforcement
-- =========================================================
-- 
-- This block turns SmartSend into a command center for all field operations — the REAL heartbeat of roofing production.
-- 
-- Features:
-- - Live Crew GPS Tracking (Foreman Phone)
-- - Jobsite Live Timeline
-- - Real-Time Status Updates
-- - AI-Generated Punchlists
-- - PM Control Center Dashboard
-- - Workflow Enforcement (Cannot Skip Steps)
-- - Crew Communication System
-- - Daily Production Reports (Auto-Generated)

-- ============================================================================
-- PART 1 — CREATE crew_gps_logs TABLE
-- ============================================================================
-- Tracks GPS location of crews in real-time (updates every 60 seconds)

CREATE TABLE IF NOT EXISTS public.crew_gps_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id uuid REFERENCES public.crews(id) ON DELETE CASCADE,
  crew_member_id uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  lat numeric(10, 8) NOT NULL,
  lng numeric(11, 8) NOT NULL,
  accuracy numeric(10, 2), -- GPS accuracy in meters
  heading numeric(5, 2), -- Direction of travel in degrees (0-360)
  speed numeric(5, 2), -- Speed in km/h
  timestamp timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crew_gps_logs_crew ON public.crew_gps_logs(crew_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_crew_gps_logs_member ON public.crew_gps_logs(crew_member_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_crew_gps_logs_timestamp ON public.crew_gps_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_crew_gps_logs_recent ON public.crew_gps_logs(crew_id, timestamp DESC) WHERE timestamp > now() - interval '24 hours';

-- ============================================================================
-- PART 2 — CREATE jobsite_status_updates TABLE
-- ============================================================================
-- Tracks real-time status updates from jobsite (arriving, setup, tearoff, etc.)

CREATE TABLE IF NOT EXISTS public.jobsite_status_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL, -- References jobs or roofing_jobs (flexible)
  status text NOT NULL CHECK (status IN (
    'arriving',
    'arrived',
    'setup',
    'tearoff',
    'install_underlayment',
    'shingles',
    'ridge',
    'cleanup',
    'completed',
    'paused',
    'issue'
  )),
  timestamp timestamptz DEFAULT now(),
  created_by uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  notes text,
  photos jsonb DEFAULT '[]'::jsonb, -- Array of photo URLs
  gps_lat numeric(10, 8),
  gps_lng numeric(11, 8),
  created_at timestamptz DEFAULT now()
);

-- Add foreign key to roofing_jobs if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'jobsite_status_updates_job_id_fkey'
    ) THEN
      ALTER TABLE public.jobsite_status_updates
        ADD CONSTRAINT jobsite_status_updates_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
  
  -- Also try to reference jobs table if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    -- We'll handle this with a flexible approach - job_id can reference either table
    -- Application layer will handle the reference
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_jobsite_status_updates_job ON public.jobsite_status_updates(job_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_jobsite_status_updates_status ON public.jobsite_status_updates(status);
CREATE INDEX IF NOT EXISTS idx_jobsite_status_updates_created_by ON public.jobsite_status_updates(created_by);
CREATE INDEX IF NOT EXISTS idx_jobsite_status_updates_recent ON public.jobsite_status_updates(job_id, timestamp DESC) WHERE timestamp > now() - interval '7 days';

-- ============================================================================
-- PART 3 — CREATE punchlists TABLE (Enhanced)
-- ============================================================================
-- AI-generated and manual punchlist items with status tracking

CREATE TABLE IF NOT EXISTS public.punchlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  item text NOT NULL,
  description text,
  status text DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'waived')),
  priority text DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  category text, -- 'quality', 'safety', 'material', 'cleanup', 'documentation'
  ai_generated boolean DEFAULT false, -- True if generated by AI
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  completed_by uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  completion_photos jsonb DEFAULT '[]'::jsonb, -- Photos proving completion
  waived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  waived_at timestamptz,
  waived_reason text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL -- PM or AI
);

-- Add foreign key to roofing_jobs if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'punchlists_job_id_fkey'
    ) THEN
      ALTER TABLE public.punchlists
        ADD CONSTRAINT punchlists_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_punchlists_job ON public.punchlists(job_id, status);
CREATE INDEX IF NOT EXISTS idx_punchlists_status ON public.punchlists(status);
CREATE INDEX IF NOT EXISTS idx_punchlists_priority ON public.punchlists(priority);
CREATE INDEX IF NOT EXISTS idx_punchlists_ai_generated ON public.punchlists(ai_generated);

-- ============================================================================
-- PART 4 — CREATE foreman_reports TABLE
-- ============================================================================
-- Daily production reports from foremen (auto-generated and manual)

CREATE TABLE IF NOT EXISTS public.foreman_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  foreman_id uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  report_date date NOT NULL DEFAULT CURRENT_DATE,
  report jsonb NOT NULL DEFAULT '{}'::jsonb, -- {
    --   "materials_used": [...],
    --   "hours_worked": {...},
    --   "issues": [...],
    --   "photos": [...],
    --   "delay_notes": "...",
    --   "cleanup_confirmation": true,
    --   "start_time": "...",
    --   "stop_time": "...",
    --   "labor_hours": {...}
    -- }
  pdf_url text, -- URL to generated PDF report
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add foreign key to roofing_jobs if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'foreman_reports_job_id_fkey'
    ) THEN
      ALTER TABLE public.foreman_reports
        ADD CONSTRAINT foreman_reports_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_foreman_reports_job ON public.foreman_reports(job_id, report_date DESC);
CREATE INDEX IF NOT EXISTS idx_foreman_reports_crew ON public.foreman_reports(crew_id, report_date DESC);
CREATE INDEX IF NOT EXISTS idx_foreman_reports_date ON public.foreman_reports(report_date DESC);

-- ============================================================================
-- PART 5 — CREATE workflow_enforcement_rules TABLE
-- ============================================================================
-- Defines required steps and photo requirements for each workflow stage

CREATE TABLE IF NOT EXISTS public.workflow_enforcement_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text, -- 'roof_replacement', 'repair', 'inspection', etc. (null = applies to all)
  stage text NOT NULL, -- 'shingles', 'ridge', 'cleanup', etc.
  required_photos text[] DEFAULT '{}'::text[], -- ['underlayment', 'drip_edge', 'decking']
  required_statuses text[] DEFAULT '{}'::text[], -- Previous statuses that must be completed
  cannot_proceed_message text, -- Message shown when trying to skip
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_enforcement_rules_job_type ON public.workflow_enforcement_rules(job_type);
CREATE INDEX IF NOT EXISTS idx_workflow_enforcement_rules_stage ON public.workflow_enforcement_rules(stage);

-- Insert default workflow rules
INSERT INTO public.workflow_enforcement_rules (job_type, stage, required_photos, required_statuses, cannot_proceed_message)
VALUES
  ('roof_replacement', 'shingles', ARRAY['underlayment', 'drip_edge', 'decking'], ARRAY['install_underlayment'], 'Must complete underlayment installation and upload required photos before starting shingles'),
  ('roof_replacement', 'ridge', ARRAY['shingles_complete'], ARRAY['shingles'], 'Must complete shingle installation before installing ridge caps'),
  ('roof_replacement', 'completed', ARRAY['ridge', 'cleanup', 'magnet_sweep'], ARRAY['ridge', 'cleanup'], 'Must complete ridge installation and cleanup with magnet sweep proof before marking job complete')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- PART 6 — CREATE crew_communications TABLE
-- ============================================================================
-- Built-in messaging system for foremen and PMs

CREATE TABLE IF NOT EXISTS public.crew_communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  from_crew_member_id uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  to_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- PM or office staff
  message_type text NOT NULL CHECK (message_type IN ('status', 'voice_note', 'photo', 'issue_flagged', 'urgent')),
  message text,
  voice_note_url text,
  photo_urls jsonb DEFAULT '[]'::jsonb,
  is_urgent boolean DEFAULT false,
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Add foreign key to roofing_jobs if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'crew_communications_job_id_fkey'
    ) THEN
      ALTER TABLE public.crew_communications
        ADD CONSTRAINT crew_communications_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_crew_communications_job ON public.crew_communications(job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crew_communications_from ON public.crew_communications(from_crew_member_id);
CREATE INDEX IF NOT EXISTS idx_crew_communications_to ON public.crew_communications(to_user_id);
CREATE INDEX IF NOT EXISTS idx_crew_communications_urgent ON public.crew_communications(is_urgent, created_at DESC) WHERE is_urgent = true;
CREATE INDEX IF NOT EXISTS idx_crew_communications_unread ON public.crew_communications(to_user_id, read_at) WHERE read_at IS NULL;

-- ============================================================================
-- PART 7 — CREATE job_workflow_checkpoints TABLE
-- ============================================================================
-- Tracks which workflow checkpoints have been completed for each job

CREATE TABLE IF NOT EXISTS public.job_workflow_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  stage text NOT NULL,
  checkpoint_type text NOT NULL CHECK (checkpoint_type IN ('status', 'photo', 'both')),
  checkpoint_name text NOT NULL, -- e.g., 'underlayment_photo', 'drip_edge_photo'
  is_completed boolean DEFAULT false,
  completed_at timestamptz,
  completed_by uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  photo_urls jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Add foreign key to roofing_jobs if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'job_workflow_checkpoints_job_id_fkey'
    ) THEN
      ALTER TABLE public.job_workflow_checkpoints
        ADD CONSTRAINT job_workflow_checkpoints_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_job_workflow_checkpoints_job ON public.job_workflow_checkpoints(job_id, stage);
CREATE INDEX IF NOT EXISTS idx_job_workflow_checkpoints_completed ON public.job_workflow_checkpoints(job_id, is_completed);

-- ============================================================================
-- PART 8 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.crew_gps_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobsite_status_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.punchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foreman_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_enforcement_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_workflow_checkpoints ENABLE ROW LEVEL SECURITY;

-- Crew GPS logs: Access via crew's workspace
DROP POLICY IF EXISTS "crew_gps_logs_workspace_member" ON public.crew_gps_logs;
CREATE POLICY "crew_gps_logs_workspace_member" ON public.crew_gps_logs
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.crews c
      JOIN public.workspace_members wm ON c.workspace_id = wm.workspace_id
      WHERE c.id = crew_gps_logs.crew_id AND wm.user_id = auth.uid()
    )
  );

-- Jobsite status updates: Access via job's workspace
DROP POLICY IF EXISTS "jobsite_status_updates_workspace_member" ON public.jobsite_status_updates;
CREATE POLICY "jobsite_status_updates_workspace_member" ON public.jobsite_status_updates
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.roofing_jobs rj
      JOIN public.workspace_members wm ON rj.workspace_id = wm.workspace_id
      WHERE rj.id = jobsite_status_updates.job_id AND wm.user_id = auth.uid()
    )
    OR EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = jobsite_status_updates.job_id AND tm.user_id = auth.uid()
    )
  );

-- Punchlists: Access via job's workspace
DROP POLICY IF EXISTS "punchlists_workspace_member" ON public.punchlists;
CREATE POLICY "punchlists_workspace_member" ON public.punchlists
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.roofing_jobs rj
      JOIN public.workspace_members wm ON rj.workspace_id = wm.workspace_id
      WHERE rj.id = punchlists.job_id AND wm.user_id = auth.uid()
    )
    OR EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = punchlists.job_id AND tm.user_id = auth.uid()
    )
  );

-- Foreman reports: Access via job's workspace
DROP POLICY IF EXISTS "foreman_reports_workspace_member" ON public.foreman_reports;
CREATE POLICY "foreman_reports_workspace_member" ON public.foreman_reports
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.roofing_jobs rj
      JOIN public.workspace_members wm ON rj.workspace_id = wm.workspace_id
      WHERE rj.id = foreman_reports.job_id AND wm.user_id = auth.uid()
    )
    OR EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = foreman_reports.job_id AND tm.user_id = auth.uid()
    )
  );

-- Workflow enforcement rules: Read access for workspace members
DROP POLICY IF EXISTS "workflow_enforcement_rules_read" ON public.workflow_enforcement_rules;
CREATE POLICY "workflow_enforcement_rules_read" ON public.workflow_enforcement_rules
  FOR SELECT USING (true); -- Read-only for all authenticated users

-- Crew communications: Access via job's workspace
DROP POLICY IF EXISTS "crew_communications_workspace_member" ON public.crew_communications;
CREATE POLICY "crew_communications_workspace_member" ON public.crew_communications
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.roofing_jobs rj
      JOIN public.workspace_members wm ON rj.workspace_id = wm.workspace_id
      WHERE rj.id = crew_communications.job_id AND wm.user_id = auth.uid()
    )
    OR EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = crew_communications.job_id AND tm.user_id = auth.uid()
    )
    OR crew_communications.to_user_id = auth.uid()
    OR crew_communications.from_crew_member_id IN (
      SELECT id FROM public.crew_members WHERE user_id = auth.uid()
    )
  );

-- Job workflow checkpoints: Access via job's workspace
DROP POLICY IF EXISTS "job_workflow_checkpoints_workspace_member" ON public.job_workflow_checkpoints;
CREATE POLICY "job_workflow_checkpoints_workspace_member" ON public.job_workflow_checkpoints
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.roofing_jobs rj
      JOIN public.workspace_members wm ON rj.workspace_id = wm.workspace_id
      WHERE rj.id = job_workflow_checkpoints.job_id AND wm.user_id = auth.uid()
    )
    OR EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = job_workflow_checkpoints.job_id AND tm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 9 — HELPER FUNCTIONS
-- ============================================================================

-- Function: Get latest GPS location for all active crews
CREATE OR REPLACE FUNCTION get_active_crews_gps()
RETURNS TABLE (
  crew_id uuid,
  crew_name text,
  lat numeric,
  lng numeric,
  accuracy numeric,
  heading numeric,
  speed numeric,
  timestamp timestamptz,
  status text -- 'en_route', 'on_site', 'finished'
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id as crew_id,
    c.name as crew_name,
    gps.lat,
    gps.lng,
    gps.accuracy,
    gps.heading,
    gps.speed,
    gps.timestamp,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM public.jobsite_status_updates jsu
        JOIN public.job_crews jc ON jc.job_id = jsu.job_id
        WHERE jc.crew_id = c.id
        AND jsu.status = 'completed'
        AND jsu.timestamp > now() - interval '2 hours'
      ) THEN 'finished'
      WHEN EXISTS (
        SELECT 1 FROM public.jobsite_status_updates jsu
        JOIN public.job_crews jc ON jc.job_id = jsu.job_id
        WHERE jc.crew_id = c.id
        AND jsu.status IN ('arrived', 'setup', 'tearoff', 'install_underlayment', 'shingles', 'ridge', 'cleanup')
        AND jsu.timestamp > now() - interval '2 hours'
      ) THEN 'on_site'
      ELSE 'en_route'
    END as status
  FROM public.crews c
  INNER JOIN LATERAL (
    SELECT lat, lng, accuracy, heading, speed, timestamp
    FROM public.crew_gps_logs
    WHERE crew_id = c.id
    ORDER BY timestamp DESC
    LIMIT 1
  ) gps ON true
  WHERE c.is_active = true
  AND gps.timestamp > now() - interval '4 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Get jobsite timeline for a job
CREATE OR REPLACE FUNCTION get_jobsite_timeline(p_job_id uuid)
RETURNS TABLE (
  id uuid,
  status text,
  timestamp timestamptz,
  created_by_name text,
  notes text,
  photos jsonb
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    jsu.id,
    jsu.status,
    jsu.timestamp,
    COALESCE(cm.name, 'Unknown') as created_by_name,
    jsu.notes,
    jsu.photos
  FROM public.jobsite_status_updates jsu
  LEFT JOIN public.crew_members cm ON jsu.created_by = cm.id
  WHERE jsu.job_id = p_job_id
  ORDER BY jsu.timestamp ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Check if workflow checkpoint can proceed
CREATE OR REPLACE FUNCTION can_proceed_to_stage(
  p_job_id uuid,
  p_target_stage text,
  p_job_type text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_rule public.workflow_enforcement_rules%ROWTYPE;
  v_missing_photos text[];
  v_missing_statuses text[];
  v_result jsonb;
BEGIN
  -- Get workflow rule for this stage
  SELECT * INTO v_rule
  FROM public.workflow_enforcement_rules
  WHERE stage = p_target_stage
  AND (job_type = p_job_type OR job_type IS NULL)
  ORDER BY job_type NULLS LAST
  LIMIT 1;

  -- If no rule exists, allow proceeding
  IF v_rule.id IS NULL THEN
    RETURN jsonb_build_object(
      'can_proceed', true,
      'message', null
    );
  END IF;

  -- Check required photos
  IF array_length(v_rule.required_photos, 1) > 0 THEN
    SELECT array_agg(photo_type) INTO v_missing_photos
    FROM unnest(v_rule.required_photos) photo_type
    WHERE NOT EXISTS (
      SELECT 1 FROM public.job_workflow_checkpoints jwc
      WHERE jwc.job_id = p_job_id
      AND jwc.checkpoint_name = photo_type
      AND jwc.is_completed = true
    );
  END IF;

  -- Check required statuses
  IF array_length(v_rule.required_statuses, 1) > 0 THEN
    SELECT array_agg(status) INTO v_missing_statuses
    FROM unnest(v_rule.required_statuses) status
    WHERE NOT EXISTS (
      SELECT 1 FROM public.jobsite_status_updates jsu
      WHERE jsu.job_id = p_job_id
      AND jsu.status = status
    );
  END IF;

  -- Build result
  IF array_length(v_missing_photos, 1) > 0 OR array_length(v_missing_statuses, 1) > 0 THEN
    v_result := jsonb_build_object(
      'can_proceed', false,
      'message', v_rule.cannot_proceed_message,
      'missing_photos', COALESCE(v_missing_photos, ARRAY[]::text[]),
      'missing_statuses', COALESCE(v_missing_statuses, ARRAY[]::text[])
    );
  ELSE
    v_result := jsonb_build_object(
      'can_proceed', true,
      'message', null
    );
  END IF;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Get PM dashboard data for all active jobs today
CREATE OR REPLACE FUNCTION get_pm_dashboard_data(p_workspace_id uuid, p_date date DEFAULT CURRENT_DATE)
RETURNS TABLE (
  job_id uuid,
  job_title text,
  address text,
  crew_id uuid,
  crew_name text,
  crew_gps_lat numeric,
  crew_gps_lng numeric,
  crew_status text,
  progress_percent int,
  current_status text,
  predicted_finish_time timestamptz,
  punchlist_open_count int,
  punchlist_critical_count int,
  material_shortages text[],
  risk_flags text[],
  next_crew_availability timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    rj.id as job_id,
    COALESCE(rj.title, 'Untitled Job') as job_title,
    COALESCE(rj.address, 'No address') as address,
    c.id as crew_id,
    c.name as crew_name,
    gps.lat as crew_gps_lat,
    gps.lng as crew_gps_lng,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM public.jobsite_status_updates jsu
        WHERE jsu.job_id = rj.id
        AND jsu.status = 'completed'
        AND jsu.timestamp::date = p_date
      ) THEN 'finished'
      WHEN EXISTS (
        SELECT 1 FROM public.jobsite_status_updates jsu
        WHERE jsu.job_id = rj.id
        AND jsu.status IN ('arrived', 'setup', 'tearoff', 'install_underlayment', 'shingles', 'ridge', 'cleanup')
        AND jsu.timestamp::date = p_date
      ) THEN 'on_site'
      ELSE 'en_route'
    END as crew_status,
    COALESCE(
      (SELECT MAX(progress_percent) FROM public.install_day_timeline WHERE job_id = rj.id),
      0
    ) as progress_percent,
    (SELECT status FROM public.jobsite_status_updates WHERE job_id = rj.id ORDER BY timestamp DESC LIMIT 1) as current_status,
    NULL::timestamptz as predicted_finish_time, -- Can be calculated based on progress and historical data
    (SELECT COUNT(*) FROM public.punchlists WHERE job_id = rj.id AND status = 'open')::int as punchlist_open_count,
    (SELECT COUNT(*) FROM public.punchlists WHERE job_id = rj.id AND status = 'open' AND priority = 'critical')::int as punchlist_critical_count,
    ARRAY[]::text[] as material_shortages, -- Can be populated from material_usage table
    ARRAY[]::text[] as risk_flags, -- Can be calculated based on delays, issues, etc.
    NULL::timestamptz as next_crew_availability -- Can be calculated from crew schedule
  FROM public.roofing_jobs rj
  LEFT JOIN public.job_crews jc ON jc.job_id = rj.id AND jc.is_primary = true
  LEFT JOIN public.crews c ON c.id = jc.crew_id
  LEFT JOIN LATERAL (
    SELECT lat, lng
    FROM public.crew_gps_logs
    WHERE crew_id = c.id
    ORDER BY timestamp DESC
    LIMIT 1
  ) gps ON true
  WHERE rj.workspace_id = p_workspace_id
  AND (rj.scheduled_start_date = p_date OR rj.scheduled_start_date IS NULL)
  AND rj.status IN ('scheduled', 'in_progress')
  ORDER BY rj.scheduled_start_date, rj.created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 10 — TRIGGERS
-- ============================================================================

-- Trigger: Auto-update updated_at on foreman_reports
CREATE OR REPLACE FUNCTION update_foreman_reports_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_foreman_reports_updated_at ON public.foreman_reports;
CREATE TRIGGER trg_foreman_reports_updated_at
BEFORE UPDATE ON public.foreman_reports
FOR EACH ROW
EXECUTE FUNCTION update_foreman_reports_updated_at();

-- ============================================================================
-- PART 11 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.crew_gps_logs IS 'Tracks GPS location of crews in real-time (updates every 60 seconds)';
COMMENT ON TABLE public.jobsite_status_updates IS 'Tracks real-time status updates from jobsite (arriving, setup, tearoff, install_underlayment, shingles, ridge, cleanup, completed)';
COMMENT ON TABLE public.punchlists IS 'AI-generated and manual punchlist items with status tracking';
COMMENT ON TABLE public.foreman_reports IS 'Daily production reports from foremen (auto-generated and manual)';
COMMENT ON TABLE public.workflow_enforcement_rules IS 'Defines required steps and photo requirements for each workflow stage';
COMMENT ON TABLE public.crew_communications IS 'Built-in messaging system for foremen and PMs';
COMMENT ON TABLE public.job_workflow_checkpoints IS 'Tracks which workflow checkpoints have been completed for each job';





















