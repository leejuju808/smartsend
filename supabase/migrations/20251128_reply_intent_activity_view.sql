-- =========================================================
-- Block 8520 — Reply Intent Activity Feed View
-- Uses reply_intents as an activity log
-- =========================================================

DROP VIEW IF EXISTS public.reply_intent_activity_view;

CREATE VIEW public.reply_intent_activity_view AS
SELECT
  ri.id                    AS id,
  ri.reply_id              AS reply_id,
  ri.workspace_id          AS workspace_id,
  ri.intent                AS intent,
  ri.confidence            AS confidence,
  ri.model_version         AS model_version,
  ri.classified_at         AS classified_at,
  CASE
    WHEN ri.model_version = 'manual-override-v1' THEN 'manual'
    ELSE 'ai'
  END                      AS intent_source,
  r.from_email             AS from_email,
  r.from_name              AS from_name,
  r.subject                AS subject,
  r.preview                AS preview,
  r.received_at            AS received_at
FROM public.reply_intents ri
JOIN public.email_replies r
  ON r.id = ri.reply_id;

-- NOTE: RLS flows from underlying tables, no extra policy needed here.

-- Grant access to authenticated users
GRANT SELECT ON public.reply_intent_activity_view TO authenticated;

