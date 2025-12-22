-- =========================================================
-- Block 8680 — Leads + Latest Reply Meta View
-- =========================================================

DROP VIEW IF EXISTS public.leads_with_reply_meta;

CREATE VIEW public.leads_with_reply_meta AS
SELECT
  l.id,
  l.workspace_id,
  l.contact_id,
  l.email,
  l.name,
  l.status,
  l.source,
  l.estimated_value,
  l.currency,
  l.created_at,
  -- latest reply data for this lead's email within workspace
  lr.latest_intent,
  lr.latest_reply_at,
  lr.reply_count
FROM public.leads l
LEFT JOIN LATERAL (
  SELECT
    er.intent AS latest_intent,
    COALESCE(er.received_at, er.created_at) AS latest_reply_at,
    (
      SELECT COUNT(*)
      FROM public.email_replies er2
      WHERE er2.workspace_id = l.workspace_id
        AND lower(er2.from_email) = lower(COALESCE(l.email, ''))
    ) AS reply_count
  FROM public.email_replies er
  WHERE er.workspace_id = l.workspace_id
    AND lower(er.from_email) = lower(COALESCE(l.email, ''))
  ORDER BY COALESCE(er.received_at, er.created_at) DESC NULLS LAST
  LIMIT 1
) AS lr ON TRUE;

-- Grant access to authenticated users
GRANT SELECT ON public.leads_with_reply_meta TO authenticated;

