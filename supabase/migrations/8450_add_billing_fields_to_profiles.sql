-- 8450_add_billing_fields_to_profiles.sql
-- Block 8450: Stripe Billing v1 (Subscriptions + Plan Sync)
-- Add billing fields to profiles table for Stripe integration

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS plan TEXT,            -- 'free', 'pro', 'enterprise', etc.
  ADD COLUMN IF NOT EXISTS plan_status TEXT,     -- 'active', 'trialing', 'past_due', 'canceled', etc.
  ADD COLUMN IF NOT EXISTS plan_renews_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer
  ON profiles (stripe_customer_id);

CREATE INDEX IF NOT EXISTS idx_profiles_plan
  ON profiles (plan, plan_status);































































