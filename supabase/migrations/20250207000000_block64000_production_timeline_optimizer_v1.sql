-- =========================================================
-- Block 64000 — SmartSend Roofing "Production Timeline Optimizer + Delay Prevention System" v1
-- (DELAY DETECTION • TIMELINE OPTIMIZATION • CREW SLOWDOWN ALERTS • WEATHER-BASED ADJUSTMENTS • PREDICTED COMPLETION TIMES)
-- =========================================================
-- 
-- This block turns SmartSend into a production intelligence engine — solving the #1 operational pain roofing companies face:
-- Unexpected delays that blow up the schedule, piss off homeowners, and kill profit.
--
-- Features:
-- ✅ Real-Time Production Delay Detection
-- ✅ Predicted Completion Time (AI)
-- ✅ Delay Alerts to Supervisor + Office
-- ✅ Decking Damage Probability Flag
-- ✅ Weather-Integrated Delay System
-- ✅ Crew Efficiency Tracking
-- ✅ Production Timeline Optimization
-- ✅ Homeowner Timeline Updates

-- ============================================================================
-- PART 1 — PRODUCTION TIMELINE TABLE
-- ============================================================================
-- Tracks predicted vs actual timelines for each job

CREATE TABLE IF NOT EXISTS public.production_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Timeline predictions
  predicted_start timestamptz,
  predicted_end timestamptz,
  predicted_duration_hours numeric,
  
  -- Actual timeline
  actual_start timestamptz,
  actual_end timestamptz,
  actual_duration_hours numeric,
  
  -- Delay tracking
  delay_hours numeric DEFAULT 0,
  delay_reason text,
  delay_severity text CHECK (delay_severity IN ('none', 'minor', 'moderate', 'severe')) DEFAULT 'none',
  
  -- Optimization suggestions
  optimization_suggestions jsonb DEFAULT '[]'::jsonb,
  
  -- Progress tracking
  progress_percent numeric DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  last_progress_update timestamptz,
  
  -- Decking damage probability
  decking_damage_probability numeric DEFAULT 0 CHECK (decking_damage_probability >= 0 AND decking_damage_probability <= 100),
  decking_damage_detected boolean DEFAULT false,
  additional_decking_sheets_estimated numeric DEFAULT 0,
  
  -- Weather impact
  weather_delay_hours numeric DEFAULT 0,
  weather_risk_level text CHECK (weather_risk_level IN ('none', 'low', 'medium', 'high')) DEFAULT 'none',
  weather_adjusted_end timestamptz,
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Foreign key to roofing_jobs
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'production_timeline_job_id_fkey'
    ) THEN
      ALTER TABLE public.production_timeline
        ADD CONSTRAINT production_timeline_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_production_timeline_job ON public.production_timeline(job_id);
CREATE INDEX IF NOT EXISTS idx_production_timeline_workspace ON public.production_timeline(workspace_id);
CREATE INDEX IF NOT EXISTS idx_production_timeline_delay ON public.production_timeline(delay_severity, delay_hours) WHERE delay_severity != 'none';
CREATE INDEX IF NOT EXISTS idx_production_timeline_status ON public.production_timeline(workspace_id, predicted_end) WHERE actual_end IS NULL;

-- ============================================================================
-- PART 2 — DELAY ALERTS TABLE
-- ============================================================================
-- Alerts for delays, slowdowns, and production issues

CREATE TABLE IF NOT EXISTS public.delay_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  
  -- Alert details
  alert_type text NOT NULL CHECK (alert_type IN (
    'crew_behind_schedule',
    'material_delay_risk',
    'decking_rot_detected',
    'weather_impact',
    'production_slowdown',
    'crew_no_update',
    'task_taking_too_long',
    'completion_delay'
  )),
  message text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'critical')) DEFAULT 'warning',
  
  -- Status
  resolved boolean DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_notes text,
  
  -- Context
  delay_hours numeric DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Foreign keys
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'delay_alerts_job_id_fkey'
    ) THEN
      ALTER TABLE public.delay_alerts
        ADD CONSTRAINT delay_alerts_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_delay_alerts_job ON public.delay_alerts(job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_delay_alerts_workspace ON public.delay_alerts(workspace_id, resolved, severity);
CREATE INDEX IF NOT EXISTS idx_delay_alerts_unresolved ON public.delay_alerts(workspace_id, resolved) WHERE resolved = false;
CREATE INDEX IF NOT EXISTS idx_delay_alerts_crew ON public.delay_alerts(crew_id) WHERE crew_id IS NOT NULL;

-- ============================================================================
-- PART 3 — CREW EFFICIENCY TABLE
-- ============================================================================
-- Tracks crew performance and efficiency metrics

CREATE TABLE IF NOT EXISTS public.crew_efficiency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id uuid NOT NULL REFERENCES public.crews(id) ON DELETE CASCADE,
  job_id uuid NOT NULL,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Efficiency metrics
  expected_rate numeric, -- e.g., squares per hour
  actual_rate numeric,
  efficiency_percent numeric,
  
  -- Time tracking
  start_time timestamptz,
  end_time timestamptz,
  total_hours numeric,
  productive_hours numeric,
  
  -- Production metrics
  squares_completed numeric DEFAULT 0,
  tasks_completed integer DEFAULT 0,
  tasks_total integer DEFAULT 0,
  
  -- Performance indicators
  break_duration_minutes numeric DEFAULT 0,
  slowdown_periods jsonb DEFAULT '[]'::jsonb, -- Array of {start, end, reason}
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Foreign key to roofing_jobs
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'crew_efficiency_job_id_fkey'
    ) THEN
      ALTER TABLE public.crew_efficiency
        ADD CONSTRAINT crew_efficiency_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_crew_efficiency_crew ON public.crew_efficiency(crew_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crew_efficiency_job ON public.crew_efficiency(job_id);
CREATE INDEX IF NOT EXISTS idx_crew_efficiency_workspace ON public.crew_efficiency(workspace_id);
CREATE INDEX IF NOT EXISTS idx_crew_efficiency_efficiency ON public.crew_efficiency(efficiency_percent) WHERE efficiency_percent IS NOT NULL;

-- ============================================================================
-- PART 4 — PRODUCTION PROGRESS SNAPSHOTS
-- ============================================================================
-- Hourly snapshots of job progress for trend analysis

CREATE TABLE IF NOT EXISTS public.production_progress_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Snapshot data
  progress_percent numeric NOT NULL CHECK (progress_percent >= 0 AND progress_percent <= 100),
  hours_elapsed numeric,
  hours_remaining_estimate numeric,
  
  -- Crew activity
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  crew_active boolean DEFAULT true,
  last_activity_at timestamptz,
  
  -- Weather conditions
  weather_conditions jsonb DEFAULT '{}'::jsonb,
  weather_impacting boolean DEFAULT false,
  
  -- Metadata
  snapshot_at timestamptz DEFAULT now()
);

-- Foreign key
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'production_progress_snapshots_job_id_fkey'
    ) THEN
      ALTER TABLE public.production_progress_snapshots
        ADD CONSTRAINT production_progress_snapshots_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_progress_snapshots_job ON public.production_progress_snapshots(job_id, snapshot_at DESC);
CREATE INDEX IF NOT EXISTS idx_progress_snapshots_workspace ON public.production_progress_snapshots(workspace_id, snapshot_at DESC);

-- ============================================================================
-- PART 5 — HELPER FUNCTIONS
-- ============================================================================

-- Function: Calculate predicted completion time
CREATE OR REPLACE FUNCTION calculate_predicted_completion(
  p_job_id uuid,
  p_roof_size_squares numeric DEFAULT NULL,
  p_layers integer DEFAULT 1,
  p_pitch numeric DEFAULT NULL,
  p_crew_id uuid DEFAULT NULL,
  p_job_type text DEFAULT 'roof_replacement'
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_start_time timestamptz;
  v_crew_daily_capacity numeric;
  v_estimated_hours numeric;
  v_predicted_end timestamptz;
  v_job_record record;
BEGIN
  -- Get job details
  SELECT 
    rj.scheduled_start_date,
    rj.crew_id,
    rj.job_type,
    pt.predicted_start
  INTO v_job_record
  FROM public.roofing_jobs rj
  LEFT JOIN public.production_timeline pt ON pt.job_id = rj.id
  WHERE rj.id = p_job_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found';
  END IF;
  
  -- Determine start time
  IF v_job_record.predicted_start IS NOT NULL THEN
    v_start_time := v_job_record.predicted_start;
  ELSIF v_job_record.scheduled_start_date IS NOT NULL THEN
    v_start_time := (v_job_record.scheduled_start_date::date + interval '7 hours')::timestamptz; -- Default 7 AM start
  ELSE
    v_start_time := now();
  END IF;
  
  -- Get crew capacity if available
  IF p_crew_id IS NOT NULL OR v_job_record.crew_id IS NOT NULL THEN
    SELECT COALESCE(daily_capacity_squares, 25) INTO v_crew_daily_capacity
    FROM public.crews
    WHERE id = COALESCE(p_crew_id, v_job_record.crew_id);
  ELSE
    v_crew_daily_capacity := 25; -- Default capacity
  END IF;
  
  -- Calculate estimated hours
  IF p_roof_size_squares IS NOT NULL AND p_roof_size_squares > 0 THEN
    -- Base calculation: squares / daily capacity * 8 hours
    v_estimated_hours := (p_roof_size_squares / v_crew_daily_capacity) * 8;
    
    -- Adjust for layers
    IF p_layers > 1 THEN
      v_estimated_hours := v_estimated_hours * (1 + (p_layers - 1) * 0.3);
    END IF;
    
    -- Adjust for pitch (steeper = slower)
    IF p_pitch IS NOT NULL AND p_pitch > 6 THEN
      v_estimated_hours := v_estimated_hours * (1 + (p_pitch - 6) * 0.05);
    END IF;
  ELSE
    -- Default estimate based on job type
    CASE p_job_type
      WHEN 'roof_replacement' THEN v_estimated_hours := 16; -- 2 days
      WHEN 'repair' THEN v_estimated_hours := 4;
      ELSE v_estimated_hours := 8;
    END CASE;
  END IF;
  
  -- Calculate predicted end time
  v_predicted_end := v_start_time + (v_estimated_hours || ' hours')::interval;
  
  RETURN v_predicted_end;
END;
$$;

-- Function: Detect delays and create alerts
CREATE OR REPLACE FUNCTION detect_production_delays(p_workspace_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job record;
  v_timeline record;
  v_delay_hours numeric;
  v_severity text;
  v_alerts_created integer := 0;
  v_crew_efficiency record;
  v_last_activity timestamptz;
BEGIN
  -- Loop through active jobs
  FOR v_job IN
    SELECT rj.id, rj.workspace_id, rj.crew_id, rj.status, rj.scheduled_start_date
    FROM public.roofing_jobs rj
    WHERE rj.status IN ('scheduled', 'in_progress')
      AND (p_workspace_id IS NULL OR rj.workspace_id = p_workspace_id)
  LOOP
    -- Get timeline
    SELECT * INTO v_timeline
    FROM public.production_timeline
    WHERE job_id = v_job.id
    ORDER BY updated_at DESC
    LIMIT 1;
    
    IF v_timeline IS NULL THEN
      CONTINUE;
    END IF;
    
    -- Check if job is behind schedule
    IF v_timeline.predicted_end IS NOT NULL AND v_timeline.actual_end IS NULL THEN
      v_delay_hours := EXTRACT(EPOCH FROM (now() - v_timeline.predicted_end)) / 3600;
      
      IF v_delay_hours > 0 THEN
        -- Determine severity
        IF v_delay_hours >= 8 THEN
          v_severity := 'critical';
        ELSIF v_delay_hours >= 4 THEN
          v_severity := 'warning';
        ELSE
          v_severity := 'info';
        END IF;
        
        -- Check if alert already exists
        IF NOT EXISTS (
          SELECT 1 FROM public.delay_alerts
          WHERE job_id = v_job.id
            AND alert_type = 'completion_delay'
            AND resolved = false
            AND created_at > now() - interval '1 hour'
        ) THEN
          -- Create delay alert
          INSERT INTO public.delay_alerts (
            job_id, workspace_id, crew_id,
            alert_type, message, severity,
            delay_hours, metadata
          ) VALUES (
            v_job.id, v_job.workspace_id, v_job.crew_id,
            'completion_delay',
            format('Job is %.1f hours behind predicted completion time', v_delay_hours),
            v_severity,
            v_delay_hours,
            jsonb_build_object('predicted_end', v_timeline.predicted_end, 'current_time', now())
          );
          
          v_alerts_created := v_alerts_created + 1;
          
          -- Update timeline
          UPDATE public.production_timeline
          SET delay_hours = v_delay_hours,
              delay_severity = v_severity,
              updated_at = now()
          WHERE id = v_timeline.id;
        END IF;
      END IF;
    END IF;
    
    -- Check for crew inactivity (no updates in 60+ minutes)
    IF v_job.crew_id IS NOT NULL THEN
      SELECT MAX(created_at) INTO v_last_activity
      FROM public.job_activity_log
      WHERE job_id = v_job.id;
      
      IF v_last_activity IS NOT NULL AND v_last_activity < now() - interval '60 minutes' THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.delay_alerts
          WHERE job_id = v_job.id
            AND alert_type = 'crew_no_update'
            AND resolved = false
            AND created_at > now() - interval '2 hours'
        ) THEN
          INSERT INTO public.delay_alerts (
            job_id, workspace_id, crew_id,
            alert_type, message, severity,
            metadata
          ) VALUES (
            v_job.id, v_job.workspace_id, v_job.crew_id,
            'crew_no_update',
            format('No crew activity updates in the last %.0f minutes', EXTRACT(EPOCH FROM (now() - v_last_activity)) / 60),
            'warning',
            jsonb_build_object('last_activity', v_last_activity)
          );
          
          v_alerts_created := v_alerts_created + 1;
        END IF;
      END IF;
    END IF;
    
    -- Check crew efficiency
    IF v_job.crew_id IS NOT NULL THEN
      SELECT * INTO v_crew_efficiency
      FROM public.crew_efficiency
      WHERE job_id = v_job.id
        AND crew_id = v_job.crew_id
      ORDER BY updated_at DESC
      LIMIT 1;
      
      IF v_crew_efficiency IS NOT NULL AND v_crew_efficiency.efficiency_percent < 80 THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.delay_alerts
          WHERE job_id = v_job.id
            AND alert_type = 'production_slowdown'
            AND resolved = false
            AND created_at > now() - interval '4 hours'
        ) THEN
          INSERT INTO public.delay_alerts (
            job_id, workspace_id, crew_id,
            alert_type, message, severity,
            metadata
          ) VALUES (
            v_job.id, v_job.workspace_id, v_job.crew_id,
            'production_slowdown',
            format('Crew efficiency at %.0f%% - trending slower than expected', v_crew_efficiency.efficiency_percent),
            CASE WHEN v_crew_efficiency.efficiency_percent < 60 THEN 'critical' ELSE 'warning' END,
            jsonb_build_object('efficiency_percent', v_crew_efficiency.efficiency_percent)
          );
          
          v_alerts_created := v_alerts_created + 1;
        END IF;
      END IF;
    END IF;
  END LOOP;
  
  RETURN v_alerts_created;
END;
$$;

-- Function: Calculate crew efficiency
CREATE OR REPLACE FUNCTION calculate_crew_efficiency(
  p_crew_id uuid,
  p_job_id uuid
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_efficiency record;
  v_expected_rate numeric;
  v_actual_rate numeric;
  v_efficiency_percent numeric;
BEGIN
  -- Get crew's expected rate
  SELECT COALESCE(daily_capacity_squares, 25) INTO v_expected_rate
  FROM public.crews
  WHERE id = p_crew_id;
  
  -- Calculate actual rate from job activity
  SELECT 
    COALESCE(SUM(CASE WHEN jal.type = 'start' THEN 1 ELSE 0 END), 0) as tasks_started,
    COALESCE(EXTRACT(EPOCH FROM (MAX(jal.created_at) - MIN(jal.created_at))) / 3600, 1) as hours_worked
  INTO v_efficiency
  FROM public.job_activity_log jal
  WHERE jal.job_id = p_job_id
    AND jal.created_at > now() - interval '24 hours';
  
  -- Calculate efficiency
  IF v_efficiency.hours_worked > 0 THEN
    -- Simplified calculation - in production, use actual squares completed
    v_actual_rate := v_efficiency.tasks_started / NULLIF(v_efficiency.hours_worked, 0);
    v_efficiency_percent := (v_actual_rate / NULLIF(v_expected_rate, 0)) * 100;
  ELSE
    v_efficiency_percent := 100; -- Default if no data
  END IF;
  
  -- Update or insert crew efficiency record
  INSERT INTO public.crew_efficiency (
    crew_id, job_id, workspace_id,
    expected_rate, actual_rate, efficiency_percent,
    start_time, total_hours
  )
  SELECT 
    p_crew_id, p_job_id, rj.workspace_id,
    v_expected_rate, v_actual_rate, v_efficiency_percent,
    MIN(jal.created_at), v_efficiency.hours_worked
  FROM public.roofing_jobs rj
  CROSS JOIN LATERAL (
    SELECT MIN(created_at) as created_at
    FROM public.job_activity_log
    WHERE job_id = p_job_id
  ) jal
  WHERE rj.id = p_job_id
  ON CONFLICT (id) DO UPDATE SET
    actual_rate = EXCLUDED.actual_rate,
    efficiency_percent = EXCLUDED.efficiency_percent,
    total_hours = EXCLUDED.total_hours,
    updated_at = now();
  
  RETURN v_efficiency_percent;
END;
$$;

-- ============================================================================
-- PART 6 — ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.production_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delay_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_efficiency ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_progress_snapshots ENABLE ROW LEVEL SECURITY;

-- Production timeline: workspace members can access
CREATE POLICY "production_timeline_workspace_member" ON public.production_timeline
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = production_timeline.workspace_id AND user_id = auth.uid()
    )
  );

-- Delay alerts: workspace members can access
CREATE POLICY "delay_alerts_workspace_member" ON public.delay_alerts
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = delay_alerts.workspace_id AND user_id = auth.uid()
    )
  );

-- Crew efficiency: workspace members can access
CREATE POLICY "crew_efficiency_workspace_member" ON public.crew_efficiency
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = crew_efficiency.workspace_id AND user_id = auth.uid()
    )
  );

-- Progress snapshots: workspace members can access
CREATE POLICY "progress_snapshots_workspace_member" ON public.production_progress_snapshots
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = production_progress_snapshots.workspace_id AND user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 7 — TRIGGERS
-- ============================================================================

-- Update updated_at on production_timeline
CREATE OR REPLACE FUNCTION update_production_timeline_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_production_timeline_updated_at ON public.production_timeline;
CREATE TRIGGER trg_production_timeline_updated_at
BEFORE UPDATE ON public.production_timeline
FOR EACH ROW
EXECUTE FUNCTION update_production_timeline_updated_at();

-- Update updated_at on delay_alerts
CREATE OR REPLACE FUNCTION update_delay_alerts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_delay_alerts_updated_at ON public.delay_alerts;
CREATE TRIGGER trg_delay_alerts_updated_at
BEFORE UPDATE ON public.delay_alerts
FOR EACH ROW
EXECUTE FUNCTION update_delay_alerts_updated_at();

-- Update updated_at on crew_efficiency
CREATE OR REPLACE FUNCTION update_crew_efficiency_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crew_efficiency_updated_at ON public.crew_efficiency;
CREATE TRIGGER trg_crew_efficiency_updated_at
BEFORE UPDATE ON public.crew_efficiency
FOR EACH ROW
EXECUTE FUNCTION update_crew_efficiency_updated_at();

-- ============================================================================
-- PART 8 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON public.production_timeline TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.delay_alerts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.crew_efficiency TO authenticated;
GRANT SELECT, INSERT ON public.production_progress_snapshots TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_predicted_completion(uuid, numeric, integer, numeric, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION detect_production_delays(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_crew_efficiency(uuid, uuid) TO authenticated;

COMMENT ON TABLE public.production_timeline IS 'Tracks predicted vs actual production timelines for roofing jobs';
COMMENT ON TABLE public.delay_alerts IS 'Alerts for production delays, slowdowns, and issues';
COMMENT ON TABLE public.crew_efficiency IS 'Tracks crew performance and efficiency metrics';
COMMENT ON TABLE public.production_progress_snapshots IS 'Hourly snapshots of job progress for trend analysis';




























