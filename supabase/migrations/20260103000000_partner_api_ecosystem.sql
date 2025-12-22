-- AUREV HQ Partner API Ecosystem Migration
-- Enables partner integrations, API keys, and webhook routing

-- =====================================================
-- 1. Partner API Keys Table
-- Tracks API keys for partner integrations
-- =====================================================
CREATE TABLE IF NOT EXISTS public.partner_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  
  -- Key details
  partner_name TEXT NOT NULL,
  api_key TEXT NOT NULL UNIQUE,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  
  -- Usage tracking
  last_used_at TIMESTAMPTZ,
  usage_count INTEGER DEFAULT 0,
  
  -- Metadata
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_api_keys_org ON public.partner_api_keys(org_id);
CREATE INDEX IF NOT EXISTS idx_partner_api_keys_key ON public.partner_api_keys(api_key);
CREATE INDEX IF NOT EXISTS idx_partner_api_keys_status ON public.partner_api_keys(status);

-- RLS
ALTER TABLE public.partner_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY partner_api_keys_read ON public.partner_api_keys
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = partner_api_keys.org_id
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY partner_api_keys_write ON public.partner_api_keys
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = partner_api_keys.org_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    )
  );

-- Update trigger
CREATE TRIGGER update_partner_api_keys_updated_at
  BEFORE UPDATE ON public.partner_api_keys
  FOR EACH ROW
  EXECUTE FUNCTION update_aurev_updated_at();

-- =====================================================
-- 2. Webhook Logs Table
-- Tracks incoming webhooks for debugging and analytics
-- =====================================================
CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Webhook details
  service TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  
  -- Processing
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processed', 'failed')),
  error_message TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_service ON public.webhook_logs(service);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_status ON public.webhook_logs(status);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created ON public.webhook_logs(created_at DESC);

-- RLS - service role only for webhook logs
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY webhook_logs_read ON public.webhook_logs
  FOR SELECT USING (auth.role() = 'service_role');

CREATE POLICY webhook_logs_write ON public.webhook_logs
  FOR ALL USING (auth.role() = 'service_role');

-- =====================================================
-- 3. Partner Integration Stats Table
-- Tracks usage metrics for partner integrations
-- =====================================================
CREATE TABLE IF NOT EXISTS public.partner_integration_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  
  -- Metrics
  api_calls_count INTEGER DEFAULT 0,
  successful_calls INTEGER DEFAULT 0,
  failed_calls INTEGER DEFAULT 0,
  
  -- Period
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- One record per org-integration-month
  UNIQUE(org_id, integration_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_partner_stats_org ON public.partner_integration_stats(org_id);
CREATE INDEX IF NOT EXISTS idx_partner_stats_integration ON public.partner_integration_stats(integration_id);
CREATE INDEX IF NOT EXISTS idx_partner_stats_period ON public.partner_integration_stats(year, month);

-- RLS
ALTER TABLE public.partner_integration_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY partner_stats_read ON public.partner_integration_stats
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = partner_integration_stats.org_id
      AND om.user_id = auth.uid()
    )
  );

-- Update trigger
CREATE TRIGGER update_partner_stats_updated_at
  BEFORE UPDATE ON public.partner_integration_stats
  FOR EACH ROW
  EXECUTE FUNCTION update_aurev_updated_at();

-- =====================================================
-- 4. Helper Functions
-- =====================================================

-- Verify partner API key
CREATE OR REPLACE FUNCTION verify_partner_api_key(p_api_key TEXT)
RETURNS TABLE (
  valid BOOLEAN,
  org_id UUID,
  partner_name TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    TRUE as valid,
    pk.org_id,
    pk.partner_name
  FROM public.partner_api_keys pk
  WHERE pk.api_key = p_api_key
  AND pk.status = 'active';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Track API key usage
CREATE OR REPLACE FUNCTION track_partner_api_usage(p_api_key_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.partner_api_keys
  SET 
    last_used_at = NOW(),
    usage_count = usage_count + 1
  WHERE id = p_api_key_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Increment integration stats
CREATE OR REPLACE FUNCTION increment_integration_stats(
  p_org_id UUID,
  p_integration_id UUID,
  p_success BOOLEAN
)
RETURNS VOID AS $$
DECLARE
  v_year INTEGER := EXTRACT(YEAR FROM CURRENT_DATE);
  v_month INTEGER := EXTRACT(MONTH FROM CURRENT_DATE);
BEGIN
  INSERT INTO public.partner_integration_stats (
    org_id, integration_id, year, month,
    api_calls_count, successful_calls, failed_calls
  )
  VALUES (
    p_org_id, p_integration_id, v_year, v_month,
    1, CASE WHEN p_success THEN 1 ELSE 0 END, CASE WHEN p_success THEN 0 ELSE 1 END
  )
  ON CONFLICT (org_id, integration_id, year, month)
  DO UPDATE SET
    api_calls_count = partner_integration_stats.api_calls_count + 1,
    successful_calls = partner_integration_stats.successful_calls + 
      CASE WHEN p_success THEN 1 ELSE 0 END,
    failed_calls = partner_integration_stats.failed_calls + 
      CASE WHEN p_success THEN 0 ELSE 1 END,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get integration usage summary
CREATE OR REPLACE FUNCTION get_integration_usage_summary(
  p_org_id UUID,
  p_year INTEGER DEFAULT NULL,
  p_month INTEGER DEFAULT NULL
)
RETURNS TABLE (
  integration_id UUID,
  integration_name TEXT,
  total_calls BIGINT,
  success_rate DECIMAL,
  avg_calls_per_day DECIMAL
) AS $$
DECLARE
  v_year INTEGER := COALESCE(p_year, EXTRACT(YEAR FROM CURRENT_DATE));
  v_month INTEGER := COALESCE(p_month, EXTRACT(MONTH FROM CURRENT_DATE));
BEGIN
  RETURN QUERY
  SELECT 
    pis.integration_id,
    i.display_name as integration_name,
    SUM(pis.api_calls_count) as total_calls,
    CASE 
      WHEN SUM(pis.api_calls_count) > 0 THEN
        (SUM(pis.successful_calls)::DECIMAL / SUM(pis.api_calls_count)::DECIMAL) * 100
      ELSE 0
    END as success_rate,
    (SUM(pis.api_calls_count)::DECIMAL / 
     EXTRACT(DAY FROM DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day')
    ) as avg_calls_per_day
  FROM public.partner_integration_stats pis
  JOIN public.integrations i ON pis.integration_id = i.id
  WHERE pis.org_id = p_org_id
  AND pis.year = v_year
  AND pis.month = v_month
  GROUP BY pis.integration_id, i.display_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 5. Comments
-- =====================================================
COMMENT ON TABLE public.partner_api_keys IS 'API keys for partner integrations with usage tracking';
COMMENT ON TABLE public.webhook_logs IS 'Logs of incoming webhooks from partner services';
COMMENT ON TABLE public.partner_integration_stats IS 'Monthly stats for partner integration usage';

COMMENT ON FUNCTION verify_partner_api_key IS 'Verify a partner API key and return org details';
COMMENT ON FUNCTION track_partner_api_usage IS 'Track API key usage for analytics';
COMMENT ON FUNCTION increment_integration_stats IS 'Increment integration stats for an API call';
COMMENT ON FUNCTION get_integration_usage_summary IS 'Get usage summary for all integrations';

-- =====================================================
-- 6. Sample Data (for testing)
-- =====================================================
-- Partner API keys are created through the UI, not seeded

COMMENT ON SCHEMA public IS 'AUREV HQ Unified Ecosystem - Partner API Layer for integrations';

