-- =========================================================
-- Block 8650 — Auto Follow-Up Engine
-- =========================================================

-- 1) Ensure email_replies has campaign_id and workspace_id columns
ALTER TABLE public.email_replies
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS workspace_id uuid;

-- Update workspace_id from campaign if campaign_id is set
UPDATE public.email_replies er
SET workspace_id = c.workspace_id
FROM public.campaigns c
WHERE er.campaign_id = c.id
  AND er.workspace_id IS NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_email_replies_campaign_workspace
  ON public.email_replies(campaign_id, workspace_id);

CREATE INDEX IF NOT EXISTS idx_email_replies_from_email
  ON public.email_replies(lower(from_email));

-- 2) Auto-schedule next step after a send, based on outbound_emails row
--    - Updates campaign_contacts.last_step_sent + last_sent_at
--    - Finds next enabled step (higher step_order)
--    - Queues it in outbound_emails with delay_days
CREATE OR REPLACE FUNCTION public.schedule_next_step_for_campaign_contact(
  p_outbound_email_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_outbound        public.outbound_emails%ROWTYPE;
  v_current_order   integer;
  v_next_step_id    uuid;
  v_next_delay      integer;
  v_next_subject    text;
  v_next_body       text;
  v_now             timestamptz := now();
  v_queued_count    integer := 0;
BEGIN
  -- Load the outbound email we just sent
  SELECT *
  INTO v_outbound
  FROM public.outbound_emails
  WHERE id = p_outbound_email_id;

  IF v_outbound.id IS NULL THEN
    RETURN 0;
  END IF;

  -- Get current step order
  SELECT step_order
  INTO v_current_order
  FROM public.campaign_steps
  WHERE id = v_outbound.step_id;

  IF v_current_order IS NULL THEN
    RETURN 0;
  END IF;

  -- Update campaign_contacts last sent info
  UPDATE public.campaign_contacts
  SET
    last_step_sent = v_current_order,
    last_sent_at   = COALESCE(v_outbound.sent_at, v_now)
  WHERE id = v_outbound.campaign_contact_id;

  -- Find the next enabled step for this campaign
  SELECT id, delay_days, subject, body
  INTO v_next_step_id, v_next_delay, v_next_subject, v_next_body
  FROM public.campaign_steps
  WHERE campaign_id = v_outbound.campaign_id
    AND enabled = true
    AND step_order > v_current_order
  ORDER BY step_order ASC
  LIMIT 1;

  -- If no next step, mark campaign_contact as completed and exit
  IF v_next_step_id IS NULL THEN
    UPDATE public.campaign_contacts
    SET status = 'completed'
    WHERE id = v_outbound.campaign_contact_id;
    RETURN 0;
  END IF;

  -- Queue next step as pending outbound email
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
  VALUES (
    v_outbound.workspace_id,
    v_outbound.campaign_id,
    v_outbound.campaign_contact_id,
    v_outbound.contact_id,
    v_next_step_id,
    v_outbound.to_email,
    v_next_subject,
    v_next_body,
    COALESCE(v_outbound.sent_at, v_now) + (v_next_delay || ' days')::interval,
    'pending'
  );

  GET DIAGNOSTICS v_queued_count = ROW_COUNT;

  -- Keep campaign_contact.status as 'scheduled' while sequence is running
  UPDATE public.campaign_contacts
  SET status = 'scheduled'
  WHERE id = v_outbound.campaign_contact_id;

  RETURN v_queued_count;
END;
$$;

-- 3) Auto-stop sequence when a reply comes in
--    - Link reply -> contact -> campaign_contact
--    - Mark campaign_contact.status = 'responded'
--    - Cancel pending outbound_emails for that campaign_contact
CREATE OR REPLACE FUNCTION public.stop_sequence_on_reply(
  p_reply_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reply              public.email_replies%ROWTYPE;
  v_contact_id         uuid;
  v_campaign_contact_id uuid;
  v_cancel_count       integer := 0;
BEGIN
  -- Load reply
  SELECT *
  INTO v_reply
  FROM public.email_replies
  WHERE id = p_reply_id;

  IF v_reply.id IS NULL THEN
    RETURN 0;
  END IF;

  -- Need campaign_id + from_email + workspace_id to map
  IF v_reply.campaign_id IS NULL OR v_reply.from_email IS NULL THEN
    RETURN 0;
  END IF;

  -- Find contact in same workspace with that email
  SELECT id
  INTO v_contact_id
  FROM public.contacts
  WHERE workspace_id = v_reply.workspace_id
    AND lower(email) = lower(v_reply.from_email)
  LIMIT 1;

  IF v_contact_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Find campaign_contact link
  SELECT id
  INTO v_campaign_contact_id
  FROM public.campaign_contacts
  WHERE campaign_id = v_reply.campaign_id
    AND contact_id = v_contact_id
  LIMIT 1;

  IF v_campaign_contact_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Mark as responded
  UPDATE public.campaign_contacts
  SET status = 'responded'
  WHERE id = v_campaign_contact_id;

  -- Cancel any pending follow-ups
  UPDATE public.outbound_emails
  SET status = 'cancelled'
  WHERE campaign_contact_id = v_campaign_contact_id
    AND status IN ('pending', 'sending');

  GET DIAGNOSTICS v_cancel_count = ROW_COUNT;

  RETURN v_cancel_count;
END;
$$;

-- 4) Trigger: on each new reply, stop that contact's sequence if possible
CREATE OR REPLACE FUNCTION public.stop_sequence_on_reply_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.stop_sequence_on_reply(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stop_sequence_on_reply ON public.email_replies;

CREATE TRIGGER trg_stop_sequence_on_reply
AFTER INSERT ON public.email_replies
FOR EACH ROW
EXECUTE FUNCTION public.stop_sequence_on_reply_trigger();


























































