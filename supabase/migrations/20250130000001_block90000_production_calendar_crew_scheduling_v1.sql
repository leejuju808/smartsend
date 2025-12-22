-- Block 90000 — SmartSend Roofing "Production Calendar + Crew Scheduling Board" v1
-- THE BRAIN OF ROOFING PRODUCTION
--
-- This block transforms SmartSend into the single source of truth for roofing operations.
-- Every job, crew, delivery, inspection, and weather event lives in one clean calendar.
--
-- Features:
-- - Full Calendar View (Day, Week, Month)
-- - Drag-and-Drop Scheduling
-- - Automatic Weather Blocking
-- - Conflict Prevention Engine
-- - Crew Load Balancing
-- - Homeowner Auto-Notification
-- - Delivery Alignment

-- ============================================================================
-- PART 1 — ENHANCE calendar_events TABLE FOR PRODUCTION CALENDAR
-- ============================================================================
-- Add fields needed for production scheduling if they don't exist

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
    CREATE INDEX IF NOT EXISTS idx_calendar_events_crew ON public.calendar_events(crew_id) WHERE crew_id IS NOT NULL;
  END IF;

  -- Add start_time and end_time if they don't exist (using timestamp fields)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'calendar_events' 
    AND column_name = 'start_time'
  ) THEN
    ALTER TABLE public.calendar_events ADD COLUMN start_time timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'calendar_events' 
    AND column_name = 'end_time'
  ) THEN
    ALTER TABLE public.calendar_events ADD COLUMN end_time timestamptz;
  END IF;

  -- Add material_delivery_id if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'calendar_events' 
    AND column_name = 'material_delivery_id'
  ) THEN
    ALTER TABLE public.calendar_events ADD COLUMN material_delivery_id uuid;
    CREATE INDEX IF NOT EXISTS idx_calendar_events_delivery ON public.calendar_events(material_delivery_id) WHERE material_delivery_id IS NOT NULL;
  END IF;

  -- Extend event_type to include delivery, repair, meeting, weather_delay
  ALTER TABLE public.calendar_events 
    DROP CONSTRAINT IF EXISTS calendar_events_event_type_check;
  
  ALTER TABLE public.calendar_events
    ADD CONSTRAINT calendar_events_event_type_check CHECK (event_type IN (
      'inspection',
      'install',
      'repair',
      'delivery',
      'meeting',
      'weather_delay',
      'ADJUSTER_APPT',
      'INSTALL_DATE',
      'FOLLOW_UP',
      'INSPECTION',
      'TASK'
    ));
END $$;

-- ============================================================================
-- PART 2 — ENSURE weather_blocks TABLE EXISTS
-- ============================================================================
-- This table tracks weather blocks per job/day for production scheduling

CREATE TABLE IF NOT EXISTS public.weather_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid,
  date date NOT NULL,
  weather_status text NOT NULL CHECK (weather_status IN ('clear', 'rain', 'storm', 'high_wind', 'snow', 'hail')),
  severity numeric DEFAULT 0 CHECK (severity >= 0 AND severity <= 100),
  forecast_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_weather_blocks_workspace ON public.weather_blocks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_weather_blocks_job ON public.weather_blocks(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_weather_blocks_date ON public.weather_blocks(date);
CREATE INDEX IF NOT EXISTS idx_weather_blocks_severity ON public.weather_blocks(severity DESC) WHERE severity > 50;

-- Add foreign key to roofing_jobs if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'weather_blocks_job_id_fkey'
    ) THEN
      ALTER TABLE public.weather_blocks
        ADD CONSTRAINT weather_blocks_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- ============================================================================
-- PART 3 — ENSURE crew_availability TABLE EXISTS (enhance if needed)
-- ============================================================================
-- Track crew availability per date for scheduling

CREATE TABLE IF NOT EXISTS public.crew_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  crew_id uuid NOT NULL REFERENCES public.crews(id) ON DELETE CASCADE,
  date date NOT NULL,
  is_available boolean DEFAULT true,
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(crew_id, date)
);

CREATE INDEX IF NOT EXISTS idx_crew_availability_workspace ON public.crew_availability(workspace_id);
CREATE INDEX IF NOT EXISTS idx_crew_availability_crew ON public.crew_availability(crew_id);
CREATE INDEX IF NOT EXISTS idx_crew_availability_date ON public.crew_availability(date);
CREATE INDEX IF NOT EXISTS idx_crew_availability_available ON public.crew_availability(crew_id, date) WHERE is_available = true;

-- ============================================================================
-- PART 4 — CREATE VIEW FOR PRODUCTION CALENDAR
-- ============================================================================
-- Unified view showing all calendar events with job, crew, and delivery info

CREATE OR REPLACE VIEW public.v_production_calendar AS
SELECT 
  ce.id,
  ce.workspace_id,
  ce.job_id,
  ce.crew_id,
  ce.event_type,
  ce.title,
  ce.description,
  ce.start_time,
  ce.end_time,
  ce.status,
  ce.created_at,
  -- Job info
  rj.title as job_title,
  rj.address as job_address,
  rj.job_value,
  rj.official_squares,
  -- Crew info
  c.name as crew_name,
  c.foreman_name,
  -- Material delivery info
  mo.delivery_date as material_delivery_date,
  mo.status as material_order_status,
  -- Weather info
  wb.weather_status,
  wb.severity as weather_severity
FROM public.calendar_events ce
LEFT JOIN public.roofing_jobs rj ON ce.job_id = rj.id
LEFT JOIN public.crews c ON ce.crew_id = c.id
LEFT JOIN public.material_orders mo ON ce.material_delivery_id = mo.id
LEFT JOIN public.weather_blocks wb ON ce.job_id = wb.job_id AND ce.start_time::date = wb.date
WHERE ce.workspace_id IS NOT NULL;

-- ============================================================================
-- PART 5 — FUNCTION: CHECK SCHEDULING CONFLICTS
-- ============================================================================
-- Prevents double-booking crews, scheduling without materials, etc.

CREATE OR REPLACE FUNCTION public.check_scheduling_conflicts(
  p_workspace_id uuid,
  p_crew_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_job_id uuid DEFAULT NULL,
  p_event_id uuid DEFAULT NULL
)
RETURNS TABLE (
  conflict_type text,
  severity text,
  message text,
  conflicting_event_id uuid
) AS $$
DECLARE
  v_conflict_count integer;
BEGIN
  -- Check for crew double-booking
  SELECT COUNT(*) INTO v_conflict_count
  FROM public.calendar_events
  WHERE workspace_id = p_workspace_id
    AND crew_id = p_crew_id
    AND status IN ('scheduled', 'in_progress')
    AND (id != COALESCE(p_event_id, '00000000-0000-0000-0000-000000000000'::uuid))
    AND (
      (start_time <= p_start_time AND end_time > p_start_time) OR
      (start_time < p_end_time AND end_time >= p_end_time) OR
      (start_time >= p_start_time AND end_time <= p_end_time)
    );

  IF v_conflict_count > 0 THEN
    RETURN QUERY SELECT 
      'crew_double_booked'::text,
      'critical'::text,
      'Crew is already scheduled for another job during this time'::text,
      ce.id
    FROM public.calendar_events ce
    WHERE ce.workspace_id = p_workspace_id
      AND ce.crew_id = p_crew_id
      AND ce.status IN ('scheduled', 'in_progress')
      AND (ce.id != COALESCE(p_event_id, '00000000-0000-0000-000000000000'::uuid))
      AND (
        (ce.start_time <= p_start_time AND ce.end_time > p_start_time) OR
        (ce.start_time < p_end_time AND ce.end_time >= p_end_time) OR
        (ce.start_time >= p_start_time AND ce.end_time <= p_end_time)
      )
    LIMIT 1;
  END IF;

  -- Check for material readiness (if job_id provided)
  IF p_job_id IS NOT NULL THEN
    -- Check if materials are ordered and confirmed
    IF NOT EXISTS (
      SELECT 1 FROM public.material_orders
      WHERE job_id = p_job_id
        AND status IN ('confirmed', 'scheduled_for_delivery', 'delivered')
    ) THEN
      RETURN QUERY SELECT 
        'material_not_ready'::text,
        'high'::text,
        'Materials have not been ordered or confirmed for this job'::text,
        NULL::uuid;
    END IF;

    -- Check if delivery date matches install date
    IF EXISTS (
      SELECT 1 FROM public.material_orders
      WHERE job_id = p_job_id
        AND delivery_date IS NOT NULL
        AND delivery_date::date != p_start_time::date
        AND delivery_date::date < p_start_time::date
    ) THEN
      RETURN QUERY SELECT 
        'delivery_mismatch'::text,
        'medium'::text,
        'Material delivery date does not match installation date'::text,
        NULL::uuid;
    END IF;
  END IF;

  -- Check for weather blocks
  IF EXISTS (
    SELECT 1 FROM public.weather_blocks
    WHERE job_id = COALESCE(p_job_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND date = p_start_time::date
      AND severity > 50
  ) THEN
    RETURN QUERY SELECT 
      'weather_risk'::text,
      'high'::text,
      'Weather conditions may delay this job'::text,
      NULL::uuid;
  END IF;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 6 — FUNCTION: GET CREW LOAD BALANCE
-- ============================================================================
-- Shows which crews are overloaded vs underused

CREATE OR REPLACE FUNCTION public.get_crew_load_balance(
  p_workspace_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  crew_id uuid,
  crew_name text,
  days_scheduled integer,
  jobs_count bigint,
  total_squares numeric,
  load_percentage numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id as crew_id,
    c.name as crew_name,
    COUNT(DISTINCT ce.start_time::date)::integer as days_scheduled,
    COUNT(DISTINCT ce.job_id) as jobs_count,
    COALESCE(SUM(rj.official_squares), 0) as total_squares,
    CASE 
      WHEN c.daily_capacity_squares > 0 THEN
        (COUNT(DISTINCT ce.start_time::date)::numeric / 
         (EXTRACT(EPOCH FROM (p_end_date - p_start_date)) / 86400 + 1)) * 100
      ELSE 0
    END as load_percentage
  FROM public.crews c
  LEFT JOIN public.calendar_events ce ON 
    ce.crew_id = c.id
    AND ce.workspace_id = p_workspace_id
    AND ce.status IN ('scheduled', 'in_progress')
    AND ce.start_time::date BETWEEN p_start_date AND p_end_date
  LEFT JOIN public.roofing_jobs rj ON ce.job_id = rj.id
  WHERE c.workspace_id = p_workspace_id
    AND c.is_active = true
  GROUP BY c.id, c.name, c.daily_capacity_squares
  ORDER BY load_percentage DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 7 — TRIGGER: AUTO-CREATE WEATHER BLOCKS
-- ============================================================================
-- When a calendar event is created, check weather and create blocks if needed

CREATE OR REPLACE FUNCTION public.auto_check_weather_for_event()
RETURNS TRIGGER AS $$
BEGIN
  -- This will be called by weather API integration
  -- For now, just ensure the structure is in place
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 8 — ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.weather_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_availability ENABLE ROW LEVEL SECURITY;

-- Weather blocks: Workspace members can access
DROP POLICY IF EXISTS "weather_blocks_workspace_member" ON public.weather_blocks;
CREATE POLICY "weather_blocks_workspace_member" ON public.weather_blocks
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = weather_blocks.workspace_id
      AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = weather_blocks.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- Crew availability: Workspace members can access
DROP POLICY IF EXISTS "crew_availability_workspace_member" ON public.crew_availability;
CREATE POLICY "crew_availability_workspace_member" ON public.crew_availability
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = crew_availability.workspace_id
      AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = crew_availability.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- Service role has full access
DROP POLICY IF EXISTS "weather_blocks_service_role" ON public.weather_blocks;
CREATE POLICY "weather_blocks_service_role" ON public.weather_blocks
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "crew_availability_service_role" ON public.crew_availability;
CREATE POLICY "crew_availability_service_role" ON public.crew_availability
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE public.weather_blocks IS 'Block 90000: Weather tracking per job/day for production scheduling';
COMMENT ON TABLE public.crew_availability IS 'Block 90000: Crew availability tracking for scheduling';
COMMENT ON VIEW public.v_production_calendar IS 'Block 90000: Unified production calendar view with job, crew, and delivery info';



























