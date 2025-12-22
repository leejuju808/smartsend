-- =========================================================
-- Block 8490 — Auto-Queue New Replies for Classification
-- Adds "needs_intent" flag + helper view
-- =========================================================

-- 1) Add flag to email_replies
ALTER TABLE public.email_replies
ADD COLUMN IF NOT EXISTS needs_intent boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_email_replies_needs_intent
  ON public.email_replies (needs_intent);

CREATE INDEX IF NOT EXISTS idx_email_replies_workspace_needs_intent
  ON public.email_replies (workspace_id, needs_intent);

-- 2) View of replies that still need classification
--    (optionally filter for those that actually have no intent yet)
DROP VIEW IF EXISTS public.unclassified_replies_view;

CREATE VIEW public.unclassified_replies_view AS
SELECT
  r.id,
  r.workspace_id,
  r.from_email,
  r.from_name,
  r.subject,
  r.preview,
  r.received_at,
  r.needs_intent
FROM public.email_replies r
LEFT JOIN LATERAL (
  SELECT intent
  FROM public.reply_intents
  WHERE reply_id = r.id
  ORDER BY classified_at DESC
  LIMIT 1
) ri ON TRUE
WHERE
  r.needs_intent = true
  AND (ri.intent IS NULL);  -- only those that truly don't have an intent yet

-- 3) Helper function: pull a batch of unclassified reply IDs
CREATE OR REPLACE FUNCTION public.get_unclassified_reply_ids(p_limit integer DEFAULT 50)
RETURNS TABLE (reply_id uuid, workspace_id uuid)
LANGUAGE sql
AS $$
  SELECT
    id AS reply_id,
    workspace_id
  FROM public.unclassified_replies_view
  ORDER BY received_at DESC NULLS LAST
  LIMIT p_limit;
$$;


























































