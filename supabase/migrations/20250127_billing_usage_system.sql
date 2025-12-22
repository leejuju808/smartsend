-- Billing + Usage System for SmartSend
-- This migration creates tables for subscription tracking, usage metrics, and plan limits
-- Based on workspace_id multi-tenant structure

-- 1. Billing Subscriptions (workspace-level)
CREATE TABLE IF NOT EXISTS public.billing_subscriptions (
  id TEXT PRIMARY KEY, -- Stripe subscription ID
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL, -- Stripe customer ID
  plan TEXT NOT NULL CHECK (plan IN ('free','starter','growth','pro')),
  status TEXT NOT NULL CHECK (status IN ('active','trialing','canceled','past_due','incomplete','unpaid')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_billing_subscriptions_workspace ON public.billing_subscriptions(workspace_id);

-- 2. Usage Metrics (workspace-level monthly tracking)
CREATE TABLE IF NOT EXISTS public.billing_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  metric TEXT NOT NULL CHECK (metric IN ('emails_sent','inbox_size','team_members')),
  value INTEGER NOT NULL DEFAULT 0,
  period_start TIMESTAMPTZ NOT NULL DEFAULT date_trunc('month', NOW()),
  period_end TIMESTAMPTZ NOT NULL DEFAULT (date_trunc('month', NOW()) + INTERVAL '1 month'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_usage_workspace_metric_period ON public.billing_usage(workspace_id, metric, period_start);
CREATE INDEX IF NOT EXISTS idx_billing_usage_workspace ON public.billing_usage(workspace_id);

-- 3. Enable RLS
ALTER TABLE public.billing_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_usage ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for billing_subscriptions
DROP POLICY IF EXISTS "workspace_read_subscription" ON public.billing_subscriptions;
CREATE POLICY "workspace_read_subscription" ON public.billing_subscriptions
  FOR SELECT USING (public.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "workspace_admin_manage_subscription" ON public.billing_subscriptions;
CREATE POLICY "workspace_admin_manage_subscription" ON public.billing_subscriptions
  FOR ALL USING (public.is_workspace_admin(workspace_id))
  WITH CHECK (public.is_workspace_admin(workspace_id));

-- Service role can manage all subscriptions (for webhooks)
DROP POLICY IF EXISTS "service_role_manage_subscriptions" ON public.billing_subscriptions;
CREATE POLICY "service_role_manage_subscriptions" ON public.billing_subscriptions
  FOR ALL USING (auth.role() = 'service_role');

-- 5. RLS Policies for billing_usage
DROP POLICY IF EXISTS "workspace_read_usage" ON public.billing_usage;
CREATE POLICY "workspace_read_usage" ON public.billing_usage
  FOR SELECT USING (public.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "service_role_manage_usage" ON public.billing_usage;
CREATE POLICY "service_role_manage_usage" ON public.billing_usage
  FOR ALL USING (auth.role() = 'service_role');

-- 6. Helper function: increment_usage
CREATE OR REPLACE FUNCTION public.increment_usage(p_workspace_id UUID, p_metric TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.billing_usage (workspace_id, metric, value)
  VALUES (p_workspace_id, p_metric, 1)
  ON CONFLICT (workspace_id, metric, period_start)
  DO UPDATE SET 
    value = public.billing_usage.value + 1, 
    updated_at = NOW();
END;
$$;

-- Grant execute to service_role only
REVOKE ALL ON FUNCTION public.increment_usage(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_usage(UUID, TEXT) TO service_role;

-- 7. Helper function: get_workspace_usage
CREATE OR REPLACE FUNCTION public.get_workspace_usage(p_workspace_id UUID)
RETURNS TABLE (
  metric TEXT,
  value INTEGER,
  period_start TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.metric, u.value, u.period_start
  FROM public.billing_usage u
  WHERE u.workspace_id = p_workspace_id
    AND u.period_start = date_trunc('month', NOW())
  ORDER BY u.metric;
$$;

REVOKE ALL ON FUNCTION public.get_workspace_usage(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_workspace_usage(UUID) TO authenticated;

-- 8. Comment tables
COMMENT ON TABLE public.billing_subscriptions IS 'Stripe subscription data per workspace';
COMMENT ON TABLE public.billing_usage IS 'Monthly usage metrics per workspace';
COMMENT ON FUNCTION public.increment_usage IS 'Increments usage counter for workspace+metric+period';
COMMENT ON FUNCTION public.get_workspace_usage IS 'Returns current month usage for a workspace';

