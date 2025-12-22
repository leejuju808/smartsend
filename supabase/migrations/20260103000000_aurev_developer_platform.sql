-- AUREV HQ Developer Platform
-- Open platform for building, deploying, and monetizing extensions
-- Jan 2026

-- =====================================================
-- 1. Extensions Table
-- =====================================================
CREATE TABLE IF NOT EXISTS public.extensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Extension metadata
  name TEXT NOT NULL,
  description TEXT,
  long_description TEXT,
  category TEXT CHECK (category IN ('automation', 'ai', 'integration', 'analytics', 'communication', 'workflow')),
  repo_url TEXT,
  docs_url TEXT,
  support_url TEXT,
  
  -- Pricing configuration
  pricing JSONB DEFAULT '{"type": "free"}'::jsonb,
  -- Example: {"type": "free"} or {"type": "paid", "amount": 1000, "currency": "usd", "interval": "month"}
  -- Or: {"type": "usage", "pricePerCall": 5, "currency": "usd"}
  
  -- Metadata
  tags TEXT[] DEFAULT '{}',
  icon_url TEXT,
  screenshots TEXT[] DEFAULT '{}',
  
  -- Approval workflow
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'suspended')),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Marketplace visibility
  is_public BOOLEAN DEFAULT true,
  install_count INTEGER DEFAULT 0,
  rating_sum DECIMAL DEFAULT 0,
  rating_count INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_extensions_developer ON public.extensions(developer_id);
CREATE INDEX IF NOT EXISTS idx_extensions_status ON public.extensions(status);
CREATE INDEX IF NOT EXISTS idx_extensions_category ON public.extensions(category);
CREATE INDEX IF NOT EXISTS idx_extensions_public ON public.extensions(is_public, status);

-- RLS
ALTER TABLE public.extensions ENABLE ROW LEVEL SECURITY;

CREATE POLICY extensions_read_public ON public.extensions
  FOR SELECT USING (is_public = true AND status = 'approved');

CREATE POLICY extensions_read_developer ON public.extensions
  FOR SELECT USING (developer_id = auth.uid());

CREATE POLICY extensions_insert_developer ON public.extensions
  FOR INSERT WITH CHECK (developer_id = auth.uid());

CREATE POLICY extensions_update_developer ON public.extensions
  FOR UPDATE USING (developer_id = auth.uid());

-- =====================================================
-- 2. Extension Installations Table
-- Track which orgs have installed which extensions
-- =====================================================
CREATE TABLE IF NOT EXISTS public.extension_installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extension_id UUID NOT NULL REFERENCES public.extensions(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  
  -- Installation metadata
  installed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  config JSONB DEFAULT '{}'::jsonb,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'uninstalled')),
  
  -- Timestamps
  installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uninstalled_at TIMESTAMPTZ,
  
  UNIQUE(extension_id, org_id)
);

CREATE INDEX IF NOT EXISTS idx_ext_installs_extension ON public.extension_installations(extension_id);
CREATE INDEX IF NOT EXISTS idx_ext_installs_org ON public.extension_installations(org_id);
CREATE INDEX IF NOT EXISTS idx_ext_installs_status ON public.extension_installations(status);

-- RLS
ALTER TABLE public.extension_installations ENABLE ROW LEVEL SECURITY;

CREATE POLICY ext_installs_read_member ON public.extension_installations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = extension_installations.org_id
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY ext_installs_insert_admin ON public.extension_installations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = extension_installations.org_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    )
  );

-- =====================================================
-- 3. Extension Payouts Table
-- Track revenue shares and payouts to developers
-- =====================================================
CREATE TABLE IF NOT EXISTS public.extension_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extension_id UUID NOT NULL REFERENCES public.extensions(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.orgs(id) ON DELETE SET NULL,
  
  -- Financial details
  amount_cents BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  revenue_share_pct NUMERIC(5, 2) NOT NULL, -- Platform % taken
  
  -- Transaction details
  subscription_id TEXT,
  usage_event_id TEXT,
  stripe_payout_id TEXT,
  
  -- Payout status
  status TEXT NOT NULL DEFAULT 'accrued' CHECK (status IN ('accrued', 'queued', 'paid', 'failed', 'refunded')),
  
  -- Metadata
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ext_payouts_extension ON public.extension_payouts(extension_id);
CREATE INDEX IF NOT EXISTS idx_ext_payouts_status ON public.extension_payouts(status);
CREATE INDEX IF NOT EXISTS idx_ext_payouts_stripe ON public.extension_payouts(stripe_payout_id);

-- RLS
ALTER TABLE public.extension_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY ext_payouts_read_developer ON public.extension_payouts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.extensions e
      WHERE e.id = extension_payouts.extension_id
      AND e.developer_id = auth.uid()
    )
  );

-- =====================================================
-- 4. Developer API Keys Table
-- Enhanced API keys for developer platform access
-- =====================================================
CREATE TABLE IF NOT EXISTS public.developer_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Key metadata
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL, -- Store hashed API key only
  
  -- Scoping
  org_id UUID REFERENCES public.orgs(id) ON DELETE CASCADE, -- NULL = global access
  scope TEXT[] DEFAULT ARRAY['read', 'write'], -- API scopes
  
  -- Limits
  rate_limit_per_min INTEGER DEFAULT 100,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'suspended')),
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_dev_keys_user ON public.developer_api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_dev_keys_hash ON public.developer_api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_dev_keys_org ON public.developer_api_keys(org_id);
CREATE INDEX IF NOT EXISTS idx_dev_keys_status ON public.developer_api_keys(status);

-- RLS
ALTER TABLE public.developer_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY dev_keys_read_owner ON public.developer_api_keys
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY dev_keys_insert_owner ON public.developer_api_keys
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY dev_keys_update_owner ON public.developer_api_keys
  FOR UPDATE USING (user_id = auth.uid());

-- =====================================================
-- 5. API Usage Tracking Table
-- Track API calls per developer key
-- =====================================================
CREATE TABLE IF NOT EXISTS public.developer_api_usage (
  key_id UUID NOT NULL REFERENCES public.developer_api_keys(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL, -- Truncated to minute
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER,
  count INTEGER NOT NULL DEFAULT 0,
  total_duration_ms INTEGER DEFAULT 0,
  
  PRIMARY KEY (key_id, window_start, endpoint, method)
);

CREATE INDEX IF NOT EXISTS idx_dev_api_usage_key ON public.developer_api_usage(key_id);
CREATE INDEX IF NOT EXISTS idx_dev_api_usage_window ON public.developer_api_usage(window_start);
CREATE INDEX IF NOT EXISTS idx_dev_api_usage_endpoint ON public.developer_api_usage(endpoint);

-- Helper function to increment usage atomically
CREATE OR REPLACE FUNCTION developer_api_usage_inc(
  p_key_id UUID,
  p_endpoint TEXT,
  p_method TEXT,
  p_status_code INTEGER,
  p_duration_ms INTEGER DEFAULT 0
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now TIMESTAMPTZ := date_trunc('minute', NOW());
  v_count INTEGER;
BEGIN
  INSERT INTO public.developer_api_usage(key_id, window_start, endpoint, method, status_code, count, total_duration_ms)
    VALUES (p_key_id, v_now, p_endpoint, p_method, p_status_code, 1, p_duration_ms)
  ON CONFLICT (key_id, window_start, endpoint, method)
    DO UPDATE SET
      count = developer_api_usage.count + 1,
      status_code = p_status_code,
      total_duration_ms = developer_api_usage.total_duration_ms + p_duration_ms
  RETURNING count INTO v_count;
  
  RETURN v_count;
END;
$$;

-- =====================================================
-- 6. White-Label Deployments Table
-- Track partner-branded deployments
-- =====================================================
CREATE TABLE IF NOT EXISTS public.white_label_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  
  -- Branding
  brand_name TEXT NOT NULL,
  logo_url TEXT,
  primary_color TEXT,
  custom_domain TEXT UNIQUE,
  
  -- Deployment config
  enabled_modules TEXT[] DEFAULT ARRAY['smartsend', 'opsgrid', 'agentcloud'],
  config JSONB DEFAULT '{}'::jsonb,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'terminated')),
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activated_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_white_label_partner ON public.white_label_deployments(partner_id);
CREATE INDEX IF NOT EXISTS idx_white_label_domain ON public.white_label_deployments(custom_domain);
CREATE INDEX IF NOT EXISTS idx_white_label_status ON public.white_label_deployments(status);

-- RLS
ALTER TABLE public.white_label_deployments ENABLE ROW LEVEL SECURITY;

CREATE POLICY white_label_read_partner ON public.white_label_deployments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = white_label_deployments.partner_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    )
  );

-- =====================================================
-- 7. Update Triggers
-- =====================================================
CREATE TRIGGER update_extensions_updated_at
  BEFORE UPDATE ON public.extensions
  FOR EACH ROW
  EXECUTE FUNCTION update_aurev_updated_at();

CREATE TRIGGER update_white_label_updated_at
  BEFORE UPDATE ON public.white_label_deployments
  FOR EACH ROW
  EXECUTE FUNCTION update_aurev_updated_at();

-- =====================================================
-- 8. Helper Functions
-- =====================================================

-- Track extension installation
CREATE OR REPLACE FUNCTION track_extension_install(
  p_extension_id UUID,
  p_org_id UUID,
  p_installed_by UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_install_id UUID;
BEGIN
  -- Create installation record
  INSERT INTO public.extension_installations (extension_id, org_id, installed_by)
  VALUES (p_extension_id, p_org_id, p_installed_by)
  ON CONFLICT (extension_id, org_id) DO UPDATE
  SET status = 'active',
      uninstalled_at = NULL
  RETURNING id INTO v_install_id;
  
  -- Increment install count
  UPDATE public.extensions
  SET install_count = install_count + 1
  WHERE id = p_extension_id;
  
  RETURN v_install_id;
END;
$$;

-- Track extension uninstall
CREATE OR REPLACE FUNCTION track_extension_uninstall(
  p_extension_id UUID,
  p_org_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.extension_installations
  SET status = 'uninstalled',
      uninstalled_at = NOW()
  WHERE extension_id = p_extension_id
    AND org_id = p_org_id;
END;
$$;

-- Get developer dashboard stats
CREATE OR REPLACE FUNCTION get_developer_stats(p_developer_id UUID)
RETURNS TABLE (
  total_extensions BIGINT,
  approved_extensions BIGINT,
  total_installs BIGINT,
  total_payouts_cents BIGINT,
  pending_payouts_cents BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*)::BIGINT FROM public.extensions WHERE developer_id = p_developer_id) as total_extensions,
    (SELECT COUNT(*)::BIGINT FROM public.extensions WHERE developer_id = p_developer_id AND status = 'approved') as approved_extensions,
    (SELECT COALESCE(SUM(install_count), 0)::BIGINT FROM public.extensions WHERE developer_id = p_developer_id) as total_installs,
    (SELECT COALESCE(SUM(amount_cents), 0)::BIGINT 
     FROM public.extension_payouts ep
     JOIN public.extensions e ON e.id = ep.extension_id
     WHERE e.developer_id = p_developer_id AND ep.status = 'paid') as total_payouts_cents,
    (SELECT COALESCE(SUM(amount_cents), 0)::BIGINT
     FROM public.extension_payouts ep
     JOIN public.extensions e ON e.id = ep.extension_id
     WHERE e.developer_id = p_developer_id AND ep.status = 'accrued') as pending_payouts_cents;
END;
$$;

-- =====================================================
-- 9. Comments
-- =====================================================
COMMENT ON TABLE public.extensions IS 'Extensions marketplace for AUREV developer platform';
COMMENT ON TABLE public.extension_installations IS 'Track which orgs have installed which extensions';
COMMENT ON TABLE public.extension_payouts IS 'Revenue sharing and payouts to extension developers';
COMMENT ON TABLE public.developer_api_keys IS 'API keys for developer platform access';
COMMENT ON TABLE public.developer_api_usage IS 'Track API usage per developer key';
COMMENT ON TABLE public.white_label_deployments IS 'Partner-branded white-label deployments';

COMMENT ON FUNCTION track_extension_install IS 'Track extension installation and increment install count';
COMMENT ON FUNCTION track_extension_uninstall IS 'Mark extension as uninstalled';
COMMENT ON FUNCTION get_developer_stats IS 'Get comprehensive stats for developer dashboard';
COMMENT ON FUNCTION developer_api_usage_inc IS 'Atomically increment API usage counters';

