-- Block 8500 — Reply Inbox View with Suppression Status
-- Extend reply_inbox_view to include suppression status for UI display

-- Create or replace reply_inbox_view with suppression status
CREATE OR REPLACE VIEW reply_inbox_view AS
SELECT
  cr.id AS reply_id,
  cr.campaign_id,
  cr.lead_id,
  cr.intent,
  cr.sentiment,
  cr.created_at AS received_at,
  cr.classified_at,
  cr.subject,
  cr.raw_text AS thread_summary,
  c.name AS campaign_name,
  l.email AS lead_email,
  l.name AS lead_name,
  CASE 
    WHEN cr.intent IN ('positive', 'referral') THEN TRUE 
    ELSE FALSE 
  END AS is_hot_lead,
  CASE
    WHEN gs.id IS NOT NULL AND gs.active = TRUE THEN TRUE
    ELSE FALSE
  END AS is_suppressed
FROM campaign_replies cr
LEFT JOIN campaigns c ON c.id = cr.campaign_id
LEFT JOIN leads l ON l.id = cr.lead_id
LEFT JOIN global_suppressions gs
  ON gs.email = LOWER(l.email)
  AND gs.active = TRUE
  AND gs.workspace_id = c.workspace_id;

-- Grant access to authenticated users
GRANT SELECT ON reply_inbox_view TO authenticated;































































