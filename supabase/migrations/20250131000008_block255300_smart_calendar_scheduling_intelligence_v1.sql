-- =========================================================
-- Block 255300 — SmartSend Calendar & Scheduling Intelligence v1
-- Multi-Crew Calendar, Weather-Aware Scheduling, Auto-Rescheduling, 
-- Capacity Forecasting, Conflict Prevention
-- =========================================================
-- 
-- This block turns SmartSend into a scheduling supercomputer — the brain that 
-- automatically plans, adjusts, and protects your roofing schedule.
--
-- Features:
-- - Multi-Crew Smart Calendar
-- - Weather-Aware Scheduling
-- - Automatic Job Rescheduling
-- - Crew Capacity Forecasting
-- - Conflict Detection & Prevention
-- - Material Arrival Scheduling
-- - Inspection Scheduling Integration
-- - Customer Communication Automation

-- ============================================================================
-- PART 1 — ENHANCE calendar_events TABLE
-- ============================================================================
-- Add scheduling intelligence fields to existing calendar_events table

DO $$
BEGIN
  -- Add crew_id if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'calendar_events' 
    AND column_name = 'crew_id'
  ) THEN
    ALTER TABLE public.calendar_events ADD COLUMN crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL;
  END IF;

  -- Add status field with proper enum if it doesn't exist or needs update
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'calendar_events' 
    AND column_name = 'event_status'
  ) THEN
    ALTER TABLE public.calendar_events ADD COLUMN event_status text DEFAULT 'scheduled' 
      CHECK (event_status IN ('scheduled', 'delayed', 'completed', 'canceled', 'rescheduled'));
  END IF;

  -- Add weather_risk_score if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'calendar_events' 
    AND column_name = 'weather_risk_score'
  ) THEN
    ALTER TABLE public.calendar_events ADD COLUMN weather_risk_score numeric DEFAULT 0.0 
      CHECK (weather_risk_score >= 0.0 AND weather_risk_score <= 1.0);
  END IF;

  -- Add material_delivery_id if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'calendar_events' 
    AND column_name = 'material_delivery_id'
  ) THEN
    ALTER TABLE public.calendar_events ADD COLUMN material_delivery_id uuid;
    -- Add foreign key if material_deliveries table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'material_deliveries') THEN
      ALTER TABLE public.calendar_events 
        ADD CONSTRAINT fk_calendar_events_material_delivery 
        FOREIGN KEY (material_delivery_id) REFERENCES public.material_deliveries(id) ON DELETE SET NULL;
    END IF;
  END IF;

  -- Add inspection_id if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'calendar_events' 
    AND column_name = 'inspection_id'
  ) THEN
    ALTER TABLE public.calendar_events ADD COLUMN inspection_id uuid;
  END IF;

  -- Add completion_prediction if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'calendar_events' 
    AND column_name = 'completion_prediction'
  ) THEN
    ALTER TABLE public.calendar_events ADD COLUMN completion_prediction timestamptz;
  END IF;

  -- Add auto_rescheduled_from if it doesn't exist (tracks original event if auto-rescheduled)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'calendar_events' 
    AND column_name = 'auto_rescheduled_from'
  ) THEN
    ALTER TABLE public.calendar_events ADD COLUMN auto_rescheduled_from uuid 
      REFERENCES public.calendar_events(id) ON DELETE SET NULL;
  END IF;

  -- Add reschedule_reason if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'calendar_events' 
    AND column_name = 'reschedule_reason'
  ) THEN
    ALTER TABLE public.calendar_events ADD COLUMN reschedule_reason text;
  END IF;

  -- Add customer_notified if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'calendar_events' 
    AND column_name = 'customer_notified'
  ) THEN
    ALTER TABLE public.calendar_events ADD COLUMN customer_notified boolean DEFAULT false;
  END IF;

  -- Add customer_notified_at if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'calendar_events' 
    AND column_name = 'customer_notified_at'
  ) THEN
    ALTER TABLE public.calendar_events ADD COLUMN customer_notified_at timestamptz;
  END IF;
END $$;

-- Update event_type check constraint to include new types if needed
DO $$
BEGIN
  -- Check if constraint exists and update it
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'calendar_events_event_type_check'
  ) THEN
    -- Drop old constraint
    ALTER TABLE public.calendar_events DROP CONSTRAINT IF EXISTS calendar_events_event_type_check;
    -- Add new constraint with all event types
    ALTER TABLE public.calendar_events ADD CONSTRAINT calendar_events_event_type_check 
      CHECK (event_type IN (
        'inspection', 'quote', 'material_delivery', 'install', 'repair', 
        'crew_schedule', 'owner_reminder', 'follow_up_task', 'delivery', 
        'inspection_event', 'other'
      ));
  END IF;
END $$;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_calendar_events_crew ON public.calendar_events(crew_id) WHERE crew_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calendar_events_status ON public.calendar_events(event_status);
CREATE INDEX IF NOT EXISTS idx_calendar_events_weather_risk ON public.calendar_events(weather_risk_score) WHERE weather_risk_score > 0.5;
CREATE INDEX IF NOT EXISTS idx_calendar_events_material_delivery ON public.calendar_events(material_delivery_id) WHERE material_delivery_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calendar_events_job_crew_time ON public.calendar_events(job_id, crew_id, start_time);

-- ============================================================================
-- PART 2 — CREATE schedule_conflicts TABLE
-- ============================================================================
-- Tracks conflicts detected in the schedule

CREATE TABLE IF NOT EXISTS public.schedule_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  conflicting_event_id uuid REFERENCES public.calendar_events(id) ON DELETE SET NULL,
  
  conflict_type text NOT NULL CHECK (conflict_type IN (
    'crew_double_book',
    'weather_block',
    'material_delay',
    'overlapping_jobs',
    'crew_distance',
    'inspection_overlap',
    'capacity_overload',
    'other'
  )),
  
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  
  description text,
  resolution_suggestion text,
  
  resolved boolean DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schedule_conflicts_workspace ON public.schedule_conflicts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_schedule_conflicts_event ON public.schedule_conflicts(event_id);
CREATE INDEX IF NOT EXISTS idx_schedule_conflicts_type ON public.schedule_conflicts(conflict_type);
CREATE INDEX IF NOT EXISTS idx_schedule_conflicts_severity ON public.schedule_conflicts(severity);
CREATE INDEX IF NOT EXISTS idx_schedule_conflicts_resolved ON public.schedule_conflicts(resolved) WHERE resolved = false;
CREATE INDEX IF NOT EXISTS idx_schedule_conflicts_created ON public.schedule_conflicts(created_at DESC);

-- ============================================================================
-- PART 3 — CREATE capacity_forecasts TABLE
-- ============================================================================
-- Forecasts crew capacity and workload

CREATE TABLE IF NOT EXISTS public.capacity_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  forecast_date date NOT NULL,
  
  crew_available int DEFAULT 0,
  crew_needed int DEFAULT 0,
  crew_utilized int DEFAULT 0,
  
  workload_status text NOT NULL DEFAULT 'balanced' CHECK (workload_status IN (
    'under_capacity',
    'balanced',
    'overloaded',
    'critical_overload'
  )),
  
  available_capacity_hours numeric DEFAULT 0,
  scheduled_hours numeric DEFAULT 0,
  utilization_percentage numeric GENERATED ALWAYS AS (
    CASE 
      WHEN available_capacity_hours > 0 
      THEN (scheduled_hours / available_capacity_hours * 100)
      ELSE 0
    END
  ) STORED,
  
  forecast_metadata jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(workspace_id, forecast_date)
);

CREATE INDEX IF NOT EXISTS idx_capacity_forecasts_workspace_date ON public.capacity_forecasts(workspace_id, forecast_date);
CREATE INDEX IF NOT EXISTS idx_capacity_forecasts_status ON public.capacity_forecasts(workload_status);
CREATE INDEX IF NOT EXISTS idx_capacity_forecasts_date ON public.capacity_forecasts(forecast_date DESC);

-- ============================================================================
-- PART 4 — CREATE FUNCTIONS
-- ============================================================================

-- Function to detect schedule conflicts
CREATE OR REPLACE FUNCTION public.detect_schedule_conflicts(
  p_workspace_id uuid,
  p_start_date date DEFAULT CURRENT_DATE,
  p_end_date date DEFAULT CURRENT_DATE + INTERVAL '14 days'
)
RETURNS TABLE (
  conflict_id uuid,
  event_id uuid,
  conflict_type text,
  severity text,
  description text
)
LANGUAGE plpgsql
AS $$
BEGIN
  -- Detect crew double-booking conflicts
  RETURN QUERY
  WITH crew_double_books AS (
    SELECT 
      ce1.id as event_id,
      ce2.id as conflicting_event_id,
      'crew_double_book'::text as conflict_type,
      CASE 
        WHEN (ce1.end_time IS NOT NULL AND ce2.end_time IS NOT NULL AND
              ce1.start_time < ce2.end_time AND ce2.start_time < ce1.end_time)
        THEN 'critical'::text
        ELSE 'high'::text
      END as severity,
      format('Crew %s double-booked: %s overlaps with %s', 
        c.name, ce1.title, ce2.title) as description
    FROM public.calendar_events ce1
    JOIN public.calendar_events ce2 ON ce1.crew_id = ce2.crew_id AND ce1.id != ce2.id
    JOIN public.crews c ON ce1.crew_id = c.id
    WHERE ce1.workspace_id = p_workspace_id
      AND ce1.crew_id IS NOT NULL
      AND ce2.crew_id IS NOT NULL
      AND ce1.event_status IN ('scheduled', 'rescheduled')
      AND ce2.event_status IN ('scheduled', 'rescheduled')
      AND ce1.start_time::date >= p_start_date
      AND ce1.start_time::date <= p_end_date
      AND ce2.start_time::date >= p_start_date
      AND ce2.start_time::date <= p_end_date
      AND (
        (ce1.end_time IS NULL AND ce2.end_time IS NULL AND ce1.start_time::date = ce2.start_time::date)
        OR (ce1.end_time IS NOT NULL AND ce2.end_time IS NOT NULL AND
            ce1.start_time < ce2.end_time AND ce2.start_time < ce1.end_time)
      )
  )
  SELECT 
    gen_random_uuid(),
    cdb.event_id,
    cdb.conflict_type,
    cdb.severity,
    cdb.description
  FROM crew_double_books cdb;
END;
$$;

-- Function to calculate capacity forecast
CREATE OR REPLACE FUNCTION public.calculate_capacity_forecast(
  p_workspace_id uuid,
  p_start_date date DEFAULT CURRENT_DATE,
  p_end_date date DEFAULT CURRENT_DATE + INTERVAL '14 days'
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_date date;
  v_crew_count int;
  v_scheduled_hours numeric;
  v_available_hours numeric;
  v_status text;
BEGIN
  -- Get active crew count
  SELECT COUNT(*) INTO v_crew_count
  FROM public.crews
  WHERE workspace_id = p_workspace_id
    AND is_active = true;

  -- Loop through each date in range
  v_date := p_start_date;
  WHILE v_date <= p_end_date LOOP
    -- Calculate scheduled hours for this date
    SELECT COALESCE(SUM(
      EXTRACT(EPOCH FROM (COALESCE(end_time, start_time + INTERVAL '8 hours') - start_time)) / 3600
    ), 0) INTO v_scheduled_hours
    FROM public.calendar_events
    WHERE workspace_id = p_workspace_id
      AND event_status IN ('scheduled', 'rescheduled')
      AND start_time::date = v_date
      AND event_type IN ('install', 'repair');

    -- Calculate available hours (assume 8 hours per crew per day)
    v_available_hours := v_crew_count * 8.0;

    -- Determine workload status
    IF v_scheduled_hours = 0 THEN
      v_status := 'under_capacity';
    ELSIF v_scheduled_hours <= v_available_hours * 0.7 THEN
      v_status := 'under_capacity';
    ELSIF v_scheduled_hours <= v_available_hours * 0.9 THEN
      v_status := 'balanced';
    ELSIF v_scheduled_hours <= v_available_hours THEN
      v_status := 'overloaded';
    ELSE
      v_status := 'critical_overload';
    END IF;

    -- Upsert capacity forecast
    INSERT INTO public.capacity_forecasts (
      workspace_id,
      forecast_date,
      crew_available,
      crew_needed,
      crew_utilized,
      workload_status,
      available_capacity_hours,
      scheduled_hours
    ) VALUES (
      p_workspace_id,
      v_date,
      v_crew_count,
      CEIL(v_scheduled_hours / 8.0)::int,
      CEIL(v_scheduled_hours / 8.0)::int,
      v_status,
      v_available_hours,
      v_scheduled_hours
    )
    ON CONFLICT (workspace_id, forecast_date)
    DO UPDATE SET
      crew_available = EXCLUDED.crew_available,
      crew_needed = EXCLUDED.crew_needed,
      crew_utilized = EXCLUDED.crew_utilized,
      workload_status = EXCLUDED.workload_status,
      available_capacity_hours = EXCLUDED.available_capacity_hours,
      scheduled_hours = EXCLUDED.scheduled_hours,
      updated_at = now();

    v_date := v_date + INTERVAL '1 day';
  END LOOP;
END;
$$;

-- Function to find next available slot for rescheduling
CREATE OR REPLACE FUNCTION public.find_next_available_slot(
  p_workspace_id uuid,
  p_crew_id uuid,
  p_duration_hours numeric DEFAULT 8,
  p_start_from date DEFAULT CURRENT_DATE
)
RETURNS timestamptz
LANGUAGE plpgsql
AS $$
DECLARE
  v_check_date date;
  v_check_time timestamptz;
  v_end_time timestamptz;
  v_has_conflict boolean;
  v_max_days int := 30; -- Look ahead max 30 days
  v_days_checked int := 0;
BEGIN
  v_check_date := p_start_from;
  
  WHILE v_days_checked < v_max_days LOOP
    -- Check each hour of the day (8 AM to 5 PM)
    FOR hour_offset IN 8..17 LOOP
      v_check_time := (v_check_date + make_interval(hours => hour_offset))::timestamptz;
      v_end_time := v_check_time + make_interval(hours => p_duration_hours);
      
      -- Check for conflicts
      SELECT EXISTS(
        SELECT 1
        FROM public.calendar_events
        WHERE workspace_id = p_workspace_id
          AND crew_id = p_crew_id
          AND event_status IN ('scheduled', 'rescheduled')
          AND (
            (start_time < v_end_time AND COALESCE(end_time, start_time + INTERVAL '8 hours') > v_check_time)
          )
      ) INTO v_has_conflict;
      
      IF NOT v_has_conflict THEN
        RETURN v_check_time;
      END IF;
    END LOOP;
    
    v_check_date := v_check_date + INTERVAL '1 day';
    v_days_checked := v_days_checked + 1;
  END LOOP;
  
  -- No slot found
  RETURN NULL;
END;
$$;

-- ============================================================================
-- PART 5 — CREATE TRIGGERS
-- ============================================================================

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.set_schedule_conflicts_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_schedule_conflicts_updated_at ON public.schedule_conflicts;
CREATE TRIGGER trg_schedule_conflicts_updated_at
  BEFORE UPDATE ON public.schedule_conflicts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_schedule_conflicts_updated_at();

CREATE OR REPLACE FUNCTION public.set_capacity_forecasts_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_capacity_forecasts_updated_at ON public.capacity_forecasts;
CREATE TRIGGER trg_capacity_forecasts_updated_at
  BEFORE UPDATE ON public.capacity_forecasts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_capacity_forecasts_updated_at();

-- ============================================================================
-- PART 6 — ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.schedule_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capacity_forecasts ENABLE ROW LEVEL SECURITY;

-- Schedule conflicts RLS
CREATE POLICY "Users can view conflicts in their workspace"
  ON public.schedule_conflicts FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage conflicts in their workspace"
  ON public.schedule_conflicts FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Capacity forecasts RLS
CREATE POLICY "Users can view capacity forecasts in their workspace"
  ON public.capacity_forecasts FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage capacity forecasts in their workspace"
  ON public.capacity_forecasts FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 7 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_conflicts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.capacity_forecasts TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_schedule_conflicts TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_capacity_forecast TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_next_available_slot TO authenticated;

-- ============================================================================
-- PART 8 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.schedule_conflicts IS 'Tracks conflicts detected in the schedule (crew double-booking, weather blocks, material delays, etc.)';
COMMENT ON TABLE public.capacity_forecasts IS 'Forecasts crew capacity and workload status for future dates';
COMMENT ON FUNCTION public.detect_schedule_conflicts IS 'Detects schedule conflicts for a workspace within a date range';
COMMENT ON FUNCTION public.calculate_capacity_forecast IS 'Calculates and stores capacity forecasts for a date range';
COMMENT ON FUNCTION public.find_next_available_slot IS 'Finds the next available time slot for a crew to reschedule an event';





















