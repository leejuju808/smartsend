-- Add Stripe fields if missing
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'free'
    CHECK (subscription_status IN ('free','trialing','active','past_due','canceled'));

CREATE INDEX IF NOT EXISTS profiles_stripe_customer_idx ON public.profiles (stripe_customer_id);
CREATE INDEX IF NOT EXISTS profiles_stripe_subscription_idx ON public.profiles (stripe_subscription_id);
CREATE INDEX IF NOT EXISTS profiles_subscription_status_idx ON public.profiles (subscription_status);