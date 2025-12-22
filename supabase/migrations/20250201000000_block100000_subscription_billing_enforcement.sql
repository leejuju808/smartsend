-- =========================================================
-- BLOCK 100000 — SmartSend Subscription System + Billing Enforcement + Usage Limits v1
-- "Subscription System + Billing Enforcement + Usage Limits"
-- =========================================================
-- This block makes sure roofing companies pay you, stay subscribed, 
-- and get cut off when they exceed their plan limits.
-- =========================================================

-- 1. SUBSCRIPTIONS TABLE
-- Stores user subscription information synced from Stripe
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan_key text NOT NULL CHECK (plan_key IN ('starter', 'growth', 'domination')),
  status text NOT NULL CHECK (status IN ('active', 'past_due', 'canceled', 'trialing', 'incomplete')),
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for subscriptions
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_user_id_idx ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS subscriptions_stripe_customer_id_idx ON public.subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS subscriptions_stripe_subscription_id_idx ON public.subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS subscriptions_plan_key_idx ON public.subscriptions(plan_key);

-- Enable RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view own subscription" ON public.subscriptions;
CREATE POLICY "Users can view own subscription" ON public.subscriptions
  FOR SELECT
  USING (auth.uid() = user_id);

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

-- 2. PLAN LIMITS TABLE
-- Defines limits for each plan tier
CREATE TABLE IF NOT EXISTS public.plan_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_key text UNIQUE NOT NULL CHECK (plan_key IN ('starter', 'growth', 'domination')),
  max_emails int NOT NULL,
  max_campaigns int NOT NULL,
  priority_support boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed plan limits
INSERT INTO public.plan_limits (plan_key, max_emails, max_campaigns, priority_support)
VALUES
  ('starter', 500, 1, false),
  ('growth', 2000, 3, true),
  ('domination', 999999, 999, true)
ON CONFLICT (plan_key) DO UPDATE SET
  max_emails = EXCLUDED.max_emails,
  max_campaigns = EXCLUDED.max_campaigns,
  priority_support = EXCLUDED.priority_support,
  updated_at = now();

-- Enable RLS (public read access for plan limits)
ALTER TABLE public.plan_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Plan limits are readable by all" ON public.plan_limits;
CREATE POLICY "Plan limits are readable by all" ON public.plan_limits
  FOR SELECT
  USING (true);

-- Trigger to update updated_at
DROP TRIGGER IF EXISTS update_plan_limits_updated_at_trigger ON public.plan_limits;
CREATE TRIGGER update_plan_limits_updated_at_trigger
  BEFORE UPDATE ON public.plan_limits
  FOR EACH ROW
  EXECUTE FUNCTION update_subscriptions_updated_at();

-- 3. EMAIL USAGE TABLE
-- Tracks monthly email usage per user (resets each month)
CREATE TABLE IF NOT EXISTS public.email_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  count int NOT NULL DEFAULT 0,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for email_usage
CREATE INDEX IF NOT EXISTS email_usage_user_id_idx ON public.email_usage(user_id);
CREATE INDEX IF NOT EXISTS email_usage_period_idx ON public.email_usage(period_start, period_end);
CREATE UNIQUE INDEX IF NOT EXISTS email_usage_user_period_idx ON public.email_usage(user_id, period_start);

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

-- 4. HELPER FUNCTION: Get or Create Current Period Usage
-- Automatically creates usage record for current month if it doesn't exist
CREATE OR REPLACE FUNCTION public.get_or_create_current_usage(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  count int,
  period_start timestamptz,
  period_end timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_usage_record public.email_usage%ROWTYPE;
BEGIN
  -- Calculate current month period (first day to last day)
  v_period_start := date_trunc('month', now());
  v_period_end := (date_trunc('month', now()) + interval '1 month' - interval '1 day')::date + interval '23 hours 59 minutes 59 seconds';

  -- Try to get existing usage record
  SELECT * INTO v_usage_record
  FROM public.email_usage
  WHERE user_id = p_user_id
    AND period_start = v_period_start
    AND period_end = v_period_end;

  -- If no record exists, create one
  IF v_usage_record IS NULL THEN
    INSERT INTO public.email_usage (user_id, count, period_start, period_end)
    VALUES (p_user_id, 0, v_period_start, v_period_end)
    RETURNING * INTO v_usage_record;
  END IF;

  -- Return the usage record
  RETURN QUERY
  SELECT 
    v_usage_record.id,
    v_usage_record.user_id,
    v_usage_record.count,
    v_usage_record.period_start,
    v_usage_record.period_end;
END;
$$;

-- 5. HELPER FUNCTION: Increment Email Usage
CREATE OR REPLACE FUNCTION public.increment_email_usage(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_period_start timestamptz;
  v_period_end timestamptz;
BEGIN
  -- Calculate current month period
  v_period_start := date_trunc('month', now());
  v_period_end := (date_trunc('month', now()) + interval '1 month' - interval '1 day')::date + interval '23 hours 59 minutes 59 seconds';

  -- Increment usage (create if doesn't exist)
  INSERT INTO public.email_usage (user_id, count, period_start, period_end)
  VALUES (p_user_id, 1, v_period_start, v_period_end)
  ON CONFLICT (user_id, period_start)
  DO UPDATE SET 
    count = email_usage.count + 1,
    updated_at = now();
END;
$$;

-- 6. HELPER FUNCTION: Check Email Limit
-- Returns whether user can send email and remaining count
CREATE OR REPLACE FUNCTION public.check_email_limit(p_user_id uuid)
RETURNS TABLE (
  can_send boolean,
  current_count int,
  max_emails int,
  remaining int,
  reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_subscription public.subscriptions%ROWTYPE;
  v_limits public.plan_limits%ROWTYPE;
  v_usage public.email_usage%ROWTYPE;
  v_period_start timestamptz;
  v_period_end timestamptz;
BEGIN
  -- Calculate current month period
  v_period_start := date_trunc('month', now());
  v_period_end := (date_trunc('month', now()) + interval '1 month' - interval '1 day')::date + interval '23 hours 59 minutes 59 seconds';

  -- Get user subscription
  SELECT * INTO v_subscription
  FROM public.subscriptions
  WHERE user_id = p_user_id
  LIMIT 1;

  -- If no subscription or not active, deny
  IF v_subscription IS NULL THEN
    RETURN QUERY SELECT false, 0, 0, 0, 'No subscription found';
    RETURN;
  END IF;

  IF v_subscription.status NOT IN ('active', 'trialing') THEN
    RETURN QUERY SELECT false, 0, 0, 0, 'Subscription not active';
    RETURN;
  END IF;

  -- Get plan limits
  SELECT * INTO v_limits
  FROM public.plan_limits
  WHERE plan_key = v_subscription.plan_key;

  IF v_limits IS NULL THEN
    RETURN QUERY SELECT false, 0, 0, 0, 'Plan limits not found';
    RETURN;
  END IF;

  -- Get or create usage record
  SELECT * INTO v_usage
  FROM public.email_usage
  WHERE user_id = p_user_id
    AND period_start = v_period_start
    AND period_end = v_period_end;

  IF v_usage IS NULL THEN
    -- Create new usage record
    INSERT INTO public.email_usage (user_id, count, period_start, period_end)
    VALUES (p_user_id, 0, v_period_start, v_period_end)
    RETURNING * INTO v_usage;
  END IF;

  -- Check limit
  IF v_usage.count >= v_limits.max_emails THEN
    RETURN QUERY SELECT 
      false,
      v_usage.count,
      v_limits.max_emails,
      0,
      'Email limit reached. Upgrade required.';
  ELSE
    RETURN QUERY SELECT 
      true,
      v_usage.count,
      v_limits.max_emails,
      GREATEST(0, v_limits.max_emails - v_usage.count),
      'OK';
  END IF;
END;
$$;

-- 7. CRON JOB FUNCTION: Reset Monthly Usage
-- This should be called by a cron job at the start of each month
CREATE OR REPLACE FUNCTION public.reset_monthly_usage()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- This function can be called monthly to clean up old usage records
  -- New usage records are created automatically when needed
  -- For now, we just log that it was called
  RAISE NOTICE 'Monthly usage reset function called at %', now();
END;
$$;

-- Comments
COMMENT ON TABLE public.subscriptions IS 'BLOCK 100000: User subscriptions synced from Stripe';
COMMENT ON TABLE public.plan_limits IS 'BLOCK 100000: Plan limits configuration (starter/growth/domination)';
COMMENT ON TABLE public.email_usage IS 'BLOCK 100000: Monthly email usage tracking per user';
COMMENT ON FUNCTION public.get_or_create_current_usage(uuid) IS 'BLOCK 100000: Get or create current month usage record';
COMMENT ON FUNCTION public.increment_email_usage(uuid) IS 'BLOCK 100000: Increment email usage counter for current month';
COMMENT ON FUNCTION public.check_email_limit(uuid) IS 'BLOCK 100000: Check if user can send email based on monthly limit';
COMMENT ON FUNCTION public.reset_monthly_usage() IS 'BLOCK 100000: Reset monthly usage (called by cron)';


























