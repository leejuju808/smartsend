-- ============================================================================
-- Block 24980 — SmartSend Roofing Scheduling Engine v1
-- (Calendar System • Install Scheduling • Crew Calendar • Weather-Aware Scheduling • Auto-Conflict Detection)
-- ============================================================================
-- THE FULL ROOFING SCHEDULING ENGINE — ZERO FLUFF.
-- This feature becomes the heartbeat of day-to-day roofing operations.
-- Scheduling is where 80% of roofing chaos happens.
-- SmartSend Scheduling Engine v1 eliminates that chaos.
-- ============================================================================

-- ============================================================================
-- PART 1 — COMPANY CALENDAR EVENTS TABLE (Enhanced)
-- ============================================================================
-- Master calendar view showing all events: inspections, installs, repairs, adjuster appointments, deliveries, etc.

-- Extend existing calendar_events table if needed
DO $$
BEGIN
  -- Add crew_id if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'calendar_events' 
      AND column_name = 'crew_id'
  ) THEN
    ALTER TABLE public.calendar_events
      ADD COLUMN crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL;
  END IF;

  -- Add material_delivery_id if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'calendar_events' 
      AND column_name = 'material_delivery_id'
  ) THEN
    ALTER TABLE public.calendar_events
      ADD COLUMN material_delivery_id uuid; -- Reference to material orders/deliveries
  END IF;

  -- Add weather_risk_score if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'calendar_events' 
      AND column_name = 'weather_risk_score'
  ) THEN
    ALTER TABLE public.calendar_events
      ADD COLUMN weather_risk_score numeric(3,2) DEFAULT 0.0 CHECK (weather_risk_score >= 0 AND weather_risk_score <= 1.0);
  END IF;

  -- Add conflict_warnings if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'calendar_events' 
      AND column_name = 'conflict_warnings'
  ) THEN
    ALTER TABLE public.calendar_events
      ADD COLUMN conflict_warnings text[] DEFAULT '{}';
  END IF;

  -- Add duration_minutes if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'calendar_events' 
      AND column_name = 'duration_minutes'
  ) THEN
    ALTER TABLE public.calendar_events
      ADD COLUMN duration_minutes integer;
  END IF;
END $$;

-- Indexes for calendar queries
CREATE INDEX IF NOT EXISTS idx_calendar_events_crew ON public.calendar_events(crew_id) WHERE crew_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calendar_events_weather_risk ON public.calendar_events(weather_risk_score DESC) WHERE weather_risk_score > 0.5;
CREATE INDEX IF NOT EXISTS idx_calendar_events_date_range ON public.calendar_events(event_date, event_start_time, event_end_time);

-- ============================================================================
-- PART 2 — CREW CALENDAR VIEW TABLE
-- ============================================================================
-- Per-crew calendar view showing all jobs assigned to a crew

CREATE TABLE IF NOT EXISTS public.crew_calendar_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  crew_id uuid NOT NULL REFERENCES public.crews(id) ON DELETE CASCADE,
  
  -- View date range
  view_start_date date NOT NULL,
  view_end_date date NOT NULL,
  
  -- Aggregated data (computed)
  total_jobs integer DEFAULT 0,
  total_hours numeric(5,2) DEFAULT 0,
  jobs_by_type jsonb DEFAULT '{}'::jsonb, -- {"install": 2, "repair": 1}
  
  -- Conflicts detected
  has_conflicts boolean DEFAULT false,
  conflict_details jsonb DEFAULT '[]'::jsonb,
  
  -- Timestamps
  computed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crew_calendar_views_unique ON public.crew_calendar_views(crew_id, view_start_date, view_end_date);
CREATE INDEX IF NOT EXISTS idx_crew_calendar_views_workspace ON public.crew_calendar_views(workspace_id);

-- ============================================================================
-- PART 3 — WEATHER-AWARE SCHEDULING TABLE
-- ============================================================================
-- Weather data and risk assessment for scheduling decisions

CREATE TABLE IF NOT EXISTS public.weather_schedule_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Location (for weather lookup)
  location_address text,
  location_city text,
  location_state text,
  location_zip text,
  location_lat numeric(10,7),
  location_lon numeric(10,7),
  
  -- Date and time
  forecast_date date NOT NULL,
  forecast_time time,
  
  -- Weather conditions
  rain_probability numeric(5,2) DEFAULT 0 CHECK (rain_probability >= 0 AND rain_probability <= 100),
  wind_speed_mph numeric(5,2) DEFAULT 0,
  hail_risk boolean DEFAULT false,
  temperature_f numeric(5,2),
  storm_timeline text, -- e.g., "Storm system approaching 2PM-6PM"
  
  -- Risk assessment
  weather_risk_score numeric(3,2) DEFAULT 0.0 CHECK (weather_risk_score >= 0 AND weather_risk_score <= 1.0),
  is_safe_for_roofing boolean DEFAULT true,
  risk_reason text, -- Why it's risky or safe
  
  -- Source
  weather_provider text DEFAULT 'openweather', -- 'openweather', 'weather_api', 'manual'
  weather_data_raw jsonb DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(workspace_id, location_address, forecast_date, forecast_time)
);

CREATE INDEX IF NOT EXISTS idx_weather_schedule_date ON public.weather_schedule_data(forecast_date, forecast_time);
CREATE INDEX IF NOT EXISTS idx_weather_schedule_location ON public.weather_schedule_data(location_city, location_state, forecast_date);
CREATE INDEX IF NOT EXISTS idx_weather_schedule_risk ON public.weather_schedule_data(weather_risk_score DESC) WHERE weather_risk_score > 0.5;

-- ============================================================================
-- PART 4 — SCHEDULING CONFLICTS TABLE
-- ============================================================================
-- Track detected conflicts and resolutions

CREATE TABLE IF NOT EXISTS public.scheduling_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Conflict details
  conflict_type text NOT NULL CHECK (conflict_type IN (
    'crew_overbooked',
    'material_timing_off',
    'payment_missing',
    'insurance_not_ready',
    'permit_missing',
    'weather_risk',
    'double_booking',
    'capacity_exceeded'
  )),
  
  -- Related entities
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  calendar_event_id uuid REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  
  -- Conflict description
  conflict_message text NOT NULL,
  conflict_details jsonb DEFAULT '{}'::jsonb,
  
  -- Resolution
  status text DEFAULT 'detected' CHECK (status IN ('detected', 'acknowledged', 'resolved', 'ignored')),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_notes text,
  
  -- Severity
  severity text DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  
  -- Timestamps
  detected_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduling_conflicts_workspace ON public.scheduling_conflicts(workspace_id, status, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_scheduling_conflicts_job ON public.scheduling_conflicts(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scheduling_conflicts_crew ON public.scheduling_conflicts(crew_id) WHERE crew_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scheduling_conflicts_severity ON public.scheduling_conflicts(severity, detected_at DESC) WHERE status = 'detected';

-- ============================================================================
-- PART 5 — SCHEDULING AUTOMATIONS TABLE
-- ============================================================================
-- Automated actions triggered by scheduling events

CREATE TABLE IF NOT EXISTS public.scheduling_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Automation configuration
  automation_name text NOT NULL,
  automation_type text NOT NULL CHECK (automation_type IN (
    'day_before_confirmation',
    'crew_arrival_window',
    'material_coordination',
    'weather_based_move',
    'after_install',
    'payment_reminder',
    'permit_check'
  )),
  is_active boolean DEFAULT true,
  
  -- Trigger conditions
  trigger_days_before integer, -- e.g., 1 for day-before confirmation
  trigger_time time, -- e.g., '08:00:00' for morning triggers
  trigger_conditions jsonb DEFAULT '{}'::jsonb, -- Additional conditions
  
  -- Actions
  action_type text NOT NULL CHECK (action_type IN (
    'send_message',
    'create_task',
    'send_notification',
    'update_status',
    'block_scheduling',
    'reschedule_event'
  )),
  action_config jsonb NOT NULL DEFAULT '{}'::jsonb, -- Action-specific configuration
  
  -- Recipients
  send_to_homeowner boolean DEFAULT false,
  send_to_crew boolean DEFAULT false,
  send_to_operations boolean DEFAULT false,
  send_to_sales boolean DEFAULT false,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduling_automations_workspace ON public.scheduling_automations(workspace_id, is_active);
CREATE INDEX IF NOT EXISTS idx_scheduling_automations_type ON public.scheduling_automations(automation_type, is_active);

-- ============================================================================
-- PART 6 — SCHEDULING AUTOMATION LOG TABLE
-- ============================================================================
-- Track when automations fire and their results

CREATE TABLE IF NOT EXISTS public.scheduling_automation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  automation_id uuid NOT NULL REFERENCES public.scheduling_automations(id) ON DELETE CASCADE,
  
  -- Trigger context
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  calendar_event_id uuid REFERENCES public.calendar_events(id) ON DELETE SET NULL,
  
  -- Execution
  triggered_at timestamptz DEFAULT now(),
  execution_status text DEFAULT 'pending' CHECK (execution_status IN ('pending', 'success', 'failed', 'skipped')),
  execution_result jsonb DEFAULT '{}'::jsonb,
  error_message text,
  
  -- Timestamps
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduling_automation_logs_automation ON public.scheduling_automation_logs(automation_id, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_scheduling_automation_logs_job ON public.scheduling_automation_logs(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scheduling_automation_logs_status ON public.scheduling_automation_logs(execution_status, triggered_at DESC);

-- ============================================================================
-- PART 7 — HOMEOWNER SCHEDULING PREFERENCES TABLE
-- ============================================================================
-- Store homeowner-selected dates and preferences

CREATE TABLE IF NOT EXISTS public.homeowner_scheduling_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  
  -- Preferred dates (homeowner selections)
  preferred_dates date[] DEFAULT '{}',
  preferred_times time[] DEFAULT '{}',
  
  -- Selected date (final choice)
  selected_date date,
  selected_time time,
  
  -- Status
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected', 'rescheduled')),
  confirmed_at timestamptz,
  
  -- Notes
  homeowner_notes text,
  roofer_notes text,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_homeowner_scheduling_job ON public.homeowner_scheduling_preferences(job_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_scheduling_status ON public.homeowner_scheduling_preferences(status, selected_date) WHERE selected_date IS NOT NULL;

-- ============================================================================
-- PART 8 — FUNCTIONS FOR CONFLICT DETECTION
-- ============================================================================

-- Function to detect crew overbooking
CREATE OR REPLACE FUNCTION detect_crew_overbooking()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_conflict_count integer;
  v_conflict_id uuid;
BEGIN
  -- Check if crew is already booked at this time
  IF NEW.crew_id IS NOT NULL AND NEW.event_date IS NOT NULL AND NEW.event_start_time IS NOT NULL THEN
    SELECT COUNT(*) INTO v_conflict_count
    FROM public.calendar_events ce
    WHERE ce.crew_id = NEW.crew_id
      AND ce.event_date = NEW.event_date
      AND ce.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND ce.status IN ('scheduled', 'confirmed')
      AND (
        (NEW.event_start_time BETWEEN ce.event_start_time AND COALESCE(ce.event_end_time, ce.event_start_time + interval '8 hours'))
        OR (ce.event_start_time BETWEEN NEW.event_start_time AND COALESCE(NEW.event_end_time, NEW.event_start_time + interval '8 hours'))
      );
    
    IF v_conflict_count > 0 THEN
      -- Create conflict record
      INSERT INTO public.scheduling_conflicts (
        workspace_id,
        conflict_type,
        job_id,
        calendar_event_id,
        crew_id,
        conflict_message,
        conflict_details,
        severity
      ) VALUES (
        NEW.workspace_id,
        'crew_overbooked',
        NEW.job_id,
        NEW.id,
        NEW.crew_id,
        'Crew ' || (SELECT name FROM public.crews WHERE id = NEW.crew_id) || ' is already booked at this time',
        jsonb_build_object(
          'conflicting_event_id', NEW.id,
          'conflicting_date', NEW.event_date,
          'conflicting_time', NEW.event_start_time
        ),
        'high'
      );
      
      -- Add warning to event
      NEW.conflict_warnings = array_append(COALESCE(NEW.conflict_warnings, '{}'), 'Crew overbooked');
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_detect_crew_overbooking
BEFORE INSERT OR UPDATE ON public.calendar_events
FOR EACH ROW
WHEN (NEW.crew_id IS NOT NULL)
EXECUTE FUNCTION detect_crew_overbooking();

-- Function to detect payment missing before scheduling
CREATE OR REPLACE FUNCTION detect_payment_conflicts()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_deposit_paid numeric;
  v_deposit_required numeric;
BEGIN
  -- Check if job requires deposit and it's not paid
  IF NEW.job_id IS NOT NULL THEN
    SELECT deposit_paid, deposit_required INTO v_deposit_paid, v_deposit_required
    FROM public.roofing_jobs
    WHERE id = NEW.job_id;
    
    IF v_deposit_required > 0 AND COALESCE(v_deposit_paid, 0) < v_deposit_required THEN
      INSERT INTO public.scheduling_conflicts (
        workspace_id,
        conflict_type,
        job_id,
        calendar_event_id,
        conflict_message,
        conflict_details,
        severity
      ) VALUES (
        NEW.workspace_id,
        'payment_missing',
        NEW.job_id,
        NEW.id,
        'Deposit not collected — cannot schedule',
        jsonb_build_object(
          'deposit_required', v_deposit_required,
          'deposit_paid', COALESCE(v_deposit_paid, 0)
        ),
        'critical'
      );
      
      NEW.conflict_warnings = array_append(COALESCE(NEW.conflict_warnings, '{}'), 'Payment missing');
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_detect_payment_conflicts
BEFORE INSERT OR UPDATE ON public.calendar_events
FOR EACH ROW
WHEN (NEW.job_id IS NOT NULL)
EXECUTE FUNCTION detect_payment_conflicts();

-- Function to check weather risk
CREATE OR REPLACE FUNCTION check_weather_risk()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_weather_risk numeric;
  v_job_address text;
BEGIN
  -- Get job address if available
  IF NEW.job_id IS NOT NULL THEN
    SELECT property_address INTO v_job_address
    FROM public.roofing_jobs rj
    LEFT JOIN public.leads l ON rj.lead_id = l.id
    WHERE rj.id = NEW.job_id
    LIMIT 1;
  END IF;
  
  -- Check weather data for this date/location
  IF NEW.event_date IS NOT NULL THEN
    SELECT weather_risk_score INTO v_weather_risk
    FROM public.weather_schedule_data
    WHERE forecast_date = NEW.event_date
      AND (location_address = v_job_address OR location_city IS NOT NULL)
    ORDER BY created_at DESC
    LIMIT 1;
    
    IF v_weather_risk IS NOT NULL AND v_weather_risk > 0.5 THEN
      NEW.weather_risk_score = v_weather_risk;
      NEW.conflict_warnings = array_append(COALESCE(NEW.conflict_warnings, '{}'), 'High wind/rain risk');
      
      -- Create conflict if risk is high
      IF v_weather_risk > 0.7 THEN
        INSERT INTO public.scheduling_conflicts (
          workspace_id,
          conflict_type,
          job_id,
          calendar_event_id,
          conflict_message,
          conflict_details,
          severity
        ) VALUES (
          NEW.workspace_id,
          'weather_risk',
          NEW.job_id,
          NEW.id,
          'High wind/rain risk — avoid this date',
          jsonb_build_object(
            'weather_risk_score', v_weather_risk,
            'event_date', NEW.event_date
          ),
          'high'
        );
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_weather_risk
BEFORE INSERT OR UPDATE ON public.calendar_events
FOR EACH ROW
WHEN (NEW.event_date IS NOT NULL)
EXECUTE FUNCTION check_weather_risk();

-- ============================================================================
-- PART 9 — SCHEDULING AUTOMATION FUNCTIONS
-- ============================================================================

-- Function to trigger day-before confirmation automation
CREATE OR REPLACE FUNCTION trigger_day_before_confirmation()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_event record;
  v_automation record;
BEGIN
  -- Find events scheduled for tomorrow
  FOR v_event IN
    SELECT ce.*, rj.lead_id, l.first_name, l.email, l.phone
    FROM public.calendar_events ce
    LEFT JOIN public.roofing_jobs rj ON ce.job_id = rj.id
    LEFT JOIN public.leads l ON rj.lead_id = l.id
    WHERE ce.event_date = CURRENT_DATE + INTERVAL '1 day'
      AND ce.status = 'scheduled'
      AND ce.event_type IN ('INSTALL_DATE', 'INSPECTION')
  LOOP
    -- Find matching automation
    SELECT * INTO v_automation
    FROM public.scheduling_automations
    WHERE workspace_id = v_event.workspace_id
      AND automation_type = 'day_before_confirmation'
      AND is_active = true
      AND trigger_days_before = 1
    LIMIT 1;
    
    IF FOUND THEN
      -- Log automation trigger
      INSERT INTO public.scheduling_automation_logs (
        workspace_id,
        automation_id,
        job_id,
        calendar_event_id,
        execution_status
      ) VALUES (
        v_event.workspace_id,
        v_automation.id,
        v_event.job_id,
        v_event.id,
        'pending'
      );
      
      -- TODO: Actually send message via messaging hub
      -- This would integrate with unified_messages table
    END IF;
  END LOOP;
END;
$$;

-- Function to update crew calendar view
CREATE OR REPLACE FUNCTION update_crew_calendar_view(
  p_crew_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_workspace_id uuid;
  v_total_jobs integer;
  v_total_hours numeric;
  v_jobs_by_type jsonb;
BEGIN
  -- Get workspace_id from crew
  SELECT workspace_id INTO v_workspace_id
  FROM public.crews
  WHERE id = p_crew_id;
  
  -- Count jobs in date range
  SELECT COUNT(*), SUM(COALESCE(ce.duration_minutes, 480) / 60.0)
  INTO v_total_jobs, v_total_hours
  FROM public.calendar_events ce
  WHERE ce.crew_id = p_crew_id
    AND ce.event_date BETWEEN p_start_date AND p_end_date
    AND ce.status IN ('scheduled', 'confirmed');
  
  -- Aggregate by type
  SELECT jsonb_object_agg(ce.event_type, COUNT(*))
  INTO v_jobs_by_type
  FROM public.calendar_events ce
  WHERE ce.crew_id = p_crew_id
    AND ce.event_date BETWEEN p_start_date AND p_end_date
    AND ce.status IN ('scheduled', 'confirmed')
  GROUP BY ce.event_type;
  
  -- Upsert calendar view
  INSERT INTO public.crew_calendar_views (
    workspace_id,
    crew_id,
    view_start_date,
    view_end_date,
    total_jobs,
    total_hours,
    jobs_by_type,
    computed_at
  ) VALUES (
    v_workspace_id,
    p_crew_id,
    p_start_date,
    p_end_date,
    v_total_jobs,
    v_total_hours,
    COALESCE(v_jobs_by_type, '{}'::jsonb),
    now()
  )
  ON CONFLICT ON CONSTRAINT idx_crew_calendar_views_unique DO UPDATE
  SET
    total_jobs = EXCLUDED.total_jobs,
    total_hours = EXCLUDED.total_hours,
    jobs_by_type = EXCLUDED.jobs_by_type,
    computed_at = now();
END;
$$;

-- ============================================================================
-- PART 10 — TRIGGERS FOR AUTOMATIC UPDATES
-- ============================================================================

-- Trigger to update crew calendar view when events change
CREATE OR REPLACE FUNCTION trg_update_crew_calendar_on_event()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.crew_id IS NOT NULL AND NEW.event_date IS NOT NULL THEN
    -- Update calendar view for the week containing this event
    PERFORM update_crew_calendar_view(
      NEW.crew_id,
      DATE_TRUNC('week', NEW.event_date)::date,
      (DATE_TRUNC('week', NEW.event_date) + INTERVAL '6 days')::date
    );
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_crew_calendar_on_event
AFTER INSERT OR UPDATE OR DELETE ON public.calendar_events
FOR EACH ROW
WHEN (NEW.crew_id IS NOT NULL OR OLD.crew_id IS NOT NULL)
EXECUTE FUNCTION trg_update_crew_calendar_on_event();

-- Trigger to create timeline event when job is scheduled
CREATE OR REPLACE FUNCTION trg_create_scheduling_timeline_event()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_lead_id uuid;
BEGIN
  IF NEW.job_id IS NOT NULL AND NEW.event_type = 'INSTALL_DATE' THEN
    -- Get lead_id from job
    SELECT lead_id INTO v_lead_id
    FROM public.roofing_jobs
    WHERE id = NEW.job_id;
    
    -- Create timeline event
    INSERT INTO public.job_timelines (
      workspace_id,
      lead_id,
      job_id,
      event_type,
      event_subtype,
      message,
      metadata,
      created_at
    ) VALUES (
      NEW.workspace_id,
      v_lead_id,
      NEW.job_id,
      'job_scheduled',
      'install_date_set',
      'Install scheduled for ' || NEW.event_date::text || COALESCE(' at ' || NEW.event_start_time::text, ''),
      jsonb_build_object(
        'calendar_event_id', NEW.id,
        'scheduled_date', NEW.event_date,
        'scheduled_time', NEW.event_start_time,
        'crew_id', NEW.crew_id
      ),
      NEW.created_at
    );
    
    -- Update job status
    UPDATE public.roofing_jobs
    SET status = 'scheduled',
        scheduled_start_date = NEW.event_date,
        updated_at = now()
    WHERE id = NEW.job_id;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_create_scheduling_timeline_event
AFTER INSERT ON public.calendar_events
FOR EACH ROW
WHEN (NEW.job_id IS NOT NULL)
EXECUTE FUNCTION trg_create_scheduling_timeline_event();

-- ============================================================================
-- PART 11 — VIEWS FOR SCHEDULING DASHBOARD
-- ============================================================================

-- View for company calendar with all event details
CREATE OR REPLACE VIEW v_company_calendar AS
SELECT
  ce.id,
  ce.workspace_id,
  ce.job_id,
  ce.lead_id,
  ce.contact_id,
  ce.crew_id,
  ce.event_type,
  ce.title,
  ce.description,
  ce.event_date,
  ce.event_start_time,
  ce.event_end_time,
  ce.status,
  ce.weather_risk_score,
  ce.conflict_warnings,
  rj.job_value,
  rj.status as job_status,
  c.name as crew_name,
  l.first_name || ' ' || l.last_name as homeowner_name,
  l.email as homeowner_email,
  l.phone as homeowner_phone
FROM public.calendar_events ce
LEFT JOIN public.roofing_jobs rj ON ce.job_id = rj.id
LEFT JOIN public.crews c ON ce.crew_id = c.id
LEFT JOIN public.leads l ON ce.lead_id = l.id OR rj.lead_id = l.id;

-- View for crew calendar
CREATE OR REPLACE VIEW v_crew_calendar AS
SELECT
  ce.id,
  ce.workspace_id,
  ce.crew_id,
  c.name as crew_name,
  ce.event_date,
  ce.event_start_time,
  ce.event_end_time,
  ce.event_type,
  ce.title,
  ce.job_id,
  rj.job_value,
  rj.status as job_status,
  l.first_name || ' ' || l.last_name as homeowner_name
FROM public.calendar_events ce
JOIN public.crews c ON ce.crew_id = c.id
LEFT JOIN public.roofing_jobs rj ON ce.job_id = rj.id
LEFT JOIN public.leads l ON ce.lead_id = l.id OR rj.lead_id = l.id
WHERE ce.status IN ('scheduled', 'confirmed');

-- ============================================================================
-- PART 12 — ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.crew_calendar_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weather_schedule_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduling_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduling_automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduling_automation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homeowner_scheduling_preferences ENABLE ROW LEVEL SECURITY;

-- Crew calendar views
CREATE POLICY "workspace_members_can_view_crew_calendars"
  ON public.crew_calendar_views FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = crew_calendar_views.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Weather schedule data
CREATE POLICY "workspace_members_can_view_weather_data"
  ON public.weather_schedule_data FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = weather_schedule_data.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "workspace_members_can_manage_weather_data"
  ON public.weather_schedule_data FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = weather_schedule_data.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Scheduling conflicts
CREATE POLICY "workspace_members_can_view_conflicts"
  ON public.scheduling_conflicts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = scheduling_conflicts.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "workspace_members_can_resolve_conflicts"
  ON public.scheduling_conflicts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = scheduling_conflicts.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Scheduling automations
CREATE POLICY "workspace_members_can_manage_automations"
  ON public.scheduling_automations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = scheduling_automations.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Automation logs
CREATE POLICY "workspace_members_can_view_automation_logs"
  ON public.scheduling_automation_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = scheduling_automation_logs.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Homeowner scheduling preferences
CREATE POLICY "workspace_members_can_manage_scheduling_prefs"
  ON public.homeowner_scheduling_preferences FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = homeowner_scheduling_preferences.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 13 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.crew_calendar_views IS 'Block 24980: Per-crew calendar view showing all jobs assigned to a crew';
COMMENT ON TABLE public.weather_schedule_data IS 'Block 24980: Weather data and risk assessment for scheduling decisions';
COMMENT ON TABLE public.scheduling_conflicts IS 'Block 24980: Track detected conflicts and resolutions';
COMMENT ON TABLE public.scheduling_automations IS 'Block 24980: Automated actions triggered by scheduling events';
COMMENT ON TABLE public.scheduling_automation_logs IS 'Block 24980: Track when automations fire and their results';
COMMENT ON TABLE public.homeowner_scheduling_preferences IS 'Block 24980: Store homeowner-selected dates and preferences';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================

