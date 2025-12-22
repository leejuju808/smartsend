-- Block 8440 — Template Performance Leaderboard (Best-Performing Templates)
-- Creates a view for template performance stats: sends, reply rates, and intent counts

CREATE OR REPLACE VIEW template_performance_stats AS
SELECT
  t.id AS template_id,
  t.name AS template_name,
  t.subject AS template_subject,

  COUNT(DISTINCT cs.id) AS total_sends,
  COUNT(DISTINCT cs.lead_id) AS total_leads_sent,

  -- replies joining on campaign + lead
  COUNT(DISTINCT cr.id) AS total_replies,
  COUNT(DISTINCT cr.lead_id) AS total_leads_replied,

  -- reply rate per lead
  CASE
    WHEN COUNT(DISTINCT cs.lead_id) = 0 THEN 0::numeric
    ELSE ROUND(
      (COUNT(DISTINCT cr.lead_id)::numeric / COUNT(DISTINCT cs.lead_id)::numeric) * 100,
      1
    )
  END AS reply_rate_leads_pct,

  -- positive / high-value replies
  COUNT(*) FILTER (WHERE cr.intent = 'positive')    AS intent_positive_count,
  COUNT(*) FILTER (WHERE cr.intent = 'referral')    AS intent_referral_count,
  COUNT(*) FILTER (WHERE cr.intent = 'unsubscribe') AS intent_unsubscribe_count,
  COUNT(*) FILTER (WHERE cr.intent = 'bounce')      AS intent_bounce_count,
  COUNT(*) FILTER (WHERE cr.intent = 'spam')        AS intent_spam_count,

  MIN(cs.sent_at) AS first_send_at,
  MAX(cs.sent_at) AS last_send_at

FROM email_templates t
LEFT JOIN campaigns c
  ON c.template_id = t.id
LEFT JOIN campaign_sends cs
  ON cs.campaign_id = c.id
LEFT JOIN campaign_replies cr
  ON cr.campaign_id = cs.campaign_id
 AND cr.lead_id = cs.lead_id
GROUP BY
  t.id, t.name, t.subject;

-- Grant access to authenticated users
GRANT SELECT ON template_performance_stats TO authenticated;































































