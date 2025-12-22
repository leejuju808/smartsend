-- Block 240: Campaign Performance Dashboard v1
-- Creates campaign_daily_stats view for time-series analytics

-- Create or replace view for daily campaign statistics
-- Aggregates from multiple event sources using UNION ALL for better performance
CREATE OR REPLACE VIEW public.campaign_daily_stats AS
WITH all_events AS (
  -- Sends from send_logs
  SELECT 
    campaign_id,
    DATE(sent_at) AS day,
    'sent' AS event_type,
    id AS event_id
  FROM public.send_logs
  WHERE campaign_id IS NOT NULL AND sent_at IS NOT NULL AND status = 'sent'
  
  UNION ALL
  
  -- Sends from send_queue (fallback)
  SELECT 
    campaign_id,
    DATE(COALESCE(sent_at, scheduled_at, created_at)) AS day,
    'sent' AS event_type,
    id AS event_id
  FROM public.send_queue
  WHERE campaign_id IS NOT NULL AND status = 'sent'
  
  UNION ALL
  
  -- Opens, clicks, replies from email_events
  SELECT 
    campaign_id,
    DATE(created_at) AS day,
    event_type,
    id AS event_id
  FROM public.email_events
  WHERE campaign_id IS NOT NULL AND event_type IN ('opened', 'clicked', 'replied', 'sent')
  
  UNION ALL
  
  -- Replies from inbox_threads
  SELECT 
    campaign_id,
    DATE(replied_at) AS day,
    'replied' AS event_type,
    id AS event_id
  FROM public.inbox_threads
  WHERE campaign_id IS NOT NULL AND replied_at IS NOT NULL
  
  UNION ALL
  
  -- Meetings from meeting_intents
  SELECT 
    campaign_id,
    DATE(detected_at) AS day,
    'meeting_intent' AS event_type,
    id AS event_id
  FROM public.meeting_intents
  WHERE campaign_id IS NOT NULL
  
  UNION ALL
  
  -- Meetings from meetings table
  SELECT 
    campaign_id,
    DATE(created_at) AS day,
    'meeting_intent' AS event_type,
    id AS event_id
  FROM public.meetings
  WHERE campaign_id IS NOT NULL
)
SELECT
  campaign_id,
  day,
  COUNT(*) FILTER (WHERE event_type = 'sent') AS sends,
  COUNT(*) FILTER (WHERE event_type = 'opened') AS opens,
  COUNT(*) FILTER (WHERE event_type = 'clicked') AS clicks,
  COUNT(*) FILTER (WHERE event_type = 'replied') AS replies,
  COUNT(*) FILTER (WHERE event_type = 'meeting_intent') AS meetings
FROM all_events
GROUP BY campaign_id, day
ORDER BY campaign_id, day ASC;

-- Grant access to authenticated users
GRANT SELECT ON public.campaign_daily_stats TO authenticated;
GRANT SELECT ON public.campaign_daily_stats TO service_role;

-- Add comment
COMMENT ON VIEW public.campaign_daily_stats IS 'Daily aggregated statistics per campaign: sends, opens, clicks, replies, meetings';

