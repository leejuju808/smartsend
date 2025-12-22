-- =========================================================
-- Block 17300 — SmartSend Billing Guard v2
-- (Paywall Enforcement, Send Limits, Plan Logic, Upsell Prompts, 
--  Trial Expiration & Revenue Protection System)
-- =========================================================

-- 1. Enhanced Subscriptions Table (v2)
-- Extends existing subscriptions table with trial and lock fields
DO $$ BEGIN
  -- Add trial fields if they don't exist
  ALTER TABLE public.subscriptions 
    ADD COLUMN IF NOT EXISTS trial_started_at timestamptz,
    ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
    ADD COLUMN IF NOT EXISTS trial_expired_at timestamptz,
    ADD COLUMN IF NOT EXISTS is_trial_active boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS locked_at timestamptz,
    ADD COLUMN IF NOT EXISTS locked_reason text,
    ADD COLUMN IF NOT EXISTS last_limit_check_at timestamptz;
EXCEPTION WHEN others THEN null;
END $$;

-- 2. Billing Usage Table (v2) - Enhanced monthly tracking
CREATE TABLE IF NOT EXISTS public.billing_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year int NOT NULL,
  month int NOT NULL CHECK (month >= 1 AND month <= 12),
  emails_sent int NOT NULL DEFAULT 0,
  campaigns_created int NOT NULL DEFAULT 0,
  ai_requests int NOT NULL DEFAULT 0,
  appointments_scheduled int NOT NULL DEFAULT 0,
  seats_used int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id, year, month)
);

CREATE INDEX IF NOT EXISTS billing_usage_owner_year_month_idx 
  ON public.billing_usage(owner_id, year, month);
CREATE INDEX IF NOT EXISTS billing_usage_updated_at_idx 
  ON public.billing_usage(updated_at);

-- Enable RLS
ALTER TABLE public.billing_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own billing usage" ON public.billing_usage;
CREATE POLICY "Users can view own billing usage" ON public.billing_usage
  FOR SELECT
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Service role can manage billing usage" ON public.billing_usage;
CREATE POLICY "Service role can manage billing usage" ON public.billing_usage
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- 3. Billing Locks Table (v2) - Track feature locks
CREATE TABLE IF NOT EXISTS public.billing_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lock_type text NOT NULL CHECK (lock_type IN (
    'trial_expired', 
    'payment_failed', 
    'over_limit', 
    'manual_lock',
    'grace_period'
  )),
  feature text NOT NULL CHECK (feature IN (
    'campaigns',
    'sending',
    'follow_ups',
    'ai_sequences',
    'scheduler',
    'inbox',
    'all'
  )),
  reason text NOT NULL,
  locked_at timestamptz NOT NULL DEFAULT now(),
  unlocked_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  UNIQUE(owner_id, lock_type, feature) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS billing_locks_owner_id_idx 
  ON public.billing_locks(owner_id);
CREATE INDEX IF NOT EXISTS billing_locks_locked_at_idx 
  ON public.billing_locks(locked_at);
CREATE INDEX IF NOT EXISTS billing_locks_active_idx 
  ON public.billing_locks(owner_id, lock_type, feature) 
  WHERE unlocked_at IS NULL;

ALTER TABLE public.billing_locks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own billing locks" ON public.billing_locks;
CREATE POLICY "Users can view own billing locks" ON public.billing_locks
  FOR SELECT
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Service role can manage billing locks" ON public.billing_locks;
CREATE POLICY "Service role can manage billing locks" ON public.billing_locks
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- 4. Billing Events Table (v2) - Enhanced audit trail
CREATE TABLE IF NOT EXISTS public.billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'trial_started',
    'trial_expired',
    'payment_failed',
    'payment_succeeded',
    'grace_period_started',
    'grace_period_ended',
    'account_locked',
    'account_unlocked',
    'limit_reached',
    'upgrade_prompted',
    'plan_changed',
    'subscription_canceled',
    'subscription_renewed'
  )),
  event_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_events_owner_id_idx 
  ON public.billing_events(owner_id);
CREATE INDEX IF NOT EXISTS billing_events_event_type_idx 
  ON public.billing_events(event_type);
CREATE INDEX IF NOT EXISTS billing_events_created_at_idx 
  ON public.billing_events(created_at DESC);

ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own billing events" ON public.billing_events;
CREATE POLICY "Users can view own billing events" ON public.billing_events
  FOR SELECT
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Service role can manage billing events" ON public.billing_events;
CREATE POLICY "Service role can manage billing events" ON public.billing_events
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- 5. Billing Grace Period Table (v2) - Track grace period state
CREATE TABLE IF NOT EXISTS public.billing_grace_period (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  days_elapsed int NOT NULL DEFAULT 0,
  retry_count int NOT NULL DEFAULT 0,
  last_retry_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'expired')),
  metadata jsonb DEFAULT '{}'::jsonb,
  UNIQUE(owner_id) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS billing_grace_period_owner_id_idx 
  ON public.billing_grace_period(owner_id);
CREATE INDEX IF NOT EXISTS billing_grace_period_ends_at_idx 
  ON public.billing_grace_period(ends_at);
CREATE INDEX IF NOT EXISTS billing_grace_period_active_idx 
  ON public.billing_grace_period(owner_id) 
  WHERE status = 'active';

ALTER TABLE public.billing_grace_period ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own grace period" ON public.billing_grace_period;
CREATE POLICY "Users can view own grace period" ON public.billing_grace_period
  FOR SELECT
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Service role can manage grace period" ON public.billing_grace_period;
CREATE POLICY "Service role can manage grace period" ON public.billing_grace_period
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- 6. Update Plan Limits (v2) - Exact specs from Block 17300
UPDATE public.plan_limits SET
  max_campaigns = CASE 
    WHEN plan = 'starter' THEN 1
    WHEN plan = 'growth' THEN 3
    WHEN plan = 'domination' THEN 999999
    ELSE max_campaigns
  END,
  max_emails_per_month = CASE
    WHEN plan = 'starter' THEN 500
    WHEN plan = 'growth' THEN 2000
    WHEN plan = 'domination' THEN 10000
    ELSE max_emails_per_month
  END,
  has_advanced_ai = CASE
    WHEN plan IN ('growth', 'domination') THEN true
    ELSE false
  END,
  has_revenue_dashboard = CASE
    WHEN plan = 'domination' THEN true
    ELSE false
  END,
  has_priority_support = CASE
    WHEN plan IN ('growth', 'domination') THEN true
    ELSE false
  END,
  has_vip_onboarding = CASE
    WHEN plan = 'domination' THEN true
    ELSE false
  END,
  has_advanced_automation = CASE
    WHEN plan = 'domination' THEN true
    ELSE false
  END
WHERE plan IN ('starter', 'growth', 'domination');

-- Add seat limits to plan_limits
DO $$ BEGIN
  ALTER TABLE public.plan_limits 
    ADD COLUMN IF NOT EXISTS max_seats int DEFAULT 1;
EXCEPTION WHEN others THEN null;
END $$;

UPDATE public.plan_limits SET
  max_seats = CASE
    WHEN plan = 'starter' THEN 1
    WHEN plan = 'growth' THEN 2
    WHEN plan = 'domination' THEN 5
    ELSE 1
  END
WHERE plan IN ('starter', 'growth', 'domination');

-- 7. Function: Check Trial Expiration (v2)
CREATE OR REPLACE FUNCTION public.check_trial_expiration(p_owner_id uuid)
RETURNS TABLE (
  is_expired boolean,
  trial_ends_at timestamptz,
  days_remaining int,
  should_lock boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_subscription public.subscriptions%ROWTYPE;
  v_now timestamptz := now();
  v_midnight_today timestamptz;
  v_trial_end_midnight timestamptz;
BEGIN
  -- Get subscription
  SELECT * INTO v_subscription
  FROM public.subscriptions
  WHERE owner_id = p_owner_id
  LIMIT 1;

  IF v_subscription IS NULL OR v_subscription.trial_ends_at IS NULL THEN
    RETURN QUERY SELECT false, NULL::timestamptz, 0, false;
    RETURN;
  END IF;

  -- Calculate midnight of trial end date
  v_trial_end_midnight := date_trunc('day', v_subscription.trial_ends_at) + INTERVAL '1 day';
  
  -- Calculate midnight of today
  v_midnight_today := date_trunc('day', v_now) + INTERVAL '1 day';

  -- Check if we've passed midnight of trial end date
  IF v_now >= v_trial_end_midnight THEN
    RETURN QUERY SELECT 
      true, 
      v_subscription.trial_ends_at,
      0,
      true; -- Should lock
  ELSE
    -- Calculate days remaining
    DECLARE
      v_days_remaining int;
    BEGIN
      v_days_remaining := EXTRACT(EPOCH FROM (v_trial_end_midnight - v_now)) / 86400;
      RETURN QUERY SELECT 
        false,
        v_subscription.trial_ends_at,
        v_days_remaining::int,
        false;
    END;
  END IF;
END;
$$;

-- 8. Function: Lock Features on Trial Expiration (v2)
CREATE OR REPLACE FUNCTION public.lock_features_on_trial_expired(p_owner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now timestamptz := now();
BEGIN
  -- Lock campaigns
  INSERT INTO public.billing_locks (owner_id, lock_type, feature, reason)
  VALUES (p_owner_id, 'trial_expired', 'campaigns', 'Trial expired - upgrade required to create campaigns')
  ON CONFLICT (owner_id, lock_type, feature) DO NOTHING;

  -- Lock sending
  INSERT INTO public.billing_locks (owner_id, lock_type, feature, reason)
  VALUES (p_owner_id, 'trial_expired', 'sending', 'Trial expired - upgrade required to send emails')
  ON CONFLICT (owner_id, lock_type, feature) DO NOTHING;

  -- Lock follow-ups
  INSERT INTO public.billing_locks (owner_id, lock_type, feature, reason)
  VALUES (p_owner_id, 'trial_expired', 'follow_ups', 'Trial expired - upgrade required for follow-ups')
  ON CONFLICT (owner_id, lock_type, feature) DO NOTHING;

  -- Lock AI sequences
  INSERT INTO public.billing_locks (owner_id, lock_type, feature, reason)
  VALUES (p_owner_id, 'trial_expired', 'ai_sequences', 'Trial expired - upgrade required for AI sequences')
  ON CONFLICT (owner_id, lock_type, feature) DO NOTHING;

  -- Update subscription
  UPDATE public.subscriptions
  SET 
    trial_expired_at = v_now,
    is_trial_active = false,
    locked_at = v_now,
    locked_reason = 'Trial expired',
    updated_at = v_now
  WHERE owner_id = p_owner_id;

  -- Log event
  INSERT INTO public.billing_events (owner_id, event_type, event_data)
  VALUES (
    p_owner_id, 
    'trial_expired',
    jsonb_build_object('locked_at', v_now)
  );
END;
$$;

-- 9. Function: Get Billing Status with Grace Period (v2 - 7 days)
CREATE OR REPLACE FUNCTION public.get_billing_status_with_grace_period_v2(p_owner_id uuid)
RETURNS TABLE (
  billing_status text,
  days_since_payment_failed int,
  grace_period_ends_at timestamptz,
  can_send boolean,
  can_schedule boolean,
  can_use_inbox boolean,
  can_create_campaigns boolean,
  trial_expired boolean,
  days_until_trial_expires int
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_subscription public.subscriptions%ROWTYPE;
  v_grace_period public.billing_grace_period%ROWTYPE;
  v_trial_check record;
  v_days_since_failure int;
  v_now timestamptz := now();
BEGIN
  -- Get subscription
  SELECT * INTO v_subscription
  FROM public.subscriptions
  WHERE owner_id = p_owner_id
  LIMIT 1;

  IF v_subscription IS NULL THEN
    RETURN QUERY SELECT 'active', 0, NULL::timestamptz, false, false, false, false, false, 0;
    RETURN;
  END IF;

  -- Check trial expiration
  SELECT * INTO v_trial_check
  FROM public.check_trial_expiration(p_owner_id);

  IF v_trial_check.is_expired THEN
    -- Trial expired - lock everything except inbox
    RETURN QUERY SELECT 
      'trial_expired',
      0,
      NULL::timestamptz,
      false, -- can_send
      false, -- can_schedule
      true,  -- can_use_inbox (can still reply)
      false, -- can_create_campaigns
      true,  -- trial_expired
      0;     -- days_until_trial_expires
    RETURN;
  END IF;

  -- Check grace period
  SELECT * INTO v_grace_period
  FROM public.billing_grace_period
  WHERE owner_id = p_owner_id
    AND status = 'active'
  LIMIT 1;

  IF v_grace_period IS NOT NULL THEN
    -- Calculate days since payment failed
    v_days_since_failure := EXTRACT(EPOCH FROM (v_now - v_grace_period.started_at)) / 86400;

    -- 7-day grace period escalation:
    -- Day 0: Payment fails → Show warning
    -- Day 1: Retry → Limit sending to 50%
    -- Day 3: Retry → Lock campaigns, keep inbox + scheduler active
    -- Day 7: Full lock

    IF v_days_since_failure >= 7 THEN
      RETURN QUERY SELECT 
        'locked',
        v_days_since_failure::int,
        v_grace_period.ends_at,
        false, false, false, false, false, 0;
    ELSIF v_days_since_failure >= 3 THEN
      RETURN QUERY SELECT 
        'grace_period',
        v_days_since_failure::int,
        v_grace_period.ends_at,
        false, -- can_send
        true,  -- can_schedule
        true,  -- can_use_inbox
        false, -- can_create_campaigns
        false,
        0;
    ELSIF v_days_since_failure >= 1 THEN
      RETURN QUERY SELECT 
        'grace_period',
        v_days_since_failure::int,
        v_grace_period.ends_at,
        true,  -- can_send (limited)
        true,  -- can_schedule
        true,  -- can_use_inbox
        true,  -- can_create_campaigns
        false,
        0;
    ELSE
      RETURN QUERY SELECT 
        'grace_period',
        v_days_since_failure::int,
        v_grace_period.ends_at,
        true, true, true, true, false, 0;
    END IF;
  ELSE
    -- No grace period - check subscription status
    IF v_subscription.status = 'active' OR v_subscription.status = 'trialing' THEN
      -- Calculate days until trial expires
      DECLARE
        v_days_until_trial int := 0;
      BEGIN
        IF v_subscription.trial_ends_at IS NOT NULL THEN
          v_days_until_trial := GREATEST(0, EXTRACT(EPOCH FROM (v_subscription.trial_ends_at - v_now)) / 86400)::int;
        END IF;
        
        RETURN QUERY SELECT 
          'active',
          0,
          NULL::timestamptz,
          true, true, true, true, false, v_days_until_trial;
      END;
    ELSE
      RETURN QUERY SELECT 
        v_subscription.billing_status,
        0,
        NULL::timestamptz,
        false, false, false, false, false, 0;
    END IF;
  END IF;
END;
$$;

-- 10. Function: Start Grace Period (v2 - 7 days)
CREATE OR REPLACE FUNCTION public.start_grace_period(p_owner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now timestamptz := now();
  v_ends_at timestamptz;
BEGIN
  v_ends_at := v_now + INTERVAL '7 days';

  -- Create or update grace period
  INSERT INTO public.billing_grace_period (
    owner_id,
    started_at,
    ends_at,
    status,
    days_elapsed,
    retry_count
  )
  VALUES (
    p_owner_id,
    v_now,
    v_ends_at,
    'active',
    0,
    0
  )
  ON CONFLICT (owner_id) DO UPDATE SET
    started_at = EXCLUDED.started_at,
    ends_at = EXCLUDED.ends_at,
    status = 'active',
    days_elapsed = 0,
    retry_count = billing_grace_period.retry_count + 1,
    last_retry_at = v_now;

  -- Update subscription
  UPDATE public.subscriptions
  SET 
    billing_status = 'past_due',
    status = 'past_due',
    payment_failed_at = v_now,
    grace_period_ends_at = v_ends_at,
    updated_at = v_now
  WHERE owner_id = p_owner_id;

  -- Log event
  INSERT INTO public.billing_events (owner_id, event_type, event_data)
  VALUES (
    p_owner_id,
    'grace_period_started',
    jsonb_build_object('ends_at', v_ends_at, 'duration_days', 7)
  );
END;
$$;

-- 11. Function: Resolve Grace Period (v2)
CREATE OR REPLACE FUNCTION public.resolve_grace_period(p_owner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now timestamptz := now();
BEGIN
  -- Mark grace period as resolved
  UPDATE public.billing_grace_period
  SET 
    status = 'resolved',
    metadata = jsonb_build_object('resolved_at', v_now)
  WHERE owner_id = p_owner_id
    AND status = 'active';

  -- Unlock features
  UPDATE public.billing_locks
  SET unlocked_at = v_now
  WHERE owner_id = p_owner_id
    AND lock_type = 'payment_failed'
    AND unlocked_at IS NULL;

  -- Update subscription
  UPDATE public.subscriptions
  SET 
    billing_status = 'active',
    status = 'active',
    payment_failed_at = NULL,
    grace_period_ends_at = NULL,
    locked_at = NULL,
    locked_reason = NULL,
    updated_at = v_now
  WHERE owner_id = p_owner_id;

  -- Log event
  INSERT INTO public.billing_events (owner_id, event_type, event_data)
  VALUES (
    p_owner_id,
    'grace_period_ended',
    jsonb_build_object('resolved_at', v_now)
  );
END;
$$;

-- 12. Function: Check Plan Limits (v2)
CREATE OR REPLACE FUNCTION public.check_plan_limits_v2(
  p_owner_id uuid,
  p_action text,
  p_count int DEFAULT 1
)
RETURNS TABLE (
  allowed boolean,
  reason text,
  current_usage jsonb,
  limits jsonb,
  upgrade_plan text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_subscription public.subscriptions%ROWTYPE;
  v_limits public.plan_limits%ROWTYPE;
  v_usage public.billing_usage%ROWTYPE;
  v_current_year int;
  v_current_month int;
  v_campaign_count int;
  v_billing_status record;
BEGIN
  -- Get current year/month
  v_current_year := EXTRACT(YEAR FROM now());
  v_current_month := EXTRACT(MONTH FROM now());

  -- Check billing status
  SELECT * INTO v_billing_status
  FROM public.get_billing_status_with_grace_period_v2(p_owner_id);

  IF v_billing_status.billing_status = 'locked' OR v_billing_status.billing_status = 'trial_expired' THEN
    RETURN QUERY SELECT 
      false,
      'Account locked. Please update payment method or upgrade.',
      '{}'::jsonb,
      '{}'::jsonb,
      NULL::text;
    RETURN;
  END IF;

  -- Get subscription
  SELECT * INTO v_subscription
  FROM public.subscriptions
  WHERE owner_id = p_owner_id
  LIMIT 1;

  IF v_subscription IS NULL OR (v_subscription.status != 'active' AND v_subscription.status != 'trialing') THEN
    RETURN QUERY SELECT 
      false,
      'No active subscription found.',
      '{}'::jsonb,
      '{}'::jsonb,
      'starter'::text;
    RETURN;
  END IF;

  -- Get plan limits
  SELECT * INTO v_limits
  FROM public.plan_limits
  WHERE plan = v_subscription.plan;

  -- Get usage
  SELECT * INTO v_usage
  FROM public.billing_usage
  WHERE owner_id = p_owner_id
    AND year = v_current_year
    AND month = v_current_month;

  IF v_usage IS NULL THEN
    INSERT INTO public.billing_usage (owner_id, year, month)
    VALUES (p_owner_id, v_current_year, v_current_month)
    RETURNING * INTO v_usage;
  END IF;

  -- Check action-specific limits
  CASE p_action
    WHEN 'create_campaign' THEN
      SELECT COUNT(*) INTO v_campaign_count
      FROM public.campaigns
      WHERE owner_id = p_owner_id
        AND status IN ('running', 'sending', 'active');

      IF v_campaign_count >= v_limits.max_campaigns THEN
        RETURN QUERY SELECT 
          false,
          format('Campaign limit reached (%s/%s). Upgrade to continue.', v_campaign_count, v_limits.max_campaigns),
          jsonb_build_object('campaigns', v_campaign_count),
          jsonb_build_object('max_campaigns', v_limits.max_campaigns),
          CASE 
            WHEN v_subscription.plan = 'starter' THEN 'growth'
            WHEN v_subscription.plan = 'growth' THEN 'domination'
            ELSE NULL
          END;
        RETURN;
      END IF;

    WHEN 'send_email' THEN
      IF (v_usage.emails_sent + p_count) > v_limits.max_emails_per_month THEN
        RETURN QUERY SELECT 
          false,
          format('Email limit reached (%s/%s). Upgrade to continue.', v_usage.emails_sent, v_limits.max_emails_per_month),
          jsonb_build_object('emails_sent', v_usage.emails_sent),
          jsonb_build_object('max_emails_per_month', v_limits.max_emails_per_month),
          CASE 
            WHEN v_subscription.plan = 'starter' THEN 'growth'
            WHEN v_subscription.plan = 'growth' THEN 'domination'
            ELSE NULL
          END;
        RETURN;
      END IF;

    WHEN 'add_team_member' THEN
      IF v_usage.seats_used >= v_limits.max_seats THEN
        RETURN QUERY SELECT 
          false,
          format('Seat limit reached (%s/%s). Upgrade to add more team members.', v_usage.seats_used, v_limits.max_seats),
          jsonb_build_object('seats_used', v_usage.seats_used),
          jsonb_build_object('max_seats', v_limits.max_seats),
          CASE 
            WHEN v_subscription.plan = 'starter' THEN 'growth'
            WHEN v_subscription.plan = 'growth' THEN 'domination'
            ELSE NULL
          END;
        RETURN;
      END IF;
  END CASE;

  -- All checks passed
  RETURN QUERY SELECT 
    true,
    'OK',
    jsonb_build_object(
      'emails_sent', v_usage.emails_sent,
      'campaigns', v_campaign_count,
      'seats_used', v_usage.seats_used
    ),
    jsonb_build_object(
      'max_emails_per_month', v_limits.max_emails_per_month,
      'max_campaigns', v_limits.max_campaigns,
      'max_seats', v_limits.max_seats
    ),
    NULL::text;
END;
$$;

-- 13. Trigger: Update updated_at on billing_usage
CREATE OR REPLACE FUNCTION update_billing_usage_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_billing_usage_updated_at_trigger ON public.billing_usage;
CREATE TRIGGER update_billing_usage_updated_at_trigger
  BEFORE UPDATE ON public.billing_usage
  FOR EACH ROW
  EXECUTE FUNCTION update_billing_usage_updated_at();

-- Comments
COMMENT ON TABLE public.billing_usage IS 'Block 17300: Monthly usage tracking (emails, campaigns, AI, seats)';
COMMENT ON TABLE public.billing_locks IS 'Block 17300: Feature locks (trial expired, payment failed, over limit)';
COMMENT ON TABLE public.billing_events IS 'Block 17300: Billing event audit trail';
COMMENT ON TABLE public.billing_grace_period IS 'Block 17300: 7-day grace period tracking for payment failures';
COMMENT ON FUNCTION public.check_trial_expiration(uuid) IS 'Block 17300: Check if trial expired (locks at midnight Day 7)';
COMMENT ON FUNCTION public.lock_features_on_trial_expired(uuid) IS 'Block 17300: Lock features when trial expires';
COMMENT ON FUNCTION public.get_billing_status_with_grace_period_v2(uuid) IS 'Block 17300: Get billing status with 7-day grace period logic';
COMMENT ON FUNCTION public.start_grace_period(uuid) IS 'Block 17300: Start 7-day grace period on payment failure';
COMMENT ON FUNCTION public.resolve_grace_period(uuid) IS 'Block 17300: Resolve grace period on payment success';
COMMENT ON FUNCTION public.check_plan_limits_v2(uuid, text, int) IS 'Block 17300: Check plan limits with upgrade suggestions';





















































