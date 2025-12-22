-- =========================================================
-- Block 8470 — Reply Intent Views + Summary
-- Makes /dashboard/replies page work
-- =========================================================

-- 1) ENUM TYPE FOR INTENT (if you don't already have one)
-- ---------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'reply_intent_type'
  ) THEN
    CREATE TYPE reply_intent_type AS ENUM ('hot', 'warm', 'not_interested');
  END IF;
END;
$$;

-- 2) BASE TABLE: reply_intents
-- One row per reply classification from the AI
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reply_intents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reply_id        uuid NOT NULL,                       -- FK to email_replies.id
  intent          reply_intent_type,                   -- hot / warm / not_interested (NULL = unclassified)
  confidence      double precision,                    -- 0–1
  model_version   text,                                -- e.g. "gpt-5.1-2025-11"
  classified_at   timestamptz NOT NULL DEFAULT now(),

  -- Multi-tenant scoping (adjust to YOUR schema)
  workspace_id    uuid NOT NULL,

  CONSTRAINT reply_intents_reply_fk
    FOREIGN KEY (reply_id)
    REFERENCES public.email_replies(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reply_intents_reply_id
  ON public.reply_intents (reply_id);

CREATE INDEX IF NOT EXISTS idx_reply_intents_workspace_intent
  ON public.reply_intents (workspace_id, intent);

-- Ensure email_replies has required columns for the view
-- ---------------------------------------------------------
ALTER TABLE public.email_replies
  ADD COLUMN IF NOT EXISTS thread_id text,
  ADD COLUMN IF NOT EXISTS from_name text,
  ADD COLUMN IF NOT EXISTS preview text,
  ADD COLUMN IF NOT EXISTS received_at timestamptz,
  ADD COLUMN IF NOT EXISTS workspace_id uuid;

-- 3) VIEW: reply_intents_view
-- What the UI reads to render each card
-- ---------------------------------------------------------
DROP VIEW IF EXISTS public.reply_intents_view;

CREATE VIEW public.reply_intents_view AS
SELECT
  r.id                          AS id,
  r.thread_id                   AS thread_id,
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
  r.workspace_id                AS workspace_id
FROM public.email_replies r
LEFT JOIN LATERAL (
  -- latest classification for this reply
  SELECT
    reply_id,
    intent,
    confidence,
    classified_at
  FROM public.reply_intents
  WHERE reply_id = r.id
  ORDER BY classified_at DESC
  LIMIT 1
) ri ON TRUE;

-- 4) MATERIALIZED VIEW: reply_intents_summary
-- Used by getIntentCounts() to show the pill counts
-- ---------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS public.reply_intents_summary;

CREATE MATERIALIZED VIEW public.reply_intents_summary AS
SELECT
  workspace_id,
  -- UI expects: 'hot' | 'warm' | 'not_interested' | 'unclassified'
  COALESCE(intent::text, 'unclassified') AS intent,
  COUNT(*)::bigint                        AS count
FROM public.reply_intents_view
GROUP BY
  workspace_id,
  COALESCE(intent::text, 'unclassified');

CREATE UNIQUE INDEX IF NOT EXISTS idx_reply_intents_summary_ws_intent
  ON public.reply_intents_summary (workspace_id, intent);

-- 5) REFRESH FUNCTION
-- Call this from an Edge Function or cron after batches of classifications
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_reply_intents_summary(p_workspace_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_workspace_id IS NULL THEN
    -- full refresh
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.reply_intents_summary;
  ELSE
    -- scoped refresh hack:
    -- 1) delete that workspace from summary
    DELETE FROM public.reply_intents_summary s
    WHERE s.workspace_id = p_workspace_id;

    -- 2) insert fresh rows for that workspace only
    INSERT INTO public.reply_intents_summary (workspace_id, intent, count)
    SELECT
      workspace_id,
      COALESCE(intent::text, 'unclassified') AS intent,
      COUNT(*)::bigint AS count
    FROM public.reply_intents_view
    WHERE workspace_id = p_workspace_id
    GROUP BY
      workspace_id,
      COALESCE(intent::text, 'unclassified');
  END IF;
END;
$$;

-- 6) SIMPLE RLS (ADJUST TO YOUR TENANT MODEL)
-- Assuming you already use workspace_id + a mapping table workspace_members
-- ---------------------------------------------------------

-- Base table RLS
ALTER TABLE public.reply_intents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'reply_intents'
      AND policyname = 'Reply intents are scoped to workspace'
  ) THEN
    CREATE POLICY "Reply intents are scoped to workspace"
    ON public.reply_intents
    FOR ALL
    USING (
      workspace_id IN (
        SELECT workspace_id
        FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    )
    WITH CHECK (
      workspace_id IN (
        SELECT workspace_id
        FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    );
  END IF;
END;
$$;

-- View RLS via underlying tables — no direct policies needed for views.

-- 7) OPTIONAL: HELPER FUNCTION FOR CURRENT USER
-- Thin wrapper so your server helpers can filter by current workspace
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_reply_intent_counts_for_current_workspace()
RETURNS TABLE (
  intent text,
  count  bigint
)
LANGUAGE sql
AS $$
  SELECT
    s.intent,
    s.count
  FROM public.reply_intents_summary s
  WHERE s.workspace_id IN (
    SELECT workspace_id
    FROM public.workspace_members
    WHERE user_id = auth.uid()
  );
$$;

