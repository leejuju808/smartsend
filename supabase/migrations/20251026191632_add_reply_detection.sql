-- Add reply detection columns to leads table
ALTER TABLE IF EXISTS public.leads
  ADD COLUMN IF NOT EXISTS reply_detected BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reply_summary TEXT,
  ADD COLUMN IF NOT EXISTS reply_classification TEXT;

-- Add indexes for faster querying
CREATE INDEX IF NOT EXISTS idx_leads_reply_detected ON public.leads(reply_detected);
CREATE INDEX IF NOT EXISTS idx_leads_replied_at ON public.leads(replied_at) WHERE replied_at IS NOT NULL;

-- Add reply_classification column to campaign_logs if it doesn't exist
ALTER TABLE IF EXISTS public.campaign_logs
  ADD COLUMN IF NOT EXISTS event_type TEXT,
  ADD COLUMN IF NOT EXISTS details JSONB,
  ADD COLUMN IF NOT EXISTS reply_classification TEXT;

-- Create or update campaign_logs table to track AI classifications
CREATE TABLE IF NOT EXISTS public.campaign_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL, -- e.g., 'email_sent', 'reply_detected', 'classification'
  details JSONB,
  classification TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for campaign_logs
CREATE INDEX IF NOT EXISTS idx_campaign_logs_lead_id ON public.campaign_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_campaign_logs_campaign_id ON public.campaign_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_logs_event_type ON public.campaign_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_campaign_logs_created_at ON public.campaign_logs(created_at DESC);

-- Enable RLS on campaign_logs if not already enabled
ALTER TABLE IF EXISTS public.campaign_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policy for campaign_logs: Users can view logs for their campaigns
DROP POLICY IF EXISTS "Users can view campaign_logs" ON public.campaign_logs;
CREATE POLICY "Users can view campaign_logs" ON public.campaign_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_logs.campaign_id
    )
  );

-- RLS Policy for campaign_logs: Service role can manage all logs
DROP POLICY IF EXISTS "Service can manage campaign_logs" ON public.campaign_logs;
CREATE POLICY "Service can manage campaign_logs" ON public.campaign_logs
  FOR ALL USING (true) WITH CHECK (true);
