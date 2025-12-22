-- =========================================================
-- Block 12000 — SmartSend Billing & Subscription Enforcement v1
-- (The System That Ensures Roofers Pay + No One Gets Free Unlimited Usage)
-- =========================================================

-- 1. Subscriptions Table (if not exists, update if exists)
-- This table stores subscription information for each user
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null check (plan in ('starter', 'growth', 'domination')),
  stripe_customer_id text,
  stripe_subscription_id text unique,
  status text not null default 'incomplete' check (status in ('active', 'past_due', 'canceled', 'incomplete', 'trialing')),
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Create unique index on user_id (one subscription per user)
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_user_id_idx ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS subscriptions_stripe_subscription_id_idx ON public.subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON public.subscriptions(status);

-- Enable RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can view their own subscription
DROP POLICY IF EXISTS "Users can view own subscription" ON public.subscriptions;
CREATE POLICY "Users can view own subscription" ON public.subscriptions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can manage all subscriptions (for webhooks)
DROP POLICY IF EXISTS "Service role can manage subscriptions" ON public.subscriptions;
CREATE POLICY "Service role can manage subscriptions" ON public.subscriptions
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_subscriptions_updated_at_trigger ON public.subscriptions;
CREATE TRIGGER update_subscriptions_updated_at_trigger
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_subscriptions_updated_at();

-- 2. Plan Limits Configuration Table
-- Defines limits for each plan tier
CREATE TABLE IF NOT EXISTS public.plan_limits (
  plan text primary key check (plan in ('starter', 'growth', 'domination')),
  max_campaigns int not null,
  max_emails_per_month int not null,
  has_advanced_ai boolean not null default false,
  has_revenue_dashboard boolean not null default false,
  has_priority_support boolean not null default false,
  has_vip_onboarding boolean not null default false,
  created_at timestamptz not null default now()
);

-- Insert plan limits
INSERT INTO public.plan_limits (plan, max_campaigns, max_emails_per_month, has_advanced_ai, has_revenue_dashboard, has_priority_support, has_vip_onboarding)
VALUES
  ('starter', 1, 500, false, false, false, false),
  ('growth', 3, 2000, true, false, true, false),
  ('domination', 999999, 999999, true, true, true, true)
ON CONFLICT (plan) DO UPDATE SET
  max_campaigns = EXCLUDED.max_campaigns,
  max_emails_per_month = EXCLUDED.max_emails_per_month,
  has_advanced_ai = EXCLUDED.has_advanced_ai,
  has_revenue_dashboard = EXCLUDED.has_revenue_dashboard,
  has_priority_support = EXCLUDED.has_priority_support,
  has_vip_onboarding = EXCLUDED.has_vip_onboarding;

-- Enable RLS (public read access for plan limits)
ALTER TABLE public.plan_limits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Plan limits are readable by all" ON public.plan_limits;
CREATE POLICY "Plan limits are readable by all" ON public.plan_limits
  FOR SELECT
  USING (true);

-- 3. Email Usage Tracking Table
-- Tracks monthly email usage per user
CREATE TABLE IF NOT EXISTS public.email_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  year int not null,
  month int not null check (month >= 1 and month <= 12),
  emails_sent int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, year, month)
);

CREATE INDEX IF NOT EXISTS email_usage_user_year_month_idx ON public.email_usage(user_id, year, month);

-- Enable RLS
ALTER TABLE public.email_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own email usage" ON public.email_usage;
CREATE POLICY "Users can view own email usage" ON public.email_usage
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage email usage" ON public.email_usage;
CREATE POLICY "Service role can manage email usage" ON public.email_usage
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Trigger to update updated_at
DROP TRIGGER IF EXISTS update_email_usage_updated_at_trigger ON public.email_usage;
CREATE TRIGGER update_email_usage_updated_at_trigger
  BEFORE UPDATE ON public.email_usage
  FOR EACH ROW
  EXECUTE FUNCTION update_subscriptions_updated_at();

-- 4. Helper Function: Get User Subscription Status
CREATE OR REPLACE FUNCTION public.get_user_subscription_status(p_user_id uuid)
RETURNS TABLE (
  plan text,
  status text,
  current_period_end timestamptz,
  is_active boolean
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.plan,
    s.status,
    s.current_period_end,
    CASE 
      WHEN s.status = 'active' AND (s.current_period_end IS NULL OR s.current_period_end > now()) THEN true
      WHEN s.status = 'trialing' THEN true
      ELSE false
    END as is_active
  FROM public.subscriptions s
  WHERE s.user_id = p_user_id
  LIMIT 1;
END;
$$;

-- 5. Helper Function: Check if User Can Create Campaign
CREATE OR REPLACE FUNCTION public.can_user_create_campaign(p_user_id uuid)
RETURNS TABLE (
  can_create boolean,
  reason text,
  current_count int,
  max_allowed int
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_subscription public.subscriptions%ROWTYPE;
  v_limits public.plan_limits%ROWTYPE;
  v_campaign_count int;
BEGIN
  -- Get user subscription
  SELECT * INTO v_subscription
  FROM public.subscriptions
  WHERE user_id = p_user_id
  LIMIT 1;

  -- If no subscription or inactive, deny
  IF v_subscription IS NULL OR (v_subscription.status != 'active' AND v_subscription.status != 'trialing') THEN
    RETURN QUERY SELECT false, 'Subscription inactive', 0, 0;
    RETURN;
  END IF;

  -- Get plan limits
  SELECT * INTO v_limits
  FROM public.plan_limits
  WHERE plan = v_subscription.plan;

  -- Count active campaigns
  SELECT COUNT(*) INTO v_campaign_count
  FROM public.campaigns
  WHERE user_id = p_user_id
    AND status IN ('running', 'sending', 'active');

  -- Check limit
  IF v_campaign_count >= v_limits.max_campaigns THEN
    RETURN QUERY SELECT false, 'Campaign limit reached', v_campaign_count, v_limits.max_campaigns;
  ELSE
    RETURN QUERY SELECT true, 'OK', v_campaign_count, v_limits.max_campaigns;
  END IF;
END;
$$;

-- 6. Helper Function: Check if User Can Send Email
CREATE OR REPLACE FUNCTION public.can_user_send_email(p_user_id uuid)
RETURNS TABLE (
  can_send boolean,
  reason text,
  current_month_count int,
  max_per_month int,
  remaining int
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_subscription public.subscriptions%ROWTYPE;
  v_limits public.plan_limits%ROWTYPE;
  v_usage public.email_usage%ROWTYPE;
  v_current_year int;
  v_current_month int;
BEGIN
  -- Get current year/month
  v_current_year := EXTRACT(YEAR FROM now());
  v_current_month := EXTRACT(MONTH FROM now());

  -- Get user subscription
  SELECT * INTO v_subscription
  FROM public.subscriptions
  WHERE user_id = p_user_id
  LIMIT 1;

  -- If no subscription or inactive, deny
  IF v_subscription IS NULL OR (v_subscription.status != 'active' AND v_subscription.status != 'trialing') THEN
    RETURN QUERY SELECT false, 'Subscription inactive', 0, 0, 0;
    RETURN;
  END IF;

  -- Get plan limits
  SELECT * INTO v_limits
  FROM public.plan_limits
  WHERE plan = v_subscription.plan;

  -- Get or create usage record
  SELECT * INTO v_usage
  FROM public.email_usage
  WHERE user_id = p_user_id
    AND year = v_current_year
    AND month = v_current_month;

  IF v_usage IS NULL THEN
    INSERT INTO public.email_usage (user_id, year, month, emails_sent)
    VALUES (p_user_id, v_current_year, v_current_month, 0)
    RETURNING * INTO v_usage;
  END IF;

  -- Check limit
  IF v_usage.emails_sent >= v_limits.max_emails_per_month THEN
    RETURN QUERY SELECT 
      false, 
      'Email limit reached for your plan', 
      v_usage.emails_sent, 
      v_limits.max_emails_per_month,
      GREATEST(0, v_limits.max_emails_per_month - v_usage.emails_sent);
  ELSE
    RETURN QUERY SELECT 
      true, 
      'OK', 
      v_usage.emails_sent, 
      v_limits.max_emails_per_month,
      GREATEST(0, v_limits.max_emails_per_month - v_usage.emails_sent);
  END IF;
END;
$$;

-- 7. Helper Function: Increment Email Usage
CREATE OR REPLACE FUNCTION public.increment_email_usage(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_year int;
  v_current_month int;
BEGIN
  v_current_year := EXTRACT(YEAR FROM now());
  v_current_month := EXTRACT(MONTH FROM now());

  INSERT INTO public.email_usage (user_id, year, month, emails_sent)
  VALUES (p_user_id, v_current_year, v_current_month, 1)
  ON CONFLICT (user_id, year, month)
  DO UPDATE SET 
    emails_sent = email_usage.emails_sent + 1,
    updated_at = now();
END;
$$;

-- Comments
COMMENT ON TABLE public.subscriptions IS 'Block 12000: User subscriptions for SmartSend billing enforcement';
COMMENT ON TABLE public.plan_limits IS 'Block 12000: Plan limits configuration (Starter/Growth/Domination)';
COMMENT ON TABLE public.email_usage IS 'Block 12000: Monthly email usage tracking per user';
COMMENT ON FUNCTION public.get_user_subscription_status(uuid) IS 'Block 12000: Get user subscription status and active state';
COMMENT ON FUNCTION public.can_user_create_campaign(uuid) IS 'Block 12000: Check if user can create a new campaign based on plan limits';
COMMENT ON FUNCTION public.can_user_send_email(uuid) IS 'Block 12000: Check if user can send email based on monthly limit';
COMMENT ON FUNCTION public.increment_email_usage(uuid) IS 'Block 12000: Increment email usage counter for current month';





















































