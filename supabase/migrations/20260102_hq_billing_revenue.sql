-- AUREV HQ Billing & Revenue Intelligence
-- Unified billing across SmartSend, OpsGrid, and Agent Cloud
-- Includes invoice line items, Stripe events, revenue rollups, and usage tracking

-- =====================================================
-- 1. Invoice Line Items (normalized from Stripe webhooks)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.billing_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app TEXT NOT NULL CHECK (app IN ('smartsend','opsgrid','agentcloud')),
  org_id UUID REFERENCES public.orgs(id) ON DELETE SET NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  invoice_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  product TEXT,   -- plan or metric name
  price_id TEXT,
  quantity NUMERIC,
  amount_total NUMERIC, -- cents
  currency TEXT DEFAULT 'usd',
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bli_invoice ON public.billing_line_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_bli_org ON public.billing_line_items(org_id);
CREATE INDEX IF NOT EXISTS idx_bli_workspace ON public.billing_line_items(workspace_id);
CREATE INDEX IF NOT EXISTS idx_bli_app ON public.billing_line_items(app);
CREATE INDEX IF NOT EXISTS idx_bli_period ON public.billing_line_items(period_end);

-- =====================================================
-- 2. Stripe Events (raw for audit trail)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.stripe_events (
  id TEXT PRIMARY KEY, -- Stripe event ID
  type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stripe_events_type ON public.stripe_events(type);
CREATE INDEX IF NOT EXISTS idx_stripe_events_created ON public.stripe_events(created_at DESC);

-- =====================================================
-- 3. Revenue Rollup Views
-- =====================================================
CREATE OR REPLACE VIEW public.vw_rev_this_month AS
SELECT 
  app,
  SUM(amount_total)/100.0 AS revenue_usd
FROM public.billing_line_items
WHERE DATE_TRUNC('month', period_end) = DATE_TRUNC('month', NOW())
GROUP BY app;

CREATE OR REPLACE VIEW public.vw_rev_by_plan AS
SELECT 
  app, 
  product AS plan, 
  SUM(amount_total)/100.0 AS revenue_usd
FROM public.billing_line_items
WHERE DATE_TRUNC('month', period_end) = DATE_TRUNC('month', NOW())
  AND product IN ('free','starter','growth','pro')
GROUP BY 1,2;

-- Monthly MRR (from recurring subscriptions)
CREATE OR REPLACE VIEW public.vw_mrr_by_app AS
SELECT 
  app,
  COUNT(DISTINCT customer_id) AS customers,
  SUM(amount_total)/100.0 AS mrr
FROM public.billing_line_items
WHERE DATE_TRUNC('month', period_end) = DATE_TRUNC('month', NOW())
  AND product IN ('starter','growth','pro')
  AND quantity = 1
GROUP BY app;

-- Total MRR and ARR
CREATE OR REPLACE VIEW public.vw_hq_overview AS
SELECT 
  (SELECT COALESCE(SUM(mrr), 0) FROM public.vw_mrr_by_app) AS total_mrr,
  (SELECT COALESCE(SUM(mrr), 0) * 12 FROM public.vw_mrr_by_app) AS total_arr,
  (SELECT COALESCE(SUM(revenue_usd), 0) FROM public.vw_rev_this_month) AS this_month_revenue;
  
-- =====================================================
-- 4. Usage Summaries (from metering tables per app)
-- =====================================================
CREATE OR REPLACE VIEW public.vw_usage_month AS
SELECT 
  app, 
  metric, 
  SUM(value) AS units
FROM (
  SELECT 'smartsend'::text AS app, metric, value 
  FROM public.billing_usage 
  WHERE DATE_TRUNC('month', period_start) = DATE_TRUNC('month', NOW())
  UNION ALL
  SELECT 'opsgrid'::text AS app, metric, value 
  FROM public.billing_usage_opsgrid
  WHERE DATE_TRUNC('month', period_start) = DATE_TRUNC('month', NOW())
  UNION ALL
  SELECT 'agentcloud'::text AS app, metric, value 
  FROM public.billing_usage_agent
  WHERE DATE_TRUNC('month', period_start) = DATE_TRUNC('month', NOW())
) u
GROUP BY 1,2
HAVING SUM(value) > 0;

-- =====================================================
-- 5. Usage tables for OpsGrid and AgentCloud (if not exists)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.billing_usage_opsgrid (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  metric TEXT NOT NULL,
  value INTEGER NOT NULL DEFAULT 0,
  period_start TIMESTAMPTZ NOT NULL DEFAULT DATE_TRUNC('month', NOW()),
  period_end TIMESTAMPTZ NOT NULL DEFAULT (DATE_TRUNC('month', NOW()) + INTERVAL '1 month'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.billing_usage_agent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  metric TEXT NOT NULL,
  value INTEGER NOT NULL DEFAULT 0,
  period_start TIMESTAMPTZ NOT NULL DEFAULT DATE_TRUNC('month', NOW()),
  period_end TIMESTAMPTZ NOT NULL DEFAULT (DATE_TRUNC('month', NOW()) + INTERVAL '1 month'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_usage_opsgrid_ws_metric_period ON public.billing_usage_opsgrid(workspace_id, metric, period_start);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_usage_agent_ws_metric_period ON public.billing_usage_agent(workspace_id, metric, period_start);

-- =====================================================
-- 6. RLS Policies
-- =====================================================
ALTER TABLE public.billing_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_usage_opsgrid ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_usage_agent ENABLE ROW LEVEL SECURITY;

-- Workspace members can see their own billing line items
CREATE POLICY "workspace_bli_select" ON public.billing_line_items 
  FOR SELECT USING (
    workspace_id IS NULL OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = billing_line_items.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- Org members can see org-wide billing line items
CREATE POLICY "org_bli_select" ON public.billing_line_items 
  FOR SELECT USING (
    org_id IS NULL OR EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = billing_line_items.org_id
      AND om.user_id = auth.uid()
    )
  );

-- Stripe events: authenticated users can read (audit trail)
CREATE POLICY "authenticated_events_select" ON public.stripe_events 
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Service role can insert/update everything (for webhooks)
CREATE POLICY "service_role_manage_bli" ON public.billing_line_items 
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_manage_events" ON public.stripe_events 
  FOR ALL USING (auth.role() = 'service_role');

-- Usage tables: workspace members + service role
CREATE POLICY "workspace_usage_opsgrid_select" ON public.billing_usage_opsgrid 
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = billing_usage_opsgrid.workspace_id
      AND wm.user_id = auth.uid()
    )
    OR auth.role() = 'service_role'
  );

CREATE POLICY "workspace_usage_agent_select" ON public.billing_usage_agent 
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = billing_usage_agent.workspace_id
      AND wm.user_id = auth.uid()
    )
    OR auth.role() = 'service_role'
  );

CREATE POLICY "service_role_manage_usage_opsgrid" ON public.billing_usage_opsgrid 
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_manage_usage_agent" ON public.billing_usage_agent 
  FOR ALL USING (auth.role() = 'service_role');

-- =====================================================
-- 7. Comments
-- =====================================================
COMMENT ON TABLE public.billing_line_items IS 'Normalized Stripe invoice line items for HQ revenue tracking';
COMMENT ON TABLE public.stripe_events IS 'Audit trail of Stripe webhook events';
COMMENT ON VIEW public.vw_rev_this_month IS 'Revenue by app for current month';
COMMENT ON VIEW public.vw_rev_by_plan IS 'Revenue by plan tier for current month';
COMMENT ON VIEW public.vw_mrr_by_app IS 'Monthly Recurring Revenue by app';
COMMENT ON VIEW public.vw_hq_overview IS 'High-level KPIs: MRR, ARR, this month revenue';
COMMENT ON VIEW public.vw_usage_month IS 'Usage metrics across all apps for current month';

