-- Auto-stop on reply feature
-- Adds is_active and stopped_at columns to campaign_leads table
-- Adds processed column to email_logs table for tracking processed replies

-- Add columns to campaign_leads
ALTER TABLE public.campaign_leads
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS stopped_at timestamptz;

-- Create index for faster filtering of active leads
CREATE INDEX IF NOT EXISTS idx_campaign_leads_is_active 
  ON public.campaign_leads(campaign_id, is_active) 
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_campaign_leads_stopped_at 
  ON public.campaign_leads(stopped_at) 
  WHERE stopped_at IS NOT NULL;

-- Add processed column to email_logs for tracking processed replies
ALTER TABLE public.email_logs
  ADD COLUMN IF NOT EXISTS processed boolean DEFAULT false;

-- Create index for faster querying of unprocessed replies
CREATE INDEX IF NOT EXISTS idx_email_logs_processed 
  ON public.email_logs(reply_detected, processed) 
  WHERE reply_detected = true AND processed = false;

