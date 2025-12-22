-- =========================================================
-- Block 8690 — Campaign Performance Stats View
-- =========================================================

DROP VIEW IF EXISTS public.campaign_performance_view;

CREATE VIEW public.campaign_performance_view AS
WITH sends AS (
  SELECT
    campaign_id,
    COUNT(*) FILTER (WHERE status = 'sent') AS sent_count,
    COUNT(*) FILTER (WHERE status = 'failed') AS failed_count
  FROM public.outbound_emails
  GROUP BY campaign_id
),
replies AS (
  SELECT
    campaign_id,
    COUNT(*) AS reply_count,
    COUNT(*) FILTER (WHERE intent = 'hot') AS hot_count,
    COUNT(*) FILTER (WHERE intent = 'warm') AS warm_count,
    COUNT(*) FILTER (WHERE intent = 'not_interested') AS not_interested_count
  FROM public.email_replies
  GROUP BY campaign_id
),
value AS (
  SELECT
    COALESCE(l.campaign_id, cl.campaign_id) AS campaign_id,
    SUM(l.estimated_value) AS pipeline_value
  FROM public.leads l
  LEFT JOIN public.campaign_leads cl ON cl.lead_id = l.id
  WHERE (l.campaign_id IS NOT NULL OR cl.campaign_id IS NOT NULL)
    AND l.estimated_value IS NOT NULL
  GROUP BY COALESCE(l.campaign_id, cl.campaign_id)
)
SELECT
  c.id AS campaign_id,
  c.workspace_id,
  c.name,
  c.created_at,
  COALESCE(s.sent_count, 0) AS emails_sent,
  COALESCE(s.failed_count, 0) AS emails_failed,
  COALESCE(r.reply_count, 0) AS replies,
  COALESCE(r.hot_count, 0) AS hot,
  COALESCE(r.warm_count, 0) AS warm,
  COALESCE(r.not_interested_count, 0) AS not_interested,
  COALESCE(v.pipeline_value, 0) AS pipeline_value
FROM public.campaigns c
LEFT JOIN sends s ON s.campaign_id = c.id
LEFT JOIN replies r ON r.campaign_id = c.id
LEFT JOIN value v ON v.campaign_id = c.id;

-- Grant access
GRANT SELECT ON public.campaign_performance_view TO authenticated, anon;

-- Add comment
COMMENT ON VIEW public.campaign_performance_view IS 
  'Campaign performance metrics: emails sent/failed, replies by intent, pipeline value';

