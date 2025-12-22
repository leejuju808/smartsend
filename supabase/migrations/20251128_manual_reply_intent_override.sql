-- =========================================================
-- Block 8500 — Manual Override for Reply Intent
-- set_reply_intent + clear_reply_intent
-- =========================================================

-- Ensure email_replies has needs_intent column
ALTER TABLE public.email_replies
  ADD COLUMN IF NOT EXISTS needs_intent boolean DEFAULT true;

-- MANUAL SET: hot / warm / not_interested
CREATE OR REPLACE FUNCTION public.set_reply_intent(
  p_reply_id uuid,
  p_intent reply_intent_type,
  p_confidence double precision DEFAULT 0.95
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_id uuid;
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM public.email_replies
  WHERE id = p_reply_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Reply not found';
  END IF;

  -- Ensure caller belongs to workspace
  IF NOT EXISTS (
    SELECT 1
    FROM public.workspace_members
    WHERE user_id = auth.uid()
      AND workspace_id = v_workspace_id
  ) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  -- Insert new manual classification row
  INSERT INTO public.reply_intents (
    reply_id,
    workspace_id,
    intent,
    confidence,
    model_version
  )
  VALUES (
    p_reply_id,
    v_workspace_id,
    p_intent,
    p_confidence,
    'manual-override-v1'
  );

  -- Mark as classified
  UPDATE public.email_replies
  SET needs_intent = false
  WHERE id = p_reply_id;

  -- Refresh summary for this workspace
  PERFORM public.refresh_reply_intents_summary(v_workspace_id);
END;
$$;

-- CLEAR / UNCLASSIFY: delete existing intents, mark for reclassification
CREATE OR REPLACE FUNCTION public.clear_reply_intent(
  p_reply_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_id uuid;
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM public.email_replies
  WHERE id = p_reply_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Reply not found';
  END IF;

  -- Ensure caller belongs to workspace
  IF NOT EXISTS (
    SELECT 1
    FROM public.workspace_members
    WHERE user_id = auth.uid()
      AND workspace_id = v_workspace_id
  ) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  -- Remove all previous classification rows for this reply
  DELETE FROM public.reply_intents
  WHERE reply_id = p_reply_id;

  -- Mark to be picked up again by classifier job
  UPDATE public.email_replies
  SET needs_intent = true
  WHERE id = p_reply_id;

  -- Refresh summary for this workspace
  PERFORM public.refresh_reply_intents_summary(v_workspace_id);
END;
$$;


























































