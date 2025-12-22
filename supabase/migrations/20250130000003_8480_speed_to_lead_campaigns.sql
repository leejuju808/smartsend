-- Block 8480 — Speed-to-Lead Mode v1 (Auto-Follow-Up on Hot Replies)
-- Part 1: Add Speed-to-Lead settings to campaigns table

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS speed_to_lead_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  -- delay between reply detected and auto follow-up (in seconds)
  ADD COLUMN IF NOT EXISTS speed_to_lead_delay_seconds INTEGER NOT NULL DEFAULT 300, -- 5 minutes
  -- which intents should trigger speed-to-lead
  ADD COLUMN IF NOT EXISTS speed_to_lead_intents TEXT[] NOT NULL DEFAULT ARRAY['positive','referral'];

-- Create index for faster queries on enabled campaigns
CREATE INDEX IF NOT EXISTS idx_campaigns_speed_to_lead_enabled 
  ON public.campaigns(speed_to_lead_enabled) 
  WHERE speed_to_lead_enabled = TRUE;































































