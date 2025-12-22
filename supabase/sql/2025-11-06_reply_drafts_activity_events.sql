-- Reply drafts and activity events schema (idempotent)

-- Ensure legacy reply_drafts table is renamed so we can install the new structure safely.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'reply_drafts'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'reply_drafts'
        AND column_name = 'thread_id'
    ) THEN
      EXECUTE 'ALTER TABLE public.reply_drafts RENAME TO reply_drafts_legacy';
    END IF;
  END IF;
END
$$;

-- A) Drafts table for AI/Manual reply suggestions
CREATE TABLE IF NOT EXISTS public.reply_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  thread_id uuid NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  source_message_id uuid NOT NULL REFERENCES public.inbox_messages(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  author_user_id uuid REFERENCES auth.users(id),
  kind text NOT NULL DEFAULT 'ai' CHECK (kind IN ('ai', 'manual')),
  subject text,
  body text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_reply_drafts_thread ON public.reply_drafts(thread_id);
CREATE INDEX IF NOT EXISTS idx_reply_drafts_campaign ON public.reply_drafts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_reply_drafts_created ON public.reply_drafts(created_at DESC);

-- B) Team activity feed
CREATE TABLE IF NOT EXISTS public.activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind text NOT NULL,
  note text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_activity_campaign_time ON public.activity_events(campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_thread_time ON public.activity_events(thread_id, created_at DESC);

-- C) Row level security
ALTER TABLE public.reply_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;

-- Read policies: members of the campaign (or owner) can read
DROP POLICY IF EXISTS reply_drafts_read ON public.reply_drafts;
CREATE POLICY reply_drafts_read
ON public.reply_drafts
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.campaign_members cm
    WHERE cm.campaign_id = reply_drafts.campaign_id
      AND cm.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = reply_drafts.campaign_id
      AND c.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS activity_events_read ON public.activity_events;
CREATE POLICY activity_events_read
ON public.activity_events
FOR SELECT
TO authenticated
USING (
  (activity_events.campaign_id IS NULL)
  OR EXISTS (
    SELECT 1 FROM public.campaign_members cm
    WHERE cm.campaign_id = activity_events.campaign_id
      AND cm.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = activity_events.campaign_id
      AND c.user_id = auth.uid()
  )
);

-- D) Helper RPC to log an event (service definer)
DROP FUNCTION IF EXISTS public.log_event(uuid, uuid, uuid, uuid, text, text, jsonb);
CREATE OR REPLACE FUNCTION public.log_event(
  p_campaign uuid,
  p_thread uuid,
  p_lead uuid,
  p_user uuid,
  p_kind text,
  p_note text DEFAULT '',
  p_meta jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.activity_events(campaign_id, thread_id, lead_id, user_id, kind, note, meta)
  VALUES (p_campaign, p_thread, p_lead, p_user, p_kind, p_note, COALESCE(p_meta, '{}'::jsonb));
$$;

REVOKE ALL ON FUNCTION public.log_event(uuid, uuid, uuid, uuid, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_event(uuid, uuid, uuid, uuid, text, text, jsonb) TO service_role;





