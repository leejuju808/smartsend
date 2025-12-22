-- Block 8490 — Unified Reply Inbox v1
-- Create unified inbox view for all replies

CREATE OR REPLACE VIEW reply_inbox_view AS
SELECT
  cr.id AS reply_id,
  cr.campaign_id,
  cr.lead_id,
  cr.intent,
  cr.sentiment,
  cr.created_at AS received_at,
  cr.handled_at,
  cr.handled_by_user_id,
  -- Use thread_summary from campaign_leads if available, otherwise use raw_text snippet
  COALESCE(cl.thread_summary, LEFT(cr.raw_text, 200)) AS thread_summary,
  c.name AS campaign_name,
  l.email AS lead_email,
  l.name AS lead_name,
  -- Simple hot flag: positive or referral
  CASE
    WHEN cr.intent IN ('positive', 'referral') THEN TRUE
    ELSE FALSE
  END AS is_hot_lead
FROM campaign_replies cr
LEFT JOIN campaigns c ON c.id = cr.campaign_id
LEFT JOIN leads l ON l.id = cr.lead_id
LEFT JOIN campaign_leads cl ON cl.campaign_id = cr.campaign_id AND cl.lead_id = cr.lead_id;

-- Grant access to authenticated users (RLS on underlying tables will filter)
-- Note: RLS policies on campaign_replies, campaigns, and leads will ensure users only see their own data































































