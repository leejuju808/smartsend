-- AUREV HQ Unified Dashboard
-- Cross-app events bus and dashboard metrics
-- Creates events_bus, app_revenue tables and views

-- =====================================================
-- 1. Cross-App Event Bus
-- Unified event stream across SmartSend, OpsGrid, AgentCloud
-- =====================================================
CREATE TABLE IF NOT EXISTS public.events_bus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app TEXT NOT NULL CHECK (app IN ('smartsend', 'opsgrid', 'agentcloud')),
  org_id UUID REFERENCES public.orgs(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  meta JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_events_bus_ts ON public.events_bus(ts DESC);
CREATE INDEX IF NOT EXISTS idx_events_bus_org ON public.events_bus(org_id);
CREATE INDEX IF NOT EXISTS idx_events_bus_app ON public.events_bus(app);
CREATE INDEX IF NOT EXISTS idx_events_bus_type ON public.events_bus(type);

COMMENT ON TABLE public.events_bus IS 'Cross-app event stream for AUREV HQ unified dashboard';

-- =====================================================
-- 2. Revenue Snapshots
-- Monthly revenue per app and org
-- =====================================================
CREATE TABLE IF NOT EXISTS public.app_revenue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app TEXT NOT NULL CHECK (app IN ('smartsend', 'opsgrid', 'agentcloud')),
  org_id UUID REFERENCES public.orgs(id) ON DELETE CASCADE,
  period DATE NOT NULL DEFAULT (NOW()::DATE),
  mrr NUMERIC(10, 2) NOT NULL DEFAULT 0,
  arr NUMERIC(10, 2) GENERATED ALWAYS AS (mrr * 12) STORED
);

CREATE INDEX IF NOT EXISTS idx_app_rev_period ON public.app_revenue(period DESC);
CREATE INDEX IF NOT EXISTS idx_app_rev_app ON public.app_revenue(app);
CREATE INDEX IF NOT EXISTS idx_app_rev_org ON public.app_revenue(org_id);

COMMENT ON TABLE public.app_revenue IS 'Monthly recurring revenue snapshots per app and org';

-- =====================================================
-- 3. Active Orgs View (30d)
-- =====================================================
CREATE OR REPLACE VIEW public.vw_active_orgs_30d AS
SELECT 
  app, 
  COUNT(DISTINCT org_id) AS active_orgs
FROM public.events_bus
WHERE ts >= NOW() - INTERVAL '30 days'
GROUP BY app;

COMMENT ON VIEW public.vw_active_orgs_30d IS 'Active orgs per app in last 30 days';

-- =====================================================
-- 4. Activity Daily Timeseries View (30d)
-- =====================================================
CREATE OR REPLACE VIEW public.vw_activity_daily AS
SELECT 
  DATE_TRUNC('day', ts) AS day, 
  app, 
  COUNT(*) AS events
FROM public.events_bus
WHERE ts >= NOW() - INTERVAL '30 days'
GROUP BY 1, 2
ORDER BY 1 ASC;

COMMENT ON VIEW public.vw_activity_daily IS 'Daily activity events per app for last 30 days';

-- =====================================================
-- 5. MRR by App View
-- Latest period per org
-- =====================================================
CREATE OR REPLACE VIEW public.vw_mrr_app AS
SELECT 
  app, 
  SUM(mrr) AS mrr
FROM (
  SELECT DISTINCT ON (app, org_id) 
    app, 
    org_id, 
    mrr
  FROM public.app_revenue
  ORDER BY app, org_id, period DESC
) t
GROUP BY app;

COMMENT ON VIEW public.vw_mrr_app IS 'Latest MRR sum by app across all orgs';

-- =====================================================
-- 6. HQ Overview View (Combined metrics)
-- =====================================================
CREATE OR REPLACE VIEW public.vw_hq_overview AS
SELECT
  (SELECT SUM(mrr) FROM public.vw_mrr_app) AS total_mrr,
  (SELECT SUM(arr) FROM public.app_revenue WHERE period = (SELECT MAX(period) FROM public.app_revenue)) AS total_arr,
  (SELECT COUNT(DISTINCT org_id) FROM public.events_bus WHERE ts >= NOW() - INTERVAL '30 days') AS active_orgs_30d,
  (SELECT COUNT(*) FROM public.events_bus WHERE ts >= NOW() - INTERVAL '1 day') AS events_24h,
  (SELECT COUNT(*) FROM public.events_bus WHERE ts >= NOW() - INTERVAL '7 days') AS events_7d,
  NOW() AS snapshot_at;

COMMENT ON VIEW public.vw_hq_overview IS 'Combined AUREV HQ dashboard metrics';

-- =====================================================
-- 7. RLS Policies
-- =====================================================
ALTER TABLE public.events_bus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_revenue ENABLE ROW LEVEL SECURITY;

-- Org members can see their org's events
CREATE POLICY "org_events_select" ON public.events_bus
  FOR SELECT USING (
    org_id IS NULL OR
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = events_bus.org_id
      AND om.user_id = auth.uid()
    )
  );

-- Service role can insert events
CREATE POLICY "events_insert_service" ON public.events_bus
  FOR INSERT TO service_role USING (true);

-- Org members can see their org's revenue
CREATE POLICY "org_rev_select" ON public.app_revenue
  FOR SELECT USING (
    org_id IS NULL OR
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = app_revenue.org_id
      AND om.user_id = auth.uid()
    )
  );

-- Service role can insert/update revenue
CREATE POLICY "rev_insert_update_service" ON public.app_revenue
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =====================================================
-- 8. Helper Function: Insert HQ Event
-- =====================================================
CREATE OR REPLACE FUNCTION public.hq_event_insert(
  p_app TEXT,
  p_org_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_type TEXT,
  p_meta JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
  v_event_id UUID;
BEGIN
  INSERT INTO public.events_bus (app, org_id, user_id, type, meta)
  VALUES (p_app, p_org_id, p_user_id, p_type, p_meta)
  RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.hq_event_insert IS 'Insert event into HQ events bus';

-- =====================================================
-- 9. Admin override for global view
-- Can be used with custom JWT claims
-- =====================================================
-- Note: Admin checks would be done via JWT claims (app_role='admin')
-- or via a separate org_members role check

-- Example admin policy (uncomment if using JWT claims):
-- CREATE POLICY "admin_events_select" ON public.events_bus
--   FOR SELECT USING (
--     (auth.jwt() ->> 'app_role')::text = 'admin'
--   );

