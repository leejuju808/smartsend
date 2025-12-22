-- Log every reply intent to enable MB/100 and funnels
CREATE TABLE IF NOT EXISTS public.reply_intents (
  id            uuid PRIMARY KEY DEFAULT genrandomuuid(),
  workspace_id  uuid NOT NULL,
  email         text NOT NULL,
  intent        text NOT NULL CHECK (intent IN (
    'meeting','positive','neutral','not_interested','unsubscribe','complaint','bounce_hard','bounce_soft'
  )),
  metadata      jsonb DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reply_intents_workspace_created_idx
  ON public.reply_intents (workspace_id, created_at DESC);

ALTER TABLE public.reply_intents ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS reply_intents_rw_policy ON public.reply_intents
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.workspace_id = reply_intents.workspace_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.workspace_id = reply_intents.workspace_id)
  );

-- Minimal meetings table (if you already have one, keep yours; this is a safe create-if-missing)
CREATE TABLE IF NOT EXISTS public.meetings (
  id            uuid PRIMARY KEY DEFAULT genrandomuuid(),
  workspace_id  uuid NOT NULL,
  email         text NOT NULL,
  source        text DEFAULT 'reply_intent',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meetings_workspace_created_idx
  ON public.meetings (workspace_id, created_at DESC);

ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS meetings_rw_policy ON public.meetings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.workspace_id = meetings.workspace_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.workspace_id = meetings.workspace_id)
  );