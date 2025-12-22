-- =========================================================
-- Block 18400 — SmartSend Calendar Sync + AI Availability Logic v1
-- (Google Calendar Sync, Real Availability Detection, Crew-Level Scheduling,
--  Job-Length Awareness & Auto-Blocked Times)
-- =========================================================

-- ============================================================================
-- 1. CALENDAR_EVENTS TABLE
-- ============================================================================
-- Stores synced Google Calendar events for availability blocking

CREATE TABLE IF NOT EXISTS public.calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  calendar_connection_id uuid REFERENCES public.calendar_connections(id) ON DELETE CASCADE,
  
  -- External calendar event details
  external_event_id text NOT NULL, -- Google Calendar event.id or Outlook event.id
  provider text NOT NULL CHECK (provider IN ('google', 'outlook')),
  calendar_id text NOT NULL DEFAULT 'primary',
  
  -- Event details
  title text NOT NULL,
  description text,
  location text,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  all_day boolean DEFAULT false,
  
  -- Event status
  status text DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'tentative', 'cancelled', 'free', 'busy', 'out_of_office')),
  busy_type text DEFAULT 'busy' CHECK (busy_type IN ('free', 'busy', 'tentative', 'out_of_office')),
  
  -- Sync metadata
  last_synced_at timestamptz DEFAULT now(),
  sync_status text DEFAULT 'synced' CHECK (sync_status IN ('synced', 'pending', 'failed', 'deleted')),
  sync_error text,
  
  -- Auto-block settings
  auto_block_enabled boolean DEFAULT true, -- Automatically block this time slot
  block_type text DEFAULT 'busy' CHECK (block_type IN ('busy', 'travel', 'lunch', 'personal', 'meeting', 'out_of_office')),
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Unique constraint: one event per external ID per user
  UNIQUE(user_id, provider, external_event_id)
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_workspace 
  ON public.calendar_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_user 
  ON public.calendar_events(user_id, provider);
CREATE INDEX IF NOT EXISTS idx_calendar_events_time_range 
  ON public.calendar_events(workspace_id, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_calendar_events_sync_status 
  ON public.calendar_events(workspace_id, sync_status, last_synced_at);
CREATE INDEX IF NOT EXISTS idx_calendar_events_auto_block 
  ON public.calendar_events(workspace_id, auto_block_enabled, busy_type) 
  WHERE auto_block_enabled = true AND busy_type IN ('busy', 'out_of_office');
CREATE INDEX IF NOT EXISTS idx_calendar_events_external_id 
  ON public.calendar_events(provider, external_event_id);

-- ============================================================================
-- 2. CREW_AVAILABILITY TABLE
-- ============================================================================
-- Per-crew-member availability tracking for crew-level scheduling

CREATE TABLE IF NOT EXISTS public.crew_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Availability window
  date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  
  -- Availability status
  status text DEFAULT 'available' CHECK (status IN ('available', 'busy', 'unavailable', 'tentative')),
  reason text, -- Why unavailable (e.g., "doctor appointment", "lunch", "other job")
  
  -- Source of unavailability
  source_type text CHECK (source_type IN ('calendar_event', 'booking', 'manual_block', 'lunch', 'travel')),
  source_id uuid, -- Reference to calendar_events.id or schedule_bookings.id
  
  -- Crew member location for travel calculations
  base_address text,
  base_zip text,
  current_location_address text, -- Current location if on the road
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(workspace_id, user_id, date, start_time, end_time)
);

CREATE INDEX IF NOT EXISTS idx_crew_availability_workspace_user 
  ON public.crew_availability(workspace_id, user_id, date);
CREATE INDEX IF NOT EXISTS idx_crew_availability_time_range 
  ON public.crew_availability(workspace_id, user_id, date, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_crew_availability_status 
  ON public.crew_availability(workspace_id, user_id, status, date) 
  WHERE status IN ('busy', 'unavailable');

-- ============================================================================
-- 3. SCHEDULE_BLOCKS TABLE
-- ============================================================================
-- Auto-blocked times (travel, lunch, breaks, etc.)

CREATE TABLE IF NOT EXISTS public.schedule_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE, -- NULL = workspace-wide block
  
  -- Block time window
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  
  -- Block type
  block_type text NOT NULL CHECK (block_type IN (
    'calendar_event',
    'travel',
    'lunch',
    'break',
    'weather',
    'daylight',
    'crew_conflict',
    'manual',
    'out_of_office'
  )),
  
  -- Block reason/details
  reason text,
  title text, -- Display title for the block
  
  -- Source reference
  source_type text CHECK (source_type IN ('calendar_event', 'booking', 'weather_block', 'manual', 'auto')),
  source_id uuid, -- Reference to source record
  
  -- Auto-generated flag
  auto_generated boolean DEFAULT false,
  
  -- Block metadata
  metadata jsonb DEFAULT '{}'::jsonb, -- Additional data (travel time, weather conditions, etc.)
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schedule_blocks_workspace 
  ON public.schedule_blocks(workspace_id, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_schedule_blocks_user 
  ON public.schedule_blocks(workspace_id, user_id, start_time, end_time) 
  WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_schedule_blocks_type 
  ON public.schedule_blocks(workspace_id, block_type, start_time);
CREATE INDEX IF NOT EXISTS idx_schedule_blocks_auto_generated 
  ON public.schedule_blocks(workspace_id, auto_generated, start_time) 
  WHERE auto_generated = true;

-- ============================================================================
-- 4. ROUTE_ESTIMATES TABLE (Enhanced from travel_cache)
-- ============================================================================
-- Enhanced travel time estimates with traffic awareness

-- Note: travel_cache already exists from Block 16100, but we'll add route_estimates
-- for more detailed route tracking

CREATE TABLE IF NOT EXISTS public.route_estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Route details
  from_address text NOT NULL,
  to_address text NOT NULL,
  from_zip text,
  to_zip text,
  
  -- Travel estimates
  travel_time_minutes integer NOT NULL,
  distance_miles numeric(10, 2),
  distance_meters integer,
  
  -- Traffic conditions
  traffic_condition text CHECK (traffic_condition IN ('light', 'moderate', 'heavy', 'severe')),
  traffic_multiplier numeric(3, 2) DEFAULT 1.0, -- Multiplier for travel time based on traffic
  
  -- Route metadata
  route_polyline text, -- Encoded polyline for route visualization
  route_summary text, -- e.g., "I-95 N, then US-1 N"
  
  -- Time-based estimates (for different times of day)
  estimated_at_time timestamptz, -- When this estimate is valid for
  is_peak_hour boolean DEFAULT false,
  
  -- Cache metadata
  cached_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  
  -- Provider
  provider text DEFAULT 'google_maps' CHECK (provider IN ('google_maps', 'mapbox', 'manual')),
  
  UNIQUE(workspace_id, from_address, to_address, estimated_at_time)
);

CREATE INDEX IF NOT EXISTS idx_route_estimates_workspace 
  ON public.route_estimates(workspace_id);
CREATE INDEX IF NOT EXISTS idx_route_estimates_expires 
  ON public.route_estimates(expires_at) WHERE expires_at < now();
CREATE INDEX IF NOT EXISTS idx_route_estimates_addresses 
  ON public.route_estimates(workspace_id, from_address, to_address);

-- ============================================================================
-- 5. ENHANCE SCHEDULE_BOOKINGS TABLE
-- ============================================================================
-- Add crew assignment and calendar sync fields

ALTER TABLE public.schedule_bookings
  ADD COLUMN IF NOT EXISTS crew_member_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS calendar_event_synced boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS calendar_event_id text, -- External calendar event ID
  ADD COLUMN IF NOT EXISTS calendar_provider text CHECK (calendar_provider IN ('google', 'outlook')),
  ADD COLUMN IF NOT EXISTS lunch_block_applied boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS travel_block_applied boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_schedule_bookings_crew_member 
  ON public.schedule_bookings(workspace_id, crew_member_id, start_time) 
  WHERE crew_member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_schedule_bookings_calendar_sync 
  ON public.schedule_bookings(workspace_id, calendar_event_synced, calendar_provider);

-- ============================================================================
-- 6. ENHANCE SCHEDULER_SETTINGS TABLE
-- ============================================================================
-- Add calendar sync and AI availability settings

ALTER TABLE public.scheduler_settings
  ADD COLUMN IF NOT EXISTS calendar_sync_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS calendar_sync_interval_seconds integer DEFAULT 60 CHECK (calendar_sync_interval_seconds >= 30 AND calendar_sync_interval_seconds <= 300),
  ADD COLUMN IF NOT EXISTS auto_block_calendar_events boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_block_travel_time boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_block_lunch boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS lunch_start_time time DEFAULT '12:00',
  ADD COLUMN IF NOT EXISTS lunch_end_time time DEFAULT '13:00',
  ADD COLUMN IF NOT EXISTS lunch_duration_minutes integer DEFAULT 60 CHECK (lunch_duration_minutes >= 30 AND lunch_duration_minutes <= 120),
  ADD COLUMN IF NOT EXISTS crew_level_scheduling boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_availability_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS smart_time_suggestions_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS double_booking_prevention boolean DEFAULT true;

-- ============================================================================
-- 7. FUNCTIONS - CALENDAR EVENT SYNC
-- ============================================================================

-- Function to sync calendar event to schedule_blocks
CREATE OR REPLACE FUNCTION public.sync_calendar_event_to_blocks(
  p_calendar_event_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event public.calendar_events%ROWTYPE;
  v_settings public.scheduler_settings%ROWTYPE;
BEGIN
  -- Get calendar event
  SELECT * INTO v_event
  FROM public.calendar_events
  WHERE id = p_calendar_event_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Get scheduler settings
  SELECT * INTO v_settings
  FROM public.scheduler_settings
  WHERE workspace_id = v_event.workspace_id;
  
  -- Only auto-block if enabled
  IF NOT FOUND OR NOT COALESCE(v_settings.auto_block_calendar_events, true) THEN
    RETURN;
  END IF;
  
  -- Only block if event is busy or out of office
  IF v_event.busy_type NOT IN ('busy', 'out_of_office') THEN
    RETURN;
  END IF;
  
  -- Create or update schedule block
  INSERT INTO public.schedule_blocks (
    workspace_id,
    user_id,
    start_time,
    end_time,
    block_type,
    reason,
    title,
    source_type,
    source_id,
    auto_generated,
    metadata
  )
  VALUES (
    v_event.workspace_id,
    v_event.user_id,
    v_event.start_time,
    v_event.end_time,
    CASE 
      WHEN v_event.busy_type = 'out_of_office' THEN 'out_of_office'
      WHEN v_event.block_type = 'travel' THEN 'travel'
      WHEN v_event.block_type = 'lunch' THEN 'lunch'
      WHEN v_event.block_type = 'personal' THEN 'manual'
      ELSE 'calendar_event'
    END,
    v_event.title,
    v_event.title,
    'calendar_event',
    v_event.id,
    true,
    jsonb_build_object(
      'provider', v_event.provider,
      'external_event_id', v_event.external_event_id,
      'location', v_event.location
    )
  )
  ON CONFLICT DO NOTHING; -- Avoid duplicates
  
  -- Update crew availability
  INSERT INTO public.crew_availability (
    workspace_id,
    user_id,
    date,
    start_time,
    end_time,
    status,
    reason,
    source_type,
    source_id
  )
  VALUES (
    v_event.workspace_id,
    v_event.user_id,
    DATE(v_event.start_time),
    v_event.start_time::time,
    v_event.end_time::time,
    CASE 
      WHEN v_event.busy_type = 'out_of_office' THEN 'unavailable'
      ELSE 'busy'
    END,
    v_event.title,
    'calendar_event',
    v_event.id
  )
  ON CONFLICT (workspace_id, user_id, date, start_time, end_time)
  DO UPDATE SET
    status = EXCLUDED.status,
    reason = EXCLUDED.reason,
    updated_at = now();
END;
$$;

-- Function to get all blocked times for a user/workspace
CREATE OR REPLACE FUNCTION public.get_blocked_times(
  p_workspace_id uuid,
  p_user_id uuid DEFAULT NULL,
  p_start_time timestamptz,
  p_end_time timestamptz
)
RETURNS TABLE (
  start_time timestamptz,
  end_time timestamptz,
  block_type text,
  reason text,
  source_type text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sb.start_time,
    sb.end_time,
    sb.block_type,
    sb.reason,
    sb.source_type
  FROM public.schedule_blocks sb
  WHERE sb.workspace_id = p_workspace_id
    AND (p_user_id IS NULL OR sb.user_id IS NULL OR sb.user_id = p_user_id)
    AND (sb.start_time, sb.end_time) OVERLAPS (p_start_time, p_end_time)
  ORDER BY sb.start_time;
END;
$$;

-- ============================================================================
-- 8. FUNCTIONS - CREW-LEVEL AVAILABILITY
-- ============================================================================

-- Function to get crew member availability for a time slot
CREATE OR REPLACE FUNCTION public.is_crew_member_available(
  p_workspace_id uuid,
  p_user_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_exclude_booking_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_conflict_count integer;
BEGIN
  -- Check for existing bookings
  SELECT COUNT(*) INTO v_conflict_count
  FROM public.schedule_bookings
  WHERE workspace_id = p_workspace_id
    AND crew_member_id = p_user_id
    AND status IN ('booked', 'confirmed')
    AND (p_exclude_booking_id IS NULL OR id != p_exclude_booking_id)
    AND (start_time, end_time) OVERLAPS (p_start_time, p_end_time);
  
  IF v_conflict_count > 0 THEN
    RETURN false;
  END IF;
  
  -- Check for crew availability blocks
  SELECT COUNT(*) INTO v_conflict_count
  FROM public.crew_availability
  WHERE workspace_id = p_workspace_id
    AND user_id = p_user_id
    AND status IN ('busy', 'unavailable')
    AND DATE(start_time) = DATE(p_start_time)
    AND (start_time::time, end_time::time) OVERLAPS (p_start_time::time, p_end_time::time);
  
  IF v_conflict_count > 0 THEN
    RETURN false;
  END IF;
  
  -- Check for schedule blocks
  SELECT COUNT(*) INTO v_conflict_count
  FROM public.schedule_blocks
  WHERE workspace_id = p_workspace_id
    AND (user_id IS NULL OR user_id = p_user_id)
    AND (start_time, end_time) OVERLAPS (p_start_time, p_end_time);
  
  IF v_conflict_count > 0 THEN
    RETURN false;
  END IF;
  
  RETURN true;
END;
$$;

-- Function to get available crew members for a time slot
CREATE OR REPLACE FUNCTION public.get_available_crew_members(
  p_workspace_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz
)
RETURNS TABLE (
  user_id uuid,
  user_name text,
  user_email text,
  availability_score numeric(3, 2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    wm.user_id,
    p.full_name AS user_name,
    p.email AS user_email,
    1.0::numeric(3, 2) AS availability_score -- Default score
  FROM public.workspace_members wm
  LEFT JOIN public.profiles p ON p.id = wm.user_id
  WHERE wm.workspace_id = p_workspace_id
    AND wm.role IN ('owner', 'admin', 'member')
    AND public.is_crew_member_available(
      p_workspace_id,
      wm.user_id,
      p_start_time,
      p_end_time
    )
  ORDER BY wm.user_id;
END;
$$;

-- ============================================================================
-- 9. FUNCTIONS - AI AVAILABILITY LOGIC
-- ============================================================================

-- Enhanced function to calculate real availability with AI logic
CREATE OR REPLACE FUNCTION public.calculate_real_availability(
  p_workspace_id uuid,
  p_date date,
  p_duration integer DEFAULT 30,
  p_property_address text DEFAULT NULL,
  p_appointment_type text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL -- For crew-level scheduling
)
RETURNS TABLE (
  start_time timestamptz,
  end_time timestamptz,
  available boolean,
  reason text,
  quality_score numeric(3, 2),
  travel_time_minutes integer,
  weather_safe boolean,
  daylight_safe boolean,
  crew_available boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_settings public.scheduler_settings%ROWTYPE;
  v_slot_start timestamptz;
  v_slot_end timestamptz;
  v_available boolean;
  v_reason text;
  v_travel_time integer;
  v_weather_safe boolean;
  v_daylight_safe boolean;
  v_crew_available boolean;
  v_quality_score numeric(3, 2);
BEGIN
  -- Get scheduler settings
  SELECT * INTO v_settings
  FROM public.scheduler_settings
  WHERE workspace_id = p_workspace_id;
  
  -- Get base available slots from existing function
  FOR v_slot_start, v_slot_end IN 
    SELECT start_time, end_time
    FROM public.get_weather_aware_time_slots(
      p_workspace_id,
      p_date,
      p_duration,
      p_property_address,
      NULL
    )
    WHERE weather_safe = true
  LOOP
    v_available := true;
    v_reason := 'Available';
    v_travel_time := NULL;
    v_weather_safe := true;
    v_daylight_safe := true;
    v_crew_available := true;
    v_quality_score := 1.0;
    
    -- Check daylight
    IF COALESCE(v_settings.require_daylight, true) THEN
      SELECT public.is_daylight_safe(
        v_slot_start,
        v_slot_end,
        p_workspace_id,
        p_property_address
      ) INTO v_daylight_safe;
      
      IF NOT v_daylight_safe THEN
        v_available := false;
        v_reason := 'Outside daylight hours';
        v_quality_score := v_quality_score - 0.3;
      END IF;
    END IF;
    
    -- Check crew availability (if crew-level scheduling enabled)
    IF COALESCE(v_settings.crew_level_scheduling, false) AND p_user_id IS NOT NULL THEN
      SELECT public.is_crew_member_available(
        p_workspace_id,
        p_user_id,
        v_slot_start,
        v_slot_end
      ) INTO v_crew_available;
      
      IF NOT v_crew_available THEN
        v_available := false;
        v_reason := 'Crew member unavailable';
        v_quality_score := 0.0;
      END IF;
    END IF;
    
    -- Check blocked times
    IF EXISTS (
      SELECT 1 FROM public.get_blocked_times(
        p_workspace_id,
        p_user_id,
        v_slot_start,
        v_slot_end
      )
    ) THEN
      v_available := false;
      v_reason := 'Time blocked';
      v_quality_score := 0.0;
    END IF;
    
    -- Check travel time (if property address provided)
    IF p_property_address IS NOT NULL AND COALESCE(v_settings.travel_time_enabled, true) THEN
      -- Get travel time from previous appointment or office
      -- This will be calculated by API and cached
      v_travel_time := NULL; -- Placeholder - API will calculate
    END IF;
    
    -- Return slot
    RETURN QUERY SELECT 
      v_slot_start,
      v_slot_end,
      v_available,
      v_reason,
      v_quality_score,
      v_travel_time,
      v_weather_safe,
      v_daylight_safe,
      v_crew_available;
  END LOOP;
  
  RETURN;
END;
$$;

-- ============================================================================
-- 10. FUNCTIONS - SMART TIME SUGGESTIONS
-- ============================================================================

-- Function to get smart time suggestions based on natural language query
CREATE OR REPLACE FUNCTION public.get_smart_time_suggestions(
  p_workspace_id uuid,
  p_query_text text, -- e.g., "tomorrow", "Wednesday", "next week"
  p_duration integer DEFAULT 30,
  p_property_address text DEFAULT NULL,
  p_appointment_type text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_max_suggestions integer DEFAULT 3
)
RETURNS TABLE (
  start_time timestamptz,
  end_time timestamptz,
  suggestion_reason text,
  quality_score numeric(3, 2),
  travel_time_minutes integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_target_date date;
  v_days_ahead integer;
  v_rank integer := 1;
BEGIN
  -- Parse query text (simplified - in production would use NLP)
  -- For now, handle common patterns
  IF p_query_text ILIKE '%tomorrow%' OR p_query_text ILIKE '%tomorrow%' THEN
    v_target_date := CURRENT_DATE + 1;
  ELSIF p_query_text ILIKE '%today%' THEN
    v_target_date := CURRENT_DATE;
  ELSIF p_query_text ILIKE '%next week%' THEN
    v_target_date := CURRENT_DATE + 7;
  ELSE
    -- Default to tomorrow
    v_target_date := CURRENT_DATE + 1;
  END IF;
  
  -- Get available slots for target date
  FOR v_rank, start_time, end_time, quality_score, travel_time_minutes IN
    SELECT 
      ROW_NUMBER() OVER (ORDER BY quality_score DESC, start_time ASC)::integer as rank,
      start_time,
      end_time,
      quality_score,
      travel_time_minutes
    FROM public.calculate_real_availability(
      p_workspace_id,
      v_target_date,
      p_duration,
      p_property_address,
      p_appointment_type,
      p_user_id
    )
    WHERE available = true
      AND quality_score >= 0.6
    LIMIT p_max_suggestions
  LOOP
    RETURN QUERY SELECT 
      start_time,
      end_time,
      format('Best availability %s (quality score: %.2f)', 
        to_char(start_time, 'Day, Month DD at HH:MI AM'),
        quality_score
      ) AS suggestion_reason,
      quality_score,
      travel_time_minutes;
  END LOOP;
  
  RETURN;
END;
$$;

-- ============================================================================
-- 11. TRIGGERS
-- ============================================================================

-- Trigger to sync calendar events to blocks when created/updated
CREATE OR REPLACE FUNCTION public.trigger_sync_calendar_event_to_blocks()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.auto_block_enabled AND NEW.busy_type IN ('busy', 'out_of_office') THEN
    PERFORM public.sync_calendar_event_to_blocks(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_calendar_event_to_blocks ON public.calendar_events;
CREATE TRIGGER trg_sync_calendar_event_to_blocks
  AFTER INSERT OR UPDATE ON public.calendar_events
  FOR EACH ROW
  WHEN (NEW.auto_block_enabled = true AND NEW.busy_type IN ('busy', 'out_of_office'))
  EXECUTE FUNCTION public.trigger_sync_calendar_event_to_blocks();

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.set_calendar_events_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_calendar_events_updated_at ON public.calendar_events;
CREATE TRIGGER trg_calendar_events_updated_at
  BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW
  EXECUTE FUNCTION public.set_calendar_events_updated_at();

-- ============================================================================
-- 12. RLS POLICIES
-- ============================================================================

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_estimates ENABLE ROW LEVEL SECURITY;

-- Calendar events: workspace members can read/write
CREATE POLICY "calendar_events_workspace_members"
  ON public.calendar_events
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Crew availability: workspace members can read/write
CREATE POLICY "crew_availability_workspace_members"
  ON public.crew_availability
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Schedule blocks: workspace members can read/write
CREATE POLICY "schedule_blocks_workspace_members"
  ON public.schedule_blocks
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Route estimates: workspace members can read/write
CREATE POLICY "route_estimates_workspace_members"
  ON public.route_estimates
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- 13. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.calendar_events IS 'Stores synced Google Calendar events for availability blocking';
COMMENT ON TABLE public.crew_availability IS 'Per-crew-member availability tracking for crew-level scheduling';
COMMENT ON TABLE public.schedule_blocks IS 'Auto-blocked times (travel, lunch, breaks, calendar events, etc.)';
COMMENT ON TABLE public.route_estimates IS 'Enhanced travel time estimates with traffic awareness';
COMMENT ON FUNCTION public.sync_calendar_event_to_blocks IS 'Sync calendar event to schedule_blocks for auto-blocking';
COMMENT ON FUNCTION public.get_blocked_times IS 'Get all blocked times for a user/workspace in a time range';
COMMENT ON FUNCTION public.is_crew_member_available IS 'Check if crew member is available for a time slot';
COMMENT ON FUNCTION public.get_available_crew_members IS 'Get available crew members for a time slot';
COMMENT ON FUNCTION public.calculate_real_availability IS 'Calculate real availability with AI logic (travel, weather, daylight, crew)';
COMMENT ON FUNCTION public.get_smart_time_suggestions IS 'Get smart time suggestions based on natural language query';





















































