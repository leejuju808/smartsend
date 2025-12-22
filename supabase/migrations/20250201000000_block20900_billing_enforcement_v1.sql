-- =========================================================
-- Block 20900 — SmartSend Billing Enforcement v1
-- (Stripe Subscription Enforcement • Plan Limits • Feature Gating • Seats • Email Sending Caps)
-- =========================================================

-- ============================================================================
-- PART 1 — Subscriptions Table (Organization-Level)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  stripe_customer_id text,
  stripe_subscription_id text UNIQUE,
  plan text NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter', 'growth', 'domination')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'canceled', 'trialing')),
  period_end timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(organization_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_org ON public.subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON public.subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription ON public.subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan ON public.subscriptions(plan);

COMMENT ON TABLE public.subscriptions IS 'Block 20900: Organization-level Stripe subscriptions driving access control';
COMMENT ON COLUMN public.subscriptions.plan IS 'Subscription plan: starter, growth, domination';
COMMENT ON COLUMN public.subscriptions.status IS 'Stripe subscription status: active, past_due, canceled, trialing';

-- ============================================================================
-- PART 2 — Email Usage Tracking Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.email_usage (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  month text NOT NULL, -- Format: 'YYYY-MM'
  emails_sent integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (organization_id, month)
);

CREATE INDEX IF NOT EXISTS idx_email_usage_org_month ON public.email_usage(organization_id, month DESC);
CREATE INDEX IF NOT EXISTS idx_email_usage_month ON public.email_usage(month);

COMMENT ON TABLE public.email_usage IS 'Block 20900: Monthly email sending usage tracking per organization';

-- ============================================================================
-- PART 3 — Plan Limits Configuration
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_plan_limits_20900(p_plan text)
RETURNS TABLE (
  max_campaigns integer,
  monthly_email_limit integer,
  max_seats integer
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    CASE lower(coalesce(p_plan, 'starter'))
      WHEN 'starter' THEN 1
      WHEN 'growth' THEN 3
      WHEN 'domination' THEN NULL::integer  -- unlimited
      ELSE 1
    END as max_campaigns,
    CASE lower(coalesce(p_plan, 'starter'))
      WHEN 'starter' THEN 500
      WHEN 'growth' THEN 2000
      WHEN 'domination' THEN 20000  -- soft cap to prevent abuse
      ELSE 500
    END as monthly_email_limit,
    CASE lower(coalesce(p_plan, 'starter'))
      WHEN 'starter' THEN 2  -- 1 owner + 1 seat
      WHEN 'growth' THEN 3
      WHEN 'domination' THEN NULL::integer  -- unlimited
      ELSE 2
    END as max_seats;
$$;

COMMENT ON FUNCTION public.get_plan_limits_20900(text) IS 'Block 20900: Returns plan limits for campaigns, emails, and seats';

-- ============================================================================
-- PART 4 — Get Organization Subscription Info
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_org_subscription_20900(p_org_id uuid)
RETURNS TABLE (
  organization_id uuid,
  plan text,
  status text,
  stripe_customer_id text,
  stripe_subscription_id text,
  period_end timestamptz,
  max_campaigns integer,
  monthly_email_limit integer,
  max_seats integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subscription record;
  v_limits record;
BEGIN
  -- Get subscription info
  SELECT * INTO v_subscription
  FROM public.subscriptions
  WHERE organization_id = p_org_id;

  -- Default to starter if no subscription record
  IF v_subscription IS NULL THEN
    SELECT * INTO v_limits FROM public.get_plan_limits_20900('starter');
    RETURN QUERY SELECT
      p_org_id,
      'starter'::text,
      'active'::text,
      NULL::text,
      NULL::text,
      NULL::timestamptz,
      v_limits.max_campaigns,
      v_limits.monthly_email_limit,
      v_limits.max_seats;
    RETURN;
  END IF;

  -- Get plan limits
  SELECT * INTO v_limits FROM public.get_plan_limits_20900(v_subscription.plan);

  RETURN QUERY SELECT
    v_subscription.organization_id,
    v_subscription.plan,
    v_subscription.status,
    v_subscription.stripe_customer_id,
    v_subscription.stripe_subscription_id,
    v_subscription.period_end,
    v_limits.max_campaigns,
    v_limits.monthly_email_limit,
    v_limits.max_seats;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_org_subscription_20900(uuid) TO authenticated, service_role;

-- ============================================================================
-- PART 5 — Campaign Limit Enforcement
-- ============================================================================

CREATE OR REPLACE FUNCTION public.can_create_campaign_20900(p_org_id uuid)
RETURNS TABLE (
  allowed boolean,
  current_count integer,
  max_allowed integer,
  plan text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subscription record;
  v_active_count integer;
BEGIN
  -- Get subscription info
  SELECT * INTO v_subscription FROM public.get_org_subscription_20900(p_org_id);

  -- Check if subscription is active
  IF v_subscription.status NOT IN ('active', 'trialing') THEN
    SELECT COUNT(*)::integer INTO v_active_count
    FROM public.campaigns
    WHERE org_id = p_org_id AND status IN ('active', 'running', 'scheduled', 'draft');
    
    RETURN QUERY SELECT false, v_active_count, v_subscription.max_campaigns, v_subscription.plan;
    RETURN;
  END IF;

  -- Count active campaigns
  SELECT COUNT(*)::integer INTO v_active_count
  FROM public.campaigns
  WHERE org_id = p_org_id AND status IN ('active', 'running', 'scheduled', 'draft');

  -- Check campaign limit
  IF v_subscription.max_campaigns IS NULL THEN
    -- Unlimited
    RETURN QUERY SELECT true, v_active_count, NULL::integer, v_subscription.plan;
  ELSE
    RETURN QUERY SELECT
      (v_active_count < v_subscription.max_campaigns) as allowed,
      v_active_count,
      v_subscription.max_campaigns,
      v_subscription.plan;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_create_campaign_20900(uuid) TO authenticated, service_role;

-- ============================================================================
-- PART 6 — Email Sending Limit Enforcement
-- ============================================================================

CREATE OR REPLACE FUNCTION public.can_send_emails_20900(
  p_org_id uuid,
  p_emails_to_send integer DEFAULT 1
)
RETURNS TABLE (
  allowed boolean,
  current_count integer,
  limit_amount integer,
  remaining integer,
  plan text,
  month text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subscription record;
  v_usage record;
  v_current_month text;
  v_current_count integer;
BEGIN
  -- Get subscription info
  SELECT * INTO v_subscription FROM public.get_org_subscription_20900(p_org_id);

  -- Check if subscription is active
  IF v_subscription.status NOT IN ('active', 'trialing') THEN
    RETURN QUERY SELECT
      false,
      0,
      v_subscription.monthly_email_limit,
      0,
      v_subscription.plan,
      to_char(now(), 'YYYY-MM');
    RETURN;
  END IF;

  -- Get current month
  v_current_month := to_char(now(), 'YYYY-MM');

  -- Get or create usage record
  SELECT * INTO v_usage
  FROM public.email_usage
  WHERE organization_id = p_org_id AND month = v_current_month;

  IF v_usage IS NULL THEN
    -- Create new usage record
    INSERT INTO public.email_usage (organization_id, month, emails_sent)
    VALUES (p_org_id, v_current_month, 0)
    RETURNING * INTO v_usage;
  END IF;

  v_current_count := coalesce(v_usage.emails_sent, 0);

  -- Check limit
  IF v_subscription.monthly_email_limit IS NULL THEN
    -- Unlimited (domination plan)
    RETURN QUERY SELECT
      true,
      v_current_count,
      NULL::integer,
      NULL::integer,
      v_subscription.plan,
      v_current_month;
  ELSE
    RETURN QUERY SELECT
      (v_current_count + p_emails_to_send <= v_subscription.monthly_email_limit) as allowed,
      v_current_count,
      v_subscription.monthly_email_limit,
      GREATEST(v_subscription.monthly_email_limit - v_current_count, 0),
      v_subscription.plan,
      v_current_month;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_send_emails_20900(uuid, integer) TO authenticated, service_role;

-- ============================================================================
-- PART 7 — Increment Email Usage
-- ============================================================================

CREATE OR REPLACE FUNCTION public.increment_email_usage_20900(
  p_org_id uuid,
  p_count integer DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_month text;
BEGIN
  v_current_month := to_char(now(), 'YYYY-MM');

  -- Upsert usage record
  INSERT INTO public.email_usage (organization_id, month, emails_sent)
  VALUES (p_org_id, v_current_month, p_count)
  ON CONFLICT (organization_id, month)
  DO UPDATE SET
    emails_sent = email_usage.emails_sent + p_count,
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_email_usage_20900(uuid, integer) TO authenticated, service_role;

-- ============================================================================
-- PART 8 — Team Seat Limit Enforcement
-- ============================================================================

CREATE OR REPLACE FUNCTION public.can_add_team_member_20900(p_org_id uuid)
RETURNS TABLE (
  allowed boolean,
  current_seats integer,
  max_seats integer,
  plan text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subscription record;
  v_member_count integer;
BEGIN
  -- Get subscription info
  SELECT * INTO v_subscription FROM public.get_org_subscription_20900(p_org_id);

  -- Check if subscription is active
  IF v_subscription.status NOT IN ('active', 'trialing') THEN
    SELECT COUNT(*)::integer INTO v_member_count
    FROM public.org_members
    WHERE org_id = p_org_id;
    
    RETURN QUERY SELECT false, v_member_count, v_subscription.max_seats, v_subscription.plan;
    RETURN;
  END IF;

  -- Count current members
  SELECT COUNT(*)::integer INTO v_member_count
  FROM public.org_members
  WHERE org_id = p_org_id;

  -- Check seat limit
  IF v_subscription.max_seats IS NULL THEN
    -- Unlimited
    RETURN QUERY SELECT true, v_member_count, NULL::integer, v_subscription.plan;
  ELSE
    RETURN QUERY SELECT
      (v_member_count < v_subscription.max_seats) as allowed,
      v_member_count,
      v_subscription.max_seats,
      v_subscription.plan;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_add_team_member_20900(uuid) TO authenticated, service_role;

-- ============================================================================
-- PART 9 — Feature Access Check
-- ============================================================================

CREATE OR REPLACE FUNCTION public.has_feature_access_20900(
  p_org_id uuid,
  p_feature text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subscription record;
  v_has_access boolean;
BEGIN
  -- Get subscription info
  SELECT * INTO v_subscription FROM public.get_org_subscription_20900(p_org_id);

  -- Check if subscription is active
  IF v_subscription.status NOT IN ('active', 'trialing') THEN
    RETURN false;
  END IF;

  -- Feature gating logic
  CASE p_feature
    -- Starter plan features (basic)
    WHEN 'inbox' THEN v_has_access := true;
    WHEN 'basic_personalization' THEN v_has_access := true;
    WHEN 'reply_tracking' THEN v_has_access := true;
    WHEN 'lead_labeling' THEN v_has_access := true;
    
    -- Growth plan features
    WHEN 'insurance_brain' THEN v_has_access := v_subscription.plan IN ('growth', 'domination');
    WHEN 'scope_parser' THEN v_has_access := v_subscription.plan IN ('growth', 'domination');
    WHEN 'install_ready_playbook' THEN v_has_access := v_subscription.plan IN ('growth', 'domination');
    WHEN 'hot_lead_engine' THEN v_has_access := v_subscription.plan IN ('growth', 'domination');
    WHEN 'contact_card' THEN v_has_access := v_subscription.plan IN ('growth', 'domination');
    WHEN 'crm_pipeline' THEN v_has_access := v_subscription.plan IN ('growth', 'domination');
    WHEN 'calendar' THEN v_has_access := v_subscription.plan IN ('growth', 'domination');
    
    -- Domination plan features
    WHEN 'proposal_builder' THEN v_has_access := v_subscription.plan = 'domination';
    WHEN 'ai_estimator' THEN v_has_access := v_subscription.plan = 'domination';
    WHEN 'adjuster_engine' THEN v_has_access := v_subscription.plan = 'domination';
    WHEN 'revenue_dashboard' THEN v_has_access := v_subscription.plan = 'domination';
    WHEN 'unlimited_emails' THEN v_has_access := v_subscription.plan = 'domination';
    WHEN 'unlimited_campaigns' THEN v_has_access := v_subscription.plan = 'domination';
    WHEN 'unlimited_seats' THEN v_has_access := v_subscription.plan = 'domination';
    WHEN 'vip_onboarding' THEN v_has_access := v_subscription.plan = 'domination';
    
    ELSE v_has_access := false; -- Unknown features denied by default
  END CASE;

  RETURN v_has_access;
END;
$$;

GRANT EXECUTE ON FUNCTION public.has_feature_access_20900(uuid, text) TO authenticated, service_role;

-- ============================================================================
-- PART 10 — RLS Policies
-- ============================================================================

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_usage ENABLE ROW LEVEL SECURITY;

-- Subscriptions: visible to org members
CREATE POLICY "subscriptions_select_member"
ON public.subscriptions FOR SELECT
USING (EXISTS(
  SELECT 1 FROM public.org_members
  WHERE org_id = subscriptions.organization_id
    AND user_id = auth.uid()
));

-- Email usage: visible to org members
CREATE POLICY "email_usage_select_member"
ON public.email_usage FOR SELECT
USING (EXISTS(
  SELECT 1 FROM public.org_members
  WHERE org_id = email_usage.organization_id
    AND user_id = auth.uid()
));

-- Service role can do everything
GRANT ALL ON public.subscriptions TO service_role;
GRANT ALL ON public.email_usage TO service_role;

-- ============================================================================
-- PART 11 — Triggers
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at_20900()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_subscriptions_updated_at
BEFORE UPDATE ON public.subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_20900();

CREATE TRIGGER trg_email_usage_updated_at
BEFORE UPDATE ON public.email_usage
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_20900();

-- ============================================================================
-- Block 20900 Database Schema Complete
-- ============================================================================
















































