-- Block 250000 — SmartSend Roofing "REAL-TIME OPS GRID v1"
-- Live Map, Live Activity Feed, Crew Tracking, Weather Overlay, Alerts
-- 
-- This is the live command map that makes SmartSend feel like a MILITARY OPS CENTER for roofing companies.
-- Owners will say: "This is insane. I can see everything happening across my business in real-time."

-- ============================================================
-- 1. CREW_LOCATIONS TABLE
-- ============================================================
-- Tracks real-time GPS locations of crews
CREATE TABLE IF NOT EXISTS public.crew_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id uuid REFERENCES public.crews(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  lat numeric(10, 8) NOT NULL,
  lng numeric(11, 8) NOT NULL,
  accuracy numeric, -- GPS accuracy in meters
  heading numeric, -- Direction of travel in degrees (0-360)
  speed numeric, -- Speed in km/h
  status text CHECK (status IN ('on_job', 'traveling', 'stuck_in_traffic', 'delayed', 'idle')),
  timestamp timestamptz DEFAULT now() NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crew_locations_crew ON public.crew_locations(crew_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_crew_locations_workspace ON public.crew_locations(workspace_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_crew_locations_timestamp ON public.crew_locations(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_crew_locations_recent ON public.crew_locations(crew_id, timestamp DESC) WHERE timestamp > now() - interval '24 hours';

-- ============================================================
-- 2. JOB_LOCATIONS TABLE
-- ============================================================
-- Stores geographic locations of all jobs
CREATE TABLE IF NOT EXISTS public.job_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  lat numeric(10, 8) NOT NULL,
  lng numeric(11, 8) NOT NULL,
  address text NOT NULL,
  city text,
  state text,
  zip text,
  geocoded_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_locations_job ON public.job_locations(job_id);
CREATE INDEX IF NOT EXISTS idx_job_locations_workspace ON public.job_locations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_job_locations_coords ON public.job_locations(lat, lng);

-- ============================================================
-- 3. OPS_ALERTS TABLE
-- ============================================================
-- Operational alerts for weather, delays, traffic, delivery, safety
CREATE TABLE IF NOT EXISTS public.ops_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('weather', 'delay', 'traffic', 'delivery', 'safety', 'material', 'customer', 'system')),
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  message text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  acknowledged boolean DEFAULT false,
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ops_alerts_workspace ON public.ops_alerts(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ops_alerts_job ON public.ops_alerts(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ops_alerts_crew ON public.ops_alerts(crew_id) WHERE crew_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ops_alerts_type ON public.ops_alerts(type, severity);
CREATE INDEX IF NOT EXISTS idx_ops_alerts_unacknowledged ON public.ops_alerts(workspace_id, acknowledged) WHERE acknowledged = false;

-- ============================================================
-- 4. OPS_ACTIVITY_FEED TABLE
-- ============================================================
-- Real-time activity feed of all operational events
CREATE TABLE IF NOT EXISTS public.ops_activity_feed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL, -- 'crew_arrived', 'crew_departed', 'photo_uploaded', 'drone_scan', 'delivery_completed', 'delay_reported', 'issue_reported', 'change_order_approved', 'customer_message', 'payment_received', etc.
  title text NOT NULL,
  description text,
  metadata jsonb DEFAULT '{}'::jsonb,
  icon text, -- Icon name for UI
  color text, -- Color for UI badge
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ops_activity_feed_workspace ON public.ops_activity_feed(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ops_activity_feed_job ON public.ops_activity_feed(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ops_activity_feed_crew ON public.ops_activity_feed(crew_id) WHERE crew_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ops_activity_feed_type ON public.ops_activity_feed(event_type);
CREATE INDEX IF NOT EXISTS idx_ops_activity_feed_recent ON public.ops_activity_feed(workspace_id, created_at DESC) WHERE created_at > now() - interval '7 days';

-- ============================================================
-- 5. WEATHER_ALERTS TABLE
-- ============================================================
-- Weather alerts tied to specific job locations
CREATE TABLE IF NOT EXISTS public.weather_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  job_location_id uuid REFERENCES public.job_locations(id) ON DELETE CASCADE,
  alert_type text NOT NULL CHECK (alert_type IN ('rain', 'hail', 'wind', 'lightning', 'snow', 'storm')),
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  forecast_time timestamptz NOT NULL, -- When the weather event is predicted
  probability numeric(5, 2) CHECK (probability >= 0 AND probability <= 100), -- Probability percentage
  intensity text, -- 'light', 'moderate', 'heavy', 'severe'
  message text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb, -- Wind speed, precipitation amount, etc.
  acknowledged boolean DEFAULT false,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_weather_alerts_workspace ON public.weather_alerts(workspace_id, forecast_time);
CREATE INDEX IF NOT EXISTS idx_weather_alerts_job ON public.weather_alerts(job_id, forecast_time);
CREATE INDEX IF NOT EXISTS idx_weather_alerts_active ON public.weather_alerts(workspace_id, forecast_time) WHERE forecast_time > now() AND acknowledged = false;

-- ============================================================
-- 6. DELIVERY_TRACKING TABLE
-- ============================================================
-- Tracks supplier deliveries in real-time
CREATE TABLE IF NOT EXISTS public.delivery_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  supplier_name text,
  driver_name text,
  driver_phone text,
  vehicle_type text, -- 'truck', 'van', 'flatbed', etc.
  lat numeric(10, 8),
  lng numeric(11, 8),
  status text NOT NULL CHECK (status IN ('scheduled', 'en_route', 'arrived', 'delivered', 'delayed', 'cancelled')),
  estimated_arrival timestamptz,
  actual_arrival timestamptz,
  delivered_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_tracking_workspace ON public.delivery_tracking(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_delivery_tracking_job ON public.delivery_tracking(job_id);
CREATE INDEX IF NOT EXISTS idx_delivery_tracking_status ON public.delivery_tracking(status) WHERE status IN ('en_route', 'scheduled');

-- ============================================================
-- 7. TRIGGERS
-- ============================================================

-- Update updated_at on job_locations
CREATE OR REPLACE FUNCTION update_job_locations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_job_locations_updated_at ON public.job_locations;
CREATE TRIGGER trg_job_locations_updated_at
BEFORE UPDATE ON public.job_locations
FOR EACH ROW
EXECUTE FUNCTION update_job_locations_updated_at();

-- Update updated_at on delivery_tracking
CREATE OR REPLACE FUNCTION update_delivery_tracking_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_delivery_tracking_updated_at ON public.delivery_tracking;
CREATE TRIGGER trg_delivery_tracking_updated_at
BEFORE UPDATE ON public.delivery_tracking
FOR EACH ROW
EXECUTE FUNCTION update_delivery_tracking_updated_at();

-- ============================================================
-- 8. HELPER FUNCTIONS
-- ============================================================

-- Get latest crew location for each crew
CREATE OR REPLACE FUNCTION get_latest_crew_locations(p_workspace_id uuid)
RETURNS TABLE (
  crew_id uuid,
  lat numeric,
  lng numeric,
  status text,
  timestamp timestamptz,
  crew_name text
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (cl.crew_id)
    cl.crew_id,
    cl.lat,
    cl.lng,
    cl.status,
    cl.timestamp,
    c.name as crew_name
  FROM public.crew_locations cl
  JOIN public.crews c ON c.id = cl.crew_id
  WHERE cl.workspace_id = p_workspace_id
    AND cl.timestamp > now() - interval '2 hours' -- Only recent locations
  ORDER BY cl.crew_id, cl.timestamp DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get jobs with locations for map
CREATE OR REPLACE FUNCTION get_jobs_with_locations(
  p_workspace_id uuid,
  p_date_filter text DEFAULT 'all' -- 'today', 'this_week', 'all'
)
RETURNS TABLE (
  job_id uuid,
  lat numeric,
  lng numeric,
  address text,
  stage text,
  crew_id uuid,
  crew_name text,
  contract_value numeric,
  scheduled_date date,
  status_color text -- 'blue', 'green', 'yellow', 'red', 'gray'
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    j.id as job_id,
    jl.lat,
    jl.lng,
    jl.address,
    j.stage,
    jc.crew_id,
    c.name as crew_name,
    j.contract_value,
    js.start_date as scheduled_date,
    CASE
      WHEN j.stage = 'completed' THEN 'gray'
      WHEN j.stage = 'in_progress' THEN 'green'
      WHEN j.stage = 'scheduled' THEN 'blue'
      WHEN EXISTS (
        SELECT 1 FROM public.ops_alerts oa 
        WHERE oa.job_id = j.id 
        AND oa.severity IN ('warning', 'critical')
        AND oa.acknowledged = false
      ) THEN 'red'
      WHEN EXISTS (
        SELECT 1 FROM public.delivery_tracking dt 
        WHERE dt.job_id = j.id 
        AND dt.status = 'en_route'
      ) THEN 'yellow'
      ELSE 'blue'
    END as status_color
  FROM public.jobs j
  JOIN public.job_locations jl ON jl.job_id = j.id
  LEFT JOIN public.job_crews jc ON jc.job_id = j.id AND jc.is_primary = true
  LEFT JOIN public.crews c ON c.id = jc.crew_id
  LEFT JOIN public.job_schedule js ON js.job_id = j.id
  WHERE j.team_id IN (
    SELECT id FROM public.teams WHERE workspace_id = p_workspace_id
  )
  AND (
    CASE p_date_filter
      WHEN 'today' THEN js.start_date = CURRENT_DATE OR j.stage = 'in_progress'
      WHEN 'this_week' THEN js.start_date >= date_trunc('week', CURRENT_DATE) AND js.start_date < date_trunc('week', CURRENT_DATE) + interval '7 days'
      ELSE true
    END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get activity feed
CREATE OR REPLACE FUNCTION get_ops_activity_feed(
  p_workspace_id uuid,
  p_limit int DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  job_id uuid,
  crew_id uuid,
  event_type text,
  title text,
  description text,
  icon text,
  color text,
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    oaf.id,
    oaf.job_id,
    oaf.crew_id,
    oaf.event_type,
    oaf.title,
    oaf.description,
    oaf.icon,
    oaf.color,
    oaf.created_at
  FROM public.ops_activity_feed oaf
  WHERE oaf.workspace_id = p_workspace_id
  ORDER BY oaf.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 9. ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.crew_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_activity_feed ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weather_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_tracking ENABLE ROW LEVEL SECURITY;

-- Crew locations: Workspace members can view
DROP POLICY IF EXISTS "crew_locations_workspace_member" ON public.crew_locations;
CREATE POLICY "crew_locations_workspace_member" ON public.crew_locations
  FOR SELECT USING (
    EXISTS(
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = crew_locations.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- Crew locations: Crew members can insert their own location
DROP POLICY IF EXISTS "crew_locations_crew_insert" ON public.crew_locations;
CREATE POLICY "crew_locations_crew_insert" ON public.crew_locations
  FOR INSERT WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.crew_members cm
      JOIN public.crews c ON c.id = cm.crew_id
      WHERE c.id = crew_locations.crew_id
      AND cm.user_id = auth.uid()
    )
  );

-- Job locations: Workspace members can view
DROP POLICY IF EXISTS "job_locations_workspace_member" ON public.job_locations;
CREATE POLICY "job_locations_workspace_member" ON public.job_locations
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = job_locations.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- Ops alerts: Workspace members can view
DROP POLICY IF EXISTS "ops_alerts_workspace_member" ON public.ops_alerts;
CREATE POLICY "ops_alerts_workspace_member" ON public.ops_alerts
  FOR SELECT USING (
    EXISTS(
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = ops_alerts.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- Ops alerts: Workspace members can acknowledge
DROP POLICY IF EXISTS "ops_alerts_workspace_acknowledge" ON public.ops_alerts;
CREATE POLICY "ops_alerts_workspace_acknowledge" ON public.ops_alerts
  FOR UPDATE USING (
    EXISTS(
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = ops_alerts.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- Activity feed: Workspace members can view
DROP POLICY IF EXISTS "ops_activity_feed_workspace_member" ON public.ops_activity_feed;
CREATE POLICY "ops_activity_feed_workspace_member" ON public.ops_activity_feed
  FOR SELECT USING (
    EXISTS(
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = ops_activity_feed.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- Activity feed: System can insert (via service role)
DROP POLICY IF EXISTS "ops_activity_feed_service_insert" ON public.ops_activity_feed;
CREATE POLICY "ops_activity_feed_service_insert" ON public.ops_activity_feed
  FOR INSERT TO service_role
  WITH CHECK (true);

-- Weather alerts: Workspace members can view
DROP POLICY IF EXISTS "weather_alerts_workspace_member" ON public.weather_alerts;
CREATE POLICY "weather_alerts_workspace_member" ON public.weather_alerts
  FOR SELECT USING (
    EXISTS(
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = weather_alerts.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- Delivery tracking: Workspace members can view
DROP POLICY IF EXISTS "delivery_tracking_workspace_member" ON public.delivery_tracking;
CREATE POLICY "delivery_tracking_workspace_member" ON public.delivery_tracking
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = delivery_tracking.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- Service role has full access to all tables
DROP POLICY IF EXISTS "ops_grid_service_role_all" ON public.crew_locations;
CREATE POLICY "ops_grid_service_role_all" ON public.crew_locations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "job_locations_service_role_all" ON public.job_locations;
CREATE POLICY "job_locations_service_role_all" ON public.job_locations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "ops_alerts_service_role_all" ON public.ops_alerts;
CREATE POLICY "ops_alerts_service_role_all" ON public.ops_alerts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "ops_activity_feed_service_role_all" ON public.ops_activity_feed;
CREATE POLICY "ops_activity_feed_service_role_all" ON public.ops_activity_feed
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "weather_alerts_service_role_all" ON public.weather_alerts;
CREATE POLICY "weather_alerts_service_role_all" ON public.weather_alerts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delivery_tracking_service_role_all" ON public.delivery_tracking;
CREATE POLICY "delivery_tracking_service_role_all" ON public.delivery_tracking
  FOR ALL TO service_role USING (true) WITH CHECK (true);

























