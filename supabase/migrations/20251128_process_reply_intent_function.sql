-- =========================================================
-- Block 8660 — Intent-Driven Reply Actions
-- Step 3: Core Logic Function — Handle Intent Action
-- =========================================================

CREATE OR REPLACE FUNCTION public.process_reply_intent(
  p_reply_id uuid,
  p_intent text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reply                public.email_replies%ROWTYPE;
  v_contact_id           uuid;
  v_campaign_contact_id  uuid;
  v_lead_id              uuid;
BEGIN
  -- Load reply
  SELECT *
  INTO v_reply
  FROM public.email_replies
  WHERE id = p_reply_id;

  IF v_reply.id IS NULL THEN
    RETURN;
  END IF;

  -- Update reply intent
  UPDATE public.email_replies
  SET intent = p_intent
  WHERE id = p_reply_id;

  -- Identify contact
  SELECT id
  INTO v_contact_id
  FROM public.contacts
  WHERE workspace_id = v_reply.workspace_id
    AND lower(email) = lower(v_reply.from_email)
  LIMIT 1;

  IF v_contact_id IS NULL THEN
    RETURN;
  END IF;

  -- Identify campaign_contact
  SELECT id
  INTO v_campaign_contact_id
  FROM public.campaign_contacts
  WHERE campaign_id = v_reply.campaign_id
    AND contact_id = v_contact_id
  LIMIT 1;

  IF v_campaign_contact_id IS NULL THEN
    RETURN;
  END IF;

  -- ==========================================
  -- CASE 1 — HOT LEAD → Auto-create Lead
  -- ==========================================
  IF p_intent = 'hot' THEN
    -- Create lead if one doesn't exist
    -- Check if leads table has contact_id column
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'leads'
        AND column_name = 'contact_id'
    ) THEN
      -- Use contact_id if available
      SELECT id
      INTO v_lead_id
      FROM public.leads
      WHERE workspace_id = v_reply.workspace_id
        AND contact_id = v_contact_id
      LIMIT 1;

      IF v_lead_id IS NULL THEN
        INSERT INTO public.leads (
          workspace_id,
          contact_id,
          email,
          name,
          source,
          status
        )
        VALUES (
          v_reply.workspace_id,
          v_contact_id,
          v_reply.from_email,
          v_reply.from_name,
          'reply_hot',
          'new'
        )
        RETURNING id INTO v_lead_id;
      END IF;
    ELSE
      -- Fallback: use email to find/create lead
      SELECT id
      INTO v_lead_id
      FROM public.leads
      WHERE workspace_id = v_reply.workspace_id
        AND lower(email) = lower(v_reply.from_email)
      LIMIT 1;

      IF v_lead_id IS NULL THEN
        INSERT INTO public.leads (
          workspace_id,
          email,
          name,
          source,
          status
        )
        VALUES (
          v_reply.workspace_id,
          v_reply.from_email,
          v_reply.from_name,
          'reply_hot',
          'new'
        )
        RETURNING id INTO v_lead_id;
      END IF;
    END IF;

    -- Stop the sequence (mark as completed since they responded)
    UPDATE public.campaign_contacts
    SET status = 'completed'
    WHERE id = v_campaign_contact_id;

    -- Cancel pending emails
    -- Check if outbound_emails table exists and has campaign_contact_id
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'outbound_emails'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'outbound_emails'
        AND column_name = 'campaign_contact_id'
    ) THEN
      UPDATE public.outbound_emails
      SET status = 'cancelled'
      WHERE campaign_contact_id = v_campaign_contact_id
        AND status IN ('pending', 'sending');
    END IF;

    -- Also cancel in send_queue if it exists
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'send_queue'
    ) THEN
      -- Try to cancel by campaign_id and contact_id lookup
      UPDATE public.send_queue sq
      SET status = 'cancelled'
      FROM public.campaign_contacts cc
      WHERE cc.id = v_campaign_contact_id
        AND sq.campaign_id = cc.campaign_id
        AND EXISTS (
          SELECT 1 FROM public.contacts c
          WHERE c.id = cc.contact_id
            AND c.email = v_reply.from_email
        )
        AND sq.status IN ('pending', 'queued', 'sending');
    END IF;

    RETURN;
  END IF;

  -- ==========================================
  -- CASE 2 — WARM → Create Follow-Up Task
  -- ==========================================
  IF p_intent = 'warm' THEN
    INSERT INTO public.followup_tasks (
      workspace_id,
      campaign_id,
      contact_id,
      reply_id,
      due_at
    )
    VALUES (
      v_reply.workspace_id,
      v_reply.campaign_id,
      v_contact_id,
      v_reply.id,
      now() + interval '1 day'
    );

    UPDATE public.campaign_contacts
    SET status = 'completed'
    WHERE id = v_campaign_contact_id;

    -- Cancel pending emails
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'outbound_emails'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'outbound_emails'
        AND column_name = 'campaign_contact_id'
    ) THEN
      UPDATE public.outbound_emails
      SET status = 'cancelled'
      WHERE campaign_contact_id = v_campaign_contact_id
        AND status IN ('pending', 'sending');
    END IF;

    -- Also cancel in send_queue if it exists
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'send_queue'
    ) THEN
      UPDATE public.send_queue sq
      SET status = 'cancelled'
      FROM public.campaign_contacts cc
      WHERE cc.id = v_campaign_contact_id
        AND sq.campaign_id = cc.campaign_id
        AND EXISTS (
          SELECT 1 FROM public.contacts c
          WHERE c.id = cc.contact_id
            AND c.email = v_reply.from_email
        )
        AND sq.status IN ('pending', 'queued', 'sending');
    END IF;

    RETURN;
  END IF;

  -- ==========================================
  -- CASE 3 — NOT INTERESTED → Unsubscribe
  -- ==========================================
  IF p_intent = 'not_interested' THEN
    UPDATE public.campaign_contacts
    SET status = 'unsubscribed'
    WHERE id = v_campaign_contact_id;

    -- Cancel pending emails
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'outbound_emails'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'outbound_emails'
        AND column_name = 'campaign_contact_id'
    ) THEN
      UPDATE public.outbound_emails
      SET status = 'cancelled'
      WHERE campaign_contact_id = v_campaign_contact_id
        AND status IN ('pending', 'sending');
    END IF;

    -- Also cancel in send_queue if it exists
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'send_queue'
    ) THEN
      UPDATE public.send_queue sq
      SET status = 'cancelled'
      FROM public.campaign_contacts cc
      WHERE cc.id = v_campaign_contact_id
        AND sq.campaign_id = cc.campaign_id
        AND EXISTS (
          SELECT 1 FROM public.contacts c
          WHERE c.id = cc.contact_id
            AND c.email = v_reply.from_email
        )
        AND sq.status IN ('pending', 'queued', 'sending');
    END IF;

    RETURN;
  END IF;

END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.process_reply_intent(uuid, text)
TO authenticated;

-- Grant execute permission to service_role (for edge functions)
GRANT EXECUTE ON FUNCTION public.process_reply_intent(uuid, text)
TO service_role;

