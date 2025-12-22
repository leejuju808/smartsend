-- AUREV OS Core System
-- Unified AI Operating System for SMBs
-- This migration creates the core AUREV infrastructure to unify SmartSend, OpsGrid, and AgentCloud

-- =====================================================
-- 1. AUREV Modules Table
-- Tracks which modules (SmartSend, OpsGrid, AgentCloud) are active per org
-- =====================================================
CREATE TABLE IF NOT EXISTS public.aurev_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  module TEXT NOT NULL CHECK (module IN ('smartsend', 'opsgrid', 'agentcloud')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  
  -- Usage metrics (flexible JSONB for different modules)
  usage JSONB DEFAULT '{}'::jsonb,
  
  -- Module-specific settings
  settings JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Ensure one record per org-module combination
  UNIQUE(org_id, module)
);

CREATE INDEX IF NOT EXISTS idx_aurev_modules_org ON public.aurev_modules(org_id);
CREATE INDEX IF NOT EXISTS idx_aurev_modules_status ON public.aurev_modules(status);
CREATE INDEX IF NOT EXISTS idx_aurev_modules_module ON public.aurev_modules(module);

-- RLS for aurev_modules
ALTER TABLE public.aurev_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY aurev_modules_read ON public.aurev_modules
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = aurev_modules.org_id
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY aurev_modules_write ON public.aurev_modules
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = aurev_modules.org_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    )
  );

-- =====================================================
-- 2. AUREV Users Table
-- Extended user context with module access and preferences
-- =====================================================
CREATE TABLE IF NOT EXISTS public.aurev_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  
  -- User role within the AUREV context
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  
  -- Modules this user has access to (subset of org's modules)
  modules_enabled TEXT[] DEFAULT '{}'::text[],
  
  -- User preferences for the unified dashboard
  preferences JSONB DEFAULT '{"theme": "light", "notifications": {}}'::jsonb,
  
  -- Onboarding status
  onboarding_complete BOOLEAN DEFAULT FALSE,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- One AUREV user record per user-org combination
  UNIQUE(user_id, org_id)
);

CREATE INDEX IF NOT EXISTS idx_aurev_users_user ON public.aurev_users(user_id);
CREATE INDEX IF NOT EXISTS idx_aurev_users_org ON public.aurev_users(org_id);

-- RLS for aurev_users
ALTER TABLE public.aurev_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY aurev_users_read ON public.aurev_users
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = aurev_users.org_id
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY aurev_users_write ON public.aurev_users
  FOR ALL USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = aurev_users.org_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    )
  );

-- =====================================================
-- 3. AUREV Analytics Aggregation Table
-- Unified analytics across all modules
-- =====================================================
CREATE TABLE IF NOT EXISTS public.aurev_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  module TEXT NOT NULL CHECK (module IN ('smartsend', 'opsgrid', 'agentcloud', 'combined')),
  
  -- Time bucket for aggregation
  date DATE NOT NULL,
  
  -- Core metrics (flexible schema)
  metrics JSONB DEFAULT '{}'::jsonb,
  
  -- Common metrics across modules
  events_count INTEGER DEFAULT 0,
  revenue_usd NUMERIC(10, 2) DEFAULT 0,
  
  -- Module-specific metrics
  smartsend_sends INTEGER DEFAULT 0,
  smartsend_replies INTEGER DEFAULT 0,
  opsgrid_workflows_run INTEGER DEFAULT 0,
  opsgrid_tasks_completed INTEGER DEFAULT 0,
  agentcloud_messages_sent INTEGER DEFAULT 0,
  agentcloud_agents_deployed INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- One record per org-module-date
  UNIQUE(org_id, module, date)
);

CREATE INDEX IF NOT EXISTS idx_aurev_analytics_org ON public.aurev_analytics(org_id);
CREATE INDEX IF NOT EXISTS idx_aurev_analytics_module ON public.aurev_analytics(module);
CREATE INDEX IF NOT EXISTS idx_aurev_analytics_date ON public.aurev_analytics(date);
CREATE INDEX IF NOT EXISTS idx_aurev_analytics_org_date ON public.aurev_analytics(org_id, date DESC);

-- RLS for aurev_analytics
ALTER TABLE public.aurev_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY aurev_analytics_read ON public.aurev_analytics
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = aurev_analytics.org_id
      AND om.user_id = auth.uid()
    )
  );

-- =====================================================
-- 4. AUREV Unified Events Table
-- Cross-module event tracking for workflow automation
-- =====================================================
CREATE TABLE IF NOT EXISTS public.aurev_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  
  -- Event metadata
  event_type TEXT NOT NULL,
  module TEXT NOT NULL CHECK (module IN ('smartsend', 'opsgrid', 'agentcloud', 'core')),
  
  -- Event payload (flexible JSONB)
  payload JSONB DEFAULT '{}'::jsonb,
  
  -- Linked resources
  resource_type TEXT, -- 'campaign', 'workflow', 'agent', etc.
  resource_id UUID,
  
  -- User who triggered the event
  triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aurev_events_org ON public.aurev_events(org_id);
CREATE INDEX IF NOT EXISTS idx_aurev_events_module ON public.aurev_events(module);
CREATE INDEX IF NOT EXISTS idx_aurev_events_type ON public.aurev_events(event_type);
CREATE INDEX IF NOT EXISTS idx_aurev_events_resource ON public.aurev_events(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_aurev_events_created ON public.aurev_events(created_at DESC);

-- RLS for aurev_events
ALTER TABLE public.aurev_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY aurev_events_read ON public.aurev_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = aurev_events.org_id
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY aurev_events_write ON public.aurev_events
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = aurev_events.org_id
      AND om.user_id = auth.uid()
    )
  );

-- =====================================================
-- 5. Helper Functions
-- =====================================================

-- Function to get user's AUREV context
CREATE OR REPLACE FUNCTION get_aurev_user_context(p_user_id UUID)
RETURNS TABLE (
  user_id UUID,
  org_id UUID,
  role TEXT,
  modules_enabled TEXT[],
  preferences JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    au.user_id,
    au.org_id,
    au.role,
    au.modules_enabled,
    au.preferences
  FROM public.aurev_users au
  WHERE au.user_id = p_user_id
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get org's module usage summary
CREATE OR REPLACE FUNCTION get_org_module_usage(p_org_id UUID)
RETURNS TABLE (
  module TEXT,
  status TEXT,
  usage_summary JSONB,
  last_updated TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    am.module,
    am.status,
    am.usage,
    am.updated_at
  FROM public.aurev_modules am
  WHERE am.org_id = p_org_id
  ORDER BY am.module;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to track cross-module event
CREATE OR REPLACE FUNCTION track_aurev_event(
  p_org_id UUID,
  p_event_type TEXT,
  p_module TEXT,
  p_payload JSONB DEFAULT '{}'::jsonb,
  p_resource_type TEXT DEFAULT NULL,
  p_resource_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_event_id UUID;
BEGIN
  INSERT INTO public.aurev_events (
    org_id,
    event_type,
    module,
    payload,
    resource_type,
    resource_id,
    triggered_by
  ) VALUES (
    p_org_id,
    p_event_type,
    p_module,
    p_payload,
    p_resource_type,
    p_resource_id,
    auth.uid()
  )
  RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to aggregate daily analytics
CREATE OR REPLACE FUNCTION aggregate_aurev_daily_analytics(p_org_id UUID, p_date DATE DEFAULT CURRENT_DATE)
RETURNS VOID AS $$
BEGIN
  -- Aggregate SmartSend metrics
  INSERT INTO public.aurev_analytics (org_id, module, date, smartsend_sends, smartsend_replies)
  SELECT 
    p_org_id,
    'smartsend',
    p_date,
    COUNT(*) FILTER (WHERE email_logs.sent_at::date = p_date),
    COUNT(*) FILTER (WHERE email_logs.reply_detected = true AND email_logs.sent_at::date = p_date)
  FROM public.email_logs
  WHERE email_logs.org_id = p_org_id
  AND email_logs.sent_at::date = p_date
  ON CONFLICT (org_id, module, date) 
  DO UPDATE SET
    smartsend_sends = EXCLUDED.smartsend_sends,
    smartsend_replies = EXCLUDED.smartsend_replies,
    updated_at = NOW();

  -- TODO: Aggregate OpsGrid and AgentCloud metrics when those modules are implemented
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 6. Update timestamp trigger
-- =====================================================
CREATE OR REPLACE FUNCTION update_aurev_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_aurev_modules_updated_at
  BEFORE UPDATE ON public.aurev_modules
  FOR EACH ROW
  EXECUTE FUNCTION update_aurev_updated_at();

CREATE TRIGGER update_aurev_users_updated_at
  BEFORE UPDATE ON public.aurev_users
  FOR EACH ROW
  EXECUTE FUNCTION update_aurev_updated_at();

CREATE TRIGGER update_aurev_analytics_updated_at
  BEFORE UPDATE ON public.aurev_analytics
  FOR EACH ROW
  EXECUTE FUNCTION update_aurev_updated_at();

-- =====================================================
-- 7. Comments and Documentation
-- =====================================================
COMMENT ON TABLE public.aurev_modules IS 'Tracks which AUREV modules are active per organization';
COMMENT ON TABLE public.aurev_users IS 'Extended user context with module access and preferences for AUREV OS';
COMMENT ON TABLE public.aurev_analytics IS 'Unified analytics aggregation across all AUREV modules';
COMMENT ON TABLE public.aurev_events IS 'Cross-module event tracking for workflow automation';

COMMENT ON FUNCTION get_aurev_user_context IS 'Get user context including accessible modules and preferences';
COMMENT ON FUNCTION get_org_module_usage IS 'Get summary of module usage across an org';
COMMENT ON FUNCTION track_aurev_event IS 'Track cross-module events for analytics and automation';
COMMENT ON FUNCTION aggregate_aurev_daily_analytics IS 'Daily aggregation of metrics across all modules';

-- =====================================================
-- 8. Backfill existing orgs with SmartSend module
-- =====================================================
-- For existing organizations, enable SmartSend by default
INSERT INTO public.aurev_modules (org_id, module, status, usage)
SELECT 
  o.id as org_id,
  'smartsend' as module,
  'active' as status,
  '{}'::jsonb as usage
FROM public.orgs o
ON CONFLICT (org_id, module) DO NOTHING;

-- Backfill existing org members as AUREV users
INSERT INTO public.aurev_users (user_id, org_id, role, modules_enabled)
SELECT 
  om.user_id,
  om.org_id,
  om.role,
  ARRAY['smartsend']::text[] as modules_enabled
FROM public.org_members om
ON CONFLICT (user_id, org_id) DO UPDATE SET
  modules_enabled = ARRAY['smartsend']::text[],
  updated_at = NOW();

