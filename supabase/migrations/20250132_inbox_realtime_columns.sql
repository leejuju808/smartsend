-- Add missing columns to campaign_logs for inbox realtime feature
-- This migration adds email_id, from_email, to_email, and last_message_at columns if they don't exist

-- Add email_id if it doesn't exist (may already exist in some schemas)
ALTER TABLE IF EXISTS public.campaign_logs
  ADD COLUMN IF NOT EXISTS email_id TEXT;

-- Add from_email if it doesn't exist
ALTER TABLE IF EXISTS public.campaign_logs
  ADD COLUMN IF NOT EXISTS from_email TEXT;

-- Add to_email if it doesn't exist
ALTER TABLE IF EXISTS public.campaign_logs
  ADD COLUMN IF NOT EXISTS to_email TEXT;

-- Add last_message_at if it doesn't exist (may already exist as created_at or sent_at)
ALTER TABLE IF EXISTS public.campaign_logs
  ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ;

-- Set last_message_at to created_at or sent_at if available and last_message_at is null
UPDATE public.campaign_logs
SET last_message_at = COALESCE(sent_at, created_at)
WHERE last_message_at IS NULL
  AND (sent_at IS NOT NULL OR created_at IS NOT NULL);

-- Ensure replied column exists (should already exist from previous migration)
ALTER TABLE IF EXISTS public.campaign_logs
  ADD COLUMN IF NOT EXISTS replied BOOLEAN DEFAULT FALSE;

-- Faster list + status filters
CREATE INDEX IF NOT EXISTS campaign_logs_last_message_idx
  ON public.campaign_logs (last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS campaign_logs_replied_idx
  ON public.campaign_logs (replied);

CREATE INDEX IF NOT EXISTS campaign_logs_campaign_idx
  ON public.campaign_logs (campaign_id);

-- Enable Realtime for campaign_logs (if not already enabled)
-- Note: You'll need to enable this manually in Supabase dashboard under Table editor → Realtime toggle

