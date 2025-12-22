-- AUREV HQ Unified Ecosystem
-- Complete implementation for SmartSend ↔ OpsGrid ↔ AgentCloud integration
-- Nov 2025 - Jan 2026 Roadmap

-- =====================================================
-- 1. Sync Logs Table
-- Track all cross-app sync operations
-- =====================================================
CREATE TABLE IF NOT EXISTS public.aurev_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  
  -- Sync metadata
  sync_type TEXT NOT NULL, -- 'contacts', 'campaigns', 'workflows', 'agents'
  source_module TEXT NOT NULL CHECK (source_module IN ('smartsend', 'opsgrid', 'agentcloud')),
  target_module TEXT NOT NULL CHECK (target_module IN ('smartsend', 'opsgrid', 'agentcloud')),
  
  -- Results
  records_synced INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'partial', 'failed')),
  error_message TEXT,
  
  -- Additional metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aurev_sync_logs_org ON public.aurev_sync_logs(org_id);
CREATE INDEX IF NOT EXISTS idx_aurev_sync_logs_type ON public.aurev_sync_logs(sync_type);
CREATE INDEX IF NOT EXISTS idx_aurev_sync_logs_created ON public.aurev_sync_logs(created_at DESC);

-- RLS
ALTER TABLE public.aurev_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY aurev_sync_logs_read ON public.aurev_sync_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = aurev_sync_logs.org_id
      AND om.user_id = auth.uid()
    )
  );

-- =====================================================
-- 2. Cross-App Usage Tracking Table
-- Track usage metrics across all apps per org
-- =====================================================
CREATE TABLE IF NOT EXISTS public.aurev_usage_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  module TEXT NOT NULL CHECK (module IN ('smartsend', 'opsgrid', 'agentcloud', 'combined')),
  
  -- Monthly usage period
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  
  -- Usage metrics
  actions_count INTEGER DEFAULT 0, -- Total actions across all modules
  smartsend_emails_sent INTEGER DEFAULT 0,
  smartsend_leads_generated INTEGER DEFAULT 0,
  opsgrid_workflows_run INTEGER DEFAULT 0,
  opsgrid_tasks_completed INTEGER DEFAULT 0,
  agentcloud_messages_sent INTEGER DEFAULT 0,
  agentcloud_agents_deployed INTEGER DEFAULT 0,
  
  -- Revenue
  revenue_usd NUMERIC(10, 2) DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- One record per org-module-month
  UNIQUE(org_id, module, year, month)
);

CREATE INDEX IF NOT EXISTS idx_aurev_usage_tracking_org ON public.aurev_usage_tracking(org_id);
CREATE INDEX IF NOT EXISTS idx_aurev_usage_tracking_module ON public.aurev_usage_tracking(module);
CREATE INDEX IF NOT EXISTS idx_aurev_usage_tracking_period ON public.aurev_usage_tracking(year, month);

-- RLS
ALTER TABLE public.aurev_usage_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY aurev_usage_tracking_read ON public.aurev_usage_tracking
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = aurev_usage_tracking.org_id
      AND om.user_id = auth.uid()
    )
  );

-- Update trigger
CREATE TRIGGER update_aurev_usage_tracking_updated_at
  BEFORE UPDATE ON public.aurev_usage_tracking
  FOR EACH ROW
  EXECUTE FUNCTION update_aurev_updated_at();

-- =====================================================
-- 3. Cross-App Revenue Tracking
-- Track revenue per app and combined
-- =====================================================
CREATE TABLE IF NOT EXISTS public.app_revenue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  app TEXT NOT NULL CHECK (app IN ('smartsend', 'opsgrid', 'agentcloud', 'combined')),
  
  -- Revenue tracking
  month DATE NOT NULL,
  mrr NUMERIC(10, 2) DEFAULT 0, -- Monthly Recurring Revenue
  arr NUMERIC(10, 2) DEFAULT 0, -- Annual Recurring Revenue
  
  -- Additional metrics
  active_subscriptions INTEGER DEFAULT 0,
  churned_subscriptions INTEGER DEFAULT 0,
  new_subscriptions INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- One record per org-app-month
  UNIQUE(org_id, app, month)
);

CREATE INDEX IF NOT EXISTS idx_app_revenue_org ON public.app_revenue(org_id);
CREATE INDEX IF NOT EXISTS idx_app_revenue_app ON public.app_revenue(app);
CREATE INDEX IF NOT EXISTS idx_app_revenue_month ON public.app_revenue(month DESC);

-- RLS
ALTER TABLE public.app_revenue ENABLE ROW LEVEL SECURITY;

CREATE POLICY app_revenue_read ON public.app_revenue
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = app_revenue.org_id
      AND om.user_id = auth.uid()
    )
  );

-- Update trigger
CREATE TRIGGER update_app_revenue_updated_at
  BEFORE UPDATE ON public.app_revenue
  FOR EACH ROW
  EXECUTE FUNCTION update_aurev_updated_at();

-- =====================================================
-- 4. OpsGrid Contacts Table (for syncing SmartSend leads)
-- Used to store synced contacts from SmartSend
-- =====================================================
CREATE TABLE IF NOT EXISTS public.opsgrid_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  
  -- Contact info
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  company TEXT,
  title TEXT,
  phone TEXT,
  
  -- Cross-app reference
  smartsend_lead_id UUID, -- Reference to SmartSend lead
  
  -- Additional fields
  custom JSONB DEFAULT '{}'::jsonb,
  tags TEXT[] DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique per org and email
  UNIQUE(org_id, email)
);

CREATE INDEX IF NOT EXISTS idx_opsgrid_contacts_org ON public.opsgrid_contacts(org_id);
CREATE INDEX IF NOT EXISTS idx_opsgrid_contacts_email ON public.opsgrid_contacts(email);
CREATE INDEX IF NOT EXISTS idx_opsgrid_contacts_smartsend_id ON public.opsgrid_contacts(smartsend_lead_id);

-- RLS
ALTER TABLE public.opsgrid_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY opsgrid_contacts_read ON public.opsgrid_contacts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = opsgrid_contacts.org_id
      AND om.user_id = auth.uid()
    )
  );

-- Update trigger
CREATE TRIGGER update_opsgrid_contacts_updated_at
  BEFORE UPDATE ON public.opsgrid_contacts
  FOR EACH ROW
  EXECUTE FUNCTION update_aurev_updated_at();

-- =====================================================
-- 5. Helper Functions
-- =====================================================

-- Track monthly usage across modules
CREATE OR REPLACE FUNCTION track_aurev_usage(
  p_org_id UUID,
  p_module TEXT,
  p_year INTEGER,
  p_month INTEGER,
  p_usage_type TEXT,
  p_count INTEGER DEFAULT 1
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.aurev_usage_tracking (org_id, module, year, month, actions_count)
  VALUES (p_org_id, p_module, p_year, p_month, p_count)
  ON CONFLICT (org_id, module, year, month)
  DO UPDATE SET
    actions_count = aurev_usage_tracking.actions_count + p_count,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Log sync operation
CREATE OR REPLACE FUNCTION log_aurev_sync(
  p_org_id UUID,
  p_sync_type TEXT,
  p_source_module TEXT,
  p_target_module TEXT,
  p_records_synced INTEGER,
  p_status TEXT DEFAULT 'success',
  p_error_message TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO public.aurev_sync_logs (
    org_id, sync_type, source_module, target_module,
    records_synced, status, error_message, metadata
  )
  VALUES (
    p_org_id, p_sync_type, p_source_module, p_target_module,
    p_records_synced, p_status, p_error_message, p_metadata
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Calculate combined revenue for an org
CREATE OR REPLACE FUNCTION get_org_combined_revenue(p_org_id UUID, p_month DATE)
RETURNS TABLE (
  total_mrr NUMERIC,
  total_arr NUMERIC,
  active_subscriptions INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(mrr), 0)::NUMERIC as total_mrr,
    COALESCE(SUM(arr), 0)::NUMERIC as total_arr,
    COALESCE(SUM(active_subscriptions), 0)::INTEGER as active_subscriptions
  FROM public.app_revenue
  WHERE org_id = p_org_id
  AND month = p_month;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 6. Comments
-- =====================================================
COMMENT ON TABLE public.aurev_sync_logs IS 'Tracks all cross-app sync operations in AUREV ecosystem';
COMMENT ON TABLE public.aurev_usage_tracking IS 'Monthly usage tracking across all AUREV modules per org';
COMMENT ON TABLE public.app_revenue IS 'Revenue tracking per app and combined across AUREV ecosystem';
COMMENT ON TABLE public.opsgrid_contacts IS 'Contacts synced from SmartSend to OpsGrid for CRM operations';

COMMENT ON FUNCTION track_aurev_usage IS 'Track monthly usage across AUREV modules';
COMMENT ON FUNCTION log_aurev_sync IS 'Log sync operations between apps';
COMMENT ON FUNCTION get_org_combined_revenue IS 'Calculate combined revenue across all apps for an org';

-- =====================================================
-- 7. Sample Data Setup (for testing)
-- =====================================================
-- Note: This would be populated by actual usage from the apps

COMMENT ON SCHEMA public IS 'AUREV HQ Unified Ecosystem - One AI Operating System powering Communication ⚡ Operations ⚡ Agents';

