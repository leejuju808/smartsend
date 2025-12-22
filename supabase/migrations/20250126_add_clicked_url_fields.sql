-- Add clicked URL fields to email_events table for analytics
-- This migration adds columns to track clicked URLs, domains, and paths

-- Add clicked URL columns to email_events table
ALTER TABLE public.email_events 
ADD COLUMN IF NOT EXISTS clicked_url TEXT,
ADD COLUMN IF NOT EXISTS clicked_domain TEXT,
ADD COLUMN IF NOT EXISTS clicked_path TEXT;

-- Create indexes for efficient analytics queries
CREATE INDEX IF NOT EXISTS idx_email_events_clicked_domain 
  ON public.email_events(clicked_domain);

CREATE INDEX IF NOT EXISTS idx_email_events_clicked_path 
  ON public.email_events(clicked_path);

CREATE INDEX IF NOT EXISTS idx_email_events_clicked_url 
  ON public.email_events(clicked_url);

-- Composite index for clicked events with domain and path
CREATE INDEX IF NOT EXISTS idx_email_events_clicked_analytics 
  ON public.email_events(event_type, clicked_domain, clicked_path) 
  WHERE event_type = 'clicked';

-- Update the email_analytics view to include clicked URL data
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

-- Create a view for link analytics
CREATE OR REPLACE VIEW public.link_analytics AS
SELECT 
  clicked_domain,
  clicked_path,
  clicked_url,
  COUNT(*) as click_count,
  COUNT(DISTINCT recipient) as unique_recipients,
  COUNT(DISTINCT campaign_id) as unique_campaigns,
  MIN(created_at) as first_clicked_at,
  MAX(created_at) as last_clicked_at
FROM public.email_events
WHERE event_type = 'clicked' 
  AND clicked_domain IS NOT NULL 
  AND clicked_path IS NOT NULL
GROUP BY clicked_domain, clicked_path, clicked_url;

-- Grant permissions
GRANT SELECT ON public.link_analytics TO authenticated;