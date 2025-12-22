-- =========================================================
-- Block 21725 — SmartSend Roofing Campaign "Money + Follow-Up" Detail Tab v1
-- =========================================================
-- 
-- This creates a view that merges campaign money data (leads + pipeline value)
-- with follow-up stats (emails sent, replies, hot/warm leads) for a single campaign.
--
-- When a roofer opens ONE campaign, they see:
-- 💰 Pipeline value + booked value
-- 🔥 Hot / 🟡 Warm / ❌ Not interested counts
-- ✉️ Initial vs follow-up emails sent
-- 📈 Reply rate + hot lead rate
-- 🧠 "Why this campaign is making you money" story

-- ============================================================================
-- 1. Create campaign_money_follow_up_view
-- ============================================================================
-- This view merges:
-- - campaign_money_view (leads + money from leads table)
-- - campaign_follow_up_stats_view (emails + replies)

CREATE OR REPLACE VIEW public.campaign_money_follow_up_view AS
SELECT
  c.id AS campaign_id,
  c.company_id,
  c.name AS campaign_name,

  -- leads + money (from leads table)
  COUNT(l.*)                                                     AS leads_count,
  COUNT(*) FILTER (WHERE l.intent = 'hot')                       AS hot_leads,
  COUNT(*) FILTER (WHERE l.intent = 'warm')                      AS warm_leads,
  COUNT(*) FILTER (WHERE l.intent = 'not_interested')            AS not_interested_leads,

  COALESCE(SUM(l.estimated_job_value)
      FILTER (WHERE l.status IN ('new','working')), 0)           AS pipeline_value,
  COALESCE(SUM(l.estimated_job_value)
      FILTER (WHERE l.status = 'booked'), 0)                     AS booked_value,

  -- follow-up stats from queue / inbound
  COALESCE(eo.initial_sent, 0)                                  AS initial_sent,
  COALESCE(eo.follow_ups_sent, 0)                               AS follow_ups_sent,
  COALESCE(r.replies_total, 0)                                  AS replies_total,

  -- reply-related percentages
  CASE
    WHEN COALESCE(eo.initial_sent, 0) = 0 THEN 0
    ELSE ROUND(
      (COALESCE(r.replies_total, 0)::numeric
       / eo.initial_sent::numeric) * 100,
      1
    )
  END                                                            AS reply_rate_percent,

  CASE
    WHEN COALESCE(r.replies_total, 0) = 0 THEN 0
    ELSE ROUND(
      (COUNT(*) FILTER (WHERE l.intent = 'hot')::numeric
       / COALESCE(r.replies_total, 0)::numeric) * 100,
      1
    )
  END                                                            AS hot_from_replies_percent

FROM public.campaigns c
LEFT JOIN public.leads l
  ON l.campaign_id = c.id
LEFT JOIN (
  -- outbound emails
  SELECT
    company_id,
    campaign_id,
    COUNT(*) FILTER (WHERE follow_up_stage IS NULL)  AS initial_sent,
    COUNT(*) FILTER (WHERE follow_up_stage IS NOT NULL) AS follow_ups_sent
  FROM public.email_send_queue
  WHERE status IN ('pending','sent')
  GROUP BY company_id, campaign_id
) eo
  ON eo.company_id = c.company_id
 AND eo.campaign_id = c.id
LEFT JOIN (
  -- inbound replies
  SELECT
    COALESCE(ie.company_id, c2.company_id) AS company_id,
    ie.campaign_id,
    COUNT(*) AS replies_total
  FROM public.inbound_emails ie
  LEFT JOIN public.campaigns c2 ON c2.id = ie.campaign_id
  WHERE ie.campaign_id IS NOT NULL
  GROUP BY COALESCE(ie.company_id, c2.company_id), ie.campaign_id
) r
  ON r.company_id = c.company_id
 AND r.campaign_id = c.id
WHERE c.company_id = auth_company_id()
GROUP BY
  c.id,
  c.company_id,
  c.name,
  eo.initial_sent,
  eo.follow_ups_sent,
  r.replies_total;

COMMENT ON VIEW public.campaign_money_follow_up_view IS 'Block 21725: Campaign-level money + follow-up stats view, tenant-safe via auth_company_id()';

