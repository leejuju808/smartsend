-- AUREV HQ Enterprise Expansion
-- Global scale infrastructure for enterprise clients, regional partners, and white-label operators
-- Target: 1,000+ orgs, 20 enterprise contracts, 5 regional HQ partners, $250K MRR by Dec 2026

-- =====================================================
-- 1. Enterprise Contracts Table
-- Tracks enterprise-level contracts and SLAs
-- =====================================================
CREATE TABLE IF NOT EXISTS public.enterprise_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  
  -- Contract Details
  contract_number TEXT UNIQUE NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('growth', 'scale', 'enterprise')),
  deployment_type TEXT NOT NULL CHECK (deployment_type IN ('cloud_multi_tenant', 'dedicated_instance', 'private_cloud', 'self_hosted')),
  
  -- Pricing
  monthly_price_usd NUMERIC(10, 2) NOT NULL,
  annual_price_usd NUMERIC(10, 2),
  contract_start_date DATE NOT NULL,
  contract_end_date DATE,
  auto_renew BOOLEAN DEFAULT true,
  
  -- SLA & Support
  uptime_sla_percent NUMERIC(5, 2) DEFAULT 99.95,
  support_level TEXT NOT NULL CHECK (support_level IN ('standard', 'priority', 'dedicated')),
  support_channels TEXT[] DEFAULT ARRAY['email']::TEXT[],
  
  -- Usage Limits
  max_users INTEGER,
  max_seats INTEGER,
  max_emails_per_month INTEGER,
  max_workflows INTEGER,
  max_agents INTEGER,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'suspended', 'canceled', 'expired')),
  
  -- Stripe Integration
  stripe_subscription_id TEXT,
  stripe_invoice_id TEXT,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(org_id)
);

CREATE INDEX IF NOT EXISTS idx_enterprise_contracts_org ON public.enterprise_contracts(org_id);
CREATE INDEX IF NOT EXISTS idx_enterprise_contracts_tier ON public.enterprise_contracts(tier);
CREATE INDEX IF NOT EXISTS idx_enterprise_contracts_status ON public.enterprise_contracts(status);
CREATE INDEX IF NOT EXISTS idx_enterprise_contracts_contract_number ON public.enterprise_contracts(contract_number);

-- RLS
ALTER TABLE public.enterprise_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY enterprise_contracts_read ON public.enterprise_contracts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = enterprise_contracts.org_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY enterprise_contracts_service_role ON public.enterprise_contracts
  FOR ALL USING (auth.role() = 'service_role');

-- =====================================================
-- 2. Regional Partners Table
-- Tracks regional reseller partnerships
-- =====================================================
CREATE TABLE IF NOT EXISTS public.regional_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Partner Info
  partner_name TEXT NOT NULL,
  region TEXT NOT NULL CHECK (region IN ('us_west', 'eu', 'apac', 'latam', 'africa')),
  city TEXT,
  country TEXT NOT NULL,
  
  -- Contact
  contact_email TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_phone TEXT,
  
  -- Business Details
  company_name TEXT NOT NULL,
  website_url TEXT,
  tax_id TEXT,
  
  -- Partnership Terms
  revenue_share_percent NUMERIC(5, 2) NOT NULL DEFAULT 25.00,
  minimum_orgs_required INTEGER DEFAULT 25,
  certification_level TEXT DEFAULT 'basic' CHECK (certification_level IN ('basic', 'certified', 'premier')),
  
  -- Status
  status TEXT NOT NULL DEFAULT 'prospect' CHECK (status IN ('prospect', 'onboarded', 'active', 'suspended', 'terminated')),
  onboarded_at TIMESTAMPTZ,
  
  -- Metrics
  active_orgs_count INTEGER DEFAULT 0,
  total_revenue_usd NUMERIC(12, 2) DEFAULT 0,
  last_payout_date DATE,
  
  -- Portal Access
  portal_enabled BOOLEAN DEFAULT false,
  portal_user_id UUID REFERENCES auth.users(id),
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_regional_partners_region ON public.regional_partners(region);
CREATE INDEX IF NOT EXISTS idx_regional_partners_status ON public.regional_partners(status);

-- RLS
ALTER TABLE public.regional_partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY regional_partners_read ON public.regional_partners
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.orgs o
      WHERE o.partner_id = regional_partners.id
      AND EXISTS (
        SELECT 1 FROM public.org_members om
        WHERE om.org_id = o.id AND om.user_id = auth.uid()
      )
    )
    OR auth.role() = 'service_role'
  );

CREATE POLICY regional_partners_service_role ON public.regional_partners
  FOR ALL USING (auth.role() = 'service_role');

-- =====================================================
-- 3. Partner-Org Linkage
-- Links organizations to regional partners
-- =====================================================
ALTER TABLE public.orgs
  ADD COLUMN IF NOT EXISTS partner_id UUID REFERENCES public.regional_partners(id),
  ADD COLUMN IF NOT EXISTS partner_onboarded_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orgs_partner ON public.orgs(partner_id);

-- =====================================================
-- 4. SSO Configuration Table
-- Stores SSO settings per organization
-- =====================================================
CREATE TABLE IF NOT EXISTS public.sso_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  
  -- SSO Provider
  provider_type TEXT NOT NULL CHECK (provider_type IN ('saml_2_0', 'azure_ad', 'google_workspace', 'okta', 'auth0')),
  provider_name TEXT NOT NULL,
  
  -- SAML 2.0 Configuration
  saml_entity_id TEXT,
  saml_sso_url TEXT,
  saml_certificate TEXT,
  saml_name_id_format TEXT DEFAULT 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
  
  -- OAuth/OIDC Configuration (for Azure AD, Google Workspace)
  oauth_client_id TEXT,
  oauth_client_secret_encrypted TEXT,
  oauth_authorization_url TEXT,
  oauth_token_url TEXT,
  oauth_userinfo_url TEXT,
  
  -- Attribute Mapping
  attribute_mapping JSONB DEFAULT '{}'::jsonb,
  
  -- Status
  enabled BOOLEAN DEFAULT false,
  test_mode BOOLEAN DEFAULT true,
  
  -- Metadata
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(org_id)
);

CREATE INDEX IF NOT EXISTS idx_sso_configurations_org ON public.sso_configurations(org_id);
CREATE INDEX IF NOT EXISTS idx_sso_configurations_provider ON public.sso_configurations(provider_type);

-- RLS
ALTER TABLE public.sso_configurations ENABLE ROW LEVEL SECURITY;

CREATE POLICY sso_configurations_read ON public.sso_configurations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = sso_configurations.org_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY sso_configurations_service_role ON public.sso_configurations
  FOR ALL USING (auth.role() = 'service_role');

-- =====================================================
-- 5. Enterprise Integrations Table
-- Tracks enterprise-level integrations (Salesforce, SAP, etc.)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.enterprise_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  
  -- Integration Type
  integration_type TEXT NOT NULL CHECK (integration_type IN ('salesforce', 'sap', 'servicenow', 'microsoft_365', 'google_workspace', 'hubspot')),
  integration_name TEXT NOT NULL,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'configuring', 'active', 'paused', 'error')),
  
  -- Configuration
  config JSONB DEFAULT '{}'::jsonb,
  credentials_encrypted TEXT,
  
  -- OAuth/API Keys
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  expires_at TIMESTAMPTZ,
  
  -- Sync Settings
  sync_enabled BOOLEAN DEFAULT true,
  sync_frequency TEXT DEFAULT 'realtime' CHECK (sync_frequency IN ('realtime', 'hourly', 'daily')),
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT,
  last_sync_error TEXT,
  
  -- Usage
  sync_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_enterprise_integrations_org ON public.enterprise_integrations(org_id);
CREATE INDEX IF NOT EXISTS idx_enterprise_integrations_type ON public.enterprise_integrations(integration_type);
CREATE INDEX IF NOT EXISTS idx_enterprise_integrations_status ON public.enterprise_integrations(status);

-- RLS
ALTER TABLE public.enterprise_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY enterprise_integrations_read ON public.enterprise_integrations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = enterprise_integrations.org_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin', 'member')
    )
  );

CREATE POLICY enterprise_integrations_service_role ON public.enterprise_integrations
  FOR ALL USING (auth.role() = 'service_role');

-- =====================================================
-- 6. Multi-Region Configuration
-- Tracks region assignments for orgs
-- =====================================================
CREATE TABLE IF NOT EXISTS public.region_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  
  -- Region
  region_code TEXT NOT NULL CHECK (region_code IN ('us_east', 'us_west', 'eu_west', 'eu_central', 'ap_southeast', 'ap_northeast', 'sa_east', 'af_south')),
  region_name TEXT NOT NULL,
  
  -- Infrastructure
  supabase_project_id TEXT,
  supabase_region_url TEXT,
  
  -- Status
  primary_region BOOLEAN DEFAULT true,
  active BOOLEAN DEFAULT true,
  
  -- Migration
  migration_status TEXT DEFAULT 'none' CHECK (migration_status IN ('none', 'scheduled', 'in_progress', 'completed', 'failed')),
  migration_scheduled_at TIMESTAMPTZ,
  migration_completed_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_region_assignments_org ON public.region_assignments(org_id);
CREATE INDEX IF NOT EXISTS idx_region_assignments_region ON public.region_assignments(region_code);
CREATE INDEX IF NOT EXISTS idx_region_assignments_primary ON public.region_assignments(org_id, primary_region) WHERE primary_region = true;

-- RLS
ALTER TABLE public.region_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY region_assignments_read ON public.region_assignments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = region_assignments.org_id
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY region_assignments_service_role ON public.region_assignments
  FOR ALL USING (auth.role() = 'service_role');

-- =====================================================
-- 7. Partner Revenue Tracking
-- Tracks revenue share and payouts
-- =====================================================
CREATE TABLE IF NOT EXISTS public.partner_revenue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.regional_partners(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  
  -- Revenue Period
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  
  -- Revenue Details
  gross_revenue_usd NUMERIC(10, 2) NOT NULL DEFAULT 0,
  revenue_share_percent NUMERIC(5, 2) NOT NULL,
  partner_share_usd NUMERIC(10, 2) NOT NULL DEFAULT 0,
  
  -- Payout
  payout_status TEXT DEFAULT 'pending' CHECK (payout_status IN ('pending', 'processing', 'paid', 'failed')),
  payout_date DATE,
  payout_transaction_id TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(partner_id, org_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_partner_revenue_partner ON public.partner_revenue(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_revenue_org ON public.partner_revenue(org_id);
CREATE INDEX IF NOT EXISTS idx_partner_revenue_period ON public.partner_revenue(year, month);
CREATE INDEX IF NOT EXISTS idx_partner_revenue_payout ON public.partner_revenue(payout_status);

-- RLS
ALTER TABLE public.partner_revenue ENABLE ROW LEVEL SECURITY;

CREATE POLICY partner_revenue_read ON public.partner_revenue
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.regional_partners rp
      WHERE rp.id = partner_revenue.partner_id
      AND rp.portal_user_id = auth.uid()
    )
    OR auth.role() = 'service_role'
  );

CREATE POLICY partner_revenue_service_role ON public.partner_revenue
  FOR ALL USING (auth.role() = 'service_role');

-- =====================================================
-- 8. Enterprise KPIs Tracking
-- Tracks enterprise expansion metrics
-- =====================================================
CREATE TABLE IF NOT EXISTS public.enterprise_kpis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Period
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  date DATE NOT NULL,
  
  -- Metrics
  active_orgs_count INTEGER DEFAULT 0,
  enterprise_clients_count INTEGER DEFAULT 0,
  regional_partners_count INTEGER DEFAULT 0,
  monthly_mrr_usd NUMERIC(12, 2) DEFAULT 0,
  avg_contract_value_usd NUMERIC(10, 2) DEFAULT 0,
  churn_rate_percent NUMERIC(5, 2) DEFAULT 0,
  uptime_percent NUMERIC(5, 2) DEFAULT 100.00,
  
  -- Regional Breakdown
  us_west_orgs INTEGER DEFAULT 0,
  eu_orgs INTEGER DEFAULT 0,
  apac_orgs INTEGER DEFAULT 0,
  latam_orgs INTEGER DEFAULT 0,
  africa_orgs INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(year, month, date)
);

CREATE INDEX IF NOT EXISTS idx_enterprise_kpis_period ON public.enterprise_kpis(year, month, date);

-- RLS - Public read for dashboard
ALTER TABLE public.enterprise_kpis ENABLE ROW LEVEL SECURITY;

CREATE POLICY enterprise_kpis_read ON public.enterprise_kpis
  FOR SELECT USING (true);

CREATE POLICY enterprise_kpis_service_role ON public.enterprise_kpis
  FOR ALL USING (auth.role() = 'service_role');

-- =====================================================
-- 9. Helper Functions
-- =====================================================

-- Function: Calculate partner revenue share
CREATE OR REPLACE FUNCTION calculate_partner_revenue_share(
  p_partner_id UUID,
  p_year INTEGER,
  p_month INTEGER
)
RETURNS NUMERIC(10, 2)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_revenue NUMERIC(10, 2);
  v_revenue_share NUMERIC(5, 2);
  v_partner_share NUMERIC(10, 2);
BEGIN
  -- Get partner revenue share percentage
  SELECT revenue_share_percent INTO v_revenue_share
  FROM public.regional_partners
  WHERE id = p_partner_id;
  
  -- Calculate total revenue from partner's orgs
  SELECT COALESCE(SUM(monthly_price_usd), 0) INTO v_total_revenue
  FROM public.enterprise_contracts ec
  JOIN public.orgs o ON o.id = ec.org_id
  WHERE o.partner_id = p_partner_id
  AND ec.status = 'active'
  AND EXTRACT(YEAR FROM contract_start_date) <= p_year
  AND EXTRACT(MONTH FROM contract_start_date) <= p_month;
  
  -- Calculate share
  v_partner_share := v_total_revenue * (v_revenue_share / 100);
  
  RETURN v_partner_share;
END;
$$;

-- Function: Update enterprise KPI metrics
CREATE OR REPLACE FUNCTION update_enterprise_kpis()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_date DATE := CURRENT_DATE;
  v_year INTEGER := EXTRACT(YEAR FROM v_date);
  v_month INTEGER := EXTRACT(MONTH FROM v_date);
  v_active_orgs INTEGER;
  v_enterprise_clients INTEGER;
  v_regional_partners INTEGER;
  v_mrr NUMERIC(12, 2);
BEGIN
  -- Count active orgs
  SELECT COUNT(*) INTO v_active_orgs
  FROM public.orgs
  WHERE EXISTS (
    SELECT 1 FROM public.org_members om
    WHERE om.org_id = orgs.id
    AND om.created_at > NOW() - INTERVAL '90 days'
  );
  
  -- Count enterprise clients
  SELECT COUNT(*) INTO v_enterprise_clients
  FROM public.enterprise_contracts
  WHERE status = 'active'
  AND tier = 'enterprise';
  
  -- Count active regional partners
  SELECT COUNT(*) INTO v_regional_partners
  FROM public.regional_partners
  WHERE status = 'active'
  AND active_orgs_count >= minimum_orgs_required;
  
  -- Calculate MRR
  SELECT COALESCE(SUM(monthly_price_usd), 0) INTO v_mrr
  FROM public.enterprise_contracts
  WHERE status = 'active';
  
  -- Upsert KPI record
  INSERT INTO public.enterprise_kpis (
    year, month, date,
    active_orgs_count,
    enterprise_clients_count,
    regional_partners_count,
    monthly_mrr_usd
  ) VALUES (
    v_year, v_month, v_date,
    v_active_orgs,
    v_enterprise_clients,
    v_regional_partners,
    v_mrr
  )
  ON CONFLICT (year, month, date)
  DO UPDATE SET
    active_orgs_count = EXCLUDED.active_orgs_count,
    enterprise_clients_count = EXCLUDED.enterprise_clients_count,
    regional_partners_count = EXCLUDED.regional_partners_count,
    monthly_mrr_usd = EXCLUDED.monthly_mrr_usd,
    updated_at = NOW();
END;
$$;

-- Function: Check if org has enterprise contract
CREATE OR REPLACE FUNCTION has_enterprise_contract(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.enterprise_contracts
    WHERE org_id = p_org_id
    AND status = 'active'
  );
$$;

-- Trigger: Update updated_at
CREATE TRIGGER update_enterprise_contracts_updated_at
  BEFORE UPDATE ON public.enterprise_contracts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_regional_partners_updated_at
  BEFORE UPDATE ON public.regional_partners
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_sso_configurations_updated_at
  BEFORE UPDATE ON public.sso_configurations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_enterprise_integrations_updated_at
  BEFORE UPDATE ON public.enterprise_integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_region_assignments_updated_at
  BEFORE UPDATE ON public.region_assignments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_partner_revenue_updated_at
  BEFORE UPDATE ON public.partner_revenue
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_enterprise_kpis_updated_at
  BEFORE UPDATE ON public.enterprise_kpis
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- 10. Seed Data: Regional Partner Targets
-- =====================================================
INSERT INTO public.regional_partners (partner_name, region, city, country, contact_email, contact_name, company_name, status, minimum_orgs_required, revenue_share_percent)
VALUES
  ('US West Partner', 'us_west', 'Seattle', 'USA', 'partner-usw@example.com', 'Partner USW', 'Partner USW Inc', 'prospect', 25, 25.00),
  ('EU Partner', 'eu', 'Berlin', 'Germany', 'partner-eu@example.com', 'Partner EU', 'Partner EU GmbH', 'prospect', 25, 25.00),
  ('APAC Partner', 'apac', 'Singapore', 'Singapore', 'partner-apac@example.com', 'Partner APAC', 'Partner APAC Pte Ltd', 'prospect', 25, 25.00),
  ('LATAM Partner', 'latam', 'São Paulo', 'Brazil', 'partner-latam@example.com', 'Partner LATAM', 'Partner LATAM Ltda', 'prospect', 25, 25.00),
  ('Africa Partner', 'africa', 'Nairobi', 'Kenya', 'partner-africa@example.com', 'Partner Africa', 'Partner Africa Ltd', 'prospect', 25, 25.00)
ON CONFLICT DO NOTHING;

