-- Create get_campaign_metrics RPC function for dashboard analytics
-- This function aggregates campaign metrics and daily stats for the dashboard

CREATE OR REPLACE FUNCTION public.get_campaign_metrics()
RETURNS TABLE (
  total_sent bigint,
  total_opens bigint,
  total_replies bigint,
  daily_stats jsonb
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_total_sent bigint := 0;
  v_total_opens bigint := 0;
  v_total_replies bigint := 0;
  v_daily_stats jsonb := '[]'::jsonb;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Calculate total metrics from campaign_recipients and tracking_events
  SELECT 
    COUNT(cr.id)::bigint,
    COUNT(DISTINCT te_open.recipient_id)::bigint,
    COUNT(DISTINCT te_reply.recipient_id)::bigint
  INTO v_total_sent, v_total_opens, v_total_replies
  FROM public.campaign_recipients cr
  LEFT JOIN public.campaigns c ON c.id = cr.campaign_id
  LEFT JOIN public.tracking_events te_open ON te_open.recipient_id = cr.id AND te_open.type = 'open'
  LEFT JOIN public.tracking_events te_reply ON te_reply.recipient_id = cr.id AND te_reply.type = 'reply'
  WHERE c.user_id = v_user_id 
    AND cr.status = 'sent';

  -- Calculate daily stats for the last 30 days
  SELECT jsonb_agg(
    jsonb_build_object(
      'date', date_series.date,
      'sent', COALESCE(daily_sent.sent_count, 0),
      'opens', COALESCE(daily_opens.open_count, 0),
      'replies', COALESCE(daily_replies.reply_count, 0)
    )
    ORDER BY date_series.date
  )
  INTO v_daily_stats
  FROM (
    SELECT generate_series(
      CURRENT_DATE - INTERVAL '30 days',
      CURRENT_DATE,
      INTERVAL '1 day'
    )::date as date
  ) date_series
  LEFT JOIN (
    SELECT 
      cr.sent_at::date as sent_date,
      COUNT(*) as sent_count
    FROM public.campaign_recipients cr
    JOIN public.campaigns c ON c.id = cr.campaign_id
    WHERE c.user_id = v_user_id 
      AND cr.status = 'sent'
      AND cr.sent_at >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY cr.sent_at::date
  ) daily_sent ON daily_sent.sent_date = date_series.date
  LEFT JOIN (
    SELECT 
      te.created_at::date as open_date,
      COUNT(DISTINCT te.recipient_id) as open_count
    FROM public.tracking_events te
    JOIN public.campaign_recipients cr ON cr.id = te.recipient_id
    JOIN public.campaigns c ON c.id = cr.campaign_id
    WHERE c.user_id = v_user_id 
      AND te.type = 'open'
      AND te.created_at >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY te.created_at::date
  ) daily_opens ON daily_opens.open_date = date_series.date
  LEFT JOIN (
    SELECT 
      te.created_at::date as reply_date,
      COUNT(DISTINCT te.recipient_id) as reply_count
    FROM public.tracking_events te
    JOIN public.campaign_recipients cr ON cr.id = te.recipient_id
    JOIN public.campaigns c ON c.id = cr.campaign_id
    WHERE c.user_id = v_user_id 
      AND te.type = 'reply'
      AND te.created_at >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY te.created_at::date
  ) daily_replies ON daily_replies.reply_date = date_series.date;

  -- Return the results
  RETURN QUERY SELECT v_total_sent, v_total_opens, v_total_replies, v_daily_stats;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_campaign_metrics() TO authenticated;