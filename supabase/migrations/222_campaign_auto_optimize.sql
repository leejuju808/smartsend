-- Block 213: Auto-Optimization Engine v1
-- Add auto_optimize column to campaigns table

ALTER TABLE public.campaigns
ADD COLUMN IF NOT EXISTS auto_optimize boolean DEFAULT false;

COMMENT ON COLUMN public.campaigns.auto_optimize IS 'When enabled, automatically shifts traffic toward winning variants and pauses losers';










