-- Add subscription_current_period_end column to users and workspaces
ALTER TABLE IF EXISTS public.users
  ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMP WITH TIME ZONE;

ALTER TABLE IF EXISTS public.workspaces
  ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMP WITH TIME ZONE;

-- Add helpful index for subscription period lookups
CREATE INDEX IF NOT EXISTS idx_users_subscription_period ON public.users(subscription_current_period_end);
CREATE INDEX IF NOT EXISTS idx_workspaces_subscription_period ON public.workspaces(subscription_current_period_end); 