-- =========================================================
-- Block 14800 — SmartSend Billing Guard v1
-- (Plan Limits, Send Caps, Enforcement, Billing Status Checks & Stripe Sync)
-- =========================================================

-- 1. Ensure subscriptions table exists with all required fields
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  plan text not null check (plan in ('starter', 'growth', 'domination')),
  stripe_customer_id text,
  stripe_subscription_id text unique,
  status text not null default 'incomplete' check (status in ('active', 'past_due', 'canceled', 'incomplete', 'trialing')),
  billing_status text not null default 'active' check (billing_status in ('active', 'past_due', 'grace_period', 'locked')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  payment_failed_at timestamptz, -- When payment first failed
  grace_period_ends_at timestamptz, -- When grace period expires
  last_stripe_sync_at timestamptz, -- Last time we synced from Stripe
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add billing_status column if it doesn't exist
DO $$ BEGIN
  ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS billing_status text not null default 'active';
EXCEPTION WHEN duplicate_column THEN null;
END $$;

-- Add grace period fields if they don't exist
DO $$ BEGIN
  ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS payment_failed_at timestamptz;
  ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS grace_period_ends_at timestamptz;
  ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS last_stripe_sync_at timestamptz;
EXCEPTION WHEN others THEN null;
END $$;

-- Create indexes
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_owner_id_idx ON public.subscriptions(owner_id);
CREATE INDEX IF NOT EXISTS subscriptions_stripe_subscription_id_idx ON public.subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS subscriptions_billing_status_idx ON public.subscriptions(billing_status);

-- Enable RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view own subscription" ON public.subscriptions;
CREATE POLICY "Users can view own subscription" ON public.subscriptions
  FOR SELECT
  USING (auth.uid() = owner_id);

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

-- 2. Plan Limits Configuration (Updated to exact specs)
CREATE TABLE IF NOT EXISTS public.plan_limits (
  plan text primary key check (plan in ('starter', 'growth', 'domination')),
  max_campaigns int not null,
  max_emails_per_month int not null,
  has_advanced_ai boolean not null default false,
  has_revenue_dashboard boolean not null default false,
  has_priority_support boolean not null default false,
  has_vip_onboarding boolean not null default false,
  has_advanced_automation boolean not null default false,
  created_at timestamptz not null default now()
);

-- Insert/update plan limits with exact specs
INSERT INTO public.plan_limits (
  plan, 
  max_campaigns, 
  max_emails_per_month, 
  has_advanced_ai, 
  has_revenue_dashboard, 
  has_priority_support, 
  has_vip_onboarding,
  has_advanced_automation
)
VALUES
  ('starter', 1, 500, false, false, false, false, false),
  ('growth', 3, 2000, true, false, true, false, false),
  ('domination', 999999, 20000, true, true, true, true, true)
ON CONFLICT (plan) DO UPDATE SET
  max_campaigns = EXCLUDED.max_campaigns,
  max_emails_per_month = EXCLUDED.max_emails_per_month,
  has_advanced_ai = EXCLUDED.has_advanced_ai,
  has_revenue_dashboard = EXCLUDED.has_revenue_dashboard,
  has_priority_support = EXCLUDED.has_priority_support,
  has_vip_onboarding = EXCLUDED.has_vip_onboarding,
  has_advanced_automation = EXCLUDED.has_advanced_automation;

-- Enable RLS (public read access for plan limits)
ALTER TABLE public.plan_limits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Plan limits are readable by all" ON public.plan_limits;
CREATE POLICY "Plan limits are readable by all" ON public.plan_limits
  FOR SELECT
  USING (true);

-- 3. Email Usage Tracking Table
CREATE TABLE IF NOT EXISTS public.email_usage (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  year int not null,
  month int not null check (month >= 1 and month <= 12),
  emails_sent int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, year, month)
);

CREATE INDEX IF NOT EXISTS email_usage_owner_year_month_idx ON public.email_usage(owner_id, year, month);

-- Enable RLS
ALTER TABLE public.email_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own email usage" ON public.email_usage;
CREATE POLICY "Users can view own email usage" ON public.email_usage
  FOR SELECT
  USING (auth.uid() = owner_id);

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

-- 4. Billing Events Table (for tracking billing status changes)
CREATE TABLE IF NOT EXISTS public.billing_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null, -- 'payment_failed', 'payment_succeeded', 'grace_period_started', 'account_locked', etc.
  event_data jsonb,
  created_at timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS billing_events_owner_id_idx ON public.billing_events(owner_id);
CREATE INDEX IF NOT EXISTS billing_events_created_at_idx ON public.billing_events(created_at);

ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own billing events" ON public.billing_events;
CREATE POLICY "Users can view own billing events" ON public.billing_events
  FOR SELECT
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Service role can manage billing events" ON public.billing_events;
CREATE POLICY "Service role can manage billing events" ON public.billing_events
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- 5. Helper Function: Get Billing Status with Grace Period Logic
CREATE OR REPLACE FUNCTION public.get_billing_status_with_grace_period(p_owner_id uuid)
RETURNS TABLE (
  billing_status text,
  days_since_payment_failed int,
  grace_period_ends_at timestamptz,
  can_send boolean,
  can_schedule boolean,
  can_use_inbox boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_subscription public.subscriptions%ROWTYPE;
  v_days_since_failure int;
  v_now timestamptz := now();
BEGIN
  -- Get subscription
  SELECT * INTO v_subscription
  FROM public.subscriptions
  WHERE owner_id = p_owner_id
  LIMIT 1;

  IF v_subscription IS NULL THEN
    RETURN QUERY SELECT 'active', 0, NULL::timestamptz, false, false, false;
    RETURN;
  END IF;

  -- Calculate days since payment failed
  IF v_subscription.payment_failed_at IS NOT NULL THEN
    v_days_since_failure := EXTRACT(EPOCH FROM (v_now - v_subscription.payment_failed_at)) / 86400;
  ELSE
    v_days_since_failure := 0;
  END IF;

  -- Grace period logic (14-day escalation)
  -- Day 0: Payment fails → past_due
  -- Day 1: Warn banner
  -- Day 3: Send 2nd warning
  -- Day 5: Disable sending
  -- Day 7: Disable scheduler
  -- Day 10: Disable inbox replies
  -- Day 14: LOCK ACCOUNT

  IF v_subscription.billing_status = 'past_due' AND v_days_since_failure >= 14 THEN
    RETURN QUERY SELECT 'locked', v_days_since_failure::int, v_subscription.grace_period_ends_at, false, false, false;
  ELSIF v_subscription.billing_status = 'past_due' AND v_days_since_failure >= 10 THEN
    RETURN QUERY SELECT 'grace_period', v_days_since_failure::int, v_subscription.grace_period_ends_at, false, false, false;
  ELSIF v_subscription.billing_status = 'past_due' AND v_days_since_failure >= 7 THEN
    RETURN QUERY SELECT 'grace_period', v_days_since_failure::int, v_subscription.grace_period_ends_at, false, false, true;
  ELSIF v_subscription.billing_status = 'past_due' AND v_days_since_failure >= 5 THEN
    RETURN QUERY SELECT 'grace_period', v_days_since_failure::int, v_subscription.grace_period_ends_at, false, true, true;
  ELSIF v_subscription.billing_status = 'past_due' THEN
    RETURN QUERY SELECT 'grace_period', v_days_since_failure::int, v_subscription.grace_period_ends_at, true, true, true;
  ELSE
    RETURN QUERY SELECT v_subscription.billing_status, v_days_since_failure::int, v_subscription.grace_period_ends_at, true, true, true;
  END IF;
END;
$$;

-- 6. Helper Function: Check if User Can Create Campaign
CREATE OR REPLACE FUNCTION public.can_user_create_campaign(p_owner_id uuid)
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
  v_billing_status text;
BEGIN
  -- Check billing status first
  SELECT billing_status INTO v_billing_status
  FROM public.get_billing_status_with_grace_period(p_owner_id);

  IF v_billing_status = 'locked' THEN
    RETURN QUERY SELECT false, 'Account locked due to payment issues. Please update your payment method.', 0, 0;
    RETURN;
  END IF;

  -- Get user subscription
  SELECT * INTO v_subscription
  FROM public.subscriptions
  WHERE owner_id = p_owner_id
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
  WHERE owner_id = p_owner_id
    AND status IN ('running', 'sending', 'active');

  -- Check limit
  IF v_campaign_count >= v_limits.max_campaigns THEN
    RETURN QUERY SELECT false, 'Campaign limit reached', v_campaign_count, v_limits.max_campaigns;
  ELSE
    RETURN QUERY SELECT true, 'OK', v_campaign_count, v_limits.max_campaigns;
  END IF;
END;
$$;

-- 7. Helper Function: Check if User Can Send Email
CREATE OR REPLACE FUNCTION public.can_user_send_email(p_owner_id uuid, p_emails_to_send int DEFAULT 1)
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
  v_billing_status text;
  v_can_send_from_billing boolean;
BEGIN
  -- Check billing status first
  SELECT billing_status, can_send INTO v_billing_status, v_can_send_from_billing
  FROM public.get_billing_status_with_grace_period(p_owner_id);

  IF v_billing_status = 'locked' THEN
    RETURN QUERY SELECT false, 'Account locked due to payment issues. Please update your payment method.', 0, 0, 0;
    RETURN;
  END IF;

  IF NOT v_can_send_from_billing THEN
    RETURN QUERY SELECT false, 'Sending disabled due to payment issues. Please update your payment method.', 0, 0, 0;
    RETURN;
  END IF;

  -- Get current year/month
  v_current_year := EXTRACT(YEAR FROM now());
  v_current_month := EXTRACT(MONTH FROM now());

  -- Get user subscription
  SELECT * INTO v_subscription
  FROM public.subscriptions
  WHERE owner_id = p_owner_id
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
  WHERE owner_id = p_owner_id
    AND year = v_current_year
    AND month = v_current_month;

  IF v_usage IS NULL THEN
    INSERT INTO public.email_usage (owner_id, year, month, emails_sent)
    VALUES (p_owner_id, v_current_year, v_current_month, 0)
    RETURNING * INTO v_usage;
  END IF;

  -- Check limit (with buffer for emails_to_send)
  IF (v_usage.emails_sent + p_emails_to_send) > v_limits.max_emails_per_month THEN
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

-- 8. Helper Function: Increment Email Usage
CREATE OR REPLACE FUNCTION public.increment_email_usage(p_owner_id uuid, p_count int DEFAULT 1)
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

  INSERT INTO public.email_usage (owner_id, year, month, emails_sent)
  VALUES (p_owner_id, v_current_year, v_current_month, p_count)
  ON CONFLICT (owner_id, year, month)
  DO UPDATE SET 
    emails_sent = email_usage.emails_sent + p_count,
    updated_at = now();
END;
$$;

-- 9. Function: Update Billing Status on Payment Failure
CREATE OR REPLACE FUNCTION public.handle_payment_failure(p_owner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now timestamptz := now();
  v_grace_period_end timestamptz;
BEGIN
  v_grace_period_end := v_now + INTERVAL '14 days';

  -- Update subscription
  UPDATE public.subscriptions
  SET 
    billing_status = 'past_due',
    status = 'past_due',
    payment_failed_at = v_now,
    grace_period_ends_at = v_grace_period_end,
    updated_at = v_now
  WHERE owner_id = p_owner_id;

  -- Log event
  INSERT INTO public.billing_events (owner_id, event_type, event_data)
  VALUES (p_owner_id, 'payment_failed', jsonb_build_object('grace_period_ends_at', v_grace_period_end));
END;
$$;

-- 10. Function: Restore Billing Status on Payment Success
CREATE OR REPLACE FUNCTION public.handle_payment_success(p_owner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update subscription
  UPDATE public.subscriptions
  SET 
    billing_status = 'active',
    status = 'active',
    payment_failed_at = NULL,
    grace_period_ends_at = NULL,
    updated_at = now()
  WHERE owner_id = p_owner_id;

  -- Log event
  INSERT INTO public.billing_events (owner_id, event_type, event_data)
  VALUES (p_owner_id, 'payment_succeeded', jsonb_build_object('restored_at', now()));
END;
$$;

-- Comments
COMMENT ON TABLE public.subscriptions IS 'Block 14800: User subscriptions with billing guard enforcement';
COMMENT ON TABLE public.plan_limits IS 'Block 14800: Plan limits configuration (Starter $99/Growth $199/Domination $399)';
COMMENT ON TABLE public.email_usage IS 'Block 14800: Monthly email usage tracking per owner';
COMMENT ON TABLE public.billing_events IS 'Block 14800: Billing status change events for audit trail';
COMMENT ON FUNCTION public.get_billing_status_with_grace_period(uuid) IS 'Block 14800: Get billing status with 14-day grace period logic';
COMMENT ON FUNCTION public.can_user_create_campaign(uuid) IS 'Block 14800: Check if user can create campaign (billing guard)';
COMMENT ON FUNCTION public.can_user_send_email(uuid, int) IS 'Block 14800: Check if user can send email (billing guard)';
COMMENT ON FUNCTION public.increment_email_usage(uuid, int) IS 'Block 14800: Increment email usage counter';
COMMENT ON FUNCTION public.handle_payment_failure(uuid) IS 'Block 14800: Handle payment failure and start grace period';
COMMENT ON FUNCTION public.handle_payment_success(uuid) IS 'Block 14800: Restore account access after payment success';





















































