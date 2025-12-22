-- =========================================================
-- Block 8590 — Add campaign_id to reply_intents_view
-- =========================================================

DROP VIEW IF EXISTS public.reply_intents_view;

CREATE VIEW public.reply_intents_view AS
SELECT
  r.id                          AS id,
  r.thread_id                   AS thread_id,
  r.campaign_id                 AS campaign_id,
  r.from_email                  AS from_email,
  r.from_name                   AS from_name,
  r.subject                     AS subject,
  COALESCE(
    r.preview,
    LEFT(COALESCE(r.body_text, r.body_html, r.body, ''), 200)
  )                             AS preview,
  COALESCE(r.received_at, r.created_at) AS received_at,
  ri.intent                     AS intent,
  ri.confidence                 AS confidence,
  ri.model_version              AS model_version,
  ri.classified_at              AS classified_at,
  r.workspace_id                AS workspace_id,
  CASE
    WHEN ri.model_version = 'manual-override-v1' THEN 'manual'
    WHEN ri.intent IS NOT NULL THEN 'ai'
    ELSE NULL
  END                           AS intent_source
FROM public.email_replies r
LEFT JOIN LATERAL (
  SELECT
    reply_id,
    intent,
    confidence,
    model_version,
    classified_at
  FROM public.reply_intents
  WHERE reply_id = r.id
  ORDER BY classified_at DESC
  LIMIT 1
) ri ON TRUE;


























































