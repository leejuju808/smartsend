-- =========================================================
-- Block 8640 — Outbound Email Queue + Scheduler
-- =========================================================

-- 1) Outbound email queue
CREATE TABLE IF NOT EXISTS public.outbound_emails (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid NOT NULL,
  campaign_id           uuid NOT NULL,
  campaign_contact_id   uuid NOT NULL,
  contact_id            uuid NOT NULL,
  step_id               uuid NOT NULL,
  to_email              text NOT NULL,
  subject               text NOT NULL,
  body                  text NOT NULL,
  send_at               timestamptz NOT NULL,
  sent_at               timestamptz,
  status                text NOT NULL DEFAULT 'pending', -- pending / sending / sent / failed / cancelled
  provider_message_id   text,
  error_message         text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outbound_emails_status_send_at
  ON public.outbound_emails (status, send_at);

CREATE INDEX IF NOT EXISTS idx_outbound_emails_campaign
  ON public.outbound_emails (campaign_id);

ALTER TABLE public.outbound_emails
  ADD CONSTRAINT outbound_emails_campaign_fk
  FOREIGN KEY (campaign_id)
  REFERENCES public.campaigns(id)
  ON DELETE CASCADE;

ALTER TABLE public.outbound_emails
  ADD CONSTRAINT outbound_emails_campaign_contact_fk
  FOREIGN KEY (campaign_contact_id)
  REFERENCES public.campaign_contacts(id)
  ON DELETE CASCADE;

ALTER TABLE public.outbound_emails
  ADD CONSTRAINT outbound_emails_contact_fk
  FOREIGN KEY (contact_id)
  REFERENCES public.contacts(id)
  ON DELETE CASCADE;

ALTER TABLE public.outbound_emails
  ADD CONSTRAINT outbound_emails_step_fk
  FOREIGN KEY (step_id)
  REFERENCES public.campaign_steps(id)
  ON DELETE CASCADE;

-- 2) RLS: workspace-scoped via campaigns + workspace_members
ALTER TABLE public.outbound_emails ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'outbound_emails'
      AND policyname = 'Outbound emails scoped to workspace'
  ) THEN
    CREATE POLICY "Outbound emails scoped to workspace"
    ON public.outbound_emails
    FOR ALL
    USING (
      EXISTS (
        SELECT 1
        FROM public.campaigns c
        JOIN public.workspace_members wm
          ON wm.workspace_id = c.workspace_id
        WHERE c.id = campaign_id
          AND wm.user_id = auth.uid()
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1
        FROM public.campaigns c
        JOIN public.workspace_members wm
          ON wm.workspace_id = c.workspace_id
        WHERE c.id = campaign_id
          AND wm.user_id = auth.uid()
      )
    );
  END IF;
END;
$$;

-- 3) Helper: queue initial step for all enrolled contacts in a campaign
-- This will:
-- - Find Step 1 (lowest step_order, enabled = true)
-- - For each campaign_contact with status = 'not_started'
--   -> create outbound_emails row
--   -> mark campaign_contact.status = 'scheduled'
CREATE OR REPLACE FUNCTION public.queue_campaign_initial_emails(
  p_campaign_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_id   uuid;
  v_step_id        uuid;
  v_delay_days     integer;
  v_subject        text;
  v_body           text;
  v_count          integer := 0;
BEGIN
  -- Find campaign + workspace
  SELECT workspace_id
  INTO v_workspace_id
  FROM public.campaigns
  WHERE id = p_campaign_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Campaign not found';
  END IF;

  -- Ensure caller belongs to workspace
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = auth.uid()
      AND workspace_id = v_workspace_id
  ) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  -- Find first enabled step
  SELECT id, delay_days, subject, body
  INTO v_step_id, v_delay_days, v_subject, v_body
  FROM public.campaign_steps
  WHERE campaign_id = p_campaign_id
    AND enabled = true
  ORDER BY step_order ASC
  LIMIT 1;

  IF v_step_id IS NULL THEN
    RAISE EXCEPTION 'No enabled steps for this campaign';
  END IF;

  -- Insert into outbound_emails
  INSERT INTO public.outbound_emails (
    workspace_id,
    campaign_id,
    campaign_contact_id,
    contact_id,
    step_id,
    to_email,
    subject,
    body,
    send_at,
    status
  )
  SELECT
    v_workspace_id,
    cc.campaign_id,
    cc.id,
    ct.id,
    v_step_id,
    ct.email,
    v_subject,
    v_body,
    now() + (v_delay_days || ' days')::interval,
    'pending'
  FROM public.campaign_contacts cc
  JOIN public.contacts ct
    ON ct.id = cc.contact_id
  WHERE cc.campaign_id = p_campaign_id
    AND cc.status = 'not_started';

  -- Get count of inserted rows
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Mark those campaign_contacts as scheduled
  UPDATE public.campaign_contacts
  SET status = 'scheduled'
  WHERE campaign_id = p_campaign_id
    AND status = 'not_started';

  RETURN v_count;
END;
$$;

-- 4) Optional: Summary view for queue visibility
CREATE OR REPLACE VIEW public.outbound_summary_view AS
SELECT
  campaign_id,
  status,
  COUNT(*)::bigint AS email_count
FROM public.outbound_emails
GROUP BY campaign_id, status;


























































