-- =========================================================
-- Block 19630 — Inbox AI Classifier & Lead Scoring Worker v1
-- (Auto-Intent Tags, Lead Scores, Roofing Keywords, Follow-Up Flags)
-- =========================================================
--
-- This block makes the Owner Inbox smart, not just a message list.
-- We're wiring an AI worker that runs on every new reply to:
--   - Classify intent (Hot / Warm / Dead / Follow-Up)
--   - Score the lead (0–100)
--   - Extract roofing context (leak, storm, insurance, missing shingles, etc.)
--   - Update threads + messages so the UI can sort and prioritize
--
-- This is where SmartSend starts telling the owner:
--   "Call THIS homeowner first."
-- =========================================================

-- ============================================================================
-- 1. ADD NEW COLUMNS TO inbox_messages TABLE
-- ============================================================================
-- Add AI analysis fields: reason, tags, raw output, and follow-up tracking

ALTER TABLE public.inbox_messages
  ADD COLUMN IF NOT EXISTS ai_reason text, -- Short explanation of the classification
  ADD COLUMN IF NOT EXISTS ai_tags jsonb DEFAULT '[]'::jsonb, -- Array of roofing keywords/tags
  ADD COLUMN IF NOT EXISTS ai_raw jsonb DEFAULT '{}'::jsonb, -- Raw AI output for debugging
  ADD COLUMN IF NOT EXISTS followup_due_at timestamptz, -- When follow-up is needed
  ADD COLUMN IF NOT EXISTS needs_follow_up boolean DEFAULT false; -- Flag for follow-up needed

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_inbox_messages_followup_due_at ON public.inbox_messages(followup_due_at) WHERE followup_due_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inbox_messages_needs_follow_up ON public.inbox_messages(needs_follow_up) WHERE needs_follow_up = true;
CREATE INDEX IF NOT EXISTS idx_inbox_messages_ai_tags ON public.inbox_messages USING gin(ai_tags);

-- ============================================================================
-- 2. UPDATE inbox_threads TABLE WITH FOLLOW-UP FIELDS
-- ============================================================================
-- Add follow-up tracking at thread level

ALTER TABLE public.inbox_threads
  ADD COLUMN IF NOT EXISTS needs_follow_up boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS followup_due_at timestamptz;

-- Indexes for thread follow-up fields
CREATE INDEX IF NOT EXISTS idx_inbox_threads_followup_due_at ON public.inbox_threads(followup_due_at) WHERE followup_due_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inbox_threads_needs_follow_up ON public.inbox_threads(needs_follow_up) WHERE needs_follow_up = true;

-- ============================================================================
-- 3. CREATE TRIGGER TO SET DEFAULT VALUES ON NEW MESSAGE INSERT
-- ============================================================================
-- When a new message is inserted, set default ai_intent='warm' and lead_score=50
-- This marks it for processing by the AI worker

CREATE OR REPLACE FUNCTION public.set_default_ai_values_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Set default values if not already set
  IF NEW.ai_intent IS NULL THEN
    NEW.ai_intent := 'warm'::inbox_ai_intent;
  END IF;
  
  IF NEW.lead_score IS NULL THEN
    NEW.lead_score := 50;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_default_ai_values_on_insert ON public.inbox_messages;
CREATE TRIGGER trg_set_default_ai_values_on_insert
  BEFORE INSERT ON public.inbox_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.set_default_ai_values_on_insert();

-- ============================================================================
-- 4. UPDATE THREAD AGGREGATION FUNCTION
-- ============================================================================
-- Enhanced function to update thread metadata including follow-up flags
-- and proper intent prioritization (hot > warm > follow_up > cold > dead)

CREATE OR REPLACE FUNCTION public.update_thread_on_message_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_highest_intent inbox_ai_intent;
  v_intent_priority integer;
  v_max_score integer;
  v_needs_follow_up boolean;
  v_followup_due_at timestamptz;
BEGIN
  -- Get the highest priority intent from all messages in thread
  SELECT 
    MAX(CASE 
      WHEN ai_intent = 'hot' THEN 5
      WHEN ai_intent = 'warm' THEN 4
      WHEN ai_intent = 'follow_up' THEN 3
      WHEN ai_intent = 'cold' THEN 2
      WHEN ai_intent = 'dead' THEN 1
      ELSE 0
    END) INTO v_intent_priority
  FROM public.inbox_messages
  WHERE thread_id = NEW.thread_id
  AND ai_intent IS NOT NULL;
  
  -- Convert priority back to intent
  v_highest_intent := CASE 
    WHEN v_intent_priority = 5 THEN 'hot'::inbox_ai_intent
    WHEN v_intent_priority = 4 THEN 'warm'::inbox_ai_intent
    WHEN v_intent_priority = 3 THEN 'follow_up'::inbox_ai_intent
    WHEN v_intent_priority = 2 THEN 'cold'::inbox_ai_intent
    WHEN v_intent_priority = 1 THEN 'dead'::inbox_ai_intent
    ELSE NULL
  END;
  
  -- Get max lead score
  SELECT MAX(lead_score) INTO v_max_score
  FROM public.inbox_messages
  WHERE thread_id = NEW.thread_id
  AND lead_score IS NOT NULL;
  
  -- Check if any message needs follow-up
  SELECT 
    BOOL_OR(needs_follow_up),
    MIN(followup_due_at) FILTER (WHERE followup_due_at IS NOT NULL)
  INTO v_needs_follow_up, v_followup_due_at
  FROM public.inbox_messages
  WHERE thread_id = NEW.thread_id
  AND needs_follow_up = true;
  
  -- Update thread metadata
  UPDATE public.inbox_threads
  SET 
    last_message_at = NEW.received_at,
    updated_at = now(),
    highest_lead_score = COALESCE(v_max_score, highest_lead_score),
    ai_overall_intent = COALESCE(v_highest_intent, ai_overall_intent),
    needs_follow_up = COALESCE(v_needs_follow_up, false),
    followup_due_at = v_followup_due_at,
    -- Auto-set status to 'open' if intent is hot/warm/follow_up
    status = CASE
      WHEN v_highest_intent IN ('hot', 'warm', 'follow_up') THEN 'open'::inbox_thread_status
      ELSE status
    END
  WHERE id = NEW.thread_id;
  
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 5. CREATE FUNCTION TO GET MESSAGE CONTEXT FOR AI PROCESSING
-- ============================================================================
-- Helper function to fetch message context including previous messages
-- and contact/campaign info for the AI worker

CREATE OR REPLACE FUNCTION public.get_message_context_for_ai(p_message_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_result jsonb;
  v_message record;
  v_thread_id uuid;
  v_contact_id uuid;
  v_campaign_id uuid;
BEGIN
  -- Get the message
  SELECT 
    id,
    thread_id,
    contact_id,
    campaign_id,
    subject,
    body_clean,
    body_raw,
    from_email,
    received_at
  INTO v_message
  FROM public.inbox_messages
  WHERE id = p_message_id;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  v_thread_id := v_message.thread_id;
  v_contact_id := v_message.contact_id;
  v_campaign_id := v_message.campaign_id;
  
  -- Build context object
  v_result := jsonb_build_object(
    'message', jsonb_build_object(
      'id', v_message.id,
      'subject', v_message.subject,
      'body_clean', v_message.body_clean,
      'body_raw', v_message.body_raw,
      'from_email', v_message.from_email,
      'received_at', v_message.received_at
    ),
    'previous_messages', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'subject', subject,
          'body_clean', body_clean,
          'received_at', received_at
        ) ORDER BY received_at DESC
      )
      FROM public.inbox_messages
      WHERE thread_id = v_thread_id
      AND id != p_message_id
      ORDER BY received_at DESC
      LIMIT 2
    ),
    'contact', (
      SELECT jsonb_build_object(
        'city', city,
        'state', state,
        'roof_type_guess', roof_type_guess
      )
      FROM public.contacts
      WHERE id = v_contact_id
    ),
    'campaign', (
      SELECT jsonb_build_object(
        'name', name,
        'subject', subject
      )
      FROM public.campaigns
      WHERE id = v_campaign_id
    )
  );
  
  RETURN v_result;
END;
$$;

-- ============================================================================
-- 6. CREATE INDEX FOR AI WORKER QUERIES
-- ============================================================================
-- Index to efficiently find messages that need AI processing
-- (messages with default values: ai_intent='warm', lead_score=50, and ai_reason is NULL)

CREATE INDEX IF NOT EXISTS idx_inbox_messages_needs_ai_processing 
  ON public.inbox_messages(created_at DESC) 
  WHERE ai_intent = 'warm'::inbox_ai_intent 
    AND lead_score = 50 
    AND ai_reason IS NULL;

-- ============================================================================
-- 7. COMMENTS
-- ============================================================================

COMMENT ON COLUMN public.inbox_messages.ai_reason IS 'Short explanation of why the AI classified this message with this intent and score';
COMMENT ON COLUMN public.inbox_messages.ai_tags IS 'JSONB array of roofing-related keywords extracted from the message (e.g., ["leak", "storm_damage", "insurance", "missing_shingles"])';
COMMENT ON COLUMN public.inbox_messages.ai_raw IS 'Raw JSON output from AI model for debugging and analysis';
COMMENT ON COLUMN public.inbox_messages.followup_due_at IS 'Timestamp when a follow-up response is needed (typically 24 hours after message received)';
COMMENT ON COLUMN public.inbox_messages.needs_follow_up IS 'Boolean flag indicating this message requires owner follow-up response';

COMMENT ON COLUMN public.inbox_threads.needs_follow_up IS 'True if any message in this thread needs follow-up';
COMMENT ON COLUMN public.inbox_threads.followup_due_at IS 'Earliest follow-up due date from any message in this thread';

COMMENT ON FUNCTION public.get_message_context_for_ai IS 'Returns message context including previous messages, contact info, and campaign details for AI processing';

