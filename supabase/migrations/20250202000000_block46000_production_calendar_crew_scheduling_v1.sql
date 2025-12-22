-- Block 46000 — SmartSend Roofing "Production Calendar + Crew Scheduling Engine" v1
-- (CREW ASSIGNMENT • DRAG-AND-DROP CALENDAR • WEATHER DELAYS • AI JOB DURATION • WORKLOAD BALANCING • AUTOMATIC RESCHEDULING)
--
-- This block turns SmartSend from an outreach system into a full roofing operations command center.
--
-- Features:
-- - Production Calendar (Month / Week View)
-- - Crew Scheduling Engine with availability, skills, workload balance
-- - AI-Powered Job Duration Estimation
-- - Weather Delay Handling
-- - Automatic Conflict Resolution
-- - Daily Crew Workload Snapshot
-- - Homeowner Notifications

-- ============================================================
-- 1. CREW_SCHEDULES TABLE
-- ============================================================
-- Links jobs to crews with scheduling information
CREATE TABLE IF NOT EXISTS public.crew_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid NOT NULL,
  crew_id uuid NOT NULL REFERENCES public.crews(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  start_time time DEFAULT '08:00:00',
  estimated_duration numeric, -- hours or days (decimal)
  estimated_duration_days numeric GENERATED ALWAYS AS (
    CASE 
      WHEN estimated_duration IS NULL THEN NULL
      WHEN estimated_duration < 24 THEN estimated_duration / 8.0 -- Convert hours to days (8 hour workday)
      ELSE estimated_duration
    END
  ) STORED,
  ai_predicted_duration numeric, -- AI-calculated duration in hours
  actual_start_date date,
  actual_end_date date,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN (
    'scheduled',
    'in_progress',
    'delayed',
    'completed',
    'canceled'
  )),
  delay_reason text,
  delay_days integer DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Add foreign key to roofing_jobs if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'crew_schedules_job_id_fkey'
    ) THEN
      ALTER TABLE public.crew_schedules
        ADD CONSTRAINT crew_schedules_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- Indexes for crew_schedules
CREATE INDEX IF NOT EXISTS idx_crew_schedules_workspace ON public.crew_schedules(workspace_id);
CREATE INDEX IF NOT EXISTS idx_crew_schedules_job ON public.crew_schedules(job_id);
CREATE INDEX IF NOT EXISTS idx_crew_schedules_crew ON public.crew_schedules(crew_id);
CREATE INDEX IF NOT EXISTS idx_crew_schedules_dates ON public.crew_schedules(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_crew_schedules_status ON public.crew_schedules(status);
CREATE INDEX IF NOT EXISTS idx_crew_schedules_date_range ON public.crew_schedules USING gist (
  tstzrange(start_date::timestamptz, end_date::timestamptz, '[]')
);

-- Unique constraint: one active schedule per job
CREATE UNIQUE INDEX IF NOT EXISTS uq_crew_schedules_active_job ON public.crew_schedules(job_id) 
WHERE status IN ('scheduled', 'in_progress');

-- ============================================================
-- 2. WEATHER_FORECASTS TABLE
-- ============================================================
-- Stores weather checks and risk assessments for scheduled jobs
CREATE TABLE IF NOT EXISTS public.weather_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid NOT NULL,
  schedule_id uuid REFERENCES public.crew_schedules(id) ON DELETE CASCADE,
  forecast_date date NOT NULL,
  forecast jsonb NOT NULL DEFAULT '{}'::jsonb, -- Full forecast data from API
  risk_level text NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  risk_reasons text[], -- Array of risk reasons (e.g., ['rain', 'wind > 30mph'])
  temperature_high numeric,
  temperature_low numeric,
  precipitation_probability numeric, -- 0-100
  precipitation_amount numeric, -- inches
  wind_speed_max numeric, -- mph
  wind_gust_max numeric, -- mph
  snow_expected boolean DEFAULT false,
  recommended_action text, -- 'proceed', 'delay', 'reschedule'
  suggested_reschedule_date date,
  checked_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Add foreign key to roofing_jobs if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'weather_forecasts_job_id_fkey'
    ) THEN
      ALTER TABLE public.weather_forecasts
        ADD CONSTRAINT weather_forecasts_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- Indexes for weather_forecasts
CREATE INDEX IF NOT EXISTS idx_weather_forecasts_workspace ON public.weather_forecasts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_weather_forecasts_job ON public.weather_forecasts(job_id);
CREATE INDEX IF NOT EXISTS idx_weather_forecasts_schedule ON public.weather_forecasts(schedule_id);
CREATE INDEX IF NOT EXISTS idx_weather_forecasts_date ON public.weather_forecasts(forecast_date);
CREATE INDEX IF NOT EXISTS idx_weather_forecasts_risk ON public.weather_forecasts(risk_level);
CREATE INDEX IF NOT EXISTS idx_weather_forecasts_high_risk ON public.weather_forecasts(job_id, forecast_date) 
WHERE risk_level IN ('high', 'critical');

-- ============================================================
-- 3. SCHEDULE_CHANGES TABLE
-- ============================================================
-- Audit log of schedule changes for tracking and notifications
CREATE TABLE IF NOT EXISTS public.schedule_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid NOT NULL,
  schedule_id uuid REFERENCES public.crew_schedules(id) ON DELETE CASCADE,
  change_type text NOT NULL CHECK (change_type IN (
    'created',
    'crew_changed',
    'date_changed',
    'rescheduled',
    'canceled',
    'status_changed'
  )),
  old_crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  new_crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  old_start_date date,
  new_start_date date,
  old_end_date date,
  new_end_date date,
  old_status text,
  new_status text,
  reason text,
  notified_homeowner boolean DEFAULT false,
  notified_at timestamptz,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Add foreign key to roofing_jobs if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'schedule_changes_job_id_fkey'
    ) THEN
      ALTER TABLE public.schedule_changes
        ADD CONSTRAINT schedule_changes_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- Indexes for schedule_changes
CREATE INDEX IF NOT EXISTS idx_schedule_changes_workspace ON public.schedule_changes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_schedule_changes_job ON public.schedule_changes(job_id);
CREATE INDEX IF NOT EXISTS idx_schedule_changes_schedule ON public.schedule_changes(schedule_id);
CREATE INDEX IF NOT EXISTS idx_schedule_changes_created ON public.schedule_changes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_schedule_changes_notified ON public.schedule_changes(notified_homeowner) 
WHERE notified_homeowner = false;

-- ============================================================
-- 4. SCHEDULE_CONFLICTS TABLE (for conflict detection)
-- ============================================================
-- Tracks detected scheduling conflicts
CREATE TABLE IF NOT EXISTS public.schedule_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  conflict_type text NOT NULL CHECK (conflict_type IN (
    'crew_double_booked',
    'overlapping_jobs',
    'insufficient_capacity',
    'weather_risk',
    'material_not_ready'
  )),
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  schedule_id_1 uuid REFERENCES public.crew_schedules(id) ON DELETE CASCADE,
  schedule_id_2 uuid REFERENCES public.crew_schedules(id) ON DELETE CASCADE,
  job_id_1 uuid NOT NULL,
  job_id_2 uuid,
  crew_id uuid REFERENCES public.crews(id) ON DELETE CASCADE,
  conflict_date date NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  resolved boolean DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_action text,
  created_at timestamptz DEFAULT now()
);

-- Add foreign key to roofing_jobs if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'schedule_conflicts_job_id_1_fkey'
    ) THEN
      ALTER TABLE public.schedule_conflicts
        ADD CONSTRAINT schedule_conflicts_job_id_1_fkey
        FOREIGN KEY (job_id_1) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'schedule_conflicts_job_id_2_fkey'
    ) THEN
      ALTER TABLE public.schedule_conflicts
        ADD CONSTRAINT schedule_conflicts_job_id_2_fkey
        FOREIGN KEY (job_id_2) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- Indexes for schedule_conflicts
CREATE INDEX IF NOT EXISTS idx_schedule_conflicts_workspace ON public.schedule_conflicts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_schedule_conflicts_resolved ON public.schedule_conflicts(resolved, severity);
CREATE INDEX IF NOT EXISTS idx_schedule_conflicts_crew ON public.schedule_conflicts(crew_id);
CREATE INDEX IF NOT EXISTS idx_schedule_conflicts_date ON public.schedule_conflicts(conflict_date);
CREATE INDEX IF NOT EXISTS idx_schedule_conflicts_active ON public.schedule_conflicts(workspace_id, conflict_date) 
WHERE resolved = false;

-- ============================================================
-- 5. TRIGGERS
-- ============================================================

-- Update updated_at on crew_schedules
CREATE OR REPLACE FUNCTION update_crew_schedules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crew_schedules_updated_at ON public.crew_schedules;
CREATE TRIGGER trg_crew_schedules_updated_at
BEFORE UPDATE ON public.crew_schedules
FOR EACH ROW
EXECUTE FUNCTION update_crew_schedules_updated_at();

-- Log schedule changes when crew_schedules is modified
CREATE OR REPLACE FUNCTION log_schedule_changes()
RETURNS TRIGGER AS $$
DECLARE
  change_type_val text;
BEGIN
  -- Determine change type
  IF TG_OP = 'INSERT' THEN
    change_type_val := 'created';
    INSERT INTO public.schedule_changes (
      workspace_id, job_id, schedule_id, change_type,
      new_crew_id, new_start_date, new_end_date, new_status,
      created_by
    ) VALUES (
      NEW.workspace_id, NEW.job_id, NEW.id, change_type_val,
      NEW.crew_id, NEW.start_date, NEW.end_date, NEW.status,
      auth.uid()
    );
  ELSIF TG_OP = 'UPDATE' THEN
    -- Check what changed
    IF OLD.crew_id IS DISTINCT FROM NEW.crew_id THEN
      change_type_val := 'crew_changed';
    ELSIF OLD.start_date IS DISTINCT FROM NEW.start_date OR OLD.end_date IS DISTINCT FROM NEW.end_date THEN
      change_type_val := 'date_changed';
    ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
      change_type_val := 'status_changed';
    ELSE
      change_type_val := 'rescheduled';
    END IF;
    
    INSERT INTO public.schedule_changes (
      workspace_id, job_id, schedule_id, change_type,
      old_crew_id, new_crew_id,
      old_start_date, new_start_date,
      old_end_date, new_end_date,
      old_status, new_status,
      created_by
    ) VALUES (
      NEW.workspace_id, NEW.job_id, NEW.id, change_type_val,
      OLD.crew_id, NEW.crew_id,
      OLD.start_date, NEW.start_date,
      OLD.end_date, NEW.end_date,
      OLD.status, NEW.status,
      auth.uid()
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_log_schedule_changes ON public.crew_schedules;
CREATE TRIGGER trg_log_schedule_changes
AFTER INSERT OR UPDATE ON public.crew_schedules
FOR EACH ROW
EXECUTE FUNCTION log_schedule_changes();

-- ============================================================
-- 6. HELPER FUNCTIONS
-- ============================================================

-- Function to detect scheduling conflicts
CREATE OR REPLACE FUNCTION detect_schedule_conflicts(p_workspace_id uuid, p_start_date date, p_end_date date)
RETURNS TABLE (
  conflict_id uuid,
  conflict_type text,
  severity text,
  schedule_id uuid,
  job_id uuid,
  crew_id uuid,
  conflict_date date
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cs.id as conflict_id,
    'crew_double_booked'::text as conflict_type,
    CASE 
      WHEN cs.start_date = p_start_date THEN 'critical'::text
      WHEN cs.start_date < p_start_date AND cs.end_date >= p_start_date THEN 'high'::text
      ELSE 'medium'::text
    END as severity,
    cs.id as schedule_id,
    cs.job_id,
    cs.crew_id,
    GREATEST(cs.start_date, p_start_date) as conflict_date
  FROM public.crew_schedules cs
  WHERE cs.workspace_id = p_workspace_id
    AND cs.status IN ('scheduled', 'in_progress')
    AND cs.start_date <= p_end_date
    AND cs.end_date >= p_start_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get crew workload for a date range
CREATE OR REPLACE FUNCTION get_crew_workload(
  p_workspace_id uuid,
  p_crew_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  date date,
  hours_booked numeric,
  jobs_count bigint,
  total_squares numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    d.date,
    COALESCE(SUM(cs.estimated_duration), 0) as hours_booked,
    COUNT(cs.id) as jobs_count,
    COALESCE(SUM(rj.official_squares), 0) as total_squares
  FROM generate_series(p_start_date, p_end_date, '1 day'::interval)::date as d
  LEFT JOIN public.crew_schedules cs ON 
    cs.crew_id = p_crew_id
    AND cs.workspace_id = p_workspace_id
    AND cs.status IN ('scheduled', 'in_progress')
    AND d.date >= cs.start_date
    AND d.date <= cs.end_date
  LEFT JOIN public.roofing_jobs rj ON cs.job_id = rj.id
  GROUP BY d.date
  ORDER BY d.date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 7. ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.crew_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weather_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_conflicts ENABLE ROW LEVEL SECURITY;

-- Crew schedules: Workspace members can access
DROP POLICY IF EXISTS "crew_schedules_workspace_member" ON public.crew_schedules;
CREATE POLICY "crew_schedules_workspace_member" ON public.crew_schedules
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = crew_schedules.workspace_id
      AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = crew_schedules.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- Weather forecasts: Workspace members can access
DROP POLICY IF EXISTS "weather_forecasts_workspace_member" ON public.weather_forecasts;
CREATE POLICY "weather_forecasts_workspace_member" ON public.weather_forecasts
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = weather_forecasts.workspace_id
      AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = weather_forecasts.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- Schedule changes: Workspace members can access
DROP POLICY IF EXISTS "schedule_changes_workspace_member" ON public.schedule_changes;
CREATE POLICY "schedule_changes_workspace_member" ON public.schedule_changes
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = schedule_changes.workspace_id
      AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = schedule_changes.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- Schedule conflicts: Workspace members can access
DROP POLICY IF EXISTS "schedule_conflicts_workspace_member" ON public.schedule_conflicts;
CREATE POLICY "schedule_conflicts_workspace_member" ON public.schedule_conflicts
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = schedule_conflicts.workspace_id
      AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = schedule_conflicts.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- Service role has full access
DROP POLICY IF EXISTS "crew_schedules_service_role" ON public.crew_schedules;
CREATE POLICY "crew_schedules_service_role" ON public.crew_schedules
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "weather_forecasts_service_role" ON public.weather_forecasts;
CREATE POLICY "weather_forecasts_service_role" ON public.weather_forecasts
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "schedule_changes_service_role" ON public.schedule_changes;
CREATE POLICY "schedule_changes_service_role" ON public.schedule_changes
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "schedule_conflicts_service_role" ON public.schedule_conflicts;
CREATE POLICY "schedule_conflicts_service_role" ON public.schedule_conflicts
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
































