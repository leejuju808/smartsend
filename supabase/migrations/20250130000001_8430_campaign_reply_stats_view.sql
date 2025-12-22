-- Block 8430 — Reply Analytics Overview (Campaign-Level Metrics + Intent Breakdown)
-- Creates campaign_reply_stats view for campaign analytics

CREATE OR REPLACE VIEW public.campaign_reply_stats AS
WITH send_stats AS (
  SELECT
    campaign_id,
    COUNT(*) AS total_sends,
    COUNT(DISTINCT lead_id) AS total_leads_sent,
    MIN(sent_at) AS first_send_at,
    MAX(sent_at) AS last_send_at
  FROM public.campaign_sends
  WHERE sent_at IS NOT NULL
  GROUP BY campaign_id
),
reply_stats AS (
  SELECT
    cr.campaign_id,
    COUNT(*) AS total_replies,
    COUNT(DISTINCT cr.lead_id) AS total_leads_replied,
    COUNT(*) FILTER (WHERE cr.intent = 'positive')      AS intent_positive_count,
    COUNT(*) FILTER (WHERE cr.intent = 'neutral')       AS intent_neutral_count,
    COUNT(*) FILTER (WHERE cr.intent = 'negative')      AS intent_negative_count,
    COUNT(*) FILTER (WHERE cr.intent = 'unsubscribe')   AS intent_unsubscribe_count,
    COUNT(*) FILTER (WHERE cr.intent = 'bounce')        AS intent_bounce_count,
    COUNT(*) FILTER (WHERE cr.intent = 'spam')          AS intent_spam_count,
    COUNT(*) FILTER (WHERE cr.intent = 'referral')      AS intent_referral_count,
    COUNT(*) FILTER (WHERE cr.intent = 'out_of_office') AS intent_out_of_office_count,
    COUNT(*) FILTER (WHERE cr.intent = 'wrong_person')  AS intent_wrong_person_count,
    COUNT(*) FILTER (WHERE cr.intent = 'not_sure')      AS intent_not_sure_count
  FROM public.campaign_replies cr
  INNER JOIN public.campaign_sends cs
    ON cs.campaign_id = cr.campaign_id
    AND cs.lead_id = cr.lead_id
    AND cs.sent_at IS NOT NULL
  GROUP BY cr.campaign_id
)
SELECT
  c.id AS campaign_id,
  c.name AS campaign_name,
  COALESCE(ss.total_sends, 0) AS total_sends,
  COALESCE(ss.total_leads_sent, 0) AS total_leads_sent,
  COALESCE(rs.total_replies, 0) AS total_replies,
  COALESCE(rs.total_leads_replied, 0) AS total_leads_replied,
  CASE
    WHEN COALESCE(ss.total_leads_sent, 0) = 0 THEN 0::numeric
    ELSE ROUND(
      (COALESCE(rs.total_leads_replied, 0)::numeric / ss.total_leads_sent::numeric) * 100,
      1
    )
  END AS reply_rate_leads_pct,
  COALESCE(rs.intent_positive_count, 0) AS intent_positive_count,
  COALESCE(rs.intent_neutral_count, 0) AS intent_neutral_count,
  COALESCE(rs.intent_negative_count, 0) AS intent_negative_count,
  COALESCE(rs.intent_unsubscribe_count, 0) AS intent_unsubscribe_count,
  COALESCE(rs.intent_bounce_count, 0) AS intent_bounce_count,
  COALESCE(rs.intent_spam_count, 0) AS intent_spam_count,
  COALESCE(rs.intent_referral_count, 0) AS intent_referral_count,
  COALESCE(rs.intent_out_of_office_count, 0) AS intent_out_of_office_count,
  COALESCE(rs.intent_wrong_person_count, 0) AS intent_wrong_person_count,
  COALESCE(rs.intent_not_sure_count, 0) AS intent_not_sure_count,
  ss.first_send_at,
  ss.last_send_at
FROM public.campaigns c
LEFT JOIN send_stats ss ON ss.campaign_id = c.id
LEFT JOIN reply_stats rs ON rs.campaign_id = c.id;

-- Grant access to authenticated users
GRANT SELECT ON public.campaign_reply_stats TO authenticated;

