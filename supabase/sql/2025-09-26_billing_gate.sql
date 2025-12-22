-- Ensure profiles has a subscription_status we can trust for gating
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'free'
  CHECK (subscription_status IN ('free','trialing','active','past_due','canceled'));

CREATE INDEX IF NOT EXISTS profiles_subscription_status_idx
  ON public.profiles (subscription_status);