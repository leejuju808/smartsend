-- =========================================================
-- Block 9500 — Reply AI v1
-- (Intent Detection + Lead Routing + Smart Summaries + Roofer-Ready Insights)
-- =========================================================

-- 1. Add new columns to messages table for Reply AI classification
DO $$
BEGIN
  -- Add reply_summary column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'messages' 
    AND column_name = 'reply_summary'
  ) THEN
    ALTER TABLE public.messages
      ADD COLUMN reply_summary text;
  END IF;

  -- Add reply_next_action column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'messages' 
    AND column_name = 'reply_next_action'
  ) THEN
    ALTER TABLE public.messages
      ADD COLUMN reply_next_action text CHECK (reply_next_action IN ('book', 'answer', 'stop', 'info_needed', 'none'));
  END IF;

  -- Add ai_confidence column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'messages' 
    AND column_name = 'ai_confidence'
  ) THEN
    ALTER TABLE public.messages
      ADD COLUMN ai_confidence numeric(4,3) DEFAULT 0.0 CHECK (ai_confidence >= 0.0 AND ai_confidence <= 1.0);
  END IF;

  -- Ensure intent column exists (may be called reply_intent or intent)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'messages' 
    AND column_name = 'intent'
  ) THEN
    -- Check if reply_intent exists, if so rename it
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'messages' 
      AND column_name = 'reply_intent'
    ) THEN
      ALTER TABLE public.messages
        RENAME COLUMN reply_intent TO intent;
    ELSE
      ALTER TABLE public.messages
        ADD COLUMN intent text;
    END IF;
  END IF;

  -- Ensure contact_id exists (needed for linking)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'messages' 
    AND column_name = 'contact_id'
  ) THEN
    ALTER TABLE public.messages
      ADD COLUMN contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL;
  END IF;

  -- Ensure campaign_id exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'messages' 
    AND column_name = 'campaign_id'
  ) THEN
    ALTER TABLE public.messages
      ADD COLUMN campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL;
  END IF;

  -- Ensure account_id exists (may be user_id or workspace_id)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'messages' 
    AND column_name = 'account_id'
  ) THEN
    -- Try to infer from user_id if it exists
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'messages' 
      AND column_name = 'user_id'
    ) THEN
      -- Add account_id and populate from user_id
      ALTER TABLE public.messages
        ADD COLUMN account_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
      
      -- Copy user_id to account_id for existing rows
      UPDATE public.messages
      SET account_id = user_id
      WHERE account_id IS NULL AND user_id IS NOT NULL;
    ELSE
      ALTER TABLE public.messages
        ADD COLUMN account_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
  END IF;
END$$;

-- 2. Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_messages_intent ON public.messages(intent) WHERE intent IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_contact_campaign ON public.messages(contact_id, campaign_id) WHERE contact_id IS NOT NULL AND campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_account_created ON public.messages(account_id, created_at DESC) WHERE account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_next_action ON public.messages(reply_next_action) WHERE reply_next_action IS NOT NULL;

-- 3. Create function to clean email text (strip signatures, quoted text)
CREATE OR REPLACE FUNCTION public.clean_email_text(raw_text text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  cleaned text;
BEGIN
  IF raw_text IS NULL OR raw_text = '' THEN
    RETURN '';
  END IF;

  cleaned := raw_text;

  -- Remove common email signatures (lines starting with --, ---, or common patterns)
  cleaned := regexp_replace(cleaned, E'^--.*$', '', 'gmn');
  cleaned := regexp_replace(cleaned, E'^---.*$', '', 'gmn');
  
  -- Remove quoted replies (lines starting with >)
  cleaned := regexp_replace(cleaned, E'^>.*$', '', 'gmn');
  
  -- Remove "On [date] [person] wrote:" patterns
  cleaned := regexp_replace(cleaned, E'On .* wrote:.*$', '', 'gmn');
  
  -- Remove "From:" patterns in quoted sections
  cleaned := regexp_replace(cleaned, E'^From:.*$', '', 'gmn');
  
  -- Remove "Sent from" patterns
  cleaned := regexp_replace(cleaned, E'Sent from.*$', '', 'gmn');
  
  -- Remove multiple blank lines
  cleaned := regexp_replace(cleaned, E'\n{3,}', E'\n\n', 'g');
  
  -- Trim whitespace
  cleaned := trim(cleaned);
  
  RETURN cleaned;
END;
$$;

-- 4. Create function to process reply classification and update stats
CREATE OR REPLACE FUNCTION public.process_reply_classification(
  p_message_id uuid,
  p_intent text,
  p_summary text,
  p_next_action text,
  p_confidence numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_message RECORD;
  v_account_id uuid;
  v_campaign_id uuid;
  v_contact_id uuid;
BEGIN
  -- Get message details
  SELECT account_id, campaign_id, contact_id, direction
  INTO v_message
  FROM public.messages
  WHERE id = p_message_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Message not found: %', p_message_id;
  END IF;

  -- Only process inbound messages
  IF v_message.direction != 'inbound' AND v_message.direction != 'in' AND v_message.direction != 'incoming' THEN
    RETURN;
  END IF;

  v_account_id := v_message.account_id;
  v_campaign_id := v_message.campaign_id;
  v_contact_id := v_message.contact_id;

  -- Update message with classification results
  UPDATE public.messages
  SET
    intent = p_intent,
    reply_summary = p_summary,
    reply_next_action = p_next_action,
    ai_confidence = p_confidence
  WHERE id = p_message_id;

  -- Update lead_auto_follow_up_stats if we have contact and campaign
  IF v_contact_id IS NOT NULL AND v_campaign_id IS NOT NULL THEN
    -- Use the existing function to update lead status
    PERFORM public.update_lead_status_from_intent(
      v_account_id,
      v_campaign_id,
      v_contact_id,
      p_intent
    );

    -- Update last_inbound_at
    UPDATE public.lead_auto_follow_up_stats
    SET
      last_inbound_at = now(),
      updated_at = now()
    WHERE campaign_id = v_campaign_id
      AND contact_id = v_contact_id;
  END IF;
END;
$$;

-- 5. Comments
COMMENT ON COLUMN public.messages.reply_summary IS 'Short AI-generated summary of the reply in plain language (roofing-style)';
COMMENT ON COLUMN public.messages.reply_next_action IS 'Recommended next action: book (schedule), answer (info needed), stop (not interested/unsubscribe), info_needed, or none';
COMMENT ON COLUMN public.messages.ai_confidence IS 'AI confidence score for the classification (0.0 to 1.0)';
COMMENT ON COLUMN public.messages.intent IS 'Reply intent classification: hot, warm, neutral, not_interested, unsubscribe, spam, bounce';
COMMENT ON FUNCTION public.clean_email_text IS 'Cleans email text by removing signatures, quoted replies, and formatting';
COMMENT ON FUNCTION public.process_reply_classification IS 'Processes reply classification results and updates messages and lead stats';
























































