-- Stripe Connect Billing for AUREV HQ Unified Ecosystem
-- Enables sub-accounts for SmartSend, OpsGrid, and AgentCloud

-- =====================================================
-- 1. Stripe Connect Accounts Table
-- Tracks Connect accounts per org per app
-- =====================================================
CREATE TABLE IF NOT EXISTS public.stripe_connect_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  app TEXT NOT NULL CHECK (app IN ('smartsend', 'opsgrid', 'agentcloud', 'combined')),
  
  -- Stripe Connect Account
  stripe_account_id TEXT NOT NULL UNIQUE,
  account_type TEXT NOT NULL DEFAULT 'standard' CHECK (account_type IN ('standard', 'express', 'custom')),
  
  -- Account status
  charges_enabled BOOLEAN DEFAULT FALSE,
  payouts_enabled BOOLEAN DEFAULT FALSE,
  details_submitted BOOLEAN DEFAULT FALSE,
  
  -- Capabilities
  capabilities JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- One account per org-app combination
  UNIQUE(org_id, app)
);

CREATE INDEX IF NOT EXISTS idx_stripe_connect_accounts_org ON public.stripe_connect_accounts(org_id);
CREATE INDEX IF NOT EXISTS idx_stripe_connect_accounts_app ON public.stripe_connect_accounts(app);
CREATE INDEX IF NOT EXISTS idx_stripe_connect_accounts_stripe_id ON public.stripe_connect_accounts(stripe_account_id);

-- RLS
ALTER TABLE public.stripe_connect_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY stripe_connect_accounts_read ON public.stripe_connect_accounts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = stripe_connect_accounts.org_id
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY stripe_connect_accounts_write ON public.stripe_connect_accounts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = stripe_connect_accounts.org_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    )
  );

-- Update trigger
CREATE TRIGGER update_stripe_connect_accounts_updated_at
  BEFORE UPDATE ON public.stripe_connect_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_aurev_updated_at();

-- =====================================================
-- 2. Unified Billing Subscriptions Table
-- Tracks subscriptions across all AUREV apps
-- =====================================================
CREATE TABLE IF NOT EXISTS public.aurev_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  
  -- Stripe references
  stripe_customer_id TEXT NOT NULL,
  stripe_subscription_id TEXT UNIQUE,
  
  -- Plan details
  plan_tier TEXT NOT NULL CHECK (plan_tier IN ('basic', 'pro', 'enterprise', 'combined')),
  apps_included TEXT[] NOT NULL DEFAULT '{}'::text[], -- ['smartsend'], ['smartsend', 'opsgrid'], ['smartsend', 'opsgrid', 'agentcloud']
  
  -- Subscription status
  status TEXT NOT NULL DEFAULT 'incomplete' 
    CHECK (status IN ('incomplete', 'trialing', 'active', 'past_due', 'canceled', 'unpaid')),
  
  -- Billing period
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  
  -- Pricing
  price_id TEXT,
  amount_cents INTEGER,
  currency TEXT DEFAULT 'usd',
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aurev_subscriptions_org ON public.aurev_subscriptions(org_id);
CREATE INDEX IF NOT EXISTS idx_aurev_subscriptions_customer ON public.aurev_subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_aurev_subscriptions_sub ON public.aurev_subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_aurev_subscriptions_status ON public.aurev_subscriptions(status);

-- RLS
ALTER TABLE public.aurev_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY aurev_subscriptions_read ON public.aurev_subscriptions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = aurev_subscriptions.org_id
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY aurev_subscriptions_write ON public.aurev_subscriptions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = aurev_subscriptions.org_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    )
  );

-- Update trigger
CREATE TRIGGER update_aurev_subscriptions_updated_at
  BEFORE UPDATE ON public.aurev_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_aurev_updated_at();

-- =====================================================
-- 3. Usage-Based Billing Events
-- Track metered usage for Connect-enabled billing
-- =====================================================
CREATE TABLE IF NOT EXISTS public.aurev_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  app TEXT NOT NULL CHECK (app IN ('smartsend', 'opsgrid', 'agentcloud')),
  
  -- Event details
  event_type TEXT NOT NULL, -- 'email_sent', 'workflow_run', 'agent_message', etc.
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price_cents INTEGER, -- Optional: for variable pricing
  
  -- Billing context
  billing_month DATE NOT NULL,
  invoice_id TEXT, -- Stripe invoice ID when billed
  
  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aurev_usage_events_org ON public.aurev_usage_events(org_id);
CREATE INDEX IF NOT EXISTS idx_aurev_usage_events_app ON public.aurev_usage_events(app);
CREATE INDEX IF NOT EXISTS idx_aurev_usage_events_month ON public.aurev_usage_events(billing_month);
CREATE INDEX IF NOT EXISTS idx_aurev_usage_events_invoice ON public.aurev_usage_events(invoice_id);

-- RLS
ALTER TABLE public.aurev_usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY aurev_usage_events_read ON public.aurev_usage_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = aurev_usage_events.org_id
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY aurev_usage_events_write ON public.aurev_usage_events
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = aurev_usage_events.org_id
      AND om.user_id = auth.uid()
    )
  );

-- =====================================================
-- 4. Helper Functions
-- =====================================================

-- Check if org has active subscription for app(s)
CREATE OR REPLACE FUNCTION has_active_aurev_subscription(
  p_org_id UUID,
  p_apps TEXT[]
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.aurev_subscriptions
    WHERE org_id = p_org_id
    AND status IN ('trialing', 'active')
    AND current_period_end > NOW()
    AND apps_included && p_apps -- Arrays overlap
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get org's current subscription
CREATE OR REPLACE FUNCTION get_org_subscription(p_org_id UUID)
RETURNS TABLE (
  plan_tier TEXT,
  apps_included TEXT[],
  status TEXT,
  current_period_end TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.plan_tier,
    s.apps_included,
    s.status,
    s.current_period_end
  FROM public.aurev_subscriptions s
  WHERE s.org_id = p_org_id
  AND s.status IN ('trialing', 'active')
  ORDER BY s.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Track usage event
CREATE OR REPLACE FUNCTION track_usage_event(
  p_org_id UUID,
  p_app TEXT,
  p_event_type TEXT,
  p_quantity INTEGER DEFAULT 1,
  p_unit_price_cents INTEGER DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_event_id UUID;
  v_billing_month DATE;
BEGIN
  v_billing_month := DATE_TRUNC('month', CURRENT_DATE);
  
  INSERT INTO public.aurev_usage_events (
    org_id, app, event_type, quantity, unit_price_cents, billing_month
  )
  VALUES (
    p_org_id, p_app, p_event_type, p_quantity, p_unit_price_cents, v_billing_month
  )
  RETURNING id INTO v_event_id;
  
  -- Also update usage tracking
  PERFORM track_aurev_usage(
    p_org_id,
    p_app,
    EXTRACT(YEAR FROM v_billing_month)::INTEGER,
    EXTRACT(MONTH FROM v_billing_month)::INTEGER,
    p_event_type,
    p_quantity
  );
  
  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 5. Plan Configuration Table
-- Store available plan tiers and pricing
-- =====================================================
CREATE TABLE IF NOT EXISTS public.aurev_plan_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Plan details
  plan_tier TEXT NOT NULL UNIQUE CHECK (plan_tier IN ('basic', 'pro', 'enterprise', 'combined')),
  name TEXT NOT NULL,
  description TEXT,
  
  -- Included apps
  apps_included TEXT[] NOT NULL DEFAULT '{}'::text[],
  
  -- Pricing
  stripe_price_id TEXT NOT NULL UNIQUE,
  amount_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'usd',
  interval TEXT DEFAULT 'month' CHECK (interval IN ('month', 'year')),
  
  -- Features
  features JSONB DEFAULT '{}'::jsonb,
  
  -- Limits
  limits JSONB DEFAULT '{}'::jsonb,
  
  -- Display
  is_active BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aurev_plan_catalog_tier ON public.aurev_plan_catalog(plan_tier);
CREATE INDEX IF NOT EXISTS idx_aurev_plan_catalog_active ON public.aurev_plan_catalog(is_active);

-- Update trigger
CREATE TRIGGER update_aurev_plan_catalog_updated_at
  BEFORE UPDATE ON public.aurev_plan_catalog
  FOR EACH ROW
  EXECUTE FUNCTION update_aurev_updated_at();

-- =====================================================
-- 6. Comments
-- =====================================================
COMMENT ON TABLE public.stripe_connect_accounts IS 'Stripe Connect accounts for sub-account billing per app';
COMMENT ON TABLE public.aurev_subscriptions IS 'Unified billing subscriptions across all AUREV apps';
COMMENT ON TABLE public.aurev_usage_events IS 'Metered usage events for usage-based billing';
COMMENT ON TABLE public.aurev_plan_catalog IS 'Available AUREV plan tiers and pricing configuration';

COMMENT ON FUNCTION has_active_aurev_subscription IS 'Check if org has active subscription for specified apps';
COMMENT ON FUNCTION get_org_subscription IS 'Get org current subscription details';
COMMENT ON FUNCTION track_usage_event IS 'Track usage event and update billing metrics';

-- =====================================================
-- 7. Sample Plan Data (inserted manually or via API)
-- =====================================================
-- INSERT INTO public.aurev_plan_catalog (plan_tier, name, description, apps_included, stripe_price_id, amount_cents, features, limits)
-- VALUES
--   ('basic', 'AUREV Basic', 'SmartSend only', ARRAY['smartsend'], 'price_basic', 9900, '{"emails_per_month": 1000}'::jsonb, '{"users": 1}'::jsonb),
--   ('pro', 'AUREV Pro', 'SmartSend + OpsGrid', ARRAY['smartsend', 'opsgrid'], 'price_pro', 29000, '{"emails_per_month": 10000, "workflows": "unlimited"}'::jsonb, '{"users": 5}'::jsonb),
--   ('enterprise', 'AUREV Enterprise', 'All 3 apps', ARRAY['smartsend', 'opsgrid', 'agentcloud'], 'price_enterprise', 99000, '{"everything": "unlimited"}'::jsonb, '{"users": "unlimited"}'::jsonb);

