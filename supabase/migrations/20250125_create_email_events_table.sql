-- Email Events Table Migration
-- This migration creates the email_events table for tracking email engagement

-- Create email_events table
CREATE TABLE IF NOT EXISTS public.email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id TEXT,
  campaign_id UUID,
  recipient TEXT,
  subject TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'replied')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB,
  
  -- Foreign key constraints
  CONSTRAINT fk_email_events_campaign 
    FOREIGN KEY (campaign_id) 
    REFERENCES public.campaigns(id) 
    ON DELETE CASCADE
);

-- Create indexes for fast analytics queries
CREATE INDEX IF NOT EXISTS idx_email_events_created_at 
  ON public.email_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_events_recipient 
  ON public.email_events(recipient);

CREATE INDEX IF NOT EXISTS idx_email_events_campaign 
  ON public.email_events(campaign_id);

CREATE INDEX IF NOT EXISTS idx_email_events_event_type 
  ON public.email_events(event_type);

CREATE INDEX IF NOT EXISTS idx_email_events_email_id 
  ON public.email_events(email_id);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_email_events_campaign_created 
  ON public.email_events(campaign_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_events_recipient_created 
  ON public.email_events(recipient, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_events_type_created 
  ON public.email_events(event_type, created_at DESC);

-- Index for metadata queries (if using JSONB queries)
CREATE INDEX IF NOT EXISTS idx_email_events_metadata_provider 
  ON public.email_events USING GIN ((metadata->>'provider'));

-- Enable Row Level Security
ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Users can only see events for campaigns they own
CREATE POLICY "Users can view their own email events" ON public.email_events
  FOR SELECT USING (
    campaign_id IN (
      SELECT id FROM public.campaigns 
      WHERE user_id = auth.uid()
    )
  );

-- Service role can insert events (for webhooks)
CREATE POLICY "Service role can insert email events" ON public.email_events
  FOR INSERT WITH CHECK (true);

-- Create a view for analytics with aggregated data
CREATE OR REPLACE VIEW public.email_analytics AS
SELECT 
  campaign_id,
  recipient,
  COUNT(*) as total_events,
  COUNT(CASE WHEN event_type = 'sent' THEN 1 END) as sent_count,
  COUNT(CASE WHEN event_type = 'delivered' THEN 1 END) as delivered_count,
  COUNT(CASE WHEN event_type = 'opened' THEN 1 END) as opened_count,
  COUNT(CASE WHEN event_type = 'clicked' THEN 1 END) as clicked_count,
  COUNT(CASE WHEN event_type = 'bounced' THEN 1 END) as bounced_count,
  COUNT(CASE WHEN event_type = 'complained' THEN 1 END) as complained_count,
  COUNT(CASE WHEN event_type = 'replied' THEN 1 END) as replied_count,
  MIN(created_at) as first_event_at,
  MAX(created_at) as last_event_at,
  -- Calculate rates
  CASE 
    WHEN COUNT(CASE WHEN event_type = 'sent' THEN 1 END) > 0 
    THEN ROUND(
      (COUNT(CASE WHEN event_type = 'opened' THEN 1 END)::DECIMAL / 
       COUNT(CASE WHEN event_type = 'sent' THEN 1 END)) * 100, 2
    )
    ELSE 0 
  END as open_rate,
  CASE 
    WHEN COUNT(CASE WHEN event_type = 'sent' THEN 1 END) > 0 
    THEN ROUND(
      (COUNT(CASE WHEN event_type = 'clicked' THEN 1 END)::DECIMAL / 
       COUNT(CASE WHEN event_type = 'sent' THEN 1 END)) * 100, 2
    )
    ELSE 0 
  END as click_rate,
  CASE 
    WHEN COUNT(CASE WHEN event_type = 'sent' THEN 1 END) > 0 
    THEN ROUND(
      (COUNT(CASE WHEN event_type = 'replied' THEN 1 END)::DECIMAL / 
       COUNT(CASE WHEN event_type = 'sent' THEN 1 END)) * 100, 2
    )
    ELSE 0 
  END as reply_rate
FROM public.email_events
GROUP BY campaign_id, recipient;

-- Grant permissions
GRANT SELECT ON public.email_analytics TO authenticated;
GRANT SELECT, INSERT ON public.email_events TO authenticated;

-- Create function to get campaign analytics
CREATE OR REPLACE FUNCTION public.get_campaign_analytics(campaign_uuid UUID)
RETURNS TABLE (
  total_sent BIGINT,
  total_delivered BIGINT,
  total_opened BIGINT,
  total_clicked BIGINT,
  total_bounced BIGINT,
  total_complained BIGINT,
  total_replied BIGINT,
  open_rate DECIMAL,
  click_rate DECIMAL,
  reply_rate DECIMAL,
  bounce_rate DECIMAL,
  complaint_rate DECIMAL
) 
LANGUAGE SQL
SECURITY DEFINER
AS $$
  SELECT 
    COUNT(CASE WHEN event_type = 'sent' THEN 1 END) as total_sent,
    COUNT(CASE WHEN event_type = 'delivered' THEN 1 END) as total_delivered,
    COUNT(CASE WHEN event_type = 'opened' THEN 1 END) as total_opened,
    COUNT(CASE WHEN event_type = 'clicked' THEN 1 END) as total_clicked,
    COUNT(CASE WHEN event_type = 'bounced' THEN 1 END) as total_bounced,
    COUNT(CASE WHEN event_type = 'complained' THEN 1 END) as total_complained,
    COUNT(CASE WHEN event_type = 'replied' THEN 1 END) as total_replied,
    CASE 
      WHEN COUNT(CASE WHEN event_type = 'sent' THEN 1 END) > 0 
      THEN ROUND(
        (COUNT(CASE WHEN event_type = 'opened' THEN 1 END)::DECIMAL / 
         COUNT(CASE WHEN event_type = 'sent' THEN 1 END)) * 100, 2
      )
      ELSE 0 
    END as open_rate,
    CASE 
      WHEN COUNT(CASE WHEN event_type = 'sent' THEN 1 END) > 0 
      THEN ROUND(
        (COUNT(CASE WHEN event_type = 'clicked' THEN 1 END)::DECIMAL / 
         COUNT(CASE WHEN event_type = 'sent' THEN 1 END)) * 100, 2
      )
      ELSE 0 
    END as click_rate,
    CASE 
      WHEN COUNT(CASE WHEN event_type = 'sent' THEN 1 END) > 0 
      THEN ROUND(
        (COUNT(CASE WHEN event_type = 'replied' THEN 1 END)::DECIMAL / 
         COUNT(CASE WHEN event_type = 'sent' THEN 1 END)) * 100, 2
      )
      ELSE 0 
    END as reply_rate,
    CASE 
      WHEN COUNT(CASE WHEN event_type = 'sent' THEN 1 END) > 0 
      THEN ROUND(
        (COUNT(CASE WHEN event_type = 'bounced' THEN 1 END)::DECIMAL / 
         COUNT(CASE WHEN event_type = 'sent' THEN 1 END)) * 100, 2
      )
      ELSE 0 
    END as bounce_rate,
    CASE 
      WHEN COUNT(CASE WHEN event_type = 'sent' THEN 1 END) > 0 
      THEN ROUND(
        (COUNT(CASE WHEN event_type = 'complained' THEN 1 END)::DECIMAL / 
         COUNT(CASE WHEN event_type = 'sent' THEN 1 END)) * 100, 2
      )
      ELSE 0 
    END as complaint_rate
  FROM public.email_events
  WHERE campaign_id = campaign_uuid;
$$;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.get_campaign_analytics(UUID) TO authenticated;