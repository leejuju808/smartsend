-- Add replied field to campaign_logs and create reply_logs table
-- Migration for reply detection system

-- Add replied field to campaign_logs if it doesn't exist
ALTER TABLE IF EXISTS public.campaign_logs
  ADD COLUMN IF NOT EXISTS replied BOOLEAN DEFAULT FALSE;

-- Create reply_logs table for storing AI classification results
CREATE TABLE IF NOT EXISTS public.reply_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id text,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  type text NOT NULL,
  confidence numeric CHECK (confidence >= 0 AND confidence <= 1),
  created_at timestamptz DEFAULT now()
);

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_reply_logs_email_id ON public.reply_logs(email_id);
CREATE INDEX IF NOT EXISTS idx_reply_logs_campaign_id ON public.reply_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_reply_logs_created_at ON public.reply_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_logs_replied ON public.campaign_logs(replied) WHERE replied = true;

-- Enable RLS on reply_logs
ALTER TABLE IF EXISTS public.reply_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for reply_logs: Service role can manage all logs
DROP POLICY IF EXISTS "Service can manage reply_logs" ON public.reply_logs;
CREATE POLICY "Service can manage reply_logs" ON public.reply_logs
  FOR ALL USING (true) WITH CHECK (true);

-- RLS Policies for reply_logs: Users can view logs for their campaigns
DROP POLICY IF EXISTS "Users can view reply_logs" ON public.reply_logs;
CREATE POLICY "Users can view reply_logs" ON public.reply_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = reply_logs.campaign_id
    )
  );

