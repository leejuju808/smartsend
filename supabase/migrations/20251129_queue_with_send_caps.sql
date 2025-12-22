-- =========================================================
-- Block 8720 — Enforce Monthly Email Caps in Queue
-- =========================================================

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
  v_limit_row      RECORD;
  v_current_usage  integer := 0;
  v_max_monthly    integer;
  v_capacity       integer;
  v_queued_count   integer := 0;
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

  -- Get limits for workspace
  SELECT *
  INTO v_limit_row
  FROM public.get_workspace_plan_limits(v_workspace_id);

  -- Handle case where no subscription exists (treat as unlimited)
  IF v_limit_row IS NULL THEN
    v_max_monthly := NULL;
  ELSE
    v_max_monthly := v_limit_row.max_emails_per_month;
  END IF;

  -- Get current usage for this month
  SELECT public.get_workspace_monthly_email_usage(v_workspace_id)
  INTO v_current_usage;

  -- If there's a cap and we've already maxed it, bail
  IF v_max_monthly IS NOT NULL AND v_current_usage >= v_max_monthly THEN
    RAISE EXCEPTION 'EMAIL_CAP_REACHED';
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

  -- How many emails can we still send this month?
  IF v_max_monthly IS NULL THEN
    -- unlimited
    v_capacity := NULL;
  ELSE
    v_capacity := GREATEST(v_max_monthly - v_current_usage, 0);
    IF v_capacity <= 0 THEN
      RAISE EXCEPTION 'EMAIL_CAP_REACHED';
    END IF;
  END IF;

  -- Queue initial emails
  IF v_capacity IS NULL THEN
    -- unlimited: queue all not_started
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

    GET DIAGNOSTICS v_queued_count = ROW_COUNT;
  ELSE
    -- limited: only queue up to v_capacity
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
      AND cc.status = 'not_started'
    LIMIT v_capacity;

    GET DIAGNOSTICS v_queued_count = ROW_COUNT;
  END IF;

  -- Update campaign_contacts status for the ones we actually queued
  UPDATE public.campaign_contacts
  SET status = 'scheduled'
  WHERE id IN (
    SELECT campaign_contact_id
    FROM public.outbound_emails
    WHERE campaign_id = p_campaign_id
      AND step_id = v_step_id
      AND workspace_id = v_workspace_id
      AND status = 'pending'
  );

  RETURN v_queued_count;
END;
$$;

