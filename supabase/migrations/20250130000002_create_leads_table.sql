-- =========================================================
-- Block 8540 — Leads Table (Created from Replies)
-- =========================================================

-- 1) LEADS TABLE
CREATE TABLE IF NOT EXISTS public.leads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL,
  reply_id        uuid,                    -- link back to email_replies
  name            text,
  email           text,
  subject         text,
  notes           text,
  status          text NOT NULL DEFAULT 'new',  -- new / in_progress / won / lost
  source          text NOT NULL DEFAULT 'email_reply',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_workspace
  ON public.leads (workspace_id);

CREATE INDEX IF NOT EXISTS idx_leads_reply
  ON public.leads (reply_id);

-- 2) UPDATED_AT TRIGGER
CREATE OR REPLACE FUNCTION public.set_leads_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_leads_updated_at ON public.leads;

CREATE TRIGGER trg_set_leads_updated_at
BEFORE UPDATE ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.set_leads_updated_at();

-- 3) RLS: Scope by workspace via workspace_members
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'leads'
      AND policyname = 'Leads are scoped to workspace'
  ) THEN
    CREATE POLICY "Leads are scoped to workspace"
    ON public.leads
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

-- 4) HELPER FUNCTION: Create lead from reply_id
CREATE OR REPLACE FUNCTION public.create_lead_from_reply(
  p_reply_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_id uuid;
  v_from_email   text;
  v_from_name    text;
  v_subject      text;
  v_preview      text;
  v_lead_id      uuid;
BEGIN
  SELECT
    workspace_id,
    from_email,
    from_name,
    subject,
    preview
  INTO
    v_workspace_id,
    v_from_email,
    v_from_name,
    v_subject,
    v_preview
  FROM public.email_replies
  WHERE id = p_reply_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Reply not found';
  END IF;

  -- ensure caller belongs to workspace
  IF NOT EXISTS (
    SELECT 1
    FROM public.workspace_members
    WHERE user_id = auth.uid()
      AND workspace_id = v_workspace_id
  ) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  INSERT INTO public.leads (
    workspace_id,
    reply_id,
    name,
    email,
    subject,
    notes,
    status,
    source
  )
  VALUES (
    v_workspace_id,
    p_reply_id,
    v_from_name,
    v_from_email,
    v_subject,
    v_preview,
    'new',
    'email_reply'
  )
  RETURNING id INTO v_lead_id;

  RETURN v_lead_id;
END;
$$;


























































